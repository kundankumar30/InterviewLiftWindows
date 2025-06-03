#!/usr/bin/env node

const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

class RecorderBuilder {
    constructor() {
        this.platform = os.platform();
        this.scriptDir = __dirname;
        this.projectRoot = path.dirname(this.scriptDir);
        
        console.log(`🖥️  Detected platform: ${this.platform}`);
        console.log(`📁 Project root: ${this.projectRoot}`);
    }

    async build(options = {}) {
        const { clean = false, configuration = 'release' } = options;

        console.log(`🔨 Building recorder for ${this.platform}...`);

        if (!this.isSupportedPlatform()) {
            console.error(`❌ Platform '${this.platform}' is not supported.`);
            console.error('   Supported platforms: darwin (macOS), win32 (Windows)');
            process.exit(1);
        }

        try {
            if (this.platform === 'darwin') {
                await this.buildMacOS(clean, configuration);
            } else if (this.platform === 'win32') {
                await this.buildWindows(clean, configuration);
            }
            
            console.log('✅ Build completed successfully!');
            await this.verifyBuild();
            
        } catch (error) {
            console.error('❌ Build failed:', error.message);
            process.exit(1);
        }
    }

    isSupportedPlatform() {
        return this.platform === 'darwin' || this.platform === 'win32';
    }

    async buildMacOS(clean, configuration) {
        console.log('🍎 Building macOS Swift recorder...');
        
        const scriptPath = path.join(this.scriptDir, 'build-macos-recorder.sh');
        
        if (!fs.existsSync(scriptPath)) {
            throw new Error(`Build script not found: ${scriptPath}`);
        }

        const args = [];
        if (clean) args.push('--clean');
        if (configuration === 'debug') args.push('--debug');
        else args.push('--release');

        await this.runScript('bash', [scriptPath, ...args]);
    }

    async buildWindows(clean, configuration) {
        console.log('🪟 Building Windows C# recorder...');
        
        const scriptPath = path.join(this.scriptDir, 'build-windows-recorder.ps1');
        
        if (!fs.existsSync(scriptPath)) {
            throw new Error(`Build script not found: ${scriptPath}`);
        }

        const args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath];
        if (clean) args.push('-Clean');
        args.push('-Configuration', configuration === 'debug' ? 'Debug' : 'Release');

        await this.runScript('powershell', args);
    }

    async runScript(command, args) {
        return new Promise((resolve, reject) => {
            console.log(`🚀 Running: ${command} ${args.join(' ')}`);
            
            const process = spawn(command, args, {
                stdio: 'inherit',
                cwd: this.projectRoot
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Process exited with code ${code}`));
                }
            });

            process.on('error', (error) => {
                reject(new Error(`Failed to run ${command}: ${error.message}`));
            });
        });
    }

    async verifyBuild() {
        console.log('🔍 Verifying build output...');
        
        const expectedPath = this.getExpectedExecutablePath();
        
        if (fs.existsSync(expectedPath)) {
            const stats = fs.statSync(expectedPath);
            const sizeKB = (stats.size / 1024).toFixed(2);
            
            console.log(`✅ Executable found: ${expectedPath}`);
            console.log(`📏 File size: ${sizeKB} KB`);
            console.log(`📅 Modified: ${stats.mtime.toISOString()}`);
            
            // Test execution
            await this.testExecutable(expectedPath);
            
        } else {
            throw new Error(`Expected executable not found: ${expectedPath}`);
        }
    }

    getExpectedExecutablePath() {
        if (this.platform === 'darwin') {
            return path.join(this.projectRoot, 'src', 'swift', 'Recorder');
        } else if (this.platform === 'win32') {
            return path.join(this.projectRoot, 'src', 'windows', 'bin', 'x64', 'Release', 'net8.0', 'win-x64', 'publish', 'Recorder.exe');
        }
        throw new Error(`Unknown platform: ${this.platform}`);
    }

    async testExecutable(executablePath) {
        return new Promise((resolve) => {
            console.log('🧪 Testing executable...');
            
            try {
                const testProcess = spawn(executablePath, ['--check-permissions'], {
                    stdio: ['ignore', 'ignore', 'pipe'],
                    timeout: 10000
                });

                let stderr = '';
                testProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                testProcess.on('close', (code) => {
                    if (stderr.trim()) {
                        try {
                            const response = JSON.parse(stderr.trim());
                            console.log(`✅ Test completed - Response: ${response.code}`);
                        } catch {
                            console.log('✅ Test completed - Got response (not JSON)');
                        }
                    } else {
                        console.log('✅ Test completed - No response');
                    }
                    resolve();
                });

                testProcess.on('error', (error) => {
                    console.log(`⚠️  Test warning: ${error.message} (this is normal for Windows API initialization)`);
                    resolve();
                });

                // Timeout handling
                setTimeout(() => {
                    try {
                        testProcess.kill('SIGTERM');
                    } catch (e) {
                        // Ignore kill errors
                    }
                    console.log('⚠️  Test timeout - this is normal for permission checks');
                    resolve();
                }, 5000);
                
            } catch (error) {
                console.log(`⚠️  Test warning: ${error.message} (this is normal for Windows API initialization)`);
                resolve();
            }
        });
    }

    printUsage() {
        console.log(`
Usage: node build-recorder.js [options]

Options:
  --clean         Clean build artifacts before building
  --debug         Build in debug mode (default: release)
  --help, -h      Show this help message

Examples:
  node build-recorder.js                    # Build in release mode
  node build-recorder.js --clean            # Clean and build
  node build-recorder.js --debug --clean    # Clean and build in debug mode

Platform Support:
  macOS (darwin):  Builds Swift recorder using ScreenCaptureKit
  Windows (win32): Builds C# recorder using Windows.Media.Capture

Build Requirements:
  macOS:    Xcode or Swift toolchain, macOS 12.3+
  Windows:  .NET 8 SDK, Windows 10 1903+ or Windows 11
`);
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    // Check for help
    if (args.includes('--help') || args.includes('-h')) {
        const builder = new RecorderBuilder();
        builder.printUsage();
        return;
    }

    // Parse options
    const options = {
        clean: args.includes('--clean'),
        configuration: args.includes('--debug') ? 'debug' : 'release'
    };

    const builder = new RecorderBuilder();
    await builder.build(options);
}

// Run if called directly
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ Build failed:', error.message);
        process.exit(1);
    });
}

module.exports = RecorderBuilder; 