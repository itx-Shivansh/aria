import React, { useEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js";
import { marked } from "marked";
import "./ChatWindow.css";

marked.setOptions({
  gfm: true,
  breaks: true,
  highlight(code, language) {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }

    return hljs.highlightAuto(code).value;
  }
});

const SUGGESTIONS = [
  "🐛 Debug my code",
  "📧 Draft an email",
  "📅 Schedule my day",
  "💡 Explain a concept"
];

const INTENT_LABELS = {
  code: "⚡ Code",
  email: "📧 Email",
  calendar: "📅 Calendar",
  file: "📁 Files",
  system: "🖥 System",
  messaging: "💬 Messaging",
  chat: "💬 Chat"
};

const LINE_HEIGHT = 22;

function inferIntent(text) {
  const lower = text.toLowerCase();
  if (/(email|inbox|reply|draft)/.test(lower)) {
    return "email";
  }
  if (/(calendar|meeting|schedule|reminder)/.test(lower)) {
    return "calendar";
  }
  if (/(file|folder|document|read|write)/.test(lower)) {
    return "file";
  }
  if (/(volume|brightness|create folder|delete folder|rename folder|run command|open website|search for|google|open app|launch app|start app|close app|quit app|open chrome|open vscode|close chrome|close vscode|copy file|copy folder|move file|move folder|list files|show files|read file|find files|search files|open folder|show folder|open file|show document|spotify|play song|listen to)/.test(lower)) {
    return "system";
  }
  if (/(whatsapp|message|msg|text|send to|wapp)/.test(lower)) {
    return "messaging";
  }
  if (/(code|bug|refactor|function|test)/.test(lower)) {
    return "code";
  }
  return "chat";
}

function loadConfig() {
  try {
    const raw = localStorage.getItem("aria_config");
    if (!raw) {
      return {
        provider: "auto",
        groqApiKey: "",
        ollamaModel: "llama3",
        groqModel: "llama3-8b-8192"
      };
    }

    const parsed = JSON.parse(raw);
    return {
      provider: parsed.provider || "auto",
      groqApiKey: parsed.groqApiKey || "",
      ollamaModel: parsed.ollamaModel || "llama3",
      groqModel: parsed.groqModel || "llama3-8b-8192",
      tone: parsed.tone || "concise",
      userName: parsed.userName || "User",
      language: parsed.language || "auto"
    };
  } catch {
    return {
      provider: "auto",
      groqApiKey: "",
      ollamaModel: "llama3",
      groqModel: "llama3-8b-8192"
    };
  }
}

function formatProvider(provider) {
  if (provider === "groq") {
    return "⚡ ARIA  •  Cloud";
  }
  if (provider === "ollama") {
    return "⚡ ARIA  •  Local";
  }
  return "⚡ ARIA";
}

