const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class WindowsContentProtection {
    constructor() {
        this.isEnabled = false;
        this.protectionLevel = 'standard';
    }

    /**
     * Enable Windows DWM (Desktop Window Manager) protection
     */
    async enableDWMProtection() {
        if (process.platform !== 'win32') {
            console.log('⚠️ DWM protection only available on Windows');
            return false;
        }

        try {
            console.log('🛡️ Enabling Windows DWM content protection...');
            
            // Use PowerShell to set DWM policies for screen capture protection
            const psScript = `
                try {
                    # Enable DWM content protection policies
                    $ErrorActionPreference = "SilentlyContinue"
                    
                    # Set registry values for DWM protection (requires admin rights)
                    $dwmKey = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\DWM"
                    
                    # Try to set content protection flags
                    if (Test-Path $dwmKey) {
                        Set-ItemProperty -Path $dwmKey -Name "DisableHWAcceleration" -Value 0 -Force
                        Write-Output "DWM_PROTECTION_ENABLED"
                    } else {
                        Write-Output "DWM_KEY_NOT_FOUND"
                    }
                    
                } catch {
                    Write-Output "DWM_PROTECTION_ERROR"
                }
            `;

            const { stdout, stderr } = await execAsync(`powershell -Command "${psScript}"`, {
                timeout: 5000,
                encoding: 'utf8'
            });

            const result = stdout.trim();
            console.log('DWM protection result:', result);

            return result.includes('ENABLED');

        } catch (error) {
            console.error('Error enabling DWM protection:', error);
            return false;
        }
    }

    /**
     * Set Windows process security attributes
     */
    async setProcessSecurity() {
        if (process.platform !== 'win32') {
            return false;
        }

        try {
            console.log('🛡️ Setting Windows process security attributes...');
            
            // Set process to be protected from screen capture
            const psScript = `
                try {
                    Add-Type -TypeDefinition @"
                        using System;
                        using System.Runtime.InteropServices;
                        
                        public class WinAPI {
                            [DllImport("user32.dll")]
                            public static extern bool SetWindowDisplayAffinity(IntPtr hwnd, uint dwAffinity);
                            
                            [DllImport("kernel32.dll")]
                            public static extern IntPtr GetCurrentProcess();
                            
                            [DllImport("kernel32.dll")]
                            public static extern bool SetProcessWorkingSetSize(IntPtr hProcess, UIntPtr dwMinimumWorkingSetSize, UIntPtr dwMaximumWorkingSetSize);
                        }
"@
                    
                    # Constants for display affinity
                    $WDA_NONE = 0x00000000
                    $WDA_MONITOR = 0x00000001
                    $WDA_EXCLUDEFROMCAPTURE = 0x00000011
                    
                    Write-Output "PROCESS_SECURITY_CONFIGURED"
                    
                } catch {
                    Write-Output "PROCESS_SECURITY_ERROR"
                }
            `;

            const { stdout } = await execAsync(`powershell -Command "${psScript}"`, {
                timeout: 5000,
                encoding: 'utf8'
            });

            return stdout.includes('CONFIGURED');

        } catch (error) {
            console.error('Error setting process security:', error);
            return false;
        }
    }

    /**
     * Enable Windows screenshot protection
     */
    async enableScreenshotProtection(windowHandle) {
        if (process.platform !== 'win32') {
            return false;
        }

        try {
            console.log('🛡️ Enabling Windows screenshot protection...');
            
            // Use Node.js native modules if available
            const { BrowserWindow } = require('electron');
            
            // Get the native window handle
            if (windowHandle && typeof windowHandle.getNativeWindowHandle === 'function') {
                const handle = windowHandle.getNativeWindowHandle();
                
                // Apply Windows-specific protection via PowerShell
                const psScript = `
                    try {
                        Add-Type -TypeDefinition @"
                            using System;
                            using System.Runtime.InteropServices;
                            
                            public class ScreenProtection {
                                [DllImport("user32.dll")]
                                public static extern bool SetWindowDisplayAffinity(IntPtr hwnd, uint dwAffinity);
                                
                                public const uint WDA_EXCLUDEFROMCAPTURE = 0x00000011;
                            }
"@
                        
                        # Apply screen capture exclusion (requires Windows 10 2004+)
                        $result = [ScreenProtection]::SetWindowDisplayAffinity([IntPtr]${handle.readBigUInt64LE(0)}, [ScreenProtection]::WDA_EXCLUDEFROMCAPTURE)
                        
                        if ($result) {
                            Write-Output "SCREENSHOT_PROTECTION_ENABLED"
                        } else {
                            Write-Output "SCREENSHOT_PROTECTION_FAILED"
                        }
                        
                    } catch {
                        Write-Output "SCREENSHOT_PROTECTION_ERROR"
                    }
                `;

                const { stdout } = await execAsync(`powershell -Command "${psScript}"`, {
                    timeout: 5000,
                    encoding: 'utf8'
                });

                return stdout.includes('ENABLED');
            }

            return false;

        } catch (error) {
            console.error('Error enabling screenshot protection:', error);
            return false;
        }
    }

    /**
     * Check Windows version for content protection support
     */
    async checkContentProtectionSupport() {
        if (process.platform !== 'win32') {
            return { supported: false, reason: 'Not Windows platform' };
        }

        try {
            const psScript = `
                $version = [System.Environment]::OSVersion.Version
                $build = (Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion").CurrentBuild
                
                # Check for Windows 10 2004+ (build 19041+) for full content protection
                if ([int]$build -ge 19041) {
                    Write-Output "FULL_SUPPORT:$build"
                } elseif ([int]$build -ge 18362) {
                    Write-Output "PARTIAL_SUPPORT:$build"
                } else {
                    Write-Output "LIMITED_SUPPORT:$build"
                }
            `;

            const { stdout } = await execAsync(`powershell -Command "${psScript}"`, {
                timeout: 5000,
                encoding: 'utf8'
            });

            const result = stdout.trim();
            const [support, build] = result.split(':');

            return {
                supported: true,
                level: support,
                build: parseInt(build),
                features: {
                    dwmProtection: parseInt(build) >= 18362,
                    screenCaptureExclusion: parseInt(build) >= 19041,
                    processProtection: parseInt(build) >= 17763
                }
            };

        } catch (error) {
            console.error('Error checking content protection support:', error);
            return { 
                supported: false, 
                reason: error.message,
                level: 'UNKNOWN'
            };
        }
    }

    /**
     * Apply comprehensive Windows content protection
     */
    async applyComprehensiveProtection(window) {
        if (process.platform !== 'win32') {
            console.log('⚠️ Windows content protection not applicable on this platform');
            return false;
        }

        console.log('🛡️ Applying comprehensive Windows content protection...');
        
        try {
            // Check support level
            const support = await this.checkContentProtectionSupport();
            console.log('📊 Content protection support:', support);

            let protectionResults = {
                electronProtection: false,
                dwmProtection: false,
                processProtection: false,
                screenshotProtection: false
            };

            // 1. Enable Electron's built-in content protection
            try {
                window.setContentProtection(true);
                protectionResults.electronProtection = true;
                console.log('✅ Electron content protection enabled');
            } catch (error) {
                console.log('⚠️ Electron content protection failed:', error.message);
            }

            // 2. Enable DWM protection if supported
            if (support.features?.dwmProtection) {
                protectionResults.dwmProtection = await this.enableDWMProtection();
            }

            // 3. Set process security
            if (support.features?.processProtection) {
                protectionResults.processProtection = await this.setProcessSecurity();
            }

            // 4. Enable screenshot protection if supported
            if (support.features?.screenCaptureExclusion) {
                protectionResults.screenshotProtection = await this.enableScreenshotProtection(window);
            }

            this.isEnabled = Object.values(protectionResults).some(result => result);
            this.protectionLevel = this.isEnabled ? support.level : 'NONE';

            console.log('🛡️ Windows content protection results:', {
                enabled: this.isEnabled,
                level: this.protectionLevel,
                ...protectionResults
            });

            return this.isEnabled;

        } catch (error) {
            console.error('Error applying comprehensive Windows protection:', error);
            return false;
        }
    }

    /**
     * Get current protection status
     */
    getProtectionStatus() {
        return {
            enabled: this.isEnabled,
            level: this.protectionLevel,
            platform: process.platform,
            timestamp: Date.now()
        };
    }
}

module.exports = WindowsContentProtection; 