#!/usr/bin/env node

/**
 * Development Environment Setup Script
 * Ensures all required dependencies and binaries are available for developers
 */

const fs = require('fs');
const path = require('path');
const os = require('os');


async function setupFFmpeg() {
    
    const FFmpegDownloader = require('./download-ffmpeg.js');
    const downloader = new FFmpegDownloader();
    
    try {
        const success = await downloader.downloadAndExtractFFmpeg();
        if (success) {
            
            // Verify FFmpeg works
            const verified = await downloader.verifyFFmpeg();
            if (verified) {
            } else {
                console.warn('⚠️  FFmpeg downloaded but verification failed');
            }
        } else {
            console.error('❌ FFmpeg setup failed');
            return false;
        }
    } catch (error) {
        console.error('❌ FFmpeg setup error:', error.message);
        return false;
    }
    
    return true;
}

async function checkCredentials() {
    
    // Check stt.json
    const sttPath = path.join(process.cwd(), 'stt.json');
    if (fs.existsSync(sttPath)) {
        try {
            const sttContent = JSON.parse(fs.readFileSync(sttPath, 'utf8'));
            if (sttContent.project_id && sttContent.private_key && sttContent.client_email) {
                console.log('✅ Google Speech-to-Text credentials found and valid');
            } else {
                console.warn('⚠️  stt.json found but incomplete');
            }
        } catch (error) {
            console.error('❌ stt.json found but invalid JSON');
        }
    } else {
        console.warn('⚠️  stt.json not found - you\'ll need to add your Google credentials');
        console.warn('   Copy your Google Cloud Speech-to-Text JSON credentials to stt.json');
    }
    
    // Check .env
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('GEMINI_API_KEY=') && !envContent.includes('your_gemini_api_key_here')) {
        } else {
            console.warn('⚠️  .env found but GEMINI_API_KEY not properly configured');
        }
    } else {
        console.warn('⚠️  .env file not found - create one with GEMINI_API_KEY=your_key');
    }
}

async function checkPlatformSpecific() {

    const platform = os.platform();
    
    if (platform === 'darwin') {
        
        // Check Swift recorder
        const swiftPath = path.join(process.cwd(), 'src', 'swift', 'Recorder');
        if (fs.existsSync(swiftPath)) {
        } else {
            console.warn('⚠️  Swift recorder not found - run: npm run swift:make');
        }
    } else if (platform === 'win32') {
        
        // Check FFmpeg specifically for Windows
        const ffmpegPath = path.join(process.cwd(), 'bin', 'ffmpeg.exe');
        if (fs.existsSync(ffmpegPath)) {
        } else {
            console.warn('⚠️  Windows FFmpeg not found - will be downloaded automatically');
        }
    } else {
        console.warn(`⚠️  Platform ${platform} detected - limited support`);
    }
}

async function main() {
   
    
    // Step 1: Setup FFmpeg
    const ffmpegSuccess = await setupFFmpeg();
    
    // Step 2: Check credentials
    await checkCredentials();
    
    // Step 3: Check platform-specific requirements
    await checkPlatformSpecific();
    
  
    
    
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