/*
 * overlay-renderer.js - Overlay window UI and AI interaction management
 * 
 * AI CALLING CONDITIONS (Aligned with Primary Conditions):
 * 1. Minimum text length: 10+ characters
 * 2. Natural sentence breaks: text ends with ., !, ?
 * 3. Similarity check: Content must be <85% similar to last AI call
 * 4. VAD silence: After 1-second silence with 10+ chars and <85% similarity
 * 
 * Note: Primary AI calling is handled by recording.js service.
 * This file provides additional fallback checks and VAD-based triggers.
 */

// overlay-renderer.js
const electron = require('electron');
const ipcRenderer = electron.ipcRenderer;
// const desktopCapturer = electron.desktopCapturer; // No longer needed here

// Basic overlay functionality without privacy detection

// Remove old debug logs for desktopCapturer as it's not used directly anymore
// console.log('--- DEBUG DESKTOPCAPTURER ---');
// console.log('Electron object:', electron);
// console.log('desktopCapturer from electron.desktopCapturer:', desktopCapturer);
// console.log('--- END DEBUG ---');

// --- Timing Tracking Variables ---
const timingData = {
    stt_received: null,
    ai_api_call_start: null,
    ai_api_response_received: null,
    answer_rendered: null,
    recording_started: null,
    recording_stopped: null
};

// --- Streaming Suggestion State Variables ---
let activeStreamingSuggestionElement = null;
let currentStreamingResponseText = "";

// --- Screenshot Solution Streaming State Variables ---
let activeStreamingScreenshotElement = null;
let currentStreamingScreenshotText = "";

// Screen protection toggle functionality
let screenProtectionEnabled = true; // Default state is enabled

// Function to initialize screen protection toggle
function initScreenProtectionToggle() {
    const toggle = document.getElementById('screenProtectionToggle');
    if (toggle) {
        toggle.checked = screenProtectionEnabled;
        
        // Add event listener
        toggle.addEventListener('change', function() {
            screenProtectionEnabled = this.checked;
            // Send message to main process to toggle content protection
            ipcRenderer.send('toggle-screen-protection', screenProtectionEnabled);
            
            // Show notification
            const status = screenProtectionEnabled ? 'enabled' : 'disabled';
            showNotification('Screen Protection', `Screen protection ${status}`);
            
            console.log(`Screen protection ${status}`);
        });
    }
}

// Function to log timing data
function logTimingData() {
    console.log('--- TIMING DATA ---');
    for (const [event, timestamp] of Object.entries(timingData)) {
        if (timestamp) {
            console.log(`${event}: ${new Date(timestamp).toISOString()}`);
        }
    }
    
    // Calculate durations if we have the data
    if (timingData.ai_api_call_start && timingData.stt_received) {
        console.log(`Time from STT to API call: ${timingData.ai_api_call_start - timingData.stt_received}ms`);
    }
    
    if (timingData.ai_api_response_received && timingData.ai_api_call_start) {
        console.log(`API response time: ${timingData.ai_api_response_received - timingData.ai_api_call_start}ms`);
    }
    
    if (timingData.answer_rendered && timingData.ai_api_response_received) {
        console.log(`Time to render answer: ${timingData.answer_rendered - timingData.ai_api_response_received}ms`);
    }
    
    if (timingData.answer_rendered && timingData.stt_received) {
        console.log(`Total time from STT to answer: ${timingData.answer_rendered - timingData.stt_received}ms`);
    }
    console.log('------------------');
}

// Add styles for transcript layout
const style = document.createElement('style');
style.textContent = `
    .transcript-line {
        margin-bottom: 4px;
        padding: 2px 0;
        line-height: 1.5;
        color: rgba(255, 255, 255, 1.0);
    }
    .transcript-line-interim {
        color: rgba(255, 255, 255, 0.9); 
        border-left: 2px solid rgba(52, 152, 219, 0.7);
        padding-left: 4px;
        position: relative; /* For the pulsing dot */
    }
    .transcript-line-interim::after { /* Pulsing dot for interim */
        content: '';
        display: inline-block;
        width: 5px;
        height: 5px;
        background-color: #ffffff;
        border-radius: 50%;
        margin-left: 6px;
        animation: pulse 1.5s infinite;
        vertical-align: middle;
    }
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.3; }
        100% { opacity: 1; }
    }
    .transcript-line-final {
        color: rgba(255, 255, 255, 1.0);
        border-left: 2px solid rgba(46, 204, 113, 0.7);
        padding-left: 4px;
    }
    .transcript-content {
        white-space: normal;
        word-wrap: break-word;
    }
     .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: rgba(0,0,0,0.7);
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        z-index: 1000;
        font-size: 10px;
        opacity: 1;
        transition: opacity 0.3s ease-in-out;
    }
    .notification.fade-out {
        opacity: 0;
    }
    .notification strong {
        font-weight: bold;
        margin-right: 5px;
    }
`;
document.head.appendChild(style);

// DOM Elements
const transcriptContent = document.getElementById('transcriptContent');
const transcriptArea = document.getElementById('transcriptArea');
const suggestionsContent = document.getElementById('suggestionsContent');
const suggestionsArea = document.getElementById('suggestionsArea');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

const footerThumbnailContainer = document.getElementById('footerThumbnailContainer');
const footerThumbnail = document.getElementById('footerThumbnail');
const screenshotsContainer = document.getElementById('screenshotsContainer');

// Screenshots handling
const MAX_SCREENSHOTS = 3;
let screenshotImages = [];

// Get user data from localStorage
const userData = JSON.parse(localStorage.getItem('userData') || '{}');
let { jobRole, keySkills } = userData;

// Fallback test data if localStorage is empty (for debugging)
if (!jobRole || !keySkills) {
    console.log('⚠️ No user data in localStorage, using test data for debugging');
    jobRole = jobRole || 'Software Developer';
    keySkills = keySkills || 'JavaScript, Python, React, Node.js';
}

console.log('🔍 DEBUG: User data loaded from localStorage:');
console.log('  userData:', userData);
console.log('  jobRole:', jobRole);
console.log('  keySkills:', keySkills);

// Initialize status
let isRecording = false;
let isMuted = false;
let isResettingSTT = false; 

let currentTranscriptLineElement = null;
let lastProcessedText = "";
let lastTimestamp = Date.now();
let transcriptBuffer = ""; // Accumulates all final text for current paragraph
let currentInterimText = ""; // Stores current interim (in-progress) text
let pauseTimer = null; // Timer to detect 5-second pauses
const PAUSE_THRESHOLD = 5000; // 5 seconds in milliseconds

// AI suggestion tracking
let currentSuggestionElement = null; // Current suggestion being updated
let isNewParagraph = true; // Flag to indicate if we should create a new suggestion
let lastAICallText = ""; // Track last text sent to AI to avoid duplicate calls
let vadSilenceTimer = null; // Timer to track VAD silence for AI calls
const VAD_SILENCE_THRESHOLD = 1000; // 1 second in milliseconds

// Legacy variable - now using activeStreamingSuggestionElement and currentStreamingResponseText

// Overlay is always in click-through mode - scrollbar area remains interactive

// --- Helper Functions ---
function determineSpeaker(text) {
    if (!text) return 'Speaker';
    const lowerText = text.toLowerCase();
    if (lowerText.includes('interviewer:') || lowerText.includes('question:')) return 'Interviewer';
    if (lowerText.includes('candidate:') || lowerText.includes('answer:')) return 'Candidate';
    return 'Speaker'; // Default if no specific keyword
}

