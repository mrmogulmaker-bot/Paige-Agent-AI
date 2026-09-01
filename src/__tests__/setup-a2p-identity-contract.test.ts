import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(path.join(root, "supabase/migrations/20261020020000_setup_a2p_legal_identity_contract.sql"), "utf8");
const setupContract = readFileSync(path.join(root, "src/solo/settings-setup-contract.ts"), "utf8");
const a2pHook = readFileSync(path.join(root, "src/solo/data/useSoloA2P.ts"), "utf8");

describe("Setup to A2P legal identity contract", () => {
  it("keeps full registration numbers in Vault and only returns masked identity state", () => {
    expect(migration).toContain("vault.create_secret");
    expect(migration).toContain("business_registration_number_secret_ref");
    expect(migration).toContain("business_registration_number_last_4");
    expect(migration).not.toMatch(/business_registration_number\s+text/i);
  });

  it("makes the carrier identity part of the Setup contract", () => {
    for (const field of [
      "entityType", "stateOfFormation", "businessRegistrationIdentifier",
      "businessRegistrationNumber", "regionsOfOperation",
      "authorizedRepresentativeUserId", "authorizedRepresentativePhone",
      "authorizedRepresentativeJobPosition",
    ]) expect(setupContract).toContain(`"${field}"`);
  });

  it("synchronizes owner-confirmed Setup identity into the tenant legal profile", () => {
    expect(migration).toContain("save_solo_business_brief");
    expect(migration).toContain("tenant_legal_profile");
    expect(migration).toContain("authorized_representative_user_id");
    expect(migration).toContain("representativeUserIds");
  });

  it("gives A2P a real website column and provider-resource homes", () => {
    expect(migration).toContain("website_url");
    expect(migration).toContain("customer_profile_sid");
    expect(migration).toContain("trust_product_sid");
    expect(a2pHook).toContain('.select("legal_business_name, website_url")');
    expect(a2pHook).not.toContain('.select("legal_business_name, website")');
  });

  it("keeps provider SIDs server-owned alongside existing submission state", () => {
    expect(migration).toContain("a2p_submission_state_is_server_owned");
    expect(migration).toContain("direct callers cannot rewrite provider-owned A2P state");
  });
});
