"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import SignatureCapture from "@/components/SignatureCapture";

type Organisation = {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  province: string | null;
  country: string;
  postalCode: string | null;
  email: string | null;
  timezone: string;
  customDomain: string | null;
  legalDisclosure: string | null;
  logoUrl: string | null;
  logoKey: string | null;
  primaryColour: string;
  accentColour: string;
  emailFromName: string | null;
  emailFromAddress: string | null;
  authorisedSignerName: string | null;
  authorisedSignerTitle: string | null;
  autoSignEnabled: boolean;
  updatedAt: string;
};

export default function BrandingPage() {
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [section, setSection] = useState("organisation");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [signatureConfigured, setSignatureConfigured] = useState(false);
  const [initialsConfigured, setInitialsConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/settings/organisation")
      .then((response) => response.json())
      .then((data) => { setOrganisation(data.organisation); setSignatureConfigured(Boolean(data.signatureConfigured)); setInitialsConfigured(Boolean(data.initialsConfigured)); });
  }, []);

  const displayedLogo = useMemo(() => {
    if (!organisation) return null;
    if (organisation.logoKey) return `/api/brand/${organisation.id}/logo?v=${new Date(organisation.updatedAt).getTime()}`;
    return organisation.logoUrl;
  }, [organisation]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("Saving…");
    const response = await fetch("/api/settings/organisation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(organisation),
    });
    const data = await response.json();
    if (response.ok) setOrganisation(data.organisation);
    setMessage(response.ok ? `${data.organisation.name} branding saved.` : data.error);
  }

  async function uploadLogo(file: File | null) {
    if (!file) return;
    setUploading(true);
    setMessage("Uploading logo…");
    const response = await fetch("/api/settings/organisation/logo", {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(file.name) },
      body: file,
    });
    const data = await response.json();
    setUploading(false);
    if (!response.ok) return setMessage(data.error || "The logo could not be uploaded.");
    setOrganisation(data.organisation);
    setMessage(`${data.organisation.name} logo uploaded.`);
  }

  async function removeLogo() {
    if (!confirm("Remove this company logo?")) return;
    const response = await fetch("/api/settings/organisation/logo", { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "The logo could not be removed.");
    setOrganisation(data.organisation);
    setMessage("Company logo removed.");
  }

  async function uploadSigningAsset(kind: "signature" | "initials", file: Blob | null) {
    if (!file) return;
    setUploading(true); setMessage(`Uploading authorised ${kind}…`);
    const response = await fetch(`/api/settings/organisation/signing-assets/${kind}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
    const data = await response.json(); setUploading(false);
    if (!response.ok) return setMessage(data.error || `The ${kind} could not be uploaded.`);
    setOrganisation(data.organisation); setSignatureConfigured(Boolean(data.signatureConfigured)); setInitialsConfigured(Boolean(data.initialsConfigured));
    setMessage(`Authorised ${kind} uploaded. Auto-signing remains disabled until explicitly enabled.`);
  }

  async function saveCapturedSigningAsset(kind: "signature" | "initials", dataUrl: string) {
    try {
      const file = await fetch(dataUrl).then((response) => response.blob());
      await uploadSigningAsset(kind, file);
    } catch {
      setMessage(`The authorised ${kind} could not be prepared for storage.`);
    }
  }

  if (!organisation) return <div className="settings-loading">Loading company settings…</div>;
  const set = (key: keyof Organisation, value: string) => setOrganisation({ ...organisation, [key]: value });

  return (
    <section className="settings-page">
      <header className="settings-page-header">
        <div><p className="eyebrow">Active company</p><h2>Branding and legal</h2><p>Configure {organisation.name}. These details appear in its signing emails and recipient experience.</p></div>
        <span className="settings-header-icon"><Icon name="template" size={27} /></span>
      </header>
      <div className="branding-layout">
        <nav className="branding-nav">
          <button type="button" className={section === "organisation" ? "is-active" : ""} onClick={() => setSection("organisation")}>Organisation details</button>
          <button type="button" className={section === "identity" ? "is-active" : ""} onClick={() => setSection("identity")}>Visual identity</button>
          <button type="button" className={section === "signing" ? "is-active" : ""} onClick={() => setSection("signing")}>Authorised signing</button>
          <button type="button" className={section === "legal" ? "is-active" : ""} onClick={() => setSection("legal")}>Legal disclosure</button>
          <button type="button" className={section === "domain" ? "is-active" : ""} onClick={() => setSection("domain")}>Custom domain</button>
        </nav>
        <form className="settings-form panel" onSubmit={save}>
          {section === "organisation" && <>
            <div className="form-section-title"><h3>Organisation details</h3><p>Legal, contact and email sender information for {organisation.name}.</p></div>
            <div className="form-grid">
              <label className="field-label">Name<input className="field-input" value={organisation.name} onChange={(event) => set("name", event.target.value)} required /></label>
              <label className="field-label">Company email<input className="field-input" type="email" value={organisation.email || ""} onChange={(event) => set("email", event.target.value)} /></label>
              <label className="field-label form-span-2">Street address<input className="field-input" value={organisation.street || ""} onChange={(event) => set("street", event.target.value)} /></label>
              <label className="field-label">City<input className="field-input" value={organisation.city || ""} onChange={(event) => set("city", event.target.value)} /></label>
              <label className="field-label">Province<input className="field-input" value={organisation.province || ""} onChange={(event) => set("province", event.target.value)} /></label>
              <label className="field-label">Country<input className="field-input" value={organisation.country} onChange={(event) => set("country", event.target.value)} /></label>
              <label className="field-label">Postal code<input className="field-input" value={organisation.postalCode || ""} onChange={(event) => set("postalCode", event.target.value)} /></label>
              <label className="field-label">Time zone<select className="field-input" value={organisation.timezone} onChange={(event) => set("timezone", event.target.value)}><option>Africa/Johannesburg</option></select></label>
              <label className="field-label">Email sender name<input className="field-input" value={organisation.emailFromName || ""} onChange={(event) => set("emailFromName", event.target.value)} placeholder={organisation.name} /></label>
              <label className="field-label form-span-2">Email sender address <span>Optional. It must be authorised by your SMTP provider.</span><input className="field-input" type="email" value={organisation.emailFromAddress || ""} onChange={(event) => set("emailFromAddress", event.target.value)} placeholder="signing@company.co.za" /></label>
            </div>
            <div className="legal-note"><Icon name="mail" size={20} /><p>Recipients will see the company sender name. If no company-specific sender address is entered, BlendSign uses the server’s authorised SMTP address and replies go to the company email above.</p></div>
          </>}

          {section === "identity" && <>
            <div className="form-section-title"><h3>Visual identity</h3><p>Upload this company’s logo and set the colours used in its signing pages and emails.</p></div>
            <div className="brand-preview" style={{ color: organisation.primaryColour, borderTopColor: organisation.accentColour }}>
              {displayedLogo ? <img src={displayedLogo} alt={`${organisation.name} logo`} /> : <span>{organisation.name}</span>}
              <span className="brand-preview-button" style={{ background: organisation.primaryColour }}>Review and sign</span>
              <small>Securely powered by BlendSign</small>
            </div>
            <div className="brand-logo-row">
              <label className={`brand-logo-upload ${uploading ? "is-uploading" : ""}`}>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploading} onChange={(event) => { uploadLogo(event.target.files?.[0] || null); event.currentTarget.value = ""; }} />
                <Icon name="upload" size={21} />
                <span><strong>{uploading ? "Uploading…" : displayedLogo ? "Replace company logo" : "Upload company logo"}</strong><small>PNG, JPG, WebP or SVG. Maximum 5 MB.</small></span>
              </label>
              {displayedLogo && <button type="button" className="button button--quiet" onClick={removeLogo}>Remove logo</button>}
            </div>
            <details className="hosted-logo-option">
              <summary>Use a hosted logo URL instead</summary>
              <label className="field-label">Logo URL<input className="field-input" type="url" value={organisation.logoUrl || ""} onChange={(event) => set("logoUrl", event.target.value)} placeholder="https://company.co.za/logo.svg" disabled={Boolean(organisation.logoKey)} /></label>
            </details>
            <div className="form-grid">
              <label className="field-label">Primary colour<div className="colour-field"><input type="color" value={organisation.primaryColour} onChange={(event) => set("primaryColour", event.target.value)} /><input className="field-input" value={organisation.primaryColour} onChange={(event) => set("primaryColour", event.target.value)} /></div></label>
              <label className="field-label">Accent colour<div className="colour-field"><input type="color" value={organisation.accentColour} onChange={(event) => set("accentColour", event.target.value)} /><input className="field-input" value={organisation.accentColour} onChange={(event) => set("accentColour", event.target.value)} /></div></label>
            </div>
          </>}

          {section === "legal" && <>
            <div className="form-section-title"><h3>Legal disclosure</h3><p>Shown before recipients consent to electronic signing.</p></div>
            <label className="field-label">Custom legal disclosure<textarea className="field-input field-textarea" rows={10} value={organisation.legalDisclosure || ""} onChange={(event) => set("legalDisclosure", event.target.value)} placeholder="By selecting Accept and Sign, I consent to use electronic records and electronic signatures…" /></label>
            <div className="legal-note"><Icon name="shield" size={20} /><p>Keep wording appropriate for the Electronic Communications and Transactions Act and your company’s legal requirements.</p></div>
          </>}

          {section === "signing" && <>
            <div className="form-section-title"><h3>Authorised company signing</h3><p>Store the authorised representative’s signing assets for audited countersigning. Creating or replacing either image disables automation until it is reviewed and enabled again.</p></div>
            <div className="form-grid">
              <label className="field-label">Authorised representative<input className="field-input" value={organisation.authorisedSignerName || ""} onChange={(event) => set("authorisedSignerName", event.target.value)} placeholder="Full legal name" /></label>
              <label className="field-label">Position / title<input className="field-input" value={organisation.authorisedSignerTitle || ""} onChange={(event) => set("authorisedSignerTitle", event.target.value)} placeholder="Authorised representative" /></label>
            </div>
            <div className="authorised-signing-assets">
              <section className="authorised-signing-asset">
                <div><h4>Authorised signature</h4><p>{signatureConfigured ? "Signature configured. Creating another will replace it." : "Choose Type, Draw or Upload to create the stored signature."}</p></div>
                <SignatureCapture signerName={organisation.authorisedSignerName || ""} label="signature" onCapture={(dataUrl) => { void saveCapturedSigningAsset("signature", dataUrl); }} />
              </section>
              <section className="authorised-signing-asset">
                <div><h4>Authorised initials</h4><p>{initialsConfigured ? "Initials configured. Creating another will replace them." : "Choose Type, Draw or Upload to create the stored initials."}</p></div>
                <SignatureCapture signerName={organisation.authorisedSignerName || ""} label="initials" onCapture={(dataUrl) => { void saveCapturedSigningAsset("initials", dataUrl); }} />
              </section>
            </div>
            <label className="check-label"><input type="checkbox" checked={organisation.autoSignEnabled} disabled={!signatureConfigured || !initialsConfigured || !organisation.authorisedSignerName} onChange={(event) => setOrganisation({ ...organisation, autoSignEnabled: event.target.checked })} /><span>Allow approved integrations to apply this representative’s stored signature and initials automatically</span></label>
            <div className="legal-note"><Icon name="shield" size={20} /><p>Every automatic signature is attributed to this representative and written to the envelope audit trail. Integrations must request it explicitly per envelope.</p></div>
          </>}

          {section === "domain" && <>
            <div className="form-section-title"><h3>Custom domain</h3><p>Use a company-specific signing address, for example sign.stor24.co.za.</p></div>
            <label className="field-label">Signing domain<input className="field-input" value={organisation.customDomain || ""} onChange={(event) => set("customDomain", event.target.value)} placeholder="sign.stor24.co.za" /></label>
            <div className="dns-guide"><span>1</span><div><strong>Create a CNAME record</strong><code>sign → {process.env.NEXT_PUBLIC_APP_DOMAIN || "your BlendSign host"}</code></div></div>
            <div className="dns-guide"><span>2</span><div><strong>Save the domain here</strong><p>DNS and TLS must be configured on the server before it can receive live traffic.</p></div></div>
          </>}

          <div className="form-actions"><button className="button button--accent">Save settings</button>{message && <span className="form-message">{message}</span>}</div>
        </form>
      </div>
    </section>
  );
}
