// CommonJS mirror of src/lib/ssrfGuard.ts — the worker runs as plain
// Node (no build step), so it can't import the TS module directly. Keep
// both in sync if this logic changes.
const dns = require("dns").promises;

function isPrivateAddress(address) {
  if (address.includes(":")) {
    const lower = address.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
    return false;
  }
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;
  return false;
}

// Re-resolves and re-checks at delivery time (not just at creation time)
// to also cover DNS rebinding between when a webhook was saved and when
// it's actually delivered.
async function assertPublicWebhookTarget(url) {
  const { hostname } = new URL(url);
  const { address } = await dns.lookup(hostname);
  if (isPrivateAddress(address)) {
    throw new Error(`Webhook host ${hostname} resolves to a non-routable address (${address})`);
  }
}

module.exports = { isPrivateAddress, assertPublicWebhookTarget };
