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
    
    const recorder = new WindowsAudioRecorder();
    
    // Set up callbacks to verify they're called correctly
    let statusUpdates = [];
    let errors = [];
    let audioDataReceived = false;
    
    recorder.setCallbacks({
        onAudioData: (chunk) => {
            if (!audioDataReceived) {
                audioDataReceived = true;
            }
        },
        onStatusUpdate: (status) => {
            statusUpdates.push(status);
        },
        onError: (error) => {
            errors.push(error);
        }
    });
    
    const available = await recorder.checkRecorderAvailability();
    
    if (!available) {
        return;
    }
    
    const success = await recorder.startRecording();
    
    
    if (success) {
        
        // Let it run for a few seconds to test audio data
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        recorder.stopRecording();
        
        
        if (statusUpdates.length > 0 && !errors.length) {
        } else {
        }
    } else {
    }
}

// Run the test
testWindowsRecorderFix().catch(console.error); 