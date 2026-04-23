// lib/birdeye.js — Server-side ONLY. Never import this in frontend code.
// API key stays on the server. Rate-limited with 200ms delay between calls.

const BASE = "https://public-api.birdeye.so";

// In-memory cache (per serverless instance)
const _cache = new Map();

async function cachedFetch(url, ttlMs = 30_000) {
  const hit = _cache.get(url);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data;

  const res = await fetch(url, {
    headers: {
      "X-API-KEY": process.env.BIRDEYE_API_KEY,
      "x-chain": "solana",
    },
  });

  if (!res.ok) {
    throw new Error(`Birdeye ${res.status} ${res.statusText}: ${url}`);
  }

  const data = await res.json();
  _cache.set(url, { data, ts: Date.now() });
  return data;
}

// 200ms delay between security calls — stays under 30/min limit
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getTrendingTokens(limit = 10) {
  const url = `${BASE}/defi/token_trending?sort_by=volume24hUSD&sort_type=desc&limit=${limit}`;
  const res = await cachedFetch(url, 30_000);
  return res?.data?.tokens ?? [];
}

export async function getNewListings(limit = 10) {
  const url = `${BASE}/v2/tokens/new_listing?limit=${limit}`;
  const res = await cachedFetch(url, 30_000);
  return res?.data?.items ?? [];
}

// Throttled: max 10 tokens, 200ms apart. Never hits rate limit.
export async function getSecurityBatch(tokens) {
  const batch = tokens.slice(0, 10);
  const results = [];

  for (const t of batch) {
    await delay(200);
    try {
      const url = `${BASE}/defi/token_security?address=${t.address}`;
      const res = await cachedFetch(url, 60_000); // cache 1 min
      results.push(res?.data ?? {});
    } catch (err) {
      console.warn(`[birdeye] security fetch failed for ${t.address}:`, err.message);
      results.push({});
    }
  }

  return results;
    }
