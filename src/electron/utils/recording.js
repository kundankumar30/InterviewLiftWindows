/*
 * recording.js - Audio recording and AI-powered transcription service
 * 
 * NEW PRIMARY AI CALLING CONDITIONS (Updated):
 * 1. Minimum text length: 10+ characters
 * 2. Natural sentence breaks: text ends with ., !, ? 
 * 3. Similarity check: Content must be <85% similar to last AI call (prevents repetitive responses)
 * 4. Timeout condition: If 5 seconds pass with 25+ characters, AI is called even without sentence ending
 * 
 * These conditions ensure AI is called at natural conversation points while preventing
 * duplicate responses and maintaining responsive interaction.
 */

const { spawn } = require("node:child_process");
const path = require("path");
const os = require("os");
const { app, dialog } = require("electron");
const { checkPermissions } = require("./permission");
const fs = require('fs');
const GoogleSpeechTranscriber = require('./google_speech_transcriber');
const WindowsAudioRecorder = require('./windows_audio_recorder');
const VoiceActivityDetector = require('./voice_activity_detector');
const { initializeAI, getGeminiModel, getTextPrompt } = require('./ai_service');
const { raceTextResponse, raceScreenshotResponse } = require('./ai_race');

let swiftProcess = null;
let windowsRecorder = null;
let googleSpeechTranscriber = null;
let voiceActivityDetector = null;
let isGoogleSTTModelReady = false;
const platform = os.platform();

// VAD statistics
let vadStats = {
    totalChunks: 0,
    voiceChunks: 0,
    discardedChunks: 0,
    apiCallsSaved: 0
};

// Restart management
let restartCounter = 0;
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_RESET_INTERVAL = 5 * 60 * 1000; // 5 minutes
let lastRestartTime = 0;

// Conversation history for contextual AI responses
let currentConversationHistory = [];

// Paragraph accumulation
let currentParagraph = "";
let paragraphLastUpdated = 0;
let paragraphInProgress = false;
const PARAGRAPH_TIMEOUT = 5000; // 5 seconds timeout for paragraph completion
let paragraphTimeoutId = null;
let lastAIResponse = null;
let lastResponseId = 0;
let lastAICallText = null;

// Determine base path for resources
const resourcesPath = app.isPackaged ? process.resourcesPath : app.getAppPath();

// Path to your compiled Swift recorder executable
let swiftRecorderPath = app.isPackaged
    ? path.join(resourcesPath, 'Recorder')
    : path.join(app.getAppPath(), 'src', 'swift', 'Recorder');

// Path to Google Cloud credentials - using stt.json from app directory
let googleCredentialsPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'stt.json')
    : path.join(app.getAppPath(), 'stt.json');

// Verify credentials file exists
if (fs.existsSync(googleCredentialsPath)) {
    console.log(`Google credentials found at: ${googleCredentialsPath}`);
} else {
    console.error(`Google credentials NOT found at: ${googleCredentialsPath}`);
}

// Initialize AI services for both Gemini and OpenAI

// Process audio chunk with Voice Activity Detection
function processAudioChunkWithVAD(audioDataChunk) {
    if (!voiceActivityDetector || !googleSpeechTranscriber || !isGoogleSTTModelReady) {
        return;
    }
    
    vadStats.totalChunks++;
    
    try {
        // Run VAD analysis on the audio chunk
        const vadResult = voiceActivityDetector.processAudioChunk(audioDataChunk);
        
        if (vadResult.hasVoice) {
            // Voice detected - send to Google STT
            vadStats.voiceChunks++;
            
            // CRITICAL: Send buffered chunks first if voice just started
            if (vadResult.bufferedChunks && vadResult.bufferedChunks.length > 0) {
                console.log(`🎯 VAD: Sending ${vadResult.bufferedChunks.length} buffered chunks to prevent word loss`);
                for (const bufferedChunk of vadResult.bufferedChunks) {
                    googleSpeechTranscriber.processAudioChunk(bufferedChunk);
                }
            } else {
                // Normal voice chunk processing
            googleSpeechTranscriber.processAudioChunk(audioDataChunk);
            }
            
            // Log voice activity periodically
            if (vadStats.voiceChunks % 100 === 0) {
                const voicePercentage = ((vadStats.voiceChunks / vadStats.totalChunks) * 100).toFixed(1);
                const savedPercentage = ((vadStats.discardedChunks / vadStats.totalChunks) * 100).toFixed(1);
                console.log(`🎤 VAD: ${voicePercentage}% voice, ${savedPercentage}% filtered out (${vadStats.apiCallsSaved} API calls saved)`);
            }
        } else {
            // No voice detected - discard chunk
            vadStats.discardedChunks++;
            vadStats.apiCallsSaved++;
            
            // Periodic logging of filtered chunks
            if (vadStats.discardedChunks % 500 === 0) {
                const filteredPercentage = ((vadStats.discardedChunks / vadStats.totalChunks) * 100).toFixed(1);
                console.log(`🔇 VAD: Filtered ${filteredPercentage}% non-voice audio (${vadStats.apiCallsSaved} API calls saved)`);
            }
        }
        
    } catch (error) {
        console.error('🎤 VAD processing error:', error);
        // Fallback: send to STT without VAD if there's an error
        googleSpeechTranscriber.processAudioChunk(audioDataChunk);
    }
}

