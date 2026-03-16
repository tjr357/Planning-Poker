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
 *   /poker jira <ISSUE-123>         — Load story details from Jira
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

function parseIssueKey(input) {
  const match = String(input || "").toUpperCase().match(/([A-Z][A-Z0-9]+-\d+)/);
  return match ? match[1] : null;
}

function jiraConfig() {
  return {
    baseUrl: process.env.JIRA_BASE_URL,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
    bearerToken: process.env.JIRA_BEARER_TOKEN,
  };
}

function hasJiraConfig(cfg) {
  return Boolean(cfg.baseUrl && (cfg.bearerToken || (cfg.email && cfg.apiToken)));
}

function jiraAuthHeaders(cfg) {
  const headers = { Accept: "application/json" };
  if (cfg.bearerToken) {
    headers.Authorization = `Bearer ${cfg.bearerToken}`;
  } else {
    const basic = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }
  return headers;
}

function jiraRichTextToPlain(node) {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(jiraRichTextToPlain).join("");
  if (typeof node === "string") return node;

  if (node.type === "text") {
    return node.text || "";
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  const content = jiraRichTextToPlain(node.content || []);

  if (["paragraph", "heading", "blockquote"].includes(node.type)) {
    return content + "\n";
  }
  if (node.type === "listItem") {
    return `- ${content}`;
  }

  return content;
}

function jiraFieldValueToText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(jiraFieldValueToText).filter(Boolean).join("\n").trim();
  }
  if (typeof value === "object") {
    if (value.type || value.content) {
      return jiraRichTextToPlain(value).trim();
    }
    if (typeof value.value === "string") {
      return value.value.trim();
    }
    if (typeof value.name === "string") {
      return value.name.trim();
    }
    if (typeof value.key === "string") {
      return value.key.trim();
    }
    return Object.values(value).map(jiraFieldValueToText).filter(Boolean).join("\n").trim();
  }
  return "";
}

function extractAcceptanceCriteria(fields = {}, fieldNames = {}) {
  const directCandidates = [
    fields.acceptanceCriteria,
    fields.acceptance_criteria,
  ];
  for (const candidate of directCandidates) {
    const text = jiraFieldValueToText(candidate).trim();
    if (text) return text;
  }

  const byName = Object.entries(fields).find(([fieldKey]) => {
    const label = String(fieldNames[fieldKey] || fieldKey).toLowerCase();
    return label.includes("acceptance criteria") || label.includes("acceptance criterion");
  });
  if (byName) {
    return jiraFieldValueToText(byName[1]).trim();
  }

  const byKeyHint = Object.entries(fields).find(([fieldKey]) => /acceptance/i.test(fieldKey));
  if (byKeyHint) {
    return jiraFieldValueToText(byKeyHint[1]).trim();
  }

  return "";
}

function extractParentFeature(fields = {}, cleanBase) {
  const parent = fields.parent;
  if (parent?.key) {
    return {
      key: parent.key,
      summary: parent.fields?.summary || "",
      issueType: parent.fields?.issuetype?.name || "",
      url: `${cleanBase}/browse/${parent.key}`,
    };
  }
  return null;
}

function extractLinkedIssues(fields = {}, cleanBase) {
  const links = Array.isArray(fields.issuelinks) ? fields.issuelinks : [];
  return links
    .map((link) => {
      const related = link.outwardIssue || link.inwardIssue;
      if (!related?.key) return null;
      return {
        key: related.key,
        summary: related.fields?.summary || "",
        issueType: related.fields?.issuetype?.name || "",
        status: related.fields?.status?.name || "",
        relationship: link.outwardIssue
          ? (link.type?.outward || "relates to")
          : (link.type?.inward || "relates to"),
        url: `${cleanBase}/browse/${related.key}`,
      };
    })
    .filter(Boolean);
}

