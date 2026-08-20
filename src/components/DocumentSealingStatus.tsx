"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

export default function DocumentSealingStatus({ id }: { id: string }) {
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

  return <section className="panel document-pending"><Icon name="clock" size={30} /><h2>Preparing the signed PDF</h2><p>This page will update automatically.</p></section>;
}
