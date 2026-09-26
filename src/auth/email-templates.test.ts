import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.join(process.cwd(), "supabase/templates");

const expected = {
  "confirmation.html": { subject: "Confirm your Atmosphere Scope account", next: "{{ .RedirectTo }}", type: "type=signup" },
  "invite.html": { subject: "You're invited to Atmosphere Scope", next: "next=/auth/reset", type: "type=invite" },
  "magic-link.html": { subject: "Sign in to Atmosphere Scope", next: "next=/", type: "type=magiclink" },
  "recovery.html": { subject: "Reset your Atmosphere Scope password", next: "next=/auth/reset", type: "type=recovery" },
  "email-change.html": { subject: "Confirm your new Atmosphere Scope email", next: "next=/account", type: "type=email_change" },
} as const;

describe("auth email templates", () => {
  it("uses a light card, the yellow button, and the public callback", () => {
    for (const [file, spec] of Object.entries(expected)) {
      const html = readFileSync(path.join(dir, file), "utf8");
      expect(html, file).toContain(`Subject: ${spec.subject}`);
      expect(html, file).toContain("{{ .SiteURL }}/brand/email-lockup.png");
      expect(html, file).toContain("#f5c518");
      expect(html, file).toContain("{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}");
      expect(html, file).toContain(spec.type);
      expect(html, file).toContain(spec.next);
      expect(html, file).toContain("Property damage assessment and estimating.</td>");
      expect(html, file).not.toMatch(/background:\s*#18191b/i);
      expect(html, file).not.toContain("copy this link");
      expect(html, file).toContain("max-width:520px");
    }
    expect(readdirSync(dir).filter((name) => name.endsWith(".html")).sort()).toEqual(Object.keys(expected).sort());
    expect(readFileSync(path.join(dir, "README.md"), "utf8")).toContain("Confirm your Atmosphere Scope account");
  });
});