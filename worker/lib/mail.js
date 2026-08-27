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
  if (/stor\s*24/i.test(organisation?.name || "")) {
    return `${publicBaseUrl(organisation)}/brand/stor24-logo-email.svg?v=official-20260827`;
  }
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
  const stor24 = /stor\s*24/i.test(companyName);
  const subject = stor24 ? `Your Stor24 lease is ready to sign ✍️` : `${documentTitle} - signature requested by ${companyName}`;
  const text = stor24
    ? `Hi ${signerName},\n\nGreat news — your space is secured and your Stor24 lease is ready.\n\nReview and sign your lease here: ${link}\n\nThis secure link is unique to you. Please do not forward it.\n\nNeed a hand? Reply to this email and the Stor24 team will help.\n\nStor24 — space for life in motion.`
    : `Hi ${signerName},\n\n${companyName} has asked you to sign "${documentTitle}" via BlendSign.\n\nSign here: ${link}\n\nThis link is unique to you. Please do not forward it.`;
  const primary = /^#[0-9a-f]{6}$/i.test(organisation?.primaryColour || "") ? organisation.primaryColour : "#191919";
  const accent = /^#[0-9a-f]{6}$/i.test(organisation?.accentColour || "") ? organisation.accentColour : "#229D6C";
  const brandLogo = logoUrl(organisation);
  const logo = brandLogo ? `<img src="${escapeHtml(brandLogo)}" alt="${escapeHtml(companyName)}" style="max-height:56px;max-width:220px">` : `<strong style="font-size:22px">${escapeHtml(companyName)}</strong>`;
  const html = stor24
    ? `<div style="margin:0;background:#f5f3ea;padding:30px 12px;font-family:Arial,sans-serif;color:#071411"><div style="max-width:640px;margin:auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 18px 55px rgba(7,20,17,.14)"><div style="height:9px;background:#ff5a0a"></div><div style="padding:27px 34px 20px"><img src="${escapeHtml(brandLogo)}" alt="Stor24" width="210" style="display:block;width:210px;max-width:70%;height:auto"></div><div style="margin:0 18px;padding:34px 28px;border-radius:20px;background:#071411;color:#fff"><p style="margin:0 0 14px;color:#ff8a50;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase">One quick signature. Then you’re good to go.</p><h1 style="margin:0 0 18px;font-size:34px;line-height:1.05;letter-spacing:-1px">Your space is secured. Let’s make it official.</h1><p style="margin:0;color:#c7d2ce;font-size:16px;line-height:1.6">Hi ${escapeHtml(signerName)}, your Stor24 lease is ready to review and sign online.</p><p style="margin:27px 0 8px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#ff5a0a;color:#fff;padding:15px 25px;text-decoration:none;border-radius:999px;font-weight:800">Review and sign my lease&nbsp; →</a></p></div><div style="padding:30px 34px"><p style="margin:0 0 18px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#d94c00">What happens next?</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="44" valign="top"><div style="width:34px;height:34px;line-height:34px;text-align:center;border-radius:50%;background:#ff5a0a;color:#fff;font-weight:800">1</div></td><td style="padding:0 0 18px"><strong>Review your details</strong><br><span style="color:#61706a;font-size:13px;line-height:1.5">Check the lease and complete any open fields.</span></td></tr><tr><td width="44" valign="top"><div style="width:34px;height:34px;line-height:34px;text-align:center;border-radius:50%;background:#071411;color:#fff;font-weight:800">2</div></td><td style="padding:0 0 18px"><strong>Sign securely online</strong><br><span style="color:#61706a;font-size:13px;line-height:1.5">No printing, scanning or 1995 admin required.</span></td></tr><tr><td width="44" valign="top"><div style="width:34px;height:34px;line-height:34px;text-align:center;border-radius:50%;background:#079447;color:#fff;font-weight:800">3</div></td><td><strong>We’ll send your completed copy</strong><br><span style="color:#61706a;font-size:13px;line-height:1.5">You’ll receive the final signed lease when everyone has signed.</span></td></tr></table><div style="margin-top:25px;padding:16px 18px;border-radius:14px;background:#fff4ed;color:#78310e;font-size:12px;line-height:1.55"><strong>Keep it private.</strong> This signing link is unique to you, so please don’t forward it.</div></div><div style="padding:20px 34px;background:#071411;color:#aebdb7;font-size:11px"><strong style="color:#fff">Stor24</strong> · Space for life in motion.<span style="float:right">Securely powered by BlendSign</span></div></div></div>`
    : `<div style="margin:0;background:#eeeeee;padding:32px;font-family:Arial,sans-serif;color:#191919"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #d1d1d1;border-radius:16px;overflow:hidden"><div style="padding:24px 28px;border-top:5px solid ${accent}">${logo}</div><div style="padding:12px 28px 34px"><p>Hi ${escapeHtml(signerName)},</p><h1 style="font-size:24px">Your signature is requested</h1><p style="line-height:1.6">${escapeHtml(companyName)} has asked you to sign <strong>${escapeHtml(documentTitle)}</strong>.</p><p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:${primary};color:#fff;padding:13px 22px;text-decoration:none;border-radius:999px;font-weight:700">Review and sign</a></p><p style="color:#666;font-size:12px;line-height:1.5">This secure link is unique to you. Please do not forward it.</p></div><div style="padding:17px 28px;background:#eeeeee;color:#666;font-size:10px">Securely powered by BlendSign</div></div></div>`;

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
  const stor24 = /stor\s*24/i.test(companyName);
  const subject = stor24 ? `Done and dusted — your signed Stor24 lease ✅` : `${documentTitle} - completed signed document`;
  const text = `Hi ${signerName},\n\nAll parties have completed "${documentTitle}". Your signed PDF is attached.\n\nDocument SHA-256: ${documentHash}\n\nPlease retain this email and document for your records.`;
  const primary = /^#[0-9a-f]{6}$/i.test(organisation?.primaryColour || "") ? organisation.primaryColour : "#191919";
  const accent = /^#[0-9a-f]{6}$/i.test(organisation?.accentColour || "") ? organisation.accentColour : "#229D6C";
  const brandLogo = logoUrl(organisation);
  const logo = brandLogo ? `<img src="${escapeHtml(brandLogo)}" alt="${escapeHtml(companyName)}" style="max-height:56px;max-width:220px">` : `<strong style="font-size:22px">${escapeHtml(companyName)}</strong>`;
  const html = stor24
    ? `<div style="margin:0;background:#f5f3ea;padding:30px 12px;font-family:Arial,sans-serif;color:#071411"><div style="max-width:640px;margin:auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 18px 55px rgba(7,20,17,.14)"><div style="height:9px;background:#ff5a0a"></div><div style="padding:27px 34px 20px"><img src="${escapeHtml(brandLogo)}" alt="Stor24" width="210" style="display:block;width:210px;max-width:70%;height:auto"></div><div style="margin:0 18px;padding:34px 28px;border-radius:20px;background:#071411;color:#fff"><p style="margin:0 0 14px;color:#ff8a50;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase">Signed. Sealed. Stored.</p><h1 style="margin:0 0 18px;font-size:34px;line-height:1.05">You’re officially part of Stor24.</h1><p style="margin:0;color:#c7d2ce;font-size:16px;line-height:1.6">Hi ${escapeHtml(signerName)}, everyone has signed. Your completed lease is attached to this email.</p></div><div style="padding:30px 34px"><div style="padding:18px;border-radius:14px;background:#eef8f3;border-left:5px solid #079447"><strong style="display:block;margin-bottom:6px">Your signed copy is attached</strong><span style="color:#61706a;font-size:13px">Keep it somewhere safe — we’ve securely retained the signing record too.</span></div><p style="margin:24px 0 7px;color:#61706a;font-size:12px">Document verification</p><p style="margin:0;font-family:monospace;font-size:9px;word-break:break-all;color:#82908a">SHA-256: ${escapeHtml(documentHash)}</p></div><div style="padding:20px 34px;background:#071411;color:#aebdb7;font-size:11px"><strong style="color:#fff">Stor24</strong> · Space for life in motion.<span style="float:right">Securely powered by BlendSign</span></div></div></div>`
    : `<div style="margin:0;background:#eeeeee;padding:32px;font-family:Arial,sans-serif;color:#191919"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #d1d1d1;border-radius:16px;overflow:hidden"><div style="padding:24px 28px;border-top:5px solid ${accent}">${logo}</div><div style="padding:12px 28px 34px"><p>Hi ${escapeHtml(signerName)},</p><h1 style="font-size:24px">Signing is complete</h1><p style="line-height:1.6">Every party has completed <strong>${escapeHtml(documentTitle)}</strong>. The final signed PDF is attached.</p><div style="margin:24px 0;padding:14px 16px;background:#f3f1ed;border-left:4px solid ${accent}"><strong style="display:block;margin-bottom:5px;color:${primary}">Document verification</strong><span style="font-family:monospace;font-size:10px;word-break:break-all;color:#666">SHA-256: ${escapeHtml(documentHash)}</span></div><p style="color:#666;font-size:12px;line-height:1.5">Please retain this email and attachment for your records. The completion certificate remains available in BlendSign.</p></div><div style="padding:17px 28px;background:#eeeeee;color:#666;font-size:10px">Securely powered by BlendSign</div></div></div>`;
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
