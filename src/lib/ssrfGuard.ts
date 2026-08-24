import { promises as dns } from "dns";

// Conservative check for RFC1918/loopback/link-local/reserved addresses.
// Fails closed (treats unparseable input as private) since this guards
// an outbound request to a company-supplied webhook URL.
export function isPrivateAddress(address: string) {
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

// Resolves the webhook host and rejects private/internal targets. This is
// a creation-time check only — the worker re-checks at delivery time
// (worker/lib/ssrfGuard.js) since DNS can change between the two.
export async function assertPublicWebhookTarget(url: string) {
  const { hostname } = new URL(url);
  const { address } = await dns.lookup(hostname);
  if (isPrivateAddress(address)) {
    throw new Error(`Webhook host ${hostname} resolves to a non-routable address`);
  }
}
