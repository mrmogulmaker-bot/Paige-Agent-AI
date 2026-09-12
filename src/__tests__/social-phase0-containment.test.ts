import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Social Operations Phase 0 containment", () => {
  it("mounts the approved truth-oriented Social Command, not the local-only Studio", () => {
    const growth = read("src/solo/growth2.tsx");
    expect(growth).toContain('if(tab==="social") body=<Social data={data}');
    expect(growth).not.toContain('if(tab==="social") body=<SocialStudio');
    expect(growth).not.toContain('import { SocialStudio } from "./social-studio"');
  });

  it("does not query or invoke a Social provider from the Settings readiness surface", () => {
    const settings = read("src/solo/settings-integrations-social.tsx");
    expect(settings).not.toContain('@ts-nocheck');
    expect(settings).not.toContain('from("paige_social_accounts")');
    expect(settings).not.toContain('/functions/v1/paige-social');
    expect(settings).not.toContain('action: "connect"');
    expect(settings).not.toMatch(/>\s*Connect\s*</);
    expect(settings).toContain("Provider connections are not available yet");
    expect(settings).toContain("Declared handles are not connections");
  });

  it("neither advertises nor executes the legacy Chat Social tools", () => {
    const chat = read("supabase/functions/paige-ai-chat/index.ts");
    for (const tool of ["social_post", "social_analytics", "social_accounts"]) {
      expect(chat).not.toMatch(new RegExp(`^\\s*name: "${tool}",\\s*$`, "m"));
    }
    expect(chat).toContain('code: "social_capability_unavailable"');
    expect(chat).toContain("No Social provider action was attempted.");
    expect(chat).not.toContain('/functions/v1/paige-social');
    expect(chat).not.toContain('const socialBody = tc.function.name === "social_post"');
  });

  it("does not render Agency fixture Social reach or engagement as customer evidence", () => {
    const agency = read("src/agency/growth.tsx");
    expect(agency).not.toContain("SOCIAL_POSTS");
    expect(agency).not.toContain("p.reach");
    expect(agency).not.toContain("p.eng");
    expect(agency).toContain("Provider-backed Social activity is unavailable");
  });
});
