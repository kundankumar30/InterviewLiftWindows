const axios = require('axios');
const { getMacAddress } = require('../auth/user-validation.js');

/**
 * Get user profile from the API
 * @param {string} accessToken - User's access token
 * @returns {Promise<Object>} User profile data
 */
async function getUserProfile(accessToken) {
    try {
        const response = await axios.get(
            'https://ksjd4kbo5a.execute-api.us-east-1.amazonaws.com/Prod/users/profile',
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        return {
            success: true,
            data: response.data
        };
    } catch (error) {
        console.error('❌ [API] Failed to get user profile:', error);
        return {
            success: false,
            error: error.response?.data?.detail || error.message
        };
    }
}

/**
 * Check user trial status with MAC address
 * @param {string} accessToken - User's access token
 * @returns {Promise<Object>} Trial status data
 */
async function checkUserTrial(accessToken) {
    try {
        // Get MAC address for the request
        const macAddress = getMacAddress();
        
        console.log('🔍 [API] Checking user trial with MAC address:', macAddress ? `${macAddress.substring(0, 8)}...` : 'none');
        
        const response = await axios.post(
            'https://ksjd4kbo5a.execute-api.us-east-1.amazonaws.com/Prod/users/trial',
            {
                mac_address: macAddress
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('✅ [API] Trial check successful:', response.data);
        
        return {
            success: true,
            data: response.data
        };
    } catch (error) {
        console.error('❌ [API] Failed to check user trial:', error);
        return {
            success: false,
            error: error.response?.data?.detail || error.message
        };
    }
}

/**
 * Check user trial status on successful login with MAC address
 * This function is specifically called after successful authentication
 * @param {string} accessToken - User's access token
 * @param {string} userId - User's ID from JWT token
 * @returns {Promise<Object>} Trial status data with enhanced logging
 */
async function checkUserTrialOnLogin(accessToken, userId) {
    try {
        // Get MAC address for the request
        const macAddress = getMacAddress();
        
        console.log('🚀 [API] Checking user trial on successful login...');
        console.log('📊 [API] Login trial check details:', {
            macAddress: macAddress ? `${macAddress.substring(0, 8)}...` : 'none',
            hasAccessToken: !!accessToken,
            requestBody: 'MAC address only'
        });
        
        const requestBody = {
            mac_address: macAddress
        };
        
        const response = await axios.post(
            'https://ksjd4kbo5a.execute-api.us-east-1.amazonaws.com/Prod/users/trial',
            requestBody,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('✅ [API] Login trial check successful:', {
            status: response.status,
            userType: response.data?.user_type,
            isTrialUser: response.data?.is_trial,
            trialDays: response.data?.trial_days,
            isPro: response.data?.is_pro
        });
        
        return {
            success: true,
            data: response.data,
            macAddress: macAddress // Include MAC address in response for reference
        };
    } catch (error) {
        console.error('❌ [API] Failed to check user trial on login:', error);
        console.error('❌ [API] Error details:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data
        });
        
        return {
            success: false,
            error: error.response?.data?.detail || error.message,
            macAddress: getMacAddress() // Still include MAC address for debugging
        };
    }
}

module.exports = {
    getUserProfile,
    checkUserTrial,
    checkUserTrialOnLogin
}; 