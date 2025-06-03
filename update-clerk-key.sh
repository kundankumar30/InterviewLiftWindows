#!/bin/bash

# Update Clerk Key and Rebuild App

echo "🔑 Clerk Key Update Script"
echo "========================="
echo ""

# Check if key is provided
if [ -z "$1" ]; then
    echo "❌ Usage: $0 <your-new-clerk-publishable-key>"
    echo ""
    echo "📋 Steps to get your key:"
    echo "1. Visit: https://dashboard.clerk.com"
    echo "2. Create new app or refresh existing keys"
    echo "3. Copy the Publishable Key (pk_test_...)"
    echo "4. Run: $0 pk_test_your_new_key_here"
    echo ""
    exit 1
fi

NEW_KEY="$1"

# Validate key format
if [[ ! "$NEW_KEY" =~ ^pk_test_ ]]; then
    echo "❌ Error: Key should start with 'pk_test_'"
    echo "💡 Make sure you're using the Publishable Key, not Secret Key"
    exit 1
fi

echo "🔄 Updating Clerk key in app configuration..."

# Update the key in app-config.js
sed -i '' "s/publishableKey: 'PLEASE_SET_YOUR_NEW_CLERK_KEY'/publishableKey: '$NEW_KEY'/" src/electron/config/app-config.js

echo "✅ Key updated successfully!"
echo ""
echo "🔨 Rebuilding app with new authentication..."

# Rebuild the app
npm run electron:package

if [ $? -eq 0 ]; then
    echo ""
    echo "📦 Recreating installers..."
    
    # Recreate the system installer
    ./create-installer-dmg.sh
    
    # Move to installers directory
    mv Interview-Lift-Installer-1.0.0.dmg installers/
    
    echo ""
    echo "✅ App rebuilt successfully with new Clerk key!"
    echo ""
    echo "🎯 Updated files:"
    echo "   - App: out/interview-lift-darwin-arm64/interview-lift.app"
    echo "   - Installer: installers/Interview-Lift-Installer-1.0.0.dmg"
else
    echo "❌ Build failed. Please check for errors above."
    exit 1
fi 