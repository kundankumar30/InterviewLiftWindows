# AI Race Implementation

This folder contains the implementation of a race between Gemini and OpenAI models, where the first model to respond will have its output displayed to the user.

## Overview

The AI race implementation allows the Interview Lift app to run multiple AI models in parallel and use the response from whichever model returns first. This approach provides:

1. **Redundancy**: If one model service is down or experiencing issues, the other can still provide a response
2. **Performance optimization**: Using whichever model responds faster for each individual query
3. **Feature comparison**: Allows testing both models with the same prompts to evaluate performance

## Implementation Details

### Files

- `ai_race.js`: Core implementation of the race between AI models
- `ai_service.js`: Gemini API implementation (using specific models for different tasks)
- `openai_service.js`: OpenAI API implementation
- `recording.js`: Integrated with the race implementation for text transcriptions

### Model Selection

- **Text/Transcription Queries**: 
  - Gemini: `gemini-2.5-flash-preview-05-20`
  - OpenAI: `gpt-4o-2024-05-13`

- **Screenshot Analysis**:
  - Gemini: `gemini-2.5-pro-preview`
  - OpenAI: `gpt-4o-2024-05-13`

## Setup

To use the AI race functionality, you need:

1. A Gemini API key from Google AI Studio
2. An OpenAI API key 

Add these to your `.env` file:

```
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

## How It Works

1. Both AI services are initialized at startup
2. When a request is made, identical prompts are sent to both models simultaneously
3. The first model to start streaming a response is selected as the "winner"
4. Only chunks from the winning model are forwarded to the UI
5. The race logs timing and performance data to the console for analysis

## Fallback Mechanism

If the winning model encounters an error during streaming, the implementation includes a fallback mechanism to switch to the other model's response if available.

## Logging

The race implementation includes detailed logging that shows:
- Which model responded first
- How much faster the winning model was
- Total response times for both models
- Any errors or fallbacks that occurred

This information can be used to analyze model performance patterns over time. 