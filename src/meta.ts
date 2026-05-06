import { App, Notice, TFile } from 'obsidian';
import { ExMemoSettings } from "./settings";
import { getContent } from './utils';
import { callLLM } from "./utils";
import { t } from './lang/helpers';
import { updateFrontMatter } from './utils';

export async function adjustMdMeta(app: App, settings: ExMemoSettings) {
    const file = app.workspace.getActiveFile();
    if (!file) {
        new Notice(t('pleaseOpenFile'));
        return;
    }
    if (file.extension !== 'md') {
        new Notice(t('currentFileNotMarkdown'));
        return;
    }
        
    // 解析前置元数据
    const fm = app.metadataCache.getFileCache(file);
    let frontMatter = fm?.frontmatter || {};
    let hasChanges = false;
    
    // 根据更新方法决定是否强制更新
    const force = settings.metaUpdateMethod === 'force';
    
    // 添加标签、类别、描述和标题
    if (!frontMatter[settings.metaTagsFieldName] || 
        frontMatter[settings.metaTagsFieldName]?.length === 0 ||
        !frontMatter[settings.metaDescriptionFieldName] || 
        frontMatter[settings.metaDescriptionFieldName]?.trim() === '' ||
        (settings.metaTitleEnabled && 
            (!frontMatter[settings.metaTitleFieldName] || 
             frontMatter[settings.metaTitleFieldName]?.trim() === '')) ||
        (settings.metaCategoryEnabled && 
            (!frontMatter[settings.metaCategoryFieldName] || 
             frontMatter[settings.metaCategoryFieldName]?.trim() === '')) ||
        force) {
        await addMetaByLLM(file, app, settings, frontMatter, force);
        hasChanges = true;
    }

    const slugUpdated = await addSlug(file, app, settings, frontMatter, force);
    if (slugUpdated) {
        hasChanges = true;
    }

    // 添加时间相关元数据 - 只在功能启用时执行
    if (settings.metaEditTimeEnabled) {
        try {
            // 使用原生 JavaScript Date 对象
            const now = new Date();
            const formattedNow = formatDate(now, settings.metaEditTimeFormat);
            updateFrontMatter(file, app, settings.metaUpdatedFieldName, formattedNow, 'update');
            
            // 添加创建时间
            const created = new Date(file.stat.ctime);
            const createdDate = formatDate(created, 'YYYY-MM-DD');
            updateFrontMatter(file, app, settings.metaCreatedFieldName, createdDate, 'update');
            
            hasChanges = true;
        } catch (error) {
            console.error('更新时间元数据时出错:', error);
            new Notice(t('llmError') + ': ' + error);
        }
    }

    // 添加作者信息（author.name / author.link / author.avatar）
    if (settings.metaAuthorEnabled) {
        const authorName = (settings.metaAuthorName ?? '').trim();
        const authorLink = (settings.metaAuthorLink ?? '').trim();
        const authorAvatar = (settings.metaAuthorAvatar ?? '').trim();
        if (authorName || authorLink || authorAvatar) {
            const author: { name?: string; link?: string; avatar?: string } = {};
            if (authorName) author.name = authorName;
            if (authorLink) author.link = authorLink;
            if (authorAvatar) author.avatar = authorAvatar;
            updateFrontMatter(file, app, 'author', author, 'update');
            hasChanges = true;
        }
    }

    const collectionsUpdated = await addCollections(file, app, settings, frontMatter, force);
    if (collectionsUpdated) {
        hasChanges = true;
    }

    const coverUpdated = await addCoverImage(file, app, settings, frontMatter, force);
    if (coverUpdated) {
        hasChanges = true;
    }

    // 添加自定义元数据
    if (settings.customMetadata && settings.customMetadata.length > 0) {
        for (const meta of settings.customMetadata) {
            if (meta.key && meta.value) {
                let finalValue: string | boolean = meta.value;
                if (meta.value.toLowerCase() === 'true' || meta.value.toLowerCase() === 'false') {
                    finalValue = (meta.value.toLowerCase() === 'true') as boolean;
                }
                updateFrontMatter(file, app, meta.key, finalValue, force ? 'update' : 'keep');
            }
        }
        hasChanges = true;
    }    

    if (hasChanges) {
        new Notice(t('metaUpdated'));
    }
}