// Get VAD statistics for debugging
function getVADStatistics() {
    if (!voiceActivityDetector) {
        return { error: 'VAD not initialized' };
    }
    
    const vadDetectorStats = voiceActivityDetector.getStatistics();
    return {
        ...vadStats,
        detector: vadDetectorStats,
        efficiency: {
            voicePercentage: vadStats.totalChunks > 0 ? (vadStats.voiceChunks / vadStats.totalChunks * 100).toFixed(2) : 0,
            filteredPercentage: vadStats.totalChunks > 0 ? (vadStats.discardedChunks / vadStats.totalChunks * 100).toFixed(2) : 0,
            apiCallsSavedPercentage: vadStats.totalChunks > 0 ? (vadStats.apiCallsSaved / vadStats.totalChunks * 100).toFixed(2) : 0
        }
    };
}

async function startLiveTranscription() {
    console.log(`Starting live transcription on platform: ${platform}`);
    
    const isPermissionGranted = await checkPermissions();
    if (!isPermissionGranted) {
        global.mainWindow.loadFile("./src/electron/screens/permission-denied/screen.html");
        return false;
    }

    // Check if recording is already in progress
    if (platform === 'darwin' && swiftProcess) {
        console.log("macOS audio process seems to be already running, stop it first or wait.");
        return false;
    }
    
    if (platform === 'win32' && windowsRecorder && windowsRecorder.isActive()) {
        console.log("Windows audio recorder already active, stop it first or wait.");
        return false;
    }

    // Validate platform-specific requirements
    if (platform === 'darwin') {
        if (!fs.existsSync(swiftRecorderPath)) {
            console.error('Swift executable not found at:', swiftRecorderPath);
            dialog.showErrorBox("Configuration Error", "Swift recorder executable not found.");
            return false;
        }
    } else if (platform === 'win32') {
        // Windows uses C# recorder for system audio capture
        console.log("Windows platform detected - will use C# Recorder for system audio capture");
    } else {
        console.error(`Unsupported platform: ${platform}`);
        dialog.showErrorBox("Platform Error", `This application currently supports macOS and Windows only. Your platform: ${platform}`);
        return false;
    }

    // Check Google credentials
    if (!fs.existsSync(googleCredentialsPath)) {
        console.error('Google Cloud credentials not found at:', googleCredentialsPath);
        dialog.showErrorBox("Configuration Error", "Google Cloud credentials not found.");
        return false;
    }

    // Initialize Voice Activity Detector
    if (!voiceActivityDetector) {
        console.log("Initializing Voice Activity Detector...");
        voiceActivityDetector = new VoiceActivityDetector({
            sampleRate: 16000,
            energyThreshold: 0.01,     // Adjust based on environment
            silenceThreshold: 0.005,   // Lower threshold for silence detection
            voiceMinDuration: 50,      // Reduced from 150ms to 50ms for faster post-reset detection
            silenceMinDuration: 500    // Minimum 500ms of silence to stop detection
        });
        
        // Reset VAD statistics
        vadStats = {
            totalChunks: 0,
            voiceChunks: 0,
            discardedChunks: 0,
            apiCallsSaved: 0
        };
        
        console.log("✅ Voice Activity Detector ready - will filter non-voice audio");
        console.log("🔧 Optimized for faster post-reset speech detection");
    }

    // Reset paragraph accumulation
    currentParagraph = "";
    paragraphLastUpdated = 0;
    paragraphInProgress = false;
    if (paragraphTimeoutId) {
        clearTimeout(paragraphTimeoutId);
        paragraphTimeoutId = null;
    }

    // Initialize Google Speech-to-Text transcriber
    if (!googleSpeechTranscriber) {
        console.log("Initializing Google Speech-to-Text transcriber...");
        isGoogleSTTModelReady = false;
        
        googleSpeechTranscriber = new GoogleSpeechTranscriber({
            sampleRateHertz: 16000,
            languageCode: 'en-US',
            credentialsPath: googleCredentialsPath,
            inputSampleRate: 16000,
            inputChannels: 1,
            inputFormat: 'FLOAT32',
            onTranscription: (data) => {
                if (data.type === 'MODEL_READY_FOR_TRANSCRIPTION') {
                    console.log("Google Speech-to-Text is ready.");
                    isGoogleSTTModelReady = true;
                    return;
                }
                
                if (isGoogleSTTModelReady && data.text) {
                    // Record STT received timestamp with specific type
                    const sttReceivedTime = Date.now();
                    
                    if (data.is_final) {
                        console.log(`[TIMING] 📝 FINAL STT received at: ${new Date(sttReceivedTime).toISOString()}`);
                        console.log(`[TIMING] 📝 FINAL STT text: "${data.text}"`);
                        console.log(`[TIMING] 📝 FINAL STT length: ${data.text.length} chars`);
                    } else {
                        console.log(`[TIMING] 📝 INITIAL STT received at: ${new Date(sttReceivedTime).toISOString()}`);
                        console.log(`[TIMING] 📝 INITIAL STT text: "${data.text}"`);
                        console.log(`[TIMING] 📝 INITIAL STT length: ${data.text.length} chars`);
                    }
                    
                    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                        global.mainWindow.webContents.send('timing-update', {
                            event: data.is_final ? 'final_stt_received' : 'initial_stt_received',
                            timestamp: sttReceivedTime,
                            text_length: data.text.length,
                            text_content: data.text,
                            is_final: data.is_final
                        });
                        
                        global.mainWindow.webContents.send('transcription-update', {
                            text: data.text,
                            is_final: data.is_final
                        });
                    }
                    
                    // Update paragraph with the transcription
                    if (data.is_final && data.text.trim().length > 0) {
                        updateParagraph(data.text.trim());
                    }
                }
            },
            onError: (message, error) => {
                console.error(`Google Speech Error: ${message}`, error);
                // Error logging only - no UI notifications to keep suggestions clean
            }
        });
        googleSpeechTranscriber.startStream();
    } else if (!isGoogleSTTModelReady) {
        // If transcriber exists but is not ready (e.g. after a reset that failed before readiness)
        console.log("Google Speech transcriber exists but not ready, re-initializing stream.");
        // Fast restart - reuse existing connection
        isGoogleSTTModelReady = false;
        googleSpeechTranscriber.startStream();
    } else {
        // Transcriber is ready - just restart the stream for fast reset
        console.log("Google Speech transcriber ready, performing fast stream restart.");
        isGoogleSTTModelReady = false;
        googleSpeechTranscriber.startStream();
    }

    // Start platform-specific audio capture
    if (platform === 'darwin') {
        return await startMacOSRecording();
    } else if (platform === 'win32') {
        return await startWindowsRecording();
    }
    
    return false;
}

