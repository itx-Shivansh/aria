const OLLAMA_BASE_URL = "http://localhost:11434";

function splitLines(chunk, state) {
  const merged = state.remainder + chunk;
  const lines = merged.split("\n");
  state.remainder = lines.pop() || "";
  return lines;
}

export async function* sendMessage(messages, systemPrompt, model = "llama3") {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      system: systemPrompt
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${details}`);
  }

  if (!response.body) {
    throw new Error("Ollama response stream is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state = { remainder: "" };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    const lines = splitLines(chunk, state);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const payload = JSON.parse(trimmed);
      const token = payload?.message?.content;
      if (token) {
        yield token;
      }
    }
  }

  if (state.remainder.trim()) {
    const payload = JSON.parse(state.remainder.trim());
    const token = payload?.message?.content;
    if (token) {
      yield token;
    }
  }
}

export async function testConnection() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: "GET"
    });

    if (!response.ok) {
      return { connected: false, models: [] };
    }

    const payload = await response.json();
    const models = Array.isArray(payload?.models)
      ? payload.models
          .map((item) => item?.name)
          .filter((name) => typeof name === "string" && name.length > 0)
      : [];

    return { connected: true, models };
  } catch {
    return { connected: false, models: [] };
  }
}

export async function listModels() {
  const result = await testConnection();
  return result.models;
}

export async function getRecommendedModel(task) {
  const models = await listModels();
  if (!models.length) {
    return "llama3";
  }

  const normalized = models.map((name) => name.toLowerCase());
  const preferredByTask = {
    code: "codellama",
    chat: "llama3",
    reasoning: "mistral"
  };
  const preferred = preferredByTask[task] || preferredByTask.chat;

  const matchIndex = normalized.findIndex((name) => name.includes(preferred));
  if (matchIndex >= 0) {
    return models[matchIndex];
  }

  return models[0];
}