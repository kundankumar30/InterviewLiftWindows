// gemini_service.js - Module for Gemini API interactions
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { getTextPrompt, getSystemPrompt, getScreenshotPrompt } = require('./ai_service');

let genAI = null;
let geminiModel = null;

// Initialize Gemini AI
function initializeGemini() {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (GEMINI_API_KEY) {
        try {
            genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            // For text-based interactions, use Gemini 1.5 Flash
            geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
            console.log("Gemini AI SDK initialized with gemini-2.0-flash");
            return true;
        } catch (error) {
            console.error("Error initializing Gemini AI SDK:", error);
            return false;
        }
    } else {
        console.error("GEMINI_API_KEY not found. Please set it in your environment variables.");
        return false;
    }
}

// Common safety settings
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// Generate streaming text-based response with conversation history support
async function generateTextResponse(jobRole, keySkills, context, chatHistory, onProgress, onComplete, onError, abortSignal = null) {
    let isCancelled = false;
    
    // Set up cancellation handler
    if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
            isCancelled = true;
            console.log('🛑 Gemini request cancelled via abort signal');
        });
    }
    
    try {
        // Record when Gemini API call starts
        const geminiApiCallTime = Date.now();
        console.log(`[TIMING] 🤖 GEMINI API CALL made at: ${new Date(geminiApiCallTime).toISOString()}`);
        console.log(`[TIMING] 🤖 GEMINI API text: "${context.substring(0, 100)}${context.length > 100 ? '...' : ''}"`);
        
        console.log('🚀===== GEMINI TEXT CALL START =====');
        console.log('📤 Job Role:', jobRole);
        console.log('📤 Key Skills:', keySkills);
        
        // Get the clean question text and system prompt
        const questionText = getTextPrompt(jobRole, keySkills, context);
        const systemPrompt = getSystemPrompt(jobRole, keySkills);
        
        console.log('🗣️ Clean Question:', questionText);
        console.log('🗣️ System Prompt Length:', systemPrompt.length, 'characters');
        console.log('📚 Conversation History Length:', chatHistory ? chatHistory.length : 0, 'turns');

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Build the conversation context with system prompt, history, and current question
        const conversationParts = [
            { text: systemPrompt }
        ];
        
        // Add conversation history if available
        if (chatHistory && chatHistory.length > 0) {
            console.log('📚 Adding conversation history to Gemini call...');
            // Convert conversation history to Gemini content format
            for (const turn of chatHistory) {
                if (turn.parts && turn.parts[0] && turn.parts[0].text) {
                    conversationParts.push({ text: turn.parts[0].text });
                }
            }
            console.log('📚 Total conversation parts after history:', conversationParts.length);
        }
        
        // Add current question
        conversationParts.push({ text: questionText });

        console.log('📋 Final conversation context has', conversationParts.length, 'parts');
        console.log('📋 Conversation parts preview:');
        conversationParts.forEach((part, index) => {
            if (part.text) {
                console.log(`  Part ${index}: ${part.text.substring(0, 100)}${part.text.length > 100 ? '...' : ''}`);
            } else if (part.parts) {
                console.log(`  Part ${index}: [conversation turn with ${part.parts.length} parts]`);
            }
        });

        const result = await model.generateContentStream(conversationParts);

        let streamedText = '';
        let isFirstChunk = true;
        
        console.log('📥===== GEMINI STREAMING RESPONSE =====');
        let chunkCount = 0;
        
        for await (const chunk of result.stream) {
            // Check for cancellation before processing each chunk
            if (isCancelled) {
                console.log('🛑 Gemini streaming cancelled - stopping chunk processing');
                return;
            }
            
            const chunkText = chunk.text();
            streamedText += chunkText;
            chunkCount++;
            
            if (isFirstChunk) {
                // Record when first chunk is received from Gemini
                const geminiFirstChunkTime = Date.now();
                console.log(`[TIMING] 🚀 FIRST CHUNK FROM GEMINI received at: ${new Date(geminiFirstChunkTime).toISOString()}`);
                console.log(`[TIMING] 🚀 GEMINI first chunk time: ${geminiFirstChunkTime - geminiApiCallTime}ms from API call`);
                console.log(`[TIMING] 🚀 GEMINI first chunk content: "${chunkText.substring(0, 50)}${chunkText.length > 50 ? '...' : ''}"`);
                
                // Send timing update to main process
                if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                    global.mainWindow.webContents.send('timing-update', {
                        event: 'gemini_first_chunk_received',
                        timestamp: geminiFirstChunkTime,
                        time_from_api_call: geminiFirstChunkTime - geminiApiCallTime,
                        chunk_length: chunkText.length,
                        chunk_content: chunkText.substring(0, 100)
                    });
                }
            }
            
            console.log(`📦 Chunk ${chunkCount}:`, chunkText.length > 50 ? chunkText.substring(0,50) + "..." : chunkText);
            
            // Check for cancellation before calling onProgress
            if (!isCancelled) {
                onProgress(chunkText, isFirstChunk);
            }
            isFirstChunk = false;
        }
        
        console.log('📋===== GEMINI COMPLETE RESPONSE =====');
        console.log('✅ Total Chunks Received:', chunkCount);
        console.log('📄 Full Response Text:');
        console.log('---RESPONSE START---');
        console.log(streamedText);
        console.log('---RESPONSE END---');
        console.log('⏰ Response Complete Time:', new Date().toISOString());
        console.log('🚀===== GEMINI CHAT CALL END =====');
        console.log('');
        
        // Only call onComplete if not cancelled
        if (!isCancelled) {
            onComplete(streamedText, questionText);
        }

    } catch (error) {
        console.log('🚨===== GEMINI CHAT ERROR =====');
        console.log('❌ Error in generateTextResponse:', error);
        console.log('⏰ Error Time:', new Date().toISOString());
        console.log('=============================');
        onError(error);
    }
}

