#!/bin/bash

# Interview Lift - System Installation Script
# This script properly installs Interview Lift as a standalone system app

echo "🚀 Installing Interview Lift to your system..."
echo ""

# Set paths
SOURCE_APP="out/interview-lift-darwin-arm64/interview-lift.app"
DEST_APP="/Applications/Interview Lift.app"
TEMP_APP="/tmp/interview-lift.app"

# Check if source app exists
if [ ! -d "$SOURCE_APP" ]; then
    echo "❌ Error: Source app not found at $SOURCE_APP"
    echo "Please run: npm run electron:package first"
    exit 1
fi

echo "📦 Found Interview Lift app..."

# Remove existing installation if it exists
if [ -d "$DEST_APP" ]; then
    echo "🗑️  Removing existing installation..."
    sudo rm -rf "$DEST_APP"
fi

# Copy to temporary location first
echo "📋 Copying app files..."
cp -R "$SOURCE_APP" "$TEMP_APP"

# Move to Applications (requires admin)
echo "🔐 Installing to Applications folder (requires admin password)..."
sudo mv "$TEMP_APP" "$DEST_APP"

# Set proper permissions
echo "⚙️  Setting permissions..."
sudo chown -R root:admin "$DEST_APP"
sudo chmod -R 755 "$DEST_APP"

# Register with system
echo "📱 Registering with system..."
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$DEST_APP"

# Update Launch Services database
echo "🔄 Updating Launch Services..."
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user

echo ""
echo "✅ Installation Complete!"
echo ""
echo "🎉 Interview Lift is now installed as a standalone system app!"
echo ""
echo "📍 Location: /Applications/Interview Lift.app"
echo "🔍 Search: Type 'Interview Lift' in Spotlight"
echo "🚀 Launch: Open from Applications folder or Dock"
echo ""
echo "To uninstall: sudo rm -rf '/Applications/Interview Lift.app'" 