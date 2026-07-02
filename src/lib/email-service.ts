import type { SmtpAccount } from "./db";

// Client-side orchestration of a single send: calls the API route and
// normalizes the result. No queue or template logic here.

export type SendEmailInput = {
  smtp: SmtpAccount;
  to: string;
  subject: string;
  body: string;
};

export type SendEmailResult = { ok: boolean; error?: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    const response = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await response.json().catch(() => null)) as SendEmailResult | null;
    if (response.ok && data?.ok) return { ok: true };
    return {
      ok: false,
      error: data?.error || `Send failed (HTTP ${response.status})`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}
