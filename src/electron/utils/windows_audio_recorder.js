const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');
const sudo = require('sudo-prompt');

class WindowsAudioRecorder {
    constructor() {
        this.isRecording = false;
        this.recorderProcess = null;
        this.onAudioData = null;
        this.onStatusUpdate = null;
        this.onError = null;
        this.audioBuffer = Buffer.alloc(0);
        
        // Audio settings to match macOS recorder
        this.sampleRate = 16000;
        this.channels = 1;
        this.bitDepth = 16;
        
        // Initialize C# recorder path
        this.recorderPath = this.getRecorderPath();
        this.jsonBuffer = '';
    }

    // Set callbacks for audio data and status updates
    setCallbacks(callbacks) {
        this.onAudioData = callbacks.onAudioData || (() => {});
        this.onStatusUpdate = callbacks.onStatusUpdate || (() => {});
        this.onError = callbacks.onError || (() => {});
    }

    /**
     * Get the path to the C# recorder executable
     */
    getRecorderPath() {
        console.log('[DEBUG] process.cwd():', process.cwd());
        if (app.isPackaged) {
            // In packaged app, look in resources
            const resourcesPath = process.resourcesPath;
            const recorderPath = path.join(resourcesPath, 'bin', 'Recorder.exe');
            console.log('[DEBUG] Checking packaged path:', recorderPath, 'Exists:', fs.existsSync(recorderPath));
            if (fs.existsSync(recorderPath)) {
                console.log('Using packaged C# Recorder:', recorderPath);
                return recorderPath;
            }
        } else {
            // In development, prefer Release build, fallback to Debug
            const releaseRecorderPath = path.join(process.cwd(), 'src', 'windows', 'bin', 'Release', 'net8.0', 'win-x64', 'publish', 'Recorder.exe');
            console.log('[DEBUG] Checking release path:', releaseRecorderPath, 'Exists:', fs.existsSync(releaseRecorderPath));
            if (fs.existsSync(releaseRecorderPath)) {
                console.log('Using development Release C# Recorder:', releaseRecorderPath);
                return releaseRecorderPath;
            }
            
            const debugRecorderPath = path.join(process.cwd(), 'src', 'windows', 'bin', 'Debug', 'net8.0', 'win-x64', 'Recorder.exe');
            console.log('[DEBUG] Checking debug path:', debugRecorderPath, 'Exists:', fs.existsSync(debugRecorderPath));
            if (fs.existsSync(debugRecorderPath)) {
                console.log('Using development Debug C# Recorder:', debugRecorderPath);
                return debugRecorderPath;
            }
        }
        
        console.error('C# Recorder executable not found');
        return null;
    }

    // Check if C# Recorder is available
    async checkRecorderAvailability() {
        if (!this.recorderPath || !fs.existsSync(this.recorderPath)) {
            console.error('C# Recorder executable not found at:', this.recorderPath);
            return false;
        }
        
        return new Promise((resolve) => {
            const testProcess = spawn(this.recorderPath, ['--check-permissions'], { stdio: 'pipe' });
            
            testProcess.on('error', (error) => {
                console.error('C# Recorder test failed:', error.message);
                resolve(false);
            });
            
            testProcess.on('close', (code) => {
                resolve(code === 0);
            });
        });
    }

    // Try to run recorder with admin privileges
    async tryRecorderWithAdmin(args = ['--test-audio-quick']) {
        if (!this.recorderPath) {
            console.error('C# Recorder path not available for admin execution');
            return false;
        }

        return new Promise((resolve) => {
            const command = `"${this.recorderPath}" ${args.join(' ')}`;
            const options = {
                name: 'Interview Lift Audio Recorder'
            };

            console.log('🔐 Trying to run C# Recorder with admin privileges...');
            
            sudo.exec(command, options, (error, stdout, stderr) => {
                if (error) {
                    console.error('❌ Admin execution failed:', error.message);
                    resolve(false);
                    return;
                }

                console.log('✅ Admin execution successful:', stdout);
                
                // Check for success indicators in the output
                const hasAudioAccess = stdout.includes('AUDIO_AVAILABLE') || 
                                       stdout.includes('SUCCESS') ||
                                       stdout.includes('PERMISSION_GRANTED');
                
                resolve(hasAudioAccess);
            });
        });
    }

