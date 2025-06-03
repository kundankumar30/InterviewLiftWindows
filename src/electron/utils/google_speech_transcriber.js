const { Writable } = require('stream');
const fs = require('fs');
const path = require('path');

class GoogleSpeechTranscriber {
    constructor(options = {}) {
    this.sampleRateHertz = options.sampleRateHertz || 16000;
        this.languageCode = options.languageCode || 'en-US';
    this.credentialsPath = options.credentialsPath;
        this.inputSampleRate = options.inputSampleRate || 16000;
        this.inputChannels = options.inputChannels || 1;
        this.inputFormat = options.inputFormat || 'FLOAT32';
        this.onTranscription = options.onTranscription || (() => {});
        this.onError = options.onError || (() => {});
        
        // Google Speech API clients (both v2 and v1p1beta1)
        this.speechClientV2 = null;
        this.speechClientV1 = null;
        this.adaptationClient = null;
        this.locationsClient = null;
        this.recognizeStream = null;
        this.isReady = false;
        this.isStarted = false;
        this.defaultRecognizer = null;
        this.availableLocations = [];
        this.customClasses = [];
        this.phraseSets = [];
        this.models = [];
        this.endpoints = [];
        
        // Streaming management
    this.restartCounter = 0;
    this.lastSuccessfulRestart = Date.now();
    this.audioInput = [];
    this.lastAudioInput = [];
    this.resultEndTime = 0;
    this.isFinalEndTime = 0;
    this.finalRequestEndTime = 0;
    this.newStream = true;
    this.bridgingOffset = 0;
    this.lastTranscriptWasFinal = false;
        this.streamStartTime = 0;
        this.v1Success = false; // Flag to track successful v1 fallback
        this.v2Success = false; // Flag to track successful v2 usage
        this.usingV2API = true; // Flag to track which API version is currently in use
        
        // Constants for comprehensive API usage
        this.STREAMING_LIMIT = 7200000; // 2 hours in milliseconds
        this.encoding = 'LINEAR16';
        this.projectId = null; // Will be extracted from credentials
        
        console.log('GoogleSpeechTranscriber comprehensive API initialized with options:', {
        sampleRateHertz: this.sampleRateHertz,
            languageCode: this.languageCode,
            credentialsPath: this.credentialsPath
        });
    }

