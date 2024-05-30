const { ipcRenderer } = require("electron");

let selectedDirectory = null;

document.addEventListener("DOMContentLoaded", () => {
  const startButton = document.getElementById("startButton");
  const stopButton = document.getElementById("stopButton");
  const intervalInput = document.getElementById("intervalInput");
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
    const interval = parseInt(intervalInput.value, 10);
    ipcRenderer.send("start-recording", {
      interval,
      directory: selectedDirectory,
    });
  });

  stopButton.addEventListener("click", () => {
    ipcRenderer.send("stop-recording");
  });

  ipcRenderer.on("recording-status", (event, status) => {
    console.log(status);
  });
});
