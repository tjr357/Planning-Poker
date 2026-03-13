/**
 * Planning Poker Teams Bot
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles slash commands in Teams chat:
 *
 *   /poker start [story title]      — Start a new round
 *   /poker vote <value>             — Cast a vote (DM to bot, private)
 *   /poker reveal                   — Reveal all votes
 *   /poker next [story title]       — Move to next story
 *   /poker load                     — Attach a CSV (bot prompts for upload)
 *   /poker status                   — Show current vote count
 *   /poker deck                     — Show current deck
 *   /poker add <value>              — Add a card to the deck
 *   /poker end                      — End session and post summary
 *   /poker help                     — Show command list
 *
 * Dependencies:
 *   npm install botbuilder express body-parser
 */

const { ActivityHandler, MessageFactory, CardFactory, TurnContext } = require("botbuilder");
const express = require("express");
const bodyParser = require("body-parser");

// ─── Session Store (in-memory; swap for Redis/CosmosDB in production) ─────────
const sessions = new Map(); // conversationId → SessionState

function getSession(conversationId) {
  if (!sessions.has(conversationId)) {
    sessions.set(conversationId, {
      active: false,
      deck: ["1", "2", "3", "5", "8", "13", "21", "34", "?", "☕"],
      stories: [],
      storyIndex: 0,
      currentStory: null,
      votes: {},         // userId → value (hidden until revealed)
      userNames: {},     // userId → displayName
      revealed: false,
      history: [],       // [{ story, votes, consensus }]
    });
  }
  return sessions.get(conversationId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function consensus(votes, deck) {
  const nums = Object.values(votes).map(parseFloat).filter(n => !isNaN(n));
  if (!nums.length) return "?";
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const deckNums = deck.map(parseFloat).filter(n => !isNaN(n));
  if (!deckNums.length) return "?";
  return String(deckNums.reduce((a, b) =>
    Math.abs(b - mean) < Math.abs(a - mean) ? b : a, deckNums[0]));
}

function avg(votes) {
  const nums = Object.values(votes).map(parseFloat).filter(n => !isNaN(n));
  return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : "n/a";
}

function voteStatusLine(session) {
  const total = Object.keys(session.userNames).length;
  const voted = Object.keys(session.votes).length;
  return `🗳️ **${voted}/${total}** voted`;
}

function deckDisplay(deck) {
  return deck.map(c => `\`${c}\``).join("  ");
}

// ─── Adaptive Card builders ───────────────────────────────────────────────────
function buildVotingCard(session) {
  const rows = session.deck.map(value => ({
    type: "Action.Submit",
    title: value,
    data: { action: "vote", value },
  }));

  // Split deck into rows of 5
  const chunks = [];
  for (let i = 0; i < rows.length; i += 5) chunks.push(rows.slice(i, i + 5));

  return CardFactory.adaptiveCard({
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `♠ Planning Poker`,
        weight: "Bolder",
        size: "Medium",
        color: "Accent",
      },
      {
        type: "TextBlock",
        text: `**Estimating:** ${session.currentStory}`,
        wrap: true,
        spacing: "Small",
      },
      {
        type: "TextBlock",
        text: voteStatusLine(session),
        spacing: "Small",
        isSubtle: true,
      },
      {
        type: "TextBlock",
        text: "Pick your estimate — your vote is private until revealed:",
        wrap: true,
        spacing: "Medium",
        isSubtle: true,
      },
    ],
    actions: [
      ...rows,
      { type: "Action.Submit", title: "🔍 Reveal", data: { action: "reveal" }, style: "positive" },
    ],
  });
}

function buildRevealCard(session) {
  const voteLines = Object.entries(session.votes).map(([uid, val]) => ({
    type: "ColumnSet",
    columns: [
      { type: "Column", width: "stretch", items: [{ type: "TextBlock", text: session.userNames[uid] ?? uid }] },
      { type: "Column", width: "auto", items: [{ type: "TextBlock", text: `**${val}**`, color: "Good", weight: "Bolder" }] },
    ],
  }));

  return CardFactory.adaptiveCard({
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      { type: "TextBlock", text: "🃏 Votes Revealed!", weight: "Bolder", size: "Large", color: "Accent" },
      { type: "TextBlock", text: `**Story:** ${session.currentStory}`, wrap: true, spacing: "Small" },
      { type: "TextBlock", text: "─────────────────", isSubtle: true, spacing: "Small" },
      ...voteLines,
      { type: "TextBlock", text: "─────────────────", isSubtle: true },
      {
        type: "FactSet",
        facts: [
          { title: "Consensus", value: `**${consensus(session.votes, session.deck)}**` },
          { title: "Average", value: avg(session.votes) },
        ],
      },
    ],
    actions: [
      { type: "Action.Submit", title: "→ Next Story", data: { action: "next" }, style: "positive" },
      { type: "Action.Submit", title: "🏁 End Session", data: { action: "end" } },
    ],
  });
}

