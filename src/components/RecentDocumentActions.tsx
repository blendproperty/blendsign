"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

export default function RecentDocumentActions({ id, signed }: { id: string; signed: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function moveToTrash() {
    setOpen(false);
    if (!confirm("Move this document to trash?")) return;
    const response = await fetch(`/api/envelopes?id=${id}`, { method: "DELETE" });
    if (response.ok) router.refresh();
  }

  return (
    <div className="menu-popover-container" ref={containerRef}>
      <button
        type="button"
        className="icon-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Document actions"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu-popover" role="menu">
          <a role="menuitem" href={`/documents/${id}`}>Details</a>
          {signed && (
            <a role="menuitem" href={`/api/envelopes/${id}/document?version=signed`} target="_blank" rel="noreferrer">
              View signed
            </a>
          )}
          <a role="menuitem" href={`/api/envelopes/${id}/document?version=original`} target="_blank" rel="noreferrer">
            Original
          </a>
          <button role="menuitem" className="menu-popover-danger" onClick={moveToTrash}>
            Trash
          </button>
        </div>
      )}
    </div>
  );
}
