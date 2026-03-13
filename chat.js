/**
 * chat.js — Interactive terminal REPL for Planning Poker Bot
 *
 * Uses BotBuilder TestAdapter so no HTTP server or Azure credentials needed.
 * Session state persists for the lifetime of this process (same as a real chat).
 *
 * Usage:
 *   node chat.js
 *   node chat.js --user "Alice"   (set your display name)
 */

const { TestAdapter } = require("botbuilder");
const { PlanningPokerBot } = require("./bot");
const readline = require("readline");

// ── Parse optional --user flag ────────────────────────────────────────────────
const userArgIdx = process.argv.indexOf("--user");
const userName = userArgIdx !== -1 ? process.argv[userArgIdx + 1] : "You";
const userId = "user1";

// ── Single bot + adapter instance so session state spans all turns ────────────
const bot = new PlanningPokerBot();
const adapter = new TestAdapter(async (context) => bot.run(context));

adapter.onTurnError = async (_context, error) => {
  console.error("\n  ⚠  Bot error:", error.message);
};

// ── Adaptive Card renderer ────────────────────────────────────────────────────
function stripMd(text) {
  return String(text).replace(/\*\*/g, "").trim();
}

function renderCard(card) {
  const lines = [];

  function walkItems(items) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      switch (item.type) {
        case "TextBlock":
          if (item.text) lines.push("  " + stripMd(item.text));
          break;
        case "FactSet":
          if (Array.isArray(item.facts)) {
            for (const f of item.facts) {
              lines.push(`  ${f.title}: ${stripMd(f.value)}`);
            }
          }
          break;
        case "ColumnSet":
          if (Array.isArray(item.columns)) {
            const parts = item.columns.map((col) =>
              (col.items || [])
                .filter((i) => i.type === "TextBlock" && i.text)
                .map((i) => stripMd(i.text))
                .join(" ")
            );
            lines.push("  " + parts.filter(Boolean).join("  │  "));
          }
          break;
        case "Container":
          walkItems(item.items);
          break;
      }
    }
  }

  walkItems(card.body);

  if (Array.isArray(card.actions) && card.actions.length > 0) {
    const btns = card.actions.map((a) => `[${a.title}]`).join("  ");
    lines.push("");
    lines.push("  " + btns);
  }

  return lines.join("\n");
}

// ── Print a single bot reply activity ────────────────────────────────────────
function printReply(activity) {
  if (activity.text) {
    console.log("\nBot: " + activity.text);
  }
  if (Array.isArray(activity.attachments) && activity.attachments.length > 0) {
    for (const att of activity.attachments) {
      if (att.contentType === "application/vnd.microsoft.card.adaptive") {
        console.log("\nBot: ┌────────────────────────────────────────");
        console.log(renderCard(att.content));
        console.log("     └────────────────────────────────────────");
      }
    }
  }
}

// ── Send one message and print all replies ────────────────────────────────────
async function send(text) {
  // Override the default TestAdapter user so the bot records your name
  adapter.template = {
    ...adapter.template,
    from: { id: userId, name: userName },
  };

  // Track offset so we only print replies from *this* turn
  const before = adapter.activityBuffer.length;
  await adapter.send(text).startTest();
  const newReplies = adapter.activityBuffer.slice(before);

  if (newReplies.length === 0) {
    console.log("\nBot: [no reply]");
  } else {
    newReplies.forEach(printReply);
  }
}

// ── readline REPL ─────────────────────────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

function ask() {
  rl.question(`\n${userName}: `, async (input) => {
    input = input.trim();
    if (!input) return ask();

    if (input === "exit" || input === "quit") {
      console.log("\nGoodbye!\n");
      rl.close();
      process.exit(0);
    }

    try {
      await send(input);
    } catch (err) {
      console.error("\n  Error:", err.message);
    }

    ask();
  });
}

// ── Startup banner ────────────────────────────────────────────────────────────
console.log("\n╔══════════════════════════════════════════╗");
console.log("║   Planning Poker Bot  —  Terminal Chat   ║");
console.log("╚══════════════════════════════════════════╝");
console.log(`\nChatting as: ${userName}  (change with --user "Name")`);
console.log("\nCommands:");
console.log("  /poker help");
console.log("  /poker start [story title]");
console.log("  /poker vote <value>            e.g. /poker vote 5");
console.log("  /poker reveal");
console.log("  /poker next [story title]");
console.log("  /poker status");
console.log("  /poker deck");
console.log("  /poker add <value>");
console.log("  /poker end");
console.log('\n  Type "exit" to quit.');
console.log("─────────────────────────────────────────────\n");

ask();
