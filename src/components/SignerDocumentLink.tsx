"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

// Owns the whole .sign-document-card content (icon, title block, and the
// view-document button) as a single client component so the "watermarked
// preview" disclaimer and the button share one live-polled `completed`
// state instead of drifting apart — the disclaimer used to be static
// server-rendered text that never updated when the poll below flipped
// the button to "View completed PDF".
//
// It also renders exactly three top-level siblings (span, div, a),
// matching .sign-document-card's `grid-template-columns: auto 1fr auto`
// — keep it that way if this is touched again.
export function SignerDocumentLink({
  token,
  initiallyCompleted,
  organisationName,
  documentTitle,
  signerName,
}: {
  token: string;
  initiallyCompleted: boolean;
  organisationName: string;
  documentTitle: string;
  signerName: string;
}) {
  const [completed, setCompleted] = useState(initiallyCompleted);

  useEffect(() => {
    if (completed) return;

    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`/api/sign/${token}/status`, { cache: "no-store" });
        if (!response.ok) return;
        const state = (await response.json()) as { completed: boolean };
        if (active && state.completed) setCompleted(true);
      } catch {
        // Keep the last verified state and try again on the next interval.
      }
    };

    void check();
    const timer = window.setInterval(check, 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [completed, token]);

  const state = completed ? "completed" : "unsigned-review";
  return (
    <>
      <span><Icon name="file" size={25} /></span>
      <div>
        <small>Signature request from {organisationName}</small>
        <h1>{documentTitle}</h1>
        <p>Prepared for {signerName}</p>
        {!completed && <small>Preview is watermarked and is not an executed agreement.</small>}
      </div>
      <a
        href={`/api/sign/${token}/document?state=${state}`}
        target="_blank"
        rel="noreferrer"
        className="button button--outline"
      >
        {completed ? "View completed PDF" : "View unsigned review"}
      </a>
    </>
  );
}
