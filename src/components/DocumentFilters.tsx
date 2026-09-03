"use client";

import { EnvelopeStatus } from "@prisma/client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

const statusOptions: { value: EnvelopeStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" }, { value: "SENT", label: "Sent" },
  { value: "PARTIALLY_SIGNED", label: "Partially signed" }, { value: "COMPLETED", label: "Completed" },
  { value: "DECLINED", label: "Declined" }, { value: "EXPIRED", label: "Expired" },
  { value: "VOIDED", label: "Recalled" },
];

type InitialFilters = { q: string; statuses: EnvelopeStatus[]; from: string; to: string };

export default function DocumentFilters({ initial }: { initial: InitialFilters }) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [statuses, setStatuses] = useState<EnvelopeStatus[]>(initial.statuses);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [statusOpen, setStatusOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const activeCount = statuses.length + Number(Boolean(from || to));

  function apply(event?: FormEvent) {
    event?.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (statuses.length) params.set("status", statuses.join(","));
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(params.size ? `/documents?${params.toString()}` : "/documents");
    setStatusOpen(false);
    setDateOpen(false);
  }

  function clear() {
    setQ(""); setStatuses([]); setFrom(""); setTo("");
    router.push("/documents");
  }

  function toggleStatus(status: EnvelopeStatus) {
    setStatuses((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status]);
  }

  function preset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - (days - 1));
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  }

  return (
    <form className="document-filter-bar" onSubmit={apply}>
      <label className="table-search"><Icon name="search" size={17} /><input aria-label="Search by document, owner or recipient" placeholder="Search by document, owner or recipient" value={q} onChange={(event) => setQ(event.target.value)} /></label>
      <div className="toolbar-actions">
        <div className="filter-popover-wrap">
          <button type="button" className={`button button--quiet ${statuses.length ? "is-filtered" : ""}`} aria-expanded={statusOpen} onClick={() => { setStatusOpen(!statusOpen); setDateOpen(false); }}>Status{statuses.length ? ` (${statuses.length})` : ""} <span>⌄</span></button>
          {statusOpen && <div className="filter-popover" aria-label="Filter by status"><strong>Status</strong>{statusOptions.map((option) => <label className="filter-check" key={option.value}><input type="checkbox" checked={statuses.includes(option.value)} onChange={() => toggleStatus(option.value)} /> {option.label}</label>)}<button type="submit" className="button button--dark filter-apply">Apply filters</button></div>}
        </div>
        <div className="filter-popover-wrap">
          <button type="button" className={`button button--quiet ${from || to ? "is-filtered" : ""}`} aria-expanded={dateOpen} onClick={() => { setDateOpen(!dateOpen); setStatusOpen(false); }}>Date{from || to ? " (1)" : ""} <span>⌄</span></button>
          {dateOpen && <div className="filter-popover filter-popover--date" aria-label="Filter by creation date"><strong>Created date</strong><div className="date-presets"><button type="button" onClick={() => preset(1)}>Today</button><button type="button" onClick={() => preset(7)}>Last 7 days</button><button type="button" onClick={() => preset(30)}>Last 30 days</button></div><label>From<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label><button type="submit" className="button button--dark filter-apply">Apply filters</button></div>}
        </div>
        <button type="submit" className="button button--dark">Apply</button>
        {(activeCount > 0 || initial.q) && <button type="button" className="text-button" onClick={clear}>Clear all</button>}
      </div>
    </form>
  );
}
