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
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: context.user.email,
    subject: `BlendSign SMTP test for ${context.org.name}`,
    text: `Email delivery is working for ${context.org.name}.`,
  });
  return NextResponse.json({ ok: true, sentTo: context.user.email });
}
