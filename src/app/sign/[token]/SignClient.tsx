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
  legalDisclosure,
}: {
  token: string;
  fields: Field[];
  documentTitle: string;
  legalDisclosure?: string;
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
      <div className="sign-complete">
        <span>✓</span><h2>Signed successfully</h2>
        <p>
          Thanks — your signature on &ldquo;{documentTitle}&rdquo; has been
          recorded. You&rsquo;ll receive the completed document once every
          party has signed.
        </p>
      </div>
    );
  }

  return (
    <div className="sign-fields">
      <div className="sign-fields-heading"><p className="eyebrow">Required fields</p><h2>Complete your signing fields</h2><p>Review the PDF, complete each field and provide consent below.</p></div>
      {fields.map((f) => (
        <div className="sign-field" key={f.id}>
          <div className="sign-field-label">
            <span>{f.type.toLowerCase()}</span><small>Page {f.page}</small>
          </div>
          {f.type === "SIGNATURE" || f.type === "INITIALS" ? (
            values[f.id] ? (
              <div className="captured-signature">
                <img src={values[f.id]} alt="signature" />
                <div>
                  <button className="text-button" type="button" onClick={() => setValues((v) => ({ ...v, [f.id]: "" }))}>
                    Redo
                  </button>
                </div>
              </div>
            ) : (
              <SignatureCanvas
                width={f.type === "INITIALS" ? 360 : 680}
                height={f.type === "INITIALS" ? 170 : 230}
                label={f.type === "INITIALS" ? "initials" : "signature"}
                onCapture={(dataUrl) => setValues((v) => ({ ...v, [f.id]: dataUrl }))}
              />
            )
          ) : f.type === "CHECKBOX" ? (
            <label className="sign-checkbox-field">
              <input
                type="checkbox"
                checked={values[f.id] === "X"}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.checked ? "X" : "" }))}
              />
              <span>Tick to confirm</span>
            </label>
          ) : (
            <input
              type={f.type === "DATE" ? "date" : "text"}
              placeholder="Type here"
              value={values[f.id] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
              className="field-input"
            />
          )}
        </div>
      ))}

      <label className="sign-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          {legalDisclosure || "I consent to sign this document electronically and understand that this constitutes a legally binding signature under the Electronic Communications and Transactions Act."}
        </span>
      </label>

      {error && <p className="form-error">{error}</p>}

      <button className="button sign-submit"
        type="button"
        disabled={!allFilled || !consent || submitting}
        onClick={submit}
      >
        {submitting ? "Submitting…" : "Complete signing"}
      </button>
    </div>
  );
}
