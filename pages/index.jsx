// pages/index.jsx — Token Health Score Dashboard (Production)
// Steps 3–7 applied: real API fetch, secure alerts, auto-fire, watchlist

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTokens } from "../hooks/useTokens";
import { getRisk } from "../utils/score";

const ALERT_MIN_SCORE  = 80;
const ALERT_MIN_VOLUME = 100_000;

// ─── FORMATTING ─────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + Number(n).toFixed(2);
};
const fmtP = (n) => {
  if (!n || isNaN(n)) return "—";
  if (n < 0.000001) return "$" + n.toExponential(2);
  if (n < 0.0001)   return "$" + n.toFixed(7);
  if (n < 0.01)     return "$" + n.toFixed(5);
  if (n < 1)        return "$" + n.toFixed(4);
  return "$" + n.toFixed(2);
};
const fmtPct = (n) => (Number(n) >= 0 ? "+" : "") + Number(n).toFixed(2) + "%";
const fmtAge = (h) => {
  if (h == null) return "—";
  if (h < 1)  return Math.round(h * 60) + "m";
  if (h < 48) return Math.round(h) + "h";
  return Math.floor(h / 24) + "d";
};

// ─── STEP 6: Real alert HTTP call ────────────────────────────────────────────
async function sendAlert(token) {
  try {
    const res = await fetch("/api/alert", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token }),
    });
    const data = await res.json();
    console.log("[Alert sent]", token.symbol, data.results);
  } catch (err) {
    console.error("[sendAlert error]", err);
  }
}

// ─── SPARKLINE ──────────────────────────────────────────────────────────────
function Spark({ data, color, w = 72, h = 28 }) {
  if (!data?.length || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / rng) * (h - 3) - 1}`)
    .join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        style={{ filter: `drop-shadow(0 0 3px ${color}88)` }} />
    </svg>
  );
}

// ─── SCORE RING ──────────────────────────────────────────────────────────────
function Ring({ score, size = 50 }) {
  const risk = getRisk(score);
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const d = (score / 100) * c;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={risk.color} strokeWidth="4"
          strokeDasharray={`${d} ${c}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.9s cubic-bezier(.4,0,.2,1)",
                   filter: `drop-shadow(0 0 5px ${risk.color})` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex",
                    alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.24, fontWeight: 900,
                       color: risk.color, fontFamily: "var(--mono)", lineHeight: 1 }}>
          {score}
        </span>
      </div>
    </div>
  );
}

// ─── BREAKDOWN BAR ───────────────────────────────────────────────────────────
function Bar({ label, pts, max }) {
  const pct = (pts / max) * 100;
  const col = pct >= 80 ? "#00e676" : pct >= 50 ? "#ffd600" : "#ff5252";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between",
                    marginBottom: 4, fontSize: 10.5,
                    color: "var(--muted)", fontFamily: "var(--mono)" }}>
        <span>{label}</span>
        <span style={{ color: col, fontWeight: 700 }}>
          {pts}<span style={{ color: "var(--dim)", fontWeight: 400 }}>/{max}</span>
        </span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)",
                    borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: pct + "%", borderRadius: 2,
                      background: col, boxShadow: `0 0 6px ${col}55`,
                      transition: "width 0.9s cubic-bezier(.4,0,.2,1)" }} />
      </div>
    </div>
  );
}

// ─── FLAG PILLS ──────────────────────────────────────────────────────────────
function Flags({ flags }) {
  if (!flags?.length) return (
    <span style={{ fontSize: 10.5, color: "#00e676", fontFamily: "var(--mono)" }}>✓ Clean</span>
  );
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {flags.map((f, i) => (
        <span key={i} style={{
          fontSize: 9.5, padding: "2px 7px", borderRadius: 4,
          fontWeight: 700, fontFamily: "var(--mono)",
          background: f.severity === "fatal" ? "rgba(255,61,87,0.18)" : "rgba(255,140,0,0.1)",
          color:      f.severity === "fatal" ? "#ff3d57" : "#ff9800",
          border: `1px solid ${f.severity === "fatal" ? "rgba(255,61,87,0.3)" : "rgba(255,140,0,0.2)"}`,
        }}>⚠ {f.label}</span>
      ))}
    </div>
  );
}

