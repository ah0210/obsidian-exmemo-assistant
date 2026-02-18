import { App, Notice, TFile } from 'obsidian';
import { ExMemoSettings } from "./settings";
import { getContent } from './utils';
import { callLLM } from "./utils";
import { generateImage } from "./utils";
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

    // 添加作者信息（author.name / author.link）
    if (settings.metaAuthorEnabled) {
        const authorName = (settings.metaAuthorName ?? '').trim();
        const authorLink = (settings.metaAuthorLink ?? '').trim();
        if (authorName || authorLink) {
            const author: { name?: string; link?: string } = {};
            if (authorName) author.name = authorName;
            if (authorLink) author.link = authorLink;
            updateFrontMatter(file, app, 'author', author, 'update');
            hasChanges = true;
        }
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

async function addCoverImage(file: TFile, app: App, settings: ExMemoSettings, frontMatter: any, force: boolean): Promise<boolean> {
    if (!settings.metaCoverEnabled) {
        return false;
    }
    if (settings.metaUpdateMethod === 'no-llm') {
        return false;
    }
    const fieldName = (settings.metaCoverFieldName ?? '').trim() || 'cover';
    const currentValue = frontMatter[fieldName];
    const isEmpty = !currentValue || (typeof currentValue === 'string' && currentValue.trim() === '');
    if (!force && !isEmpty) {
        return false;
    }

    let content_str = '';
    if (settings.metaIsTruncate) {
        content_str = await getContent(app, null, settings.metaMaxTokens, settings.metaTruncateMethod);
    } else {
        content_str = await getContent(app, null, -1, '');
    }
    if (!content_str) {
        return false;
    }

    const req = `Generate a cover image prompt for the following article.
Requirements:
${settings.metaCoverPrompt}
Return only the prompt text.

Article content:

${content_str}`;

    const prompt = (await callLLM(req, settings))?.trim();
    if (!prompt) {
        return false;
    }

    let image;
    try {
        image = await generateImage(prompt, settings);
    } catch (error) {
        new Notice(t('coverImageFailed') + "\n" + error as string);
        return false;
    }
    if (!image) {
        new Notice(t('coverImageModelMissing'));
        return false;
    }

    const folder = file.parent?.path ?? '';
    const baseName = `${file.basename}-cover`;
    const extension = image.extension || 'png';
    let filePath = folder ? `${folder}/${baseName}.${extension}` : `${baseName}.${extension}`;
    let index = 1;
    while (app.vault.getAbstractFileByPath(filePath)) {
        filePath = folder ? `${folder}/${baseName}-${index}.${extension}` : `${baseName}-${index}.${extension}`;
        index += 1;
    }

    await app.vault.createBinary(filePath, image.buffer);
    updateFrontMatter(file, app, fieldName, filePath, 'update');
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
   Available tags: ${tag_options}. Feel free to create new ones if none are suitable.

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
