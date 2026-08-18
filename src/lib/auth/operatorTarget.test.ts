import { describe, expect, it } from "vitest";
import { GOD_CONSOLE, operatorTarget } from "./operatorTarget";

/**
 * This validator decides where an authenticated operator lands, from a value an attacker can
 * put in a URL. The tests below are therefore mostly about what it must REFUSE — an allowlist
 * is only worth what its rejections prove.
 */
describe("operatorTarget", () => {
  it("defaults to the God console when there is no next", () => {
    expect(operatorTarget("")).toBe(GOD_CONSOLE);
    expect(operatorTarget("?foo=bar")).toBe(GOD_CONSOLE);
  });

  it("honours a same-origin operator deep link", () => {
    expect(operatorTarget("?next=%2Foperator%2Ffleet")).toBe("/operator/fleet");
    expect(operatorTarget("?next=%2Foperator%2Fsettings%2Fteam%2Froles")).toBe(
      "/operator/settings/team/roles",
    );
  });

  it("refuses an absolute URL to another origin", () => {
    expect(operatorTarget("?next=https%3A%2F%2Fevil.example%2Foperator%2Ffleet")).toBe(GOD_CONSOLE);
  });

  it("refuses a protocol-relative URL", () => {
    // "//evil.example/..." is same-scheme, other-host — the classic open-redirect bypass.
    expect(operatorTarget("?next=%2F%2Fevil.example%2Ffleet")).toBe(GOD_CONSOLE);
    expect(operatorTarget("?next=%2Foperator%2F%2Fevil.example")).toBe(GOD_CONSOLE);
  });

  it("refuses a backslash-smuggled host", () => {
    // Some parsers normalise "\" to "/", so "/operator/\evil.example" must not pass either.
    expect(operatorTarget("?next=%2Foperator%2F%5Cevil.example")).toBe(GOD_CONSOLE);
  });

  it("refuses any path outside the operator subtree", () => {
    expect(operatorTarget("?next=%2Fadmin")).toBe(GOD_CONSOLE);
    expect(operatorTarget("?next=%2Foperatorx%2Ffleet")).toBe(GOD_CONSOLE);
    expect(operatorTarget("?next=%2Foperator")).toBe(GOD_CONSOLE); // no trailing segment
  });

  it("refuses to bounce back to the door, which would loop", () => {
    expect(operatorTarget("?next=%2Foperator%2Flogin")).toBe(GOD_CONSOLE);
    expect(operatorTarget("?next=%2Foperator%2Flogin%3Fnext%3D%252Foperator%252Ffleet")).toBe(
      GOD_CONSOLE,
    );
  });

  it("refuses a malformed escape rather than throwing", () => {
    expect(operatorTarget("?next=%E0%A4%A")).toBe(GOD_CONSOLE);
  });

  // ── The §39 peer-gate found the original prefix regex accepted these. It only looked at
  //    the character after "/operator/", and "." passes that — then react-router NORMALIZES
  //    the result, so the operator lands outside the subtree entirely. Reproduced before
  //    fixing; these are the regression tests for it.
  it("refuses ..-traversal that escapes the operator subtree", () => {
    expect(operatorTarget("?next=%2Foperator%2F..%2F..%2Fbook%2Fevil-slug")).toBe(GOD_CONSOLE);
    expect(operatorTarget("?next=%2Foperator%2F..%2F..%2Fauth")).toBe(GOD_CONSOLE);
    expect(operatorTarget("?next=%2Foperator%2F..%2F..%2F%2Fevil.example")).toBe(GOD_CONSOLE);
    expect(operatorTarget("?next=%2Foperator%2Ffleet%2F..%2F..%2Fadmin")).toBe(GOD_CONSOLE);
  });

  it("refuses a single-dot segment too", () => {
    expect(operatorTarget("?next=%2Foperator%2F.%2Ffleet")).toBe(GOD_CONSOLE);
  });

  it("refuses a doubled slash anywhere in the path", () => {
    expect(operatorTarget("?next=%2Foperator%2F%2Ffleet")).toBe(GOD_CONSOLE);
  });

  // react-router matches case-insensitively, so the anti-loop check must too — otherwise a
  // crafted /operator/LOGIN passes the guard and resolves right back to the door.
  it("refuses the door in any casing", () => {
    expect(operatorTarget("?next=%2Foperator%2FLOGIN")).toBe(GOD_CONSOLE);
    expect(operatorTarget("?next=%2Foperator%2FLogin")).toBe(GOD_CONSOLE);
  });

  it("keeps a query string on an otherwise-valid operator deep link", () => {
    expect(operatorTarget("?next=%2Foperator%2Ffleet%3Ftab%3Dalerts")).toBe(
      "/operator/fleet?tab=alerts",
    );
  });
});
