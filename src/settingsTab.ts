import { PluginSettingTab, Setting, App, TextAreaComponent } from 'obsidian';
import { loadTags } from "./utils";
import { t } from "./lang/helpers";

function createSection(containerEl: HTMLElement, title: string, desc?: string, defaultOpen: boolean = false): HTMLElement {
	const details = containerEl.createEl('details', { cls: 'exmemo-collapsible' });
	if (defaultOpen) details.setAttr('open', '');
	
	const summary = details.createEl('summary', { cls: 'exmemo-collapsible-header' });
	summary.createEl('span', { text: title, cls: 'exmemo-collapsible-title' });
	if (desc) {
		summary.createEl('span', { text: desc, cls: 'exmemo-collapsible-desc' });
	}
	
	return details.createEl('div', { cls: 'exmemo-collapsible-content' });
}

export class ExMemoSettingTab extends PluginSettingTab {
	plugin;

	constructor(app: App, plugin: any) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let textComponent: TextAreaComponent;
		const { containerEl } = this;
		containerEl.empty();

		const llmSection = createSection(containerEl, t("llmSettings"), '', true);
		new Setting(llmSection)
			.setName(t("apiKey"))
			.addText(text => text
				.setPlaceholder('Enter your token')
				.setValue(this.plugin.settings.llmToken)
				.onChange(async (value) => {
					this.plugin.settings.llmToken = value;
					await this.plugin.saveSettings();
				}));
		new Setting(llmSection)
			.setName(t("baseUrl"))
			.addText(text => text
				.setPlaceholder('https://api.openai.com/v1')
				.setValue(this.plugin.settings.llmBaseUrl)
				.onChange(async (value) => {
					this.plugin.settings.llmBaseUrl = value;
					await this.plugin.saveSettings();
				}));
		new Setting(llmSection)
			.setName(t("modelName"))
			.setDesc(t("modelNameDesc"))
			.addButton((button) => {
				button.setButtonText(t("addModel"))
					.onClick(async () => {
						this.plugin.settings.llmModelNames.push('');
						await this.plugin.saveSettings();
						this.display();
					});
			});

		this.plugin.settings.llmModelNames.forEach((modelName: string, index: number) => {
			const setting = new Setting(llmSection)
				.setName(index === 0 ? t("defaultModel") : t("candidateModel"))
				.setClass('setting-item-nested');

			setting
				.addText((text) => {
					text.setPlaceholder('gpt-4o')
						.setValue(modelName)
						.onChange(async (value) => {
							this.plugin.settings.llmModelNames[index] = value;
							await this.plugin.saveSettings();
						});
				})
				.addButton((button) => {
					button.setIcon('arrow-up')
						.setDisabled(index === 0)
						.onClick(async () => {
							const list = this.plugin.settings.llmModelNames;
							[list[index - 1], list[index]] = [list[index], list[index - 1]];
							await this.plugin.saveSettings();
							this.display();
						});
				})
				.addButton((button) => {
					button.setIcon('arrow-down')
						.setDisabled(index >= this.plugin.settings.llmModelNames.length - 1)
						.onClick(async () => {
							const list = this.plugin.settings.llmModelNames;
							[list[index], list[index + 1]] = [list[index + 1], list[index]];
							await this.plugin.saveSettings();
							this.display();
						});
				})
				.addButton((button) => {
					button.setIcon('trash')
						.onClick(async () => {
							const list = this.plugin.settings.llmModelNames;
							if (list.length <= 1) {
								list[0] = '';
							} else {
								list.splice(index, 1);
							}
							await this.plugin.saveSettings();
							this.display();
						});
				});
		});

		new Setting(llmSection)
			.setName(t("llmMaxRetries"))
			.setDesc(t("llmMaxRetriesDesc"))
			.setClass('setting-item-nested')
			.addText((text) => {
				text.setValue(this.plugin.settings.llmMaxRetries.toString())
					.onChange(async (value) => {
						this.plugin.settings.llmMaxRetries = parseInt(value) || 3;
						await this.plugin.saveSettings();
					});
			});

