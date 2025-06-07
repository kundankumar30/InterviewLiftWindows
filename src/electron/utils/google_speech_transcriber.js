/*
* google_speech_transcriber.js - Optimized Google Speech-to-Text transcription service
*
* Uses Google Cloud Speech-to-Text v1p1beta1 API for streaming audio transcription.
* Supports INT16 and FLOAT32 input formats, with automatic stream restarts for stability.
*/


const { Writable } = require('stream');
const fs = require('fs');


class GoogleSpeechTranscriber {
   constructor(options = {}) {
       this.sampleRateHertz = options.sampleRateHertz || 16000;
       this.languageCode = options.languageCode || 'en-US';
       this.credentialsPath = options.credentialsPath;
       this.inputSampleRate = options.inputSampleRate || 16000;
       this.inputChannels = options.inputChannels || 1;
       this.inputFormat = options.inputFormat || 'INT16';
       this.onTranscription = options.onTranscription || (() => {});
       this.onError = options.onError || (() => {});
       this.speechClient = null;
       this.recognizeStream = null;
       this.isReady = false;
       this.isStarted = false;
       this.restartCounter = 0;
       this.streamStartTime = 0;
       this.audioInput = [];
       this.lastAudioInput = [];
       this.resultEndTime = 0;
       this.isFinalEndTime = 0;
       this.newStream = true;
       this.bridgingOffset = 0;
       this.STREAMING_LIMIT = 7200000; // 2 hours
       this.encoding = 'LINEAR16';
       this.projectId = null;
       this.hasLoggedFormat = false;
       
       // Add memory management tracking
       this.activeTimers = new Set();
       this.audioBufferLimit = 1000; // Limit audio buffer size
       this.cleanupInterval = null;
       
       // Start periodic cleanup
       this.startPeriodicCleanup();
   }

   // Enhanced timer wrapper with cleanup tracking
   setTimeoutSafe(callback, delay, label = 'transcriber-timer') {
       const timerId = setTimeout(() => {
           this.activeTimers.delete(timerId);
           try {
               callback();
           } catch (error) {
               console.error(`Transcriber timer callback error (${label}):`, error);
           }
       }, delay);
       this.activeTimers.add(timerId);
       return timerId;
   }

   clearTimeoutSafe(timerId) {
       if (timerId) {
           clearTimeout(timerId);
           this.activeTimers.delete(timerId);
       }
   }

   // Periodic cleanup to prevent memory accumulation
   startPeriodicCleanup() {
       this.cleanupInterval = setInterval(() => {
           this.performMemoryCleanup();
       }, 30000); // Every 30 seconds
   }

   performMemoryCleanup() {
       // Limit audio buffer size
       if (this.audioInput.length > this.audioBufferLimit) {
           console.log(`🧹 Trimming audio buffer from ${this.audioInput.length} to ${this.audioBufferLimit}`);
           this.audioInput = this.audioInput.slice(-this.audioBufferLimit);
       }
       
       if (this.lastAudioInput.length > this.audioBufferLimit) {
           this.lastAudioInput = this.lastAudioInput.slice(-this.audioBufferLimit);
       }

       // Clear old timer references
       const currentTime = Date.now();
       console.log(`🧹 Google Speech cleanup: ${this.activeTimers.size} active timers, ${this.audioInput.length} audio chunks`);
   }

   // Enhanced cleanup function
   emergencyCleanup() {
       console.log('🚨 Google Speech emergency cleanup');
       
       // Clear all timers
       this.activeTimers.forEach(timerId => {
           try {
               clearTimeout(timerId);
           } catch (e) {
               console.warn('Failed to clear transcriber timer:', e);
           }
       });
       this.activeTimers.clear();
       
       // Clear periodic cleanup
       if (this.cleanupInterval) {
           clearInterval(this.cleanupInterval);
           this.cleanupInterval = null;
       }
       
       // Clear buffers
       this.audioInput = [];
       this.lastAudioInput = [];
       
       // Reset stream state
       this.isReady = false;
       this.isStarted = false;
       this.hasLoggedFormat = false;
       
       console.log('✅ Google Speech emergency cleanup completed');
   }

