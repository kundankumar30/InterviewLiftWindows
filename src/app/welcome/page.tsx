'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';

export default function WelcomePage() {
  const { user, isLoaded } = useUser();
  const [launching, setLaunching] = useState(false);

  const handleLaunchElectronApp = async () => {
    setLaunching(true);
    
    try {
      // Try to communicate with Electron app if it's running
      const response = await fetch('/api/launch-electron', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
          email: user?.emailAddresses[0]?.emailAddress,
          name: user?.firstName || user?.emailAddresses[0]?.emailAddress.split('@')[0]
        })
      }).catch(() => null);

      if (response?.ok) {
        // Electron app launched successfully
        window.close(); // Close the web browser tab
      } else {
        // Fallback: Show instructions to manually launch
        alert(`Welcome ${user?.firstName || 'User'}!\n\nTo continue with the full Interview Lift experience:\n\n1. Open Terminal\n2. Navigate to your project folder\n3. Run: npm run electron\n\nThis will launch the desktop app with real-time audio processing.`);
      }
    } catch (error) {
      // Fallback instructions
      alert(`Welcome ${user?.firstName || 'User'}!\n\nTo continue with the full Interview Lift experience:\n\n1. Open Terminal\n2. Navigate to your project folder\n3. Run: npm run electron\n\nThis will launch the desktop app with real-time audio processing.`);
    }
    
    setLaunching(false);
  };

  // Auto-launch electron app once user is authenticated
  useEffect(() => {
    if (isLoaded && user) {
      const timer = setTimeout(() => {
        handleLaunchElectronApp();
      }, 2000); // Wait 2 seconds to show welcome message

      return () => clearTimeout(timer);
    }
  }, [isLoaded, user]);

  // Show loading state while checking authentication
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full text-center">
            {/* Welcome Card */}
            <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
              <div className="mb-6">
                <div className="w-24 h-24 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">🚀</span>
                </div>
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                  Welcome to Interview Lift!
                </h1>
                <p className="text-xl text-gray-600">
                  Hello, {user?.firstName || user?.emailAddresses[0]?.emailAddress.split('@')[0]}! 👋
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h2 className="text-lg font-semibold text-blue-800 mb-3">
                  🖥️ Launching Desktop Experience
                </h2>
                <p className="text-blue-700 mb-4">
                  For the full Interview Lift experience with real-time audio processing and AI assistance, 
                  we're launching the desktop application.
                </p>
                
                {launching ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-3"></div>
                    <span className="text-blue-600">Launching desktop app...</span>
                  </div>
                ) : (
                  <button
                    onClick={handleLaunchElectronApp}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition duration-200 font-medium"
                  >
                    Launch Desktop App
                  </button>
                )}
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 text-sm">
                  <strong>Manual Launch:</strong> If the desktop app doesn't launch automatically, 
                  open Terminal and run <code className="bg-yellow-100 px-2 py-1 rounded">npm run electron</code>
                </p>
              </div>
            </div>

            {/* Features Preview */}
            <div className="grid md:grid-cols-3 gap-4 text-center">
              <div className="bg-white rounded-lg p-4 shadow-md">
                <div className="text-2xl mb-2">🎤</div>
                <h3 className="font-semibold text-gray-800">Real-time Audio</h3>
                <p className="text-sm text-gray-600">Live speech recognition</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-md">
                <div className="text-2xl mb-2">🤖</div>
                <h3 className="font-semibold text-gray-800">AI Assistant</h3>
                <p className="text-sm text-gray-600">Intelligent responses</p>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-md">
                <div className="text-2xl mb-2">🎯</div>
                <h3 className="font-semibold text-gray-800">Interview Ready</h3>
                <p className="text-sm text-gray-600">Overlay mode support</p>
              </div>
            </div>
          </div>
        </div>
      </SignedIn>
    </>
  );
} 