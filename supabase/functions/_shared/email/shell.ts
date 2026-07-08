// Generic, tenant-neutral auth-email shell + per-action content.
//
// The shell is 100% branding-token driven — no tenant colors/words are baked
// in. Copy is written generically so it reads correctly for ANY tenant; the
// distinctive flavor comes from each tenant's branding (logo, colors, wordmark,
// tagline), not the body text. Two audiences are distinguished: end-user
// "consumer" (signup / magic link / recovery) vs "workspace" (team invite).

import type { EmailBranding } from "./branding.ts";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export type AuthEmailContent = {
  subject: string;
  heading: string;
  paragraphs: string[]; // may contain pre-escaped <strong> — we control these strings
  ctaLabel: string;
  footnote: string;
  audience: "consumer" | "workspace";
};

/**
 * Build the content for a given Supabase auth action, injecting the tenant's
 * brand name and the recipient email. Copy stays generic/tenant-neutral.
 */
export function authEmailContent(
  actionType: string,
  brandName: string,
  recipientEmail: string,
): AuthEmailContent {
  const brand = esc(brandName);
  const email = `<strong>${esc(recipientEmail)}</strong>`;
  switch (actionType) {
    case "invite":
      return {
        subject: `You've been invited to ${brandName}`,
        // heading is escaped once at render — pass raw brandName (not pre-esc'd).
        heading: `You've been invited to ${brandName}`,
        paragraphs: [
          `You've been invited to join the ${brand} workspace. Accept your invitation to set up your account and get started with your team.`,
          `Your invitation is tied to ${email}:`,
        ],
        ctaLabel: "Accept invitation",
        footnote: "If you weren't expecting this invitation, you can safely ignore this email.",
        audience: "workspace",
      };
    case "magiclink":
      return {
        subject: `Your ${brandName} login link`,
        heading: "Your login link",
        paragraphs: [
          `Here's your secure link to sign in to ${brand} — no password needed.`,
          `Signing in as ${email}:`,
        ],
        ctaLabel: `Sign in to ${brandName}`,
        footnote: "This link expires in 1 hour and can be used once. If you didn't ask to sign in, ignore this email.",
        audience: "consumer",
      };
    case "recovery":
      return {
        subject: `Reset your ${brandName} password`,
        heading: "Reset your password",
        paragraphs: [
          `We received a request to reset the password for ${email}. Choose a new one with the button below.`,
        ],
        ctaLabel: "Reset my password",
        footnote: "This link expires in 1 hour. If you didn't request this, ignore this email — your password won't change.",
        audience: "consumer",
      };
    case "email_change":
      return {
        subject: `Confirm your new email for ${brandName}`,
        heading: "Confirm your new email",
        paragraphs: [
          `Confirm ${email} to finish updating the email on your ${brand} account.`,
        ],
        ctaLabel: "Confirm new email",
        footnote: "If you didn't request this change, ignore this email and your address stays the same.",
        audience: "consumer",
      };
    case "signup":
    default:
      return {
        subject: `Confirm your email`,
        heading: "Confirm your email",
        paragraphs: [
          `Welcome to ${brand}. You're one click from activating your account.`,
          `Confirm the address ${email} to get started:`,
        ],
        ctaLabel: "Confirm my email",
        footnote: "This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.",
        audience: "consumer",
      };
  }
}

/**
 * Render the branded, email-client-safe HTML for an auth email.
 * All visual identity comes from `branding`; all copy from `content`.
 */
export function renderAuthEmail(branding: EmailBranding, content: AuthEmailContent, ctaUrl: string): string {
  const {
    primaryColor, accentColor, onAccentColor, bgColor, wordmark, tagline, logoUrl,
  } = branding;
  // Only allow http(s) CTA links (the Supabase verify URL). Anything else → "#".
  const safeUrl = /^https?:\/\//i.test(ctaUrl) ? esc(ctaUrl) : "#";

  const header = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(branding.brandName)}" height="40" style="display:block;margin:0 auto;max-height:40px;" />`
    : `<div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1;letter-spacing:6px;color:${accentColor};font-weight:400;">${esc(wordmark)}</div>`;

  const taglineRow = tagline
    ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1;letter-spacing:3px;color:#8a93a3;margin-top:16px;text-transform:uppercase;">${esc(tagline)}</div>`
    : "";

  const paragraphs = content.paragraphs
    .map((p) => `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#3a4356;">${p}</p>`)
    .join("\n");

  const footerTagline = tagline ? `<br/>${esc(tagline)}` : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(content.subject)}</title>
</head><body style="margin:0;padding:0;">
<div style="margin:0;padding:0;background-color:${bgColor};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${bgColor};margin:0;padding:0;">
    <tr><td align="center" style="padding:32px 16px;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${bgColor};">${esc(content.heading)}</div>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e6e8ec;border-radius:14px;overflow:hidden;">
        <tr><td style="background-color:${primaryColor};padding:34px 40px 30px 40px;text-align:center;">
          ${header}
          <div style="height:1px;line-height:1px;font-size:0;background-color:${accentColor};opacity:0.4;width:56px;margin:18px auto 0 auto;">&nbsp;</div>
          ${taglineRow}
        </td></tr>
        <tr><td style="padding:44px 40px 4px 40px;">
          <h1 style="margin:0 0 18px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${primaryColor};font-weight:400;">${esc(content.heading)}</h1>
          ${paragraphs}
        </td></tr>
        <tr><td style="padding:14px 40px 8px 40px;" align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="center" style="border-radius:8px;background-color:${accentColor};">
              <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:15px 38px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;line-height:1;color:${onAccentColor};text-decoration:none;border-radius:8px;letter-spacing:0.3px;">${esc(content.ctaLabel)}</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:26px 40px 0 40px;">
          <p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#8a90a0;">Button not working? Paste this link into your browser:</p>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;word-break:break-all;"><a href="${safeUrl}" target="_blank" style="color:#6b7280;text-decoration:underline;">${safeUrl}</a></p>
        </td></tr>
        <tr><td style="padding:28px 40px 36px 40px;">
          <div style="height:1px;line-height:1px;font-size:0;background-color:#eceef1;margin-bottom:22px;">&nbsp;</div>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#9aa0ac;">${esc(content.footnote)}</p>
        </td></tr>
        <tr><td style="background-color:${primaryColor};padding:24px 40px;text-align:center;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:3px;color:${accentColor};">${esc(wordmark)}</div>
          <p style="margin:10px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8791a0;">© ${esc(branding.brandName)}${footerTagline}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>
</body></html>`;
}
