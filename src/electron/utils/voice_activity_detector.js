class VoiceActivityDetector {
    constructor(options = {}) {
        // VAD configuration
        this.sampleRate = options.sampleRate || 16000;
        this.frameSize = options.frameSize || 480; // 30ms at 16kHz
        this.energyThreshold = options.energyThreshold || 0.01; // Minimum energy for voice
        this.silenceThreshold = options.silenceThreshold || 0.005; // Silence detection
        this.voiceMinDuration = options.voiceMinDuration || 50; // Reduced from 100ms to 50ms for faster detection
        this.silenceMinDuration = options.silenceMinDuration || 300; // Minimum silence to stop voice
        
        // Store original thresholds for post-reset boost
        this.originalEnergyThreshold = this.energyThreshold;
        this.originalSilenceThreshold = this.silenceThreshold;
        
        // Post-reset sensitivity boost
        this.postResetBoost = false;
        this.postResetFrameCount = 0;
        this.postResetBoostDuration = 100; // frames (~3 seconds at 30ms chunks)
        
        // Audio buffering to prevent missing start of speech
        this.audioBuffer = []; // Circular buffer to store recent audio chunks
        this.maxBufferSize = Math.ceil((500 / 30) * 2); // Increased to ~500ms buffer (assuming 30ms chunks, doubled for safety)
        this.bufferSentToSTT = false; // Flag to track if buffer has been sent
        
        // State tracking
        this.isVoiceActive = false;
        this.voiceStartTime = 0;
        this.silenceStartTime = 0;
        this.frameBuffer = [];
        this.energyHistory = [];
        this.historySize = 10; // Keep last 10 energy values for smoothing
        
        // Statistics
        this.totalFrames = 0;
        this.voiceFrames = 0;
        this.silenceFrames = 0;
        
        console.log('🎤 Voice Activity Detector initialized with audio buffering');
        console.log(`📊 Config: energyThreshold=${this.energyThreshold}, silenceThreshold=${this.silenceThreshold}`);
        console.log(`🎯 Audio buffer size: ${this.maxBufferSize} chunks (~${Math.round(this.maxBufferSize * 30)}ms)`);
        console.log(`⏱️ Voice min duration: ${this.voiceMinDuration}ms (reduced for faster post-reset detection)`);
    }
    
    // Calculate RMS (Root Mean Square) energy of audio frame
    calculateRMSEnergy(audioData) {
        if (!audioData || audioData.length === 0) return 0;
        
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }
        return Math.sqrt(sum / audioData.length);
    }
    
    // Calculate zero crossing rate (indicator of voice vs noise)
    calculateZeroCrossingRate(audioData) {
        if (!audioData || audioData.length < 2) return 0;
        
        let crossings = 0;
        for (let i = 1; i < audioData.length; i++) {
            if ((audioData[i] >= 0) !== (audioData[i - 1] >= 0)) {
                crossings++;
            }
        }
        return crossings / (audioData.length - 1);
    }
    
    // Smooth energy values using moving average
    smoothEnergy(energy) {
        this.energyHistory.push(energy);
        if (this.energyHistory.length > this.historySize) {
            this.energyHistory.shift();
        }
        
        // Calculate moving average
        const sum = this.energyHistory.reduce((a, b) => a + b, 0);
        return sum / this.energyHistory.length;
    }
    
    // Main VAD processing function
    processAudioChunk(audioData) {
        if (!audioData || audioData.length === 0) {
            return { hasVoice: false, confidence: 0, bufferedChunks: [] };
        }
        
        // Always add current chunk to circular buffer (for capturing speech start)
        this.audioBuffer.push(audioData);
        if (this.audioBuffer.length > this.maxBufferSize) {
            this.audioBuffer.shift(); // Remove oldest chunk
        }
        
        // Handle post-reset sensitivity boost
        if (this.postResetBoost) {
            this.postResetFrameCount++;
            
            // Gradually reduce sensitivity boost over time
            const boostProgress = this.postResetFrameCount / this.postResetBoostDuration;
            if (boostProgress >= 1.0) {
                // Boost period ended, return to normal sensitivity
                this.postResetBoost = false;
                this.energyThreshold = this.originalEnergyThreshold;
                this.silenceThreshold = this.originalSilenceThreshold;
                console.log('🎤 VAD: Post-reset sensitivity boost ended, returning to normal thresholds');
            } else {
                // Gradually increase thresholds back to normal
                const boostFactor = 1.0 - (boostProgress * 0.5); // Start at 50% of normal, gradually increase
                this.energyThreshold = this.originalEnergyThreshold * boostFactor;
                this.silenceThreshold = this.originalSilenceThreshold * boostFactor;
            }
        }
        
        // Convert Buffer to Float32Array if needed
        let floatData;
        if (audioData instanceof Buffer) {
            // Assuming 16-bit PCM audio data
            floatData = new Float32Array(audioData.length / 2);
            for (let i = 0; i < floatData.length; i++) {
                floatData[i] = audioData.readInt16LE(i * 2) / 32768.0;
            }
        } else if (audioData instanceof Float32Array) {
            floatData = audioData;
        } else {
            console.warn('🎤 VAD: Unknown audio data format');
            return { hasVoice: false, confidence: 0, bufferedChunks: [] };
        }
        
        this.totalFrames++;
        
        // Calculate audio features
        const energy = this.calculateRMSEnergy(floatData);
        const smoothedEnergy = this.smoothEnergy(energy);
        const zeroCrossingRate = this.calculateZeroCrossingRate(floatData);
        
        // Voice detection logic
        const isEnergyAboveThreshold = smoothedEnergy > this.energyThreshold;
        const isNotSilence = smoothedEnergy > this.silenceThreshold;
        const hasVoiceCharacteristics = zeroCrossingRate > 0.1 && zeroCrossingRate < 0.8; // Typical voice range
        
        const currentTime = Date.now();
        
        // Determine if current frame contains voice
        const frameHasVoice = isEnergyAboveThreshold && isNotSilence && hasVoiceCharacteristics;
        
        // Buffer to return when voice activity starts
        let bufferedChunksToSend = [];
        
        // State machine for voice activity
        if (frameHasVoice) {
            if (!this.isVoiceActive) {
                // Potential voice start
                if (this.voiceStartTime === 0) {
                    this.voiceStartTime = currentTime;
                } else if (currentTime - this.voiceStartTime >= this.voiceMinDuration) {
                    // Voice confirmed after minimum duration
                    this.isVoiceActive = true;
                    this.silenceStartTime = 0;
                    
                    // CRITICAL: Send buffered chunks to capture start of speech
                    if (!this.bufferSentToSTT) {
                        bufferedChunksToSend = [...this.audioBuffer]; // Copy entire buffer
                        this.bufferSentToSTT = true;
                        console.log(`🎤 VAD: Voice activity started - sending ${bufferedChunksToSend.length} buffered chunks to prevent word loss`);
                    }
                    
                    // Send VAD event to renderer if available
                    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                        global.mainWindow.webContents.send('vad-voice-activity', { 
                            type: 'voice-started', 
                            timestamp: Date.now() 
                        });
                    }
                }
            } else {
                // Voice continues
                this.silenceStartTime = 0;
            }
        } else {
            if (this.isVoiceActive) {
                // Potential voice end
                if (this.silenceStartTime === 0) {
                    this.silenceStartTime = currentTime;
                } else if (currentTime - this.silenceStartTime >= this.silenceMinDuration) {
                    // Silence confirmed after minimum duration
                    this.isVoiceActive = false;
                    this.voiceStartTime = 0;
                    this.bufferSentToSTT = false; // Reset for next voice activity
                    console.log('🎤 VAD: Voice activity stopped');
                    // Send VAD event to renderer if available
                    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
                        global.mainWindow.webContents.send('vad-voice-activity', { 
                            type: 'voice-stopped', 
                            timestamp: Date.now() 
                        });
                    }
                }
            } else {
                // Continue silence
                this.voiceStartTime = 0;
            }
        }
        
        // Update statistics
        if (this.isVoiceActive || frameHasVoice) {
            this.voiceFrames++;
        } else {
            this.silenceFrames++;
        }
        
        // Calculate confidence based on energy and characteristics
        let confidence = 0;
        if (frameHasVoice) {
            confidence = Math.min(1.0, smoothedEnergy / this.energyThreshold);
            if (hasVoiceCharacteristics) {
                confidence *= 1.2; // Boost confidence for voice-like characteristics
            }
            confidence = Math.min(1.0, confidence);
        }
        
        // Log periodic statistics
        if (this.totalFrames % 1000 === 0) {
            const voicePercentage = ((this.voiceFrames / this.totalFrames) * 100).toFixed(1);
            console.log(`🎤 VAD Stats: ${voicePercentage}% voice activity (${this.voiceFrames}/${this.totalFrames} frames)`);
        }
        
        return {
            hasVoice: this.isVoiceActive || frameHasVoice,
            confidence: confidence,
            energy: smoothedEnergy,
            isActive: this.isVoiceActive,
            bufferedChunks: bufferedChunksToSend, // Return buffered chunks when voice starts
            debug: {
                rawEnergy: energy,
                smoothedEnergy: smoothedEnergy,
                zeroCrossingRate: zeroCrossingRate,
                isEnergyAboveThreshold: isEnergyAboveThreshold,
                isNotSilence: isNotSilence,
                hasVoiceCharacteristics: hasVoiceCharacteristics
            }
        };
    }
    
    // Get current VAD statistics
    getStatistics() {
        const totalFrames = this.totalFrames || 1; // Avoid division by zero
        return {
            totalFrames: this.totalFrames,
            voiceFrames: this.voiceFrames,
            silenceFrames: this.silenceFrames,
            voicePercentage: (this.voiceFrames / totalFrames) * 100,
            silencePercentage: (this.silenceFrames / totalFrames) * 100,
            currentState: this.isVoiceActive ? 'voice' : 'silence'
        };
    }
    
    // Reset VAD state
    reset() {
        this.isVoiceActive = false;
        this.voiceStartTime = 0;
        this.silenceStartTime = 0;
        this.frameBuffer = [];
        
        // Keep some energy history to maintain calibration after reset
        // Only clear if we have too much history, otherwise keep recent samples
        if (this.energyHistory.length > 5) {
            this.energyHistory = this.energyHistory.slice(-3); // Keep last 3 samples
            console.log('🎤 VAD: Reset - keeping recent energy history for calibration');
        }
        
        this.audioBuffer = []; // Clear audio buffer
        this.bufferSentToSTT = false; // Reset buffer flag
        
        // Activate post-reset sensitivity boost
        this.postResetBoost = true;
        this.postResetFrameCount = 0;
        this.energyThreshold = this.originalEnergyThreshold * 0.5; // Start with 50% of normal threshold
        this.silenceThreshold = this.originalSilenceThreshold * 0.5;
        
        // Reset statistics but keep frame count for continuity
        const previousFrames = this.totalFrames;
        this.totalFrames = 0;
        this.voiceFrames = 0;
        this.silenceFrames = 0;
        
        console.log(`🎤 VAD: Reset completed (previous session: ${previousFrames} frames)`);
        console.log('🎤 VAD: Ready for immediate speech detection with enhanced sensitivity');
        console.log(`🚀 VAD: Post-reset boost activated - 50% lower thresholds for ${this.postResetBoostDuration} frames`);
    }
    
    // Adjust sensitivity dynamically
    adjustSensitivity(sensitivity) {
        // sensitivity: 0.1 (very sensitive) to 1.0 (less sensitive)
        const baseSensitivity = 0.01;
        this.energyThreshold = baseSensitivity * sensitivity;
        this.silenceThreshold = this.energyThreshold * 0.5;
        console.log(`🎤 VAD: Sensitivity adjusted to ${sensitivity} (threshold: ${this.energyThreshold})`);
    }
}

module.exports = VoiceActivityDetector; 