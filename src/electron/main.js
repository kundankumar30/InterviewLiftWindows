require('dotenv').config();
const { app, BrowserWindow, ipcMain, dialog, shell, powerSaveBlocker, screen, globalShortcut } = require("electron");
const os = require("os");
const path = require("path");
const url = require('url');
// Authentication-related IPC handlers (OTP-based authentication)
const { getUserProfile, checkUserTrial, checkUserTrialOnLogin } = require('./utils/api/user-api.js');
const axios = require('axios');


    ipcMain.handle('send-otp', async (event, { phoneNumber }) => {
        console.log('📱 [MAIN] Sending OTP to:', phoneNumber);
        
        try {
            if (!phoneNumber) {
                return { success: false, error: 'Phone number is required' };
            }
            
            // Send OTP via AWS API
            const response = await axios.post('https://ksjd4kbo5a.execute-api.us-east-1.amazonaws.com/Prod/users/send-otp', {
                phone_number: phoneNumber
            });

            if (response.status === 200) {
                console.log('✅ [MAIN] OTP sent successfully to:', phoneNumber);
                return { success: true, message: 'OTP sent successfully!' };
            } else {
                console.error('❌ [MAIN] Failed to send OTP:', response.data);
                return { success: false, error: 'Failed to send OTP' };
            }
        } catch (error) {
            console.error('❌ [MAIN] OTP sending error:', error);
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to send OTP. Please try again.';
            return { success: false, error: errorMessage };
        }
    });
// MAC address fetching function
function getMacAddress() {
  try {
    const networkInterfaces = os.networkInterfaces();
    console.log('🔍 Fetching MAC address from network interfaces...');

    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];

      for (const iface of interfaces) {
        if (
          !iface.mac ||
          iface.mac === '00:00:00:00:00:00' ||
          iface.internal ||
          iface.family !== 'IPv4'
        ) {
          continue;
        }

        console.log(`✅ Found valid MAC address: ${iface.mac} on interface ${interfaceName}`);
        return iface.mac;
      }
    }

    console.warn('⚠️ No valid MAC address found.');
    return null;
  } catch (error) {
    console.error('❌ Error fetching MAC address:', error.message);
    return null;
  }
}
/**
 * Register all authentication-related IPC handlers
 * @param {Electron.ipcMain} ipcMain 
 */
    console.log('🔐 Registering OTP-based authentication handlers...');

    // Handle OTP sending

    // Handle OTP verification
    ipcMain.handle('verify-otp', async (event, { phoneNumber, otp }) => {
        console.log('🔐 [MAIN] Verifying OTP for:', phoneNumber);
        
        try {
            if (!phoneNumber || !otp) {
                return { success: false, error: 'Phone number and OTP are required' };
            }
            
            // Verify OTP via AWS API
            const response = await axios.post('https://ksjd4kbo5a.execute-api.us-east-1.amazonaws.com/Prod/users/verify-otp', {
                phone_number: phoneNumber,
                otp_code: otp
            });

            if (response.status === 200 && response.data.access_token) {
                console.log('✅ [MAIN] OTP verified successfully for:', phoneNumber);
                
                const accessToken = response.data.access_token;
                
                // Extract user ID from JWT token first
                let userId = Math.random().toString(36).substr(2, 9);
                try {
                    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
                    userId = payload.sub; // Extract user ID from JWT 'sub' field
                    console.log('✅ [MAIN] User ID extracted from JWT:', userId ? `${userId.substring(0, 8)}...` : 'none');
                } catch (error) {
                    console.error('❌ [MAIN] Error decoding JWT token:', error);
                }

                // Get user profile and trial status with MAC address
                console.log('🔍 [MAIN] Fetching user profile and trial status with MAC address...');
                const [profileResult, trialResult] = await Promise.all([
                    getUserProfile(accessToken),
                    checkUserTrialOnLogin(accessToken, userId) // Use the enhanced login-specific function
                ]);

                // Create user object for Electron
                const userData = {
                    id: userId,
                    fullName: profileResult.success ? 
                        `${profileResult.data.first_name || ''} ${profileResult.data.last_name || ''}`.trim() : 
                        `User ${phoneNumber.slice(-4)}`, // Default name using last 4 digits
                    phoneNumber: phoneNumber,
                    email: profileResult.success ? profileResult.data.email : '',
                    isPhoneVerified: true,
                    country: 'US', // Default, could be detected from phone number
                    createdAt: new Date().toISOString(),
                    lastSignInAt: new Date().toISOString(),
                    accessToken: accessToken,
                    needsProfileCompletion: !profileResult.success || !profileResult.data.first_name || !profileResult.data.email,
                    profile: profileResult.success ? profileResult.data : null,
                    trial: trialResult.success ? trialResult.data : null,
                    macAddress: trialResult.macAddress, // Include MAC address for debugging/reference
                    trialCheckSuccess: trialResult.success // Flag to indicate if trial check was successful
                };
                
                // Log successful authentication with trial status
                console.log('🎉 [MAIN] User authentication completed:', {
                    userId: userData.id ? `${userData.id.substring(0, 8)}...` : 'none',
                    phoneNumber: userData.phoneNumber,
                    hasProfile: !!userData.profile,
                    trialStatus: userData.trial ? {
                        isTrialUser: userData.trial.is_trial,
                        isPro: userData.trial.is_pro,
                        trialDays: userData.trial.trial_days
                    } : 'No trial data',
                    macAddress: userData.macAddress ? `${userData.macAddress.substring(0, 8)}...` : 'none',
                    trialCheckSuccess: userData.trialCheckSuccess
                });
                
                // Store user data globally
                global.currentUser = userData;
                global.authToken = accessToken;
                
                // Send success message to renderer
                event.sender.send('auth-success', userData);
                
                console.log('✅ [MAIN] Authentication successful for:', userData.phoneNumber);
                
                return { 
                    success: true, 
                    message: 'OTP verified successfully!', 
                    userData,
                    needsProfileCompletion: userData.needsProfileCompletion
                };
            }
            console.error('❌ [MAIN] Invalid OTP response:', response.data);
            return { success: false, error: 'Invalid OTP' };
        } catch (error) {
            console.error('❌ [MAIN] OTP verification error:', error);
            const errorMessage = error.response?.data?.detail || error.message || 'Invalid OTP. Please try again.';
            return { success: false, error: errorMessage };
        }
    });

    // Handle profile completion
    ipcMain.handle('complete-profile', async (event, { firstName, lastName, email }) => {
        console.log('👤 [MAIN] Completing profile for user:', firstName, lastName, email);
        
        try {
            if (!global.authToken) {
                return { success: false, error: 'No authentication token found' };
            }

            // Update profile via AWS API
            const response = await axios.put(
                'https://ksjd4kbo5a.execute-api.us-east-1.amazonaws.com/Prod/users/profile',
                {
                    first_name: firstName,
                    last_name: lastName,
                    email: email
                },
                {
                    headers: {
                        'Authorization': `Bearer ${global.authToken}`
                    }
                }
            );

            if (response.status === 200) {
                // Update global user data
                if (global.currentUser) {
                    global.currentUser.fullName = `${firstName} ${lastName}`.trim();
                    global.currentUser.email = email;
                    global.currentUser.needsProfileCompletion = false;
                }

                console.log('✅ [MAIN] Profile completed successfully');
                return { success: true, message: 'Profile updated successfully!' };
            } else {
                return { success: false, error: 'Failed to update profile' };
            }
        } catch (error) {
            console.error('❌ [MAIN] Profile completion error:', error);
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to update profile';
            return { success: false, error: errorMessage };
        }
    });

    // Handle authentication completion and navigation
    ipcMain.handle('complete-authentication', async (event) => {
        console.log('🚀 [MAIN] Completing authentication and navigating to welcome screen');
        
        try {
            if (!global.currentUser) {
                return { success: false, error: 'No user data found' };
            }

            // Navigate to welcome screen
            setTimeout(() => {
                console.log('🚀 [MAIN] Navigating to welcome screen after OTP auth');
                transitionToWelcomeMode();
                global.mainWindow.loadFile("./src/electron/screens/welcome/welcome-screen.html");
            }, 1000);
            
            return { success: true };
        } catch (error) {
            console.error('❌ [MAIN] Authentication completion error:', error);
            return { success: false, error: error.message };
        }
    });
    
