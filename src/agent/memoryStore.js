const DEFAULT_SCHEMA = {
  userProfile: {},
  exchanges: [],
  projects: {},
  meta: {
    created: "",
    version: "1.0"
  }
};

const DEFAULT_SETTINGS = {
  provider: "auto",
  tone: "concise",
  language: "auto",
  ollamaModel: "llama3",
  groqModel: "llama3-8b-8192",
  groqApiKey: ""
};

let cachedMemoryPath = null;

function isRendererProcess() {
  return typeof window !== "undefined" && typeof window.document !== "undefined";
}

async function callRendererMemory(action, payload = {}) {
  if (!isRendererProcess()) {
    return null;
  }

  if (!window.aria || typeof window.aria.memoryInvoke !== "function") {
    throw new Error("Memory IPC bridge is not available in renderer.");
  }

  return window.aria.memoryInvoke(action, payload);
}

async function getNodeModules() {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  return { fs: fs.default, path: path.default };
}

async function resolveMemoryPath() {
  if (cachedMemoryPath) {
    return cachedMemoryPath;
  }

  const { path } = await getNodeModules();

  try {
    const { app } = await import("electron");
    if (app && typeof app.getPath === "function") {
      cachedMemoryPath = path.join(app.getPath("userData"), "aria_memory.json");
      return cachedMemoryPath;
    }
  } catch {
    // Fallback used for non-Electron test runs.
  }

  cachedMemoryPath = path.join(process.cwd(), "aria-memory.json");
  return cachedMemoryPath;
}

function normalizeMemory(parsed) {
  const safe = parsed && typeof parsed === "object" ? parsed : {};

  return {
    ...DEFAULT_SCHEMA,
    ...safe,
    userProfile:
      safe.userProfile && typeof safe.userProfile === "object" ? safe.userProfile : {},
    exchanges: Array.isArray(safe.exchanges) ? safe.exchanges : [],
    projects: safe.projects && typeof safe.projects === "object" ? safe.projects : {},
    meta: {
      ...DEFAULT_SCHEMA.meta,
      ...(safe.meta && typeof safe.meta === "object" ? safe.meta : {})
    },
    settings:
      safe.settings && typeof safe.settings === "object"
        ? { ...DEFAULT_SETTINGS, ...safe.settings }
        : { ...DEFAULT_SETTINGS }
  };
}

