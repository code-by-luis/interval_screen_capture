const {
  app,
  Tray,
  Menu,
  screen,
  shell,
  powerMonitor,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");
var util = require("util");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");
const { exec } = require("child_process");
const AutoLaunch = require("auto-launch");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

const packageJson = require(path.join(app.getAppPath(), "package.json"));
const appVersion = packageJson.version;

function getTimestamp() {
  const now = new Date();
  return now.toISOString(); // Formats the date to ISO string (e.g., 2020-01-01T00:00:00.000Z)
}

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = "info";

const configDir = app.getPath("userData");
const logPath = path.join(configDir, "log.txt");
var logFile = fs.createWriteStream(logPath, { flags: "a" });
var logStdout = process.stdout;

console.log = function () {
  let args = Array.from(arguments);
  args.unshift(getFormattedDateTime() + " |");
  logFile.write(util.format.apply(null, args) + "\n");
  logStdout.write(util.format.apply(null, args) + "\n");
};
console.error = console.log;

const ffmpegPath = require("ffmpeg-static").replace(
  "app.asar",
  "app.asar.unpacked"
);
ffmpeg.setFfmpegPath(ffmpegPath);

let tray = null;
let currentRecordingProcess = null;
let tempRecordingPath = null; // To store the path of the current recording
const configPath = path.join(configDir, "config.json");

console.log(`Config directory: ${configDir}`);
console.log(`Config file path: ${configPath}`);

function readConfig() {
  if (fs.existsSync(configPath)) {
    console.log("Config file exists. Reading configuration...");
    const rawConfig = fs.readFileSync(configPath);
    return JSON.parse(rawConfig);
  } else {
    console.log("Config file not found. Creating default configuration...");
    const defaultConfig = {
      videoDuration: 300,
      tempDirectory: "\\\\server\\path\\to\\temp", // Example network path
      storageDirectory: "\\\\server\\path\\to\\final", // Example network path
      startHour: 0,
      stopHour: 24,
      active: true,
      daysBeforeDelete: 5,
      videoQuality: {
        scale: 0.35,
        frameRate: 5,
        bitrate: "100k",
      },
    };
    console.log(`Default config: ${JSON.stringify(defaultConfig, null, 2)}`);
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    ensureDirectoryExists(defaultConfig.tempDirectory);
    ensureDirectoryExists(defaultConfig.storageDirectory);
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
  console.log(`Ensuring directory exists: ${directory}`);
  if (!fs.existsSync(directory)) {
    console.log(`Creating directory: ${directory}`);
    fs.mkdirSync(directory, { recursive: true });
  } else {
    console.log(`Directory already exists: ${directory}`);
  }
}

function getCombinedScreenResolution() {
  const displays = screen.getAllDisplays();
  let totalWidth = 0;
  let maxHeight = 0;
  let monitor = 0;
  displays.forEach((display) => {
    monitor = monitor + 1;
    console.log("monitor: " + monitor);
    console.log("width: " + display.bounds.width);
    console.log("height: " + display.bounds.height);
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

  ensureDirectoryExists(config.tempDirectory);
  ensureDirectoryExists(config.storageDirectory);

  const { width: combinedWidth, height: combinedHeight } =
    getCombinedScreenResolution();
  const scale = config.videoQuality.scale;
  let scaledWidth = Math.round(combinedWidth * scale);
  let scaledHeight = Math.round(combinedHeight * scale);
  if (scaledWidth % 2 !== 0) {
    scaledWidth += 1;
  }
  if (scaledHeight % 2 !== 0) {
    scaledHeight += 1;
  }
  console.log("scaledHeight: " + scaledHeight);
  const timestamp = getFormattedDateTime();
  tempRecordingPath = path.join(
    config.tempDirectory,
    `recording-${timestamp}.mp4`
  );
  const storageRecordingPath = path.join(
    config.storageDirectory,
    `recording-${timestamp}.mp4`
  );

  const { frameRate, bitrate } = config.videoQuality;
  const ffmpegCommand = `"${ffmpegPath}" -y -f gdigrab -framerate ${frameRate} -probesize 50M -analyzeduration 50M -i desktop -vf "scale=${scaledWidth}:${scaledHeight}" -t ${config.videoDuration} -c:v libx264 -preset veryslow -crf 30 -maxrate ${bitrate} -bufsize 1000k -pix_fmt yuv420p -f mp4 "${tempRecordingPath}"`;

  console.log(`Executing FFmpeg command: ${ffmpegCommand}`);

  currentRecordingProcess = exec(ffmpegCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`FFmpeg error: ${error.message}`);
      return;
    }
    if (stderr) {
      //console.error(`FFmpeg stderr: ${stderr}`);
    }
    console.log(`FFmpeg stdout: ${stdout}`);
    moveRecordingToStorage(tempRecordingPath, storageRecordingPath);
    setTimeout(() => startRecording(config), 1000);
  });
}

function moveRecordingToStorage(tempRecordingPath, storageRecordingPath) {
  // Move completed recording to storage directory
  fs.copyFile(tempRecordingPath, storageRecordingPath, (err) => {
    if (err) {
      console.error(
        `Failed to copy recording to storage directory: ${err.message}`
      );
    } else {
      console.log(`Recording copied to storage: ${storageRecordingPath}`);
      fs.unlink(tempRecordingPath, (err) => {
        if (err) {
          console.error(`Failed to delete temp recording: ${err.message}`);
        } else {
          console.log(`Temp recording deleted: ${tempRecordingPath}`);
        }
      });
    }
  });
}

function stopRecording() {
  var config = readConfig();
  if (currentRecordingProcess) {
    // Gracefully stop the FFmpeg recording process
    currentRecordingProcess.stdin.write("q"); // Send 'q' to FFmpeg to stop recording
    currentRecordingProcess.on("close", () => {
      // Move the recording after FFmpeg process has exited
      if (tempRecordingPath) {
        const storageRecordingPath = tempRecordingPath.replace(
          config.tempDirectory,
          config.storageDirectory
        );
        moveRecordingToStorage(tempRecordingPath, storageRecordingPath);
        tempRecordingPath = null;
      }
      currentRecordingProcess = null;
      console.log("Recording stopped and moved due to screen lock.");
    });
  }
}

function clearLogFile() {
  fs.truncate(logPath, 0, function (err) {
    if (err) {
      console.error(`Failed to clear log file: ${err.message}`);
    } else {
      console.log(`Log file cleared successfully.`);
    }
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
  const packageJson = require(path.join(app.getAppPath(), "package.json"));
  const appVersion = packageJson.version;

  tray = new Tray(path.join(app.getAppPath(), "icon.png"));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Version: ${appVersion}`,
      enabled: false,
    },
    {
      label: "Check for Updates",
      click: () => {
        autoUpdater.checkForUpdatesAndNotify();
      },
    },
    {
      label: "Open Config File",
      click: () => shell.openPath(configPath),
    },
    {
      label: "Clear Log File",
      click: () => clearLogFile(),
    },
    {
      label: "Open Log File",
      click: () => shell.openPath(logPath),
    },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);
  tray.setToolTip("Screen Recorder");
  tray.setContextMenu(contextMenu);

  deleteOldRecordings(config.storageDirectory, config.daysBeforeDelete);

  setInterval(() => {
    deleteOldRecordings(config.storageDirectory, config.daysBeforeDelete);
  }, 24 * 60 * 60 * 1000); // Check once a day

  console.log("Tray application started");
  console.log(app.getPath("exe"));

  /*let autoLaunch = new AutoLaunch({
    name: "interval_screen_capture",
    path: app.getPath("exe"),
  });

  autoLaunch
    .isEnabled()
    .then((isEnabled) => {
      if (!isEnabled) {
        autoLaunch
          .enable()
          .then(() => {
            console.log("Auto-launch enabled successfully.");
          })
          .catch((err) => {
            console.error("Failed to enable auto-launch", err);
          });
      } else {
        console.log("Auto-launch is already enabled.");
      }
    })
    .catch((err) => {
      console.error("Failed to check auto-launch status", err);
    }); */

  startRecording(config);

  powerMonitor.on("lock-screen", () => {
    console.log("Screen locked, stopping recording");
    stopRecording();
  });

  powerMonitor.on("unlock-screen", () => {
    console.log("Screen unlocked, resuming recording");
    startRecording(config);
  });

  //autoUpdater.checkForUpdatesAndNotify();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

autoUpdater.on("update-available", (info) => {
  dialog.showMessageBox({
    type: "info",
    title: "Update available",
    message: "A new update is available. Downloading now...",
  });
});

app.setLoginItemSettings({
  openAtLogin: true,
});

autoUpdater.on("update-not-available", (info) => {
  dialog.showMessageBox({
    type: "info",
    title: "No Updates Available",
    message: "You are currently using the latest version of the application.",
  });
});

autoUpdater.on("update-downloaded", (info) => {
  dialog
    .showMessageBox({
      type: "info",
      title: "Update ready",
      message:
        "A new update is ready. Restart the application to apply the updates.",
      buttons: ["Restart", "Later"],
    })
    .then((result) => {
      const buttonIndex = result.response;
      if (buttonIndex === 0) {
        autoUpdater.quitAndInstall();
      }
    });
});
