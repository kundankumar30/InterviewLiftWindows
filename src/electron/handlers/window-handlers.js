const { BrowserWindow, ipcMain, dialog, screen, powerSaveBlocker } = require("electron");
const os = require("os");
const path = require("path");

// Define desired opacity for uniform transparency
const DESIRED_OPACITY = 1.5; // 150% opacity for maximum readability

let powerSaveBlockerId = null;

/**
 * Window Management Module
 * Handles window creation, transitions, and window-related operations
 */

const createWindow = async () => {
  console.log('🪟 Creating main window...');
  
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const mainWindow = new BrowserWindow({
    width: Math.floor(width * 0.8),
    height: Math.floor(height * 0.8),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
    show: false, // Don't show until ready
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: process.platform === 'win32' ? 
      path.join(__dirname, "..", "..", "assets", "icon.ico") : 
      path.join(__dirname, "..", "..", "assets", "icon.png"),
  });

  // Center the window
  mainWindow.center();

  console.log('🌐 Loading application URL...');
  
  const isDev = process.env.NODE_ENV === "development";
  const startUrl = isDev 
    ? "http://localhost:3000" 
    : `file://${path.join(__dirname, "..", "..", "out", "index.html")}`;

  try {
    await mainWindow.loadURL(startUrl);
    console.log('✅ Application loaded successfully');
  } catch (error) {
    console.error('❌ Failed to load application:', error);
    throw error;
  }

  // Handle window ready
  mainWindow.once('ready-to-show', () => {
    console.log('👁️ Window ready to show');
    mainWindow.show();
    
    if (isDev) {
      console.log('🔧 Development mode - opening DevTools');
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle navigation events
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Allow navigation within the same origin or to auth callbacks
    if (parsedUrl.origin !== new URL(startUrl).origin && 
        !navigationUrl.includes('auth-callback')) {
      console.log('🚫 Preventing external navigation to:', navigationUrl);
      event.preventDefault();
    }
  });

  // Handle new window requests
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('🔗 External link clicked:', url);
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  console.log('✅ Main window created successfully');
  return mainWindow;
};

function transitionToWelcomeMode(mainWindow) {
  console.log('🏠 Transitioning to welcome mode...');
  
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      console.error('❌ Main window not available for welcome transition');
      return;
    }

    // Reset window properties for welcome mode
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setSkipTaskbar(false);
    mainWindow.setResizable(true);
    mainWindow.setMovable(true);
    mainWindow.setMinimizable(true);
    mainWindow.setClosable(true);
    
    // Restore normal window behavior
    mainWindow.setIgnoreMouseEvents(false);
    
    console.log('✅ Welcome mode transition completed');
  } catch (error) {
    console.error('❌ Welcome mode transition failed:', error);
  }
}

function transitionToOverlayMode(mainWindow) {
  console.log('🎯 Transitioning to overlay mode...');
  
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      console.error('❌ Main window not available for overlay transition');
      return;
    }

    const displays = screen.getAllDisplays();
    const primaryDisplay = displays.find(display => display.primary) || displays[0];
    
    if (!primaryDisplay) {
      console.error('❌ No display found for overlay mode');
      return;
    }

    const { x, y, width, height } = primaryDisplay.workArea;
    
    // Configure overlay window properties
    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.setVisibleOnAllWorkspaces(true);
    mainWindow.setFullScreenable(false);
    mainWindow.setSkipTaskbar(true);
    
    // Set window bounds to cover the entire screen
    mainWindow.setBounds({ x, y, width, height });
    
    // Make window click-through initially
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    
    // Apply transparency
    mainWindow.setOpacity(DESIRED_OPACITY);
    
    // Prevent window modifications in overlay mode
    mainWindow.setResizable(false);
    mainWindow.setMovable(false);
    mainWindow.setMinimizable(false);
    mainWindow.setClosable(true); // Keep closable for emergency exit
    
    console.log('✅ Overlay mode transition completed');
  } catch (error) {
    console.error('❌ Overlay mode transition failed:', error);
  }
}

