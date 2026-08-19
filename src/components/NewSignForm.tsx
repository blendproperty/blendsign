"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type SignFormInitial = { id: string; name: string; slug: string; description: string; templateId: string; active: boolean };

export default function NewSignForm({ templates, initial }: { templates: { id: string; name: string; roles: number; fields: number }[]; initial?: SignFormInitial }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name || "");
  const [slug, setSlug] = useState(initial?.slug || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [templateId, setTemplateId] = useState(initial?.templateId || templates[0]?.id || "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function changeName(value: string) { setName(value); if (!initial) setSlug(value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }
  async function save() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(initial ? `/api/signforms/${initial.id}` : "/api/signforms", { method: initial ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, slug, description, templateId, active }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "The SignForm could not be created.");
      router.push("/signforms"); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The SignForm could not be created."); } finally { setBusy(false); }
  }
  return <div className="page"><section className="page-heading page-heading--row"><div><p className="eyebrow">Public workflow</p><h1>{initial ? "Edit SignForm" : "Create a SignForm"}</h1><p>{initial ? "Update the public workflow, linked template and availability." : "Turn an approved template into a link that can start a fresh signing request."}</p></div><Link href="/signforms" className="button button--quiet">Cancel</Link></section><section className="panel settings-form signform-create-form">{templates.length ? <><label className="field-label">SignForm name<input className="field-input" value={name} onChange={(event) => changeName(event.target.value)} placeholder="Stor24 online lease" /></label><label className="field-label">Public link<input className="field-input" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="stor24-online-lease" /></label><label className="field-label">Template<select className="field-input" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.roles} roles · {template.fields} fields</option>)}</select></label><label className="field-label">Introduction<textarea className="field-input field-textarea" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain who should complete this form and what happens next." /></label>{initial && <label className="signform-availability"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>Public link active</strong><small>Turn this off to pause new submissions without deleting the SignForm.</small></span></label>}{error && <div className="form-error">{error}</div>}<div className="form-actions"><button type="button" className="button button--accent" disabled={busy || !name || !slug || !templateId} onClick={save}>{busy ? "Saving…" : initial ? "Update SignForm" : "Create SignForm"}</button></div></> : <div className="empty-state"><h2>A template is required</h2><p>Create and prepare the PDF fields before publishing a SignForm.</p><Link href="/templates/new" className="button button--dark">Create template</Link></div>}</section></div>;
}