function normalizeJiraIssue(data, baseUrl) {
  const fields = data.fields || {};
  const fieldNames = data.names || {};
  const comments = fields.comment?.comments || [];
  const notes = comments.slice(0, 3).map((comment) => {
    const author = comment.author?.displayName || "Unknown";
    const text = jiraRichTextToPlain(comment.body).trim();
    return `${author}: ${text || "(empty)"}`;
  });

  const images = (fields.attachment || [])
    .filter((a) => String(a.mimeType || "").startsWith("image/"))
    .map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      content: a.content,
      thumbnail: a.thumbnail || a.content,
    }));

  const cleanBase = baseUrl.replace(/\/$/, "");
  const acceptanceCriteria = extractAcceptanceCriteria(fields, fieldNames);
  const linkedIssues = extractLinkedIssues(fields, cleanBase);
  const parentFeature = extractParentFeature(fields, cleanBase);

  return {
    key: data.key,
    summary: fields.summary || "(no summary)",
    issueType: fields.issuetype?.name || "Unknown",
    parentFeature,
    linkedIssues,
    acceptanceCriteria,
    description: jiraRichTextToPlain(fields.description).trim() || "(no description)",
    notes,
    images,
    status: fields.status?.name || "Unknown",
    assignee: fields.assignee?.displayName || "Unassigned",
    priority: fields.priority?.name || "Unknown",
    url: `${cleanBase}/browse/${data.key}`,
  };
}

async function fetchJiraIssue(issueKey) {
  const cfg = jiraConfig();
  if (!hasJiraConfig(cfg)) {
    return { ok: false, error: "Jira not configured." };
  }

  const cleanBase = cfg.baseUrl.replace(/\/$/, "");
  const url = `${cleanBase}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=*all&expand=names`;

  const headers = jiraAuthHeaders(cfg);

  try {
    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `Jira ${response.status}: ${body.slice(0, 180)}` };
    }
    const data = await response.json();
    return {
      ok: true,
      issue: normalizeJiraIssue(data, cleanBase),
    };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

