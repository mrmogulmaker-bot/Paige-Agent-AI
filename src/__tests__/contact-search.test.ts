import { describe, it, expect } from "vitest";
// The CRM contact-search helper lives with the edge functions (it builds PostgREST
// .or() filters shared by every "look up a contact by name" tool). It is pure (no Deno
// imports), so vitest can exercise it here as the CI regression guard for hotfix #127 —
// the full-name false-negative the owner caught live ("Tashia Anderson" → 0 results).
import {
  contactSearchTokens,
  contactSearchOrGroup,
  applyContactSearchFilter,
  CONTACT_SEARCH_COLUMNS,
} from "../../supabase/functions/_shared/contact-search";

/** Minimal PostgREST-builder stand-in that records every `.or()` filter string. */
function mockBuilder() {
  const ors: string[] = [];
  const b = {
    ors,
    or(filter: string) {
      ors.push(filter);
      return b;
    },
  };
  return b;
}

describe("contactSearchTokens", () => {
  it("splits a full name into its parts (the bug: this used to be one phrase)", () => {
    expect(contactSearchTokens("Tashia Anderson")).toEqual(["Tashia", "Anderson"]);
  });
  it("keeps every word of a natural-language query", () => {
    expect(contactSearchTokens("Marcus from Atlanta")).toEqual(["Marcus", "from", "Atlanta"]);
  });
  it("collapses extra whitespace and drops empties", () => {
    expect(contactSearchTokens("  Tashia   Anderson  ")).toEqual(["Tashia", "Anderson"]);
  });
  it("strips PostgREST-grammar-significant chars (%, comma, parens) that would break .or()", () => {
    expect(contactSearchTokens("Tashia%,() Anderson")).toEqual(["Tashia", "Anderson"]);
  });
  it("returns no tokens for blank input", () => {
    expect(contactSearchTokens("   ")).toEqual([]);
    expect(contactSearchTokens("")).toEqual([]);
  });
});

describe("contactSearchOrGroup", () => {
  it("ORs a token across the default columns", () => {
    expect(contactSearchOrGroup("Tashia")).toBe(
      "first_name.ilike.%Tashia%,last_name.ilike.%Tashia%,email.ilike.%Tashia%,entity_name.ilike.%Tashia%,phone.ilike.%Tashia%",
    );
  });
  it("honors a custom column list", () => {
    expect(contactSearchOrGroup("X", ["city"])).toBe("city.ilike.%X%");
  });
});

describe("applyContactSearchFilter — 'all' mode (strict by-name lookup)", () => {
  it("emits ONE or()-group PER token (AND-combined) so 'Tashia Anderson' matches first+last", () => {
    const b = mockBuilder();
    applyContactSearchFilter(b, "Tashia Anderson");
    expect(b.ors).toHaveLength(2);
    expect(b.ors[0]).toContain("first_name.ilike.%Tashia%");
    expect(b.ors[0]).toContain("last_name.ilike.%Tashia%");
    expect(b.ors[1]).toContain("first_name.ilike.%Anderson%");
    expect(b.ors[1]).toContain("last_name.ilike.%Anderson%");
  });
  it("a single token behaves exactly like the old single-group search (one or())", () => {
    const b = mockBuilder();
    applyContactSearchFilter(b, "Tashia");
    expect(b.ors).toHaveLength(1);
  });
  it("adds no filter for a blank query", () => {
    const b = mockBuilder();
    applyContactSearchFilter(b, "   ");
    expect(b.ors).toHaveLength(0);
  });
});

describe("applyContactSearchFilter — 'any' mode (fuzzy / natural-language)", () => {
  it("emits a SINGLE or() over every token × column, so stopwords don't zero the result", () => {
    const b = mockBuilder();
    applyContactSearchFilter(b, "Marcus from Atlanta", {
      mode: "any",
      columns: [...CONTACT_SEARCH_COLUMNS, "city"],
    });
    expect(b.ors).toHaveLength(1);
    const group = b.ors[0];
    // every token appears…
    expect(group).toContain("%Marcus%");
    expect(group).toContain("%from%");
    expect(group).toContain("%Atlanta%");
    // …and the city column is searchable (the "from <place>" pattern)
    expect(group).toContain("city.ilike.%Atlanta%");
    // a full name still resolves in any-mode (both tokens present in the OR)
    const b2 = mockBuilder();
    applyContactSearchFilter(b2, "Tashia Anderson", { mode: "any" });
    expect(b2.ors[0]).toContain("%Tashia%");
    expect(b2.ors[0]).toContain("%Anderson%");
  });
});