function matchCollections(content: string, candidates: string[]): string[] {
    const results: string[] = [];
    const lower = content.toLowerCase();
    for (const item of candidates) {
        const trimmed = item.trim();
        if (!trimmed) {
            continue;
        }
        const needle = trimmed.toLowerCase();
        if (lower.includes(needle) && !results.includes(trimmed)) {
            results.push(trimmed);
        }
    }
    return results;
}

async function addCollections(file: TFile, app: App, settings: ExMemoSettings, frontMatter: any, force: boolean): Promise<boolean> {
    if (!settings.metaCollectionsEnabled) {
        return false;
    }
    const fieldName = 'collections';
    const currentValue = frontMatter[fieldName];
    const isEmpty = !currentValue || (Array.isArray(currentValue) && currentValue.length === 0) ||
        (typeof currentValue === 'string' && currentValue.trim() === '');
    if (!force && !isEmpty) {
        return false;
    }
    const candidates = settings.metaCollections ?? [];
    if (candidates.length === 0) {
        return false;
    }
    const contentStr = await getContent(app, null, -1, '');
    if (!contentStr) {
        return false;
    }
    const matched = matchCollections(contentStr, candidates);
    if (matched.length === 0) {
        return false;
    }
    updateFrontMatter(file, app, fieldName, matched, 'update');
    return true;
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function addSlug(file: TFile, app: App, settings: ExMemoSettings, frontMatter: any, force: boolean): Promise<boolean> {
    if (!settings.metaSlugEnabled) {
        return false;
    }
    if (settings.metaUpdateMethod === 'no-llm') {
        return false;
    }
    const fieldName = 'slug';
    const currentValue = frontMatter[fieldName];
    const isEmpty = !currentValue || (typeof currentValue === 'string' && currentValue.trim() === '');
    if (!force && !isEmpty) {
        return false;
    }
    let contentStr = '';
    if (settings.metaIsTruncate) {
        contentStr = await getContent(app, null, settings.metaMaxTokens, settings.metaTruncateMethod);
    } else {
        contentStr = await getContent(app, null, -1, '');
    }
    if (!contentStr) {
        return false;
    }
    const req = `Generate an SEO-friendly English slug.
Requirements:
- Use only lowercase English letters and hyphens (-)
- Length should be 3 to 6 keyword segments
- Do not use filler words like with/and/for/the/guide/tutorial
- Put the most important keywords first
- Keep it concise and strong
Return only the slug.

Article content:

${contentStr}`;
    const raw = (await callLLM(req, settings))?.trim();
    if (!raw) {
        return false;
    }
    const slug = slugify(raw);
    if (!slug) {
        return false;
    }
    updateFrontMatter(file, app, fieldName, slug, 'update');
    return true;
}

function extractImageLinks(content: string): string[] {
    const results: string[] = [];
    const addLink = (value: string) => {
        const link = value.trim();
        if (!link) return;
        if (!results.includes(link)) {
            results.push(link);
        }
    };

    const markdownImageRegex = /!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
    let match = markdownImageRegex.exec(content);
    while (match) {
        addLink(match[1]);
        match = markdownImageRegex.exec(content);
    }

    const wikiImageRegex = /!\[\[([^\]]+)]]/g;
    match = wikiImageRegex.exec(content);
    while (match) {
        const raw = match[1];
        const cleaned = raw.split('|')[0].trim();
        addLink(cleaned);
        match = wikiImageRegex.exec(content);
    }

    const htmlImageRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
    match = htmlImageRegex.exec(content);
    while (match) {
        addLink(match[1]);
        match = htmlImageRegex.exec(content);
    }

    const urlImageRegex = /https?:\/\/[^\s)>"']+\.(?:png|jpe?g|gif|webp|svg)/gi;
    match = urlImageRegex.exec(content);
    while (match) {
        addLink(match[0]);
        match = urlImageRegex.exec(content);
    }

    return results;
}

