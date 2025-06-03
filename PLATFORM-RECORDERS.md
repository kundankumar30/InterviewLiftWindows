# Platform-Specific Recorders

This document describes the platform-specific screen and audio recording system implemented for Interview Lift.

## Overview

Interview Lift now supports **full display screen capture** and **system audio recording** on both macOS and Windows using native platform APIs. The system automatically detects the operating system and uses the appropriate recorder implementation.

### Supported Platforms

| Platform | Implementation | APIs Used | Requirements |
|----------|----------------|-----------|--------------|
| **macOS** | Swift | ScreenCaptureKit, AVFoundation | macOS 12.3+, Xcode/Swift |
| **Windows** | C# | Windows.Media.Capture, GraphicsCapture | Windows 10 1903+, .NET 8 |

### ⚠️ Important Notes

- **No microphone functionality** - Only system audio and screen capture
- **Full display capture** - Captures entire screen, not window-specific
- **Proper permissions required** - Both platforms require user consent

## Architecture

```
📁 Project Structure
├── src/
│   ├── swift/                    # macOS Implementation
│   │   ├── Recorder.swift        # Swift recorder using ScreenCaptureKit
│   │   └── Recorder              # Compiled executable (after build)
│   ├── windows/                  # Windows Implementation
│   │   ├── Recorder.cs           # C# recorder using Windows.Media.Capture
│   │   ├── WindowsRecorder.csproj # Project file
│   │   └── bin/                  # Build output directory
│   └── utils/
│       └── platform-recorder.js  # Platform detection & routing
├── scripts/
│   ├── build-recorder.js         # Unified build script
│   ├── build-macos-recorder.sh   # macOS build script
│   └── build-windows-recorder.ps1 # Windows build script
```

## Quick Start

### Building Recorders

```bash
# Build for current platform (auto-detects macOS/Windows)
npm run recorder:build

# Clean build
npm run recorder:build:clean

# Debug build
npm run recorder:build:debug

# Platform-specific builds
npm run recorder:build:macos     # macOS only
npm run recorder:build:windows   # Windows only
```

### Using in Code

```javascript
const PlatformRecorder = require('./src/utils/platform-recorder');

const recorder = new PlatformRecorder();

// Set up callbacks
recorder.setCallbacks({
    onAudioData: (audioData) => {
        // Handle audio data (Buffer)
        console.log('Received audio data:', audioData.length, 'bytes');
    },
    onVideoFrame: (frameData) => {
        // Handle video frame (base64 encoded image)
        console.log('Received video frame:', frameData.imageData.length, 'chars');
    },
    onStatusUpdate: (status) => {
        // Handle status updates
        console.log('Status:', status.code);
    },
    onError: (error) => {
        // Handle errors
        console.error('Error:', error.message);
    }
});

// Check permissions
const permissionResult = await recorder.checkPermissions();
if (!permissionResult.granted) {
    console.error('Permissions not granted:', permissionResult.error);
    return;
}

// Start recording
const started = await recorder.startRecording();
if (started) {
    console.log('Recording started successfully');
    
    // Stop after 10 seconds
    setTimeout(() => {
        recorder.stopRecording();
    }, 10000);
}
```

## Platform Details

### macOS (Swift Implementation)

**File:** `src/swift/Recorder.swift`

**Features:**
- Uses `ScreenCaptureKit` for screen capture (requires macOS 12.3+)
- Uses `AVFoundation` for audio processing
- Outputs 16kHz mono audio and compressed JPEG frames
- Handles display permissions automatically

**Build Requirements:**
- macOS 12.3 or later
- Xcode or Swift toolchain
- ScreenCaptureKit framework access

**Build Process:**
```bash
# Direct build
bash scripts/build-macos-recorder.sh

# With options
bash scripts/build-macos-recorder.sh --clean --release
```

**Output:** `src/swift/Recorder` (executable)

### Windows (C# Implementation)

**File:** `src/windows/Recorder.cs`

**Features:**
- Uses `Windows.Media.Capture` for audio capture
- Uses `Windows.Graphics.Capture` for screen capture
- Targets .NET 8 with Windows-specific APIs
- Self-contained executable with all dependencies

**Build Requirements:**
- Windows 10 version 1903 or later
- .NET 8 SDK
- Windows App SDK

**Build Process:**
```powershell
# Direct build
powershell -ExecutionPolicy Bypass -File scripts/build-windows-recorder.ps1

# With options
powershell -ExecutionPolicy Bypass -File scripts/build-windows-recorder.ps1 -Clean -Configuration Release
```

**Output:** `src/windows/bin/Release/net8.0-windows10.0.19041.0/win-x64/publish/Recorder.exe`

## Integration with Electron

The platform recorder is integrated into the main Electron application through `src/utils/platform-recorder.js`, which:

