const { spawn } = require('child_process');
const VoiceActivityDetector = require('./src/electron/utils/voice_activity_detector');
const GoogleSpeechTranscriber = require('./src/electron/utils/google_speech_transcriber');
const fs = require('fs');
const path = require('path');

// Simple Windows Recorder for testing (without Electron dependencies)
class SimpleWindowsRecorder {
    constructor() {
        this.isRecording = false;
        this.recorderProcess = null;
        this.jsonBuffer = '';
        this.recorderPath = path.join(process.cwd(), 'src', 'windows', 'bin', 'x64', 'Debug', 'net8.0', 'win-x64', 'Recorder.exe');
    }

    async startRecording(onAudioData, onStatusUpdate, onError) {
        if (this.isRecording) {
            return false;
        }

        if (!fs.existsSync(this.recorderPath)) {
            console.error('❌ C# Recorder not found at:', this.recorderPath);
            return false;
        }

        return new Promise((resolve) => {
            try {
                
                this.recorderProcess = spawn(this.recorderPath, ['--stream-transcription'], {
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                let hasReceivedAudio = false;
                let startupTimer = null;

                // Handle JSON status messages from stderr
                this.recorderProcess.stderr.on('data', (data) => {
                    this.jsonBuffer += data.toString();
                    
                    let boundary;
                    while ((boundary = this.jsonBuffer.indexOf('\n')) !== -1) {
                        const message = this.jsonBuffer.substring(0, boundary).trim();
                        this.jsonBuffer = this.jsonBuffer.substring(boundary + 1);
                        
                        if (message) {
                            try {
                                const jsonData = JSON.parse(message);
                                
                                if (jsonData.code === "RECORDING_STARTED") {
                                    this.isRecording = true;
                                    clearTimeout(startupTimer);
                                    onStatusUpdate && onStatusUpdate(jsonData);
                                    resolve(true);
                                } else if (jsonData.code === "SYSTEM_AUDIO_STREAMING_STARTED") {
                                } else if (jsonData.code && jsonData.code.includes('ERROR')) {
                                    console.error('C# Recorder Error:', jsonData);
                                    clearTimeout(startupTimer);
                                    onError && onError(jsonData);
                                    resolve(false);
                                }
                            } catch (e) {
                                console.warn('Failed to parse C# Recorder message:', message, e);
                            }
                        }
                    }
                });

                // Handle audio data from stdout
                this.recorderProcess.stdout.on('data', (audioDataChunk) => {
                    if (!hasReceivedAudio) {
                        hasReceivedAudio = true;
                    }
                    
                    onAudioData && onAudioData(audioDataChunk);
                });

                this.recorderProcess.on('error', (err) => {
                    console.error('C# Recorder process error:', err);
                    clearTimeout(startupTimer);
                    onError && onError({ code: 'RECORDER_PROCESS_ERROR', message: err.message });
                    resolve(false);
                });

                this.recorderProcess.on('close', (code) => {
                    this.isRecording = false;
                    this.recorderProcess = null;
                });

                // Set startup timeout
                startupTimer = setTimeout(() => {
                    console.error('C# Recorder startup timeout - no audio received within 10 seconds');
                    this.stopRecording();
                    onError && onError({ code: 'RECORDER_STARTUP_TIMEOUT', message: 'No audio received within startup timeout' });
                    resolve(false);
                }, 10000);

            } catch (error) {
                console.error('Error starting C# streaming recorder:', error);
                onError && onError({ code: 'RECORDER_START_ERROR', message: error.message });
                resolve(false);
            }
        });
    }

    stopRecording() {
        if (this.recorderProcess && !this.recorderProcess.killed) {
            this.recorderProcess.kill('SIGTERM');
            setTimeout(() => {
                if (this.recorderProcess && !this.recorderProcess.killed) {
                    this.recorderProcess.kill('SIGKILL');
                }
            }, 2000);
        }
        this.isRecording = false;
        this.recorderProcess = null;
    }
}

// Google Speech Transcriber wrapper with auto restart logic
class RestartingGoogleSpeechTranscriber extends GoogleSpeechTranscriber {
    constructor(options) {
        super(options);
        this.restartIntervalMs = 55000; // 55 seconds before restart
        this.restartTimer = null;
        this.streamStarted = false;
    }

   async startStream() {
    if (this.isStarted) {
        return;
    }
    if (!this.speechClient) {
        const success = await this.initializeClient();
        if (!success) {
            console.error('[STT_LOG] Client initialization failed');
            return;
        }
    }
    this.isStarted = true;
    this.isReady = true;
    this.onTranscription({ type: 'MODEL_READY_FOR_TRANSCRIPTION' });
    this.startNewStream();
}

    setupRestartTimer() {
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
            this.restartStream();
        }, this.restartIntervalMs);
    }

