import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import whatsapp from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth } = whatsapp;

let client = null;
let isReady = false;
let isInitializing = false;
let initPromise = null;
const qrListeners = new Set();
const readyListeners = new Set();
const messageListeners = new Set();

function normalizeLookup(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function pickBestNameMatch(items, rawName, valueSelector) {
  const targetRaw = String(rawName || "").trim().toLowerCase();
  const targetNormalized = normalizeLookup(rawName);

  let best = null;
  let bestScore = -1;

  for (const item of items) {
    const candidateRaw = String(valueSelector(item) || "").trim().toLowerCase();
    const candidateNormalized = normalizeLookup(candidateRaw);
    if (!candidateRaw && !candidateNormalized) {
      continue;
    }

    let score = 0;
    if (candidateRaw === targetRaw || candidateNormalized === targetNormalized) {
      score = 100;
    } else if (candidateRaw.startsWith(targetRaw) || candidateNormalized.startsWith(targetNormalized)) {
      score = 80;
    } else if (candidateRaw.includes(targetRaw) || candidateNormalized.includes(targetNormalized)) {
      score = 60;
    }

    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  return { best, bestScore };
}

function waitForReady(timeoutMs = 45000) {
  if (isReady) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onReady = () => {
      clearTimeout(timer);
      readyListeners.delete(onReady);
      resolve();
    };

    const timer = setTimeout(() => {
      readyListeners.delete(onReady);
      reject(new Error("WhatsApp is still starting. Please wait a few seconds and try again."));
    }, timeoutMs);

    readyListeners.add(onReady);
  });
}

async function ensureClientReady() {
  if (isReady && client) {
    return;
  }

  if (!isInitializing && !client) {
    const initResult = await initWhatsApp();
    if (initResult?.busy) {
      throw new Error(initResult.message || "WhatsApp session is busy in another process.");
    }
  }

  if (initPromise) {
    const initResult = await initPromise;
    if (initResult?.busy) {
      throw new Error(initResult.message || "WhatsApp session is busy in another process.");
    }
  }

  await waitForReady();

  if (!isReady || !client) {
    throw new Error("WhatsApp connection is not ready.");
  }
}

function isSessionBusyError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("browser is already running") || message.includes("userdataDir");
}

function getPersistentSessionPath() {
  if (process.env.ARIA_WHATSAPP_SESSION_PATH) {
    return path.resolve(process.env.ARIA_WHATSAPP_SESSION_PATH);
  }

  const appDataRoot = process.env.APPDATA || process.cwd();
  return path.join(appDataRoot, "ARIA", "whatsapp-session");
}

async function ensureSessionPath() {
  const sessionPath = getPersistentSessionPath();
  await fs.mkdir(sessionPath, { recursive: true });
  return sessionPath;
}

function registerListeners(onQR, onReady, onMessage) {
  if (typeof onQR === "function") {
    qrListeners.add(onQR);
  }
  if (typeof onReady === "function") {
    readyListeners.add(onReady);
  }
  if (typeof onMessage === "function") {
    messageListeners.add(onMessage);
  }
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(String(stderr || error.message || "PowerShell command failed")));
          return;
        }

        resolve({ stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() });
      }
    );
  });
}

