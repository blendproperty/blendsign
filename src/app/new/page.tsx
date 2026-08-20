"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import SelfSignEditor from "@/components/SelfSignEditor";

type SignerInput = { name: string; email: string; order: number };

// MVP envelope creation flow: upload a PDF, add signers, send. Field
// placement here is a simplified default (signature and initials on page 1
// per signer) rather than a drag-and-drop editor — that's the next thing
// to build (see README "Project status").
export default function NewEnvelope() {
  return <Suspense fallback={<div className="page"><div className="panel template-editor-empty">Loading document workflow…</div></div>}><NewEnvelopeRouter /></Suspense>;
}

function NewEnvelopeRouter() {
  const searchParams = useSearchParams();
  return searchParams.get("mode") === "self" ? <SelfSignEditor /> : <NewEnvelopeForm />;
}

function NewEnvelopeForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [signers, setSigners] = useState<SignerInput[]>([
    { name: "", email: "", order: 0 },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateSigner(i: number, patch: Partial<SignerInput>) {
    setSigners((s) => s.map((sig, idx) => (idx === i ? { ...sig, ...patch } : sig)));
  }

  async function submit() {
    if (!file) return setError("Choose a PDF first");
    if (file.size > 20 * 1024 * 1024) return setError("PDF documents may not exceed 20 MB.");
    setBusy(true);
    setError(null);
    try {
      // 1. upload through BlendSign so the private MinIO service never
      // needs to be exposed to the browser or configured for CORS.
      const upRes = await fetch("/api/documents/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const upload = await upRes.json();
      if (!upRes.ok) throw new Error(upload.error || "The PDF could not be uploaded.");

      // 2. create the envelope in the active company workspace
      const envRes = await fetch("/api/envelopes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          originalKey: upload.key,
          signers,
          fields: signers.flatMap((_, i) => [
            {
              signerIndex: i,
              type: "SIGNATURE",
              page: 1,
              x: 0.1,
              y: 0.82,
              width: 0.34,
              height: 0.1,
            },
            {
              signerIndex: i,
              type: "INITIALS",
              page: 1,
              x: 0.5,
              y: 0.82,
              width: 0.15,
              height: 0.1,
            },
          ]),
        }),
      });
      if (!envRes.ok) throw new Error((await envRes.json()).error ?? "failed");
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page new-document-page">
      <section className="page-heading page-heading--row">
        <div><p className="eyebrow">New signing request</p><h1>Prepare a document</h1><p>Upload the PDF and add everyone who needs to sign.</p></div>
        <Link href="/dashboard" className="button button--quiet">Cancel</Link>
      </section>

      <div className="workflow-layout">
        <section className="workflow-main">
          <div className="panel form-section">
            <div className="section-heading"><span>1</span><div><h2>Document details</h2><p>Name the request and attach one PDF document.</p></div></div>
            <label className="field-label">Document title<input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Example: Midpoint lease agreement" /></label>
            <label className={`upload-zone ${file ? "has-file" : ""}`}>
              <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <span className="upload-icon"><Icon name={file ? "file" : "upload"} size={28} /></span>
              {file ? <><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB · PDF</small></> : <><strong>Drop your PDF here or browse</strong><small>PDF documents up to 20 MB</small></>}
            </label>
          </div>

          <div className="panel form-section">
            <div className="section-heading"><span>2</span><div><h2>Add signers</h2><p>Set the people and order required for this document.</p></div></div>
            <div className="signer-list">
              {signers.map((signer, index) => (
                <div className="signer-card" key={index}>
                  <div className="signer-number">{index + 1}</div>
                  <label className="field-label">Full name<input className="field-input" placeholder="Signer name" value={signer.name} onChange={(e) => updateSigner(index, { name: e.target.value })} /></label>
                  <label className="field-label">Email address<input className="field-input" type="email" placeholder="name@company.co.za" value={signer.email} onChange={(e) => updateSigner(index, { email: e.target.value })} /></label>
                  <label className="field-label field-label--order">Order<input className="field-input" type="number" min="0" title="Signers with the same number sign in parallel" value={signer.order} onChange={(e) => updateSigner(index, { order: Number(e.target.value) })} /></label>
                  {signers.length > 1 && <button className="remove-signer" type="button" onClick={() => setSigners((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>}
                </div>
              ))}
            </div>
            <button className="button button--outline add-signer" type="button" onClick={() => setSigners((items) => [...items, { name: "", email: "", order: items.length }])}><Icon name="plus" size={17} /> Add another signer</button>
          </div>
        </section>

        <aside className="workflow-summary panel">
          <span className="summary-icon"><Icon name="shield" size={25} /></span>
          <h2>Ready to send?</h2>
          <p>BlendSign will create a secure signing link for each recipient and record every audit event.</p>
          <dl><div><dt>Document</dt><dd>{file ? "1 PDF" : "Not added"}</dd></div><div><dt>Signers</dt><dd>{signers.length}</dd></div><div><dt>Delivery</dt><dd>Email</dd></div></dl>
          {error && <div className="form-error">{error}</div>}
          <button className="button button--accent button--full" type="button" disabled={busy || !title || !file || signers.some((signer) => !signer.name || !signer.email)} onClick={submit}>{busy ? "Sending…" : "Send for signature"}<Icon name="send" size={18} /></button>
          <small className="summary-note">By sending, you confirm that you are authorised to request these signatures.</small>
        </aside>
      </div>
    </div>
  );
}
