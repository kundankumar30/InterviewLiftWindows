// clerk-service.js - Direct Clerk integration for Electron using JSDOM
console.log('🔧 [CLERK-SERVICE] Starting Clerk service initialization...');

let Clerk, JSDOM;
let dependenciesLoaded = false;

try {
  console.log('📦 [CLERK-SERVICE] Importing dependencies...');
  const clerkModule = require('@clerk/clerk-js');
  const jsdomModule = require('jsdom');
  
  Clerk = clerkModule.Clerk;
  JSDOM = jsdomModule.JSDOM;
  
  console.log('✅ [CLERK-SERVICE] Dependencies imported successfully');
  console.log('🔍 [CLERK-SERVICE] Clerk available:', !!Clerk);
  console.log('🔍 [CLERK-SERVICE] JSDOM available:', !!JSDOM);
  dependenciesLoaded = true;
} catch (error) {
  console.error('❌ [CLERK-SERVICE] Failed to import dependencies:', error);
  console.error('❌ [CLERK-SERVICE] Error stack:', error.stack);
  console.log('⚠️ [CLERK-SERVICE] Service will run in fallback mode');
  dependenciesLoaded = false;
}

let virtDom;
if (dependenciesLoaded) {
  console.log('🌐 [CLERK-SERVICE] Setting up virtual DOM...');

  // Mock window and document to load clerk successfully
  try {
    virtDom = new JSDOM();
    console.log('✅ [CLERK-SERVICE] Virtual DOM created');
  } catch (error) {
    console.error('❌ [CLERK-SERVICE] Failed to create virtual DOM:', error);
    dependenciesLoaded = false;
  }

  if (dependenciesLoaded) {
    try {
      global.window = virtDom.window;
      global.document = virtDom.window.document;
      console.log('✅ [CLERK-SERVICE] Global window and document set');
    } catch (error) {
      console.error('❌ [CLERK-SERVICE] Failed to set global window/document:', error);
      dependenciesLoaded = false;
    }
  }

  // Mock additional browser APIs that Clerk might need
  if (dependenciesLoaded) {
    try {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (Electron)',
        ...virtDom.window.navigator
      };

      global.location = virtDom.window.location;
      
      // Handle localStorage more gracefully
      try {
        global.localStorage = virtDom.window.localStorage;
        global.sessionStorage = virtDom.window.sessionStorage;
        console.log('✅ [CLERK-SERVICE] localStorage/sessionStorage set');
      } catch (storageError) {
        console.log('⚠️ [CLERK-SERVICE] localStorage not available in virtual DOM, creating fallback');
        // Create a fallback localStorage implementation
        global.localStorage = {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
          clear: () => {},
          length: 0,
          key: () => null
        };
        global.sessionStorage = {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
          clear: () => {},
          length: 0,
          key: () => null
        };
      }
      
      console.log('✅ [CLERK-SERVICE] Browser APIs mocked');
    } catch (error) {
      console.error('❌ [CLERK-SERVICE] Failed to mock browser APIs:', error);
      // Don't fail the entire dependency loading for this - Clerk might still work
      console.log('⚠️ [CLERK-SERVICE] Continuing with partial browser API support');
    }
  }
}

let clerk;
let isInitialized = false;
let initPromise = null;

// Try to load configuration
let appConfig = null;
try {
  console.log('📋 [CLERK-SERVICE] Loading app config...');
  appConfig = require('../config/app-config.js');
  console.log('✅ [CLERK-SERVICE] App config loaded');
} catch (error) {
  console.log('📋 [CLERK-SERVICE] Config file not found, using environment variables only');
}

// Get Clerk configuration with multiple fallbacks
const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
                             appConfig?.clerk?.publishableKey ||
                             process.env.CLERK_PUBLISHABLE_KEY || 
                             process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
                             null;

if (!CLERK_PUBLISHABLE_KEY) {
  console.error('❌ [CLERK-SERVICE] No Clerk publishable key found! Please set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable.');
  console.log('💡 [CLERK-SERVICE] You can get your key from: https://dashboard.clerk.com');
} else {
  console.log('🔑 [CLERK-SERVICE] Clerk key configured:', CLERK_PUBLISHABLE_KEY.substring(0, 20) + '...');
}

