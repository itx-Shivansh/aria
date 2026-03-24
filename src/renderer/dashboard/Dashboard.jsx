import React, { useEffect, useMemo, useState } from "react";
import { GROQ_MODELS, testConnection as testGroqConnection } from "../../api/groqClient.js";
import { listModels, testConnection as testOllamaConnection } from "../../api/ollamaClient.js";
import "./Dashboard.css";

const STORAGE_KEY = "aria_config";

const DEFAULT_CONFIG = {
  provider: "auto",
  ollamaModel: "llama3",
  groqApiKey: "",
  groqModel: GROQ_MODELS.fast,
  userName: "User",
  tone: "concise",
  language: "auto",
  codeAgentMode: "standard",
  autoConfirmThreshold: "medium",
  modules: {
    email: true,
    code: true,
    calendar: true,
    messaging: true,
    files: true
  }
};

const MODULE_ROWS = [
  { key: "email", icon: "📧", name: "Email", description: "Draft and manage emails" },
  { key: "code", icon: "💻", name: "Code", description: "Write, debug, and run code" },
  { key: "calendar", icon: "📅", name: "Calendar", description: "Schedule and reminders" },
  {
    key: "messaging",
    icon: "💬",
    name: "Messaging",
    description: "Slack, WhatsApp messages"
  },
  { key: "files", icon: "📁", name: "Files", description: "Organize and manage files" }
];

const GROQ_MODEL_DESCRIPTIONS = {
  [GROQ_MODELS.fast]: "Fastest, good for chat",
  [GROQ_MODELS.smart]: "Smarter, still free",
  [GROQ_MODELS.code]: "Best for code tasks",
  [GROQ_MODELS.lightning]: "Ultra fast responses"
};

