"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Document, Page, pdfjs } from "react-pdf";
import { Icon } from "@/components/Icon";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type FieldType = "SIGNATURE" | "INITIALS" | "DATE" | "TEXT" | "CHECKBOX";
type Role = { name: string; order: number };
type PlacedField = {
  id: string;
  roleIndex: number;
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
const roleColours = ["#229d6c", "#007aff", "#b66a1c", "#7b4db3", "#c54343"];

function defaultSize(type: FieldType) {
  if (type === "SIGNATURE") return { width: 0.28, height: 0.08 };
  if (type === "INITIALS") return { width: 0.13, height: 0.07 };
  if (type === "CHECKBOX") return { width: 0.055, height: 0.04 };
  return { width: 0.2, height: 0.05 };
}

export default function TemplateEditor() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [roles, setRoles] = useState<Role[]>([{ name: "Signer 1", order: 0 }]);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [activeRole, setActiveRole] = useState(0);
  const [activeType, setActiveType] = useState<FieldType>("SIGNATURE");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; fieldX: number; fieldY: number; rect: DOMRect } | null>(null);
  const selected = useMemo(() => fields.find((field) => field.id === selectedId) || null, [fields, selectedId]);

  function placeField(event: React.MouseEvent<HTMLDivElement>, page: number) {
    if (!file) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const size = defaultSize(activeType);
    const x = Math.max(0, Math.min(1 - size.width, (event.clientX - rect.left) / rect.width - size.width / 2));
    const y = Math.max(0, Math.min(1 - size.height, (event.clientY - rect.top) / rect.height - size.height / 2));
    const field: PlacedField = { id: crypto.randomUUID(), roleIndex: activeRole, type: activeType, page, x, y, ...size };
    setFields((current) => [...current, field]);
    setSelectedId(field.id);
  }

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, field: PlacedField) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.parentElement!.getBoundingClientRect();
    drag.current = { id: field.id, startX: event.clientX, startY: event.clientY, fieldX: field.x, fieldY: field.y, rect };
    setSelectedId(field.id);
  }

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current) return;
    setFields((items) => items.map((field) => {
      if (field.id !== current.id) return field;
      const x = Math.max(0, Math.min(1 - field.width, current.fieldX + (event.clientX - current.startX) / current.rect.width));
      const y = Math.max(0, Math.min(1 - field.height, current.fieldY + (event.clientY - current.startY) / current.rect.height));
      return { ...field, x, y };
    }));
  }

  function updateSelected(patch: Partial<PlacedField>) {
    if (!selectedId) return;
    setFields((items) => items.map((field) => field.id === selectedId ? { ...field, ...patch } : field));
  }

  async function save() {
    if (!file || !name.trim() || !fields.length || roles.some((role) => !role.name.trim())) return setError("Add a name, PDF, signer roles and at least one field.");
    setBusy(true); setError(null);
    try {
      const uploadResponse = await fetch("/api/documents/upload", { method: "POST", headers: { "Content-Type": "application/pdf", "x-file-name": encodeURIComponent(file.name) }, body: file });
      const upload = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(upload.error || "The PDF could not be uploaded.");
      const response = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description, originalKey: upload.key, roles, fields }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "The template could not be saved.");
      router.push("/templates"); router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The template could not be saved.");
    } finally { setBusy(false); }
  }

  return (
    <div className="page template-editor-page">
      <section className="page-heading page-heading--row"><div><p className="eyebrow">Template builder</p><h1>Prepare reusable fields</h1><p>Add signer roles, choose a field, then click the exact position on the PDF. Drag a field to adjust it.</p></div><Link href="/templates" className="button button--quiet">Cancel</Link></section>
      <div className="template-builder-layout">
        <aside className="panel template-builder-sidebar">
          <label className="field-label">Template name<input className="field-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Stor24 unit lease" /></label>
          <label className="field-label">Description<textarea className="field-input field-textarea template-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Approved reusable agreement" /></label>
          <label className={`upload-zone template-upload ${file ? "has-file" : ""}`}><input type="file" accept="application/pdf" onChange={(event) => { setFile(event.target.files?.[0] || null); setFields([]); }} /><Icon name={file ? "file" : "upload"} size={24} /><strong>{file?.name || "Choose template PDF"}</strong></label>
          <div className="builder-section"><div className="builder-section-title"><h3>Signer roles</h3><button type="button" className="text-button" onClick={() => setRoles((items) => [...items, { name: `Signer ${items.length + 1}`, order: items.length }])}>+ Add</button></div>{roles.map((role, index) => <div className={`role-editor ${activeRole === index ? "is-active" : ""}`} key={index} onClick={() => setActiveRole(index)}><span style={{ background: roleColours[index % roleColours.length] }} /><input value={role.name} onChange={(event) => setRoles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><input type="number" min="0" value={role.order} title="Signing order" onChange={(event) => setRoles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, order: Number(event.target.value) } : item))} /></div>)}</div>
          <div className="builder-section"><h3>Field to place</h3><div className="field-tool-grid">{fieldTypes.map((item) => <button type="button" className={activeType === item.type ? "is-active" : ""} key={item.type} onClick={() => setActiveType(item.type)}>{item.label}</button>)}</div></div>
          {selected && <div className="builder-section selected-field-panel"><div className="builder-section-title"><h3>Selected field</h3><button type="button" className="text-button text-button--danger" onClick={() => { setFields((items) => items.filter((field) => field.id !== selected.id)); setSelectedId(null); }}>Delete</button></div><p>{selected.type.toLowerCase()} for {roles[selected.roleIndex]?.name}</p><div className="selected-field-grid"><label>Page<input type="number" min="1" max={numPages} value={selected.page} onChange={(event) => updateSelected({ page: Number(event.target.value) })} /></label><label>Width %<input type="number" min="2" max="100" value={Math.round(selected.width * 100)} onChange={(event) => updateSelected({ width: Number(event.target.value) / 100 })} /></label><label>Height %<input type="number" min="2" max="100" value={Math.round(selected.height * 100)} onChange={(event) => updateSelected({ height: Number(event.target.value) / 100 })} /></label></div></div>}
          {error && <div className="form-error">{error}</div>}
          <button className="button button--accent button--full" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save template"}</button>
        </aside>
        <section className="template-document-workspace">
          {!file ? <div className="panel template-editor-empty"><Icon name="file" size={42} /><h2>Select a PDF to begin</h2><p>The document pages and field placement canvas will appear here.</p></div> : <Document file={file} onLoadSuccess={({ numPages: pages }) => setNumPages(pages)} loading={<div className="panel template-editor-empty">Loading PDF…</div>}>{Array.from({ length: numPages }, (_, pageIndex) => { const page = pageIndex + 1; return <div className="template-page-wrap" key={page}><div className="template-page-number">Page {page}</div><div className="template-pdf-page" onClick={(event) => placeField(event, page)}><Page pageNumber={page} width={720} renderAnnotationLayer={false} renderTextLayer={false} /><div className="template-field-layer">{fields.filter((field) => field.page === page).map((field) => <button key={field.id} type="button" className={`placed-template-field ${selectedId === field.id ? "is-selected" : ""}`} style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%`, borderColor: roleColours[field.roleIndex % roleColours.length], background: `${roleColours[field.roleIndex % roleColours.length]}22` }} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => startDrag(event, field)} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }}>{field.type.toLowerCase()}<small>{roles[field.roleIndex]?.name}</small></button>)}</div></div></div>; })}</Document>}
        </section>
      </div>
    </div>
  );
}
