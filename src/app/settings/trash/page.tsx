"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type TrashedDocument = { id: string; title: string; status: string; deletedAt: string; createdBy: { name: string }; signers: unknown[] };

export default function TrashPage() {
  const [documents, setDocuments] = useState<TrashedDocument[]>([]);
  const load = useCallback(() => { fetch("/api/settings/trash").then((response) => response.json()).then((data) => setDocuments(data.documents || [])); }, []);
  useEffect(load, [load]);
  async function restore(id: string) { await fetch("/api/settings/trash", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); load(); }
  async function destroy(id: string) { if (!confirm("Permanently delete this document and its audit data? This cannot be undone.")) return; await fetch(`/api/settings/trash?id=${id}`, { method: "DELETE" }); load(); }
  return (
    <section className="settings-page">
      <header className="settings-page-header"><div><p className="eyebrow">Retention</p><h2>Trash</h2><p>Deleted documents remain isolated to the active company until permanently removed.</p></div><span className="settings-header-icon"><Icon name="file" size={27} /></span></header>
      <section className="panel settings-table-panel"><div className="table-wrap"><table className="documents-table"><thead><tr><th>Document name</th><th>Owner</th><th>Recipients</th><th>Status</th><th>Deleted on</th><th /></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td><strong>{document.title}</strong></td><td>{document.createdBy.name}</td><td>{document.signers.length}</td><td>{document.status.replaceAll("_", " ")}</td><td>{new Date(document.deletedAt).toLocaleDateString()}</td><td><div className="row-actions"><button className="text-button" onClick={() => restore(document.id)}>Restore</button><button className="text-button text-button--danger" onClick={() => destroy(document.id)}>Delete permanently</button></div></td></tr>)}</tbody></table></div>{documents.length === 0 && <div className="empty-state empty-state--table"><span><Icon name="file" size={28} /></span><h3>Trash is empty</h3><p>Deleted company documents will appear here.</p></div>}</section>
    </section>
  );
}