async function ensureMemoryFile() {
  const memoryPath = await resolveMemoryPath();
  const { fs, path } = await getNodeModules();

  try {
    await fs.access(memoryPath);
  } catch {
    const initial = {
      ...DEFAULT_SCHEMA,
      meta: {
        created: new Date().toISOString(),
        version: "1.0"
      },
      settings: { ...DEFAULT_SETTINGS }
    };

    await fs.mkdir(path.dirname(memoryPath), { recursive: true });
    await fs.writeFile(memoryPath, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readMemoryRaw() {
  await ensureMemoryFile();
  const memoryPath = await resolveMemoryPath();
  const { fs } = await getNodeModules();
  const raw = await fs.readFile(memoryPath, "utf8");
  return normalizeMemory(JSON.parse(raw));
}

async function writeMemoryRaw(memory) {
  const memoryPath = await resolveMemoryPath();
  const { fs } = await getNodeModules();
  const normalized = normalizeMemory(memory);
  await fs.writeFile(memoryPath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

async function readMemory() {
  if (isRendererProcess()) {
    return callRendererMemory("readMemory");
  }

  return readMemoryRaw();
}

async function writeMemory(memory) {
  if (isRendererProcess()) {
    return callRendererMemory("writeMemory", { memory });
  }

  return writeMemoryRaw(memory);
}

export async function saveExchange(userInput, ariaResponse, intent) {
  if (isRendererProcess()) {
    return callRendererMemory("saveExchange", { userInput, ariaResponse, intent });
  }

  const memory = await readMemoryRaw();
  memory.exchanges.push({
    id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    intent: intent || "chat",
    user: String(userInput || ""),
    aria: String(ariaResponse || "")
  });

  if (memory.exchanges.length > 200) {
    memory.exchanges = memory.exchanges.slice(-200);
  }

  await writeMemoryRaw(memory);
}

export async function getRecentContext(n = 8) {
  if (isRendererProcess()) {
    return callRendererMemory("getRecentContext", { n });
  }

  const memory = await readMemoryRaw();
  const recent = memory.exchanges.slice(-n);
  if (!recent.length) {
    return "";
  }

  return recent
    .map((entry) => `User: ${entry.user}\nARIA: ${entry.aria}\n---`)
    .join("\n");
}

export async function getRecentMessages(n = 6) {
  if (isRendererProcess()) {
    return callRendererMemory("getRecentMessages", { n });
  }

  const memory = await readMemoryRaw();
  const recent = memory.exchanges.slice(-n);
  const messages = [];

  for (const entry of recent) {
    messages.push({ role: "user", content: entry.user });
    messages.push({ role: "assistant", content: entry.aria });
  }

  return messages;
}

export async function saveUserFact(key, value) {
  if (isRendererProcess()) {
    return callRendererMemory("saveUserFact", { key, value });
  }

  const memory = await readMemoryRaw();
  memory.userProfile[key] = value;
  await writeMemoryRaw(memory);
}

export async function getUserProfile() {
  if (isRendererProcess()) {
    return callRendererMemory("getUserProfile");
  }

  const memory = await readMemoryRaw();
  return memory.userProfile || {};
}

export async function saveProjectNote(projectName, note) {
  if (isRendererProcess()) {
    return callRendererMemory("saveProjectNote", { projectName, note });
  }

  const name = String(projectName || "default");
  const memory = await readMemoryRaw();
  if (!memory.projects[name]) {
    memory.projects[name] = { notes: [] };
  }
  if (!Array.isArray(memory.projects[name].notes)) {
    memory.projects[name].notes = [];
  }

  memory.projects[name].notes.push({
    timestamp: new Date().toISOString(),
    note: String(note || "")
  });

  await writeMemoryRaw(memory);
}

export async function getProjectContext(projectName) {
  if (isRendererProcess()) {
    return callRendererMemory("getProjectContext", { projectName });
  }

  const name = String(projectName || "default");
  const memory = await readMemoryRaw();
  const notes = memory.projects?.[name]?.notes;
  if (!Array.isArray(notes) || !notes.length) {
    return "";
  }

  return notes.map((item) => `[${item.timestamp}] ${item.note}`).join("\n");
}

export async function getStats() {
  if (isRendererProcess()) {
    return callRendererMemory("getStats");
  }

  const memory = await readMemoryRaw();
  const exchanges = memory.exchanges;
  const intentCounts = {};

  for (const entry of exchanges) {
    const intent = entry.intent || "chat";
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  }

  let mostUsedIntent = "";
  let maxCount = -1;
  for (const [intent, count] of Object.entries(intentCounts)) {
    if (count > maxCount) {
      mostUsedIntent = intent;
      maxCount = count;
    }
  }

  return {
    totalExchanges: exchanges.length,
    mostUsedIntent: mostUsedIntent || null,
    firstUsed: exchanges[0]?.timestamp || null,
    lastUsed: exchanges[exchanges.length - 1]?.timestamp || null
  };
}

export async function clearAll() {
  if (isRendererProcess()) {
    return callRendererMemory("clearAll");
  }

  const reset = {
    userProfile: {},
    exchanges: [],
    projects: {},
    meta: {
      created: new Date().toISOString(),
      version: "1.0"
    }
  };

  await writeMemoryRaw(reset);
  return reset;
}

export async function readSettings() {
  if (isRendererProcess()) {
    return callRendererMemory("readSettings");
  }

  const memory = await readMemoryRaw();
  return {
    ...DEFAULT_SETTINGS,
    ...(memory.settings || {})
  };
}

export async function writeSettings(nextSettings) {
  if (isRendererProcess()) {
    return callRendererMemory("writeSettings", { nextSettings });
  }

  const memory = await readMemoryRaw();
  memory.settings = {
    ...DEFAULT_SETTINGS,
    ...(memory.settings || {}),
    ...(nextSettings || {})
  };

  await writeMemoryRaw(memory);
  return memory.settings;
}

export async function remember(key, value) {
  return saveUserFact(key, value);
}

export async function recall(key) {
  const profile = await getUserProfile();
  return profile[key] ?? null;
}

export async function appendHistory(entry) {
  const prompt = entry?.prompt || entry?.userInput || "";
  const response = entry?.result?.response || entry?.response || "";
  const intent = entry?.result?.intent || entry?.intent || "chat";
  return saveExchange(prompt, response, intent);
}

export async function readMemoryForIPC() {
  return readMemoryRaw();
}

export async function writeMemoryForIPC(memory) {
  return writeMemoryRaw(memory);
}