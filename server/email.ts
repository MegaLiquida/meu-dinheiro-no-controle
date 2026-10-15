function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function appUrl() {
  const value = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (!value) throw new Error("APP_URL is required for password reset emails.");
  return value;
}

function provider() {
  return (process.env.EMAIL_PROVIDER?.trim().toLowerCase() || (process.env.NODE_ENV === "production" ? "" : "console"));
}

export function isPasswordResetEmailConfigured() {
  if (provider() === "console" && process.env.NODE_ENV !== "production") return Boolean(process.env.APP_URL?.trim());
  return provider() === "resend" && Boolean(process.env.RESEND_API_KEY?.trim()) && Boolean(process.env.EMAIL_FROM?.trim()) && Boolean(process.env.APP_URL?.trim());
}

export function passwordResetEmailStatus() {
  if (isPasswordResetEmailConfigured()) return "configured" as const;
  return process.env.NODE_ENV === "production" ? "not_configured" as const : "development_preview" as const;
}

export async function sendPasswordResetEmail(input: { to: string; name: string; token: string }) {
  const resetUrl = `${appUrl()}/#reset=${encodeURIComponent(input.token)}`;
  const subject = "Redefina sua senha · Meu Dinheiro no Controle";
  const safeName = escapeHtml(input.name || "Olá");
  const html = `<p>Olá, ${safeName}.</p><p>Recebemos um pedido para criar uma nova senha para sua conta no Meu Dinheiro no Controle.</p><p><a href="${escapeHtml(resetUrl)}">Criar uma nova senha</a></p><p>Este link expira em 30 minutos e pode ser usado uma única vez. Se você não fez este pedido, ignore este e-mail.</p>`;
  const text = `Olá, ${input.name || "Olá"}.\n\nCrie uma nova senha para sua conta: ${resetUrl}\n\nEste link expira em 30 minutos e pode ser usado uma única vez. Se você não fez este pedido, ignore este e-mail.`;

  if (provider() === "console") {
    if (process.env.NODE_ENV === "production") throw new Error("Console email provider is not allowed in production.");
    console.info("Password reset email preview", { to: input.to, resetUrl });
    return;
  }

  if (provider() !== "resend" || !process.env.RESEND_API_KEY?.trim() || !process.env.EMAIL_FROM?.trim()) {
    throw new Error("Password reset email provider is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM.trim(),
      to: [input.to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Email provider rejected password reset email (${response.status}): ${detail}`);
  }
}
