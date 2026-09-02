"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Document, Page, pdfjs } from "react-pdf";
import { Icon } from "@/components/Icon";
import SelfSignEditor from "@/components/SelfSignEditor";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type SignerInput = { name: string; email: string; order: number };
type FieldType = "SIGNATURE" | "INITIALS" | "DATE" | "TEXT" | "CHECKBOX";
type ResizeDirection = "nw" | "ne" | "sw" | "se";
type PlacedField = {
  id: string;
  signerIndex: number;
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
  { type: "DATE", label: "Date" },
  { type: "TEXT", label: "Text" },
  { type: "CHECKBOX", label: "Checkbox" },
];
const signerColours = ["#229d6c", "#007aff", "#b66a1c", "#7b4db3", "#c54343"];

function defaultSize(type: FieldType) {
  if (type === "SIGNATURE") return { width: 0.28, height: 0.08 };
  if (type === "INITIALS") return { width: 0.13, height: 0.07 };
  if (type === "CHECKBOX") return { width: 0.055, height: 0.04 };
  return { width: 0.2, height: 0.05 };
}

// Envelope creation flow: upload a PDF, add signers, click-place their
// signature/initials/date/text fields on the document, then send.
export default function NewEnvelope() {
  return <Suspense fallback={<div className="page"><div className="panel template-editor-empty">Loading document workflow…</div></div>}><NewEnvelopeRouter /></Suspense>;
}

function NewEnvelopeRouter() {
  const searchParams = useSearchParams();
  return searchParams.get("mode") === "self" ? <SelfSignEditor /> : <NewEnvelopeForm />;
}

// Shared by every upload-zone in the app: makes the dashed box actually
// accept a dragged-and-dropped file, not just a click-to-browse.
function useFileDrop(onFile: (file: File | null) => void) {
  const [isDragOver, setIsDragOver] = useState(false);
  return {
    isDragOver,
    handlers: {
      onDragOver: (event: React.DragEvent) => { event.preventDefault(); setIsDragOver(true); },
      onDragLeave: (event: React.DragEvent) => { event.preventDefault(); setIsDragOver(false); },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        setIsDragOver(false);
        const dropped = Array.from(event.dataTransfer.files || []).find((item) => item.type === "application/pdf" || /\.pdf$/i.test(item.name));
        if (dropped) onFile(dropped);
      },
    },
  };
}

function NewEnvelopeForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [signers, setSigners] = useState<SignerInput[]>([
    { name: "", email: "", order: 0 },
  ]);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [activeSigner, setActiveSigner] = useState(0);
  const [activeType, setActiveType] = useState<FieldType>("SIGNATURE");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; fieldX: number; fieldY: number; rect: DOMRect } | null>(null);
  const resize = useRef<{ id: string; direction: ResizeDirection; startX: number; startY: number; fieldX: number; fieldY: number; fieldWidth: number; fieldHeight: number; rect: DOMRect } | null>(null);
  const selected = useMemo(() => fields.find((field) => field.id === selectedId) || null, [fields, selectedId]);
  const { isDragOver, handlers: dropHandlers } = useFileDrop((nextFile) => {
    if (fields.length && !window.confirm("Replacing the PDF will remove all placed fields. Continue?")) return;
    setFile(nextFile);
    setFields([]);
    setSelectedId(null);
    setNumPages(0);
    setError(null);
  });

  function updateSigner(i: number, patch: Partial<SignerInput>) {
    setSigners((s) => s.map((sig, idx) => (idx === i ? { ...sig, ...patch } : sig)));
  }

  function removeSigner(index: number) {
    const assigned = fields.filter((field) => field.signerIndex === index).length;
    if (assigned && !window.confirm(`Removing this signer will also remove ${assigned} field${assigned === 1 ? "" : "s"} placed for them. Continue?`)) return;
    setSigners((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setFields((items) => items.filter((field) => field.signerIndex !== index).map((field) => field.signerIndex > index ? { ...field, signerIndex: field.signerIndex - 1 } : field));
    setActiveSigner((current) => Math.max(0, current === index ? index - 1 : current > index ? current - 1 : current));
    setSelectedId(null);
  }

  function placeField(event: React.MouseEvent<HTMLDivElement>, page: number) {
    if (!file) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const size = defaultSize(activeType);
    const field: PlacedField = {
      id: crypto.randomUUID(),
      signerIndex: activeSigner,
      type: activeType,
      page,
      x: Math.max(0, Math.min(1 - size.width, (event.clientX - rect.left) / rect.width - size.width / 2)),
      y: Math.max(0, Math.min(1 - size.height, (event.clientY - rect.top) / rect.height - size.height / 2)),
      ...size,
    };
    setFields((current) => [...current, field]);
    setSelectedId(field.id);
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, field: PlacedField) {
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

  function startResize(event: React.PointerEvent<HTMLSpanElement>, field: PlacedField, direction: ResizeDirection) {
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
    setSelectedId(null);
  }

  async function submit() {
    if (!file) return setError("Choose a PDF first");
    if (file.size > 20 * 1024 * 1024) return setError("PDF documents may not exceed 20 MB.");
    if (!fields.length) return setError("Place at least one field on the document for a signer to fill in.");
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
          fields: fields.map((field) => ({
            signerIndex: field.signerIndex,
            type: field.type,
            page: field.page,
            x: field.x,
            y: field.y,
            width: field.width,
            height: field.height,
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
    <div className="page new-document-page">
      <section className="page-heading page-heading--row">
        <div><p className="eyebrow">New signing request</p><h1>Prepare a document</h1><p>Upload the PDF, add everyone who needs to sign, then place their fields.</p></div>
        <Link href="/dashboard" className="button button--quiet">Cancel</Link>
      </section>

      <div className="workflow-layout">
        <section className="workflow-main">
          <div className="panel form-section">
            <div className="section-heading"><span>1</span><div><h2>Document details</h2><p>Name the request and attach one PDF document.</p></div></div>
            <label className="field-label">Document title<input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Example: Midpoint lease agreement" /></label>
            <label className={`upload-zone ${file ? "has-file" : ""} ${isDragOver ? "is-drag-over" : ""}`} {...dropHandlers}>
              <input type="file" accept="application/pdf" onChange={(e) => {
                const nextFile = e.target.files?.[0] ?? null;
                if (nextFile && fields.length && !window.confirm("Replacing the PDF will remove all placed fields. Continue?")) { e.currentTarget.value = ""; return; }
                setFile(nextFile);
                setFields([]);
                setSelectedId(null);
                setNumPages(0);
                e.currentTarget.value = "";
              }} />
              <span className="upload-icon"><Icon name={file ? "file" : "upload"} size={28} /></span>
              {file ? <><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB · PDF</small></> : <><strong>Drop your PDF here or browse</strong><small>PDF documents up to 20 MB</small></>}
            </label>
          </div>

          <div className="panel form-section">
            <div className="section-heading"><span>2</span><div><h2>Add signers</h2><p>Set the people and order required for this document.</p></div></div>
            <div className="signer-list">
              {signers.map((signer, index) => (
                <div className="signer-card" key={index}>
                  <div className="signer-number" style={{ background: signerColours[index % signerColours.length], color: "#fff" }}>{index + 1}</div>
                  <label className="field-label">Full name<input className="field-input" placeholder="Signer name" value={signer.name} onChange={(e) => updateSigner(index, { name: e.target.value })} /></label>
                  <label className="field-label">Email address<input className="field-input" type="email" placeholder="name@company.co.za" value={signer.email} onChange={(e) => updateSigner(index, { email: e.target.value })} /></label>
                  <label className="field-label field-label--order">Order<input className="field-input" type="number" min="0" title="Signers with the same number sign in parallel" value={signer.order} onChange={(e) => updateSigner(index, { order: Number(e.target.value) })} /></label>
                  {signers.length > 1 && <button className="remove-signer" type="button" onClick={() => removeSigner(index)}>Remove</button>}
                </div>
              ))}
            </div>
            <button className="button button--outline add-signer" type="button" onClick={() => setSigners((items) => [...items, { name: "", email: "", order: items.length }])}><Icon name="plus" size={17} /> Add another signer</button>
          </div>

          <div className="panel form-section">
            <div className="section-heading"><span>3</span><div><h2>Place fields</h2><p>Pick a signer and a field type, then click the document to drop it there. Drag to move, use the corner handles to resize.</p></div></div>
            {!file ? (
              <div className="template-editor-empty"><Icon name="file" size={36} /><p>Upload a PDF above to start placing fields.</p></div>
            ) : (
              <div className="template-builder-layout">
                <aside className="panel template-builder-sidebar">
                  <div className="builder-section">
                    <h3>Placing for</h3>
                    <div className="field-tool-grid">
                      {signers.map((signer, index) => (
                        <button type="button" key={index} className={activeSigner === index ? "is-active" : ""} style={activeSigner === index ? { background: signerColours[index % signerColours.length], borderColor: signerColours[index % signerColours.length], color: "#fff" } : undefined} onClick={() => setActiveSigner(index)}>{signer.name || `Signer ${index + 1}`}</button>
                      ))}
                    </div>
                  </div>
                  <div className="builder-section">
                    <h3>Field to place</h3>
                    <div className="field-tool-grid">{fieldTypes.map((item) => <button type="button" className={activeType === item.type ? "is-active" : ""} key={item.type} onClick={() => setActiveType(item.type)}>{item.label}</button>)}</div>
                  </div>
                  {selected && (
                    <div className="builder-section selected-field-panel">
                      <div className="builder-section-title"><h3>Selected field</h3><button type="button" className="text-button text-button--danger" onClick={removeSelected}>Delete</button></div>
                      <p>{selected.type.toLowerCase()} for {signers[selected.signerIndex]?.name || `Signer ${selected.signerIndex + 1}`}</p>
                      <div className="resize-hint">Drag a corner handle on the PDF to resize this box.</div>
                      <label className="field-label">Assigned signer<select className="field-input" value={selected.signerIndex} onChange={(event) => setFields((items) => items.map((field) => field.id === selected.id ? { ...field, signerIndex: Number(event.target.value) } : field))}>{signers.map((signer, index) => <option value={index} key={index}>{signer.name || `Signer ${index + 1}`}</option>)}</select></label>
                    </div>
                  )}
                  <dl className="self-sign-field-count"><div><dt>Fields</dt><dd>{fields.length}</dd></div><div><dt>Pages</dt><dd>{numPages || "–"}</dd></div></dl>
                </aside>
                <section className="template-document-workspace">
                  <Document file={file} onLoadSuccess={({ numPages: pages }) => setNumPages(pages)} loading={<div className="panel template-editor-empty">Loading PDF…</div>}>
                    {Array.from({ length: numPages }, (_, pageIndex) => {
                      const page = pageIndex + 1;
                      return (
                        <div className="template-page-wrap" key={page}>
                          <div className="template-page-number">Page {page}</div>
                          <div className="template-pdf-page" onClick={(event) => placeField(event, page)}>
                            <Page pageNumber={page} width={720} renderAnnotationLayer={false} renderTextLayer={false} />
                            <div className="template-field-layer">
                              {fields.filter((field) => field.page === page).map((field) => (
                                <button
                                  key={field.id}
                                  type="button"
                                  className={`placed-template-field ${selectedId === field.id ? "is-selected" : ""}`}
                                  style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%`, borderColor: signerColours[field.signerIndex % signerColours.length], background: `${signerColours[field.signerIndex % signerColours.length]}22` }}
                                  onClick={(event) => event.stopPropagation()}
                                  onPointerDown={(event) => startDrag(event, field)}
                                  onPointerMove={moveDrag}
                                  onPointerUp={() => { drag.current = null; }}
                                >
                                  {field.type.toLowerCase()}
                                  <small>{signers[field.signerIndex]?.name || `Signer ${field.signerIndex + 1}`}</small>
                                  {selectedId === field.id && (["nw", "ne", "sw", "se"] as ResizeDirection[]).map((direction) => (
                                    <span key={direction} className={`field-resize-handle field-resize-handle--${direction}`} aria-hidden="true" onPointerDown={(event) => startResize(event, field, direction)} onPointerMove={moveResize} onPointerUp={stopResize} onPointerCancel={stopResize} />
                                  ))}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </Document>
                </section>
              </div>
            )}
          </div>
        </section>

        <aside className="workflow-summary panel">
          <span className="summary-icon"><Icon name="shield" size={25} /></span>
          <h2>Ready to send?</h2>
          <p>BlendSign will create a secure signing link for each recipient and record every audit event.</p>
          <dl><div><dt>Document</dt><dd>{file ? "1 PDF" : "Not added"}</dd></div><div><dt>Signers</dt><dd>{signers.length}</dd></div><div><dt>Fields placed</dt><dd>{fields.length}</dd></div><div><dt>Delivery</dt><dd>Email</dd></div></dl>
          {error && <div className="form-error">{error}</div>}
          <button className="button button--accent button--full" type="button" disabled={busy || !title || !file || !fields.length || signers.some((signer) => !signer.name || !signer.email)} onClick={submit}>{busy ? "Sending…" : "Send for signature"}<Icon name="send" size={18} /></button>
          <small className="summary-note">By sending, you confirm that you are authorised to request these signatures.</small>
        </aside>
      </div>
    </div>
  );
}
