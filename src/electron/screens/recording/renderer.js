const { ipcRenderer, shell } = require("electron");
const path = require("path");
const os = require("os");

// --- General UI Elements ---
const startButton = document.getElementById("start-recording");
const stopButton = document.getElementById("stop-recording");
const elapsedTimeDisplay = document.getElementById("elapsed-time");
const transcriptionOutput = document.getElementById('live-transcription-output');
const videoThumbnailElement = document.getElementById('video-thumbnail');

let startTime;
let updateTimer;
let currentTranscriptLine = ''; // To build up current spoken line

// Hide file-specific UI if live transcription is the primary mode
const fileRecordingUIDiv = document.getElementById("file-recording-ui");
if (fileRecordingUIDiv) fileRecordingUIDiv.style.display = 'none';
const outputFilePathContainer = document.getElementById("output-file-path-container");
if (outputFilePathContainer) outputFilePathContainer.style.display = 'none';

let selectedFolderPath = path.join(os.homedir(), "Desktop");
document.getElementById("selected-folder-path").textContent = selectedFolderPath;

let recordingFilename = null;

document.getElementById("select-folder").addEventListener("click", () => {
  ipcRenderer.send("open-folder-dialog");
});

ipcRenderer.on("selected-folder", (_, path) => {
  selectedFolderPath = path;

  document.getElementById("selected-folder-path").textContent = selectedFolderPath;
});

document.getElementById("recording-filename").addEventListener("input", (event) => {
  recordingFilename = event.target.value;
});

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
    console.log('Received transcription update:', transcriptSegment);
    if (!transcriptionOutput) {
        console.log('transcriptionOutput element not found');
        return;
    }

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

function updateElapsedTime() {
    const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById("elapsed-time").textContent = `${elapsedTime}s`;
    updateTimer = setTimeout(updateElapsedTime, 1000);
}

document.getElementById("output-file-path").addEventListener("click", () => {
  const filePath = document.getElementById("output-file-path").textContent;
  const parentDir = path.dirname(filePath);

  shell.openPath(parentDir);
});

ipcRenderer.on('video-frame', (event, base64ImageData) => {
  if (videoThumbnailElement) {
    videoThumbnailElement.src = 'data:image/jpeg;base64,' + base64ImageData;
  }
});
