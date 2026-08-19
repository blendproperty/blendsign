"use client";

import { useRouter } from "next/navigation";

export default function DocumentActions({ id }: { id: string }) {
  const router = useRouter();
  async function moveToTrash() {
    if (!confirm("Move this document to trash?")) return;
    const response = await fetch(`/api/envelopes?id=${id}`, { method: "DELETE" });
    if (response.ok) router.refresh();
  }
  return <button className="text-button text-button--danger" onClick={moveToTrash}>Trash</button>;
}
