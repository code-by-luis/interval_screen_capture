const { app, Tray, Menu, screen, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const { exec } = require("child_process");
const AutoLaunch = require("auto-launch");

ffmpeg.setFfmpegPath(ffmpegStatic);

let tray = null;
let currentRecordingProcess = null;
const configDir = app.getPath("userData");
const configPath = path.join(configDir, "config.json");

function readConfig() {
  if (fs.existsSync(configPath)) {
    const rawConfig = fs.readFileSync(configPath);
    return JSON.parse(rawConfig);
  } else {
    const defaultConfig = {
      videoDuration: 300,
      directory: path.join(app.getPath("videos"), "screenshots"),
      startHour: 8,
      stopHour: 18,
      active: true,
      daysBeforeDelete: 5,
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
}

function isWithinRecordingHours(startHour, stopHour) {
  const now = new Date();
  const currentHour = now.getHours();
  return currentHour >= startHour && currentHour < stopHour;
}

function getFormattedDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function ensureDirectoryExists(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function getCombinedScreenResolution() {
  const displays = screen.getAllDisplays();
  let totalWidth = 0;
  let maxHeight = 0;

  displays.forEach((display) => {
    totalWidth += display.bounds.width;
    if (display.bounds.height > maxHeight) {
      maxHeight = display.bounds.height;
    }
  });

  return { width: totalWidth, height: maxHeight };
}

function calculateAspectRatioFit(srcWidth, srcHeight, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
  return {
    width: Math.round(srcWidth * ratio),
    height: Math.round(srcHeight * ratio),
  };
}

function startRecording(config) {
  if (
    !config.active ||
    !isWithinRecordingHours(config.startHour, config.stopHour)
  ) {
    console.log(
      "Current time is outside of recording hours or recording is inactive. Skipping recording."
    );
    setTimeout(() => startRecording(config), config.videoDuration * 1000);
    return;
  }

  ensureDirectoryExists(config.directory);

  const { width: combinedWidth, height: combinedHeight } =
    getCombinedScreenResolution();
  const { width: scaledWidth, height: scaledHeight } = calculateAspectRatioFit(
    combinedWidth,
    combinedHeight,
    1280,
    720
  );
  const timestamp = getFormattedDateTime();
  const recordingPath = path.join(
    config.directory,
    `recording-${timestamp}.mp4`
  );

  const ffmpegCommand = `${ffmpegStatic} -y -f gdigrab -framerate 5 -probesize 50M -analyzeduration 50M -i desktop -vf "scale=${scaledWidth}:${scaledHeight}" -t ${config.videoDuration} -c:v libx264 -preset veryslow -crf 30 -maxrate 500k -bufsize 1000k -pix_fmt yuv420p -f mp4 ${recordingPath}`;

  console.log(`Executing FFmpeg command: ${ffmpegCommand}`);

  currentRecordingProcess = exec(ffmpegCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`FFmpeg error: ${error.message}`);
    }
    if (stderr) {
      console.error(`FFmpeg stderr: ${stderr}`);
    }
    console.log(`FFmpeg stdout: ${stdout}`);
    setTimeout(() => startRecording(config), 1000);
  });
}

function deleteOldRecordings(directory, daysBeforeDelete) {
  const now = Date.now();
  const cutoffTime = now - daysBeforeDelete * 24 * 60 * 60 * 1000;

  fs.readdir(directory, (err, files) => {
    if (err) {
      console.error("Failed to list files in directory", err);
      return;
    }

    files.forEach((file) => {
      const filePath = path.join(directory, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error("Failed to get file stats", err);
          return;
        }

        if (stats.mtimeMs < cutoffTime) {
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error("Failed to delete old recording", err);
            } else {
              console.log(`Deleted old recording: ${filePath}`);
            }
          });
        }
      });
    });
  });
}

app.whenReady().then(() => {
  const config = readConfig();

  tray = new Tray(path.join(__dirname, "icon.png"));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Config File",
      click: () => shell.openPath(configPath),
    },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);
  tray.setToolTip("Screen Recorder");
  tray.setContextMenu(contextMenu);

  setInterval(() => {
    deleteOldRecordings(config.directory, config.daysBeforeDelete);
  }, 24 * 60 * 60 * 1000); // Check once a day

  console.log("Tray application started");
  startRecording(config);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

const autoLauncher = new AutoLaunch({
  name: "YourApp",
  path: app.getPath("exe"),
});

autoLauncher.isEnabled().then((isEnabled) => {
  if (!isEnabled) autoLauncher.enable();
});
