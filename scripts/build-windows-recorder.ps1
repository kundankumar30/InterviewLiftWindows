# Build Windows Recorder
# This script builds the C# recorder for Windows using dotnet CLI

param(
    [string]$Configuration = "Release",
    [switch]$Clean
)

Write-Host "Building Windows Recorder..." -ForegroundColor Green

# Change to Windows recorder directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Join-Path (Split-Path -Parent $ScriptDir) "src\windows"
$OutputDir = Join-Path $ProjectDir "bin\x64\$Configuration\net8.0\win-x64"

Write-Host "Project directory: $ProjectDir" -ForegroundColor Cyan
Write-Host "Output directory: $OutputDir" -ForegroundColor Cyan

# Check if .NET 8 is installed
try {
    $dotnetVersion = dotnet --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet CLI not found"
    }
    Write-Host "Found .NET version: $dotnetVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: .NET 8 SDK is required but not found. Please install .NET 8 SDK from https://dotnet.microsoft.com/download" -ForegroundColor Red
    exit 1
}

# Change to project directory
if (!(Test-Path $ProjectDir)) {
    Write-Host "ERROR: Project directory not found: $ProjectDir" -ForegroundColor Red
    exit 1
}

Set-Location $ProjectDir

# Clean if requested
if ($Clean) {
    Write-Host "Cleaning previous build..." -ForegroundColor Yellow
    dotnet clean -p:Platform=x64
    if (Test-Path "bin") {
        Remove-Item -Recurse -Force "bin"
    }
    if (Test-Path "obj") {
        Remove-Item -Recurse -Force "obj"
    }
}

# Restore packages
Write-Host "Restoring NuGet packages..." -ForegroundColor Yellow
dotnet restore -p:Platform=x64
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to restore packages" -ForegroundColor Red
    exit 1
}

# Build the project with explicit platform
Write-Host "Building Windows recorder..." -ForegroundColor Yellow
dotnet build -c $Configuration -p:Platform=x64 --no-restore
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    exit 1
}

# Publish self-contained executable
Write-Host "Publishing self-contained executable..." -ForegroundColor Yellow
dotnet publish -c $Configuration -r win-x64 -p:Platform=x64 --self-contained true -p:PublishSingleFile=true --no-restore
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Publish failed" -ForegroundColor Red
    exit 1
}

# Check if executable was created
$ExecutablePath = Join-Path $OutputDir "publish\Recorder.exe"
if (Test-Path $ExecutablePath) {
    Write-Host "SUCCESS: Windows recorder built successfully!" -ForegroundColor Green
    Write-Host "Executable location: $ExecutablePath" -ForegroundColor Cyan
    
    # Test the executable
    Write-Host "Testing executable..." -ForegroundColor Yellow
    try {
        $TestOutput = & $ExecutablePath --check-permissions 2>&1
        Write-Host "SUCCESS: Executable test completed" -ForegroundColor Green
    } catch {
        Write-Host "WARNING: Could not test executable (this is normal if Windows APIs are not available)" -ForegroundColor Yellow
    }
} else {
    Write-Host "ERROR: Executable not found at expected location: $ExecutablePath" -ForegroundColor Red
    exit 1
}

Write-Host "SUCCESS: Windows Recorder build completed!" -ForegroundColor Green 