// ─── TOKEN DETAIL MODAL ──────────────────────────────────────────────────────
function DetailModal({ token, onClose, onAlertLog, watched, onWatch }) {
  const { score, risk, breakdown, flags, symbol, name, price, pct24h,
          liquidity, volume24h, mcap, priceHistory, ageHours,
          smartEntry, agePenalty, source } = token;
  const up = Number(pct24h) >= 0;

  const handleAlert = async () => {
    await sendAlert(token);
    onAlertLog(token);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(0,0,0,0.78)", backdropFilter: "blur(12px)" }}
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "min(620px, 95vw)", maxHeight: "90vh", overflowY: "auto",
        background: "#0b0e17",
        border: `1px solid ${risk?.glow ?? "rgba(255,255,255,0.1)"}`,
        borderRadius: 20,
        boxShadow: `0 0 80px ${risk?.dim ?? "rgba(0,0,0,0.5)"}, 0 40px 80px rgba(0,0,0,0.6)`,
        animation: "slideUp 0.22s ease",
      }}>
        {/* Header */}
        <div style={{ padding: "22px 26px 18px",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      background: `linear-gradient(135deg, ${risk?.dim ?? "transparent"}, transparent)` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <Ring score={score} size={72} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 900,
                              color: "#fff", fontFamily: "var(--mono)" }}>{symbol}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", margin: "3px 0 8px" }}>{name}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20,
                                 fontWeight: 700, background: risk?.dim,
                                 color: risk?.color, border: `1px solid ${risk?.glow}` }}>
                    {risk?.emoji} {risk?.label}
                  </span>
                  {smartEntry && (
                    <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20,
                                   fontWeight: 700, background: "rgba(0,201,255,0.1)",
                                   color: "#00c9ff", border: "1px solid rgba(0,201,255,0.25)" }}>
                      🧠 SMART ENTRY
                    </span>
                  )}
                  {source === "new" && (
                    <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20,
                                   fontWeight: 700, background: "rgba(0,201,255,0.08)",
                                   color: "#00c9ff", border: "1px solid rgba(0,201,255,0.18)" }}>
                      NEW
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => onWatch(token.id)} style={{
                background: watched ? "rgba(255,214,0,0.12)" : "rgba(255,255,255,0.04)",
                border: watched ? "1px solid rgba(255,214,0,0.3)" : "1px solid rgba(255,255,255,0.08)",
                color: watched ? "#ffd600" : "var(--muted)",
                padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                fontSize: 12, fontFamily: "var(--mono)", fontWeight: 700,
              }}>⭐ {watched ? "Watching" : "Watch"}</button>
              <button onClick={onClose} style={{
                background: "rgba(255,255,255,0.06)", border: "none",
                color: "var(--muted)", width: 32, height: 32,
                borderRadius: 8, cursor: "pointer", fontSize: 15,
              }}>✕</button>
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 26px" }}>
          {/* Metrics grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)",
                        gap: 10, marginBottom: 20 }}>
            {[
              { l: "PRICE",      v: fmtP(price) },
              { l: "24H CHANGE", v: fmtPct(pct24h), c: up ? "#00e676" : "#ff5252" },
              { l: "LIQUIDITY",  v: fmt(liquidity) },
              { l: "VOLUME 24H", v: fmt(volume24h) },
              { l: "MARKET CAP", v: fmt(mcap) },
              { l: "AGE",        v: fmtAge(ageHours) },
            ].map((m) => (
              <div key={m.l} style={{ background: "rgba(255,255,255,0.03)",
                                      borderRadius: 10, padding: "10px 14px",
                                      border: "1px solid rgba(255,255,255,0.055)" }}>
                <div style={{ fontSize: 9, color: "var(--dim)", letterSpacing: 1,
                              marginBottom: 5, fontFamily: "var(--mono)" }}>{m.l}</div>
                <div style={{ fontSize: 13, fontWeight: 700,
                              color: m.c ?? "var(--sub)", fontFamily: "var(--mono)" }}>{m.v}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 12,
                        padding: "12px 8px 6px",
                        border: "1px solid rgba(255,255,255,0.045)", marginBottom: 20 }}>
            <div style={{ fontSize: 9, color: "var(--dim)", letterSpacing: 1,
                          padding: "0 6px 8px", fontFamily: "var(--mono)" }}>PRICE — 24H</div>
            <Spark data={priceHistory} color={up ? "#00e676" : "#ff5252"} w={550} h={72} />
          </div>

          {/* Score breakdown */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 9, color: "var(--dim)", letterSpacing: 2,
                          marginBottom: 14, fontFamily: "var(--mono)" }}>SCORE BREAKDOWN</div>
            {breakdown?.map((b) => <Bar key={b.label} {...b} />)}
            {agePenalty < 0 && (
              <div style={{ display: "flex", justifyContent: "space-between",
                            fontSize: 10.5, color: "#ff9800", marginTop: 4,
                            fontFamily: "var(--mono)" }}>
                <span>⏱ Age Penalty</span>
                <span style={{ fontWeight: 700 }}>{agePenalty} pts</span>
              </div>
            )}
            <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10,
                          background: risk?.dim, border: `1px solid ${risk?.glow}`,
                          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 900, fontSize: 12, color: "#fff",
                             fontFamily: "var(--mono)" }}>TOTAL HEALTH SCORE</span>
              <span style={{ fontWeight: 900, fontSize: 20,
                             color: risk?.color, fontFamily: "var(--mono)" }}>
                {score}<span style={{ fontSize: 12, color: "var(--dim)" }}>/100</span>
              </span>
            </div>
          </div>

          {/* Flags */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, color: "var(--dim)", letterSpacing: 2,
                          marginBottom: 10, fontFamily: "var(--mono)" }}>RISK FLAGS</div>
            <Flags flags={flags} />
          </div>

          {smartEntry && (
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10,
                          background: "rgba(0,201,255,0.06)",
                          border: "1px solid rgba(0,201,255,0.18)",
                          fontSize: 11, color: "#00c9ff", fontFamily: "var(--mono)" }}>
              🧠 Smart Entry: Volume ({fmt(volume24h)}) {">"} 30% of liquidity ({fmt(liquidity)}) —
              real buy pressure confirmed.
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleAlert} style={{
              flex: 1, padding: "12px", borderRadius: 10,
              border: `1px solid ${risk?.glow}`, cursor: "pointer",
              background: risk?.dim, color: risk?.color,
              fontWeight: 800, fontSize: 12, fontFamily: "var(--mono)",
            }}>🔔 SEND REAL ALERT</button>
            <button onClick={onClose} style={{
              flex: 1, padding: "12px", borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.07)", cursor: "pointer",
              background: "rgba(255,255,255,0.03)", color: "var(--muted)",
              fontWeight: 700, fontSize: 12, fontFamily: "var(--mono)",
            }}>CLOSE</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TICKER ──────────────────────────────────────────────────────────────────
