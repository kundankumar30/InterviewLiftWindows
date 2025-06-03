$process = Start-Process -FilePath "./Recorder.exe" -ArgumentList "--stream-transcription" -PassThru -RedirectStandardError "stderr.log" -RedirectStandardOutput "stdout.log" -WindowStyle Hidden

# Wait 5 seconds for startup messages
Start-Sleep -Seconds 5

# Stop the process
Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue

# Show stderr output (status messages)
Write-Host "=== STDERR OUTPUT (Status Messages) ==="
if (Test-Path "stderr.log") {
    Get-Content "stderr.log"
    Remove-Item "stderr.log"
} else {
    Write-Host "No stderr.log file found"
}

# Show first few bytes of stdout (audio data)
Write-Host "`n=== STDOUT OUTPUT (Audio Data - first 100 bytes) ==="
if (Test-Path "stdout.log") {
    $bytes = [System.IO.File]::ReadAllBytes("stdout.log")
    Write-Host "Total audio bytes: $($bytes.Length)"
    if ($bytes.Length -gt 0) {
        Write-Host "First 20 bytes (hex): $([System.BitConverter]::ToString($bytes[0..19]))"
    }
    Remove-Item "stdout.log"
} else {
    Write-Host "No stdout.log file found"
} 