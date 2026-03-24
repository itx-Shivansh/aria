import * as ollamaClient from "./ollamaClient.js";
import * as groqClient from "./groqClient.js";
import { GROQ_MODELS } from "./groqClient.js";

class ARIAError extends Error {
  constructor(message) {
    super(message);
    this.name = "ARIAError";
  }
}

function intentToTask(intent) {
  if (intent === "code") {
    return "code";
  }
  if (intent === "chat") {
    return "chat";
  }
  return "reasoning";
}

function intentToGroqModel(intent) {
  if (intent === "code") {
    return GROQ_MODELS.code;
  }
  if (intent === "chat") {
    return GROQ_MODELS.fast;
  }
  return GROQ_MODELS.smart;
}

export async function getAIClient(config, intent) {
  const provider = config?.provider || "auto";

  if (provider === "ollama") {
    return ollamaClient;
  }

  if (provider === "groq") {
    return groqClient;
  }

  const ollamaStatus = await ollamaClient.testConnection();
  if (ollamaStatus.connected) {
    const task = intentToTask(intent);
    const model = config?.preferredModel || (await ollamaClient.getRecommendedModel(task));
    return {
      ...ollamaClient,
      selectedModel: model,
      selectedProvider: "ollama"
    };
  }

  if (config?.groqApiKey) {
    const model = config?.preferredModel || intentToGroqModel(intent);
    return {
      ...groqClient,
      selectedModel: model,
      selectedProvider: "groq"
    };
  }

  throw new ARIAError("No AI provider available");
}

export async function* streamResponse(client, messages, systemPrompt, config) {
  const provider = client?.selectedProvider || config?.provider;

  if (provider === "groq") {
    const model = client?.selectedModel || config?.preferredModel || GROQ_MODELS.fast;
    console.log(`[ARIA] AI provider: groq (${model})`);
    yield* groqClient.sendMessage(messages, systemPrompt, config?.groqApiKey, model);
    return;
  }

  const model = client?.selectedModel || config?.preferredModel || "llama3";
  console.log(`[ARIA] AI provider: ollama (${model})`);
  yield* ollamaClient.sendMessage(messages, systemPrompt, model);
}

async function collectStream(stream) {
  let text = "";
  for await (const token of stream) {
    text += token;
  }
  return text;
}

export async function routeAIResponse({ settings, prompt, contextText }) {
  const config = {
    provider: settings?.primaryProvider || "auto",
    groqApiKey: settings?.groqApiKey,
    preferredModel:
      (settings?.primaryProvider || "auto") === "groq"
        ? settings?.groqModel
        : settings?.ollamaModel
  };
  const intent = "chat";
  const client = await getAIClient(config, intent);

  const messages = [
    {
      role: "user",
      content: `Context:\n${contextText}\n\nUser Request:\n${prompt}`
    }
  ];

  const text = await collectStream(
    streamResponse(client, messages, "You are ARIA, a practical desktop assistant.", config)
  );

  return {
    provider: client?.selectedProvider || config.provider || "ollama",
    text
  };
}

export { GROQ_MODELS };