   // Centralized error handler
   handleError(type, message, error = null) {
       console.error(`${type} Error: ${message}`, error || '');
       this.onError(type, error || new Error(message));
   }


   async initializeClient() {
       if (!this.credentialsPath || !fs.existsSync(this.credentialsPath)) {
           this.handleError('CLIENT_INIT', 'Google Speech API credentials not found');
           return false;
       }


       try {
           process.env.GOOGLE_APPLICATION_CREDENTIALS = this.credentialsPath;
           const credentialsData = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
           this.projectId = credentialsData.project_id;
           const speech = require('@google-cloud/speech').v1p1beta1;
           this.speechClient = new speech.SpeechClient();
           return true;
       } catch (error) {
           this.handleError('CLIENT_INIT', 'Failed to initialize Google Speech client', error);
           return false;
       }
   }


   convertFloat32ToInt16(float32Buffer) {
       const float32Array = new Float32Array(float32Buffer.buffer, float32Buffer.byteOffset, float32Buffer.length / 4);
       const int16Array = new Int16Array(float32Array.length);
       for (let i = 0; i < float32Array.length; i++) {
           int16Array[i] = Math.round(Math.max(-1.0, Math.min(1.0, float32Array[i])) * 32767);
       }
       return Buffer.from(int16Array.buffer);
   }


   speechCallback = (stream) => {
       if (Date.now() - this.streamStartTime > this.STREAMING_LIMIT) {
           this.restartStream();
           return;
       }


       const result = stream.results?.[0];
       const transcript = result?.alternatives?.[0]?.transcript;
       if (!transcript) return;


       this.onTranscription({ text: transcript, is_final: result.isFinal });
       if (result.isFinal && result.resultEndTime) {
           this.resultEndTime = this.isFinalEndTime = result.resultEndTime.seconds * 1000 + Math.round(result.resultEndTime.nanos / 1000000);
       }
   };


   startNewStream() {
       this.stopStream();
       this.audioInput = [];
       this.streamStartTime = Date.now();
       this.hasLoggedFormat = false;


       const request = {
           config: {
               encoding: this.encoding,
               sampleRateHertz: this.sampleRateHertz,
               languageCode: this.languageCode,
               enableAutomaticPunctuation: true,
               model: 'latest_long',
               useEnhanced: true,
               maxAlternatives: 1,
           },
           interimResults: true,
       };


       this.recognizeStream = this.speechClient
           .streamingRecognize(request)
           .on('error', (err) => {
               if ([2, 4, 11].includes(err.code) || err.message.includes('408') || err.message.includes('Request Timeout') || err.message.includes('DEADLINE_EXCEEDED')) {
                   this.restartStream();
               } else {
                   this.handleError('STREAMING', `Streaming recognition error: ${err.message}`, err);
                   this.setTimeoutSafe(() => this.restartStream(), 1000, 'error-restart');
               }
           })
           .on('data', this.speechCallback);


       // Use safe timeout with cleanup tracking
       this.setTimeoutSafe(() => {
           if (this.recognizeStream && !this.recognizeStream.destroyed) {
               this.restartStream();
           }
       }, this.STREAMING_LIMIT, 'stream-limit-restart');
   }


   stopStream() {
       if (this.recognizeStream) {
           this.recognizeStream.removeAllListeners();
           this.recognizeStream.end();
           this.recognizeStream = null;
       }
   }


   restartStream() {
       this.stopStream();
       this.lastAudioInput = [...this.audioInput];
       this.resultEndTime = 0;
       this.restartCounter++;
       const restartDelay = this.restartCounter > 3 ? Math.min(5000, 100 * Math.pow(2, this.restartCounter - 3)) : 100;
       setTimeout(() => this.startNewStream(), restartDelay);
   }


   async startStream() {
       if (this.isStarted) return;
       if (!this.speechClient && !(await this.initializeClient())) return;


       this.isStarted = this.isReady = true;
       this.onTranscription({ type: 'MODEL_READY_FOR_TRANSCRIPTION' });
       this.startNewStream();
   }


