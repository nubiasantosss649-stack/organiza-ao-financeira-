import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { flushBillingEmails } from "@/lib/email/run";

/**
 * Reenvio periódico dos e-mails de cobrança pendentes (falhas temporárias de SMTP).
 * Protegido por CRON_SECRET: a Vercel Cron envia "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await flushBillingEmails(50));
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
