import Image from "next/image";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white shadow-lg rounded-lg p-8 max-w-4xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            🚀 Interview Lift
          </h1>
          <p className="text-xl text-gray-600 mb-4">
            AI-Powered Real-Time Interview Support for Global Job Seekers
          </p>
          
          {/* Action Button for authenticated users */}
          <SignedIn>
            <div className="flex justify-center mb-6">
              <Link href="/welcome">
                <button className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-200 font-medium text-lg">
                  Go to Dashboard
                </button>
              </Link>
            </div>
          </SignedIn>

          {/* Sign-in options for non-authenticated users */}
          <SignedOut>
            <div className="mb-6">
              <p className="text-lg text-gray-600 mb-6">
                Sign in to get started with your AI-powered interview assistant
              </p>
              
              {/* Sign-in buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                {/* Gmail Sign-in */}
                <SignInButton 
                  mode="modal"
                  forceRedirectUrl="/welcome"
                >
                  <button className="flex items-center justify-center px-6 py-3 bg-white border-2 border-gray-300 rounded-lg hover:border-gray-400 hover:shadow-md transition duration-200 font-medium text-gray-700 min-w-[200px]">
                    <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Gmail
                  </button>
                </SignInButton>

                {/* Or divider */}
                <div className="flex items-center">
                  <span className="text-gray-400 text-sm">or</span>
                </div>

                {/* Regular Sign-in */}
                <SignInButton 
                  mode="modal"
                  forceRedirectUrl="/welcome"
                >
                  <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200 font-medium min-w-[200px]">
                    Sign in with Email
                  </button>
                </SignInButton>
              </div>

              {/* Additional info */}
              <div className="mt-4 text-sm text-gray-500">
                <p>No account needed - sign up during the sign-in process</p>
              </div>
            </div>
          </SignedOut>
          
          <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-6">
            <p className="text-yellow-800">
              <strong>Note:</strong> This is the Next.js web version. For the full desktop experience with real-time audio processing, 
              please use the Electron application by running <code className="bg-gray-200 px-2 py-1 rounded">npm run electron</code>
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-semibold mb-4">🌟 Features</h2>
            <ul className="space-y-3">
              <li className="flex items-start">
                <span className="text-green-500 mr-2">🎤</span>
                <div>
                  <strong>Real-Time Audio Processing:</strong> Live speech recognition with Google Speech-to-Text
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-blue-500 mr-2">🤖</span>
                <div>
                  <strong>Intelligent AI Assistance:</strong> Powered by Google Gemini 2.0 Flash
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-purple-500 mr-2">🎨</span>
                <div>
                  <strong>Seamless UX:</strong> Transparent overlay with click-through mode
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-red-500 mr-2">⚡</span>
                <div>
                  <strong>Performance:</strong> Streaming responses with smart caching
                </div>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-semibold mb-4">🚀 Quick Start</h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">For Desktop App:</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Set up API credentials (Google Speech & Gemini)</li>
                <li>Run <code className="bg-gray-200 px-1 rounded">npm run electron</code></li>
                <li>Grant microphone permissions</li>
                <li>Enter job role and skills</li>
                <li>Start your interview support!</li>
              </ol>
            </div>

            <div className="mt-4">
              <h3 className="font-semibold mb-2">⌨️ Keyboard Shortcuts:</h3>
              <div className="text-sm space-y-1">
                <div><kbd className="bg-gray-200 px-2 py-1 rounded">⌘ + B</kbd> Toggle visibility</div>
                <div><kbd className="bg-gray-200 px-2 py-1 rounded">⌘ + K</kbd> Clear transcript</div>
                <div><kbd className="bg-gray-200 px-2 py-1 rounded">⌘ + H</kbd> Take screenshot</div>
                <div><kbd className="bg-gray-200 px-2 py-1 rounded">⌘ + Q</kbd> Quit application</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">🌍 Global Job Market Support</h2>
          <p className="text-gray-700 mb-4">
            This application supports job seekers worldwide across various industries:
          </p>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <strong>Technology:</strong> Software Engineering, Data Science, DevOps, Cybersecurity
            </div>
            <div>
              <strong>Business:</strong> Product Management, Marketing, Sales, Consulting
            </div>
            <div>
              <strong>Finance:</strong> Investment Banking, Financial Analysis, Accounting
            </div>
          </div>
        </div>

        <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="text-lg font-semibold text-green-800 mb-2">🔒 Privacy & Ethics</h3>
          <p className="text-green-700 text-sm">
            This tool is designed to help candidates prepare and practice for interviews, assist with technical knowledge recall, 
            and support non-native speakers in technical interviews. Always ensure your usage complies with the interview 
            guidelines and policies of the company you're interviewing with.
          </p>
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-600">
            Made with ❤️ for job seekers worldwide. Good luck with your interviews! 🚀
          </p>
        </div>
      </div>
    </div>
  );
}
