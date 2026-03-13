const { TestAdapter } = require("botbuilder");
const { PlanningPokerBot } = require("./bot");

function assertTextIncludes(fragment) {
  return (activity) => {
    if (!activity || typeof activity.text !== "string" || !activity.text.includes(fragment)) {
      throw new Error(`Expected reply text to include: ${fragment}`);
    }
  };
}

function assertHasAttachment() {
  return (activity) => {
    if (!activity || !Array.isArray(activity.attachments) || activity.attachments.length === 0) {
      throw new Error("Expected a reply with an attachment.");
    }
  };
}

async function run() {
  const bot = new PlanningPokerBot();
  const adapter = new TestAdapter(async (context) => bot.run(context));

  await adapter
    .send("/poker help")
    .assertReply(assertTextIncludes("Planning Poker Commands"))
    .startTest();

  await adapter
    .send("/poker start Story A")
    .assertReply(assertHasAttachment())
    .startTest();

  await adapter
    .send("/poker vote 5")
    .assertReply(assertTextIncludes("Vote recorded"))
    .assertReply(assertTextIncludes("people have voted"))
    .startTest();

  await adapter
    .send("/poker reveal")
    .assertReply(assertHasAttachment())
    .startTest();

  await adapter
    .send("/poker end")
    .assertReply(assertHasAttachment())
    .startTest();

  console.log("PASS: smoke test completed.");
}

run().catch((error) => {
  console.error("FAIL:", error.message || error);
  process.exitCode = 1;
});
