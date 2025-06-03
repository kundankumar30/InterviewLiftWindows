import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ 
        authenticated: false,
        user: null 
      });
    }

    const user = await currentUser();
    
    if (!user) {
      return NextResponse.json({ 
        authenticated: false,
        user: null 
      });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress,
        name: user.firstName || user.emailAddresses[0]?.emailAddress.split('@')[0],
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl
      }
    });

  } catch (error) {
    console.error('Auth status check error:', error);
    return NextResponse.json(
      { 
        authenticated: false,
        user: null,
        error: 'Failed to check authentication status'
      },
      { status: 500 }
    );
  }
} 