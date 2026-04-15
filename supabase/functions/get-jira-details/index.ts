declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

function parseIssueKey(input: string): string | null {
  const match = String(input || "").toUpperCase().match(/([A-Z][A-Z0-9]+-\d+)/);
  return match ? match[1] : null;
}

function jiraConfig() {
  return {
    baseUrl: Deno.env.get("JIRA_BASE_URL") || "",
    email: Deno.env.get("JIRA_EMAIL") || "",
    apiToken: Deno.env.get("JIRA_API_TOKEN") || "",
    bearerToken: Deno.env.get("JIRA_BEARER_TOKEN") || "",
    acceptanceCriteriaField: Deno.env.get("JIRA_ACCEPTANCE_CRITERIA_FIELD") || "",
  };
}

function figmaConfig() {
  return {
    clientId: Deno.env.get("FIGMA_CLIENT_ID") || "",
    clientSecret: Deno.env.get("FIGMA_CLIENT_SECRET") || "",
    redirectUri: Deno.env.get("FIGMA_REDIRECT_URI") || "",
    scope: Deno.env.get("FIGMA_SCOPE") || "file_content:read",
    signingKey: Deno.env.get("FIGMA_TOKEN_ENCRYPTION_KEY") || "",
  };
}

function hasFigmaConfig(cfg: ReturnType<typeof figmaConfig>): boolean {
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.redirectUri && cfg.signingKey);
}

function hasJiraConfig(cfg: ReturnType<typeof jiraConfig>): boolean {
  return Boolean(cfg.baseUrl && (cfg.bearerToken || (cfg.email && cfg.apiToken)));
}

function jiraAuthHeaders(cfg: ReturnType<typeof jiraConfig>): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.bearerToken) {
    headers.Authorization = `Bearer ${cfg.bearerToken}`;
  } else {
    headers.Authorization = `Basic ${btoa(`${cfg.email}:${cfg.apiToken}`)}`;
  }
  return headers;
}

