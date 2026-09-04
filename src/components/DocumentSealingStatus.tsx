"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

export default function DocumentSealingStatus({ id, status }: { id: string; status: string }) {
  const router = useRouter();

  useEffect(() => {
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/envelopes/${id}`, { cache: "no-store" });
        const data = await response.json();
        if (response.ok && data.ready) {
          window.clearInterval(timer);
          router.refresh();
        }
      } catch {}
      if (attempts >= 30) window.clearInterval(timer);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [id, router]);

  const awaitingSignatures = status === "SENT" || status === "PARTIALLY_SIGNED";
  return <section className="panel document-pending"><Icon name="clock" size={30} /><h2>{awaitingSignatures ? "Awaiting signatures" : "Preparing the signed PDF"}</h2><p>{awaitingSignatures ? "Use the reminder controls above if a recipient needs a prompt." : "This page will update automatically."}</p></section>;
}
