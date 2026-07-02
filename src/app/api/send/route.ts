import { NextResponse } from "next/server";

import { sendMail, type MailPayload } from "@/lib/mailer-service";

// Temporary send endpoint: one plain-text email per request, no batching.
// Validation only — sending is delegated to the MailerService.

export async function POST(request: Request) {
  let payload: MailPayload;
  try {
    payload = (await request.json()) as MailPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { smtp, to, subject, body } = payload;
  if (!smtp?.host || !smtp?.port || !to || !subject || body === undefined) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields" },
      { status: 400 }
    );
  }

  try {
    await sendMail(payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to send email",
      },
      { status: 502 }
    );
  }
}