async function fetchJiraFilterIssues(filterRef, maxResults = 100) {
  const cfg = jiraConfig();
  if (!hasJiraConfig(cfg)) {
    return { ok: false, error: "Jira not configured." };
  }

  const cleanBase = cfg.baseUrl.replace(/\/$/, "");
  const headers = jiraAuthHeaders(cfg);
  const normalizedMax = Number.isFinite(maxResults) ? Math.max(1, Math.min(200, Number(maxResults))) : 100;
  const ref = String(filterRef || "").trim();
  if (!ref) {
    return { ok: false, error: "Filter reference is required." };
  }

  const mapIssues = (issuesList) => {
    return (issuesList || []).map((issue) => {
      const fields = issue.fields || {};
      const parentKey = fields.parent?.key || "";
      const parentSummary = fields.parent?.fields?.summary || "";
      return {
        key: issue.key,
        summary: fields.summary || "(no summary)",
        issueType: fields.issuetype?.name || "Unknown",
        status: fields.status?.name || "Unknown",
        parentKey: parentKey || null,
        parentSummary: parentSummary || null,
        url: `${cleanBase}/browse/${issue.key}`,
      };
    });
  };

  const runJqlSearch = async (jql) => {
    const postUrl = `${cleanBase}/rest/api/3/search/jql`;
    const postResponse = await fetch(postUrl, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jql,
        maxResults: normalizedMax,
        fields: ["summary", "status", "issuetype", "parent"],
      }),
    });

    if (postResponse.ok) {
      return await postResponse.json();
    }

    // Fallback to the legacy endpoint when /search/jql is unavailable.
    const legacyUrl = `${cleanBase}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${normalizedMax}&fields=summary,status,issuetype,parent`;
    const legacyResponse = await fetch(legacyUrl, { method: "GET", headers });
    if (!legacyResponse.ok) {
      const body = await legacyResponse.text();
      throw new Error(`Jira ${legacyResponse.status}: ${body.slice(0, 180)}`);
    }
    return await legacyResponse.json();
  };

  const fetchFilterSearch = async (filterId) => {
    const encodedId = encodeURIComponent(filterId);

    // Preferred path when supported by the Jira deployment.
    const filterSearchUrl = `${cleanBase}/rest/api/3/filter/${encodedId}/search?maxResults=${normalizedMax}&fields=summary,status,issuetype,parent`;
    const filterSearchResponse = await fetch(filterSearchUrl, { method: "GET", headers });
    if (filterSearchResponse.ok) {
      const data = await filterSearchResponse.json();
      return {
        ok: true,
        filterId: data.filter?.id || String(filterId),
        filterName: data.filter?.name || null,
        issues: mapIssues(data.issues),
      };
    }

    // Fallback path for Jira environments where /filter/{id}/search is unavailable.
    const filterUrl = `${cleanBase}/rest/api/3/filter/${encodedId}`;
    const filterResponse = await fetch(filterUrl, { method: "GET", headers });
    if (!filterResponse.ok) {
      const body = await filterResponse.text();
      if (filterResponse.status === 404) {
        return {
          ok: false,
          error: `Jira could not find filter "${filterId}" or this account cannot access it.`,
        };
      }
      return { ok: false, error: `Jira ${filterResponse.status}: ${body.slice(0, 180)}` };
    }

    const filterData = await filterResponse.json();
    const jql = String(filterData.jql || "").trim();
    if (!jql) {
      return { ok: false, error: `Jira filter "${filterId}" has no JQL to run.` };
    }

    let searchData;
    try {
      searchData = await runJqlSearch(jql);
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }

    return {
      ok: true,
      filterId: filterData.id || String(filterId),
      filterName: filterData.name || null,
      issues: mapIssues(searchData.issues),
    };
  };

  try {
    if (/^\d+$/.test(ref)) {
      return await fetchFilterSearch(ref);
    }

    // Accept names that include a trailing numeric ID (e.g. "Board Filter 10098").
    const trailingIdMatch = ref.match(/(\d+)\s*$/);
    if (trailingIdMatch?.[1]) {
      const byTrailingId = await fetchFilterSearch(trailingIdMatch[1]);
      if (byTrailingId.ok) {
        return byTrailingId;
      }
    }

    // Try finding filter by name first.
    const filterSearchUrl = `${cleanBase}/rest/api/3/filter/search?filterName=${encodeURIComponent(ref)}&maxResults=50`;
    const filterSearchResponse = await fetch(filterSearchUrl, { method: "GET", headers });
    if (filterSearchResponse.ok) {
      const filterData = await filterSearchResponse.json();
      const values = filterData.values || [];
      const exact = values.find((f) => String(f.name || "").toLowerCase() === ref.toLowerCase());
      const selected = exact || values[0];
      if (selected?.id) {
        return await fetchFilterSearch(selected.id);
      }
    }

    return { ok: false, error: `No Jira filter found matching \"${ref}\".` };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
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
          "`/poker jira <key>`     — Pull issue details from Jira",
          "`/poker end`            — End session & show summary",
          "",
          "You can also use the **Tab** in this channel for a full visual interface.",
        ].join("\n")));

      // ── /poker start [story] ─────────────────────────────────────────────
      } else if (lower.startsWith("/poker start")) {
        const input = text.replace(/\/poker start\s*/i, "").trim();
        let story = input || `Round ${(session.history.length + 1)}`;

        const issueKey = parseIssueKey(input);
        if (issueKey) {
          const jira = await fetchJiraIssue(issueKey);
          if (jira.ok) {
            story = `${jira.issue.key}: ${jira.issue.summary}`;
          }
        }

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

      // ── /poker jira <ISSUE-123> ─────────────────────────────────────────
      } else if (lower.startsWith("/poker jira")) {
        const issueKey = parseIssueKey(text.replace(/\/poker jira\s*/i, "").trim());
        if (!issueKey) {
          await context.sendActivity("Usage: `/poker jira <ISSUE-123>` e.g. `/poker jira PROJ-42`");
        } else if (!hasJiraConfig(jiraConfig())) {
          await context.sendActivity([
            "Jira is not configured yet.",
            "Set environment variables:",
            "- `JIRA_BASE_URL` (e.g. `https://yourorg.atlassian.net`)",
            "- `JIRA_BEARER_TOKEN` OR (`JIRA_EMAIL` + `JIRA_API_TOKEN`)",
          ].join("\n"));
        } else {
          const jira = await fetchJiraIssue(issueKey);
          if (!jira.ok) {
            await context.sendActivity(`Couldn't load Jira issue ${issueKey}. ${jira.error}`);
          } else {
            const i = jira.issue;
            await context.sendActivity(MessageFactory.text([
              `**${i.key}: ${i.summary}**`,
              `Status: ${i.status}`,
              `Assignee: ${i.assignee}`,
              `Priority: ${i.priority}`,
              `Description: ${i.description.slice(0, 200)}${i.description.length > 200 ? "..." : ""}`,
              i.notes.length ? `Notes: ${i.notes[0]}` : "Notes: (none)",
            ].join("\n")));
          }
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

  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  const bot = new PlanningPokerBot();

  app.post("/api/messages", async (req, res) => {
    await adapter.process(req, res, context => bot.run(context));
  });

  app.get("/api/jira/:issueKey", async (req, res) => {
    const issueKey = parseIssueKey(req.params.issueKey);
    if (!issueKey) {
      return res.status(400).json({ ok: false, error: "Invalid issue key format." });
    }

    const jira = await fetchJiraIssue(issueKey);
    if (!jira.ok) {
      return res.status(502).json({ ok: false, error: jira.error });
    }

    return res.json({ ok: true, issue: jira.issue });
  });

  app.get("/api/jira/filter/:filterRef", async (req, res) => {
    const filterRef = String(req.params.filterRef || "").trim();
    if (!filterRef) {
      return res.status(400).json({ ok: false, error: "Filter reference is required." });
    }

    const maxResults = Number(req.query.maxResults || 100);
    const jira = await fetchJiraFilterIssues(filterRef, maxResults);
    if (!jira.ok) {
      return res.status(502).json({ ok: false, error: jira.error });
    }

    return res.json({
      ok: true,
      filterId: jira.filterId,
      filterName: jira.filterName,
      issues: jira.issues,
    });
  });

  app.get("/api/jira/:issueKey/attachment/:attachmentId", async (req, res) => {
    const issueKey = parseIssueKey(req.params.issueKey);
    const attachmentId = String(req.params.attachmentId || "").trim();
    if (!issueKey || !attachmentId) {
      return res.status(400).json({ ok: false, error: "Invalid attachment request." });
    }

    const cfg = jiraConfig();
    if (!hasJiraConfig(cfg)) {
      return res.status(500).json({ ok: false, error: "Jira not configured." });
    }

    const jira = await fetchJiraIssue(issueKey);
    if (!jira.ok) {
      return res.status(502).json({ ok: false, error: jira.error });
    }

    const image = (jira.issue.images || []).find((img) => String(img.id) === attachmentId);
    if (!image?.content) {
      return res.status(404).json({ ok: false, error: "Attachment not found." });
    }

    try {
      const imageResponse = await fetch(image.content, {
        method: "GET",
        headers: jiraAuthHeaders(cfg),
      });
      if (!imageResponse.ok) {
        const body = await imageResponse.text();
        return res.status(502).json({ ok: false, error: `Jira ${imageResponse.status}: ${body.slice(0, 180)}` });
      }

      res.setHeader("Content-Type", imageResponse.headers.get("content-type") || image.mimeType || "image/*");
      res.setHeader("Cache-Control", "private, max-age=120");
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      return res.send(buffer);
    } catch (error) {
      return res.status(502).json({ ok: false, error: error.message || String(error) });
    }
  });

  app.get("/health", (_, res) => res.json({ status: "ok" }));

  return app;
};

module.exports.PlanningPokerBot = PlanningPokerBot;
