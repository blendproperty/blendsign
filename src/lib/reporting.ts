type ReportEvent = {
  eventType: string;
  createdAt: Date;
  signerId?: string | null;
  metadata?: unknown;
};

type ReportSigner = {
  id: string;
  name: string;
  status: string;
  signedAt?: Date | null;
  order: number;
  auditEvents: ReportEvent[];
};

export type ReportEnvelope = {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  auditEvents: ReportEvent[];
  signers: ReportSigner[];
};

export type SourceDetails = {
  type: "TEMPLATE" | "SIGNFORM" | "UPLOAD" | "SELF_SIGN" | "API";
  label: string;
  templateId?: string;
  templateName?: string;
  templateKey?: string;
  templateVersion?: number;
};

export type Roadblock = {
  code: string;
  label: string;
  severity: "clear" | "info" | "warning" | "critical";
};

function metadata(event?: ReportEvent) {
  return event?.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {};
}

function firstEvent(events: ReportEvent[], type: string) {
  return events.filter((event) => event.eventType === type).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]?.createdAt ?? null;
}

function lastEvent(events: ReportEvent[], type: string) {
  return events.filter((event) => event.eventType === type).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt ?? null;
}

export function sourceDetails(envelope: ReportEnvelope): SourceDetails {
  const created = envelope.auditEvents.find((event) => event.eventType === "created");
  const data = metadata(created);
  const explicit = typeof data.sourceType === "string" ? data.sourceType : undefined;
  const templateId = typeof data.templateId === "string" ? data.templateId : undefined;
  const templateName = typeof data.templateName === "string" ? data.templateName : undefined;
  const templateKey = typeof data.templateKey === "string" ? data.templateKey : undefined;
  const templateVersion = typeof data.templateVersion === "number" ? data.templateVersion : undefined;
  const type = (explicit === "SIGNFORM" || explicit === "UPLOAD" || explicit === "SELF_SIGN" || explicit === "API" || explicit === "TEMPLATE")
    ? explicit
    : data.selfSigned ? "SELF_SIGN"
      : templateId ? "TEMPLATE"
        : "UPLOAD";
  const labels = { TEMPLATE: "Template", SIGNFORM: "SignForm", UPLOAD: "Uploaded document", SELF_SIGN: "Self-signed", API: "API document" } as const;
  return { type, label: labels[type], templateId, templateName, templateKey, templateVersion };
}

export function hoursBetween(start: Date | null, end: Date | null) {
  if (!start || !end) return null;
  return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
}

export function reportTiming(envelope: ReportEnvelope) {
  const sentAt = firstEvent(envelope.auditEvents, "sent");
  const viewedAt = firstEvent(envelope.auditEvents, "viewed");
  const finalSignedAt = envelope.signers.reduce<Date | null>((latest, signer) => {
    if (!signer.signedAt) return latest;
    return !latest || signer.signedAt > latest ? signer.signedAt : latest;
  }, null);
  const completedAt = firstEvent(envelope.auditEvents, "completed") || (envelope.status === "COMPLETED" ? envelope.updatedAt : null);
  return {
    sentAt,
    viewedAt,
    finalSignedAt,
    completedAt,
    sentToViewHours: hoursBetween(sentAt, viewedAt),
    viewToSignHours: hoursBetween(viewedAt, finalSignedAt),
    totalHours: hoursBetween(sentAt || envelope.createdAt, completedAt || finalSignedAt),
  };
}

export function recipientTiming(signer: ReportSigner) {
  const sentAt = firstEvent(signer.auditEvents, "sent");
  const viewedAt = firstEvent(signer.auditEvents, "viewed");
  return {
    sentAt,
    viewedAt,
    signedAt: signer.signedAt ?? null,
    receiptToSignHours: hoursBetween(sentAt, signer.signedAt ?? null),
  };
}

export function detectRoadblock(envelope: ReportEnvelope, now = new Date()): Roadblock {
  const events = envelope.auditEvents;
  const latestWebhookFailure = lastEvent(events, "webhook_failed");
  const latestWebhookSuccess = lastEvent(events, "webhook_delivered");
  if (latestWebhookFailure && (!latestWebhookSuccess || latestWebhookFailure > latestWebhookSuccess)) {
    return { code: "WEBHOOK_FAILED", label: "Integration/webhook problem", severity: "critical" };
  }
  const latestFinalCopyFailure = lastEvent(events, "completed_document_failed");
  const latestFinalCopySuccess = lastEvent(events, "completed_document_sent");
  if (latestFinalCopyFailure && (!latestFinalCopySuccess || latestFinalCopyFailure > latestFinalCopySuccess)) {
    return { code: "FINAL_COPY_FAILED", label: "Final copy delivery problem", severity: "critical" };
  }
  const latestDeliveryFailure = lastEvent(events, "delivery_failed");
  const latestDeliverySuccess = lastEvent(events, "sent");
  if (latestDeliveryFailure && (!latestDeliverySuccess || latestDeliveryFailure > latestDeliverySuccess)) {
    return { code: "DELIVERY_FAILED", label: "Signing invitation delivery problem", severity: "critical" };
  }
  if (envelope.status === "DECLINED") return { code: "DECLINED", label: "Recipient declined", severity: "critical" };
  if (envelope.status === "EXPIRED") return { code: "EXPIRED", label: "Signing request expired", severity: "critical" };
  if (envelope.status === "VOIDED") return { code: "VOIDED", label: "Document voided", severity: "critical" };
  if (envelope.status === "COMPLETED") return { code: "CLEAR", label: "Completed normally", severity: "clear" };

  const pending = envelope.signers.filter((signer) => signer.status !== "SIGNED");
  const activeOrder = pending.length ? Math.min(...pending.map((signer) => signer.order)) : null;
  const active = pending.filter((signer) => signer.order === activeOrder);
  const threshold = now.getTime() - 24 * 3_600_000;
  const activeTimings = active.map(recipientTiming);
  if (activeTimings.some((timing) => timing.viewedAt && timing.viewedAt.getTime() <= threshold)) {
    return { code: "VIEWED_NOT_SIGNED", label: "Opened, not signed for 24+ hours", severity: "warning" };
  }
  if (activeTimings.some((timing) => timing.sentAt && !timing.viewedAt && timing.sentAt.getTime() <= threshold)) {
    return { code: "NOT_OPENED", label: "Not opened for 24+ hours", severity: "warning" };
  }
  if (active.length && activeTimings.every((timing) => !timing.sentAt)) {
    const earlierSigned = envelope.signers.some((signer) => signer.status === "SIGNED" && signer.order < (activeOrder ?? 0));
    return earlierSigned
      ? { code: "WAITING_NEXT", label: "Waiting for next signer delivery", severity: "warning" }
      : { code: "NOT_SENT", label: "Signing invitation not sent", severity: "warning" };
  }
  return { code: "IN_PROGRESS", label: "In progress - within target", severity: "info" };
}