// --- Core Functions ---
function updateVideoThumbnail(base64ImageData) {
    if (footerThumbnail) {
        footerThumbnail.src = `data:image/jpeg;base64,${base64ImageData}`;
    }
}

function updateStatus(status, color) {
    if (statusText) {
        statusText.textContent = status + ' (Click-Through)';
    }
    if (statusDot) statusDot.className = `status-dot-corner bg-${color}`;
}

function displayTranscriptSegment(data) {
    const segmentText = typeof data === 'string' ? data : data.text;
    const isFinal = typeof data === 'object' && data.is_final === true;
    
    const currentTime = Date.now();

    // Record timing for final STT segments
    if (isFinal && segmentText && segmentText.trim().length > 10) {
        timingData.stt_received = currentTime;
        console.log(`[TIMING] STT received at: ${new Date(timingData.stt_received).toISOString()}`);
    }

    const cleanSegment = segmentText ? segmentText.replace(/^(interviewer:|candidate:|question:|answer:)\s*/i, '').trim() : "";

    if (!cleanSegment && isFinal) { // Handle empty final segments (e.g. end of utterance)
        // Clear any existing pause timer
        if (pauseTimer) {
            clearTimeout(pauseTimer);
            pauseTimer = null;
        }
        
        // Set timer to finalize current line after 5 seconds of silence
        if (currentTranscriptLineElement && transcriptBuffer) {
            pauseTimer = setTimeout(() => {
            finalizeCurrentLine();
                pauseTimer = null;
            }, PAUSE_THRESHOLD);
        }
        return;
    }
    if (!cleanSegment && !isFinal) { // Ignore empty interim results
        return;
    }

    // Clear any existing pause timer since we received new content
    if (pauseTimer) {
        clearTimeout(pauseTimer);
        pauseTimer = null;
    }

    // Check if we need to create a new line (first transcription or after a pause)
    if (!currentTranscriptLineElement) {
        createNewLine();
    }
    
    // Handle interim vs final results differently
    if (!isFinal) {
        // For interim results: replace the current in-progress text
        currentInterimText = cleanSegment;
        if (currentTranscriptLineElement) {
            // Display accumulated final text + current interim text
            const displayText = transcriptBuffer + (transcriptBuffer.length > 0 && currentInterimText.length > 0 ? ' ' : '') + currentInterimText;
            currentTranscriptLineElement.textContent = displayText;
            currentTranscriptLineElement.className = 'transcript-line transcript-line-interim';
        }
    } else {
        // For final results: accumulate into the paragraph buffer
        transcriptBuffer += (transcriptBuffer.length > 0 ? ' ' : '') + cleanSegment;
        currentInterimText = ""; // Clear interim text since it's now final
    
    if (currentTranscriptLineElement) {
        currentTranscriptLineElement.textContent = transcriptBuffer;
            currentTranscriptLineElement.className = 'transcript-line transcript-line-final';
        }
        
        // Smart AI calling: Only call AI when we have meaningful sentence completion
        checkAndCallAI();
        
        // Set timer to finalize and create new line after 5 seconds of no new input
        pauseTimer = setTimeout(() => {
        finalizeCurrentLine();
            pauseTimer = null;
        }, PAUSE_THRESHOLD);
    }

    // Update timestamp
    lastTimestamp = currentTime;

    if (transcriptArea) {
         setTimeout(() => { // Ensure DOM update before scrolling
            transcriptArea.scrollTop = transcriptArea.scrollHeight;
        }, 0);
    }
}

function createNewLine() {
    currentTranscriptLineElement = document.createElement('div');
    currentTranscriptLineElement.className = 'transcript-line transcript-line-interim'; 
    
    if (transcriptContent) {
        transcriptContent.appendChild(currentTranscriptLineElement);
    }
    transcriptBuffer = "";
    currentInterimText = "";
}

function finalizeCurrentLine() {
    if (!currentTranscriptLineElement) return;
    
    // If the buffer is empty but we were asked to finalize, it means the previous line was final.
    // So we don't create an empty line.
    if (!transcriptBuffer.trim()) {
        if (currentTranscriptLineElement.parentNode === transcriptContent) {
             transcriptContent.removeChild(currentTranscriptLineElement);
        }
        currentTranscriptLineElement = null;
        return;
    }

    currentTranscriptLineElement.classList.remove('transcript-line-interim');
    currentTranscriptLineElement.classList.add('transcript-line-final');
    currentTranscriptLineElement.textContent = transcriptBuffer; // Ensure final text is set
    
    // Mark that the next AI suggestion should be a new one (new paragraph)
    isNewParagraph = true;
    currentSuggestionElement = null;
    
    currentTranscriptLineElement = null; // Ready for a new line
    transcriptBuffer = "";
    currentInterimText = "";
}

function checkAndCallAI() {
    const currentText = transcriptBuffer.trim();
    
    // PRIMARY CONDITION 1: Minimum text length (10+ characters)
    if (!currentText || currentText.length < 10) {
        console.log(`❌ Skipping AI call - insufficient length (${currentText.length} < 10 chars)`);
        return;
    }
    
    // PRIMARY CONDITION 3: Similarity check (Content must be <85% similar to last AI call)
    if (currentText === lastAICallText) {
        console.log('🤖 Skipping AI call - identical text as last call');
        return;
    }
    
    // PRIMARY CONDITION 2: Natural sentence breaks (when text ends with ., !, ?)
    const hasNaturalBreak = /[.!?](?:\s|$)/.test(currentText);
    
    // Check if this is significantly different content
    const contentSimilarity = calculateContentSimilarity(currentText, lastAICallText);
    const isUnderSimilarityThreshold = contentSimilarity < 0.85; // Less than 85% similar
    
    console.log(`📊 Overlay AI Call Conditions Check:`);
    console.log(`   Text length: ${currentText.length} (min 10: ${currentText.length >= 10})`);
    console.log(`   Natural break: ${hasNaturalBreak}`);
    console.log(`   Similarity: ${(contentSimilarity * 100).toFixed(1)}% (threshold: <85%: ${isUnderSimilarityThreshold})`);
    
    // Detect complete questions even without punctuation (fallback condition)
    const looksLikeCompleteQuestion = /\b(write|create|make|build|show|generate|give|tell|explain|how|what|when|where|why|code|program|function|algorithm|script)\b.*\b(code|function|program|script|algorithm|fibonacci|fibunachi|sequence|series|sort|search|loop|array|list|string|number|calculate|find|get|return)\b/i.test(currentText);
    
    // Check if we should call AI based on new primary conditions
    const shouldCallAI = hasNaturalBreak && isUnderSimilarityThreshold;
    const shouldCallAIFallback = looksLikeCompleteQuestion && isUnderSimilarityThreshold;
    
    if (shouldCallAI) {
        console.log('✅ Primary conditions met - natural break with unique content');
        lastAICallText = currentText;
        console.log('🤖 Note: Smart AI calling now handled automatically by recording service');
    } else if (shouldCallAIFallback) {
        console.log('✅ Fallback condition met - complete question detected with unique content');
        lastAICallText = currentText;
        console.log('🤖 Note: Smart AI calling now handled automatically by recording service');
    } else {
        console.log(`❌ Conditions not met - ${!hasNaturalBreak ? 'no natural break' : ''} ${!isUnderSimilarityThreshold ? 'content too similar' : ''}`);
    }
}

function calculateContentSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    
    // Normalize texts for comparison
    const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const norm1 = normalize(text1);
    const norm2 = normalize(text2);
    
    if (norm1 === norm2) return 1.0;
    
    // Simple word-based similarity
    const words1 = norm1.split(/\s+/);
    const words2 = norm2.split(/\s+/);
    const allWords = new Set([...words1, ...words2]);
    
    let commonWords = 0;
    allWords.forEach(word => {
        if (words1.includes(word) && words2.includes(word)) {
            commonWords++;
        }
    });
    
    return (commonWords * 2) / (words1.length + words2.length);
}

// --- Streaming Suggestion Helper Functions ---

// Create a new suggestion element without appending to DOM yet
function createNewSuggestionElement(title, content) {
    const suggestionElement = document.createElement('div');
    suggestionElement.className = 'suggestion-item';
    
    // Add response ID as data attribute
    if (currentResponseId) {
        suggestionElement.dataset.responseId = currentResponseId;
    }
    
    const titleElement = document.createElement('div');
    titleElement.className = 'suggestion-title';
    titleElement.textContent = title;
    
    const contentElement = document.createElement('div');
    contentElement.className = 'suggestion-content';
    contentElement.textContent = content;
    
    suggestionElement.appendChild(titleElement);
    suggestionElement.appendChild(contentElement);
    
    return suggestionElement;
}

// Update suggestion content with full markdown text
function updateSuggestionContent(suggestionElement, markdownContent) {
    console.log('🔄 DEBUG: updateSuggestionContent called');
    console.log('  Content length:', markdownContent ? markdownContent.length : 'null');

    const contentDiv = suggestionElement.querySelector('.suggestion-content');
    if (!contentDiv) {
        console.error('❌ Content div not found in suggestion element');
        return;
    }

    // Use existing setContentHTML function to parse and highlight
    setContentHTML(contentDiv, markdownContent);

    // Auto-scroll to bottom if user hasn't scrolled up
    const suggestionsArea = document.getElementById('suggestionsArea');
    if (suggestionsArea) {
        // Check if user is near the bottom (within 50px)
        const isNearBottom = suggestionsArea.scrollTop + suggestionsArea.clientHeight >= suggestionsArea.scrollHeight - 50;
        
        if (isNearBottom) {
            setTimeout(() => {
                suggestionsArea.scrollTop = suggestionsArea.scrollHeight;
            }, 0);
        }
    }
}

function addOrUpdateSuggestion(title, content) {
    // Record timing for when answer is rendered
    timingData.answer_rendered = Date.now();
    console.log(`[TIMING] Answer rendered at: ${new Date(timingData.answer_rendered).toISOString()}`);
    
    // Log all timing data
    logTimingData();

    // Debug logging
    console.log('🎯 DEBUG: addOrUpdateSuggestion called with:');
    console.log('  Title:', title);
    console.log('  Content length:', content ? content.length : 'null');
    console.log('  Content preview:', content ? content.substring(0, 200) + '...' : 'null');
    console.log('  isNewParagraph:', isNewParagraph);
    console.log('  currentSuggestionElement exists:', !!currentSuggestionElement);

    // Check if we should update existing suggestion or create new one
    if (!isNewParagraph && currentSuggestionElement) {
        // Update existing suggestion
        console.log('🔄 Updating existing AI suggestion');
        updateExistingSuggestion(currentSuggestionElement, title, content);
    } else {
        // Create new suggestion
        console.log('✨ Creating new AI suggestion');
        createNewSuggestion(title, content);
        isNewParagraph = false; // Reset flag after creating new suggestion
    }
}

function createNewSuggestion(title, content) {
    console.log('🏗️ DEBUG: createNewSuggestion called');
    console.log('  Title:', title);
    console.log('  Content preview:', content ? content.substring(0, 100) + '...' : 'null');

    const container = document.createElement('div');
    container.className = 'suggestion-container';

    // Only add title element if title is not empty
    if (title && title.trim() !== '') {
        const titleElem = document.createElement('div');
        titleElem.className = 'suggestion-title';
        titleElem.textContent = title;
        container.appendChild(titleElem);
        console.log('📝 DEBUG: Title element created:', title);
    }

    const contentElem = document.createElement('div');
    contentElem.className = 'suggestion-content';
    
    console.log('🎨 DEBUG: About to set content HTML');
    setContentHTML(contentElem, content);
    console.log('🎨 DEBUG: Content HTML set, element innerHTML length:', contentElem.innerHTML.length);
    
    container.appendChild(contentElem);

    if (suggestionsContent) {
        suggestionsContent.appendChild(container);
        currentSuggestionElement = container; // Track this as the current suggestion
        
        console.log('✅ DEBUG: Suggestion container added to DOM');
        console.log('  suggestionsContent children count:', suggestionsContent.children.length);
        console.log('  Container HTML preview:', container.innerHTML.substring(0, 200) + '...');
        
        if (suggestionsArea) {
             setTimeout(() => { // Ensure DOM update before scrolling
                suggestionsArea.scrollTop = suggestionsArea.scrollHeight;
            }, 0);
        }
    } else {
        console.error('❌ DEBUG: suggestionsContent element not found!');
    }
}

function updateExistingSuggestion(container, title, content) {
    // Update title if provided
    if (title && title.trim() !== '') {
        const titleElem = container.querySelector('.suggestion-title');
        if (titleElem) {
            titleElem.textContent = title;
        } else {
            // Create title element if it doesn't exist
            const newTitleElem = document.createElement('div');
            newTitleElem.className = 'suggestion-title';
            newTitleElem.textContent = title;
            container.insertBefore(newTitleElem, container.firstChild);
        }
    }

    // Update content
    const contentElem = container.querySelector('.suggestion-content') || container.querySelector('div:last-child');
    if (contentElem) {
        setContentHTML(contentElem, content);
    }

    if (suggestionsArea) {
         setTimeout(() => { // Ensure DOM update before scrolling
            suggestionsArea.scrollTop = suggestionsArea.scrollHeight;
        }, 0);
    }
}

