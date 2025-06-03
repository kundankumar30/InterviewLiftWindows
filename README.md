# 🚀 Interview Lift - Next.js + Electron

**AI-Powered Real-Time Interview Support for Global Job Seekers**

A revolutionary desktop application that provides live, contextual answers during job interviews to help candidates succeed in their career goals. Built with **Next.js + Electron**, Google Speech-to-Text, and Google Gemini AI.

> **Note:** This is the Next.js + Electron version of Interview Lift, combining the power of modern web technologies with desktop capabilities.

## 🌟 Features

### 🎤 **Real-Time Audio Processing**
- **Live Speech Recognition**: Captures and transcribes interview questions in real-time using Google Speech-to-Text v2 API
- **Voice Activity Detection (VAD)**: Intelligent filtering to process only speech, reducing API costs and improving accuracy
- **Multi-Platform Support**: Works on macOS and Windows with optimized audio capture

### 🤖 **Intelligent AI Assistance**
- **Contextual Responses**: Powered by Google Gemini 2.0 Flash with conversation history for relevant follow-up answers
- **Multi-Format Support**: Handles coding questions, behavioral questions, technical concepts, and more
- **Global Job Roles**: Customizable for any job position and skill set worldwide
- **Screenshot Analysis**: Can analyze interview questions from screenshots when needed

### 🎨 **Seamless User Experience**
- **Next.js Web Interface**: Modern React-based UI with server-side rendering
- **Electron Desktop Integration**: Native desktop features with web technologies
- **Transparent Overlay**: Unobtrusive interface that overlays on your screen during interviews
- **Click-Through Mode**: Allows interaction with interview platforms while keeping assistance visible
- **Adjustable Transparency**: Customizable opacity (0-150%) for optimal visibility

### ⚡ **Performance & Reliability**
- **Streaming Responses**: Real-time AI answer generation with live updates
- **Smart Caching**: Conversation history management for contextual understanding
- **Auto-Recovery**: Robust error handling and automatic restart capabilities
- **Optimized VAD**: Enhanced voice detection prevents word loss after resets

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- Google Cloud Speech-to-Text API credentials
- Google Gemini API key
- macOS 10.15+ or Windows 10+

### Installation & Developer Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/kundanplays/InterviewLift.git
   cd InterviewLift
   ```

2. **Install dependencies (automatically sets up FFmpeg)**
   ```bash
   npm install
   ```
   
   > **Note**: The `npm install` command automatically downloads and sets up FFmpeg for your platform via the postinstall script. No manual FFmpeg installation required!

3. **Alternative: Manual development setup**
   ```bash
   # If postinstall didn't work, run manual setup
   npm run dev-setup
   
   # Or just FFmpeg specifically
   npm run ffmpeg:download
   
   # Verify everything is working
   npm run verify-setup
   ```

4. **Set up API credentials**
   
   **Google Speech-to-Text Setup:**
   - Download your Google Cloud Speech-to-Text credentials JSON file
   - Rename it to `stt.json` and place it in the project root directory
   - The file should be in the same directory as `package.json`
   - **Important**: This file contains sensitive credentials and is automatically excluded from git
   
   **Example stt.json structure:** (see `stt.json.example` for reference)
   ```json
   {
     "type": "service_account",
     "project_id": "your-project-id", 
     "private_key": "-----BEGIN PRIVATE KEY-----\n...",
     "client_email": "your-service-account@project.iam.gserviceaccount.com"
   }
   ```
   
   **AI Service Setup:**
   - Create a `.env` file in the project root:
     ```env
     GEMINI_API_KEY=your_gemini_api_key_here
     ```

5. **Verify your setup**
   ```bash
   npm run verify-setup
   ```

6. **Run the application**
   
   **For Web Development:**
   ```bash
   npm run dev
   ```
   
   **For Electron Desktop App:**
   ```bash
   npm run electron
   ```

### 🔧 Developer Tools

- **`npm run dev-setup`** - Complete development environment setup
- **`npm run ffmpeg:check`** - Check if FFmpeg is available
- **`npm run ffmpeg:download`** - Download FFmpeg manually
- **`npm run ffmpeg:verify`** - Verify FFmpeg installation
- **`npm run verify-setup`** - Check all configurations
- **`npm run test:permissions`** - Test platform permissions

## 🎯 How to Use

### Web Version (Next.js)
1. **Development**: Run `npm run dev` and visit `http://localhost:3000`
2. **Build**: Run `npm run build` for production build
3. **Features**: View application information and documentation

