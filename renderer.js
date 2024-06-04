const { ipcRenderer, remote } = require("electron");
const path = require("path");
const fs = require("fs");

let selectedDirectory = null;
let mediaRecorder;
let chunks = [];

document.addEventListener("DOMContentLoaded", () => {
  const startButton = document.getElementById("startButton");
  const stopButton = document.getElementById("stopButton");
  const videoDurationInput = document.getElementById("videoDurationInput");
  const recordingIntervalInput = document.getElementById(
    "recordingIntervalInput"
  );
  const scheduleDurationInput = document.getElementById(
    "scheduleDurationInput"
  );
  const selectDirectoryButton = document.getElementById(
    "selectDirectoryButton"
  );
  const selectedDirectoryDisplay = document.getElementById("selectedDirectory");

  selectDirectoryButton.addEventListener("click", () => {
    ipcRenderer.send("open-directory-dialog");
  });

  ipcRenderer.on("selected-directory", (event, path) => {
    selectedDirectory = path;
    selectedDirectoryDisplay.textContent = `Selected Directory: ${path}`;
  });

  startButton.addEventListener("click", () => {
    const videoDuration = parseInt(videoDurationInput.value, 10);
    const recordingInterval = parseInt(recordingIntervalInput.value, 10);
    const scheduleDuration = parseInt(scheduleDurationInput.value, 10);
    ipcRenderer.send("start-recording", {
      videoDuration,
      recordingInterval,
      scheduleDuration,
      directory: selectedDirectory,
    });
  });

  stopButton.addEventListener("click", () => {
    ipcRenderer.send("stop-recording");
  });

  ipcRenderer.on("start-recording", async (event, videoDuration) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            minWidth: 1280,
            maxWidth: 1280,
            minHeight: 720,
            maxHeight: 720,
            maxFrameRate: 5,
          },
        },
      });

      mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm; codecs=vp9",
        videoBitsPerSecond: 500000,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const completeBlob = new Blob(chunks, { type: "video/webm" });
        const arrayBuffer = await completeBlob.arrayBuffer();
        const recordingPath = path.join(
          selectedDirectory || remote.app.getPath("videos"),
          `recording-${Date.now()}.webm`
        );

        fs.writeFile(recordingPath, Buffer.from(arrayBuffer), (err) => {
          if (err) {
            console.error("Failed to save video", err);
          } else {
            console.log(`Video saved to ${recordingPath}`);
            ipcRenderer.send("convert-video", recordingPath);
          }
        });

        chunks = [];
      };

      mediaRecorder.start();
      setTimeout(() => mediaRecorder.stop(), videoDuration * 1000);
    } catch (err) {
      console.error("Error accessing media devices.", err);
    }
  });

  ipcRenderer.on("stop-recording", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  });
});
