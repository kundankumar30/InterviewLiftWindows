const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// Hardcoded language settings for EN-IN only
const currentUILanguage = 'en';
const currentTranscriptionLanguage = 'en-IN';
const currentAIResponseLanguage = 'en';
let uiTranslations = {};

// --- Configuration ---
const APP_PATH = app.isPackaged ? process.resourcesPath : app.getAppPath();
const LOCALES_UI_DIR = path.join(APP_PATH, 'src', 'locales', 'ui');
const LOCALES_PROMPTS_DIR = path.join(APP_PATH, 'src', 'locales', 'gemini_prompts');

function loadUITranslations() {
    const filePath = path.join(LOCALES_UI_DIR, 'en.json');
    try {
        if (fs.existsSync(filePath)) {
            uiTranslations = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } else {
            console.error('English UI translations (en.json) not found!');
            uiTranslations = {};
        }
    } catch (error) {
        console.error('Error loading UI translations:', error);
        uiTranslations = {};
    }
}

function initializeLanguages() {
    // Simply load English translations
    loadUITranslations();
}

function getCurrentUILanguage() { 
    return currentUILanguage; 
}

function getUITranslation(key, replacements = {}) {
    let text = uiTranslations[key] || key;
    for (const placeholder in replacements) {
        text = text.replace(new RegExp(`{{${placeholder}}}`, 'g'), replacements[placeholder]);
    }
    return text;
}

function getCurrentTranscriptionLanguage() { 
    return currentTranscriptionLanguage; 
}

function getCurrentAIResponseLanguage() { 
    return currentAIResponseLanguage; 
}

function getGeminiPromptForLanguage(aiResponseLangCode, dynamicData = {}) {
    const { text, jobRole, keySkills, transcriptionLanguageName } = dynamicData;
    let promptTemplate = '';

    const promptPath = path.join(LOCALES_PROMPTS_DIR, 'en.txt');

    try {
        if (fs.existsSync(promptPath)) {
            promptTemplate = fs.readFileSync(promptPath, 'utf-8');
        } else {
            throw new Error('English Gemini prompt (en.txt) not found!');
        }

        promptTemplate = promptTemplate.replace(/\{\{text\}\}/g, text || '');
        promptTemplate = promptTemplate.replace(/\{\{jobRole\}\}/g, jobRole || '');
        promptTemplate = promptTemplate.replace(/\{\{keySkills\}\}/g, keySkills || '');
        promptTemplate = promptTemplate.replace(/\{\{transcriptionLangName\}\}/g, transcriptionLanguageName || 'English (India)');
        promptTemplate = promptTemplate.replace(/\{\{aiRespLangName\}\}/g, 'English');

        return promptTemplate;
    } catch (error) {
        console.error('Error loading or formatting Gemini prompt:', error);
        return `Error processing request. Please analyze: "${text}" (language: English (India)). Respond in English.`;
    }
}

module.exports = {
    initializeLanguages,
    getCurrentUILanguage, 
    getUITranslation,
    getCurrentTranscriptionLanguage,
    getCurrentAIResponseLanguage,
    getGeminiPromptForLanguage
}; 