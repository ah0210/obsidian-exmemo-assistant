import { App, Notice, TFile } from 'obsidian';
import { ExMemoSettings } from "./settings";
import { getContent, showTokenStats, resetCurrentTokenStats } from './utils';
import { callLLM } from "./utils";
import { t } from './lang/helpers';
import { updateFrontMatter } from './utils';

export async function adjustMdMeta(app: App, settings: ExMemoSettings, saveSettingsFn?: () => Promise<void>) {
    const file = app.workspace.getActiveFile();
    if (!file) {
        new Notice(t('pleaseOpenFile'));
        return;
    }
    if (file.extension !== 'md') {
        new Notice(t('currentFileNotMarkdown'));
        return;
    }
        
    // 重置token统计
    resetCurrentTokenStats();
    
    // 解析前置元数据
    const fm = app.metadataCache.getFileCache(file);
    let frontMatter = fm?.frontmatter || {};
    let hasChanges = false;
    
    // 根据更新方法决定是否强制更新
    const force = settings.metaUpdateMethod === 'force';
    
    // 检查是否需要调用 LLM
    const needsLLM = settings.metaUpdateMethod !== 'no-llm';
    
    // 确定哪些字段需要更新
    const needsTags = !frontMatter[settings.metaTagsFieldName] || 
        (Array.isArray(frontMatter[settings.metaTagsFieldName]) && frontMatter[settings.metaTagsFieldName].length === 0) ||
        force;
    const needsDescription = !frontMatter[settings.metaDescriptionFieldName] || 
        frontMatter[settings.metaDescriptionFieldName]?.trim() === '' ||
        force;
    const needsTitle = settings.metaTitleEnabled && (
        !frontMatter[settings.metaTitleFieldName] || 
        frontMatter[settings.metaTitleFieldName]?.trim() === '' ||
        force);
    const needsCategory = settings.metaCategoryEnabled && (
        !frontMatter[settings.metaCategoryFieldName] || 
        frontMatter[settings.metaCategoryFieldName]?.trim() === '' ||
        force);
    const needsSlug = settings.metaSlugEnabled && (
        !frontMatter['slug'] || 
        frontMatter['slug']?.trim() === '' ||
        force);

    // 添加标签、类别、描述、标题和 slug（一次 LLM 调用）
    if (needsLLM && (needsTags || needsDescription || needsTitle || needsCategory || needsSlug)) {
        await addMetaByLLM(file, app, settings, frontMatter, {
            tags: needsTags,
            description: needsDescription,
            title: needsTitle,
            category: needsCategory,
            slug: needsSlug
        }, force);
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

    // 文章内容优化（在元数据之后执行）
    if (settings.contentOptimizeEnabled) {
        const contentOptimized = await optimizeContent(file, app, settings);
        if (contentOptimized) {
            new Notice(t('contentOptimized'));
        }
    }
    
    // 保存设置（累计token统计）
    if (saveSettingsFn) {
        await saveSettingsFn();
    }
    
    // 显示token消耗
    showTokenStats(settings);
}

async function optimizeContent(file: TFile, app: App, settings: ExMemoSettings): Promise<boolean> {
    try {
        // 读取完整文章内容（不截断）
        const fullContent = await app.vault.read(file);
        
        // 分离 frontmatter 和正文
        let frontmatter = '';
        let content = fullContent;
        
        if (fullContent.startsWith('---')) {
            const endIdx = fullContent.indexOf('---', 3);
            if (endIdx !== -1) {
                frontmatter = fullContent.substring(0, endIdx + 3);
                content = fullContent.substring(endIdx + 3);
            }
        }
        
        // 如果没有正文内容，直接返回
        if (!content || content.trim() === '') {
            return false;
        }
        
        // 构建提示词
        const prompt = `${settings.contentOptimizePrompt}

文章内容：
${content}`;
        
        // 调用 LLM 优化内容（不需要 JSON 格式）
        const optimizedContent = await callLLM(prompt, settings, false);
        
        if (!optimizedContent || optimizedContent.trim() === '') {
            return false;
        }
        
        // 合并 frontmatter 和优化后的内容
        const newContent = frontmatter ? `${frontmatter}\n${optimizedContent}` : optimizedContent;
        
        // 写回文件
        await app.vault.modify(file, newContent);
        
        return true;
    } catch (error) {
        console.error('优化文章内容时出错:', error);
        new Notice(t('llmError') + ': ' + error);
        return false;
    }
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
    
    // 使用 LLM 智能匹配合集
    const matched = await matchCollectionsWithLLM(contentStr, candidates, settings);
    
    if (matched.length === 0) {
        return false;
    }
    updateFrontMatter(file, app, fieldName, matched, 'update');
    return true;
}

/**
 * 使用 LLM 严格匹配合集
 */
async function matchCollectionsWithLLM(content: string, candidates: string[], settings: ExMemoSettings): Promise<string[]> {
    const collectionsList = candidates.join('\n');
    const isSingleCandidate = candidates.length === 1;
    
    let req = `${settings.metaCollectionsPrompt}

Available collections (choose ONLY from this list, do NOT create new collections):
${collectionsList}

${isSingleCandidate ? '⚠️ CRITICAL: There is ONLY ONE collection available. You MUST be EXTREMELY CAUTIOUS - ONLY select it if the article is PERFECTLY and CLEARLY a match for this collection\'s theme. If in doubt, return an empty array! - This is not a default selection, it must earn its place.' : ''}

IMPORTANT RULES:
1. You MUST ONLY choose from the available collections listed above
2. If NO collection matches the article content, return an empty array []
3. Do NOT create or invent any new collections
4. Be EXTREMELY strict - only select a collection if the article CLEARLY and UNAMBIGUOUSLY matches its theme
5. Return ONLY valid JSON format with a "collections" field
6. DO NOT select a collection just because it's the only option available - it must be a genuine match

Example responses:
- If matches: {"collections": ["Collection Name"]}
- If no matches: {"collections": []}

Article content:

${content}`;
    
    const ret = await callLLM(req, settings);
    if (!ret) {
        return [];
    }
    
    const ret_json = parseLLMResponse(ret);
    if (!ret_json || !ret_json.collections) {
        return [];
    }
    
    let collections: string[] = [];
    if (Array.isArray(ret_json.collections)) {
        collections = ret_json.collections;
    } else if (typeof ret_json.collections === 'string') {
        collections = ret_json.collections.split(',').map((c: string) => c.trim());
    }
    
    // 严格过滤：只保留在候选列表中完全匹配的合集
    collections = collections.filter((c: string) => {
        const trimmed = c.trim();
        return candidates.some((candidate: string) => {
            const candidateTrimmed = candidate.trim();
            return candidateTrimmed.toLowerCase() === trimmed.toLowerCase();
        });
    }).map((c: string) => c.trim()).filter((c: string) => c.length > 0);
    
    // 映射回原始候选列表中的正确大小写格式
    collections = collections.map((c: string) => {
        const matched = candidates.find((candidate: string) => 
            candidate.trim().toLowerCase() === c.toLowerCase()
        );
        return matched ? matched.trim() : c.trim();
    });
    
    // 去重
    return Array.from(new Set(collections));
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
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

// 改进的 JSON 解析函数
function parseLLMResponse(response: string): any {
    if (!response) return null;
    
    // 方法 1: 直接尝试解析
    try {
        return JSON.parse(response.trim());
    } catch {
        // 继续尝试其他方法
    }

    // 方法 2: 提取 JSON 块
    let jsonMatch = response.match(/{[\s\S]*}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch {
            // 继续尝试
        }
    }

    // 方法 3: 清理 markdown 代码块标记后尝试
    const cleaned = response.replace(/```(?:json)?\s*/g, '').trim();
    jsonMatch = cleaned.match(/{[\s\S]*}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            console.warn("JSON 解析失败:", error);
        }
    }

    return null;
}

async function addMetaByLLM(
    file: TFile, 
    app: App, 
    settings: ExMemoSettings, 
    frontMatter: any, 
    fields: { tags: boolean; description: boolean; title: boolean; category: boolean; slug: boolean },
    force: boolean = false
) {
    let content_str = '';
    if (settings.metaIsTruncate) {
        content_str = await getContent(app, null, settings.metaMaxTokens, settings.metaTruncateMethod);
    } else {
        content_str = await getContent(app, null, -1, '');
    }
    
    const tag_options = settings.tags.join(',') || '';
    let categories_options = settings.categories.join(',');

    // 构建提示词 - 完全使用用户提示词，不追加固定内容
    let req = 'Generate metadata for the following article. ';
    
    const requirements: string[] = [];
    
    if (fields.tags) {
        requirements.push(`1. Tags: ${settings.metaTagsPrompt}`);
        if (tag_options) {
            requirements.push(`   Available tags: ${tag_options}`);
        }
    }
    
    if (fields.category) {
        requirements.push(`2. Category: ${settings.metaCategoryPrompt}`);
        if (categories_options) {
            requirements.push(`   Available categories: ${categories_options}`);
        }
    }
    
    if (fields.description) {
        requirements.push(`3. Description: ${settings.metaDescription}`);
    }
    
    if (fields.title) {
        requirements.push(`4. Title: ${settings.metaTitlePrompt}`);
    }
    
    if (fields.slug) {
        requirements.push(`5. Slug: Generate an SEO-friendly English slug.
   Requirements:
   - Use only lowercase English letters and hyphens (-)
   - Length should be 3 to 6 keyword segments
   - Do not use filler words like with/and/for/the/guide/tutorial
   - Put the most important keywords first
   - Keep it concise and strong`);
    }

    req += `\nRequirements:\n${requirements.join('\n\n')}`;
    
    // 构建 JSON schema
    const jsonFields: string[] = [];
    if (fields.tags) jsonFields.push('    "tags": "tag1,tag2,tag3"');
    if (fields.category) jsonFields.push('    "category": "category_name"');
    if (fields.description) jsonFields.push('    "description": "brief summary"');
    if (fields.title) jsonFields.push('    "title": "article title"');
    if (fields.slug) jsonFields.push('    "slug": "seo-friendly-slug"');

    req += `

Please return ONLY valid JSON format, without any markdown code blocks or additional text:
{
${jsonFields.join(',\n')}
}

Article content:

${content_str}`;
    
    let ret = await callLLM(req, settings);
    if (ret === "" || ret === undefined || ret === null) {
        return;
    }

    const ret_json = parseLLMResponse(ret);
    if (!ret_json) {
        new Notice(t('parseError'));
        console.error("Failed to parse LLM response:", ret);
        return;
    }
    
    // 检查并更新各个字段
    if (fields.tags && ret_json.tags) {
        // 处理标签：去重、过滤空标签
        const tags = ret_json.tags.split(',')
            .map((t: string) => t.trim())
            .filter((t: string) => t.length > 0);
        const uniqueTags = Array.from(new Set(tags));
        updateFrontMatter(file, app, settings.metaTagsFieldName, uniqueTags, 'append');
    }
    
    if (fields.category && ret_json.category && settings.metaCategoryEnabled) {
        const currentValue = frontMatter[settings.metaCategoryFieldName];
        const isEmpty = !currentValue || currentValue.trim() === '';
        updateFrontMatter(file, app, settings.metaCategoryFieldName, ret_json.category, 
            force || isEmpty ? 'update' : 'keep');
    }

    if (fields.description && ret_json.description) {
        const currentValue = frontMatter[settings.metaDescriptionFieldName];
        const isEmpty = !currentValue || currentValue.trim() === '';
        updateFrontMatter(file, app, settings.metaDescriptionFieldName, ret_json.description, 
            force || isEmpty ? 'update' : 'keep');
    }

    if (fields.title && settings.metaTitleEnabled && ret_json.title) {
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

    if (fields.slug && ret_json.slug) {
        const slug = slugify(ret_json.slug);
        if (slug) {
            const currentValue = frontMatter['slug'];
            const isEmpty = !currentValue || currentValue.trim() === '';
            updateFrontMatter(file, app, 'slug', slug, 
                force || isEmpty ? 'update' : 'keep');
        }
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