// IPC handler for MAC address
ipcMain.handle('get-mac-address', async () => {
  console.log('📡 Received IPC request for MAC address');
  const macAddress = getMacAddress();
  
  if (macAddress) {
    return { success: true, macAddress };
  } else {
    return { success: false, error: 'Could not retrieve MAC address' };
  }
});
ipcMain.handle('check-user-trial', async (event, { macAddress, token }) => {
  const timestamp = new Date().toISOString();
  console.log(`📡 [MAIN] [${timestamp}] Received request to check user trial with MAC address:`, macAddress);

  // Validate inputs
  if (!token) {
    console.error(`❌ [MAIN] [${timestamp}] Missing authentication token`);
    return {
      success: false,
      error: 'Authentication token is required'
    };
  }

  if (!macAddress || macAddress === 'unknown') {
    console.warn(`⚠️ [MAIN] [${timestamp}] MAC address is ${macAddress || 'missing'}, proceeding with default`);
  }

  try {
    const apiUrl = 'https://ksjd4kbo5a.execute-api.us-east-1.amazonaws.com/Prod/trial/check-user-trail';
    console.log(`🌐 [MAIN] [${timestamp}] Sending POST request to:`, apiUrl);

    const response = await axios.post(apiUrl, {
      mac_address: macAddress 
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ [MAIN] [${timestamp}] User trial check response -:`, response, {
      status: response.status,
      data: response.data
    });

    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    const errorDetails = {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    };
    console.error(`❌ [MAIN] [${timestamp}] Error checking user trial:`, errorDetails);

    // Specific error handling
    let errorMessage = error.response?.data?.message || error.message || 'Failed to check user trial';
    if (error.response?.status === 401) {
      errorMessage = 'Invalid or expired token';
    } else if (error.response?.status === 429) {
      errorMessage = 'Too many requests, please try again later';
    }

    return {
      success: false,
      error: errorMessage
    };
  }
});
// Define desired opacity for uniform transparency
const DESIRED_OPACITY = 1.5; // 150% opacity for maximum readability

// --- CUSTOM PROTOCOL ---
const CUSTOM_PROTOCOL = 'interviewlift';

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL);
}
// --- END CUSTOM PROTOCOL ---

let deeplinkingUrl; // Variable to store URL when app is opened via protocol

// Global error handling for Google Speech API timeouts and other errors
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  
  // Check if it's a Google Speech API timeout error
  if (error.message && (
    error.message.includes('408:Request Timeout') ||
    error.message.includes('DEADLINE_EXCEEDED') ||
    error.message.includes('grpc') ||
    error.code === 2 || error.code === 4
  )) {
    console.log('🔄 Google Speech API timeout detected - handled gracefully');
    // Don't crash the app for Speech API timeouts
    return;
  }
  
  // For other critical errors, log and potentially restart
  console.error('Critical error occurred:', error);
  
  // Optionally show error dialog for non-Speech API errors
  if (global.mainWindow && !global.mainWindow.isDestroyed()) {
    // PRIVACY FIX: Disable system dialog to prevent app exposure during interviews
    // dialog.showErrorBox('Application Error', 
    //   `An unexpected error occurred: ${error.message}\n\nThe application will continue running, but you may want to restart it if issues persist.`);
    console.error(`🚨 Application Error: An unexpected error occurred: ${error.message}. The application will continue running, but you may want to restart it if issues persist.`);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Check if it's a Google Speech API related rejection
  if (reason && typeof reason === 'object' && (
    (reason.message && reason.message.includes('408:Request Timeout')) ||
    (reason.message && reason.message.includes('grpc')) ||
    reason.code === 2 || reason.code === 4
  )) {
    console.log('🔄 Google Speech API rejection handled gracefully');
    return;
  }
});

const { checkPermissions } = require("./utils/permission");
const { startLiveTranscription, stopLiveTranscription, resetFullTranscriptionService, clearConversationHistory, getGeminiModel, emergencyMemoryCleanup } = require("./utils/recording");
const { raceScreenshotResponse } = require("./utils/ai_race");
const https = require('https');

let powerSaveBlockerId = null;

// Add memory management tracking
const activeIPCHandlers = new Set();
const activeIntervals = new Set();
const memoryCheckInterval = 60000; // Check every 60 seconds

// Enhanced IPC handler wrapper with cleanup tracking
function registerIPCHandler(channel, handler, isHandle = false) {
  if (isHandle) {
    ipcMain.handle(channel, handler);
  } else {
    ipcMain.on(channel, handler);
  }
  activeIPCHandlers.add(channel);
  console.log(`📡 IPC handler registered: ${channel} (${activeIPCHandlers.size} total)`);
}

// Enhanced interval wrapper with cleanup tracking
function setIntervalSafe(callback, delay, label = 'main-interval') {
  const intervalId = setInterval(() => {
    try {
      callback();
    } catch (error) {
      console.error(`Interval callback error (${label}):`, error);
    }
  }, delay);
  activeIntervals.add(intervalId);
  console.log(`⏰ Interval created: ${label} (${activeIntervals.size} active)`);
  return intervalId;
}

function clearIntervalSafe(intervalId, label = 'main-interval') {
  if (intervalId) {
    clearInterval(intervalId);
    activeIntervals.delete(intervalId);
    console.log(`🧹 Interval cleared: ${label} (${activeIntervals.size} remaining)`);
  }
}

// Memory monitoring and cleanup functions
function checkMemoryUsage() {
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const rssUsedMB = Math.round(memUsage.rss / 1024 / 1024);
  
  console.log(`💾 Memory: Heap ${heapUsedMB}MB, RSS ${rssUsedMB}MB`);
  
  // Trigger cleanup if memory usage is high
  if (heapUsedMB > 300 || rssUsedMB > 400) {
    console.log('🚨 HIGH MEMORY USAGE DETECTED - Triggering cleanup');
    performMainProcessCleanup();
  }
  
  return { heapUsedMB, rssUsedMB };
}

function performMainProcessCleanup() {
  console.log('🧹 Performing main process memory cleanup');
  
  // Trigger recording cleanup
  try {
    emergencyMemoryCleanup();
  } catch (error) {
    console.warn('Error in recording cleanup:', error);
  }
  
  // Force garbage collection if available
  if (global.gc) {
    console.log('🗑️ Forcing garbage collection');
    global.gc();
  }
  
  // Clear conversation history to free memory
  try {
    clearConversationHistory();
  } catch (error) {
    console.warn('Error clearing conversation history:', error);
  }
  
  console.log('✅ Main process cleanup completed');
}

function emergencyMainProcessCleanup() {
  console.log('🚨 EMERGENCY MAIN PROCESS CLEANUP');
  
  // Clear all intervals
  activeIntervals.forEach(intervalId => {
    try {
      clearInterval(intervalId);
    } catch (e) {
      console.warn('Failed to clear interval:', e);
    }
  });
  activeIntervals.clear();
  
  // Perform standard cleanup
  performMainProcessCleanup();
  
  console.log('✅ Emergency main process cleanup completed');
}

// Start memory monitoring
const memoryMonitorInterval = setIntervalSafe(checkMemoryUsage, memoryCheckInterval, 'memory-monitor');

// Function to exchange authorization code for tokens
async function exchangeCodeForTokens(authCode) {
  return new Promise((resolve, reject) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${CUSTOM_PROTOCOL}://google-auth-callback`;

    if (!clientId || !clientSecret) {
      reject(new Error('Google Client ID or Client Secret not found. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.'));
      return;
    }

    const postData = new URLSearchParams({
      code: authCode,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString();

    const options = {
      hostname: 'oauth2.googleapis.com',
      port: 443,
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log('Exchanging authorization code for tokens...');

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', async () => {
        try {
          const tokenResponse = JSON.parse(data);
          
          if (tokenResponse.error) {
            reject(new Error(`Token exchange error: ${tokenResponse.error_description || tokenResponse.error}`));
            return;
          }

          console.log('Token exchange successful');
          
          // Extract tokens
          const { id_token, access_token } = tokenResponse;
          
          if (!id_token) {
            reject(new Error('No ID token received from Google'));
            return;
          }

          // Store user data from Google OAuth
          const payload = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64').toString());
          
          const userData = {
            uid: payload.sub,
            email: payload.email,
            displayName: payload.name,
            photoURL: payload.picture
          };

          console.log('Google OAuth sign-in successful:', userData.email);

          // Store user data
          global.currentUser = userData;
          global.authToken = id_token;

          // Send success to renderer
          if (global.authEventSender) {
            global.authEventSender.send('gmail-auth-success', {
              token: id_token,
              user: userData
            });
          }

          // Navigate to welcome screen
          if (global.mainWindow) {
            global.mainWindow.loadFile("./src/electron/screens/welcome/welcome-screen.html");
            console.log('Navigated to welcome screen after Gmail login.');
          }

          resolve();

        } catch (error) {
          reject(new Error(`Failed to parse token response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Token exchange request failed: ${error.message}`));
    });

    req.write(postData);
    req.end();
  });
}

// Function to handle the login token from the redirected URL
async function handleAuthCallback(authUrl) {
  if (!authUrl) return;

  console.log('Handling auth callback URL:', authUrl);
  const parsedUrl = url.parse(authUrl, true);
  const { query } = parsedUrl;

  // Check if this is a Clerk OAuth callback with the new service
  if (authUrl.includes('login-callback')) {
    try {
      const clerkService = require('./utils/clerk-service');
      const userValidation = require('./utils/user-validation');
      
      // Handle the OAuth callback using the direct service
      const result = await clerkService.handleOAuthCallback(query);
      
      if (result.success) {
        console.log('✅ OAuth callback successful via Clerk service:', result.user.email);
        
        // Store user data globally
        global.currentUser = result.user;
        global.authToken = await clerkService.getAuthToken();
        
        // NEW: Perform user validation before redirecting to welcome screen
        console.log('🔍 Performing user validation before welcome screen...');
        try {
          const validationResult = await userValidation.performUserValidation(result.user);
     
          
          // Store validation result with user data
          global.currentUser.validation = validationResult;
          
        } catch (validationError) {
          console.error('❌ User validation failed:', validationError);
          // Continue with fallback access - don't block user
          global.currentUser.validation = {
            success: false,
            error: validationError.message,
            userType: 'basic',
            accessLevel: 'limited'
          };
        }
        
        // Navigate to welcome screen
        if (global.mainWindow) {
          if (global.mainWindow.isMinimized()) {
            global.mainWindow.restore();
          }
          global.mainWindow.focus();
          
          transitionToWelcomeMode();
          global.mainWindow.loadFile("./src/electron/screens/welcome/welcome-screen.html");
          console.log('Navigated to welcome screen after OAuth callback and validation.');
        }
      } else {
        console.error('❌ OAuth callback failed:', result.error);
        if (global.authEventSender) {
          global.authEventSender.send('clerk-oauth-callback-error', result.error);
        }
      }
      
      return;
    } catch (error) {
      console.error('❌ Error handling OAuth callback:', error);
      if (global.authEventSender) {
        global.authEventSender.send('clerk-oauth-callback-error', error.message);
      }
      return;
    }
  }

  // Legacy OAuth handling (keep for backward compatibility)
  // Check if this is a Google OAuth callback
  if (authUrl.includes('google-auth-callback')) {
    const authCode = query.code;
    const error = query.error;

    if (error) {
      console.error('OAuth error:', error);
      if (global.authEventSender) {
        global.authEventSender.send('gmail-auth-error', `OAuth error: ${error}`);
      }
      return;
    }

    if (authCode) {
      try {
        await exchangeCodeForTokens(authCode);
      } catch (error) {
        console.error('Token exchange failed:', error);
        if (global.authEventSender) {
          global.authEventSender.send('gmail-auth-error', error.message);
        }
      }
      return;
    }
  }

  // Handle legacy website redirect
  let token = query.token;

  if (!token && parsedUrl.hash) {
    const hashParams = new URLSearchParams(parsedUrl.hash.substring(1)); // Remove '#'
    token = hashParams.get('token');
  }

  if (token) {
    console.log('Received website token:', token);
    // Navigate to the welcome screen after successful login
    if (global.mainWindow) {
      if (global.mainWindow.isMinimized()) {
        global.mainWindow.restore();
      }
      global.mainWindow.focus();
      
      // Navigate to the welcome screen
      global.mainWindow.loadFile("./src/electron/screens/welcome/welcome-screen.html");
      console.log('Navigated to welcome screen after website login.');
    } else {
      // If mainWindow is not ready, store the token and handle it once the window is created
      console.log('Main window not available yet. Token will be processed on window ready.');
    }
  } else {
    console.error('No authorization code or token found in redirect URL:', authUrl);
    if (global.mainWindow) {
        // PRIVACY FIX: Disable system dialog to prevent app exposure during interviews
        // dialog.showErrorBox('Login Error', 'Could not retrieve authorization code or token from the redirect.');
        console.error('🚨 Login Error: Could not retrieve authorization code or token from the redirect.');
    }
  }
}

// Basic overlay functionality without privacy detection

const createWindow = async () => {
  global.mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    transparent: true,     // Enable transparency
    frame: false,           // Show window frame
    hasShadow: true,       // Show window shadow
    show: false,           // Don't show window initially
    skipTaskbar: false,    // Show in dock/taskbar
    backgroundColor: '#ffffff',  // White background for login
    resizable: true,       // Allow resizing
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      devTools: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  global.mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key.toLowerCase() === 'i') {
      global.mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Show window only when ready
  global.mainWindow.once('ready-to-show', () => {
    global.mainWindow.show();
    global.mainWindow.center();
  });

  // Add hide event listener - only handle UI state
  global.mainWindow.on('hide', () => {
    console.log('🙈 Window hidden - transcription continues');
    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send('window-hidden');
    }
  });

  // Add show event listener - only handle UI state
  global.mainWindow.on('show', () => {
    console.log('👁️ Window shown - transcription continues');
    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send('window-shown');
    }
  });

  // Load the local login HTML file
  console.log('🔐 Loading local login screen...');
  
  try {
    await global.mainWindow.loadFile('./src/electron/screens/login/login-screen.html');
    console.log('✅ Successfully loaded local login screen');
    
  } catch (error) {
    console.error('❌ Failed to load login screen:', error);
    
    // Fallback to a basic error page
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Interview Lift - Error</title>
        <style>
          body {
            margin: 0;
            padding: 40px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            max-width: 500px;
          }
          .logo {
            font-size: 48px;
            margin-bottom: 20px;
          }
          .error {
            background: rgba(239, 68, 68, 0.2);
            border: 2px solid rgba(239, 68, 68, 0.5);
            padding: 20px;
            border-radius: 12px;
            margin-top: 20px;
          }
          .retry-btn {
            background: #4285F4;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            margin-top: 16px;
          }
          .retry-btn:hover {
            background: #3367d6;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">🚀</div>
          <h1>Interview Lift</h1>
          <div class="error">
            <h3>❌ Login Screen Error</h3>
            <p>Could not load the login screen. Please restart the application.</p>
            <button class="retry-btn" onclick="location.reload()">
              🔄 Retry
            </button>
          </div>
        </div>
      </body>
      </html>
    `;
    
    global.mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml));
  }
};

// Function to transition to welcome mode after authentication
function transitionToWelcomeMode() {
  
  // Update window properties for welcome screen
  global.mainWindow.setSize(800, 600);
  global.mainWindow.center();
  global.mainWindow.setResizable(true);
  
  // Enable transparency for welcome screen
  global.mainWindow.setBackgroundColor('#00000000');  // Transparent background
  
  // Apply content protection to welcome screen
  console.log('🛡️ Applying content protection to welcome screen...');
  try {
    global.mainWindow.setContentProtection(true);
    console.log('✅ Welcome screen content protection enabled');
  } catch (error) {
    console.log('⚠️ Welcome screen content protection not available:', error.message);
  }
}

// Function to transition to overlay mode after authentication
function transitionToOverlayMode() {
  console.log('🔄 Transitioning to overlay mode...');
  
  // PRIVACY FIX: Set overlay active flag to prevent system notifications during interviews
  global.overlayActive = true;
  console.log('🔒 Overlay mode activated - system notifications disabled');
  
  // Enable Windows-specific focus protection and notification suppression
  if (process.platform === 'win32') {
    try {
      const WindowsFocusProtection = require('./utils/windows-focus-protection');
      if (!global.windowsFocusProtection) {
        global.windowsFocusProtection = new WindowsFocusProtection();
      }
      
      // Suppress all Windows notifications during interview
      global.windowsFocusProtection.suppressNotifications().then(success => {
        if (success) {
          console.log('🔕 Windows system notifications suppressed for interview privacy');
        }
      }).catch(error => {
        console.warn('⚠️ Could not suppress Windows notifications:', error.message);
      });
      
      // Enable focus protection to prevent interruptions
      global.windowsFocusProtection.enableFocusProtection().then(success => {
        if (success) {
          console.log('🔒 Windows focus protection enabled - no interruptions allowed');
        }
      }).catch(error => {
        console.warn('⚠️ Could not enable focus protection:', error.message);
      });
      
    } catch (error) {
      console.warn('⚠️ Windows focus protection not available:', error.message);
    }
  }
  
  // Update window properties for overlay mode
  global.mainWindow.setSize(800, 600);
  global.mainWindow.setResizable(true);
  
  // The correct way to make a window frameless in Electron
  // Note: setFrame doesn't exist, frameless is set during window creation
  // Instead we'll adjust other properties for overlay mode
  global.mainWindow.setAlwaysOnTop(true);     // Keep on top for overlay
  global.mainWindow.setHasShadow(false);      // Remove shadow
  global.mainWindow.setSkipTaskbar(true);     // Hide from taskbar
  global.mainWindow.setBackgroundColor('#00000000');  // Transparent background
  
  // Apply platform-specific settings with content protection for both platforms
  if (process.platform === 'darwin') {
    // macOS-specific settings
    global.mainWindow.setWindowButtonVisibility(false);
    global.mainWindow.setVibrancy(null);
    
    try {
      global.mainWindow.setContentProtection(true);
      console.log('✅ macOS screen protection enabled');
    } catch (error) {
      console.log('⚠️ macOS content protection not available on this version');
    }
  } else if (process.platform === 'win32') {
    // Windows-specific settings and enhanced content protection
    console.log('🪟 Applying Windows-specific overlay settings...');
    
    try {
      // Import and use Windows content protection utility
      const WindowsContentProtection = require('./utils/windows-content-protection');
      const winProtection = new WindowsContentProtection();
      
      // Apply comprehensive Windows protection
      winProtection.applyComprehensiveProtection(global.mainWindow).then(success => {
        if (success) {
          console.log('✅ Comprehensive Windows content protection applied');
        } else {
          console.log('⚠️ Some Windows protection features may not be available');
        }
      }).catch(error => {
        console.error('❌ Windows content protection error:', error);
      });
      
      // Additional Windows-specific protections (immediate application)
      global.mainWindow.setContentProtection(true);
      console.log('✅ Basic Windows screen protection enabled');
      
      // Disable window thumbnails in taskbar and Alt+Tab
      global.mainWindow.setSkipTaskbar(true);
      
      // Set window to not appear in screen capture APIs
      if (global.mainWindow.webContents) {
        global.mainWindow.webContents.executeJavaScript(`
          // Additional Windows content protection via CSS and JS
          (function() {
            // Prevent right-click context menu
            document.addEventListener('contextmenu', e => e.preventDefault());
            
            // Prevent text selection
            document.addEventListener('selectstart', e => e.preventDefault());
            
            // Prevent drag operations
            document.addEventListener('dragstart', e => e.preventDefault());
            
            // Add Windows-specific screen capture protection
            const style = document.createElement('style');
            style.textContent = \`
              /* Windows content protection CSS */
              * {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
                -webkit-touch-callout: none !important;
                -webkit-tap-highlight-color: transparent !important;
              }
              
              /* Prevent print capture */
              @media print {
                * { 
                  display: none !important; 
                  visibility: hidden !important;
                }
              }
              
              /* Windows DWM protection */
              body {
                -ms-content-protection: protected !important;
              }
            \`;
            document.head.appendChild(style);
            
            console.log('🛡️ Windows content protection CSS applied');
          })();
        `);
      }
      
    } catch (error) {
      console.log('⚠️ Windows content protection not fully available:', error.message);
      console.log('🔄 Applying fallback content protection...');
      
      // Fallback protection methods for older Windows versions
      try {
        // Basic protection without setContentProtection
        global.mainWindow.setSkipTaskbar(true);
        
        // Apply CSS-based protection
        if (global.mainWindow.webContents) {
          global.mainWindow.webContents.executeJavaScript(`
            console.log('🛡️ Applying fallback Windows protection...');
            document.addEventListener('contextmenu', e => e.preventDefault());
            document.addEventListener('selectstart', e => e.preventDefault());
            document.addEventListener('dragstart', e => e.preventDefault());
          `);
        }
        
        console.log('✅ Windows fallback protection applied');
      } catch (fallbackError) {
        console.log('❌ Could not apply Windows fallback protection:', fallbackError.message);
      }
    }
  } else {
    // Linux and other platforms - basic protection
    console.log('🐧 Applying basic content protection for Linux/other platforms...');
    try {
      global.mainWindow.setContentProtection(true);
      console.log('✅ Basic screen protection enabled');
    } catch (error) {
      console.log('⚠️ Content protection not available on this platform');
    }
  }
}

// Handle navigation between screens
registerIPCHandler("navigate", async (event, screen) => {
  console.log(`Navigating to screen: ${screen}`);
  
  if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
    if (screen === "recording") {
      global.mainWindow.loadFile(path.join(__dirname, "screens", "recording", "recording.html"));
    } else if (screen === "overlay") {
      // Use the same proper overlay setup as skip-login method
      console.log('🔄 Setting up overlay mode via navigation...');
      await transitionToOverlayMode();
      await checkPermissionsAndLoadOverlay();
    } else if (screen === "home") {
      global.mainWindow.loadFile(path.join(__dirname, "screens", "home", "home.html"));
    }
  }
});

// Handle Clerk authentication success from renderer
registerIPCHandler("clerk-auth-success", async (event, authData) => {
  console.log("Clerk authentication successful:", authData);
  
  global.currentUser = authData.user;
  
  // Store authentication data for the session
  global.authData = authData;
  
  // Validate the user with your backend
    const validationResult = await userValidation.performUserValidation(authData.user);
  console.log("User validation result:", validationResult);
  
  if (validationResult.success) {
    console.log("User validated successfully. Allowing access to protected features.");
    
    // Set user as authenticated
    global.isUserAuthenticated = true;
    
    // Send success response
    event.reply("auth-validation-success", {
      user: authData.user,
      validation: validationResult
    });
  } else {
    console.log("User validation failed:", validationResult.error);
    
    // Send error response
    event.reply("auth-validation-error", {
      error: validationResult.error,
      details: validationResult.details
    });
  }
});

// Handle Clerk logout
registerIPCHandler("clerk-auth-logout", async (event) => {
  console.log("User logging out...");
  
  // Clear user data
  global.currentUser = null;
  global.authData = null;
  global.isUserAuthenticated = false;
  
  // Perform any cleanup needed for logout
  try {
    // Stop any active recording/transcription
    stopLiveTranscription();
    
    // Clear conversation history
    clearConversationHistory();
    
    // Perform memory cleanup
    performMainProcessCleanup();
    } catch (error) {
    console.error("Error during logout cleanup:", error);
    }
  
  console.log("User logged out successfully.");

  // Send logout success response
  event.reply("clerk-logout-success");
});

// Handle requests with tracked handlers
registerIPCHandler('clerk-get-token', async (event) => {
  try {
    if (global.authData && global.authData.session) {
      const token = await global.authData.session.getToken();
    return { success: true, token };
    } else {
      return { success: false, error: 'No active session' };
    }
  } catch (error) {
    console.error('Error getting Clerk token:', error);
    return { success: false, error: error.message };
  }
}, true);

registerIPCHandler('clerk-get-current-user', async (event) => {
  try {
    if (global.currentUser) {
      return {
        success: true,
        user: {
          id: global.currentUser.id,
          emailAddresses: global.currentUser.emailAddresses,
          firstName: global.currentUser.firstName,
          lastName: global.currentUser.lastName,
          imageUrl: global.currentUser.imageUrl
        }
      };
    } else {
      return { success: false, error: 'No authenticated user' };
    }
  } catch (error) {
    console.error('Error getting current user:', error);
    return { success: false, error: error.message };
  }
}, true);

// Handle email sign-in
ipcMain.handle('clerk-email-signin', async (event, { email, password }) => {
  console.log('🔐 [MAIN] Handling email sign-in for:', email);
  
  try {
    const clerkService = require('./utils/clerk-service');
    const userValidation = require('./utils/user-validation');
    const result = await clerkService.signInWithEmailAndPassword(email, password);
    console.log('📊 [MAIN] Email sign-in result:', result.success ? '✅ Success' : '❌ Failed');
    
    if (result.success) {
      // Send success message to renderer
      event.sender.send('auth-success', result.user);
      
      // NEW: Perform user validation before redirecting
      console.log('🔍 [MAIN] Performing user validation for email sign-in...');
      try {
        const validationResult = await userValidation.performUserValidation(result.user);
        console.log('✅ [MAIN] Email sign-in validation completed:', {
          success: validationResult.success,
          userType: validationResult.userType,
          accessLevel: validationResult.accessLevel
        });
        
        // Store user data with validation result
        global.currentUser = result.user;
        global.currentUser.validation = validationResult;
        global.authToken = await clerkService.getAuthToken();
        
      } catch (validationError) {
        console.error('❌ [MAIN] Email sign-in validation failed:', validationError);
        // Store user data with fallback validation
        global.currentUser = result.user;
        global.currentUser.validation = {
          success: false,
          error: validationError.message,
          userType: 'basic',
          accessLevel: 'limited'
        };
        global.authToken = await clerkService.getAuthToken();
      }
      
      // Wait a moment for UI feedback, then navigate directly
      // setTimeout(() => {
      //   console.log('🚀 [MAIN] Navigating to welcome screen after email auth and validation');
      //   transitionToWelcomeMode();
      //   global.mainWindow.loadFile("./src/electron/screens/welcome/welcome-screen.html");
      // }, 1500);
    }
    
    return result;
  } catch (error) {
    console.error('❌ [MAIN] Email sign-in error:', error);
    return { success: false, error: error.message || 'Sign-in failed' };
  }
});

// Handle Google sign-in
ipcMain.handle('clerk-google-signin', async (event) => {
  console.log('🔍 [MAIN] Handling Google sign-in');
  
  try {
    const clerkService = require('./utils/clerk-service');
    const userValidation = require('./utils/user-validation');
    const result = await clerkService.signInWithGoogle();
    console.log('📊 [MAIN] Google sign-in result:', result.success ? '✅ Success' : '❌ Failed');
    
    if (result.success && result.authUrl) {
      // Open OAuth URL in external browser
      console.log('🌐 [MAIN] Opening Google OAuth in external browser');
      const { shell } = require('electron');
      await shell.openExternal(result.authUrl);
      
      return { success: true, message: 'Opening Google sign-in in browser...' };
    } else if (result.success) {
      // Direct sign-in successful
      event.sender.send('auth-success', result.user);
      
      // NEW: Perform user validation before redirecting
      console.log('🔍 [MAIN] Performing user validation for Google sign-in...');
      try {
        const validationResult = await userValidation.performUserValidation(result.user);
        console.log('✅ [MAIN] Google sign-in validation completed:', {
          success: validationResult.success,
          userType: validationResult.userType,
          accessLevel: validationResult.accessLevel
        });
        
        // Store user data with validation result
        global.currentUser = result.user;
        global.currentUser.validation = validationResult;
        global.authToken = await clerkService.getAuthToken();
        
      } catch (validationError) {
        console.error('❌ [MAIN] Google sign-in validation failed:', validationError);
        // Store user data with fallback validation
        global.currentUser = result.user;
        global.currentUser.validation = {
          success: false,
          error: validationError.message,
          userType: 'basic',
          accessLevel: 'limited'
        };
        global.authToken = await clerkService.getAuthToken();
      }
      
      setTimeout(() => {
        console.log('🚀 [MAIN] Navigating to welcome screen after Google auth and validation');
        transitionToWelcomeMode();
        // global.mainWindow.loadFile("./src/electron/screens/welcome/welcome-screen.html");
      }, 1500);
    }
    
    return result;
  } catch (error) {
    console.error('❌ [MAIN] Google sign-in error:', error);
    return { success: false, error: error.message || 'Google sign-in failed' };
  }
});

// Handle sign out requests
ipcMain.handle('clerk-sign-out', async (event) => {
  try {
    const clerkService = require('./utils/clerk-service');
    const result = await clerkService.signOut();
    
    if (result.success) {
      // Clear global data
      global.currentUser = null;
      global.authToken = null;
      
      // Navigate to local login screen
      if (global.mainWindow) {
        console.log('🔄 Loading local login screen after sign out...');
        try {
          await global.mainWindow.loadFile('./src/electron/screens/login/login-screen.html');
          console.log('✅ Loaded local login screen after sign out.');
        } catch (error) {
          console.error('❌ Failed to load login screen after sign out:', error);
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('Failed to sign out:', error);
    return { success: false, error: error.message };
  }
});

// Authentication is now handled internally by Clerk SDK in the renderer process
// Old external handlers removed for cleaner codebase

// Handle user authentication completion from web browser (legacy support)
ipcMain.on("user-authenticated", (event, userData) => {
  console.log('User authenticated:', userData);
  
  // Store user data globally
  global.currentUser = userData;
  
  // Send confirmation back to launcher
  event.sender.send('auth-completed', userData);
});

// Handle Clerk authentication request
ipcMain.on("request-clerk-auth", async (event) => {
  try {
    console.log('Starting Clerk OAuth flow...');
    
    // Store the event sender for later use
    global.authEventSender = event.sender;
    
    // Clerk authentication URL - this should open Clerk's hosted auth page
    const clerkAuthUrl = 'https://www.interviewlift.com/clerk-login?redirect_uri=interviewlift://login-callback';
    
    console.log('Opening Clerk OAuth URL:', clerkAuthUrl);
    
    // Open OAuth URL in user's default browser
    shell.openExternal(clerkAuthUrl);
    
  } catch (error) {
    console.error('Clerk authentication setup failed:', error.message);
    event.sender.send('clerk-auth-error', error.message);
  }
});

// Handle Gmail authentication request (keep for backward compatibility, but redirect to Clerk)
ipcMain.on("request-gmail-auth", async (event) => {
  try {
    console.log('Gmail auth requested - redirecting to Clerk...');
  
    // Store the event sender for later use
    global.authEventSender = event.sender;
  
    // Redirect to Clerk authentication
    const clerkAuthUrl = 'https://www.interviewlift.com/clerk-login?redirect_uri=interviewlift://login-callback';
    
    console.log('Opening Clerk OAuth URL:', clerkAuthUrl);
    
    // Open OAuth URL in user's default browser
    shell.openExternal(clerkAuthUrl);
    
  } catch (error) {
    console.error('Clerk authentication setup failed:', error.message);
    event.sender.send('clerk-auth-error', error.message);
  }
});

async function checkPermissionsAndLoadOverlay() {
  console.log('🔍 Starting overlay initialization...');
  const isPermissionGranted = await checkPermissions();
  if (isPermissionGranted) {
    console.log('✅ Permissions granted for overlay');
    
    // Get the primary display size
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    console.log(`📊 Screen dimensions - Width: ${width}, Height: ${height}`);
    
    // Calculate 90% of screen dimensions
    const windowWidth = Math.floor(width * 0.9);
    const windowHeight = Math.floor(height * 0.9);
    console.log(`📏 Overlay dimensions - Width: ${windowWidth}, Height: ${windowHeight}`);
    
    // Center the window
    const x = Math.floor((width - windowWidth) / 2);
    const y = Math.floor((height - windowHeight) / 2);
    console.log(`📍 Overlay position - X: ${x}, Y: ${y}`);
    
    // Log current window state before changes
    const windowBounds = global.mainWindow.getBounds();
    console.log('🔍 Current window properties:', {
      bounds: {
        x: windowBounds.x,
        y: windowBounds.y,
        width: windowBounds.width,
        height: windowBounds.height
      },
      backgroundColor: global.mainWindow.getBackgroundColor(),
      alwaysOnTop: global.mainWindow.isAlwaysOnTop(),
      visible: global.mainWindow.isVisible(),
      platform: process.platform
    });
    
    // Update window properties for overlay mode
    console.log('🔄 Applying overlay window properties...');
    global.mainWindow.setSize(windowWidth, windowHeight);
    global.mainWindow.setPosition(x, y);
    global.mainWindow.setAlwaysOnTop(true, 'floating');
    global.mainWindow.setVisibleOnAllWorkspaces(true);
    
    // Ensure native window background is transparent before loading new content
    console.log('🎨 Setting window transparency...');
    global.mainWindow.setBackgroundColor('#00000000');
    if (process.platform === 'darwin') {
      global.mainWindow.setVibrancy(null);
      global.mainWindow.setHasShadow(false);
      console.log('✓ macOS transparency settings re-applied');
    }
    
    // Start with click-through enabled but allow specific areas to be interactive
    global.mainWindow.setIgnoreMouseEvents(true, { forward: true });
    console.log('🖱️ Click-through enabled with forwarding');
    
    console.log('📄 Loading overlay screen HTML...');
    global.mainWindow.loadFile("./src/electron/screens/overlay/overlay-screen.html");
    
    global.mainWindow.webContents.once('did-start-loading', () => {
      console.log('🚀 Overlay screen started loading');
    });
    
    global.mainWindow.webContents.once('did-finish-load', () => {
      console.log('✅ Overlay screen finished loading');
      
      setTimeout(() => {
        // Log window state before final display
        const finalBounds = global.mainWindow.getBounds();
        console.log('🔍 Window properties before final display:', {
          bounds: {
            x: finalBounds.x,
            y: finalBounds.y,
            width: finalBounds.width,
            height: finalBounds.height
          },
          backgroundColor: global.mainWindow.getBackgroundColor(),
          alwaysOnTop: global.mainWindow.isAlwaysOnTop(),
          visible: global.mainWindow.isVisible()
        });
        
        // Re-assert transparency settings
        console.log('🔄 Re-asserting transparency settings...');
        global.mainWindow.setBackgroundColor('#00000000');
        if (process.platform === 'darwin') {
          global.mainWindow.setVibrancy(null);
          global.mainWindow.setHasShadow(false);
          console.log('✓ macOS transparency settings re-applied');
        }
        
        // Apply comprehensive content protection for overlay
        console.log('🛡️ Applying comprehensive content protection to overlay...');
        try {
          // Re-assert content protection after loading
          global.mainWindow.setContentProtection(true);
          console.log('✅ Content protection re-enabled for overlay');
        } catch (error) {
          console.log('⚠️ Could not re-enable content protection:', error.message);
        }
        
        // Inject enhanced protection and logging script into overlay
        global.mainWindow.webContents.executeJavaScript(`
          console.log('🔍 Overlay DOM loaded, applying enhanced protection...');
          
          // Enhanced content protection function
          function applyEnhancedContentProtection() {
            // Platform-specific protection
            const isWindows = navigator.platform.includes('Win');
            const isMac = navigator.platform.includes('Mac');
            
            console.log('🛡️ Applying content protection for platform:', {
              isWindows,
              isMac,
              platform: navigator.platform
            });
            
            // Comprehensive event prevention
            const protectionEvents = [
              'contextmenu',     // Right-click menu
              'selectstart',     // Text selection
              'dragstart',       // Drag operations
              'beforeprint',     // Print prevention
              'keydown',         // Keyboard shortcuts
              'mousedown',       // Mouse events for protection
              'copy',            // Copy prevention
              'cut',             // Cut prevention
              'paste'            // Paste prevention (though less critical)
            ];
            
            protectionEvents.forEach(eventType => {
              document.addEventListener(eventType, function(e) {
                // Allow specific keyboard shortcuts for app functionality
                if (eventType === 'keydown' && e.ctrlKey || e.metaKey) {
                  const allowedKeys = ['b', 'h', 'k', 'l', 'enter']; // App hotkeys
                  if (allowedKeys.includes(e.key.toLowerCase())) {
                    return; // Allow app hotkeys to pass through
                  }
                }
                
                // Prevent all other events
                e.preventDefault();
                e.stopPropagation();
                return false;
              }, true);
            });
            
            // Enhanced CSS protection
            const protectionStyle = document.createElement('style');
            protectionStyle.setAttribute('data-protection', 'enhanced');
            protectionStyle.textContent = \`
              /* Enhanced content protection for both Windows and macOS */
              * {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
                -webkit-touch-callout: none !important;
                -webkit-tap-highlight-color: transparent !important;
                -webkit-user-drag: none !important;
                -khtml-user-drag: none !important;
                -moz-user-drag: none !important;
                -o-user-drag: none !important;
                user-drag: none !important;
                pointer-events: auto !important; /* Keep functionality */
              }
              
              /* Windows-specific DWM protection */
              \${isWindows ? \`
                body {
                  -ms-content-protection: protected !important;
                  -ms-scroll-snap-type: none !important;
                }
                
                * {
                  -ms-content-zooming: none !important;
                  -ms-user-select: none !important;
                  -ms-text-size-adjust: none !important;
                }
              \` : ''}
              
              /* macOS-specific protection */
              \${isMac ? \`
                body {
                  -webkit-app-region: no-drag !important;
                }
                
                * {
                  -webkit-user-select: none !important;
                  -webkit-touch-callout: none !important;
                }
              \` : ''}
              
              /* Print and screenshot protection */
              @media print {
                * { 
                  display: none !important; 
                  visibility: hidden !important;
                  opacity: 0 !important;
                }
                
                body::before {
                  content: "Content protected from printing" !important;
                  position: fixed !important;
                  top: 50% !important;
                  left: 50% !important;
                  transform: translate(-50%, -50%) !important;
                  z-index: 9999 !important;
                  color: red !important;
                  font-size: 24px !important;
                  display: block !important;
                  visibility: visible !important;
                }
              }
              
              /* Screen capture protection indicators */
              @media screen and (-webkit-min-device-pixel-ratio: 0) {
                body::after {
                  content: "";
                  position: fixed;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  background: transparent;
                  pointer-events: none;
                  z-index: -1;
                  mix-blend-mode: difference;
                }
              }
            \`;
            
            document.head.appendChild(protectionStyle);
            
            // Additional runtime protection - only define if not already defined
            try {
              if (!document.hasOwnProperty('hidden') || Object.getOwnPropertyDescriptor(document, 'hidden').configurable !== false) {
            Object.defineProperty(document, 'hidden', {
              get: () => false,
              configurable: false
            });
              }
            } catch (e) {
              console.log('🛡️ Property already protected:', e.message);
            }
            
            // Prevent developer tools (additional layer)
            document.addEventListener('keydown', function(e) {
              if (e.key === 'F12' || 
                  (e.ctrlKey && e.shiftKey && e.key === 'I') ||
                  (e.ctrlKey && e.shiftKey && e.key === 'C') ||
                  (e.ctrlKey && e.shiftKey && e.key === 'J') ||
                  (e.ctrlKey && e.key === 'U')) {
                e.preventDefault();
                e.stopPropagation();
                console.log('🛡️ Developer tools access blocked');
                return false;
              }
            });
            
            console.log('✅ Enhanced content protection applied successfully');
          }
          
          // Apply protection immediately
          applyEnhancedContentProtection();
          
          // Throttled re-application of protection to avoid performance issues during streaming
          let protectionThrottle = null;
          const observer = new MutationObserver(() => {
            if (protectionThrottle) return; // Skip if already scheduled
            
            protectionThrottle = setTimeout(() => {
            applyEnhancedContentProtection();
              protectionThrottle = null;
            }, 500); // Only re-apply every 500ms max
          });
          
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
          });
          
          function logElementStyles(element, description) {
            if (!element) return null;
            const computedStyle = window.getComputedStyle(element);
            return {
              description,
              tagName: element.tagName,
              className: element.className,
              styles: {
                backgroundColor: computedStyle.backgroundColor,
                background: computedStyle.background,
                opacity: computedStyle.opacity,
                backdropFilter: computedStyle.backdropFilter,
                webkitBackdropFilter: computedStyle.webkitBackdropFilter
              }
            };
          }
          
          // Log body styles
          console.log('📊 Document structure styles:', {
            html: logElementStyles(document.documentElement, 'HTML element'),
            body: logElementStyles(document.body, 'Body element')
          });
          
          // Log main container styles
          const overlayContainer = document.querySelector('.overlay-container');
          console.log('📊 Overlay container:', logElementStyles(overlayContainer, 'Main overlay container'));
          
          // Log all elements with non-transparent backgrounds
          const allElements = document.querySelectorAll('*');
          const backgroundElements = Array.from(allElements)
            .map(el => logElementStyles(el, 'Background element'))
            .filter(styles => 
              styles && styles.styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && 
              styles.styles.backgroundColor !== 'transparent'
            );
          
          console.log('🎨 Elements with background colors:', backgroundElements);
          
          // Check for any potential transparency-affecting styles
          const transparencyAffectingElements = Array.from(allElements)
            .map(el => logElementStyles(el, 'Transparency affecting element'))
            .filter(styles => 
              styles && (
                parseFloat(styles.styles.opacity) < 1 ||
                styles.styles.backdropFilter !== 'none' ||
                styles.styles.webkitBackdropFilter !== 'none'
              )
            );
          
          console.log('🔍 Elements affecting transparency:', transparencyAffectingElements);
        `);
        
        global.mainWindow.show();
        console.log('🎉 Overlay window displayed');
        
        // Log final window state
        const displayBounds = global.mainWindow.getBounds();
        console.log('📊 Final window properties:', {
          bounds: {
            x: displayBounds.x,
            y: displayBounds.y,
            width: displayBounds.width,
            height: displayBounds.height
          },
          backgroundColor: global.mainWindow.getBackgroundColor(),
          alwaysOnTop: global.mainWindow.isAlwaysOnTop(),
          visible: global.mainWindow.isVisible()
        });
      }, 100);
    });
  } else {
    console.log('❌ Permission denied for overlay');
    
    // Platform-specific permission handling
    if (process.platform === 'win32') {
      // PRIVACY FIX: Only show permission dialogs during initial setup, not during active use
      // Prevent system dialogs during interviews by logging instead
      if (process.env.NODE_ENV === 'development' || !global.overlayActive) {
        const response = await dialog.showMessageBox(global.mainWindow, {
          type: "warning",
          title: "Permission Required",
          message: "Interview Lift needs administrator privileges to capture system audio. Would you like to restart with admin privileges?",
          buttons: ["Restart as Admin", "Open Settings", "Cancel"],
        });
        
        if (response.response === 0) {
          // Restart as admin
          await restartAsAdmin();
        } else if (response.response === 1) {
          // Open Windows settings
          const { openPermissionSettings } = require('./utils/permission');
          await openPermissionSettings('privacy');
        }
      } else {
        console.log('🚨 Permission Required: Interview Lift needs administrator privileges to capture system audio. Please restart manually with admin privileges.');
      }
    } else if (process.platform === 'darwin') {
      // PRIVACY FIX: Only show permission dialogs during initial setup, not during active use
      if (process.env.NODE_ENV === 'development' || !global.overlayActive) {
        const response = await dialog.showMessageBox(global.mainWindow, {
          type: "warning",
          title: "Permission Denied",
          message: "You need to grant permission for screen recording. Would you like to open System Preferences now?",
          buttons: ["Open System Preferences", "Cancel"],
        });

        if (response.response === 0) {
          shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
        }
      } else {
        console.log('🚨 Permission Denied: You need to grant permission for screen recording. Please open System Preferences manually.');
      }
    }
  }
}

// Handle dynamic mouse event control for scrollbar dragging
ipcMain.on("set-mouse-events", (event, ignore) => {
  if (global.mainWindow) {
    global.mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

// Handle toggle window visibility
ipcMain.on("toggle-window", () => {
  if (!global.mainWindow) return;
  
  if (global.mainWindow.isVisible()) {
    global.mainWindow.hide();
    console.log('🔄 Window hidden - transcription continues');
  } else {
    global.mainWindow.show();
    console.log('🔄 Window shown - transcription continues');
  }
});

// Handle screen protection toggle
ipcMain.on("toggle-screen-protection", (event, enabled) => {
  if (!global.mainWindow) return;
  
  try {
    global.mainWindow.setContentProtection(enabled);
    console.log(`Screen protection ${enabled ? 'enabled' : 'disabled'}`);
    
    // If Windows, also apply enhanced protection
    if (process.platform === 'win32' && enabled) {
      const WindowsContentProtection = require('./utils/windows-content-protection');
      const winProtection = new WindowsContentProtection();
      
      winProtection.applyComprehensiveProtection(global.mainWindow).then(success => {
        console.log('Windows enhanced protection toggled:', success);
      }).catch(error => {
        console.error('Error toggling Windows protection:', error);
      });
    }
  } catch (error) {
    console.error('Error toggling screen protection:', error);
  }
});

// Handle content protection status request
ipcMain.handle("get-content-protection-status", async () => {
  try {
    const platform = process.platform;
    let status = {
      platform,
      electronProtection: false,
      enhancedProtection: false,
      supportedFeatures: [],
      windowsSpecific: null
    };

    // Check Electron's built-in protection
    try {
      // We can't directly query if content protection is enabled, so we try to enable it
      global.mainWindow.setContentProtection(true);
      status.electronProtection = true;
    } catch (error) {
      console.log('Electron content protection check failed:', error.message);
    }

    // Platform-specific checks
    if (platform === 'win32') {
      try {
        const WindowsContentProtection = require('./utils/windows-content-protection');
        const winProtection = new WindowsContentProtection();
        
        // Check Windows version and feature support
        const support = await winProtection.checkContentProtectionSupport();
        status.windowsSpecific = support;
        
        if (support.supported) {
          status.enhancedProtection = true;
          status.supportedFeatures = Object.keys(support.features || {}).filter(
            key => support.features[key]
          );
        }
      } catch (error) {
        console.error('Error checking Windows content protection:', error);
        status.windowsSpecific = { error: error.message };
      }
    } else if (platform === 'darwin') {
      status.supportedFeatures = ['contentProtection', 'vibrancyEffects', 'windowButtonControl'];
    }

    return status;
  } catch (error) {
    console.error('Error getting content protection status:', error);
    return { 
      error: error.message,
      platform: process.platform,
      electronProtection: false,
      enhancedProtection: false
    };
  }
});

// Handle style configuration request for overlay
ipcMain.handle("get-style-config", async () => {
  try {
    const OverlayStyleManager = require('./utils/overlay-style-manager');
    const styleManager = new OverlayStyleManager();
    
    const config = {
      fontSize: styleManager.fontSize,
      fontFamily: styleManager.fontFamily,
      glassEffects: styleManager.glassEffects,
      codeTheme: styleManager.codeTheme,
      currentTheme: styleManager.currentTheme
    };
    
    console.log('🎨 Providing style configuration to renderer:', config);
    return config;
  } catch (error) {
    console.error('❌ Error getting style configuration:', error);
    return null;
  }
});

ipcMain.on("open-folder-dialog", async (event) => {
  const desktopPath = path.join(os.homedir(), "Desktop");

  const { filePaths, canceled } = await dialog.showOpenDialog(global.mainWindow, {
    properties: ["openDirectory"],
    buttonLabel: "Select Folder",
    title: "Select a folder",
    message: "Please select a folder for saving the recording",
    defaultPath: desktopPath,
  });

  if (!canceled) {
    event.sender.send("selected-folder", filePaths[0]);
  }
});

// Replace recording-related handlers
registerIPCHandler("start-recording", async (_, args) => {
  const success = await startLiveTranscription();
  if (success) {
    if (powerSaveBlockerId === null || !powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
      console.log(`Power save blocker started with ID: ${powerSaveBlockerId}`);
    }
  } else {
    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
    global.mainWindow.webContents.send("recording-status", "LIVE_TRANSCRIPTION_FAILED_TO_START");
    }
  }
});

registerIPCHandler("stop-recording", () => {
  stopLiveTranscription();
  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    console.log(`Power save blocker stopped with ID: ${powerSaveBlockerId}`);
    powerSaveBlockerId = null;
  }
});

// Replace recording-related handlers
registerIPCHandler("reset-stt", async () => {
  console.log("Received reset-stt request. Restarting live transcription fully.");
  const success = await resetFullTranscriptionService();
  if (!success) {
    console.error("Failed to restart live transcription after full reset.");
    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send("recording-status", "LIVE_TRANSCRIPTION_FAILED_TO_START");
    }
  }
});

// Replace recording-related handlers
registerIPCHandler("clear-conversation-history", () => {
  console.log("Received clear-conversation-history request.");
  clearConversationHistory();
  console.log("✅ Conversation history cleared successfully.");
});

// Handle window movement with arrow keys
ipcMain.on("move-window", (_, direction) => {
  if (!global.mainWindow) return;
  
  const MOVE_STEP = 50; // pixels to move in each direction
  const [currentX, currentY] = global.mainWindow.getPosition();
  
  let newX = currentX;
  let newY = currentY;
  
  switch (direction) {
    case 'up':
      newY = currentY - MOVE_STEP;
      break;
    case 'down':
      newY = currentY + MOVE_STEP;
      break;
    case 'left':
      newX = currentX - MOVE_STEP;
      break;
    case 'right':
      newX = currentX + MOVE_STEP;
      break;
  }
  
  // Allow window to move freely beyond screen boundaries
  global.mainWindow.setPosition(newX, newY);
});

// Handle app quit request
ipcMain.on("quit-app", () => {
  app.quit();
});

ipcMain.on("generate-screenshot-solution", async (event, { screenshots, jobRole, keySkills }) => {
  // Record time when screenshot solution generation starts
  const screenshotSolutionStartTime = Date.now();
  console.log(`[TIMING] Screenshot solution generation started at: ${new Date(screenshotSolutionStartTime).toISOString()}`);

  if (!screenshots || screenshots.length === 0) {
    event.sender.send('solution-error', {
        title: "Input Error",
        content: "No screenshots provided for analysis."
    });
    return;
  }

  console.log("Received screenshots for AI analysis:", JSON.stringify(screenshots, null, 2));

  try {
    // Record time when screenshot API is called
    const screenshotApiCallTime = Date.now();
    console.log(`[TIMING] Screenshot API call started at: ${new Date(screenshotApiCallTime).toISOString()}`);
    event.sender.send('timing-update', {
      event: 'screenshot_api_call_start',
      timestamp: screenshotApiCallTime
    });

    // Use AI service to generate response
    await raceScreenshotResponse(
      jobRole,
      keySkills,
      screenshots,
      // onComplete callback
      (geminiText) => {
    // Record time when screenshot API response is received
    const screenshotApiResponseTime = Date.now();
    console.log(`[TIMING] Screenshot API response received at: ${new Date(screenshotApiResponseTime).toISOString()}`);
    console.log(`[TIMING] Screenshot API response time: ${screenshotApiResponseTime - screenshotApiCallTime}ms`);
    event.sender.send('timing-update', {
      event: 'screenshot_api_response_received',
      timestamp: screenshotApiResponseTime,
      duration: screenshotApiResponseTime - screenshotApiCallTime
    });
    
    // Record time when screenshot solution is sent to renderer
    const screenshotSolutionSendTime = Date.now();
    console.log(`[TIMING] Screenshot solution sent to renderer at: ${new Date(screenshotSolutionSendTime).toISOString()}`);
    console.log(`[TIMING] Total screenshot solution generation time: ${screenshotSolutionSendTime - screenshotSolutionStartTime}ms`);
    
    event.sender.send('solution-generated', {
      title: "",
      content: geminiText
    });
    
    event.sender.send('timing-update', {
      event: 'screenshot_solution_sent_to_renderer',
      timestamp: screenshotSolutionSendTime,
      duration: screenshotSolutionSendTime - screenshotSolutionStartTime
    });
      },
      // onError callback
      (error) => {
        console.error("Error generating solution with AI from screenshots:", error);
    let errorMessage = "An error occurred while analyzing the screenshots.";
     if (error.message) {
            if (error.message.includes("SAFETY")) {
               errorMessage = "The response was blocked due to safety settings.";
            } else if (error.message.includes("API key not valid")) {
               errorMessage = "Invalid Gemini API Key. Please check your configuration.";
            } else {
                errorMessage = error.message;
            }
        }
    event.sender.send('solution-error', {
          title: "AI Service Error",
      content: errorMessage
        });
      }
    );

  } catch (error) {
    console.error("Error in screenshot solution handler:", error);
    event.sender.send('solution-error', {
      title: "Screenshot Error",
      content: error.message || "Failed to process screenshots"
    });
  }
});

// --- START: Screenshot IPC Handler ---
ipcMain.handle('take-screenshot', async (event) => {
  try {
    const { desktopCapturer } = require('electron'); 
    if (!desktopCapturer) {
      return { error: "Screenshot functionality unavailable." };
    }

    // Use high quality thumbnail for better Gemini processing
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'], 
      thumbnailSize: { width: 1920, height: 1080 } 
    });

    if (sources.length > 0) {
      const primarySource = sources[0];
      const dataUrl = primarySource.thumbnail.toDataURL();
      
      // Clean up sources and request garbage collection to prevent lingering processes
      sources.forEach(source => {
        if (source && source.thumbnail) {
          // Clear thumbnail reference
          if (source !== primarySource) {
            source.thumbnail = null;
          }
        }
      });
      
      // Process complete - handle error case
      if (dataUrl.length < 100) {
        return { error: "Failed to capture screen content." };
      }
      
      // Return data and request garbage collection
      if (global.gc) {
        try {
          global.gc();
        } catch (e) {
          // Ignore GC errors
        }
      }
      
      return { dataUrl };
    } else {
      return { error: "No screen sources found." };
    }
  } catch (e) {
    return { error: "Screenshot operation failed." };
  }
});
// --- END: Screenshot IPC Handler ---

// Enhanced app quit handler with cleanup
app.on('will-quit', () => {
  console.log('🛑 App is about to quit - performing cleanup');
  
  // PRIVACY FIX: Restore Windows notifications and focus settings on exit
  if (process.platform === 'win32' && global.windowsFocusProtection) {
    try {
      global.windowsFocusProtection.restoreNotifications().then(() => {
        console.log('🔔 Windows notifications restored on exit');
      }).catch(error => {
        console.warn('⚠️ Could not restore notifications on exit:', error.message);
      });
      
      global.windowsFocusProtection.disableFocusProtection().then(() => {
        console.log('🔓 Windows focus protection disabled on exit');
      }).catch(error => {
        console.warn('⚠️ Could not disable focus protection on exit:', error.message);
      });
    } catch (error) {
      console.warn('⚠️ Error during Windows cleanup:', error.message);
    }
  }
  
  // Clear overlay active flag
  global.overlayActive = false;
  
  // Emergency cleanup before quit
  emergencyMainProcessCleanup();
  
  // Clear memory monitor
  clearIntervalSafe(memoryMonitorInterval, 'memory-monitor');
  
  // Unregister global shortcuts
    globalShortcut.unregisterAll();
  console.log('✅ App cleanup completed');
});

// Add window hidden event cleanup
app.on('browser-window-blur', () => {
  // Perform light cleanup when window loses focus
  if (global.gc) {
    global.gc();
  }
});

// --- PROTOCOL HANDLING FOR APP ALREADY RUNNING ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (global.mainWindow) {
      if (global.mainWindow.isMinimized()) global.mainWindow.restore();
      global.mainWindow.focus();
    }

    // Handle protocol link if app is opened again with it
    const urlFromCommandLine = commandLine.pop();
    if (urlFromCommandLine.startsWith(`${CUSTOM_PROTOCOL}://`)) {
        console.log('App already running, opened with URL:', urlFromCommandLine);
        deeplinkingUrl = urlFromCommandLine; // Store it
        handleAuthCallback(deeplinkingUrl);
    }
  });
}