// macOS recording using Swift
async function startMacOSRecording() {
    console.log("Starting macOS audio recording with Swift process from:", swiftRecorderPath);
    swiftProcess = spawn(swiftRecorderPath, []);

    let swiftJsonBuffer = '';
    swiftProcess.stderr.on('data', (data) => {
        swiftJsonBuffer += data.toString();
        let boundary;
        while ((boundary = swiftJsonBuffer.indexOf('\n')) !== -1) {
            const message = swiftJsonBuffer.substring(0, boundary).trim();
            swiftJsonBuffer = swiftJsonBuffer.substring(boundary + 1);
            if (message) {
                try {
                    const jsonData = JSON.parse(message);
                    if (jsonData.type === "VIDEO_FRAME" && jsonData.imageData) {
                        if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                            global.mainWindow.webContents.send("video-frame", jsonData.imageData);
                        }
                    } else if (jsonData.code) {
                        console.log('Swift Status/Error:', jsonData);
                        if (jsonData.code === "RECORDING_STARTED") {
                            // Reset restart counter on successful start
                            restartCounter = 0;
                            console.log("✅ Audio recording started successfully - restart counter reset");
                            
                            if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                                global.mainWindow.webContents.send("recording-status", "LIVE_TRANSCRIPTION_STARTED", Date.now());
                            }
                        } else if (jsonData.code === "STREAM_ERROR_OR_STOPPED_EXTERNALLY" ||
                                 jsonData.code === "STREAM_FUNCTION_NOT_CALLED_TIMEOUT" ||
                                 jsonData.code === "NO_AUDIO_FRAMES_RECEIVED_TIMEOUT" ||
                                 jsonData.code === "CAPTURE_FAILED_IN_INITIATE" ||
                                 jsonData.code === "CONTENT_FETCH_ERROR" ||
                                 jsonData.code === "NO_CONTENT_FOUND" ||
                                 jsonData.code === "NO_DISPLAY_FOUND") {
                            console.error(`Swift Error: ${jsonData.code} - ${jsonData.error_message || jsonData.error || ''}`);
                            
                            // Handle recoverable errors with automatic restart
                            if (jsonData.code === "STREAM_ERROR_OR_STOPPED_EXTERNALLY" ||
                                jsonData.code === "STREAM_FUNCTION_NOT_CALLED_TIMEOUT" ||
                                jsonData.code === "NO_AUDIO_FRAMES_RECEIVED_TIMEOUT") {
                                
                                // Check restart limits
                                const currentTime = Date.now();
                                if (currentTime - lastRestartTime > RESTART_RESET_INTERVAL) {
                                    // Reset counter after interval
                                    restartCounter = 0;
                                }
                                
                                if (restartCounter >= MAX_RESTART_ATTEMPTS) {
                                    console.error(`🚫 Maximum restart attempts (${MAX_RESTART_ATTEMPTS}) exceeded. Manual restart required.`);
                                    // Log error only - no UI notification to keep suggestions clean
                                    console.error(`🚫 Audio Error: Failed ${MAX_RESTART_ATTEMPTS} times. Manual restart required.`);
                                    dialog.showErrorBox("Audio Restart Limit Reached", 
                                        `Audio recording has failed ${MAX_RESTART_ATTEMPTS} times. Please restart the application or use Cmd+K to reset.`);
                                    stopLiveTranscription(true);
                                    return;
                                }
                                
                                restartCounter++;
                                lastRestartTime = currentTime;
                                
                                let restartMessage = "";
                                if (jsonData.code === "STREAM_FUNCTION_NOT_CALLED_TIMEOUT") {
                                    restartMessage = `Audio stream timeout due to silence. Auto-restarting... (${restartCounter}/${MAX_RESTART_ATTEMPTS})`;
                                    console.log("🔄 " + restartMessage);
                                } else if (jsonData.code === "NO_AUDIO_FRAMES_RECEIVED_TIMEOUT") {
                                    restartMessage = `No audio frames received. Auto-restarting... (${restartCounter}/${MAX_RESTART_ATTEMPTS})`;
                                    console.log("🔄 " + restartMessage);
                                } else {
                                    restartMessage = `Swift stream was stopped. Auto-restarting... (${restartCounter}/${MAX_RESTART_ATTEMPTS})`;
                                    console.log("🔄 " + restartMessage);
                                }
                                
                                // Log restart attempt - no UI notification to keep suggestions clean
                                console.log(`🔄 ${restartMessage}`);
                                
                                stopLiveTranscription(true); // Stop current state with full reset
                                setTimeout(() => startLiveTranscription(), 2000); // Attempt restart
                            } else {
                                // Handle non-recoverable errors
                                console.error(`Critical Swift Error: ${jsonData.code} - ${jsonData.error_message || jsonData.error || ''}`);
                                dialog.showErrorBox("Recording Error", `Recorder stopped: ${jsonData.code}`);
                                stopLiveTranscription(true); // Full reset if critical error
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Failed to parse Swift message:', message, e);
                }
            }
        }
    });

    swiftProcess.stdout.on('data', (audioDataChunk) => {
        if (voiceActivityDetector && googleSpeechTranscriber && isGoogleSTTModelReady) {
            try {
                // Process audio chunk with VAD filtering
                processAudioChunkWithVAD(audioDataChunk);
            } catch (e) {
                console.error('Failed to process audio chunk with VAD:', e);
                stopLiveTranscription(true); // Reset if processing fails
            }
        }
    });

    swiftProcess.on('error', (err) => {
        console.error('Failed to start Swift process:', err);
        dialog.showErrorBox("Swift Process Error", `Failed to start recorder: ${err.message}`);
        stopLiveTranscription(true);
    });

    swiftProcess.on('close', (code) => {
        console.log(`Swift process exited with code ${code}`);
        swiftProcess = null;
        // Optionally, if Swift exits unexpectedly, notify UI or attempt restart
        if (code !== 0 && code !== null) { // SIGINT typically results in null or 0
            console.warn(`Swift process exited unexpectedly with code: ${code}.`);
             if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                global.mainWindow.webContents.send("recording-status", "LIVE_TRANSCRIPTION_FAILED_TO_START");
                // Log error only - no UI notification to keep suggestions clean
                console.error(`Recorder Error: Audio recorder process stopped unexpectedly (code: ${code}). Please try restarting the assistant.`);
            }
        }
    });
    return true;
}

