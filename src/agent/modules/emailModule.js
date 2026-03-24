export async function runEmailModule(prompt) {
  const suggestion = [
    "Subject: Quick update",
    "",
    "Hi team,",
    "",
    "Here is a concise status update based on your request:",
    `- ${prompt}`,
    "",
    "Best regards,",
    "ARIA"
  ].join("\n");

  return {
    module: "email",
    output: suggestion
  };
}