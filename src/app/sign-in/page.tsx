'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSignIn, useClerk } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

console.log('🚀 [SIGN-IN] Sign-in page module loaded');

// Global error boundary for the component
const withErrorBoundary = (Component: React.ComponentType<any>) => {
  return function ErrorBoundaryWrapper(props: any) {
    useEffect(() => {
      const handleError = (event: ErrorEvent) => {
        console.error('❌ [SIGN-IN] Global error caught:', event.error);
        console.error('❌ [SIGN-IN] Error details:', {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error
        });
      };

      const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        console.error('❌ [SIGN-IN] Unhandled promise rejection:', event.reason);
      };

      window.addEventListener('error', handleError);
      window.addEventListener('unhandledrejection', handleUnhandledRejection);

      return () => {
        window.removeEventListener('error', handleError);
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      };
    }, []);

    return <Component {...props} />;
  };
};

function SignInContent() {
  console.log('🔄 [SIGN-IN] SignInContent component rendering');
  
  const { isLoaded, signIn, setActive } = useSignIn()
  const { session } = useClerk()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [authStatus, setAuthStatus] = useState({ message: '', type: '', show: false })
  
  const redirectToApp = searchParams.get('redirect_to_app') === 'true'
  
  console.log('📊 [SIGN-IN] Component state:', {
    isLoaded,
    hasSignIn: !!signIn,
    hasSession: !!session,
    redirectToApp,
    isLoading,
    showEmailForm,
    email: email ? `${email.substring(0, 3)}***` : '',
    hasPassword: !!password
  });

  // Monitor Clerk loading state
  useEffect(() => {
    console.log('🔍 [SIGN-IN] Clerk loading state changed:', { isLoaded, signIn: !!signIn });
    
    if (!isLoaded) {
      console.log('⏳ [SIGN-IN] Clerk still loading...');
    } else {
      console.log('✅ [SIGN-IN] Clerk is loaded');
      if (!signIn) {
        console.error('❌ [SIGN-IN] signIn object not available after loading');
      }
    }
  }, [isLoaded, signIn]);

  // Monitor session changes
  useEffect(() => {
    console.log('👤 [SIGN-IN] Session state changed:', { 
      hasSession: !!session, 
      sessionId: session?.id?.substring(0, 8) + '...' || 'none'
    });
  }, [session]);

  useEffect(() => {
    console.log('🔄 [SIGN-IN] Checking redirect conditions:', {
      isLoaded,
      hasSession: !!session,
      redirectToApp
    });

    // If user is already signed in, redirect appropriately
    if (isLoaded && session) {
      console.log('🚀 [SIGN-IN] User already signed in, redirecting...');
      if (redirectToApp) {
        console.log('📱 [SIGN-IN] Redirecting to app-login');
        router.push('/app-login?redirect_to_app=true')
      } else {
        console.log('🏠 [SIGN-IN] Redirecting to welcome');
        router.push('/welcome')
      }
    }
  }, [isLoaded, session, redirectToApp, router])

  const showAuthStatus = (message: string, type: 'success' | 'error' | 'loading' | 'warning' | 'info') => {
    console.log(`📢 [SIGN-IN] Showing auth status: [${type}] ${message}`);
    setAuthStatus({ message, type, show: true })
  }

  const clearAuthStatus = () => {
    console.log('🧹 [SIGN-IN] Clearing auth status');
    setAuthStatus({ message: '', type: '', show: false })
  }

  const setButtonLoading = (buttonId: string, loading: boolean) => {
    console.log(`🔄 [SIGN-IN] Setting button loading: ${buttonId} = ${loading}`);
    setIsLoading(loading)
  }

  const handleGoogleSignIn = async () => {
    console.log('🔍 [SIGN-IN] Google sign-in requested');
    
    if (!isLoaded || !signIn) {
      console.error('❌ [SIGN-IN] Clerk not ready for Google sign-in', { isLoaded, signIn: !!signIn });
      return;
    }

    setIsLoading(true)
    clearAuthStatus()
    showAuthStatus('Signing in with Gmail...', 'loading')

    try {
      console.log('🌐 [SIGN-IN] Starting Google OAuth redirect...');
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: redirectToApp ? '/app-login?redirect_to_app=true' : '/welcome'
      })
      console.log('✅ [SIGN-IN] Google OAuth redirect initiated');
    } catch (err: any) {
      console.error('❌ [SIGN-IN] Google sign-in failed:', err);
      console.error('❌ [SIGN-IN] Error details:', {
        name: err.name,
        message: err.message,
        errors: err.errors
      });
      showAuthStatus(err.errors?.[0]?.message || 'Gmail sign-in failed. Please try again.', 'error')
      setIsLoading(false)
    }
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('📧 [SIGN-IN] Email sign-in requested:', { 
      email: email ? `${email.substring(0, 3)}***` : '',
      hasPassword: !!password
    });
    
    if (!isLoaded || !signIn || !email || !password) {
      console.warn('⚠️ [SIGN-IN] Email sign-in validation failed:', {
        isLoaded, 
        signIn: !!signIn, 
        email: !!email, 
        password: !!password
      });
      return;
    }

    setIsLoading(true)
    clearAuthStatus()
    showAuthStatus('Signing in...', 'loading')

    try {
      console.log('🔐 [SIGN-IN] Creating sign-in attempt...');
      const result = await signIn.create({
        identifier: email,
        password: password,
      })

      console.log('📊 [SIGN-IN] Sign-in result:', { 
        status: result.status,
        sessionId: result.createdSessionId?.substring(0, 8) + '...' || 'none'
      });

      if (result.status === 'complete') {
        console.log('✅ [SIGN-IN] Sign-in complete, setting active session...');
        await setActive({ session: result.createdSessionId })
        showAuthStatus('✅ Authentication successful! Loading...', 'success')
        
        setTimeout(() => {
          console.log('🚀 [SIGN-IN] Redirecting after successful auth...');
          if (redirectToApp) {
            console.log('📱 [SIGN-IN] Redirecting to app-login');
            router.push('/app-login?redirect_to_app=true')
          } else {
            console.log('🏠 [SIGN-IN] Redirecting to welcome');
            router.push('/welcome')
          }
        }, 1000)
      } else {
        console.warn('⚠️ [SIGN-IN] Sign-in incomplete:', result.status);
        showAuthStatus('Sign-in incomplete. Please try again.', 'error')
        setIsLoading(false)
      }
    } catch (err: any) {
      console.error('❌ [SIGN-IN] Email sign-in failed:', err);
      console.error('❌ [SIGN-IN] Error details:', {
        name: err.name,
        message: err.message,
        errors: err.errors
      });
      showAuthStatus(err.errors?.[0]?.message || 'Sign-in failed. Please try again.', 'error')
      setIsLoading(false)
    }
  }

  const toggleEmailForm = () => {
    console.log(`🔄 [SIGN-IN] Toggling email form: ${!showEmailForm}`);
    setShowEmailForm(!showEmailForm)
    clearAuthStatus()
  }

  if (!isLoaded) {
    console.log('⏳ [SIGN-IN] Rendering loading state...');
    return (
      <div style={styles.body}>
        <div style={styles.loginContainer}>
          <div style={styles.logo}>🚀</div>
          <h1 style={styles.h1}>Interview Lift</h1>
          <div style={{ ...styles.authStatus, ...styles.authStatusLoading, display: 'block' }}>
            Loading authentication...
          </div>
        </div>
      </div>
    )
  }

  console.log('✅ [SIGN-IN] Rendering main sign-in form...');
  return (
    <div style={styles.body}>
      <div style={styles.loginContainer}>
        <div style={styles.logo}>🚀</div>
        <h1 style={styles.h1}>Interview Lift</h1>
        <p style={styles.subtitle}>
          AI-Powered Real-Time Interview Support<br />for Global Job Seekers
        </p>
        
        <div style={styles.authContainer}>
          {/* Gmail OAuth Button */}
          <button 
            style={{
              ...styles.authBtn,
              ...styles.authBtnPrimary,
              ...(isLoading ? styles.authBtnDisabled : {})
            }}
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            <svg style={styles.authBtnSvg} viewBox="0 0 24 24">
              <path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Continue with Gmail</span>
          </button>

          <div style={styles.divider}>
            <span>or</span>
          </div>

          {/* Email/Password Sign In Button */}
          <button 
            style={styles.authBtn}
            onClick={toggleEmailForm}
          >
            <svg fill="currentColor" viewBox="0 0 24 24" style={styles.authBtnSvg}>
              <path d={showEmailForm ? "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" : "M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"}/>
            </svg>
            <span>{showEmailForm ? 'Hide Email Form' : 'Sign in with Email'}</span>
          </button>

          {/* Email/Password Form */}
          <div style={{
            ...styles.clerkSigninForm,
            ...(showEmailForm ? styles.clerkSigninFormActive : {})
          }}>
            <form onSubmit={handleEmailSignIn}>
              <div style={styles.formGroup}>
                <label style={styles.formGroupLabel} htmlFor="email">Email Address</label>
                <input 
                  style={styles.formGroupInput}
                  type="email" 
                  id="email" 
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => {
                    console.log(`📝 [SIGN-IN] Email input changed: ${e.target.value ? `${e.target.value.substring(0, 3)}***` : ''}`);
                    setEmail(e.target.value);
                  }}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formGroupLabel} htmlFor="password">Password</label>
                <input 
                  style={styles.formGroupInput}
                  type="password" 
                  id="password" 
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    console.log(`🔐 [SIGN-IN] Password input changed: ${e.target.value ? '***' : ''}`);
                    setPassword(e.target.value);
                  }}
                />
              </div>
              <button 
                type="submit"
                style={{
                  ...styles.authBtn,
                  ...styles.authBtnPrimary,
                  marginTop: '16px',
                  ...(isLoading || !email || !password ? styles.authBtnDisabled : {})
                }}
                disabled={isLoading || !email || !password}
              >
                {isLoading ? <Loader2 style={{ width: '20px', height: '20px', animation: 'spin 1s linear infinite' }} /> : 'Sign In'}
              </button>
              <button 
                type="button"
                style={{
                  ...styles.authBtn,
                  marginTop: '8px'
                }}
                onClick={toggleEmailForm}
              >
                Back
              </button>
            </form>
          </div>

          {/* Authentication Status */}
          {authStatus.show && (
            <div style={{
              ...styles.authStatus,
              ...styles[`authStatus${authStatus.type.charAt(0).toUpperCase() + authStatus.type.slice(1)}` as keyof typeof styles],
              display: 'block'
            }}>
              {authStatus.message}
            </div>
          )}
        </div>

        <div style={styles.note}>
          <strong>Desktop Experience:</strong> This Electron app provides real-time audio processing and AI assistance for your interviews.
        </div>

        <div style={styles.features}>
          <div style={styles.feature}>
            <div style={styles.featureIcon}>🎤</div>
            <div>Real-time speech recognition</div>
          </div>
          <div style={styles.feature}>
            <div style={styles.featureIcon}>🤖</div>
            <div>AI-powered suggestions</div>
          </div>
          <div style={styles.feature}>
            <div style={styles.featureIcon}>🎨</div>
            <div>Transparent overlay</div>
          </div>
          <div style={styles.feature}>
            <div style={styles.featureIcon}>⚡</div>
            <div>Lightning fast responses</div>
          </div>
        </div>

        <div style={styles.poweredBy}>
          Powered by Clerk Authentication
        </div>
      </div>
    </div>
  )
}