function setContentHTML(contentElem, content) {
    console.log('🎨 DEBUG: setContentHTML called');
    console.log('  Content length:', content ? content.length : 'null');
    console.log('  Content type:', typeof content);
    console.log('  marked available:', typeof marked !== 'undefined');
    console.log('  marked.parse available:', typeof marked !== 'undefined' && typeof marked.parse === 'function');
    
    if (typeof marked !== 'undefined' && marked.parse) {
        try {
            const parsedContent = marked.parse(content || ""); // Ensure content is not null/undefined
            contentElem.innerHTML = parsedContent;
            console.log('🎨 Content parsed by marked with syntax highlighting');
            console.log('  Parsed content length:', parsedContent.length);
            console.log('  Parsed content preview:', parsedContent.substring(0, 300) + '...');
            
            // Post-process to ensure all code blocks have proper highlighting
            const codeBlocks = contentElem.querySelectorAll('pre code');
            console.log('  Found code blocks:', codeBlocks.length);
            
            codeBlocks.forEach((block, index) => {
                console.log(`🔍 Processing code block ${index}:`, block.textContent.substring(0, 50) + '...');
                
                // Remove any existing highlighting classes to start fresh
                block.className = block.className.replace(/\bhljs\S*/g, '').trim();
                
                // Get the language from data attribute or class
                let lang = block.getAttribute('data-language') || 
                          block.className.match(/language-(\w+)/)?.[1] || 
                          block.parentElement?.getAttribute('data-language');
                
                console.log(`  Detected language: ${lang || 'auto-detect'}`);
                
                // Apply syntax highlighting with hljs
                if (typeof hljs !== 'undefined') {
                    try {
                        let highlightResult;
                        
                        if (lang && hljs.getLanguage(lang)) {
                            // Use specified language
                            highlightResult = hljs.highlight(block.textContent, { language: lang, ignoreIllegals: true });
                            console.log(`  ✅ Highlighted with language: ${lang}`);
                        } else {
                            // Auto-detect language
                            highlightResult = hljs.highlightAuto(block.textContent, ['javascript', 'python', 'java', 'cpp', 'csharp', 'ruby', 'go', 'sql', 'html', 'css', 'json', 'typescript']);
                            lang = highlightResult.language || 'text';
                            console.log(`  🔍 Auto-detected language: ${lang} (confidence: ${highlightResult.relevance})`);
                        }
                        
                        // Apply the highlighted HTML
                        block.innerHTML = highlightResult.value;
                        
                        // Add proper classes
                        block.className = `hljs language-${lang}`;
                        block.setAttribute('data-language', lang);
                
                // Add language label to parent pre element
                const pre = block.parentElement;
                        if (pre && pre.tagName === 'PRE') {
                    pre.setAttribute('data-language', lang);
                }
                
                        console.log(`  ✅ Successfully highlighted code block ${index} with ${lang}`);
                        
                    } catch (error) {
                        console.error(`  ❌ Error highlighting code block ${index}:`, error);
                        // Fallback: just add basic classes
                        block.className = 'hljs';
                        block.setAttribute('data-language', lang || 'text');
                    }
                } else {
                    console.warn(`  ⚠️ hljs not available for code block ${index}`);
                    block.className = 'hljs';
                    block.setAttribute('data-language', lang || 'text');
                }
            });
            
        } catch (e) {
            console.error("❌ Error parsing markdown for suggestion:", e);
            console.error("❌ Content that failed:", content);
            contentElem.textContent = content || ""; // Fallback to plain text
        }
    } else {
        console.warn('⚠️ marked or marked.parse was undefined, using plain text');
        contentElem.textContent = content || ""; // Fallback to plain text
    }
    
    console.log('🎨 DEBUG: Final contentElem.innerHTML length:', contentElem.innerHTML.length);
}

// Backward compatibility function
function addSuggestion(title, content) {
    addOrUpdateSuggestion(title, content);
}

// Function specifically for screenshot solutions - always creates new suggestion
function addScreenshotSolution(title, content) {
    console.log('📸 Creating new screenshot solution suggestion');
    
    // Always create a new suggestion for screenshots, regardless of isNewParagraph state
    const container = document.createElement('div');
    container.className = 'suggestion-container';

    // Only add title element if title is not empty
    if (title && title.trim() !== '') {
        const titleElem = document.createElement('div');
        titleElem.className = 'suggestion-title';
        titleElem.textContent = title;
        container.appendChild(titleElem);
        console.log('📝 Screenshot solution title created:', title);
    }

    const contentElem = document.createElement('div');
    contentElem.className = 'suggestion-content';
    
    console.log('🎨 Setting screenshot solution content HTML');
    setContentHTML(contentElem, content);
    
    container.appendChild(contentElem);

    if (suggestionsContent) {
        suggestionsContent.appendChild(container);
        
        console.log('✅ Screenshot solution added to DOM');
        console.log('  suggestionsContent children count:', suggestionsContent.children.length);
        
        if (suggestionsArea) {
             setTimeout(() => { // Ensure DOM update before scrolling
                suggestionsArea.scrollTop = suggestionsArea.scrollHeight;
            }, 0);
        }
        
        // Return the container for potential streaming updates
        return container;
    } else {
        console.error('❌ suggestionsContent element not found for screenshot solution!');
        return null;
    }
}

// Add these variables at the top of the file with other global variables
let currentResponseId = null;
let currentResponseElement = null;

// Update clearTranscriptAndSuggestions function to reset response tracking
function clearTranscriptAndSuggestions() {
    // Clear all existing transcript content
    if (transcriptContent) {
        transcriptContent.innerHTML = '';
    }
    transcriptBuffer = "";
    currentInterimText = "";
    currentTranscriptLineElement = null;
    
    // Clear all suggestions
    if (suggestionsContent) {
        suggestionsContent.innerHTML = '';
    }
    
    // Clear screenshots
    if (screenshotsContainer) {
        screenshotsContainer.innerHTML = '';
        screenshotImages = [];
    }
    
    // Reset streaming state
    activeStreamingSuggestionElement = null;
    currentStreamingResponseText = "";
    activeStreamingScreenshotElement = null;
    currentStreamingScreenshotText = "";
    
    // Reset response tracking
    currentResponseId = null;
    currentResponseElement = null;
    
    // Reset cached suggestion content
    lastAICallText = "";
    isNewParagraph = true;
    currentSuggestionElement = null;
    
    // Clear any existing pause timer
    if (pauseTimer) {
        clearTimeout(pauseTimer);
        pauseTimer = null;
    }
    
    // Clear VAD silence timer
    if (vadSilenceTimer) {
        clearTimeout(vadSilenceTimer);
        vadSilenceTimer = null;
    }
    
    // Update display status
    updateStatus('Cleared', 'green-500');
    setTimeout(() => {
        updateStatus('Ready', 'green-500');
    }, 1500);
}

function toggleMute() {
    isMuted = !isMuted;
    updateStatus(isMuted ? 'Muted' : (isRecording ? 'Recording' : 'Standby'), isMuted ? 'red-500' : (isRecording ? 'green-500' : 'yellow-500'));
    const muteListenHint = document.getElementById('muteListenHint');
    if (muteListenHint) muteListenHint.innerHTML = `${isMuted ? 'Unmute' : 'Mute'}:<kbd>⌘</kbd><kbd>L</kbd>`;
}

// Scrollbar drag handling for click-through mode
function setupScrollbarDragHandling(element) {
    let isDragging = false;
    let scrollbarArea = null;
    
    // Detect if mouse is over scrollbar area
    function isMouseOverScrollbar(e) {
        const rect = element.getBoundingClientRect();
        const scrollbarWidth = 14; // Match our CSS scrollbar width
        return e.clientX >= rect.right - scrollbarWidth && e.clientX <= rect.right;
    }
    
    element.addEventListener('mouseenter', (e) => {
        if (isMouseOverScrollbar(e)) {
            // Disable click-through when hovering over scrollbar
            if (ipcRenderer) {
                ipcRenderer.send('set-mouse-events', false);
            }
            console.log('🖱️ Mouse entered scrollbar area - click-through disabled');
        }
    });
    
    element.addEventListener('mousemove', (e) => {
        const overScrollbar = isMouseOverScrollbar(e);
        
        if (overScrollbar && !scrollbarArea) {
            // Entering scrollbar area
            scrollbarArea = true;
            if (ipcRenderer) {
                ipcRenderer.send('set-mouse-events', false);
            }
            element.style.cursor = 'default';
        } else if (!overScrollbar && scrollbarArea && !isDragging) {
            // Leaving scrollbar area (and not dragging)
            scrollbarArea = false;
            if (ipcRenderer) {
                ipcRenderer.send('set-mouse-events', true);
            }
            element.style.cursor = '';
        }
    });
    
    element.addEventListener('mousedown', (e) => {
        if (isMouseOverScrollbar(e)) {
            isDragging = true;
            if (ipcRenderer) {
                ipcRenderer.send('set-mouse-events', false);
            }
            console.log('🖱️ Scrollbar drag started');
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            scrollbarArea = false;
            if (ipcRenderer) {
                ipcRenderer.send('set-mouse-events', true);
            }
            console.log('🖱️ Scrollbar drag ended - click-through re-enabled');
        }
    });
    
    element.addEventListener('mouseleave', () => {
        if (!isDragging) {
            scrollbarArea = false;
            if (ipcRenderer) {
                ipcRenderer.send('set-mouse-events', true);
            }
        }
    });
}

