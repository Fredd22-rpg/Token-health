// utils/score.js — Defensive health scoring engine
// Philosophy: start at 0, earn every point. Nothing assumed safe.

export function calculateScore(token) {
  let score = 0;
  const breakdown = [];
  const flags = [];

  // ── LIQUIDITY (30 pts max) ──────────────────────────────────
  const liq = Number(token.liquidity) || 0;
  let liqPts = 0;
  if      (liq >= 500_000) liqPts = 24;
  else if (liq >= 100_000) liqPts = 18;
  else if (liq >= 50_000)  liqPts = 12;
  else if (liq >= 10_000)  liqPts = 6;
  else                     liqPts = 1;

  // Liquidity lock bonus
  const lockDays = Number(token.liquidityLockDays) || 0;
  if      (lockDays >= 180) liqPts = Math.min(30, liqPts + 6);
  else if (lockDays >= 30)  liqPts = Math.min(30, liqPts + 3);

  score += liqPts;
  breakdown.push({ label: "Liquidity", pts: liqPts, max: 30 });

  // ── HOLDER DISTRIBUTION (25 pts max) ───────────────────────
  const topPct = Number(
    token.topHolderPct ?? token.top10HolderPercent ?? token.ownerPercentage ?? 50
  );
  let holderPts = 0;
  if      (topPct < 5)  holderPts = 25;
  else if (topPct < 10) holderPts = 21;
  else if (topPct < 20) holderPts = 16;
  else if (topPct < 40) holderPts = 10;
  else if (topPct < 60) holderPts = 5;
  else                  holderPts = 1;

  score += holderPts;
  breakdown.push({ label: "Holders", pts: holderPts, max: 25 });

  // ── SECURITY — FULLY DEFENSIVE (25 pts max) ────────────────
  // isHoneypot = instant zero. No workarounds.
  let secPts = 0;
  if (token.isHoneypot) {
    secPts = 0;
    flags.push({ label: "HONEYPOT", severity: "fatal" });
  } else {
    secPts += 5; // passed honeypot check
    if (token.ownerRenounced) secPts += 5;
    else flags.push({ label: "Owner Not Renounced", severity: "warn" });

    if (!token.canMint) secPts += 5;
    else flags.push({ label: "Mintable", severity: "warn" });

    if (!token.canFreeze) secPts += 5;
    else flags.push({ label: "Freeze Authority", severity: "warn" });

    if (token.lpLocked) secPts += 5;
    else flags.push({ label: "LP Not Locked", severity: "warn" });
  }

  score += secPts;
  breakdown.push({ label: "Security", pts: secPts, max: 25 });

  // ── VOLUME / MOMENTUM (20 pts max) ─────────────────────────
  const vol = Number(token.volume24h ?? token.v24hUSD ?? 0);
  let volPts = 0;
  if      (vol >= 2_000_000) volPts = 20;
  else if (vol >= 1_000_000) volPts = 17;
  else if (vol >= 500_000)   volPts = 14;
  else if (vol >= 100_000)   volPts = 10;
  else if (vol >= 50_000)    volPts = 6;
  else if (vol >= 10_000)    volPts = 3;
  else                       volPts = 1;

  score += volPts;
  breakdown.push({ label: "Momentum", pts: volPts, max: 20 });

  // ── TOKEN AGE PENALTY ──────────────────────────────────────
  let agePenalty = 0;
  const createdMs = token.createdAt ? new Date(token.createdAt).getTime() : null;
  const ageHours  = createdMs ? (Date.now() - createdMs) / 3_600_000 : null;

  if (ageHours !== null) {
    if      (ageHours < 2)  { agePenalty = -10; flags.push({ label: "< 2hrs Old",  severity: "warn" }); }
    else if (ageHours < 24) { agePenalty = -5;  flags.push({ label: "< 24hrs Old", severity: "info" }); }
  }

  score = Math.max(0, Math.min(100, score + agePenalty));

  // ── SMART ENTRY ────────────────────────────────────────────
  // vol > 30% of liquidity = real buy pressure, not a fake pump
  const smartEntry = vol > 0 && liq > 0 && (vol / liq) > 0.3;

  return { score, breakdown, flags, agePenalty, ageHours, smartEntry };
}

export function getRisk(score) {
  if (score >= 80) return {
    label: "SAFE ZONE", color: "#00e676",
    dim: "#00e67614", glow: "#00e67633", emoji: "🟢", tier: "safe",
  };
  if (score >= 50) return {
    label: "DEGEN PLAY", color: "#ffd600",
    dim: "#ffd60014", glow: "#ffd60033", emoji: "🟡", tier: "degen",
  };
  return {
    label: "RUG RISK", color: "#ff3d57",
    dim: "#ff3d5714", glow: "#ff3d5733", emoji: "🔴", tier: "rug",
  };
}