function ChatWindow({ onOpenSettings }) {
  const ariaAPI = {
    onAgentToken: () => () => {},
    removeAgentTokenListener: () => {},
    send: () => {},
    getSettings: () => Promise.resolve({}),
    saveSettings: () => Promise.resolve(),
    onAgentComplete: () => () => {},
    onAgentError: () => () => {},
    startAgentStream: () => Promise.reject(new Error("ARIA API unavailable")),
    whatsappInit: () => Promise.resolve({ started: false }),
    whatsappSend: () => Promise.resolve({ success: false, error: "WhatsApp API unavailable" }),
    whatsappStatus: () => Promise.resolve({ isReady: false, isInitializing: false }),
    onWhatsappQR: () => () => {},
    onWhatsappReady: () => () => {},
    ...(window.aria || {})
  };
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentIntent, setCurrentIntent] = useState("chat");
  const [providerUsed, setProviderUsed] = useState("⚡ ARIA");
  const [offlineBanner, setOfflineBanner] = useState(false);
  const activeRunIdRef = useRef(null);
  const activeAssistantIdRef = useRef(null);
  const scrollerRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const stopToken = ariaAPI.onAgentToken(({ runId, token }) => {
      if (runId !== activeRunIdRef.current) {
        return;
      }

      const assistantId = activeAssistantIdRef.current;
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: `${item.content}${token}`
              }
            : item
        )
      );
    });

    const stopComplete = ariaAPI.onAgentComplete(({ runId, provider, model, intent }) => {
      if (runId !== activeRunIdRef.current) {
        return;
      }

      setIsStreaming(false);
      setCurrentIntent(intent || "chat");
      setProviderUsed(formatProvider(provider));

      const assistantId = activeAssistantIdRef.current;
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                provider: provider || item.provider,
                intent: intent || item.intent
              }
            : item
        )
      );

      activeRunIdRef.current = null;
      activeAssistantIdRef.current = null;
    });

    const stopError = ariaAPI.onAgentError(({ runId, message }) => {
      if (runId !== activeRunIdRef.current) {
        return;
      }

      setIsStreaming(false);
      const assistantId = activeAssistantIdRef.current;
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: item.content || `⚠️ ${message}`
              }
            : item
        )
      );

      activeRunIdRef.current = null;
      activeAssistantIdRef.current = null;
    });

    return () => {
      stopToken();
      stopComplete();
      stopError();
    };
  }, [ariaAPI]);

  useEffect(() => {
    if (!scrollerRef.current) {
      return;
    }

    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages, isStreaming]);

  function autoGrowTextarea() {
    const element = textareaRef.current;
    if (!element) {
      return;
    }

    element.style.height = "auto";
    const maxHeight = LINE_HEIGHT * 6 + 18;
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
  }

  useEffect(() => {
    autoGrowTextarea();
  }, [prompt]);

  const showCharCount = prompt.length > 500;
  const activeIntentLabel = INTENT_LABELS[currentIntent] || "💬 Chat";

  const renderedMessages = useMemo(() => {
    return messages.map((message) => {
      if (message.role === "user") {
        return {
          ...message,
          html: null
        };
      }

      return {
        ...message,
        html: marked.parse(message.content || "")
      };
    });
  }, [messages]);

  async function handleSend() {
    const input = prompt.trim();
    if (!input || isStreaming) {
      return;
    }

    const config = loadConfig();
    const noProviderConfigured = config.provider === "groq" && !config.groqApiKey;
    setOfflineBanner(noProviderConfigured);

    const userMessage = {
      id: `msg-user-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: new Date().toLocaleTimeString(),
      provider: "",
      intent: inferIntent(input)
    };
    const assistantMessage = {
      id: `msg-aria-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: "assistant",
      content: "",
      timestamp: new Date().toLocaleTimeString(),
      provider: "",
      intent: inferIntent(input)
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setPrompt("");
    setIsStreaming(true);
    setCurrentIntent(assistantMessage.intent);
    activeAssistantIdRef.current = assistantMessage.id;

    try {
      const memory = {
        recentMessages: messages.slice(-12).map((item) => ({
          role: item.role,
          content: item.content
        }))
      };

      const result = await ariaAPI.startAgentStream({
        input,
        config: {
          provider: config.provider,
          groqApiKey: config.groqApiKey,
          preferredModel: config.provider === "groq" ? config.groqModel : config.ollamaModel,
          tone: config.tone,
          userName: config.userName,
          language: config.language
        },
        memory
      });

      activeRunIdRef.current = result.runId;
      setCurrentIntent(result.intent || assistantMessage.intent);
      setProviderUsed(formatProvider(result.provider));
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessage.id
            ? {
                ...item,
                provider: result.provider,
                intent: result.intent || item.intent
              }
            : item
        )
      );
    } catch (error) {
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessage.id
            ? {
                ...item,
                content: `⚠️ ${String(error?.message || "Unable to start stream")}`
              }
            : item
        )
      );
    }
  }

  function onKeyDown(event) {
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      handleSend();
    }
  }

  async function copyMessage(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
  }

  return (
    <section className="chat-window">
      <header className="chat-topbar">
        <div className="logo-area">ARIA</div>
        <div className="intent-badge">{activeIntentLabel}</div>
        <div className="topbar-right">
          <span className="provider-badge">{providerUsed}</span>
          <button type="button" className="settings-btn" onClick={onOpenSettings}>
            ⚙
          </button>
        </div>
      </header>

      {offlineBanner && (
        <div className="offline-banner">
          ⚙️ ARIA needs setup. Open Settings to continue -&gt;
        </div>
      )}

      <div className="chat-history" ref={scrollerRef}>
        {renderedMessages.length === 0 && (
          <div className="welcome-screen">
            <h2>Welcome to ARIA</h2>
            <p>Choose a quick start or type your own request.</p>
            <div className="suggestion-row">
              {SUGGESTIONS.map((item) => (
                <button key={item} type="button" className="suggest-chip" onClick={() => setPrompt(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}

        {renderedMessages.map((message) => (
          <article key={message.id} className={`bubble bubble-${message.role}`}>
            <div className="bubble-head">
              <span>{message.role === "user" ? "You" : "ARIA"}</span>
              {message.role === "assistant" && (
                <div className="assistant-tools">
                  <span className="mini-badge">⚡ ARIA</span>
                  <span className="mini-badge">{INTENT_LABELS[message.intent] || "💬 Chat"}</span>
                  <button type="button" onClick={() => copyMessage(message.content)}>
                    Copy
                  </button>
                </div>
              )}
            </div>

            {message.role === "assistant" ? (
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{
                  __html:
                    isStreaming && message.id === activeAssistantIdRef.current
                      ? `${message.html}<span class=\"cursor\">▋</span>`
                      : message.html
                }}
              />
            ) : (
              <p>{message.content}</p>
            )}

            <span className="timestamp">{message.timestamp}</span>
          </article>
        ))}
      </div>

      <div className="chat-input">
        <button type="button" className="attach-btn" title="Attachment support coming soon">
          +
        </button>
        <textarea
          ref={textareaRef}
          value={prompt}
          placeholder="Ask ARIA anything..."
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
        />
        <button type="button" onClick={handleSend} disabled={isStreaming}>
          {isStreaming ? "Streaming..." : "Send"}
        </button>
      </div>

      {showCharCount && <div className="char-count">{prompt.length} characters</div>}
    </section>
  );
}

export default ChatWindow;