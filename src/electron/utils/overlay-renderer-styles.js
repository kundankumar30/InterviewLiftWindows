/**
 * Overlay Renderer Styles
 * Client-side companion to OverlayStyleManager for overlay styling in the renderer process
 */

const { ipcRenderer } = require('electron');

class OverlayRendererStyles {
    constructor() {
        this.isInitialized = false;
        console.log('🎨 OverlayRendererStyles initialized in renderer');
    }
    
    /**
     * Initialize styling after DOM is loaded
     */
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            // Get current style configuration from main process
            const styleConfig = await ipcRenderer.invoke('get-style-config');
            console.log('🎨 Received style configuration from main process:', styleConfig);
            
            // Apply initial styling
            this.applyAllStyles(styleConfig);
            
            this.isInitialized = true;
            console.log('✅ OverlayRendererStyles initialization complete');
        } catch (error) {
            console.error('❌ Failed to initialize OverlayRendererStyles:', error);
        }
    }
    
    /**
     * Apply all overlay styles based on configuration
     */
    applyAllStyles(config) {
        if (!config) return;
        
        console.log('🎨 Applying comprehensive overlay styles...');
        
        // Apply glass effects
        this.applyGlassEffects(config.glassEffects);
        
        // Apply font styling
        this.applyFontStyling(config.fontSize, config.fontFamily);
        
        // Apply code highlighting
        this.applyCodeHighlighting(config.codeTheme);
        
        // Apply transparent code blocks
        this.applyTransparentCodeBlocks();
        
        console.log('✅ All overlay styles applied');
    }
    
    /**
     * Apply glass effects to overlay areas
     */
    applyGlassEffects(glassEffects) {
        if (!glassEffects) return;
        
        const transcriptArea = document.getElementById('transcriptArea');
        const suggestionsArea = document.getElementById('suggestionsArea');
        const headerBar = document.querySelector('.header-bar');
        const statusBar = document.querySelector('.status-bar');
        
        if (transcriptArea && glassEffects.transcript) {
            const config = glassEffects.transcript;
            transcriptArea.style.backgroundColor = config.backgroundColor;
            transcriptArea.style.backdropFilter = config.backdropFilter;
            transcriptArea.style.border = config.border;
            transcriptArea.style.color = config.textColor;
            console.log('🎨 Applied glass effects to transcript area');
        }
        
        if (suggestionsArea && glassEffects.suggestions) {
            const config = glassEffects.suggestions;
            suggestionsArea.style.backgroundColor = config.backgroundColor;
            suggestionsArea.style.backdropFilter = config.backdropFilter;
            suggestionsArea.style.border = config.border;
            suggestionsArea.style.borderLeft = config.borderLeft;
            suggestionsArea.style.color = config.textColor;
            console.log('🎨 Applied glass effects to suggestions area');
        }
        
        if (headerBar && glassEffects.header) {
            const config = glassEffects.header;
            headerBar.style.backgroundColor = config.backgroundColor;
            headerBar.style.backdropFilter = config.backdropFilter;
            headerBar.style.border = config.border;
            headerBar.style.color = config.textColor;
            console.log('🎨 Applied glass effects to header bar');
        }
        
        if (statusBar && glassEffects.header) {
            const config = glassEffects.header;
            statusBar.style.backgroundColor = config.backgroundColor;
            statusBar.style.backdropFilter = config.backdropFilter;
            statusBar.style.border = config.border;
            console.log('🎨 Applied glass effects to status bar');
        }
    }
    
    /**
     * Apply font styling to all text elements
     */
    applyFontStyling(fontSize, fontFamily) {
        if (!fontSize || !fontFamily) return;
        
        // Apply base font styling
        document.body.style.fontFamily = fontFamily;
        document.body.style.fontSize = `${fontSize}px`;
        
        const suggestionsArea = document.getElementById('suggestionsArea');
        if (!suggestionsArea) return;
        
        // Update suggestion containers
        const suggestionContainers = suggestionsArea.querySelectorAll('.suggestion-container');
        suggestionContainers.forEach(container => {
            container.style.backgroundColor = 'transparent';
            container.style.borderBottomColor = 'rgba(200, 200, 200, 0.1)';
            container.style.fontSize = `${fontSize}px`;
        });
        
        // Update all text elements
        const textElements = suggestionsArea.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, th, code, pre, ul, ol');
        textElements.forEach(element => {
            element.style.fontSize = `${fontSize}px`;
            
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
            title.style.fontSize = `${fontSize}px`;
        });
        
        // Update transcript lines
        const transcriptLines = document.querySelectorAll('.transcript-line');
        transcriptLines.forEach(line => {
            line.style.fontSize = `${fontSize}px`;
        });
        
        console.log(`🎨 Applied font styling: ${fontSize}px ${fontFamily}`);
    }
    
    /**
     * Apply code highlighting theme
     */
    applyCodeHighlighting(codeTheme) {
        if (!codeTheme) return;
        
        // Create or update dynamic style element
        let styleElement = document.getElementById('dynamic-code-highlighting');
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = 'dynamic-code-highlighting';
            document.head.appendChild(styleElement);
        }
        
        styleElement.textContent = `
            .hljs-keyword, .hljs-built_in { 
                color: ${codeTheme.keyword} !important; 
                background: ${codeTheme.background} !important; 
            }
            .hljs-string { 
                color: ${codeTheme.string} !important; 
                background: ${codeTheme.background} !important; 
            }
            .hljs-comment { 
                color: #d1d5db !important; 
                background: transparent !important; 
            }
            .hljs-number { 
                color: ${codeTheme.number} !important; 
                background: ${codeTheme.background} !important; 
            }
            .hljs-function { 
                color: ${codeTheme.function} !important; 
                background: ${codeTheme.background} !important; 
            }
            .hljs-variable { 
                color: ${codeTheme.variable} !important; 
                background: ${codeTheme.background} !important; 
            }
        `;
        
        console.log('🎨 Applied code highlighting theme');
    }
    
    /**
     * Apply transparent styling to code blocks
     */
    applyTransparentCodeBlocks() {
        const suggestionsArea = document.getElementById('suggestionsArea');
        if (!suggestionsArea) return;
        
        const codeBlocks = suggestionsArea.querySelectorAll('pre code');
        codeBlocks.forEach((block, index) => {
            console.log(`🎨 Applying transparent styles to code block ${index}`);
            
            // Apply transparent styles to the code block
            block.style.cssText = `
                background: transparent !important;
                background-color: transparent !important;
                border: 1px solid rgba(255, 255, 255, 0.15) !important;
                color: #e2e8f0 !important;
            `;
            
            // Apply transparent styles to the parent pre element
            const pre = block.parentElement;
            if (pre && pre.tagName === 'PRE') {
                pre.style.cssText = `
                    background: transparent !important;
                    background-color: transparent !important;
                    border: 1px solid rgba(255, 255, 255, 0.15) !important;
                `;
            }
            
            // Force transparent background on all child elements
            const children = block.querySelectorAll('*');
            children.forEach(child => {
                child.style.backgroundColor = 'transparent';
                child.style.background = 'transparent';
            });
        });
        
        console.log('🎨 Applied transparent styling to all code blocks');
    }
    
    /**
     * Update font size dynamically
     */
    async updateFontSize(newSize) {
        try {
            // Update local styling
            this.applyFontStyling(newSize, document.body.style.fontFamily);
            
            // Notify main process to update configuration
            ipcRenderer.send('update-style-config', { fontSize: newSize });
            
            console.log(`🎨 Font size updated to ${newSize}px`);
        } catch (error) {
            console.error('❌ Failed to update font size:', error);
        }
    }
    
    /**
     * Refresh all styles (useful after content updates)
     */
    async refreshStyles() {
        try {
            const styleConfig = await ipcRenderer.invoke('get-style-config');
            this.applyAllStyles(styleConfig);
            console.log('🔄 Styles refreshed');
        } catch (error) {
            console.error('❌ Failed to refresh styles:', error);
        }
    }
    
    /**
     * Handle window show event to reapply styles
     */
    onWindowShown() {
        // Reapply styles after window is shown
        setTimeout(() => {
            this.refreshStyles();
        }, 100);
    }
}

// Export for use in overlay renderer
const overlayRendererStyles = new OverlayRendererStyles();

// Auto-initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        overlayRendererStyles.initialize();
    });
} else {
    overlayRendererStyles.initialize();
}

// Listen for window events
if (typeof ipcRenderer !== 'undefined') {
    ipcRenderer.on('window-shown', () => {
        overlayRendererStyles.onWindowShown();
    });
}

// Make available globally for the overlay renderer
if (typeof window !== 'undefined') {
    window.overlayRendererStyles = overlayRendererStyles;
}

module.exports = { OverlayRendererStyles, overlayRendererStyles }; 