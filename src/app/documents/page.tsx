import Link from "next/link";
import { EnvelopeStatus, Prisma } from "@prisma/client";
import { Icon } from "@/components/Icon";
import { prisma } from "@/lib/prisma";
import { getRequestContext } from "@/lib/account";
import { redirect } from "next/navigation";
import DocumentActions from "@/components/DocumentActions";
import DocumentFilters from "@/components/DocumentFilters";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

const legacyStatuses: Record<string, EnvelopeStatus[]> = {
  "in-progress": ["SENT", "PARTIALLY_SIGNED"],
  completed: ["COMPLETED"],
  declined: ["DECLINED"],
  expired: ["EXPIRED"],
  recalled: ["VOIDED"],
  draft: ["DRAFT"],
};

type SearchParams = { q?: string; status?: string; from?: string; to?: string; page?: string };

function parseStatuses(value?: string) {
  if (!value) return [];
  if (legacyStatuses[value]) return legacyStatuses[value];
  const allowed = new Set(Object.values(EnvelopeStatus));
  return Array.from(new Set(value.split(",").filter((status): status is EnvelopeStatus => allowed.has(status as EnvelopeStatus))));
}

function parseDate(value: string | undefined, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function pageHref(searchParams: SearchParams, page: number) {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value && key !== "page") params.set(key, value);
  });
  params.set("page", String(page));
  return `/documents?${params.toString()}`;
}

export default async function Documents({ searchParams }: { searchParams: SearchParams }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");

  const query = searchParams.q?.trim().slice(0, 160) || "";
  const statuses = parseStatuses(searchParams.status);
  const from = parseDate(searchParams.from);
  const to = parseDate(searchParams.to, true);
  const requestedPage = Math.max(1, Number.parseInt(searchParams.page || "1", 10) || 1);
  const where: Prisma.EnvelopeWhereInput = {
    orgId: context.org.id,
    deletedAt: null,
    ...(statuses.length ? { status: { in: statuses } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(query ? {
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { createdBy: { is: { name: { contains: query, mode: "insensitive" } } } },
        { signers: { some: { OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ] } } },
      ],
    } : {}),
  };

  const total = await prisma.envelope.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const envelopes = await prisma.envelope.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { signers: true, createdBy: true },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return (
    <div className="page">
      <section className="page-heading page-heading--row">
        <div><p className="eyebrow">Document workspace</p><h1>All documents</h1><p>Track every document sent through BlendSign.</p></div>
        <Link href="/new" className="button button--dark"><Icon name="plus" size={18} /> New document</Link>
      </section>
      <section className="panel documents-panel">
        <DocumentFilters key={[query, statuses.join(","), searchParams.from, searchParams.to].join("|")} initial={{ q: query, statuses, from: searchParams.from || "", to: searchParams.to || "" }} />
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
        {envelopes.length === 0 && <div className="empty-state empty-state--table"><span><Icon name="documents" size={30} /></span><h3>No documents match these filters</h3><p>Change or clear the filters to see more documents.</p><Link href="/documents" className="button button--outline">Clear filters</Link></div>}
        <div className="table-footer">
          <span>{total ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} documents` : "Showing 0 documents"}</span>
          <div>
            {page > 1 ? <Link href={pageHref(searchParams, page - 1)}>Previous</Link> : <button disabled>Previous</button>}
            <span>{page} of {totalPages}</span>
            {page < totalPages ? <Link href={pageHref(searchParams, page + 1)}>Next</Link> : <button disabled>Next</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
