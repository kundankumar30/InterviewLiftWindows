// Utility functions for app authentication and redirects

export function getAppRedirectUrl(token) {
  // Use the custom protocol to redirect back to the Electron app
  // This matches the protocol setup in your main.js
  return `interviewlift://login-callback?token=${token}`;
}

export function isElectronApp() {
  // Check if we're running inside Electron
  return typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
}

export function openInExternalBrowser(url) {
  // Open URL in external browser (useful when in Electron)
  if (typeof window !== 'undefined' && window.require) {
    const { shell } = window.require('electron');
    shell.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
} 