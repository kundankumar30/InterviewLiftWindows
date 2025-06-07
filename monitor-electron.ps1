Write-Host 'Starting Electron process monitoring...' -ForegroundColor Green
Write-Host 'Monitoring Memory and CPU usage every 3 seconds' -ForegroundColor Yellow
Write-Host 'Press Ctrl+C to stop monitoring' -ForegroundColor Cyan
Write-Host ''

$counter = 0

while ($true) {
    $counter++
    $timestamp = Get-Date -Format 'HH:mm:ss'
    
    # Get all Electron processes
    $electronProcesses = Get-Process -Name 'electron' -ErrorAction SilentlyContinue
    
    if ($electronProcesses) {
        Write-Host "[$timestamp] Electron Performance Report #$counter" -ForegroundColor Green
        Write-Host ('=' * 60) -ForegroundColor Gray
        
        $totalMemoryMB = 0
        $totalCpuTime = 0
        $processCount = 0
        $maxMemory = 0
        
        foreach ($proc in $electronProcesses) {
            $memoryMB = [math]::Round($proc.WorkingSet64 / 1MB, 2)
            $cpuTime = [math]::Round($proc.CPU, 2)
            $totalMemoryMB += $memoryMB
            $totalCpuTime += $cpuTime
            $processCount++
            
            if ($memoryMB -gt $maxMemory) {
                $maxMemory = $memoryMB
            }
            
            # Simple process classification
            $processType = 'Helper'
            if ($memoryMB -gt 200) { $processType = 'Main' }
            elseif ($memoryMB -gt 100) { $processType = 'Renderer' }
            elseif ($memoryMB -gt 50) { $processType = 'Worker' }
            
            Write-Host "  PID: $($proc.Id) | Type: $processType | Memory: $memoryMB MB | CPU: $cpuTime s" -ForegroundColor White
        }
        
        Write-Host ('=' * 60) -ForegroundColor Gray
        Write-Host "TOTAL: $processCount processes | Memory: $totalMemoryMB MB | CPU Time: $totalCpuTime s" -ForegroundColor Yellow
        Write-Host "Peak Memory: $maxMemory MB" -ForegroundColor Cyan
        
        # Performance status
        if ($totalMemoryMB -gt 500) {
            Write-Host "Status: HIGH MEMORY USAGE - Monitor closely" -ForegroundColor Red
        } elseif ($totalMemoryMB -gt 300) {
            Write-Host "Status: MODERATE MEMORY USAGE - Normal" -ForegroundColor Yellow
        } else {
            Write-Host "Status: OPTIMAL MEMORY USAGE" -ForegroundColor Green
        }
        
        $avgMemory = [math]::Round($totalMemoryMB / $processCount, 1)
        Write-Host "Average per process: $avgMemory MB" -ForegroundColor Magenta
        
        Write-Host ''
    } else {
        Write-Host "[$timestamp] No Electron processes found" -ForegroundColor Red
        Write-Host ''
    }
    
    Start-Sleep -Seconds 3
} 