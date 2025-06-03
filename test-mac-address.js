// Simple test script to verify MAC address detection
const { getMacAddress } = require('./src/electron/utils/user-validation');

console.log('🔍 Testing MAC address detection...');
console.log('');

try {
    const macAddress = getMacAddress();
    console.log('✅ MAC Address detected:', macAddress);
    console.log('');
    
    // Test the validation payload structure
    const testPayload = {
        user_id: "user_2xr7UhphbpKQD7c1lGdaqFluHzR",
        mac_address: macAddress
    };
    
    console.log('📊 Sample API payload:');
    console.log(JSON.stringify(testPayload, null, 2));
    console.log('');
    
    console.log('🎯 Ready for API validation!');
    console.log('Expected API URL: https://p2gvha4zvb.execute-api.ap-south-1.amazonaws.com/Prod/trial/validate-access');
    
} catch (error) {
    console.error('❌ Error testing MAC address detection:', error);
} 