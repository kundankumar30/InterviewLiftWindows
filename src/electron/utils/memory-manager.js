const { emergencyMemoryCleanup, clearConversationHistory } = require("./recording");

/**
 * Memory Management Module
 * Handles memory monitoring, cleanup, and resource management
 */

// Tracking variables
const activeIPCHandlers = new Set();
const activeIntervals = new Set();
const memoryCheckInterval = 60000; // Check every 60 seconds

// Enhanced IPC handler wrapper with cleanup tracking
function registerIPCHandler(channel, handler, isHandle = false) {
  const { ipcMain } = require('electron');
  
  if (isHandle) {
    ipcMain.handle(channel, handler);
  } else {
    ipcMain.on(channel, handler);
  }
  activeIPCHandlers.add(channel);
  console.log(`📡 IPC handler registered: ${channel} (${activeIPCHandlers.size} total)`);
}

// Enhanced interval wrapper with cleanup tracking
function setIntervalSafe(callback, delay, label = 'main-interval') {
  const intervalId = setInterval(() => {
    try {
      callback();
    } catch (error) {
      console.error(`Interval callback error (${label}):`, error);
    }
  }, delay);
  activeIntervals.add(intervalId);
  console.log(`⏰ Interval created: ${label} (${activeIntervals.size} active)`);
  return intervalId;
}

function clearIntervalSafe(intervalId, label = 'main-interval') {
  if (intervalId) {
    clearInterval(intervalId);
    activeIntervals.delete(intervalId);
    console.log(`🧹 Interval cleared: ${label} (${activeIntervals.size} remaining)`);
  }
}

// Memory monitoring and cleanup functions
function checkMemoryUsage() {
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const rssUsedMB = Math.round(memUsage.rss / 1024 / 1024);
  
  console.log(`💾 Memory: Heap ${heapUsedMB}MB, RSS ${rssUsedMB}MB`);
  
  // Trigger cleanup if memory usage is high
  if (heapUsedMB > 300 || rssUsedMB > 400) {
    console.log('🚨 HIGH MEMORY USAGE DETECTED - Triggering cleanup');
    performMainProcessCleanup();
  }
  
  return { heapUsedMB, rssUsedMB };
}

function performMainProcessCleanup() {
  console.log('🧹 Performing main process memory cleanup');
  
  // Trigger recording cleanup
  try {
    emergencyMemoryCleanup();
  } catch (error) {
    console.warn('Error in recording cleanup:', error);
  }
  
  // Force garbage collection if available
  if (global.gc) {
    console.log('🗑️ Forcing garbage collection');
    global.gc();
  }
  
  // Clear conversation history to free memory
  try {
    clearConversationHistory();
  } catch (error) {
    console.warn('Error clearing conversation history:', error);
  }
  
  console.log('✅ Main process cleanup completed');
}

function emergencyMainProcessCleanup() {
  console.log('🚨 EMERGENCY MAIN PROCESS CLEANUP');
  
  // Clear all intervals
  activeIntervals.forEach(intervalId => {
    try {
      clearInterval(intervalId);
    } catch (e) {
      console.warn('Failed to clear interval:', e);
    }
  });
  activeIntervals.clear();
  
  // Perform standard cleanup
  performMainProcessCleanup();
  
  console.log('✅ Emergency main process cleanup completed');
}

// Global error handling for Google Speech API timeouts and other errors
function setupGlobalErrorHandling() {
  process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
    
    // Check if it's a Google Speech API timeout error
    if (error.message && (
      error.message.includes('408:Request Timeout') ||
      error.message.includes('DEADLINE_EXCEEDED') ||
      error.message.includes('grpc') ||
      error.code === 2 || error.code === 4
    )) {
      console.log('🔄 Google Speech API timeout detected - handled gracefully');
      // Don't crash the app for Speech API timeouts
      return;
    }
    
    // For other critical errors, log and potentially restart
    console.error('Critical error occurred:', error);
    
    // Optionally show error dialog for non-Speech API errors
    const { dialog } = require('electron');
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      dialog.showErrorBox('Application Error', 
        `An unexpected error occurred: ${error.message}\n\nThe application will continue running, but you may want to restart it if issues persist.`);
    }
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    
    // Check if it's a Google Speech API related rejection
    if (reason && typeof reason === 'object' && (
      (reason.message && reason.message.includes('408:Request Timeout')) ||
      (reason.message && reason.message.includes('grpc')) ||
      reason.code === 2 || reason.code === 4
    )) {
      console.log('🔄 Google Speech API rejection handled gracefully');
      return;
    }
  });

  console.log('✅ Global error handling setup completed');
}

// Start memory monitoring
function startMemoryMonitoring() {
  const memoryMonitorInterval = setIntervalSafe(checkMemoryUsage, memoryCheckInterval, 'memory-monitor');
  console.log('📊 Memory monitoring started');
  return memoryMonitorInterval;
}

// Cleanup all resources
function cleanupAllResources() {
  console.log('🧹 Starting comprehensive resource cleanup...');
  
  // Clear all active intervals
  activeIntervals.forEach(intervalId => {
    try {
      clearInterval(intervalId);
    } catch (error) {
      console.warn('Failed to clear interval:', error);
    }
  });
  activeIntervals.clear();
  
  // Remove all IPC handlers
  const { ipcMain } = require('electron');
  activeIPCHandlers.forEach(channel => {
    try {
      ipcMain.removeAllListeners(channel);
    } catch (error) {
      console.warn(`Failed to remove IPC handler ${channel}:`, error);
    }
  });
  activeIPCHandlers.clear();
  
  // Perform final cleanup
  emergencyMainProcessCleanup();
  
  console.log('✅ Comprehensive resource cleanup completed');
}

// Get memory and resource statistics
function getResourceStats() {
  const memUsage = process.memoryUsage();
  
  return {
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    },
    resources: {
      activeIPCHandlers: activeIPCHandlers.size,
      activeIntervals: activeIntervals.size
    },
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  // Handler registration
  registerIPCHandler,
  
  // Interval management
  setIntervalSafe,
  clearIntervalSafe,
  
  // Memory management
  checkMemoryUsage,
  performMainProcessCleanup,
  emergencyMainProcessCleanup,
  
  // Setup and monitoring
  setupGlobalErrorHandling,
  startMemoryMonitoring,
  
  // Cleanup
  cleanupAllResources,
  
  // Statistics
  getResourceStats,
  
  // Constants
  activeIPCHandlers,
  activeIntervals,
  memoryCheckInterval
}; 