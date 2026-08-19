"use client";

import { useState } from "react";
import SignatureCanvas from "@/components/SignatureCanvas";

type Field = {
  id: string;
  type: "SIGNATURE" | "INITIALS" | "DATE" | "TEXT" | "CHECKBOX";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export default function SignClient({
  token,
  fields,
  documentTitle,
}: {
  token: string;
  fields: Field[];
  documentTitle: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allFilled = fields.every((f) => values[f.id]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          fields: Object.entries(values).map(([fieldId, value]) => ({
            fieldId,
            value,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "failed");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div>
        <h2>Signed</h2>
        <p>
          Thanks — your signature on &ldquo;{documentTitle}&rdquo; has been
          recorded. You&rsquo;ll receive the completed document once every
          party has signed.
        </p>
      </div>
    );
  }

  return (
    <div>
      {fields.map((f) => (
        <div key={f.id} style={{ margin: "20px 0", paddingBottom: 16, borderBottom: "1px solid #eee" }}>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>
            Page {f.page} — {f.type.toLowerCase()}
          </div>
          {f.type === "SIGNATURE" || f.type === "INITIALS" ? (
            values[f.id] ? (
              <div>
                <img src={values[f.id]} alt="signature" style={{ border: "1px solid #ccc", background: "#fff" }} />
                <div>
                  <button type="button" onClick={() => setValues((v) => ({ ...v, [f.id]: "" }))}>
                    Redo
                  </button>
                </div>
              </div>
            ) : (
              <SignatureCanvas
                width={Math.round(f.width * 400) || 300}
                height={Math.round(f.height * 400) || 100}
                onCapture={(dataUrl) => setValues((v) => ({ ...v, [f.id]: dataUrl }))}
              />
            )
          ) : (
            <input
              type="text"
              placeholder={f.type === "DATE" ? "DD/MM/YYYY" : "Type here"}
              value={values[f.id] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
              style={{ padding: 6, width: "100%", maxWidth: 300 }}
            />
          )}
        </div>
      ))}

      <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "16px 0" }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I consent to sign this document electronically and understand this
          constitutes a legally binding signature under the ECT Act.
        </span>
      </label>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <button
        type="button"
        disabled={!allFilled || !consent || submitting}
        onClick={submit}
      >
        {submitting ? "Submitting…" : "Complete signing"}
      </button>
    </div>
  );
}
