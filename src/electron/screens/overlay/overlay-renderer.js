/*
 * overlay-renderer.js - Overlay window UI and AI interaction management
 * 
 * FULL CONTEXT AI CALLING CONDITIONS:
 * 1. Minimum text length: 15+ characters (increased from 10)
 * 2. Natural sentence breaks: text ends with ., !, ?
 * 3. Complete questions: coding/interview related patterns
 * 4. Similarity check: Content must be <85% similar to last AI call
 * 5. VAD silence: After 3-second silence with 15+ chars, natural breaks, and <85% similarity
 * 6. Conversation history: Full context from up to 10 conversation turns
 * 
 * Note: All AI processing includes conversation context for comprehensive responses.
 * The incremental AI system has been removed in favor of complete context processing.
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
        // Set initial state to enabled (matches our default)
        toggle.checked = screenProtectionEnabled;
        
        // Ensure screen protection is actually enabled on overlay load
        if (ipcRenderer) {
            ipcRenderer.send('toggle-screen-protection', screenProtectionEnabled);
            console.log(`🔒 Screen protection initialized and ${screenProtectionEnabled ? 'enabled' : 'disabled'}`);
        }
        
        // Add event listener
        toggle.addEventListener('change', function() {
            screenProtectionEnabled = this.checked;
            // Send message to main process to toggle content protection
            if (ipcRenderer) {
                ipcRenderer.send('toggle-screen-protection', screenProtectionEnabled);
            }
            
            // Show notification
            const status = screenProtectionEnabled ? 'enabled' : 'disabled';
            showNotification('Screen Protection', `Screen protection ${status}`);
            
            console.log(`🔒 Screen protection ${status}`);
        });
    } else {
        console.warn('⚠️ Screen protection toggle element not found');
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
    
    /* Transparent code block styles with glass effect - AGGRESSIVE OVERRIDE */
    pre, pre code, .hljs, code, 
    pre[data-language], pre code[data-language], 
    .hljs-keyword, .hljs-string, .hljs-comment, .hljs-number, .hljs-function, .hljs-variable,
    .suggestion-content pre, .suggestion-content code, .suggestion-content .hljs,
    div pre, div code, span code, p code {
        background: transparent !important; /* Completely transparent */
        background-color: transparent !important; /* Completely transparent */
        border: 1px solid rgba(255, 255, 255, 0.1) !important; /* Subtle border only */
        border-radius: 6px !important;
    }
    
    /* Force remove any solid backgrounds */
    .hljs, pre, code, pre code {
        background-image: none !important;
        background-attachment: unset !important;
        background-origin: unset !important;
        background-clip: unset !important;
        background-repeat: unset !important;
        background-position: unset !important;
        background-size: unset !important;
    }
    
    /* Ensure all syntax highlighting elements are transparent */
    .hljs *, pre *, code * {
        background-color: transparent !important;
        background: transparent !important;
    }
    
    /* Ensure code text remains visible with good contrast */
    pre code, .hljs, code, .hljs * {
        color: #e2e8f0 !important; /* Light gray text */
    }
    
    /* Inline code specific styling */
    code:not(pre code), span code, p code {
        padding: 2px 4px !important;
        font-size: 0.9em !important;
        background: transparent !important; /* Completely transparent */
        background-color: transparent !important; /* Completely transparent */
        border-radius: 3px !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
    }
    
    /* Syntax highlighting colors optimized for transparency */
                    .hljs-keyword, .hljs-built_in { color: #0088ff !important; background: transparent !important; } /* Darker brightest blue */
                .hljs-string { color: #00ff88 !important; background: transparent !important; } /* Darkest brightest green */
                .hljs-comment { color: #d1d5db !important; background: transparent !important; } /* Light bright grey for better contrast */
                .hljs-number { color: #ff6600 !important; background: transparent !important; } /* Bright orange */
                .hljs-function { color: #0088ff !important; background: transparent !important; } /* Darker brightest blue */
                .hljs-variable { color: #ffffff !important; background: transparent !important; } /* Pure white */
`;
document.head.appendChild(style);

// DOM Elements
const transcriptContent = document.getElementById('transcriptContent');
const transcriptArea = document.getElementById('transcriptArea');
const suggestionsContent = document.getElementById('suggestionsContent');
const suggestionsArea = document.getElementById('suggestionsArea');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

// Screenshot processing indicator elements
const screenshotStatusIndicator = document.getElementById('screenshot-status-indicator');
const screenshotStatusDot = document.getElementById('screenshot-status-dot');
const screenshotStatusText = document.getElementById('screenshot-status-text');

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

// AI suggestion tracking - simplified for complete context mode
let lastAICallText = ""; // Track last text sent to AI to avoid duplicate calls
let vadSilenceTimer = null; // Timer to track VAD silence for AI calls
const VAD_SILENCE_THRESHOLD = 3000; // 3 seconds in milliseconds (increased for full context mode)

// Legacy variable - now using activeStreamingSuggestionElement and currentStreamingResponseText

// Overlay is always in click-through mode - scrollbar area remains interactive

// Cleanup configuration - keep only latest items to maintain performance
const MAX_TRANSCRIPT_LINES = 5;
const MAX_SUGGESTIONS = 5;

// --- Helper Functions ---
function determineSpeaker(text) {
    if (!text) return 'Speaker';
    const lowerText = text.toLowerCase();
    if (lowerText.includes('interviewer:') || lowerText.includes('question:')) return 'Interviewer';
    if (lowerText.includes('candidate:') || lowerText.includes('answer:')) return 'Candidate';
    return 'Speaker'; // Default if no specific keyword
}

// Cleanup functions to maintain limits
function cleanupOldTranscriptLines() {
    if (!transcriptContent) return;
    
    const transcriptLines = transcriptContent.querySelectorAll('.transcript-line-final');
    if (transcriptLines.length > MAX_TRANSCRIPT_LINES) {
        const linesToRemove = transcriptLines.length - MAX_TRANSCRIPT_LINES;
        for (let i = 0; i < linesToRemove; i++) {
            transcriptLines[i].remove();
        }
        console.log(`🧹 Cleaned up ${linesToRemove} old transcript lines, keeping latest ${MAX_TRANSCRIPT_LINES}`);
    }
}

// Add visual boundary between AI responses
function addResponseBoundary() {
    if (!suggestionsContent) return;
    
    console.log('🔲 Adding response boundary separator');
    
    const boundary = document.createElement('div');
    boundary.className = 'response-boundary';
    
    // Create visual separator with styling
    boundary.innerHTML = `
        <div class="boundary-line"></div>
        <div class="boundary-text">• • •</div>
        <div class="boundary-line"></div>
    `;
    
    // Add inline styles for immediate visual effect
    boundary.style.cssText = `
        display: flex;
        align-items: center;
        margin: 1rem 0;
        padding: 0.5rem 0;
        opacity: 0.6;
        pointer-events: none;
        user-select: none;
    `;
    
    const lines = boundary.querySelectorAll('.boundary-line');
    lines.forEach(line => {
        line.style.cssText = `
            flex: 1;
            height: 1px;
            background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.3), transparent);
            margin: 0 0.5rem;
        `;
    });
    
    const text = boundary.querySelector('.boundary-text');
    if (text) {
        text.style.cssText = `
            color: rgba(255, 255, 255, 0.5);
            font-size: 0.8rem;
            font-weight: 300;
            letter-spacing: 0.2rem;
            white-space: nowrap;
        `;
    }
    
    // Append boundary to suggestions
    suggestionsContent.appendChild(boundary);
    console.log('✅ Response boundary added');
    
    // Auto-scroll to show the boundary
    const suggestionsArea = document.getElementById('suggestionsArea');
    if (suggestionsArea) {
        setTimeout(() => {
            suggestionsArea.scrollTop = suggestionsArea.scrollHeight;
        }, 100);
    }
}

function cleanupOldSuggestions() {
    if (!suggestionsContent) return;
    
    // Clean up both suggestions and boundaries, but keep recent ones
    const allElements = suggestionsContent.children;
    const maxElements = MAX_SUGGESTIONS * 2; // Account for boundaries
    
    if (allElements.length > maxElements) {
        const elementsToRemove = allElements.length - maxElements;
        for (let i = 0; i < elementsToRemove; i++) {
            if (allElements[0]) {
                allElements[0].remove();
            }
        }
        console.log(`🧹 Cleaned up ${elementsToRemove} old elements (suggestions + boundaries)`);
    }
}

// Periodic cleanup to ensure limits are maintained
function performPeriodicCleanup() {
    cleanupOldTranscriptLines();
    cleanupOldSuggestions();
}

// Set up periodic cleanup every minute
setInterval(performPeriodicCleanup, 60000);

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

// Screenshot processing indicator functions
function showScreenshotProcessing(screenshotCount = 1) {
    if (screenshotStatusIndicator && screenshotStatusText) {
        screenshotStatusIndicator.style.display = 'flex';
        screenshotStatusText.textContent = `Processing ${screenshotCount} Screenshot${screenshotCount > 1 ? 's' : ''}`;
        console.log(`📸 Screenshot processing indicator shown for ${screenshotCount} screenshot(s)`);
    }
}

function hideScreenshotProcessing() {
    if (screenshotStatusIndicator) {
        screenshotStatusIndicator.style.display = 'none';
        console.log('📸 Screenshot processing indicator hidden');
    }
}

function updateScreenshotProcessingStatus(message) {
    if (screenshotStatusText) {
        screenshotStatusText.textContent = message;
        console.log(`📸 Screenshot processing status updated: ${message}`);
    }
}

function displayTranscriptSegment(data) {
    const segmentText = typeof data === 'string' ? data : data.text;
    const isFinal = typeof data === 'object' && data.is_final === true;
    
    // DEBUG: Log all incoming transcription data
    console.log(`🎙️ STT: "${segmentText}" | isFinal: ${isFinal}`);
    
    const currentTime = Date.now();

    // Record timing for final STT segments
    if (isFinal && segmentText && segmentText.trim().length > 10) {
        timingData.stt_received = currentTime;
        console.log(`[TIMING] STT received at: ${new Date(timingData.stt_received).toISOString()}`);
    }

    const cleanSegment = segmentText ? segmentText.replace(/^(interviewer:|candidate:|question:|answer:)\s*/i, '').trim() : "";

    if (!cleanSegment) {
        console.log(`🎙️ STT: Empty segment - ignoring`);
        return;
    }

    // Clear any existing pause timer since we received new content
    if (pauseTimer) {
        clearManagedTimeout(pauseTimer);
        pauseTimer = null;
    }

    // Create new line if needed
    if (!currentTranscriptLineElement) {
        console.log(`🎙️ STT: Creating new transcript line`);
        createNewLine();
    }
    
    if (isFinal) {
        // FINAL RESULT: Append to existing accumulated content
        console.log(`🎙️ STT: Processing FINAL result - "${cleanSegment}"`);
        
        // Append final text to existing buffer (no replacement)
        if (transcriptBuffer.trim()) {
            // Check if the new segment is not already contained in buffer
            if (!transcriptBuffer.includes(cleanSegment)) {
                transcriptBuffer += " " + cleanSegment;
                console.log(`📝 Appended new final segment: "${cleanSegment}"`);
            } else {
                console.log(`📝 Final segment already in buffer, skipping: "${cleanSegment}"`);
            }
        } else {
            // First final segment for this line
            transcriptBuffer = cleanSegment;
            console.log(`📝 First final segment: "${cleanSegment}"`);
        }
        
        // Clear interim text since we have final result
        currentInterimText = "";
        
        if (currentTranscriptLineElement) {
            currentTranscriptLineElement.textContent = transcriptBuffer;
            currentTranscriptLineElement.className = 'transcript-line transcript-line-final';
        }
        
        console.log(`✅ Final transcript accumulated: "${transcriptBuffer}"`);
        
        // Smart AI calling: Only call AI when we have meaningful sentence completion
        checkAndCallAI();
        
        // Set timer to finalize and create new line after 5 seconds of no new input
        pauseTimer = managedSetTimeout(() => {
            finalizeCurrentLine();
            pauseTimer = null;
        }, PAUSE_THRESHOLD);
    } else {
        // INTERIM RESULT: Show current recognition progress 
        console.log(`🎙️ STT: Processing INTERIM result - "${cleanSegment}"`);
        
        // For interim results, show the current progress alongside accumulated final text
        currentInterimText = cleanSegment;
        
        if (currentTranscriptLineElement) {
            // Combine accumulated final text with current interim text
            const displayText = transcriptBuffer ? 
                (transcriptBuffer + " " + currentInterimText) : 
                currentInterimText;
            
            currentTranscriptLineElement.textContent = displayText;
            currentTranscriptLineElement.className = 'transcript-line transcript-line-interim';
        }
    }

    // Update timestamp
    lastTimestamp = currentTime;
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
    
    // Clean up old transcript lines to maintain limit
    cleanupOldTranscriptLines();
    
    // Smart AI calling: Only call AI when we have meaningful sentence completion
    checkAndCallAI();
    
    currentTranscriptLineElement = null; // Ready for a new line
    transcriptBuffer = "";
    currentInterimText = "";
}

function checkAndCallAI() {
    const currentText = transcriptBuffer.trim();
    
    // SIMPLIFIED CONDITIONS (NO INCREMENTAL - FULL CONTEXT MODE):
    // 1. Minimum text length: 5+ characters (temporarily lowered for testing)
    // 2. Natural sentence breaks: text ends with ., !, ?
    // 3. Complete questions: coding/interview related patterns
    // 4. Similarity check: Content must be <85% similar to last AI call
    
    if (!currentText || currentText.length < 5) {
        console.log(`❌ Skipping AI call - insufficient length (${currentText.length} < 5 chars)`);
        return;
    }
    
    // REMOVED: identical content check to allow repeated questions
    // Users should be able to ask the same question multiple times
    
    // Check for natural breaks and complete questions
    const hasNaturalBreak = /[.!?](?:\s|$)/.test(currentText);
    const looksLikeCompleteQuestion = /\b(write|create|make|build|show|generate|give|tell|explain|how|what|when|where|why|code|program|function|algorithm|script)\b.*\b(code|function|program|script|algorithm|fibonacci|fibunachi|sequence|series|sort|search|loop|array|list|string|number|calculate|find|get|return)\b/i.test(currentText);
    
    console.log(`📊 Overlay AI Call Conditions Check (Full Context Mode):`);
    console.log(`   Text length: ${currentText.length} (min 5: ${currentText.length >= 5})`);
    console.log(`   Natural break: ${hasNaturalBreak}`);
    console.log(`   Complete question: ${looksLikeCompleteQuestion}`);
    
    // Trigger AI on natural breaks or complete questions (similarity check removed)
    const shouldCallAI = hasNaturalBreak;
    const shouldCallAIFallback = looksLikeCompleteQuestion;
    
    if (shouldCallAI) {
        console.log('✅ Primary conditions met - natural break detected (full context)');
        lastAICallText = currentText;
        console.log('🤖 Note: AI processing handled by recording service with full conversation context');
    } else if (shouldCallAIFallback) {
        console.log('✅ Fallback condition met - complete question detected (full context)');
        lastAICallText = currentText;
        console.log('🤖 Note: AI processing handled by recording service with full conversation context');
    } else {
        console.log(`❌ Conditions not met for full context AI call:`);
        if (!hasNaturalBreak && !looksLikeCompleteQuestion) {
            console.log(`   - No natural break or complete question pattern`);
        }
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
    console.log('🎯 DEBUGGING: createNewSuggestionElement called');
    console.log(`🎯 DEBUGGING: title="${title}", content="${content}"`);
    
    try {
    const suggestionElement = document.createElement('div');
    suggestionElement.className = 'suggestion-item';
        console.log('🎯 DEBUGGING: Main element created');
    
    // Add response ID as data attribute
    if (currentResponseId) {
        suggestionElement.dataset.responseId = currentResponseId;
            console.log('🎯 DEBUGGING: Response ID added:', currentResponseId);
    }
    
    const titleElement = document.createElement('div');
    titleElement.className = 'suggestion-title';
    titleElement.textContent = title;
        console.log('🎯 DEBUGGING: Title element created');
    
    const contentElement = document.createElement('div');
    contentElement.className = 'suggestion-content';
        console.log('🎯 DEBUGGING: Content element created, about to set content');
        
        // Use unified formatter instead of plain text
        setStreamingContentSmart(contentElement, content);
        console.log('🎯 DEBUGGING: Content set using setStreamingContentSmart');
    
    suggestionElement.appendChild(titleElement);
    suggestionElement.appendChild(contentElement);
        console.log('🎯 DEBUGGING: Elements appended, returning suggestion element');
    
    return suggestionElement;
    } catch (error) {
        console.error('❌ DEBUGGING: Error in createNewSuggestionElement:', error);
        console.error(error.stack);
        throw error;
    }
}

// Apply transparent styles to code blocks (extracted from setContentHTML)
function applyTransparentStylesToCodeBlock(block, index) {
    console.log(`🎨 Applying transparent styles to code block ${index}`);
    
    // Apply transparent styles to the code block itself with proper wrapping
    block.style.cssText = `
        background: transparent !important;
        background-color: transparent !important;
        border: 1px solid rgba(255, 255, 255, 0.15) !important;
        border-radius: 6px !important;
        color: #ffffff !important;
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        word-break: break-all !important;
        overflow-wrap: break-word !important;
        max-width: 100% !important;
        overflow-x: auto !important;
    `;
    
    // Apply transparent styles to the parent pre element with proper wrapping
    const pre = block.parentElement;
    if (pre && pre.tagName === 'PRE') {
        pre.style.cssText = `
            background: transparent !important;
            background-color: transparent !important;
            border: 1px solid rgba(255, 255, 255, 0.15) !important;
            border-radius: 6px !important;
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            max-width: 100% !important;
            overflow-x: auto !important;
        `;
    }
    
    // Force transparent background on all child elements
    const allChildren = block.querySelectorAll('*');
    allChildren.forEach(child => {
        child.style.backgroundColor = 'transparent';
        child.style.background = 'transparent';
    });
    
    console.log(`✅ Transparent styles applied to code block ${index}`);
}

// UNIFIED STREAMING FORMATTER: Single source of truth for all real-time formatting
function setStreamingContentSmart(contentElem, text) {
    console.log('🎯 DEBUGGING: setStreamingContentSmart called');
    console.log(`🎯 DEBUGGING: contentElem exists: ${!!contentElem}, text: "${text}"`);
    
    if (!contentElem || !text) {
        console.log('🎯 DEBUGGING: Missing contentElem or text, setting empty');
        if (contentElem) contentElem.textContent = '';
        return;
    }
    
    console.log('🎨 UNIFIED: Processing streaming content with real-time formatting');
    console.log(`  ⚠️ WARNING: Full re-render! Content length: ${text.length}, Has code blocks: ${text.includes('```')}`);
    console.log(`  Content preview (first 100): "${text.substring(0, 100)}"`);
    console.log(`  Content preview (last 100): "${text.length > 100 ? text.substring(text.length - 100) : 'N/A - content too short'}"`);
    
    // STEP 1: Try full markdown parsing for complete code blocks
    if (text.includes('```') && typeof marked !== 'undefined' && marked.parse) {
        try {
            const htmlContent = marked.parse(text);
            contentElem.innerHTML = htmlContent;
            
            // Apply syntax highlighting and styling to code blocks
            const codeBlocks = contentElem.querySelectorAll('pre code');
            codeBlocks.forEach((block, index) => {
                if (typeof hljs !== 'undefined') {
                    hljs.highlightElement(block);
                }
                applyTransparentStylesToCodeBlock(block, index);
            });
            
            console.log('✅ UNIFIED: Full markdown parsing with syntax highlighting applied');
            return;
        } catch (error) {
            console.warn('⚠️ UNIFIED: Markdown parsing failed, falling back to smart formatting:', error);
        }
    }
    
    // STEP 2: Smart real-time formatting for partial content
    let formattedContent = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
        .replace(/`([^`]+)`/g, '<code class="inline-code" style="background: rgba(0,0,0,0.1); padding: 2px 4px; border-radius: 3px; color: #e2e8f0;">$1</code>') // Inline code
        .replace(/\n/g, '<br>'); // Line breaks
    
    // STEP 3: Handle partial code blocks with real-time highlighting
    formattedContent = formattedContent.replace(
        /```(\w+)?\n?([\s\S]*?)```?/g, 
        (match, lang, code) => {
            if (code && code.trim().length > 3) {
                let highlightedCode = code;
                
                // Apply syntax highlighting if language specified and hljs available
                if (typeof hljs !== 'undefined' && lang) {
                    try {
                        const result = hljs.highlight(code, { language: lang, ignoreIllegals: true });
                        highlightedCode = result.value;
                    } catch (e) {
                        highlightedCode = code; // Fallback to plain code
                    }
                }
                
                return `<pre class="streaming-code" data-language="${lang || 'text'}" style="background: transparent !important; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 12px; margin: 8px 0;"><code class="hljs language-${lang || 'text'}" style="background: transparent !important; color: #e2e8f0 !important; white-space: pre-wrap; word-wrap: break-word;">${highlightedCode}</code></pre>`;
            } else {
                // Very partial code block - show as inline
                return `<code class="partial-code" style="background: rgba(0,0,0,0.2); padding: 2px 4px; border-radius: 3px; color: #e2e8f0;">${code}</code>`;
            }
        }
    );
    
    contentElem.innerHTML = formattedContent;
    console.log('✅ UNIFIED: Smart real-time formatting applied');
}

// FAST INCREMENTAL APPEND: Only append new chunk without re-rendering everything
function appendOnlyNewChunk(suggestionElement, newChunk) {
    console.log('🎯 DEBUGGING: appendOnlyNewChunk called');
    console.log(`🎯 DEBUGGING: suggestionElement exists: ${!!suggestionElement}, newChunk: "${newChunk}"`);
    
    if (!suggestionElement || !newChunk) {
        console.log('🎯 DEBUGGING: Missing suggestionElement or newChunk, returning');
        return;
    }
    
    const startTime = performance.now();
    const contentDiv = suggestionElement.querySelector('.suggestion-content');
    
    console.log('🎯 DEBUGGING: contentDiv found:', !!contentDiv);
    if (!contentDiv) {
        console.log('🎯 DEBUGGING: No contentDiv found, returning');
        return;
    }
    
    console.log('⚡ INCREMENTAL: Appending only new chunk');
    console.log(`  Chunk: "${newChunk}"`);
    
    try {
        const formatStartTime = performance.now();
        // Simplified formatting - just escape HTML and convert newlines
        let formattedChunk = newChunk
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
        
        const formatEndTime = performance.now();
        console.log(`⏱️ FORMAT TIME: ${(formatEndTime - formatStartTime).toFixed(3)}ms`);
        
        // Directly append the formatted chunk to existing innerHTML
        const domStartTime = performance.now();
        console.log(`🎯 DEBUGGING: Current contentDiv.innerHTML length: ${contentDiv.innerHTML.length}`);
        contentDiv.innerHTML += formattedChunk;
        console.log(`🎯 DEBUGGING: New contentDiv.innerHTML length: ${contentDiv.innerHTML.length}`);
        const domEndTime = performance.now();
        
        console.log(`⏱️ DOM APPEND TIME: ${(domEndTime - domStartTime).toFixed(3)}ms`);
        console.log(`⏱️ TOTAL INCREMENTAL TIME: ${(domEndTime - startTime).toFixed(3)}ms`);
        console.log('⚡ INCREMENTAL: Chunk appended directly to DOM');
    } catch (error) {
        console.error('❌ DEBUGGING: Error in appendOnlyNewChunk:', error);
        console.error(error.stack);
    }
    
    // Auto-scroll to bottom if user hasn't scrolled up
    const suggestionsArea = document.getElementById('suggestionsArea');
    if (suggestionsArea) {
        const isNearBottom = suggestionsArea.scrollTop + suggestionsArea.clientHeight >= suggestionsArea.scrollHeight - 50;
        if (isNearBottom) {
            requestAnimationFrame(() => {
                suggestionsArea.scrollTop = suggestionsArea.scrollHeight;
            });
        }
    }
}

// LEGACY: Keep for compatibility but mark as inefficient
function appendToSuggestionContentFormatted(suggestionElement, fullAccumulatedText) {
    console.warn('⚠️ LEGACY: Using slow full re-render instead of incremental append');
    if (!suggestionElement || !fullAccumulatedText) return;
    
    const contentDiv = suggestionElement.querySelector('.suggestion-content');
    if (!contentDiv) return;
    
    // Use smart fast rendering with code detection for real-time formatting
    setStreamingContentSmart(contentDiv, fullAccumulatedText);
    
    // Auto-scroll to bottom if user hasn't scrolled up
    const suggestionsArea = document.getElementById('suggestionsArea');
    if (suggestionsArea) {
        const isNearBottom = suggestionsArea.scrollTop + suggestionsArea.clientHeight >= suggestionsArea.scrollHeight - 50;
        if (isNearBottom) {
            requestAnimationFrame(() => {
                suggestionsArea.scrollTop = suggestionsArea.scrollHeight;
            });
        }
    }
}

// UNIFIED CONTENT UPDATER: Single source of truth for all suggestion content updates
function updateSuggestionContent(suggestionElement, markdownContent, isStreamingComplete = false) {
    console.log('🎨 UNIFIED: updateSuggestionContent called');
    console.log('  Content length:', markdownContent ? markdownContent.length : 'null');
    console.log('  Streaming complete:', isStreamingComplete);

    const contentDiv = suggestionElement.querySelector('.suggestion-content');
    if (!contentDiv) {
        console.error('❌ Content div not found in suggestion element');
        return;
    }

    // ALWAYS use the unified streaming formatter for consistent real-time formatting
    // Whether it's the first chunk, streaming chunk, or final chunk - unified approach
    console.log('🎨 UNIFIED: Using single formatting approach for all content');
    setStreamingContentSmart(contentDiv, markdownContent);

    // Auto-scroll to bottom if user hasn't scrolled up
    const suggestionsArea = document.getElementById('suggestionsArea');
    if (suggestionsArea) {
        // Check if user is near the bottom (within 50px)
        const isNearBottom = suggestionsArea.scrollTop + suggestionsArea.clientHeight >= suggestionsArea.scrollHeight - 50;
        
        if (isNearBottom) {
            // Use requestAnimationFrame for smoother scrolling during streaming
            requestAnimationFrame(() => {
                suggestionsArea.scrollTop = suggestionsArea.scrollHeight;
            });
        }
    }
}

// REMOVED: Duplicate function - consolidated into unified formatter above

// Legacy function kept for compatibility
function setStreamingContentFast(contentDiv, content) {
    // Redirect to the new smart function
    setStreamingContentSmart(contentDiv, content);
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

    // COMPLETE CONTEXT MODE: Always create new suggestions
    // Since each AI call is now for a different complete sentence/thought,
    // we should always create a new suggestion instead of updating existing ones
    console.log('✨ Creating new AI suggestion (Complete Context Mode)');
    createNewSuggestion(title, content);
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
    
    console.log('🎨 DEBUG: About to set content using unified formatter');
    setStreamingContentSmart(contentElem, content);
    console.log('🎨 DEBUG: Content set using unified formatter, element innerHTML length:', contentElem.innerHTML.length);
    
    container.appendChild(contentElem);

    if (suggestionsContent) {
        suggestionsContent.appendChild(container);
        
        // Clean up old suggestions to maintain limit
        cleanupOldSuggestions();
        
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

    // Update content using unified formatter
    const contentElem = container.querySelector('.suggestion-content') || container.querySelector('div:last-child');
    if (contentElem) {
        setStreamingContentSmart(contentElem, content);
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
            
            // Apply styling to all code blocks (highlighting was done by marked)
            const codeBlocks = contentElem.querySelectorAll('pre code');
            console.log('  Found code blocks:', codeBlocks.length);
            
            codeBlocks.forEach((block, index) => {
                console.log(`🎨 Styling code block ${index}:`, block.textContent.substring(0, 50) + '...');
                
                // Get the language from data attribute or class (already set by marked)
                let lang = block.getAttribute('data-language') || 
                          block.className.match(/language-(\w+)/)?.[1] || 
                          block.parentElement?.getAttribute('data-language') || 'text';
                
                console.log(`  Language: ${lang}`);
                
                // ✨ FORCE TRANSPARENT BACKGROUND - Apply directly after highlighting
                console.log(`  🎨 Applying transparent styles to code block ${index}`);
                
                // Apply transparent styles to the code block itself with proper wrapping
                block.style.cssText = `
                    background: transparent !important;
                    background-color: transparent !important;
                    border: 1px solid rgba(255, 255, 255, 0.15) !important;
                    border-radius: 6px !important;
                    color: #ffffff !important;
                    white-space: pre-wrap !important;
                    word-wrap: break-word !important;
                    word-break: break-all !important;
                    overflow-wrap: break-word !important;
                    max-width: 100% !important;
                    overflow-x: auto !important;
                `;
                
                // Apply transparent styles to the parent pre element with proper wrapping
                const pre = block.parentElement;
                if (pre && pre.tagName === 'PRE') {
                    pre.style.cssText = `
                        background: transparent !important;
                        background-color: transparent !important;
                        border: 1px solid rgba(255, 255, 255, 0.15) !important;
                        border-radius: 6px !important;
                        white-space: pre-wrap !important;
                        word-wrap: break-word !important;
                        overflow-wrap: break-word !important;
                        max-width: 100% !important;
                        overflow-x: auto !important;
                    `;
                }
                
                // Force transparent background on all child elements
                const allChildren = block.querySelectorAll('*');
                allChildren.forEach(child => {
                    child.style.backgroundColor = 'transparent';
                    child.style.background = 'transparent';
                });
                
                console.log(`  ✅ Transparent styles applied to code block ${index}`);
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
let winningResponseId = null; // Track which response won to prevent overwrites
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
    winningResponseId = null; // Reset winner tracking for new conversation
    
    // Reset cached suggestion content
    lastAICallText = "";
    
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
            updateStatus('Cleared', '#00ff88');
    setTimeout(() => {
            updateStatus('Ready', '#00ff88');
    }, 1500);
}

function toggleMute() {
    // Toggle mute at the audio processing level (not just UI)
    ipcRenderer.invoke('toggle-audio-mute').then(result => {
        if (result.success) {
            isMuted = result.muted;
            updateStatus(isMuted ? 'Muted' : (isRecording ? 'Recording' : 'Standby'), isMuted ? '#ff0000' : (isRecording ? '#00ff88' : '#ffff00'));
            
            const muteListenHint = document.getElementById('muteListenHint');
            if (muteListenHint) muteListenHint.innerHTML = `${isMuted ? 'Unmute' : 'Mute'}:<kbd>⌘</kbd><kbd>L</kbd>`;
            
            // Show notification about the change
            showNotification(
                isMuted ? "Audio Muted" : "Audio Unmuted", 
                isMuted ? "Audio processing paused - no STT/AI calls" : "Audio processing resumed"
            );
            
            console.log(`🔇 Audio processing ${isMuted ? 'MUTED' : 'UNMUTED'} at recording service level`);
        } else {
            console.error('Failed to toggle audio mute:', result.error);
            showNotification("Mute Error", "Failed to toggle audio mute");
        }
    }).catch(error => {
        console.error('Error calling toggle-audio-mute:', error);
        showNotification("Mute Error", "Failed to toggle audio mute");
    });
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
    
    // Enable wheel scrolling for the element
    element.addEventListener('wheel', (e) => {
        e.stopPropagation();
        // Allow default wheel behavior for scrolling
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
                    
                    // Show processing indicator
                    showScreenshotProcessing(screenshotCount);
                    
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
    console.log('🎯 DEBUG: transcription-update event received!');
    console.log('  Raw data:', JSON.stringify(data, null, 2));
    console.log('  Data type:', typeof data);
    console.log('  Data.text:', data ? data.text : 'undefined');
    console.log('  Data.is_final:', data ? data.is_final : 'undefined');
    
    if (isResettingSTT) {
        console.log("STT is resetting, discarding transcript fragment.");
        return; 
    }
    if (!isMuted) {
        displayTranscriptSegment(data);
    }
});

ipcRenderer.on('suggestion-update', (event, data) => {
    // High-precision timing measurement
    const ipcReceiveTime = performance.now();
    const ipcReceiveTimeMs = Date.now();
    
    console.log('🎯 DEBUG: suggestion-update event received in overlay renderer!');
    console.log(`⏱️ IPC RECEIVE TIME: ${ipcReceiveTime.toFixed(3)}ms (high-precision)`);
    console.log(`⏱️ IPC RECEIVE TIMESTAMP: ${new Date(ipcReceiveTimeMs).toISOString()}`);
    console.log('  Data:', JSON.stringify(data, null, 2));
    
    if (data.isStreaming) {
        if (data.isFirstChunk) {
            // Reset winner tracking for new question and declare this response as the winner
            // This ensures each new question starts fresh without interference from previous winners
            if (data.responseId) {
                winningResponseId = data.responseId;
                console.log(`🏆 New question detected - Response ${data.responseId} is now the winner!`);
                console.log(`🔄 Previous winner tracking reset for fresh start`);
                
                // Start health monitoring for this response
                monitorResponseHealth(data.responseId);
            }
            
            // Record timing for first chunk display
            console.log(`[TIMING] 🎨 FIRST CHUNK RENDERED ON SCREEN at: ${new Date(ipcReceiveTimeMs).toISOString()}`);
            console.log(`[TIMING] 🎨 First chunk content length: ${data.content ? data.content.length : 0} chars`);
            console.log(`[TIMING] 🎨 First chunk content: "${data.content ? data.content.substring(0, 50) : ''}${data.content && data.content.length > 50 ? '...' : ''}"`);
            
            // Start of a new streaming response
            console.log('🚀 Starting new AI suggestion stream');
            console.log('🎯 DEBUGGING: About to check responseId and create element');
            
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
                    
                    console.log('🎯 DEBUGGING: About to create new suggestion element');
                    console.log(`🎯 DEBUGGING: title = "${data.title || ''}"`, `content = "${currentStreamingResponseText}"`);
                    
                    try {
                    // Create new suggestion element (not yet appended to DOM)
                    activeStreamingSuggestionElement = createNewSuggestionElement(data.title || '', currentStreamingResponseText);
                    currentResponseElement = activeStreamingSuggestionElement;
                        console.log('🎯 DEBUGGING: Element created successfully');
                    
                        // Check if suggestionsContent exists
                        console.log('🎯 DEBUGGING: Checking suggestionsContent...', !!suggestionsContent);
                    if (suggestionsContent) {
                            console.log('🎯 DEBUGGING: suggestionsContent found, appending element');
                        suggestionsContent.appendChild(activeStreamingSuggestionElement);
                        console.log('✅ New streaming suggestion element appended to DOM');
                            console.log(`🎯 DEBUGGING: suggestionsContent now has ${suggestionsContent.children.length} children`);
                        } else {
                            console.error('❌ DEBUGGING: suggestionsContent not found!');
                        }
                    } catch (error) {
                        console.error('❌ DEBUGGING: Error in element creation/append:', error);
                        console.error(error.stack);
                    }
                }
            }
            
            // Render initial content with unified real-time formatting from first chunk
            console.log('🎨 UNIFIED: First chunk - using streaming formatter');
            updateSuggestionContent(activeStreamingSuggestionElement, currentStreamingResponseText, false);
            return;
        }
        
        if (data.content && activeStreamingSuggestionElement) {
            // Check if this chunk is from the winning response
            if (winningResponseId && data.responseId && data.responseId !== winningResponseId) {
                console.log(`🛑 Ignoring chunk from ${data.responseId} - ${winningResponseId} already won`);
                return;
            }
            
            // Reset timeout for this response - we received a new chunk
            if (data.responseId) {
                resetResponseTimeout(data.responseId);
            }
            
            // Subsequent chunks of the same stream - append ONLY the new chunk
            console.log('⚡ FAST APPEND: Adding only new chunk to existing content');
            console.log(`  New chunk length: ${data.content.length}`);
            console.log(`  Previous total: ${currentStreamingResponseText.length}`);
            
            // Accumulate for final processing
            currentStreamingResponseText += data.content;
            
            // FAST INCREMENTAL: Append only the new chunk, don't re-render everything
            appendOnlyNewChunk(activeStreamingSuggestionElement, data.content);
            
            console.log(`  New total: ${currentStreamingResponseText.length}`);
        }
        
        if (data.isComplete) {
            // Check if this completion is from the winning response
            if (winningResponseId && data.responseId && data.responseId !== winningResponseId) {
                console.log(`🛑 Ignoring completion from ${data.responseId} - ${winningResponseId} already won`);
                return;
            }
            
            // Stream is complete - final cleanup
            console.log('✅ AI suggestion stream completed');
            const completionTime = Date.now();
            console.log(`[TIMING] 🎨 FINAL CHUNK RENDERED ON SCREEN at: ${new Date(completionTime).toISOString()}`);
            console.log(`[TIMING] 🎨 Final response content length: ${currentStreamingResponseText.length} chars`);
            console.log(`[TIMING] 🎨 Final response preview: "${currentStreamingResponseText.substring(0, 100)}${currentStreamingResponseText.length > 100 ? '...' : ''}"`);
            
            // Final update with complete content (hybrid: full markdown + syntax highlighting for perfect result)
            if (activeStreamingSuggestionElement && currentStreamingResponseText) {
                console.log('🎨 FINAL RENDER: Applying complete markdown and syntax highlighting to final content');
                console.log(`  Final content length: ${currentStreamingResponseText.length}`);
                try {
                    updateSuggestionContent(activeStreamingSuggestionElement, currentStreamingResponseText, true); // Final complete rendering
                    console.log('✅ FINAL RENDER: Complete markdown and syntax highlighting applied');
                } catch (error) {
                    console.error('❌ DEBUGGING: Error in final render, falling back to simple text:', error);
                    // Fallback: just set the text content directly
                    const contentDiv = activeStreamingSuggestionElement.querySelector('.suggestion-content');
                    if (contentDiv) {
                        contentDiv.textContent = currentStreamingResponseText;
                        console.log('✅ FALLBACK: Set content as plain text');
                    }
                }
            } else {
                console.log('⚠️ DEBUGGING: No active element or text for final render');
                console.log(`  activeStreamingSuggestionElement: ${!!activeStreamingSuggestionElement}`);
                console.log(`  currentStreamingResponseText: "${currentStreamingResponseText}"`);
            }
            
            // Add visual boundary after completed AI response
            addResponseBoundary();
            
            // Clean up old suggestions to maintain limit
            cleanupOldSuggestions();
            
            // Clear response monitoring - response completed successfully
            if (data.responseId) {
                clearResponseTimeout(data.responseId);
            }
            
            // CRITICAL FIX: Reset AI call tracking to allow new questions
            // Clear lastAICallText after each response completes to enable subsequent AI calls
            console.log('🔄 AI response completed - resetting call tracking to allow new questions');
            lastAICallText = "";
            // Note: winningResponseId is now reset when new first chunk arrives, not here
            
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
        
        // Clean up old suggestions to maintain limit
        cleanupOldSuggestions();
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
            // Update processing status to show streaming has started
            updateScreenshotProcessingStatus('Receiving Response...');
            
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
            
            // Render initial content (hybrid: smart fast rendering for real-time feedback)
            updateSuggestionContent(activeStreamingScreenshotElement, currentStreamingScreenshotText, false);
            return;
        }
        
        if (data.content && activeStreamingScreenshotElement) {
            // Subsequent chunks of the same stream - append to accumulated text
            console.log('📝 Appending chunk to existing screenshot solution stream');
            currentStreamingScreenshotText += data.content;
            
            // Re-render the entire accumulated content (hybrid: smart fast rendering with code formatting)
            updateSuggestionContent(activeStreamingScreenshotElement, currentStreamingScreenshotText, false);
        }
        
        if (data.isComplete) {
            // Stream is complete - final cleanup
            console.log('✅ Screenshot solution stream completed');
            
            // Hide processing indicator
            hideScreenshotProcessing();
            
            // Final update with complete content - full markdown processing
            if (activeStreamingScreenshotElement && currentStreamingScreenshotText) {
                updateSuggestionContent(activeStreamingScreenshotElement, currentStreamingScreenshotText, true);
                console.log('🎨 Screenshot solution final chunk processed with full markdown');
            }
            
            // Add visual boundary after completed screenshot solution
            addResponseBoundary();
            
            // Clean up old suggestions to maintain limit
            cleanupOldSuggestions();
            
            // CRITICAL FIX: Reset AI call tracking to allow new questions after screenshot solutions
            console.log('🔄 Screenshot solution completed - resetting call tracking to allow new questions');
            lastAICallText = "";
            // Note: winningResponseId is now reset when new first chunk arrives, not here
            
            // Clear streaming state
            activeStreamingScreenshotElement = null;
            currentStreamingScreenshotText = "";
        }
    } else {
        // Handle non-streaming screenshot solutions - always create new suggestion
        addScreenshotSolution(data.title || "Screenshot Solution", data.content);
        
        // Clean up old suggestions to maintain limit
        cleanupOldSuggestions();
        
        // Hide processing indicator for non-streaming responses
        hideScreenshotProcessing();
    }
});

ipcRenderer.on('solution-error', (event, { title, content }) => {
    // Hide processing indicator on error
    hideScreenshotProcessing();
    
    // Screenshot solution errors should also create new suggestions
    addScreenshotSolution(title || "Error Generating Screenshot Solution", content);
    
    // Clean up old suggestions to maintain limit
    cleanupOldSuggestions();
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
        case 'screenshot_first_chunk_received':
            console.log(`[TIMING] 🚀 First SCREENSHOT chunk: ${data.time_from_api_call}ms, ${data.chunk_length} chars`);
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
    showNotification("Clearing", "Clearing transcript, suggestions, and conversation history...");
    clearTranscriptAndSuggestions();
    
    // Also clear the conversation history in the backend
    ipcRenderer.send('clear-conversation-history');
    
    // Reset the Google STT service for a completely fresh start
    isResettingSTT = true;
    ipcRenderer.send('reset-stt');
    
    // Note: We preserve AI system prompts so job context remains intact
    console.log('🗑️ Cleared transcript and conversation - AI job context preserved');
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
        
        // Show processing indicator
        showScreenshotProcessing(screenshotCount);
        
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
        // Start 3-second timer when voice stops (increased from 1 second for more complete thoughts)
        if (vadSilenceTimer) {
            clearTimeout(vadSilenceTimer);
        }
        
        vadSilenceTimer = setTimeout(() => {
            // After 3 seconds of silence, check if we should call AI (full context mode)
            const currentText = transcriptBuffer.trim();
            
            // Only call AI if we have meaningful content with natural breaks or complete questions
            if (currentText && currentText.length > 5) { // Lowered threshold from 15 to 5 for testing
                const hasNaturalBreak = /[.!?](?:\s|$)/.test(currentText);
                const looksLikeCompleteQuestion = /\b(write|create|make|build|show|generate|give|tell|explain|how|what|when|where|why|code|program|function|algorithm|script)\b.*\b(code|function|program|script|algorithm|fibonacci|fibunachi|sequence|series|sort|search|loop|array|list|string|number|calculate|find|get|return)\b/i.test(currentText);
                
                console.log(`📊 VAD AI Call Check (Full Context Mode):`);
                console.log(`   Text length: ${currentText.length} (min 5: ${currentText.length > 5})`);
                console.log(`   Natural break: ${hasNaturalBreak}`);
                console.log(`   Complete question: ${looksLikeCompleteQuestion}`);
                
                // Call AI on natural breaks or complete questions (similarity check removed)
                if (hasNaturalBreak || looksLikeCompleteQuestion) {
                    console.log('🤖 VAD: Calling AI after silence - complete thought with full context');
                    console.log('🤖 Note: AI processing with full conversation context');
                    lastAICallText = currentText;
                    // Note: Actual AI call is handled by recording service with full context
                } else {
                    console.log(`🤖 VAD: Skipping AI call - waiting for complete thought or natural break`);
                    if (!hasNaturalBreak && !looksLikeCompleteQuestion) {
                        console.log(`   No natural break or complete question detected`);
                    }
                }
            } else {
                console.log(`❌ VAD silence - insufficient length (${currentText.length} <= 5 chars)`);
            }
            vadSilenceTimer = null;
        }, VAD_SILENCE_THRESHOLD); // Use the updated 3-second threshold
        
    } else if (data.type === 'voice-started') {
        // Clear silence timer when voice starts again
        if (vadSilenceTimer) {
            clearTimeout(vadSilenceTimer);
            vadSilenceTimer = null;
        }
    }
});

// Click-through is now ENABLED by default - overlay passes mouse events through

window.addEventListener('DOMContentLoaded', async () => {
    // Initialize memory management
    initializeOverlayMemoryManagement();
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
    
    // Ensure both areas allow scrolling with proper scrollbar handling
    const suggestionsArea = document.getElementById('suggestionsArea');
    const transcriptArea = document.getElementById('transcriptArea');
    
    if (suggestionsArea) {
        suggestionsArea.style.pointerEvents = 'auto';
        setupScrollbarDragHandling(suggestionsArea);
        console.log('✅ Suggestions area scroll enabled with scrollbar handling');
    }
    
    if (transcriptArea) {
        transcriptArea.style.pointerEvents = 'auto';
        setupScrollbarDragHandling(transcriptArea);
        console.log('✅ Transcript area scroll enabled with scrollbar handling');
    }
    
    // Initialize hotkey handling for AI suggestions scrolling
    setupHotkeyHandling();
    
    // Initialize screen protection toggle
    initScreenProtectionToggle();
    
    // Setup toggle to be clickable in click-through mode
    setupProtectionToggle();
    
    // Apply glass effects
    applyTransparency();
    
    ipcRenderer.on("recording-status", (_, status, timestamp) => {
        if (status === "LIVE_TRANSCRIPTION_STARTED") {
            updateStatus(isMuted ? 'Muted' : 'Recording', isMuted ? '#ff0000' : '#00ff88');
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

// Import the consolidated overlay renderer styles
const overlayRendererStyles = require('../../utils/overlay-renderer-styles');

// Apply transparency directly with our exact values - no dependency on broken IPC
function applyTransparency() {
    console.log('🎨 Applying direct transparency with exact values...');
    
        const transcriptArea = document.getElementById('transcriptArea');
        const suggestionsArea = document.getElementById('suggestionsArea');
    const headerBar = document.querySelector('.header-bar');
    const statusBar = document.querySelector('.status-bar');
    
    if (transcriptArea) {
        transcriptArea.style.backgroundColor = 'rgba(26, 32, 44, 0.3)'; // 70% transparency
        transcriptArea.style.backdropFilter = 'blur(12px) saturate(120%)';
        transcriptArea.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        transcriptArea.style.color = '#ffffff'; // Bright white text
        console.log('✅ Applied direct transparency to transcript area');
    }
    
    if (suggestionsArea) {
        suggestionsArea.style.backgroundColor = 'rgba(26, 32, 44, 0.75)'; // 25% transparency (less transparent)
        suggestionsArea.style.backdropFilter = 'blur(20px) saturate(140%)'; // Increased blur and saturation
        suggestionsArea.style.border = '1px solid rgba(255, 255, 255, 0.12)';
        suggestionsArea.style.borderLeft = '2px solid rgba(255, 255, 255, 0.15)';
        suggestionsArea.style.color = '#f3f4f6';
        console.log('✅ Applied direct transparency to suggestions area');
    }
    
    if (headerBar) {
        headerBar.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
        headerBar.style.backdropFilter = 'blur(20px) saturate(150%)';
        headerBar.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        headerBar.style.color = '#ffffff';
        console.log('✅ Applied direct transparency to header bar');
    }
    
    if (statusBar) {
        statusBar.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
        statusBar.style.backdropFilter = 'blur(20px) saturate(150%)';
        statusBar.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        console.log('✅ Applied direct transparency to status bar');
    }
    
    console.log('🎨 Direct transparency application complete');
}

// Handle window-hidden event to clean up resources
ipcRenderer.on('window-hidden', () => {
    console.log('📝 Renderer received window-hidden event - cleaning up resources');
    
    // Clear any timers using managed cleanup
    if (pauseTimer) {
        clearManagedTimeout(pauseTimer);
        pauseTimer = null;
    }
    
    if (vadSilenceTimer) {
        clearManagedTimeout(vadSilenceTimer);
        vadSilenceTimer = null;
    }
    
    // Perform emergency memory cleanup when window is hidden
    emergencyMemoryCleanup();
    
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

// Test IPC connectivity
ipcRenderer.on('test-ipc', (event, data) => {
    console.log('🧪 TEST IPC: Event received in overlay:', data);
});

// Initialize overlay on DOM load
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 Overlay DOM loaded, testing IPC connectivity...');
    
    // Test if we can send messages back to main
    try {
        console.log('📡 Testing IPC send to main process...');
        ipcRenderer.send('test-ipc-from-overlay', { message: 'Overlay renderer is ready' });
        console.log('✅ IPC send test completed');
    } catch (error) {
        console.error('❌ IPC send test failed:', error);
    }
}); 

// Initialize marked with enhanced syntax highlighting
marked.use({
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false,
    highlight: function(code, lang) {
        console.log('🎨 marked.highlight: Processing code block with language:', lang);
        
        if (typeof hljs !== 'undefined') {
            let highlightedCode = '';
            let detectedLang = lang;
            
            try {
                if (lang && hljs.getLanguage(lang)) {
                    // Use specified language
                    highlightedCode = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
                    console.log('✅ marked.highlight: Successfully highlighted with specified language:', lang);
                } else {
                    // Try to auto-detect language
                    const result = hljs.highlightAuto(code, ['javascript', 'python', 'java', 'cpp', 'csharp', 'ruby', 'go', 'sql', 'html', 'css', 'json']);
                    highlightedCode = result.value;
                    detectedLang = result.language || 'text';
                    console.log('🔍 marked.highlight: Auto-detected language:', detectedLang, 'confidence:', result.relevance);
                }
                
                // Return just the highlighted code (no wrapper) - the renderer will add the <code> wrapper
                return highlightedCode;
                
            } catch (e) {
                console.error('❌ marked.highlight: Error highlighting code:', e);
                // Fallback to basic highlighting
                try {
                    const fallback = hljs.highlightAuto(code);
                    return fallback.value;
                } catch (fallbackError) {
                    console.error('❌ marked.highlight: Fallback also failed:', fallbackError);
                    return code; // Plain code as last resort
                }
            }
        } else {
            console.warn('⚠️ marked.highlight: hljs not available, returning plain code');
            return code;
        }
    },
    renderer: {
        code(code, infostring, escaped) {
            const lang = (infostring || '').match(/\S*/)[0];
            const langAttr = lang ? ` data-language="${lang}"` : '';
            
            // Generate line numbers for multi-line code
            const lines = code.split('\n');
            const lineNumbers = lines.map((_, index) => (index + 1).toString()).join('\n');
            const lineNumbersAttr = ` data-line-numbers="${lineNumbers}"`;
            
            if (this.options.highlight) {
                const out = this.options.highlight(code, lang);
                if (out != null && out !== code) {
                    escaped = true;
                    code = out;
                }
            }
            
            return `<pre${langAttr}${lineNumbersAttr}><code class="hljs ${lang ? `language-${lang}` : ''}"${langAttr}>${escaped ? code : escape(code)}</code></pre>\n`;
        }
    }
});

// Add hotkey functionality for scrolling AI suggestions
function setupHotkeyHandling() {
    document.addEventListener('keydown', (e) => {
        // Check for SHIFT + Arrow Up/Down (and NOT CMD/Meta key)
        if (e.shiftKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            e.stopPropagation();
            
            const suggestionsArea = document.getElementById('suggestionsArea');
            if (!suggestionsArea) return;
            
            const scrollAmount = 150; // pixels to scroll - increased for better visibility
            
            if (e.key === 'ArrowUp') {
                // Smooth scroll up
                suggestionsArea.scrollBy({
                    top: -scrollAmount,
                    behavior: 'smooth'
                });
                console.log('⬆️ Scrolled AI suggestions up via SHIFT+Arrow hotkey');
            } else if (e.key === 'ArrowDown') {
                // Smooth scroll down
                suggestionsArea.scrollBy({
                    top: scrollAmount,
                    behavior: 'smooth'
                });
                console.log('⬇️ Scrolled AI suggestions down via SHIFT+Arrow hotkey');
            }
            return; // Exit early to prevent any other processing
        }
        
        // Let CMD + Arrow keys pass through for window movement (don't interfere)
        if (e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
            // Don't prevent default - let these pass through for window movement
            console.log(`🪟 CMD + ${e.key} - allowing window movement (not scrolling AI suggestions)`);
            return;
        }
    });
    
    console.log('⌨️ Hotkey handling initialized - SHIFT + Arrow Up/Down to scroll AI suggestions, CMD + Arrows for window movement');
}

// --- Memory Management & Cleanup Functions ---

// Global cleanup tracker
let globalCleanupInterval = null;
let activeTimeouts = new Set();
let activeIntervals = new Set();

// Enhanced setTimeout wrapper for cleanup tracking
function managedSetTimeout(callback, delay) {
    const timeoutId = setTimeout(() => {
        activeTimeouts.delete(timeoutId);
        callback();
    }, delay);
    activeTimeouts.add(timeoutId);
    return timeoutId;
}

// Enhanced setInterval wrapper for cleanup tracking
function managedSetInterval(callback, delay) {
    const intervalId = setInterval(callback, delay);
    activeIntervals.add(intervalId);
    return intervalId;
}

// Clear specific timeout and remove from tracking
function clearManagedTimeout(timeoutId) {
    if (timeoutId) {
        clearTimeout(timeoutId);
        activeTimeouts.delete(timeoutId);
    }
}

// Clear specific interval and remove from tracking
function clearManagedInterval(intervalId) {
    if (intervalId) {
        clearInterval(intervalId);
        activeIntervals.delete(intervalId);
    }
}

// Emergency memory cleanup function
function emergencyMemoryCleanup() {
    console.log('🧹 EMERGENCY: Performing deep memory cleanup...');
    
    // Clear all tracked timeouts and intervals
    activeTimeouts.forEach(id => clearTimeout(id));
    activeIntervals.forEach(id => clearInterval(id));
    activeTimeouts.clear();
    activeIntervals.clear();
    
    // Clear streaming states
    currentStreamingResponseText = "";
    currentStreamingScreenshotText = "";
    activeStreamingSuggestionElement = null;
    activeStreamingScreenshotElement = null;
    
    // Force garbage collection of large objects
    if (typeof global !== 'undefined' && global.gc) {
        global.gc();
        console.log('🗑️ Manual garbage collection triggered');
    }
    
    console.log('✅ Emergency memory cleanup completed');
}

// Enhanced periodic cleanup with memory monitoring
function performEnhancedPeriodicCleanup() {
    console.log('🧹 Enhanced periodic cleanup starting...');
    
    // Standard cleanup
    cleanupOldTranscriptLines();
    cleanupOldSuggestions();
    
    // Clear inactive timeouts/intervals
    let clearedTimeouts = 0;
    let clearedIntervals = 0;
    
    activeTimeouts.forEach(id => {
        // Clear very old timeouts (unlikely to still be valid)
        clearTimeout(id);
        clearedTimeouts++;
    });
    activeTimeouts.clear();
    
    // Memory usage check and alert
    if (typeof process !== 'undefined' && process.memoryUsage) {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        console.log(`💾 Renderer memory usage: ${heapUsedMB} MB`);
        
        if (heapUsedMB > 150) {
            console.warn(`⚠️ High renderer memory usage detected: ${heapUsedMB} MB`);
            emergencyMemoryCleanup();
        }
    }
    
    console.log(`🧹 Cleanup completed: ${clearedTimeouts} timeouts, ${clearedIntervals} intervals cleared`);
}

// --- Enhanced cleanup functions (using existing constants) ---

// Set up enhanced periodic cleanup every 30 seconds (more frequent)
if (globalCleanupInterval) {
    clearInterval(globalCleanupInterval);
}
globalCleanupInterval = managedSetInterval(performEnhancedPeriodicCleanup, 30000);

// --- Enhanced Functions with Memory Management ---

// Add comprehensive memory management tracking
const overlayActiveTimers = new Set();
const overlayActiveIntervals = new Set();
const overlayActiveEventListeners = new Map();
const overlayCleanupInterval = 30000; // 30 seconds

// Enhanced timer wrappers with cleanup tracking
function setTimeoutSafe(callback, delay, label = 'overlay-timer') {
    const timerId = setTimeout(() => {
        overlayActiveTimers.delete(timerId);
        try {
            callback();
        } catch (error) {
            console.error(`Timer callback error (${label}):`, error);
        }
    }, delay);
    overlayActiveTimers.add(timerId);
    console.log(`🔧 Overlay timer created: ${label} (${overlayActiveTimers.size} active)`);
    return timerId;
}

function clearTimeoutSafe(timerId, label = 'overlay-timer') {
    if (timerId) {
        clearTimeout(timerId);
        overlayActiveTimers.delete(timerId);
        console.log(`🧹 Overlay timer cleared: ${label} (${overlayActiveTimers.size} remaining)`);
    }
}

function setIntervalSafe(callback, delay, label = 'overlay-interval') {
    const intervalId = setInterval(() => {
        try {
            callback();
        } catch (error) {
            console.error(`Interval callback error (${label}):`, error);
        }
    }, delay);
    overlayActiveIntervals.add(intervalId);
    console.log(`⏰ Overlay interval created: ${label} (${overlayActiveIntervals.size} active)`);
    return intervalId;
}

function clearIntervalSafe(intervalId, label = 'overlay-interval') {
    if (intervalId) {
        clearInterval(intervalId);
        overlayActiveIntervals.delete(intervalId);
        console.log(`🧹 Overlay interval cleared: ${label} (${overlayActiveIntervals.size} remaining)`);
    }
}

// Enhanced event listener tracking
function addEventListenerSafe(element, event, handler, options, label = 'overlay-listener') {
    element.addEventListener(event, handler, options);
    
    if (!overlayActiveEventListeners.has(element)) {
        overlayActiveEventListeners.set(element, new Map());
    }
    
    const elementListeners = overlayActiveEventListeners.get(element);
    if (!elementListeners.has(event)) {
        elementListeners.set(event, []);
    }
    
    elementListeners.get(event).push({ handler, options, label });
    console.log(`👂 Event listener added: ${label} (${getTotalListeners()} total)`);
}

function removeEventListenerSafe(element, event, handler, options) {
    element.removeEventListener(event, handler, options);
    
    const elementListeners = overlayActiveEventListeners.get(element);
    if (elementListeners && elementListeners.has(event)) {
        const listeners = elementListeners.get(event);
        const index = listeners.findIndex(l => l.handler === handler);
        if (index !== -1) {
            const removed = listeners.splice(index, 1)[0];
            console.log(`🧹 Event listener removed: ${removed.label} (${getTotalListeners()} remaining)`);
        }
    }
}

function getTotalListeners() {
    let total = 0;
    overlayActiveEventListeners.forEach(elementMap => {
        elementMap.forEach(listeners => {
            total += listeners.length;
        });
    });
    return total;
}

// Memory cleanup functions
function performOverlayCleanup() {
    console.log(`🧹 Overlay cleanup: ${overlayActiveTimers.size} timers, ${overlayActiveIntervals.size} intervals, ${getTotalListeners()} listeners`);
    
    // Limit transcript and suggestion elements
    limitTranscriptElements();
    limitSuggestionElements();
    
    // Clear old timing data
    if (Object.keys(timingData).length > 20) {
        const keys = Object.keys(timingData).sort();
        const toKeep = keys.slice(-10); // Keep latest 10
        const newTimingData = {};
        toKeep.forEach(key => {
            newTimingData[key] = timingData[key];
        });
        timingData = newTimingData;
        console.log('🧹 Timing data trimmed to 10 entries');
    }
    
    // Force garbage collection if available
    if (window.gc) {
        window.gc();
    }
}

function emergencyOverlayCleanup() {
    console.log('🚨 EMERGENCY OVERLAY CLEANUP');
    
    // Clear all timers
    overlayActiveTimers.forEach(timerId => {
        try {
            clearTimeout(timerId);
        } catch (e) {
            console.warn('Failed to clear overlay timer:', e);
        }
    });
    overlayActiveTimers.clear();
    
    // Clear all intervals
    overlayActiveIntervals.forEach(intervalId => {
        try {
            clearInterval(intervalId);
        } catch (e) {
            console.warn('Failed to clear overlay interval:', e);
        }
    });
    overlayActiveIntervals.clear();
    
    // Clear VAD silence timer
    if (vadSilenceTimer) {
        clearTimeout(vadSilenceTimer);
        vadSilenceTimer = null;
    }
    
    // Clear pause timer
    if (pauseTimer) {
        clearTimeout(pauseTimer);
        pauseTimer = null;
    }
    
    // Reset streaming states
    lastAICallText = "";
    transcriptBuffer = "";
    currentInterimText = "";
    
    // Perform standard cleanup
    performOverlayCleanup();
    
    console.log('✅ Emergency overlay cleanup completed');
}

// Export cleanup functions for main process access
window.overlayCleanup = {
    performOverlayCleanup,
    emergencyOverlayCleanup,
    overlayActiveTimers,
    overlayActiveIntervals,
    overlayActiveEventListeners
};

function limitTranscriptElements() {
    const transcriptContainer = document.getElementById('transcript-container');
    if (transcriptContainer) {
        const children = transcriptContainer.children;
        if (children.length > MAX_TRANSCRIPT_LINES) {
            const toRemove = children.length - MAX_TRANSCRIPT_LINES;
            for (let i = 0; i < toRemove; i++) {
                if (children[0]) {
                    children[0].remove();
                }
            }
            console.log(`🧹 Removed ${toRemove} old transcript elements`);
        }
    }
}

function limitSuggestionElements() {
    const suggestionsContainer = document.getElementById('suggestions-container');
    if (suggestionsContainer) {
        const children = suggestionsContainer.children;
        if (children.length > MAX_SUGGESTIONS) {
            const toRemove = children.length - MAX_SUGGESTIONS;
            for (let i = 0; i < toRemove; i++) {
                if (children[0]) {
                    children[0].remove();
                }
            }
            console.log(`🧹 Removed ${toRemove} old suggestion elements`);
        }
    }
}

// Start periodic cleanup
const overlayMainCleanupInterval = setIntervalSafe(performOverlayCleanup, overlayCleanupInterval, 'overlay-cleanup');

// Helper functions for memory management
function initializeOverlayMemoryManagement() {
    // Add window focus/blur cleanup
    addEventListenerSafe(window, 'blur', () => {
        console.log('🔍 Window lost focus - performing light cleanup');
        performOverlayCleanup();
    }, false, 'window-blur-cleanup');

    // Add page unload cleanup
    addEventListenerSafe(window, 'beforeunload', () => {
        console.log('🛑 Page unloading - performing emergency cleanup');
        emergencyOverlayCleanup();
    }, false, 'window-unload-cleanup');

    // Add visibility change cleanup
    addEventListenerSafe(document, 'visibilitychange', () => {
        if (document.hidden) {
            console.log('👁️ Page hidden - performing cleanup');
            performOverlayCleanup();
        }
    }, false, 'visibility-change-cleanup');
}

// Add response timeout monitoring after line with "let winningResponseId = null;"

let responseTimeouts = new Map(); // Track timeouts for each response
const RESPONSE_TIMEOUT_MS = 30000; // 30 seconds timeout for AI responses
const CHUNK_TIMEOUT_MS = 10000; // 10 seconds between chunks

// Monitor AI response health and recover from stalled responses
function monitorResponseHealth(responseId) {
    console.log(`⏰ Starting health monitoring for response ${responseId}`);
    
    // Clear any existing timeout for this response
    if (responseTimeouts.has(responseId)) {
        clearTimeout(responseTimeouts.get(responseId));
    }
    
    // Set timeout for this response
    const timeout = setTimeout(() => {
        console.log(`🚨 Response ${responseId} timed out - attempting recovery`);
        handleResponseTimeout(responseId);
    }, RESPONSE_TIMEOUT_MS);
    
    responseTimeouts.set(responseId, timeout);
}

function resetResponseTimeout(responseId) {
    // Reset timeout when new chunks arrive
    if (responseTimeouts.has(responseId)) {
        clearTimeout(responseTimeouts.get(responseId));
        
        const timeout = setTimeout(() => {
            console.log(`🚨 Response ${responseId} stalled - no chunks for ${CHUNK_TIMEOUT_MS}ms`);
            handleResponseTimeout(responseId);
        }, CHUNK_TIMEOUT_MS);
        
        responseTimeouts.set(responseId, timeout);
    }
}

function clearResponseTimeout(responseId) {
    if (responseTimeouts.has(responseId)) {
        clearTimeout(responseTimeouts.get(responseId));
        responseTimeouts.delete(responseId);
        console.log(`✅ Response ${responseId} completed - timeout cleared`);
    }
}

function handleResponseTimeout(responseId) {
    console.log(`🔄 Handling timeout for response ${responseId}`);
    
    // Clear the timeout
    clearResponseTimeout(responseId);
    
    // If this is the current winner, try to recover
    if (responseId === winningResponseId) {
        console.log('💡 Attempting AI response recovery...');
        
        // Add recovery message to the response
        const responseElement = document.querySelector(`[data-response-id="${responseId}"]`);
        if (responseElement) {
            const contentElement = responseElement.querySelector('.suggestion-content');
            if (contentElement) {
                // Add recovery notice
                const recoveryNotice = document.createElement('div');
                recoveryNotice.className = 'recovery-notice';
                recoveryNotice.innerHTML = `
                    <hr style="margin: 1rem 0; border: 1px solid rgba(255, 255, 255, 0.2);">
                    <em style="color: rgba(255, 255, 255, 0.6); font-size: 0.9rem;">
                        ⚠️ Response was interrupted. The answer above may be incomplete.
                    </em>
                `;
                contentElement.appendChild(recoveryNotice);
                
                console.log('✅ Added recovery notice to incomplete response');
            }
        }
        
        // Add boundary for incomplete response
        addResponseBoundary();
        
        // Reset AI call tracking to allow new questions
        console.log('🔄 Resetting AI call tracking after timeout');
        lastAICallText = "";
        winningResponseId = null;
    }
}