const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const screenshot = require("screenshot-desktop");

let recordingInterval;

function startRecording(interval) {
  recordingInterval = setInterval(() => {
    screenshot
      .all()
      .then((imgs) => {
        imgs.forEach((img, index) => {
          const screenshotPath = path.join(
            app.getPath("pictures"),
            `screenshot-${Date.now()}-${index}.jpg`
          );
          fs.writeFile(screenshotPath, img, (err) => {
            if (err) return console.error(err);
            console.log(`Screenshot saved to ${screenshotPath}`);
          });
        });
      })
      .catch((err) => {
        console.error(err);
      });
  }, interval * 60000); // interval is in minutes
}

function stopRecording() {
  clearInterval(recordingInterval);
}

ipcMain.on("start-recording", (event, interval) => {
  startRecording(interval);
  event.sender.send("recording-status", "Recording started");
});

ipcMain.on("stop-recording", (event) => {
  stopRecording();
  event.sender.send("recording-status", "Recording stopped");
});

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