1. **Detects the current platform** (`process.platform`)
2. **Routes to appropriate recorder** (Swift on macOS, C# on Windows)
3. **Provides unified API** for the Electron main process
4. **Handles cross-platform differences** in executable paths and arguments

### Build Integration

The build system is integrated into the main npm scripts:

```json
{
  "scripts": {
    "electron:start": "npm run ffmpeg:ensure && npm run recorder:build && electron-forge start",
    "electron:dev": "npm run ffmpeg:ensure && npm run recorder:build && electron-forge start",
    "electron:package": "npm run ffmpeg:ensure && npm run recorder:build && electron-forge package"
  }
}
```

This ensures that:
- Recorders are built before starting Electron
- Platform-appropriate recorder is available
- Build failures prevent app startup

## Permissions

### macOS Permissions

Required permissions:
- **Screen Recording** - Granted through System Preferences → Security & Privacy → Privacy → Screen Recording
- **Accessibility** - May be required for some capture scenarios

The Swift recorder automatically requests these permissions and provides clear error messages.

### Windows Permissions

Required permissions:
- **Graphics Capture** - Available on Windows 10 1903+ with compatible graphics drivers
- **Audio Capture** - Typically available by default

The C# recorder checks for API availability and provides diagnostic information.

## API Reference

### PlatformRecorder Class

#### Constructor
```javascript
const recorder = new PlatformRecorder();
```

#### Methods

##### `setCallbacks(callbacks)`
Set up event handlers for recorder output.

**Parameters:**
- `callbacks.onAudioData(Buffer)` - Handle audio data chunks
- `callbacks.onVideoFrame(Object)` - Handle video frame data
- `callbacks.onStatusUpdate(Object)` - Handle status messages
- `callbacks.onError(Object)` - Handle error messages

##### `async checkPermissions()`
Check if recording permissions are available.

**Returns:** `Promise<{granted: boolean, error?: string, response?: Object}>`

##### `async startRecording()`
Start screen and audio recording.

**Returns:** `Promise<boolean>` - Success status

##### `stopRecording()`
Stop active recording.

**Returns:** `boolean` - Success status

##### `isActive()`
Check if recording is currently active.

**Returns:** `boolean`

##### `getPlatformInfo()`
Get platform and recorder information.

**Returns:** `Object` with platform details

##### `cleanup()`
Clean up resources and stop recording.

## Output Formats

### Audio Data
- **Format:** Raw PCM float32 data
- **Sample Rate:** 16,000 Hz
- **Channels:** 1 (mono)
- **Delivery:** Real-time via `stdout` of recorder process

### Video Frames
- **Format:** Base64-encoded JPEG images
- **Resolution:** 320x180 pixels (configurable)
- **Frame Rate:** ~10 FPS
- **Delivery:** JSON messages via `stderr` of recorder process

### Status Messages
JSON objects sent via `stderr`:

```javascript
// Recording started
{ "code": "RECORDING_STARTED", "timestamp": "2024-01-01T12:00:00.000Z" }

// Recording stopped
{ "code": "RECORDING_STOPPED", "timestamp": "2024-01-01T12:05:00.000Z" }

// Video frame
{ "type": "VIDEO_FRAME", "imageData": "base64-encoded-jpeg-data" }

// Debug messages
{ "code": "DEBUG_INITIATE_RECORDING_CALLED" }
{ "code": "DEBUG_START_CAPTURE_SUCCESS" }
```

## Troubleshooting

### Common Issues

#### macOS
```bash
# Permission denied
Error: "Screen capture permission not granted"
Solution: Grant screen recording permission in System Preferences

# ScreenCaptureKit not available
Error: "ScreenCaptureKit not supported"
Solution: Upgrade to macOS 12.3 or later

# Build fails
Error: "Swift compiler not found"
Solution: Install Xcode or Swift toolchain
```

#### Windows
```powershell
# .NET not found
Error: ".NET 8 SDK is required but not found"
Solution: Install .NET 8 SDK from Microsoft

# Graphics capture not supported
Error: "Graphics capture not supported on this system"
Solution: Update Windows to version 1903 or later

# Build permission error
Error: "Execution of scripts is disabled"
Solution: Run with -ExecutionPolicy Bypass flag
```

### Debugging

Enable debug mode for additional logging:

```bash
npm run recorder:build:debug
```

Check platform compatibility:

```javascript
const recorder = new PlatformRecorder();
console.log(recorder.getPlatformInfo());
```

Test permissions separately:

```bash
# macOS
./src/swift/Recorder --check-permissions

# Windows
.\src\windows\bin\Release\net8.0-windows10.0.19041.0\win-x64\publish\Recorder.exe --check-permissions
```

## Contributing

When modifying the recorder system:

1. **Test on both platforms** if making cross-platform changes
2. **Update build scripts** if changing file paths or dependencies
3. **Maintain API compatibility** in `platform-recorder.js`
4. **Update this documentation** for any API or behavior changes

### Development Workflow

```bash
# Make changes to recorder source code
# Build and test
npm run recorder:build:clean

# Test with Electron
npm run electron:dev

# Package for distribution
npm run electron:package
``` 