function buildSummaryCard(history) {
  const rows = history.map(h => ({
    type: "ColumnSet",
    columns: [
      { type: "Column", width: "stretch", items: [{ type: "TextBlock", text: h.story, wrap: true }] },
      { type: "Column", width: "auto", items: [{ type: "TextBlock", text: `**${h.consensus}**`, color: "Good", weight: "Bolder" }] },
    ],
  }));

  return CardFactory.adaptiveCard({
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      { type: "TextBlock", text: "🏁 Session Complete", weight: "Bolder", size: "Large", color: "Accent" },
      { type: "TextBlock", text: `${history.length} stories estimated`, isSubtle: true, spacing: "Small" },
      { type: "TextBlock", text: "─────────────────", isSubtle: true },
      ...rows,
    ],
  });
}

// ─── Bot Handler ──────────────────────────────────────────────────────────────
class PlanningPokerBot extends ActivityHandler {
  constructor() {
    super();

    // ── Text messages / slash commands ──────────────────────────────────────
    this.onMessage(async (context, next) => {
      const convId = context.activity.conversation.id;
      const session = getSession(convId);
      const userId = context.activity.from.id;
      const userName = context.activity.from.name;

      // Track participants
      session.userNames[userId] = userName;

      const text = (context.activity.text ?? "").trim();
      const lower = text.toLowerCase();

      // ── /poker help ──────────────────────────────────────────────────────
      if (lower === "/poker help" || lower === "!poker help") {
        await context.sendActivity(MessageFactory.text([
          "**♠ Planning Poker Commands**",
          "",
          "`/poker start [story]`  — Start a new round",
          "`/poker vote <value>`   — Vote privately (or click card button)",
          "`/poker reveal`         — Reveal all votes",
          "`/poker next [story]`   — Next story after reveal",
          "`/poker status`         — Show vote progress",
          "`/poker deck`           — Show current deck",
          "`/poker add <value>`    — Add a card to the deck",
          "`/poker end`            — End session & show summary",
          "",
          "You can also use the **Tab** in this channel for a full visual interface.",
        ].join("\n")));

      // ── /poker start [story] ─────────────────────────────────────────────
      } else if (lower.startsWith("/poker start")) {
        const story = text.replace(/\/poker start\s*/i, "").trim() || `Round ${(session.history.length + 1)}`;
        session.active = true;
        session.currentStory = story;
        session.votes = {};
        session.revealed = false;

        const card = buildVotingCard(session);
        await context.sendActivity(MessageFactory.attachment(card));

      // ── /poker vote <value> ──────────────────────────────────────────────
      } else if (lower.startsWith("/poker vote")) {
        const value = text.replace(/\/poker vote\s*/i, "").trim();
        if (!session.active) {
          await context.sendActivity("No active session. Use `/poker start` first.");
        } else if (!session.deck.includes(value)) {
          await context.sendActivity(`\`${value}\` isn't in the deck. Valid values: ${deckDisplay(session.deck)}`);
        } else {
          session.votes[userId] = value;
          // Confirm privately (ephemeral would be ideal; this DMs back as fallback)
          await context.sendActivity(MessageFactory.text(`✅ Vote recorded: **${value}** (hidden until reveal)`));
          // Broadcast updated status to channel
          const total = Object.keys(session.userNames).length;
          const voted = Object.keys(session.votes).length;
          await context.sendActivity(MessageFactory.text(`${voted}/${total} people have voted.`));
        }

      // ── /poker reveal ────────────────────────────────────────────────────
      } else if (lower === "/poker reveal") {
        if (!session.active) {
          await context.sendActivity("No active session.");
        } else if (Object.keys(session.votes).length === 0) {
          await context.sendActivity("No votes to reveal yet!");
        } else {
          session.revealed = true;
          const card = buildRevealCard(session);
          await context.sendActivity(MessageFactory.attachment(card));
        }

      // ── /poker next [story] ──────────────────────────────────────────────
      } else if (lower.startsWith("/poker next")) {
        if (session.revealed) {
          session.history.push({
            story: session.currentStory,
            votes: { ...session.votes },
            consensus: consensus(session.votes, session.deck),
          });
        }
        const story = text.replace(/\/poker next\s*/i, "").trim()
          || session.stories[session.storyIndex + 1]
          || `Round ${session.history.length + 1}`;
        session.storyIndex++;
        session.currentStory = story;
        session.votes = {};
        session.revealed = false;

        const card = buildVotingCard(session);
        await context.sendActivity(MessageFactory.attachment(card));

      // ── /poker status ────────────────────────────────────────────────────
      } else if (lower === "/poker status") {
        if (!session.active) {
          await context.sendActivity("No active session. Use `/poker start [story]` to begin.");
        } else {
          const voted = Object.keys(session.votes).length;
          const total = Object.keys(session.userNames).length;
          const waiting = Object.keys(session.userNames)
            .filter(id => !session.votes[id])
            .map(id => session.userNames[id]);
          await context.sendActivity(MessageFactory.text([
            `**Story:** ${session.currentStory}`,
            `**Votes:** ${voted}/${total}`,
            waiting.length ? `**Waiting on:** ${waiting.join(", ")}` : "✅ Everyone has voted!",
          ].join("\n")));
        }

      // ── /poker deck ──────────────────────────────────────────────────────
      } else if (lower === "/poker deck") {
        await context.sendActivity(MessageFactory.text(`**Current deck:** ${deckDisplay(session.deck)}`));

      // ── /poker add <value> ───────────────────────────────────────────────
      } else if (lower.startsWith("/poker add")) {
        const value = text.replace(/\/poker add\s*/i, "").trim();
        if (!value) {
          await context.sendActivity("Usage: `/poker add <value>` e.g. `/poker add 40`");
        } else if (session.deck.includes(value)) {
          await context.sendActivity(`\`${value}\` is already in the deck.`);
        } else {
          // Insert before ? and ☕
          const insertAt = session.deck.findIndex(c => c === "?");
          if (insertAt > -1) {
            session.deck.splice(insertAt, 0, value);
          } else {
            session.deck.push(value);
          }
          await context.sendActivity(MessageFactory.text(`Added \`${value}\` to the deck. New deck: ${deckDisplay(session.deck)}`));
        }

      // ── /poker end ───────────────────────────────────────────────────────
      } else if (lower === "/poker end") {
        if (session.revealed && session.currentStory) {
          session.history.push({
            story: session.currentStory,
            votes: { ...session.votes },
            consensus: consensus(session.votes, session.deck),
          });
        }
        const card = buildSummaryCard(session.history);
        await context.sendActivity(MessageFactory.attachment(card));
        sessions.delete(convId); // reset

      } else {
        // Not a poker command — ignore or fall through
      }

      await next();
    });

    // ── Adaptive Card Action submissions ────────────────────────────────────
    this.onEvent(async (context, next) => {
      if (context.activity.name === "adaptiveCard/action") {
        const { action, value } = context.activity.value ?? {};
        const convId = context.activity.conversation.id;
        const session = getSession(convId);
        const userId = context.activity.from.id;

        if (action === "vote" && value) {
          session.votes[userId] = value;
          const voted = Object.keys(session.votes).length;
          const total = Object.keys(session.userNames).length;
          await context.sendActivity(MessageFactory.text(`✅ **${session.userNames[userId]}** voted. (${voted}/${total} so far)`));

        } else if (action === "reveal") {
          session.revealed = true;
          await context.sendActivity(MessageFactory.attachment(buildRevealCard(session)));

        } else if (action === "next") {
          session.history.push({
            story: session.currentStory,
            votes: { ...session.votes },
            consensus: consensus(session.votes, session.deck),
          });
          const next = session.stories[session.storyIndex + 1] ?? `Round ${session.history.length + 1}`;
          session.storyIndex++;
          session.currentStory = next;
          session.votes = {};
          session.revealed = false;
          await context.sendActivity(MessageFactory.attachment(buildVotingCard(session)));

        } else if (action === "end") {
          await context.sendActivity(MessageFactory.attachment(buildSummaryCard(session.history)));
          sessions.delete(convId);
        }
      }
      await next();
    });
  }
}

// ─── Express Server ───────────────────────────────────────────────────────────
module.exports = function createServer(adapter) {
  const app = express();
  app.use(bodyParser.json());

  const bot = new PlanningPokerBot();

  app.post("/api/messages", async (req, res) => {
    await adapter.process(req, res, context => bot.run(context));
  });

  app.get("/health", (_, res) => res.json({ status: "ok" }));

  return app;
};

module.exports.PlanningPokerBot = PlanningPokerBot;
