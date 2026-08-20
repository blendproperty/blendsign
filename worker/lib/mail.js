const nodemailer = require("nodemailer");

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  return transporter;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function publicBaseUrl(organisation) {
  const host = organisation?.customDomain || process.env.APP_DOMAIN || "localhost:3000";
  return /^https?:\/\//i.test(host) ? host.replace(/\/$/, "") : `https://${host.replace(/\/$/, "")}`;
}

function logoUrl(organisation) {
  if (organisation?.logoKey && organisation?.id) {
    const version = organisation.updatedAt ? new Date(organisation.updatedAt).getTime() : "1";
    return `${publicBaseUrl(organisation)}/api/brand/${organisation.id}/logo?v=${version}`;
  }
  return organisation?.logoUrl || null;
}

function mailIdentity(organisation) {
  const companyName = organisation?.name || "BlendSign";
  const displayName = organisation?.emailFromName || companyName;
  const configured = organisation?.emailFromAddress || process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@blendproperty.co.za";
  const address = configured.match(/<([^>]+)>/)?.[1] || configured;
  return {
    from: { name: displayName, address },
    replyTo: organisation?.email || undefined,
  };
}

async function sendSigningLinkEmail({ to, signerName, documentTitle, link, organisation }) {
  const t = getTransporter();
  const companyName = organisation?.name || "BlendSign";
  const subject = `${documentTitle} - signature requested by ${companyName}`;
  const text = `Hi ${signerName},\n\n${companyName} has asked you to sign "${documentTitle}" via BlendSign.\n\nSign here: ${link}\n\nThis link is unique to you. Please do not forward it.`;
  const primary = /^#[0-9a-f]{6}$/i.test(organisation?.primaryColour || "") ? organisation.primaryColour : "#191919";
  const accent = /^#[0-9a-f]{6}$/i.test(organisation?.accentColour || "") ? organisation.accentColour : "#229D6C";
  const brandLogo = logoUrl(organisation);
  const logo = brandLogo ? `<img src="${escapeHtml(brandLogo)}" alt="${escapeHtml(companyName)}" style="max-height:56px;max-width:220px">` : `<strong style="font-size:22px">${escapeHtml(companyName)}</strong>`;
  const html = `<div style="margin:0;background:#eeeeee;padding:32px;font-family:Arial,sans-serif;color:#191919"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #d1d1d1;border-radius:16px;overflow:hidden"><div style="padding:24px 28px;border-top:5px solid ${accent}">${logo}</div><div style="padding:12px 28px 34px"><p>Hi ${escapeHtml(signerName)},</p><h1 style="font-size:24px">Your signature is requested</h1><p style="line-height:1.6">${escapeHtml(companyName)} has asked you to sign <strong>${escapeHtml(documentTitle)}</strong>.</p><p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:${primary};color:#fff;padding:13px 22px;text-decoration:none;border-radius:999px;font-weight:700">Review and sign</a></p><p style="color:#666;font-size:12px;line-height:1.5">This secure link is unique to you. Please do not forward it.</p></div><div style="padding:17px 28px;background:#eeeeee;color:#666;font-size:10px">Securely powered by BlendSign</div></div></div>`;

  if (!t) {
    console.log("SMTP not configured — logging email instead:\n", { to, subject, text });
    return;
  }

  await t.sendMail({
    ...mailIdentity(organisation),
    to,
    subject,
    text,
    html,
  });
}

async function sendCompletedDocumentEmail({ to, signerName, documentTitle, document, documentHash, organisation }) {
  const t = getTransporter();
  const companyName = organisation?.name || "BlendSign";
  const subject = `${documentTitle} - completed signed document`;
  const text = `Hi ${signerName},\n\nAll parties have completed "${documentTitle}". Your signed PDF is attached.\n\nDocument SHA-256: ${documentHash}\n\nPlease retain this email and document for your records.`;
  const primary = /^#[0-9a-f]{6}$/i.test(organisation?.primaryColour || "") ? organisation.primaryColour : "#191919";
  const accent = /^#[0-9a-f]{6}$/i.test(organisation?.accentColour || "") ? organisation.accentColour : "#229D6C";
  const brandLogo = logoUrl(organisation);
  const logo = brandLogo ? `<img src="${escapeHtml(brandLogo)}" alt="${escapeHtml(companyName)}" style="max-height:56px;max-width:220px">` : `<strong style="font-size:22px">${escapeHtml(companyName)}</strong>`;
  const html = `<div style="margin:0;background:#eeeeee;padding:32px;font-family:Arial,sans-serif;color:#191919"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #d1d1d1;border-radius:16px;overflow:hidden"><div style="padding:24px 28px;border-top:5px solid ${accent}">${logo}</div><div style="padding:12px 28px 34px"><p>Hi ${escapeHtml(signerName)},</p><h1 style="font-size:24px">Signing is complete</h1><p style="line-height:1.6">Every party has completed <strong>${escapeHtml(documentTitle)}</strong>. The final signed PDF is attached.</p><div style="margin:24px 0;padding:14px 16px;background:#f3f1ed;border-left:4px solid ${accent}"><strong style="display:block;margin-bottom:5px;color:${primary}">Document verification</strong><span style="font-family:monospace;font-size:10px;word-break:break-all;color:#666">SHA-256: ${escapeHtml(documentHash)}</span></div><p style="color:#666;font-size:12px;line-height:1.5">Please retain this email and attachment for your records. The completion certificate remains available in BlendSign.</p></div><div style="padding:17px 28px;background:#eeeeee;color:#666;font-size:10px">Securely powered by BlendSign</div></div></div>`;
  const filename = `${documentTitle}-signed.pdf`.replace(/[^a-zA-Z0-9._-]/g, "_");

  if (!t) {
    throw new Error("SMTP is not configured for completed-document delivery");
  }

  return t.sendMail({
    ...mailIdentity(organisation),
    to,
    subject,
    text,
    html,
    attachments: [{ filename, content: document, contentType: "application/pdf" }],
  });
}

module.exports = { sendSigningLinkEmail, sendCompletedDocumentEmail };
