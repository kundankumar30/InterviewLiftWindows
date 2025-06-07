// cerebras_service.js - Module for Cerebras API interactions
const { Cerebras } = require('@cerebras/cerebras_cloud_sdk');
const { getTextPrompt, getSystemPrompt, getScreenshotPrompt } = require('./ai_service');

let cerebras = null;

// Initialize Cerebras client
function initializeCerebras() {
    const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;

    if (CEREBRAS_API_KEY) {
        try {
            cerebras = new Cerebras({
                apiKey: CEREBRAS_API_KEY
            });
            console.log("Cerebras SDK initialized successfully");
            return true;
        } catch (error) {
            console.error("Error initializing Cerebras SDK:", error);
            return false;
        }
    } else {
        console.error("CEREBRAS_API_KEY not found. Please set it in your environment variables.");
        return false;
    }
}

// Generate text-based response with conversation history support
async function generateTextResponse(jobRole, keySkills, context, chatHistory, onChunk, onComplete, onError, abortSignal = null) {
    let isCancelled = false;
    
    // Set up cancellation handler
    if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
            isCancelled = true;
            console.log('🛑 Cerebras request cancelled via abort signal');
        });
    }
    
    if (!cerebras) {
        const error = new Error("Cerebras client not initialized. Please check API key configuration.");
        onError(error);
        return;
    }

    // Validate minimum text length
    if (!context || context.trim().length < 10) {
        const error = new Error("Input text too short (minimum 10 characters required)");
        onError(error);
        return;
    }

    try {
        // Record when Cerebras API call starts
        const cerebrasApiCallTime = Date.now();
        console.log(`[TIMING] 🤖 CEREBRAS API CALL made at: ${new Date(cerebrasApiCallTime).toISOString()}`);
        console.log(`[TIMING] 🤖 CEREBRAS API text: "${context.substring(0, 100)}${context.length > 100 ? '...' : ''}"`);
        
        console.log('🚀===== CEREBRAS TEXT CALL START =====');
        console.log('📤 Job Role:', jobRole);
        console.log('📤 Key Skills:', keySkills);
        
        // Get the clean question text and system prompt
        const questionText = getTextPrompt(jobRole, keySkills, context);
        const systemPrompt = getSystemPrompt(jobRole, keySkills);
        
        console.log('🗣️ Clean Question:', questionText);
        console.log('🗣️ System Prompt Length:', systemPrompt.length, 'characters');

        // Convert history to Cerebras format and build messages array
        const messages = [
            { role: "system", content: systemPrompt }
        ];
        
        // Add conversation history if available
        if (chatHistory && chatHistory.length > 0) {
            console.log('📚 Adding conversation history to Cerebras call...');
            for (const turn of chatHistory) {
                if (turn.role === "user" && turn.parts && turn.parts[0]) {
                    messages.push({
                        role: "user", 
                        content: turn.parts[0].text
                    });
                } else if (turn.role === "model" && turn.parts && turn.parts[0]) {
                    messages.push({
                        role: "assistant",
                        content: turn.parts[0].text
                    });
                }
            }
            console.log('📚 Added', chatHistory.length, 'history turns to Cerebras call');
        }
        
        // Add current user message
        messages.push({
            role: "user",
            content: questionText
        });
        
        console.log('🚀===== CEREBRAS CHAT CALL START =====');
        console.log('📚 Total messages in conversation:', messages.length);
        console.log('📚 History Turns Passed:', (chatHistory || []).length); 
        console.log('🗣️ Final message array preview:');
        messages.forEach((msg, index) => {
            console.log(`  Message ${index} (${msg.role}): ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
        });
        console.log('⏰ Request Time:', new Date().toISOString());
        console.log('=======================================');
        
        // Stream the response with full conversation context
        const stream = await cerebras.chat.completions.create({
            model: "llama3.1-8b",
            messages: messages, // Use the full conversation history
            stream: true
        });
        
        let streamedText = '';
        let isFirstChunk = true;
        
        console.log('📥===== CEREBRAS STREAMING RESPONSE =====');
        let chunkCount = 0;
        
        for await (const chunk of stream) {
            // Check for cancellation before processing each chunk
            if (isCancelled) {
                console.log('🛑 Cerebras streaming cancelled - stopping chunk processing');
                return;
            }
            
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                streamedText += content;
                chunkCount++;
                
                if (isFirstChunk) {
                    // Record when first chunk is received from Cerebras
                    const cerebrasFirstChunkTime = Date.now();
                    console.log(`[TIMING] 🚀 FIRST CHUNK FROM CEREBRAS received at: ${new Date(cerebrasFirstChunkTime).toISOString()}`);
                    console.log(`[TIMING] 🚀 CEREBRAS first chunk time: ${cerebrasFirstChunkTime - cerebrasApiCallTime}ms from API call`);
                    console.log(`[TIMING] 🚀 CEREBRAS first chunk content: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
                    
                    // Send timing update to main process
                    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                        global.mainWindow.webContents.send('timing-update', {
                            event: 'cerebras_first_chunk_received',
                            timestamp: cerebrasFirstChunkTime,
                            time_from_api_call: cerebrasFirstChunkTime - cerebrasApiCallTime,
                            chunk_length: content.length,
                            chunk_content: content.substring(0, 100)
                        });
                    }
                }
                
                console.log(`📦 Chunk ${chunkCount}:`, content.length > 50 ? content.substring(0,50) + "..." : content);
                
                // Check for cancellation before calling onChunk
                if (!isCancelled) {
                    onChunk(content, isFirstChunk);
                }
                isFirstChunk = false;
            }
        }
        
        console.log('📋===== CEREBRAS COMPLETE RESPONSE =====');
        console.log('✅ Total Chunks Received:', chunkCount);
        console.log('📄 Full Response Text:');
        console.log('---RESPONSE START---');
        console.log(streamedText);
        console.log('---RESPONSE END---');
        console.log('⏰ Response Complete Time:', new Date().toISOString());
        console.log('🚀===== CEREBRAS CHAT CALL END =====');
        console.log('');
        
        // Only call onComplete if not cancelled
        if (!isCancelled) {
            onComplete(streamedText, questionText);
        }
        
    } catch (error) {
        console.log('🚨===== CEREBRAS CHAT ERROR =====');
        console.log('❌ Error in generateTextResponse:', error);
        console.log('⏰ Error Time:', new Date().toISOString());
        console.log('=============================');
        onError(error);
    }
}

module.exports = {
    initializeCerebras,
    generateTextResponse
    // Note: Cerebras Llama models are text-only, no vision/image support
}; 