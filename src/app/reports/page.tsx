import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { detectRoadblock, recipientTiming, reportTiming, sourceDetails, type ReportEnvelope } from "@/lib/reporting";

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

function formatMoment(value: Date | null, timezone: string) {
  return value ? value.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }) : "-";
}

function filterHref(range: string, source = "all", status = "all", roadblock = "all") {
  const params = new URLSearchParams({ range });
  if (source !== "all") params.set("source", source);
  if (status !== "all") params.set("status", status);
  if (roadblock !== "all") params.set("roadblock", roadblock);
  return `/reports?${params}`;
}

function eventLabel(eventType: string) {
  return eventType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function Reports({ searchParams }: { searchParams: { range?: string; source?: string; status?: string; roadblock?: string } }) {
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
      include: { signers: { include: { auditEvents: { orderBy: { createdAt: "asc" } } } }, auditEvents: { orderBy: { createdAt: "asc" } }, createdBy: true },
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

  const allRows = envelopes.map((envelope) => {
    const reportEnvelope = envelope as unknown as ReportEnvelope;
    return { envelope, source: sourceDetails(reportEnvelope), timing: reportTiming(reportEnvelope), roadblock: detectRoadblock(reportEnvelope) };
  });
  const sourceFilter = searchParams.source || "all";
  const statusFilter = searchParams.status || "all";
  const roadblockFilter = searchParams.roadblock || "all";
  const reportRows = allRows.filter((row) =>
    (sourceFilter === "all" || row.source.type === sourceFilter || row.source.templateId === sourceFilter) &&
    (statusFilter === "all" || row.envelope.status === statusFilter) &&
    (roadblockFilter === "all" || row.roadblock.code === roadblockFilter)
  );
  const filteredEnvelopes = reportRows.map((row) => row.envelope);
  const total = filteredEnvelopes.length;
  const completed = filteredEnvelopes.filter((item) => item.status === "COMPLETED").length;
  const inProgress = filteredEnvelopes.filter((item) => item.status === "SENT" || item.status === "PARTIALLY_SIGNED").length;
  const exceptions = reportRows.filter((item) => item.roadblock.severity === "critical").length;
  const totalSigners = filteredEnvelopes.reduce((sum, item) => sum + item.signers.length, 0);
  const signedSigners = filteredEnvelopes.reduce((sum, item) => sum + item.signers.filter((signer) => signer.status === "SIGNED").length, 0);
  const completionRate = total ? Math.round((completed / total) * 100) : 0;
  const signerRate = totalSigners ? Math.round((signedSigners / totalSigners) * 100) : 0;
  const completionHours = reportRows
    .filter((item) => item.envelope.status === "COMPLETED")
    .map((item) => item.timing.totalHours)
    .filter((value): value is number => value !== null && value >= 0);
  const averageCompletion = completionHours.length
    ? completionHours.reduce((sum, value) => sum + value, 0) / completionHours.length
    : null;

  const statusRows = Object.keys(statusNames).map((status) => ({
    status,
    label: statusNames[status],
    count: filteredEnvelopes.filter((item) => item.status === status).length,
  })).filter((item) => item.count > 0);

  const now = new Date();
  const activity = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    return {
      key: `${year}-${month}`,
      label: date.toLocaleDateString("en-ZA", { month: "short" }),
      count: filteredEnvelopes.filter((item) => item.createdAt.getUTCFullYear() === year && item.createdAt.getUTCMonth() === month).length,
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
        <a className="button button--dark" href={`/api/reports/export?range=${range}&source=${encodeURIComponent(sourceFilter)}&status=${encodeURIComponent(statusFilter)}&roadblock=${encodeURIComponent(roadblockFilter)}`}>
          <Icon name="upload" size={17} /> Export CSV
        </a>
      </section>

      <nav className="report-range" aria-label="Report period">
        <span>Reporting period</span>
        <div>{ranges.map((item) => (
          <Link className={item.value === range ? "is-active" : ""} href={filterHref(item.value, sourceFilter, statusFilter, roadblockFilter)} key={item.value}>{item.label}</Link>
        ))}</div>
      </nav>

      <form className="panel report-filters" method="get">
        <input type="hidden" name="range" value={range} />
        <label>Document source<select name="source" defaultValue={sourceFilter}><option value="all">All sources and templates</option><option value="TEMPLATE">All templates</option><option value="SIGNFORM">SignForms</option><option value="UPLOAD">Uploaded documents</option><option value="SELF_SIGN">Self-signed</option><option value="API">API documents</option>{allRows.filter((row) => row.source.templateId).filter((row, index, rows) => rows.findIndex((candidate) => candidate.source.templateId === row.source.templateId) === index).map((row) => <option value={row.source.templateId} key={row.source.templateId}>{row.source.templateName || row.source.templateKey || "Unnamed template"}{row.source.templateVersion ? ` · v${row.source.templateVersion}` : ""}</option>)}</select></label>
        <label>Status<select name="status" defaultValue={statusFilter}><option value="all">All statuses</option>{Object.entries(statusNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Roadblock<select name="roadblock" defaultValue={roadblockFilter}><option value="all">All roadblocks</option><option value="WEBHOOK_FAILED">Integration/webhook problem</option><option value="DELIVERY_FAILED">Invitation delivery problem</option><option value="FINAL_COPY_FAILED">Final copy delivery problem</option><option value="NOT_OPENED">Not opened 24+ hours</option><option value="VIEWED_NOT_SIGNED">Opened, not signed 24+ hours</option><option value="WAITING_NEXT">Waiting for next signer</option><option value="DECLINED">Declined</option><option value="EXPIRED">Expired</option><option value="CLEAR">Completed normally</option></select></label>
        <button className="button button--dark" type="submit">Apply filters</button>
      </form>

      <section className="report-metrics" aria-label="Signing metrics">
        <article className="panel report-metric"><span>Documents created</span><strong>{total}</strong><small>{inProgress} currently in progress</small></article>
        <article className="panel report-metric"><span>Completion rate</span><strong>{completionRate}%</strong><small>{completed} completed document{completed === 1 ? "" : "s"}</small></article>
        <article className="panel report-metric"><span>Recipient completion</span><strong>{signerRate}%</strong><small>{signedSigners} of {totalSigners} recipients signed</small></article>
        <article className="panel report-metric"><span>Average turnaround</span><strong className="report-duration">{formatDuration(averageCompletion)}</strong><small>From creation to final signature</small></article>
      </section>

      <section className="panel report-performance">
        <div className="panel-header"><div><h2>Document performance</h2><p>Source, recipient response times and the current point of delay.</p></div><span className="report-count">{reportRows.length} document{reportRows.length === 1 ? "" : "s"}</span></div>
        {reportRows.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Document</th><th>Source</th><th>Recipients and timing</th><th>Turnaround</th><th>Status</th><th>Roadblock</th></tr></thead><tbody>{reportRows.map((row) => <tr key={row.envelope.id}>
          <td><Link href={`/documents/${row.envelope.id}`}><strong>{row.envelope.title}</strong></Link><small>Created {formatMoment(row.envelope.createdAt, context.org.timezone)} by {row.envelope.createdBy.name}</small></td>
          <td><strong>{row.source.templateName || row.source.templateKey || row.source.label}</strong><small>{row.source.templateVersion ? `Template v${row.source.templateVersion} · ` : ""}{row.source.label}</small></td>
          <td>{row.envelope.signers.map((signer) => { const timing = recipientTiming(signer); return <span className="report-recipient" key={signer.id}><strong>{signer.name}</strong><small>Sent {formatMoment(timing.sentAt, context.org.timezone)} · Viewed {formatMoment(timing.viewedAt, context.org.timezone)} · Signed {formatMoment(timing.signedAt, context.org.timezone)}<br />Invitation to signature: {formatDuration(timing.receiptToSignHours)}</small></span>; })}</td>
          <td><strong>{formatDuration(row.timing.totalHours)}</strong><small>Sent to view: {formatDuration(row.timing.sentToViewHours)}<br />View to sign: {formatDuration(row.timing.viewToSignHours)}</small></td>
          <td><span className="report-pill">{statusNames[row.envelope.status] || row.envelope.status}</span></td>
          <td><span className={`report-roadblock report-roadblock--${row.roadblock.severity}`}>{row.roadblock.label}</span></td>
        </tr>)}</tbody></table></div> : <div className="report-empty report-empty--wide"><Icon name="report" size={28} /><strong>No matching documents</strong><p>Change the filters to view another reporting segment.</p></div>}
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