const styles = {
  body: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    margin: 0,
  },
  loginContainer: {
    background: 'white',
    borderRadius: '20px',
    padding: '40px',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
    maxWidth: '500px',
    width: '100%',
    textAlign: 'center' as const,
  },
  logo: {
    width: '80px',
    height: '80px',
    margin: '0 auto 20px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '36px',
  },
  h1: {
    color: '#333',
    marginBottom: '10px',
    fontSize: '32px',
    fontWeight: '700',
  },
  subtitle: {
    color: '#666',
    marginBottom: '30px',
    fontSize: '16px',
    lineHeight: '1.5',
  },
  authContainer: {
    marginBottom: '30px',
  },
  authBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px 24px',
    borderRadius: '12px',
    border: '2px solid #e0e0e0',
    background: 'white',
    color: '#333',
    textDecoration: 'none',
    fontWeight: '600',
    fontSize: '16px',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    minHeight: '56px',
    width: '100%',
    marginBottom: '0',
  },
  authBtnPrimary: {
    background: '#4285F4',
    color: 'white',
    borderColor: '#4285F4',
  },
  authBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  authBtnSvg: {
    width: '20px',
    height: '20px',
    marginRight: '12px',
  },
  divider: {
    margin: '16px 0',
    textAlign: 'center' as const,
    color: '#999',
    fontSize: '14px',
    position: 'relative' as const,
  },
  clerkSigninForm: {
    display: 'none',
    marginTop: '20px',
    padding: '20px',
    borderRadius: '12px',
    background: '#f8f9ff',
    border: '1px solid #e0e7ff',
  },
  clerkSigninFormActive: {
    display: 'block',
  },
  formGroup: {
    marginBottom: '16px',
    textAlign: 'left' as const,
  },
  formGroupLabel: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: '600',
    color: '#333',
    fontSize: '14px',
  },
  formGroupInput: {
    width: '100%',
    padding: '12px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    fontSize: '16px',
    transition: 'border-color 0.2s ease',
    outline: 'none',
  },
  authStatus: {
    marginTop: '20px',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    display: 'none',
  },
  authStatusSuccess: {
    background: '#d1fae5',
    color: '#065f46',
    border: '1px solid #a7f3d0',
  },
  authStatusError: {
    background: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #fca5a5',
  },
  authStatusLoading: {
    background: '#dbeafe',
    color: '#1e40af',
    border: '1px solid #93c5fd',
  },
  authStatusWarning: {
    background: '#fef3c7',
    color: '#92400e',
    border: '1px solid #fbbf24',
  },
  authStatusInfo: {
    background: '#e0f2fe',
    color: '#0369a1',
    border: '1px solid #67e8f9',
  },
  note: {
    background: '#f8f9ff',
    border: '1px solid #e0e7ff',
    borderRadius: '12px',
    padding: '16px',
    marginTop: '20px',
    fontSize: '14px',
    color: '#5c6bc0',
  },
  features: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginTop: '30px',
    textAlign: 'left' as const,
  },
  feature: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    fontSize: '13px',
    color: '#666',
  },
  featureIcon: {
    width: '16px',
    height: '16px',
    marginTop: '1px',
    flexShrink: 0,
  },
  poweredBy: {
    marginTop: '20px',
    fontSize: '12px',
    color: '#999',
  },
}