// --- PROTOCOL HANDLING FOR APP STARTING ---
// For macOS, when app is launched via protocol link
app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('App opened via URL (macOS):', url);
  deeplinkingUrl = url; // Store it
  if (app.isReady() && global.mainWindow) {
      handleAuthCallback(deeplinkingUrl);
  }
  // If app is not ready, it will be handled in whenReady -> createWindow -> 'did-finish-load'
});

app.whenReady().then(() => {
  // Hide app from dock on macOS and prevent from appearing in Force Quit
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
  
  // Set app user model ID for Windows to prevent taskbar grouping
  if (process.platform === 'win32') {
    app.setAppUserModelId('invisible-overlay-app');
  }
  
  // Register global shortcuts only after app is ready
  registerGlobalShortcuts();
  
  createWindow().then(() => {
      if (global.mainWindow) {
          global.mainWindow.webContents.once('did-finish-load', () => {
              // Handle deeplinking URL if app was opened with one (especially for Windows/Linux first launch)
              if (process.platform !== 'darwin' && process.argv.length > 1) {
                  const potentialUrl = process.argv.find(arg => arg.startsWith(`${CUSTOM_PROTOCOL}://`));
                  if (potentialUrl) {
                      console.log('App started with URL (Windows/Linux):', potentialUrl);
                      deeplinkingUrl = potentialUrl;
                  }
              }
              
              if (deeplinkingUrl) {
                  console.log('Processing stored deeplinking URL on window ready:', deeplinkingUrl);
                  handleAuthCallback(deeplinkingUrl);
                  deeplinkingUrl = null; // Clear after processing
              }

              // Make console clickable
              global.mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
                  // Create clickable console message
                  const clickableMessage = `[${new Date().toISOString()}] ${message}`;
                  console.log(clickableMessage);
              });
          });
      }
  });
  
  // Prevent app from quitting when all windows are closed (background app behavior)
  app.on('window-all-closed', (e) => {
    // Keep app running in background even when all windows are closed
    e.preventDefault();
  });

  initializeAIServices();
});

