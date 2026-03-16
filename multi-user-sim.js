/**
 * multi-user-sim.js — Local multi-user simulation for Planning Poker Bot
 *
 * Uses BotBuilder TestAdapter to simulate multiple participants in one room.
 * No Teams publishing, bot connector, or HTTP activity plumbing required.
 *
 * Usage examples:
 *   node multi-user-sim.js
 *   node multi-user-sim.js --story "GCP-16728" --users 6
 *   node multi-user-sim.js --story "GCP-16728" --users 8 --reveal
 */

const { TestAdapter } = require("botbuilder");
const { PlanningPokerBot } = require("./bot");

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

const story = argValue("--story", "Round 1");
const userCount = Math.max(2, Number(argValue("--users", "5")) || 5);
const autoReveal = hasFlag("--reveal");

const deck = ["1", "2", "3", "5", "8", "13"];
const users = Array.from({ length: userCount }, (_, i) => ({
  id: `u${i + 1}`,
  name: `User ${i + 1}`,
}));

const bot = new PlanningPokerBot();
const adapter = new TestAdapter(async (context) => bot.run(context));

adapter.onTurnError = async (_context, error) => {
  console.error("Bot error:", error.message);
};

function pickVote(index) {
  // Deterministic vote spread so runs are repeatable.
  return deck[index % deck.length];
}

async function sendAs(user, text) {
  adapter.template = {
    ...adapter.template,
    from: { id: user.id, name: user.name },
    conversation: { id: "sim-room-1" },
    channelId: "test",
    serviceUrl: "https://test.local",
    recipient: { id: "planning-poker-bot", name: "Planning Poker Bot" },
  };

  const before = adapter.activityBuffer.length;
  await adapter.send(text).startTest();
  const replies = adapter.activityBuffer.slice(before);
  const textReplies = replies.map((r) => r.text).filter(Boolean);
  return textReplies;
}

async function run() {
  const facilitator = users[0];

  console.log("=== Planning Poker Multi-User Simulation ===");
  console.log(`Story: ${story}`);
  console.log(`Users: ${users.map((u) => u.name).join(", ")}`);

  await sendAs(facilitator, `/poker start ${story}`);

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const vote = pickVote(i);
    const replies = await sendAs(u, `/poker vote ${vote}`);
    const latest = replies.length ? replies[replies.length - 1] : "[no text reply]";
    console.log(`${u.name} voted ${vote} -> ${latest}`);
  }

  const statusReplies = await sendAs(facilitator, "/poker status");
  if (statusReplies.length) {
    console.log("\nStatus reply:");
    console.log(statusReplies[statusReplies.length - 1]);
  }

  if (autoReveal) {
    const revealReplies = await sendAs(facilitator, "/poker reveal");
    if (revealReplies.length) {
      console.log("\nReveal reply:");
      console.log(revealReplies[revealReplies.length - 1]);
    } else {
      console.log("\nReveal sent (Adaptive Card response, no plain text).");
    }
  }

  console.log("\nSimulation complete.");
}

run().catch((err) => {
  console.error("Simulation failed:", err.message);
  process.exitCode = 1;
});
