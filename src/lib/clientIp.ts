// Resolves the signer/requester IP for the audit trail and rate limiting.
//
// Traefik (the only reverse proxy in front of this app, see
// docker-compose.yml) appends the connecting peer's address to any
// inbound X-Forwarded-For rather than replacing it. Trusting the first
// (left-most, client-supplied) entry lets a requester set their own
// X-Forwarded-For header and have it recorded as their IP — including in
// the legally-relevant signing Certificate of Completion. The last entry
// is the one Traefik itself appended, so that's the one to trust.
export function clientIp(req: { headers: { get(name: string): string | null } }) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.headers.get("x-real-ip") || "unknown";
}