function formatFetchError(error: unknown): string {
  if (!error) return "Unknown error";
  if (error instanceof Error) return error.message || String(error);
  return String(error);
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToHtml(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "";
  return escapeHtml(text).replace(/\n/g, "<br/>");
}

function applyJiraTextMarks(text: string, marks: Array<{ type?: string; attrs?: Record<string, unknown> }> = []): string {
  return marks.reduce((output, mark) => {
    switch (mark?.type) {
      case "strong":
        return `<strong>${output}</strong>`;
      case "em":
        return `<em>${output}</em>`;
      case "underline":
        return `<u>${output}</u>`;
      case "strike":
        return `<s>${output}</s>`;
      case "code":
        return `<code>${output}</code>`;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
        if (!href) return output;
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${output}</a>`;
      }
      default:
        return output;
    }
  }, text);
}

function jiraRichTextToHtml(node: unknown): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(jiraRichTextToHtml).join("");
  if (typeof node === "string") return escapeHtml(node);
  if (typeof node !== "object") return "";

  const typed = node as {
    type?: string;
    text?: string;
    marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
    content?: unknown[];
    attrs?: { level?: number };
  };

  if (typed.type === "text") {
    return applyJiraTextMarks(escapeHtml(typed.text || ""), typed.marks || []);
  }

  if (typed.type === "hardBreak") {
    return "<br/>";
  }

  const content = jiraRichTextToHtml(typed.content || []);

  switch (typed.type) {
    case "doc":
      return content;
    case "paragraph":
      return content ? `<p>${content}</p>` : "";
    case "heading": {
      const level = Math.min(Math.max(Number(typed.attrs?.level) || 3, 1), 6);
      return `<h${level}>${content}</h${level}>`;
    }
    case "blockquote":
      return `<blockquote>${content}</blockquote>`;
    case "bulletList":
      return `<ul>${content}</ul>`;
    case "orderedList":
      return `<ol>${content}</ol>`;
    case "listItem":
      return `<li>${content}</li>`;
    case "panel":
      return `<div>${content}</div>`;
    case "rule":
      return "<hr/>";
    default:
      return content;
  }
}

function jiraRichTextToPlain(node: unknown): string {
  if (!node) return "";
  if (Array.isArray(node)) return node.map(jiraRichTextToPlain).join("");
  if (typeof node === "string") return node;
  if (typeof node !== "object") return "";

  const typed = node as { type?: string; text?: string; content?: unknown[] };

  if (typed.type === "text") {
    return typed.text || "";
  }

  if (typed.type === "hardBreak") {
    return "\n";
  }

  const content = jiraRichTextToPlain(typed.content || []);

  if (["paragraph", "heading", "blockquote"].includes(typed.type || "")) {
    return content + "\n";
  }
  if (typed.type === "listItem") {
    return `- ${content}`;
  }

  return content;
}

function jiraFieldValueToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(jiraFieldValueToText).filter(Boolean).join("\n").trim();
  }
  if (typeof value === "object") {
    const typed = value as Record<string, unknown>;
    if (typed.type || typed.content) {
      return jiraRichTextToPlain(value).trim();
    }
    if (typeof typed.value === "string") {
      return typed.value.trim();
    }
    if (typeof typed.name === "string") {
      return typed.name.trim();
    }
    if (typeof typed.key === "string") {
      return typed.key.trim();
    }
    return Object.values(typed).map(jiraFieldValueToText).filter(Boolean).join("\n").trim();
  }
  return "";
}

function jiraFieldValueToHtml(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return plainTextToHtml(value);
  }
  if (Array.isArray(value)) {
    return value.map(jiraFieldValueToHtml).filter(Boolean).join("");
  }
  if (typeof value === "object") {
    const typed = value as Record<string, unknown>;
    if (typed.type || typed.content) {
      return jiraRichTextToHtml(value).trim();
    }
    if (typeof typed.value === "string") {
      return plainTextToHtml(typed.value);
    }
    if (typeof typed.name === "string") {
      return plainTextToHtml(typed.name);
    }
    if (typeof typed.key === "string") {
      return plainTextToHtml(typed.key);
    }
    return Object.values(typed).map(jiraFieldValueToHtml).filter(Boolean).join("<br/>");
  }
  return "";
}

function findAcceptanceCriteriaValue(fields: Record<string, unknown> = {}, fieldNames: Record<string, unknown> = {}, configuredFieldKey = ""): unknown {
  const directCandidates = [
    fields.acceptanceCriteria,
    fields.acceptance_criteria,
  ];

  if (configuredFieldKey && Object.prototype.hasOwnProperty.call(fields, configuredFieldKey)) {
    directCandidates.unshift(fields[configuredFieldKey]);
  }

  for (const candidate of directCandidates) {
    const text = jiraFieldValueToText(candidate).trim();
    if (text) return candidate;
  }

  const byName = Object.entries(fields).find(([fieldKey]) => {
    const label = String(fieldNames[fieldKey] || fieldKey).toLowerCase();
    return label.includes("acceptance criteria") || label.includes("acceptance criterion");
  });
  if (byName) {
    return byName[1];
  }

  const byKeyHint = Object.entries(fields).find(([fieldKey]) => /acceptance/i.test(fieldKey));
  if (byKeyHint) {
    return byKeyHint[1];
  }

  return null;
}

function extractParentFeature(fields: Record<string, unknown> = {}, cleanBase: string) {
  const parent = fields.parent as Record<string, unknown> | undefined;
  if (parent?.key) {
    const parentFields = (parent.fields || {}) as Record<string, unknown>;
    const issueType = (parentFields.issuetype || {}) as Record<string, unknown>;
    return {
      key: String(parent.key),
      summary: String(parentFields.summary || ""),
      issueType: String(issueType.name || ""),
      url: `${cleanBase}/browse/${parent.key}`,
    };
  }
  return null;
}

function extractLinkedIssues(fields: Record<string, unknown> = {}, cleanBase: string) {
  const links = Array.isArray(fields.issuelinks) ? fields.issuelinks : [];
  return links
    .map((linkValue) => {
      const link = (linkValue || {}) as Record<string, unknown>;
      const related = (link.outwardIssue || link.inwardIssue) as Record<string, unknown> | undefined;
      if (!related?.key) return null;
      const relatedFields = (related.fields || {}) as Record<string, unknown>;
      const relatedIssueType = (relatedFields.issuetype || {}) as Record<string, unknown>;
      const relatedStatus = (relatedFields.status || {}) as Record<string, unknown>;
      const linkType = (link.type || {}) as Record<string, unknown>;

      return {
        key: String(related.key),
        summary: String(relatedFields.summary || ""),
        issueType: String(relatedIssueType.name || ""),
        status: String(relatedStatus.name || ""),
        relationship: link.outwardIssue
          ? String(linkType.outward || "relates to")
          : String(linkType.inward || "relates to"),
        url: `${cleanBase}/browse/${related.key}`,
      };
    })
    .filter(Boolean);
}

function safeUrl(value: unknown): URL | null {
  try {
    const parsed = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function findFigmaLinks(value: unknown, found = new Set<string>()): Set<string> {
  if (!value) return found;
  if (typeof value === "string") {
    const matches = value.match(/https?:\/\/[^\s)"']+/g) || [];
    matches.forEach((url) => {
      const parsed = safeUrl(url);
      if (parsed && /(^|\.)figma\.com$/i.test(parsed.hostname)) {
        found.add(parsed.toString());
      }
    });
    return found;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => findFigmaLinks(entry, found));
    return found;
  }

  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((entry) => findFigmaLinks(entry, found));
  }
  return found;
}

function toFigmaEmbedUrl(sourceUrl: string): string {
  return `https://www.figma.com/embed?embed_host=planning-poker&url=${encodeURIComponent(sourceUrl)}`;
}

const FIGMA_STATE_TTL_MS = 10 * 60 * 1000;
const VIEWER_COOKIE = "pp_figma_viewer";
const TOKEN_COOKIE = "pp_figma_token";
const STATE_COOKIE = "pp_figma_oauth";

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeText(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlDecodeText(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacSha256Base64Url(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function signPayload(payload: Record<string, unknown>, secret: string): Promise<string> {
  const data = base64UrlEncodeText(JSON.stringify(payload));
  const sig = await hmacSha256Base64Url(secret, data);
  return `${data}.${sig}`;
}

async function verifyPayload<T>(token: string, secret: string): Promise<T | null> {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const [data, providedSig] = parts;
  const expectedSig = await hmacSha256Base64Url(secret, data);
  if (providedSig !== expectedSig) return null;
  try {
    return JSON.parse(base64UrlDecodeText(data));
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader = ""): Record<string, string> {
  return String(cookieHeader)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf("=");
      if (idx < 0) return acc;
      const key = decodeURIComponent(part.slice(0, idx).trim());
      const value = decodeURIComponent(part.slice(idx + 1).trim());
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
}

function buildSetCookie(
  name: string,
  value: string,
  options: {
    path?: string;
    maxAgeSeconds?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
  } = {},
): string {
  const attrs = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    `Path=${options.path || "/"}`,
    `SameSite=${options.sameSite || "Lax"}`,
  ];
  if (typeof options.maxAgeSeconds === "number") attrs.push(`Max-Age=${options.maxAgeSeconds}`);
  if (options.httpOnly !== false) attrs.push("HttpOnly");
  if (options.secure !== false) attrs.push("Secure");
  return attrs.join("; ");
}

function ensureViewerId(req: Request, setCookies: string[]): string {
  const cookies = parseCookies(req.headers.get("cookie") || "");
  const existing = cookies[VIEWER_COOKIE];
  if (existing) return existing;
  const viewerId = crypto.randomUUID();
  setCookies.push(buildSetCookie(VIEWER_COOKIE, viewerId, { maxAgeSeconds: 60 * 60 * 24 * 365, sameSite: "None" }));
  return viewerId;
}

async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64UrlEncodeBytes(randomBytes(32));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64UrlEncodeBytes(new Uint8Array(digest));
  return { verifier, challenge };
}

async function exchangeFigmaAuthCode(cfg: ReturnType<typeof figmaConfig>, code: string, codeVerifier: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code_verifier: codeVerifier,
  });

  const response = await fetch("https://api.figma.com/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Figma token exchange failed (${response.status}): ${bodyText.slice(0, 160)}`);
  }

  return await response.json();
}

async function refreshFigmaAccessToken(cfg: ReturnType<typeof figmaConfig>, refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const response = await fetch("https://api.figma.com/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Figma refresh failed (${response.status}): ${bodyText.slice(0, 160)}`);
  }

  return await response.json();
}

async function getViewerFigmaToken(req: Request, cfg: ReturnType<typeof figmaConfig>, setCookies: string[]) {
  const cookies = parseCookies(req.headers.get("cookie") || "");
  const viewerId = ensureViewerId(req, setCookies);
  const packed = cookies[TOKEN_COOKIE];
  if (!packed) return null;

  const tokenData = await verifyPayload<{
    viewerId: string;
    accessToken: string;
    refreshToken?: string;
    tokenType?: string;
    scope?: string;
    expiresAt: number;
  }>(packed, cfg.signingKey);

  if (!tokenData?.accessToken || tokenData.viewerId !== viewerId) {
    setCookies.push(buildSetCookie(TOKEN_COOKIE, "", { maxAgeSeconds: 0, sameSite: "None" }));
    return null;
  }

  if (Number(tokenData.expiresAt || 0) > Date.now() + 60 * 1000) {
    return tokenData;
  }

  if (!tokenData.refreshToken) {
    setCookies.push(buildSetCookie(TOKEN_COOKIE, "", { maxAgeSeconds: 0, sameSite: "None" }));
    return null;
  }

  const refreshed = await refreshFigmaAccessToken(cfg, tokenData.refreshToken);
  const refreshedPayload = {
    viewerId,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || tokenData.refreshToken,
    tokenType: refreshed.token_type || "Bearer",
    scope: refreshed.scope || cfg.scope,
    expiresAt: Date.now() + Math.max(60, Number(refreshed.expires_in || 3600)) * 1000,
  };
  const signed = await signPayload(refreshedPayload, cfg.signingKey);
  setCookies.push(buildSetCookie(TOKEN_COOKIE, signed, { maxAgeSeconds: 60 * 60 * 24 * 30, sameSite: "None" }));
  return refreshedPayload;
}

function extractFigmaEmbeds(fields: Record<string, unknown> = {}, remoteLinks: unknown[] = []) {
  const found = findFigmaLinks(fields);

  for (const link of remoteLinks) {
    const rl = (link || {}) as Record<string, unknown>;
    const object = (rl.object || {}) as Record<string, unknown>;
    const objectUrl = object.url;
    if (typeof objectUrl === "string") {
      const parsed = safeUrl(objectUrl);
      if (parsed && /(^|\.)figma\.com$/i.test(parsed.hostname)) {
        found.add(parsed.toString());
      }
    }
  }

  const links = Array.from(found)
    .filter((url) => /figma\.com\/(file|design|proto|board)\//i.test(url))
    .slice(0, 3);

  return links.map((sourceUrl) => ({ sourceUrl, embedUrl: toFigmaEmbedUrl(sourceUrl) }));
}

function normalizeJiraIssue(data: Record<string, unknown>, baseUrl: string, cfg: ReturnType<typeof jiraConfig>) {
  const fields = (data.fields || {}) as Record<string, unknown>;
  const fieldNames = (data.names || {}) as Record<string, unknown>;

  const commentsObj = (fields.comment || {}) as Record<string, unknown>;
  const comments = Array.isArray(commentsObj.comments) ? commentsObj.comments : [];
  const notes = comments.slice(0, 3).map((commentValue) => {
    const comment = (commentValue || {}) as Record<string, unknown>;
    const author = (comment.author || {}) as Record<string, unknown>;
    const authorName = String(author.displayName || "Unknown");
    const text = jiraRichTextToPlain(comment.body).trim();
    return `${authorName}: ${text || "(empty)"}`;
  });

  const attachments = Array.isArray(fields.attachment) ? fields.attachment : [];
  const images = attachments
    .map((item) => (item || {}) as Record<string, unknown>)
    .filter((a) => String(a.mimeType || "").startsWith("image/"))
    .map((a) => ({
      id: a.id,
      filename: String(a.filename || ""),
      mimeType: String(a.mimeType || ""),
      content: String(a.content || ""),
      thumbnail: String(a.thumbnail || a.content || ""),
    }));

  const cleanBase = baseUrl.replace(/\/$/, "");
  const acceptanceCriteriaValue = findAcceptanceCriteriaValue(fields, fieldNames, cfg.acceptanceCriteriaField);
  const acceptanceCriteria = jiraFieldValueToText(acceptanceCriteriaValue).trim();
  const acceptanceCriteriaHtml = jiraFieldValueToHtml(acceptanceCriteriaValue).trim();
  const linkedIssues = extractLinkedIssues(fields, cleanBase);
  const parentFeature = extractParentFeature(fields, cleanBase);
  const remoteLinks = Array.isArray(data.remoteLinks) ? data.remoteLinks : [];
  const figmaEmbeds = extractFigmaEmbeds(fields, remoteLinks);

  const issueType = (fields.issuetype || {}) as Record<string, unknown>;
  const status = (fields.status || {}) as Record<string, unknown>;
  const assignee = (fields.assignee || {}) as Record<string, unknown>;
  const priority = (fields.priority || {}) as Record<string, unknown>;

  return {
    key: String(data.key || ""),
    summary: String(fields.summary || "(no summary)"),
    issueType: String(issueType.name || "Unknown"),
    parentFeature,
    linkedIssues,
    acceptanceCriteria,
    acceptanceCriteriaHtml,
    description: jiraRichTextToPlain(fields.description).trim() || "(no description)",
    notes,
    images,
    figmaEmbeds,
    status: String(status.name || "Unknown"),
    assignee: String(assignee.displayName || "Unassigned"),
    priority: String(priority.name || "Unknown"),
    url: `${cleanBase}/browse/${data.key}`,
  };
}

async function fetchJiraIssue(issueKey: string) {
  const cfg = jiraConfig();
  if (!hasJiraConfig(cfg)) {
    return { ok: false, error: "Jira not configured." };
  }

  const cleanBase = cfg.baseUrl.replace(/\/$/, "");
  const issueUrl = `${cleanBase}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=*all&expand=names`;
  const remoteLinksUrl = `${cleanBase}/rest/api/3/issue/${encodeURIComponent(issueKey)}/remotelink`;
  const headers = jiraAuthHeaders(cfg);

  try {
    const [issueResponse, remoteLinksResponse] = await Promise.all([
      fetch(issueUrl, { method: "GET", headers }),
      fetch(remoteLinksUrl, { method: "GET", headers }),
    ]);

    if (!issueResponse.ok) {
      const body = await issueResponse.text();
      return { ok: false, error: `Jira ${issueResponse.status}: ${body.slice(0, 180)}` };
    }

    const data = await issueResponse.json();
    data.remoteLinks = remoteLinksResponse.ok ? await remoteLinksResponse.json() : [];

    return {
      ok: true,
      issue: normalizeJiraIssue(data, cleanBase, cfg),
    };
  } catch (error) {
    return { ok: false, error: formatFetchError(error) };
  }
}

async function fetchJiraFilterIssues(filterRef: string, maxResults = 100) {
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

  const mapIssues = (issuesList: unknown[]) => {
    return (issuesList || []).map((issueValue) => {
      const issue = (issueValue || {}) as Record<string, unknown>;
      const fields = (issue.fields || {}) as Record<string, unknown>;
      const parent = (fields.parent || {}) as Record<string, unknown>;
      const parentFields = (parent.fields || {}) as Record<string, unknown>;
      const issueType = (fields.issuetype || {}) as Record<string, unknown>;
      const status = (fields.status || {}) as Record<string, unknown>;
      const parentKey = String(parent.key || "");
      const parentSummary = String(parentFields.summary || "");
      return {
        key: String(issue.key || ""),
        summary: String(fields.summary || "(no summary)"),
        issueType: String(issueType.name || "Unknown"),
        status: String(status.name || "Unknown"),
        parentKey: parentKey || null,
        parentSummary: parentSummary || null,
        url: `${cleanBase}/browse/${issue.key}`,
      };
    });
  };

  const runJqlSearch = async (jql: string) => {
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

    const legacyUrl = `${cleanBase}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${normalizedMax}&fields=summary,status,issuetype,parent`;
    const legacyResponse = await fetch(legacyUrl, { method: "GET", headers });
    if (!legacyResponse.ok) {
      const body = await legacyResponse.text();
      throw new Error(`Jira ${legacyResponse.status}: ${body.slice(0, 180)}`);
    }
    return await legacyResponse.json();
  };

  const fetchFilterSearch = async (filterId: string) => {
    const encodedId = encodeURIComponent(filterId);
    try {
      const filterSearchUrl = `${cleanBase}/rest/api/3/filter/${encodedId}/search?maxResults=${normalizedMax}&fields=summary,status,issuetype,parent`;
      const filterSearchResponse = await fetch(filterSearchUrl, { method: "GET", headers });
      if (filterSearchResponse.ok) {
        const data = await filterSearchResponse.json();
        return {
          ok: true,
          filterId: String((data.filter || {}).id || filterId),
          filterName: (data.filter || {}).name || null,
          issues: mapIssues(Array.isArray(data.issues) ? data.issues : []),
        };
      }
    } catch {
      // continue to fallback flow
    }

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
      return { ok: false, error: formatFetchError(error) };
    }

    return {
      ok: true,
      filterId: String(filterData.id || filterId),
      filterName: filterData.name || null,
      issues: mapIssues(Array.isArray(searchData.issues) ? searchData.issues : []),
    };
  };

  try {
    if (/^\d+$/.test(ref)) {
      return await fetchFilterSearch(ref);
    }

    const trailingIdMatch = ref.match(/(\d+)\s*$/);
    if (trailingIdMatch?.[1]) {
      const byTrailingId = await fetchFilterSearch(trailingIdMatch[1]);
      if (byTrailingId.ok) {
        return byTrailingId;
      }
    }

    const filterSearchUrl = `${cleanBase}/rest/api/3/filter/search?filterName=${encodeURIComponent(ref)}&maxResults=50`;
    const filterSearchResponse = await fetch(filterSearchUrl, { method: "GET", headers });
    if (filterSearchResponse.ok) {
      const filterData = await filterSearchResponse.json();
      const values = Array.isArray(filterData.values) ? filterData.values : [];
      const exact = values.find((f: unknown) => String(((f as Record<string, unknown>) || {}).name || "").toLowerCase() === ref.toLowerCase());
      const selected = exact || values[0];
      if (selected?.id) {
        return await fetchFilterSearch(String(selected.id));
      }
    }

    return { ok: false, error: `No Jira filter found matching \"${ref}\".` };
  } catch (error) {
    return { ok: false, error: formatFetchError(error) };
  }
}

async function fetchJiraAttachment(issueKey: string, attachmentId: string) {
  const cfg = jiraConfig();
  if (!hasJiraConfig(cfg)) {
    return { ok: false, error: "Jira not configured." };
  }

  const jira = await fetchJiraIssue(issueKey);
  if (!jira.ok) {
    return { ok: false, error: jira.error };
  }

  const issueData = (jira as { issue?: { images?: Array<{ id: unknown; content?: string; mimeType?: string }> } }).issue;
  const image = (issueData?.images || []).find((img) => String(img.id) === attachmentId);
  if (!image?.content) {
    return { ok: false, status: 404, error: "Attachment not found." };
  }

  try {
    const imageResponse = await fetch(image.content, {
      method: "GET",
      headers: jiraAuthHeaders(cfg),
    });
    if (!imageResponse.ok) {
      const body = await imageResponse.text();
      return { ok: false, error: `Jira ${imageResponse.status}: ${body.slice(0, 180)}` };
    }

    return {
      ok: true,
      mimeType: imageResponse.headers.get("content-type") || image.mimeType || "image/*",
      bytes: await imageResponse.arrayBuffer(),
    };
  } catch (error) {
    return { ok: false, error: formatFetchError(error) };
  }
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = origin || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function jsonResponse(req: Request, status: number, payload: unknown, setCookies: string[] = []): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeadersFor(req),
  });
  for (const value of setCookies) headers.append("Set-Cookie", value);
  return new Response(JSON.stringify(payload), {
    status,
    headers,
  });
}

function htmlResponse(req: Request, status: number, html: string, setCookies: string[] = []): Response {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    ...corsHeadersFor(req),
  });
  for (const value of setCookies) headers.append("Set-Cookie", value);
  return new Response(html, { status, headers });
}