// Function to register global shortcuts
function registerGlobalShortcuts() {
  // Register a global shortcut for toggling window visibility
  globalShortcut.register('CommandOrControl+B', () => {
    if (!global.mainWindow || global.mainWindow.isDestroyed()) {
      return;
    }
    
    if (global.mainWindow.isVisible()) {
      global.mainWindow.hide();
    } else {
      // Re-assert transparency settings before showing
      global.mainWindow.setBackgroundColor('#00000000');
      if (process.platform === 'darwin') {
        global.mainWindow.setVibrancy(null);
        global.mainWindow.setHasShadow(false);
      }
      global.mainWindow.show();
      global.mainWindow.focus();
      // Ensure window is brought to front on macOS
      if (process.platform === 'darwin') {
        global.mainWindow.setAlwaysOnTop(true, 'floating');
        app.focus();
      }
    }
  });
  
  // Register global shortcut for screenshot
  globalShortcut.register('CommandOrControl+H', () => {
    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send('global-screenshot-trigger');
    }
  });
  
  // Register global shortcut for clear transcript and suggestions
  globalShortcut.register('CommandOrControl+K', () => {
    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send('global-clear-trigger');
    }
  });
  
  // Register global shortcut for toggle mute
  globalShortcut.register('CommandOrControl+L', () => {
    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send('global-mute-trigger');
    }
  });
  
  // Register global shortcut for generate solution from screenshots
  globalShortcut.register('CommandOrControl+Return', () => {
    if (global.mainWindow && global.mainWindow.webContents && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send('global-solve-trigger');
    }
  });
  
  // Register global shortcut for quit app
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });
}