function escapePowerShellString(value) {
  return String(value || "").replace(/'/g, "''");
}

export async function sendWhatsAppDesktopMessage(contactName, message) {
  const contact = String(contactName || "").trim();
  const text = String(message || "").trim();

  if (!contact) {
    throw new Error("Contact name is missing.");
  }

  if (!text) {
    throw new Error("Message text is missing.");
  }

  const psContact = escapePowerShellString(contact);
  const psMessage = escapePowerShellString(text.replace(/\r?\n+/g, " "));

  const script = `
Add-Type -AssemblyName System.Windows.Forms;

function Escape-SendKeysText([string]$value) {
  if ($null -eq $value) { return "" }
  return ($value -replace '([+^%~(){}\\[\\]])', '{$1}');
}

$contact = '${psContact}';
$message = '${psMessage}';
$opened = $false;

try {
  Start-Process "shell:AppsFolder\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App" -ErrorAction Stop;
  $opened = $true;
} catch {
}

if (-not $opened) {
  try {
    Start-Process "whatsapp://send" -ErrorAction Stop;
    $opened = $true;
  } catch {
  }
}

if (-not $opened) {
  throw "Unable to open WhatsApp desktop app on this system.";
}

Start-Sleep -Milliseconds 2000;
[System.Windows.Forms.SendKeys]::SendWait("^k");
Start-Sleep -Milliseconds 400;
[System.Windows.Forms.SendKeys]::SendWait((Escape-SendKeysText $contact));
Start-Sleep -Milliseconds 700;
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}");
Start-Sleep -Milliseconds 500;
[System.Windows.Forms.SendKeys]::SendWait((Escape-SendKeysText $message));
Start-Sleep -Milliseconds 300;
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}");

Write-Output "WHATSAPP_DESKTOP_SENT";
`;

  const result = await runPowerShell(script);
  if (!result.stdout.includes("WHATSAPP_DESKTOP_SENT")) {
    throw new Error("WhatsApp desktop send did not confirm.");
  }

  return {
    success: true,
    sentTo: contact,
    message: text
  };
}

export async function initWhatsApp(onQR, onReady, onMessage) {
  registerListeners(onQR, onReady, onMessage);

  if (isReady) {
    for (const listener of readyListeners) {
      listener();
    }
    return { started: false, alreadyReady: true };
  }

  if (isInitializing && initPromise) {
    return initPromise;
  }

  isInitializing = true;
  const sessionPath = await ensureSessionPath();

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: "aria-main",
      dataPath: sessionPath
    }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }
  });

  client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
    for (const listener of qrListeners) {
      listener(qr);
    }
  });

  client.on("ready", () => {
    isReady = true;
    isInitializing = false;
    console.log("WhatsApp connected ✅");
    for (const listener of readyListeners) {
      listener();
    }
  });

  client.on("message", (message) => {
    for (const listener of messageListeners) {
      listener(message);
    }
  });

  client.on("disconnected", () => {
    isReady = false;
    isInitializing = false;
    client = null;
  });

  initPromise = client
    .initialize()
    .then(() => ({ started: true }))
    .catch((error) => {
      isReady = false;
      isInitializing = false;

      // Another process may still own the persistent Chromium session.
      // Treat that as a recoverable busy state so app startup can continue.
      if (isSessionBusyError(error)) {
        client = null;
        return {
          started: false,
          busy: true,
          message: "WhatsApp session is busy in another process."
        };
      }

      throw error;
    })
    .finally(() => {
      initPromise = null;
    });

  return initPromise;
}

export async function sendWhatsAppMessage(contactName, message) {
  await ensureClientReady();

  const requestedName = String(contactName || "").trim();
  if (!requestedName) {
    throw new Error("Contact name is missing.");
  }

  const text = String(message || "").trim();
  if (!text) {
    throw new Error("Message text is missing.");
  }

  const chats = await client.getChats();
  const chatMatch = pickBestNameMatch(chats, requestedName, (entry) => entry.name || "");
  const matchedChat = chatMatch.bestScore >= 60 ? chatMatch.best : null;

  let chat = matchedChat || null;
  let recipientLabel = matchedChat?.name || "";

  if (!chat) {
    const contacts = await client.getContacts();
    const contactMatch = pickBestNameMatch(
      contacts,
      requestedName,
      (entry) => entry.name || entry.pushname || entry.number || ""
    );
    const contact = contactMatch.bestScore >= 60 ? contactMatch.best : null;

    if (!contact) {
      throw new Error(`Contact "${contactName}" not found in WhatsApp`);
    }

    const chatId = contact.id?._serialized;
    if (!chatId) {
      throw new Error(`Unable to resolve chat for "${contactName}"`);
    }

    chat = await client.getChatById(chatId);
    recipientLabel = contact.name || contact.pushname || contact.number || contactName;
  }

  const sent = await chat.sendMessage(text);
  if (!sent || !sent.id || !sent.id._serialized) {
    throw new Error("WhatsApp send was not acknowledged. Please try again.");
  }

  return {
    success: true,
    sentTo: recipientLabel || contactName,
    message: text
  };
}

export async function getStatus() {
  return { isReady, isInitializing };
}
