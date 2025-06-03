const path = require('path');

// Mock the app object properly before importing the recorder
global.app = {
    isPackaged: false
};

// Mock the app import
require.cache[require.resolve('electron')] = {
    exports: {
        app: global.app
    }
};

// Import the fixed WindowsAudioRecorder
const WindowsAudioRecorder = require('./src/electron/utils/windows_audio_recorder');

async function testWindowsRecorderFix() {
    console.log('🔧 Testing Windows Audio Recorder callback fix...');
    
    const recorder = new WindowsAudioRecorder();
    
    // Set up callbacks to verify they're called correctly
    let statusUpdates = [];
    let errors = [];
    let audioDataReceived = false;
    
    recorder.setCallbacks({
        onAudioData: (chunk) => {
            if (!audioDataReceived) {
                console.log('✅ Audio data callback working - received chunk of size:', chunk.length);
                audioDataReceived = true;
            }
        },
        onStatusUpdate: (status) => {
            console.log('✅ Status update callback working:', status);
            statusUpdates.push(status);
        },
        onError: (error) => {
            console.log('❌ Error callback working:', error);
            errors.push(error);
        }
    });
    
    console.log('📍 Testing recorder availability...');
    const available = await recorder.checkRecorderAvailability();
    console.log(`🔍 Recorder available: ${available}`);
    
    if (!available) {
        console.log('❌ Recorder not available - cannot test further');
        return;
    }
    
    console.log('🚀 Testing recorder start...');
    const success = await recorder.startRecording();
    
    console.log(`📊 Recording start result: ${success}`);
    console.log(`📊 Status updates received: ${statusUpdates.length}`);
    console.log(`📊 Errors received: ${errors.length}`);
    
    if (success) {
        console.log('✅ Recorder started successfully!');
        
        // Let it run for a few seconds to test audio data
        console.log('⏱️ Running for 5 seconds to test audio capture...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('🛑 Stopping recorder...');
        recorder.stopRecording();
        
        console.log('📊 Final results:');
        console.log(`   - Status updates: ${statusUpdates.length}`);
        console.log(`   - Audio data received: ${audioDataReceived}`);
        console.log(`   - Errors: ${errors.length}`);
        
        if (statusUpdates.length > 0 && !errors.length) {
            console.log('🎉 WindowsAudioRecorder fix successful!');
        } else {
            console.log('⚠️ Some issues remain');
        }
    } else {
        console.log('❌ Failed to start recorder');
        console.log('Last errors:', errors);
    }
}

// Run the test
testWindowsRecorderFix().catch(console.error); 