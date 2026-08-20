import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import DocumentDetailActions from "@/components/DocumentDetailActions";
import DocumentSealingStatus from "@/components/DocumentSealingStatus";
import SignedPdfViewer from "@/components/SignedPdfViewer";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null | undefined) {
  if (!date) return "Not recorded";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

export default async function DocumentDetail({ params }: { params: { id: string } }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");

  const envelope = await prisma.envelope.findFirst({
    where: { id: params.id, orgId: context.org.id, deletedAt: null },
    include: {
      createdBy: true,
      signers: { orderBy: { order: "asc" } },
      auditEvents: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!envelope) notFound();

  const completedAt = envelope.auditEvents.find((event) => event.eventType === "completed")?.createdAt;

  return (
    <div className="document-detail-page">
      <div className="document-detail-back"><Link href="/documents"><Icon name="back" size={17} /> All documents</Link></div>
      {envelope.signedKey && <DocumentDetailActions id={envelope.id} title={envelope.title} />}

      <section className="document-detail-summary">
        <div className="document-detail-file">
          <span><Icon name="file" size={30} /></span>
          <div>
            <p className="eyebrow">Completed document</p>
            <h1>{envelope.title}</h1>
            <p>Owned by {envelope.createdBy.name}</p>
            <dl>
              <div><dt>Submitted</dt><dd>{formatDate(envelope.createdAt)}</dd></div>
              <div><dt>Completed</dt><dd>{formatDate(completedAt || (envelope.status === "COMPLETED" ? envelope.updatedAt : null))}</dd></div>
              {envelope.sha256 && <div><dt>Verification</dt><dd title={envelope.sha256}>{envelope.sha256.slice(0, 18)}…</dd></div>}
            </dl>
          </div>
        </div>
        <div className={`document-completion-state ${envelope.status === "COMPLETED" ? "is-complete" : ""}`}>
          <span><Icon name={envelope.status === "COMPLETED" ? "check" : "clock"} size={34} /></span>
          <strong>{envelope.status === "COMPLETED" ? "Completed" : envelope.status.replaceAll("_", " ")}</strong>
          <small>{envelope.status === "COMPLETED" ? "The final PDF is sealed." : "The final PDF is being prepared."}</small>
        </div>
      </section>

      <section className="document-recipient-status panel">
        <header><div><p className="eyebrow">Delivery evidence</p><h2>Recipient status</h2></div><span>{envelope.signers.length} recipient{envelope.signers.length === 1 ? "" : "s"}</span></header>
        {envelope.signers.map((signer) => {
          const events = envelope.auditEvents.filter((event) => event.signerId === signer.id);
          const sent = events.find((event) => event.eventType === "sent");
          const viewed = events.find((event) => event.eventType === "viewed");
          const signed = events.find((event) => event.eventType === "signed");
          const accessEvent = signed || viewed;
          return (
            <div className="recipient-status-row" key={signer.id}>
              <div className="recipient-status-person"><span>{signer.name.slice(0, 1).toUpperCase()}</span><p><strong>{signer.name}</strong><small>{signer.email || signer.phone || "No delivery address"}</small>{accessEvent?.ip && <em>Accessed from IP {accessEvent.ip} on {formatDate(accessEvent.createdAt)}</em>}</p></div>
              <div className="recipient-progress">
                <div className={sent || signed ? "is-done" : ""}><span><Icon name="mail" size={14} /></span><small>Mailed</small></div>
                <i className={viewed || signed ? "is-done" : ""} />
                <div className={viewed || signed ? "is-done" : ""}><span><Icon name="documents" size={14} /></span><small>Viewed</small></div>
                <i className={signed ? "is-done" : ""} />
                <div className={signed ? "is-done" : ""}><span><Icon name="signature" size={14} /></span><small>Signed</small></div>
              </div>
            </div>
          );
        })}
      </section>

      {envelope.signedKey ? (
        <SignedPdfViewer
          envelopeId={envelope.id}
          title={envelope.title}
          recipients={envelope.signers.map(({ id, name, email, status }) => ({ id, name, email, status }))}
        />
      ) : (
        <DocumentSealingStatus id={envelope.id} />
      )}
    </div>
  );
}
