import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  mountPaigeBootSplash,
  resolvePaigeBootTheme,
  unmountPaigeBootSplash,
} from "../../boot-splash";

const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const mainSource = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
const bootSource = readFileSync(resolve(process.cwd(), "src/boot-splash.tsx"), "utf8");
const viteSource = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

afterEach(() => {
  unmountPaigeBootSplash();
  document.body.innerHTML = "";
});

describe("Paige boot splash branding", () => {
  it("renders the shared canonical Paige Command Mark geometry", () => {
    const host = document.createElement("div");
    document.body.append(host);
    expect(mountPaigeBootSplash(host, "dark")).toBe(true);

    const mark = host.querySelector(".pcm");
    expect(mark).not.toBeNull();
    expect(mark?.querySelector('polygon[points="21,13.6 30.5,13.6 21,34.4 11.5,34.4"]')).not.toBeNull();
    expect(mark?.querySelector('circle[cx="34.5"][cy="30.5"][r="5.5"]')).not.toBeNull();
    expect(mark?.querySelector(".pcm-glyph")?.getAttribute("aria-hidden")).toBe("true");

    window.dispatchEvent(new Event("paige:boot-splash-unmount"));
    window.dispatchEvent(new Event("paige:boot-splash-unmount"));
    expect(host.childElementCount).toBe(0);
  });

  it("falls back to the system theme when storage is blocked", () => {
    expect(resolvePaigeBootTheme(
      () => { throw new Error("storage blocked"); },
      () => false,
    )).toBe("light");
  });

  it("does not mount when the neutral booking-page script removed the host", () => {
    expect(mountPaigeBootSplash(null, "dark")).toBe(false);
  });

  it("has no independently drawn mark in the pre-hydration document", () => {
    expect(indexHtml).toContain('id="paige-splash-mark"');
    expect(indexHtml).toContain('src="/src/boot-splash.tsx"');
    expect(indexHtml).not.toContain('src="/src/main.tsx"');
    expect(indexHtml).not.toMatch(/\bpsx-(?:plate|slash|dot)\b/);
    expect(mainSource).toContain('new Event("paige:boot-splash-unmount")');
    expect(mainSource).not.toMatch(/from ["']\.\/boot-splash["']/);
    expect(bootSource).toContain('import("./main.tsx")');
    expect(viteSource).toContain('"paige-command-mark"');
  });
});
