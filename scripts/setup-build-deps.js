#!/usr/bin/env node

const os = require('os');
const { spawn, exec } = require('child_process');
const fs = require('fs');

class BuildDependencySetup {
    constructor() {
        this.platform = os.platform();
    }

    async checkAndSetup() {

        if (this.platform === 'win32') {
            await this.setupWindows();
        } else if (this.platform === 'darwin') {
            await this.setupMacOS();
        } else {
            process.exit(1);
        }

    }

    async setupWindows() {

        // Check .NET 8 SDK
        const dotnetInstalled = await this.checkDotNet();
        if (!dotnetInstalled) {
            await this.installDotNet();
        }

        // Check Windows version
        await this.checkWindowsVersion();
    }

    async setupMacOS() {

        // Check Swift
        const swiftInstalled = await this.checkSwift();
        if (!swiftInstalled) {
           
        }

        // Check macOS version
        await this.checkMacOSVersion();
    }

    async checkDotNet() {
        return new Promise((resolve) => {
            exec('dotnet --version', (error, stdout) => {
                if (error) {
                    resolve(false);
                } else {
                    const version = stdout.trim();
                    
                    const majorVersion = parseInt(version.split('.')[0]);
                    if (majorVersion >= 8) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                }
            });
        });
    }

    async installDotNet() {
        return new Promise((resolve, reject) => {
            
            const process = spawn('winget', ['install', 'Microsoft.DotNet.SDK.8'], {
                stdio: 'inherit'
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`WinGet exited with code ${code}`));
                }
            });

            process.on('error', (error) => {
                reject(error);
            });
        });
    }

    async checkSwift() {
        return new Promise((resolve) => {
            exec('swiftc --version', (error, stdout) => {
                if (error) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    async checkWindowsVersion() {
        return new Promise((resolve) => {
            exec('ver', (error, stdout) => {
                if (error) {
                    resolve();
                    return;
                }

                const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
                if (versionMatch) {
                    const version = versionMatch[1];
                    
                    const parts = version.split('.').map(Number);
                    const [major, minor, build] = parts;
                    
                    // Windows 10 1903 = 10.0.18362, Windows 11 = 10.0.22000+
                    if (major >= 10 && build >= 18362) {
                    } else {
                        console.warn('   ⚠️  Windows 10 1903+ or Windows 11 recommended for best compatibility');
                    }
                }
                resolve();
            });
        });
    }

    async checkMacOSVersion() {
        return new Promise((resolve) => {
            exec('sw_vers -productVersion', (error, stdout) => {
                if (error) {
                    console.error('⚠️  Could not determine macOS version');
                    resolve();
                    return;
                }

                const version = stdout.trim();
                
                const parts = version.split('.').map(Number);
                const [major, minor] = parts;
                
                // ScreenCaptureKit requires macOS 12.3+
                if (major > 12 || (major === 12 && minor >= 3)) {
                } else {
                    console.warn('      Current version may not support screen recording');
                }
                resolve();
            });
        });
    }

    printUsage() {
        console.log(`
        Setup Build Dependencies for Interview Lift

    This script checks and installs the required system dependencies for building
    platform-specific screen and audio recorders.

        Platform Requirements:
            macOS:    Swift 5.0+, Xcode 14.0+, macOS 12.3+
            Windows:  .NET 8.0 SDK, Windows 10 1903+

        Usage:
            node scripts/setup-build-deps.js

        The script will:
            1. Check if required dependencies are installed
            2. Offer to install missing dependencies (where possible)
            3. Verify system compatibility
            4. Provide manual installation instructions if needed

        After setup, you can build recorders with:
             npm run recorder:build
        `);
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        const setup = new BuildDependencySetup();
        setup.printUsage();
        return;
    }

    try {
        const setup = new BuildDependencySetup();
        await setup.checkAndSetup();
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        console.error('\nFor manual installation instructions, see:');
        console.error('  Windows: https://dotnet.microsoft.com/download/dotnet/8.0');
        console.error('  macOS:   https://developer.apple.com/xcode/');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = BuildDependencySetup; 