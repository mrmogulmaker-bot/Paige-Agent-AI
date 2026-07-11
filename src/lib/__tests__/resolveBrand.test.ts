import { describe, it, expect } from "vitest";
import { resolveBrand, PRIMARY_FLOOR, ACCENT_FLOOR, contrastRatio, readableTextOn, isValidHex } from "@/lib/brand/resolveBrand";

const self = { id: "t1", name: "Acme Co", slug: "acme" };

describe("resolveBrand cascade precedence", () => {
  it("empty chain → token floors + own name, logo null, all source=platform", () => {
    const b = resolveBrand([{}], self);
    expect(b.primary_color).toBe(PRIMARY_FLOOR);
    expect(b.accent_color).toBe(ACCENT_FLOOR);
    expect(b.product_name).toBe("Acme Co");
    expect(b.from_name).toBe("Acme Co");
    expect(b.logo_url).toBeNull();
    expect(b.source.primary_color).toBe("platform");
    expect(b.source.logo_url).toBe("platform");
    expect(b.source.product_name).toBe("platform");
  });

  it("self value wins over agency", () => {
    const b = resolveBrand(
      [{ primary_color: "#00FF00" }, { primary_color: "#AA0011" }],
      self,
    );
    expect(b.primary_color).toBe("#00FF00");
    expect(b.source.primary_color).toBe("tenant");
  });

  it("agency value inherited when self is unset", () => {
    const b = resolveBrand(
      [{ logo_url: "child.png" }, { primary_color: "#AA0011", from_name: "Agency X", logo_url: "agency.png" }],
      self,
    );
    expect(b.logo_url).toBe("child.png"); // self wins
    expect(b.source.logo_url).toBe("tenant");
    expect(b.primary_color).toBe("#AA0011"); // inherited
    expect(b.source.primary_color).toBe("agency");
    expect(b.from_name).toBe("Agency X");
    expect(b.source.from_name).toBe("agency");
  });

  it("floor only where neither self nor agency set", () => {
    const b = resolveBrand([{ logo_url: "child.png" }, {}], self);
    expect(b.accent_color).toBe(ACCENT_FLOOR);
    expect(b.source.accent_color).toBe("platform");
  });

  it("from_name falls back through legacy sender_name / name keys", () => {
    expect(resolveBrand([{ sender_name: "Legacy Sender" }], self).from_name).toBe("Legacy Sender");
    expect(resolveBrand([{ name: "Legacy Name" }], self).from_name).toBe("Legacy Name");
  });

  it("blank strings are treated as unset (not a value)", () => {
    const b = resolveBrand([{ primary_color: "   " }, { primary_color: "#123456" }], self);
    expect(b.primary_color).toBe("#123456");
    expect(b.source.primary_color).toBe("agency");
  });
});

describe("contrast helpers", () => {
  it("white-on-black is maximal contrast (~21:1)", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeGreaterThan(20);
  });
  it("readableTextOn picks white on the dark indigo floor", () => {
    expect(readableTextOn(PRIMARY_FLOOR)).toBe("#FFFFFF");
  });
  it("readableTextOn picks dark on Paige Gold", () => {
    expect(readableTextOn(ACCENT_FLOOR)).toBe("#0A0A0A");
  });
  it("isValidHex", () => {
    expect(isValidHex("#EBB94C")).toBe(true);
    expect(isValidHex("red")).toBe(false);
    expect(isValidHex("#FFF")).toBe(false);
  });
});
