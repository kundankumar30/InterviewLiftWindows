const { ipcMain, screen, nativeImage } = require("electron");
const { checkPermissions } = require("../utils/permission");

/**
 * Permission and System Handlers Module
 * Handles permission checks, system integration, and related IPC communication
 */

async function checkPermissionsAndLoadOverlay(mainWindow, transitionToOverlayMode) {
  try {
    console.log('🔍 Checking permissions and loading overlay...');
    
    if (!mainWindow || mainWindow.isDestroyed()) {
      console.error('❌ Main window not available for permissions check');
      return { success: false, error: 'Main window not available' };
    }

    // Check system permissions
    const permissionStatus = await checkPermissions();
    console.log('🛡️ Permission status:', permissionStatus);

    if (!permissionStatus.allGranted) {
      console.warn('⚠️ Not all permissions granted:', permissionStatus.denied);
      
      // Send permission status to renderer
      mainWindow.webContents.send('permission-status', {
        granted: permissionStatus.granted,
        denied: permissionStatus.denied,
        allGranted: permissionStatus.allGranted
      });
      
      return { 
        success: false, 
        error: 'Missing required permissions',
        permissionStatus 
      };
    }

    // All permissions granted, transition to overlay mode
    console.log('✅ All permissions granted, transitioning to overlay mode');
    
    // Notify renderer about successful permission check
    mainWindow.webContents.send('permissions-granted');
    
    // Transition to overlay mode
    transitionToOverlayMode(mainWindow);
    
    console.log('✅ Overlay mode activated successfully');
    return { success: true, permissionStatus };
    
  } catch (error) {
    console.error('❌ Failed to check permissions and load overlay:', error);
    
    // Send error to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('permission-error', {
        error: error.message,
        stack: error.stack
      });
    }
    
    return { success: false, error: error.message };
  }
}

function registerPermissionHandlers(mainWindow, transitionToOverlayMode) {
  // Check permissions handler
  ipcMain.handle("check-permissions", async () => {
    try {
      console.log('🔍 Checking system permissions...');
      
      const result = await checkPermissions();
      
      console.log('📊 Permission check result:', {
        allGranted: result.allGranted,
        grantedCount: result.granted.length,
        deniedCount: result.denied.length
      });
      
      return {
        success: true,
        permissions: result
      };
      
    } catch (error) {
      console.error('❌ Permission check failed:', error);
      return {
        success: false,
        error: error.message,
        permissions: {
          allGranted: false,
          granted: [],
          denied: ['unknown']
        }
      };
    }
  });

  // Get detailed permission status
  ipcMain.handle("get-detailed-permission-status", async () => {
    try {
      console.log('📋 Getting detailed permission status...');
      
      const result = await checkPermissions();
      
      // Get additional system information
      const systemInfo = {
        platform: process.platform,
        version: process.getSystemVersion(),
        arch: process.arch
      };
      
      console.log('✅ Detailed permission status retrieved');
      
      return {
        success: true,
        permissions: result,
        systemInfo,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Failed to get detailed permission status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Open permission settings
  ipcMain.handle("open-permission-settings", async () => {
    try {
      console.log('⚙️ Opening permission settings...');
      
      const { shell } = require('electron');
      
      if (process.platform === 'darwin') {
        // macOS - open Security & Privacy preferences
        await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy');
      } else if (process.platform === 'win32') {
        // Windows - open Privacy settings
        await shell.openExternal('ms-settings:privacy');
      } else {
        // Linux - open system settings (varies by distribution)
        await shell.openExternal('gnome-control-center privacy');
      }
      
      console.log('✅ Permission settings opened');
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to open permission settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Screenshot handler
  ipcMain.handle('take-screenshot', async (event) => {
    try {
      console.log('📸 Taking screenshot...');
      
      // Get all available displays
      const displays = screen.getAllDisplays();
      console.log(`📺 Found ${displays.length} display(s)`);
      
      // Take screenshot of primary display
      const primaryDisplay = displays.find(display => display.primary) || displays[0];
      
      if (!primaryDisplay) {
        throw new Error('No display available for screenshot');
      }
      
      console.log('📸 Capturing primary display:', primaryDisplay.id);
      
      // Capture the screen
      const screenshot = await screen.captureScreen({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      });
      
      if (!screenshot || screenshot.isEmpty()) {
        throw new Error('Failed to capture screenshot - empty result');
      }
      
      // Convert to base64 for transmission
      const buffer = screenshot.toPNG();
      const base64Screenshot = buffer.toString('base64');
      
      console.log('✅ Screenshot captured successfully');
      console.log(`📊 Screenshot size: ${Math.round(buffer.length / 1024)}KB`);
      
      return {
        success: true,
        screenshot: `data:image/png;base64,${base64Screenshot}`,
        metadata: {
          width: screenshot.getSize().width,
          height: screenshot.getSize().height,
          displayId: primaryDisplay.id,
          captureTime: new Date().toISOString(),
          sizeKB: Math.round(buffer.length / 1024)
        }
      };
      
    } catch (error) {
      console.error('❌ Screenshot capture failed:', error);
      
      // Try alternative screenshot method
      try {
        console.log('🔄 Trying alternative screenshot method...');
        
        const sources = await require('electron').desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1920, height: 1080 }
        });
        
        if (sources && sources.length > 0) {
          const primarySource = sources[0];
          const thumbnail = primarySource.thumbnail;
          
          if (!thumbnail.isEmpty()) {
            const buffer = thumbnail.toPNG();
            const base64Screenshot = buffer.toString('base64');
            
            console.log('✅ Alternative screenshot method successful');
            
            return {
              success: true,
              screenshot: `data:image/png;base64,${base64Screenshot}`,
              metadata: {
                width: thumbnail.getSize().width,
                height: thumbnail.getSize().height,
                sourceId: primarySource.id,
                sourceName: primarySource.name,
                captureTime: new Date().toISOString(),
                sizeKB: Math.round(buffer.length / 1024),
                method: 'desktopCapturer'
              }
            };
          }
        }
      } catch (altError) {
        console.error('❌ Alternative screenshot method also failed:', altError);
      }
      
      return {
        success: false,
        error: error.message,
        details: {
          originalError: error.message,
          timestamp: new Date().toISOString(),
          platform: process.platform
        }
      };
    }
  });

  console.log('✅ Permission handlers registered successfully');
}

module.exports = {
  registerPermissionHandlers,
  checkPermissionsAndLoadOverlay
}; 