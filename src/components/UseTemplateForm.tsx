"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";

type Template = { id: string; name: string; description: string | null; roles: { id: string; name: string; order: number }[] };

export default function UseTemplateForm({ template }: { template: Template }) {
  const router = useRouter();
  const [title, setTitle] = useState(template.name);
  const [recipients, setRecipients] = useState(template.roles.map((role) => ({ roleId: role.id, name: "", email: "" })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/templates/${template.id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, recipients }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "The request could not be sent.");
      router.push("/documents"); router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request could not be sent.");
    } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <section className="page-heading page-heading--row"><div><p className="eyebrow">Use template</p><h1>{template.name}</h1><p>{template.description || "Assign a recipient to each signer role."}</p></div><Link href="/templates" className="button button--quiet">Cancel</Link></section>
      <section className="panel template-send-form">
        <label className="field-label">Document title<input className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <div className="section-heading"><span><Icon name="users" size={19} /></span><div><h2>Assign signer roles</h2><p>Emails are sent according to each role's signing order.</p></div></div>
        {template.roles.map((role, index) => <div className="template-recipient-row" key={role.id}><div><strong>{role.name}</strong><small>Order {role.order}</small></div><input className="field-input" placeholder="Full name" value={recipients[index].name} onChange={(event) => setRecipients((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><input className="field-input" type="email" placeholder="name@company.co.za" value={recipients[index].email} onChange={(event) => setRecipients((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, email: event.target.value } : item))} /></div>)}
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions"><button className="button button--accent" type="button" disabled={busy || recipients.some((recipient) => !recipient.name || !recipient.email)} onClick={send}>{busy ? "Sending…" : "Send for signature"}<Icon name="send" size={17} /></button></div>
      </section>
    </div>
  );
}
