#!/bin/bash

# Build macOS Swift Recorder
# This script compiles the Swift recorder for macOS

set -e

CONFIGURATION="release"
CLEAN=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN=true
            shift
            ;;
        --debug)
            CONFIGURATION="debug"
            shift
            ;;
        --release)
            CONFIGURATION="release"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--clean] [--debug|--release]"
            exit 1
            ;;
    esac
done

echo "🔨 Building macOS Swift Recorder ($CONFIGURATION)..."

# Get script directory and project paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SWIFT_DIR="$PROJECT_ROOT/src/swift"
BUILD_DIR="$SWIFT_DIR/build"
SOURCE_FILE="$SWIFT_DIR/Recorder.swift"
OUTPUT_EXECUTABLE="$SWIFT_DIR/Recorder"

echo "📁 Project root: $PROJECT_ROOT"
echo "📁 Swift directory: $SWIFT_DIR"
echo "📁 Source file: $SOURCE_FILE"
echo "📁 Output executable: $OUTPUT_EXECUTABLE"

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script must be run on macOS"
    exit 1
fi

# Check if Swift is available
if ! command -v swiftc &> /dev/null; then
    echo "❌ Swift compiler not found. Please install Xcode or Swift toolchain."
    exit 1
fi

SWIFT_VERSION=$(swiftc --version | head -n 1)
echo "✅ Found Swift: $SWIFT_VERSION"

# Check if source file exists
if [[ ! -f "$SOURCE_FILE" ]]; then
    echo "❌ Source file not found: $SOURCE_FILE"
    exit 1
fi

# Clean if requested
if [[ "$CLEAN" == true ]]; then
    echo "🧹 Cleaning previous build..."
    rm -rf "$BUILD_DIR"
    rm -f "$OUTPUT_EXECUTABLE"
fi

# Create build directory
mkdir -p "$BUILD_DIR"

# Set compiler flags based on configuration
SWIFT_FLAGS=()
if [[ "$CONFIGURATION" == "release" ]]; then
    SWIFT_FLAGS+=("-O")
    echo "🚀 Building in release mode with optimizations"
else
    SWIFT_FLAGS+=("-g")
    echo "🐛 Building in debug mode"
fi

# Add framework imports for ScreenCaptureKit and other required frameworks
SWIFT_FLAGS+=(
    "-framework" "AVFoundation"
    "-framework" "ScreenCaptureKit" 
    "-framework" "CoreImage"
    "-framework" "CoreGraphics"
    "-framework" "Foundation"
)

# Check macOS version for ScreenCaptureKit compatibility
MACOS_VERSION=$(sw_vers -productVersion | cut -d '.' -f 1,2)
REQUIRED_VERSION="12.3"

if [[ "$(printf '%s\n' "$REQUIRED_VERSION" "$MACOS_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]]; then
    echo "⚠️  Warning: ScreenCaptureKit requires macOS 12.3 or later. Current version: $MACOS_VERSION"
    echo "   The recorder may not work on this system."
fi

# Compile the Swift recorder
echo "🔨 Compiling Swift recorder..."
echo "Command: swiftc ${SWIFT_FLAGS[*]} \"$SOURCE_FILE\" -o \"$OUTPUT_EXECUTABLE\""

if swiftc "${SWIFT_FLAGS[@]}" "$SOURCE_FILE" -o "$OUTPUT_EXECUTABLE"; then
    echo "✅ Swift recorder compiled successfully!"
    
    # Make executable
    chmod +x "$OUTPUT_EXECUTABLE"
    
    # Test the executable
    echo "🧪 Testing executable..."
    if "$OUTPUT_EXECUTABLE" --check-permissions 2>/dev/null; then
        echo "✅ Executable test completed"
    else
        echo "⚠️  Warning: Could not test executable (this is normal if screen permissions are not granted)"
    fi
    
    # Show file info
    FILE_SIZE=$(ls -lh "$OUTPUT_EXECUTABLE" | awk '{print $5}')
    echo "📍 Executable location: $OUTPUT_EXECUTABLE"
    echo "📏 File size: $FILE_SIZE"
    
else
    echo "❌ Compilation failed"
    exit 1
fi

echo "🎉 macOS Swift Recorder build completed!" 