function Ticker({ alerts }) {
  if (!alerts.length) return null;
  const text = [...alerts].reverse().slice(0, 12).map((a) =>
    `${a.risk?.emoji ?? "⚪"} ${a.symbol} · Score ${a.score} · ${a.risk?.label} · Vol ${fmt(a.volume24h)}`
  ).join("     ·     ");
  return (
    <div style={{ height: 34, borderBottom: "1px solid rgba(255,61,87,0.15)",
                  background: "rgba(255,61,87,0.04)", overflow: "hidden",
                  display: "flex", alignItems: "center" }}>
      <div style={{ flexShrink: 0, padding: "0 14px", fontSize: 10, fontWeight: 800,
                    color: "#ff5252", borderRight: "1px solid rgba(255,61,87,0.2)",
                    height: "100%", display: "flex", alignItems: "center",
                    letterSpacing: 1.5, fontFamily: "var(--mono)" }}>🚨 LIVE</div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ display: "inline-block", whiteSpace: "nowrap", fontSize: 11,
                      color: "var(--sub)", fontFamily: "var(--mono)",
                      paddingLeft: "100%", animation: "ticker 30s linear infinite" }}>
          {text + "          " + text}
        </div>
      </div>
    </div>
  );
}

// ─── TOKEN ROW ───────────────────────────────────────────────────────────────
function TokenRow({ token, rank, onClick, watched, onWatch }) {
  const { score, risk, symbol, name, price, pct24h,
          liquidity, volume24h, priceHistory, smartEntry, ageHours, source } = token;
  const up = Number(pct24h) >= 0;

  return (
    <div onClick={() => onClick(token)} style={{
      display: "grid",
      gridTemplateColumns: "24px 50px 1fr 88px 88px 88px 28px 76px",
      alignItems: "center", gap: 0,
      padding: "0 18px", height: 64, cursor: "pointer",
      borderBottom: "1px solid rgba(255,255,255,0.035)",
      transition: "background 0.13s",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontSize: 11, color: "var(--dim)", fontFamily: "var(--mono)" }}>{rank}</span>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <Ring score={score} size={44} />
      </div>

      <div style={{ paddingLeft: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: "#fff", fontFamily: "var(--mono)" }}>
            {symbol}
          </span>
          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, fontWeight: 700,
                         background: risk?.dim, color: risk?.color,
                         border: `1px solid ${risk?.glow}` }}>
            {risk?.emoji} {risk?.label}
          </span>
          {smartEntry && (
            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, fontWeight: 700,
                           background: "rgba(0,201,255,0.1)", color: "#00c9ff",
                           border: "1px solid rgba(0,201,255,0.22)", fontFamily: "var(--mono)" }}>
              🧠
            </span>
          )}
          {source === "new" && (
            <span style={{ fontSize: 9, padding: "1px 5px", background: "rgba(0,201,255,0.08)",
                           color: "#00c9ff", borderRadius: 4, fontWeight: 700,
                           border: "1px solid rgba(0,201,255,0.18)", fontFamily: "var(--mono)" }}>
              NEW
            </span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
          {name}
          {ageHours != null && (
            <span style={{ marginLeft: 6, fontSize: 9, color: "var(--dim)", fontFamily: "var(--mono)" }}>
              · {fmtAge(ageHours)}
            </span>
          )}
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "var(--mono)" }}>
          {fmtP(price)}
        </div>
        <div style={{ fontSize: 10.5, color: up ? "#00e676" : "#ff5252",
                      marginTop: 2, fontFamily: "var(--mono)" }}>
          {fmtPct(pct24h)}
        </div>
      </div>

      <div style={{ textAlign: "right", fontSize: 11.5, color: "var(--sub)", fontFamily: "var(--mono)" }}>
        {fmt(liquidity)}
      </div>
      <div style={{ textAlign: "right", fontSize: 11.5, color: "var(--sub)", fontFamily: "var(--mono)" }}>
        {fmt(volume24h)}
      </div>

      <button onClick={(e) => { e.stopPropagation(); onWatch(token.id); }} style={{
        background: "none", border: "none", cursor: "pointer", padding: 4, fontSize: 14,
        opacity: watched ? 1 : 0.2,
        transition: "opacity 0.15s, transform 0.15s",
        transform: watched ? "scale(1.15)" : "scale(1)",
      }}>⭐</button>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Spark data={priceHistory} color={up ? "#00e676" : "#ff5252"} />
      </div>
    </div>
  );
}

