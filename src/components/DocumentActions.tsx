"use client";

import { useRouter } from "next/navigation";

export default function DocumentActions({ id, signed }: { id: string; signed: boolean }) {
  const router = useRouter();
  async function moveToTrash() {
    if (!confirm("Move this document to trash?")) return;
    const response = await fetch(`/api/envelopes?id=${id}`, { method: "DELETE" });
    if (response.ok) router.refresh();
  }
  return (
    <div className="document-actions">
      <a className="text-button" href={`/documents/${id}`}>Details</a>
      {signed && (
        <a className="text-button" href={`/api/envelopes/${id}/document?version=signed`} target="_blank" rel="noreferrer">
          View signed
        </a>
      )}
      <a className="text-button" href={`/api/envelopes/${id}/document?version=original`} target="_blank" rel="noreferrer">
        Original
      </a>
      <button className="text-button text-button--danger" onClick={moveToTrash}>Trash</button>
    </div>
  );
}
