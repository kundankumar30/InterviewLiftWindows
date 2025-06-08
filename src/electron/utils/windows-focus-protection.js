const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class WindowsFocusProtection {
    constructor() {
        this.isProtectionActive = false;
        this.originalForegroundLockTimeout = null;
    }

    // Prevent other applications from stealing focus during interviews
    async enableFocusProtection() {
        if (process.platform !== 'win32') {
            console.log('⚠️ Focus protection only available on Windows');
            return false;
        }

        try {
            console.log('🔒 Enabling Windows focus protection...');

            // Get current foreground lock timeout
            const { stdout: currentTimeout } = await execAsync(
                'reg query "HKCU\\Control Panel\\Desktop" /v ForegroundLockTimeout'
            );
            
            // Store original value for restoration
            const match = currentTimeout.match(/ForegroundLockTimeout\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
            if (match) {
                this.originalForegroundLockTimeout = parseInt(match[1], 16);
                console.log(`📝 Stored original ForegroundLockTimeout: ${this.originalForegroundLockTimeout}`);
            }

            // Set aggressive focus protection (0 = no timeout, immediate focus lock)
            await execAsync(
                'reg add "HKCU\\Control Panel\\Desktop" /v ForegroundLockTimeout /t REG_DWORD /d 0 /f'
            );

            // Disable notification focus stealing
            await execAsync(
                'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK /t REG_DWORD /d 0 /f'
            );

            // Disable action center notifications
            await execAsync(
                'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND /t REG_DWORD /d 0 /f'
            );

            this.isProtectionActive = true;
            console.log('✅ Windows focus protection enabled');
            return true;

        } catch (error) {
            console.error('❌ Failed to enable focus protection:', error);
            return false;
        }
    }

    // Restore original Windows notification settings
    async disableFocusProtection() {
        if (process.platform !== 'win32' || !this.isProtectionActive) {
            return false;
        }

        try {
            console.log('🔓 Restoring Windows focus settings...');

            // Restore original foreground lock timeout
            if (this.originalForegroundLockTimeout !== null) {
                await execAsync(
                    `reg add "HKCU\\Control Panel\\Desktop" /v ForegroundLockTimeout /t REG_DWORD /d ${this.originalForegroundLockTimeout} /f`
                );
            } else {
                // Default Windows value is 200000 (200 seconds)
                await execAsync(
                    'reg add "HKCU\\Control Panel\\Desktop" /v ForegroundLockTimeout /t REG_DWORD /d 200000 /f'
                );
            }

            // Re-enable notifications
            await execAsync(
                'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_ALLOW_TOASTS_ABOVE_LOCK /t REG_DWORD /d 1 /f'
            );

            await execAsync(
                'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND /t REG_DWORD /d 1 /f'
            );

            this.isProtectionActive = false;
            console.log('✅ Windows focus settings restored');
            return true;

        } catch (error) {
            console.error('❌ Failed to restore focus settings:', error);
            return false;
        }
    }

    // Check if focus protection is currently active
    getProtectionStatus() {
        return {
            platform: process.platform,
            isActive: this.isProtectionActive,
            originalTimeout: this.originalForegroundLockTimeout
        };
    }

    // Temporarily suppress all Windows notifications
    async suppressNotifications() {
        if (process.platform !== 'win32') return false;

        try {
            // Disable all toast notifications
            await execAsync(
                'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_TOASTS_ENABLED /t REG_DWORD /d 0 /f'
            );

            // Disable notification sounds
            await execAsync(
                'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND /t REG_DWORD /d 0 /f'
            );

            // Disable badge notifications
            await execAsync(
                'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_BADGE_ENABLED /t REG_DWORD /d 0 /f'
            );

            console.log('🔕 Windows notifications suppressed');
            return true;

        } catch (error) {
            console.error('❌ Failed to suppress notifications:', error);
            return false;
        }
    }

    // Restore Windows notifications
    async restoreNotifications() {
        if (process.platform !== 'win32') return false;

        try {
            // Re-enable toast notifications
            await execAsync(
                'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_TOASTS_ENABLED /t REG_DWORD /d 1 /f'
            );

            // Re-enable notification sounds
            await execAsync(
                'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND /t REG_DWORD /d 1 /f'
            );

            // Re-enable badge notifications
            await execAsync(
                'reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_BADGE_ENABLED /t REG_DWORD /d 1 /f'
            );

            console.log('🔔 Windows notifications restored');
            return true;

        } catch (error) {
            console.error('❌ Failed to restore notifications:', error);
            return false;
        }
    }
}

module.exports = WindowsFocusProtection; 