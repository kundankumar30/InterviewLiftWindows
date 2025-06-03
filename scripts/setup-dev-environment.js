#!/usr/bin/env node

/**
 * Development Environment Setup Script
 * Ensures all required dependencies and binaries are available for developers
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🚀 Setting up Interview Lift development environment...\n');

async function setupFFmpeg() {
    console.log('📦 Setting up FFmpeg...');
    
    const FFmpegDownloader = require('./download-ffmpeg.js');
    const downloader = new FFmpegDownloader();
    
    try {
        const success = await downloader.downloadAndExtractFFmpeg();
        if (success) {
            console.log('✅ FFmpeg setup completed successfully');
            
            // Verify FFmpeg works
            const verified = await downloader.verifyFFmpeg();
            if (verified) {
                console.log('✅ FFmpeg verification passed');
            } else {
                console.log('⚠️  FFmpeg downloaded but verification failed');
            }
        } else {
            console.log('❌ FFmpeg setup failed');
            return false;
        }
    } catch (error) {
        console.error('❌ FFmpeg setup error:', error.message);
        return false;
    }
    
    return true;
}

async function checkCredentials() {
    console.log('\n🔐 Checking API credentials...');
    
    // Check stt.json
    const sttPath = path.join(process.cwd(), 'stt.json');
    if (fs.existsSync(sttPath)) {
        try {
            const sttContent = JSON.parse(fs.readFileSync(sttPath, 'utf8'));
            if (sttContent.project_id && sttContent.private_key && sttContent.client_email) {
                console.log('✅ Google Speech-to-Text credentials found and valid');
            } else {
                console.log('⚠️  stt.json found but incomplete');
            }
        } catch (error) {
            console.log('❌ stt.json found but invalid JSON');
        }
    } else {
        console.log('⚠️  stt.json not found - you\'ll need to add your Google credentials');
        console.log('   Copy your Google Cloud Speech-to-Text JSON credentials to stt.json');
    }
    
    // Check .env
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('GEMINI_API_KEY=') && !envContent.includes('your_gemini_api_key_here')) {
            console.log('✅ Environment variables configured');
        } else {
            console.log('⚠️  .env found but GEMINI_API_KEY not properly configured');
        }
    } else {
        console.log('⚠️  .env file not found - create one with GEMINI_API_KEY=your_key');
    }
}

async function checkPlatformSpecific() {
    console.log('\n🖥️  Checking platform-specific requirements...');
    
    const platform = os.platform();
    
    if (platform === 'darwin') {
        console.log('✅ macOS detected');
        
        // Check Swift recorder
        const swiftPath = path.join(process.cwd(), 'src', 'swift', 'Recorder');
        if (fs.existsSync(swiftPath)) {
            console.log('✅ Swift recorder executable found');
        } else {
            console.log('⚠️  Swift recorder not found - run: npm run swift:make');
        }
    } else if (platform === 'win32') {
        console.log('✅ Windows detected');
        
        // Check FFmpeg specifically for Windows
        const ffmpegPath = path.join(process.cwd(), 'bin', 'ffmpeg.exe');
        if (fs.existsSync(ffmpegPath)) {
            console.log('✅ Windows FFmpeg found');
        } else {
            console.log('⚠️  Windows FFmpeg not found - will be downloaded automatically');
        }
    } else {
        console.log(`⚠️  Platform ${platform} detected - limited support`);
    }
}

async function main() {
    console.log('🔍 Interview Lift Development Environment Setup');
    console.log('===============================================\n');
    
    // Step 1: Setup FFmpeg
    const ffmpegSuccess = await setupFFmpeg();
    
    // Step 2: Check credentials
    await checkCredentials();
    
    // Step 3: Check platform-specific requirements
    await checkPlatformSpecific();
    
    // Step 4: Summary
    console.log('\n📋 Setup Summary:');
    console.log('================');
    
    if (ffmpegSuccess) {
        console.log('✅ FFmpeg: Ready for audio capture');
    } else {
        console.log('❌ FFmpeg: Setup failed - manual installation may be required');
    }
    
    console.log('\n🎯 Next Steps for Developers:');
    console.log('1. Ensure stt.json contains your Google Speech-to-Text credentials');
    console.log('2. Create .env file with GEMINI_API_KEY=your_actual_key');
    console.log('3. Run: npm run verify-setup (to check everything)');
    console.log('4. Run: npm run electron (to start the app)');
    
    console.log('\n🚀 Development environment setup complete!');
    
    // Exit with success code if FFmpeg setup worked
    process.exit(ffmpegSuccess ? 0 : 1);
}

// Run the setup
if (require.main === module) {
    main().catch(error => {
        console.error('Setup failed:', error);
        process.exit(1);
    });
}

module.exports = { setupFFmpeg, checkCredentials, checkPlatformSpecific }; 