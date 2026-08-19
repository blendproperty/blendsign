import Link from "next/link";
import { Icon } from "@/components/Icon";
import { prisma } from "@/lib/prisma";
import { getRequestContext } from "@/lib/account";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const companyFilter = { orgId: context.org.id, deletedAt: null };
  const [total, inProgress, completed, recent] = await Promise.all([
    prisma.envelope.count({ where: companyFilter }),
    prisma.envelope.count({ where: { ...companyFilter, status: { in: ["SENT", "PARTIALLY_SIGNED"] } } }),
    prisma.envelope.count({ where: { ...companyFilter, status: "COMPLETED" } }),
    prisma.envelope.findMany({
      where: companyFilter,
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { signers: true },
    }),
  ]);

  return (
    <div className="page dashboard-page">
      <section className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">{context.org.name}</p>
          <h1>Good morning</h1>
          <p>Send, track and manage property documents from one secure workspace.</p>
        </div>
        <Link href="/new" className="button button--dark"><Icon name="plus" size={18} /> New document</Link>
      </section>

      <section className="action-grid" aria-label="Signing actions">
        <Link href="/new" className="action-card action-card--primary">
          <span className="action-icon"><Icon name="send" size={34} /></span>
          <span><strong>Send for signatures</strong><small>Upload a document and invite signers</small></span>
          <Icon name="chevron" className="action-arrow" />
        </Link>
        <Link href="/new?mode=self" className="action-card">
          <span className="action-icon"><Icon name="signature" size={35} /></span>
          <span><strong>Sign it yourself</strong><small>Add your signature to a document</small></span>
          <Icon name="chevron" className="action-arrow" />
        </Link>
        <Link href="/templates" className="action-card">
          <span className="action-icon"><Icon name="template" size={34} /></span>
          <span><strong>Use a template</strong><small>Start from an approved document</small></span>
          <Icon name="chevron" className="action-arrow" />
        </Link>
      </section>

      <section className="stats-grid">
        <Link href="/documents" className="stat-card"><span>All documents</span><strong>{total}</strong><small><Icon name="documents" size={16} /> Entire workspace</small></Link>
        <Link href="/documents?status=in-progress" className="stat-card"><span>In progress</span><strong>{inProgress}</strong><small><Icon name="clock" size={16} /> Awaiting signatures</small></Link>
        <Link href="/documents?status=completed" className="stat-card"><span>Completed</span><strong>{completed}</strong><small><Icon name="check" size={16} /> Fully signed</small></Link>
        <div className="stat-card"><span>Compliance</span><strong className="compliance-value">Secure</strong><small><Icon name="shield" size={16} /> Hosted in South Africa</small></div>
      </section>

      <section className="panel recent-panel">
        <div className="panel-header">
          <div><h2>Recent documents</h2><p>Your latest activity across BlendSign.</p></div>
          <Link href="/documents" className="text-link">View all documents <Icon name="chevron" size={15} /></Link>
        </div>
        {recent.length === 0 ? (
          <div className="empty-state empty-state--compact">
            <span><Icon name="file" size={28} /></span>
            <div><strong>No documents yet</strong><p>Your most recent envelopes will appear here.</p></div>
            <Link href="/new" className="button button--outline">Send your first document</Link>
          </div>
        ) : (
          <div className="recent-list">
            {recent.map((envelope) => (
              <div className="recent-row" key={envelope.id}>
                <span className="file-tile"><Icon name="file" size={19} /></span>
                <div className="recent-main"><strong>{envelope.title}</strong><small>{envelope.signers.length} signer{envelope.signers.length === 1 ? "" : "s"}</small></div>
                <span className={`status status--${envelope.status.toLowerCase().replace("_", "-")}`}>{envelope.status.replaceAll("_", " ")}</span>
                <time>{envelope.createdAt.toISOString().slice(0, 10)}</time>
                <button className="icon-button"><Icon name="more" /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
