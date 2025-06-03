const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const os = require('os');

const execAsync = promisify(exec);

class WindowsPermissionManager {
    constructor() {
        this.isChecking = false;
    }

    /**
     * Get the path to the C# recorder executable
     */
    getRecorderPath() {
        let isPackaged = false;
        
        try {
            const { app } = require('electron');
            isPackaged = app.isPackaged;
        } catch (error) {
            // Not running in Electron context, assume development mode
            console.log('Not in Electron context, assuming development mode');
            isPackaged = false;
        }
        
        if (isPackaged) {
            // In packaged app, look in resources
            const resourcesPath = process.resourcesPath;
            const recorderPath = path.join(resourcesPath, 'Recorder.exe');
            
            if (fs.existsSync(recorderPath)) {
                console.log('Using packaged C# Recorder:', recorderPath);
                return recorderPath;
            }
        } else {
            // In development, look in the release build directory first, then debug
            const releaseRecorderPath = path.join(process.cwd(), 'src', 'windows', 'bin', 'x64', 'Release', 'net8.0', 'win-x64', 'publish', 'Recorder.exe');
            if (fs.existsSync(releaseRecorderPath)) {
                console.log('Using development Release C# Recorder:', releaseRecorderPath);
                return releaseRecorderPath;
            }
            
            const debugRecorderPath = path.join(process.cwd(), 'src', 'windows', 'bin', 'x64', 'Debug', 'net8.0', 'win-x64', 'Recorder.exe');
            if (fs.existsSync(debugRecorderPath)) {
                console.log('Using development Debug C# Recorder:', debugRecorderPath);
                return debugRecorderPath;
            }
        }
        
        console.error('C# Recorder executable not found');
        return null;
    }

    /**
     * Check Windows screen recording/capture permissions using simple approach
     */
    async checkScreenCapturePermission() {
        try {
            console.log('Checking Windows screen capture permissions...');
            
            // Simple test - check if we can get basic system info
            const { stdout, stderr } = await execAsync(`powershell -Command "Get-WmiObject -Class Win32_VideoController | Select-Object Name, Status | Format-List"`, {
                timeout: 5000,
                encoding: 'utf8'
            });

            const result = stdout.trim();
            console.log('Screen capture permission check result:', result.length > 0 ? 'System info accessible' : 'System info blocked');

            // If we can query system info, screen capture should be available
            // Look for either device name or status information
            const hasSystemAccess = result.length > 0 && 
                                  (result.includes('Name') || result.includes('Status') || result.includes('VideoController'));

            return {
                granted: hasSystemAccess,
                status: hasSystemAccess ? 'SCREEN_CAPTURE_AVAILABLE' : 'SCREEN_CAPTURE_LIMITED',
                error: stderr ? stderr.trim() : null
            };

        } catch (error) {
            console.error('Error checking screen capture permissions:', error);
            // On Windows, screen capture is generally available unless blocked by enterprise policy
            // We'll assume it's available and let the actual capture handle any issues
            return {
                granted: true,
                status: 'SCREEN_CAPTURE_ASSUMED_AVAILABLE',
                error: 'Permission check failed but assuming availability for Windows'
            };
        }
    }

    /**
     * Test system audio accessibility using C# recorder
     */
    async testSystemAudioAccess() {
        try {
            console.log('Testing Windows system audio capture access using C# recorder...');
            
            const recorderPath = this.getRecorderPath();
            if (!recorderPath) {
                return {
                    granted: false,
                    status: 'RECORDER_NOT_FOUND',
                    error: 'C# Recorder executable not found'
                };
            }

            // Use quick test mode for fast permission checking
            const { stdout, stderr } = await execAsync(`"${recorderPath}" --test-audio-quick`, {
                timeout: 5000,
                encoding: 'utf8'
            });

            console.log('C# Recorder quick audio test output:', { stdout, stderr });

            // Parse the response - look for AUDIO_AVAILABLE or SUCCESS
            const hasAudioAccess = stdout.includes('AUDIO_AVAILABLE') || 
                                   stdout.includes('SUCCESS');
            
            console.log('System audio access test result:', hasAudioAccess ? 'SUCCESS' : 'LIMITED');

            return {
                granted: hasAudioAccess,
                status: hasAudioAccess ? 'SYSTEM_AUDIO_AVAILABLE' : 'SYSTEM_AUDIO_LIMITED',
                details: stdout.trim(),
                error: stderr ? stderr.trim() : null
            };

        } catch (error) {
            console.error('Error testing system audio access with C# recorder:', error);
            
            // If the recorder test fails, we'll assume basic audio access is available
            // This prevents blocking the app from starting due to permission test failures
            return {
                granted: true,
                status: 'SYSTEM_AUDIO_ASSUMED_AVAILABLE',
                error: 'Audio test failed but assuming basic availability'
            };
        }
    }

