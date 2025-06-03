# Windows FFmpeg Setup Guide

Interview Lift automatically downloads and bundles FFmpeg for Windows system audio capture. This guide explains the process and troubleshooting steps.

## 📦 Automatic FFmpeg Bundling

Interview Lift now automatically:
- Downloads the appropriate FFmpeg binary for your Windows system
- Bundles it with the application during development and packaging
- Falls back to system FFmpeg if bundled version fails

## 🔧 Setup Process

### Development Mode
1. Run `npm run setup:ffmpeg` to download FFmpeg manually
2. Or run any electron command - FFmpeg will be downloaded automatically
3. FFmpeg will be placed in the `bin/` directory

### Packaged Application
- FFmpeg is automatically included in the packaged app
- Located in the app's `resources/bin/` directory
- No user intervention required

## 🛠️ Manual Setup (If Automatic Fails)

If the automatic download fails, you can manually install FFmpeg:

### Option 1: Download Pre-built Binary
1. Download FFmpeg from [https://www.gyan.dev/ffmpeg/builds/](https://www.gyan.dev/ffmpeg/builds/)
2. Extract the archive
3. Copy `ffmpeg.exe` to the `bin/` folder in the project directory

### Option 2: Install System-wide FFmpeg
1. Download FFmpeg from [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)
2. Add FFmpeg to your system PATH
3. Interview Lift will detect and use the system installation

## 🔍 Verification

To verify FFmpeg is working:

```bash
# Check if FFmpeg is downloaded
npm run ffmpeg:verify

# Test permissions and setup
npm run test:permissions
```

## 🐛 Troubleshooting

### FFmpeg Not Found Error
```
FFMPEG_NOT_FOUND: FFmpeg is required for Windows system audio capture
```

**Solutions:**
1. Run `npm run setup:ffmpeg` to re-download
2. Check if antivirus software blocked the download
3. Manually download and place FFmpeg in `bin/ffmpeg.exe`
4. Install FFmpeg system-wide and add to PATH

### Permission Errors
```
Error: spawn EACCES
```

**Solutions:**
1. Run as Administrator
2. Check Windows Defender exclusions
3. Verify the `bin/` directory is writable

### System Audio Access Errors
```
ALL_AUDIO_METHODS_FAILED: All system audio capture methods failed
```

**Solutions:**
1. Update audio drivers
2. Check Windows Audio service is running
3. Ensure no other apps are using system audio exclusively
4. Verify system audio output is working

## 📊 Windows System Requirements

Interview Lift requires:
- **Windows 10 1903+** or **Windows 11** for modern screen capture support
- **Working audio drivers** and system audio output
- **No microphone permissions needed** - only system audio capture

## 🔧 System Audio Troubleshooting

### WASAPI Loopback Issues
If WASAPI (Windows Audio Session API) loopback fails:
1. Check audio drivers are up to date
2. Restart Windows Audio service
3. Try running as Administrator
4. Ensure system audio is not muted

### DirectShow Fallback
Interview Lift will attempt DirectShow if WASAPI fails:
1. Enable "Stereo Mix" in sound settings
2. Set it as the default recording device
3. Verify "Listen to this device" is disabled

## 📝 Technical Details

### FFmpeg Sources
- **Windows x64**: Gyan's FFmpeg builds (essentials)
- **Automatic fallback**: System PATH FFmpeg
- **Format**: 32-bit float PCM at 16kHz mono

### System Audio Capture Methods (in order of preference)
1. WASAPI default loopback device (captures system audio)
2. WASAPI specific loopback device (:0)
3. DirectShow Stereo Mix (system audio routing)

## 🆘 Getting Help

If you continue to experience issues:
1. Check the detailed permission status in the app
2. Run `npm run test:permissions` for diagnostics
3. Look at the console logs for specific error messages
4. Ensure Windows is up to date (Windows 10 1903+ or Windows 11)
5. Verify system audio is working by playing music/videos

## 🎯 Audio Quality Settings

Default settings (optimized for speech recognition):
- **Sample Rate**: 16 kHz
- **Channels**: 1 (mono)
- **Format**: 32-bit float PCM
- **Source**: System audio loopback (not microphone)
- **Latency**: Real-time streaming 