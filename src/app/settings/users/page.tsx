"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type CompanyUser = { id: string; name: string; email: string; role: "owner" | "admin" | "member" };

export default function UsersPage() {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "member" as CompanyUser["role"], password: "" });
  const [credential, setCredential] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(() => { fetch("/api/settings/users").then((response) => response.json()).then((data) => setUsers(data.users || [])); }, []);
  useEffect(load, [load]);
  async function add(event: FormEvent) {
    event.preventDefault();
    const body = { ...form, password: form.password || undefined };
    const response = await fetch("/api/settings/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error);
    setCredential(data.temporaryPassword || ""); setMessage(data.temporaryPassword ? "User access created. Copy the temporary password now." : "Existing BlendSign user added to this company. They can use their current password."); setAdding(false); setForm({ name: "", email: "", role: "member", password: "" }); load();
  }
  async function changeRole(user: CompanyUser, role: CompanyUser["role"]) { await fetch("/api/settings/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...user, role }) }); load(); }
  async function remove(id: string) { if (!confirm("Remove this user from the active company?")) return; const response = await fetch(`/api/settings/users?id=${id}`, { method: "DELETE" }); if (!response.ok) setMessage((await response.json()).error); else load(); }
  return (
    <section className="settings-page">
      <header className="settings-page-header"><div><p className="eyebrow">Company administration</p><h2>Users and access</h2><p>Give people access only to the companies they work with.</p></div><button className="button button--dark" onClick={() => setAdding((value) => !value)}><Icon name="plus" size={17} /> Add user</button></header>
      {message && <div className="notice-banner">{message}</div>}
      {credential && <div className="secret-reveal"><div><span>Temporary password</span><code>{credential}</code><small>It is shown once. Send it to the user securely.</small></div><button className="button button--outline" onClick={() => navigator.clipboard.writeText(credential)}>Copy</button></div>}
      {adding && <form className="settings-form panel settings-inline-form" onSubmit={add}><div className="form-grid"><label className="field-label">Full name<input className="field-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label><label className="field-label">Email<input className="field-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label className="field-label">Company role<select className="field-input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as CompanyUser["role"] })}><option value="member">Member</option><option value="admin">Administrator</option><option value="owner">Owner</option></select></label><label className="field-label">Temporary password <span>(optional)</span><input className="field-input" type="password" minLength={10} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Generate automatically" /></label></div><div className="form-actions"><button className="button button--accent">Create access</button><button type="button" className="button button--quiet" onClick={() => setAdding(false)}>Cancel</button></div></form>}
      <section className="panel settings-table-panel"><div className="table-wrap"><table className="documents-table"><thead><tr><th>User</th><th>Role</th><th>Company access</th><th /></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div className="user-cell"><span>{user.name[0]?.toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></td><td><select className="table-select" value={user.role} onChange={(event) => changeRole(user, event.target.value as CompanyUser["role"])}><option value="owner">Owner</option><option value="admin">Administrator</option><option value="member">Member</option></select></td><td><span className="status status--completed">Granted</span></td><td><button className="text-button text-button--danger" onClick={() => remove(user.id)}>Remove</button></td></tr>)}</tbody></table></div></section>
    </section>
  );
}