// Windows recording using C# Recorder
async function startWindowsRecording() {
    console.log("Starting Windows audio recording with C# Recorder");
    
    if (!windowsRecorder) {
        windowsRecorder = new WindowsAudioRecorder();
    }
    
    windowsRecorder.setCallbacks({
        onAudioData: (audioData) => {
            if (voiceActivityDetector && googleSpeechTranscriber && isGoogleSTTModelReady) {
                try {
                    // Process audio chunk with VAD filtering
                    processAudioChunkWithVAD(audioData);
                } catch (e) {
                    console.error('Failed to process audio chunk with VAD:', e);
                    stopLiveTranscription(true); // Reset if processing fails
                }
            }
        },
        onStatusUpdate: (status) => {
            console.log('Windows Recorder Status:', status);
            if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                if (status.code === "RECORDING_STARTED") {
                    global.mainWindow.webContents.send("recording-status", "LIVE_TRANSCRIPTION_STARTED", Date.now());
                    
                    // Start screen capture for thumbnail on Windows
                    startWindowsScreenCapture();
                } else if (status.code === "RECORDING_STOPPED") {
                    global.mainWindow.webContents.send("recording-status", "LIVE_TRANSCRIPTION_STOPPED", Date.now());
                    
                    // Stop screen capture when recording stops
                    stopWindowsScreenCapture();
                }
            }
        },
        onError: (error) => {
            console.error('Windows Recorder Error:', error);
            console.error('Windows Audio Error:', error.message || error.code);
            
            // Only stop transcription for critical errors, not startup timeouts
            if (error.code === 'RECORDER_STARTUP_TIMEOUT') {
                console.log('🚫 C# Recorder startup timeout - keeping transcription alive for retry');
                // Don't stop transcription for startup timeout - it might work on retry
                
                // Send status update but don't stop transcription
                if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                    global.mainWindow.webContents.send("recording-status", "LIVE_TRANSCRIPTION_STARTED", Date.now());
                }
            } else if (error.code === 'FFMPEG_NOT_FOUND') {
                console.log('🔄 Stopping transcription due to missing FFmpeg');
                stopLiveTranscription(true);
                
                if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                    global.mainWindow.webContents.send("recording-status", "LIVE_TRANSCRIPTION_FAILED_TO_START");
                }
                
                dialog.showErrorBox("FFmpeg Required", 
                    "FFmpeg is required for Windows audio capture. Please install FFmpeg and ensure it's in your system PATH, then restart the application.");
            } else if (error.code === 'RECORDER_PROCESS_ERROR' || error.code === 'RECORDER_START_ERROR') {
                console.log('🔄 Stopping transcription due to critical recorder error:', error.code);
                stopLiveTranscription(true);
                
                if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                    global.mainWindow.webContents.send("recording-status", "LIVE_TRANSCRIPTION_FAILED_TO_START");
                }
            } else {
                console.log('🚫 C# Recorder non-critical error - keeping transcription alive:', error.code);
                // For other errors, keep transcription alive - Google STT can work without constant audio
            }
        }
    });
    
    const success = await windowsRecorder.startRecording();
    if (!success) {
        console.error('Failed to start Windows audio recording');
        
        // Stop transcription service when audio fails to start
        console.log('🔄 Stopping transcription due to Windows audio startup failure');
        stopLiveTranscription(true);
        
        // Send status update to UI
        if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
            global.mainWindow.webContents.send("recording-status", "LIVE_TRANSCRIPTION_FAILED_TO_START");
        }
        
        return false;
    }
    
    return true;
}

