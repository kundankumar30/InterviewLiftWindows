// Simple test script to verify MAC address detection
const { getMacAddress } = require('./src/electron/utils/user-validation');


try {
    const macAddress = getMacAddress();
    
    // Test the validation payload structure
    const testPayload = {
        user_id: "user_2xr7UhphbpKQD7c1lGdaqFluHzR",
        mac_address: macAddress
    };
    
    
    
} catch (error) {
    console.error('❌ Error testing MAC address detection:', error);
} 