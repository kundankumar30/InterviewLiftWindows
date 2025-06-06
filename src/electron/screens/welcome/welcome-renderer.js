// welcome-renderer.js
const { ipcRenderer } = require('electron');

// Wait for DOM to load
window.addEventListener('DOMContentLoaded', () => {
  const logo = document.querySelector('#logo');
  const jobRoleInput = document.querySelector('#job-role');
  const keySkillsInput = document.querySelector('#key-skills');
  const startButton = document.querySelector('#start-button');
  
  // User profile elements
  const userProfile = document.querySelector('#user-profile');
  const userAvatar = document.querySelector('#user-avatar');
  const userAvatarFallback = document.querySelector('#user-avatar-fallback');
  const userName = document.querySelector('#user-name');
  const userEmail = document.querySelector('#user-email');
  const userStatus = document.querySelector('#user-status');
  const compactStatusBadge = document.querySelector('#compact-status-badge');
  const signOutBtn = document.querySelector('#sign-out-btn');

  // Profile expansion functionality
  let isProfileExpanded = false;
  
  userProfile.addEventListener('click', (e) => {
    // Don't collapse if clicking on sign-out button
    if (e.target === signOutBtn || signOutBtn.contains(e.target)) {
      return;
    }
    
    isProfileExpanded = !isProfileExpanded;
    
    if (isProfileExpanded) {
      userProfile.classList.add('expanded');
    } else {
      userProfile.classList.remove('expanded');
    }
  });

  // Close expanded profile when clicking outside
  document.addEventListener('click', (e) => {
    if (!userProfile.contains(e.target) && isProfileExpanded) {
      isProfileExpanded = false;
      userProfile.classList.remove('expanded');
    }
  });

  // Load user information from Clerk
  async function loadUserInfo() {
    console.log('🔍 Loading user information...');
    
    try {
      const userResponse = await ipcRenderer.invoke('clerk-get-current-user');
      console.log('👤 User response:', userResponse);
      
      if (userResponse && userResponse.success && userResponse.user) {
        const user = userResponse.user;
        
        // Update user name
        userName.textContent = user.fullName || user.firstName || user.email.split('@')[0];
        userName.classList.remove('loading');
        
        // Update user email
        userEmail.textContent = user.email;
        userEmail.classList.remove('loading');
        
        // Update user avatar
        if (user.imageUrl) {
          const img = document.createElement('img');
          img.src = user.imageUrl;
          img.alt = 'User Avatar';
          img.onerror = () => {
            // Fallback to initials if image fails to load
            userAvatarFallback.textContent = getInitials(user.fullName || user.firstName || user.email);
          };
          userAvatar.appendChild(img);
          userAvatarFallback.style.display = 'none';
        } else {
          // Use initials as fallback
          userAvatarFallback.textContent = getInitials(user.fullName || user.firstName || user.email);
        }
        
        // NEW: Determine user status from validation API response
        const userValidation = user.validation;
        let userSubscriptionStatus = 'basic'; // Default fallback
        
        if (userValidation) {
          console.log('📊 User validation data:', {
            success: userValidation.success,
            userType: userValidation.userType,
            accessLevel: userValidation.accessLevel,
            isTrialUser: userValidation.isTrialUser,
            trialDays: userValidation.trialDays
          });
          
          // Use API response to determine user status
          userSubscriptionStatus = userValidation.userType || 'basic';
          
          // Display validation information in console for debugging
          if (userValidation.success) {
            console.log('✅ User validation successful:', {
              userType: userValidation.userType,
              accessLevel: userValidation.accessLevel,
              isTrialUser: userValidation.isTrialUser,
              trialDays: userValidation.trialDays,
              message: userValidation.message
            });
          } else {
            console.warn('⚠️ User validation failed, using fallback access:', {
              error: userValidation.error,
              userType: userValidation.userType,
              accessLevel: userValidation.accessLevel
            });
          }
        } else {
          console.log('⚠️ No validation data found, using legacy subscription check');
          // Fallback to legacy Clerk metadata check
          userSubscriptionStatus = getUserSubscriptionStatus(user);
        }
        
        updateUserStatus(userSubscriptionStatus);
        
        console.log('✅ User information loaded successfully with status:', userSubscriptionStatus);
      } else {
        console.log('⚠️ No user data found, using fallback');
        userName.textContent = 'Guest User';
        userName.classList.remove('loading');
        userEmail.textContent = 'Not signed in';
        userEmail.classList.remove('loading');
        userAvatarFallback.textContent = 'G';
      }
    } catch (error) {
      console.error('❌ Failed to load user information:', error);
      userName.textContent = 'Error Loading';
      userName.classList.remove('loading');
      userEmail.textContent = 'Please refresh';
      userEmail.classList.remove('loading');
      userAvatarFallback.textContent = '!';
    }
  }

  // Function to get user initials
  function getInitials(name) {
    if (!name) return '?';
    
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    } else {
      return name.substring(0, 2).toUpperCase();
    }
  }

  // Function to determine user subscription status (placeholder logic)
  function getUserSubscriptionStatus(user) {
    // TODO: This should check actual subscription data from your backend
    // For now, we'll use a simple heuristic or metadata from Clerk
    
    // Check if user has pro metadata (this would be set in your Clerk dashboard or backend)
    const userMetadata = user.publicMetadata || user.privateMetadata || {};
    
    if (userMetadata.subscription === 'pro' || userMetadata.plan === 'pro') {
      return 'pro';
    }
    
    // Check localStorage for demo purposes (Easter egg for testing)
    if (localStorage.getItem('demo-pro-status') === 'true') {
      return 'pro';
    }
    
    // Default to basic for now
    return 'basic';
  }

  // Function to update user status display
  function updateUserStatus(status) {
    const statusIcon = document.querySelector('#user-status-icon');
    const statusText = userStatus.querySelector('span:last-child');
    
    // Update expanded status display
    userStatus.className = ''; // Remove all classes
    userStatus.classList.add('user-status', status);
    
    // Update compact badge
    compactStatusBadge.className = ''; // Remove all classes
    compactStatusBadge.classList.add('compact-status-badge', status);
    
    if (status === 'pro') {
      statusIcon.textContent = '👑';
      statusText.textContent = 'Pro';
      compactStatusBadge.textContent = 'PRO';
    } else {
      statusIcon.textContent = '⭐';
      statusText.textContent = 'Basic';
      compactStatusBadge.textContent = 'BASIC';
    }
  }

  // Easter egg: Double-click status to toggle Pro/Basic for demo
  userStatus.addEventListener('dblclick', () => {
    const currentStatus = userStatus.classList.contains('pro') ? 'pro' : 'basic';
    const newStatus = currentStatus === 'pro' ? 'basic' : 'pro';
    
    // Store demo status
    localStorage.setItem('demo-pro-status', newStatus === 'pro' ? 'true' : 'false');
    
    updateUserStatus(newStatus);
    
    // Show a small notification
    const notification = document.createElement('div');
    notification.textContent = `Demo mode: ${newStatus.toUpperCase()}`;
    notification.style.cssText = `
      position: fixed;
      top: 1rem;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.8rem;
      z-index: 1000;
      backdrop-filter: blur(8px);
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 2000);
  });

  // Handle sign out
  signOutBtn.addEventListener('click', async () => {
    console.log('👋 Sign out requested');
    
    try {
      signOutBtn.disabled = true;
      signOutBtn.textContent = '...';
      
      const result = await ipcRenderer.invoke('clerk-sign-out');
      
      if (result && result.success) {
        console.log('✅ Successfully signed out');
        // The main process will handle navigation back to login
      } else {
        console.error('❌ Sign out failed:', result);
        alert('Failed to sign out. Please try again.');
        signOutBtn.disabled = false;
        signOutBtn.textContent = '⏻';
      }
    } catch (error) {
      console.error('❌ Sign out error:', error);
      alert('Failed to sign out. Please try again.');
      signOutBtn.disabled = false;
      signOutBtn.textContent = '⏻';
    }
  });

  // Add hover effect to logo
  logo.addEventListener('mouseenter', () => {
    logo.style.transform = 'scale(1.05)';
    logo.style.transition = 'transform 0.3s ease';
  });

  logo.addEventListener('mouseleave', () => {
    logo.style.transform = 'scale(1)';
  });

  // Function to validate inputs
  const validateInputs = () => {
    const jobRole = jobRoleInput.value.trim();
    const keySkills = keySkillsInput.value.trim();
    return jobRole !== '' && keySkills !== '';
  };

  // Function to handle start button click
  const handleStart = () => {
    if (validateInputs()) {
      const userData = {
        jobRole: jobRoleInput.value.trim(),
        keySkills: keySkillsInput.value.trim(),
        // Hardcode to EN-US
        uiLanguage: 'en',
        transcriptionLanguage: 'en-US',
        aiLanguage: 'en'
      };
      // Store user data and navigate to overlay screen
      localStorage.setItem('userData', JSON.stringify(userData));
      ipcRenderer.send('navigate', 'overlay');
    } else {
      alert('Please fill in both Job Role and Key Skills fields');
    }
  };

  // Add click handler to start button
  startButton.addEventListener('click', handleStart);

  // Add enter key handler for both inputs
  const handleEnterKey = (event) => {
    if (event.key === 'Enter') {
      handleStart();
    }
  };

  jobRoleInput.addEventListener('keypress', handleEnterKey);
  keySkillsInput.addEventListener('keypress', handleEnterKey);

  // Initialize the page
  loadUserInfo();
  
  // Focus the first input on load
  jobRoleInput.focus();
}); 