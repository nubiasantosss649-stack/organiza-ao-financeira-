import "server-only";
import { createTransport } from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}
export type SendMail = (msg: MailMessage) => Promise<void>;

/** E-mail só é enviado quando o SMTP está configurado (qualquer provedor: Resend, SES, Brevo…). */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM);
}

export function smtpSender(): SendMail {
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return async (msg) => {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      replyTo: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || undefined,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
  };
}
