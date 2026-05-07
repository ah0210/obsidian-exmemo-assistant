import { Editor, MarkdownView, Plugin, Notice, Menu } from 'obsidian';
import { DEFAULT_SETTINGS, ExMemoSettings } from './settings';
import { ExMemoSettingTab } from './settingsTab';
import { adjustMdMeta } from './meta';
import { t } from "./lang/helpers";
import { resetTotalTokenStats, getTokenStats } from './utils';

export default class ExMemoAsstPlugin extends Plugin {
    settings: ExMemoSettings;
    statusBarItem: HTMLElement;
    
    async onload() {
        await this.loadSettings();
        
        this.statusBarItem = this.addStatusBarItem();
        this.updateStatusBar();
        
        this.statusBarItem.onclick = () => {
            const stats = getTokenStats(this.settings);
            new Notice(`本次输入: ${stats.currentInput} token\n本次输出: ${stats.currentOutput} token\n累计输入: ${stats.totalInput} token\n累计输出: ${stats.totalOutput} token`, 5000);
        };
        
        this.statusBarItem.oncontextmenu = (e) => {
            e.preventDefault();
            const menu = new Menu();
            menu.addItem((item) => {
                item.setTitle(t('resetTotalTokens') || '重置累计')
                    .setIcon('trash')
                    .onClick(async () => {
                        resetTotalTokenStats(this.settings);
                        await this.saveSettings();
                        this.updateStatusBar();
                        new Notice(t('totalTokensReset') || '累计已重置', 2000);
                    });
            });
            menu.showAtMouseEvent(e);
        };
        
        this.addCommand({
            id: 'adjust-meta',
            name: t('exmemoAdjustMeta'),
            editorCallback: async (editor: Editor, view: MarkdownView) => {
                await adjustMdMeta(this.app, this.settings, () => this.saveSettings());
                this.updateStatusBar();
            }
        });
        this.addSettingTab(new ExMemoSettingTab(this.app, this));
    }
    
    onunload() {
        this.statusBarItem.remove();
    }
    
    updateStatusBar() {
        const stats = getTokenStats(this.settings);
        if (stats.totalInput === 0 && stats.totalOutput === 0 && stats.currentInput === 0 && stats.currentOutput === 0) {
            this.statusBarItem.setText('ExMemo');
        } else {
            this.statusBarItem.setText(`${stats.currentInput}→${stats.currentOutput} (${stats.totalInput + stats.totalOutput})`);
        }
    }
	async loadSettings() {
		const data = (await this.loadData()) as any;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		let migrated = false;

		if (!Array.isArray(this.settings.llmModelNames)) {
			const legacyModelName = typeof data?.llmModelName === 'string' ? data.llmModelName : '';
			this.settings.llmModelNames = legacyModelName ? [legacyModelName] : [...DEFAULT_SETTINGS.llmModelNames];
			migrated = true;
		}

		this.settings.llmModelNames = this.settings.llmModelNames
			.map((v) => (typeof v === 'string' ? v.trim() : ''))
			.filter((v) => v.length > 0);

		if (this.settings.llmModelNames.length === 0) {
			this.settings.llmModelNames = [...DEFAULT_SETTINGS.llmModelNames];
			migrated = true;
		}

		if (migrated) {
			await this.saveSettings();
		}
	}
	async saveSettings() {
		await this.saveData(this.settings);
	}
}