// Windows screen capture for thumbnail
let windowsScreenCaptureInterval = null;

function startWindowsScreenCapture() {
    if (windowsScreenCaptureInterval) {
        clearInterval(windowsScreenCaptureInterval);
    }
    
    console.log('🖼️ Starting Windows screen capture for thumbnail');
    
    // Capture screen every 2 seconds for thumbnail
    windowsScreenCaptureInterval = setInterval(async () => {
        try {
            const { screen } = require('electron');
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.workAreaSize;
            
            // Use Electron's desktopCapturer to capture screen
            const { desktopCapturer } = require('electron');
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: 320, height: 240 } // Small thumbnail size
            });
            
            if (sources.length > 0) {
                const primarySource = sources[0];
                if (primarySource.thumbnail) {
                    // Convert NativeImage to base64
                    const imageData = primarySource.thumbnail.toJPEG(80).toString('base64'); // 80% quality
                    
                    // Send to renderer for thumbnail display
                    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                        global.mainWindow.webContents.send("video-frame", imageData);
                    }
                }
            }
        } catch (error) {
            console.warn('Windows screen capture error:', error.message);
        }
    }, 2000); // Capture every 2 seconds
}

function stopWindowsScreenCapture() {
    if (windowsScreenCaptureInterval) {
        console.log('🖼️ Stopping Windows screen capture');
        clearInterval(windowsScreenCaptureInterval);
        windowsScreenCaptureInterval = null;
    }
}

function stopLiveTranscription(fullyResetTranscriber = false) {
    console.log(`Stopping live transcription on platform: ${platform}...`);
    
    // Stop platform-specific audio capture
    if (platform === 'darwin') {
        if (swiftProcess && !swiftProcess.killed) {
            swiftProcess.kill('SIGINT');
            console.log("Sent SIGINT to Swift process.");
            swiftProcess = null; // Ensure it's marked as null after killing
        }
    } else if (platform === 'win32') {
        if (windowsRecorder && windowsRecorder.isActive()) {
            windowsRecorder.stopRecording();
            console.log("Stopped Windows audio recorder.");
        }
        
        // Also stop Windows screen capture
        stopWindowsScreenCapture();
    }
    
    if (fullyResetTranscriber && googleSpeechTranscriber) {
        console.log("Fully resetting Google Speech transcriber.");
        googleSpeechTranscriber.stop();
        googleSpeechTranscriber = null;
        isGoogleSTTModelReady = false;
    }
    
    // Reset VAD on full reset
    if (fullyResetTranscriber && voiceActivityDetector) {
        console.log("Resetting Voice Activity Detector.");
        voiceActivityDetector.reset();
        vadStats = {
            totalChunks: 0,
            voiceChunks: 0,
            discardedChunks: 0,
            apiCallsSaved: 0
        };
    }
    // If not fullyResetTranscriber, STT instance is kept.
    // Its internal stream would have ended or timed out from lack of data.

    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send("recording-status", "LIVE_TRANSCRIPTION_STOPPED", Date.now());
    }

    // Reset paragraph accumulation
    currentParagraph = "";
    paragraphLastUpdated = 0;
    paragraphInProgress = false;
    if (paragraphTimeoutId) {
        clearTimeout(paragraphTimeoutId);
        paragraphTimeoutId = null;
    }
}

