"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Document, Page, pdfjs } from "react-pdf";
import { Icon } from "@/components/Icon";
import SignatureCapture from "@/components/SignatureCapture";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type FieldType = "SIGNATURE" | "INITIALS" | "DATE" | "TEXT" | "CHECKBOX";
type ResizeDirection = "nw" | "ne" | "sw" | "se";
type SelfField = {
  id: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const fieldTypes: { type: FieldType; label: string }[] = [
  { type: "SIGNATURE", label: "Signature" },
  { type: "INITIALS", label: "Initials" },
  { type: "DATE", label: "Sign date" },
  { type: "TEXT", label: "Text" },
  { type: "CHECKBOX", label: "Checkbox" },
];

function defaultSize(type: FieldType) {
  if (type === "SIGNATURE") return { width: 0.3, height: 0.09 };
  if (type === "INITIALS") return { width: 0.14, height: 0.07 };
  if (type === "CHECKBOX") return { width: 0.055, height: 0.04 };
  return { width: 0.22, height: 0.05 };
}

export default function SelfSignEditor() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [fields, setFields] = useState<SelfField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeType, setActiveType] = useState<FieldType>("SIGNATURE");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("Administrator");
  const [signerEmail, setSignerEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; fieldX: number; fieldY: number; rect: DOMRect } | null>(null);
  const resize = useRef<{ id: string; direction: ResizeDirection; startX: number; startY: number; fieldX: number; fieldY: number; fieldWidth: number; fieldHeight: number; rect: DOMRect } | null>(null);
  const selected = useMemo(() => fields.find((field) => field.id === selectedId) || null, [fields, selectedId]);

  useEffect(() => {
    fetch("/api/settings/profile")
      .then((response) => response.json())
      .then((data) => {
        if (data.profile?.name) setSignerName(data.profile.name);
        if (data.profile?.email) setSignerEmail(data.profile.email);
      })
      .catch(() => undefined);
  }, []);

  function choosePdf(nextFile: File | null) {
    if (!nextFile) return;
    if (nextFile.size > 20 * 1024 * 1024) return setError("PDF documents may not exceed 20 MB.");
    if (fields.length && !window.confirm("Replacing the PDF will remove all placed fields. Continue?")) return;
    setFile(nextFile);
    setTitle((current) => current || nextFile.name.replace(/\.pdf$/i, ""));
    setFields([]);
    setValues({});
    setSelectedId(null);
    setNumPages(0);
    setError(null);
  }

  function placeField(event: React.MouseEvent<HTMLDivElement>, page: number) {
    if (!file) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const size = defaultSize(activeType);
    const field: SelfField = {
      id: crypto.randomUUID(),
      type: activeType,
      page,
      x: Math.max(0, Math.min(1 - size.width, (event.clientX - rect.left) / rect.width - size.width / 2)),
      y: Math.max(0, Math.min(1 - size.height, (event.clientY - rect.top) / rect.height - size.height / 2)),
      ...size,
    };
    setFields((items) => [...items, field]);
    if (activeType === "DATE") setValues((current) => ({ ...current, [field.id]: new Date().toISOString().slice(0, 10) }));
    if (activeType === "SIGNATURE" || activeType === "INITIALS") {
      const existing = fields.find((item) => item.type === activeType && values[item.id]);
      if (existing) setValues((current) => ({ ...current, [field.id]: current[existing.id] }));
    }
    setSelectedId(field.id);
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, field: SelfField) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: field.id, startX: event.clientX, startY: event.clientY, fieldX: field.x, fieldY: field.y, rect: event.currentTarget.closest(".template-pdf-page")!.getBoundingClientRect() };
    setSelectedId(field.id);
  }

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current) return;
    setFields((items) => items.map((field) => field.id !== current.id ? field : {
      ...field,
      x: Math.max(0, Math.min(1 - field.width, current.fieldX + (event.clientX - current.startX) / current.rect.width)),
      y: Math.max(0, Math.min(1 - field.height, current.fieldY + (event.clientY - current.startY) / current.rect.height)),
    }));
  }

  function startResize(event: React.PointerEvent<HTMLSpanElement>, field: SelfField, direction: ResizeDirection) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resize.current = {
      id: field.id,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      fieldX: field.x,
      fieldY: field.y,
      fieldWidth: field.width,
      fieldHeight: field.height,
      rect: event.currentTarget.closest(".template-pdf-page")!.getBoundingClientRect(),
    };
    setSelectedId(field.id);
  }

  function moveResize(event: React.PointerEvent<HTMLSpanElement>) {
    const current = resize.current;
    if (!current) return;
    const dx = (event.clientX - current.startX) / current.rect.width;
    const dy = (event.clientY - current.startY) / current.rect.height;
    const fromLeft = current.direction.includes("w");
    const fromTop = current.direction.includes("n");
    let x = fromLeft ? current.fieldX + dx : current.fieldX;
    let y = fromTop ? current.fieldY + dy : current.fieldY;
    let width = fromLeft ? current.fieldWidth - dx : current.fieldWidth + dx;
    let height = fromTop ? current.fieldHeight - dy : current.fieldHeight + dy;
    if (width < 0.035) { if (fromLeft) x -= 0.035 - width; width = 0.035; }
    if (height < 0.025) { if (fromTop) y -= 0.025 - height; height = 0.025; }
    x = Math.max(0, x);
    y = Math.max(0, y);
    width = Math.min(width, 1 - x);
    height = Math.min(height, 1 - y);
    setFields((items) => items.map((field) => field.id === current.id ? { ...field, x, y, width, height } : field));
  }

  function stopResize(event: React.PointerEvent<HTMLSpanElement>) {
    resize.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function removeSelected() {
    if (!selectedId) return;
    setFields((items) => items.filter((field) => field.id !== selectedId));
    setValues((current) => { const next = { ...current }; delete next[selectedId]; return next; });
    setSelectedId(null);
  }

  function applyCapture(type: "SIGNATURE" | "INITIALS", value: string) {
    setValues((current) => ({
      ...current,
      ...Object.fromEntries(fields.filter((field) => field.type === type).map((field) => [field.id, value])),
    }));
  }

  function clearCapture(type: "SIGNATURE" | "INITIALS") {
    setValues((current) => {
      const next = { ...current };
      fields.filter((field) => field.type === type).forEach((field) => delete next[field.id]);
      return next;
    });
  }

  async function complete() {
    if (!file || !title.trim() || !fields.length || fields.some((field) => !values[field.id]) || !consent) {
      return setError("Add the PDF, place at least one field, complete every field and accept the signing consent.");
    }
    setBusy(true);
    setError(null);
    try {
      const uploadResponse = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/pdf", "x-file-name": encodeURIComponent(file.name) },
        body: file,
      });
      const upload = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(upload.error || "The PDF could not be uploaded.");
      const response = await fetch("/api/self-sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), originalKey: upload.key, consent: true, fields: fields.map((field) => ({ ...field, value: values[field.id] })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The document could not be signed.");
      router.push(`/documents/${result.envelopeId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The document could not be signed.");
    } finally {
      setBusy(false);
    }
  }

  const signatureFields = fields.filter((field) => field.type === "SIGNATURE");
  const initialFields = fields.filter((field) => field.type === "INITIALS");
  const nonCaptureFields = fields.filter((field) => field.type !== "SIGNATURE" && field.type !== "INITIALS");

  return (
    <div className="page self-sign-page">
      <section className="page-heading page-heading--row">
        <div><p className="eyebrow">Personal signing</p><h1>Sign a document yourself</h1><p>Upload a PDF, place your fields and create a completed signed copy.</p></div>
        <Link href="/dashboard" className="button button--quiet">Cancel</Link>
      </section>

      <section className="panel form-section self-sign-upload">
        <div className="section-heading"><span>1</span><div><h2>Add your document</h2><p>The original and completed PDF stay in the active company workspace.</p></div></div>
        <label className="field-label">Document title<input className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Document name" /></label>
        <label className={`upload-zone ${file ? "has-file" : ""}`}>
          <input type="file" accept="application/pdf" onChange={(event) => { choosePdf(event.target.files?.[0] || null); event.currentTarget.value = ""; }} />
          <span className="upload-icon"><Icon name={file ? "file" : "upload"} size={28} /></span>
          {file ? <><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB · PDF</small></> : <><strong>Drop your PDF here or browse</strong><small>PDF documents up to 20 MB</small></>}
        </label>
      </section>

      <section className="self-sign-section">
        <div className="section-heading"><span>2</span><div><h2>Place your fields</h2><p>Choose a field, click the PDF, then drag or resize the box.</p></div></div>
        <div className="self-sign-builder">
          <aside className="panel self-sign-tools">
            <h3>Standard fields</h3>
            <div className="field-tool-grid">{fieldTypes.map((item) => <button type="button" key={item.type} className={activeType === item.type ? "is-active" : ""} onClick={() => setActiveType(item.type)}>{item.label}</button>)}</div>
            {selected && <div className="builder-section selected-field-panel"><div className="builder-section-title"><h3>Selected field</h3><button type="button" className="text-button text-button--danger" onClick={removeSelected}>Delete</button></div><p>{selected.type.toLowerCase()} · page {selected.page}</p><div className="resize-hint">Drag the field to move it. Use a corner handle to resize it.</div></div>}
            <dl className="self-sign-field-count"><div><dt>Fields</dt><dd>{fields.length}</dd></div><div><dt>Pages</dt><dd>{numPages || "–"}</dd></div></dl>
          </aside>
          <div className="template-document-workspace self-sign-document">
            {!file ? <div className="panel template-editor-empty"><Icon name="file" size={42} /><h2>Select a PDF first</h2><p>Your document pages will appear here.</p></div> : <Document file={file} onLoadSuccess={({ numPages: pages }) => setNumPages(pages)} loading={<div className="panel template-editor-empty">Loading PDF…</div>}>{Array.from({ length: numPages }, (_, pageIndex) => { const page = pageIndex + 1; return <div className="template-page-wrap" key={page}><div className="template-page-number">Page {page}</div><div className="template-pdf-page" onClick={(event) => placeField(event, page)}><Page pageNumber={page} width={720} renderAnnotationLayer={false} renderTextLayer={false} /><div className="template-field-layer">{fields.filter((field) => field.page === page).map((field) => <button key={field.id} type="button" className={`placed-template-field self-sign-placed-field ${selectedId === field.id ? "is-selected" : ""}`} style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%` }} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => startDrag(event, field)} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }}>{field.type.toLowerCase()}{selectedId === field.id && (["nw", "ne", "sw", "se"] as ResizeDirection[]).map((direction) => <span key={direction} className={`field-resize-handle field-resize-handle--${direction}`} aria-hidden="true" onPointerDown={(event) => startResize(event, field, direction)} onPointerMove={moveResize} onPointerUp={stopResize} onPointerCancel={stopResize} />)}</button>)}</div></div></div>; })}</Document>}
          </div>
        </div>
      </section>

      <section className="panel form-section self-sign-values">
        <div className="section-heading"><span>3</span><div><h2>Complete your fields</h2><p>Signing as {signerName}{signerEmail ? ` · ${signerEmail}` : ""}.</p></div></div>
        {!fields.length && <div className="self-sign-no-fields">Place at least one field on the PDF above.</div>}
        {signatureFields.length > 0 && <div className="self-sign-value-row"><div><strong>Signature</strong><small>{signatureFields.length} position{signatureFields.length === 1 ? "" : "s"}</small></div>{values[signatureFields[0].id] ? <div className="captured-signature"><img src={values[signatureFields[0].id]} alt="Signature preview" /><button type="button" className="text-button" onClick={() => clearCapture("SIGNATURE")}>Change signature</button></div> : <SignatureCapture signerName={signerName} label="signature" onCapture={(value) => applyCapture("SIGNATURE", value)} />}</div>}
        {initialFields.length > 0 && <div className="self-sign-value-row"><div><strong>Initials</strong><small>{initialFields.length} position{initialFields.length === 1 ? "" : "s"}</small></div>{values[initialFields[0].id] ? <div className="captured-signature"><img src={values[initialFields[0].id]} alt="Initials preview" /><button type="button" className="text-button" onClick={() => clearCapture("INITIALS")}>Change initials</button></div> : <SignatureCapture signerName={signerName} label="initials" onCapture={(value) => applyCapture("INITIALS", value)} />}</div>}
        {nonCaptureFields.map((field) => <div className="self-sign-value-row" key={field.id}><div><strong>{field.type === "DATE" ? "Sign date" : field.type.toLowerCase()}</strong><small>Page {field.page}</small></div>{field.type === "CHECKBOX" ? <label className="sign-checkbox-field"><input type="checkbox" checked={values[field.id] === "X"} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.checked ? "X" : "" }))} /><span>Tick to confirm</span></label> : <input className="field-input" type={field.type === "DATE" ? "date" : "text"} value={values[field.id] || ""} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))} placeholder="Type here" />}</div>)}
        <label className="sign-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I consent to sign this document electronically and understand that this constitutes a legally binding signature under the Electronic Communications and Transactions Act.</span></label>
        {error && <div className="form-error">{error}</div>}
        <button className="button button--accent self-sign-complete" type="button" disabled={busy || !file || !title.trim() || !fields.length || fields.some((field) => !values[field.id]) || !consent} onClick={complete}>{busy ? "Signing and sealing…" : "Complete and save signed PDF"}<Icon name="check" size={18} /></button>
      </section>
    </div>
  );
}
