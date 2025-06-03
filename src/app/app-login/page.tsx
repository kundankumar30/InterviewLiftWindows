'use client'
import { useEffect, useState, Suspense } from 'react'
import { useClerk, useSignIn } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { getAppRedirectUrl } from '../../utils/app-auth'

function AppLoginContent() {
  const { isLoaded, signIn, setActive } = useSignIn()
  const { session } = useClerk()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [error, setError] = useState('')
  
  // Check if we need to redirect back to the app
  const redirectToApp = searchParams.get('redirect_to_app') === 'true'
  
  useEffect(() => {
    if (!isLoaded) return
    
    // If user is already signed in and we have a token
    const handleExistingSession = async () => {
      try {
        if (session && redirectToApp) {
          setIsRedirecting(true)
          
          // Get the token from the current session
          const token = await session.getToken()
          
          // Redirect back to the app with the token using our utility function
          if (token) {
            const redirectUrl = getAppRedirectUrl(token)
            window.location.href = redirectUrl
          } else {
            throw new Error('Failed to get authentication token')
          }
        } else if (!redirectToApp) {
          // If not coming from the app, just redirect to home
          router.push('/')
        } else {
          // If coming from app but not signed in, redirect to sign-in page
          // with a parameter to indicate we need to redirect back to app
          router.push('/sign-in?redirect_to_app=true')
        }
      } catch (error) {
        console.error('Error handling app login:', error)
        setError('Failed to authenticate. Please try again.')
      }
    }
    
    handleExistingSession()
  }, [isLoaded, session, redirectToApp, router])
  
  return (
    <div className="min-h-screen color-splash-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-3xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
          Interview Lift
        </div>
        <div className="flex items-center justify-center mb-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          {isRedirecting ? 'Redirecting to app...' : 'Processing authentication...'}
        </h1>
        <p className="text-gray-600">
          {error || "Please wait while we authenticate you."}
        </p>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="min-h-screen color-splash-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-3xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
          Interview Lift
        </div>
        <div className="flex items-center justify-center mb-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Loading...
        </h1>
        <p className="text-gray-600">
          Please wait while we prepare your authentication.
        </p>
      </div>
    </div>
  )
}

export default function AppLogin() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AppLoginContent />
    </Suspense>
  )
} 