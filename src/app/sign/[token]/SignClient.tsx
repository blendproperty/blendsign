"use client";

import { useState } from "react";
import SignatureCapture from "@/components/SignatureCapture";

type Field = {
  id: string;
  type: "SIGNATURE" | "INITIALS" | "DATE" | "TEXT" | "CHECKBOX";
  label: string | null;
  required: boolean;
  editableBySigner: boolean;
  value: string | null;
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
  signerName,
}: {
  token: string;
  fields: Field[];
  documentTitle: string;
  legalDisclosure?: string;
  signerName: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.filter((field) => field.value).map((field) => [field.id, field.value!])))
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureGroups = Array.from(
    new Set(fields.filter((field) => field.type === "SIGNATURE" || field.type === "INITIALS").map((field) => field.type))
  ).map((type) => ({ type, fields: fields.filter((field) => field.type === type) }));
  const otherFields = fields.filter((field) => field.type !== "SIGNATURE" && field.type !== "INITIALS");
  const allFilled = fields.every((field) => !field.required || values[field.id]);

  function applyCapture(captureFields: Field[], value: string) {
    setValues((current) => ({
      ...current,
      ...Object.fromEntries(captureFields.map((field) => [field.id, value])),
    }));
  }

  function clearCapture(captureFields: Field[]) {
    setValues((current) => {
      const next = { ...current };
      captureFields.forEach((field) => delete next[field.id]);
      return next;
    });
  }

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
      {captureGroups.map(({ type, fields: captureFields }) => {
        const label = type === "INITIALS" ? "Initials" : "Signature";
        const value = values[captureFields[0].id];
        const pages = Array.from(new Set(captureFields.map((field) => field.page))).sort((a, b) => a - b);
        const placementCopy = captureFields.length === 1
          ? `Page ${pages[0]}`
          : `Applied to ${captureFields.length} positions on page${pages.length === 1 ? "" : "s"} ${pages.join(", ")}`;
        return (
          <div className="sign-field sign-field--reusable" key={type}>
            <div className="sign-field-label">
            <span>{captureFields[0].label || label}{captureFields.every((field) => !field.required) ? " (optional)" : ""}</span><small>{placementCopy}</small>
            </div>
            {value ? (
              <div className="captured-signature">
                <img src={value} alt={`${label} preview`} />
                <div className="capture-confirmation">
                  <span><strong>{label} captured once</strong><small>It will be placed in all {captureFields.length} assigned position{captureFields.length === 1 ? "" : "s"}.</small></span>
                  <button className="text-button" type="button" onClick={() => clearCapture(captureFields)}>Redo</button>
                </div>
              </div>
            ) : (
              <SignatureCapture
                signerName={signerName}
                label={type === "INITIALS" ? "initials" : "signature"}
                onCapture={(dataUrl) => applyCapture(captureFields, dataUrl)}
              />
            )}
          </div>
        );
      })}

      {otherFields.map((f) => (
        <div className="sign-field" key={f.id}>
          <div className="sign-field-label">
            <span>{f.label || f.type.toLowerCase()}{f.required ? "" : " (optional)"}</span><small>Page {f.page}</small>
          </div>
          {f.type === "CHECKBOX" ? (
            <label className="sign-checkbox-field">
              <input
                type="checkbox"
                checked={values[f.id] === "X"}
                disabled={!f.editableBySigner}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.checked ? "X" : "" }))}
              />
              <span>Tick to confirm</span>
            </label>
          ) : (
            <input
              type={f.type === "DATE" ? "date" : "text"}
              placeholder="Type here"
              value={values[f.id] || ""}
              readOnly={!f.editableBySigner}
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
