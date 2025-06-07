require('dotenv').config();
const { app } = require("electron");

/**
 * InterviewLift Electron Main Process
 * Refactored for better maintainability and separation of concerns
 */

console.log('🚀 Starting InterviewLift...');

// Import all handler modules
const { registerAuthHandlers } = require("./handlers/auth-handlers");
const { createWindow, transitionToWelcomeMode, transitionToOverlayMode, registerWindowHandlers } = require("./handlers/window-handlers");
const { registerRecordingHandlers } = require("./handlers/recording-handlers");
const { registerPermissionHandlers, checkPermissionsAndLoadOverlay } = require("./handlers/permission-handlers");
const { 
  setupGlobalErrorHandling, 
  startMemoryMonitoring, 
  cleanupAllResources, 
  registerIPCHandler 
} = require("./utils/memory-manager");
const { 
  setupProtocolHandling, 
  registerGlobalShortcuts, 
  setupAppLifecycleEvents, 
  initializeAIServices, 
  requestSingleInstanceLock 
} = require("./handlers/app-lifecycle");

// Global variables
let mainWindow = null;

// Initialize the application
async function initializeApp() {
  try {
    console.log('⚙️ Initializing application...');
    
    // Setup global error handling
    setupGlobalErrorHandling();
    
    // Setup protocol handling
    setupProtocolHandling();
    
    // Request single instance lock
    if (!requestSingleInstanceLock()) {
      return; // Another instance is running, quit
    }
    
    // Start memory monitoring
    startMemoryMonitoring();
    
    // Setup app lifecycle events
    setupAppLifecycleEvents(cleanupAllResources);
    
    // Initialize AI services
    await initializeAIServices();
    
    console.log('✅ Application initialization completed');
  } catch (error) {
    console.error('❌ Application initialization failed:', error);
    throw error;
  }
}

// Main application startup
app.whenReady().then(async () => {
  try {
    console.log('🚀 App ready, starting initialization...');
    
    // Initialize app systems
    await initializeApp();
    
    // Create main window
    mainWindow = await createWindow();
    global.mainWindow = mainWindow; // Make available globally
    
    // Register all IPC handlers
    registerAuthHandlers(registerIPCHandler, mainWindow);
    registerWindowHandlers(mainWindow);
    registerRecordingHandlers(registerIPCHandler, mainWindow);
    registerPermissionHandlers(mainWindow, transitionToOverlayMode);
    
    // Register global shortcuts
    registerGlobalShortcuts();
    
    // Transition to welcome mode initially
    transitionToWelcomeMode(mainWindow);
    
    console.log('🎉 InterviewLift started successfully!');
    
  } catch (error) {
    console.error('❌ Failed to start InterviewLift:', error);
    app.quit();
  }
});

// Handle app activation (macOS)
app.on('activate', async () => {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    console.log('🔄 App activated, recreating window...');
    try {
      mainWindow = await createWindow();
      global.mainWindow = mainWindow;
      transitionToWelcomeMode(mainWindow);
    } catch (error) {
      console.error('❌ Failed to recreate window:', error);
    }
  }
});

console.log('✅ Main process script loaded');

