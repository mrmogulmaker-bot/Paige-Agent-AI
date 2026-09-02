import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPaigeClientScope,
  getPaigeClientScope,
  readPaigeOpenScope,
  setPaigeClientScope,
  subscribePaigeClientScope,
} from "./paigeClientScope";

const A = "f1000000-0000-4000-8000-000000001111";
const B = "f2000000-0000-4000-8000-000000002222";
const CLIENT_A = "f1000000-0000-4000-8000-00000000c101";
const CLIENT_B = "f2000000-0000-4000-8000-00000000c201";

beforeEach(() => clearPaigeClientScope());

describe("Solo PAIGE client scope", () => {
  it("hands a scope only to the account it was set under", () => {
    setPaigeClientScope({ tenantId: A, clientId: CLIENT_A, label: "Acme Partners" });
    expect(getPaigeClientScope(A)).toEqual({ tenantId: A, clientId: CLIENT_A, label: "Acme Partners" });
    // The account switched. The stored scope belongs to the account being left, so the
    // answer is null AT READ TIME — not after an effect gets round to clearing it.
    expect(getPaigeClientScope(B)).toBeNull();
    expect(getPaigeClientScope(null)).toBeNull();
    expect(getPaigeClientScope(undefined)).toBeNull();
  });

  it("replaces the scope on a client switch and notifies once", () => {
    const seen = vi.fn();
    const stop = subscribePaigeClientScope(seen);
    setPaigeClientScope({ tenantId: A, clientId: CLIENT_A, label: "Acme Partners" });
    setPaigeClientScope({ tenantId: A, clientId: CLIENT_B, label: "Bravo Logistics" });
    expect(getPaigeClientScope(A)?.clientId).toBe(CLIENT_B);
    expect(seen).toHaveBeenCalledTimes(2);
    // Re-setting the identical scope is not a change and must not churn subscribers.
    setPaigeClientScope({ tenantId: A, clientId: CLIENT_B, label: "Bravo Logistics" });
    expect(seen).toHaveBeenCalledTimes(2);
    stop();
    clearPaigeClientScope();
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("clears to nothing rather than half a scope", () => {
    setPaigeClientScope({ tenantId: A, clientId: CLIENT_A, label: "Acme Partners" });
    setPaigeClientScope({ tenantId: A, clientId: "", label: "Acme Partners" });
    expect(getPaigeClientScope(A)).toBeNull();
    setPaigeClientScope({ tenantId: A, clientId: CLIENT_A, label: "Acme Partners" });
    setPaigeClientScope({ tenantId: "", clientId: CLIENT_A, label: "Acme Partners" });
    expect(getPaigeClientScope(A)).toBeNull();
  });

  it("survives a subscriber that throws", () => {
    const good = vi.fn();
    subscribePaigeClientScope(() => { throw new Error("broken"); });
    const stopGood = subscribePaigeClientScope(good);
    expect(() => setPaigeClientScope({ tenantId: A, clientId: CLIENT_A, label: "Acme" })).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    stopGood();
  });

  it("reads a client scope off a paige:open detail, and refuses everything else", () => {
    expect(readPaigeOpenScope({ clientId: CLIENT_A, clientLabel: " Acme Partners " }, A))
      .toEqual({ tenantId: A, clientId: CLIENT_A, label: "Acme Partners" });
    // The two dispatches that already existed carry a prompt and no client. They must
    // still open the fold and must never be read as a scope.
    expect(readPaigeOpenScope({ prompt: "Use pipeline.catalogue…" }, A)).toBeNull();
    expect(readPaigeOpenScope(undefined, A)).toBeNull();
    expect(readPaigeOpenScope(null, A)).toBeNull();
    expect(readPaigeOpenScope("CLT-1", A)).toBeNull();
    expect(readPaigeOpenScope({ clientId: "   " }, A)).toBeNull();
    expect(readPaigeOpenScope({ clientId: { id: CLIENT_A } }, A)).toBeNull();
    // No resolved account means no scope: the tenant stamp is what makes it readable.
    expect(readPaigeOpenScope({ clientId: CLIENT_A }, null)).toBeNull();
    // A named client with no label is still a scope; the label is display only.
    expect(readPaigeOpenScope({ clientId: CLIENT_A }, A)?.label).toBe("this client");
  });

  it("takes the account from the reader, never from the event", () => {
    // An event cannot nominate the account it applies to. If it could, a surface could
    // stamp another tenant's id onto a scope and have it read back as current.
    const scope = readPaigeOpenScope({ clientId: CLIENT_A, tenantId: B }, A);
    expect(scope?.tenantId).toBe(A);
  });
});