// Make sure to handle the case where the app is launched for the first time via the protocol link on Windows/Linux
if (process.platform !== 'darwin' && process.argv.length > 1) {
    const potentialUrlOnFirstLaunch = process.argv.find(arg => arg.startsWith(`${CUSTOM_PROTOCOL}://`));
    if (potentialUrlOnFirstLaunch) {
        deeplinkingUrl = potentialUrlOnFirstLaunch; // Store it to be handled when window is ready
    }
}

// Initialize AI services
const { initializeGemini } = require('./utils/gemini_service');
const { initializeOpenAI } = require('./utils/openai_service');
const { initializeCerebras } = require('./utils/cerebras_service');

// Import sudo-prompt for admin elevation
const sudo = require('sudo-prompt');

// Function to restart the app as administrator
async function restartAsAdmin() {
  try {
    console.log('🔄 Attempting to restart as administrator...');
    
    // Get the current executable path
    const appPath = process.execPath;
    const args = process.argv.slice(1).join(' ');
    
    // Create the command to restart the app
    const command = `"${appPath}" ${args}`;
    
    const options = {
      name: 'Interview Lift',
      icns: path.join(__dirname, '../../assets/icon.icns'), // Optional: app icon
    };

    // Use sudo-prompt to restart with elevation
    sudo.exec(command, options, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Failed to restart as admin:', error);
        // PRIVACY FIX: Disable system dialog to prevent app exposure during interviews
        // dialog.showErrorBox('Admin Restart Failed', 
        //   'Could not restart with administrator privileges. Please manually run the app as administrator.');
        console.error('🚨 Admin Restart Failed: Could not restart with administrator privileges. Please manually run the app as administrator.');
        return;
      }
      
      console.log('✅ Successfully restarted as admin, closing current instance...');
      // Close the current app instance
      app.quit();
    });

  } catch (error) {
    console.error('❌ Error during admin restart:', error);
    // PRIVACY FIX: Disable system dialog to prevent app exposure during interviews
    // dialog.showErrorBox('Restart Error', 'An error occurred while trying to restart as administrator.');
    console.error('🚨 Restart Error: An error occurred while trying to restart as administrator.');
  }
}

