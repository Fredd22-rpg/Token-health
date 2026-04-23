// hooks/useTokens.js
// Fetches from /api/tokens (our secure backend route).
// Auto-refreshes every 45 seconds. API key never touches the client.

import { useState, useEffect, useCallback, useRef } from "react";

const REFRESH_MS = 45_000;

export function useTokens() {
  const [tokens, setTokens]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const countRef = useRef(null);

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/tokens");
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setTokens(data.tokens ?? []);
      setUpdatedAt(data.updatedAt ?? new Date().toISOString());
      setCountdown(REFRESH_MS / 1000);
    } catch (err) {
      console.error("[useTokens]", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  // Auto-refresh every 45s
  useEffect(() => {
    const id = setInterval(fetchTokens, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchTokens]);

  // Live countdown ticker
  useEffect(() => {
    if (countRef.current) clearInterval(countRef.current);
    countRef.current = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(countRef.current);
  }, [updatedAt]);

  return { tokens, loading, error, updatedAt, countdown, refresh: fetchTokens };
}
