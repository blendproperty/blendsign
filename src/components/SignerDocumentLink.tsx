"use client";

import { useEffect, useState } from "react";

export function SignerDocumentLink({
  token,
  initiallyCompleted,
}: {
  token: string;
  initiallyCompleted: boolean;
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
    <a
      href={`/api/sign/${token}/document?state=${state}`}
      target="_blank"
      rel="noreferrer"
      className="button button--outline"
    >
      {completed ? "View completed PDF" : "View unsigned review"}
    </a>
  );
}