// ─── TABLE HEAD ──────────────────────────────────────────────────────────────
function THead({ sort, setSort }) {
  const col = (key, label) => (
    <div onClick={() => setSort((s) => ({
           key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc",
         }))}
      style={{ textAlign: "right", fontSize: 9.5, cursor: "pointer",
               userSelect: "none", letterSpacing: 0.5,
               color: sort.key === key ? "#00e676" : "var(--dim)",
               fontFamily: "var(--mono)", fontWeight: 700 }}>
      {label}{sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
    </div>
  );
  return (
    <div style={{ display: "grid",
                  gridTemplateColumns: "24px 50px 1fr 88px 88px 88px 28px 76px",
                  padding: "0 18px", height: 32, alignItems: "center",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  background: "rgba(255,255,255,0.012)" }}>
      <div />
      <div style={{ textAlign: "center", fontSize: 9.5, color: "var(--dim)",
                    fontFamily: "var(--mono)", fontWeight: 700 }}>SCORE</div>
      <div style={{ paddingLeft: 12, fontSize: 9.5, color: "var(--dim)",
                    fontFamily: "var(--mono)", fontWeight: 700, letterSpacing: 0.5 }}>TOKEN</div>
      {col("price", "PRICE")}
      {col("liquidity", "LIQ")}
      {col("volume24h", "VOL 24H")}
      <div />
      <div style={{ textAlign: "right", fontSize: 9.5, color: "var(--dim)",
                    fontFamily: "var(--mono)", fontWeight: 700 }}>CHART</div>
    </div>
  );
}

// ─── FILTER BAR ──────────────────────────────────────────────────────────────
function FilterBar({ f, set, count }) {
  const Btn = ({ active, label, onClick, accent }) => (
    <button onClick={onClick} style={{
      padding: "5px 11px", borderRadius: 5, border: "none", cursor: "pointer",
      fontSize: 10, fontWeight: 700, fontFamily: "var(--mono)",
      background: active ? (accent ?? "rgba(255,255,255,0.08)") : "rgba(255,255,255,0.025)",
      color: active ? "#fff" : "var(--dim)",
      border: active ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.04)",
      transition: "all 0.13s",
    }}>{label}</button>
  );
  return (
    <div style={{ padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.045)",
                  display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 5 }}>
        {[{k:"all",l:"ALL"},{k:"safe",l:"🟢 SAFE"},{k:"degen",l:"🟡 DEGEN"},{k:"rug",l:"🔴 RUG"}]
          .map(r => <Btn key={r.k} active={f.risk===r.k} label={r.l}
                         onClick={() => set({...f, risk: r.k})} />)}
      </div>
      <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.07)", margin: "0 2px" }} />
      <div style={{ display: "flex", gap: 5 }}>
        {[{k:"all",l:"ALL"},{k:"trending",l:"🔥 TRENDING"},{k:"new",l:"🆕 NEW"}]
          .map(s => <Btn key={s.k} active={f.source===s.k} label={s.l}
                         accent="rgba(0,201,255,0.12)"
                         onClick={() => set({...f, source: s.k})} />)}
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 9.5, color: "var(--dim)", fontFamily: "var(--mono)" }}>MIN SCORE</span>
        <input type="range" min={0} max={80} step={5} value={f.minScore}
          onChange={(e) => set({...f, minScore: +e.target.value})}
          style={{ accentColor: "#00e676", width: 80 }} />
        <span style={{ fontSize: 11, color: "#00e676", fontFamily: "var(--mono)",
                       fontWeight: 700, minWidth: 20 }}>{f.minScore}</span>
      </div>
      <span style={{ fontSize: 9.5, color: "var(--dim)", fontFamily: "var(--mono)",
                     paddingLeft: 10, borderLeft: "1px solid rgba(255,255,255,0.055)" }}>
        {count} tokens
      </span>
    </div>
  );
}