function redirectResponse(req: Request, location: string, setCookies: string[] = []): Response {
  const headers = new Headers({
    Location: location,
    ...corsHeadersFor(req),
  });
  for (const value of setCookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 302, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  if (path.match(/\/api\/figma\/auth\/status\/?$/i) && req.method === "GET") {
    const cfg = figmaConfig();
    if (!hasFigmaConfig(cfg)) {
      return jsonResponse(req, 200, { ok: true, configured: false, authenticated: false });
    }

    const setCookies: string[] = [];
    try {
      const token = await getViewerFigmaToken(req, cfg, setCookies);
      return jsonResponse(req, 200, { ok: true, configured: true, authenticated: Boolean(token) }, setCookies);
    } catch (error) {
      return jsonResponse(req, 500, { ok: false, error: formatFetchError(error) }, setCookies);
    }
  }

  if (path.match(/\/api\/figma\/auth\/start\/?$/i) && req.method === "GET") {
    const cfg = figmaConfig();
    if (!hasFigmaConfig(cfg)) {
      return htmlResponse(req, 500, "Figma auth not configured.");
    }

    const setCookies: string[] = [];
    const viewerId = ensureViewerId(req, setCookies);
    const state = base64UrlEncodeBytes(randomBytes(24));
    const { verifier, challenge } = await createPkcePair();
    const returnTo = String(url.searchParams.get("returnTo") || "").slice(0, 600);
    const returnOrigin = String(url.searchParams.get("returnOrigin") || "").slice(0, 200);
    const statePayload = {
      viewerId,
      state,
      codeVerifier: verifier,
      returnTo,
      returnOrigin,
      expiresAt: Date.now() + FIGMA_STATE_TTL_MS,
    };
    const packedState = await signPayload(statePayload, cfg.signingKey);
    setCookies.push(buildSetCookie(STATE_COOKIE, packedState, { maxAgeSeconds: 60 * 15, sameSite: "None" }));

    const authUrl = new URL("https://www.figma.com/oauth");
    authUrl.searchParams.set("client_id", cfg.clientId);
    authUrl.searchParams.set("redirect_uri", cfg.redirectUri);
    authUrl.searchParams.set("scope", cfg.scope);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    return redirectResponse(req, authUrl.toString(), setCookies);
  }

  if (path.match(/\/api\/figma\/auth\/callback\/?$/i) && req.method === "GET") {
    const cfg = figmaConfig();
    if (!hasFigmaConfig(cfg)) {
      return htmlResponse(req, 500, "Figma auth not configured.");
    }

    const setCookies: string[] = [];
    const queryState = String(url.searchParams.get("state") || "");
    const code = String(url.searchParams.get("code") || "");
    const cookies = parseCookies(req.headers.get("cookie") || "");
    const packedState = cookies[STATE_COOKIE];
    setCookies.push(buildSetCookie(STATE_COOKIE, "", { maxAgeSeconds: 0, sameSite: "None" }));

    if (!packedState || !queryState || !code) {
      return htmlResponse(req, 400, "Invalid or expired Figma auth state.", setCookies);
    }

    const stateData = await verifyPayload<{
      viewerId: string;
      state: string;
      codeVerifier: string;
      returnTo?: string;
      returnOrigin?: string;
      expiresAt: number;
    }>(packedState, cfg.signingKey);

    if (!stateData || stateData.state !== queryState || Number(stateData.expiresAt || 0) < Date.now()) {
      return htmlResponse(req, 400, "Invalid or expired Figma auth state.", setCookies);
    }

    try {
      const token = await exchangeFigmaAuthCode(cfg, code, stateData.codeVerifier);
      const tokenPayload = {
        viewerId: stateData.viewerId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenType: token.token_type || "Bearer",
        scope: token.scope || cfg.scope,
        expiresAt: Date.now() + Math.max(60, Number(token.expires_in || 3600)) * 1000,
      };
      const packedToken = await signPayload(tokenPayload, cfg.signingKey);
      setCookies.push(buildSetCookie(TOKEN_COOKIE, packedToken, { maxAgeSeconds: 60 * 60 * 24 * 30, sameSite: "None" }));

      const safeReturnTo = (() => {
        const parsed = safeUrl(stateData.returnTo || "");
        return parsed ? parsed.toString() : "";
      })();
      const safeReturnOrigin = (() => {
        const parsed = safeUrl(stateData.returnOrigin || "");
        return parsed ? parsed.origin : "*";
      })();

      if (safeReturnTo) {
        return redirectResponse(req, safeReturnTo, setCookies);
      }

      const html = [
        "<!doctype html>",
        '<html><head><meta charset="utf-8"><title>Figma Login Complete</title></head>',
        '<body style="font-family:Segoe UI,Arial,sans-serif;padding:24px">',
        "<h2>Figma connected</h2><p>You can close this window.</p>",
        `<script>if(window.opener){window.opener.postMessage({type:'figma-auth-complete',ok:true}, ${JSON.stringify(safeReturnOrigin)});}window.close();</script>`,
        "</body></html>",
      ].join("");
      return htmlResponse(req, 200, html, setCookies);
    } catch (error) {
      return htmlResponse(req, 502, `Figma login failed: ${escapeHtml(formatFetchError(error))}`, setCookies);
    }
  }

  if (path.match(/\/api\/figma\/auth\/logout\/?$/i) && req.method === "POST") {
    const setCookies = [buildSetCookie(TOKEN_COOKIE, "", { maxAgeSeconds: 0, sameSite: "None" })];
    return jsonResponse(req, 200, { ok: true }, setCookies);
  }

  if (req.method !== "GET") {
    return jsonResponse(req, 405, { ok: false, error: "Method not allowed" });
  }

  const attachmentMatch = path.match(/\/api\/jira\/([^/]+)\/attachment\/([^/]+)\/?$/i);
  if (attachmentMatch) {
    const issueKey = parseIssueKey(decodeURIComponent(attachmentMatch[1] || ""));
    const attachmentId = String(decodeURIComponent(attachmentMatch[2] || "")).trim();
    if (!issueKey || !attachmentId) {
      return jsonResponse(req, 400, { ok: false, error: "Invalid attachment request." });
    }

    const result = await fetchJiraAttachment(issueKey, attachmentId);
    if (!result.ok) {
      const status = result.status || (result.error === "Attachment not found." ? 404 : 502);
      return jsonResponse(req, status, { ok: false, error: result.error });
    }

    const headers = new Headers({
      "Content-Type": result.mimeType || "application/octet-stream",
      "Cache-Control": "private, max-age=120",
      ...corsHeadersFor(req),
    });
    return new Response(result.bytes, {
      status: 200,
      headers,
    });
  }

  const filterMatch = path.match(/\/api\/jira\/filter\/([^/]+)\/?$/i);
  if (filterMatch) {
    const filterRef = String(decodeURIComponent(filterMatch[1] || "")).trim();
    if (!filterRef) {
      return jsonResponse(req, 400, { ok: false, error: "Filter reference is required." });
    }

    const maxResultsRaw = Number(url.searchParams.get("maxResults") || 100);
    const jira = await fetchJiraFilterIssues(filterRef, maxResultsRaw);
    if (!jira.ok) {
      return jsonResponse(req, 502, { ok: false, error: jira.error });
    }

    return jsonResponse(req, 200, {
      ok: true,
      filterId: jira.filterId,
      filterName: jira.filterName,
      issues: jira.issues,
    });
  }

  const issueMatch = path.match(/\/api\/jira\/([^/]+)\/?$/i);
  if (issueMatch) {
    const issueKey = parseIssueKey(decodeURIComponent(issueMatch[1] || ""));
    if (!issueKey) {
      return jsonResponse(req, 400, { ok: false, error: "Invalid issue key format." });
    }

    const jira = await fetchJiraIssue(issueKey);
    if (!jira.ok) {
      return jsonResponse(req, 502, { ok: false, error: jira.error });
    }

    return jsonResponse(req, 200, { ok: true, issue: jira.issue });
  }

  return jsonResponse(req, 404, { ok: false, error: "Route not found." });
});
