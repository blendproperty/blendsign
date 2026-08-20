import Link from "next/link";
import { Icon } from "@/components/Icon";
import { prisma } from "@/lib/prisma";
import { getRequestContext } from "@/lib/account";
import { redirect } from "next/navigation";
import DocumentActions from "@/components/DocumentActions";

export const dynamic = "force-dynamic";

const labels: Record<string, string> = {
  scheduled: "Scheduled",
  "in-progress": "In progress",
  completed: "Completed",
  declined: "Declined",
  expired: "Expired",
  recalled: "Recalled",
  draft: "Draft",
  bulk: "Bulk send",
  action: "Needs your action",
};

export default async function Documents({ searchParams }: { searchParams: { status?: string } }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const envelopes = await prisma.envelope.findMany({
    where: { orgId: context.org.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { signers: true, createdBy: true },
  });
  const heading = searchParams.status ? labels[searchParams.status] ?? "Documents" : "All documents";

  return (
    <div className="page">
      <section className="page-heading page-heading--row">
        <div><p className="eyebrow">Document workspace</p><h1>{heading}</h1><p>Track every document sent through BlendSign.</p></div>
        <Link href="/new" className="button button--dark"><Icon name="plus" size={18} /> New document</Link>
      </section>

      <section className="panel documents-panel">
        <div className="table-toolbar">
          <div className="table-search"><Icon name="search" size={17} /><input placeholder="Search by document or recipient" /></div>
          <div className="toolbar-actions"><button className="button button--quiet">Status <span>⌄</span></button><button className="button button--quiet">Date <span>⌄</span></button></div>
        </div>
        <div className="table-wrap">
          <table className="documents-table">
            <thead><tr><th>Document name</th><th>Owner</th><th>Recipients</th><th>Status</th><th>Created</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {envelopes.map((envelope) => (
                <tr key={envelope.id}>
                  <td><Link className="document-name" href={`/documents/${envelope.id}`}><span className="file-tile"><Icon name="file" size={18} /></span><div><strong>{envelope.title}</strong><small>PDF document</small></div></Link></td>
                  <td>{envelope.createdBy.name}</td>
                  <td>{envelope.signers.map((signer) => signer.email || signer.name).join(", ")}</td>
                  <td><span className={`status status--${envelope.status.toLowerCase().replace("_", "-")}`}>{envelope.status.replaceAll("_", " ")}</span></td>
                  <td>{envelope.createdAt.toISOString().slice(0, 10)}</td>
                  <td><DocumentActions id={envelope.id} signed={Boolean(envelope.signedKey)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {envelopes.length === 0 && (
          <div className="empty-state empty-state--table">
            <span><Icon name="documents" size={30} /></span>
            <h3>No documents found</h3>
            <p>Documents in this view will appear here once they are created.</p>
            <Link href="/new" className="button button--outline">Create a document</Link>
          </div>
        )}
        <div className="table-footer"><span>Showing {envelopes.length} document{envelopes.length === 1 ? "" : "s"}</span><div><button disabled>Previous</button><span>1</span><button disabled>Next</button></div></div>
      </section>
    </div>
  );
}
