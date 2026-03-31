import { useState, useRef, useCallback, useEffect } from "react";
import PropTypes from "prop-types";

const PRESET_DECKS = {
  fibonacci: { label: "Fibonacci", cards: ["1", "3", "5", "8", "13", "?", "☕"] },
  tshirt: { label: "T-Shirt", cards: ["XS", "S", "M", "L", "XL", "XXL", "?"] },
  standard: { label: "Standard", cards: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "?"] },
  hours: { label: "Hours", cards: ["0.5", "1", "2", "4", "8", "16", "24", "40", "?"] },
};

const DEMO_USERS = ["Alex", "Jordan", "Sam", "Riley", "Morgan"];
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3978";
const DEFAULT_JIRA_SECTION_STATE = {
  description: true,
  acceptanceCriteria: true,
  linkedIssues: true,
  notes: true,
  images: true,
};

function extractIssueKey(text) {
  const match = String(text || "").toUpperCase().match(/([A-Z][A-Z0-9]+-\d+)/);
  return match ? match[1] : null;
}

function CardBack() {
  return (
    <div style={{
      width: "100%", height: "100%", borderRadius: 10,
      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      border: "1px solid rgba(255,255,255,0.1)",
    }}>
      <div style={{
        width: "75%", height: "75%", border: "2px solid rgba(99,179,237,0.3)",
        borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <span style={{ fontSize: 20, opacity: 0.4 }}>🂠</span>
      </div>
    </div>
  );
}

function PokerCard({ value, selected, onClick, revealed, small }) {
  const w = small ? 44 : 53;
  const h = small ? 60 : 78;
  return (
    <div
      onClick={onClick}
      style={{
        width: w, height: h, cursor: onClick ? "pointer" : "default",
        perspective: 600, flexShrink: 0,
      }}
    >
      <div style={{
        width: "100%", height: "100%", position: "relative",
        transition: "transform 0.5s cubic-bezier(.4,2,.6,1)",
        transformStyle: "preserve-3d",
        transform: revealed ? "rotateY(0deg)" : "rotateY(0deg)",
      }}>
        <div style={{
          position: "absolute", width: "100%", height: "100%", borderRadius: 10,
          background: selected
            ? "linear-gradient(135deg, #667eea, #764ba2)"
            : "linear-gradient(135deg, #1e293b, #334155)",
          border: selected ? "2px solid #a78bfa" : "2px solid rgba(255,255,255,0.08)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          boxShadow: selected
            ? "0 0 20px rgba(167,139,250,0.5), 0 8px 24px rgba(0,0,0,0.4)"
            : "0 4px 12px rgba(0,0,0,0.3)",
          transform: selected ? "translateY(-8px) scale(1.05)" : "translateY(0) scale(1)",
          transition: "all 0.2s cubic-bezier(.4,2,.6,1)",
        }}>
          <span style={{
            fontSize: small ? 14 : (value.length > 2 ? 16 : 24),
            fontWeight: 700, color: selected ? "#fff" : "#94a3b8",
            fontFamily: "'Courier New', monospace",
            letterSpacing: -0.5,
          }}>
            {value}
          </span>
          {!small && (
            <span style={{
              position: "absolute", top: 4, left: 6,
              fontSize: 9, color: selected ? "rgba(255,255,255,0.6)" : "rgba(148,163,184,0.4)",
              fontFamily: "monospace",
            }}>{value}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function VoteSlot({ name, voted, value, revealed, originalValue }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 69, // This is the highest width to get 5 people on one row (nice)
    }}>
      <div style={{ width: 52, height: 72, position: "relative" }}>
        {voted ? (
          revealed ? (
            <div style={{
              width: "100%", height: "100%", borderRadius: 10,
              background: "linear-gradient(135deg, #059669, #10b981)",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid #34d399",
              boxShadow: "0 0 16px rgba(52,211,153,0.4)",
              animation: "flipIn 0.4s ease",
            }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1 }}>
                <span style={{
                  fontSize: value?.length > 2 ? 14 : 22, fontWeight: 800,
                  color: "#fff", fontFamily: "monospace",
                }}>{value}</span>
                {originalValue && originalValue !== value && (
                  <span style={{
                    marginTop: 2,
                    fontSize: 10,
                    color: "rgba(255,255,255,0.8)",
                    fontFamily: "monospace",
                  }}>
                    was {originalValue}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div style={{ width: "100%", height: "100%" }}>
              <CardBack />
            </div>
          )
        ) : (
          <div style={{
            width: "100%", height: "100%", borderRadius: 10,
            border: "2px dashed rgba(255,255,255,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 18, opacity: 0.2 }}>…</span>
          </div>
        )}
        {voted && !revealed && (
          <div style={{
            position: "absolute", top: -4, right: -4, width: 14, height: 14,
            borderRadius: "50%", background: "#10b981",
            border: "2px solid #064e3b",
          }} />
        )}
      </div>
      <span style={{
        fontSize: 11, color: "#64748b", fontFamily: "monospace",
        maxWidth: 70, textAlign: "center", overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{name}</span>
    </div>
  );
}

PokerCard.propTypes = {
  value: PropTypes.string.isRequired,
  selected: PropTypes.bool,
  onClick: PropTypes.func,
  revealed: PropTypes.bool,
  small: PropTypes.bool,
};

VoteSlot.propTypes = {
  name: PropTypes.string.isRequired,
  voted: PropTypes.bool,
  value: PropTypes.string,
  revealed: PropTypes.bool,
  originalValue: PropTypes.string,
};

export default function PlanningPoker() {
  const [view, setView] = useState("lobby"); // lobby | session | results
  const [deck, setDeck] = useState("fibonacci");
  const [customCards, setCustomCards] = useState("");
  const [addCardInput, setAddCardInput] = useState("");
  const [activeCards, setActiveCards] = useState(PRESET_DECKS.fibonacci.cards);
  const [currentStory, setCurrentStory] = useState("");
  const [storyInput, setStoryInput] = useState("");
  const [stories, setStories] = useState([]);
  const [csvStories, setCsvStories] = useState([]);
  const [storyIndex, setStoryIndex] = useState(0);
  const [votes, setVotes] = useState({}); // { username: value }
  const [originalVotes, setOriginalVotes] = useState({}); // Snapshot taken at reveal
  const [myVote, setMyVote] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [finalEstimate, setFinalEstimate] = useState("");
  const [isLightMode, setIsLightMode] = useState(false);
  const [participants, setParticipants] = useState(DEMO_USERS);
  const [participantInput, setParticipantInput] = useState("");
  const [history, setHistory] = useState([]);
  const [jiraIssue, setJiraIssue] = useState(null);
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState("");
  const [jiraFilterInput, setJiraFilterInput] = useState("");
  const [jiraFilterLoading, setJiraFilterLoading] = useState(false);
  const [jiraFilterError, setJiraFilterError] = useState("");
  const [jiraFilterInfo, setJiraFilterInfo] = useState("");
  const [activeImageIndex, setActiveImageIndex] = useState(null);
  const [jiraSectionsOpen, setJiraSectionsOpen] = useState(DEFAULT_JIRA_SECTION_STATE);
  const [tab, setTab] = useState("deck"); // deck | stories | participants
  const fileRef = useRef();

  const allStories = [...csvStories, ...stories];

  const getJiraAttachmentSrc = useCallback((issueKey, attachmentId) => {
    return `${API_BASE_URL}/api/jira/${encodeURIComponent(issueKey)}/attachment/${encodeURIComponent(attachmentId)}`;
  }, []);

  useEffect(() => {
    setJiraSectionsOpen(DEFAULT_JIRA_SECTION_STATE);
  }, [jiraIssue?.key]);

  const toggleJiraSection = (sectionKey) => {
    setJiraSectionsOpen((current) => ({ ...current, [sectionKey]: !current[sectionKey] }));
  };

  const getJiraSectionHeaderStyle = (isOpen) => ({
    margin: "-10px -12px 0",
    padding: "10px 12px",
    borderRadius: isOpen ? "10px 10px 0 0" : "10px",
    borderBottom: isOpen ? "1px solid rgba(148,163,184,0.18)" : "none",
    background: isOpen ? "rgba(96,165,250,0.06)" : "transparent",
    marginBottom: isOpen ? 8 : 0,
  });

  const getJiraChevronStyle = (isOpen) => ({
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: isOpen ? "rgba(96,165,250,0.14)" : "rgba(148,163,184,0.12)",
    border: isOpen ? "1px solid rgba(96,165,250,0.35)" : "1px solid rgba(148,163,184,0.2)",
    color: isOpen ? "#bfdbfe" : "#cbd5e1",
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1,
    flexShrink: 0,
    transition: "all 0.15s ease",
  });

  const loadJiraForStory = useCallback(async (story) => {
    const key = extractIssueKey(story);
    if (!key) {
      setJiraIssue(null);
      setJiraError("");
      setJiraLoading(false);
      return;
    }

    setJiraLoading(true);
    setJiraError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/jira/${encodeURIComponent(key)}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to load Jira issue");
      }
      setJiraIssue(payload.issue);
    } catch (error) {
      setJiraIssue(null);
      setJiraError(error.message || "Failed to load Jira issue");
    } finally {
      setJiraLoading(false);
    }
  }, []);

  const startSession = () => {
    const story = allStories[0] || storyInput || "Story #1";
    setCurrentStory(story);
    loadJiraForStory(story);
    setVotes({});
    setOriginalVotes({});
    setMyVote(null);
    setRevealed(false);
    setFinalEstimate("");
    setStoryIndex(0);
    setView("session");
    // Simulate other users voting after a delay
    simulateVotes(participants);
  };

  const simulateVotes = useCallback((currentParticipants) => {
    const others = (currentParticipants || participants).slice(1);
    const cards = activeCards.filter(c => c !== "?" && c !== "☕");
    others.forEach((user, i) => {
      setTimeout(() => {
        setVotes(v => ({ ...v, [user]: cards[Math.floor(Math.random() * cards.length)] }));
      }, 1200 + i * 800);
    });
  }, [activeCards, participants]);

  const castVote = (val) => {
    setMyVote(val);
    setVotes(v => ({ ...v, [DEMO_USERS[0]]: val }));
  };

  const reveal = () => {
    setOriginalVotes({ ...votes });
    setRevealed(true);
    // Pre-fill estimate with calculated consensus; facilitator can override
    const vals = Object.values(votes).filter(v => !isNaN(parseFloat(v)));
    if (vals.length) {
      const avg = vals.reduce((a, b) => a + parseFloat(b), 0) / vals.length;
      const nums = activeCards.filter(c => !isNaN(parseFloat(c))).map(parseFloat);
      const nearest = nums.length
        ? nums.reduce((a, b) => Math.abs(b - avg) < Math.abs(a - avg) ? b : a, nums[0])
        : Math.round(avg);
      setFinalEstimate(String(nearest));
    }
  };

  const saveStorySnapshot = useCallback((story, storyVotes, estimate) => {
    setHistory((h) => {
      const existingIndex = h.findIndex((item) => item.story === story);
      const snapshot = { story, votes: { ...storyVotes }, result: estimate || "?" };
      if (existingIndex >= 0) {
        const updated = [...h];
        updated[existingIndex] = snapshot;
        return updated;
      }
      return [...h, snapshot];
    });
  }, []);

  const restoreStorySnapshot = useCallback((story) => {
    const existing = history.find((item) => item.story === story);
    if (!existing) return false;

    const restoredVotes = { ...(existing.votes || {}) };
    setVotes(restoredVotes);
    setOriginalVotes(restoredVotes);
    setMyVote(restoredVotes[DEMO_USERS[0]] || null);
    setRevealed(true);
    setFinalEstimate(existing.result || "");
    return true;
  }, [history]);

  const nextStory = () => {
    const next = storyIndex + 1;
    const story = allStories[next] || `Story #${next + 1}`;
    if (revealed && myVote) {
      saveStorySnapshot(currentStory, votes, finalEstimate);
    }
    setStoryIndex(next);
    setCurrentStory(story);
    loadJiraForStory(story);

    if (restoreStorySnapshot(story)) {
      return;
    }

    setVotes({});
    setOriginalVotes({});
    setMyVote(null);
    setRevealed(false);
    simulateVotes(participants);
  };

  const previousStory = () => {
    if (storyIndex === 0) return;
    const prev = storyIndex - 1;
    const story = allStories[prev] || `Story #${prev + 1}`;

    setStoryIndex(prev);
    setCurrentStory(story);
    loadJiraForStory(story);

    if (restoreStorySnapshot(story)) {
      return;
    }

    setVotes({});
    setOriginalVotes({});
    setMyVote(null);
    setRevealed(false);
    setFinalEstimate("");
    simulateVotes();
  };

  const getCurrentStoryResult = () => {
    const explicitEstimate = String(finalEstimate || "").trim();
    if (explicitEstimate) return explicitEstimate;

    const numericVotes = Object.values(votes)
      .filter((value) => !isNaN(parseFloat(value)))
      .map((value) => parseFloat(value));
    if (!numericVotes.length) return "?";

    const average = numericVotes.reduce((sum, value) => sum + value, 0) / numericVotes.length;
    const numericDeck = activeCards
      .filter((card) => !isNaN(parseFloat(card)))
      .map((card) => parseFloat(card));

    if (!numericDeck.length) return String(Math.round(average));
    const nearest = numericDeck.reduce((closest, candidate) => (
      Math.abs(candidate - average) < Math.abs(closest - average) ? candidate : closest
    ), numericDeck[0]);
    return String(nearest);
  };

  const endSession = () => {
    const shouldPersistCurrentStory = Boolean(
      currentStory && (revealed || myVote || finalEstimate || Object.keys(votes).length > 0)
    );

    if (shouldPersistCurrentStory) {
      const snapshot = {
        story: currentStory,
        votes: { ...votes },
        result: getCurrentStoryResult(),
      };

      setHistory((existingHistory) => {
        const existingIndex = existingHistory.findIndex((item) => item.story === currentStory);
        if (existingIndex >= 0) {
          const updated = [...existingHistory];
          updated[existingIndex] = snapshot;
          return updated;
        }
        return [...existingHistory, snapshot];
      });
    }
    setView("summary");
  };

  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split("\n").map(l => l.trim()).filter(Boolean);
      // Support: story title in first or second column
      const parsed = lines.map(line => {
        const cols = line.split(",");
        return cols[0].replace(/^["']|["']$/g, "").trim();
      }).filter(Boolean);
      setCsvStories(parsed);
    };
    reader.readAsText(file);
  };

  const loadStoriesFromJiraFilter = async () => {
    const ref = jiraFilterInput.trim();
    if (!ref) return;
    setJiraFilterLoading(true);
    setJiraFilterError("");
    setJiraFilterInfo("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/jira/filter/${encodeURIComponent(ref)}?maxResults=100`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to load Jira filter");
      }
      const imported = (payload.issues || []).map((issue) => `${issue.key}: ${issue.summary}`);
      setCsvStories(imported);
      setJiraFilterInfo(`Loaded ${imported.length} stories from ${payload.filterName || payload.filterId || ref}`);
    } catch (error) {
      setJiraFilterError(error.message || "Failed to load Jira filter");
    } finally {
      setJiraFilterLoading(false);
    }
  };

  const handleAddCard = () => {
    const val = addCardInput.trim();
    if (val && !activeCards.includes(val)) {
      setActiveCards(c => [...c, val]);
    }
    setAddCardInput("");
  };

  const switchDeck = (key) => {
    setDeck(key);
    if (key === "custom") {
      const vals = customCards.split(",").map(v => v.trim()).filter(Boolean);
      setActiveCards(vals.length ? vals : activeCards);
    } else {
      setActiveCards(PRESET_DECKS[key].cards);
    }
  };

  const voteCount = Object.keys(votes).length;
  const totalParticipants = participants.length;
  const allVoted = voteCount >= totalParticipants;

  const voteValues = Object.values(votes).filter(v => !isNaN(parseFloat(v))).map(parseFloat);
  const avg = voteValues.length ? (voteValues.reduce((a, b) => a + b, 0) / voteValues.length).toFixed(1) : null;
  const min = voteValues.length ? Math.min(...voteValues) : null;
  const max = voteValues.length ? Math.max(...voteValues) : null;
  const issueType = jiraIssue?.issueType || "Unknown";
  const issueTypePillStyles = {
    Story: {
      background: "rgba(34,197,94,0.14)",
      border: "1px solid rgba(34,197,94,0.35)",
      color: "#86efac",
    },
    Task: {
      background: "rgba(59,130,246,0.14)",
      border: "1px solid rgba(59,130,246,0.35)",
      color: "#93c5fd",
    },
    Bug: {
      background: "rgba(239,68,68,0.14)",
      border: "1px solid rgba(239,68,68,0.35)",
      color: "#fca5a5",
    },
    default: {
      background: "rgba(148,163,184,0.12)",
      border: "1px solid rgba(148,163,184,0.3)",
      color: "#cbd5e1",
    },
  };
  const activeIssueTypePillStyle = issueTypePillStyles[issueType] || issueTypePillStyles.default;
  const theme = isLightMode
    ? {
        appBg: "#f3f7fb",
        text: "#0f172a",
        mutedText: "#475569",
        subtleText: "#64748b",
        headerBg: "rgba(255,255,255,0.82)",
        headerBorder: "rgba(148,163,184,0.24)",
        panelBg: "rgba(255,255,255,0.88)",
        panelAltBg: "rgba(248,250,252,0.98)",
        panelBorder: "rgba(148,163,184,0.22)",
        inputBg: "#ffffff",
        inputBorder: "rgba(148,163,184,0.35)",
        inputText: "#0f172a",
        badgeBg: "rgba(59,130,246,0.1)",
        badgeText: "#2563eb",
        badgeBorder: "rgba(59,130,246,0.18)",
        scrollbar: "rgba(100,116,139,0.3)",
        jiraText: "#1e293b",
        jiraLabel: "#64748b",
        jiraCardBg: "rgba(255,255,255,0.92)",
        jiraCardBorder: "rgba(148,163,184,0.2)",
        jiraCardShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
        jiraBlockquote: "#64748b",
        jiraCodeBg: "rgba(226,232,240,0.9)",
        jiraDivider: "rgba(148,163,184,0.28)",
      }
    : {
        appBg: "#020817",
        text: "#e2e8f0",
        mutedText: "#94a3b8",
        subtleText: "#475569",
        headerBg: "rgba(255,255,255,0.02)",
        headerBorder: "rgba(255,255,255,0.06)",
        panelBg: "rgba(255,255,255,0.03)",
        panelAltBg: "rgba(30,41,59,0.6)",
        panelBorder: "rgba(255,255,255,0.08)",
        inputBg: "rgba(255,255,255,0.04)",
        inputBorder: "rgba(255,255,255,0.1)",
        inputText: "#e2e8f0",
        badgeBg: "rgba(99,179,237,0.1)",
        badgeText: "#60a5fa",
        badgeBorder: "rgba(99,179,237,0.2)",
        scrollbar: "rgba(255,255,255,0.1)",
        jiraText: "#cbd5e1",
        jiraLabel: "#94a3b8",
        jiraCardBg: "rgba(255,255,255,0.03)",
        jiraCardBorder: "rgba(148,163,184,0.14)",
        jiraCardShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
        jiraBlockquote: "#94a3b8",
        jiraCodeBg: "rgba(148,163,184,0.16)",
        jiraDivider: "rgba(148,163,184,0.25)",
      };

  const styles = {
    app: {
      minHeight: "100vh",
      background: theme.appBg,
      color: theme.text,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      display: "flex", flexDirection: "column",
      transition: "background 0.2s ease, color 0.2s ease",
    },
    header: {
      borderBottom: `1px solid ${theme.headerBorder}`,
      padding: "12px 24px",
      display: "flex", alignItems: "center", gap: 12,
      background: theme.headerBg,
    },
    logo: {
      fontSize: 22, fontWeight: 800, letterSpacing: -1,
      background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      fontFamily: "'Courier New', monospace",
    },
    badge: {
      fontSize: 10, padding: "2px 8px", borderRadius: 20,
      background: theme.badgeBg, color: theme.badgeText,
      border: `1px solid ${theme.badgeBorder}`, fontWeight: 600,
      letterSpacing: 1, textTransform: "uppercase",
    },
  };

  return (
    <div className={`planning-poker-app ${isLightMode ? "light-mode" : "dark-mode"}`} style={styles.app}>
      <style>{`
        @keyframes flipIn { from { transform: rotateY(90deg) scale(0.8); opacity: 0; } to { transform: rotateY(0) scale(1); opacity: 1; } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${theme.scrollbar}; border-radius: 2px; }
        input, textarea { outline: none; }
        button { cursor: pointer; }
        .app-input { background: ${theme.inputBg} !important; border: 1px solid ${theme.inputBorder} !important; color: ${theme.inputText} !important; }
        .app-panel { background: ${theme.panelBg} !important; border: 1px solid ${theme.panelBorder} !important; }
        .app-panel-alt { background: ${theme.panelAltBg} !important; border: 1px solid ${theme.panelBorder} !important; }
        .app-subtle-text { color: ${theme.subtleText} !important; }
        .app-muted-text { color: ${theme.mutedText} !important; }
        .app-secondary-button { background: ${theme.panelBg} !important; border: 1px solid ${theme.inputBorder} !important; color: ${theme.mutedText} !important; border-radius: 8px; }
        .jira-rich-text { color: ${theme.jiraText}; line-height: 1.55; }
        .jira-rich-text p, .jira-rich-text h1, .jira-rich-text h2, .jira-rich-text h3, .jira-rich-text h4, .jira-rich-text h5, .jira-rich-text h6, .jira-rich-text blockquote, .jira-rich-text ul, .jira-rich-text ol { margin: 0 0 8px; }
        .jira-rich-text ul, .jira-rich-text ol { padding-left: 18px; }
        .jira-rich-text li { margin-bottom: 4px; }
        .jira-rich-text a { color: #2563eb; }
        .jira-rich-text blockquote { padding-left: 10px; border-left: 2px solid ${theme.jiraDivider}; color: ${theme.jiraBlockquote}; }
        .jira-rich-text code { padding: 1px 4px; border-radius: 4px; background: ${theme.jiraCodeBg}; color: ${theme.text}; }
        .jira-rich-text hr { border: 0; border-top: 1px solid ${theme.jiraDivider}; margin: 10px 0; }
        .jira-field-card { padding: 10px 12px; border-radius: 10px; background: ${theme.jiraCardBg}; border: 1px solid ${theme.jiraCardBorder}; box-shadow: ${theme.jiraCardShadow}; }
        .jira-field-label { font-size: 10px; color: ${theme.jiraLabel}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 6px; }
        .jira-field-value { font-size: 12px; color: ${theme.text}; }
        .jira-field-toggle { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; background: none; border: none; padding: 0; color: inherit; text-align: left; }
      `}</style>

      <div style={styles.header}>
        <span style={styles.logo}>♠ PlanningPoker</span>
        <span style={styles.badge}>Teams</span>
        <button
          onClick={() => setIsLightMode((current) => !current)}
          className="app-secondary-button"
          style={{ marginLeft: "auto", fontSize: 12, padding: "6px 12px", fontWeight: 700 }}
        >
          {isLightMode ? "☾ Dark" : "☀ Light"}
        </button>
        {view !== "lobby" && (
          <button onClick={() => setView("lobby")} className="app-secondary-button" style={{
            fontSize: 12, padding: "6px 12px", fontWeight: 700,
          }}>← Lobby</button>
        )}
      </div>

      {view === "lobby" && (
        <div style={{ padding: "32px 24px", maxWidth: 720, margin: "0 auto", width: "90%", animation: "slideUp 0.4s ease" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, letterSpacing: -1 }}>
            New Session
          </h1>
          <p className="app-subtle-text" style={{ fontSize: 14, marginBottom: 32 }}>
            Configure your planning poker session for the team.
          </p>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: `1px solid ${theme.headerBorder}` }}>
            {[["deck", "🃏 Deck"], ["stories", "📋 Stories"], ["participants", "👥 Participants"]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 600,
                background: "none", border: "none",
                borderBottom: tab === key ? "2px solid #60a5fa" : "2px solid transparent",
                color: tab === key ? "#60a5fa" : theme.subtleText,
                transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>

          {tab === "deck" && (
            <div style={{ animation: "slideUp 0.2s ease" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                {Object.entries(PRESET_DECKS).map(([key, { label }]) => (
                  <button key={key} onClick={() => switchDeck(key)} style={{
                    padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    background: deck === key ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                    border: deck === key ? "1px solid #6366f1" : "1px solid rgba(255,255,255,0.08)",
                    color: deck === key ? "#a5b4fc" : "#64748b",
                  }}>{label}</button>
                ))}
                <button onClick={() => setDeck("custom")} style={{
                  padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: deck === "custom" ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                  border: deck === "custom" ? "1px solid #6366f1" : "1px solid rgba(255,255,255,0.08)",
                  color: deck === "custom" ? "#a5b4fc" : "#64748b",
                }}>Custom</button>
              </div>

              {deck === "custom" && (
                <textarea
                  className="app-input"
                  placeholder="Enter comma-separated values: 1, 2, 3, 5, 8, ?, ☕"
                  value={customCards}
                  onChange={e => { setCustomCards(e.target.value); setActiveCards(e.target.value.split(",").map(v => v.trim()).filter(Boolean)); }}
                  style={{
                    width: "100%", minHeight: 60, padding: "10px 14px", marginBottom: 16,
                    borderRadius: 8, fontSize: 13, resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              )}

              <div style={{ marginBottom: 12 }}>
                <div className="app-subtle-text" style={{ fontSize: 12, marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
                  Current Deck Preview
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {activeCards.map((c, i) => (
                    <div key={i} style={{ position: "relative", display: "inline-flex" }}>
                      <PokerCard value={c} small />
                      <button
                        onClick={() => setActiveCards(cards => cards.filter((_, j) => j !== i))}
                        style={{
                          position: "absolute", top: -6, right: -6,
                          width: 16, height: 16, borderRadius: "50%",
                          background: "#475569", border: "1px solid #1e293b",
                          color: "#e2e8f0", fontSize: 10, lineHeight: 1,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          padding: 0, cursor: "pointer",
                        }}
                      >X</button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <input
                  className="app-input"
                  placeholder="Add a card value..."
                  value={addCardInput}
                  onChange={e => setAddCardInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddCard()}
                  style={{
                    flex: 1, padding: "8px 12px",
                    borderRadius: 8, fontSize: 13,
                  }}
                />
                <button onClick={handleAddCard} style={{
                  padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "rgba(99,102,241,0.2)", border: "1px solid #6366f1", color: "#a5b4fc",
                }}>+ Add</button>
              </div>
            </div>
          )}

          {tab === "stories" && (
            <div style={{ animation: "slideUp 0.2s ease" }}>
              <div className="app-panel" style={{
                padding: "12px", borderRadius: 10, marginBottom: 14,
              }}>
                <div className="app-muted-text" style={{ fontSize: 12, marginBottom: 8, fontWeight: 700, letterSpacing: 0.5 }}>
                  Load From Jira Filter
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="app-input"
                    placeholder="Filter ID (e.g. 12345) or exact filter name"
                    value={jiraFilterInput}
                    onChange={(e) => setJiraFilterInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadStoriesFromJiraFilter()}
                    style={{
                      flex: 1, padding: "8px 12px",
                      borderRadius: 8, fontSize: 13,
                    }}
                  />
                  <button
                    onClick={loadStoriesFromJiraFilter}
                    disabled={jiraFilterLoading || !jiraFilterInput.trim()}
                    style={{
                      padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: jiraFilterLoading ? "rgba(99,102,241,0.1)" : "rgba(99,102,241,0.2)",
                      border: "1px solid #6366f1", color: jiraFilterLoading ? "#64748b" : "#a5b4fc",
                    }}
                  >
                    {jiraFilterLoading ? "Loading..." : "Load"}
                  </button>
                </div>
                {jiraFilterError && <div style={{ marginTop: 8, fontSize: 12, color: "#fca5a5" }}>{jiraFilterError}</div>}
                {jiraFilterInfo && <div style={{ marginTop: 8, fontSize: 12, color: "#6ee7b7" }}>{jiraFilterInfo}</div>}
              </div>

              <div style={{
                border: `2px dashed ${theme.inputBorder}`, borderRadius: 12,
                padding: 24, textAlign: "center", marginBottom: 20, cursor: "pointer",
                background: theme.panelBg,
              }} onClick={() => fileRef.current.click()}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                <div className="app-muted-text" style={{ fontSize: 14, fontWeight: 600 }}>Drop a CSV file or click to browse</div>
                <div className="app-subtle-text" style={{ fontSize: 12, marginTop: 4 }}>One story per row. First column = story title.</div>
                <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSV} />
              </div>

              {csvStories.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600, marginBottom: 8 }}>
                    ✓ {csvStories.length} stories loaded from CSV
                  </div>
                  {csvStories.slice(0, 4).map((s, i) => (
                    <div key={i} style={{
                      padding: "6px 12px", marginBottom: 4, borderRadius: 6,
                      background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
                      fontSize: 13, color: "#6ee7b7",
                    }}>
                      {s}
                    </div>
                  ))}
                  {csvStories.length > 4 && <div style={{ fontSize: 12, color: "#475569" }}>+{csvStories.length - 4} more</div>}
                </div>
              )}

              <div className="app-subtle-text" style={{ fontSize: 12, marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Add Stories Manually</div>
              {stories.map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
                }}>
                  <div className="app-panel" style={{
                    flex: 1, padding: "6px 12px", borderRadius: 6,
                    fontSize: 13, color: theme.mutedText,
                  }}>{s}</div>
                  <button onClick={() => setStories(st => st.filter((_, j) => j !== i))} style={{
                    background: "none", border: "none", color: "#475569", fontSize: 16,
                  }}>×</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  className="app-input"
                  placeholder="Story title or ticket number..."
                  value={storyInput}
                  onChange={e => setStoryInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && storyInput.trim()) { setStories(s => [...s, storyInput.trim()]); setStoryInput(""); } }}
                  style={{
                    flex: 1, padding: "8px 12px",
                    borderRadius: 8, fontSize: 13,
                  }}
                />
                <button onClick={() => { if (storyInput.trim()) { setStories(s => [...s, storyInput.trim()]); setStoryInput(""); } }} style={{
                  padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "rgba(99,102,241,0.2)", border: "1px solid #6366f1", color: "#a5b4fc",
                }}>+ Add</button>
              </div>
            </div>
          )}

          {tab === "participants" && (
            <div style={{ animation: "slideUp 0.2s ease" }}>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>
                In Teams, participants join automatically when they open the tab in the channel.
              </div>
              {participants.map((p, i) => (
                <div key={i} className="app-panel" style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  marginBottom: 6, borderRadius: 8,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: `hsl(${i * 60}, 60%, 35%)`, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                    flexShrink: 0,
                  }}>{p[0]}</div>
                  <span style={{ fontSize: 13, color: theme.mutedText, flex: 1 }}>{p}</span>
                  {i === 0
                    ? <span style={{ fontSize: 10, color: "#60a5fa", fontWeight: 600 }}>YOU</span>
                    : <button onClick={() => setParticipants(ps => ps.filter((_, j) => j !== i))} style={{
                        background: "none", border: "none", color: "#475569", fontSize: 18,
                        lineHeight: 1, padding: "0 2px",
                      }}>×</button>
                  }
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input
                  placeholder="Add participant name..."
                  value={participantInput}
                  onChange={e => setParticipantInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && participantInput.trim() && !participants.includes(participantInput.trim())) {
                      setParticipants(ps => [...ps, participantInput.trim()]);
                      setParticipantInput("");
                    }
                  }}
                  style={{
                    flex: 1, padding: "8px 12px",
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, color: "#e2e8f0", fontSize: 13,
                  }}
                />
                <button onClick={() => {
                  if (participantInput.trim() && !participants.includes(participantInput.trim())) {
                    setParticipants(ps => [...ps, participantInput.trim()]);
                    setParticipantInput("");
                  }
                }} style={{
                  padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: "rgba(99,102,241,0.2)", border: "1px solid #6366f1", color: "#a5b4fc",
                }}>+ Add</button>
              </div>
            </div>
          )}

          <button onClick={startSession} style={{
            width: "100%", marginTop: 32, padding: "14px", borderRadius: 10,
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            border: "none", color: "#fff", fontSize: 15, fontWeight: 700,
            letterSpacing: 0.3, boxShadow: "0 4px 20px rgba(124,58,237,0.3)",
            transition: "all 0.2s",
          }}>
            ♠ Start Session {allStories.length > 0 ? `(${allStories.length} stories)` : ""}
          </button>
        </div>
      )}

      {view === "session" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px", maxWidth: 800, margin: "0 auto", width: "90%", animation: "slideUp 0.3s ease" }}>

          {/* Story header */}
          <div className="app-panel" style={{
            padding: "16px 20px", borderRadius: 12, marginBottom: 24,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: theme.subtleText, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
                Story {storyIndex + 1} {allStories.length > 0 ? `of ${allStories.length}` : ""}
              </div>
              {jiraIssue?.parentFeature?.key && (
                <div style={{
                  maxWidth: "45%",
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(96,165,250,0.12)",
                  border: "1px solid rgba(96,165,250,0.28)",
                  color: "#bfdbfe",
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: 1.35,
                  textAlign: "right",
                }}>
                  <span style={{ color: "#93c5fd", textTransform: "uppercase", letterSpacing: 0.5 }}>Parent Feature</span>
                  <div style={{ marginTop: 2 }}>
                    {`${jiraIssue.parentFeature.key}${jiraIssue.parentFeature.summary ? `: ${jiraIssue.parentFeature.summary}` : ""}`}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>
                {jiraIssue?.key ? `${jiraIssue.key}: ${jiraIssue.summary || currentStory}` : currentStory}
              </div>
              {jiraIssue?.issueType && (
                <span style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  ...activeIssueTypePillStyle,
                }}>
                  {jiraIssue.issueType}
                </span>
              )}
            </div>

            {(jiraLoading || jiraIssue || jiraError) && (
              <div className="app-panel-alt" style={{
                marginTop: 12,
                padding: "12px",
                borderRadius: 10,
              }}>
                <div className="app-muted-text" style={{ fontSize: 11, marginBottom: 8, fontWeight: 700, letterSpacing: 0.5 }}>
                  Jira Details
                </div>

                {jiraLoading && <div style={{ fontSize: 12, color: "#60a5fa" }}>Loading Jira issue...</div>}
                {jiraError && <div style={{ fontSize: 12, color: "#fca5a5" }}>{jiraError}</div>}

                {jiraIssue && (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className="jira-field-card">
                      <button className="jira-field-toggle" onClick={() => toggleJiraSection("description")} style={getJiraSectionHeaderStyle(jiraSectionsOpen.description)}>
                        <div className="jira-field-label" style={{ marginBottom: 0 }}>Description</div>
                        <span style={getJiraChevronStyle(jiraSectionsOpen.description)}>{jiraSectionsOpen.description ? "▾" : "▸"}</span>
                      </button>
                      {jiraSectionsOpen.description && (
                        <div className="jira-field-value" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
                          {jiraIssue.description || "(no description)"}
                        </div>
                      )}
                    </div>
                    <div className="jira-field-card">
                      <button className="jira-field-toggle" onClick={() => toggleJiraSection("acceptanceCriteria")} style={getJiraSectionHeaderStyle(jiraSectionsOpen.acceptanceCriteria)}>
                        <div className="jira-field-label" style={{ marginBottom: 0 }}>Acceptance Criteria</div>
                        <span style={getJiraChevronStyle(jiraSectionsOpen.acceptanceCriteria)}>{jiraSectionsOpen.acceptanceCriteria ? "▾" : "▸"}</span>
                      </button>
                      {jiraSectionsOpen.acceptanceCriteria && (
                        jiraIssue.acceptanceCriteriaHtml ? (
                          <div
                            className="jira-rich-text jira-field-value"
                            style={{ marginTop: 8 }}
                            dangerouslySetInnerHTML={{ __html: jiraIssue.acceptanceCriteriaHtml }}
                          />
                        ) : (
                          <div className="jira-field-value" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
                            {jiraIssue.acceptanceCriteria || "(none)"}
                          </div>
                        )
                      )}
                    </div>
                    <div className="jira-field-card">
                      <button className="jira-field-toggle" onClick={() => toggleJiraSection("linkedIssues")} style={getJiraSectionHeaderStyle(jiraSectionsOpen.linkedIssues)}>
                        <div className="jira-field-label" style={{ marginBottom: 0 }}>Linked Issues</div>
                        <span style={getJiraChevronStyle(jiraSectionsOpen.linkedIssues)}>{jiraSectionsOpen.linkedIssues ? "▾" : "▸"}</span>
                      </button>
                      {jiraSectionsOpen.linkedIssues && (
                        <div className="jira-field-value" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
                          {Array.isArray(jiraIssue.linkedIssues) && jiraIssue.linkedIssues.length
                            ? jiraIssue.linkedIssues
                                .map((item) => `${item.relationship}: ${item.key}${item.summary ? ` - ${item.summary}` : ""}`)
                                .join("\n")
                            : "(none)"}
                        </div>
                      )}
                    </div>
                    <div className="jira-field-card">
                      <button className="jira-field-toggle" onClick={() => toggleJiraSection("notes")} style={getJiraSectionHeaderStyle(jiraSectionsOpen.notes)}>
                        <div className="jira-field-label" style={{ marginBottom: 0 }}>Notes</div>
                        <span style={getJiraChevronStyle(jiraSectionsOpen.notes)}>{jiraSectionsOpen.notes ? "▾" : "▸"}</span>
                      </button>
                      {jiraSectionsOpen.notes && (
                        <div className="jira-field-value" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
                          {Array.isArray(jiraIssue.notes) && jiraIssue.notes.length
                            ? jiraIssue.notes.join("\n")
                            : "(no notes)"}
                        </div>
                      )}
                    </div>

                    <div className="jira-field-card">
                      <button className="jira-field-toggle" onClick={() => toggleJiraSection("images")} style={getJiraSectionHeaderStyle(jiraSectionsOpen.images)}>
                        <div className="jira-field-label" style={{ marginBottom: 0 }}>Images</div>
                        <span style={getJiraChevronStyle(jiraSectionsOpen.images)}>{jiraSectionsOpen.images ? "▾" : "▸"}</span>
                      </button>
                      {jiraSectionsOpen.images && (Array.isArray(jiraIssue.images) && jiraIssue.images.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                          {jiraIssue.images.map((img, imageIndex) => {
                            const attachmentSrc = getJiraAttachmentSrc(jiraIssue.key, img.id);
                            return (
                            <button
                              key={img.id || img.content}
                              onClick={() => setActiveImageIndex(imageIndex)}
                              style={{
                                display: "inline-flex",
                                background: "none",
                                border: "none",
                                padding: 0,
                                borderRadius: 6,
                              }}
                              title="Open gallery"
                            >
                              <img
                                src={attachmentSrc}
                                alt={img.filename || "Jira attachment"}
                                style={{
                                  width: 86,
                                  height: 64,
                                  objectFit: "cover",
                                  borderRadius: 6,
                                  border: "1px solid rgba(148,163,184,0.25)",
                                }}
                              />
                            </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="jira-field-value" style={{ marginTop: 8 }}>(none)</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                height: 4, flex: 1, borderRadius: 2,
                background: theme.headerBorder,
              }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  width: `${(voteCount / totalParticipants) * 100}%`,
                  background: allVoted ? "#10b981" : "#6366f1",
                  transition: "width 0.4s ease",
                }} />
              </div>
              <span style={{
                fontSize: 12, color: allVoted ? "#10b981" : "#6366f1", fontWeight: 600,
                animation: !allVoted ? "pulse 2s infinite" : "none",
              }}>
                {voteCount}/{totalParticipants} voted
              </span>
            </div>
          </div>

          {/* Voting table */}
          <div className="app-panel" style={{
            padding: "20px", borderRadius: 12, marginBottom: 24,
          }}>
            <div className="app-subtle-text" style={{ fontSize: 12, fontWeight: 600, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
              Table
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {participants.map((p) => (
                <VoteSlot
                  key={p}
                  name={p}
                  voted={!!votes[p]}
                  value={votes[p]}
                  revealed={revealed}
                  originalValue={originalVotes[p]}
                />
              ))}
            </div>

            {revealed && (
              <div style={{
                marginTop: 20, padding: "16px", borderRadius: 10,
                background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
                display: "flex", gap: 24, flexWrap: "wrap", animation: "slideUp 0.3s ease",
              }}>
                {avg && <div>
                  <div style={{ fontSize: 10, color: "#6ee7b7", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Average</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#10b981", fontFamily: "monospace" }}>{avg}</div>
                </div>}
                {min !== null && <div>
                  <div style={{ fontSize: 10, color: "#6ee7b7", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Min</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#34d399", fontFamily: "monospace" }}>{min}</div>
                </div>}
                {max !== null && <div>
                  <div style={{ fontSize: 10, color: "#6ee7b7", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Max</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#34d399", fontFamily: "monospace" }}>{max}</div>
                </div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 10, color: "#6ee7b7", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Estimate</div>
                  <input
                    value={finalEstimate}
                    onChange={e => setFinalEstimate(e.target.value)}
                    placeholder="—"
                    style={{
                      width: 80, padding: "4px 8px",
                      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(16,185,129,0.4)",
                      borderRadius: 6, color: "#fff", fontSize: 22, fontWeight: 800,
                      fontFamily: "monospace", textAlign: "center",
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Card hand */}
          <div style={{ marginBottom: 20 }}>
            <div className="app-subtle-text" style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              {myVote ? `Your vote: ${myVote}` : "Pick your estimate"}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {activeCards.map((c, i) => (
                <PokerCard
                  key={i}
                  value={c}
                  selected={myVote === c}
                  onClick={() => castVote(c)}
                  revealed={revealed}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={previousStory}
              disabled={storyIndex === 0}
              style={{
                padding: "12px 14px", borderRadius: 10,
                background: storyIndex > 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: storyIndex > 0 ? "#cbd5e1" : "#475569",
                fontSize: 13, fontWeight: 700,
              }}
            >
              ← Previous
            </button>
            {!revealed ? (
              <button onClick={reveal} disabled={voteCount === 0} style={{
                flex: 1, padding: "12px", borderRadius: 10,
                background: voteCount > 0 ? "linear-gradient(135deg, #059669, #10b981)" : "rgba(255,255,255,0.04)",
                border: "none", color: voteCount > 0 ? "#fff" : "#334155",
                fontSize: 14, fontWeight: 700, transition: "all 0.2s",
              }}>
                🔍 Reveal Votes
              </button>
            ) : (
              <button onClick={nextStory} style={{
                flex: 1, padding: "12px", borderRadius: 10,
                background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                border: "none", color: "#fff", fontSize: 14, fontWeight: 700,
              }}>
                → Next Story
              </button>
            )}
            <button onClick={endSession} style={{
              padding: "12px 18px", borderRadius: 10,
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
              color: "#f87171", fontSize: 14, fontWeight: 700,
            }}>
              ⏹ End
            </button>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div className="app-subtle-text" style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                Completed
              </div>
              {history.map((h, i) => (
                (() => {
                  const isCurrentStory = h.story === currentStory;
                  return (
                <div key={i} className="app-panel" style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", marginBottom: 6, borderRadius: 8,
                  background: isCurrentStory ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.02)",
                  border: isCurrentStory ? "1px solid rgba(99,102,241,0.45)" : "1px solid rgba(255,255,255,0.05)",
                }}>
                  <span style={{ fontSize: 13, color: isCurrentStory ? "#c7d2fe" : "#64748b" }}>
                    {h.story}
                    {isCurrentStory && (
                      <span style={{
                        marginLeft: 8, fontSize: 10, fontWeight: 700,
                        color: "#a5b4fc", textTransform: "uppercase", letterSpacing: 0.6,
                      }}>
                        Viewing
                      </span>
                    )}
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: isCurrentStory ? "#86efac" : "#10b981",
                    fontFamily: "monospace", minWidth: 30, textAlign: "right",
                  }}>{h.result}</span>
                </div>
                  );
                })()
              ))}
            </div>
          )}

          {jiraIssue && Array.isArray(jiraIssue.images) && jiraIssue.images.length > 0 && activeImageIndex !== null && (
            <div
              onClick={() => setActiveImageIndex(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: isLightMode ? "rgba(241,245,249,0.88)" : "rgba(2,8,23,0.88)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 50,
                padding: 20,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "min(980px, 100%)",
                  maxHeight: "90vh",
                  borderRadius: 12,
                  background: theme.panelAltBg,
                  border: `1px solid ${theme.panelBorder}`,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 12px",
                  borderBottom: `1px solid ${theme.panelBorder}`,
                }}>
                  <span style={{ fontSize: 12, color: theme.mutedText, fontWeight: 700 }}>
                    Image {activeImageIndex + 1} of {jiraIssue.images.length}
                  </span>
                  <button
                    onClick={() => {
                      const img = jiraIssue.images[activeImageIndex];
                      if (!img) return;
                      window.open(getJiraAttachmentSrc(jiraIssue.key, img.id), "_blank", "noopener,noreferrer");
                    }}
                    style={{
                      marginLeft: "auto",
                      padding: "6px 10px",
                      borderRadius: 8,
                      background: theme.panelBg,
                      border: `1px solid ${theme.inputBorder}`,
                      color: theme.text,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Open in New Tab
                  </button>
                  <button
                    onClick={() => setActiveImageIndex(null)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      background: "rgba(239,68,68,0.12)",
                      border: "1px solid rgba(239,68,68,0.35)",
                      color: "#fca5a5",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Close
                  </button>
                </div>

                <div style={{
                  position: "relative",
                  background: isLightMode ? "#ffffff" : "#020817",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 320,
                  maxHeight: "70vh",
                  padding: 12,
                }}>
                  <img
                    src={getJiraAttachmentSrc(jiraIssue.key, jiraIssue.images[activeImageIndex].id)}
                    alt={jiraIssue.images[activeImageIndex].filename || "Jira attachment"}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      borderRadius: 8,
                    }}
                  />

                  {jiraIssue.images.length > 1 && (
                    <>
                      <button
                        onClick={() => setActiveImageIndex((idx) => (idx - 1 + jiraIssue.images.length) % jiraIssue.images.length)}
                        style={{
                          position: "absolute", left: 10,
                          width: 34, height: 34, borderRadius: "50%",
                          background: isLightMode ? "rgba(255,255,255,0.94)" : "rgba(2,8,23,0.72)",
                          border: `1px solid ${theme.inputBorder}`,
                          color: theme.text, fontSize: 18, fontWeight: 700,
                        }}
                      >
                        ‹
                      </button>
                      <button
                        onClick={() => setActiveImageIndex((idx) => (idx + 1) % jiraIssue.images.length)}
                        style={{
                          position: "absolute", right: 10,
                          width: 34, height: 34, borderRadius: "50%",
                          background: isLightMode ? "rgba(255,255,255,0.94)" : "rgba(2,8,23,0.72)",
                          border: `1px solid ${theme.inputBorder}`,
                          color: theme.text, fontSize: 18, fontWeight: 700,
                        }}
                      >
                        ›
                      </button>
                    </>
                  )}
                </div>

                {jiraIssue.images.length > 1 && (
                  <div style={{
                    padding: 10,
                    borderTop: `1px solid ${theme.panelBorder}`,
                    display: "flex",
                    gap: 8,
                    overflowX: "auto",
                    background: theme.panelBg,
                  }}>
                    {jiraIssue.images.map((img, idx) => (
                      <button
                        key={`preview-${img.id || idx}`}
                        onClick={() => setActiveImageIndex(idx)}
                        style={{
                          padding: 0,
                          borderRadius: 6,
                          background: "none",
                          border: idx === activeImageIndex ? "2px solid #60a5fa" : "1px solid rgba(148,163,184,0.3)",
                          opacity: idx === activeImageIndex ? 1 : 0.75,
                          flexShrink: 0,
                        }}
                      >
                        <img
                          src={getJiraAttachmentSrc(jiraIssue.key, img.id)}
                          alt={img.filename || "Jira attachment"}
                          style={{ width: 72, height: 52, objectFit: "cover", borderRadius: 5, display: "block" }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {view === "summary" && (() => {
        const totalStories = history.length;
        const numericResults = history.map(h => parseFloat(h.result)).filter(v => !isNaN(v));
        const totalPoints = numericResults.reduce((a, b) => a + b, 0);
        const avgPoints = numericResults.length ? (totalPoints / numericResults.length).toFixed(1) : null;

        return (
          <div style={{ padding: "32px 24px", maxWidth: 720, margin: "0 auto", width: "90%", animation: "slideUp 0.4s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1, margin: 0 }}>Session Summary</h1>
            </div>
            <p style={{ color: "#475569", fontSize: 14, marginBottom: 28 }}>
              {totalStories} {totalStories === 1 ? "story" : "stories"} estimated
              {avgPoints ? ` · avg ${avgPoints} pts` : ""}
              {numericResults.length ? ` · ${totalPoints} total pts` : ""}
            </p>

            {/* Stats row */}
            {numericResults.length > 0 && (
              <div style={{
                display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28,
              }}>
                {[
                  { label: "Stories", value: totalStories },
                  { label: "Total Pts", value: totalPoints },
                  { label: "Avg Pts", value: avgPoints },
                  { label: "Min", value: Math.min(...numericResults) },
                  { label: "Max", value: Math.max(...numericResults) },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    flex: "1 1 90px", padding: "12px 16px", borderRadius: 10,
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 10, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "#e2e8f0", fontFamily: "monospace" }}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Story breakdown */}
            {totalStories === 0 ? (
              <div style={{
                padding: "32px", borderRadius: 12, textAlign: "center",
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                color: "#475569", fontSize: 14,
              }}>
                No stories were completed in this session.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
                {history.map((h, i) => {
                  const voteEntries = Object.entries(h.votes);
                  return (
                    <div key={i} style={{
                      borderRadius: 10, overflow: "hidden",
                      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
                    }}>
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "10px 14px",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: "#475569",
                            minWidth: 22, textAlign: "right", fontFamily: "monospace",
                          }}>#{i + 1}</span>
                          <span style={{ fontSize: 14, color: "#cbd5e1", fontWeight: 500 }}>{h.story}</span>
                        </div>
                        <span style={{
                          fontSize: 20, fontWeight: 800, color: "#10b981",
                          fontFamily: "monospace", minWidth: 40, textAlign: "right",
                        }}>{h.result}</span>
                      </div>
                      {voteEntries.length > 0 && (
                        <div style={{
                          display: "flex", gap: 6, flexWrap: "wrap",
                          padding: "6px 14px 10px",
                          borderTop: "1px solid rgba(255,255,255,0.05)",
                        }}>
                          {voteEntries.map(([name, val]) => (
                            <span key={name} style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 20,
                              background: "rgba(255,255,255,0.05)", color: "#64748b",
                            }}>
                              {name}: <strong style={{ color: "#94a3b8" }}>{val}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setView("session"); }} style={{
                padding: "12px 20px", borderRadius: 10,
                background: "rgba(99,102,241,0.15)", border: "1px solid #6366f1",
                color: "#a5b4fc", fontSize: 14, fontWeight: 700,
              }}>← Back to Session</button>
              <button onClick={() => {
                setHistory([]);
                setView("lobby");
              }} style={{
                flex: 1, padding: "12px", borderRadius: 10,
                background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                border: "none", color: "#fff", fontSize: 14, fontWeight: 700,
              }}>🏠 New Session</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
