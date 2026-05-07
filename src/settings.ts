import { t } from "./lang/helpers";

export interface ExMemoSettings {
	llmToken: string;
	llmBaseUrl: string;
	llmModelNames: string[];
	llmPrompts: Record<string, { count: number, lastAccess: number }>;
	llmDialogEdit: boolean
	llmMaxRetries: number;
	llmTimeout: number;
	llmTemperature: number;
	llmMaxTokens: number;
	tags: string[];
	metaAuthorEnabled: boolean;
	metaAuthorName: string;
	metaAuthorLink: string;
	metaAuthorAvatar: string;
	metaCollectionsEnabled: boolean;
	metaCollections: string[];
	metaCollectionsPrompt: string;
	metaExtractCoverEnabled: boolean;
	metaIsTruncate: boolean;
	metaMaxTokens: number;
	metaTruncateMethod: string;
	metaUpdateMethod: string;
	metaDescription: string;
	metaTitleEnabled: boolean;
	metaTitlePrompt: string;
	metaSlugEnabled: boolean;
	metaEditTimeEnabled: boolean;
	metaEditTimeFormat: string;
	selectExcludedFolders: string[];
	metaTagsFieldName: string;
	metaDescriptionFieldName: string;
	metaTitleFieldName: string;
	metaUpdatedFieldName: string;
	metaCreatedFieldName: string;
	metaTagsPrompt: string;
	customMetadata: Array<{key: string, value: string}>;
	metaCategoryFieldName: string;
	categories: string[];
	metaCategoryPrompt: string;
	metaCategoryEnabled: boolean;
	totalInputTokens: number;
	totalOutputTokens: number;
	contentOptimizeEnabled: boolean;
	contentOptimizePrompt: string;
}

export const DEFAULT_SETTINGS: ExMemoSettings = {
	llmToken: 'sk-',
	llmBaseUrl: 'https://api.openai.com/v1',
	llmModelNames: ['gpt-4o'],
	llmPrompts: {},
	llmDialogEdit: false,
	llmMaxRetries: 3,
	llmTimeout: 60000,
	llmTemperature: 0.7,
	llmMaxTokens: 2048,
	tags: [],
	metaAuthorEnabled: false,
	metaAuthorName: '',
	metaAuthorLink: '',
	metaAuthorAvatar: '',
	metaCollectionsEnabled: false,
	metaCollections: [],
	metaCollectionsPrompt: t('defaultCollectionsPrompt'),
	metaExtractCoverEnabled: true,
	metaIsTruncate: true,
	metaMaxTokens: 1000,
	metaTruncateMethod: 'head_only',
	metaUpdateMethod: 'no-llm',
	metaDescription: t('defaultSummaryPrompt'),
	metaTitleEnabled: true,
	metaTitlePrompt: t('defaultTitlePrompt'),
	metaSlugEnabled: false,
	metaEditTimeEnabled: true,
	metaEditTimeFormat: 'YYYY-MM-DD HH:mm:ss',
	selectExcludedFolders: [],
	metaTagsFieldName: 'tags',
	metaDescriptionFieldName: 'description',
	metaTitleFieldName: 'title',
	metaUpdatedFieldName: 'updated',
	metaCreatedFieldName: 'created',
	metaTagsPrompt: t('defaultTagsPrompt'),
	customMetadata: [],
	metaCategoryFieldName: 'category',
	categories: JSON.parse(t('defaultCategories')),
	metaCategoryPrompt: t('defaultCategoryPrompt'),
	metaCategoryEnabled: true,
	totalInputTokens: 0,
	totalOutputTokens: 0,
	contentOptimizeEnabled: false,
	contentOptimizePrompt: t('defaultContentOptimizePrompt'),
}
