export type Mail = { to: string; subject: string; html: string };

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM?.trim());
}

export async function sendMail(mail: Mail): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!key || !from) return { sent: false, reason: "Resend is not configured." };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html }),
  });
  if (!response.ok) return { sent: false, reason: "The email was not sent." };
  return { sent: true };
}

export function inviteEmail(input: { email: string; link: string }): Mail {
  return {
    to: input.email,
    subject: "You are invited to Atmosphere Scope",
    html: `<p>You are invited to an Atmosphere Scope workspace.</p><p><a href="${input.link}">Accept the invite</a></p>`,
  };
}

export function resetEmail(input: { email: string; link: string }): Mail {
  return {
    to: input.email,
    subject: "Reset your Atmosphere Scope password",
    html: `<p>Use this link to choose a new password. It expires soon and works once.</p><p><a href="${input.link}">Reset password</a></p>`,
  };
}

export function shareEmail(input: { email: string; jobName: string; link: string }): Mail {
  return {
    to: input.email,
    subject: "A job was shared with you",
    html: `<p>${escapeHtml(input.jobName)} was shared with you on Atmosphere Scope.</p><p><a href="${input.link}">Open the job</a></p>`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
