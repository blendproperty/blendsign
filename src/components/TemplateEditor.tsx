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
  label: string;
  dataKey: string;
  defaultValue: string;
  required: boolean;
  editableBySigner: boolean;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
type InitialTemplate = {
  id: string;
  name: string;
  description: string;
  apiIdentifier: string;
  version: number;
  active: boolean;
  canEditIdentifier: boolean;
  documentUrl: string;
  roles: Role[];
  fields: PlacedField[];
};
type ResizeDirection = "nw" | "ne" | "sw" | "se";

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

function toApiIdentifier(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function TemplateEditor({ initial }: { initial?: InitialTemplate }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [apiIdentifier, setApiIdentifier] = useState(initial?.apiIdentifier || "");
  const [identifierEdited, setIdentifierEdited] = useState(Boolean(initial?.apiIdentifier));
  const [active, setActive] = useState(initial?.active ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [roles, setRoles] = useState<Role[]>(initial?.roles || [{ name: "Signer 1", order: 0 }]);
  const [fields, setFields] = useState<PlacedField[]>(initial?.fields || []);
  const [activeRole, setActiveRole] = useState(0);
  const [activeType, setActiveType] = useState<FieldType>("SIGNATURE");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; fieldX: number; fieldY: number; rect: DOMRect } | null>(null);
  const resize = useRef<{
    id: string;
    direction: ResizeDirection;
    startX: number;
    startY: number;
    fieldX: number;
    fieldY: number;
    fieldWidth: number;
    fieldHeight: number;
    rect: DOMRect;
  } | null>(null);
  const selected = useMemo(() => fields.find((field) => field.id === selectedId) || null, [fields, selectedId]);
  const documentSource = file || initial?.documentUrl || null;

  function placeField(event: React.MouseEvent<HTMLDivElement>, page: number) {
    if (!documentSource) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const size = defaultSize(activeType);
    const x = Math.max(0, Math.min(1 - size.width, (event.clientX - rect.left) / rect.width - size.width / 2));
    const y = Math.max(0, Math.min(1 - size.height, (event.clientY - rect.top) / rect.height - size.height / 2));
    const typeLabel = fieldTypes.find((item) => item.type === activeType)?.label || "Field";
    const field: PlacedField = {
      id: crypto.randomUUID(),
      roleIndex: activeRole,
      type: activeType,
      label: `${roles[activeRole]?.name || "Signer"} ${typeLabel.toLowerCase()}`,
      dataKey: "",
      defaultValue: "",
      required: true,
      editableBySigner: true,
      page,
      x,
      y,
      ...size,
    };
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

  function startResize(event: React.PointerEvent<HTMLSpanElement>, field: PlacedField, direction: ResizeDirection) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.closest(".template-pdf-page")!.getBoundingClientRect();
    resize.current = {
      id: field.id,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      fieldX: field.x,
      fieldY: field.y,
      fieldWidth: field.width,
      fieldHeight: field.height,
      rect,
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
    const minimumWidth = 0.035;
    const minimumHeight = 0.025;

    let x = fromLeft ? current.fieldX + dx : current.fieldX;
    let y = fromTop ? current.fieldY + dy : current.fieldY;
    let width = fromLeft ? current.fieldWidth - dx : current.fieldWidth + dx;
    let height = fromTop ? current.fieldHeight - dy : current.fieldHeight + dy;

    if (width < minimumWidth) {
      if (fromLeft) x -= minimumWidth - width;
      width = minimumWidth;
    }
    if (height < minimumHeight) {
      if (fromTop) y -= minimumHeight - height;
      height = minimumHeight;
    }

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

  function updateSelected(patch: Partial<PlacedField>) {
    if (!selectedId) return;
    setFields((items) => items.map((field) => field.id === selectedId ? { ...field, ...patch } : field));
  }

  function choosePdf(nextFile: File | null) {
    if (!nextFile) return;
    if (fields.length && !window.confirm("Replacing the PDF will clear the existing field placements. Continue?")) return;
    setFile(nextFile);
    setFields([]);
    setSelectedId(null);
    setNumPages(0);
  }

  function removeRole(index: number) {
    if (roles.length === 1) return setError("A template must have at least one signer role.");
    const assigned = fields.filter((field) => field.roleIndex === index).length;
    if (assigned && !window.confirm(`Removing this role will also remove ${assigned} assigned field${assigned === 1 ? "" : "s"}. Continue?`)) return;
    setRoles((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setFields((items) => items.filter((field) => field.roleIndex !== index).map((field) => field.roleIndex > index ? { ...field, roleIndex: field.roleIndex - 1 } : field));
    setActiveRole((current) => Math.max(0, current === index ? index - 1 : current > index ? current - 1 : current));
    setSelectedId(null);
  }

  async function save() {
    if (!documentSource || !name.trim() || !apiIdentifier.trim() || !fields.length || roles.some((role) => !role.name.trim())) return setError("Add a name, template identifier, PDF, signer roles and at least one field.");
    if (/^bs[-_]live[-_]/i.test(apiIdentifier)) return setError("Use a public template identifier such as stor24-unit-lease. Do not paste a company API secret here.");
    if (initial?.apiIdentifier && initial.apiIdentifier !== apiIdentifier && !window.confirm(`Change the template identifier from ${initial.apiIdentifier} to ${apiIdentifier}? The old API URL will stop working.`)) return;
    setBusy(true); setError(null);
    try {
      let originalKey: string | undefined;
      if (file) {
        const uploadResponse = await fetch("/api/documents/upload", { method: "POST", headers: { "Content-Type": "application/pdf", "x-file-name": encodeURIComponent(file.name) }, body: file });
        const upload = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(upload.error || "The PDF could not be uploaded.");
        originalKey = upload.key;
      }
      const response = await fetch(initial ? `/api/templates/${initial.id}` : "/api/templates", { method: initial ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description, apiIdentifier, active, ...(originalKey ? { originalKey } : {}), roles, fields }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `The template could not be ${initial ? "updated" : "saved"}.`);
      router.push("/templates"); router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `The template could not be ${initial ? "updated" : "saved"}.`);
    } finally { setBusy(false); }
  }

  return (
    <div className="page template-editor-page">
      <section className="page-heading page-heading--row"><div><p className="eyebrow">Template builder</p><h1>{initial ? "Edit reusable template" : "Prepare reusable fields"}</h1><p>Add signer roles, choose a field, then click the exact position on the PDF. Drag to move it and use the corner handles to resize it.</p></div><Link href="/templates" className="button button--quiet">Cancel</Link></section>
      <div className="template-builder-layout">
        <aside className="panel template-builder-sidebar">
          <label className="field-label">Template name<input className="field-input" value={name} onChange={(event) => { const value = event.target.value; setName(value); if (!identifierEdited) setApiIdentifier(toApiIdentifier(value)); }} placeholder="Stor24 unit lease" /></label>
          <label className="field-label">Template identifier<input className="field-input template-api-key" value={apiIdentifier} readOnly={Boolean(initial && !initial.canEditIdentifier)} onChange={(event) => { setIdentifierEdited(true); setApiIdentifier(toApiIdentifier(event.target.value)); }} placeholder="stor24-unit-lease" /><span>Public document name used in API URLs. Example: stor24-unit-lease. Never paste a company API secret here.</span></label>
          <label className="field-label">Description<textarea className="field-input field-textarea template-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Approved reusable agreement" /></label>
          <label className="template-availability"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>Template active</strong><small>{initial ? `Revision ${initial.version}. Saving creates revision ${initial.version + 1}.` : "Available to create signing requests after it is saved."}</small></span></label>
          <label className={`upload-zone template-upload ${documentSource ? "has-file" : ""}`}><input type="file" accept="application/pdf" onChange={(event) => { choosePdf(event.target.files?.[0] || null); event.currentTarget.value = ""; }} /><Icon name={documentSource ? "file" : "upload"} size={24} /><strong>{file?.name || (initial ? "Replace template PDF" : "Choose template PDF")}</strong>{initial && !file && <small>Current PDF and placements loaded</small>}</label>
          <div className="builder-section"><div className="builder-section-title"><h3>Signer roles</h3><button type="button" className="text-button" onClick={() => setRoles((items) => [...items, { name: `Signer ${items.length + 1}`, order: items.length }])}>+ Add</button></div>{roles.map((role, index) => <div className={`role-editor ${activeRole === index ? "is-active" : ""}`} key={index} onClick={() => setActiveRole(index)}><span style={{ background: roleColours[index % roleColours.length] }} /><input value={role.name} aria-label={`Signer role ${index + 1}`} onChange={(event) => setRoles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><input type="number" min="0" value={role.order} title="Signing order" onChange={(event) => setRoles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, order: Number(event.target.value) } : item))} /><button type="button" className="role-remove" aria-label={`Remove ${role.name}`} onClick={(event) => { event.stopPropagation(); removeRole(index); }}>×</button></div>)}</div>
          <div className="builder-section"><h3>Field to place</h3><div className="field-tool-grid">{fieldTypes.map((item) => <button type="button" className={activeType === item.type ? "is-active" : ""} key={item.type} onClick={() => setActiveType(item.type)}>{item.label}</button>)}</div></div>
          {selected && (
            <div className="builder-section selected-field-panel">
              <div className="builder-section-title">
                <h3>Selected field</h3>
                <button type="button" className="text-button text-button--danger" onClick={() => { setFields((items) => items.filter((field) => field.id !== selected.id)); setSelectedId(null); }}>Delete</button>
              </div>
              <p>{selected.type.toLowerCase()} for {roles[selected.roleIndex]?.name}</p>
              <div className="resize-hint">Drag a corner handle on the PDF to resize this box.</div>
              <label className="field-label">Field label<input className="field-input" value={selected.label} maxLength={120} onChange={(event) => updateSelected({ label: event.target.value })} placeholder="Tenant full name" /></label>
              {selected.type !== "SIGNATURE" && selected.type !== "INITIALS" ? (
                <>
                  <label className="field-label">Data key<input className="field-input template-api-key" value={selected.dataKey} maxLength={120} onChange={(event) => updateSelected({ dataKey: event.target.value.replace(/[^a-zA-Z0-9.]/g, "") })} placeholder="tenant.fullName" /><span>Repeated keys populate every matching position.</span></label>
                  <label className="field-label">Default value<input className="field-input" value={selected.defaultValue} maxLength={500} onChange={(event) => updateSelected({ defaultValue: event.target.value })} placeholder="Optional fallback value" /></label>
                </>
              ) : <p className="field-binding-note">Signature and initials are supplied by the assigned signer, so they do not use a data key.</p>}
              <label className="field-label">Assigned role<select className="field-input" value={selected.roleIndex} onChange={(event) => updateSelected({ roleIndex: Number(event.target.value) })}>{roles.map((role, index) => <option value={index} key={index}>{role.name}</option>)}</select></label>
              <div className="field-option-list">
                <label><input type="checkbox" checked={selected.required} onChange={(event) => updateSelected({ required: event.target.checked })} /><span>Required field</span></label>
                <label><input type="checkbox" checked={selected.editableBySigner} disabled={selected.type === "SIGNATURE" || selected.type === "INITIALS"} onChange={(event) => updateSelected({ editableBySigner: event.target.checked })} /><span>{selected.type === "SIGNATURE" || selected.type === "INITIALS" ? "Completed by the signer" : "Signer may edit the value"}</span></label>
              </div>
              <div className="selected-field-grid"><label>Page<input type="number" min="1" max={numPages} value={selected.page} onChange={(event) => updateSelected({ page: Number(event.target.value) })} /></label><label>Width %<input type="number" min="2" max="100" value={Math.round(selected.width * 100)} onChange={(event) => updateSelected({ width: Math.min(1 - selected.x, Math.max(0.02, Number(event.target.value) / 100)) })} /></label><label>Height %<input type="number" min="2" max="100" value={Math.round(selected.height * 100)} onChange={(event) => updateSelected({ height: Math.min(1 - selected.y, Math.max(0.02, Number(event.target.value) / 100)) })} /></label></div>
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
          <button className="button button--accent button--full" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : initial ? "Update template" : "Save template"}</button>
        </aside>
        <section className="template-document-workspace">
          {!documentSource ? <div className="panel template-editor-empty"><Icon name="file" size={42} /><h2>Select a PDF to begin</h2><p>The document pages and field placement canvas will appear here.</p></div> : <Document file={documentSource} onLoadSuccess={({ numPages: pages }) => setNumPages(pages)} loading={<div className="panel template-editor-empty">Loading PDF…</div>}>{Array.from({ length: numPages }, (_, pageIndex) => { const page = pageIndex + 1; return <div className="template-page-wrap" key={page}><div className="template-page-number">Page {page}</div><div className="template-pdf-page" onClick={(event) => placeField(event, page)}><Page pageNumber={page} width={720} renderAnnotationLayer={false} renderTextLayer={false} /><div className="template-field-layer">{fields.filter((field) => field.page === page).map((field) => <button key={field.id} type="button" className={`placed-template-field ${selectedId === field.id ? "is-selected" : ""}`} style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%`, borderColor: roleColours[field.roleIndex % roleColours.length], background: `${roleColours[field.roleIndex % roleColours.length]}22` }} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => startDrag(event, field)} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }}>{field.label || field.type.toLowerCase()}<small>{field.dataKey || roles[field.roleIndex]?.name}</small>{selectedId === field.id && (["nw", "ne", "sw", "se"] as ResizeDirection[]).map((direction) => <span key={direction} className={`field-resize-handle field-resize-handle--${direction}`} aria-hidden="true" onPointerDown={(event) => startResize(event, field, direction)} onPointerMove={moveResize} onPointerUp={stopResize} onPointerCancel={stopResize} />)}</button>)}</div></div></div>; })}</Document>}
        </section>
      </div>
    </div>
  );
}
