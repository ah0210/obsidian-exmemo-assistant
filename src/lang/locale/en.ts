// English

export default {
  // Basic translations
  "confirm": "Confirm",
  "yes": "Yes",
  "no": "No",
  "llmLoading": "LLM is thinking...",
  "noResult": "LLM no result",
  "pleaseOpenFile": "Please open a file first",
  "llmError": "An error occurred, please try again later",
  "inputPrompt": "Please enter the prompt",
  "chatButton": "Chat",
  "pleaseSelectText": "Please select the text to be processed first",
  "currentFileNotMarkdown": "The current file is not a markdown file",
  "fileAlreadyContainsTagsAndDescription": "The file already contains tags and description",
  "parseError": "Failed to parse the returned result",
  "metaUpdated": "Meta data updated",

  // LLM Settings
  "llmSettings": "LLM",
  "apiKey": "API key",
  "baseUrl": "Base URL",
  "modelName": "Model name",
  "modelNameDesc": "You can add multiple models. The first one is used by default (move up to reorder). If first model fails, will try next ones.",
  "addModel": "Add model",
  "defaultModel": "Default",
  "candidateModel": "Candidate",
  "llmMaxRetries": "Max retries",
  "llmMaxRetriesDesc": "Maximum number of retries when LLM call fails",
  "llmTimeout": "Request timeout (ms)",
  "llmTimeoutDesc": "Timeout for LLM API requests",
  "llmTemperature": "Temperature",
  "llmTemperatureDesc": "Randomness of LLM output, 0-2, higher is more random",
  "llmMaxTokens": "Max output tokens",
  "llmMaxTokensDesc": "Maximum tokens for single LLM response",

  // Meta Update Settings
  "metaUpdateSetting": "Update meta",
  "updateMetaOptions": "Update",
  "updateMetaOptionsDesc": "If it already exists, choose whether to regenerate",
  "updateForce": "Force update existing items",
  "updateNoLLM": "Only update items that do not use LLM",

  // Content Truncation Settings
  "truncateContent": "Truncate long content?",
  "truncateContentDesc": "When using LLM, whether to truncate if the content exceeds the maximum word count",
  "maxContentLength": "Maximum content length",
  "maxContentLengthDesc": "Set the maximum token limit for the content",
  "truncateMethod": "Truncation method",
  "truncateMethodDesc": "Choose how to handle content that exceeds the limit",
  "head_only": "Extract only the beginning",
  "head_tail": "Extract the beginning and the end",
  "heading": "Extract the heading and the text below it",

  // Tag Settings
  "taggingOptions": "Tags",
  "taggingOptionsDesc": "Automatically generating tags",
  "extractTags": "Extract tags",
  "extractTagsDesc": "Extract tags that appear more than twice from all notes and fill them in the candidate box",
  "extract": "Extract",
  "tagList": "Tag list",
  "tagListDesc": "Optional tag list, separated by line breaks",
  "metaTagsPrompt": "Tags Generation Prompt",  
  "metaTagsPromptDesc": "The prompt for generating tags, where you can set the language, capitalization, etc.",
  "defaultTagsPrompt": "Please extract up to three tags based on the following article content, and in the same language as the content.",

  // Description Settings
  "description": "Description",
  "descriptionDesc": "Automatically generating article descriptions",
  "descriptionPrompt": "Prompt",
  "descriptionPromptDesc": "Prompt for generating descriptions",
  "defaultSummaryPrompt": "Summarize the core content of the article directly without using phrases like 'this article.' The summary should be no more than 50 words, and in the same language as the content.",

  // Title Settings
  "title": "Title",
  "titleDesc": "Automatically generate document titles",
  "enableTitle": "Enable auto title generation",
  "enableTitleDesc": "Enable to automatically generate document titles",
  "titlePrompt": "Title prompt",
  "titlePromptDesc": "Prompt for generating titles",
  "defaultTitlePrompt": "Please generate a concise and clear title for this document, no more than 10 words, and do not use quotes.",

  // Edit Time Settings
  "editTime": "Edit time",
  "editTimeDesc": "Automatically update the edit time of the document",
  "enableEditTime": "Enable auto update edit time",
  "enableEditTimeDesc": "Enable to automatically update the edit time of the document",
  "editTimeFormat": "Edit time format",
  "editTimeFormatDesc": "Set the format of the edit time",

  // Author settings
  "author": "Author",
  "authorDesc": "Write frontmatter: author.name / author.link",
  "enableAuthor": "Enable author",
  "enableAuthorDesc": "When enabled, write the author field when generating meta data",
  "authorName": "name",
  "authorNameDesc": "author.name",
  "authorLink": "link",
  "authorLinkDesc": "author.link",
  "authorAvatar": "avatar",
  "authorAvatarDesc": "author.avatar",

  "collections": "Collections",
  "collectionsDesc": "Match candidate collections in content and write the field",
  "enableCollections": "Enable collections",
  "enableCollectionsDesc": "When enabled, match candidates in content and write collections",
  "collectionsList": "Collections list",
  "collectionsListDesc": "Optional collections list, separated by line breaks",
  "metaCollectionsPrompt": "Collections Prompt",
  "metaCollectionsPromptDesc": "Prompt for generating collections",
  "defaultCollectionsPrompt": "Please select the most appropriate collections for this article from available collections, multiple selections allowed.",

  "extractCover": "Extract cover",
  "extractCoverDesc": "Extract the first image from article content as cover image",
  "enableExtractCover": "Enable cover extraction",
  "enableExtractCoverDesc": "When enabled, automatically extract the first image as cover",

  // Custom Field Names
  "customFieldNames": "Custom field names",
  "customFieldNamesDesc": "Custom field names for metadata",
  "tagsFieldName": "Tags field name",
  "tagsFieldNameDesc": "Field name used for automatically generating tags (default: tags)",
  "descriptionFieldName": "Description field name",
  "descriptionFieldNameDesc": "Field name used for automatically generating descriptions (default: description)",
  "titleFieldName": "Title field name",
  "titleFieldNameDesc": "Field name used for automatically generating titles (default: title)",
  "updateTimeFieldName": "Update time field name",
  "updateTimeFieldNameDesc": "Field name used for automatically updating the update time (default: updated)",
  "createTimeFieldName": "Create time field name",
  "createTimeFieldNameDesc": "Field name used for automatically updating the create time (default: created)",

  // Custom Metadata
  "customMetadata": "Custom metadata",
  "customMetadataDesc": "Add custom metadata fields, e.g.: author=Author Name",
  "addField": "Add field",
  "fieldKey": "Field name",
  "fieldValue": "Field value",

  // Category Settings
  "categoryOptions": "Category",
  "categoryOptionsDesc": "Automatically select appropriate category for articles",
  "enableCategory": "Enable auto category",
  "enableCategoryDesc": "Enable to automatically select category for documents",
  "categoryFieldName": "Category field name",
  "categoryFieldNameDesc": "Field name used for automatically generating category (default: category)",
  "categoryList": "Category list",
  "categoryListDesc": "Optional category list, separated by line breaks",
  "metaCategoryPrompt": "Category prompt",
  "metaCategoryPromptDesc": "Prompt for generating category",
  "defaultCategoryPrompt": "Please select a suitable category for this document",
  "categoryUnknown": "Unknown",
  "defaultCategories": "[\"Travel\", \"Shopping\", \"Mood\", \"Book Review\", \"Tech & Knowledge\", \"Entertainment\", \"Papers to Read\", \"Ideas & Inspiration\", \"Todo\", \"Methodology\", \"Work Thoughts\", \"Investment\", \"Books to Read\", \"Personal Info\", \"Accounting\", \"Tasks\", \"Health\", \"Excerpts\", \"Daily Life\", \"Worldview\", \"Food\"]",
  "slug": "Slug",
  "slugDesc": "Generate an English SEO slug (category-title)",
  "enableSlug": "Enable slug",
  "enableSlugDesc": "When enabled, generate slug based on content",

  // Commands
    "exmemoAdjustMeta": "Generate meta data",
    
    // Token related
    "resetTotalTokens": "Reset total",
    "totalTokensReset": "Total has been reset"
}
