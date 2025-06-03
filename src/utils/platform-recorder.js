const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { app } = require('electron');

class PlatformRecorder {
    constructor() {
        this.platform = os.platform();
        this.recorderProcess = null;
        this.isRecording = false;
        
        // Callbacks
        this.onAudioData = null;
        this.onVideoFrame = null;
        this.onStatusUpdate = null;
        this.onError = null;
        
        console.log(`🖥️ Detected platform: ${this.platform}`);
    }

    /**
     * Set callback functions for different types of output
     */
    setCallbacks(callbacks) {
        this.onAudioData = callbacks.onAudioData || (() => {});
        this.onVideoFrame = callbacks.onVideoFrame || (() => {});
        this.onStatusUpdate = callbacks.onStatusUpdate || (() => {});
        this.onError = callbacks.onError || (() => {});
    }

    /**
     * Check if the current platform is supported
     */
    isSupportedPlatform() {
        return this.platform === 'darwin' || this.platform === 'win32';
    }

    /**
     * Get the platform-specific recorder executable path
     */
    getRecorderPath() {
        const resourcesPath = app.isPackaged ? process.resourcesPath : app.getAppPath();
        
        if (this.platform === 'darwin') {
            // macOS Swift recorder
            return app.isPackaged
                ? path.join(resourcesPath, 'Recorder')
                : path.join(app.getAppPath(), 'src', 'swift', 'Recorder');
        } else if (this.platform === 'win32') {
            // Windows C# recorder
            return app.isPackaged
                ? path.join(resourcesPath, 'Recorder.exe')
                : path.join(app.getAppPath(), 'src', 'windows', 'bin', 'Release', 'net8.0-windows10.0.22621.0', 'win-x64', 'publish', 'Recorder.exe');
        }
        
        throw new Error(`Unsupported platform: ${this.platform}`);
    }

    /**
     * Check if the recorder executable exists
     */
    checkRecorderExists() {
        try {
            const recorderPath = this.getRecorderPath();
            const exists = fs.existsSync(recorderPath);
            
            if (!exists) {
                console.error(`❌ Recorder executable not found at: ${recorderPath}`);
                return false;
            }
            
            console.log(`✅ Found ${this.platform} recorder at: ${recorderPath}`);
            return true;
        } catch (error) {
            console.error('❌ Error checking recorder path:', error.message);
            return false;
        }
    }

