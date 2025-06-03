const { promisify } = require("util");
const { execFile } = require("child_process");
const path = require("path");
const { app } = require("electron");
const fs = require('fs');
const os = require('os');

const execFileAsync = promisify(execFile);

// Import Windows permission manager for Windows-specific checks
const WindowsPermissionManager = require('./windows-permission-manager');

module.exports.checkPermissions = async () => {
  const platform = os.platform();
  
  if (platform === 'win32') {
    console.log('Checking permissions on Windows platform...');
    return await checkWindowsPermissions();
  } else if (platform === 'darwin') {
    console.log('Checking permissions on macOS platform...');
    return await checkMacOSPermissions();
  } else {
    console.error(`Unsupported platform: ${platform}`);
    return false;
  }
};

/**
 * Check permissions on Windows using Windows Permission Manager
 */
async function checkWindowsPermissions() {
  try {
    const windowsPermissionManager = new WindowsPermissionManager();
    const permissionResult = await windowsPermissionManager.checkAllPermissions();
    
    console.log('Windows permission check result:', {
      granted: permissionResult.granted,
      status: permissionResult.status,
      details: permissionResult.details
    });

    // If permissions are not granted, log recommendations for user
    if (!permissionResult.granted && permissionResult.recommendations) {
      console.log('Permission recommendations:');
      permissionResult.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }

    return permissionResult.granted;
    
  } catch (error) {
    console.error('Error checking Windows permissions:', error);
    return false;
  }
}

/**
 * Check permissions on macOS using Swift executable (screen capture only)
 */
async function checkMacOSPermissions() {
  let swiftExecutablePath = path.join(app.getAppPath(), 'src', 'swift', 'Recorder');
  if (app.isPackaged) {
    const packagedPath = process.resourcesPath ? path.join(process.resourcesPath, 'Recorder') : null;
    if (packagedPath && fs.existsSync(packagedPath)) {
        swiftExecutablePath = packagedPath;
    } else {
        console.warn("Packaged Swift executable not found at expected resourcesPath, check extraResource config and pathing.");
    }
  }

  const args = ["--check-permissions"];

  try {
    const { stdout, stderr } = await execFileAsync(swiftExecutablePath, args);

    if (stderr) {
      const jsonResponse = stderr.trim();
      if (!jsonResponse) {
        console.error("checkPermissions: Swift script output to stderr was empty.");
        return false;
      }
      try {
        const { code: checkPermissionCode } = JSON.parse(jsonResponse);
        return checkPermissionCode === "PERMISSION_GRANTED";
      } catch (parseError) {
        console.error("checkPermissions: Failed to parse JSON from Swift stderr:", jsonResponse, parseError);
        return false;
      }
    } else {
      console.error("checkPermissions: Swift script produced no output to stderr. stdout:", stdout);
      return false;
    }
  } catch (error) {
    console.error("checkPermissions: Error executing or processing Swift script output:", error.message);
    if (error.stderr) {
      const jsonResponse = error.stderr.trim();
      if (jsonResponse) {
        try {
          const { code: checkPermissionCode } = JSON.parse(jsonResponse);
          // If PERMISSION_DENIED comes via an error exit from Swift but still has valid JSON
          if (checkPermissionCode === "PERMISSION_DENIED") return false;
          return checkPermissionCode === "PERMISSION_GRANTED";
        } catch (parseError) {
          console.error("checkPermissions: Failed to parse JSON from Swift error.stderr:", jsonResponse, parseError);
        }
      }
    }
    return false;
  }
}

/**
 * Open platform-specific permission settings
 */
module.exports.openPermissionSettings = async (type = 'privacy') => {
  const platform = os.platform();
  
  if (platform === 'win32') {
    const windowsPermissionManager = new WindowsPermissionManager();
    return await windowsPermissionManager.openPermissionSettings(type);
  } else if (platform === 'darwin') {
    const { shell } = require('electron');
    return await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
  } else {
    console.error(`Cannot open permission settings on unsupported platform: ${platform}`);
    return false;
  }
};

/**
 * Get detailed permission status (useful for diagnostics)
 */
module.exports.getDetailedPermissionStatus = async () => {
  const platform = os.platform();
  
  if (platform === 'win32') {
    const windowsPermissionManager = new WindowsPermissionManager();
    return await windowsPermissionManager.checkAllPermissions();
  } else if (platform === 'darwin') {
    // For macOS, return basic status (Swift executable only provides basic grant/deny)
    const granted = await module.exports.checkPermissions();
    return {
      granted,
      status: granted ? 'PERMISSION_GRANTED' : 'PERMISSION_DENIED',
      platform: 'darwin',
      details: {
        screenCapture: { granted, status: granted ? 'GRANTED' : 'DENIED' }
      }
    };
  } else {
    return {
      granted: false,
      status: 'UNSUPPORTED_PLATFORM',
      platform,
      error: `Platform ${platform} is not supported`
    };
  }
}; 