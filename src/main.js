import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { electronConfig } from "../electron.config.js";
import { handlePrompt, runAgent } from "./agent/ariaAgent.js";
import { getAIClient } from "./api/aiRouter.js";
import { parseIntent } from "./agent/intentParser.js";
import * as memoryStore from "./agent/memoryStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let streamCounter = 0;

function emitToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (typeof payload === "undefined") {
    mainWindow.webContents.send(channel);
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function getRendererTarget() {
  const explicitDevUrl = process.env.VITE_DEV_SERVER_URL;
  if (explicitDevUrl) {
    return { type: "url", value: explicitDevUrl };
  }

  const entry = app.isPackaged
    ? electronConfig.renderer.buildEntry
    : electronConfig.renderer.devEntry;

  return { type: "file", value: path.resolve(entry) };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: electronConfig.window.title || "ARIA",
    width: electronConfig.window.width,
    height: electronConfig.window.height,
    minWidth: electronConfig.window.minWidth,
    minHeight: electronConfig.window.minHeight,
    backgroundColor: electronConfig.window.backgroundColor,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const target = getRendererTarget();
  if (target.type === "url") {
    mainWindow.loadURL(target.value);
  } else {
    mainWindow.loadFile(target.value);
  }
}

ipcMain.handle("agent:send-prompt", async (_event, prompt) => {
  if (mainWindow) {
    mainWindow.webContents.send("status:update", "Processing prompt...");
  }

  const result = await handlePrompt(prompt);

  if (mainWindow) {
    mainWindow.webContents.send("status:update", "Ready");
  }

  return result;
});

ipcMain.handle("agent:start-stream", async (event, payload) => {
  const runId = `run-${Date.now()}-${streamCounter++}`;
  const userInput = String(payload?.input || "").trim();
  const config = payload?.config || {};
  const memory = payload?.memory || {};

  const intent = parseIntent(userInput);

  let provider = config?.provider || "auto";
  let model = config?.preferredModel || "";

  try {
    const client = await getAIClient(config, intent);
    provider = client?.selectedProvider || provider;
    model = client?.selectedModel || model;
  } catch {
    provider = "offline";
  }

  const memoryAdapter = {
    async getRecentMessages(limit) {
      const recent = Array.isArray(memory?.recentMessages) ? memory.recentMessages.slice(-limit) : [];
      return recent.map((item) => ({
        role: item.role,
        content: item.content
      }));
    }
  };

  const sender = event.sender;

  (async () => {
    let fullResponse = "";
    try {
      for await (const token of runAgent(userInput, config, memoryAdapter)) {
        fullResponse += token;
        sender.send("agent:stream-token", { runId, token });
      }

      sender.send("agent:stream-complete", {
        runId,
        response: fullResponse,
        intent,
        provider,
        model
      });
    } catch (error) {
      sender.send("agent:stream-error", {
        runId,
        message: String(error?.message || "Unknown stream failure")
      });
    }
  })();

  return { runId, intent, provider, model };
});

ipcMain.handle("settings:get", async () => {
  return memoryStore.readSettings();
});

ipcMain.handle("get-settings", async () => {
  return memoryStore.readSettings();
});

ipcMain.handle("settings:set", async (_event, nextSettings) => {
  return memoryStore.writeSettings(nextSettings);
});

ipcMain.handle("save-settings", async (_event, nextSettings) => {
  return memoryStore.writeSettings(nextSettings);
});

ipcMain.handle("memory:invoke", async (_event, payload) => {
  const action = payload?.action;
  const data = payload?.payload || {};

  switch (action) {
    case "readMemory":
      return memoryStore.readMemoryForIPC();
    case "writeMemory":
      return memoryStore.writeMemoryForIPC(data.memory);
    case "saveExchange":
      return memoryStore.saveExchange(data.userInput, data.ariaResponse, data.intent);
    case "getRecentContext":
      return memoryStore.getRecentContext(data.n);
    case "getRecentMessages":
      return memoryStore.getRecentMessages(data.n);
    case "saveUserFact":
      return memoryStore.saveUserFact(data.key, data.value);
    case "getUserProfile":
      return memoryStore.getUserProfile();
    case "saveProjectNote":
      return memoryStore.saveProjectNote(data.projectName, data.note);
    case "getProjectContext":
      return memoryStore.getProjectContext(data.projectName);
    case "getStats":
      return memoryStore.getStats();
    case "clearAll":
      return memoryStore.clearAll();
    case "readSettings":
      return memoryStore.readSettings();
    case "writeSettings":
      return memoryStore.writeSettings(data.nextSettings);
    default:
      throw new Error(`Unknown memory action: ${action}`);
  }
});

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});