app.on('will-quit', () => {
    console.log(`Cleaning up on app quit for platform: ${platform}...`);
    
    if (googleSpeechTranscriber) {
        googleSpeechTranscriber.stop();
        googleSpeechTranscriber = null;
    }
    
    if (voiceActivityDetector) {
        const finalStats = getVADStatistics();
        console.log('🎤 Final VAD Statistics:', finalStats);
        voiceActivityDetector = null;
    }
    
    // Clean up platform-specific resources
    if (platform === 'darwin') {
        if (swiftProcess && !swiftProcess.killed) {
            swiftProcess.kill('SIGINT');
            swiftProcess = null;
        }
    } else if (platform === 'win32') {
        if (windowsRecorder) {
            windowsRecorder.destroy();
            windowsRecorder = null;
        }
    }
});

async function resetFullTranscriptionService() {
    console.log("Executing full transcription service reset.");
    
    // Reset restart counter on manual reset
    restartCounter = 0;
    console.log("🔄 Manual reset triggered - restart counter reset");
    
    // Reset conversation history to start fresh
    currentConversationHistory = [];
    console.log("📚 Conversation history cleared for fresh start");
    
    // Send immediate status update to show reset is happening
    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send("recording-status", "LIVE_TRANSCRIPTION_STOPPED", Date.now());
    }
    
    stopLiveTranscription(true); 
    
    // Reduced delay for faster reset - 50ms is sufficient for cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const success = await startLiveTranscription();
    
    if (success) {
        console.log("✅ Manual reset completed successfully");
    } else {
        console.error("❌ Manual reset failed to restart transcription");
    }
    
    // Reset paragraph accumulation
    currentParagraph = "";
    paragraphLastUpdated = 0;
    paragraphInProgress = false;
    if (paragraphTimeoutId) {
        clearTimeout(paragraphTimeoutId);
        paragraphTimeoutId = null;
    }
    
    return success;
}

// Function to clear conversation history (can be called from main process)
function clearConversationHistory() {
    currentConversationHistory = [];
    console.log("📚 Conversation history manually cleared");
    
    // Reset paragraph and response tracking
    currentParagraph = "";
    paragraphLastUpdated = 0;
    paragraphInProgress = false;
    lastAIResponse = null;
    lastResponseId = 0;
    lastAICallText = null; // Reset similarity tracking
    if (paragraphTimeoutId) {
        clearTimeout(paragraphTimeoutId);
        paragraphTimeoutId = null;
    }
}

// Function to update the current paragraph and handle timeouts
function updateParagraph(text) {
    // Reset any existing timeout
    if (paragraphTimeoutId) {
        clearTimeout(paragraphTimeoutId);
        paragraphTimeoutId = null;
    }
    
    // Update the current paragraph
    if (!paragraphInProgress) {
        // Start a new paragraph
        currentParagraph = text;
        paragraphInProgress = true;
        console.log(`📝 Starting new paragraph: "${currentParagraph}"`);
    } else {
        // Append to existing paragraph
        currentParagraph += " " + text;
        console.log(`📝 Appending to paragraph: "${currentParagraph}"`);
    }
    
    // Update the timestamp
    paragraphLastUpdated = Date.now();
    
    // NEW PRIMARY CONDITIONS:
    // 1. Minimum text length: 10+ characters
    // 2. Natural sentence breaks: when text ends with ., !, ?
    // 3. Similarity check: Content must be <85% similar to last AI call
    // 4. Timeout condition: If 5 seconds pass with 25+ characters, call AI anyway
    
    const textLength = currentParagraph.trim().length;
    const hasMinimumLength = textLength >= 10;
    const hasNaturalBreak = text.endsWith('.') || text.endsWith('!') || text.endsWith('?');
    
    console.log(`📊 AI Call Conditions Check:`);
    console.log(`   Text length: ${textLength} (min 10: ${hasMinimumLength})`);
    console.log(`   Natural break: ${hasNaturalBreak}`);
    
    // Check if we should send to AI based on new conditions
    const shouldSendToAI = hasMinimumLength && hasNaturalBreak;
    
    if (shouldSendToAI) {
        console.log(`📤 Natural break detected - checking similarity before AI call`);
        
        // Check similarity with last AI call to prevent repetitive responses (<85% similar)
        if (lastAICallText) {
            const similarity = calculateSimilarity(currentParagraph.trim(), lastAICallText);
            const isUnderSimilarityThreshold = similarity < 0.85;
            
            console.log(`   Similarity: ${(similarity * 100).toFixed(1)}% (threshold: <85%: ${isUnderSimilarityThreshold})`);
            
            if (!isUnderSimilarityThreshold) {
                console.log(`🔄 Skipping AI call - content too similar (${(similarity * 100).toFixed(1)}% >= 85%)`);
                // Reset paragraph without sending to AI
                paragraphInProgress = false;
                currentParagraph = "";
                return;
            }
        }
        
        console.log(`✅ All conditions met - sending to AI: "${currentParagraph}"`);
        
        // Store this text for similarity comparison
        lastAICallText = currentParagraph.trim();
        
        // Send to AI
        sendToGemini(currentParagraph.trim());
        
        // Reset paragraph after sending
        paragraphInProgress = false;
        currentParagraph = "";
    } else {
        // Set a timeout to handle the 5-second condition with 25+ characters
        const timeoutDuration = 5000; // 5 seconds as specified
        
        console.log(`⏱️  Setting ${timeoutDuration/1000}s timeout (current length: ${textLength})`);
        
        paragraphTimeoutId = setTimeout(() => {
            const finalTextLength = currentParagraph.trim().length;
            const hasTimeoutMinimum = finalTextLength >= 25;
            
            console.log(`⏰ Timeout triggered - length: ${finalTextLength} (min 25: ${hasTimeoutMinimum})`);
            
            if (paragraphInProgress && hasTimeoutMinimum) {
                console.log(`📝 Timeout condition met - checking similarity before AI call`);
                
                // Check similarity before sending
                if (lastAICallText) {
                    const similarity = calculateSimilarity(currentParagraph.trim(), lastAICallText);
                    const isUnderSimilarityThreshold = similarity < 0.85;
                    
                    console.log(`   Timeout similarity: ${(similarity * 100).toFixed(1)}% (threshold: <85%: ${isUnderSimilarityThreshold})`);
                    
                    if (!isUnderSimilarityThreshold) {
                        console.log(`🔄 Timeout paragraph skipped - too similar (${(similarity * 100).toFixed(1)}% >= 85%)`);
                        paragraphInProgress = false;
                        currentParagraph = "";
                        return;
                    }
                }
                
                console.log(`✅ Timeout condition with similarity check passed - sending to AI`);
                lastAICallText = currentParagraph.trim();
                sendToGemini(currentParagraph.trim());
            } else if (paragraphInProgress) {
                console.log(`❌ Timeout triggered but insufficient length (${finalTextLength} < 25 chars)`);
            }
            
            paragraphInProgress = false;
            currentParagraph = "";
            paragraphTimeoutId = null;
        }, timeoutDuration);
    }
}

