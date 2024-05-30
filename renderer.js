const { ipcRenderer } = require("electron");

document.addEventListener("DOMContentLoaded", () => {
  const startButton = document.getElementById("startButton");
  const stopButton = document.getElementById("stopButton");
  const intervalInput = document.getElementById("intervalInput");

  startButton.addEventListener("click", () => {
    const interval = parseInt(intervalInput.value, 10);
    ipcRenderer.send("start-recording", interval);
  });

  stopButton.addEventListener("click", () => {
    ipcRenderer.send("stop-recording");
  });

  ipcRenderer.on("recording-status", (event, status) => {
    console.log(status);
  });
});
