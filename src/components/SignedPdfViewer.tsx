"use client";

import { useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Icon } from "@/components/Icon";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type Recipient = {
  id: string;
  name: string;
  email: string | null;
  status: string;
};

export default function SignedPdfViewer({
  envelopeId,
  title,
  recipients,
}: {
  envelopeId: string;
  title: string;
  recipients: Recipient[];
}) {
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const viewerRef = useRef<HTMLDivElement>(null);
  const url = `/api/envelopes/${envelopeId}/document?version=signed`;

  function selectPage(next: number) {
    setPage(Math.min(Math.max(1, next || 1), Math.max(1, pages)));
  }

  function printDocument() {
    const frame = document.createElement("iframe");
    frame.src = url;
    frame.style.position = "fixed";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.opacity = "0";
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 30_000);
    };
    document.body.appendChild(frame);
  }

  async function enterFullscreen() {
    if (viewerRef.current?.requestFullscreen) await viewerRef.current.requestFullscreen();
  }

  return (
    <div className="signed-viewer" ref={viewerRef} id="signed-document">
      <div className="signed-viewer-toolbar">
        <strong title={title}>{title}</strong>
        <div className="signed-viewer-page-controls">
          <button type="button" onClick={() => selectPage(page - 1)} disabled={page <= 1} aria-label="Previous page"><Icon name="back" size={17} /></button>
          <button type="button" onClick={() => selectPage(page + 1)} disabled={!pages || page >= pages} aria-label="Next page"><Icon name="chevron" size={17} /></button>
          <input aria-label="Current page" value={page} onChange={(event) => selectPage(Number(event.target.value))} />
          <span>of {pages || 1}</span>
        </div>
        <div className="signed-viewer-tools">
          <button type="button" onClick={() => setZoom((value) => Math.min(2, value + 0.15))} aria-label="Zoom in"><Icon name="zoomIn" size={18} /></button>
          <button type="button" onClick={() => setZoom((value) => Math.max(0.55, value - 0.15))} aria-label="Zoom out"><Icon name="zoomOut" size={18} /></button>
          <button type="button" onClick={() => setZoom(1)} aria-label="Reset zoom"><span>{Math.round(zoom * 100)}%</span></button>
          <a href={`${url}&download=1`} aria-label="Download signed PDF"><Icon name="download" size={18} /></a>
          <button type="button" onClick={printDocument} aria-label="Print signed PDF"><Icon name="printer" size={18} /></button>
          <button type="button" onClick={enterFullscreen} aria-label="Full screen"><Icon name="expand" size={18} /></button>
        </div>
      </div>

      <Document
        file={url}
        onLoadSuccess={({ numPages }) => { setPages(numPages); setError(""); }}
        onLoadError={() => setError("The signed PDF could not be loaded.")}
        loading={<div className="signed-viewer-loading">Loading signed PDF…</div>}
      >
        <div className="signed-viewer-layout">
          <aside className="signed-viewer-thumbnails" aria-label="Document pages">
            <h3>Pages</h3>
            {Array.from({ length: pages }, (_, index) => (
              <button type="button" className={page === index + 1 ? "is-active" : ""} key={index} onClick={() => selectPage(index + 1)}>
                <Page pageNumber={index + 1} width={96} renderTextLayer={false} renderAnnotationLayer={false} />
                <span>{index + 1}</span>
              </button>
            ))}
          </aside>
          <main className="signed-viewer-stage">
            {error ? <div className="signed-viewer-error">{error}</div> : (
              <Page pageNumber={page} width={880 * zoom} renderTextLayer={false} renderAnnotationLayer={false} />
            )}
          </main>
          <aside className="signed-viewer-recipients">
            <h3>Recipients</h3>
            {recipients.map((recipient) => (
              <div key={recipient.id}>
                <span>{recipient.name.slice(0, 1).toUpperCase()}</span>
                <p><strong>{recipient.name}</strong><small>{recipient.email || "No email"}</small><em>{recipient.status}</em></p>
              </div>
            ))}
          </aside>
        </div>
      </Document>
    </div>
  );
}
