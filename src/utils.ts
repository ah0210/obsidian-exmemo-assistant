import { App, TFile, MarkdownView, Modal, Notice, getAllTags } from 'obsidian';
import OpenAI from "openai";
import { ExMemoSettings } from "./settings";
import { t } from "./lang/helpers"

// 本次token统计
let currentInputTokens: number = 0;
let currentOutputTokens: number = 0;

// 获取当前token统计
export function getTokenStats(): { currentInput: number; currentOutput: number; totalInput: number; totalOutput: number; total: number } {
    return {
        currentInput: currentInputTokens,
        currentOutput: currentOutputTokens,
        totalInput: 0,
        totalOutput: 0,
        total: currentInputTokens + currentOutputTokens
    };
}

// 显示token消耗
export function showTokenStats(settings: ExMemoSettings): void {
    new Notice(`输入: ${currentInputTokens} token\n输出: ${currentOutputTokens} token\n累计: ${settings.totalInputTokens + settings.totalOutputTokens} token`, 5000);
}

// 重置本次token统计
export function resetCurrentTokenStats(): void {
    currentInputTokens = 0;
    currentOutputTokens = 0;
}

// 重置累计token统计
export function resetTotalTokenStats(settings: ExMemoSettings): void {
    settings.totalInputTokens = 0;
    settings.totalOutputTokens = 0;
}

// 估算token数量（简单估算）
function estimateTokens(text: string): number {
    const tokens = text.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9]+|[\.,!?;，。！？；#]|[\n]/g) || [];
    return tokens.length;
}

// 延时函数
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 判断是否为可重试的错误
function isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return message.includes('timeout') || 
               message.includes('network') || 
               message.includes('rate limit') ||
               message.includes('500') ||
               message.includes('502') ||
               message.includes('503') ||
               message.includes('504');
    }
    return false;
}

export async function callLLM(req: string, settings: ExMemoSettings): Promise<string> {
    let ret = '';
    let info = new Notice(t("llmLoading"), 0);
    
    const models = settings.llmModelNames?.filter(m => m.trim()) || [];
    if (models.length === 0) {
        models.push('gpt-4o');
    }

    const maxRetries = Math.max(1, settings.llmMaxRetries || 3);
    const timeout = settings.llmTimeout || 60000;
    
    let lastError: unknown = null;
    
    // 估算输入token
    const systemPrompt = "You are a helpful assistant that generates metadata for articles. Always respond with valid JSON format only, without any markdown code blocks or additional text.";
    const estimatedInputTokens = estimateTokens(systemPrompt + req);

    // 遍历所有模型进行尝试
    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
        const model = models[modelIndex].trim();
        
        // 对每个模型进行重试
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const openai = new OpenAI({
                    apiKey: settings.llmToken,
                    baseURL: settings.llmBaseUrl,
                    dangerouslyAllowBrowser: true,
                    timeout: timeout
                });

                const completion = await openai.chat.completions.create({
                    model,
                    messages: [
                        {
                            "role": "system",
                            "content": systemPrompt
                        },
                        { "role": "user", "content": req }
                    ],
                    temperature: settings.llmTemperature ?? 0.7,
                    max_tokens: settings.llmMaxTokens ?? 2048
                });

                if (completion.choices.length > 0) {
                    ret = completion.choices[0].message['content'] || ret;
                    
                    // 统计token
                    const inputTokens = completion.usage?.prompt_tokens || estimatedInputTokens;
                    const outputTokens = completion.usage?.completion_tokens || estimateTokens(ret);
                    
                    // 更新本次统计
                    currentInputTokens += inputTokens;
                    currentOutputTokens += outputTokens;
                    
                    // 更新累计统计
                    settings.totalInputTokens += inputTokens;
                    settings.totalOutputTokens += outputTokens;
                    
                    info.hide();
                    return ret;
                }
            } catch (error) {
                lastError = error;
                console.warn(`Model ${model} attempt ${attempt + 1} failed:`, error);

                // 如果不是最后一个模型，不进行重试，直接尝试下一个模型
                if (modelIndex < models.length - 1) {
                    break;
                }

                // 如果是最后一个模型且不是最后一次尝试，等待后重试
                if (attempt < maxRetries - 1 && isRetryableError(error)) {
                    const waitTime = Math.pow(2, attempt) * 1000; // 指数退避
                    new Notice(`${t("llmError")}, retrying in ${waitTime / 1000}s...`, 2000);
                    await delay(waitTime);
                }
            }
        }
    }

    // 所有尝试都失败了
    info.hide();
    if (lastError) {
        new Notice(t("llmError") + "\n" + String(lastError));
        console.warn('All attempts failed:', lastError);
    }
    return ret;
}



class ConfirmModal extends Modal {
    private resolvePromise: (value: boolean) => void;
    private message: string;

    constructor(app: App, message: string, onResolve: (value: boolean) => void) {
        super(app);
        this.message = message;
        this.resolvePromise = onResolve;
    }

    onOpen() {
        this.titleEl.setText(t("confirm"));
        this.contentEl.createEl('p', { text: this.message });
        const buttonContainer = this.contentEl.createEl('div', { cls: 'dialog-button-container' });
    
        const yesButton = buttonContainer.createEl('button', { text: t("yes") });
        yesButton.onclick = () => {
            this.close();
            this.resolvePromise(true);
        };
    
        const noButton = buttonContainer.createEl('button', { text: t("no") });
        noButton.onclick = () => {
            this.close();
            this.resolvePromise(false);
        };
    }
}