    async restartStream() {
        try {
            this.streamStarted = false;
            await this.stop();
            await this.startStream();
            this.streamStarted = true;
        } catch (error) {
            console.error('❌ Error restarting Google Speech stream:', error);
        }
    }

async processAudioChunk(chunk) {
    try {
        if (!this.isReady || !this.speechClient || !this.stream) {
            console.warn('[GoogleSpeechTranscriber] Cannot process chunk: transcriber not ready or stream not initialized');
            return { success: false, reason: 'Transcriber not ready' };
        }
        // Assuming this.stream is the Google STT streaming client
        this.stream.write(chunk);
        return { success: true, chunkSize: chunk.length };
    } catch (error) {
        console.error('[GoogleSpeechTranscriber] Error processing audio chunk:', error);
        return { success: false, error: error.message };
    }
}

    async stop() {
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
        this.streamStarted = false;
        await super.stop();
    }
}

// Generate a silent PCM chunk buffer matching your chunk size (320 bytes for 20ms @16kHz 16bit mono)
function createSilentChunk() {
    return Buffer.alloc(320, 0);
}

async function testWindowsSTT() {

    // Google credentials path
    const googleCredentialsPath = path.join(__dirname, 'stt.json');
    if (!fs.existsSync(googleCredentialsPath)) {
        console.error('❌ Google STT credentials not found at:', googleCredentialsPath);
        return false;
    }


    // Init components
    const windowsRecorder = new SimpleWindowsRecorder();
    const voiceActivityDetector = new VoiceActivityDetector({
        sampleRate: 16000,
        energyThreshold: 0.01,
        silenceThreshold: 0.005,
        voiceMinDuration: 50,
        silenceMinDuration: 300
    });

    let isGoogleSTTReady = false;

    // Initialize Google Speech Transcriber with auto restart
    let googleSpeechTranscriber;
   try {
    
    googleSpeechTranscriber = new RestartingGoogleSpeechTranscriber({
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        credentialsPath: googleCredentialsPath,
        inputSampleRate: 16000,
        inputChannels: 1,
        inputFormat: 'INT16',

        onTranscription: (data) => {
            const timestamp = new Date().toISOString();


            if (data.type === 'MODEL_READY_FOR_TRANSCRIPTION') {
                isGoogleSTTReady = true;
                return;
            }

            if (isGoogleSTTReady && data.text) {
                const finalText = data.is_final ? ' (FINAL)' : ' (interim)';
            }
        },

        onError: (message, error) => {
            const timestamp = new Date().toISOString();
            console.error(`[${timestamp}] ❌ Google Speech Error: ${message}`);
            console.error(`[${timestamp}] ❌ Error Details:`, error);
        }
    });

    await googleSpeechTranscriber.startStream();

} catch (error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ Failed to initialize Google Speech Transcriber:`, error);
    return false;
}

    // Silence chunk and timer management for sending keep-alive silence
    const silenceChunk = createSilentChunk();
    let silenceInterval = null;

    function sendSilencePeriodically() {
        if (silenceInterval) return;
        silenceInterval = setInterval(() => {
            if (googleSpeechTranscriber && isGoogleSTTReady) {
                googleSpeechTranscriber.processAudioChunk(silenceChunk);
            }
        }, 20); // Send silence every 20ms
    }

    function stopSilencePeriodically() {
        if (silenceInterval) {
            clearInterval(silenceInterval);
            silenceInterval = null;
        }
    }

    // Process audio chunk with VAD and silence keep-alive
 function processAudioChunkWithVAD(audioDataChunk) {
    if (!voiceActivityDetector || !googleSpeechTranscriber || !isGoogleSTTModelReady) {
        console.warn('VAD or STT not ready, skipping chunk processing');
        return;
    }
    
    console.log(`🎤 Processing chunk (size: ${audioDataChunk.length} bytes)`);
    vadStats.totalChunks++;
    
    try {
        const vadResult = voiceActivityDetector.processAudioChunk(audioDataChunk);
        console.log(`🎤 VAD Result: hasVoice=${vadResult.hasVoice}, bufferedChunks=${vadResult.bufferedChunks ? vadResult.bufferedChunks.length : 0}`);
        
        if (vadResult.hasVoice) {
            vadStats.voiceChunks++;
            if (vadResult.bufferedChunks && vadResult.bufferedChunks.length > 0) {
                // Limit to 10 buffered chunks to prevent lag
                const maxBufferedChunks = 10;
                const chunksToProcess = vadResult.bufferedChunks.slice(0, maxBufferedChunks);
                console.log(`🎤 VAD: Voice activity started - sending ${chunksToProcess.length} buffered chunks (limited to ${maxBufferedChunks})`);
                
                // Batch chunks into a single buffer
                const batchedChunk = Buffer.concat(chunksToProcess);
                console.log(`🎤 VAD: Processing batched buffered chunk (size: ${batchedChunk.length} bytes)`);
                const googleSTTResult = googleSpeechTranscriber.processAudioChunk(batchedChunk);
                console.log(`🎤 VAD: Processed batched buffered chunk with Google STT, result:`, googleSTTResult);
                if (!googleSTTResult || !googleSTTResult.success) {
                    console.warn('Failed to process batched buffered chunk:', googleSTTResult);
                    vadStats.discardedChunks += chunksToProcess.length;
                } else {
                    vadStats.voiceChunks += chunksToProcess.length - 1; // Account for batched chunks
                }
            }
            console.log(`🎤 VAD: Processing current chunk (size: ${audioDataChunk.length} bytes)`);
            const googleSTTResult = googleSpeechTranscriber.processAudioChunk(audioDataChunk);
            console.log(`🎤 VAD: Processed current chunk with Google STT, result:`, googleSTTResult);
            if (!googleSTTResult || !googleSTTResult.success) {
                console.warn('Failed to process current chunk:', googleSTTResult);
                vadStats.discardedChunks++;
            }
        } else {
            vadStats.discardedChunks++;
            vadStats.apiCallsSaved++;
            console.log(`🔇 VAD: Discarded non-voice chunk (size: ${audioDataChunk.length} bytes)`);
        }
    } catch (error) {
        console.error('🎤 VAD processing error:', error);
        googleSpeechTranscriber.processAudioChunk(audioDataChunk); // Fallback
        vadStats.discardedChunks++;
    }
}
    // Start recording with callbacks
    const success = await windowsRecorder.startRecording(
        // onAudioData
        (audioData) => {
            if (voiceActivityDetector && googleSpeechTranscriber && isGoogleSTTReady) {
                try {
                    processAudioChunkWithVAD(audioData);
                } catch (e) {
                    console.error('Failed to process audio chunk with VAD:', e);
                }
            }
        },
        // onStatusUpdate
        (status) => {
            if (status.code === "RECORDING_STARTED") {
            }
        },
        // onError
        (error) => {
            console.error('❌ Windows Recorder Error:', error);
        }
    );

    if (success) {
       

        // Graceful shutdown
        const gracefulShutdown = async () => {
            if (windowsRecorder) {
                windowsRecorder.stopRecording();
            }
            if (googleSpeechTranscriber) {
                await googleSpeechTranscriber.stop();
            }
            stopSilencePeriodically();
            process.exit(0);
        };

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);

        return true;
    } else {
        console.error('❌ Failed to start Windows audio recording');
        return false;
    }
}

// Run the test if this script is the main module
if (require.main === module) {
    testWindowsSTT().catch(error => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
}

module.exports = { testWindowsSTT };