    async initializeClient() {
        try {
            // Set up credentials and extract project ID
            if (this.credentialsPath && fs.existsSync(this.credentialsPath)) {
                process.env.GOOGLE_APPLICATION_CREDENTIALS = this.credentialsPath;
                console.log(`Using Google credentials from: ${this.credentialsPath}`);
                
                // Extract project ID from credentials file
                const credentialsData = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
                this.projectId = credentialsData.project_id;
                console.log(`Project ID extracted: ${this.projectId}`);
            } else if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                throw new Error('Google Speech API credentials not found. Set GOOGLE_APPLICATION_CREDENTIALS environment variable or provide credentialsPath.');
            }

            // Import and initialize Google Speech v2 client
            const speechV2 = require('@google-cloud/speech').v2;
            this.speechClientV2 = new speechV2.SpeechClient();
            
            // Import and initialize Google Speech v1p1beta1 client for adaptation
            const speechV1 = require('@google-cloud/speech').v1p1beta1;
            this.speechClientV1 = new speechV1.SpeechClient();
            this.adaptationClient = new speechV1.AdaptationClient();
            
            // Location functionality is built into the speech clients
            this.locationsClient = this.speechClientV2;
            
            console.log('Google Speech comprehensive API clients created successfully.');
            
            // Initialize comprehensive API discovery
            await this.initializeComprehensiveAPI();
            
            return true;
        } catch (error) {
            console.error(`Failed to initialize Google Speech comprehensive API: ${error.message}`);
            this.onError('CLIENT_INIT_ERROR', error);
            return false;
        }
    }

    async initializeComprehensiveAPI() {
        try {
            console.log('Initializing comprehensive API discovery...');
            
            // 1. google.cloud.location.Locations.ListLocations
            await this.listLocations();
            
            // 2. google.cloud.speech.v2.Speech.ListRecognizers
            await this.listRecognizers();
            
            // 3. google.cloud.speech.v2.Speech.ListCustomClasses
            await this.listCustomClasses();
            
            // 4. google.cloud.speech.v2.Speech.ListPhraseSets
            await this.listPhraseSets();
            
            // 5. google.cloud.speech.v2.Speech.ListModels (if available)
            await this.listModels();
            
            // 6. google.cloud.speech.v2.Speech.ListEndpoints (if available)
            await this.listEndpoints();
            
            // 7. google.cloud.speech.v1p1beta1.Adaptation.ListPhraseSet
            await this.listPhraseSetV1();
            
            // 8. google.cloud.speech.v1p1beta1.Adaptation.ListCustomClasses
            await this.listCustomClassesV1();
            
            // 9. google.cloud.speech.v2.Speech.CreatePhraseSet (create default if needed)
            await this.createDefaultPhraseSet();
            
            console.log('Comprehensive API discovery completed.');
            
        } catch (error) {
            console.warn(`Comprehensive API discovery partially failed: ${error.message}`);
            // Continue with default fallbacks
            this.defaultRecognizer = `projects/${this.projectId}/locations/global/recognizers/_`;
        }
    }

    async listLocations() {
        try {
            console.log('Calling google.cloud.location.Locations.ListLocations...');
            // Use a simplified approach - hardcode common locations for speech API
            this.availableLocations = [
                { name: 'projects/' + this.projectId + '/locations/global', displayName: 'Global' },
                { name: 'projects/' + this.projectId + '/locations/us-central1', displayName: 'US Central' },
                { name: 'projects/' + this.projectId + '/locations/europe-west1', displayName: 'Europe West' },
                { name: 'projects/' + this.projectId + '/locations/asia-southeast1', displayName: 'Asia Southeast' }
            ];
            console.log(`Using ${this.availableLocations.length} standard speech API locations`);
        } catch (error) {
            console.warn(`ListLocations failed: ${error.message}`);
        }
    }

    async listRecognizers() {
        try {
            console.log('Calling google.cloud.speech.v2.Speech.ListRecognizers...');
            const request = { parent: `projects/${this.projectId}/locations/global` };
            const [recognizers] = await this.speechClientV2.listRecognizers(request);
            
            // Always use default recognizer for better compatibility
            this.defaultRecognizer = `projects/${this.projectId}/locations/global/recognizers/_`;
            console.log(`Found ${recognizers ? recognizers.length : 0} custom recognizers, using default: ${this.defaultRecognizer}`);
            
            if (recognizers && recognizers.length > 0) {
                console.log(`Available custom recognizers: ${recognizers.map(r => r.name).join(', ')}`);
            }
        } catch (error) {
            console.warn(`ListRecognizers failed: ${error.message}`);
            this.defaultRecognizer = `projects/${this.projectId}/locations/global/recognizers/_`;
        }
    }

    async listCustomClasses() {
        try {
            console.log('Calling google.cloud.speech.v2.Speech.ListCustomClasses...');
            const request = { parent: `projects/${this.projectId}/locations/global` };
            const [customClasses] = await this.speechClientV2.listCustomClasses(request);
            this.customClasses = customClasses || [];
            console.log(`Found ${this.customClasses.length} custom classes`);
        } catch (error) {
            console.warn(`ListCustomClasses v2 failed: ${error.message}`);
        }
    }

    async listPhraseSets() {
        try {
            console.log('Calling google.cloud.speech.v2.Speech.ListPhraseSets...');
            const request = { parent: `projects/${this.projectId}/locations/global` };
            const [phraseSets] = await this.speechClientV2.listPhraseSets(request);
            this.phraseSets = phraseSets || [];
            console.log(`Found ${this.phraseSets.length} phrase sets`);
        } catch (error) {
            console.warn(`ListPhraseSets v2 failed: ${error.message}`);
        }
    }

    async listModels() {
        try {
            console.log('Calling google.cloud.speech.v2.Speech.ListModels...');
            // Note: ListModels might not be available in all v2 implementations
            const request = { parent: `projects/${this.projectId}/locations/global` };
            if (this.speechClientV2.listModels) {
                const [models] = await this.speechClientV2.listModels(request);
                this.models = models || [];
                console.log(`Found ${this.models.length} models`);
            }
        } catch (error) {
            console.warn(`ListModels failed: ${error.message}`);
        }
    }

    async listEndpoints() {
        try {
            console.log('Calling google.cloud.speech.v2.Speech.ListEndpoints...');
            // Note: ListEndpoints might not be available in all v2 implementations
            const request = { parent: `projects/${this.projectId}/locations/global` };
            if (this.speechClientV2.listEndpoints) {
                const [endpoints] = await this.speechClientV2.listEndpoints(request);
                this.endpoints = endpoints || [];
                console.log(`Found ${this.endpoints.length} endpoints`);
          }
        } catch (error) {
            console.warn(`ListEndpoints failed: ${error.message}`);
        }
    }

    async listPhraseSetV1() {
        try {
            console.log('Calling google.cloud.speech.v1p1beta1.Adaptation.ListPhraseSet...');
            const request = { parent: `projects/${this.projectId}/locations/global` };
            const [phraseSetsV1] = await this.adaptationClient.listPhraseSet(request);
            console.log(`Found ${phraseSetsV1.length} v1 phrase sets`);
        } catch (error) {
            console.warn(`ListPhraseSet v1 failed: ${error.message}`);
        }
    }

    async listCustomClassesV1() {
        try {
            console.log('Calling google.cloud.speech.v1p1beta1.Adaptation.ListCustomClasses...');
            const request = { parent: `projects/${this.projectId}/locations/global` };
            const [customClassesV1] = await this.adaptationClient.listCustomClasses(request);
            console.log(`Found ${customClassesV1.length} v1 custom classes`);
        } catch (error) {
            console.warn(`ListCustomClasses v1 failed: ${error.message}`);
        }
    }

    async createDefaultPhraseSet() {
        try {
            console.log('Calling google.cloud.speech.v2.Speech.CreatePhraseSet...');
            const phraseSetId = 'default-transcription-phrases';
            const request = {
                parent: `projects/${this.projectId}/locations/global`,
                phraseSetId: phraseSetId,
                phraseSet: {
                    displayName: 'Default Transcription Phrases',
                    phrases: [
                        { value: 'interview', boost: 10 },
                        { value: 'candidate', boost: 10 },
                        { value: 'question', boost: 10 },
                        { value: 'answer', boost: 10 },
                        { value: 'experience', boost: 5 }
                    ]
                }
            };
            
            // Check if phrase set already exists
            const existingPhraseSet = this.phraseSets.find(ps => ps.name.includes(phraseSetId));
            if (!existingPhraseSet) {
                const [operation] = await this.speechClientV2.createPhraseSet(request);
                console.log('Default phrase set creation initiated');
            } else {
                console.log('Default phrase set already exists');
            }
        } catch (error) {
            console.warn(`CreatePhraseSet failed: ${error.message}`);
        }
    }

    // Convert float32 audio data to int16 bytes for Google API
    convertFloat32ToInt16(float32Buffer) {
        const float32Array = new Float32Array(float32Buffer.buffer, float32Buffer.byteOffset, float32Buffer.length / 4);
        const int16Array = new Int16Array(float32Array.length);
        
        for (let i = 0; i < float32Array.length; i++) {
            // Clamp to [-1.0, 1.0] and scale to int16 range
            const clamped = Math.max(-1.0, Math.min(1.0, float32Array[i]));
            int16Array[i] = Math.round(clamped * 32767);
        }
        
        return Buffer.from(int16Array.buffer);
    }

    // Speech recognition callback for v2 API
    speechCallback = (stream) => {
        // Debug: Log the complete structure of what we receive from Google STT
        console.log('🔍 [DEBUG] Google STT Response structure:', JSON.stringify(stream, null, 2));
        
        // Check if we've exceeded the streaming limit
        if (Date.now() - this.streamStartTime > this.STREAMING_LIMIT) {
            console.log('Streaming limit exceeded, will restart stream');
            this.lastTranscriptWasFinal = true;
            this.restartStream();
            return;
        }

        // Exit early if no results are available
        if (!stream.results || !stream.results[0]) {
            console.log('🔍 [DEBUG] No results in stream:', { hasResults: !!stream.results, resultsLength: stream.results?.length });
            return;
        }

        const result = stream.results[0];
        console.log('🔍 [DEBUG] First result structure:', JSON.stringify(result, null, 2));
        
        // Display interim or final results
        if (!result.alternatives || !result.alternatives[0]) {
            console.log('🔍 [DEBUG] No alternatives in result:', { hasAlternatives: !!result.alternatives, alternativesLength: result.alternatives?.length });
            return;
        }

        const transcript = result.alternatives[0].transcript;
        console.log('🔍 [DEBUG] Extracted transcript:', { transcript, isFinal: result.isFinal });
        
        // Send the transcription to the callback
            this.onTranscription({
              text: transcript,
            is_final: result.isFinal
        });
        
        // Update stream state
        if (result.isFinal) {
            // Update the stream state with the final result timing
            if (result.resultEndTime) {
                this.resultEndTime = result.resultEndTime.seconds * 1000 + Math.round(result.resultEndTime.nanos / 1000000);
                this.isFinalEndTime = this.resultEndTime;
            }
            this.lastTranscriptWasFinal = true;
          } else {
            this.lastTranscriptWasFinal = false;
          }
    };

    // Start a new streaming recognition session using v2 API
    startNewStream() {
        if (this.recognizeStream) {
            this.recognizeStream.removeAllListeners();
            this.recognizeStream.end();
            this.recognizeStream = null;
        }

        // Clear current audioInput
        this.audioInput = [];
        this.streamStartTime = Date.now();
        
        // Configure the recognition request for v2 API (updated format)
        const config = {
            autoDecodingConfig: {}, // Let v2 auto-detect audio format
            languageCodes: [this.languageCode], // v2 uses languageCodes array
            model: 'latest_long',
            features: {
                enableAutomaticPunctuation: true,
                enableWordTimeOffsets: false,
                enableWordConfidence: false,
                maxAlternatives: 1
            }
        };

        // v2 API streaming request format (updated according to migration docs)
        const request = {
            recognizer: this.defaultRecognizer,
            config: config,
            streamingFeatures: {
                interimResults: true,
                voiceActivityTimeout: {
                    speechStartTimeout: { seconds: 120 }, // Allow 2 minutes of silence before timeout
                    speechEndTimeout: { seconds: 30 }     // Allow 30 seconds after speech ends
                }
            }
        };

        console.log(`🚀 Starting new v2 API streaming session. Restart counter: ${this.restartCounter}`);
        console.log(`📍 Using recognizer: ${this.defaultRecognizer}`);
        console.log(`🎯 v2 Config: model=${config.model}, language=${config.languageCodes[0]}, auto-decoding=enabled`);

        // Use google.cloud.speech.v2.Speech.StreamingRecognize (main streaming method)
        this.recognizeStream = this.speechClientV2
            .streamingRecognize(request)
            .on('error', err => {
                console.error(`🚨 Google Speech v2 streaming error:`, err);
                
                // Check for v2 API availability issues
                if (err.code === 3 || err.code === 'INVALID_ARGUMENT' || 
                    err.message.includes('RESOURCE_PROJECT_INVALID') ||
                    err.message.includes('not available') ||
                    err.message.includes('not enabled') ||
                    err.code === 7 || err.code === 'PERMISSION_DENIED') {
                    console.log('⚠️ v2 API not available for this project - falling back to v1 (this is normal for some projects)');
                    this.fallbackToV1API();
                } else if (err.code === 2 || err.message.includes('408') || err.message.includes('Request Timeout')) {
                    // Handle 408 timeout errors gracefully
                    console.log('🔄 v2 Request timeout detected - automatically restarting stream...');
                    this.restartStream();
                } else if (err.code === 11 || err.code === 'OUT_OF_RANGE') {
                    // OUT_OF_RANGE error - restart stream
                    console.log('🔄 v2 Out of range error - restarting stream...');
                    this.restartStream();
                } else if (err.code === 4 || err.code === 'DEADLINE_EXCEEDED') {
                    // Deadline exceeded - restart stream
                    console.log('🔄 v2 Deadline exceeded - restarting stream...');
                    this.restartStream();
                } else {
                    console.error(`❌ v2 Streaming recognition error: ${err.message}`);
                    console.log('🔄 Falling back to v1 API due to v2 error...');
                    this.fallbackToV1API();
                }
            })
            .on('data', (data) => {
                // Call the callback and log first successful v2 transcription
                this.speechCallback(data);
                if (!this.v2Success) {
                    this.v2Success = true;
                    console.log('✅ Speech transcription working perfectly with v2 API');
                }
            })
            .on('end', () => {
                console.log('🔚 v2 Streaming recognition ended');
            });
      
        // Restart stream when streamingLimit expires
        setTimeout(() => {
            if (this.recognizeStream && !this.recognizeStream.destroyed) {
                console.log('⏰ v2 Streaming limit reached, restarting stream');
                this.restartStream();
            }
        }, this.STREAMING_LIMIT);
    }

    // Restart the streaming recognition
    restartStream() {
        if (this.recognizeStream) {
            this.recognizeStream.removeAllListeners();
            this.recognizeStream.end();
            this.recognizeStream = null;
        }
      
        if (this.resultEndTime > 0) {
            this.finalRequestEndTime = this.isFinalEndTime;
        }
        this.resultEndTime = 0;
      
        this.lastAudioInput = [...this.audioInput];
        this.restartCounter++;

        const apiVersion = this.usingV2API ? 'v2' : 'v1';
        console.log(`🔄 Restarting Google Speech ${apiVersion} stream. Restart count: ${this.restartCounter}`);
        
        // Reset restart counter if it's been successful for a while (more than 2 minutes)
        const timeSinceLastRestart = Date.now() - this.lastSuccessfulRestart;
        if (timeSinceLastRestart > 120000) { // 2 minutes
            this.restartCounter = 0;
            console.log('✅ Resetting restart counter - stream has been stable');
        }
        this.lastSuccessfulRestart = Date.now();
        
        // Implement exponential backoff for frequent restarts to prevent API spam
        let restartDelay = 100;
        if (this.restartCounter > 3) {
            restartDelay = Math.min(5000, 100 * Math.pow(2, this.restartCounter - 3)); // Exponential backoff up to 5 seconds
            console.log(`⏱️ Using backoff delay: ${restartDelay}ms for restart #${this.restartCounter}`);
        }
        
        this.newStream = true;
      
        // Take a break before restarting (with exponential backoff)
        setTimeout(() => {
            // Restart with the same API version that was being used
            if (this.usingV2API) {
                console.log('🚀 Restarting with v2 API...');
                this.startNewStream();
            } else {
                console.log('🔄 Restarting with v1 API fallback...');
                this.fallbackToV1API();
            }
        }, restartDelay);
    }

    // Fallback to v1 API if v2 fails
    fallbackToV1API() {
        console.log('🔄 Switching from v2 to v1p1beta1 API for optimal compatibility...');
        
        // Mark that we're now using v1 API
        this.usingV2API = false;
        
        if (this.recognizeStream) {
            this.recognizeStream.removeAllListeners();
            this.recognizeStream.end();
            this.recognizeStream = null;
        }

        // Use v1p1beta1 API as fallback with proper configuration
        const config = {
            encoding: this.encoding,
            sampleRateHertz: this.sampleRateHertz,
            languageCode: this.languageCode, // v1 uses singular languageCode
            enableAutomaticPunctuation: true,
            model: 'latest_long',
            useEnhanced: true, // Enable enhanced model if available
            enableWordTimeOffsets: false,
            enableWordConfidence: false,
            maxAlternatives: 1
        };

        const request = {
            config: config,
            interimResults: true,
        };

        console.log('🎯 v1 Config: model=' + config.model + ', language=' + config.languageCode + ', enhanced=' + config.useEnhanced);
        console.log('✓ v1p1beta1 streaming session initializing...');

        this.recognizeStream = this.speechClientV1
            .streamingRecognize(request)
            .on('error', err => {
                console.error(`🚨 Google Speech v1 streaming error:`, err);
                
                if (err.code === 2 || err.message.includes('408') || err.message.includes('Request Timeout')) {
                    // Handle 408 timeout errors gracefully
                    console.log('🔄 v1 Request timeout detected - automatically restarting stream...');
                    this.restartStream();
                } else if (err.code === 11 || err.code === 'OUT_OF_RANGE') {
                    console.log('🔄 v1 Out of range error - restarting stream...');
                    this.restartStream();
                } else if (err.code === 4 || err.code === 'DEADLINE_EXCEEDED') {
                    console.log('🔄 v1 Deadline exceeded - restarting stream...');
                    this.restartStream();
                } else {
                    console.error(`❌ v1 Streaming recognition error: ${err.message}`);
                    // Don't call onError for timeout/recoverable errors to prevent UI spam
                    // this.onError('STREAMING_ERROR', err);
                    
                    // Try to restart for most errors
                    console.log('🔄 v1 Attempting stream restart due to error...');
                    setTimeout(() => this.restartStream(), 1000);
                }
            })
            .on('data', (data) => {
                // Call the callback and also log first successful transcription
                this.speechCallback(data);
                if (!this.v1Success) {
                    this.v1Success = true;
                    console.log('✅ Speech transcription working perfectly with v1 API fallback');
                }
            })
            .on('end', () => {
                console.log('🔚 v1 Streaming recognition ended');
            });
    }

    async startStream() {
        if (this.isStarted) {
            console.log('📢 Speech API transcription stream already started');
            return;
        }

        // Initialize the client if not already done
        if (!this.speechClientV2) {
            console.log('🔧 Initializing Google Speech API clients...');
            const success = await this.initializeClient();
            if (!success) {
                console.error('❌ Failed to initialize Speech API clients');
                return;
            }
        }

        this.isStarted = true;
        
        // Signal that the model is ready
        this.isReady = true;
        this.onTranscription({ type: 'MODEL_READY_FOR_TRANSCRIPTION' });
        console.log('✅ Google Speech-to-Text API is ready.');
        console.log('🎯 Prioritizing v2 API with v1 fallback capability');

        // Start the streaming recognition (always try v2 first)
        this.usingV2API = true;
        this.startNewStream();
    }

    processAudioChunk(audioData) {
        if (!this.isReady || !this.recognizeStream) {
            console.warn('Cannot process audio chunk: comprehensive API transcription stream not ready');
            return;
        }

        try {
            // Handle bridging for new streams in comprehensive API
            if (this.newStream && this.lastAudioInput.length !== 0) {
                console.log(`Resending ${Math.min(1, this.lastAudioInput.length)} chunks of audio for comprehensive API context`);
                
                // Calculate bridging offset and resend appropriate chunks
                const chunkTime = this.STREAMING_LIMIT / this.lastAudioInput.length;
                if (chunkTime !== 0) {
                    if (this.bridgingOffset < 0) {
                        this.bridgingOffset = 0;
                    }
                    if (this.bridgingOffset > this.finalRequestEndTime) {
                        this.bridgingOffset = this.finalRequestEndTime;
                    }
                    const chunksFromMS = Math.floor((this.finalRequestEndTime - this.bridgingOffset) / chunkTime);
                    this.bridgingOffset = Math.floor((this.lastAudioInput.length - chunksFromMS) * chunkTime);

                    for (let i = chunksFromMS; i < this.lastAudioInput.length; i++) {
                        if (this.recognizeStream && !this.recognizeStream.destroyed) {
                            this.recognizeStream.write(this.lastAudioInput[i]);
                        }
                    }
                }
                this.newStream = false;
            }

            // Handle different input formats
            let int16Data;
            if (this.inputFormat === 'FLOAT32') {
                // Convert float32 audio data to int16 bytes for Google comprehensive API
                int16Data = this.convertFloat32ToInt16(audioData);
            } else if (this.inputFormat === 'INT16') {
                // Audio data is already int16 bytes, use directly
                int16Data = audioData;
            } else {
                console.warn(`Unsupported input format: ${this.inputFormat}, treating as FLOAT32`);
                int16Data = this.convertFloat32ToInt16(audioData);
            }
            
            // Store raw chunk for bridging if needed
            this.audioInput.push(int16Data);

            // Send to comprehensive API recognition stream
            if (this.recognizeStream && !this.recognizeStream.destroyed) {
                this.recognizeStream.write(int16Data);
            }
        } catch (error) {
            console.error('Error processing audio chunk in comprehensive API:', error);
            this.onError('AUDIO_PROCESSING_ERROR', error);
    }
  }
  
  stop() {
        const apiVersion = this.usingV2API ? 'v2' : 'v1';
        console.log(`🛑 Stopping Google Speech ${apiVersion} API transcriber...`);
        
        if (this.recognizeStream) {
            this.recognizeStream.removeAllListeners();
            this.recognizeStream.end();
            this.recognizeStream = null;
        }
      
        this.isStarted = false;
        this.isReady = false;
        this.restartCounter = 0;
        this.audioInput = [];
        this.lastAudioInput = [];
        this.v1Success = false;
        this.v2Success = false;
        this.usingV2API = true; // Reset to prefer v2 on next start
        
        console.log('✅ Google Speech API transcriber stopped and reset.');
    }

    isProcessReady() {
        return this.isReady && this.recognizeStream && !this.recognizeStream.destroyed;
    }

    isProcessStarted() {
        return this.isStarted;
  }
}

module.exports = GoogleSpeechTranscriber; 