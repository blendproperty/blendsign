"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

export default function DocumentDetailActions({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [modal, setModal] = useState<"edit" | "email" | null>(null);
  const [nextTitle, setNextTitle] = useState(title);
  const [addresses, setAddresses] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function updateDetails(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/envelopes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(result.error || "The document could not be updated.");
    setModal(null);
    router.refresh();
  }

  async function emailDocument(event: FormEvent) {
    event.preventDefault();
    const emails = addresses.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
    if (emails.length < 1 || emails.length > 3) return setMessage("Enter between one and three email addresses.");
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/envelopes/${id}/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(result.error || "The email could not be queued.");
    setMessage(`Queued for ${result.recipients} recipient${result.recipients === 1 ? "" : "s"}.`);
    setAddresses("");
  }

  function openModal(next: "edit" | "email") {
    setMessage("");
    setModal(next);
  }

  return (
    <>
      <nav className="document-detail-actions" aria-label="Document actions">
        <button type="button" onClick={() => document.getElementById("signed-document")?.scrollIntoView({ behavior: "smooth" })}><Icon name="documents" size={17} /> View document</button>
        <button type="button" onClick={() => openModal("edit")}><Icon name="edit" size={17} /> Edit details</button>
        <a href={`/api/envelopes/${id}/certificate`}><Icon name="certificate" size={17} /> Completion certificate</a>
        <button type="button" onClick={() => openModal("email")}><Icon name="mail" size={17} /> Email document</button>
        <a href={`/api/envelopes/${id}/document?version=signed&download=1`}><Icon name="download" size={17} /> Save PDF</a>
      </nav>

      {modal && (
        <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
          <section className="document-modal" role="dialog" aria-modal="true" aria-labelledby="document-modal-title">
            <header><h2 id="document-modal-title">{modal === "edit" ? "Edit document details" : "Email document"}</h2><button type="button" onClick={() => setModal(null)} aria-label="Close"><Icon name="close" size={20} /></button></header>
            {modal === "edit" ? (
              <form onSubmit={updateDetails}>
                <p>The completed PDF is sealed. You can change its workspace title without changing the signed file.</p>
                <label className="field-label">Document title<input value={nextTitle} onChange={(event) => setNextTitle(event.target.value)} maxLength={160} required /></label>
                {message && <div className="form-error">{message}</div>}
                <footer><button type="button" className="button button--quiet" onClick={() => setModal(null)}>Cancel</button><button className="button button--dark" disabled={busy}>{busy ? "Saving…" : "Save details"}</button></footer>
              </form>
            ) : (
              <form onSubmit={emailDocument}>
                <p>Recipients added here will receive the final signed PDF as an attachment.</p>
                <label className="field-label">Email addresses<textarea value={addresses} onChange={(event) => setAddresses(event.target.value)} placeholder="name@example.com" rows={4} /></label>
                <small>Use commas or new lines. Maximum three recipients.</small>
                {message && <div className={message.startsWith("Queued") ? "form-success" : "form-error"}>{message}</div>}
                <footer><button type="button" className="button button--quiet" onClick={() => setModal(null)}>Close</button><button className="button button--dark" disabled={busy}>{busy ? "Queuing…" : "Send document"}</button></footer>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