		new Setting(llmSection)
			.setName(t("llmTimeout"))
			.setDesc(t("llmTimeoutDesc"))
			.setClass('setting-item-nested')
			.addText((text) => {
				text.setValue(this.plugin.settings.llmTimeout.toString())
					.onChange(async (value) => {
						this.plugin.settings.llmTimeout = parseInt(value) || 60000;
						await this.plugin.saveSettings();
					});
			});

		new Setting(llmSection)
			.setName(t("llmTemperature"))
			.setDesc(t("llmTemperatureDesc"))
			.setClass('setting-item-nested')
			.addText((text) => {
				text.setValue(this.plugin.settings.llmTemperature.toString())
					.onChange(async (value) => {
						this.plugin.settings.llmTemperature = parseFloat(value) || 0.7;
						await this.plugin.saveSettings();
					});
			});

		new Setting(llmSection)
			.setName(t("llmMaxTokens"))
			.setDesc(t("llmMaxTokensDesc"))
			.setClass('setting-item-nested')
			.addText((text) => {
				text.setValue(this.plugin.settings.llmMaxTokens.toString())
					.onChange(async (value) => {
						this.plugin.settings.llmMaxTokens = parseInt(value) || 2048;
						await this.plugin.saveSettings();
					});
			});

		const metaSection = createSection(containerEl, t("metaUpdateSetting"));
		new Setting(metaSection)
			.setName(t("updateMetaOptions"))
			.setDesc(t("updateMetaOptionsDesc"))
			.setClass('setting-item-nested')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('force', t("updateForce"))
					.addOption('no-llm', t("updateNoLLM"))
					.setValue(this.plugin.settings.metaUpdateMethod)
					.onChange(async (value) => {
						this.plugin.settings.metaUpdateMethod = value;
						await this.plugin.saveSettings();
					});
			});

		const toggleCutSetting = new Setting(metaSection)
			.setName(t("truncateContent"))
			.setDesc(t("truncateContentDesc"))
			.setClass('setting-item-nested')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.metaIsTruncate)
					.onChange(async (value) => {
						this.plugin.settings.metaIsTruncate = value;
						await this.plugin.saveSettings();
						truncateSetting.setDisabled(!value);
						maxTokensSetting.setDisabled(!value);
					});
			});

		const maxTokensSetting = new Setting(metaSection)
			.setName(t("maxContentLength"))
			.setDesc(t("maxContentLengthDesc"))
			.setClass('setting-item-nested-2')
			.addText((text) => {
				text.setValue(this.plugin.settings.metaMaxTokens.toString())
					.onChange(async (value) => {
						this.plugin.settings.metaMaxTokens = parseInt(value);
						await this.plugin.saveSettings();
					});
			});

		const truncateSetting = new Setting(metaSection)
			.setName(t("truncateMethod"))
			.setDesc(t("truncateMethodDesc"))
			.setClass('setting-item-nested-2')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('head_only', t("head_only"))
					.addOption('head_tail', t("head_tail"))
					.addOption('heading', t("heading"))
					.setValue(this.plugin.settings.metaTruncateMethod)
					.onChange(async (value) => {
						this.plugin.settings.metaTruncateMethod = value;
						await this.plugin.saveSettings();
					});
			});

		if (toggleCutSetting) {
			truncateSetting.setDisabled(!this.plugin.settings.metaIsTruncate);
			maxTokensSetting.setDisabled(!this.plugin.settings.metaIsTruncate);
		}

		const tagsSection = createSection(containerEl, t("taggingOptions"), t("taggingOptionsDesc"));
		
		new Setting(tagsSection)
			.setName(t('tagsFieldName'))
			.setDesc(t('tagsFieldNameDesc'))
			.setClass('setting-item-nested')
			.addText(text => text
				.setValue(this.plugin.settings.metaTagsFieldName)
				.onChange(async (value) => {
					this.plugin.settings.metaTagsFieldName = value || 'tags';
					await this.plugin.saveSettings();
				}));

		new Setting(tagsSection)
			.setName(t("extractTags"))
			.setDesc(t("extractTagsDesc"))
			.setClass('setting-item-nested')
			.addButton((btn) => {
				btn.setButtonText(t("extract"))
					.setCta()
					.onClick(async () => {
						const tags: Record<string, number> = await loadTags(this.app);
						const sortedTags = Object.entries(tags).sort((a, b) => b[1] - a[1]);
						const topTags = sortedTags.filter(([_, count]) => count > 2).map(([tag]) => tag);
						let currentTagList = this.plugin.settings.tags;
						for (const tag of topTags) {
							if (!currentTagList.includes(tag)) {
								currentTagList.push(tag);
							}
						}
						this.plugin.settings.tags = currentTagList;
						textComponent.setValue(this.plugin.settings.tags.join('\n'));
					});
			});
		new Setting(tagsSection)
			.setName(t("tagList"))
			.setDesc(t("tagListDesc"))
			.setClass('setting-item-nested')
			.addTextArea((text) => {
				textComponent = text;
				text.setValue(this.plugin.settings.tags.join('\n'))
					.onChange(async (value) => {
						this.plugin.settings.tags = value.split('\n').map(tag => tag.trim()).filter(tag => tag !== '');
						await this.plugin.saveSettings();
					});
				text.inputEl.setAttr('rows', '7');
				text.inputEl.addClass('setting-textarea');
			});

		new Setting(tagsSection)
			.setName(t('metaTagsPrompt'))
			.setDesc(t('metaTagsPromptDesc'))
			.setClass('setting-item-nested')
			.addTextArea(text => {
				text.setPlaceholder(this.plugin.settings.metaTagsPrompt)
					.setValue(this.plugin.settings.metaTagsPrompt)
					.onChange(async (value) => {
						this.plugin.settings.metaTagsPrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setAttr('rows', '3');
				text.inputEl.addClass('setting-textarea');
			});

		const categorySection = createSection(containerEl, t("categoryOptions"), t("categoryOptionsDesc"));
		
		new Setting(categorySection)
			.setName(t('enableCategory'))
			.setDesc(t('enableCategoryDesc'))
			.setClass('setting-item-nested')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.metaCategoryEnabled)
				.onChange(async (value) => {
					this.plugin.settings.metaCategoryEnabled = value;
					await this.plugin.saveSettings();
				}));
			
		new Setting(categorySection)
			.setName(t('categoryFieldName'))
			.setDesc(t('categoryFieldNameDesc'))
			.setClass('setting-item-nested')
			.addText(text => text
				.setValue(this.plugin.settings.metaCategoryFieldName)
				.onChange(async (value) => {
					this.plugin.settings.metaCategoryFieldName = value || 'category';
					await this.plugin.saveSettings();
				}));

		new Setting(categorySection)
			.setName(t("categoryList"))
			.setDesc(t("categoryListDesc"))
			.setClass('setting-item-nested')
			.addTextArea((text) => {
				text.setValue(this.plugin.settings.categories.join('\n'))
					.onChange(async (value) => {
						this.plugin.settings.categories = value.split('\n').map(cat => cat.trim()).filter(cat => cat !== '');
						await this.plugin.saveSettings();
					});
				text.inputEl.setAttr('rows', '5');
				text.inputEl.addClass('setting-textarea');
			});

		new Setting(categorySection)
			.setName(t('metaCategoryPrompt'))
			.setDesc(t('metaCategoryPromptDesc'))
			.setClass('setting-item-nested')
			.addTextArea(text => {
				text.setPlaceholder(this.plugin.settings.metaCategoryPrompt)
					.setValue(this.plugin.settings.metaCategoryPrompt)
					.onChange(async (value) => {
						this.plugin.settings.metaCategoryPrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setAttr('rows', '3');
				text.inputEl.addClass('setting-textarea');
			});

		const descSection = createSection(containerEl, t("description"), t("descriptionDesc"));
		
		new Setting(descSection)
			.setName(t('descriptionFieldName'))
			.setDesc(t('descriptionFieldNameDesc'))
			.setClass('setting-item-nested')
			.addText(text => text
				.setValue(this.plugin.settings.metaDescriptionFieldName)
				.onChange(async (value) => {
					this.plugin.settings.metaDescriptionFieldName = value || 'description';
					await this.plugin.saveSettings();
				}));

		new Setting(descSection)
			.setName(t("descriptionPrompt"))
			.setDesc(t("descriptionPromptDesc"))
			.setClass('setting-item-nested')
			.addTextArea((text) => {
				text.setValue(this.plugin.settings.metaDescription)
					.onChange(async (value) => {
						this.plugin.settings.metaDescription = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setAttr('rows', '3');
				text.inputEl.addClass('setting-textarea');
			});

		const titleSection = createSection(containerEl, t("title"), t("titleDesc"));
		
		new Setting(titleSection)
			.setName(t('titleFieldName'))
			.setDesc(t('titleFieldNameDesc'))
			.setClass('setting-item-nested')
			.addText(text => text
				.setValue(this.plugin.settings.metaTitleFieldName)
				.onChange(async (value) => {
					this.plugin.settings.metaTitleFieldName = value || 'title';
					await this.plugin.saveSettings();
				}));

		new Setting(titleSection)
			.setName(t("enableTitle"))
			.setDesc(t("enableTitleDesc"))
			.setClass('setting-item-nested')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.metaTitleEnabled)
					.onChange(async (value) => {
						this.plugin.settings.metaTitleEnabled = value;
						await this.plugin.saveSettings();
						titlePromptSetting.setDisabled(!value);
					});
			});

		const titlePromptSetting = new Setting(titleSection)
			.setName(t("titlePrompt"))
			.setDesc(t("titlePromptDesc"))
			.setClass('setting-item-nested')
			.addTextArea((text) => {
				text.setValue(this.plugin.settings.metaTitlePrompt)
					.onChange(async (value) => {
						this.plugin.settings.metaTitlePrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setAttr('rows', '3');
				text.inputEl.addClass('setting-textarea');
			});

		titlePromptSetting.setDisabled(!this.plugin.settings.metaTitleEnabled);

		const slugSection = createSection(containerEl, t("slug"), t("slugDesc"));

		const slugPromptSetting = new Setting(slugSection)
			.setName(t("slugPrompt"))
			.setDesc(t("slugPromptDesc"))
			.setClass('setting-item-nested')
			.addTextArea((text) => {
				text.setValue(this.plugin.settings.metaSlugPrompt)
					.onChange(async (value) => {
						this.plugin.settings.metaSlugPrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setAttr('rows', '3');
				text.inputEl.addClass('setting-textarea');
			});

		new Setting(slugSection)
			.setName(t("enableSlug"))
			.setDesc(t("enableSlugDesc"))
			.setClass('setting-item-nested')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.metaSlugEnabled)
					.onChange(async (value) => {
						this.plugin.settings.metaSlugEnabled = value;
						await this.plugin.saveSettings();
						slugPromptSetting.setDisabled(!value);
					});
			});

		slugPromptSetting.setDisabled(!this.plugin.settings.metaSlugEnabled);

		const editTimeSection = createSection(containerEl, t("editTime"), t("editTimeDesc"));
		
		new Setting(editTimeSection)
			.setName(t('updateTimeFieldName'))
			.setDesc(t('updateTimeFieldNameDesc'))
			.setClass('setting-item-nested')
			.addText(text => text
				.setValue(this.plugin.settings.metaUpdatedFieldName)
				.onChange(async (value) => {
					this.plugin.settings.metaUpdatedFieldName = value || 'updated';
					await this.plugin.saveSettings();
				}));

		new Setting(editTimeSection)
			.setName(t('createTimeFieldName'))
			.setDesc(t('createTimeFieldNameDesc'))
			.setClass('setting-item-nested')
			.addText(text => text
				.setValue(this.plugin.settings.metaCreatedFieldName)
				.onChange(async (value) => {
					this.plugin.settings.metaCreatedFieldName = value || 'created';
					await this.plugin.saveSettings();
				}));

		new Setting(editTimeSection)
			.setName(t("enableEditTime"))
			.setDesc(t("enableEditTimeDesc"))
			.setClass('setting-item-nested')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.metaEditTimeEnabled)
					.onChange(async (value) => {
						this.plugin.settings.metaEditTimeEnabled = value;
						await this.plugin.saveSettings();
						editTimeFormatSetting.setDisabled(!value);
					});
			});

		const editTimeFormatSetting = new Setting(editTimeSection)
			.setName(t("editTimeFormat"))
			.setDesc(t("editTimeFormatDesc"))
			.setClass('setting-item-nested')
			.addText((text) => {
				text.setValue(this.plugin.settings.metaEditTimeFormat)
					.setPlaceholder('YYYY-MM-DD HH:mm:ss')
					.onChange(async (value) => {
						this.plugin.settings.metaEditTimeFormat = value;
						await this.plugin.saveSettings();
					});
			});

		editTimeFormatSetting.setDisabled(!this.plugin.settings.metaEditTimeEnabled);

		const authorSection = createSection(containerEl, t("author"), t("authorDesc"));
		
		const authorNameSetting = new Setting(authorSection)
			.setName(t('authorName'))
			.setDesc(t('authorNameDesc'))
			.setClass('setting-item-nested')
			.addText(text => text
				.setValue(this.plugin.settings.metaAuthorName)
				.onChange(async (value) => {
					this.plugin.settings.metaAuthorName = value;
					await this.plugin.saveSettings();
				}));

		const authorLinkSetting = new Setting(authorSection)
			.setName(t('authorLink'))
			.setDesc(t('authorLinkDesc'))
			.setClass('setting-item-nested')
			.addText(text => text
				.setValue(this.plugin.settings.metaAuthorLink)
				.onChange(async (value) => {
					this.plugin.settings.metaAuthorLink = value;
					await this.plugin.saveSettings();
				}));

		const authorAvatarSetting = new Setting(authorSection)
			.setName(t('authorAvatar'))
			.setDesc(t('authorAvatarDesc'))
			.setClass('setting-item-nested')
			.addText(text => text
				.setValue(this.plugin.settings.metaAuthorAvatar)
				.onChange(async (value) => {
					this.plugin.settings.metaAuthorAvatar = value;
					await this.plugin.saveSettings();
				}));

		new Setting(authorSection)
			.setName(t("enableAuthor"))
			.setDesc(t("enableAuthorDesc"))
			.setClass('setting-item-nested')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.metaAuthorEnabled)
					.onChange(async (value) => {
						this.plugin.settings.metaAuthorEnabled = value;
						await this.plugin.saveSettings();
						authorNameSetting.setDisabled(!value);
						authorLinkSetting.setDisabled(!value);
						authorAvatarSetting.setDisabled(!value);
					});
			});

		authorNameSetting.setDisabled(!this.plugin.settings.metaAuthorEnabled);
		authorLinkSetting.setDisabled(!this.plugin.settings.metaAuthorEnabled);
		authorAvatarSetting.setDisabled(!this.plugin.settings.metaAuthorEnabled);

		const collectionsSection = createSection(containerEl, t("collections"), t("collectionsDesc"));

		const collectionsListSetting = new Setting(collectionsSection)
			.setName(t('collectionsList'))
			.setDesc(t('collectionsListDesc'))
			.setClass('setting-item-nested')
			.addTextArea((text) => {
				text.setValue(this.plugin.settings.metaCollections.join('\n'))
					.onChange(async (value) => {
						this.plugin.settings.metaCollections = value.split('\n').map(item => item.trim()).filter(item => item !== '');
						await this.plugin.saveSettings();
					});
				text.inputEl.setAttr('rows', '5');
				text.inputEl.addClass('setting-textarea');
			});

		new Setting(collectionsSection)
			.setName(t("enableCollections"))
			.setDesc(t("enableCollectionsDesc"))
			.setClass('setting-item-nested')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.metaCollectionsEnabled)
					.onChange(async (value) => {
						this.plugin.settings.metaCollectionsEnabled = value;
						await this.plugin.saveSettings();
						collectionsListSetting.setDisabled(!value);
						collectionsPromptSetting.setDisabled(!value);
					});
			});

		const collectionsPromptSetting = new Setting(collectionsSection)
			.setName(t('metaCollectionsPrompt'))
			.setDesc(t('metaCollectionsPromptDesc'))
			.setClass('setting-item-nested')
			.addTextArea((text) => {
				text.setPlaceholder(this.plugin.settings.metaCollectionsPrompt)
					.setValue(this.plugin.settings.metaCollectionsPrompt)
					.onChange(async (value) => {
						this.plugin.settings.metaCollectionsPrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setAttr('rows', '3');
				text.inputEl.addClass('setting-textarea');
			});

		collectionsListSetting.setDisabled(!this.plugin.settings.metaCollectionsEnabled);
		collectionsPromptSetting.setDisabled(!this.plugin.settings.metaCollectionsEnabled);

		const contentOptimizeSection = createSection(containerEl, t("contentOptimize"), t("contentOptimizeDesc"));

		const contentOptimizePromptSetting = new Setting(contentOptimizeSection)
			.setName(t('contentOptimizePrompt'))
			.setDesc(t('contentOptimizePromptDesc'))
			.setClass('setting-item-nested')
			.addTextArea((text) => {
				text.setPlaceholder(this.plugin.settings.contentOptimizePrompt)
					.setValue(this.plugin.settings.contentOptimizePrompt)
					.onChange(async (value) => {
						this.plugin.settings.contentOptimizePrompt = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.setAttr('rows', '3');
				text.inputEl.addClass('setting-textarea');
			});

		new Setting(contentOptimizeSection)
			.setName(t("enableContentOptimize"))
			.setDesc(t("enableContentOptimizeDesc"))
			.setClass('setting-item-nested')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.contentOptimizeEnabled)
					.onChange(async (value) => {
						this.plugin.settings.contentOptimizeEnabled = value;
						await this.plugin.saveSettings();
						contentOptimizePromptSetting.setDisabled(!value);
					});
			});

		contentOptimizePromptSetting.setDisabled(!this.plugin.settings.contentOptimizeEnabled);

		const extractCoverSection = createSection(containerEl, t("extractCover"), t("extractCoverDesc"));

		new Setting(extractCoverSection)
			.setName(t("enableExtractCover"))
			.setDesc(t("enableExtractCoverDesc"))
			.setClass('setting-item-nested')
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.metaExtractCoverEnabled)
					.onChange(async (value) => {
						this.plugin.settings.metaExtractCoverEnabled = value;
						await this.plugin.saveSettings();
					});
			});

		const customMetaSection = createSection(containerEl, t('customMetadata'), t('customMetadataDesc'));

		new Setting(customMetaSection)
			.addButton(button => button
				.setButtonText(t('addField'))
				.onClick(async () => {
					this.plugin.settings.customMetadata.push({
						key: '',
						value: ''
					});
					await this.plugin.saveSettings();
					this.display();
				}));

		interface CustomMetadata {
			key: string;
			value: string;
		}
		
		this.plugin.settings.customMetadata.forEach((meta: CustomMetadata, index: number) => {
			const setting = new Setting(customMetaSection)
				.addText(text => text
					.setPlaceholder(t('fieldKey'))
					.setValue(meta.key)
					.onChange(async (value) => {
						this.plugin.settings.customMetadata[index].key = value;
						await this.plugin.saveSettings();
					}))
				.addText(text => text
					.setPlaceholder(t('fieldValue'))
					.setValue(meta.value)
					.onChange(async (value) => {
						this.plugin.settings.customMetadata[index].value = value;
						await this.plugin.saveSettings();
					}))
				.addButton(button => button
					.setIcon('trash')
					.onClick(async () => {
						this.plugin.settings.customMetadata.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					}));
		});

	}
}
