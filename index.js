const { app, Tray, Menu, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const { exec } = require("child_process");

ffmpeg.setFfmpegPath(ffmpegStatic);

let tray = null;
let currentRecordingProcess = null;
const configPath = path.join(__dirname, "config.json");

function readConfig() {
  if (fs.existsSync(configPath)) {
    const rawConfig = fs.readFileSync(configPath);
    return JSON.parse(rawConfig);
  } else {
    console.error("Config file not found!");
    app.quit();
  }
}

function isWithinRecordingHours(startHour, stopHour) {
  const now = new Date();
  const currentHour = now.getHours();
  return currentHour >= startHour && currentHour < stopHour;
}

function startRecording(config) {
  if (!isWithinRecordingHours(config.startHour, config.stopHour)) {
    console.log(
      "Current time is outside of recording hours. Skipping recording."
    );
    setTimeout(() => startRecording(config), 60000); // Retry every minute
    return;
  }

  const recordingPath = path.join(
    config.directory,
    `recording-${Date.now()}.mp4`
  );

  const ffmpegCommand = `${ffmpegStatic} -y -f gdigrab -framerate 10 -probesize 10M -i desktop -t ${config.videoDuration} -vf "scale=1280:720" -c:v libx264 -preset ultrafast -crf 28 ${recordingPath}`;

  console.log(`Executing FFmpeg command: ${ffmpegCommand}`);

  currentRecordingProcess = exec(ffmpegCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`FFmpeg error: ${error.message}`);
    }
    if (stderr) {
      console.error(`FFmpeg stderr: ${stderr}`);
    }
    console.log(`FFmpeg stdout: ${stdout}`);
    // Start a new recording immediately after this one ends, if within recording hours
    setTimeout(() => startRecording(config), 1000); // Add a slight delay before starting the next recording
  });
}

app.whenReady().then(() => {
  const config = readConfig();

  const iconPath = path.join(__dirname, "icon.png");
  if (!fs.existsSync(iconPath)) {
    console.error(`Failed to load image from path '${iconPath}'`);
    app.quit();
    return;
  }

  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Start Recording",
      click: () => {
        console.log("Starting recording schedule");
        startRecording(config);
      },
    },
    {
      label: "Stop Recording",
      click: () => {
        console.log("Stopping recording schedule");
        if (currentRecordingProcess) {
          currentRecordingProcess.kill("SIGINT");
          currentRecordingProcess = null;
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setToolTip("Screen Recorder");
  tray.setContextMenu(contextMenu);

  console.log("Tray application started");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
