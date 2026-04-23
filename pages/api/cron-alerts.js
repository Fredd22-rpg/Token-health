// pages/api/alert.js
// Sends real alerts to Telegram and/or Discord.
// Called from frontend via POST /api/alert

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { token } = req.body ?? {};
  if (!token?.symbol) return res.status(400).json({ error: "token required" });

  const fmt = (n) => {
    if (!n) return "—";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + Number(n).toFixed(2);
  };

  const ageStr = token.ageHours != null
    ? (token.ageHours < 24 ? `${Math.round(token.ageHours)}h` : `${Math.floor(token.ageHours / 24)}d`)
    : "unknown";

  const flagStr = token.flags?.length
    ? "\n⚠️ Flags: " + token.flags.map((f) => f.label).join(", ")
    : "\n✅ No risk flags";

  const smartStr = token.smartEntry ? "\n🧠 Smart Entry: Vol/Liq > 30%" : "";
  const riskEmoji = token.risk?.emoji ?? "⚪";
  const riskLabel = token.risk?.label ?? "UNKNOWN";

  const msg = [
    `🚨 Token Health Alert`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Token:     ${token.name} (${token.symbol})`,
    `Score:     ${token.score}/100 ${riskEmoji} ${riskLabel}`,
    `Price:     $${Number(token.price).toFixed(6)}`,
    `Liquidity: ${fmt(token.liquidity)}`,
    `Vol 24h:   ${fmt(token.volume24h)}`,
    `Age:       ${ageStr}`,
    `Source:    ${token.source ?? "—"}`,
    flagStr,
    smartStr,
    `━━━━━━━━━━━━━━━━━━━━`,
  ].filter(Boolean).join("\n");

  const results = {};

  // ── TELEGRAM ───────────────────────────────────────────────
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    try {
      const r = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: msg,
          }),
        }
      );
      results.telegram = r.ok ? "sent" : `failed (${r.status})`;
    } catch (e) {
      results.telegram = `error: ${e.message}`;
    }
  }

  // ── DISCORD ────────────────────────────────────────────────
  if (process.env.DISCORD_WEBHOOK_URL) {
    try {
      const r = await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msg }),
      });
      results.discord = r.ok ? "sent" : `failed (${r.status})`;
    } catch (e) {
      results.discord = `error: ${e.message}`;
    }
  }

  const anySent = Object.values(results).some((v) => v === "sent");
  res.json({ ok: anySent || Object.keys(results).length === 0, results });
}