    /**
     * Comprehensive permission check for Windows (system audio + screen capture)
     */
    async checkAllPermissions() {
        if (this.isChecking) {
            console.log('Permission check already in progress...');
            return { granted: false, status: 'CHECK_IN_PROGRESS' };
        }

        this.isChecking = true;

        try {
            console.log('Starting comprehensive Windows permission check (system audio + screen capture)...');
            
            // Run permission checks in parallel
            const [screenResult, systemAudioResult] = await Promise.all([
                this.checkScreenCapturePermission(),
                this.testSystemAudioAccess()
            ]);

            const overallGranted = screenResult.granted && systemAudioResult.granted;
            
            const result = {
                granted: overallGranted,
                status: overallGranted ? 'ALL_PERMISSIONS_GRANTED' : 'PERMISSIONS_MISSING',
                details: {
                    screenCapture: screenResult,
                    systemAudio: systemAudioResult
                },
                recommendations: this.generateRecommendations(screenResult, systemAudioResult)
            };

            console.log('Windows permission check completed:', result);
            return result;

        } catch (error) {
            console.error('Error in comprehensive permission check:', error);
            return {
                granted: false,
                status: 'CHECK_ERROR',
                error: error.message,
                recommendations: ['Please restart the application and try again.']
            };
        } finally {
            this.isChecking = false;
        }
    }

    /**
     * Generate user-friendly recommendations based on permission results
     */
    generateRecommendations(screenResult, systemAudioResult) {
        const recommendations = [];

        if (!screenResult.granted) {
            recommendations.push(
                'Make sure your Windows version supports screen capture (Windows 10 1903+ or Windows 11)',
                'Try running the application as administrator if screen capture fails',
                'Check that no other screen recording software is blocking access'
            );
        }

        if (!systemAudioResult.granted) {
            recommendations.push(
                'Check that system audio devices are properly configured',
                'Verify that audio drivers are installed and working',
                'Ensure Windows Audio service is running',
                'Try restarting the application with administrator privileges'
            );
        }

        if (recommendations.length === 0) {
            recommendations.push('All permissions are properly configured!');
        }

        return recommendations;
    }

    /**
     * Open Windows Settings to relevant permission pages
     */
    async openPermissionSettings(type = 'privacy') {
        try {
            let shell;
            try {
                shell = require('electron').shell;
            } catch (error) {
                console.log('Not in Electron context, cannot open settings');
                return false;
            }
            
            let settingsUri = '';
            
            switch (type) {
                case 'camera':
                    settingsUri = 'ms-settings:privacy-webcam';
                    break;
                case 'privacy':
                    settingsUri = 'ms-settings:privacy';
                    break;
                case 'audio':
                    settingsUri = 'ms-settings:sound';
                    break;
                case 'apps':
                    settingsUri = 'ms-settings:privacy-appdiagnostics';
                    break;
                default:
                    settingsUri = 'ms-settings:privacy';
            }

            await shell.openExternal(settingsUri);
            console.log(`Opened Windows Settings: ${settingsUri}`);
            return true;
            
        } catch (error) {
            console.error('Error opening Windows Settings:', error);
            return false;
        }
    }

    /**
     * Test if C# recorder is available and working
     */
    async checkRecorderAvailability() {
        try {
            const recorderPath = this.getRecorderPath();
            if (!recorderPath || !fs.existsSync(recorderPath)) {
                console.error('C# Recorder not found at expected path');
                return { available: false, path: null, error: 'Recorder executable not found' };
            }

            // Test if the recorder runs without errors
            const { stdout, stderr } = await execAsync(`"${recorderPath}" --version`, { 
                timeout: 5000,
                encoding: 'utf8'
            });
            
            if (stdout.includes('Recorder') || !stderr.includes('ERROR')) {
                console.log('C# Recorder is available and working');
                return { available: true, path: recorderPath, version: stdout.trim() };
            } else {
                console.warn('C# Recorder responded with errors:', stderr);
                return { available: false, path: recorderPath, error: stderr.trim() };
            }

        } catch (error) {
            console.error('Error checking C# Recorder availability:', error);
            return { available: false, path: null, error: error.message };
        }
    }
}

module.exports = WindowsPermissionManager; 