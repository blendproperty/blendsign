"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SignerInput = { name: string; email: string; order: number };

// MVP envelope creation flow: upload a PDF, add signers, send. Field
// placement here is a simplified default (one signature box on page 1
// per signer) rather than a drag-and-drop editor — that's the next thing
// to build (see README "Project status").
export default function NewEnvelope() {
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
    setBusy(true);
    setError(null);
    try {
      // 1. get presigned upload URL and PUT the file directly to storage
      const upRes = await fetch("/api/documents/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      const { url, key } = await upRes.json();
      await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });

      // 2. create the envelope — TODO: replace hardcoded orgId/createdById
      // once auth is wired up
      const envRes = await fetch("/api/envelopes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: "demo-org",
          createdById: "demo-user",
          title,
          originalKey: key,
          signers,
          fields: signers.map((_, i) => ({
            signerIndex: i,
            type: "SIGNATURE",
            page: 1,
            x: 0.1,
            y: 0.85,
            width: 0.3,
            height: 0.08,
          })),
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
    <main style={{ maxWidth: 640, margin: "40px auto", padding: "0 24px" }}>
      <h1>New envelope</h1>

      <label style={{ display: "block", marginBottom: 12 }}>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ display: "block", width: "100%", padding: 6 }}
        />
      </label>

      <label style={{ display: "block", marginBottom: 20 }}>
        Document (PDF)
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ display: "block", marginTop: 4 }}
        />
      </label>

      <h3>Signers</h3>
      {signers.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            placeholder="Name"
            value={s.name}
            onChange={(e) => updateSigner(i, { name: e.target.value })}
          />
          <input
            placeholder="Email"
            value={s.email}
            onChange={(e) => updateSigner(i, { email: e.target.value })}
          />
          <input
            type="number"
            title="Signing order (same number = parallel)"
            value={s.order}
            onChange={(e) => updateSigner(i, { order: Number(e.target.value) })}
            style={{ width: 60 }}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => setSigners((s) => [...s, { name: "", email: "", order: s.length }])}
      >
        + Add signer
      </button>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <div style={{ marginTop: 24 }}>
        <button type="button" disabled={busy || !title || !file} onClick={submit}>
          {busy ? "Sending…" : "Send for signature"}
        </button>
      </div>
    </main>
  );
}
