const nodemailer = require("nodemailer");

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  return transporter;
}

async function sendSigningLinkEmail({ to, signerName, documentTitle, link }) {
  const t = getTransporter();
  const subject = `${documentTitle} — signature requested`;
  const text = `Hi ${signerName},\n\nYou've been asked to sign "${documentTitle}" via BlendSign.\n\nSign here: ${link}\n\nThis link is unique to you — please don't forward it.`;

  if (!t) {
    console.log("SMTP not configured — logging email instead:\n", { to, subject, text });
    return;
  }

  await t.sendMail({
    from: process.env.SMTP_FROM || "BlendSign <no-reply@blendproperty.co.za>",
    to,
    subject,
    text,
  });
}

module.exports = { sendSigningLinkEmail };
