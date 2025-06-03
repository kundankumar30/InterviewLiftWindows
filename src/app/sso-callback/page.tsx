'use client'
import { useEffect } from 'react'
import { useClerk } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function SSOCallback() {
  const { handleRedirectCallback } = useClerk()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Handle the OAuth callback
        await handleRedirectCallback()
        
        // Check if we need to redirect back to the app
        const redirectToApp = searchParams.get('redirect_to_app') === 'true'
        
        if (redirectToApp) {
          router.push('/app-login?redirect_to_app=true')
        } else {
          router.push('/welcome')
        }
      } catch (error) {
        console.error('SSO callback error:', error)
        // Redirect to sign-in with error parameter
        router.push('/sign-in?error=sso_failed')
      }
    }

    handleCallback()
  }, [handleRedirectCallback, router, searchParams])

  return (
    <div className="min-h-screen color-splash-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-3xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
          Interview Lift
        </div>
        <div className="flex items-center justify-center mb-4">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
        <h1 className="text-xl font-semibold text-white mb-2">
          Completing sign-in...
        </h1>
        <p className="text-white/80">
          Please wait while we complete your authentication.
        </p>
      </div>
    </div>
  )
} 