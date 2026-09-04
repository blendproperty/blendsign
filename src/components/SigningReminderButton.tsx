"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export default function SigningReminderButton({ envelopeId, signerId, recipientName, compact = false }: { envelopeId: string; signerId?: string; recipientName?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const label = signerId ? "Send reminder" : "Remind unsigned recipients";

  async function send() {
    const target = recipientName || "all currently eligible unsigned recipients";
    if (!window.confirm(`Send a signing reminder to ${target}?`)) return;
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/envelopes/${envelopeId}/remind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(signerId ? { signerId } : {}) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(result.error || "The reminder could not be sent.");
    setMessage(result.recipients.length === 1 ? "Reminder queued." : `${result.recipients.length} reminders queued.`);
  }

  return <span className={compact ? "recipient-reminder" : "document-reminder"}>
    <button type="button" className={compact ? "text-button" : ""} disabled={busy} onClick={send}>{!compact && <Icon name="mail" size={17} />} {busy ? "Queuing…" : label}</button>
    {message && <small role="status">{message}</small>}
  </span>;
}