// Setup protection toggle to be clickable in click-through mode
function setupProtectionToggle() {
    const toggleContainer = document.querySelector('.screen-protection-toggle');
    if (!toggleContainer) return;
    
    // Make toggle area interactive
    toggleContainer.addEventListener('mouseenter', () => {
        if (ipcRenderer) {
            ipcRenderer.send('set-mouse-events', false);
        }
        console.log('🖱️ Mouse entered toggle area - click-through disabled');
    });
    
    toggleContainer.addEventListener('mouseleave', () => {
        if (ipcRenderer) {
            ipcRenderer.send('set-mouse-events', true);
        }
        console.log('🖱️ Mouse left toggle area - click-through enabled');
    });
    
    // Make sure the toggle switch works
    const toggle = document.getElementById('screenProtectionToggle');
    if (toggle) {
        toggle.addEventListener('click', (e) => {
            // Ensure the event doesn't propagate
            e.stopPropagation();
            console.log('🖱️ Toggle clicked - state:', toggle.checked);
        });
    }
}

async function takeScreenshot() {
    if (screenshotImages.length >= MAX_SCREENSHOTS) {
        showNotification("Screenshot Limit", `Maximum of ${MAX_SCREENSHOTS} screenshots reached.`);
        return;
    }
    try {
        // Request screenshot without spawning additional processes
        const result = await ipcRenderer.invoke('take-screenshot');

        if (result.error) {
            showNotification("Screenshot Error", result.error);
        } else if (result.dataUrl && result.dataUrl.length > 100) {
            addScreenshotToContainer(result.dataUrl);
            showNotification("Screenshot Captured", "Screenshot added.");
            
            // Clear any lingering memory to avoid detection
            if (window.gc) {
                try {
                    window.gc(); // Request garbage collection if available
                } catch (e) {
                    // Ignore errors with GC
                }
            }
        } else {
            showNotification("Screenshot Error", "Failed to capture valid screenshot.");
        }
    } catch (e) {
        showNotification("Screenshot Error", `Failed to request screenshot: ${e.message}`);
    }
}

function addScreenshotToContainer(dataUrl) {
    if (!dataUrl || dataUrl.length < 100) { 
        console.warn('addScreenshotToContainer: Attempted to add invalid dataUrl. Length:', dataUrl ? dataUrl.length : 'null');
        return; 
    }

    if (screenshotImages.length >= MAX_SCREENSHOTS) {
        if (screenshotsContainer.firstChild) {
            screenshotsContainer.removeChild(screenshotsContainer.firstChild);
            screenshotImages.shift();
        }
    }
    const screenshot = document.createElement('img');
    screenshot.className = 'screenshot-thumbnail';
    screenshot.src = dataUrl;
    screenshot.alt = `Screenshot ${screenshotImages.length + 1}`;
    screenshot.addEventListener('click', () => {
        const fullImage = window.open(); // Open a blank window
        if (fullImage) { // Check if window was successfully opened (not blocked by pop-up blocker)
            fullImage.document.write(`<html><head><title>Screenshot</title><style>body { margin: 0; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; } img { max-width: 100%; max-height: 100%; object-fit: contain; }</style></head><body></body></html>`); // Write basic HTML structure
            fullImage.document.close(); // Important: close the document stream
            const img = fullImage.document.createElement('img');
            img.src = dataUrl;
            img.alt = 'Screenshot';
            // Styles are in the <style> block, but can be set here for assurance if needed
            // img.style.maxWidth = '100%';
            // img.style.maxHeight = '100%';
            // img.style.objectFit = 'contain'; 
            if (fullImage.document.body) {
                 fullImage.document.body.appendChild(img);
            } else {
                 console.error("New window body not found for screenshot");
                 // Optionally show a notification to the user from here if you have that utility
            }
        } else {
            console.error("Failed to open new window for screenshot, possibly blocked.");
            // Assuming showNotification is available in this scope, if not, adapt or remove
            if(typeof showNotification === 'function') {
                showNotification("Popup Blocked", "Could not open screenshot in new window.");
            }
        }
    });
    screenshotsContainer.appendChild(screenshot);
    screenshotImages.push(dataUrl);
}

function clearScreenshots() {
    if (screenshotsContainer) {
        screenshotsContainer.innerHTML = '';
    }
    screenshotImages = [];
    console.log('📸 Screenshots cleared - ready for new captures');
}

function moveWindow(direction) {
    if (ipcRenderer) ipcRenderer.send('move-window', direction);
}

function saveTranscript() {
    // This function is not directly used by a button in overlay-screen.html, but kept for potential future use.
    if (!transcriptContent || !ipcRenderer) return;
    const lines = Array.from(transcriptContent.querySelectorAll('.transcript-line')).map(line => line.textContent).join('\n');
    const date = new Date().toISOString().split('T')[0];
    const filename = `transcript_overlay_${date}.txt`;
    ipcRenderer.send('save-transcript', { content: lines, filename }); // You'd need a 'save-transcript' handler in main.js
    showNotification("Transcript Saved", `Saved as ${filename}`);
}

