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
async function generateTextResponse(jobRole, keySkills, context, chatHistory, onChunk, onComplete, onError) {
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

        // Convert history to Cerebras format
        const messages = [];
        
        // Add history if available
        if (chatHistory && chatHistory.length > 0) {
            for (const turn of chatHistory) {
                if (turn.role === "user") {
                    messages.push({
                        role: "user", 
                        content: turn.parts[0].text
                    });
                } else if (turn.role === "model") {
                    messages.push({
                        role: "assistant",
                        content: turn.parts[0].text
                    });
                }
            }
        }
        
        // Add current user message
        messages.push({
            role: "user",
            content: context
        });
        
        console.log('🚀===== CEREBRAS CHAT CALL START =====');
        console.log('📚 History Turns Passed:', (chatHistory || []).length / 2); 
        console.log('🗣️ Current User Message:');
        console.log('---PROMPT START---');
        console.log(context);
        console.log('---PROMPT END---');
        console.log('⏰ Request Time:', new Date().toISOString());
        console.log('=======================================');
        
        // Stream the response
        const stream = await cerebras.chat.completions.create({
            model: "llama3.1-8b",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: questionText }
            ],
            stream: true
        });
        
        let streamedText = '';
        let isFirstChunk = true;
        
        console.log('📥===== CEREBRAS STREAMING RESPONSE =====');
        let chunkCount = 0;
        
        for await (const chunk of stream) {
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
                onChunk(content, isFirstChunk);
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
        
        onComplete(streamedText, questionText);
        
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