// App Configuration
// This file can be modified in packaged apps to configure API keys

module.exports = {
  // Clerk Authentication Configuration
  // Get your keys from: https://dashboard.clerk.com
  clerk: {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 
                   process.env.CLERK_PUBLISHABLE_KEY || 
                   process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
                   null // ⚠️ SET NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY IN YOUR ENVIRONMENT
  },
  
  // App Information
  app: {
    name: 'Interview Lift',
    version: '1.0.0',
    description: 'AI-Powered Real-Time Interview Support'
  },
  
  // Development vs Production
  isDevelopment: process.env.NODE_ENV === 'development',
  
  // API Configuration
  apis: {
    // Google Cloud Speech-to-Text
    googleCredentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || 
                          (require('electron').app ? 
                            (require('electron').app.isPackaged ? 
                              require('path').join(process.resourcesPath, 'stt.json') :
                              require('path').join(require('electron').app.getAppPath(), 'stt.json')
                            ) : 
                            './stt.json'
                          ),
    
    // AI Services
    openai: {
      apiKey: process.env.OPENAI_API_KEY || null
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || null
    },
    cerebras: {
      apiKey: process.env.CEREBRAS_API_KEY || null
    }
  }
}; 