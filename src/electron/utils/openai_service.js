// openai_service.js - Module for OpenAI API interactions
const OpenAI = require('openai');
const { getTextPrompt, getSystemPrompt, getScreenshotPrompt } = require('./ai_service');

let openai = null;

// Initialize OpenAI client
function initializeOpenAI() {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (OPENAI_API_KEY) {
        try {
            openai = new OpenAI({
                apiKey: OPENAI_API_KEY
            });
            console.log("OpenAI SDK initialized successfully");
            return true;
        } catch (error) {
            console.error("Error initializing OpenAI SDK:", error);
            return false;
        }
    } else {
        console.error("OPENAI_API_KEY not found. Please set it in your environment variables.");
        return false;
    }
}

// Generate text-based response with conversation history support
async function generateTextResponse(jobRole, keySkills, context, chatHistory, onProgress, onComplete, onError) {
    if (!openai) {
        const error = new Error("OpenAI client not initialized. Please check API key configuration.");
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
        console.log('🚀===== OPENAI TEXT CALL START =====');
        console.log('📤 Job Role:', jobRole);
        console.log('📤 Key Skills:', keySkills);
        
        // Get the clean question text and system prompt
        const questionText = getTextPrompt(jobRole, keySkills, context);
        const systemPrompt = getSystemPrompt(jobRole, keySkills);
        
        console.log('🗣️ Clean Question:', questionText);
        console.log('🗣️ System Prompt Length:', systemPrompt.length, 'characters');
        console.log('📚 Conversation History Length:', chatHistory ? chatHistory.length : 0, 'turns');

        // Build the conversation messages with system prompt, history, and current question
        const messages = [
            { role: "system", content: systemPrompt }
        ];
        
        // Add conversation history if available  
        if (chatHistory && chatHistory.length > 0) {
            console.log('📚 Adding conversation history to OpenAI call...');
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
            console.log('📚 Added', chatHistory.length, 'history turns to OpenAI call');
        }
        
        // Add current user message
        messages.push({
            role: "user",
            content: questionText
        });

        console.log('📋 Total messages in conversation:', messages.length);
        console.log('📋 Message array preview:');
        messages.forEach((msg, index) => {
            console.log(`  Message ${index} (${msg.role}): ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
        });

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages, // Use the full conversation history
            stream: true
        });
        
        let streamedText = '';
        let isFirstChunk = true;
        
        console.log('📥===== OPENAI STREAMING RESPONSE =====');
        let chunkCount = 0;
        
        for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                streamedText += content;
                chunkCount++;
                console.log(`📦 Chunk ${chunkCount}:`, content.length > 50 ? content.substring(0,50) + "..." : content);
                onProgress(content, isFirstChunk);
                isFirstChunk = false;
            }
        }
        
        console.log('📋===== OPENAI COMPLETE RESPONSE =====');
        console.log('✅ Total Chunks Received:', chunkCount);
        console.log('📄 Full Response Text:');
        console.log('---RESPONSE START---');
        console.log(streamedText);
        console.log('---RESPONSE END---');
        console.log('⏰ Response Complete Time:', new Date().toISOString());
        console.log('🚀===== OPENAI TEXT CALL END =====');
        console.log('');
        
        onComplete(streamedText, questionText);
        
    } catch (error) {
        console.log('🚨===== OPENAI TEXT ERROR =====');
        console.log('❌ Error in generateTextResponse:', error);
        console.log('⏰ Error Time:', new Date().toISOString());
        console.log('=============================');
        onError(error);
    }
}

// Generate screenshot-based response (non-streaming for images)
async function generateScreenshotResponse(jobRole, keySkills, screenshots, onComplete, onError) {
    if (!openai) {
        const error = new Error("OpenAI client not initialized. Please check API key configuration.");
        onError(error);
        return;
    }

    if (!screenshots || screenshots.length === 0) {
        const error = new Error("No screenshots provided for analysis.");
        onError(error);
        return;
    }

    try {
        // Get prompt from ai_service
        const prompt = getScreenshotPrompt(jobRole, keySkills);
        
        console.log('🚀===== OPENAI SCREENSHOT CALL START =====');
        console.log('🔥 Using GPT-4o 2024-11-20 latest model for enhanced screenshot analysis');
        console.log('📤 Job Role:', jobRole);
        console.log('🔧 Key Skills:', keySkills);
        console.log('🖼️ Number of Screenshots:', screenshots.length);
        console.log('📋 Full Prompt Sent to OpenAI:');
        console.log('---PROMPT START---');
        console.log(prompt);
        console.log('---PROMPT END---');
        console.log('⏰ Request Time:', new Date().toISOString());
        
        // Process images into content blocks
        const content = [
            { type: "text", text: prompt }
        ];
        
        for (let i = 0; i < screenshots.length; i++) {
            const base64Image = screenshots[i];
            
            // Parse base64 image data
            const match = typeof base64Image === 'string' ? base64Image.match(/^data:(image\/\w+);base64,(.+)$/) : null;
            if (!match) {
                console.error("❌ Invalid image data format for screenshot:", base64Image.substring(0, 100));
                throw new Error("Invalid image data format");
            }
            
            console.log(`✅ Screenshot ${i + 1} parsed successfully, MIME type: ${match[1]}, data length: ${match[2].length} chars`);
            
            // Add image to content blocks
            content.push({
                type: "image_url",
                image_url: {
                    url: base64Image
                }
            });
        }

        console.log('🔄 Sending request to OpenAI with prompt + images...');
        console.log('==========================================');

        // Generate content with text and image parts
        const response = await openai.chat.completions.create({
            model: "gpt-4o-2024-11-20", // Using latest 4o model for better screenshot analysis
            messages: [
                {
                    role: "user",
                    content: content
                }
            ]
        });

        if (!response || !response.choices || !response.choices[0]) {
            const error = new Error("No response received from OpenAI API");
            console.log('🚨===== OPENAI SCREENSHOT ERROR =====');
            console.log('❌ No response received from OpenAI API');
            console.log('⏰ Error Time:', new Date().toISOString());
            console.log('====================================');
            onError(error);
            return;
        }

        const openaiText = response.choices[0].message.content;
        
        console.log('📋===== OPENAI SCREENSHOT RESPONSE =====');
        console.log('📄 Full Response Text:');
        console.log('---RESPONSE START---');
        console.log(openaiText);
        console.log('---RESPONSE END---');
        console.log('⏰ Response Complete Time:', new Date().toISOString());
        console.log('🚀===== OPENAI SCREENSHOT CALL END =====');
        console.log('');
        
        onComplete(openaiText);
        
    } catch (error) {
        console.log('🚨===== OPENAI SCREENSHOT ERROR =====');
        console.log('❌ Error in generateScreenshotResponse:', error);
        console.log('⏰ Error Time:', new Date().toISOString());
        console.log('====================================');
        onError(error);
    }
}

module.exports = {
    initializeOpenAI,
    generateTextResponse,
    generateScreenshotResponse
}; 