import { useState, useRef, useCallback } from "react";

const PRESET_DECKS = {
  fibonacci: { label: "Fibonacci", cards: ["1", "3", "5", "8", "13", "?", "☕"] },
  tshirt: { label: "T-Shirt", cards: ["XS", "S", "M", "L", "XL", "XXL", "?"] },
  standard: { label: "Standard", cards: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "?"] },
  hours: { label: "Hours", cards: ["0.5", "1", "2", "4", "8", "16", "24", "40", "?"] },
};

const DEMO_USERS = ["Alex", "Jordan", "Sam", "Riley", "Morgan"];

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
  const w = small ? 44 : 64;
  const h = small ? 60 : 88;
  const isSpecial = value === "?" || value === "☕";
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

function VoteSlot({ name, voted, value, revealed }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 70,
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
              <span style={{
                fontSize: value?.length > 2 ? 14 : 22, fontWeight: 800,
                color: "#fff", fontFamily: "monospace",
              }}>{value}</span>
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
  const [myVote, setMyVote] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [participants, setParticipants] = useState(DEMO_USERS);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("deck"); // deck | stories | participants
  const fileRef = useRef();

  const allStories = [...csvStories, ...stories];

  const startSession = () => {
    const story = allStories[0] || storyInput || "Story #1";
    setCurrentStory(story);
    setVotes({});
    setMyVote(null);
    setRevealed(false);
    setStoryIndex(0);
    setView("session");
    // Simulate other users voting after a delay
    simulateVotes();
  };

  const simulateVotes = useCallback(() => {
    const others = DEMO_USERS.slice(1);
    const cards = activeCards.filter(c => c !== "?" && c !== "☕");
    others.forEach((user, i) => {
      setTimeout(() => {
        setVotes(v => ({ ...v, [user]: cards[Math.floor(Math.random() * cards.length)] }));
      }, 1200 + i * 800);
    });
  }, [activeCards]);

  const castVote = (val) => {
    setMyVote(val);
    setVotes(v => ({ ...v, [DEMO_USERS[0]]: val }));
  };

  const reveal = () => setRevealed(true);

  const nextStory = () => {
    const next = storyIndex + 1;
    const story = allStories[next] || `Story #${next + 1}`;
    if (revealed && myVote) {
      setHistory(h => [...h, { story: currentStory, votes: { ...votes }, result: getConsensus() }]);
    }
    setStoryIndex(next);
    setCurrentStory(story);
    setVotes({});
    setMyVote(null);
    setRevealed(false);
    simulateVotes();
  };

  const getConsensus = () => {
    const vals = Object.values(votes).filter(v => !isNaN(parseFloat(v)));
    if (!vals.length) return "?";
    const avg = vals.reduce((a, b) => a + parseFloat(b), 0) / vals.length;
    // Find nearest card
    const nums = activeCards.filter(c => !isNaN(parseFloat(c))).map(parseFloat);
    const nearest = nums.reduce((a, b) => Math.abs(b - avg) < Math.abs(a - avg) ? b : a, nums[0]);
    return String(nearest ?? Math.round(avg));
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

  const styles = {
    app: {
      minHeight: "100vh",
      background: "#020817",
      color: "#e2e8f0",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      display: "flex", flexDirection: "column",
    },
    header: {
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      padding: "12px 24px",
      display: "flex", alignItems: "center", gap: 12,
      background: "rgba(255,255,255,0.02)",
    },
    logo: {
      fontSize: 22, fontWeight: 800, letterSpacing: -1,
      background: "linear-gradient(135deg, #60a5fa, #a78bfa)",
      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      fontFamily: "'Courier New', monospace",
    },
    badge: {
      fontSize: 10, padding: "2px 8px", borderRadius: 20,
      background: "rgba(99,179,237,0.1)", color: "#60a5fa",
      border: "1px solid rgba(99,179,237,0.2)", fontWeight: 600,
      letterSpacing: 1, textTransform: "uppercase",
    },
  };

  return (
    <div style={styles.app}>
      <style>{`
        @keyframes flipIn { from { transform: rotateY(90deg) scale(0.8); opacity: 0; } to { transform: rotateY(0) scale(1); opacity: 1; } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        input, textarea { outline: none; }
        button { cursor: pointer; }
      `}</style>

      <div style={styles.header}>
        <span style={styles.logo}>♠ PlanningPoker</span>
        <span style={styles.badge}>Teams</span>
        {view !== "lobby" && (
          <button onClick={() => setView("lobby")} style={{
            marginLeft: "auto", fontSize: 12, padding: "4px 12px",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#94a3b8", borderRadius: 6,
          }}>← Lobby</button>
        )}
      </div>

      {view === "lobby" && (
        <div style={{ padding: "32px 24px", maxWidth: 720, margin: "0 auto", width: "100%", animation: "slideUp 0.4s ease" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, letterSpacing: -1 }}>
            New Session
          </h1>
          <p style={{ color: "#475569", fontSize: 14, marginBottom: 32 }}>
            Configure your planning poker session for the team.
          </p>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {[["deck", "🃏 Deck"], ["stories", "📋 Stories"], ["participants", "👥 Participants"]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 600,
                background: "none", border: "none",
                borderBottom: tab === key ? "2px solid #60a5fa" : "2px solid transparent",
                color: tab === key ? "#60a5fa" : "#475569",
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
                  placeholder="Enter comma-separated values: 1, 2, 3, 5, 8, ?, ☕"
                  value={customCards}
                  onChange={e => { setCustomCards(e.target.value); setActiveCards(e.target.value.split(",").map(v => v.trim()).filter(Boolean)); }}
                  style={{
                    width: "100%", minHeight: 60, padding: "10px 14px", marginBottom: 16,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, color: "#e2e8f0", fontSize: 13, resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              )}

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
                  Current Deck Preview
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {activeCards.map((c, i) => <PokerCard key={i} value={c} small />)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <input
                  placeholder="Add a card value..."
                  value={addCardInput}
                  onChange={e => setAddCardInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddCard()}
                  style={{
                    flex: 1, padding: "8px 12px",
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, color: "#e2e8f0", fontSize: 13,
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
              <div style={{
                border: "2px dashed rgba(255,255,255,0.1)", borderRadius: 12,
                padding: 24, textAlign: "center", marginBottom: 20, cursor: "pointer",
                background: "rgba(255,255,255,0.02)",
              }} onClick={() => fileRef.current.click()}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8" }}>Drop a CSV file or click to browse</div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>One story per row. First column = story title.</div>
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

              <div style={{ fontSize: 12, color: "#475569", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Add Stories Manually</div>
              {stories.map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
                }}>
                  <div style={{
                    flex: 1, padding: "6px 12px", borderRadius: 6,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    fontSize: 13, color: "#94a3b8",
                  }}>{s}</div>
                  <button onClick={() => setStories(st => st.filter((_, j) => j !== i))} style={{
                    background: "none", border: "none", color: "#475569", fontSize: 16,
                  }}>×</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  placeholder="Story title or ticket number..."
                  value={storyInput}
                  onChange={e => setStoryInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && storyInput.trim()) { setStories(s => [...s, storyInput.trim()]); setStoryInput(""); } }}
                  style={{
                    flex: 1, padding: "8px 12px",
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8, color: "#e2e8f0", fontSize: 13,
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
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  marginBottom: 6, borderRadius: 8,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: `hsl(${i * 60}, 60%, 35%)`, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                  }}>{p[0]}</div>
                  <span style={{ fontSize: 13, color: "#94a3b8" }}>{p}</span>
                  {i === 0 && <span style={{ marginLeft: "auto", fontSize: 10, color: "#60a5fa", fontWeight: 600 }}>YOU</span>}
                </div>
              ))}
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px", maxWidth: 800, margin: "0 auto", width: "100%", animation: "slideUp 0.3s ease" }}>

          {/* Story header */}
          <div style={{
            padding: "16px 20px", borderRadius: 12, marginBottom: 24,
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
              Story {storyIndex + 1} {allStories.length > 0 ? `of ${allStories.length}` : ""}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{currentStory}</div>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                height: 4, flex: 1, borderRadius: 2,
                background: "rgba(255,255,255,0.06)",
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
          <div style={{
            padding: "20px", borderRadius: 12, marginBottom: 24,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
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
                <div>
                  <div style={{ fontSize: 10, color: "#6ee7b7", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Consensus</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", fontFamily: "monospace" }}>{getConsensus()}</div>
                </div>
              </div>
            )}
          </div>

          {/* Card hand */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              {myVote ? `Your vote: ${myVote}` : "Pick your estimate"}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {activeCards.map((c, i) => (
                <PokerCard
                  key={i}
                  value={c}
                  selected={myVote === c}
                  onClick={() => !revealed && castVote(c)}
                  revealed={revealed}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
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
          </div>

          {/* History */}
          {history.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                Completed
              </div>
              {history.map((h, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", marginBottom: 6, borderRadius: 8,
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <span style={{ fontSize: 13, color: "#64748b" }}>{h.story}</span>
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: "#10b981",
                    fontFamily: "monospace", minWidth: 30, textAlign: "right",
                  }}>{h.result}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
