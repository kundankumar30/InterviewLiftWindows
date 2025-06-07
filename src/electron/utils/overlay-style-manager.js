/**
 * Overlay Style Manager
 * Centralized management of all overlay visual properties including:
 * - Window transparency and opacity
 * - Glass effects and backdrop filters
 * - Font sizing and colors
 * - Background styling
 * - Theme management
 */

const { app } = require("electron");

class OverlayStyleManager {
    constructor() {
        // Window opacity management
        this.currentOpacity = 1.0;
        this.transparencyKeyPressCount = 0;
        this.MAX_TRANSPARENCY_KEY_PRESSES = 10;
        this.OPACITY_STEP = 0.2;
        
        // Theme settings
        this.currentTheme = 'dark';
        this.fontSize = 15; // Increased font size to 15px for better readability
        this.fontFamily = 'Inter, sans-serif';
        
        // Glass effect settings - optimized for Windows overlay experience
        this.glassEffects = {
            transcript: {
                backgroundColor: 'rgba(26, 32, 44, 0.3)', // 70% transparency (30% opaque)
                backdropFilter: 'blur(12px) saturate(120%)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                textColor: '#ffffff' // Bright white for transcription text
            },
            suggestions: {
                            backgroundColor: 'rgba(26, 32, 44, 0.75)', // 25% transparency (75% opaque) - less transparent
            backdropFilter: 'blur(20px) saturate(140%)', // Increased blur and saturation
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderLeft: '2px solid rgba(255, 255, 255, 0.15)',
                textColor: '#f3f4f6' // Light gray for AI suggestions
            },
            header: {
                backgroundColor: 'rgba(0, 0, 0, 0.2)', // Exact macOS transparency
                backdropFilter: 'blur(20px) saturate(150%)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                textColor: '#ffffff' // Keep pure white for header
            }
        };
        
        // Code highlighting theme for dark overlay (like in the image)
        this.codeTheme = {
            keyword: '#60a5fa', // Bright blue - excellent on dark background
            string: '#34d399', // Bright green - excellent on dark background  
            comment: '#d1d5db', // Light bright grey for better contrast
            number: '#f87171', // Bright red - excellent on dark background
            function: '#38bdf8', // Bright cyan - excellent on dark background
            variable: '#e5e7eb', // Light gray - excellent on dark background
            background: 'rgba(17, 24, 39, 0.8)' // Dark semi-transparent like in image
        };
        
        console.log('🎨 OverlayStyleManager initialized');
    }
    
    // =======================
    // WINDOW TRANSPARENCY METHODS
    // =======================
    
    /**
     * Apply transparency settings while preserving current opacity
     */
    applyTransparencySettingsWithOpacityPreservation(window) {
        if (!window || window.isDestroyed()) return;
        
        console.log(`🎨 Preserving opacity: ${this.currentOpacity} before applying transparency settings`);
        
        // Apply transparency settings
        window.setBackgroundColor('#00000000');
        if (process.platform === 'darwin') {
            window.setVibrancy(null);
            window.setHasShadow(false);
        } else if (process.platform === 'win32') {
            // Windows-specific transparency enhancements
            try {
                window.setHasShadow(false);
                // Enable click-through behavior for Windows
                window.setIgnoreMouseEvents(true, { forward: true });
            } catch (error) {
                console.log('⚠️ Some Windows transparency features not available:', error.message);
            }
        }
        
        // Restore the opacity after transparency settings
        window.setOpacity(this.currentOpacity);
        
        console.log(`🎨 Opacity restored to: ${this.currentOpacity} after transparency settings`);
    }
    
    /**
     * Increase window transparency (decrease opacity)
     */
    increaseTransparency(window) {
        if (!window || window.isDestroyed()) return false;
        
        const oldOpacity = this.currentOpacity;
        const newOpacity = Math.max(0.0, this.currentOpacity - this.OPACITY_STEP);
        
        // Check if we're already at minimum opacity
        if (newOpacity === this.currentOpacity) {
            console.log('⚠️ Already at minimum transparency (0% opacity). Cannot increase further.');
            return false;
        }
        
        this.currentOpacity = newOpacity;
        
        try {
            window.setOpacity(this.currentOpacity);
            const opacityPercent = Math.round(this.currentOpacity * 100);
            console.log(`🎨 Transparency increased: ${Math.round(oldOpacity * 100)}% → ${opacityPercent}% opacity`);
            return true;
        } catch (error) {
            console.error(`❌ Error increasing transparency: ${error.message}`);
            this.currentOpacity = oldOpacity; // Revert on error
            return false;
        }
    }
    
