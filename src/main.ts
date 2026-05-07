import { Editor, MarkdownView, Plugin, Notice } from 'obsidian';
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
        
        // 添加状态栏
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.createEl('span', { text: 'ExMemo' });
        this.updateStatusBar();
        
        // 点击状态栏显示详细信息
        this.statusBarItem.onclick = () => {
            const stats = getTokenStats();
            new Notice(`输入: ${stats.currentInput} token\n输出: ${stats.currentOutput} token\n累计: ${this.settings.totalInputTokens + this.settings.totalOutputTokens} token`, 5000);
        };
        
        // 右键菜单
        this.statusBarItem.oncontextmenu = (e) => {
            e.preventDefault();
            this.showContextMenu(e);
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
    
    // 更新状态栏显示
    updateStatusBar() {
        const stats = getTokenStats();
        this.statusBarItem.setText(`${stats.currentInput}→${stats.currentOutput} (${this.settings.totalInputTokens + this.settings.totalOutputTokens})`);
    }
    
    // 显示右键菜单
    showContextMenu(event: MouseEvent) {
        const menu = document.createElement('div');
        menu.className = 'menu';
        menu.style.position = 'fixed';
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
        menu.style.zIndex = '10000';
        menu.style.background = 'var(--background-primary)';
        menu.style.border = '1px solid var(--background-modifier-border)';
        menu.style.borderRadius = '4px';
        menu.style.boxShadow = '0 2px 8px var(--shadow-color)';
        menu.style.padding = '4px 0';
        menu.style.minWidth = '150px';
        
        const menuItem = document.createElement('div');
        menuItem.textContent = t('resetTotalTokens') || '重置累计';
        menuItem.style.padding = '8px 16px';
        menuItem.style.cursor = 'pointer';
        menuItem.style.color = 'var(--text-normal)';
        menuItem.onmouseover = () => {
            menuItem.style.background = 'var(--background-modifier-hover)';
        };
        menuItem.onmouseout = () => {
            menuItem.style.background = 'transparent';
        };
        menuItem.onclick = async () => {
            resetTotalTokenStats(this.settings);
            await this.saveSettings();
            this.updateStatusBar();
            new Notice(t('totalTokensReset') || '累计已重置', 2000);
            menu.remove();
        };
        
        menu.appendChild(menuItem);
        document.body.appendChild(menu);
        
        // 点击其他地方关闭菜单
        const closeMenu = () => {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        };
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 0);
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
