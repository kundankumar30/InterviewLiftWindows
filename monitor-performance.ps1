Write-Host '🔍 Starting continuous monitoring of InterviewLift app...' -ForegroundColor Green
Write-Host '📊 Monitoring Memory and CPU usage every 5 seconds' -ForegroundColor Yellow
Write-Host '⏹️  Press Ctrl+C to stop monitoring' -ForegroundColor Cyan
Write-Host ''

$processName = 'InterviewLift*'
$counter = 0

while ($true) {
    $counter++
    $timestamp = Get-Date -Format 'HH:mm:ss'
    
    # Get all Electron processes for InterviewLift
    $processes = Get-Process -Name $processName -ErrorAction SilentlyContinue
    
    if ($processes) {
        Write-Host "[$timestamp] 📱 InterviewLift Performance Report #$counter" -ForegroundColor Green
        Write-Host ('─' * 60) -ForegroundColor Gray
        
        $totalMemoryMB = 0
        $totalCpuPercent = 0
        $processCount = 0
        
        foreach ($proc in $processes) {
            $memoryMB = [math]::Round($proc.WorkingSet64 / 1MB, 2)
            $cpuPercent = [math]::Round($proc.CPU, 2)
            $totalMemoryMB += $memoryMB
            $totalCpuPercent += $cpuPercent
            $processCount++
            
            $processType = if ($proc.MainWindowTitle) { 'Main Window' } else { 'Background' }
            Write-Host "  🔸 PID: $($proc.Id) | Type: $processType | Memory: $memoryMB MB | CPU Time: $cpuPercent s" -ForegroundColor White
        }
        
        Write-Host ('─' * 60) -ForegroundColor Gray
        Write-Host "  📊 TOTAL: $processCount processes | Memory: $totalMemoryMB MB | CPU Time: $totalCpuPercent s" -ForegroundColor Yellow
        
        # Performance thresholds and alerts
        if ($totalMemoryMB -gt 500) {
            Write-Host "  ⚠️  HIGH MEMORY USAGE: $totalMemoryMB MB" -ForegroundColor Red
        } elseif ($totalMemoryMB -gt 300) {
            Write-Host "  🟡 MODERATE MEMORY USAGE: $totalMemoryMB MB" -ForegroundColor Yellow
        } else {
            Write-Host "  ✅ NORMAL MEMORY USAGE: $totalMemoryMB MB" -ForegroundColor Green
        }
        
        Write-Host ''
    } else {
        Write-Host "[$timestamp] ❌ InterviewLift app not running" -ForegroundColor Red
        Write-Host "   Waiting for app to start..." -ForegroundColor Gray
        Write-Host ''
    }
    
    Start-Sleep -Seconds 5
} 