"use client";

import { FormEvent, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type Profile = { name: string; email: string; firstName: string | null; lastName: string | null; company: string | null; jobTitle: string | null; dateFormat: string; timezone: string };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/settings/profile").then((response) => response.json()).then((data) => setProfile(data.profile)); }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/settings/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
    setMessage(response.ok ? "Profile saved." : (await response.json()).error);
  }
  if (!profile) return <div className="settings-loading">Loading profile…</div>;
  return (
    <section className="settings-page">
      <header className="settings-page-header"><div><p className="eyebrow">Personal settings</p><h2>My profile</h2><p>Your details are used as the sender identity and in the audit trail.</p></div><span className="settings-header-icon"><Icon name="users" size={27} /></span></header>
      <form className="settings-form panel" onSubmit={save}>
        <div className="profile-summary"><span>{(profile.firstName?.[0] || profile.name[0] || "A").toUpperCase()}</span><div><strong>{profile.name}</strong><small>{profile.email}</small></div></div>
        <div className="form-grid">
          <label className="field-label">First name<input className="field-input" value={profile.firstName || ""} onChange={(event) => setProfile({ ...profile, firstName: event.target.value })} /></label>
          <label className="field-label">Last name<input className="field-input" value={profile.lastName || ""} onChange={(event) => setProfile({ ...profile, lastName: event.target.value })} /></label>
          <label className="field-label">Company<input className="field-input" value={profile.company || ""} onChange={(event) => setProfile({ ...profile, company: event.target.value })} /></label>
          <label className="field-label">Job title<input className="field-input" value={profile.jobTitle || ""} onChange={(event) => setProfile({ ...profile, jobTitle: event.target.value })} /></label>
          <label className="field-label">Date format<select className="field-input" value={profile.dateFormat} onChange={(event) => setProfile({ ...profile, dateFormat: event.target.value })}><option>dd MMM yyyy, HH:mm</option><option>yyyy-MM-dd HH:mm</option><option>dd/MM/yyyy HH:mm</option></select></label>
          <label className="field-label">Time zone<select className="field-input" value={profile.timezone} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })}><option>Africa/Johannesburg</option><option>Africa/Cape_Town</option></select></label>
        </div>
        <div className="form-actions"><button className="button button--accent">Save profile</button>{message && <span className="form-message">{message}</span>}</div>
      </form>
    </section>
  );
}
