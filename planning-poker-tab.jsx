import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const FIBONACCI_DECK = ["1", "2", "3", "5", "8", "13", "21", "34", "?", "☕"];

const DEMO_USERS = [
  { id: "u1", name: "You", isMe: true },
  { id: "u2", name: "Alex" },
  { id: "u3", name: "Jordan" },
  { id: "u4", name: "Sam" },
  { id: "u5", name: "Riley" },
];

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
function avg(votes) {
  const nums = Object.values(votes).map(parseFloat).filter(n => !isNaN(n));
  return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : null;
}
function consensus(votes, deck) {
  const nums = Object.values(votes).map(parseFloat).filter(n => !isNaN(n));
  if (!nums.length) return "?";
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const deckNums = deck.map(parseFloat).filter(n => !isNaN(n));
  return String(deckNums.reduce((a, b) => (Math.abs(b - mean) < Math.abs(a - mean) ? b : a), deckNums[0]));
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function PokerCard({ value, selected, onClick, size = "md", faceDown = false }) {
  const sizes = { sm: [44, 62, 16], md: [60, 84, 22], lg: [72, 100, 26] };
  const [w, h, fs] = sizes[size];
  const isIcon = value === "☕" || value === "?";

  return (
    <div onClick={onClick} style={{
      width: w, height: h, borderRadius: 10, cursor: onClick ? "pointer" : "default",
      flexShrink: 0, position: "relative", transition: "all 0.18s cubic-bezier(.34,1.56,.64,1)",
      transform: selected ? "translateY(-10px) scale(1.08)" : "none",
      boxShadow: selected
        ? "0 12px 32px rgba(139,92,246,0.45), 0 0 0 2px #8b5cf6"
        : faceDown ? "0 4px 14px rgba(0,0,0,0.5)" : "0 4px 14px rgba(0,0,0,0.35)",
    }}>
      {faceDown ? (
        <div style={{
          width: "100%", height: "100%", borderRadius: 10,
          background: "linear-gradient(145deg, #1e1b4b 0%, #312e81 100%)",
          border: "1.5px solid rgba(167,139,250,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            width: "78%", height: "78%", borderRadius: 6,
            border: "1.5px solid rgba(167,139,250,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: fs * 0.9, opacity: 0.35 }}>♠</span>
          </div>
        </div>
      ) : (
        <div style={{
          width: "100%", height: "100%", borderRadius: 10,
          background: selected
            ? "linear-gradient(145deg, #7c3aed, #6d28d9)"
            : "linear-gradient(145deg, #1e293b, #0f172a)",
          border: selected ? "1.5px solid #a78bfa" : "1.5px solid rgba(255,255,255,0.09)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            fontSize: isIcon ? fs * 1.1 : fs,
            fontWeight: 800, lineHeight: 1,
            color: selected ? "#fff" : "#94a3b8",
            fontFamily: "'Courier New', monospace",
          }}>{value}</span>
          <span style={{
            position: "absolute", top: 4, left: 5,
            fontSize: 8, color: selected ? "rgba(255,255,255,0.45)" : "rgba(148,163,184,0.3)",
            fontFamily: "monospace",
          }}>{value}</span>
        </div>
      )}
    </div>
  );
}

function VoteSlot({ user, voted, value, revealed }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 72 }}>
      <div style={{ position: "relative" }}>
        {voted ? (
          revealed ? (
            <div style={{
              width: 52, height: 72, borderRadius: 10,
              background: "linear-gradient(145deg, #065f46, #047857)",
              border: "1.5px solid #34d399",
              boxShadow: "0 0 18px rgba(52,211,153,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "cardReveal 0.4s cubic-bezier(.34,1.56,.64,1)",
            }}>
              <span style={{
                fontSize: (value?.length ?? 0) > 2 ? 14 : 22,
                fontWeight: 800, color: "#fff", fontFamily: "monospace",
              }}>{value}</span>
            </div>
          ) : (
            <div style={{ width: 52, height: 72 }}>
              <PokerCard value="?" faceDown size="sm" />
            </div>
          )
        ) : (
          <div style={{
            width: 52, height: 72, borderRadius: 10,
            border: "2px dashed rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 20, opacity: 0.15 }}>·</span>
          </div>
        )}
        {voted && !revealed && (
          <div style={{
            position: "absolute", top: -4, right: -4, width: 13, height: 13,
            borderRadius: "50%", background: "#10b981", border: "2px solid #022c22",
          }} />
        )}
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%", margin: "0 auto 3px",
          background: `hsl(${user.id.charCodeAt(1) * 40}, 55%, 32%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: "#fff",
          border: user.isMe ? "2px solid #8b5cf6" : "2px solid transparent",
        }}>{user.name[0]}</div>
        <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>
          {user.isMe ? "You" : user.name}
        </div>
      </div>
    </div>
  );
}

function ResultBar({ label, value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{label}</span>
        <span style={{ fontSize: 11, color: color, fontWeight: 700, fontFamily: "monospace" }}>{value}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
        <div style={{
          height: "100%", borderRadius: 2, background: color,
          width: `${pct}%`, transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PlanningPokerTab() {
  const [phase, setPhase] = useState("lobby"); // lobby | voting | revealed
  const [deck, setDeck] = useState(FIBONACCI_DECK);
  const [addCardVal, setAddCardVal] = useState("");
  const [stories, setStories] = useState([]);
  const [csvInput, setCsvInput] = useState("");
  const [storyInput, setStoryInput] = useState("");
  const [storyIdx, setStoryIdx] = useState(0);
  const [currentStory, setCurrentStory] = useState("");
  const [votes, setVotes] = useState({});
  const [myVote, setMyVote] = useState(null);
  const [history, setHistory] = useState([]);
  const [lobbyTab, setLobbyTab] = useState("stories");
  const [showCSV, setShowCSV] = useState(false);
  const fileRef = useRef();
  const simTimers = useRef([]);

  const participants = DEMO_USERS;
  const voteCount = Object.keys(votes).length;
  const allVoted = voteCount >= participants.length;
  const voteNums = Object.values(votes).map(parseFloat).filter(n => !isNaN(n));
  const voteAvg = avg(votes);
  const voteMin = voteNums.length ? Math.min(...voteNums) : null;
  const voteMax = voteNums.length ? Math.max(...voteNums) : null;
  const voteConsensus = consensus(votes, deck);

  const clearTimers = () => { simTimers.current.forEach(clearTimeout); simTimers.current = []; };

  const simulateOthers = useCallback((currentDeck) => {
    clearTimers();
    const others = DEMO_USERS.filter(u => !u.isMe);
    const numCards = currentDeck.filter(c => !isNaN(parseFloat(c)));
    others.forEach((user, i) => {
      const t = setTimeout(() => {
        const pick = numCards[Math.floor(Math.random() * numCards.length)];
        setVotes(v => ({ ...v, [user.id]: pick }));
      }, 900 + i * 600 + Math.random() * 400);
      simTimers.current.push(t);
    });
  }, []);

  const startSession = () => {
    const storyList = stories.length ? stories : ["Story 1", "Story 2", "Story 3"];
    const story = storyList[0];
    setCurrentStory(story);
    setStoryIdx(0);
    setVotes({});
    setMyVote(null);
    setPhase("voting");
    simulateOthers(deck);
  };

  const castVote = (val) => {
    if (phase !== "voting") return;
    setMyVote(val);
    setVotes(v => ({ ...v, u1: val }));
  };

  const revealVotes = () => setPhase("revealed");

  const nextStory = () => {
    if (phase === "revealed") {
      setHistory(h => [...h, { story: currentStory, votes: { ...votes }, consensus: voteConsensus, avg: voteAvg }]);
    }
    const storyList = stories.length ? stories : ["Story 1", "Story 2", "Story 3", "Story 4"];
    const nextIdx = storyIdx + 1;
    const nextStory = storyList[nextIdx] ?? `Story ${nextIdx + 1}`;
    setStoryIdx(nextIdx);
    setCurrentStory(nextStory);
    setVotes({});
    setMyVote(null);
    setPhase("voting");
    simulateOthers(deck);
  };

  const addCard = () => {
    const v = addCardVal.trim();
    if (v && !deck.includes(v)) setDeck(d => [...d.slice(0, -2), v, ...d.slice(-2)]);
    setAddCardVal("");
  };

  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = ev.target.result
        .split("\n").map(l => l.trim().split(",")[0].replace(/^["']|["']$/g, "").trim())
        .filter(Boolean);
      setStories(parsed);
      setShowCSV(false);
    };
    reader.readAsText(file);
  };

  useEffect(() => () => clearTimers(), []);

  // ── Styles ──
  const S = {
    app: {
      minHeight: "100vh", background: "#020817",
      color: "#e2e8f0", fontFamily: "'Segoe UI', system-ui, sans-serif",
      display: "flex", flexDirection: "column",
    },
    topBar: {
      height: 48, borderBottom: "1px solid rgba(255,255,255,0.06)",
      display: "flex", alignItems: "center", padding: "0 20px", gap: 10,
      background: "rgba(255,255,255,0.015)", flexShrink: 0,
    },
    logo: {
      fontSize: 16, fontWeight: 800, letterSpacing: -0.5,
      background: "linear-gradient(135deg, #818cf8, #c084fc)",
      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      fontFamily: "'Courier New', monospace",
    },
    tag: {
      fontSize: 10, padding: "2px 7px", borderRadius: 20,
      background: "rgba(129,140,248,0.12)", color: "#818cf8",
      border: "1px solid rgba(129,140,248,0.2)", fontWeight: 600, letterSpacing: 0.8,
    },
    body: { flex: 1, padding: "28px 24px", maxWidth: 800, margin: "0 auto", width: "100%", boxSizing: "border-box" },
    card: {
      borderRadius: 12, padding: "18px 20px", marginBottom: 18,
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
    },
    sectionLabel: {
      fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase",
      color: "#475569", marginBottom: 12,
    },
    input: {
      padding: "8px 12px", borderRadius: 8, fontSize: 13,
      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
      color: "#e2e8f0",
    },
    btn: (variant = "ghost") => ({
      padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
      border: "none", cursor: "pointer",
      ...(variant === "primary" ? {
        background: "linear-gradient(135deg, #6d28d9, #7c3aed)",
        color: "#fff", boxShadow: "0 4px 16px rgba(124,58,237,0.3)",
      } : variant === "green" ? {
        background: "linear-gradient(135deg, #065f46, #059669)",
        color: "#fff", boxShadow: "0 4px 16px rgba(5,150,105,0.3)",
      } : {
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.09)",
        color: "#64748b",
      }),
    }),
  };

  return (
    <div style={S.app}>
      <style>{`
        @keyframes cardReveal { from { transform: rotateY(90deg) scale(0.85); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes breathe { 0%,100%{opacity:1} 50%{opacity:.45} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>

      {/* Top bar */}
      <div style={S.topBar}>
        <span style={S.logo}>♠ PlanningPoker</span>
        <span style={S.tag}>TEAMS TAB</span>
        {phase !== "lobby" && (
          <>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: "#475569" }}>
              Story {storyIdx + 1}{stories.length ? ` / ${stories.length}` : ""}
            </span>
            <button onClick={() => { clearTimers(); setPhase("lobby"); }} style={{ ...S.btn(), padding: "4px 12px", fontSize: 12 }}>
              ← Lobby
            </button>
          </>
        )}
      </div>

      {/* ── LOBBY ────────────────────────────────────────────────── */}
      {phase === "lobby" && (
        <div style={{ ...S.body, animation: "fadeUp .35s ease" }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.8, margin: 0 }}>New Session</h1>
            <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>Configure then start — everyone in the channel joins automatically.</p>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: 22, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            {[["stories", "📋 Stories"], ["deck", "🃏 Deck"]].map(([k, label]) => (
              <button key={k} onClick={() => setLobbyTab(k)} style={{
                padding: "8px 18px", fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer",
                borderBottom: lobbyTab === k ? "2px solid #818cf8" : "2px solid transparent",
                color: lobbyTab === k ? "#818cf8" : "#475569", transition: "all .15s",
              }}>{label}</button>
            ))}
          </div>

          {lobbyTab === "stories" && (
            <div style={{ animation: "fadeUp .2s ease" }}>
              {/* CSV upload */}
              <div
                onClick={() => fileRef.current.click()}
                style={{
                  border: "2px dashed rgba(255,255,255,0.09)", borderRadius: 12,
                  padding: "22px 20px", textAlign: "center", cursor: "pointer", marginBottom: 18,
                  background: "rgba(255,255,255,0.015)", transition: "border-color .15s",
                }}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>📂</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#94a3b8" }}>Upload CSV of stories</div>
                <div style={{ fontSize: 12, color: "#334155", marginTop: 3 }}>One story per row · First column = title</div>
                <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSV} />
              </div>

              {stories.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600, marginBottom: 8 }}>
                    ✓ {stories.length} stories loaded
                    <button onClick={() => setStories([])} style={{ marginLeft: 10, ...S.btn(), padding: "2px 8px", fontSize: 11 }}>Clear</button>
                  </div>
                  {stories.slice(0, 5).map((s, i) => (
                    <div key={i} style={{
                      padding: "5px 11px", marginBottom: 4, borderRadius: 6, fontSize: 12, color: "#6ee7b7",
                      background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.15)",
                    }}>{s}</div>
                  ))}
                  {stories.length > 5 && <div style={{ fontSize: 11, color: "#334155" }}>+ {stories.length - 5} more</div>}
                </div>
              )}

              <div style={S.sectionLabel}>Or add manually</div>
              {stories.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <div style={{ flex: 1, padding: "6px 11px", borderRadius: 6, fontSize: 12, color: "#64748b", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>{s}</div>
                  <button onClick={() => setStories(st => st.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#334155", fontSize: 16, cursor: "pointer" }}>×</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  placeholder="e.g. PROJ-101 User login flow"
                  value={storyInput}
                  onChange={e => setStoryInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && storyInput.trim()) { setStories(s => [...s, storyInput.trim()]); setStoryInput(""); } }}
                  style={{ ...S.input, flex: 1 }}
                />
                <button onClick={() => { if (storyInput.trim()) { setStories(s => [...s, storyInput.trim()]); setStoryInput(""); } }} style={S.btn("ghost")}>+ Add</button>
              </div>
            </div>
          )}

          {lobbyTab === "deck" && (
            <div style={{ animation: "fadeUp .2s ease" }}>
              <div style={S.sectionLabel}>Active Deck</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                {deck.map((c, i) => <PokerCard key={i} value={c} size="sm" />)}
              </div>
              <div style={S.sectionLabel}>Add a card</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  placeholder="Value to add (e.g. 40, 100, ∞)"
                  value={addCardVal}
                  onChange={e => setAddCardVal(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addCard()}
                  style={{ ...S.input, flex: 1 }}
                />
                <button onClick={addCard} style={S.btn("ghost")}>+ Add</button>
              </div>
              <div style={{ marginTop: 14, fontSize: 12, color: "#334155" }}>
                You can also add cards on-the-fly during a live session.
              </div>
            </div>
          )}

          <button onClick={startSession} style={{
            ...S.btn("primary"), width: "100%", marginTop: 28,
            padding: "14px", fontSize: 15, borderRadius: 10,
          }}>
            ♠ Start Session {stories.length > 0 ? `· ${stories.length} stories` : ""}
          </button>
        </div>
      )}

      {/* ── VOTING / REVEALED ────────────────────────────────────── */}
      {(phase === "voting" || phase === "revealed") && (
        <div style={{ ...S.body, animation: "fadeUp .3s ease" }}>

          {/* Story header */}
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={S.sectionLabel}>Estimating</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{currentStory}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)",
              }}>
                <div style={{
                  height: "100%", borderRadius: 3, transition: "width .4s ease",
                  width: `${(voteCount / participants.length) * 100}%`,
                  background: allVoted ? "#10b981" : "#6d28d9",
                }} />
              </div>
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: allVoted ? "#10b981" : "#818cf8",
                animation: !allVoted && phase === "voting" ? "breathe 2s infinite" : "none",
              }}>
                {voteCount}/{participants.length} voted
              </span>
            </div>
          </div>

          {/* Voting table */}
          <div style={{ ...S.card }}>
            <div style={S.sectionLabel}>Table</div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {participants.map(u => (
                <VoteSlot key={u.id} user={u} voted={!!votes[u.id]} value={votes[u.id]} revealed={phase === "revealed"} />
              ))}
            </div>

            {/* Results */}
            {phase === "revealed" && (
              <div style={{
                marginTop: 20, padding: "16px", borderRadius: 10,
                background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.18)",
                animation: "fadeUp .35s ease",
              }}>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 14 }}>
                  {[["Consensus", voteConsensus, "#fff"], ["Average", voteAvg, "#6ee7b7"], ["Min", voteMin, "#34d399"], ["Max", voteMax, "#34d399"]].map(([label, val, color]) => val != null && (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: "#6ee7b7", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "monospace", lineHeight: 1 }}>{val}</div>
                    </div>
                  ))}
                </div>
                {voteMax !== null && voteMin !== null && (
                  <div>
                    <ResultBar label="Spread" value={voteMax - voteMin} max={34} color="#6ee7b7" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card hand */}
          <div style={{ ...S.card }}>
            <div style={S.sectionLabel}>
              {phase === "voting" ? (myVote ? `Your vote: ${myVote} — click to change` : "Pick your estimate") : `You voted: ${myVote ?? "—"}`}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {deck.map((c, i) => (
                <PokerCard
                  key={i} value={c} size="md"
                  selected={myVote === c}
                  onClick={phase === "voting" ? () => castVote(c) : undefined}
                />
              ))}
            </div>

            {/* Add card on the fly */}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input
                placeholder="Add card on the fly…"
                value={addCardVal}
                onChange={e => setAddCardVal(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCard()}
                style={{ ...S.input, flex: 1, fontSize: 12, padding: "6px 11px" }}
              />
              <button onClick={addCard} style={{ ...S.btn(), padding: "6px 12px", fontSize: 12 }}>+ Card</button>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            {phase === "voting" ? (
              <button onClick={revealVotes} disabled={voteCount === 0} style={{
                ...S.btn(voteCount > 0 ? "green" : "ghost"), flex: 1, padding: "12px", fontSize: 14,
                opacity: voteCount === 0 ? 0.4 : 1,
              }}>
                🔍 Reveal Votes
              </button>
            ) : (
              <button onClick={nextStory} style={{ ...S.btn("primary"), flex: 1, padding: "12px", fontSize: 14 }}>
                → Next Story
              </button>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div style={S.sectionLabel}>Completed</div>
              {history.map((h, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 12px", marginBottom: 5, borderRadius: 8,
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <span style={{ fontSize: 13, color: "#475569" }}>{h.story}</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#10b981", fontSize: 14 }}>{h.consensus}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