// Generate screenshot-based response (non-streaming for images)
async function generateScreenshotResponse(jobRole, keySkills, screenshots, onComplete, onError) {
    if (!genAI) {
        const error = new Error("Gemini AI not initialized. Please check API key configuration.");
        onError(error);
        return;
    }

    if (!screenshots || screenshots.length === 0) {
        const error = new Error("No screenshots provided for analysis.");
        onError(error);
        return;
    }

    try {
        // For screenshots, use Gemini 1.5 Pro for better image understanding
        const geminiProModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro-preview-05-06" });
        console.log("Using Gemini gemini-2.5-pro-preview-05-06 for screenshot analysis");
        
        // Get prompt from ai_service
        const prompt = getScreenshotPrompt(jobRole, keySkills);
        
        console.log('🚀===== GEMINI SCREENSHOT CALL START =====');
        console.log('📤 Job Role:', jobRole);
        console.log('🔧 Key Skills:', keySkills);
        console.log('🖼️ Number of Screenshots:', screenshots.length);
        console.log('📋 Full Prompt Sent to Gemini:');
        console.log('---PROMPT START---');
        console.log(prompt);
        console.log('---PROMPT END---');
        console.log('⏰ Request Time:', new Date().toISOString());
        
        const imageParts = screenshots.map((base64Image, index) => {
            console.log(`🖼️ Processing screenshot ${index + 1}, data (first 100 chars):`, typeof base64Image === 'string' ? base64Image.substring(0, 100) : 'Not a string');
            
            const match = typeof base64Image === 'string' ? base64Image.match(/^data:(image\/\w+);base64,(.+)$/) : null;
            if (!match) {
                console.error("❌ Invalid image data format for screenshot:", base64Image.substring(0, 100));
                throw new Error("Invalid image data format");
            }
            
            console.log(`✅ Screenshot ${index + 1} parsed successfully, MIME type: ${match[1]}, data length: ${match[2].length} chars`);
            
            return {
                inlineData: {
                    data: match[2],
                    mimeType: match[1]
                }
            };
        });

        console.log('🔄 Sending request to Gemini 2.5 Pro Preview with prompt + images...');
        console.log('==========================================');

        const result = await geminiProModel.generateContent([prompt, ...imageParts], { safetySettings });
        const response = result.response;

        if (!response) {
            const error = new Error("No response received from Gemini API");
            console.log('🚨===== GEMINI SCREENSHOT ERROR =====');
            console.log('❌ No response received from Gemini API');
            console.log('⏰ Error Time:', new Date().toISOString());
            console.log('====================================');
            onError(error);
            return;
        }

        const geminiText = response.text();
        
        console.log('📋===== GEMINI SCREENSHOT RESPONSE =====');
        console.log('📄 Full Response Text:');
        console.log('---RESPONSE START---');
        console.log(geminiText);
        console.log('---RESPONSE END---');
        console.log('⏰ Response Complete Time:', new Date().toISOString());
        console.log('🚀===== GEMINI SCREENSHOT CALL END =====');
        console.log('');
        
        onComplete(geminiText);

    } catch (error) {
        console.log('🚨===== GEMINI SCREENSHOT ERROR =====');
        console.log('❌ Error in generateScreenshotResponse:', error);
        console.log('⏰ Error Time:', new Date().toISOString());
        console.log('====================================');
        onError(error);
    }
}

module.exports = {
    initializeGemini,
    generateTextResponse,
    generateScreenshotResponse
};

module.exports.initializeGemini = initializeGemini; 