"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";

type Contact = { id: string; name: string; email: string | null; phone: string | null; countryCode: string; shared: boolean };
const empty = { name: "", email: "", phone: "", countryCode: "+27", shared: true };

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");
  const load = useCallback(() => { fetch("/api/settings/contacts").then((response) => response.json()).then((data) => setContacts(data.contacts || [])); }, []);
  useEffect(load, [load]);
  const filtered = useMemo(() => contacts.filter((contact) => `${contact.name} ${contact.email || ""}`.toLowerCase().includes(search.toLowerCase())), [contacts, search]);
  async function add(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/settings/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error);
    setForm(empty); setAdding(false); setMessage("Contact added."); load();
  }
  async function remove(id: string) { if (!confirm("Remove this contact?")) return; await fetch(`/api/settings/contacts?id=${id}`, { method: "DELETE" }); load(); }
  return (
    <section className="settings-page">
      <header className="settings-page-header"><div><p className="eyebrow">Company address book</p><h2>Contacts <span className="count-badge">{contacts.length}</span></h2><p>Reusable recipients for the active company.</p></div><button className="button button--dark" onClick={() => setAdding((value) => !value)}><Icon name="plus" size={17} /> Add contact</button></header>
      {message && <div className="notice-banner">{message}</div>}
      {adding && <form className="settings-form panel settings-inline-form" onSubmit={add}><div className="form-grid"><label className="field-label">Name<input className="field-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label className="field-label">Email<input className="field-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="field-label">Country code<select className="field-input" value={form.countryCode} onChange={(event) => setForm({ ...form, countryCode: event.target.value })}><option value="+27">South Africa (+27)</option><option value="+44">United Kingdom (+44)</option></select></label><label className="field-label">Phone number<input className="field-input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label></div><label className="check-label"><input type="checkbox" checked={form.shared} onChange={(event) => setForm({ ...form, shared: event.target.checked })} /> Share this contact with company users</label><div className="form-actions"><button className="button button--accent">Add contact</button><button type="button" className="button button--quiet" onClick={() => setAdding(false)}>Cancel</button></div></form>}
      <section className="panel settings-table-panel"><div className="table-toolbar"><div className="table-search"><Icon name="search" size={17} /><input placeholder="Search contacts" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><div className="table-wrap"><table className="documents-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Visibility</th><th /></tr></thead><tbody>{filtered.map((contact) => <tr key={contact.id}><td><strong>{contact.name}</strong></td><td>{contact.email || "—"}</td><td>{contact.phone ? `${contact.countryCode} ${contact.phone}` : "—"}</td><td>{contact.shared ? "Company" : "Private"}</td><td><button className="text-button text-button--danger" onClick={() => remove(contact.id)}>Remove</button></td></tr>)}</tbody></table></div>{filtered.length === 0 && <div className="empty-state empty-state--table"><span><Icon name="users" size={28} /></span><h3>No contacts found</h3><p>Add tenants, landlords, agents or suppliers to reuse them in agreements.</p></div>}</section>
    </section>
  );
}