function registerWindowHandlers(mainWindow) {
  // Mouse events handler
  ipcMain.on("set-mouse-events", (event, ignore) => {
    try {
      console.log(`🖱️ Setting mouse events ignore: ${ignore}`);
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        console.error('❌ Main window not available for mouse events');
        return;
      }

      mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
      console.log(`✅ Mouse events ${ignore ? 'disabled' : 'enabled'}`);
    } catch (error) {
      console.error('❌ Failed to set mouse events:', error);
    }
  });

  // Toggle window visibility
  ipcMain.on("toggle-window", () => {
    try {
      console.log('👁️ Toggling window visibility...');
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        console.error('❌ Main window not available for toggle');
        return;
      }

      if (mainWindow.isVisible()) {
        console.log('🙈 Hiding window');
        mainWindow.hide();
      } else {
        console.log('👀 Showing window');
        mainWindow.show();
        mainWindow.focus();
      }
    } catch (error) {
      console.error('❌ Failed to toggle window:', error);
    }
  });

  // Toggle screen protection
  ipcMain.on("toggle-screen-protection", (event, enabled) => {
    try {
      console.log(`🛡️ Toggling screen protection: ${enabled}`);
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        console.error('❌ Main window not available for screen protection');
        return;
      }

      if (enabled) {
        // Enable content protection
        mainWindow.setContentProtection(true);
        
        // Block power save to prevent screen dimming
        if (powerSaveBlockerId === null) {
          powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
          console.log('⚡ Power save blocker started:', powerSaveBlockerId);
        }
        
        console.log('✅ Screen protection enabled');
      } else {
        // Disable content protection
        mainWindow.setContentProtection(false);
        
        // Release power save blocker
        if (powerSaveBlockerId !== null) {
          powerSaveBlocker.stop(powerSaveBlockerId);
          console.log('⚡ Power save blocker stopped:', powerSaveBlockerId);
          powerSaveBlockerId = null;
        }
        
        console.log('✅ Screen protection disabled');
      }
      
      // Send status back to renderer
      event.reply("screen-protection-status", { enabled });
    } catch (error) {
      console.error('❌ Failed to toggle screen protection:', error);
      event.reply("screen-protection-status", { enabled: false, error: error.message });
    }
  });

  // Get content protection status
  ipcMain.handle("get-content-protection-status", async () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { enabled: false, error: 'Main window not available' };
      }

      // Check if content protection is enabled
      const isProtected = mainWindow.isContentProtected && mainWindow.isContentProtected();
      const isPowerSaveBlocked = powerSaveBlockerId !== null;
      
      console.log(`🛡️ Content protection status: ${isProtected}, Power save blocked: ${isPowerSaveBlocked}`);
      
      return { 
        enabled: isProtected,
        powerSaveBlocked: isPowerSaveBlocked,
        powerSaveBlockerId 
      };
    } catch (error) {
      console.error('❌ Failed to get content protection status:', error);
      return { enabled: false, error: error.message };
    }
  });

  // Get style configuration
  ipcMain.handle("get-style-config", async () => {
    try {
      console.log('🎨 Getting style configuration...');
      
      const config = {
        platform: os.platform(),
        version: os.release(),
        arch: os.arch(),
        opacity: DESIRED_OPACITY,
        isDevelopment: process.env.NODE_ENV === "development"
      };
      
      console.log('✅ Style config retrieved:', config);
      return config;
    } catch (error) {
      console.error('❌ Failed to get style config:', error);
      return { error: error.message };
    }
  });

  // Open folder dialog
  ipcMain.on("open-folder-dialog", async (event) => {
    try {
      console.log('📁 Opening folder dialog...');
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        console.error('❌ Main window not available for dialog');
        event.reply("folder-dialog-result", { error: 'Main window not available' });
        return;
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Folder'
      });

      if (!result.canceled && result.filePaths.length > 0) {
        console.log('✅ Folder selected:', result.filePaths[0]);
        event.reply("folder-dialog-result", { 
          success: true, 
          path: result.filePaths[0] 
        });
      } else {
        console.log('❌ Folder dialog canceled');
        event.reply("folder-dialog-result", { 
          success: false, 
          canceled: true 
        });
      }
    } catch (error) {
      console.error('❌ Folder dialog failed:', error);
      event.reply("folder-dialog-result", { 
        success: false, 
        error: error.message 
      });
    }
  });

  // Move window handler
  ipcMain.on("move-window", (_, direction) => {
    try {
      console.log(`↔️ Moving window: ${direction}`);
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        console.error('❌ Main window not available for move');
        return;
      }

      const [x, y] = mainWindow.getPosition();
      const moveDistance = 50;
      
      let newX = x;
      let newY = y;
      
      switch (direction) {
        case 'up':
          newY = Math.max(0, y - moveDistance);
          break;
        case 'down':
          newY = y + moveDistance;
          break;
        case 'left':
          newX = Math.max(0, x - moveDistance);
          break;
        case 'right':
          newX = x + moveDistance;
          break;
        default:
          console.warn('⚠️ Unknown move direction:', direction);
          return;
      }
      
      mainWindow.setPosition(newX, newY);
      console.log(`✅ Window moved to: ${newX}, ${newY}`);
    } catch (error) {
      console.error('❌ Failed to move window:', error);
    }
  });

  // Quit app handler
  ipcMain.on("quit-app", () => {
    try {
      console.log('👋 Quit app request received');
      
      // Clean up power save blocker
      if (powerSaveBlockerId !== null) {
        powerSaveBlocker.stop(powerSaveBlockerId);
        powerSaveBlockerId = null;
      }
      
      require('electron').app.quit();
    } catch (error) {
      console.error('❌ Failed to quit app:', error);
    }
  });

  console.log('✅ Window handlers registered successfully');
}

// Cleanup function for window management
function cleanupWindowHandlers() {
  try {
    // Clean up power save blocker
    if (powerSaveBlockerId !== null) {
      powerSaveBlocker.stop(powerSaveBlockerId);
      powerSaveBlockerId = null;
      console.log('🧹 Power save blocker cleaned up');
    }
    
    console.log('✅ Window handlers cleanup completed');
  } catch (error) {
    console.error('❌ Window handlers cleanup failed:', error);
  }
}

module.exports = {
  createWindow,
  transitionToWelcomeMode,
  transitionToOverlayMode,
  registerWindowHandlers,
  cleanupWindowHandlers,
  DESIRED_OPACITY
}; 