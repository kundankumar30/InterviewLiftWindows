const { ipcMain } = require("electron");
const { startLiveTranscription, stopLiveTranscription, resetFullTranscriptionService, clearConversationHistory } = require("../utils/recording");
const { raceScreenshotResponse } = require("../utils/ai_race");

/**
 * Recording and AI Handlers Module
 * Handles recording operations, AI services, and related IPC communication
 */

function registerRecordingHandlers(registerIPCHandler, mainWindow) {
  // Start recording handler
  registerIPCHandler("start-recording", async (_, args) => {
    try {
      console.log('🎙️ Starting recording with args:', args);
      
      const result = await startLiveTranscription(args);
      
      if (result.success) {
        console.log('✅ Recording started successfully');
      } else {
        console.error('❌ Recording failed to start:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Start recording handler error:', error);
      return { success: false, error: error.message };
    }
  }, true);

  // Stop recording handler
  registerIPCHandler("stop-recording", () => {
    try {
      console.log('🛑 Stopping recording...');
      
      const result = stopLiveTranscription();
      
      if (result.success) {
        console.log('✅ Recording stopped successfully');
      } else {
        console.error('❌ Failed to stop recording:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Stop recording handler error:', error);
      return { success: false, error: error.message };
    }
  }, true);

  // Reset speech-to-text handler
  registerIPCHandler("reset-stt", async () => {
    try {
      console.log('🔄 Resetting speech-to-text service...');
      
      const result = await resetFullTranscriptionService();
      
      if (result.success) {
        console.log('✅ STT service reset successfully');
      } else {
        console.error('❌ Failed to reset STT service:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Reset STT handler error:', error);
      return { success: false, error: error.message };
    }
  }, true);

  // Clear conversation history handler
  registerIPCHandler("clear-conversation-history", () => {
    try {
      console.log('🧹 Clearing conversation history...');
      
      const result = clearConversationHistory();
      
      if (result.success) {
        console.log('✅ Conversation history cleared successfully');
      } else {
        console.error('❌ Failed to clear conversation history:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Clear conversation history handler error:', error);
      return { success: false, error: error.message };
    }
  });

  // Generate screenshot solution handler
  ipcMain.on("generate-screenshot-solution", async (event, { screenshots, jobRole, keySkills }) => {
    try {
      console.log('📸 Generating screenshot solution...', {
        screenshotCount: screenshots?.length || 0,
        jobRole,
        keySkillsCount: keySkills?.length || 0
      });

      if (!screenshots || screenshots.length === 0) {
        console.error('❌ No screenshots provided');
        event.reply("screenshot-solution-result", {
          success: false,
          error: "No screenshots provided"
        });
        return;
      }

      // Use the AI race service to get the best response
      const result = await raceScreenshotResponse(screenshots, jobRole, keySkills);

      if (result.success) {
        console.log('✅ Screenshot solution generated successfully');
        console.log('🏆 Winning service:', result.winningService);
        
        event.reply("screenshot-solution-result", {
          success: true,
          solution: result.response,
          winningService: result.winningService,
          responseTime: result.responseTime,
          tokensUsed: result.tokensUsed
        });
      } else {
        console.error('❌ Screenshot solution generation failed:', result.error);
        
        event.reply("screenshot-solution-result", {
          success: false,
          error: result.error,
          details: result.details
        });
      }
    } catch (error) {
      console.error('❌ Screenshot solution handler error:', error);
      
      event.reply("screenshot-solution-result", {
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  });

  console.log('✅ Recording handlers registered successfully');
}

module.exports = {
  registerRecordingHandlers
}; 