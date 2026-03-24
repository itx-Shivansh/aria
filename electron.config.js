export const electronConfig = {
  window: {
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0f172a"
  },
  renderer: {
    devServerUrl: "http://localhost:5173",
    devEntry: "src/renderer/index.html",
    buildEntry: "dist/renderer/index.html"
  },
  ai: {
    provider: {
      primary: "ollama",
      fallback: "groq"
    },
    ollama: {
      baseUrl: "http://127.0.0.1:11434",
      defaultModel: "llama3.1:8b"
    },
    groq: {
      baseUrl: "https://api.groq.com/openai/v1",
      defaultModel: "llama-3.1-8b-instant"
    }
  },
  memoryFile: "aria-memory.json"
};