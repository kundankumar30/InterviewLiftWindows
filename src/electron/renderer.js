const { ipcRenderer, shell } = require("electron");
const path = require("path");

// --- General UI Elements ---
const startButton = document.getElementById("start-recording");
const stopButton = document.getElementById("stop-recording");
const elapsedTimeDisplay = document.getElementById("elapsed-time");
const transcriptionOutput = document.getElementById('live-transcription-output');

let startTime;
let updateTimer;
let currentTranscriptLine = ''; // To build up current spoken line

// Hide file-specific UI if live transcription is the primary mode
const fileRecordingUIDiv = document.getElementById("file-recording-ui");
if (fileRecordingUIDiv) fileRecordingUIDiv.style.display = 'none';
const outputFilePathContainer = document.getElementById("output-file-path-container");
if (outputFilePathContainer) outputFilePathContainer.style.display = 'none';

// --- Event Listeners for Buttons ---
if (startButton) {
    startButton.addEventListener("click", () => {
        startButton.innerHTML = `Starting <span class="inline-block ml-4 w-4 h-4 border-4 border-t-transparent border-white rounded-full animate-spin"></span>`;
        ipcRenderer.send("start-recording");
    });
}

if (stopButton) {
    stopButton.addEventListener("click", () => {
        ipcRenderer.send("stop-recording");
    });
}

// --- IPC Event Handlers from Main Process ---
ipcRenderer.on("recording-status", (_, status, timestamp, filepath) => {
    if (!startButton || !stopButton || !elapsedTimeDisplay || !transcriptionOutput) return;

    if (status === "LIVE_TRANSCRIPTION_STARTED") {
        startTime = timestamp;
        updateElapsedTime();
        startButton.innerHTML = "Start Transcription";
        startButton.disabled = true;
        stopButton.disabled = false;
        transcriptionOutput.textContent = 'Listening...';
        currentTranscriptLine = '';
    } else if (status === "LIVE_TRANSCRIPTION_STOPPED") {
        clearTimeout(updateTimer);
        startButton.disabled = false;
        stopButton.disabled = true;
        if (transcriptionOutput.textContent === 'Listening...') {
            transcriptionOutput.textContent = 'Stopped. Waiting for transcription...';
        }
    } else if (status === "LIVE_TRANSCRIPTION_FAILED_TO_START") {
        startButton.innerHTML = "Start Transcription";
        startButton.disabled = false;
        stopButton.disabled = true;
        if (transcriptionOutput) transcriptionOutput.textContent = 'Failed to start. Please try again.';
    }
});

ipcRenderer.on('transcription-update', (event, transcriptSegment) => {
    if (!transcriptionOutput) return;

    if (transcriptionOutput.textContent === "Waiting for transcription..." || 
        transcriptionOutput.textContent === "Listening..." ||
        transcriptionOutput.textContent === "Stopped. Waiting for transcription..." ||
        transcriptionOutput.textContent.startsWith("Failed to start")) {
        transcriptionOutput.innerHTML = '';
        currentTranscriptLine = '';
    }

    // Attempt to replace/update the last line if it seems continuous
    const lines = transcriptionOutput.innerHTML.split('<br>');
    const lastLineText = lines.length > 0 ? lines[lines.length -1] : "";

    if (transcriptSegment.startsWith(currentTranscriptLine) || 
        currentTranscriptLine.startsWith(transcriptSegment.substring(0, Math.max(0, transcriptSegment.length - 5)))) {
        currentTranscriptLine = transcriptSegment;
        lines[lines.length > 0 ? lines.length - 1 : 0] = currentTranscriptLine;
        transcriptionOutput.innerHTML = lines.filter(line => line.length > 0).join('<br>');
    } else {
        transcriptionOutput.innerHTML += (transcriptionOutput.innerHTML.length > 0 && transcriptionOutput.innerHTML.slice(-4) !== '<br>' ? '<br>' : '') + transcriptSegment;
        currentTranscriptLine = transcriptSegment;
    }
    transcriptionOutput.scrollTop = transcriptionOutput.scrollHeight;
});

// --- Helper Functions ---
function updateElapsedTime() {
    if (!startTime || !elapsedTimeDisplay) return;
    const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
    elapsedTimeDisplay.textContent = `${elapsedTime}s`;
    updateTimer = setTimeout(updateElapsedTime, 1000);
} 