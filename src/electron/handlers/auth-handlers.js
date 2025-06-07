require('dotenv').config();
const { ipcMain, shell } = require("electron");
const https = require('https');
const url = require('url');

// Define custom protocol
const CUSTOM_PROTOCOL = 'interviewlift';

/**
 * Authentication Handlers Module
 * Handles Google OAuth, Clerk authentication, and related IPC handlers
 */

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
        'Content-Length': postData.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(`OAuth Error: ${response.error_description || response.error}`));
          } else {
            resolve(response);
          }
        } catch (error) {
          reject(new Error(`Failed to parse OAuth response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`OAuth request failed: ${error.message}`));
    });

    req.write(postData);
    req.end();
  });
}

// Handle OAuth callback URL
async function handleAuthCallback(authUrl) {
  try {
    console.log('🔐 Processing OAuth callback:', authUrl);
    
    const parsedUrl = url.parse(authUrl, true);
    const authCode = parsedUrl.query.code;
    const error = parsedUrl.query.error;

    if (error) {
      console.error('❌ OAuth Error:', error);
      throw new Error(`OAuth Error: ${error}`);
    }

    if (!authCode) {
      console.error('❌ No authorization code received');
      throw new Error('No authorization code received from Google');
    }

    console.log('🔄 Exchanging authorization code for tokens...');
    const tokens = await exchangeCodeForTokens(authCode);
    
    console.log('✅ OAuth tokens received successfully');
    return tokens;
    
  } catch (error) {
    console.error('❌ OAuth callback handling failed:', error);
    throw error;
  }
}

function registerAuthHandlers(registerIPCHandler, mainWindow) {
  // Navigation handler
  registerIPCHandler("navigate", async (event, screen) => {
    try {
      console.log(`🧭 Navigating to: ${screen}`);
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        console.error('❌ Main window not available for navigation');
        return { success: false, error: 'Main window not available' };
      }

      const navigationScript = `
        if (window.electronAPI && window.electronAPI.navigate) {
          window.electronAPI.navigate('${screen}');
        } else {
          console.error('Navigation API not available');
        }
      `;
      
      await mainWindow.webContents.executeJavaScript(navigationScript);
      console.log(`✅ Navigation to ${screen} completed`);
      
      return { success: true };
    } catch (error) {
      console.error(`❌ Navigation to ${screen} failed:`, error);
      return { success: false, error: error.message };
    }
  }, true);

  // Clerk authentication success
  registerIPCHandler("clerk-auth-success", async (event, authData) => {
    try {
      console.log('🎉 Clerk authentication successful:', { 
        userId: authData?.userId, 
        hasToken: !!authData?.token 
      });
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        console.error('❌ Main window not available for auth success');
        return { success: false, error: 'Main window not available' };
      }

      const authScript = `
        if (window.electronAPI && window.electronAPI.handleAuthSuccess) {
          window.electronAPI.handleAuthSuccess(${JSON.stringify(authData)});
        } else {
          console.error('Auth success handler not available');
        }
      `;
      
      await mainWindow.webContents.executeJavaScript(authScript);
      console.log('✅ Auth success event sent to renderer');
      
      return { success: true };
    } catch (error) {
      console.error('❌ Clerk auth success handling failed:', error);
      return { success: false, error: error.message };
    }
  }, true);

  // Clerk logout
  registerIPCHandler("clerk-auth-logout", async (event) => {
    try {
      console.log('👋 Processing Clerk logout...');
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        console.error('❌ Main window not available for logout');
        return { success: false, error: 'Main window not available' };
      }

      const logoutScript = `
        if (window.electronAPI && window.electronAPI.handleLogout) {
          window.electronAPI.handleLogout();
        } else {
          console.error('Logout handler not available');
        }
      `;
      
      await mainWindow.webContents.executeJavaScript(logoutScript);
      console.log('✅ Logout event sent to renderer');
      
      return { success: true };
    } catch (error) {
      console.error('❌ Logout handling failed:', error);
      return { success: false, error: error.message };
    }
  }, true);

  // Get Clerk token
  registerIPCHandler('clerk-get-token', async (event) => {
    try {
      console.log('🔑 Retrieving Clerk token...');
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: 'Main window not available' };
      }

      const token = await mainWindow.webContents.executeJavaScript(`
        window.clerkToken || null
      `);
      
      return { success: true, token };
    } catch (error) {
      console.error('❌ Failed to get Clerk token:', error);
      return { success: false, error: error.message };
    }
  }, true);

  // Get current user
  registerIPCHandler('clerk-get-current-user', async (event) => {
    try {
      console.log('👤 Retrieving current user...');
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: 'Main window not available' };
      }

      // Try to get user data from the renderer process
      const userData = await mainWindow.webContents.executeJavaScript(`
        window.currentUser || null
      `);
      
      if (userData) {
        console.log('✅ Current user retrieved:', { userId: userData.id });
        return { success: true, user: userData };
      } else {
        console.log('ℹ️ No current user found');
        return { success: false, error: 'No authenticated user' };
      }
    } catch (error) {
      console.error('❌ Failed to get current user:', error);
      return { success: false, error: error.message };
    }
  }, true);

  // Email sign-in handler
  ipcMain.handle('clerk-email-signin', async (event, { email, password }) => {
    try {
      console.log('📧 Processing email sign-in for:', email);
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: 'Main window not available' };
      }

      // Execute sign-in in the renderer process where Clerk is initialized
      const result = await mainWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            if (!window.clerk) {
              throw new Error('Clerk not initialized');
            }
            
            const signInResult = await window.clerk.client.signIn.create({
              identifier: '${email}',
              password: '${password}',
            });
            
            if (signInResult.status === 'complete') {
              return { success: true, user: signInResult.createdUserId };
            } else {
              return { success: false, error: 'Sign-in incomplete', status: signInResult.status };
            }
          } catch (error) {
            return { success: false, error: error.message };
          }
        })()
      `);
      
      if (result.success) {
        console.log('✅ Email sign-in successful');
      } else {
        console.error('❌ Email sign-in failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Email sign-in handler error:', error);
      return { success: false, error: error.message };
    }
  });

  // Google sign-in handler
  ipcMain.handle('clerk-google-signin', async (event) => {
    try {
      console.log('🔍 Processing Google sign-in...');
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: 'Main window not available' };
      }

      // Execute Google sign-in in the renderer process
      const result = await mainWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            if (!window.clerk) {
              throw new Error('Clerk not initialized');
            }
            
            const signInResult = await window.clerk.client.signIn.authenticateWithRedirect({
              strategy: 'oauth_google',
              redirectUrl: window.location.origin + '/auth-callback',
              redirectUrlComplete: window.location.origin + '/dashboard',
            });
            
            return { success: true, redirecting: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })()
      `);
      
      if (result.success) {
        console.log('✅ Google sign-in redirect initiated');
      } else {
        console.error('❌ Google sign-in failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Google sign-in handler error:', error);
      return { success: false, error: error.message };
    }
  });

  // Sign out handler
  ipcMain.handle('clerk-sign-out', async (event) => {
    try {
      console.log('👋 Processing sign-out...');
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, error: 'Main window not available' };
      }

      // Execute sign-out in the renderer process
      const result = await mainWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            if (!window.clerk) {
              throw new Error('Clerk not initialized');
            }
            
            await window.clerk.signOut();
            
            // Clear any stored user data
            window.currentUser = null;
            window.clerkToken = null;
            
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })()
      `);
      
      if (result.success) {
        console.log('✅ Sign-out successful');
      } else {
        console.error('❌ Sign-out failed:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Sign-out handler error:', error);
      return { success: false, error: error.message };
    }
  });

  // User authenticated event
  ipcMain.on("user-authenticated", (event, userData) => {
    try {
      console.log('✅ User authenticated event received:', { 
        userId: userData?.id || 'unknown',
        email: userData?.primaryEmailAddress?.emailAddress || 'no email'
      });
      
      // Store user data globally if needed
      global.currentUser = userData;
    } catch (error) {
      console.error('❌ User authenticated event handling failed:', error);
    }
  });

  // Request Clerk auth
  ipcMain.on("request-clerk-auth", async (event) => {
    try {
      console.log('🔐 Clerk auth request received');
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        console.error('❌ Main window not available for auth request');
        return;
      }

      // Trigger auth flow in renderer
      await mainWindow.webContents.executeJavaScript(`
        if (window.electronAPI && window.electronAPI.requestAuth) {
          window.electronAPI.requestAuth();
        }
      `);
    } catch (error) {
      console.error('❌ Clerk auth request handling failed:', error);
    }
  });

  // Request Gmail auth
  ipcMain.on("request-gmail-auth", async (event) => {
    try {
      console.log('📧 Gmail auth request received');
      
      const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      
      if (!clientId) {
        console.error('❌ Google Client ID not found');
        event.reply("gmail-auth-error", { error: 'Google Client ID not configured' });
        return;
      }

      const authUrl = `https://accounts.google.com/oauth2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(`${CUSTOM_PROTOCOL}://google-auth-callback`)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile')}&` +
        `access_type=offline&` +
        `prompt=consent`;

      console.log('🌐 Opening Google OAuth URL');
      await shell.openExternal(authUrl);
    } catch (error) {
      console.error('❌ Gmail auth request failed:', error);
      event.reply("gmail-auth-error", { error: error.message });
    }
  });

  // Skip login handler
  ipcMain.handle('skip-login', async (event, data) => {
    try {
      console.log('⏭️ Skip login requested:', data);
      
      // Handle skip login logic here
      // This might involve setting some default state or bypassing auth
      
      return { success: true, skipped: true };
    } catch (error) {
      console.error('❌ Skip login failed:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('✅ Auth handlers registered successfully');
}

module.exports = {
  registerAuthHandlers,
  handleAuthCallback,
  exchangeCodeForTokens,
  CUSTOM_PROTOCOL
}; 