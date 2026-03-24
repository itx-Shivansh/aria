const rules = [
  {
    intent: "messaging",
    pattern:
      /whatsapp|message|send to|text|msg|wapp|slack|dm|chat|telegram|ping/
  },
  {
    intent: "email",
    pattern:
      /email|reply|inbox|draft|mail|forward|cc|bcc|compose|unsubscribe/
  },
  {
    intent: "code",
    pattern:
      /code|function|bug|refactor|debug|implement|script|program|error|fix|class|component|api|build|deploy|file|import|install|npm|git/
  },
  {
    intent: "calendar",
    pattern:
      /schedule|meeting|calendar|remind|appointment|block time|free slot|reschedule|availability|event/
  },
  {
    intent: "file",
    pattern:
      /open|move|delete|organize|folder|rename|find file|copy|zip|extract|download|upload/
  },
  {
    intent: "system",
    pattern:
      /volume|brightness|create folder|delete folder|rename folder|run command|execute command|open website|open site|search for|google|power settings|system command|open app|launch app|start app|close app|quit app|open chrome|open vscode|close chrome|close vscode|copy file|copy folder|move file|move folder|list files|show files|read file|find files|search files|open folder|show folder|open file|show document|spotify|play song|listen to/
  },
  {
    intent: "memory",
    pattern:
      /remember|forget|note|save this|my preference|store|keep in mind|don't forget/
  }
];

const modulePrompts = {
  email:
    "You are in EMAIL mode. Draft clear, appropriately toned emails. Always show the draft before sending. Ask for recipient if missing. Suggest subject lines. Never send without user confirmation.",
  code:
    "You are in CODE AGENT mode. Write complete, working code only. No placeholders or TODO comments unless flagged. Show a brief plan for multi-file tasks before writing. Explain non-obvious decisions in one line comments. Suggest tests for critical logic.",
  calendar:
    "You are in CALENDAR mode. Parse natural language time expressions. Convert to specific dates/times. Confirm before creating events. Suggest optimal time slots based on context provided.",
  file:
    "You are in FILE mode. Be precise with file paths. Always confirm before delete or move operations. Suggest safe alternatives to destructive actions. Show what will change before executing.",
  system:
    "You are in SYSTEM CONTROL mode. Execute local OS actions only when explicitly requested. Confirm destructive actions first. Return concise completion status and any errors with exact path or command details.",
  messaging:
    "You are in MESSAGING mode. Match the user's tone and style. Keep messages appropriately brief for the platform. Always stage the message for review before sending.",
  memory:
    "You are in MEMORY mode. Extract and structure the information the user wants remembered. Confirm what was stored. Suggest related things to remember if relevant.",
  chat:
    "You are in CHAT mode. Be concise and direct. Lead with the answer. Use examples when helpful. Skip unnecessary preamble."
};

export function parseIntent(userInput) {
  const normalized = String(userInput || "").toLowerCase().trim();

  for (const rule of rules) {
    if (rule.pattern.test(normalized)) {
      return rule.intent;
    }
  }

  return "chat";
}

export function getModuleSystemPrompt(intent) {
  return modulePrompts[intent] || modulePrompts.chat;
}

export function detectProject(userInput, projects) {
  const normalizedInput = String(userInput || "").toLowerCase();
  const list = Array.isArray(projects) ? projects : [];

  for (const name of list) {
    if (typeof name !== "string") {
      continue;
    }

    if (normalizedInput.includes(name.toLowerCase())) {
      return name;
    }
  }

  return null;
}