// ─── STAT PILL ───────────────────────────────────────────────────────────────
function Stat({ label, value, color = "#fff", sub }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12, padding: "13px 18px", flex: "1 1 120px" }}>
      <div style={{ fontSize: 9.5, color: "var(--dim)", fontFamily: "var(--mono)",
                    letterSpacing: 1, marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color, fontFamily: "var(--mono)", lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ─── ALERTS PANEL ────────────────────────────────────────────────────────────
function AlertsPanel({ alerts, onClear }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#fff",
                        fontFamily: "var(--mono)" }}>🚨 ALERT LOG</div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>
            Fires when: Score ≥{ALERT_MIN_SCORE} AND Volume ≥{fmt(ALERT_MIN_VOLUME)} · Sends to Telegram + Discord
          </div>
        </div>
        {alerts.length > 0 && (
          <button onClick={onClear} style={{
            background: "rgba(255,61,87,0.08)", border: "1px solid rgba(255,61,87,0.2)",
            color: "#ff5252", padding: "5px 14px", borderRadius: 6, cursor: "pointer",
            fontSize: 10.5, fontFamily: "var(--mono)", fontWeight: 700,
          }}>CLEAR</button>
        )}
      </div>
      {!alerts.length ? (
        <div style={{ textAlign: "center", padding: "60px 0",
                      color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 14 }}>📭</div>
          No alerts yet. Conditions: Score ≥ {ALERT_MIN_SCORE} AND Volume ≥ {fmt(ALERT_MIN_VOLUME)}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...alerts].reverse().map((a, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 14,
              background: a.risk?.dim ?? "rgba(255,255,255,0.03)",
              border: `1px solid ${a.risk?.glow ?? "rgba(255,255,255,0.07)"}`,
              borderRadius: 12, padding: "13px 18px",
            }}>
              <Ring score={a.score} size={46} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontWeight: 800, color: "#fff",
                                 fontFamily: "var(--mono)", fontSize: 13 }}>{a.symbol}</span>
                  <span style={{ fontSize: 9.5, color: a.risk?.color,
                                 fontWeight: 700, fontFamily: "var(--mono)" }}>
                    {a.risk?.emoji} {a.risk?.label}
                  </span>
                  {a.smartEntry && (
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4,
                                   fontWeight: 700, background: "rgba(0,201,255,0.1)",
                                   color: "#00c9ff", border: "1px solid rgba(0,201,255,0.22)",
                                   fontFamily: "var(--mono)" }}>🧠 SMART ENTRY</span>
                  )}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--mono)" }}>
                  Liq: {fmt(a.liquidity)} · Vol: {fmt(a.volume24h)} · Age: {fmtAge(a.ageHours)}
                </div>
                <div style={{ marginTop: 6 }}><Flags flags={a.flags} /></div>
              </div>
              <div style={{ fontSize: 9.5, color: "var(--dim)",
                            fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>{a.time}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── WATCHLIST PANEL ─────────────────────────────────────────────────────────
function WatchlistPanel({ tokens, watchlisted, onRemove, onClick }) {
  const watched = tokens.filter((t) => watchlisted.has(t.id));
  return (
    <div>
      <div style={{ fontWeight: 900, fontSize: 15, color: "#fff",
                    fontFamily: "var(--mono)", marginBottom: 18 }}>⭐ WATCHLIST</div>
      {!watched.length ? (
        <div style={{ textAlign: "center", padding: "60px 0",
                      color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 14 }}>⭐</div>
          Click the star on any token row to track it here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {watched.map((t) => {
            const up = Number(t.pct24h) >= 0;
            return (
              <div key={t.id} onClick={() => onClick(t)} style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 12, padding: "13px 18px", cursor: "pointer",
                transition: "background 0.13s",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
              >
                <Ring score={t.score} size={46} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: "#fff",
                                fontFamily: "var(--mono)", marginBottom: 3 }}>
                    {t.symbol}
                    <span style={{ color: "var(--muted)", fontWeight: 400,
                                   fontSize: 11, marginLeft: 8 }}>{t.name}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--mono)" }}>
                    {fmtP(t.price)} ·{" "}
                    <span style={{ color: up ? "#00e676" : "#ff5252" }}>{fmtPct(t.pct24h)}</span>
                    {" · "}{fmt(t.liquidity)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Spark data={t.priceHistory} color={up ? "#00e676" : "#ff5252"} />
                  <button onClick={(e) => { e.stopPropagation(); onRemove(t.id); }} style={{
                    background: "none", border: "none", color: "#ff5252",
                    cursor: "pointer", fontSize: 14, opacity: 0.5,
                  }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ROOT APP ────────────────────────────────────────────────────────────────
export default function TokenHealthApp() {
  const { tokens, loading, error, countdown } = useTokens();
  const [alerts,      setAlerts]      = useState([]);
  const [detail,      setDetail]      = useState(null);
  const [tab,         setTab]         = useState("dashboard");
  const [section,     setSection]     = useState("all");
  const [filters,     setFilters]     = useState({ risk: "all", source: "all", minScore: 0 });
  const [sort,        setSort]        = useState({ key: "score", dir: "desc" });
  const [search,      setSearch]      = useState("");
  const [watchlisted, setWatchlisted] = useState(new Set());
  const alertedRef = useRef(new Set());

  const pushAlert = useCallback((token) => {
    setAlerts((prev) => [
      ...prev.slice(-99),
      { ...token, time: new Date().toLocaleTimeString() },
    ]);
  }, []);

  const toggleWatch = useCallback((id) => {
    setWatchlisted((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // STEP 7: Auto-alerts on every data refresh
  useEffect(() => {
    tokens.forEach((tok) => {
      if (
        tok.score        >= ALERT_MIN_SCORE &&
        tok.volume24h    >= ALERT_MIN_VOLUME &&
        !alertedRef.current.has(tok.id)
      ) {
        alertedRef.current.add(tok.id);
        pushAlert(tok);
        sendAlert(tok); // HTTP POST → /api/alert → Telegram + Discord
      }
    });
  }, [tokens, pushAlert]);

  const filtered = useMemo(() => {
    return tokens
      .filter((t) => {
        if (t.score < filters.minScore) return false;
        if (filters.risk === "safe"  && t.score < 80)                    return false;
        if (filters.risk === "degen" && (t.score < 50 || t.score >= 80)) return false;
        if (filters.risk === "rug"   && t.score >= 50)                   return false;
        if (filters.source === "trending" && t.source !== "trending")    return false;
        if (filters.source === "new"      && t.source !== "new")         return false;
        if (section === "trending" && t.source !== "trending")           return false;
        if (section === "new"      && t.source !== "new")                return false;
        if (section === "top"      && t.score < 80)                      return false;
        if (section === "smart"    && !t.smartEntry)                     return false;
        if (search) {
          const q = search.toLowerCase();
          if (!t.symbol?.toLowerCase().includes(q) && !t.name?.toLowerCase().includes(q))
            return false;
        }
        return true;
      })
      .sort((a, b) => {
        const mul = sort.dir === "asc" ? 1 : -1;
        return (Number(a[sort.key]) - Number(b[sort.key])) * mul;
      });
  }, [tokens, filters, sort, search, section]);

  const safeCount  = tokens.filter((t) => t.score >= 80).length;
  const degenCount = tokens.filter((t) => t.score >= 50 && t.score < 80).length;
  const rugCount   = tokens.filter((t) => t.score < 50).length;
  const smartCount = tokens.filter((t) => t.smartEntry).length;
  const avgScore   = tokens.length
    ? Math.round(tokens.reduce((s, t) => s + t.score, 0) / tokens.length)
    : 0;

  const TABS = [
    { key: "dashboard", label: "DASHBOARD" },
    { key: "alerts",    label: `ALERTS${alerts.length ? ` (${alerts.length})` : ""}` },
    { key: "watchlist", label: `WATCHLIST${watchlisted.size ? ` (${watchlisted.size})` : ""}` },
  ];

  const SECTIONS = [
    { key: "all",      label: "⬡ All" },
    { key: "trending", label: "🔥 Trending" },
    { key: "new",      label: "🆕 New" },
    { key: "top",      label: "⭐ Score 80+" },
    { key: "smart",    label: `🧠 Smart Entry${smartCount ? ` (${smartCount})` : ""}` },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=Barlow+Condensed:wght@700;800;900&display=swap');
        :root {
          --bg:      #070a11;
          --mono:    'IBM Plex Mono', monospace;
          --display: 'Barlow Condensed', sans-serif;
          --muted:   rgba(255,255,255,0.38);
          --sub:     rgba(255,255,255,0.55);
          --dim:     rgba(255,255,255,0.22);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.09); border-radius: 2px; }
        @keyframes ticker  { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes spin    { to { transform: rotate(360deg) } }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "#fff" }}>
        {/* Background atmosphere */}
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: `
            radial-gradient(ellipse 70% 45% at 10% 5%,  rgba(0,230,118,0.055) 0%, transparent 55%),
            radial-gradient(ellipse 50% 35% at 90% 85%, rgba(0,180,255,0.04) 0%,  transparent 55%),
            linear-gradient(rgba(255,255,255,0.011) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.011) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 100% 100%, 28px 28px, 28px 28px",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* ── NAV ── */}
          <div style={{
            position: "sticky", top: 0, zIndex: 200,
            background: "rgba(7,10,17,0.94)", backdropFilter: "blur(18px)",
            borderBottom: "1px solid rgba(255,255,255,0.065)",
          }}>
            <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex",
                          alignItems: "center", padding: "0 22px", height: 56 }}>
              <div style={{ marginRight: 32, flexShrink: 0 }}>
                <div style={{ fontFamily: "var(--display)", fontSize: 21,
                              fontWeight: 900, letterSpacing: 2, color: "#fff" }}>
                  <span style={{ color: "#00e676" }}>◈</span> TOKEN
                  <span style={{ color: "#00e676" }}>HEALTH</span>
                </div>
                <div style={{ fontSize: 8.5, color: "var(--dim)", letterSpacing: 3, marginTop: 1 }}>
                  SOLANA ALPHA SCANNER
                </div>
              </div>

              <div style={{ display: "flex", gap: 3 }}>
                {TABS.map((t) => (
                  <button key={t.key} onClick={() => setTab(t.key)} style={{
                    padding: "5px 14px", borderRadius: 6, border: "none",
                    cursor: "pointer", fontSize: 10, fontWeight: 700,
                    fontFamily: "var(--mono)", letterSpacing: 0.5,
                    background: tab === t.key ? "rgba(0,230,118,0.1)" : "transparent",
                    color:      tab === t.key ? "#00e676"             : "var(--dim)",
                    border:     tab === t.key ? "1px solid rgba(0,230,118,0.22)" : "1px solid transparent",
                    transition: "all 0.14s",
                  }}>{t.label}</button>
                ))}
              </div>

              <div style={{ position: "relative", marginLeft: "auto", marginRight: 14 }}>
                <span style={{ position: "absolute", left: 9, top: "50%",
                               transform: "translateY(-50%)", color: "var(--dim)", fontSize: 12 }}>⌕</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tokens..."
                  style={{ background: "rgba(255,255,255,0.04)",
                           border: "1px solid rgba(255,255,255,0.065)",
                           borderRadius: 7, padding: "6px 11px 6px 26px",
                           color: "#fff", fontSize: 11, fontFamily: "var(--mono)",
                           outline: "none", width: 160 }} />
              </div>

              <div style={{ fontSize: 9.5, color: "var(--dim)",
                            fontFamily: "var(--mono)", textAlign: "right", flexShrink: 0 }}>
                {loading
                  ? <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#00e676" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%",
                                    border: "2px solid #00e676", borderTopColor: "transparent",
                                    animation: "spin 0.8s linear infinite" }} />
                      SCANNING
                    </div>
                  : <div>
                      <span style={{ color: "var(--dim)" }}>REFRESH </span>
                      <span style={{ color: "#00e676", fontWeight: 700 }}>{countdown}s</span>
                    </div>
                }
              </div>
            </div>
          </div>

          <Ticker alerts={alerts} />

          {error && (
            <div style={{ background: "rgba(255,61,87,0.08)",
                          borderBottom: "1px solid rgba(255,61,87,0.2)",
                          padding: "8px 22px", fontSize: 11,
                          color: "#ff5252", fontFamily: "var(--mono)" }}>
              ⚠ API Error: {error} — Check BIRDEYE_API_KEY in .env.local and restart dev server.
            </div>
          )}

          <div style={{ maxWidth: 1160, margin: "0 auto", padding: "22px 22px 60px" }}>
            {tab === "alerts" ? (
              <AlertsPanel alerts={alerts} onClear={() => setAlerts([])} />
            ) : tab === "watchlist" ? (
              <WatchlistPanel tokens={tokens} watchlisted={watchlisted}
                              onRemove={toggleWatch} onClick={setDetail} />
            ) : (
              <>
                {/* Stats */}
                <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                  <Stat label="TRACKED"        value={tokens.length}  color="#00c9ff" />
                  <Stat label="AVG SCORE"      value={avgScore}       color="#00e676" />
                  <Stat label="🟢 SAFE"        value={safeCount}      color="#00e676"  sub="≥ 80" />
                  <Stat label="🟡 DEGEN"       value={degenCount}     color="#ffd600"  sub="50–79" />
                  <Stat label="🔴 RUG RISK"    value={rugCount}       color="#ff5252"  sub="< 50" />
                  <Stat label="🧠 SMART ENTRY" value={smartCount}     color="#00c9ff"  sub="Vol/Liq > 30%" />
                  <Stat label="🚨 ALERTS SENT" value={alerts.length}  color="#ff9800" />
                </div>

                {/* Section tabs */}
                <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" }}>
                  {SECTIONS.map((s) => (
                    <button key={s.key} onClick={() => setSection(s.key)} style={{
                      padding: "7px 16px", borderRadius: 7, border: "none",
                      cursor: "pointer", fontSize: 11, fontWeight: 700,
                      fontFamily: "var(--mono)",
                      background: section === s.key ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.02)",
                      color:      section === s.key ? "#fff"                   : "var(--dim)",
                      border:     section === s.key ? "1px solid rgba(255,255,255,0.14)" : "1px solid rgba(255,255,255,0.035)",
                      transition: "all 0.13s",
                    }}>{s.label}</button>
                  ))}
                </div>

                {/* Token table */}
                <div style={{ background: "rgba(255,255,255,0.018)",
                              border: "1px solid rgba(255,255,255,0.065)",
                              borderRadius: 16, overflow: "hidden" }}>
                  <FilterBar f={filters} set={setFilters} count={filtered.length} />
                  <THead sort={sort} setSort={setSort} />

                  {loading && !tokens.length ? (
                    <div style={{ textAlign: "center", padding: "80px 0",
                                  color: "var(--muted)", fontFamily: "var(--mono)" }}>
                      <div style={{ fontSize: 28, marginBottom: 14, display: "inline-block",
                                    animation: "spin 2s linear infinite" }}>◈</div>
                      <div style={{ fontSize: 11, letterSpacing: 2 }}>FETCHING LIVE DATA...</div>
                      <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 8 }}>
                        Calling /api/tokens → Birdeye API
                      </div>
                    </div>
                  ) : !filtered.length ? (
                    <div style={{ textAlign: "center", padding: "60px 0",
                                  color: "var(--dim)", fontSize: 12, fontFamily: "var(--mono)" }}>
                      No tokens match current filters.
                    </div>
                  ) : (
                    filtered.map((t, i) => (
                      <div key={t.id ?? i}
                           style={{ animation: `fadeIn 0.3s ease ${Math.min(i * 25, 400)}ms both` }}>
                        <TokenRow token={t} rank={i + 1}
                          onClick={setDetail}
                          watched={watchlisted.has(t.id)}
                          onWatch={toggleWatch} />
                      </div>
                    ))
                  )}
                </div>

                {/* Security footer */}
                <div style={{ marginTop: 14, padding: "9px 14px", borderRadius: 8,
                              fontSize: 10.5,
                              background: "rgba(0,230,118,0.03)",
                              border: "1px solid rgba(0,230,118,0.1)",
                              color: "rgba(0,230,118,0.5)",
                              fontFamily: "var(--mono)",
                              display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <span>✓ API key server-side only</span>
                  <span>✓ Rate-limited (200ms/call)</span>
                  <span>✓ Defensive scoring (starts at 0)</span>
                  <span>✓ Age penalty applied</span>
                  <span>✓ Alerts: score ≥{ALERT_MIN_SCORE} + vol ≥{fmt(ALERT_MIN_VOLUME)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {detail && (
        <DetailModal
          token={detail}
          onClose={() => setDetail(null)}
          onAlertLog={pushAlert}
          watched={watchlisted.has(detail.id)}
          onWatch={toggleWatch}
        />
      )}
    </>
  );
}