    /**
     * Decrease window transparency (increase opacity)
     */
    decreaseTransparency(window) {
        if (!window || window.isDestroyed()) return false;
        
        const oldOpacity = this.currentOpacity;
        const newOpacity = Math.min(1.0, this.currentOpacity + this.OPACITY_STEP);
        
        // Check if we're already at maximum opacity
        if (newOpacity === this.currentOpacity) {
            console.log('⚠️ Already at maximum transparency (100% opacity). Cannot decrease further.');
            return false;
        }
        
        this.currentOpacity = newOpacity;
        
        try {
            window.setOpacity(this.currentOpacity);
            const opacityPercent = Math.round(this.currentOpacity * 100);
            console.log(`🎨 Transparency decreased: ${Math.round(oldOpacity * 100)}% → ${opacityPercent}% opacity`);
            return true;
        } catch (error) {
            console.error(`❌ Error decreasing transparency: ${error.message}`);
            this.currentOpacity = oldOpacity; // Revert on error
            return false;
        }
    }
    
    /**
     * Reset transparency to default (100% opacity)
     */
    resetTransparency(window) {
        this.currentOpacity = 1.0;
        if (window && !window.isDestroyed()) {
            window.setOpacity(this.currentOpacity);
        }
        console.log('🎨 Transparency reset to default (100% opacity)');
    }
    
    /**
     * Get current transparency state
     */
    getTransparencyState() {
        return {
            currentOpacity: this.currentOpacity,
            opacityPercent: Math.round(this.currentOpacity * 100),
            opacityStep: this.OPACITY_STEP,
            minOpacity: 0.0,
            maxOpacity: 1.0
        };
    }
    
    // =======================
    // OVERLAY STYLING METHODS
    // =======================
    
    /**
     * Apply comprehensive overlay window properties
     */
    applyOverlayWindowProperties(window, bounds) {
        if (!window || window.isDestroyed()) return;
        
        console.log('🎨 Applying comprehensive overlay window properties...');
        
        // Set window dimensions and position
        window.setSize(bounds.width, bounds.height);
        window.setPosition(bounds.x, bounds.y);
        
        // Apply overlay-specific window properties
        window.setAlwaysOnTop(true, 'floating');
        window.setVisibleOnAllWorkspaces(true);
        window.setIgnoreMouseEvents(true, { forward: true }); // Make overlay completely click-through
        
        // Apply transparency with opacity preservation
        this.applyTransparencySettingsWithOpacityPreservation(window);
        
        console.log('🎨 Overlay window properties applied successfully');
        console.log('🖱️ Click-through ENABLED - overlay is completely transparent to mouse events');
    }
    
    /**
     * Generate CSS for dynamic styling injection
     */
    generateDynamicCSS() {
        return `
        <style id="overlay-dynamic-styles">
        /* Dynamic overlay styles managed by OverlayStyleManager */
        
        /* Base typography */
        body {
            font-family: ${this.fontFamily} !important;
            font-size: ${this.fontSize}px !important;
            line-height: 1.4 !important;
        }
        
        /* Glass effects */
        .transcript-area {
            background-color: ${this.glassEffects.transcript.backgroundColor} !important;
            backdrop-filter: ${this.glassEffects.transcript.backdropFilter} !important;
            border: ${this.glassEffects.transcript.border} !important;
            color: ${this.glassEffects.transcript.textColor} !important;
        }
        
        .suggestions-area {
            background-color: ${this.glassEffects.suggestions.backgroundColor} !important;
            backdrop-filter: ${this.glassEffects.suggestions.backdropFilter} !important;
            border: ${this.glassEffects.suggestions.border} !important;
            border-left: ${this.glassEffects.suggestions.borderLeft} !important;
            color: ${this.glassEffects.suggestions.textColor} !important;
        }
        
        .header-bar {
            background-color: ${this.glassEffects.header.backgroundColor} !important;
            backdrop-filter: ${this.glassEffects.header.backdropFilter} !important;
            border: ${this.glassEffects.header.border} !important;
            color: ${this.glassEffects.header.textColor} !important;
        }
        
        .status-bar {
            background-color: ${this.glassEffects.header.backgroundColor} !important;
            backdrop-filter: ${this.glassEffects.header.backdropFilter} !important;
            border: ${this.glassEffects.header.border} !important;
        }
        
        /* Code highlighting */
        .hljs-keyword, .hljs-built_in { 
            color: ${this.codeTheme.keyword} !important; 
            background: ${this.codeTheme.background} !important; 
        }
        .hljs-string { 
            color: ${this.codeTheme.string} !important; 
            background: ${this.codeTheme.background} !important; 
        }
        .hljs-comment { 
            color: ${this.codeTheme.comment} !important; 
            background: ${this.codeTheme.background} !important; 
        }
        .hljs-number { 
            color: ${this.codeTheme.number} !important; 
            background: ${this.codeTheme.background} !important; 
        }
        .hljs-function { 
            color: ${this.codeTheme.function} !important; 
            background: ${this.codeTheme.background} !important; 
        }
        .hljs-variable { 
            color: ${this.codeTheme.variable} !important; 
            background: ${this.codeTheme.background} !important; 
        }
        
        /* Transparent code blocks */
        pre, code {
            background-color: transparent !important;
            background: transparent !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        
        /* Font size adjustments */
        .transcript-line,
        .suggestion-container,
        .suggestions-area p,
        .suggestions-area li,
        .suggestions-area h1,
        .suggestions-area h2,
        .suggestions-area h3,
        .suggestions-area h4,
        .suggestions-area h5,
        .suggestions-area h6 {
            font-size: ${this.fontSize}px !important;
        }
        </style>
        `;
    }
    
