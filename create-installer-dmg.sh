#!/bin/bash

# Create a proper DMG installer with installation script

echo "🔨 Creating Interview Lift Installer DMG..."

# Create temporary installer directory
INSTALLER_DIR="tmp-installer"
DMG_NAME="Interview-Lift-Installer-1.0.0.dmg"

# Clean up any existing temp directory
rm -rf "$INSTALLER_DIR"
mkdir -p "$INSTALLER_DIR"

echo "📦 Copying app bundle..."
cp -R "out/interview-lift-darwin-arm64/interview-lift.app" "$INSTALLER_DIR/"

echo "📝 Creating installer script..."
cat > "$INSTALLER_DIR/Install Interview Lift.command" << 'EOF'
#!/bin/bash

# Interview Lift Auto-Installer
echo "🚀 Installing Interview Lift..."

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
SOURCE_APP="$SCRIPT_DIR/interview-lift.app"
DEST_APP="/Applications/Interview Lift.app"

# Check if source exists
if [ ! -d "$SOURCE_APP" ]; then
    echo "❌ Error: interview-lift.app not found!"
    echo "Press any key to exit..."
    read -n 1
    exit 1
fi

echo "📋 Copying to Applications..."

# Remove existing installation
if [ -d "$DEST_APP" ]; then
    echo "🗑️  Removing existing installation..."
    osascript -e "do shell script \"rm -rf '$DEST_APP'\" with administrator privileges"
fi

# Copy to Applications
echo "🔐 Installing (requires admin password)..."
osascript -e "do shell script \"cp -R '$SOURCE_APP' '/Applications/Interview Lift.app'\" with administrator privileges"

# Set permissions
osascript -e "do shell script \"chown -R root:admin '/Applications/Interview Lift.app'\" with administrator privileges"
osascript -e "do shell script \"chmod -R 755 '/Applications/Interview Lift.app'\" with administrator privileges"

# Register with system
echo "📱 Registering with system..."
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "/Applications/Interview Lift.app"

echo ""
echo "✅ Installation Complete!"
echo "🎉 Interview Lift is now available in Applications!"
echo ""
echo "Press any key to close..."
read -n 1
EOF

# Make installer script executable
chmod +x "$INSTALLER_DIR/Install Interview Lift.command"

echo "📄 Creating README..."
cat > "$INSTALLER_DIR/README.txt" << 'EOF'
Interview Lift Installer
========================

TO INSTALL:
1. Double-click "Install Interview Lift.command"
2. Enter your admin password when prompted
3. App will be installed to Applications folder

MANUAL INSTALL:
1. Drag "interview-lift.app" to Applications folder
2. Launch from Applications or Spotlight

FEATURES:
- AI-powered interview assistance
- Real-time speech recognition
- Gmail OAuth authentication
- Overlay mode for interviews

SYSTEM REQUIREMENTS:
- macOS (Apple Silicon/ARM64)
- Admin privileges for installation

Support: Your development team
EOF

echo "🎨 Creating DMG..."
# Remove existing DMG
rm -f "$DMG_NAME"

# Create DMG with proper background and layout
hdiutil create -volname "Interview Lift Installer" \
               -srcfolder "$INSTALLER_DIR" \
               -ov -format UDZO \
               "$DMG_NAME"

# Clean up
rm -rf "$INSTALLER_DIR"

echo ""
echo "✅ Installer DMG created: $DMG_NAME"
echo "📤 Users can now double-click the DMG and run the installer!"
echo ""
echo "Contents:"
echo "  - interview-lift.app (the application)"
echo "  - Install Interview Lift.command (auto-installer)"
echo "  - README.txt (instructions)" 