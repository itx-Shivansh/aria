import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";

const MAX_LIST_ITEMS = 200;
const MAX_SEARCH_RESULTS = 40;
const MAX_SEARCH_DEPTH = 6;
const MAX_READ_CHARS = 5000;

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

function clampPercent(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizePath(rawPath, options = {}) {
  const text = String(rawPath || "").trim();
  if (!text) {
    return "";
  }

  let cleaned = text.replace(/^['"`]+|['"`]+$/g, "").trim();
  if (cleaned.startsWith("~")) {
    cleaned = path.join(os.homedir(), cleaned.slice(1));
  }

  const desktop = path.join(os.homedir(), "Desktop");
  const withBase = path.isAbsolute(cleaned) ? cleaned : path.resolve(desktop, cleaned);

  if (options.addTxtExt && !path.extname(withBase)) {
    return `${withBase}.txt`;
  }

  return path.normalize(withBase);
}

function getSafeRoots() {
  const home = os.homedir();
  const roots = [
    path.join(home, "Desktop"),
    path.join(home, "Documents"),
    path.join(home, "Downloads"),
    path.resolve(process.cwd())
  ];

  return [...new Set(roots.map((entry) => path.normalize(entry)))];
}

function isPathInside(basePath, targetPath) {
  const base = path.resolve(basePath);
  const target = path.resolve(targetPath);
  const rel = path.relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function validatePathInSandbox(targetPath) {
  const safeRoots = getSafeRoots();
  const normalized = path.resolve(path.normalize(String(targetPath || "")));
  const allowed = safeRoots.some((root) => isPathInside(root, normalized));

  if (allowed) {
    return { ok: true, normalized };
  }

  return {
    ok: false,
    normalized,
    message: `Path not allowed by sandbox: ${normalized}. Allowed roots: ${safeRoots.join(" | ")}`
  };
}

function validatePathsInSandbox(...pathsToCheck) {
  for (const item of pathsToCheck) {
    const check = validatePathInSandbox(item);
    if (!check.ok) {
      return check;
    }
  }

  return { ok: true };
}

function parseSiteSearch(raw) {
  const siteMatch = raw.match(/search\s+(?:on|in)\s+([a-z0-9.-]+)\s+for\s+(.+)$/i);
  if (!siteMatch) {
    return null;
  }

  const site = siteMatch[1].toLowerCase();
  const query = siteMatch[2].trim();
  if (!query) {
    return null;
  }

  if (site === "youtube" || site.includes("youtube")) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }

  if (site === "google" || site.includes("google")) {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  const siteHost = site.includes(".") ? site : `${site}.com`;
  return `https://${siteHost}/search?q=${encodeURIComponent(query)}`;
}

function ensureUrl(urlText) {
  const trimmed = String(urlText || "").trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^[\w.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return "";
}

function isDangerousRawCommand(commandText) {
  const text = String(commandText || "").toLowerCase();
  return /(format\s+[a-z]:|shutdown\s|restart-computer|stop-computer|remove-item\s+-recurse\s+-force\s+c:\\|del\s+\/f\s+\/s\s+\/q\s+c:\\|rd\s+\/s\s+\/q\s+c:\\|diskpart|cipher\s+\/w)/.test(
    text
  );
}

const APP_ALIASES = {
  spotify: { launch: "spotify", processes: ["Spotify"] },
  chrome: { launch: "chrome", processes: ["chrome"] },
  "google chrome": { launch: "chrome", processes: ["chrome"] },
  edge: { launch: "msedge", processes: ["msedge"] },
  "microsoft edge": { launch: "msedge", processes: ["msedge"] },
  firefox: { launch: "firefox", processes: ["firefox"] },
  vscode: { launch: "code", processes: ["Code", "Code - Insiders"] },
  "visual studio code": { launch: "code", processes: ["Code", "Code - Insiders"] },
  notepad: { launch: "notepad", processes: ["notepad"] },
  calculator: { launch: "calc", processes: ["CalculatorApp", "ApplicationFrameHost", "Win32Calc"] },
  paint: { launch: "mspaint", processes: ["mspaint"] },
  cmd: { launch: "cmd", processes: ["cmd"] },
  powershell: { launch: "powershell", processes: ["powershell", "pwsh"] },
  terminal: { launch: "wt", processes: ["WindowsTerminal", "wt"] },
  explorer: { launch: "explorer", processes: ["explorer"] }
};

function sanitizeAppName(rawText) {
  return String(rawText || "")
    .toLowerCase()
    .replace(/^(the\s+)?(app\s+)?/, "")
    .replace(/\s+app$/, "")
    .trim();
}

function resolveAppAlias(rawText) {
  const normalized = sanitizeAppName(rawText);
  if (!normalized) {
    return null;
  }

  if (APP_ALIASES[normalized]) {
    return { name: normalized, ...APP_ALIASES[normalized] };
  }

  return {
    name: normalized,
    launch: normalized,
    processes: [normalized]
  };
}

function cleanSpotifyQuery(rawText) {
  return String(rawText || "")
    .trim()
    .replace(/^(?:the\s+)?(?:song|track|music)\s+/i, "")
    .replace(/\s+(?:on|in)\s+spotify$/i, "")
    .replace(/^['"`\s]+|['"`\s]+$/g, "")
    .trim();
}

export function parseSystemAction(userInput) {
  const raw = String(userInput || "").trim();
  const lower = raw.toLowerCase();

  let match = raw.match(/(?:open\s+spotify\s+and\s+play|play|listen\s+to)\s+(.+?)\s+(?:on|in)\s+spotify$/i);
  if (match) {
    const query = cleanSpotifyQuery(match[1]);
    if (!query) {
      return null;
    }

    return {
      type: "playSpotify",
      query,
      requiresConfirmation: false
    };
  }

  match = raw.match(/spotify\s+(?:play|search)\s+(.+)$/i);
  if (match) {
    const query = cleanSpotifyQuery(match[1]);
    if (!query) {
      return null;
    }

    return {
      type: "playSpotify",
      query,
      requiresConfirmation: false
    };
  }

  // Allow natural commands like "play alone part 2" and route music playback to Spotify.
  match = raw.match(/^play\s+(.+)$/i);
  if (match) {
    const query = cleanSpotifyQuery(match[1]);
    if (query) {
      return {
        type: "playSpotify",
        query,
        requiresConfirmation: false
      };
    }
  }

  match = raw.match(/(?:set|change)\s+(?:the\s+)?volume\s+(?:to\s+)?(\d{1,3})\s*%?/i);
  if (match) {
    return { type: "setVolume", percent: clampPercent(match[1], 50), requiresConfirmation: false };
  }

  match = raw.match(/(?:increase|raise|turn up)\s+(?:the\s+)?volume(?:\s+by\s+(\d{1,3}))?\s*%?/i);
  if (match) {
    return { type: "adjustVolume", delta: clampPercent(match[1], 10), requiresConfirmation: false };
  }

  match = raw.match(/(?:decrease|lower|turn down)\s+(?:the\s+)?volume(?:\s+by\s+(\d{1,3}))?\s*%?/i);
  if (match) {
    return { type: "adjustVolume", delta: -clampPercent(match[1], 10), requiresConfirmation: false };
  }

  if (/\bunmute\b/.test(lower)) {
    return { type: "unmuteVolume", requiresConfirmation: false };
  }

  if (/\bmute\b/.test(lower)) {
    return { type: "muteVolume", requiresConfirmation: false };
  }

  match = raw.match(/(?:set|change)\s+(?:the\s+)?brightness\s+(?:to\s+)?(\d{1,3})\s*%?/i);
  if (match) {
    return { type: "setBrightness", percent: clampPercent(match[1], 50), requiresConfirmation: false };
  }

  match = raw.match(/(?:increase|raise)\s+(?:the\s+)?brightness(?:\s+by\s+(\d{1,3}))?\s*%?/i);
  if (match) {
    return { type: "adjustBrightness", delta: clampPercent(match[1], 10), requiresConfirmation: false };
  }

  match = raw.match(/(?:decrease|lower)\s+(?:the\s+)?brightness(?:\s+by\s+(\d{1,3}))?\s*%?/i);
  if (match) {
    return { type: "adjustBrightness", delta: -clampPercent(match[1], 10), requiresConfirmation: false };
  }

  match = raw.match(/(?:create|make)\s+(?:a\s+)?(?:new\s+)?folder(?:\s+(?:named|called))?\s+(.+)$/i);
  if (match) {
    return {
      type: "createFolder",
      targetPath: normalizePath(match[1]),
      requiresConfirmation: false
    };
  }

  match = raw.match(/(?:delete|remove)\s+(?:the\s+)?(?:folder|file)?\s+(.+)$/i);
  if (match) {
    return {
      type: "deletePath",
      targetPath: normalizePath(match[1]),
      requiresConfirmation: true
    };
  }

  match = raw.match(/rename\s+(.+?)\s+(?:to|as)\s+(.+)$/i);
  if (match) {
    return {
      type: "renamePath",
      sourcePath: normalizePath(match[1]),
      targetPath: normalizePath(match[2]),
      requiresConfirmation: false
    };
  }

  match = raw.match(/(?:create|make)\s+(?:a\s+)?(?:document|doc|text file|file)\s+(.+?)(?:\s+(?:with|containing)\s+(.+))?$/i);
  if (match) {
    return {
      type: "createDocument",
      targetPath: normalizePath(match[1], { addTxtExt: true }),
      content: String(match[2] || "").trim(),
      requiresConfirmation: false
    };
  }

  match = raw.match(/append\s+(?:to\s+)?(.+?)(?:\s*:\s*|\s+)(.+)$/i);
  if (match) {
    return {
      type: "appendDocument",
      targetPath: normalizePath(match[1], { addTxtExt: true }),
      content: String(match[2] || "").trim(),
      requiresConfirmation: false
    };
  }

  match = raw.match(/(?:write|put)\s+(?:in|to|into)\s+(.+?)(?:\s*:\s*|\s+)(.+)$/i);
  if (match) {
    return {
      type: "writeDocument",
      targetPath: normalizePath(match[1], { addTxtExt: true }),
      content: String(match[2] || "").trim(),
      requiresConfirmation: false
    };
  }

  match = raw.match(/(?:copy|duplicate)\s+(.+?)\s+(?:to|into)\s+(.+)$/i);
  if (match) {
    return {
      type: "copyPath",
      sourcePath: normalizePath(match[1]),
      targetPath: normalizePath(match[2]),
      overwrite: /\b(force|overwrite)\b/i.test(raw),
      requiresConfirmation: false
    };
  }

  match = raw.match(/move\s+(.+?)\s+(?:to|into)\s+(.+)$/i);
  if (match) {
    return {
      type: "movePath",
      sourcePath: normalizePath(match[1]),
      targetPath: normalizePath(match[2]),
      overwrite: /\b(force|overwrite)\b/i.test(raw),
      requiresConfirmation: false
    };
  }

  match = raw.match(/(?:open|show)\s+(?:the\s+)?folder\s+(.+)$/i);
  if (match) {
    return {
      type: "openFolder",
      targetPath: normalizePath(match[1]),
      requiresConfirmation: false
    };
  }

  match = raw.match(/(?:open|show)\s+(?:the\s+)?(?:file|document|doc)\s+(.+)$/i);
  if (match) {
    return {
      type: "openFile",
      targetPath: normalizePath(match[1]),
      requiresConfirmation: false
    };
  }

  match = raw.match(/(?:list|show)\s+(?:files|folders|items)(?:\s+(?:in|inside|under))?\s*(.*)$/i);
  if (match) {
    const target = String(match[1] || "").trim();
    return {
      type: "listPath",
      targetPath: normalizePath(target || "Desktop"),
      requiresConfirmation: false
    };
  }

  match = raw.match(/(?:read|show)\s+(?:file|document|doc)\s+(.+)$/i);
  if (match) {
    return {
      type: "readDocument",
      targetPath: normalizePath(match[1], { addTxtExt: false }),
      requiresConfirmation: false
    };
  }

  match = raw.match(/(?:find|search)\s+(?:files?|folders?|items?)\s+(?:named\s+)?(.+?)(?:\s+(?:in|inside|under)\s+(.+))?$/i);
  if (match) {
    return {
      type: "findPath",
      query: String(match[1] || "").trim().toLowerCase(),
      targetPath: normalizePath(String(match[2] || "Desktop")),
      requiresConfirmation: false
    };
  }

  const siteSearchUrl = parseSiteSearch(raw);
  if (siteSearchUrl) {
    return { type: "openUrl", url: siteSearchUrl, requiresConfirmation: false };
  }

  match = raw.match(/(?:search\s+for|google)\s+(.+)$/i);
  if (match) {
    return {
      type: "openUrl",
      url: `https://www.google.com/search?q=${encodeURIComponent(match[1].trim())}`,
      requiresConfirmation: false
    };
  }

  match = raw.match(/(?:open|go to|launch)\s+(.+)$/i);
  if (match) {
    const url = ensureUrl(match[1]);
    if (url) {
      return { type: "openUrl", url, requiresConfirmation: false };
    }

    const app = resolveAppAlias(match[1]);
    if (app) {
      return { type: "openApp", app, requiresConfirmation: false };
    }
  }

  match = raw.match(/(?:start|run)\s+(?:the\s+)?(?:app\s+)?(.+)$/i);
  if (match) {
    const app = resolveAppAlias(match[1]);
    if (app) {
      return { type: "openApp", app, requiresConfirmation: false };
    }
  }

  match = raw.match(/(?:close|quit|exit|stop|kill)\s+(?:the\s+)?(?:app\s+)?(.+)$/i);
  if (match) {
    const app = resolveAppAlias(match[1]);
    if (app) {
      return { type: "closeApp", app, requiresConfirmation: true };
    }
  }

  match = raw.match(/^(?:run|execute)\s+(?:command\s+)?(.+)$/i);
  if (match) {
    const command = String(match[1] || "").trim();
    if (!command) {
      return null;
    }

    if (isDangerousRawCommand(command)) {
      return {
        type: "blockedCommand",
        command,
        requiresConfirmation: false
      };
    }

    return {
      type: "runCommand",
      command,
      requiresConfirmation: true
    };
  }

  return null;
}

export function describeSystemAction(action) {
  if (!action) {
    return "";
  }

  switch (action.type) {
    case "setVolume":
      return `set volume to ${action.percent}%`;
    case "adjustVolume":
      return `${action.delta >= 0 ? "increase" : "decrease"} volume by ${Math.abs(action.delta)}%`;
    case "muteVolume":
      return "mute volume";
    case "unmuteVolume":
      return "unmute volume";
    case "setBrightness":
      return `set brightness to ${action.percent}%`;
    case "adjustBrightness":
      return `${action.delta >= 0 ? "increase" : "decrease"} brightness by ${Math.abs(action.delta)}%`;
    case "createFolder":
      return `create folder at ${action.targetPath}`;
    case "deletePath":
      return `delete ${action.targetPath}`;
    case "renamePath":
      return `rename ${action.sourcePath} to ${action.targetPath}`;
    case "createDocument":
      return `create document ${action.targetPath}`;
    case "writeDocument":
      return `write to ${action.targetPath}`;
    case "appendDocument":
      return `append to ${action.targetPath}`;
    case "copyPath":
      return `copy ${action.sourcePath} to ${action.targetPath}`;
    case "movePath":
      return `move ${action.sourcePath} to ${action.targetPath}`;
    case "listPath":
      return `list items in ${action.targetPath}`;
    case "readDocument":
      return `read ${action.targetPath}`;
    case "findPath":
      return `find ${action.query} in ${action.targetPath}`;
    case "playSpotify":
      return `play on spotify: ${action.query}`;
    case "openFolder":
      return `open folder ${action.targetPath}`;
    case "openFile":
      return `open file ${action.targetPath}`;
    case "openUrl":
      return `open ${action.url}`;
    case "openApp":
      return `open app ${action.app?.name || action.app?.launch || ""}`;
    case "closeApp":
      return `close app ${action.app?.name || action.app?.launch || ""}`;
    case "runCommand":
      return `run command: ${action.command}`;
    case "blockedCommand":
      return `blocked unsafe command: ${action.command}`;
    default:
      return "execute a system action";
  }
}

async function pressVolumeKey(vkHex, times) {
  const safeTimes = Math.max(1, Math.min(100, Number(times) || 1));
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class AudioKey {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);
}
"@;
for ($i = 0; $i -lt ${safeTimes}; $i++) {
  [AudioKey]::keybd_event(0x${vkHex}, 0, 0, 0);
  Start-Sleep -Milliseconds 20;
  [AudioKey]::keybd_event(0x${vkHex}, 0, 2, 0);
  Start-Sleep -Milliseconds 20;
}
`;
  await runPowerShell(script);
}

async function getCurrentBrightness() {
  const script = "(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness";
  const result = await runPowerShell(script);
  const current = Number(String(result.stdout || "").split(/\s+/).find(Boolean));
  return Number.isFinite(current) ? clampPercent(current, 50) : 50;
}

async function setBrightness(percent) {
  const safe = clampPercent(percent, 50);
  const script = `(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${safe})`;
  await runPowerShell(script);
}

async function openUrl(url) {
  const escaped = String(url).replace(/'/g, "''");
  await runPowerShell(`Start-Process '${escaped}'`);
}

async function resolveSpotifyTopTrackId(query) {
  const q = String(query || "").trim();
  if (!q) {
    return "";
  }

  let puppeteer;
  try {
    ({ default: puppeteer } = await import("puppeteer"));
  } catch {
    return "";
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    const url = `https://open.spotify.com/search/${encodeURIComponent(q)}/tracks`;
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("a[href*='/track/']", { timeout: 20000 });

    const href = await page.$eval("a[href*='/track/']", (el) => el.getAttribute("href") || "");
    const match = String(href).match(/\/track\/([A-Za-z0-9]{22})/);
    return match ? match[1] : "";
  } catch {
    return "";
  } finally {
    await browser.close();
  }
}

async function openSpotifyTrackOrSearch(query) {
  const q = String(query || "").trim();
  if (!q) {
    throw new Error("Song name is missing.");
  }

  const plainQuery = q.replace(/"/g, "").trim();
  const encoded = encodeURIComponent(plainQuery);
  const spotifySearchUri = `spotify:search:${encoded}`;
  const escapedSearchUri = spotifySearchUri.replace(/'/g, "''");
  const escapedQuery = plainQuery.replace(/'/g, "''");

  const topTrackId = await resolveSpotifyTopTrackId(plainQuery);
  if (topTrackId) {
    const spotifyTrackUri = `spotify:track:${topTrackId}`;
    const escapedTrackUri = spotifyTrackUri.replace(/'/g, "''");
    const script = `
Add-Type -AssemblyName System.Windows.Forms;
$wshell = New-Object -ComObject WScript.Shell;

Start-Process '${escapedTrackUri}';
Start-Sleep -Milliseconds 1400;

# First try: targeted play request to Spotify media session.
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime;
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime];
  $mgr = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetAwaiter().GetResult();
  $sessions = $mgr.GetSessions();

  foreach ($s in $sessions) {
    $source = '';
    try { $source = $s.SourceAppUserModelId } catch {}
    if ($source -match 'Spotify|SpotifyAB') {
      try { $null = $s.TryPlayAsync().GetAwaiter().GetResult(); } catch {}
      break;
    }
  }
} catch {
}

# Second try: emulate the manual Enter that works for this setup.
if ($wshell.AppActivate('Spotify')) {
  Start-Sleep -Milliseconds 180;
  $wshell.SendKeys('{ENTER}');
}

Write-Output 'SPOTIFY_TRACK_PLAY_REQUESTED';
`;
    await runPowerShell(script);
    return {
      usedWebFallback: false,
      attemptedPlayback: true,
      exactTrackResolved: true,
      resolvedTitle: plainQuery,
      resolvedArtists: ""
    };
  }

  try {
    const script = `
Add-Type -AssemblyName System.Windows.Forms;
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WinApi {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@;
function Escape-SendKeysText([string]$value) {
  if ($null -eq $value) { return "" }
  return ($value -replace '([+^%~(){}\\[\\]])', '{$1}');
}

$query = '${escapedQuery}';
$wshell = New-Object -ComObject WScript.Shell;

try {
  Start-Process 'spotify' -ErrorAction Stop;
} catch {
}

try {
  Start-Process 'shell:AppsFolder\\SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify' -ErrorAction Stop;
} catch {
}

Start-Sleep -Milliseconds 1200;
Start-Process '${escapedSearchUri}';
Start-Sleep -Milliseconds 1800;

function Get-SpotifyWindowCandidate() {
  $titleMatch = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'Spotify' } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1;

  if ($titleMatch) {
    return $titleMatch;
  }

  $procMatch = Get-Process -Name 'Spotify', 'ApplicationFrameHost' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1;

  return $procMatch;
}

$activated = $false;
for ($i = 0; $i -lt 30 -and -not $activated; $i++) {
  $spotifyProc = Get-SpotifyWindowCandidate;

  if ($spotifyProc) {
    try {
      if ($spotifyProc.MainWindowHandle -ne 0) {
        # Foreground lock workaround: sending Alt before SetForegroundWindow
        # increases success rate on newer Windows builds.
        $wshell.SendKeys('%');
        Start-Sleep -Milliseconds 60;
        [WinApi]::ShowWindowAsync($spotifyProc.MainWindowHandle, 9) | Out-Null;
        Start-Sleep -Milliseconds 120;
        $activated = [WinApi]::SetForegroundWindow($spotifyProc.MainWindowHandle);
      }
    } catch {
      $activated = $false;
    }

    if (-not $activated) {
      try {
        $activated = $wshell.AppActivate([int]$spotifyProc.Id);
      } catch {
        $activated = $false;
      }
    }
  }

  if (-not $activated) {
    $activated = $wshell.AppActivate('Spotify');
  }

  if (-not $activated -and $spotifyProc -and $spotifyProc.MainWindowTitle) {
    try {
      $activated = $wshell.AppActivate($spotifyProc.MainWindowTitle);
    } catch {
      $activated = $false;
    }
  }

  if (-not $activated) {
    Start-Sleep -Milliseconds 300;
  }
}

if (-not $activated) {
  throw 'Could not focus Spotify window for playback after retries (window handle/title activation failed).';
}

Start-Sleep -Milliseconds 200;
$wshell.SendKeys('%{TAB}');
Start-Sleep -Milliseconds 120;
$wshell.SendKeys('%{TAB}');
Start-Sleep -Milliseconds 180;

Start-Sleep -Milliseconds 250;
$wshell.SendKeys('^l');
Start-Sleep -Milliseconds 250;
$wshell.SendKeys((Escape-SendKeysText $query));
Start-Sleep -Milliseconds 320;
$wshell.SendKeys('{ENTER}');
Start-Sleep -Milliseconds 900;

# Try quick play path first: in many Spotify builds, Enter from search opens top result.
$wshell.SendKeys('{ENTER}');
Start-Sleep -Milliseconds 450;

# Force focus into results area and play first track.
$wshell.SendKeys('{TAB}');
Start-Sleep -Milliseconds 120;
$wshell.SendKeys('{TAB}');
Start-Sleep -Milliseconds 120;
$wshell.SendKeys('{TAB}');
Start-Sleep -Milliseconds 120;
$wshell.SendKeys('{DOWN}');
Start-Sleep -Milliseconds 180;
$wshell.SendKeys('{ENTER}');
Start-Sleep -Milliseconds 260;
$wshell.SendKeys('{ENTER}');
Start-Sleep -Milliseconds 220;

# Final fallback for UIs that keep focus in the track table after selection.
$wshell.SendKeys('{DOWN}');
Start-Sleep -Milliseconds 120;
$wshell.SendKeys('{ENTER}');
Start-Sleep -Milliseconds 180;

Write-Output 'SPOTIFY_PLAY_ATTEMPTED';
`;

    const result = await runPowerShell(script);
    return {
      usedWebFallback: false,
      attemptedPlayback: result.stdout.includes("SPOTIFY_PLAY_ATTEMPTED"),
      exactTrackResolved: false,
      resolvedTitle: "",
      resolvedArtists: ""
    };
  } catch (error) {
    return {
      usedWebFallback: false,
      attemptedPlayback: false,
      desktopFailure: true,
      errorMessage: String(error?.message || error || "Spotify desktop playback failed.")
    };
  }
}

async function runRawCommand(command) {
  return runPowerShell(command);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function openFolder(targetPath) {
  const escaped = String(targetPath || "").replace(/'/g, "''");
  await runPowerShell(`Start-Process explorer.exe -ArgumentList '${escaped}'`);
}

async function openFile(targetPath) {
  const escaped = String(targetPath || "").replace(/'/g, "''");
  await runPowerShell(`Start-Process '${escaped}'`);
}

async function listDirectory(targetPath) {
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const sliced = entries.slice(0, MAX_LIST_ITEMS).map((entry) => {
    const prefix = entry.isDirectory() ? "[DIR] " : "[FILE]";
    return `${prefix} ${entry.name}`;
  });

  return {
    items: sliced,
    truncated: entries.length > MAX_LIST_ITEMS,
    total: entries.length
  };
}

async function readTextPreview(filePath) {
  const data = await fs.readFile(filePath, "utf8");
  if (data.length <= MAX_READ_CHARS) {
    return { preview: data, truncated: false };
  }

  return {
    preview: `${data.slice(0, MAX_READ_CHARS)}\n... [truncated]`,
    truncated: true
  };
}

async function findMatchesByName(rootPath, query) {
  const results = [];
  const queue = [{ currentPath: rootPath, depth: 0 }];
  const needle = String(query || "").toLowerCase();

  while (queue.length && results.length < MAX_SEARCH_RESULTS) {
    const { currentPath, depth } = queue.shift();

    let entries = [];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      const entryName = entry.name.toLowerCase();

      if (entryName.includes(needle)) {
        results.push(entryPath);
        if (results.length >= MAX_SEARCH_RESULTS) {
          break;
        }
      }

      if (entry.isDirectory() && depth < MAX_SEARCH_DEPTH) {
        queue.push({ currentPath: entryPath, depth: depth + 1 });
      }
    }
  }

  return results;
}

async function launchApp(app) {
  const command = String(app?.launch || "").trim();
  if (!command) {
    throw new Error("App command is missing.");
  }

  await runPowerShell(`Start-Process '${command.replace(/'/g, "''")}'`);
}

async function closeAppProcesses(app) {
  const processNames = Array.isArray(app?.processes)
    ? app.processes.filter((name) => String(name || "").trim())
    : [];

  if (!processNames.length) {
    throw new Error("No process name available for this app.");
  }

  const escapedNames = processNames.map((name) => String(name).replace(/'/g, "''"));
  const conditions = escapedNames.map((name) => `$_ .Name -eq '${name}'`.replace("$_ .", "$_.")).join(" -or ");
  const script = `
$targets = Get-Process -ErrorAction SilentlyContinue | Where-Object { ${conditions} };
if (-not $targets) {
  Write-Output 'NO_PROCESS_FOUND';
  return;
}
$targets | Stop-Process -Force -ErrorAction SilentlyContinue;
Write-Output ('STOPPED_COUNT=' + $targets.Count);
`;
  const result = await runPowerShell(script);

  if (result.stdout.includes("NO_PROCESS_FOUND")) {
    return { stopped: 0 };
  }

  const match = result.stdout.match(/STOPPED_COUNT=(\d+)/);
  return { stopped: match ? Number(match[1]) : 0 };
}

export async function executeSystemAction(action) {
  if (!action) {
    return { ok: false, message: "No action to run." };
  }

  try {
    switch (action.type) {
      case "setVolume": {
        const downSteps = 50;
        const upSteps = Math.round(clampPercent(action.percent, 50) / 2);
        await pressVolumeKey("AE", downSteps);
        if (upSteps > 0) {
          await pressVolumeKey("AF", upSteps);
        }
        return { ok: true, message: `Volume set to about ${action.percent}%` };
      }
      case "adjustVolume": {
        const steps = Math.max(1, Math.round(Math.abs(action.delta) / 2));
        await pressVolumeKey(action.delta >= 0 ? "AF" : "AE", steps);
        return { ok: true, message: `Volume adjusted by ${action.delta}%` };
      }
      case "muteVolume": {
        await pressVolumeKey("AD", 1);
        return { ok: true, message: "Volume muted." };
      }
      case "unmuteVolume": {
        await pressVolumeKey("AD", 1);
        return { ok: true, message: "Volume unmuted." };
      }
      case "setBrightness": {
        await setBrightness(action.percent);
        return { ok: true, message: `Brightness set to ${action.percent}%` };
      }
      case "adjustBrightness": {
        const current = await getCurrentBrightness();
        const next = clampPercent(current + action.delta, current);
        await setBrightness(next);
        return { ok: true, message: `Brightness changed from ${current}% to ${next}%` };
      }
      case "createFolder": {
        const guard = validatePathInSandbox(action.targetPath);
        if (!guard.ok) {
          return { ok: false, message: guard.message };
        }
        await fs.mkdir(action.targetPath, { recursive: true });
        return { ok: true, message: `Folder ready: ${action.targetPath}` };
      }
      case "deletePath": {
        const guard = validatePathInSandbox(action.targetPath);
        if (!guard.ok) {
          return { ok: false, message: guard.message };
        }
        await fs.rm(action.targetPath, { recursive: true, force: true });
        return { ok: true, message: `Deleted: ${action.targetPath}` };
      }
      case "renamePath": {
        const guard = validatePathsInSandbox(action.sourcePath, action.targetPath);
        if (!guard.ok) {
          return { ok: false, message: guard.message };
        }
        await fs.rename(action.sourcePath, action.targetPath);
        return {
          ok: true,
          message: `Renamed ${action.sourcePath} to ${action.targetPath}`
        };
      }
      case "createDocument": {
        const guard = validatePathInSandbox(action.targetPath);
        if (!guard.ok) {
          return { ok: false, message: guard.message };
        }
        await fs.mkdir(path.dirname(action.targetPath), { recursive: true });
        await fs.writeFile(action.targetPath, action.content || "", "utf8");
        return { ok: true, message: `Document created: ${action.targetPath}` };
      }
      case "writeDocument": {
        const guard = validatePathInSandbox(action.targetPath);
        if (!guard.ok) {
          return { ok: false, message: guard.message };
        }
        await fs.mkdir(path.dirname(action.targetPath), { recursive: true });
        await fs.writeFile(action.targetPath, action.content || "", "utf8");
        return { ok: true, message: `Wrote content to ${action.targetPath}` };
      }
      case "appendDocument": {
        const guard = validatePathInSandbox(action.targetPath);
        if (!guard.ok) {
          return { ok: false, message: guard.message };
        }
        await fs.mkdir(path.dirname(action.targetPath), { recursive: true });
        const text = action.content || "";
        await fs.appendFile(action.targetPath, `${text}\n`, "utf8");
        return { ok: true, message: `Appended content to ${action.targetPath}` };
      }
      case "copyPath": {
        const guard = validatePathsInSandbox(action.sourcePath, action.targetPath);
        if (!guard.ok) {
          return { ok: false, message: guard.message };
        }

        const targetExists = await pathExists(action.targetPath);
        if (targetExists && !action.overwrite) {
          return {
            ok: false,
            requiresConfirmation: true,
            pendingAction: {
              ...action,
              overwrite: true
            },
            message: `Target already exists: ${action.targetPath}. Overwrite it?`
          };
        }

        await fs.cp(action.sourcePath, action.targetPath, {
          recursive: true,
          force: true,
          errorOnExist: false
        });
        return {
          ok: true,
          message: `Copied ${action.sourcePath} to ${action.targetPath}`
        };
      }
      case "movePath": {
        const guard = validatePathsInSandbox(action.sourcePath, action.targetPath);
        if (!guard.ok) {
          return { ok: false, message: guard.message };
        }

        const targetExists = await pathExists(action.targetPath);
        if (targetExists && !action.overwrite) {
          return {
            ok: false,
            requiresConfirmation: true,
            pendingAction: {
              ...action,
              overwrite: true
            },
            message: `Target already exists: ${action.targetPath}. Overwrite it before move?`
          };
        }

        if (targetExists && action.overwrite) {
          await fs.rm(action.targetPath, { recursive: true, force: true });
        }

        try {
          await fs.rename(action.sourcePath, action.targetPath);
        } catch (error) {
          if (String(error?.code || "") !== "EXDEV") {
            throw error;
          }

          await fs.cp(action.sourcePath, action.targetPath, {
            recursive: true,
            force: true,
            errorOnExist: false
          });
          await fs.rm(action.sourcePath, { recursive: true, force: true });
        }

        return {
          ok: true,
          message: `Moved ${action.sourcePath} to ${action.targetPath}`
        };
      }
      case "openFolder": {
        const guard = validatePathInSandbox(action.targetPath);
        if (!guard.ok) {
          return { ok: false, message: guard.message };
        }

        await openFolder(action.targetPath);
        return { ok: true, message: `Opened folder ${action.targetPath}` };
      }
      case "openFile": {
        const guard = validatePathInSandbox(action.targetPath);
        if (!guard.ok) {
          return { ok: false, message: guard.message };
        }

        await openFile(action.targetPath);
        return { ok: true, message: `Opened file ${action.targetPath}` };
      }
      case "listPath": {
        const guard = validatePathInSandbox(action.targetPath);
        if (!guard.ok) {
          return { ok: false, message: guard.message };
        }

        const list = await listDirectory(action.targetPath);
        const body = list.items.length ? list.items.join("\n") : "(empty folder)";
        const suffix = list.truncated ? `\n... showing ${MAX_LIST_ITEMS} of ${list.total} entries` : "";
        return {
          ok: true,
          message: `Items in ${action.targetPath}:\n${body}${suffix}`
        };
      }
      case "readDocument": {
        const guard = validatePathInSandbox(action.targetPath);
        if (!guard.ok) {
          return { ok: false, message: guard.message };
        }

        const preview = await readTextPreview(action.targetPath);
        const suffix = preview.truncated ? "\n[Only first part shown]" : "";
        return {
          ok: true,
          message: `Contents of ${action.targetPath}:\n${preview.preview}${suffix}`
        };
      }
      case "findPath": {
        const guard = validatePathInSandbox(action.targetPath);
        if (!guard.ok) {
          return { ok: false, message: guard.message };
        }

        if (!action.query) {
          return { ok: false, message: "Search query is empty." };
        }

        const matches = await findMatchesByName(action.targetPath, action.query);
        if (!matches.length) {
          return {
            ok: true,
            message: `No files or folders matching '${action.query}' in ${action.targetPath}`
          };
        }

        const lines = matches.map((item) => `- ${item}`);
        const truncated = matches.length >= MAX_SEARCH_RESULTS ? "\n... results truncated" : "";
        return {
          ok: true,
          message: `Matches for '${action.query}' in ${action.targetPath}:\n${lines.join("\n")}${truncated}`
        };
      }
      case "playSpotify": {
        const result = await openSpotifyTrackOrSearch(action.query);
        if (result.desktopFailure) {
          return {
            ok: false,
            message: `I stayed on Spotify desktop and did not open web. Playback failed for '${action.query}': ${result.errorMessage}`
          };
        }

        if (result.exactTrackResolved) {
          const suffix = result.resolvedArtists
            ? ` (${result.resolvedArtists})`
            : "";
          return {
            ok: true,
            message: `Opened Spotify and requested exact track '${result.resolvedTitle || action.query}'${suffix}.`
          };
        }

        return {
          ok: true,
          message: result.attemptedPlayback
            ? `Opened Spotify and attempted playback for '${action.query}' (top result).`
            : `Opened Spotify search for '${action.query}'.`
        };
      }
      case "openUrl": {
        await openUrl(action.url);
        return { ok: true, message: `Opened ${action.url}` };
      }
      case "openApp": {
        await launchApp(action.app);
        return { ok: true, message: `Opened ${action.app?.name || action.app?.launch}` };
      }
      case "closeApp": {
        const result = await closeAppProcesses(action.app);
        if (!result.stopped) {
          return {
            ok: true,
            message: `No running process found for ${action.app?.name || action.app?.launch}`
          };
        }
        return {
          ok: true,
          message: `Closed ${action.app?.name || action.app?.launch} (${result.stopped} process(es))`
        };
      }
      case "runCommand": {
        const result = await runRawCommand(action.command);
        const out = result.stdout || result.stderr || "Command finished.";
        return { ok: true, message: out };
      }
      case "blockedCommand": {
        return {
          ok: false,
          message: "I blocked that command because it looks unsafe for your PC."
        };
      }
      default:
        return { ok: false, message: "Unsupported action." };
    }
  } catch (error) {
    return { ok: false, message: String(error?.message || error || "System action failed") };
  }
}
