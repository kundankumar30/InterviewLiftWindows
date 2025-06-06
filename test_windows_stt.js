const WindowsAudioRecorder = require('./src/electron/utils/windows_audio_recorder');
const VoiceActivityDetector = require('./src/electron/utils/voice_activity_detector');
const GoogleSpeechTranscriber = require('./src/electron/utils/google_speech_transcriber');
const fs = require('fs');
const path = require('path');

// Mock Electron app for standalone testing
const mockElectronApp = {
    isPackaged: false,
    getAppPath: () => process.cwd()
};

// Temporarily mock the electron module
require.cache[require.resolve('electron')] = {
    exports: { app: mockElectronApp }
};

// Test the Windows STT integration
async function testWindowsSTT() {
    
    // Check if Google credentials exist
    const googleCredentialsPath = path.join(__dirname, 'stt.json');
    if (!fs.existsSync(googleCredentialsPath)) {
        console.error('❌ Google STT credentials not found at:', googleCredentialsPath);
        return false;
    }
    
    // Check if C# recorder exists
    const recorderPath = path.join(process.cwd(), 'src', 'windows', 'bin', 'x64', 'Debug', 'net8.0', 'win-x64', 'Recorder.exe');
    if (!fs.existsSync(recorderPath)) {
        console.error('❌ C# Recorder not found at:', recorderPath);
        return false;
    }
    
    
    // Initialize components
    const windowsRecorder = new WindowsAudioRecorder();
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
        googleSpeechTranscriber = new GoogleSpeechTranscriber({
            sampleRateHertz: 16000,
            languageCode: 'en-US',
            credentialsPath: googleCredentialsPath,
            inputSampleRate: 16000,
            inputChannels: 1,
            inputFormat: 'INT16',
            onTranscription: (data) => {
                if (data.type === 'MODEL_READY_FOR_TRANSCRIPTION') {
                    isGoogleSTTReady = true;
                    return;
                }
                
                if (isGoogleSTTReady && data.text) {
                    const finalText = data.is_final ? ' (FINAL)' : ' (interim)';
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
    
    // Process audio chunk with VAD filtering (same as in recording.js)
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
    
    // Set up Windows recorder callbacks
    windowsRecorder.setCallbacks({
        onAudioData: (audioData) => {
            if (voiceActivityDetector && googleSpeechTranscriber && isGoogleSTTReady) {
                try {
                    processAudioChunkWithVAD(audioData);
                } catch (e) {
                    console.error('Failed to process audio chunk with VAD:', e);
                }
            }
        },
        onStatusUpdate: (status) => {
            if (status.code === "RECORDING_STARTED") {
            }
        },
        onError: (error) => {
            console.error('❌ Windows Recorder Error:', error);
        }
    });
    
    // Start recording
    const success = await windowsRecorder.startRecording();
    
    if (success) {
       
        
        // Keep the test running
        const gracefulShutdown = () => {
            
            if (windowsRecorder) {
                windowsRecorder.stopRecording();
            }
            
            if (googleSpeechTranscriber) {
                googleSpeechTranscriber.stop();
            }
            
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