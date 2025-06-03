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
            console.log('Already recording');
            return false;
        }

        if (!fs.existsSync(this.recorderPath)) {
            console.error('❌ C# Recorder not found at:', this.recorderPath);
            return false;
        }

        return new Promise((resolve) => {
            try {
                console.log(`Starting C# streaming recorder: ${this.recorderPath} --stream-transcription`);
                
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
                                console.log('C# Recorder Status:', jsonData);
                                
                                if (jsonData.code === "RECORDING_STARTED") {
                                    this.isRecording = true;
                                    clearTimeout(startupTimer);
                                    onStatusUpdate && onStatusUpdate(jsonData);
                                    resolve(true);
                                } else if (jsonData.code === "SYSTEM_AUDIO_STREAMING_STARTED") {
                                    console.log('✅ System audio streaming started successfully');
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
                        console.log('✅ Successfully receiving audio data from C# recorder');
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
                    console.log(`C# Recorder process exited with code ${code}`);
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

// Test the Windows STT integration
async function testWindowsSTT() {
    console.log('🎯 Testing Windows C# Recorder + Google STT Integration');
    
    // Check if Google credentials exist
    const googleCredentialsPath = path.join(__dirname, 'stt.json');
    if (!fs.existsSync(googleCredentialsPath)) {
        console.error('❌ Google STT credentials not found at:', googleCredentialsPath);
        console.log('Please place your Google Cloud Speech-to-Text credentials file as stt.json');
        return false;
    }
    
    console.log('✅ Found Google STT credentials at:', googleCredentialsPath);
    
    // Initialize components
    const windowsRecorder = new SimpleWindowsRecorder();
    const voiceActivityDetector = new VoiceActivityDetector({
        sampleRate: 16000,
        energyThreshold: 0.01,
        silenceThreshold: 0.005,
        voiceMinDuration: 50,
        silenceMinDuration: 300
    });
    
    let googleSpeechTranscriber = null;
    let isGoogleSTTReady = false;
    
    // Initialize Google Speech Transcriber
    try {
        console.log('🔧 Initializing Google Speech-to-Text...');
        googleSpeechTranscriber = new GoogleSpeechTranscriber({
            sampleRateHertz: 16000,
            languageCode: 'en-US',
            credentialsPath: googleCredentialsPath,
            inputSampleRate: 16000,
            inputChannels: 1,
            inputFormat: 'INT16',
            onTranscription: (data) => {
                if (data.type === 'MODEL_READY_FOR_TRANSCRIPTION') {
                    console.log('✅ Google Speech-to-Text is ready');
                    isGoogleSTTReady = true;
                    return;
                }
                
                if (isGoogleSTTReady && data.text) {
                    const finalText = data.is_final ? ' (FINAL)' : ' (interim)';
                    console.log('📝 Transcription:', data.text + finalText);
                }
            },
            onError: (message, error) => {
                console.error('❌ Google Speech Error:', message, error);
            }
        });
        
        await googleSpeechTranscriber.startStream();
    } catch (error) {
        console.error('❌ Failed to initialize Google Speech Transcriber:', error);
        return false;
    }
    
    // Process audio chunk with VAD filtering
    function processAudioChunkWithVAD(audioDataChunk) {
        if (!voiceActivityDetector || !googleSpeechTranscriber || !isGoogleSTTReady) {
            return;
        }
        
        try {
            const vadResult = voiceActivityDetector.processAudioChunk(audioDataChunk);
            
            if (vadResult.hasVoice) {
                // Voice detected - send to Google STT
                
                // Send buffered chunks first if voice just started
                if (vadResult.bufferedChunks && vadResult.bufferedChunks.length > 0) {
                    console.log(`🎯 VAD: Sending ${vadResult.bufferedChunks.length} buffered chunks`);
                    for (const bufferedChunk of vadResult.bufferedChunks) {
                        googleSpeechTranscriber.processAudioChunk(bufferedChunk);
                    }
                } else {
                    // Normal voice chunk processing
                    googleSpeechTranscriber.processAudioChunk(audioDataChunk);
                }
            }
            // Silence chunks are discarded by VAD
        } catch (error) {
            console.error('🎤 VAD processing error:', error);
            // Fallback: send to STT without VAD if there's an error
            googleSpeechTranscriber.processAudioChunk(audioDataChunk);
        }
    }
    
    // Start recording with callbacks
    console.log('🎙️ Starting Windows audio recording...');
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
            console.log('🔊 Windows Recorder Status:', status.code);
            if (status.code === "RECORDING_STARTED") {
                console.log('✅ Audio recording started successfully');
            }
        },
        // onError
        (error) => {
            console.error('❌ Windows Recorder Error:', error);
        }
    );
    
    if (success) {
        console.log('✅ Windows STT integration test started successfully!');
        console.log('🎤 Play some YouTube audio or speak into your microphone...');
        console.log('📝 Transcriptions will appear above.');
        console.log('Press Ctrl+C to stop the test.');
        
        // Keep the test running
        const gracefulShutdown = () => {
            console.log('\n🛑 Stopping test...');
            
            if (windowsRecorder) {
                windowsRecorder.stopRecording();
            }
            
            if (googleSpeechTranscriber) {
                googleSpeechTranscriber.stop();
            }
            
            console.log('✅ Test completed successfully!');
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

// Run the test
if (require.main === module) {
    testWindowsSTT().catch(error => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
}

module.exports = { testWindowsSTT }; 