async function addCoverImage(file: TFile, app: App, settings: ExMemoSettings, frontMatter: any, force: boolean): Promise<boolean> {
    if (!settings.metaExtractCoverEnabled) {
        return false;
    }
    const fieldName = 'featuredImage';
    const currentValue = frontMatter[fieldName];
    const isEmpty = !currentValue || (typeof currentValue === 'string' && currentValue.trim() === '');
    if (!force && !isEmpty) {
        return false;
    }

    const contentStr = await getContent(app, null, -1, '');
    if (!contentStr) {
        return false;
    }

    const images = extractImageLinks(contentStr);
    if (images.length === 0) {
        return false;
    }

    updateFrontMatter(file, app, fieldName, images[0], 'update');
    return true;
}

async function addMetaByLLM(file: TFile, app: App, settings: ExMemoSettings, frontMatter: any, force: boolean = false) {
    let content_str = '';
    if (settings.metaIsTruncate) {
        content_str = await getContent(app, null, settings.metaMaxTokens, settings.metaTruncateMethod);
    } else {
        content_str = await getContent(app, null, -1, '');
    }
    
    const tag_options = settings.tags.join(',');
    let categories_options = settings.categories.join(',');
    if (categories_options === '') {
        categories_options = t('categoryUnknown');
    }

    const req = `I need to generate tags, category, description, and title for the following article. Requirements:

1. Tags: ${settings.metaTagsPrompt}
   Available tags: ${tag_options}. Prefer selecting from available tags. If none are suitable, choose the most relevant tags based on the article content.

2. Category: ${settings.metaCategoryPrompt}
   Available categories: ${categories_options}. Must choose ONE from the available categories.

3. Description: ${settings.metaDescription}

4. Title: ${settings.metaTitlePrompt}

Please return in the following JSON format:
{
    "tags": "tag1,tag2,tag3",
    "category": "category_name",
    "description": "brief summary",
    "title": "article title"
}

Article content:

${content_str}`;
    
    let ret = await callLLM(req, settings);
    if (ret === "" || ret === undefined || ret === null) {
        return;
    }
    ret = ret.replace(/`/g, '');

    let ret_json = {} as { tags?: string; category?: string; description?: string; title?: string };
    try {
        let json_str = ret.match(/{[^]*}/);
        if (json_str) {
            ret_json = JSON.parse(json_str[0]) as { tags?: string; category?: string; description?: string; title?: string };
        }        
    } catch (error) {
        new Notice(t('parseError') + "\n" + error);
        console.error("parseError:", error);
        return;
    }
    
    // 检查并更新各个字段
    if (ret_json.tags) {
        const tags = ret_json.tags.split(',');
        updateFrontMatter(file, app, settings.metaTagsFieldName, tags, 'append');
    }
    
    if (ret_json.category && settings.metaCategoryEnabled) {
        const currentValue = frontMatter[settings.metaCategoryFieldName];
        const isEmpty = !currentValue || currentValue.trim() === '';
        updateFrontMatter(file, app, settings.metaCategoryFieldName, ret_json.category, 
            force || isEmpty ? 'update' : 'keep');
    }

    if (ret_json.description) {
        const currentValue = frontMatter[settings.metaDescriptionFieldName];
        const isEmpty = !currentValue || currentValue.trim() === '';
        updateFrontMatter(file, app, settings.metaDescriptionFieldName, ret_json.description, 
            force || isEmpty ? 'update' : 'keep');
    }

    if (settings.metaTitleEnabled && ret_json.title) {
        let title = ret_json.title.trim();
        if ((title.startsWith('"') && title.endsWith('"')) || 
            (title.startsWith("'") && title.endsWith("'"))) {
            title = title.substring(1, title.length - 1);
        }
        const currentValue = frontMatter[settings.metaTitleFieldName];
        const isEmpty = !currentValue || currentValue.trim() === '';
        updateFrontMatter(file, app, settings.metaTitleFieldName, title, 
            force || isEmpty ? 'update' : 'keep');
    }
}

// 使用自定义的日期格式化函数
function formatDate(date: Date, format: string): string {
    // 简单的格式化实现，支持基本的 YYYY-MM-DD HH:mm:ss 格式
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return format
        .replace('YYYY', year.toString())
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}
