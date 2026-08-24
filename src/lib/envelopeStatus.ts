// Single source of truth for "is this envelope's signed document ready to
// serve" — previously duplicated across the signer page, the document
// route, and the status-poll route, which could drift out of sync.
export function isEnvelopeCompleted(envelope: { status: string; signedKey: string | null }) {
  return envelope.status === "COMPLETED" && Boolean(envelope.signedKey);
}
