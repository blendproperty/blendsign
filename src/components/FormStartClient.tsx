"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

type Role = { id: string; name: string; order: number };

export default function FormStartClient({ slug, roles }: { slug: string; roles: Role[] }) {
  const [recipients, setRecipients] = useState(roles.map((role) => ({ roleId: role.id, name: "", email: "" })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/forms/${slug}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipients }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "The signing process could not be started.");
      window.location.assign(result.signingUrl);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The signing process could not be started."); setBusy(false); }
  }
  return <section className="panel public-signform-card"><div className="section-heading"><span><Icon name="users" size={20} /></span><div><h2>Signer details</h2><p>Each person receives their own secure signing link in the required order.</p></div></div>{roles.map((role, index) => <div className="public-role" key={role.id}><div><strong>{role.name}</strong><small>Signing order {role.order}</small></div><label className="field-label">Full name<input className="field-input" autoComplete="name" value={recipients[index].name} onChange={(event) => setRecipients((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label><label className="field-label">Email address<input className="field-input" type="email" autoComplete="email" value={recipients[index].email} onChange={(event) => setRecipients((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, email: event.target.value } : item))} /></label></div>)}{error && <div className="form-error">{error}</div>}<button className="button button--accent button--full" type="button" disabled={busy || recipients.some((recipient) => !recipient.name || !recipient.email)} onClick={start}>{busy ? "Preparing…" : "Begin signing"}<Icon name="chevron" size={17} /></button><p className="public-form-note">A unique signing record and audit trail will be created for this submission.</p></section>;
}
