const { ipcRenderer } = require("electron");
const os = require('os');

let detailedStatus = null;

// Platform-specific instructions
const platformInstructions = {
  'win32': {
    title: 'Windows Setup Requirements',
    icon: '🪟',
    steps: [
      {
        title: 'System Audio Capture',
        description: 'Allow Interview Lift to capture system audio for AI analysis',
        steps: [
          '1. Ensure audio drivers are properly installed and up to date',
          '2. Check that system audio output is working',
          '3. Verify no other applications are exclusively using audio devices',
          '4. Try restarting Windows Audio service if needed'
        ]
      },
      {
        title: 'Screen Capture Support',
        description: 'Ensure Windows version supports modern screen capture',
        steps: [
          '1. Windows 10 version 1903 or later is required',
          '2. Windows 11 is fully supported',
          '3. Try running as administrator if issues persist',
          '4. Check Windows Update for latest system updates'
        ]
      }
    ]
  },
  'darwin': {
    title: 'macOS Permissions Setup',
    icon: '🍎',
    steps: [
      {
        title: 'Screen Recording Permission',
        description: 'Allow Interview Lift to record your screen for AI assistance',
        steps: [
          '1. Open System Preferences',
          '2. Go to Security & Privacy > Privacy',
          '3. Click on "Screen Recording" in the sidebar',
          '4. Check the box next to "Interview Lift"',
          '5. Restart the application if needed'
        ]
      },
      {
        title: 'System Audio Access',
        description: 'Enable system audio capture for interview analysis',
        steps: [
          '1. Interview Lift uses system audio (not microphone)',
          '2. No additional permissions required for system audio',
          '3. Ensure your Mac has audio output enabled',
          '4. Check that other apps are not blocking audio access'
        ]
      }
    ]
  }
};

function showPlatformInstructions() {
  const platform = os.platform();
  const instructionsContainer = document.getElementById('platform-instructions');
  const loadingDiv = document.getElementById('loading-instructions');
  
  if (loadingDiv) {
    loadingDiv.remove();
  }

  const instructions = platformInstructions[platform];
  
  if (!instructions) {
    instructionsContainer.innerHTML = `
      <div class="text-center">
        <h3 class="font-semibold text-red-600">❌ Unsupported Platform</h3>
        <p class="text-gray-600 mt-2">Interview Lift currently supports Windows and macOS only.</p>
        <p class="text-sm text-gray-500 mt-1">Your platform: ${platform}</p>
      </div>
    `;
    return;
  }

  instructionsContainer.innerHTML = `
    <div class="text-center mb-4">
      <h3 class="text-xl font-semibold text-gray-800">${instructions.icon} ${instructions.title}</h3>
    </div>
    
    ${instructions.steps.map(step => `
      <div class="mb-6">
        <h4 class="font-semibold text-gray-700 mb-2">${step.title}</h4>
        <p class="text-gray-600 mb-3">${step.description}</p>
        <ul class="space-y-1 text-sm text-gray-600">
          ${step.steps.map(s => `<li class="flex items-start"><span class="mr-2">•</span>${s}</li>`).join('')}
        </ul>
      </div>
    `).join('')}
    
    <div class="mt-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
      <p class="text-sm text-blue-800">
        <strong>💡 Note:</strong> Interview Lift captures system audio (what you hear) not microphone input. This provides better audio quality and doesn't require microphone permissions.
      </p>
    </div>
  `;
}

async function checkDetailedPermissions() {
  try {
    detailedStatus = await ipcRenderer.invoke("get-detailed-permission-status");
    return detailedStatus;
  } catch (error) {
    console.error('Error getting detailed permission status:', error);
    return null;
  }
}

function showDetailedStatus() {
  const statusPanel = document.getElementById('detailed-status');
  const statusContent = document.getElementById('status-content');
  
  if (!detailedStatus) {
    statusContent.innerHTML = '<p class="text-red-600">Unable to get detailed status information.</p>';
    statusPanel.classList.remove('hidden');
    return;
  }

  let statusHTML = `
    <div class="mb-3">
      <strong>Platform:</strong> ${detailedStatus.platform || 'Unknown'}
    </div>
    <div class="mb-3">
      <strong>Overall Status:</strong> 
      <span class="${detailedStatus.granted ? 'text-green-600' : 'text-red-600'}">
        ${detailedStatus.granted ? '✅ Ready' : '❌ Setup Required'}
      </span>
    </div>
  `;

  if (detailedStatus.details) {
    statusHTML += '<div class="mb-3"><strong>Component Status:</strong></div>';
    
    // Windows detailed status
    if (detailedStatus.platform === 'win32' && detailedStatus.details) {
      const details = detailedStatus.details;
      
      if (details.screenCapture) {
        statusHTML += `
          <div class="ml-4 mb-2">
            <strong>Screen Capture:</strong> 
            <span class="${details.screenCapture.granted ? 'text-green-600' : 'text-red-600'}">
              ${details.screenCapture.granted ? '✅' : '❌'} ${details.screenCapture.status}
            </span>
          </div>
        `;
      }
      
      if (details.systemAudio) {
        statusHTML += `
          <div class="ml-4 mb-2">
            <strong>System Audio:</strong> 
            <span class="${details.systemAudio.granted ? 'text-green-600' : 'text-red-600'}">
              ${details.systemAudio.granted ? '✅' : '❌'} ${details.systemAudio.status}
            </span>
          </div>
        `;
      }
    }
    
    // macOS detailed status
    if (detailedStatus.platform === 'darwin' && detailedStatus.details) {
      if (detailedStatus.details.screenCapture) {
        statusHTML += `
          <div class="ml-4 mb-2">
            <strong>Screen Recording:</strong> 
            <span class="${detailedStatus.details.screenCapture.granted ? 'text-green-600' : 'text-red-600'}">
              ${detailedStatus.details.screenCapture.granted ? '✅' : '❌'} ${detailedStatus.details.screenCapture.status}
            </span>
          </div>
        `;
      }
    }
  }

  // Show recommendations
  if (detailedStatus.recommendations && detailedStatus.recommendations.length > 0) {
    statusHTML += `
      <div class="mt-4">
        <strong>Recommendations:</strong>
        <ul class="mt-2 space-y-1">
          ${detailedStatus.recommendations.map(rec => `<li class="text-sm">• ${rec}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  statusContent.innerHTML = statusHTML;
  statusPanel.classList.remove('hidden');
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Show platform-specific instructions
  showPlatformInstructions();
  
  // Get detailed permission status
  checkDetailedPermissions();
});

document.getElementById("check-permissions").addEventListener("click", async () => {
  const button = document.getElementById("check-permissions");
  const originalText = button.textContent;
  
  button.textContent = "Checking...";
  button.disabled = true;
  
  try {
    await ipcRenderer.invoke("check-permissions");
    // Also refresh detailed status
    await checkDetailedPermissions();
  } catch (error) {
    console.error('Error checking permissions:', error);
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
});

document.getElementById("open-settings").addEventListener("click", async () => {
  try {
    await ipcRenderer.invoke("open-permission-settings");
  } catch (error) {
    console.error('Error opening settings:', error);
  }
});

document.getElementById("get-help").addEventListener("click", async () => {
  const button = document.getElementById("get-help");
  const helpPanel = document.getElementById('detailed-status');
  
  if (helpPanel.classList.contains('hidden')) {
    // First get fresh status, then show
    const status = await checkDetailedPermissions();
    showDetailedStatus();
    button.textContent = "Hide Detailed Help";
  } else {
    // Hide panel
    helpPanel.classList.add('hidden');
    button.textContent = "Get Detailed Help";
  }
});
