// list-gemini-models.js
// Script to test available Gemini models using the Google Generative AI API
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// List of Gemini models to test
const MODELS_TO_TEST = [
  "gemini-2.5-pro-preview-05-06",	
  "gemini-2.0-flash",
  "gemini-pro",
  "gemini-pro-vision",
  "gemini-1.0-pro",
  "gemini-1.0-pro-vision",
  "gemini-1.0-pro-latest",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "embedding-001",
  "embedding-latest"
];

async function testGeminiModels() {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not found in environment variables');
      return;
    }
    
    console.log('Initializing Google Generative AI with provided API key...');
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    
    console.log('\n===== TESTING GEMINI MODELS =====');
    console.log(`Testing ${MODELS_TO_TEST.length} models...\n`);
    
    const results = [];
    
    for (const modelName of MODELS_TO_TEST) {
      try {
        console.log(`Testing model: ${modelName}...`);
        
        // Try to instantiate the model
        const model = genAI.getGenerativeModel({ model: modelName });
        
        // Try to generate a simple test response
        let response;
        try {
          // For embedding models, use a different method
          if (modelName.includes('embedding')) {
            response = await model.embedContent('Hello world');
            console.log(`  ✅ SUCCESS: ${modelName} - Got embedding of length: ${response.embedding.values.length}`);
          } else {
            response = await model.generateContent('Hello, what models are available?');
            const responseText = response.response.text();
            const preview = responseText.length > 50 ? responseText.substring(0, 50) + '...' : responseText;
            console.log(`  ✅ SUCCESS: ${modelName} - Response: "${preview}"`);
          }
          
          results.push({ model: modelName, status: 'AVAILABLE', response: response });
        } catch (genError) {
          console.log(`  ❌ ERROR: ${modelName} - Could not generate content: ${genError.message}`);
          results.push({ model: modelName, status: 'INSTANTIATED_BUT_GENERATION_FAILED', error: genError.message });
        }
      } catch (error) {
        console.log(`  ❌ ERROR: ${modelName} - ${error.message}`);
        results.push({ model: modelName, status: 'UNAVAILABLE', error: error.message });
      }
    }
    
    // Display summary
    console.log('\n===== RESULTS SUMMARY =====');
    const availableModels = results.filter(r => r.status === 'AVAILABLE');
    const partialModels = results.filter(r => r.status === 'INSTANTIATED_BUT_GENERATION_FAILED');
    const unavailableModels = results.filter(r => r.status === 'UNAVAILABLE');
    
    console.log(`Available models (${availableModels.length}):`);
    availableModels.forEach(m => console.log(`  - ${m.model}`));
    
    console.log(`\nPartially available models (${partialModels.length}):`);
    partialModels.forEach(m => console.log(`  - ${m.model}: ${m.error}`));
    
    console.log(`\nUnavailable models (${unavailableModels.length}):`);
    unavailableModels.forEach(m => console.log(`  - ${m.model}: ${m.error}`));
    
    console.log('\n============================');
    
    // Recommend models to use based on results
    console.log('\n===== RECOMMENDATIONS =====');
    if (availableModels.length > 0) {
      console.log('Recommended models for your API key:');
      availableModels.forEach(m => console.log(`  model: "${m.model}"`));
      
      // Update the project with the best available model
      console.log('\nTo update your project, edit src/electron/utils/ai_service.js:');
      console.log(`geminiModel = genAI.getGenerativeModel({ model: "${availableModels[0].model}" });`);
    } else {
      console.log('No fully functional models found for your API key.');
      console.log('Please check your API key permissions or request access to Gemini models.');
    }
    
  } catch (error) {
    console.error('Error testing Gemini models:');
    console.error(error);
  }
}

// Execute the function
testGeminiModels(); 