function LoadingFallback() {
  console.log('⏳ [SIGN-IN] LoadingFallback component rendered');
  
  useEffect(() => {
    console.log('⏳ [SIGN-IN] LoadingFallback mounted, waiting for Suspense to resolve');
    return () => {
      console.log('⏳ [SIGN-IN] LoadingFallback unmounted');
    };
  }, []);
  
  return (
    <div style={styles.body}>
      <div style={styles.loginContainer}>
        <div style={styles.logo}>🚀</div>
        <h1 style={styles.h1}>Interview Lift</h1>
        <div style={{ ...styles.authStatus, ...styles.authStatusLoading, display: 'block' }}>
          Loading authentication...
        </div>
      </div>
    </div>
  )
}

export default function SignIn() {
  console.log('🚀 [SIGN-IN] Main SignIn component rendered');
  
  useEffect(() => {
    console.log('🚀 [SIGN-IN] Main SignIn component mounted');
    console.log('🔍 [SIGN-IN] Environment check:', {
      isDev: process.env.NODE_ENV === 'development',
      hasWindow: typeof window !== 'undefined',
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'N/A'
    });
    
    return () => {
      console.log('🚀 [SIGN-IN] Main SignIn component unmounted');
    };
  }, []);
  
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SignInContent />
    </Suspense>
  )
} 