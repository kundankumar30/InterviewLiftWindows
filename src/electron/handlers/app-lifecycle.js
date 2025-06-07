const { app, globalShortcut, ipcMain } = require("electron");
const { handleAuthCallback, CUSTOM_PROTOCOL } = require("./auth-handlers");

/**
 * App Lifecycle and System Integration Module
 * Handles app lifecycle events, global shortcuts, protocol handling, and admin functions
 */

let deeplinkingUrl; // Variable to store URL when app is opened via protocol

// Protocol handling setup
function setupProtocolHandling() {
  console.log('🔗 Setting up protocol handling...');
  
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL);
  }
  
  console.log(`✅ Protocol handling setup for: ${CUSTOM_PROTOCOL}://`);
}

// Global shortcuts registration
function registerGlobalShortcuts() {
  console.log('⌨️ Registering global shortcuts...');
  
  try {
    // Register shortcuts for overlay control
    const shortcuts = [
      {
        accelerator: 'CommandOrControl+Shift+I',
        action: () => {
          console.log('🎯 Global shortcut: Toggle overlay');
          if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            global.mainWindow.webContents.send('toggle-overlay');
          }
        }
      },
      {
        accelerator: 'CommandOrControl+Shift+R',
        action: () => {
          console.log('🎙️ Global shortcut: Toggle recording');
          if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            global.mainWindow.webContents.send('toggle-recording');
          }
        }
      },
      {
        accelerator: 'CommandOrControl+Shift+H',
        action: () => {
          console.log('👁️ Global shortcut: Toggle window visibility');
          if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            if (global.mainWindow.isVisible()) {
              global.mainWindow.hide();
            } else {
              global.mainWindow.show();
              global.mainWindow.focus();
            }
          }
        }
      }
    ];

    // Register each shortcut
    shortcuts.forEach(({ accelerator, action }) => {
      const success = globalShortcut.register(accelerator, action);
      if (success) {
        console.log(`✅ Global shortcut registered: ${accelerator}`);
      } else {
        console.warn(`⚠️ Failed to register global shortcut: ${accelerator}`);
      }
    });

    console.log('✅ Global shortcuts registration completed');
  } catch (error) {
    console.error('❌ Failed to register global shortcuts:', error);
  }
}

// App lifecycle event handlers
function setupAppLifecycleEvents(cleanupAllResources) {
  // App quit event
  app.on('will-quit', () => {
    console.log('👋 App will quit - cleaning up resources...');
    
    try {
      // Unregister all global shortcuts
      globalShortcut.unregisterAll();
      console.log('⌨️ Global shortcuts unregistered');
      
      // Cleanup all resources
      cleanupAllResources();
      
      console.log('✅ App quit cleanup completed');
    } catch (error) {
      console.error('❌ Error during app quit cleanup:', error);
    }
  });

  // Browser window blur event
  app.on('browser-window-blur', () => {
    console.log('🔄 Browser window lost focus');
    // Could add logic here to handle window focus loss
  });

  // Handle second instance (when app is already running)
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('🔄 Second instance detected');
    
    // Check for protocol URL in command line
    const protocolUrl = commandLine.find(arg => arg.startsWith(`${CUSTOM_PROTOCOL}://`));
    if (protocolUrl) {
      console.log('🔗 Protocol URL from second instance:', protocolUrl);
      handleProtocolUrl(protocolUrl);
    }
    
    // Focus the main window if it exists
    if (global.mainWindow) {
      if (global.mainWindow.isMinimized()) {
        global.mainWindow.restore();
      }
      global.mainWindow.focus();
    }
  });

  // Handle protocol URL when app is starting
  app.on('open-url', (event, url) => {
    console.log('🔗 Open URL event:', url);
    event.preventDefault();
    handleProtocolUrl(url);
  });

  // Window all closed event
  app.on('window-all-closed', (e) => {
    console.log('🪟 All windows closed');
    
    // On macOS, keep app running even when windows are closed
    if (process.platform !== 'darwin') {
      console.log('👋 Quitting app (non-macOS)');
      app.quit();
    } else {
      console.log('🍎 macOS - keeping app running');
      e.preventDefault();
    }
  });

  console.log('✅ App lifecycle events setup completed');
}

