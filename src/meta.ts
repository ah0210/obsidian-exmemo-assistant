import { App, Notice, TFile } from 'obsidian';
import { ExMemoSettings } from "./settings";
import { getContent, showTokenStats, resetCurrentTokenStats, parseLLMResponse } from './utils';
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
        
    resetCurrentTokenStats();
    
    const fm = app.metadataCache.getFileCache(file);
    let frontMatter = fm?.frontmatter || {};
    let hasChanges = false;
    
    const force = settings.metaUpdateMethod === 'force';
    const needsLLM = settings.metaUpdateMethod !== 'no-llm';
    
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
    const needsCollections = settings.metaCollectionsEnabled && needsLLM && (
        !frontMatter['collections'] || 
        (Array.isArray(frontMatter['collections']) && frontMatter['collections'].length === 0) ||
        (typeof frontMatter['collections'] === 'string' && frontMatter['collections'].trim() === '') ||
        force);

    const anyLLMNeeded = needsLLM && (needsTags || needsDescription || needsTitle || needsCategory || needsSlug || needsCollections);

    let contentStr = '';
    if (anyLLMNeeded || settings.contentOptimizeEnabled) {
        if (settings.metaIsTruncate && !settings.contentOptimizeEnabled) {
            contentStr = await getContent(app, null, settings.metaMaxTokens, settings.metaTruncateMethod);
        } else {
            contentStr = await getContent(app, null, -1, '');
        }
    }

    if (anyLLMNeeded) {
        await addMetaByLLM(file, app, settings, frontMatter, {
            tags: needsTags,
            description: needsDescription,
            title: needsTitle,
            category: needsCategory,
            slug: needsSlug,
            collections: needsCollections
        }, force, contentStr);
        hasChanges = true;
    }

    if (settings.metaEditTimeEnabled) {
        try {
            const now = new Date();
            const formattedNow = formatDate(now, settings.metaEditTimeFormat);
            updateFrontMatter(file, app, settings.metaUpdatedFieldName, formattedNow, 'update');
            
            const created = new Date(file.stat.ctime);
            const createdDate = formatDate(created, 'YYYY-MM-DD');
            updateFrontMatter(file, app, settings.metaCreatedFieldName, createdDate, 'update');
            
            hasChanges = true;
        } catch (error) {
            console.error('更新时间元数据时出错:', error);
            new Notice(t('llmError') + ': ' + error);
        }
    }

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

    const coverUpdated = await addCoverImage(file, app, settings, frontMatter, force);
    if (coverUpdated) {
        hasChanges = true;
    }

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

    if (settings.contentOptimizeEnabled) {
        const optimizeContent = contentStr || await getContent(app, null, -1, '');
        const contentOptimized = await optimizeArticleContent(file, app, settings, optimizeContent);
        if (contentOptimized) {
            new Notice(t('contentOptimized'));
        }
    }
    
    if (saveSettingsFn) {
        await saveSettingsFn();
    }
    
    showTokenStats(settings);
}

async function optimizeArticleContent(file: TFile, app: App, settings: ExMemoSettings, content: string): Promise<boolean> {
    try {
        if (!content || content.trim() === '') {
            return false;
        }
        
        const prompt = `${settings.contentOptimizePrompt}

文章内容：
${content}`;
        
        const optimizedContent = await callLLM(prompt, settings, false);
        
        if (!optimizedContent || optimizedContent.trim() === '') {
            return false;
        }

        let cleaned = optimizedContent.trim();
        cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n?/i, '');
        cleaned = cleaned.replace(/\n?```\s*$/i, '');
        cleaned = cleaned.trim();
        
        const fullContent = await app.vault.read(file);
        let frontmatter = '';
        let bodyContent = fullContent;
        
        if (fullContent.startsWith('---')) {
            const endIdx = fullContent.indexOf('---', 3);
            if (endIdx !== -1) {
                frontmatter = fullContent.substring(0, endIdx + 3);
            }
        }
        
        const newContent = frontmatter ? `${frontmatter}\n${cleaned}` : cleaned;
        await app.vault.modify(file, newContent);
        
        return true;
    } catch (error) {
        console.error('优化文章内容时出错:', error);
        new Notice(t('llmError') + ': ' + error);
        return false;
    }
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

async function addMetaByLLM(
    file: TFile, 
    app: App, 
    settings: ExMemoSettings, 
    frontMatter: any, 
    fields: { tags: boolean; description: boolean; title: boolean; category: boolean; slug: boolean; collections: boolean },
    force: boolean = false,
    contentStr: string
) {
    const tag_options = settings.tags.join(',') || '';
    let categories_options = settings.categories.join(',');
    const collectionCandidates = settings.metaCollections ?? [];

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
        requirements.push(`5. Slug: ${settings.metaSlugPrompt}`);
    }

    if (fields.collections && collectionCandidates.length > 0) {
        const collectionsList = collectionCandidates.join('\n');
        const isSingle = collectionCandidates.length === 1;
        const collectionNum = requirements.length + 1;
        requirements.push(`${collectionNum}. Collections: ${settings.metaCollectionsPrompt}

   Available collections (choose ONLY from this list):
   ${collectionsList}

   ${isSingle ? '⚠️ CRITICAL: There is ONLY ONE collection. ONLY select it if the article PERFECTLY matches. If in doubt, return empty array!' : ''}
   IMPORTANT: Only select collections that CLEARLY match. If none match, return empty array []. Do NOT invent new collections.`);
    }

    req += `\nRequirements:\n${requirements.join('\n\n')}`;
    
    const jsonFields: string[] = [];
    if (fields.tags) jsonFields.push('    "tags": "tag1,tag2,tag3"');
    if (fields.category) jsonFields.push('    "category": "category_name"');
    if (fields.description) jsonFields.push('    "description": "brief summary"');
    if (fields.title) jsonFields.push('    "title": "article title"');
    if (fields.slug) jsonFields.push('    "slug": "seo-friendly-slug"');
    if (fields.collections && collectionCandidates.length > 0) jsonFields.push('    "collections": ["Collection Name"]');

    req += `

Please return ONLY valid JSON format, without any markdown code blocks or additional text:
{
${jsonFields.join(',\n')}
}

Article content:

${contentStr}`;
    
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
    
    if (fields.tags && ret_json.tags) {
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

    if (fields.collections && ret_json.collections && collectionCandidates.length > 0) {
        let collections: string[] = [];
        if (Array.isArray(ret_json.collections)) {
            collections = ret_json.collections;
        } else if (typeof ret_json.collections === 'string') {
            collections = ret_json.collections.split(',').map((c: string) => c.trim());
        }
        
        collections = collections.filter((c: string) => {
            const trimmed = c.trim();
            return collectionCandidates.some((candidate: string) => {
                return candidate.trim().toLowerCase() === trimmed.toLowerCase();
            });
        }).map((c: string) => c.trim()).filter((c: string) => c.length > 0);
        
        collections = collections.map((c: string) => {
            const matched = collectionCandidates.find((candidate: string) => 
                candidate.trim().toLowerCase() === c.toLowerCase()
            );
            return matched ? matched.trim() : c.trim();
        });
        
        collections = Array.from(new Set(collections));
        
        if (collections.length > 0) {
            updateFrontMatter(file, app, 'collections', collections, 'update');
        }
    }
}

function formatDate(date: Date, format: string): string {
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
