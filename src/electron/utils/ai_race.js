// ai_race.js - Module for racing between different AI services
const { generateTextResponse: generateGeminiResponse, generateScreenshotResponse: generateGeminiScreenshotResponse } = require('./gemini_service');
const { generateTextResponse: generateOpenAIResponse, generateScreenshotResponse: generateOpenAIScreenshotResponse } = require('./openai_service');
const { generateTextResponse: generateCerebrasResponse } = require('./cerebras_service'); // Cerebras text-only, no vision support

// Race between AI services for text responses
async function raceTextResponse(jobRole, keySkills, context, chatHistory, onChunk, onComplete, onError) {
    let winnerFound = false;
    let activePromises = [];
    let errors = [];
    let abortControllers = new Map();

    // Track race timing
    const raceStartTime = Date.now();
    console.log(`[TIMING] 🏁 AI Race started at: ${new Date(raceStartTime).toISOString()}`);
    console.log(`[TIMING] 🏁 Racing: Gemini vs Cerebras (OpenAI disabled)`);

    // Function to handle the first chunk from any AI
    const handleFirstChunk = (content, isFirstChunk, source) => {
        if (isFirstChunk && !winnerFound) {
            winnerFound = true;
            const winTime = Date.now();
            console.log(`[TIMING] 🏆 ${source} won the race!`);
            console.log(`[TIMING] 🏆 Winner response time: ${winTime - raceStartTime}ms`);
            console.log(`[TIMING] 🏆 First chunk from ${source}: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
            
            // Send timing update to renderer
            if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                global.mainWindow.webContents.send('timing-update', {
                    event: 'ai_race_winner',
                    timestamp: winTime,
                    winner: source,
                    race_duration: winTime - raceStartTime,
                    first_chunk_length: content.length
                });
            }
            
            // Cancel other promises
            activePromises.forEach(p => {
                if (p.source !== source) {
                    console.log(`[TIMING] ❌ Cancelling ${p.source} response...`);
                    p.cancel();
            }
            });
        }
        onChunk(content, isFirstChunk);
    };

    // Function to handle completion
    const handleComplete = (text, prompt, source) => {
        if (!winnerFound) {
            winnerFound = true;
            console.log(`🏆 ${source} won the race!`);
            // Cancel other promises
            activePromises.forEach(p => {
                if (p.source !== source) {
                    console.log(`Cancelling ${p.source} response...`);
                    p.cancel();
                }
            });
        }
        onComplete(text, prompt);
    };

    // Function to handle errors
    const handleError = (error, source) => {
        console.error(`${source} error:`, error);
        errors.push({ source, error });
        
        // If all AIs have errored, call onError with the first error
        // Now only 2 AIs: Gemini and Cerebras
        if (errors.length === 2) {
            onError(errors[0].error);
        }
    };

    // Create cancelable promises for each AI
    const geminiPromise = {
        source: 'Gemini',
        promise: (async () => {
            const controller = new AbortController();
            abortControllers.set('Gemini', controller);
            try {
                await generateGeminiResponse(
                    jobRole,
                    keySkills,
                    context,
                    chatHistory,
                    (content, isFirstChunk) => handleFirstChunk(content, isFirstChunk, 'Gemini'),
                    (text, prompt) => handleComplete(text, prompt, 'Gemini'),
                    (error) => handleError(error, 'Gemini'),
                    controller.signal
                );
            } catch (error) {
                if (!controller.signal.aborted) {
                    handleError(error, 'Gemini');
        }
            }
        })(),
        cancel: () => {
            const controller = abortControllers.get('Gemini');
            if (controller) {
                controller.abort();
                abortControllers.delete('Gemini');
            }
        }
    };

    // OpenAI disabled - commenting out
    /*
    const openaiPromise = {
        source: 'OpenAI',
        promise: (async () => {
            const controller = new AbortController();
            abortControllers.set('OpenAI', controller);
            try {
                await generateOpenAIResponse(
            jobRole,
            keySkills,
            context,
            chatHistory,
                    (content, isFirstChunk) => handleFirstChunk(content, isFirstChunk, 'OpenAI'),
                    (text, prompt) => handleComplete(text, prompt, 'OpenAI'),
                    (error) => handleError(error, 'OpenAI')
                );
            } catch (error) {
                if (!controller.signal.aborted) {
                    handleError(error, 'OpenAI');
                }
            }
        })(),
        cancel: () => {
            const controller = abortControllers.get('OpenAI');
            if (controller) {
                controller.abort();
                abortControllers.delete('OpenAI');
            }
        }
    };
    */

    const cerebrasPromise = {
        source: 'Cerebras',
        promise: (async () => {
            const controller = new AbortController();
            abortControllers.set('Cerebras', controller);
            try {
                await generateCerebrasResponse(
            jobRole,
            keySkills,
            context,
            chatHistory,
                    (content, isFirstChunk) => handleFirstChunk(content, isFirstChunk, 'Cerebras'),
                    (text, prompt) => handleComplete(text, prompt, 'Cerebras'),
                    (error) => handleError(error, 'Cerebras'),
                    controller.signal
                );
            } catch (error) {
                if (!controller.signal.aborted) {
                    handleError(error, 'Cerebras');
                }
            }
        })(),
        cancel: () => {
            const controller = abortControllers.get('Cerebras');
            if (controller) {
                controller.abort();
                abortControllers.delete('Cerebras');
            }
        }
    };

    // Add only active promises (Gemini and Cerebras)
    activePromises = [geminiPromise, cerebrasPromise];

    // Start the race (without OpenAI)
    try {
        await Promise.race([
            geminiPromise.promise,
            cerebrasPromise.promise
        ]);
    } catch (error) {
        // Error handling is done in handleError
    } finally {
        // Clean up any remaining abort controllers
        abortControllers.forEach(controller => controller.abort());
        abortControllers.clear();
    }
}

// Race between AI services for screenshot responses
async function raceScreenshotResponse(jobRole, keySkills, screenshots, onComplete, onError) {
    let winnerFound = false;
    let activePromises = [];
    let errors = [];
    let abortControllers = new Map();

    console.log('🏁===== SCREENSHOT RACING START =====');
    console.log('📊 Racing: Gemini only (OpenAI disabled, Cerebras no vision support)');
    console.log('🖼️ Screenshots provided:', screenshots ? screenshots.length : 0);
    console.log('👔 Job Role:', jobRole);
    console.log('🔧 Key Skills:', keySkills);

    // Function to handle completion
    const handleComplete = (text, source) => {
        if (!winnerFound) {
            winnerFound = true;
            console.log(`🏆 ${source} won the screenshot race!`);
            console.log(`📝 Response received (${text.length} characters)`);
            // Cancel other promises (though only Gemini is running now)
            activePromises.forEach(p => {
                if (p.source !== source) {
                    console.log(`Cancelling ${p.source} response...`);
                    p.cancel();
                }
            });
            onComplete(text);
        } else {
            console.log(`⚠️ ${source} completed after winner was already determined`);
        }
    };

    // Function to handle errors
    const handleError = (error, source) => {
        console.error(`🚨 ${source} screenshot error:`, error);
        errors.push({ source, error });
        
        console.log(`📊 Screenshot errors so far: ${errors.length}/1`);
        
        // Since only Gemini is running, if it errors, call onError immediately
        if (errors.length === 1) {
            console.log('💥 Gemini screenshot processing failed, calling onError');
            onError(errors[0].error);
        }
    };

    // Create cancelable promise for Gemini only
    const geminiPromise = {
        source: 'Gemini',
        promise: (async () => {
            const controller = new AbortController();
            abortControllers.set('Gemini', controller);
            try {
                await generateGeminiScreenshotResponse(
                    jobRole,
                    keySkills,
                    screenshots,
                    (text) => handleComplete(text, 'Gemini'),
                    (error) => handleError(error, 'Gemini')
                );
            } catch (error) {
                if (!controller.signal.aborted) {
                    handleError(error, 'Gemini');
                }
            }
        })(),
        cancel: () => {
            const controller = abortControllers.get('Gemini');
            if (controller) {
                controller.abort();
                abortControllers.delete('Gemini');
            }
        }
    };

    // OpenAI disabled - commenting out
    /*
    const openaiPromise = {
        source: 'OpenAI',
        promise: (async () => {
            const controller = new AbortController();
            abortControllers.set('OpenAI', controller);
            try {
                await generateOpenAIScreenshotResponse(
                    jobRole,
                    keySkills,
                    screenshots,
                    (text) => handleComplete(text, 'OpenAI'),
                    (error) => handleError(error, 'OpenAI')
                );
            } catch (error) {
                if (!controller.signal.aborted) {
                    handleError(error, 'OpenAI');
                }
            }
        })(),
        cancel: () => {
            const controller = abortControllers.get('OpenAI');
            if (controller) {
                controller.abort();
                abortControllers.delete('OpenAI');
            }
        }
    };
    */

    // Add only Gemini promise
    activePromises = [geminiPromise];

    // Start Gemini processing (no race needed with only one service)
    try {
        console.log('🚀 Starting Gemini screenshot processing...');
        await geminiPromise.promise;
    } catch (error) {
        // Error handling is done in handleError
        console.log('💥 Gemini screenshot processing failed');
    } finally {
        // Clean up any remaining abort controllers
        abortControllers.forEach(controller => controller.abort());
        abortControllers.clear();
        console.log('🏁===== SCREENSHOT PROCESSING END =====');
    }
}

module.exports = {
    raceTextResponse,
    raceScreenshotResponse
}; 