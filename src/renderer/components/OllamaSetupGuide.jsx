import React, { useMemo, useState } from "react";
import { testConnection } from "../../api/ollamaClient.js";

const MODELS = [
  {
    id: "llama3",
    title: "llama3",
    size: "4.7GB",
    ram: "8GB+ RAM recommended",
    desc: "Best for general chat and tasks",
    command: "ollama pull llama3"
  },
  {
    id: "codellama",
    title: "codellama",
    size: "3.8GB",
    ram: "8GB+ RAM recommended",
    desc: "Best for coding tasks",
    command: "ollama pull codellama"
  },
  {
    id: "mistral",
    title: "mistral",
    size: "4.1GB",
    ram: "8GB+ RAM recommended",
    desc: "Fast and smart, great all-rounder",
    command: "ollama pull mistral"
  },
  {
    id: "phi3",
    title: "phi3",
    size: "2.3GB",
    ram: "4GB+ RAM recommended",
    desc: "Lightweight, great for low-end PCs",
    command: "ollama pull phi3"
  }
];

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function OllamaSetupGuide({ onReady }) {
  const [checked, setChecked] = useState({
    step1: false,
    step2: false,
    step3: false,
    step4: false
  });
  const [selectedModel, setSelectedModel] = useState("llama3");
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState("idle");
  const [copied, setCopied] = useState("");

  const selectedModelInfo = useMemo(
    () => MODELS.find((item) => item.id === selectedModel) || MODELS[0],
    [selectedModel]
  );

  async function handleCopy(label, value) {
    const ok = await copyText(value);
    if (!ok) {
      return;
    }

    setCopied(label);
    setTimeout(() => {
      setCopied("");
    }, 1500);
  }

  async function handleCheckAgain() {
    setChecking(true);
    const result = await testConnection();
    setChecking(false);

    if (result.connected) {
      setChecked((prev) => ({ ...prev, step4: true }));
      setStatus("ready");
      if (typeof onReady === "function") {
        setTimeout(() => {
          onReady();
        }, 600);
      }
      return;
    }

    setStatus("offline");
  }

  function markStep(stepKey) {
    setChecked((prev) => ({ ...prev, [stepKey]: !prev[stepKey] }));
  }

  return (
    <section
      style={{
        background: "#0d0d0d",
        border: "1px solid rgba(0, 255, 136, 0.22)",
        borderRadius: "14px",
        padding: "16px",
        color: "#d4ffe6",
        fontFamily: '"JetBrains Mono", "Consolas", monospace',
        display: "flex",
        flexDirection: "column",
        gap: "14px"
      }}
    >
      <header>
        <h2 style={{ margin: 0, color: "#00ff88", fontSize: "1.15rem" }}>Ollama Setup Guide</h2>
        <p style={{ margin: "8px 0 0", color: "#89c7a3" }}>
          ARIA could not detect Ollama yet. Follow these steps to enable local AI.
        </p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <article style={{ border: "1px solid rgba(0,255,136,0.18)", borderRadius: "10px", padding: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
            <input type="checkbox" checked={checked.step1} onChange={() => markStep("step1")} />
            Step 1: Download Ollama
          </label>
          <a
            href="https://ollama.com/download"
            target="_blank"
            rel="noreferrer"
            style={{
              marginTop: "10px",
              display: "inline-flex",
              border: "1px solid rgba(0,255,136,0.45)",
              color: "#00ff88",
              textDecoration: "none",
              borderRadius: "8px",
              padding: "8px 10px"
            }}
          >
            Download for Windows/Mac/Linux
          </a>
        </article>

        <article style={{ border: "1px solid rgba(0,255,136,0.18)", borderRadius: "10px", padding: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
            <input type="checkbox" checked={checked.step2} onChange={() => markStep("step2")} />
            Step 2: Install and start Ollama
          </label>
          <div
            style={{
              marginTop: "10px",
              border: "1px solid rgba(0,255,136,0.2)",
              background: "#111",
              borderRadius: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px"
            }}
          >
            <code>ollama serve</code>
            <button
              type="button"
              onClick={() => handleCopy("serve", "ollama serve")}
              style={{
                border: "1px solid rgba(0,255,136,0.35)",
                background: "transparent",
                color: "#b8ffda",
                borderRadius: "7px",
                padding: "5px 10px",
                cursor: "pointer"
              }}
            >
              {copied === "serve" ? "Copied" : "Copy"}
            </button>
          </div>
        </article>

        <article style={{ border: "1px solid rgba(0,255,136,0.18)", borderRadius: "10px", padding: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
            <input type="checkbox" checked={checked.step3} onChange={() => markStep("step3")} />
            Step 3: Pull a free AI model
          </label>

          <div
            style={{
              marginTop: "10px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "10px"
            }}
          >
            {MODELS.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => setSelectedModel(model.id)}
                style={{
                  textAlign: "left",
                  border:
                    selectedModel === model.id
                      ? "1px solid rgba(0,255,136,0.7)"
                      : "1px solid rgba(0,255,136,0.2)",
                  background: selectedModel === model.id ? "rgba(0,255,136,0.08)" : "#111",
                  color: "#d4ffe6",
                  borderRadius: "10px",
                  padding: "10px",
                  cursor: "pointer"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                  <strong>{model.title}</strong>
                  <span>{model.size}</span>
                </div>
                <p style={{ margin: "7px 0 0", color: "#8cc8a5", fontSize: "0.83rem" }}>{model.desc}</p>
                <p style={{ margin: "6px 0 0", color: "#73b58f", fontSize: "0.8rem" }}>{model.ram}</p>
              </button>
            ))}
          </div>

          <div
            style={{
              marginTop: "10px",
              border: "1px solid rgba(0,255,136,0.2)",
              background: "#111",
              borderRadius: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px"
            }}
          >
            <code>{selectedModelInfo.command}</code>
            <button
              type="button"
              onClick={() => handleCopy("pull", selectedModelInfo.command)}
              style={{
                border: "1px solid rgba(0,255,136,0.35)",
                background: "transparent",
                color: "#b8ffda",
                borderRadius: "7px",
                padding: "5px 10px",
                cursor: "pointer"
              }}
            >
              {copied === "pull" ? "Copied" : "Copy"}
            </button>
          </div>
        </article>

        <article style={{ border: "1px solid rgba(0,255,136,0.18)", borderRadius: "10px", padding: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
            <input type="checkbox" checked={checked.step4} onChange={() => markStep("step4")} />
            Step 4: Check connection
          </label>
          <div style={{ marginTop: "10px", display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              onClick={handleCheckAgain}
              disabled={checking}
              style={{
                border: "1px solid rgba(0,255,136,0.45)",
                background: "rgba(0,255,136,0.1)",
                color: "#00ff88",
                borderRadius: "8px",
                padding: "8px 12px",
                cursor: checking ? "default" : "pointer",
                opacity: checking ? 0.65 : 1
              }}
            >
              {checking ? "Checking..." : "Check Again"}
            </button>

            {status === "ready" && <span style={{ color: "#5bffac" }}>🟢 ARIA is ready!</span>}
            {status === "offline" && (
              <span style={{ color: "#ff8f8f" }}>🔴 Ollama is still offline. Keep ollama serve running.</span>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

export default OllamaSetupGuide;