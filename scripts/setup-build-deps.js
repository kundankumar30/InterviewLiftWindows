#!/usr/bin/env node

const os = require('os');
const { spawn, exec } = require('child_process');
const fs = require('fs');

class BuildDependencySetup {
    constructor() {
        this.platform = os.platform();
        console.log(`🖥️  Setting up build dependencies for ${this.platform}...`);
    }

    async checkAndSetup() {
        console.log('\n📋 Checking system dependencies...\n');

        if (this.platform === 'win32') {
            await this.setupWindows();
        } else if (this.platform === 'darwin') {
            await this.setupMacOS();
        } else {
            console.log(`❌ Platform '${this.platform}' is not supported for recorder builds.`);
            console.log('   Supported platforms: Windows (win32), macOS (darwin)');
            process.exit(1);
        }

        console.log('\n✅ Build dependency check completed!');
        console.log('\n🔨 You can now run: npm run recorder:build');
    }

    async setupWindows() {
        console.log('🪟 Windows Build Dependencies:\n');

        // Check .NET 8 SDK
        const dotnetInstalled = await this.checkDotNet();
        if (!dotnetInstalled) {
            console.log('📥 Installing .NET 8 SDK...');
            await this.installDotNet();
        }

        // Check Windows version
        await this.checkWindowsVersion();
    }

    async setupMacOS() {
        console.log('🍎 macOS Build Dependencies:\n');

        // Check Swift
        const swiftInstalled = await this.checkSwift();
        if (!swiftInstalled) {
            console.log('❌ Swift not found. Please install Xcode or Swift toolchain.');
            console.log('   • Xcode: https://apps.apple.com/app/xcode/id497799835');
            console.log('   • Swift: https://swift.org/download/');
        }

        // Check macOS version
        await this.checkMacOSVersion();
    }

    async checkDotNet() {
        return new Promise((resolve) => {
            exec('dotnet --version', (error, stdout) => {
                if (error) {
                    console.log('❌ .NET SDK not found');
                    resolve(false);
                } else {
                    const version = stdout.trim();
                    console.log(`✅ .NET SDK found: v${version}`);
                    
                    const majorVersion = parseInt(version.split('.')[0]);
                    if (majorVersion >= 8) {
                        console.log('   ✅ Version is compatible (8.0+ required)');
                        resolve(true);
                    } else {
                        console.log('   ❌ Version too old (8.0+ required)');
                        resolve(false);
                    }
                }
            });
        });
    }

    async installDotNet() {
        return new Promise((resolve, reject) => {
            console.log('🚀 Running: winget install Microsoft.DotNet.SDK.8');
            
            const process = spawn('winget', ['install', 'Microsoft.DotNet.SDK.8'], {
                stdio: 'inherit'
            });

            process.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ .NET 8 SDK installed successfully!');
                    resolve();
                } else {
                    console.log('❌ Failed to install .NET 8 SDK');
                    console.log('   Manual installation: https://dotnet.microsoft.com/download/dotnet/8.0');
                    reject(new Error(`WinGet exited with code ${code}`));
                }
            });

            process.on('error', (error) => {
                console.log('❌ WinGet not available, please install .NET 8 SDK manually:');
                console.log('   https://dotnet.microsoft.com/download/dotnet/8.0');
                reject(error);
            });
        });
    }

    async checkSwift() {
        return new Promise((resolve) => {
            exec('swiftc --version', (error, stdout) => {
                if (error) {
                    console.log('❌ Swift compiler not found');
                    resolve(false);
                } else {
                    console.log(`✅ Swift found: ${stdout.trim().split('\n')[0]}`);
                    resolve(true);
                }
            });
        });
    }

    async checkWindowsVersion() {
        return new Promise((resolve) => {
            exec('ver', (error, stdout) => {
                if (error) {
                    console.log('⚠️  Could not determine Windows version');
                    resolve();
                    return;
                }

                const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
                if (versionMatch) {
                    const version = versionMatch[1];
                    console.log(`🖥️  Windows version: ${version}`);
                    
                    const parts = version.split('.').map(Number);
                    const [major, minor, build] = parts;
                    
                    // Windows 10 1903 = 10.0.18362, Windows 11 = 10.0.22000+
                    if (major >= 10 && build >= 18362) {
                        console.log('   ✅ Windows version is compatible');
                    } else {
                        console.log('   ⚠️  Windows 10 1903+ or Windows 11 recommended for best compatibility');
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
                    console.log('⚠️  Could not determine macOS version');
                    resolve();
                    return;
                }

                const version = stdout.trim();
                console.log(`🖥️  macOS version: ${version}`);
                
                const parts = version.split('.').map(Number);
                const [major, minor] = parts;
                
                // ScreenCaptureKit requires macOS 12.3+
                if (major > 12 || (major === 12 && minor >= 3)) {
                    console.log('   ✅ macOS version supports ScreenCaptureKit');
                } else {
                    console.log('   ❌ macOS 12.3+ required for ScreenCaptureKit support');
                    console.log('      Current version may not support screen recording');
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
        console.log('\nFor manual installation instructions, see:');
        console.log('  Windows: https://dotnet.microsoft.com/download/dotnet/8.0');
        console.log('  macOS:   https://developer.apple.com/xcode/');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = BuildDependencySetup; 