async function initClerk() {
  console.log('🚀 [CLERK-SERVICE] initClerk() called');
  
  if (!dependenciesLoaded) {
    console.error('❌ [CLERK-SERVICE] Dependencies not loaded, cannot initialize Clerk');
    throw new Error('Clerk dependencies not available');
  }
  
  if (!CLERK_PUBLISHABLE_KEY) {
    console.error('❌ [CLERK-SERVICE] No Clerk publishable key available, cannot initialize');
    throw new Error('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable not set');
  }
  
  if (isInitialized) {
    console.log('✅ [CLERK-SERVICE] Already initialized, returning existing instance');
    return clerk;
  }
  
  if (initPromise) {
    console.log('🔄 [CLERK-SERVICE] Initialization in progress, waiting...');
    return initPromise;
  }

  console.log('🔑 [CLERK-SERVICE] Initializing Clerk with key:', CLERK_PUBLISHABLE_KEY.substring(0, 20) + '...');

  initPromise = (async () => {
    try {
      console.log('🔨 [CLERK-SERVICE] Creating new Clerk instance...');
      clerk = new Clerk(CLERK_PUBLISHABLE_KEY);
      console.log('✅ [CLERK-SERVICE] Clerk instance created');
      
      console.log('⚙️ [CLERK-SERVICE] Loading Clerk with options...');
      await clerk.load({
        standardBrowser: false,
        appearance: {
          variables: {
            colorPrimary: '#4285F4'
          }
        }
      });

      isInitialized = true;
      console.log('[clerk-service] ✅ Clerk loaded successfully');

      // Add session listener
      console.log('👂 [CLERK-SERVICE] Adding session listener...');
      clerk.addListener(({ user, session }) => {
        if (!user) {
          console.log('[clerk-service] 👋 User logged out');
          global.currentUser = null;
          global.authToken = null;
          
          // Notify main process about logout
          if (global.authEventSender) {
            global.authEventSender.send('clerk-auth-logout');
          }
          return;
        }

        console.log('[clerk-service] 👤 User session updated:', user.primaryEmailAddress?.emailAddress);
      });

      console.log('✅ [CLERK-SERVICE] Session listener added');
      return clerk;
    } catch (error) {
      console.error('[clerk-service] ❌ Failed to initialize Clerk:', error);
      console.error('[clerk-service] ❌ Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      isInitialized = false;
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

async function getAuthToken() {
  console.log('[clerk-service] 🔍 Getting auth token from Clerk');
  
  if (!clerk || !isInitialized) {
    console.log('[clerk-service] 🔄 Clerk not ready, initializing...');
    await initClerk();
  }

  if (!clerk.session) {
    console.log('[clerk-service] ❌ No Clerk session available');
    return null;
  }

  try {
    console.log('[clerk-service] 🔑 Requesting token from session...');
    const token = await clerk.session.getToken();
    console.log('[clerk-service] ✅ Token retrieved successfully');
    return token;
  } catch (error) {
    console.error('[clerk-service] ❌ Failed to get token:', error);
    console.error('[clerk-service] ❌ Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return null;
  }
}

async function signInWithEmailAndPassword(email, password) {
  console.log('[clerk-service] 📧 Attempting email sign-in for:', email);
  
  try {
    if (!clerk || !isInitialized) {
      console.log('[clerk-service] 🔄 Initializing Clerk for email sign-in...');
      await initClerk();
    }

    console.log('[clerk-service] 🔐 Creating sign-in attempt...');
    const signInAttempt = await clerk.client.signIn.create({
      identifier: email,
      password: password,
    });

    console.log('[clerk-service] 📊 Sign-in attempt status:', signInAttempt.status);

    if (signInAttempt.status === 'complete') {
      console.log('[clerk-service] ✅ Sign-in complete, setting active session...');
      await clerk.setActive({ session: signInAttempt.createdSessionId });
      
      const user = clerk.user;
      console.log('[clerk-service] 👤 User object:', !!user);
      
      const userData = {
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        imageUrl: user.imageUrl
      };

      console.log('[clerk-service] ✅ Email sign-in successful:', userData.email);
      
      // Store globally
      global.currentUser = userData;
      global.authToken = await clerk.session.getToken();
      
      return { success: true, user: userData };
    } else {
      console.log('[clerk-service] ⚠️ Sign-in incomplete, status:', signInAttempt.status);
      return { success: false, error: 'Sign-in incomplete' };
    }
  } catch (error) {
    console.error('[clerk-service] ❌ Email sign-in failed:', error);
    console.error('[clerk-service] ❌ Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return { success: false, error: error.message || 'Sign-in failed' };
  }
}

async function signInWithGoogle() {
  console.log('[clerk-service] 🔍 Starting Google OAuth sign-in');
  
  try {
    if (!clerk || !isInitialized) {
      console.log('[clerk-service] 🔄 Initializing Clerk for Google sign-in...');
      await initClerk();
    }

    console.log('[clerk-service] 📧 For Electron apps, we recommend using email/password sign-in');
    console.log('[clerk-service] 🔍 However, attempting Google OAuth with external browser...');
    
    // For now, let's provide a helpful message and suggest email authentication
    // In production, this would need proper OAuth callback handling
    return { 
      success: false, 
      error: 'Google sign-in is currently being optimized for Electron apps. Please use email/password sign-in for now, or contact support for Google OAuth setup instructions.',
      suggestion: 'email'
    };
    
    // TODO: Implement full OAuth callback handling for production
    // This would require setting up a local server or custom protocol handler
    
  } catch (error) {
    console.error('[clerk-service] ❌ Google sign-in failed:', error);
    console.error('[clerk-service] ❌ Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return { success: false, error: error.message || 'Google sign-in failed' };
  }
}

async function handleOAuthCallback(params) {
  console.log('[clerk-service] 🔄 Handling OAuth callback');
  console.log('[clerk-service] 📊 Callback params:', params);
  
  try {
    if (!clerk || !isInitialized) {
      console.log('[clerk-service] 🔄 Initializing Clerk for OAuth callback...');
      await initClerk();
    }

    console.log('[clerk-service] 🔗 Processing redirect callback...');
    // Handle the OAuth callback
    await clerk.handleRedirectCallback(params);
    
    console.log('[clerk-service] 👤 Checking user and session...');
    if (clerk.user && clerk.session) {
      const user = clerk.user;
      const userData = {
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        imageUrl: user.imageUrl
      };

      console.log('[clerk-service] ✅ OAuth callback successful:', userData.email);
      
      // Store globally
      global.currentUser = userData;
      global.authToken = await clerk.session.getToken();
      
      return { success: true, user: userData };
    }

    console.error('[clerk-service] ❌ No user or session after OAuth callback');
    return { success: false, error: 'No user session after OAuth callback' };
  } catch (error) {
    console.error('[clerk-service] ❌ OAuth callback failed:', error);
    console.error('[clerk-service] ❌ Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return { success: false, error: error.message || 'OAuth callback failed' };
  }
}

async function getCurrentUser() {
  console.log('[clerk-service] 👤 Getting current user...');
  
  try {
    if (!clerk || !isInitialized) {
      console.log('[clerk-service] 🔄 Initializing Clerk to get current user...');
      await initClerk();
    }

    console.log('[clerk-service] 🔍 Checking for user in Clerk instance...');
    if (clerk.user) {
      const userData = {
        id: clerk.user.id,
        email: clerk.user.primaryEmailAddress?.emailAddress,
        firstName: clerk.user.firstName,
        lastName: clerk.user.lastName,
        fullName: clerk.user.fullName,
        imageUrl: clerk.user.imageUrl
      };
      
      console.log('[clerk-service] ✅ Current user found:', userData.email);
      return userData;
    }

    console.log('[clerk-service] ❌ No current user found');
    return null;
  } catch (error) {
    console.error('[clerk-service] ❌ Failed to get current user:', error);
    console.error('[clerk-service] ❌ Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return null;
  }
}

async function signOut() {
  console.log('[clerk-service] 👋 Signing out user...');
  
  try {
    if (clerk && isInitialized) {
      console.log('[clerk-service] 🔄 Calling Clerk sign out...');
      await clerk.signOut();
      console.log('[clerk-service] 👋 User signed out');
    }
    
    global.currentUser = null;
    global.authToken = null;
    
    console.log('[clerk-service] ✅ Sign out complete');
    return { success: true };
  } catch (error) {
    console.error('[clerk-service] ❌ Sign out failed:', error);
    console.error('[clerk-service] ❌ Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return { success: false, error: error.message };
  }
}

console.log('✅ [CLERK-SERVICE] Service module loaded successfully');

module.exports = {
  initClerk,
  getAuthToken,
  signInWithEmailAndPassword,
  signInWithGoogle,
  handleOAuthCallback,
  getCurrentUser,
  signOut,
  get clerk() { return clerk; }
}; 