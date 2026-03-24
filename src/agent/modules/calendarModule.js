export async function runCalendarModule(prompt) {
  const output = [
    "Calendar assistant plan:",
    `- Request: ${prompt}`,
    "- Proposed steps: identify participants, choose two time slots, then send invites."
  ].join("\n");

  return {
    module: "calendar",
    output
  };
}