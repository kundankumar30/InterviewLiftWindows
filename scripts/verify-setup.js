#!/usr/bin/env node

/**
 * Setup Verification Script for Interview Lift
 * Checks if all required files and configurations are in place
 */

const fs = require('fs');
const path = require('path');


// Check if we're in the correct directory
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (!fs.existsSync(packageJsonPath)) {
    process.exit(1);
}

// Check stt.json file
const sttJsonPath = path.join(process.cwd(), 'stt.json');

if (fs.existsSync(sttJsonPath)) {
    try {
        const sttContent = JSON.parse(fs.readFileSync(sttJsonPath, 'utf8'));
        
        // Validate required fields
        const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
        const missingFields = requiredFields.filter(field => !sttContent[field]);
        
        if (missingFields.length === 0) {
            console.log(`   Project ID: ${sttContent.project_id}`);
            console.log(`   Service Account: ${sttContent.client_email}`);
        } else {
            console.log('⚠️  stt.json file found but missing required fields:');
            missingFields.forEach(field => console.log(`   - ${field}`));
        }
    } catch (error) {
        console.log('❌ stt.json file found but contains invalid JSON');
        console.log(`   Error: ${error.message}`);
    }
} else {
    console.log('❌ stt.json file not found');
    console.log('   Please download your Google Cloud Speech-to-Text credentials');
    console.log('   and save them as stt.json in the project root directory');
    console.log('   See stt.json.example for the required structure');
}

// Check .env file
const envPath = path.join(process.cwd(), '.env');

if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    if (envContent.includes('GEMINI_API_KEY=') && !envContent.includes('GEMINI_API_KEY=your_gemini_api_key_here')) {
        console.log('✅ .env file found with GEMINI_API_KEY configured');
    } else {
        console.log('⚠️  .env file found but GEMINI_API_KEY not properly set');
        console.log('   Please add: GEMINI_API_KEY=your_actual_api_key');
    }
} else {
    console.log('⚠️  .env file not found');
    console.log('   Create a .env file with: GEMINI_API_KEY=your_actual_api_key');
}

// Check node_modules
const nodeModulesPath = path.join(process.cwd(), 'node_modules');

if (fs.existsSync(nodeModulesPath)) {
    console.log('✅ node_modules directory found');
    console.log('   Dependencies appear to be installed');
} else {
    console.log('❌ node_modules directory not found');
    console.log('   Run: npm install');
}

// Check platform-specific requirements
const platform = process.platform;

if (platform === 'darwin') {
    console.log('✅ macOS detected');
    
    const swiftRecorderPath = path.join(process.cwd(), 'src', 'swift', 'Recorder');
    if (fs.existsSync(swiftRecorderPath)) {
        console.log('✅ Swift Recorder executable found');
    } else {
        console.log('⚠️  Swift Recorder executable not found');
        console.log('   You may need to compile the Swift recorder');
    }
} else if (platform === 'win32') {
    console.log('✅ Windows detected');
    
    const binPath = path.join(process.cwd(), 'bin');
    if (fs.existsSync(binPath)) {
        console.log('✅ bin directory found (for FFmpeg)');
    } else {
        console.log('⚠️  bin directory not found');
        console.log('   FFmpeg will be downloaded automatically on first run');
    }
} else {
    console.log(`⚠️  Platform ${platform} may not be fully supported`);
    console.log('   This application is optimized for macOS and Windows');
}

console.log('\n🚀 Setup verification complete!');
console.log('   If all checks passed, you can run: npm run electron');

// Exit with appropriate code
const hasErrors = !fs.existsSync(sttJsonPath) || !fs.existsSync(nodeModulesPath);
process.exit(hasErrors ? 1 : 0); 