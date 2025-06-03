# 🔧 Developer Setup Guide

This guide helps developers set up Interview Lift for development quickly and efficiently.

## 🚀 Quick Start for Developers

### 1. Clone and Install
```bash
git clone https://github.com/kundanplays/InterviewLift.git
cd InterviewLift
npm install  # Automatically sets up FFmpeg via postinstall
```

### 2. Verify Setup
```bash
npm run verify-setup
```

### 3. Start Development
```bash
npm run electron  # Start the Electron app
# OR
npm run dev       # Start Next.js web version
```

## 📦 Automatic FFmpeg Setup

Interview Lift automatically handles FFmpeg installation for developers:

- **Automatic**: FFmpeg downloads during `npm install` (postinstall script)
- **Manual**: Run `npm run dev-setup` if automatic setup fails
- **Verification**: Use `npm run ffmpeg:check` to verify FFmpeg is available

### Platform-Specific FFmpeg Handling

| Platform | FFmpeg Source | Location | Notes |
|----------|---------------|----------|-------|
| **Windows** | Gyan.dev builds | `bin/ffmpeg.exe` | Essential format support |
| **macOS** | Evermeet builds | `bin/ffmpeg` | Optimized for macOS |
| **Linux** | John Van Sickle | `bin/ffmpeg` | Static builds |

## 🔍 Development Commands

### FFmpeg Management
```bash
npm run ffmpeg:check      # Check if FFmpeg exists
npm run ffmpeg:download   # Download FFmpeg manually
npm run ffmpeg:verify     # Test FFmpeg functionality
npm run ffmpeg:ensure     # Download if missing
```

### Environment Setup
```bash
npm run dev-setup         # Complete dev environment setup
npm run verify-setup      # Check all configurations
npm run test:permissions  # Test platform permissions
```

### Application Commands
```bash
npm run electron         # Start Electron app (with FFmpeg check)
npm run electron:dev     # Development mode with debugging
npm run electron:package # Package the app
npm run dev              # Next.js web development
```

## 🔐 API Credentials Setup

### Required Files

1. **`stt.json`** (Google Speech-to-Text)
   ```json
   {
     "type": "service_account",
     "project_id": "your-project-id",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...",
     "client_email": "your-service@project.iam.gserviceaccount.com"
   }
   ```

2. **`.env`** (AI Services)
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   OPENAI_API_KEY=your_openai_key_here  # Optional
   CEREBRAS_API_KEY=your_cerebras_key   # Optional
   ```

### Security Notes
- `stt.json` is automatically excluded from git (.gitignore)
- Never commit real API keys to the repository
- Use `stt.json.example` as a template

## 🖥️ Platform-Specific Setup

### Windows Development
```bash
# FFmpeg is automatically downloaded for Windows
npm install
npm run ffmpeg:check  # Should show: ✅ FFmpeg exists at bin/ffmpeg.exe

# If issues occur:
npm run dev-setup
```

### macOS Development
```bash
# FFmpeg + Swift recorder setup
npm install
npm run swift:make    # Compile Swift audio recorder
npm run verify-setup  # Check everything
```

### Linux Development
```bash
# FFmpeg auto-download + manual permissions
npm install
sudo apt-get install portaudio19-dev  # If needed for audio
npm run verify-setup
```

## 🔧 Troubleshooting

### Common Issues

#### "FFmpeg not found" Error
```bash
# Solution 1: Re-run setup
npm run dev-setup

# Solution 2: Manual download
npm run ffmpeg:download

# Solution 3: Check system FFmpeg
ffmpeg -version  # If this works, system FFmpeg is available
```

#### "Permission denied" on Windows
```bash
# Run as Administrator or check antivirus settings
# Ensure bin/ directory is writable
```

#### Swift Recorder Issues (macOS)
```bash
# Recompile Swift recorder
npm run swift:make

# Check Xcode command line tools
xcode-select --install
```

### Debug Information

#### Get FFmpeg Status
```bash
npm run ffmpeg:check
# Expected output: ✅ FFmpeg exists at [path]
```

#### Get Detailed Setup Status
```bash
npm run verify-setup
# Shows all configurations and potential issues
```

#### Test Platform Permissions
```bash
npm run test:permissions
# Tests microphone, screen recording, and audio access
```

## 📁 Development File Structure

```
InterviewLift/
├── bin/                    # FFmpeg binaries (auto-downloaded)
│   ├── ffmpeg.exe         # Windows FFmpeg
│   └── ffmpeg             # macOS/Linux FFmpeg
├── scripts/
│   ├── download-ffmpeg.js         # FFmpeg download logic
│   ├── setup-dev-environment.js   # Full dev setup
│   └── verify-setup.js           # Setup verification
├── src/
│   ├── electron/
│   │   └── utils/
│   │       ├── windows_audio_recorder.js  # Windows audio capture
│   │       └── recording.js              # Cross-platform recording
│   └── swift/
│       └── Recorder              # macOS audio recorder (compiled)
├── stt.json               # Google credentials (not in git)
├── .env                   # Environment variables (not in git)
└── package.json           # Scripts and dependencies
```

## 🎯 Development Workflow

### First Time Setup
1. `git clone` the repository
2. `npm install` (auto-sets up FFmpeg)
3. Add `stt.json` and `.env` files
4. `npm run verify-setup` to check everything
5. `npm run electron` to start development

### Daily Development
1. `npm run electron` (starts with automatic checks)
2. Make changes to source files
3. Electron auto-reloads on file changes
4. Use browser dev tools for debugging

### Before Committing
1. `npm run verify-setup` to ensure nothing broke
2. Test on your target platform
3. Ensure no sensitive files are committed

## 🆘 Getting Help

If you encounter issues:
1. Run `npm run verify-setup` for detailed status
2. Check the console output for specific error messages
3. Ensure your platform is supported (Windows 10+, macOS 10.15+)
4. Verify your API credentials are valid
5. Try running `npm run dev-setup` to reset everything 