function showNotification(title, message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Test function to add content for scrollbar testing
function addTestContent() {
    for (let i = 1; i <= 20; i++) {
        addSuggestion(`Test Suggestion ${i}`, `This is test content ${i} to verify that the scrollbar is working properly. It should be long enough to create scrollable content in the AI suggestions area.\n\n\`\`\`javascript\n// Test code block ${i}\nfunction testFunction${i}() {\n    console.log('Testing scrollbar functionality ${i}');\n    return true;\n}\n\`\`\`\n\nThis content should help test the scrollbar interaction.`);
    }
    console.log('📝 Test content added for scrollbar testing');
}

// Test function specifically for syntax highlighting
function addSyntaxHighlightTest() {
    const testCode = `# Python Example
\`\`\`python
# This is a Python function to calculate fibonacci sequence
def fibonacci(n):
    """Calculate the nth Fibonacci number."""
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

# Main execution
if __name__ == "__main__":
    result = fibonacci(10)
    print(f"Fibonacci(10) = {result}")
\`\`\`

# JavaScript Example
\`\`\`javascript
// This is a JavaScript function for binary search
function binarySearch(arr, target) {
    let left = 0;
    let right = arr.length - 1;
    
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        
        if (arr[mid] === target) {
            return mid;
        } else if (arr[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    
    return -1; // Target not found
}

// Usage example
const sortedArray = [1, 3, 5, 7, 9, 11, 13, 15];
const index = binarySearch(sortedArray, 7);
console.log(\`Found at index: \${index}\`);
\`\`\`

# Java Example
\`\`\`java
// Java class for a simple calculator
public class Calculator {
    private double result;
    
    public Calculator() {
        this.result = 0.0;
    }
    
    public double add(double a, double b) {
        result = a + b;
        return result;
    }
    
    public double multiply(double a, double b) {
        result = a * b;
        return result;
    }
    
    public static void main(String[] args) {
        Calculator calc = new Calculator();
        System.out.println("Addition: " + calc.add(10, 5));
        System.out.println("Multiplication: " + calc.multiply(10, 5));
    }
}
\`\`\``;
    
    addSuggestion('Syntax Highlighting Test', testCode);
    console.log('🎨 Syntax highlighting test content added');
}

// --- Event Listeners & IPC ---
document.addEventListener('keydown', (event) => {
    if (!ipcRenderer) return;
    if (event.metaKey || event.ctrlKey) {
        switch(event.key.toLowerCase()) {
            case 'b': ipcRenderer.send('toggle-window'); break;
            case 'q': ipcRenderer.send('quit-app'); break;
            case 'k': 
                // Show immediate feedback to user
                updateStatus('Clearing...', 'yellow-500');
                showNotification("Clearing", "Clearing transcript and suggestions...");
                clearTranscriptAndSuggestions();
                break;
            case 'l': toggleMute(); break;
            case 'h': takeScreenshot(); break;

            case 'enter': 
                // Cmd/Ctrl + Enter triggers screenshot solution
                if (screenshotImages.length > 0) {
                    const screenshotCount = screenshotImages.length;
                    ipcRenderer.send('generate-screenshot-solution', { screenshots: screenshotImages, jobRole, keySkills });
                    showNotification("AI Processing", `Analyzing ${screenshotCount} screenshot(s)... Screenshots cleared for fresh captures.`);
                    // Clear screenshots after sending for processing
                    clearScreenshots();
                } else {
                    showNotification("No Screenshots", "Please take a screenshot (Cmd+H) first.");
                }
                break;
                
            // Arrow keys for window movement
            case 'arrowup': moveWindow('up'); break;
            case 'arrowdown': moveWindow('down'); break;
            case 'arrowleft': moveWindow('left'); break;
            case 'arrowright': moveWindow('right'); break;
        }
    }
});

ipcRenderer.on('transcription-update', (event, data) => {
    if (isResettingSTT) {
        console.log("STT is resetting, discarding transcript fragment.");
        return; 
    }
    if (!isMuted) {
        displayTranscriptSegment(data);
    }
});

ipcRenderer.on('suggestion-update', (event, data) => {
    // Record timing for when suggestion is displayed
    const suggestionDisplayTime = Date.now();
    
    console.log('🎯 DEBUG: suggestion-update event received in overlay renderer!');
    console.log('  Data:', JSON.stringify(data, null, 2));
    
    if (data.isStreaming) {
        if (data.isFirstChunk) {
            // Record timing for first chunk display
            console.log(`[TIMING] 🎨 FIRST CHUNK RENDERED ON SCREEN at: ${new Date(suggestionDisplayTime).toISOString()}`);
            console.log(`[TIMING] 🎨 First chunk content length: ${data.content ? data.content.length : 0} chars`);
            console.log(`[TIMING] 🎨 First chunk content: "${data.content ? data.content.substring(0, 50) : ''}${data.content && data.content.length > 50 ? '...' : ''}"`);
            
            // Start of a new streaming response
            console.log('🚀 Starting new AI suggestion stream');
            
            // If we have a responseId, handle response accumulation
            if (data.responseId) {
                // If this is a new response for the same paragraph, update existing element
                if (currentResponseId === data.responseId && currentResponseElement) {
                    console.log('📝 Continuing to update existing response element');
                    // Reset the content but keep the same element
                    currentStreamingResponseText = data.content || '';
                    activeStreamingSuggestionElement = currentResponseElement;
                } else {
                    // This is a new paragraph or first response
                    console.log('📝 Creating new response element with ID:', data.responseId);
                    currentResponseId = data.responseId;
                    currentStreamingResponseText = data.content || '';
                    
                    // Create new suggestion element (not yet appended to DOM)
                    activeStreamingSuggestionElement = createNewSuggestionElement(data.title || '', currentStreamingResponseText);
                    currentResponseElement = activeStreamingSuggestionElement;
                    
                    // Append to DOM
                    if (suggestionsContent) {
                        suggestionsContent.appendChild(activeStreamingSuggestionElement);
                        console.log('✅ New streaming suggestion element appended to DOM');
                    }
                }
            }
            
            // Render initial content
            updateSuggestionContent(activeStreamingSuggestionElement, currentStreamingResponseText);
            return;
        }
        
        if (data.content && activeStreamingSuggestionElement) {
            // Subsequent chunks of the same stream - append to accumulated text
            console.log('📝 Appending chunk to existing AI suggestion stream');
            currentStreamingResponseText += data.content;
            
            // Re-render the entire accumulated content
            updateSuggestionContent(activeStreamingSuggestionElement, currentStreamingResponseText);
        }
        
        if (data.isComplete) {
            // Stream is complete - final cleanup
            console.log('✅ AI suggestion stream completed');
            const completionTime = Date.now();
            console.log(`[TIMING] 🎨 FINAL CHUNK RENDERED ON SCREEN at: ${new Date(completionTime).toISOString()}`);
            console.log(`[TIMING] 🎨 Final response content length: ${currentStreamingResponseText.length} chars`);
            console.log(`[TIMING] 🎨 Final response preview: "${currentStreamingResponseText.substring(0, 100)}${currentStreamingResponseText.length > 100 ? '...' : ''}"`);
            
            // Final update with complete content
            if (activeStreamingSuggestionElement && currentStreamingResponseText) {
                updateSuggestionContent(activeStreamingSuggestionElement, currentStreamingResponseText);
            }
            
            // Only clear streaming state if we're not tracking by responseId
            // or if this completion matches our current response
            if (!data.responseId || data.responseId === currentResponseId) {
                activeStreamingSuggestionElement = null;
                currentStreamingResponseText = "";
            }
        }
    } else {
        // Handle non-streaming updates using the original logic
        console.log(`[TIMING] 🎨 Non-streaming suggestion rendered: ${data.content ? data.content.length : 0} chars`);
        addOrUpdateSuggestion(data.title || 'AI Suggestion', data.content);
    }
});

ipcRenderer.on('video-frame', (event, base64ImageData) => {
    updateVideoThumbnail(base64ImageData);
});

ipcRenderer.on('show-notification', (event, { title, message }) => {
    showNotification(title, message);
});

// Handle solution from main process (for generateSolution)
ipcRenderer.on('solution-generated', (event, data) => {
    console.log('🎯 DEBUG: solution-generated event received in overlay renderer!');
    console.log('  Data:', JSON.stringify(data, null, 2));
    
    if (data.isStreaming) {
        if (data.isFirstChunk) {
            // Start of a new streaming response for screenshot solution
            console.log('🚀 Starting new screenshot solution stream');
            currentStreamingScreenshotText = data.content || '';
            
            // Create new screenshot solution element (not yet appended to DOM)
            activeStreamingScreenshotElement = createNewSuggestionElement(data.title || 'Screenshot Solution', currentStreamingScreenshotText);
            
            // Append to DOM
            if (suggestionsContent) {
                suggestionsContent.appendChild(activeStreamingScreenshotElement);
                console.log('✅ New streaming screenshot solution element appended to DOM');
            }
            
            // Render initial content
            updateSuggestionContent(activeStreamingScreenshotElement, currentStreamingScreenshotText);
            return;
        }
        
        if (data.content && activeStreamingScreenshotElement) {
            // Subsequent chunks of the same stream - append to accumulated text
            console.log('📝 Appending chunk to existing screenshot solution stream');
            currentStreamingScreenshotText += data.content;
            
            // Re-render the entire accumulated content
            updateSuggestionContent(activeStreamingScreenshotElement, currentStreamingScreenshotText);
        }
        
        if (data.isComplete) {
            // Stream is complete - final cleanup
            console.log('✅ Screenshot solution stream completed');
            
            // Final update with complete content
            if (activeStreamingScreenshotElement && currentStreamingScreenshotText) {
                updateSuggestionContent(activeStreamingScreenshotElement, currentStreamingScreenshotText);
            }
            
            // Clear streaming state
            activeStreamingScreenshotElement = null;
            currentStreamingScreenshotText = "";
        }
    } else {
        // Handle non-streaming screenshot solutions - always create new suggestion
        addScreenshotSolution(data.title || "Screenshot Solution", data.content);
    }
});

ipcRenderer.on('solution-error', (event, { title, content }) => {
    // Screenshot solution errors should also create new suggestions
    addScreenshotSolution(title || "Error Generating Screenshot Solution", content);
});

// Listen for timing updates from main process
ipcRenderer.on('timing-update', (event, data) => {
    console.log(`[TIMING] 📊 Timing event: ${data.event}`);
    console.log(`[TIMING] 📊 Timestamp: ${new Date(data.timestamp).toISOString()}`);
    
    switch(data.event) {
        case 'initial_stt_received':
            console.log(`[TIMING] 📝 INITIAL STT: ${data.text_length} chars - "${data.text_content}"`);
            break;
        case 'final_stt_received':
            console.log(`[TIMING] 📝 FINAL STT: ${data.text_length} chars - "${data.text_content}"`);
            break;
        case 'ai_api_call_start':
            console.log(`[TIMING] 🤖 AI API call started with ${data.text_length} chars`);
            break;
        case 'gemini_first_chunk_received':
            console.log(`[TIMING] 🚀 GEMINI first chunk: ${data.time_from_api_call}ms, ${data.chunk_length} chars`);
            break;
        case 'cerebras_first_chunk_received':
            console.log(`[TIMING] 🚀 CEREBRAS first chunk: ${data.time_from_api_call}ms, ${data.chunk_length} chars`);
            break;
        case 'ai_first_chunk_received':
            console.log(`[TIMING] 🚀 First AI chunk: ${data.time_to_first_chunk}ms, ${data.chunk_length} chars`);
            break;
        case 'ai_race_winner':
            console.log(`[TIMING] 🏆 ${data.winner} won race in ${data.race_duration}ms`);
            break;
        case 'ai_api_response_completed':
            console.log(`[TIMING] ✅ AI completed: ${data.total_duration}ms, ${data.response_length} chars`);
            break;
    }
});

// Handle global screenshot trigger from main process
ipcRenderer.on('global-screenshot-trigger', () => {
    takeScreenshot();
});

// Handle global clear trigger from main process
ipcRenderer.on('global-clear-trigger', () => {
    // Show immediate feedback to user
    updateStatus('Clearing...', 'yellow-500');
    showNotification("Clearing", "Clearing transcript, suggestions, conversation history, and resetting speech recognition...");
    clearTranscriptAndSuggestions();
    
    // Also clear the conversation history in the backend
    ipcRenderer.send('clear-conversation-history');
    
    // Reset the Google STT service for a completely fresh start
    isResettingSTT = true;
    ipcRenderer.send('reset-stt');
});

// Handle global mute trigger from main process
ipcRenderer.on('global-mute-trigger', () => {
    toggleMute();
});

// Handle global solve trigger from main process
ipcRenderer.on('global-solve-trigger', () => {
    // Cmd/Ctrl + Enter triggers screenshot solution
    if (screenshotImages.length > 0) {
        const screenshotCount = screenshotImages.length;
        ipcRenderer.send('generate-screenshot-solution', { screenshots: screenshotImages, jobRole, keySkills });
        showNotification("AI Processing", `Analyzing ${screenshotCount} screenshot(s)... Screenshots cleared for fresh captures.`);
        // Clear screenshots after sending for processing
        clearScreenshots();
    } else {
        showNotification("No Screenshots", "Please take a screenshot (Cmd+H) first.");
    }
});

// Handle VAD voice activity events for smart AI calling
ipcRenderer.on('vad-voice-activity', (event, data) => {
    if (data.type === 'voice-stopped') {
        // Start 1-second timer when voice stops
        if (vadSilenceTimer) {
            clearTimeout(vadSilenceTimer);
        }
        
        vadSilenceTimer = setTimeout(() => {
            // After 1 second of silence, check if we should call AI
            const currentText = transcriptBuffer.trim();
            
            // Only call AI if we have meaningful content and it's significantly different
            if (currentText && currentText.length > 10) {
                const contentSimilarity = calculateContentSimilarity(currentText, lastAICallText);
                const hasSignificantChange = contentSimilarity < 0.85; // Updated to match new primary condition
                
                console.log(`📊 VAD AI Call Check:`);
                console.log(`   Text length: ${currentText.length} (min 10: ${currentText.length > 10})`);
                console.log(`   Similarity: ${(contentSimilarity * 100).toFixed(1)}% (threshold: <85%: ${hasSignificantChange})`);
                
                if (hasSignificantChange) {
                    console.log('🤖 Calling AI after 1-second VAD silence - significant new content');
                    callAIWithParagraph(currentText);
                } else {
                    console.log(`🤖 Skipping VAD silence AI call - content too similar (${(contentSimilarity * 100).toFixed(1)}% >= 85%)`);
                }
            } else {
                console.log(`❌ VAD silence - insufficient length (${currentText.length} <= 10 chars)`);
            }
            vadSilenceTimer = null;
        }, VAD_SILENCE_THRESHOLD);
        
    } else if (data.type === 'voice-started') {
        // Clear silence timer when voice starts again
        if (vadSilenceTimer) {
            clearTimeout(vadSilenceTimer);
            vadSilenceTimer = null;
        }
    }
});

// Click-through toggle removed - always enabled

window.addEventListener('DOMContentLoaded', async () => {
    updateStatus('Standby', 'yellow-500');
    
    // Add listener for CSP violations to help diagnose issues
    document.addEventListener('securitypolicyviolation', (e) => {
        console.error('🚨 CSP Violation Detected:', {
            'Blocked URI': e.blockedURI,
            'Violated Directive': e.violatedDirective,
            'Original Policy': e.originalPolicy,
            'Disposition': e.disposition,
            'Document URI': e.documentURI,
            'Referrer': e.referrer,
            'Sample': e.sample,
            'Status Code': e.statusCode
        });
        
        // Show a notification about the CSP violation for easy debugging
        showNotification('CSP Violation', `${e.violatedDirective} - ${e.blockedURI}`);
    });
    
    if (ipcRenderer) {
        ipcRenderer.send('start-recording'); // Request main process to start recording and STT
    } else {
        updateStatus('Error: IPC unavailable', 'red-500');
    }
    
    const muteListenHint = document.getElementById('muteListenHint');
    if (muteListenHint) muteListenHint.innerHTML = `Mute:<kbd>⌘</kbd><kbd>L</kbd>`;
    
    // Ensure suggestions area allows scrolling
    const suggestionsArea = document.getElementById('suggestionsArea');
    const transcriptArea = document.getElementById('transcriptArea');
    
    if (suggestionsArea) {
        // Add scroll event listener to verify scrolling works
        suggestionsArea.addEventListener('scroll', (e) => {
            console.log('🖱️ Suggestions area scrolled:', e.target.scrollTop);
        });
        
        // Force enable pointer events for scrollbar area
        suggestionsArea.style.pointerEvents = 'auto';
        console.log('✅ Suggestions area scroll enabled');
        
        // Add mouse event handlers for scrollbar dragging
        setupScrollbarDragHandling(suggestionsArea);
    }
    
    if (transcriptArea) {
        transcriptArea.style.pointerEvents = 'auto';
        setupScrollbarDragHandling(transcriptArea);
        console.log('✅ Transcript area scroll enabled');
    }
    
    // Initialize screen protection toggle
    initScreenProtectionToggle();
    
    // Setup toggle to be clickable in click-through mode
    setupProtectionToggle();
    
    // Apply fixed transparency (no slider)
    applyTransparency();
    
    ipcRenderer.on("recording-status", (_, status, timestamp) => {
        if (status === "LIVE_TRANSCRIPTION_STARTED") {
            updateStatus(isMuted ? 'Muted' : 'Recording', isMuted ? 'red-500' : 'green-500');
            isRecording = true;
            
            // Check if this was a reset completion
            if (isResettingSTT) {
                isResettingSTT = false;
                showNotification("Reset Complete", "Audio transcription restarted successfully!");
                console.log("✅ STT reset completed successfully");
            }
            
            // If timestamp is provided, store it as recording start time
            if (timestamp) {
                timingData.recording_started = timestamp;
                console.log(`[TIMING] Recording started at: ${new Date(timestamp).toISOString()}`);
            }
        } else if (status === "LIVE_TRANSCRIPTION_STOPPED") {
            // Clear any existing pause timer
            if (pauseTimer) {
                clearTimeout(pauseTimer);
                pauseTimer = null;
            }
            
            // Clear VAD silence timer
            if (vadSilenceTimer) {
                clearTimeout(vadSilenceTimer);
                vadSilenceTimer = null;
            }
            
            if (currentTranscriptLineElement && transcriptBuffer) { // Finalize any pending line
                finalizeCurrentLine();
            }
            
            // Only update to standby if not in the middle of a reset
            if (!isResettingSTT) {
                updateStatus('Standby', 'yellow-500');
            }
            isRecording = false;
            
            // If timestamp is provided, store it as recording stop time
            if (timestamp) {
                timingData.recording_stopped = timestamp;
                console.log(`[TIMING] Recording stopped at: ${new Date(timestamp).toISOString()}`);
            }
        } else if (status === "LIVE_TRANSCRIPTION_FAILED_TO_START") {
            updateStatus('Error', 'red-500');
            isRecording = false;
            isResettingSTT = false;
            showNotification("Reset Failed", "Failed to restart audio transcription. Please try again.");
        }
    });
}); 

// Replace applyTransparency function with fixed values
function applyTransparency() {
    // Fixed maximum opacity (150%)
    const normalizedOpacity = 1.5;
    
    // Only apply to transcript and suggestions areas
    const transcriptArea = document.getElementById('transcriptArea');
    const suggestionsArea = document.getElementById('suggestionsArea');
    
    // Use consistent background color for both areas
    const backgroundColor = `rgba(26, 32, 44, ${Math.min(normalizedOpacity * 0.4, 0.9)})`;
    
    if (transcriptArea) transcriptArea.style.backgroundColor = backgroundColor;
    if (suggestionsArea) suggestionsArea.style.backgroundColor = backgroundColor;
    
    // Update suggestion containers to match the area background
    const suggestionContainers = document.querySelectorAll('.suggestion-container');
    suggestionContainers.forEach(container => {
        container.style.backgroundColor = 'transparent';
        container.style.borderBottomColor = `rgba(255, 255, 255, ${Math.min(normalizedOpacity * 0.1, 0.2)})`;
    });
    
    // Update transcript lines to be transparent (no background)
    const transcriptLines = document.querySelectorAll('.transcript-line-final, .transcript-line-interim');
    transcriptLines.forEach(line => {
        line.style.backgroundColor = 'transparent';
    });
}

// Handle window-hidden event to clean up resources
ipcRenderer.on('window-hidden', () => {
    console.log('📝 Renderer received window-hidden event - cleaning up resources');
    
    // Clear any timers
    if (pauseTimer) {
        clearTimeout(pauseTimer);
        pauseTimer = null;
    }
    
    if (vadSilenceTimer) {
        clearTimeout(vadSilenceTimer);
        vadSilenceTimer = null;
    }
    
    // Cancel any pending animations or resource-intensive operations
    // This helps prevent CSP violations during hide/unhide cycles
    
    // Optionally pause any ongoing streaming operations
    // currentStreamingResponseText can be preserved to resume on window show
});

// Handle window-shown event to reinitialize resources
ipcRenderer.on('window-shown', () => {
    console.log('📝 Renderer received window-shown event - reinitializing resources');
    
    // Re-apply transparency settings to ensure proper rendering
    applyTransparency();
    
    // Make sure no CSP violations occur when resuming operations
    // by using setTimeout to delay any operations that might trigger violations
    setTimeout(() => {
        // Check if we need to refresh external resources to prevent CSP issues
        const externalScripts = document.querySelectorAll('script[src^="https://"]');
        console.log(`🔍 Found ${externalScripts.length} external scripts to monitor`);
        
        // Log scripts but don't actually reload them - that would cause more issues
        // Instead, just log them for diagnostic purposes
        externalScripts.forEach(script => {
            console.log(`📄 External script: ${script.src}`);
        });
        
        console.log('🔄 Delayed resource reinitialization complete');
    }, 100);
});

ipcRenderer.on('recording-status', (event, status, timestamp) => {
    if (status === "LIVE_TRANSCRIPTION_STARTED") {
        updateStatus(isMuted ? 'Muted' : 'Recording', isMuted ? 'red-500' : 'green-500');
        isRecording = true;
        
        // Check if this was a reset completion
        if (isResettingSTT) {
            isResettingSTT = false;
            showNotification("Reset Complete", "Audio transcription restarted successfully!");
            console.log("✅ STT reset completed successfully");
        }
        
        // If timestamp is provided, store it as recording start time
        if (timestamp) {
            timingData.recording_started = timestamp;
            console.log(`[TIMING] Recording started at: ${new Date(timestamp).toISOString()}`);
        }
    } else if (status === "LIVE_TRANSCRIPTION_STOPPED") {
        // Clear any existing pause timer
        if (pauseTimer) {
            clearTimeout(pauseTimer);
            pauseTimer = null;
        }
        
        // Clear VAD silence timer
        if (vadSilenceTimer) {
            clearTimeout(vadSilenceTimer);
            vadSilenceTimer = null;
        }
        
        if (currentTranscriptLineElement && transcriptBuffer) { // Finalize any pending line
            finalizeCurrentLine();
        }
        
        // Only update to standby if not in the middle of a reset
        if (!isResettingSTT) {
            updateStatus('Standby', 'yellow-500');
        }
        isRecording = false;
        
        // If timestamp is provided, store it as recording stop time
        if (timestamp) {
            timingData.recording_stopped = timestamp;
            console.log(`[TIMING] Recording stopped at: ${new Date(timestamp).toISOString()}`);
        }
    } else if (status === "LIVE_TRANSCRIPTION_FAILED_TO_START") {
        updateStatus('Error', 'red-500');
        isRecording = false;
        isResettingSTT = false;
        showNotification("Reset Failed", "Failed to restart audio transcription. Please try again.");
    }
}); 