async function initializeAIServices() {
    console.log('Initializing AI services...');
    
    const geminiInitialized = initializeGemini();
    const openaiInitialized = initializeOpenAI();
    const cerebrasInitialized = initializeCerebras();
    
    console.log('AI Services Status:');
    console.log('- Gemini:', geminiInitialized ? '✅' : '❌');
    console.log('- OpenAI:', openaiInitialized ? '✅' : '❌');
    console.log('- Cerebras:', cerebrasInitialized ? '✅' : '❌');
    
    if (!geminiInitialized && !openaiInitialized && !cerebrasInitialized) {
        console.error('No AI services could be initialized. Please check your API keys.');
    }
}

// IPC Handlers
ipcMain.handle("check-permissions", async () => {
  console.log('🔍 Checking permissions via IPC...');
  const granted = await checkPermissions();
  
  if (granted) {
    console.log('✅ Permissions granted, navigating to overlay');
    // Transition to overlay mode first
    transitionToOverlayMode();
    // Then check permissions and load overlay
    checkPermissionsAndLoadOverlay();
  } else {
    console.log('❌ Permissions still denied');
  }
  
  return granted;
});

// Add new IPC handlers for enhanced permission management
ipcMain.handle("get-detailed-permission-status", async () => {
  try {
    const { getDetailedPermissionStatus } = require("./utils/permission");
    const detailedStatus = await getDetailedPermissionStatus();
    console.log('📋 Detailed permission status:', detailedStatus);
    return detailedStatus;
  } catch (error) {
    console.error('❌ Error getting detailed permission status:', error);
    return {
      granted: false,
      status: 'ERROR',
      error: error.message,
      platform: require('os').platform()
    };
  }
});

