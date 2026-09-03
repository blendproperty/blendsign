"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type Entity = { id: string; name: string; email: string | null; country: string; timezone: string; logoUrl: string | null; logoKey: string | null; updatedAt: string; primaryColour: string; accentColour: string };

export default function CompaniesPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [activeId, setActiveId] = useState("");
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activatingId, setActivatingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", country: "South Africa", timezone: "Africa/Johannesburg" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/settings/entities");
    const data = await response.json();
    if (!response.ok) setError(data.error || "Companies could not be loaded.");
    else {
      setEntities(data.entities || []);
      setActiveId(data.activeId || "");
      setCanCreate(Boolean(data.canCreate));
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/settings/entities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) return setError(data.error || "The company could not be created.");
    setMessage(`${data.entity.name} was created. Activate it to configure its workspace.`);
    setForm({ name: "", email: "", country: "South Africa", timezone: "Africa/Johannesburg" });
    setShowForm(false);
    load();
  }

  async function activate(entity: Entity) {
    setError(""); setMessage(""); setActivatingId(entity.id);
    const response = await fetch("/api/settings/entities/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityId: entity.id }) });
    const data = await response.json();
    if (!response.ok) {
      setActivatingId("");
      return setError(data.error || "The company could not be activated.");
    }
    setActiveId(entity.id);
    setMessage(`${entity.name} is now the active company. Its documents, templates, branding and API settings are in use.`);
    router.refresh();
    window.location.reload();
  }

  const logo = (entity: Entity) => entity.logoKey ? `/api/brand/${entity.id}/logo?v=${new Date(entity.updatedAt).getTime()}` : entity.logoUrl;

  return <div className="page">
    <section className="page-heading page-heading--row">
      <div><p className="eyebrow">All company overview</p><h1>Companies</h1><p>Select one company at a time. Everything else in BlendSign then works inside that company’s workspace.</p></div>
      {canCreate && <button className="button button--dark" onClick={() => setShowForm((value) => !value)}><Icon name="plus" size={17} /> Add company</button>}
    </section>
    {message && <div className="notice-banner">{message}</div>}
    {error && <div className="notice-banner notice-banner--error">{error}</div>}
    {showForm && <form className="settings-form panel settings-inline-form" onSubmit={create}><div className="form-grid"><label className="field-label">Company name<input className="field-input" placeholder="Stor 24" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label className="field-label">Company email<input className="field-input" type="email" placeholder="leases@stor24.co.za" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="field-label">Country<input className="field-input" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></label><label className="field-label">Time zone<select className="field-input" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option>Africa/Johannesburg</option></select></label></div><div className="form-actions"><button className="button button--accent">Create company</button><button type="button" className="button button--quiet" onClick={() => setShowForm(false)}>Cancel</button></div></form>}
    {loading ? <div className="panel settings-loading">Loading companies…</div> : <div className="entity-grid">
      {entities.map((entity) => {
        const active = entity.id === activeId;
        const logoUrl = logo(entity);
        return <article className={`entity-card panel ${active ? "is-active" : ""}`} key={entity.id}>
          <div className="entity-brand" style={{ background: entity.primaryColour, color: entity.accentColour }}>{logoUrl ? <img src={logoUrl} alt={`${entity.name} logo`} /> : entity.name.split(" ").map((word) => word[0]).join("").slice(0, 3)}</div>
          <div className="entity-card-copy"><span className="entity-state">{active ? "Active company" : "Company workspace"}</span><h3>{entity.name}</h3><p>{entity.email || "No company email set"}</p><small>{entity.country} · {entity.timezone}</small></div>
          <div className="entity-card-actions">{active ? <><span className="active-company-confirmation"><Icon name="check" size={15} /> Currently active</span><Link href="/settings/branding" className="text-button">Branding</Link><Link href="/settings/integrations" className="text-button">API & integrations</Link><Link href="/templates" className="button button--outline">Open workspace</Link></> : <button type="button" className="button button--dark" disabled={activatingId === entity.id} onClick={() => activate(entity)}>{activatingId === entity.id ? "Activating…" : "Activate company"}</button>}</div>
        </article>;
      })}
      {entities.length === 0 && !error && <div className="panel empty-state"><span><Icon name="building" size={30} /></span><h2>No companies available</h2><p>Add a company or ask an administrator to give you access.</p></div>}
    </div>}
  </div>;
}
