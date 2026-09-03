import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COUNTRY_OPTIONS,
  US_STATE_OPTIONS,
  lookupUsZip,
} from "./setup-address-options";
describe("Solo address assistance", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("includes every ISO country once and postal US regions", () => {
    expect(COUNTRY_OPTIONS).toHaveLength(249);
    expect(new Set(COUNTRY_OPTIONS.map((x) => x.value)).size).toBe(249);
    expect(COUNTRY_OPTIONS[0]).toEqual({ value: "US", label: "United States" });
    expect(US_STATE_OPTIONS).toContainEqual({ value: "IN", label: "Indiana" });
    expect(US_STATE_OPTIONS).toContainEqual({
      value: "AE",
      label: "Armed Forces Europe",
    });
  });
  it("sends only ZIP with no credentials or referrer and preserves multiple choices", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        "post code": "46208",
        "country abbreviation": "US",
        places: [
          { "place name": "Indianapolis", "state abbreviation": "IN" },
          { "place name": "Other City", "state abbreviation": "IN" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await lookupUsZip("46208")).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.zippopotam.us/us/46208",
      expect.objectContaining({
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
      }),
    );
  });
  it("refuses invalid ZIP without a request and mismatched responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          "post code": "99999",
          "country abbreviation": "US",
          places: [],
        }),
      });
    vi.stubGlobal("fetch", fetcher);
    await expect(lookupUsZip("123")).rejects.toThrow("five-digit");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(lookupUsZip("46208")).rejects.toThrow("unexpected");
  });
  it("returns empty on no match and keeps provider errors out of the UI", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ status: 500, ok: false }),
    );
    expect(await lookupUsZip("00000")).toEqual([]);
    await expect(lookupUsZip("46208")).rejects.toThrow("unavailable");
  });
});