ipcMain.handle("open-permission-settings", async () => {
  try {
    const { openPermissionSettings } = require("./utils/permission");
    const success = await openPermissionSettings();
    console.log(`🔧 Permission settings opened: ${success}`);
    return success;
  } catch (error) {
    console.error('❌ Error opening permission settings:', error);
    return false;
  }
});




    
    // Handle Google sign-in (legacy - redirects to OTP flow)
    ipcMain.handle('clerk-google-signin', async (event) => {
        console.log('🔍 [MAIN] Google sign-in attempted - redirecting to OTP flow');
        return { 
            success: false, 
            error: 'Please use phone number sign-in for the best experience',
            suggestion: 'otp'
        };
    });

    // Handle mobile sign-in (legacy compatibility)
    ipcMain.handle('clerk-mobile-signin', async (event, { mobile }) => {
        console.log('📱 [MAIN] Legacy mobile sign-in for:', mobile);
        
        // Redirect to new OTP flow
        return await ipcMain.emit('send-otp', event, { phoneNumber: mobile });
    });

    // Handle getting current user data for welcome screen
    ipcMain.handle('get-current-user', async () => {
        try {
            if (global.currentUser) {
                console.log('👤 [MAIN] Returning current user data:', global.currentUser.phoneNumber);
                return {
                    success: true,
                    user: global.currentUser
                };
            } else {
                console.log('👤 [MAIN] No current user found');
                return {
                    success: false,
                    error: 'No user logged in'
                };
            }
        } catch (error) {
            console.error('❌ [MAIN] Error getting current user:', error);
            return {
                success: false,
                error: error.message
            };
        }
    });

    // Handle development skip login
    ipcMain.handle('skip-login', async (event) => {
        try {
            console.log('🔑 Skip login requested for development');
            
            // Set default user data for development
            const defaultUser = {
                id: 'dev-user-id',
                fullName: 'Development User',
                phoneNumber: '+11234567890',
                email: 'developer@interviewlift.com',
                isPhoneVerified: true,
                country: 'US',
                createdAt: new Date().toISOString(),
                lastSignInAt: new Date().toISOString(),
                accessToken: 'dev-token',
                needsProfileCompletion: false
            };
            
            // Store user data globally
            global.currentUser = defaultUser;
            global.authToken = 'dev-token';
            
            console.log('✅ Default user data set for development:', defaultUser.phoneNumber);
            
            // Navigate to welcome screen (same as other auth methods)
            setTimeout(() => {
                console.log('🚀 [MAIN] Navigating to welcome screen after skip login');
                transitionToWelcomeMode();
                global.mainWindow.loadFile("./src/electron/screens/welcome/welcome-screen.html");
            }, 500); // Shorter delay since no actual auth is happening
            
            return { success: true };
        } catch (error) {
            console.error('❌ Skip login error:', error);
            return { success: false, error: error.message };
        }
    });

    // Check development mode
    ipcMain.handle('is-development-mode', async () => {
        return process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';
    });



// Handle skip login request
ipcMain.handle('skip-login', async (event, data) => {
  console.log('🔑 Skip login requested with data:', data);
  try {
    // Store the user data
    global.userData = {
      keySkills: data.keySkills || ['python'],
      jobRole: data.jobRole || 'python'
    };
    
    // Transition to overlay mode and load overlay screen
    await transitionToOverlayMode();
    await checkPermissionsAndLoadOverlay();
    
    return { success: true };
  } catch (error) {
    console.error('❌ Skip login failed:', error);
    return { success: false, error: error.message };
  }
});

