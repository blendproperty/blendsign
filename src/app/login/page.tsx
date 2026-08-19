"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { BlendSignLogo } from "@/components/BlendSignLogo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Unable to sign in.");
      setBusy(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="login-page">
      <section className="login-brand">
        <BlendSignLogo inverse className="login-brand-logo" />
        <p className="eyebrow">Blend Property Group</p>
        <h1>Secure agreements.<br />One stable.</h1>
        <p>Manage every signing workflow across Blend Property Group, Stor 24 and future operating companies.</p>
        <div className="login-assurance"><Icon name="shield" size={20} /><span>Private company workspaces<br /><small>South African-hosted document storage</small></span></div>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <BlendSignLogo className="login-card-logo" />
          <div><p className="eyebrow">Administration</p><h2>Sign in to BlendSign</h2><p>Use your administrator or company user credentials.</p></div>
          <label className="field-label">Email address<input className="field-input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className="field-label">Password<input className="field-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="button button--accent button--full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