// Simple similarity calculation function
function calculateSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    
    // Normalize texts
    const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const norm1 = normalize(text1);
    const norm2 = normalize(text2);
    
    if (norm1 === norm2) return 1;
    if (norm1.length === 0 || norm2.length === 0) return 0;
    
    // Simple word-based similarity
    const words1 = norm1.split(/\s+/);
    const words2 = norm2.split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalUniqueWords = new Set([...words1, ...words2]).size;
    
    return commonWords.length / totalUniqueWords;
}

// Send text to AI service for processing
async function sendToGemini(text) {
    try {
        // Validate minimum text length (PRIMARY CONDITION: 10+ characters)
        if (!text || text.trim().length < 10) {
            console.log(`❌ Text too short for AI call - ${text ? text.trim().length : 0} chars (minimum 10 required):`, text);
            return;
        }

        // Record time when AI API is called
        const aiApiCallTime = Date.now();
        console.log(`[TIMING] 🤖 AI API call started at: ${new Date(aiApiCallTime).toISOString()}`);
        console.log(`[TIMING] 🤖 Text being sent to AI: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
        console.log(`[TIMING] 🤖 Text length: ${text.length} characters`);
        
        if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
            global.mainWindow.webContents.send('timing-update', {
                event: 'ai_api_call_start',
                timestamp: aiApiCallTime,
                text_length: text.length
            });
        }

        let jobRole = ""; 
        let keySkills = "";

        // Attempt to get jobRole and keySkills from the renderer's localStorage
        if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
            try {
                const storedUserData = await global.mainWindow.webContents.executeJavaScript('localStorage.getItem("userData");', true);
                if (storedUserData) {
                    const parsedData = JSON.parse(storedUserData);
                    jobRole = parsedData.jobRole || ""; 
                    keySkills = parsedData.keySkills || ""; 
                }
            } catch (e) {
                console.warn("Could not retrieve user data from localStorage for AI prompt:", e.message);
            }
        }

        if (!jobRole || !keySkills) {
            console.error("Job Role and/or Key Skills are missing.");
            console.error("Input Error: Job Role and Key Skills must be provided in settings to get AI suggestions.");
            return;
        }

        // Input validation
        const validInputRegex = /^[a-zA-Z0-9 ,.-]*$/;

        if (!validInputRegex.test(jobRole)) {
            console.error("Invalid characters in Job Role.");
            console.error("Input Error: Job Role contains invalid characters. Only letters, numbers, spaces, commas, periods, and hyphens are allowed.");
            return;
        }

        if (!validInputRegex.test(keySkills)) {
            console.error("Invalid characters in Key Skills.");
            console.error("Input Error: Key Skills contain invalid characters. Only letters, numbers, spaces, commas, periods, and hyphens are allowed.");
            return;
        }

        // Trim inputs to reasonable length
        jobRole = jobRole.substring(0, 30);
        keySkills = keySkills.substring(0, 30);

        // Create a unique response ID for this call
        const responseId = ++lastResponseId;

        // Use AI race service to generate response with conversation history
        await raceTextResponse(
            jobRole,
            keySkills, 
            text,
            currentConversationHistory, // Pass the accumulated history
            // onChunk callback
            (chunkText, isFirstChunk) => {
                if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                    if (isFirstChunk) {
                        // Record time when first AI chunk is received
                        const firstChunkTime = Date.now();
                        console.log(`[TIMING] 🚀 First AI chunk received at: ${new Date(firstChunkTime).toISOString()}`);
                        console.log(`[TIMING] 🚀 Time to first chunk: ${firstChunkTime - aiApiCallTime}ms`);
                        console.log(`[TIMING] 🚀 First chunk content: "${chunkText.substring(0, 50)}${chunkText.length > 50 ? '...' : ''}"`);
                        
                        global.mainWindow.webContents.send('timing-update', {
                            event: 'ai_first_chunk_received',
                            timestamp: firstChunkTime,
                            time_to_first_chunk: firstChunkTime - aiApiCallTime,
                            chunk_length: chunkText.length
                        });
                        
                        // For the first chunk, send a new suggestion with initial content
                        lastAIResponse = {
                            responseId,
                            content: chunkText
                        };
                        
                        global.mainWindow.webContents.send('suggestion-update', {
                            title: "",
                            content: chunkText,
                            isStreaming: true,
                            isFirstChunk: true,
                            responseId: responseId
                        });
                    } else {
                        // For subsequent chunks, append to the accumulated response
                        if (lastAIResponse && lastAIResponse.responseId === responseId) {
                            lastAIResponse.content += chunkText;
                            
                            global.mainWindow.webContents.send('suggestion-update', {
                                content: chunkText,
                                isStreaming: true,
                                isFirstChunk: false,
                                responseId: responseId
                            });
                        }
                    }
                }
            },
            // onComplete callback
            (streamedText, promptForCurrentTurn) => {
                // Record time when AI API response is complete
                const aiApiResponseTime = Date.now();
                console.log(`[TIMING] ✅ AI API response completed at: ${new Date(aiApiResponseTime).toISOString()}`);
                console.log(`[TIMING] ✅ Total AI API response time: ${aiApiResponseTime - aiApiCallTime}ms`);
                console.log(`[TIMING] ✅ Final response length: ${streamedText.length} characters`);
                
                // Add the user's full prompt and the model's full response to the history
                currentConversationHistory.push({ role: "user", parts: [{ text: promptForCurrentTurn }] });
                currentConversationHistory.push({ role: "model", parts: [{ text: streamedText }] });

                // Optional: Limit history size to prevent overly long contexts
                const MAX_HISTORY_TURNS = 10; // e.g., 10 user messages and 10 model responses
                if (currentConversationHistory.length > MAX_HISTORY_TURNS * 2) {
                    currentConversationHistory = currentConversationHistory.slice(-MAX_HISTORY_TURNS * 2);
                    console.log(`📚 Conversation history trimmed to last ${MAX_HISTORY_TURNS} turns`);
                }

                console.log(`📚 Conversation history now has ${currentConversationHistory.length / 2} turns`);
                
                if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                    // Send final timing update
                    global.mainWindow.webContents.send('timing-update', {
                        event: 'ai_api_response_completed',
                        timestamp: aiApiResponseTime,
                        total_duration: aiApiResponseTime - aiApiCallTime,
                        response_length: streamedText.length
                    });
                    
                    // Send completion notification
                    global.mainWindow.webContents.send('suggestion-update', {
                        isStreaming: true,
                        isComplete: true,
                        responseId: responseId
                    });
                }
            },
            // onError callback
            (error) => {
                console.error("Error in AI race service:", error);
                let errorMessage = "An error occurred while generating a suggestion.";
                if (error.message) {
                    if (error.message.includes("SAFETY")) {
                       errorMessage = "The response was blocked due to safety settings.";
                    } else if (error.message.includes("API key not valid")) {
                       errorMessage = "Invalid API Key. Please check your configuration.";
                    } else if (error.message.includes("fetch")) {
                        errorMessage = "Could not connect to AI APIs. Check network or API status.";
                    } else {
                        errorMessage = error.message;
                    }
                }
                // Log error only - no UI notification to keep suggestions clean
                console.error("AI Service Error:", errorMessage);
            }
        );

    } catch (error) {
        console.error("Error in sendToGemini wrapper:", error);
    }
}

module.exports = {
    startLiveTranscription,
    stopLiveTranscription,
    resetFullTranscriptionService,
    clearConversationHistory, // Export conversation history management
    getGeminiModel: getGeminiModel, // Export a function to get the model
    getVADStatistics: getVADStatistics, // Export VAD statistics function
    sendToGemini: sendToGemini
};