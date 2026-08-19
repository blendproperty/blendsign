import { createHash } from "crypto";

/**
 * Tamper-evident sealing: sha256 of the final flattened PDF bytes.
 * Stored on the Envelope record and surfaced on the certificate of
 * completion so any post-signing edit is detectable.
 */
export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