### Desktop Version (Electron)
1. **Launch the app** and complete the welcome setup
2. **Enter your job role** (e.g., "Software Engineer", "Data Scientist", "Product Manager")
3. **Add key skills** (e.g., "Python, React, AWS", "Machine Learning, SQL")
4. **Grant permissions** for screen recording and microphone access

### During Interviews
1. **Position the overlay** where it won't interfere with your interview platform
2. **Start recording** - the app will listen for interview questions
3. **Get live answers** - AI responses appear in real-time as questions are asked
4. **Use contextual follow-ups** - the AI remembers previous questions for better context

### Keyboard Shortcuts
- `Cmd/Ctrl + B`: Toggle window visibility
- `Cmd/Ctrl + K`: Clear transcript and reset conversation
- `Cmd/Ctrl + H`: Take screenshot for question analysis
- `Cmd/Ctrl + L`: Toggle microphone mute
- `Cmd/Ctrl + Enter`: Generate solution from screenshots
- `Cmd/Ctrl + Q`: Quit application

## 🛠️ Technical Architecture

### Core Technologies
- **Frontend**: Next.js 15.3.3, React 19, TypeScript, Tailwind CSS
- **Desktop**: Electron 29.4.6 with Electron Forge
- **Backend**: Node.js with IPC communication
- **Speech Processing**: Google Speech-to-Text v2 with v1 fallback
- **AI Service**: Google Gemini integration with conversation history
- **Audio Capture**: Platform-specific audio recording (Swift for macOS)

### Project Structure
```
InterviewLift/
├── src/
│   ├── app/                 # Next.js app directory
│   │   ├── main.js         # Electron main process
│   │   ├── screens/        # Application screens
│   │   └── utils/          # Utility functions
│   ├── swift/              # Swift audio recording (macOS)
│   └── assets/             # Application assets
├── package.json            # Dependencies and scripts
├── forge.config.js         # Electron Forge configuration
└── README.md              # This file
```

### Available Scripts
- `npm run dev` - Start Next.js development server
- `npm run build` - Build Next.js for production
- `npm run start` - Start Next.js production server
- `npm run electron` - Start Electron desktop app
- `npm run electron:package` - Package Electron app
- `npm run electron:make` - Build distributables

## 🌍 Global Job Market Support

This application is designed to help job seekers worldwide across various industries:

### Supported Job Categories
- **Technology**: Software Engineering, Data Science, DevOps, Cybersecurity
- **Business**: Product Management, Marketing, Sales, Consulting
- **Finance**: Investment Banking, Financial Analysis, Accounting
- **Healthcare**: Medical, Nursing, Healthcare Administration
- **Education**: Teaching, Academic Research, Educational Technology
- **Creative**: Design, Content Creation, Digital Marketing
- **And many more...**

### Multi-Language Considerations
- Primary language: English (optimized for global job market)
- Speech recognition supports multiple accents and dialects
- Customizable for different regional job market requirements

## 🔒 Privacy & Ethics

### Privacy Features
- **Local Processing**: All audio processing happens locally when possible
- **Screen Protection**: Optional protection against screen recording
- **No Data Storage**: Conversation history is temporary and cleared on reset
- **Secure APIs**: Encrypted communication with Google services

### Ethical Usage
This tool is designed to:
- ✅ Help candidates prepare and practice for interviews
- ✅ Assist with technical knowledge recall during legitimate assessments
- ✅ Support non-native speakers in technical interviews
- ✅ Provide equal opportunities for candidates with different backgrounds

**Important**: Always ensure your usage complies with the interview guidelines and policies of the company you're interviewing with.

## 🤝 Contributing

We welcome contributions from the global developer community!

### Development Setup
```bash
# Clone and navigate
cd /Users/aarav/Desktop/InterviewLift

# Install dependencies
npm install

# Development mode (Next.js)
npm run dev

# Development mode (Electron)
npm run electron

# Build for production
npm run build
npm run electron:package
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: Report bugs or request features via GitHub Issues
- **Documentation**: Check the inline documentation and comments
- **Community**: Join discussions about interview preparation and career development

## 🙏 Acknowledgments

- Google Cloud Speech-to-Text for reliable speech recognition
- Google Gemini for intelligent AI responses
- Next.js team for the amazing React framework
- Electron community for cross-platform desktop development
- Open source contributors who make this project possible

---

**Made with ❤️ for job seekers worldwide. Good luck with your interviews! 🚀**

## 🔧 Development Notes

This version combines:
- **Next.js**: For modern web development with React, TypeScript, and Tailwind CSS
- **Electron**: For native desktop capabilities and system integration
- **Original Features**: All the AI-powered interview support features from the original app

The web interface provides information and documentation, while the Electron app provides the full desktop experience with real-time audio processing and AI assistance.
