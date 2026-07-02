import nodemailer from "nodemailer";

// Server-side mailer: the only code that talks SMTP.
// The API route validates input and delegates here.

export type MailPayload = {
  smtp: {
    host: string;
    port: number;
    username: string;
    password: string;
    encryption: "none" | "ssl" | "starttls";
    senderName: string;
    senderEmail: string;
    replyTo?: string;
  };
  to: string;
  subject: string;
  body: string;
};

export async function sendMail(payload: MailPayload): Promise<void> {
  const { smtp, to, subject, body } = payload;

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.encryption === "ssl",
    auth: { user: smtp.username, pass: smtp.password },
    ...(smtp.encryption === "starttls" ? { requireTLS: true } : {}),
    ...(smtp.encryption === "none" ? { ignoreTLS: true } : {}),
  });

  await transporter.sendMail({
    from: smtp.senderName
      ? `"${smtp.senderName.replace(/"/g, "'")}" <${smtp.senderEmail}>`
      : smtp.senderEmail,
    to,
    subject,
    text: body,
    ...(smtp.replyTo ? { replyTo: smtp.replyTo } : {}),
  });
}