   processAudioChunk(audioData) {
       if (!this.isReady || !this.recognizeStream) return;


       try {
           if (this.newStream && this.lastAudioInput.length) {
               this.recognizeStream.write(this.lastAudioInput[this.lastAudioInput.length - 1]);
               this.newStream = false;
           }


           const int16Data = this.inputFormat === 'INT16' ? audioData : this.convertFloat32ToInt16(audioData);
           this.audioInput.push(int16Data);


           // --- START: Enhanced Audio Format Log ---
           // Log comprehensive format details once to prevent spamming the console.
           if (!this.hasLoggedFormat) {
               console.log(`[Google STT] 🎵 Comprehensive Audio Format Analysis:`);
               console.log(`  📥 INPUT AUDIO PARAMETERS:`);
               console.log(`    - Input Format: ${this.inputFormat}`);
               console.log(`    - Input Sample Rate: ${this.inputSampleRate} Hz`);
               console.log(`    - Input Channels: ${this.inputChannels}`);
               console.log(`    - Original Chunk Size: ${audioData.length} bytes`);
               console.log(`    - Input Bit Depth: ${this.inputFormat === 'INT16' ? '16-bit' : '32-bit float'}`);
              
               console.log(`  🔄 CONVERSION DETAILS:`);
               console.log(`    - Conversion Applied: ${this.inputFormat === 'INT16' ? 'None (already INT16)' : 'FLOAT32 → INT16'}`);
               console.log(`    - Output Chunk Size: ${int16Data.length} bytes`);
               console.log(`    - Size Change: ${audioData.length !== int16Data.length ? `${audioData.length} → ${int16Data.length} bytes` : 'No change'}`);
              
               console.log(`  📤 OUTPUT TO GOOGLE STT:`);
               console.log(`    - Encoding: ${this.encoding} (16-bit PCM)`);
               console.log(`    - Sample Rate: ${this.sampleRateHertz} Hz`);
               console.log(`    - Channels: 1 (mono)`);
               console.log(`    - Bit Depth: 16-bit signed integer`);
               console.log(`    - Bytes per Sample: 2`);
               console.log(`    - Samples in Chunk: ${int16Data.length / 2}`);
               console.log(`    - Duration of Chunk: ${((int16Data.length / 2) / this.sampleRateHertz * 1000).toFixed(1)} ms`);
              
               console.log(`  🔧 STREAM CONFIGURATION:`);
               console.log(`    - Language Code: ${this.languageCode}`);
               console.log(`    - Model: latest_long`);
               console.log(`    - Enhanced: true`);
               console.log(`    - Auto Punctuation: true`);
               console.log(`    - Streaming Limit: ${this.STREAMING_LIMIT / 1000} seconds`);
               console.log(`    - Project ID: ${this.projectId || 'Not available'}`);
              
               this.hasLoggedFormat = true; // Set flag to only log once per stream
           }
           // --- END: Enhanced Audio Format Log ---


           if (this.recognizeStream && !this.recognizeStream.destroyed) {
               this.recognizeStream.write(int16Data);
           }
       } catch (error) {
           this.handleError('AUDIO_PROCESSING', 'Error processing audio chunk', error);
       }
   }


   stop() {
       console.log('🛑 Stopping Google Speech Transcriber');
       
       // Emergency cleanup
       this.emergencyCleanup();
       
       // Stop the current stream
       this.stopStream();
       
       // Clear speech client
       if (this.speechClient) {
           try {
               this.speechClient.close();
           } catch (error) {
               console.warn('Error closing speech client:', error);
           }
           this.speechClient = null;
       }
       
       console.log('✅ Google Speech Transcriber stopped');
   }


   isProcessReady() {
       return this.isReady && this.recognizeStream && !this.recognizeStream.destroyed;
   }


   isProcessStarted() {
       return this.isStarted;
   }
}


module.exports = GoogleSpeechTranscriber;