// Handle protocol URLs
async function handleProtocolUrl(url) {
  try {
    console.log('🔗 Handling protocol URL:', url);
    
    if (url.includes('google-auth-callback')) {
      console.log('🔐 Google auth callback detected');
      
      try {
        const tokens = await handleAuthCallback(url);
        console.log('✅ OAuth tokens processed successfully');
        
        // Send tokens to renderer if main window exists
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
          global.mainWindow.webContents.send('gmail-auth-success', tokens);
        }
      } catch (error) {
        console.error('❌ OAuth callback processing failed:', error);
        
        // Send error to renderer
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
          global.mainWindow.webContents.send('gmail-auth-error', { error: error.message });
        }
      }
    } else {
      // Store URL for later use
      deeplinkingUrl = url;
      console.log('🔗 Deeplink URL stored:', deeplinkingUrl);
    }
  } catch (error) {
    console.error('❌ Protocol URL handling failed:', error);
  }
}

// Initialize AI services
async function initializeAIServices() {
  console.log('🤖 Initializing AI services...');
  
  try {
    // Initialize all AI services
    const { initializeGemini } = require('../utils/gemini_service');
    const { initializeOpenAI } = require('../utils/openai_service');
    const { initializeCerebras } = require('../utils/cerebras_service');
    
    // Initialize services in parallel
    const results = await Promise.allSettled([
      initializeGemini(),
      initializeOpenAI(),
      initializeCerebras()
    ]);
    
    // Log results
    results.forEach((result, index) => {
      const serviceName = ['Gemini', 'OpenAI', 'Cerebras'][index];
      if (result.status === 'fulfilled') {
        console.log(`✅ ${serviceName} service initialized successfully`);
      } else {
        console.warn(`⚠️ ${serviceName} service initialization failed:`, result.reason);
      }
    });
    
    console.log('✅ AI services initialization completed');
    return { success: true, results };
  } catch (error) {
    console.error('❌ AI services initialization failed:', error);
    return { success: false, error: error.message };
  }
}

// Admin functionality
async function restartAsAdmin() {
  console.log('🔧 Attempting to restart as administrator...');
  
  try {
    const sudo = require('sudo-prompt');
    const options = {
      name: 'InterviewLift',
      icns: process.platform === 'darwin' ? 
        path.join(__dirname, '..', '..', 'assets', 'icon.icns') : undefined,
    };

    return new Promise((resolve, reject) => {
      sudo.exec(process.execPath, options, (error, stdout, stderr) => {
        if (error) {
          console.error('❌ Failed to restart as admin:', error);
          reject(error);
        } else {
          console.log('✅ Successfully restarted as admin');
          resolve({ success: true });
        }
      });
    });
  } catch (error) {
    console.error('❌ Admin restart error:', error);
    throw error;
  }
}

// Check if app should request single instance lock
function requestSingleInstanceLock() {
  console.log('🔒 Requesting single instance lock...');
  
  const gotTheLock = app.requestSingleInstanceLock();
  
  if (!gotTheLock) {
    console.log('❌ Another instance is already running - quitting');
    app.quit();
    return false;
  }
  
  console.log('✅ Single instance lock acquired');
  return true;
}

// Get deeplink URL if stored
function getDeeplinkUrl() {
  return deeplinkingUrl;
}

// Clear stored deeplink URL
function clearDeeplinkUrl() {
  deeplinkingUrl = null;
}

module.exports = {
  setupProtocolHandling,
  registerGlobalShortcuts,
  setupAppLifecycleEvents,
  handleProtocolUrl,
  initializeAIServices,
  restartAsAdmin,
  requestSingleInstanceLock,
  getDeeplinkUrl,
  clearDeeplinkUrl,
  CUSTOM_PROTOCOL
}; 