/**
 * Planning Poker Bot - Entry Point
 * Run:  node index.js
 * Env:  MicrosoftAppId, MicrosoftAppPassword (from Azure Bot registration)
 */

// Prefer values from .env over previously exported shell vars for local dev consistency.
require("dotenv").config({ override: true });

const { BotFrameworkAdapter } = require("botbuilder");
const createServer = require("./bot");

const adapter = new BotFrameworkAdapter({
  appId: process.env.MicrosoftAppId,
  appPassword: process.env.MicrosoftAppPassword,
});

adapter.onTurnError = async (context, error) => {
  console.error("[BotError]", error);
  await context.sendActivity("⚠️ An error occurred. Please try again.");
};

const app = createServer(adapter);
const port = process.env.PORT || 3978;

app.listen(port, () => {
  console.log(`\n♠ Planning Poker Bot listening on port ${port}`);
  console.log(`   POST /api/messages  ← Teams webhook`);
  console.log(`   GET  /health        ← health check\n`);
});
