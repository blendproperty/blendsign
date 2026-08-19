"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type Entity = { id: string; name: string; email: string | null; country: string; timezone: string; logoUrl: string | null; logoKey: string | null; updatedAt: string; primaryColour: string; accentColour: string };

export default function EntitiesPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [activeId, setActiveId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", country: "South Africa", timezone: "Africa/Johannesburg" });
  const [message, setMessage] = useState("");
  const load = useCallback(() => { fetch("/api/settings/entities").then((response) => response.json()).then((data) => { setEntities(data.entities || []); setActiveId(data.activeId); }); }, []);
  useEffect(load, [load]);
  async function create(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/settings/entities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error);
    setMessage(`${data.entity.name} created. Switch to it from the top bar to configure its brand.`);
    setForm({ name: "", email: "", country: "South Africa", timezone: "Africa/Johannesburg" });
    setShowForm(false);
    load();
  }
  async function activate(entity: Entity) {
    setMessage(`Activating ${entity.name}…`);
    const response = await fetch("/api/settings/entities/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityId: entity.id }) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "The company could not be activated.");
    setActiveId(entity.id);
    setMessage(`${entity.name} is now the active company.`);
    router.refresh();
    window.location.reload();
  }
  const logo = (entity: Entity) => entity.logoKey ? `/api/brand/${entity.id}/logo?v=${new Date(entity.updatedAt).getTime()}` : entity.logoUrl;
  return (
    <section className="settings-page">
      <header className="settings-page-header"><div><p className="eyebrow">Multi-company workspace</p><h2>Companies</h2><p>Keep every company’s agreements, branding, contacts and integrations separate.</p></div><button className="button button--dark" onClick={() => setShowForm((value) => !value)}><Icon name="plus" size={17} /> Add company</button></header>
      {message && <div className="notice-banner">{message}</div>}
      {showForm && <form className="settings-form panel settings-inline-form" onSubmit={create}><div className="form-grid"><label className="field-label">Company name<input className="field-input" placeholder="Stor 24" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label className="field-label">Company email<input className="field-input" type="email" placeholder="leases@stor24.co.za" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="field-label">Country<input className="field-input" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></label><label className="field-label">Time zone<select className="field-input" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option>Africa/Johannesburg</option></select></label></div><div className="form-actions"><button className="button button--accent">Create company</button><button type="button" className="button button--quiet" onClick={() => setShowForm(false)}>Cancel</button></div></form>}
      <div className="entity-grid">
        {entities.map((entity) => {
          const active = entity.id === activeId;
          const logoUrl = logo(entity);
          return <article className={`entity-card panel ${active ? "is-active" : ""}`} key={entity.id}>
            <div className="entity-brand" style={{ background: entity.primaryColour, color: entity.accentColour }}>{logoUrl ? <img src={logoUrl} alt={`${entity.name} logo`} /> : entity.name.split(" ").map((word) => word[0]).join("").slice(0, 3)}</div>
            <div className="entity-card-copy"><span className="entity-state">{active ? "Active company" : "Available company"}</span><h3>{entity.name}</h3><p>{entity.email || "No company email set"}</p><small>{entity.country} · {entity.timezone}</small></div>
            <div className="entity-card-actions">{active ? <Link href="/settings/branding" className="button button--outline">Configure branding</Link> : <button type="button" className="button button--dark" onClick={() => activate(entity)}>Activate company</button>}</div>
          </article>;
        })}
      </div>
    </section>
  );
}
