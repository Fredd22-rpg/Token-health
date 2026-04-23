// pages/api/cron-alerts.js
// Runs every 2 minutes via Vercel Cron (see vercel.json).
// FIX #1 applied: uses VERCEL_URL env var for absolute URL.
// Relative fetch() URLs do NOT work in serverless functions.

import { getTrendingTokens, getNewListings, getSecurityBatch } from "../../lib/birdeye";
import { calculateScore, getRisk } from "../../utils/score";

const ALERT_MIN_SCORE  = 80;
const ALERT_MIN_VOLUME = 100_000; // Smarter alerts: must have real volume

export default async function handler(req, res) {
  // Security: only allow Vercel Cron or internal calls
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // FIX #1: Absolute URL — relative URLs break in Vercel serverless
  const BASE_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  try {
    const [trending, newListings] = await Promise.allSettled([
      getTrendingTokens(10),
      getNewListings(10),
    ]);

    const raw = [
      ...(trending.status === "fulfilled" ? trending.value : []),
      ...(newListings.status === "fulfilled" ? newListings.value : []),
    ];

    const secData = await getSecurityBatch(raw);

    let alertsFired = 0;
    const fired = [];

    for (let i = 0; i < raw.length; i++) {
      const t = raw[i];
      const sec = secData[i] ?? {};

      const token = {
        ...t, ...sec,
        volume24h:         Number(t.v24hUSD ?? t.volumeUSD) || 0,
        liquidity:         Number(t.liquidity) || 0,
        isHoneypot:        sec.is_honeypot     ?? false,
        canMint:           sec.is_mintable     ?? false,
        canFreeze:         sec.freezeable      ?? false,
        ownerRenounced:    sec.owner_renounced ?? false,
        lpLocked:          sec.lp_locked       ?? false,
        liquidityLockDays: Number(sec.lp_lock_days) || 0,
        topHolderPct:      Number(sec.top10_holder_percent) || 50,
      };

      const { score, flags, smartEntry, ageHours } = calculateScore(token);
      const risk = getRisk(score);

      // Only alert when BOTH conditions pass (avoids spam)
      if (score >= ALERT_MIN_SCORE && token.volume24h >= ALERT_MIN_VOLUME) {
        const alertPayload = {
          ...token,
          score, flags, smartEntry, ageHours, risk,
          symbol: t.symbol,
          name:   t.name ?? t.symbol,
          price:  t.price ?? 0,
          source: t.source ?? "unknown",
        };

        // FIX #1: absolute URL
        await fetch(`${BASE_URL}/api/alert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: alertPayload }),
        }).catch((err) => console.error(`[cron] alert failed: ${err.message}`));

        alertsFired++;
        fired.push(`${t.symbol} (${score})`);
      }
    }

    res.json({
      ok: true,
      checked: raw.length,
      alertsFired,
      fired,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error("[/api/cron-alerts]", err);
    res.status(500).json({ error: err.message });
  }
    }
