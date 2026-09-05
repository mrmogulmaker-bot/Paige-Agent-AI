/** Real-Chromium regression for Systems Check drawer focus restoration. */
import { buildLaunchOptions, resolvePlaywright } from "./live-drive.mjs";

const base = process.env.SYSTEMS_CHECK_HARNESS_URL || "http://127.0.0.1:5201";
const pw = await resolvePlaywright();
const browser = await pw.chromium.launch(buildLaunchOptions());
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });

try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  // The finding row moved: the console opens the drawer from the "What was checked" control on an
  // attention item, not from a .sc-finding row in the old evidence trail. What is being regressed
  // is unchanged — Escape must clear inert AND return focus to the exact control that opened it.
  const trigger = page.getByRole("button", { name: "What was checked" }).first();
  await trigger.focus();
  await trigger.click();
  await page.getByRole("dialog", { name: "Finding details" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Finding details" }).waitFor({ state: "detached" });

  const proof = await page.evaluate(() => ({
    activeText: document.activeElement?.textContent?.trim() || "",
    activeTag: document.activeElement?.tagName || "",
    scrollOwnerInert: document.querySelector(".sc-scroll-owner")?.inert ?? null,
  }));
  if (proof.activeTag !== "BUTTON" || !proof.activeText.includes("What was checked")) {
    throw new Error(`Escape did not restore focus after inert cleared: ${JSON.stringify(proof)}`);
  }
  if (proof.scrollOwnerInert !== false) {
    throw new Error(`Systems Check background remained inert: ${JSON.stringify(proof)}`);
  }
  console.log(`PASS real Chromium restored focus after inert cleared: ${JSON.stringify(proof)}`);
} finally {
  await browser.close();
}
