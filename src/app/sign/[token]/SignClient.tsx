"use client";

import { useState } from "react";
import SignatureCapture from "@/components/SignatureCapture";

type Field = {
  id: string;
  type: "SIGNATURE" | "INITIALS" | "DATE" | "TEXT" | "CHECKBOX";
  label: string | null;
  dataKey: string | null;
  required: boolean;
  editableBySigner: boolean;
  value: string | null;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const southAfricanBanks: ReadonlyArray<{ name: string; code?: string }> = [
  { name: "Absa Bank", code: "632005" },
  { name: "Access Bank (South Africa)", code: "410105" },
  { name: "African Bank", code: "430000" },
  { name: "African Bank Business", code: "584000" },
  { name: "Al Baraka Bank", code: "800000" },
  { name: "Bank of China - Johannesburg Branch" },
  { name: "Bank Zero Mutual Bank", code: "888000" },
  { name: "Bidvest Bank", code: "462005" },
  { name: "Capitec Bank", code: "470010" },
  { name: "Capitec Business", code: "450105" },
  { name: "China Construction Bank - Johannesburg Branch" },
  { name: "Citibank South Africa" },
  { name: "Discovery Bank", code: "679000" },
  { name: "eNL Mutual Bank" },
  { name: "Finbond Mutual Bank", code: "589000" },
  { name: "Finbond Net1", code: "591000" },
  { name: "First National Bank (FNB) / FirstRand", code: "250655" },
  { name: "HBZ Bank" },
  { name: "Investec Bank", code: "580105" },
  { name: "J.P. Morgan - Johannesburg Branch" },
  { name: "Nedbank", code: "198765" },
  { name: "Old Mutual Bank (OM Bank)", code: "352000" },
  { name: "Sasfin Bank", code: "683000" },
  { name: "Standard Bank", code: "051001" },
  { name: "Standard Chartered Bank - Johannesburg Branch", code: "730020" },
  { name: "State Bank of India - South Africa" },
  { name: "TymeBank / GoTyme Bank", code: "678910" },
  { name: "YWBN Mutual Bank", code: "353000" },
] as const;

const universalCodeByBank = Object.fromEntries(
  southAfricanBanks.flatMap((bank) => (bank.code ? [[bank.name, bank.code]] : []))
) as Record<string, string>;

function signingDateToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function initialFieldValues(fields: Field[]) {
  const values: Record<string, string> = {};
  const valueByKey = new Map<string, string>();
  fields.forEach((field) => {
    if (field.dataKey && field.value) valueByKey.set(field.dataKey, field.value);
  });
  const customerName = valueByKey.get("tenant.fullName") || "";
  fields.forEach((field) => {
    const value = field.type === "DATE"
      ? signingDateToday()
      : field.dataKey === "tenant.contactPerson" && !field.value
        ? customerName
        : field.dataKey
          ? valueByKey.get(field.dataKey) || field.value || ""
          : field.value || "";
    if (value) values[field.id] = value;
  });
  return values;
}

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
  const [values, setValues] = useState<Record<string, string>>(() => initialFieldValues(fields));
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherBankSelected, setOtherBankSelected] = useState(() => fields.some((field) => field.dataKey === "debitOrder.bankName" && Boolean(field.value) && !southAfricanBanks.some((bank) => bank.name === field.value)));

  const captureGroups = Array.from(
    new Set(fields.filter((field) => field.type === "SIGNATURE" || field.type === "INITIALS").map((field) => field.type))
  ).map((type) => ({ type, fields: fields.filter((field) => field.type === type) }));
  const priority: Record<string, number> = { "tenant.phone": 10, "tenant.address": 20, "tenant.city": 30, "tenant.postalCode": 40 };
  const otherFields = fields
    .filter((field) => field.type !== "SIGNATURE" && field.type !== "INITIALS")
    .filter((field, index, candidates) => !field.dataKey || candidates.findIndex((candidate) => candidate.dataKey === field.dataKey) === index)
    .sort((a, b) => (priority[a.dataKey || ""] ?? 100) - (priority[b.dataKey || ""] ?? 100));
  const allFilled = fields.every((field) => !field.required || values[field.id]) && fields.every((field) => field.dataKey !== "debitOrder.branchCode" || !values[field.id] || /^\d{6}$/.test(values[field.id]));
  const postalField = fields.find((field) => field.dataKey === "tenant.postalCode");
  const branchCodeField = fields.find((field) => field.dataKey === "debitOrder.branchCode");
  const cityPostalCodes: Record<string, string> = { Alberton: "1449", Benoni: "1501", Bloemfontein: "9301", "Cape Town": "8001", Centurion: "0157", Durban: "4001", "East London": "5201", George: "6529", Gqeberha: "6001", Johannesburg: "2000", Kimberley: "8301", Midrand: "1685", Mbombela: "1200", Paarl: "7646", Pietermaritzburg: "3201", Polokwane: "0700", Pretoria: "0002", Randburg: "2194", Rustenburg: "0300", Sandton: "2196", Soweto: "1804", Stellenbosch: "7600" };
  const displayLabel = (field: Field) => {
    if (field.dataKey === "lease.signedAt" || field.dataKey === "debitOrder.signedAt") return "Signed at (town/city where you are signing)";
    if ((field.label || "").toLowerCase().includes("final execution date")) return "Final execution date (date Stor24 countersigns and completes the agreement)";
    if (field.type === "DATE" && /storer signing date|storer date/.test((field.label || "").toLowerCase())) return "Your signing date (today)";
    if (field.type === "DATE" && /debit mandate signature date/.test((field.label || "").toLowerCase())) return "Debit mandate signing date (today)";
    return field.label || field.type.toLowerCase();
  };

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

  function setFieldValue(field: Field, value: string) {
    const matching = field.dataKey ? fields.filter((candidate) => candidate.dataKey === field.dataKey) : [field];
    setValues((current) => ({ ...current, ...Object.fromEntries(matching.map((candidate) => [candidate.id, value])) }));
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
      <div className="sign-fields-heading"><p className="eyebrow">Signing fields</p><h2>Complete your signing fields</h2><p>Review the PDF, complete each field and provide consent below.</p><div className="sign-field-legend"><span className="sign-field-legend-required"><b>*</b> Required</span><span className="sign-field-legend-optional">Optional</span></div></div>
      {captureGroups.map(({ type, fields: captureFields }) => {
        const label = type === "INITIALS" ? "Initials" : "Signature";
        const value = values[captureFields[0].id];
        const pages = Array.from(new Set(captureFields.map((field) => field.page))).sort((a, b) => a - b);
        const placementCopy = captureFields.length === 1
          ? `Page ${pages[0]}`
          : `Applied to ${captureFields.length} positions on page${pages.length === 1 ? "" : "s"} ${pages.join(", ")}`;
        return (
          <div className={`sign-field sign-field--reusable ${captureFields.some((field) => field.required) ? "sign-field--required" : "sign-field--optional"}`} key={type}>
            <div className="sign-field-label">
            <span>{captureFields[0].label || label}{captureFields.some((field) => field.required) ? <b className="required-asterisk" aria-label="required">*</b> : <em className="optional-badge">Optional</em>}</span><small>{placementCopy}</small>
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
        <div className={`sign-field ${f.required ? "sign-field--required" : "sign-field--optional"} ${!f.editableBySigner || f.type === "DATE" ? "sign-field--locked" : ""}`} key={f.id}>
          <div className="sign-field-label">
            <span>{displayLabel(f)}{f.required ? <b className="required-asterisk" aria-label="required">*</b> : <em className="optional-badge">Optional</em>}</span><small>{f.dataKey && fields.filter((candidate) => candidate.dataKey === f.dataKey).length > 1 ? `Automatically fills all matching PDF positions` : `Page ${f.page}`}{f.type === "DATE" ? " · Set to today's signing date" : !f.editableBySigner ? " · Locked by Stor24" : ""}</small>
          </div>
          {f.dataKey === "debitOrder.bankName" ? (
            <div className="bank-selector-stack"><select className="field-input" aria-required={f.required} value={otherBankSelected ? "__other" : values[f.id] || ""} onChange={(event) => { const bank = event.target.value; const other = bank === "__other"; setOtherBankSelected(other); setValues((current) => ({ ...current, [f.id]: other ? "" : bank, ...(branchCodeField ? { [branchCodeField.id]: other ? "" : universalCodeByBank[bank] || "" } : {}) })); }}><option value="">Select a South African bank…</option>{southAfricanBanks.map((bank) => <option value={bank.name} key={bank.name}>{bank.name}</option>)}<option value="__other">Other bank</option></select>{otherBankSelected ? <input className="field-input" placeholder="Enter bank name" value={values[f.id] || ""} aria-required="true" onChange={(event) => setValues((current) => ({ ...current, [f.id]: event.target.value }))} /> : null}</div>
          ) : f.dataKey === "debitOrder.branchCode" ? (
            <input className="field-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="6-digit branch code" value={values[f.id] || ""} readOnly={!f.editableBySigner || Object.values(universalCodeByBank).includes(values[f.id] || "")} aria-required={f.required} onChange={(event) => setValues((current) => ({ ...current, [f.id]: event.target.value.replace(/\D/g, "").slice(0, 6) }))} />
          ) : f.dataKey === "debitOrder.accountType" ? (
            <select className="field-input" aria-required={f.required} value={values[f.id] || ""} onChange={(event) => setValues((current) => ({ ...current, [f.id]: event.target.value }))}>
              <option value="">Select account type…</option><option value="Current">Current</option><option value="Cheque">Cheque</option><option value="Savings">Savings</option><option value="Transmission">Transmission</option>
            </select>
          ) : f.dataKey === "lease.signedAt" || f.dataKey === "debitOrder.signedAt" ? (
            <><input className="field-input" list="south-african-signing-cities" placeholder="Select or type town / city" value={values[f.id] || ""} aria-required={f.required} onChange={(event) => setValues((current) => ({ ...current, [f.id]: event.target.value }))} /><datalist id="south-african-signing-cities">{Object.keys(cityPostalCodes).sort().map((city) => <option value={city} key={city} />)}</datalist></>
          ) : f.dataKey === "tenant.city" ? (
            <select className="field-input" aria-required={f.required} value={values[f.id] || ""} disabled={!f.editableBySigner} onChange={(event) => setValues((current) => ({ ...current, [f.id]: event.target.value, ...(postalField && cityPostalCodes[event.target.value] ? { [postalField.id]: cityPostalCodes[event.target.value] } : {}) }))}>
              <option value="">Select city / suburb…</option>
              {values[f.id] && !cityPostalCodes[values[f.id]] ? <option value={values[f.id]}>{values[f.id]}</option> : null}
              {Object.keys(cityPostalCodes).sort().map((city) => <option value={city} key={city}>{city}</option>)}
            </select>
          ) : f.type === "CHECKBOX" ? (
            <label className="sign-checkbox-field" data-required={f.required}>
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
              readOnly={!f.editableBySigner || f.type === "DATE"}
              aria-required={f.required}
              onChange={(e) => setFieldValue(f, e.target.value)}
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