export async function confirmDialog(app: App, message: string): Promise<boolean> {
    return new Promise((resolve) => {
        new ConfirmModal(app, message, resolve).open();
    });
}

function splitIntoTokens(str: string) {
    const regex = /[\u4e00-\u9fa5]|[a-zA-Z0-9]+|[\.,!?;，。！？；#]|[\n]/g;
    const tokens = str.match(regex);
    return tokens || [];
}

function joinTokens(tokens: any) {
    let result = '';
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token === '\n') {
            result += token;
        } else if (/[\u4e00-\u9fa5]|[\.,!?;，。！？；#]/.test(token)) {
            result += token;
        } else {
            result += (i > 0 ? ' ' : '') + token;
        }
    }
    return result.trim();
}

export async function loadTags(app: App): Promise<Record<string, number>> {
    // use getAllTags from obsidian API
    const tagsMap: Record<string, number> = {};
    app.vault.getMarkdownFiles().forEach((file: TFile) => {
        const cachedMetadata = app.metadataCache.getFileCache(file);
        if (cachedMetadata) {
            let tags = getAllTags(cachedMetadata);
            if (tags) {
                tags.forEach((tag) => {
                    let tagName = tag;
                    if (tagName.startsWith('#')) {
                        tagName = tagName.slice(1);
                    }
                    if (tagsMap[tagName]) {
                        tagsMap[tagName]++;
                    } else {
                        tagsMap[tagName] = 1;
                    }
                });
            }
        }
    });
    return tagsMap;
}

// 剔除 frontmatter
function stripFrontmatter(content: string): string {
    // 匹配 --- 包裹的 frontmatter
    const frontmatterRegex = /^---\s*$[\s\S]*?^---\s*$/m;
    return content.replace(frontmatterRegex, '').trimStart();
}

export async function getContent(app: App, file: TFile | null, limit: number = 1000, method: string = "head_only"): Promise<string> {
    let content_str = '';
    if (file !== null) { // read from file
        content_str = await app.vault.read(file);
    } else { // read from active editor
        const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
        if (!editor) {
            return '';
        }
        content_str = editor.getSelection();
        content_str = content_str.trim();
        if (content_str.length === 0) {
            content_str = editor.getValue();
        }
    }
    if (content_str.length === 0) {
        return '';
    }

    // 剔除 frontmatter
    content_str = stripFrontmatter(content_str);
    const tokens = splitIntoTokens(content_str);
    //console.log('token_count', tokens.length);
    if (tokens.length > limit && limit > 0) {
        if (method === "head_tail") {
            const left = Math.round(limit * 0.8);
            const right = Math.round(limit * 0.2);
            const leftTokens = tokens.slice(0, left);
            const rightTokens = tokens.slice(-right);
            content_str = joinTokens(leftTokens) + '\n...\n' + joinTokens(rightTokens);
        } else if (method === "head_only") {
            content_str = joinTokens(tokens.slice(0, limit)) + "...";
        } else if (method === "heading") {
            let lines = content_str.split('\n');
            lines = lines.filter(line => line.trim() !== '');

            let new_lines: string[] = [];
            let captureNextParagraph = false;
            for (let line of lines) {
                if (line.startsWith('#')) {
                    new_lines.push(line);
                    captureNextParagraph = true;
                }
                else if (captureNextParagraph && line.trim() !== '') {
                    const lineTokens = splitIntoTokens(line);
                    new_lines.push(joinTokens(lineTokens.slice(0, 30)) + '...'); // 30 tokens
                    captureNextParagraph = false;
                }
            }
            content_str = new_lines.join('\n');
            const totalTokens = splitIntoTokens(content_str);
            if (totalTokens.length > limit) {
                content_str = joinTokens(totalTokens.slice(0, limit));
            } else {
                let remainingTokens = limit - totalTokens.length;
                let head = joinTokens(tokens.slice(0, remainingTokens)) + "...";
                content_str = `Outline: \n${content_str}\n\nBody: ${head}`;
            }
        }
    }
    //console.log('base', tokens.length, 'return', splitIntoTokens(content_str).length);
    return content_str;
}

export function updateFrontMatter(file: TFile, app: App, key: string, value: any, method: string) {
    app.fileManager.processFrontMatter(file, (frontmatter) => {
        if (value === undefined || value === null) {
            return;
        }
        if (method === `append`) {
            let old_value = frontmatter[key];
            if (typeof value === 'string') {
                if (old_value === undefined) {
                    old_value = '';
                }
                frontmatter[key] = old_value + value;
            } else if (Array.isArray(value)) {
                if (old_value === undefined) {
                    old_value = [];
                }
                const new_value = old_value.concat(value);
                const unique_value = Array.from(new Set(new_value));
                frontmatter[key] = unique_value;
            }
        } else if (method === `update`) {
            frontmatter[key] = value;
        } else { // keep: keep_if_exists
            let old_value = frontmatter[key];
            if (old_value !== undefined) {
                return;
            }
            frontmatter[key] = value;
        }
    });
}