    /**
     * Check permissions for screen and audio capture
     */
    async checkPermissions() {
        if (!this.isSupportedPlatform()) {
            return {
                granted: false,
                error: `Platform ${this.platform} is not supported. Only macOS and Windows are supported.`
            };
        }

        if (!this.checkRecorderExists()) {
            return {
                granted: false,
                error: `Recorder executable not found for ${this.platform}`
            };
        }

        try {
            const recorderPath = this.getRecorderPath();
            
            return new Promise((resolve) => {
                const permissionProcess = spawn(recorderPath, ['--check-permissions'], {
                    stdio: ['ignore', 'ignore', 'pipe']
                });

                let errorOutput = '';

                permissionProcess.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });

                permissionProcess.on('close', (code) => {
                    try {
                        if (errorOutput.trim()) {
                            const response = JSON.parse(errorOutput.trim());
                            resolve({
                                granted: response.code === 'PERMISSION_GRANTED',
                                response: response
                            });
                        } else {
                            resolve({
                                granted: false,
                                error: 'No response from permission check'
                            });
                        }
                    } catch (parseError) {
                        resolve({
                            granted: false,
                            error: `Failed to parse permission response: ${parseError.message}`,
                            rawOutput: errorOutput
                        });
                    }
                });

                permissionProcess.on('error', (error) => {
                    resolve({
                        granted: false,
                        error: `Failed to run permission check: ${error.message}`
                    });
                });
            });
        } catch (error) {
            return {
                granted: false,
                error: error.message
            };
        }
    }

    /**
     * Start screen and audio recording
     */
    async startRecording() {
        if (this.isRecording) {
            console.log('Recording already in progress');
            return false;
        }

        if (!this.isSupportedPlatform()) {
            this.onError && this.onError({
                code: 'UNSUPPORTED_PLATFORM',
                message: `Platform ${this.platform} is not supported`
            });
            return false;
        }

        try {
            const recorderPath = this.getRecorderPath();
            
            console.log(`🎬 Starting ${this.platform} recorder: ${recorderPath}`);

            this.recorderProcess = spawn(recorderPath, [], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            // Handle stdout (audio data)
            this.recorderProcess.stdout.on('data', (data) => {
                if (this.onAudioData) {
                    this.onAudioData(data);
                }
            });

            // Handle stderr (status updates and video frames)
            this.recorderProcess.stderr.on('data', (data) => {
                const lines = data.toString().split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    try {
                        const response = JSON.parse(line.trim());
                        
                        if (response.type === 'VIDEO_FRAME') {
                            // Video frame data
                            if (this.onVideoFrame) {
                                this.onVideoFrame(response);
                            }
                        } else {
                            // Status update
                            if (this.onStatusUpdate) {
                                this.onStatusUpdate(response);
                            }
                            
                            // Track recording state
                            if (response.code === 'RECORDING_STARTED') {
                                this.isRecording = true;
                                console.log(`✅ ${this.platform} recording started`);
                            } else if (response.code === 'RECORDING_STOPPED') {
                                this.isRecording = false;
                                console.log(`⏹️ ${this.platform} recording stopped`);
                            }
                        }
                    } catch (parseError) {
                        console.warn('Failed to parse recorder output:', line);
                    }
                }
            });

            this.recorderProcess.on('close', (code) => {
                this.isRecording = false;
                console.log(`📦 ${this.platform} recorder process exited with code ${code}`);
                
                if (code !== 0 && code !== null) {
                    this.onError && this.onError({
                        code: 'RECORDER_PROCESS_FAILED',
                        message: `Recorder process exited with code ${code}`
                    });
                }
            });

            this.recorderProcess.on('error', (error) => {
                this.isRecording = false;
                console.error(`❌ ${this.platform} recorder process error:`, error);
                
                this.onError && this.onError({
                    code: 'RECORDER_PROCESS_ERROR',
                    message: error.message
                });
            });

            return true;

        } catch (error) {
            console.error(`❌ Failed to start ${this.platform} recorder:`, error);
            this.onError && this.onError({
                code: 'RECORDER_START_FAILED',
                message: error.message
            });
            return false;
        }
    }

    /**
     * Stop recording
     */
    stopRecording() {
        if (!this.isRecording || !this.recorderProcess) {
            console.log('No recording to stop');
            return false;
        }

        try {
            console.log(`⏹️ Stopping ${this.platform} recorder...`);
            
            // Send SIGINT to gracefully stop recording
            this.recorderProcess.kill('SIGINT');
            
            // Force kill if not stopped within 5 seconds
            setTimeout(() => {
                if (this.recorderProcess && !this.recorderProcess.killed) {
                    console.log(`🔪 Force killing ${this.platform} recorder process`);
                    this.recorderProcess.kill('SIGKILL');
                }
            }, 5000);

            return true;
        } catch (error) {
            console.error(`❌ Error stopping ${this.platform} recorder:`, error);
            return false;
        }
    }

    /**
     * Check if recording is active
     */
    isActive() {
        return this.isRecording && this.recorderProcess && !this.recorderProcess.killed;
    }

    /**
     * Get platform information
     */
    getPlatformInfo() {
        return {
            platform: this.platform,
            supported: this.isSupportedPlatform(),
            recorderPath: this.isSupportedPlatform() ? this.getRecorderPath() : null,
            recorderExists: this.isSupportedPlatform() ? this.checkRecorderExists() : false
        };
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.isActive()) {
            this.stopRecording();
        }
        
        this.recorderProcess = null;
        this.isRecording = false;
    }
}

module.exports = PlatformRecorder; 