    // Start recording system audio using C# WASAPI recorder
    async startRecording() {
        if (this.isRecording || this.recorderProcess) {
            console.log('Recording already in progress or process still running');
            return false;
        }
        
        console.log('Starting Windows system audio capture with C# Recorder:', this.recorderPath);
        
        try {
            this.onStatusUpdate && this.onStatusUpdate({ code: "DEBUG_INITIATE_RECORDING_CALLED" });
            
            // Start the streaming recorder
            const success = await this.startStreamingRecorder();
            
            if (success) {
                this.isRecording = true;
                console.log('✅ Windows audio recording started successfully');
                return true;
            } else {
                console.error('❌ Failed to start Windows audio recording');
                return false;
            }
            
        } catch (error) {
            console.error('Exception in startRecording:', error);
            this.onError && this.onError({
                code: 'RECORDER_START_ERROR',
                message: error.message
            });
            return false;
        }
    }

    // Start the C# streaming recorder
    async startStreamingRecorder() {
        return new Promise((resolve) => {
            try {
                console.log(`Starting C# streaming recorder: ${this.recorderPath} --stream-transcription`);
                
                this.recorderProcess = spawn(this.recorderPath, ['--stream-transcription'], {
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                let hasReceivedStartupMessage = false;
                let startTime = Date.now();
                
                // Add a longer timeout as fallback (30 seconds)
                const timeout = setTimeout(() => {
                    if (!hasReceivedStartupMessage) {
                        console.log('⚠️ No startup message received after 30 seconds, but process seems to be running');
                        console.log('Attempting to continue with audio capture...');
                        
                        this.isRecording = true;
                        this.onStatusUpdate && this.onStatusUpdate({
                            code: 'RECORDING_STARTED',
                            timestamp: new Date().toISOString(),
                            note: 'Started without explicit confirmation'
                        });
                        
                        hasReceivedStartupMessage = true;
                        resolve(true);
                    }
                }, 30000);

                // Handle JSON status messages from stderr (like Swift version)
                this.recorderProcess.stderr.on('data', (data) => {
                    const dataStr = data.toString();
                    console.log('📢 Raw stderr data received:', dataStr.substring(0, 200), '...');
                    
                    this.jsonBuffer += dataStr;
                    
                    let boundary;
                    while ((boundary = this.jsonBuffer.indexOf('\n')) !== -1) {
                        const message = this.jsonBuffer.substring(0, boundary).trim();
                        this.jsonBuffer = this.jsonBuffer.substring(boundary + 1);
                        
                        if (message) {
                            try {
                                const jsonData = JSON.parse(message);
                                console.log('✅ C# Recorder Status:', jsonData);
                                
                                if (jsonData.code === "RECORDING_STARTED") {
                                    clearTimeout(timeout);
                                    this.isRecording = true;
                                    hasReceivedStartupMessage = true;
                                    
                                    this.onStatusUpdate && this.onStatusUpdate({
                                        code: 'RECORDING_STARTED',
                                        timestamp: jsonData.timestamp
                                    });
                                    
                                    console.log('✅ C# Recorder started successfully - will run continuously regardless of audio presence');
                                    resolve(true);
                                } else if (jsonData.code === "SYSTEM_AUDIO_STREAMING_STARTED") {
                                    console.log('✅ System audio streaming started successfully');
                                    if (!hasReceivedStartupMessage) {
                                        clearTimeout(timeout);
                                        // Fallback - consider streaming started as successful startup
                                        this.isRecording = true;
                                        hasReceivedStartupMessage = true;
                                        
                                        this.onStatusUpdate && this.onStatusUpdate({
                                            code: 'RECORDING_STARTED',
                                            timestamp: new Date().toISOString()
                                        });
                                        
                                        console.log('✅ C# Recorder initialized via streaming message - continuous operation mode');
                                        resolve(true);
                                    }
                                } else if (jsonData.code && jsonData.code.includes('ERROR')) {
                                    clearTimeout(timeout);
                                    console.error('❌ C# Recorder Error:', jsonData);
                                    this.onError && this.onError({
                                        code: jsonData.code,
                                        message: jsonData.error || jsonData.message || 'Unknown error'
                                    });
                                    resolve(false);
                                } else {
                                    // Log any other messages we receive
                                    console.log('ℹ️ C# Recorder Info:', jsonData);
                                }
                            } catch (e) {
                                console.warn('⚠️ Failed to parse C# Recorder message:', message, e);
                            }
                        }
                    }
                });

                // Handle audio data from stdout (16kHz mono 16-bit PCM)
                this.recorderProcess.stdout.on('data', (audioDataChunk) => {
                    // Log first audio data received for debugging
                    const elapsed = Date.now() - startTime;
                    if (audioDataChunk.length > 0 && !hasReceivedStartupMessage && elapsed < 5000) {
                        console.log(`🔊 First audio data received after ${elapsed}ms: ${audioDataChunk.length} bytes`);
                        
                        // If we're receiving audio data but no startup message, assume recording started
                        if (!hasReceivedStartupMessage) {
                            clearTimeout(timeout);
                            console.log('✅ Assuming recording started based on audio data reception');
                            this.isRecording = true;
                            hasReceivedStartupMessage = true;
                            
                            this.onStatusUpdate && this.onStatusUpdate({
                                code: 'RECORDING_STARTED',
                                timestamp: new Date().toISOString(),
                                note: 'Inferred from audio data'
                            });
                            
                            resolve(true);
                        }
                    }
                    
                    this.handleAudioData(audioDataChunk);
                });

                this.recorderProcess.on('error', (err) => {
                    clearTimeout(timeout);
                    console.error('❌ C# Recorder process error:', err);
                    this.onError && this.onError({
                        code: 'RECORDER_PROCESS_ERROR',
                        message: err.message
                    });
                    resolve(false);
                });

                this.recorderProcess.on('close', (code) => {
                    clearTimeout(timeout);
                    console.log(`🔚 C# Recorder process exited with code ${code}`);
                    this.isRecording = false;
                    this.recorderProcess = null;
                    
                    if (code !== 0 && code !== null) {
                        console.warn(`⚠️ C# Recorder exited unexpectedly with code: ${code}`);
                        this.onError && this.onError({
                            code: 'RECORDER_UNEXPECTED_EXIT',
                            message: `Recorder process stopped unexpectedly (code: ${code})`
                        });
                    }
                });

            } catch (error) {
                console.error('❌ Error starting C# streaming recorder:', error);
                this.onError && this.onError({
                    code: 'RECORDER_START_ERROR',
                    message: error.message
                });
                resolve(false);
            }
        });
    }

    // Handle incoming audio data
    handleAudioData(chunk) {
        if (!this.isRecording) return;

        try {
            // Pass audio data directly to callback (C# recorder outputs 16kHz mono 16-bit PCM)
            this.onAudioData && this.onAudioData(chunk);
        } catch (error) {
            console.error('Error handling audio data:', error);
        }
    }

    // Stop recording
    stopRecording() {
        if (!this.isRecording) {
            console.log('Windows audio recording not active');
            return;
        }

        console.log('Stopping Windows audio recording...');
        
        try {
            if (this.recorderProcess && !this.recorderProcess.killed) {
                this.recorderProcess.kill('SIGTERM');
                
                // Force kill after 2 seconds if it doesn't respond
                setTimeout(() => {
                    if (this.recorderProcess && !this.recorderProcess.killed) {
                        this.recorderProcess.kill('SIGKILL');
                    }
                }, 2000);
            }
        } catch (error) {
            console.error('Error stopping C# recorder process:', error);
        }

        this.isRecording = false;
        this.recorderProcess = null;
        
        // CRITICAL FIX: Check if onStatusUpdate callback exists and mainWindow is not destroyed
        try {
            if (this.onStatusUpdate && typeof this.onStatusUpdate === 'function') {
                // Only call if the main window still exists
                if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                    this.onStatusUpdate({
                        code: 'RECORDING_STOPPED',
                        timestamp: new Date().toISOString()
                    });
                } else {
                    console.log('🚨 Skipping status update - main window destroyed');
                }
            }
        } catch (error) {
            console.error('🚨 Error in status update callback (likely window destroyed):', error.message);
        }
    }

    // Check if recording is active
    isActive() {
        return this.isRecording && this.recorderProcess && !this.recorderProcess.killed;
    }

    // Internal cleanup method
    cleanup() {
        if (this.recorderProcess && !this.recorderProcess.killed) {
            this.recorderProcess.kill('SIGTERM');
            this.recorderProcess = null;
        }
        this.isRecording = false;
        this.jsonBuffer = '';
    }

    // Public cleanup method
    destroy() {
        this.stopRecording();
        this.onAudioData = null;
        this.onStatusUpdate = null;
        this.onError = null;
    }

    // Get recorder info for debugging
    getRecorderInfo() {
        return {
            path: this.recorderPath,
            isUsingBundled: this.recorderPath !== null,
            exists: this.recorderPath !== null && fs.existsSync(this.recorderPath),
            isActive: this.isActive(),
            sampleRate: this.sampleRate,
            channels: this.channels,
            bitDepth: this.bitDepth
        };
    }

    // Backward compatibility method (renamed from getFFmpegInfo)
    getFFmpegInfo() {
        return this.getRecorderInfo();
    }
}

module.exports = WindowsAudioRecorder; 