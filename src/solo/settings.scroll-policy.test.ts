import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE TWO HALVES OF THE OWNER'S SCROLL POLICY, LOCKED (2026-08-31).
 *
 *   · SETTINGS is the intentionally scrollable marketplace/browse class. Every
 *     destination must be reachable through ONE visible, usable scroll owner.
 *   · Clients, Campaigns/Growth, Compass, Command Center, Mind and Analytics keep
 *     their form-fitting, design-locked interaction policy. They must NOT become
 *     document-scrollable as a side effect of repairing Settings.
 *
 * The second half is the one that needs a test. A repair that makes Settings work
 * by loosening a SHARED rule silently changes every other surface that rule was
 * holding, and nothing would have caught it: the locked surfaces have no failing
 * assertion of their own, they just quietly start scrolling. An earlier revision
 * of this branch did exactly that — it excluded `[data-solo-screen-host]` from the
 * blanket clip outright, which un-clipped the host on `clients`, `growth` and
 * `compass` too.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. These are source-contract assertions: they
 * prove the SELECTOR cannot reach a non-Settings surface, which is a property of
 * the cascade and is decidable from the text. They do not prove rendered geometry.
 * That is `scripts/live-drive/calendar-settings-usable-drive.mjs` (Settings) and
 * `scripts/live-drive/solo-locked-surfaces-drive.mjs` (the locked surfaces), both
 * driven inside the real merged `SoloApp`. Neither substitutes for the other, and
 * neither is authenticated production proof.
 */
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
/** Rules only — the comments in these files discuss the very selectors under test. */
const rules = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "");

const tokens = rules(read("src/solo/solo-tokens.css"));
const settings = rules(read("src/solo/settings.css"));
const settingsTsx = read("src/solo/settings.tsx");

describe("locked surfaces keep their form-fitting policy", () => {
  it("leaves the blanket inner-main clip exactly as it was", () => {
    // Unqualified and unweakened. If a future repair adds a `:not(...)` here, it
    // stops being a Settings exception and becomes a platform-wide behaviour
    // change for clients, growth and compass.
    expect(tokens).toMatch(/(^|\n)\.paige-solo main\{overflow:hidden!important\}/);
    expect(tokens).not.toMatch(/\.paige-solo main:not\([^)]*\)\{overflow:hidden!important\}/);
  });

  it("scopes the overflow exception so it cannot match a non-Settings host", () => {
    // Two independent qualifiers, both required: it must be SoloApp's own screen
    // host, AND it must carry the class `SoloSettings` puts there. A clients or
    // growth host satisfies the first and never the second.
    const exception = tokens.match(/\.paige-solo main\[data-solo-screen-host\][^{]*\{overflow:auto!important\}/);
    expect(exception, "the Settings overflow exception is missing").toBeTruthy();
    expect(exception![0]).toContain(".tcs-main--settings-scrollbar-hidden");
  });

  it("keys the exception on a marker only Settings ever applies", () => {
    // The whole scoping argument rests on this: if anything else started adding
    // the class, the exception would silently widen.
    const adders = [...settingsTsx.matchAll(/classList\.add\("tcs-main--settings-scrollbar-hidden"\)/g)];
    expect(adders.length).toBe(1);
    expect(settingsTsx).toMatch(/classList\.remove\("tcs-main--settings-scrollbar-hidden"\)/);
  });
});

describe("Settings gets one visible, usable scroll owner", () => {
  it("resolves the owner through the one shared helper, never a local copy", () => {
    // `SoloSettings` and any surface inside it must agree on WHICH element
    // scrolls. When they drifted, the surface dressed an element with no scroll
    // extent while the real owner kept none.
    expect(settingsTsx).toMatch(/settingsScrollOwner/);
    expect(settingsTsx).not.toMatch(/closest<HTMLElement>\("\[data-solo-screen-host\]"\)/);
  });

  it("makes the owner focusable and takes focus only when nothing else holds it", () => {
    expect(settingsTsx).toMatch(/setAttribute\("tabindex", "-1"\)/);
    expect(settingsTsx).toMatch(/document\.activeElement === document\.body/);
    expect(settingsTsx).toMatch(/focus\(\{ preventScroll: true \}\)/);
  });

  it("restores the shell on unmount, blurring before the attribute goes", () => {
    const cleanup = settingsTsx.slice(settingsTsx.indexOf("return () => {"));
    const blurAt = cleanup.indexOf("scrollOwner.blur()");
    const removeAt = cleanup.indexOf('removeAttribute("tabindex")');
    expect(blurAt).toBeGreaterThan(-1);
    expect(removeAt).toBeGreaterThan(-1);
    // Removing `tabindex` does not itself blur, and once the element is not
    // focusable `blur()` is not reliably honoured.
    expect(blurAt).toBeLessThan(removeAt);
  });

  it("undoes BOTH scrollbar suppression lanes, naming both classes", () => {
    // Undoing one lane leaves the bar hidden in the other. And a single-class
    // override ties on specificity, leaving source order to decide — which it
    // loses, because `settings.css` is imported after the surfaces it dresses.
    for (const lane of ["", "::-webkit-scrollbar"]) {
      expect(
        settings,
        `lane ${lane || "standard"}`,
      ).toMatch(
        new RegExp(
          "\\.tcs-main--settings-scrollbar-hidden\\.tcs-main--settings-scrollbar-shown" +
            lane.replace(/[:-]/g, "\\$&") + "\\s*\\{",
        ),
      );
    }
  });

  it("applies the visible-scrollbar and keyboard fix to EVERY destination", () => {
    // Not just the long ones. It lives in `SoloSettings`, which every destination
    // renders through — not in one surface, which is where it started.
    const effect = settingsTsx.slice(
      settingsTsx.indexOf('classList.add("tcs-main--settings-scrollbar-hidden")'),
    );
    expect(effect.slice(0, 1200)).toMatch(/SETTINGS_SCROLLBAR_SHOWN/);
  });
});