function Dashboard({ settings, onSettingsChange, onSave }) {
  const [configState, setConfigState] = useState(() => ({
    ...DEFAULT_CONFIG,
    userName: settings?.userName || DEFAULT_CONFIG.userName,
    tone: settings?.tone || DEFAULT_CONFIG.tone
  }));
  const [saved, setSaved] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState({
    state: "idle",
    models: []
  });
  const [groqStatus, setGroqStatus] = useState("idle");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      setConfigState((previous) => ({
        ...previous,
        ...parsed,
        modules: {
          ...previous.modules,
          ...(parsed.modules || {})
        }
      }));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const shouldShowOllama = useMemo(() => {
    return configState.provider === "ollama" || configState.provider === "auto";
  }, [configState.provider]);

  const shouldShowGroq = useMemo(() => {
    return configState.provider === "groq" || configState.provider === "auto";
  }, [configState.provider]);

  function updateState(patch) {
    setConfigState((previous) => {
      const next = { ...previous, ...patch };
      if (onSettingsChange) {
        onSettingsChange(next);
      }
      return next;
    });
  }

  function updateModule(key, value) {
    setConfigState((previous) => {
      const next = {
        ...previous,
        modules: {
          ...previous.modules,
          [key]: value
        }
      };
      if (onSettingsChange) {
        onSettingsChange(next);
      }
      return next;
    });
  }

  async function checkOllama() {
    setOllamaStatus({ state: "checking", models: [] });

    const status = await testOllamaConnection();
    if (!status.connected) {
      setOllamaStatus({ state: "offline", models: [] });
      return;
    }

    const installedModels = await listModels();
    setOllamaStatus({
      state: "running",
      models: installedModels
    });

    if (installedModels.length && !installedModels.includes(configState.ollamaModel)) {
      updateState({ ollamaModel: installedModels[0] });
    }
  }

  async function checkGroqKey() {
    setGroqStatus("testing");
    const ok = await testGroqConnection(configState.groqApiKey);
    setGroqStatus(ok ? "valid" : "invalid");
  }

  async function handleSave() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configState));
    if (onSave) {
      await onSave(configState);
    }

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
    }, 2000);
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>ARIA Settings Dashboard</h1>
        <p>Configure providers, user preferences, and module behavior.</p>
      </header>

      <section className="settings-card">
        <h2>Section 1: AI Provider</h2>
        <div className="provider-cards">
          <button
            type="button"
            className={`provider-card ${configState.provider === "ollama" ? "active" : ""}`}
            onClick={() => updateState({ provider: "ollama" })}
          >
            <span>🖥</span>
            <div>
              <strong>Ollama</strong>
              <p>Local and Free</p>
            </div>
          </button>
          <button
            type="button"
            className={`provider-card ${configState.provider === "groq" ? "active" : ""}`}
            onClick={() => updateState({ provider: "groq" })}
          >
            <span>☁️</span>
            <div>
              <strong>Groq</strong>
              <p>Cloud and Free</p>
            </div>
          </button>
          <button
            type="button"
            className={`provider-card ${configState.provider === "auto" ? "active" : ""}`}
            onClick={() => updateState({ provider: "auto" })}
          >
            <span>🔄</span>
            <div>
              <strong>Auto</strong>
              <p>Best available provider</p>
            </div>
          </button>
        </div>

        {shouldShowOllama && (
          <div className="provider-block">
            <div className="status-row">
              <span>Ollama Status:</span>
              <button type="button" className="ghost-btn" onClick={checkOllama}>
                {ollamaStatus.state === "checking" ? "Checking..." : "Check Connection"}
              </button>
            </div>
            {ollamaStatus.state === "running" && (
              <p className="status-ok">
                🟢 Running - Models: {ollamaStatus.models.length ? ollamaStatus.models.join(", ") : "none"}
              </p>
            )}
            {ollamaStatus.state === "offline" && (
              <p className="status-bad">🔴 Offline - Start with: ollama serve</p>
            )}

            <label className="field-label">
              Ollama Model
              <select
                value={configState.ollamaModel}
                onChange={(event) => updateState({ ollamaModel: event.target.value })}
              >
                {(ollamaStatus.models.length ? ollamaStatus.models : [configState.ollamaModel]).map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>

            <p className="provider-hint">Don't have Ollama? -&gt; ollama.com/download</p>
          </div>
        )}

        {shouldShowGroq && (
          <div className="provider-block">
            <label className="field-label">
              Groq API Key
              <input
                type="password"
                value={configState.groqApiKey}
                onChange={(event) => updateState({ groqApiKey: event.target.value.trim() })}
                placeholder="Free key at console.groq.com"
              />
            </label>
            <div className="status-row">
              <button type="button" className="ghost-btn" onClick={checkGroqKey}>
                {groqStatus === "testing" ? "Testing..." : "Test Key"}
              </button>
              {groqStatus === "valid" && <span className="status-ok">Key is valid</span>}
              {groqStatus === "invalid" && <span className="status-bad">Key is invalid</span>}
            </div>

            <label className="field-label">
              Groq Model
              <select
                value={configState.groqModel}
                onChange={(event) => updateState({ groqModel: event.target.value })}
              >
                {Object.values(GROQ_MODELS).map((modelName) => (
                  <option key={modelName} value={modelName}>
                    {modelName} - {GROQ_MODEL_DESCRIPTIONS[modelName]}
                  </option>
                ))}
              </select>
            </label>

            <span className="tier-badge">Free tier: 14,400 req/day</span>
          </div>
        )}
      </section>

      <section className="settings-card">
        <h2>Section 2: User Preferences</h2>
        <label className="field-label">
          User Name
          <input
            type="text"
            value={configState.userName}
            onChange={(event) => updateState({ userName: event.target.value })}
          />
        </label>

        <div className="field-label">
          <span>Default Tone</span>
          <div className="segmented-control">
            {[
              { key: "casual", label: "casual" },
              { key: "professional", label: "professional" },
              { key: "concise", label: "concise" }
            ].map((tone) => (
              <button
                key={tone.key}
                type="button"
                className={configState.tone === tone.key ? "segment active" : "segment"}
                onClick={() => updateState({ tone: tone.key })}
              >
                {tone.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field-label">
          Response Language
          <select
            value={configState.language}
            onChange={(event) => updateState({ language: event.target.value })}
          >
            <option value="english">English</option>
            <option value="hindi">Hindi</option>
            <option value="auto">Auto-detect</option>
          </select>
        </label>
      </section>

      <section className="settings-card">
        <h2>Section 3: Agent Behavior</h2>
        <div className="field-label">
          <span>Code Agent Mode</span>
          <div className="mode-row">
            {[
              { key: "safe", label: "safe" },
              { key: "standard", label: "standard" },
              { key: "autonomous", label: "autonomous" }
            ].map((mode) => (
              <button
                key={mode.key}
                type="button"
                className={configState.codeAgentMode === mode.key ? "segment active" : "segment"}
                onClick={() => updateState({ codeAgentMode: mode.key })}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {configState.codeAgentMode === "autonomous" && (
          <div className="warning-card">
            ⚠️ Autonomous mode allows ARIA to run terminal commands.
          </div>
        )}

        <div className="field-label">
          <span>Auto-confirm threshold</span>
          <div className="slider-row">
            <span>low</span>
            <input
              type="range"
              min="0"
              max="2"
              step="1"
              value={configState.autoConfirmThreshold === "low" ? 0 : configState.autoConfirmThreshold === "medium" ? 1 : 2}
              onChange={(event) => {
                const value = Number(event.target.value);
                updateState({
                  autoConfirmThreshold: value === 0 ? "low" : value === 1 ? "medium" : "high"
                });
              }}
            />
            <span>high</span>
            <strong>{configState.autoConfirmThreshold}</strong>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <h2>Section 4: Active Modules</h2>
        <div className="module-list">
          {MODULE_ROWS.map((item) => (
            <div className="module-row" key={item.key}>
              <div className="module-info">
                <span className="module-icon">{item.icon}</span>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.description}</p>
                </div>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={configState.modules[item.key]}
                  onChange={(event) => updateModule(item.key, event.target.checked)}
                />
                <span className="slider" />
              </label>
            </div>
          ))}
        </div>
      </section>

      <div className="save-row">
        <button type="button" className="save-btn" onClick={handleSave}>
          Save Configuration
        </button>
        {saved && <span className="saved-indicator">✓ Saved</span>}
      </div>
    </div>
  );
}

export default Dashboard;