    /**
     * Apply glass effects to specific elements (for renderer injection)
     */
    applyGlassEffects(elements) {
        const { transcriptArea, suggestionsArea, headerBar, statusBar } = elements;
        
        if (transcriptArea) {
            const transcript = this.glassEffects.transcript;
            transcriptArea.style.backgroundColor = transcript.backgroundColor;
            transcriptArea.style.backdropFilter = transcript.backdropFilter;
            transcriptArea.style.border = transcript.border;
            transcriptArea.style.color = transcript.textColor;
        }
        
        if (suggestionsArea) {
            const suggestions = this.glassEffects.suggestions;
            suggestionsArea.style.backgroundColor = suggestions.backgroundColor;
            suggestionsArea.style.backdropFilter = suggestions.backdropFilter;
            suggestionsArea.style.border = suggestions.border;
            suggestionsArea.style.borderLeft = suggestions.borderLeft;
            suggestionsArea.style.color = suggestions.textColor;
            suggestionsArea.style.fontSize = `${this.fontSize}px`;
        }
        
        if (headerBar) {
            const header = this.glassEffects.header;
            headerBar.style.backgroundColor = header.backgroundColor;
            headerBar.style.backdropFilter = header.backdropFilter;
            headerBar.style.border = header.border;
            headerBar.style.color = header.textColor;
        }
        
        if (statusBar) {
            const header = this.glassEffects.header;
            statusBar.style.backgroundColor = header.backgroundColor;
            statusBar.style.backdropFilter = header.backdropFilter;
            statusBar.style.border = header.border;
        }
        
        console.log('🎨 Glass effects applied to all overlay elements');
    }
    
    /**
     * Apply font styling to all text elements
     */
    applyFontStyling(suggestionsArea) {
        if (!suggestionsArea) return;
        
        // Update suggestion containers
        const suggestionContainers = suggestionsArea.querySelectorAll('.suggestion-container');
        suggestionContainers.forEach(container => {
            container.style.backgroundColor = 'transparent';
            container.style.borderBottomColor = 'rgba(200, 200, 200, 0.1)';
            container.style.color = this.glassEffects.suggestions.textColor;
            container.style.fontSize = `${this.fontSize}px`;
        });
        
        // Update all text elements in suggestions area
        const textElements = suggestionsArea.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, th, code, pre, ul, ol');
        textElements.forEach(element => {
            element.style.color = this.glassEffects.suggestions.textColor;
            element.style.fontSize = `${this.fontSize}px`;
            
            if (element.tagName === 'LI') {
                element.style.paddingLeft = '2rem';
                element.style.position = 'relative';
                element.style.lineHeight = '1.5';
            }
            
            if (element.tagName === 'UL' || element.tagName === 'OL') {
                element.style.listStyleType = 'none';
                element.style.paddingLeft = '0';
                element.style.counterReset = 'item';
            }
        });
        
        // Update suggestion titles
        const suggestionTitles = suggestionsArea.querySelectorAll('.suggestion-title');
        suggestionTitles.forEach(title => {
            title.style.color = '#c0c0c0';
            title.style.fontSize = `${this.fontSize}px`;
        });
        
        console.log('🎨 Font styling applied to all text elements');
    }
    
    /**
     * Apply transparent styling to code blocks
     */
    applyTransparentCodeBlocks(suggestionsArea) {
        if (!suggestionsArea) return;
        
        const codeBlocks = suggestionsArea.querySelectorAll('pre code');
        codeBlocks.forEach((block, index) => {
            console.log(`🎨 Applying transparent styles to code block ${index}`);
            
            // Apply dark semi-transparent background like in the image
            block.style.cssText = `
                background: rgba(17, 24, 39, 0.8) !important;
                background-color: rgba(17, 24, 39, 0.8) !important;
                border: 1px solid rgba(255, 255, 255, 0.15) !important;
                color: #e5e7eb !important;
                padding: 0.75rem !important;
                border-radius: 0.375rem !important;
            `;
            
            // Apply dark semi-transparent background to the parent pre element
            const pre = block.parentElement;
            if (pre && pre.tagName === 'PRE') {
                pre.style.cssText = `
                    background: rgba(17, 24, 39, 0.8) !important;
                    background-color: rgba(17, 24, 39, 0.8) !important;
                    border: 1px solid rgba(255, 255, 255, 0.15) !important;
                    padding: 0.75rem !important;
                    border-radius: 0.375rem !important;
                `;
            }
            
            // Force transparent background on all child elements
            const children = block.querySelectorAll('*');
            children.forEach(child => {
                child.style.backgroundColor = 'transparent';
                child.style.background = 'transparent';
            });
        });
        
        console.log('🎨 Transparent styling applied to all code blocks');
    }
    
