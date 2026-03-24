const GROQ_BASE_URL = "https://api.groq.com";

export const GROQ_MODELS = {
  fast: "llama3-8b-8192",
  smart: "llama3-70b-8192",
  code: "mixtral-8x7b-32768",
  lightning: "gemma-7b-it"
};

function splitLines(chunk, state) {
  const merged = state.remainder + chunk;
  const lines = merged.split("\n");
  state.remainder = lines.pop() || "";
  return lines;
}

export async function* sendMessage(messages, systemPrompt, apiKey, model = "llama3-8b-8192") {
  if (!apiKey) {
    throw new Error("Groq API key is missing.");
  }

  const response = await fetch(`${GROQ_BASE_URL}/openai/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        ...messages
      ],
      stream: true
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Groq request failed (${response.status}): ${details}`);
  }

  if (!response.body) {
    throw new Error("Groq response stream is unavailable.");
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
      if (!trimmed.startsWith("data:")) {
        continue;
      }

      const payloadText = trimmed.slice(5).trim();
      if (!payloadText || payloadText === "[DONE]") {
        continue;
      }

      const payload = JSON.parse(payloadText);
      const token = payload?.choices?.[0]?.delta?.content;
      if (token) {
        yield token;
      }
    }
  }

  if (state.remainder.trim().startsWith("data:")) {
    const payloadText = state.remainder.trim().slice(5).trim();
    if (payloadText && payloadText !== "[DONE]") {
      const payload = JSON.parse(payloadText);
      const token = payload?.choices?.[0]?.delta?.content;
      if (token) {
        yield token;
      }
    }
  }
}

export async function testConnection(apiKey) {
  if (!apiKey) {
    return false;
  }

  try {
    const response = await fetch(`${GROQ_BASE_URL}/openai/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODELS.fast,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false
      })
    });

    return response.ok;
  } catch {
    return false;
  }
}