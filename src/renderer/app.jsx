import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./dashboard/Dashboard.jsx";
import ChatWindow from "./chat/ChatWindow.jsx";
import Sidebar from "./components/Sidebar.jsx";
import StatusBar from "./components/StatusBar.jsx";

const shellStyle = {
  display: "grid",
  gridTemplateColumns: "260px 1fr",
  height: "100vh",
  width: "100vw"
};

const contentStyle = {
  display: "grid",
  gridTemplateRows: "1fr auto",
  overflow: "hidden"
};

const panelStyle = {
  padding: "18px",
  overflow: "auto"
};

function App() {
  const [activeView, setActiveView] = useState("chat");
  const [status, setStatus] = useState("Ready");
  const [settings, setSettings] = useState({
    primaryProvider: "ollama",
    fallbackProvider: "groq",
    ollamaBaseUrl: "http://127.0.0.1:11434",
    ollamaModel: "llama3.1:8b",
    groqApiKey: "",
    groqModel: "llama-3.1-8b-instant",
    temperature: 0.4
  });

  useEffect(() => {
    let unsubscribe = () => {};

    async function initApp() {
      try {
        const settingsPromise = window.aria?.getSettings?.() ?? Promise.resolve({});
        const saved = await settingsPromise;
        setSettings((prev) => ({ ...prev, ...(saved || {}) }));
      } catch (e) {
        console.warn("Settings load failed, using defaults", e);
      }

      if (window.aria?.onStatus) {
        unsubscribe = window.aria.onStatus((nextStatus) => {
          setStatus(nextStatus);
        });
      }
    }

    initApp();

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  const view = useMemo(() => {
    if (activeView === "dashboard") {
      return (
        <Dashboard
          settings={settings}
          onSettingsChange={setSettings}
          onSave={window.aria?.saveSettings || (() => Promise.resolve({}))}
        />
      );
    }

    return <ChatWindow onOpenSettings={() => setActiveView("dashboard")} />;
  }, [activeView, settings]);

  return (
    <main style={shellStyle}>
      <Sidebar activeView={activeView} onChangeView={setActiveView} />
      <section style={contentStyle}>
        <div style={panelStyle}>{view}</div>
        <StatusBar text={status} />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);

export default App;