    // =======================
    // THEME MANAGEMENT
    // =======================
    
    /**
     * Update font size
     */
    setFontSize(size) {
        this.fontSize = Math.max(10, Math.min(20, size)); // Clamp between 10-20px
        console.log(`🎨 Font size updated to ${this.fontSize}px`);
    }
    
    /**
     * Update glass effect opacity for specific area
     */
    updateGlassOpacity(area, opacity) {
        if (this.glassEffects[area]) {
            const currentBg = this.glassEffects[area].backgroundColor;
            const rgbaMatch = currentBg.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
            if (rgbaMatch) {
                const [, r, g, b] = rgbaMatch;
                this.glassEffects[area].backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
                console.log(`🎨 ${area} glass opacity updated to ${opacity}`);
            }
        }
    }

    /**
     * CONVENIENCE METHOD: Change suggestions area transparency 
     * Now you only need to call this ONE function instead of updating 3 files!
     */
    setSuggestionsTransparency(opacity) {
        this.updateGlassOpacity('suggestions', opacity);
        console.log(`🎯 SINGLE SOURCE: Suggestions transparency set to ${opacity} (${Math.round(opacity * 100)}%)`);
        
        // Automatically re-apply to any active elements
        const suggestionsArea = document.getElementById('suggestionsArea');
        if (suggestionsArea) {
            suggestionsArea.style.backgroundColor = this.glassEffects.suggestions.backgroundColor;
            console.log('🔄 Auto-updated active suggestions area');
        }
        
        return opacity;
    }
    
    /**
     * Switch between light and dark themes
     */
    setTheme(theme) {
        this.currentTheme = theme;
        
        if (theme === 'light') {
            // Light theme adjustments
            this.glassEffects.transcript.textColor = '#1a202c';
            this.glassEffects.suggestions.textColor = '#2d3748';
            this.glassEffects.transcript.backgroundColor = 'rgba(247, 250, 252, 0.8)';
            this.glassEffects.suggestions.backgroundColor = 'rgba(237, 242, 247, 0.9)';
        } else {
            // Dark theme (default)
            this.glassEffects.transcript.textColor = '#2d3748';
            this.glassEffects.suggestions.textColor = '#d0d0d0';
            this.glassEffects.transcript.backgroundColor = 'rgba(26, 32, 44, 0.3)';
            this.glassEffects.suggestions.backgroundColor = 'rgba(26, 32, 44, 0.4)';
        }
        
        console.log(`🎨 Theme switched to ${theme}`);
    }
    
    // =======================
    // UTILITY METHODS
    // =======================
    
    /**
     * Get current style configuration
     */
    getStyleConfig() {
        return {
            theme: this.currentTheme,
            fontSize: this.fontSize,
            fontFamily: this.fontFamily,
            transparency: this.getTransparencyState(),
            glassEffects: this.glassEffects,
            codeTheme: this.codeTheme
        };
    }
    
    /**
     * Export style configuration for saving
     */
    exportConfig() {
        return JSON.stringify(this.getStyleConfig(), null, 2);
    }
    
    /**
     * Import style configuration from saved data
     */
    importConfig(config) {
        try {
            const parsed = typeof config === 'string' ? JSON.parse(config) : config;
            
            if (parsed.fontSize) this.fontSize = parsed.fontSize;
            if (parsed.fontFamily) this.fontFamily = parsed.fontFamily;
            if (parsed.theme) this.setTheme(parsed.theme);
            if (parsed.glassEffects) this.glassEffects = { ...this.glassEffects, ...parsed.glassEffects };
            if (parsed.codeTheme) this.codeTheme = { ...this.codeTheme, ...parsed.codeTheme };
            
            console.log('🎨 Style configuration imported successfully');
            return true;
        } catch (error) {
            console.error('❌ Error importing style configuration:', error);
            return false;
        }
    }
}

// Export singleton instance
const overlayStyleManager = new OverlayStyleManager();

module.exports = {
    OverlayStyleManager,
    overlayStyleManager
}; 