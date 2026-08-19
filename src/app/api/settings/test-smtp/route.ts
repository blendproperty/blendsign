import { NextResponse } from "next/server";
import { canAdminister, getRequestContext } from "@/lib/account";

export async function POST() {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return NextResponse.json({ error: "SMTP is not configured in the server environment." }, { status: 400 });
  }
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  const configured = context.org.emailFromAddress || process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@blendproperty.co.za";
  const address = configured.match(/<([^>]+)>/)?.[1] || configured;
  await transporter.sendMail({
    from: { name: context.org.emailFromName || context.org.name, address },
    replyTo: context.org.email || undefined,
    to: context.user.email,
    subject: `${context.org.name} email delivery test`,
    text: `Email delivery and sender branding are working for ${context.org.name}.`,
  });
  return NextResponse.json({ ok: true, sentTo: context.user.email });
}
