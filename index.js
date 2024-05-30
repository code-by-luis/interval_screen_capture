const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const fs = require("fs");

ffmpeg.setFfmpegPath(ffmpegStatic);

let recordingSchedule;

function scheduleRecording(videoDuration, recordingInterval, scheduleDuration) {
  const endTime = Date.now() + scheduleDuration * 60 * 60 * 1000; // scheduleDuration in hours
  console.log("Schedule recording until", new Date(endTime).toLocaleString());

  function recordAndScheduleNext() {
    if (Date.now() < endTime) {
      console.log("Next recording scheduled at", new Date().toLocaleString());
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("start-recording", videoDuration);
      });

      // Schedule the next recording
      recordingSchedule = setTimeout(
        recordAndScheduleNext,
        recordingInterval * 60 * 1000
      ); // recordingInterval in minutes
    } else {
      console.log("Schedule finished");
    }
  }

  recordAndScheduleNext();
}

ipcMain.on(
  "start-recording",
  (event, { videoDuration, recordingInterval, scheduleDuration }) => {
    console.log("Start recording schedule:", {
      videoDuration,
      recordingInterval,
      scheduleDuration,
    });
    scheduleRecording(videoDuration, recordingInterval, scheduleDuration);
    event.sender.send("recording-status", "Recording started");
  }
);

ipcMain.on("stop-recording", (event) => {
  console.log("Stop recording schedule");
  clearTimeout(recordingSchedule);
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send("stop-recording");
  });
  event.sender.send("recording-status", "Recording stopped");
});

ipcMain.on("open-directory-dialog", async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (!result.canceled) {
    console.log("Directory selected:", result.filePaths[0]);
    event.sender.send("selected-directory", result.filePaths[0]);
  }
});

ipcMain.on("convert-video", (event, rawVideoPath) => {
  const mp4VideoPath = rawVideoPath.replace(".webm", ".mp4");

  // Validate the input file before conversion
  if (!fs.existsSync(rawVideoPath)) {
    console.error(`File not found: ${rawVideoPath}`);
    return;
  }

  // Check the file size to ensure it is not zero
  const stats = fs.statSync(rawVideoPath);
  if (stats.size === 0) {
    console.error(`File is empty: ${rawVideoPath}`);
    return;
  }

  console.log(`Starting conversion of file: ${rawVideoPath}`);

  ffmpeg(rawVideoPath)
    .output(mp4VideoPath)
    .videoCodec("libx264")
    .outputOptions([
      "-preset slow", // Use slower preset for better compression
      "-crf 28", // Constant Rate Factor for quality control (0-51, where lower is better quality)
      "-r 5", // Ensure frame rate is set to 5 fps
    ])
    .on("start", (commandLine) => {
      console.log(`FFmpeg process started with command: ${commandLine}`);
    })
    .on("end", () => {
      console.log(`Video converted to ${mp4VideoPath}`);
      // Optionally delete the raw WebM file after conversion
      fs.unlink(rawVideoPath, (err) => {
        if (err) {
          console.error("Failed to delete raw video file", err);
        } else {
          console.log("Raw video file deleted");
        }
      });
    })
    .on("error", (err, stdout, stderr) => {
      console.error("Failed to convert video", err);
      console.error(`FFmpeg stdout: ${stdout}`);
      console.error(`FFmpeg stderr: ${stderr}`);
    })
    .run();
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
  win.webContents.openDevTools(); // Open DevTools
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
