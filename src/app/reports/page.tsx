import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ranges = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "12 months" },
  { value: "all", label: "All time" },
];

const statusNames: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIALLY_SIGNED: "Partially signed",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  VOIDED: "Voided",
};

function startDate(range: string) {
  if (range === "all") return undefined;
  const days = Number(range);
  if (![30, 90, 365].includes(days)) return new Date(Date.now() - 30 * 86400000);
  return new Date(Date.now() - days * 86400000);
}

function formatDuration(hours: number | null) {
  if (hours === null) return "Not available";
  if (hours < 24) return `${Math.max(1, Math.round(hours))} hours`;
  const days = hours / 24;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
}

function eventLabel(eventType: string) {
  return eventType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function Reports({ searchParams }: { searchParams: { range?: string } }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");

  const range = ranges.some((item) => item.value === searchParams.range) ? searchParams.range! : "30";
  const from = startDate(range);
  const dateFilter = from ? { gte: from } : undefined;
  const envelopeWhere = {
    orgId: context.org.id,
    deletedAt: null,
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };

  const [envelopes, auditEvents] = await Promise.all([
    prisma.envelope.findMany({
      where: envelopeWhere,
      include: { signers: true, createdBy: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditEvent.findMany({
      where: {
        envelope: envelopeWhere,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      include: { envelope: true, signer: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  const total = envelopes.length;
  const completed = envelopes.filter((item) => item.status === "COMPLETED").length;
  const inProgress = envelopes.filter((item) => item.status === "SENT" || item.status === "PARTIALLY_SIGNED").length;
  const exceptions = envelopes.filter((item) => ["DECLINED", "EXPIRED", "VOIDED"].includes(item.status)).length;
  const totalSigners = envelopes.reduce((sum, item) => sum + item.signers.length, 0);
  const signedSigners = envelopes.reduce((sum, item) => sum + item.signers.filter((signer) => signer.status === "SIGNED").length, 0);
  const completionRate = total ? Math.round((completed / total) * 100) : 0;
  const signerRate = totalSigners ? Math.round((signedSigners / totalSigners) * 100) : 0;
  const completionHours = envelopes
    .filter((item) => item.status === "COMPLETED")
    .map((item) => {
      const finalSignedAt = item.signers.reduce<number | null>((latest, signer) => {
        const signedAt = signer.signedAt?.getTime() ?? null;
        return signedAt !== null && (latest === null || signedAt > latest) ? signedAt : latest;
      }, null);
      return finalSignedAt === null ? null : (finalSignedAt - item.createdAt.getTime()) / 3600000;
    })
    .filter((value): value is number => value !== null && value >= 0);
  const averageCompletion = completionHours.length
    ? completionHours.reduce((sum, value) => sum + value, 0) / completionHours.length
    : null;

  const statusRows = Object.keys(statusNames).map((status) => ({
    status,
    label: statusNames[status],
    count: envelopes.filter((item) => item.status === status).length,
  })).filter((item) => item.count > 0);

  const now = new Date();
  const activity = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    return {
      key: `${year}-${month}`,
      label: date.toLocaleDateString("en-ZA", { month: "short" }),
      count: envelopes.filter((item) => item.createdAt.getUTCFullYear() === year && item.createdAt.getUTCMonth() === month).length,
    };
  });
  const maxActivity = Math.max(1, ...activity.map((item) => item.count));

  return (
    <div className="page reports-page">
      <section className="page-heading page-heading--row">
        <div>
          <p className="eyebrow">Oversight and compliance</p>
          <h1>Reports</h1>
          <p>Monitor signing performance and audit activity for {context.org.name}.</p>
        </div>
        <a className="button button--dark" href={`/api/reports/export?range=${range}`}>
          <Icon name="upload" size={17} /> Export CSV
        </a>
      </section>

      <nav className="report-range" aria-label="Report period">
        <span>Reporting period</span>
        <div>{ranges.map((item) => (
          <Link className={item.value === range ? "is-active" : ""} href={`/reports?range=${item.value}`} key={item.value}>{item.label}</Link>
        ))}</div>
      </nav>

      <section className="report-metrics" aria-label="Signing metrics">
        <article className="panel report-metric"><span>Documents created</span><strong>{total}</strong><small>{inProgress} currently in progress</small></article>
        <article className="panel report-metric"><span>Completion rate</span><strong>{completionRate}%</strong><small>{completed} completed document{completed === 1 ? "" : "s"}</small></article>
        <article className="panel report-metric"><span>Recipient completion</span><strong>{signerRate}%</strong><small>{signedSigners} of {totalSigners} recipients signed</small></article>
        <article className="panel report-metric"><span>Average turnaround</span><strong className="report-duration">{formatDuration(averageCompletion)}</strong><small>From creation to final signature</small></article>
      </section>

      <section className="report-grid">
        <article className="panel report-card">
          <div className="panel-header"><div><h2>Document status</h2><p>Current position of documents created in this period.</p></div></div>
          {statusRows.length ? <div className="status-breakdown">{statusRows.map((item) => (
            <div className="status-breakdown-row" key={item.status}>
              <div><span>{item.label}</span><strong>{item.count}</strong></div>
              <div className="report-progress"><span style={{ width: `${Math.max(5, (item.count / total) * 100)}%` }} /></div>
            </div>
          ))}</div> : <div className="report-empty"><Icon name="report" size={28} /><strong>No document data yet</strong><p>Activity will appear after the first document is created.</p></div>}
        </article>

        <article className="panel report-card">
          <div className="panel-header"><div><h2>Six-month activity</h2><p>Documents created per calendar month.</p></div></div>
          <div className="activity-chart" aria-label="Documents created over six months">{activity.map((item) => (
            <div className="activity-column" key={item.key}>
              <strong>{item.count}</strong>
              <div><span style={{ height: `${Math.max(item.count ? 10 : 2, (item.count / maxActivity) * 100)}%` }} /></div>
              <small>{item.label}</small>
            </div>
          ))}</div>
        </article>
      </section>

      <section className="panel report-audit">
        <div className="panel-header"><div><h2>Recent audit activity</h2><p>The latest recorded events in this reporting period.</p></div><span className="report-exceptions">{exceptions} exception{exceptions === 1 ? "" : "s"}</span></div>
        {auditEvents.length ? <div className="report-event-list">{auditEvents.map((event) => (
          <div className="report-event" key={event.id}>
            <span className="report-event-icon"><Icon name={event.eventType.includes("sign") || event.eventType === "completed" ? "check" : "clock"} size={17} /></span>
            <div><strong>{eventLabel(event.eventType)}</strong><small>{event.envelope.title}{event.signer ? ` · ${event.signer.name}` : ""}</small></div>
            <time>{event.createdAt.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: context.org.timezone })}</time>
          </div>
        ))}</div> : <div className="report-empty report-empty--wide"><Icon name="clock" size={28} /><strong>No audit events in this period</strong><p>Views, signatures and completion events will be listed here.</p></div>}
      </section>
    </div>
  );
}
