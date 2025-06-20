/*
 * user-validation.js - User validation service for access control
 * 
 * This service handles:
 * 1. Getting system MAC address
 * 2. Calling the validation API to check user type
 * 3. Determining user access level based on API response
 */

const os = require('os');
const https = require('https');

// API configuration
const VALIDATION_API_URL = 'https://p2gvha4zvb.execute-api.ap-south-1.amazonaws.com/Prod/trial/validate-access';

/**
 * Get the MAC address of the primary network interface
 * @returns {string} The MAC address or fallback identifier
 */
function getMacAddress() {
    try {
        const networkInterfaces = os.networkInterfaces();
        
        // Priority order for interface selection
        const interfacePriorities = ['eth0', 'en0', 'Wi-Fi', 'Ethernet'];
        
        // Try to find a priority interface first
        for (const interfaceName of interfacePriorities) {
            const interfaces = networkInterfaces[interfaceName];
            if (interfaces) {
                for (const iface of interfaces) {
                    if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
                        console.log(`✅ MAC address found from ${interfaceName}:`, iface.mac);
                        return iface.mac;
                    }
                }
            }
        }
        
        // Fallback: find any interface with a valid MAC address
        for (const [interfaceName, interfaces] of Object.entries(networkInterfaces)) {
            if (interfaces) {
                for (const iface of interfaces) {
                    if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
                        console.log(`✅ MAC address found from ${interfaceName}:`, iface.mac);
                        return iface.mac;
                    }
                }
            }
        }
        
        // Final fallback: use hostname + platform as identifier
        const fallbackId = `${os.hostname()}.${os.platform()}`;
        console.warn('⚠️ No valid MAC address found, using fallback identifier:', fallbackId);
        return fallbackId;
        
    } catch (error) {
        console.error('❌ Error getting MAC address:', error);
        // Emergency fallback
        const emergencyId = `fallback.${Date.now()}`;
        console.warn('⚠️ Using emergency fallback identifier:', emergencyId);
        return emergencyId;
    }
}

/**
 * Validate user access via API call
 * @param {string} userId - The Clerk user ID
 * @param {string} macAddress - The system MAC address
 * @returns {Promise<Object>} Validation result with user type and access info
 */
async function validateUserAccess(userId, macAddress) {
    return new Promise((resolve, reject) => {
        console.log('🔍 [USER-VALIDATION] Validating user access...');
        console.log('📊 [USER-VALIDATION] Request details:', {
            userId: userId ? `${userId.substring(0, 8)}...` : 'none',
            macAddress: macAddress ? `${macAddress.substring(0, 8)}...` : 'none',
            apiUrl: VALIDATION_API_URL
        });
        
        const payload = {
            user_id: userId,
            mac_address: macAddress
        };
        
        const payloadString = JSON.stringify(payload);
        console.log('payloadString', payloadString);
        
        const options = {
            hostname: 'p2gvha4zvb.execute-api.ap-south-1.amazonaws.com',
            port: 443,
            path: '/Prod/trial/validate-access',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payloadString),
                'Accept': 'application/json',
                'User-Agent': 'InterviewLift-Electron/1.0'
            },
            timeout: 10000 // 10 second timeout
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            console.log(`📡 [USER-VALIDATION] API response status: ${res.statusCode}`);
            console.log(`📡 [USER-VALIDATION] API response headers:`, res.data);
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    console.log(`📄 [USER-VALIDATION] Raw API response:`, data);
                    
                    let result;
                    if (data.trim()) {
                        result = JSON.parse(data);
                    } else {
                        // Handle empty response
                        result = { status: 'success', user_type: 'basic', message: 'Default access granted' };
                    }
                    
                    console.log(`📊 [USER-VALIDATION] Parsed API response:`, result);
                    
                    if (res.statusCode === 200 || res.statusCode === 201) {
                        // Success response
                        const validationResult = {
                            success: true,
                            userType: result.user_type || 'basic',
                            accessLevel: result.access_level || 'standard',
                            message: result.message || 'Access validated successfully',
                            trialDays: result.trial_days || null,
                            isTrialUser: result.is_trial || false,
                            features: result.features || [],
                            expiryDate: result.expiry_date || null,
                            rawResponse: result
                        };
                        
                        console.log('✅ [USER-VALIDATION] User validation successful:', {
                            userType: validationResult.userType,
                            accessLevel: validationResult.accessLevel,
                            isTrialUser: validationResult.isTrialUser,
                            trialDays: validationResult.trialDays
                        });
                        
                        resolve(validationResult);
                    } else {
                        // Error response
                        console.error(`❌ [USER-VALIDATION] API error response (${res.statusCode}):`, result);
                        resolve({
                            success: false,
                            error: result.error || result.message || `API error: ${res.statusCode}`,
                            statusCode: res.statusCode,
                            userType: 'basic', // Fallback to basic access
                            accessLevel: 'limited',
                            message: 'Validation failed, using fallback access'
                        });
                    }
                } catch (parseError) {
                    console.error('❌ [USER-VALIDATION] Failed to parse API response:', parseError);
                    console.error('❌ [USER-VALIDATION] Raw response data:', data);
                    resolve({
                        success: false,
                        error: 'Invalid API response format',
                        userType: 'basic', // Fallback to basic access
                        accessLevel: 'limited',
                        message: 'Validation failed, using fallback access'
                    });
                }
            });
        });
        
        req.on('error', (error) => {
            console.error('❌ [USER-VALIDATION] API request failed:', error);
            resolve({
                success: false,
                error: error.message || 'Network error',
                userType: 'basic', // Fallback to basic access
                accessLevel: 'limited',
                message: 'Network error, using fallback access'
            });
        });
        
        req.on('timeout', () => {
            console.error('❌ [USER-VALIDATION] API request timeout');
            req.destroy();
            resolve({
                success: false,
                error: 'Request timeout',
                userType: 'basic', // Fallback to basic access
                accessLevel: 'limited',
                message: 'Request timeout, using fallback access'
            });
        });
        
        // Write the payload and send the request
        req.write(payloadString);
        req.end();
    });
}

/**
 * Perform complete user validation with automatic MAC address detection
 * @param {Object} user - The user object from Clerk authentication
 * @returns {Promise<Object>} Complete validation result
 */
async function performUserValidation(user) {
    try {
        console.log('🚀 [USER-VALIDATION] Starting complete user validation...');
        
        if (!user || !user.id) {
            throw new Error('Invalid user object - missing user ID');
        }
        
        // Get MAC address
        const macAddress = getMacAddress();
        
        // Call validation API
        const validationResult = await validateUserAccess(user.id, macAddress);
        
        // Store validation result globally for future reference
        global.userValidation = {
            ...validationResult,
            validatedAt: new Date().toISOString(),
            userId: user.id,
            macAddress: macAddress
        };
        
        console.log('✅ [USER-VALIDATION] Complete validation finished:', {
            success: validationResult.success,
            userType: validationResult.userType,
            accessLevel: validationResult.accessLevel
        });
        
        return validationResult;
        
    } catch (error) {
        console.error('❌ [USER-VALIDATION] Complete validation failed:', error);
        
        // Return fallback validation result
        const fallbackResult = {
            success: false,
            error: error.message,
            userType: 'basic',
            accessLevel: 'limited',
            message: 'Validation failed, using fallback access'
        };
        
        global.userValidation = {
            ...fallbackResult,
            validatedAt: new Date().toISOString(),
            userId: user?.id || 'unknown',
            macAddress: 'unknown'
        };
        
        return fallbackResult;
    }
}

module.exports = {
    getMacAddress,
    validateUserAccess,
    performUserValidation
}; 