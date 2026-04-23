// pages/api/tokens.js
// SECURE: API key lives here on the server, never sent to client.
// Frontend calls /api/tokens — this proxies to Birdeye safely.

import { getTrendingTokens, getNewListings, getSecurityBatch } from "../../lib/birdeye";
import { calculateScore, getRisk } from "../../utils/score";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    // 1. Fetch trending + new listings in parallel
    const [trending, newListings] = await Promise.all([
      getTrendingTokens(10),
      getNewListings(10),
    ]);

    // 2. Deduplicate by address
    const seen = new Set();
    const raw = [];
    for (const t of [
      ...trending.map((x) => ({ ...x, source: "trending" })),
      ...newListings.map((x) => ({ ...x, source: "new" })),
    ]) {
      if (t.address && !seen.has(t.address)) {
        seen.add(t.address);
        raw.push(t);
      }
    }

    // 3. Fetch security data (rate-limited, max 10)
    const secData = await getSecurityBatch(raw);

    // 4. Enrich + score each token
    const tokens = raw.map((t, i) => {
      const sec = secData[i] ?? {};

      // Normalize field names from Birdeye's API response
      const enriched = {
        id:             t.address,
        address:        t.address,
        symbol:         t.symbol ?? "???",
        name:           t.name   ?? t.symbol ?? "Unknown",
        price:          Number(t.price)             || 0,
        pct24h:         Number(t.priceChange24hPercent) || 0,
        liquidity:      Number(t.liquidity)          || 0,
        volume24h:      Number(t.v24hUSD)            || 0,
        holders:        Number(t.holder)             || 0,
        mcap:           Number(t.mc)                 || 0,
        source:         t.source,

        // Security fields (from /defi/token_security)
        isHoneypot:     sec.is_honeypot     ?? false,
        canMint:        sec.is_mintable     ?? false,
        canFreeze:      sec.freezeable      ?? false,
        ownerRenounced: sec.owner_renounced ?? false,
        lpLocked:       sec.lp_locked       ?? false,
        liquidityLockDays: Number(sec.lp_lock_days) || 0,

        // Holder concentration
        topHolderPct:   Number(sec.top10_holder_percent ?? t.top10HolderPercent) || 50,

        // Token age
        createdAt: t.createdAt ?? null,
      };

      const { score, breakdown, flags, agePenalty, ageHours, smartEntry } = calculateScore(enriched);
      const risk = getRisk(score);

      return {
        ...enriched,
        score,
        breakdown,
        flags,
        agePenalty,
        ageHours,
        smartEntry,
        risk,
        // Placeholder price history (replace with real OHLCV endpoint if desired)
        priceHistory: Array.from({ length: 24 }, (_, h) =>
          enriched.price * (1 + Math.sin(h / 4) * 0.05 + (Math.random() - 0.5) * 0.03)
        ),
      };
    });

    // Cache for 30s on CDN edge, serve stale while revalidating
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=15");
    res.json({ tokens, updatedAt: new Date().toISOString(), count: tokens.length });

  } catch (err) {
    console.error("[/api/tokens]", err);
    res.status(500).json({ error: err.message });
  }
}
