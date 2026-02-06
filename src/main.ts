import { Editor, MarkdownView, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, ExMemoSettings } from './settings';
import { ExMemoSettingTab } from './settingsTab';
import { adjustMdMeta } from './meta';
import { t } from "./lang/helpers"

export default class ExMemoAsstPlugin extends Plugin {
    settings: ExMemoSettings;
    async onload() {
        await this.loadSettings();
        this.addCommand({
            id: 'adjust-meta',
            name: t('exmemoAdjustMeta'),
            editorCallback: (editor: Editor, view: MarkdownView) => {
                adjustMdMeta(this.app, this.settings);
            }
        });
        this.addSettingTab(new ExMemoSettingTab(this.app, this));
    }
    onunload() {
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
