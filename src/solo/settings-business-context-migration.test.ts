import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261103000000_solo_setup_business_context.sql",
  ),
  "utf8",
);
const naicsSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261102010000_official_2022_naics_reference.sql",
  ),
  "utf8",
);

describe("Solo Setup business context migration", () => {
  it("requires meaningful knowledge content and a URL for link sources on the server", () => {
    expect(sql).toContain("Knowledge links require a complete HTTPS URL");
    expect(sql).toContain(
      "Knowledge sources require a link, reference, or note",
    );
    expect(sql).toContain(
      "v_item->>'sourceType'='link' and nullif(btrim(v_item->>'sourceUrl'),'') is null",
    );
    expect(sql).toContain("nullif(btrim(v_item->>'reference'),'') is null");
    expect(sql).toContain("nullif(btrim(v_item->>'notes'),'') is null");
  });
  it("skips writes for unchanged knowledge and voice rows, preserving confirmation provenance and timestamps", () => {
    expect(sql).toMatch(
      /select \* into v_existing_knowledge[\s\S]*?where id=v_id and tenant_id=v_tid for update;/,
    );
    expect(sql).toMatch(
      /if found and row\(v_existing_knowledge[\s\S]*?is not distinct from row\([\s\S]*?v_keep:=array_append\(v_keep,v_id\);\s*continue;[\s\S]*?insert into public\.tenant_setup_knowledge_sources/,
    );
    expect(sql).toMatch(
      /select \* into v_existing_voice[\s\S]*?where id=v_id and tenant_id=v_tid for update;/,
    );
    expect(sql).toMatch(
      /if found and row\(v_existing_voice[\s\S]*?is not distinct from row\([\s\S]*?v_keep:=array_append\(v_keep,v_id\);\s*continue;[\s\S]*?insert into public\.tenant_setup_voice_examples/,
    );
  });
  it("locks the caller profile before resolving the expected tenant for every mutation", () => {
    expect(sql).toContain(
      "solo_setup_lock_expected_tenant(_expected_tenant_id uuid)",
    );
    expect(sql).toMatch(
      /from public\.profiles where user_id=auth\.uid\(\) for update/,
    );
    expect(sql).toContain("v_tid is distinct from _expected_tenant_id");
    expect(
      sql.match(
        /public\.solo_setup_lock_expected_tenant\(_expected_tenant_id\)/g,
      )?.length,
    ).toBeGreaterThanOrEqual(3);
  });
  it("never presents custom-domain senders as the managed identity", () => {
    expect(sql).not.toContain("resolve_tenant_sender(v_tid)");
    expect(sql).toContain(
      "from public.tenant_email_identities i where i.tenant_id=v_tid",
    );
  });
  it("fails closed until the existing managed connector lifecycle supports registry overrides", () => {
    expect(sql).toContain("SETUP_MANAGED_EMAIL_REGISTRATION_UNAVAILABLE");
    expect(sql).not.toMatch(/update public\.tenant_email_identities/i);
    expect(sql).not.toContain("public.provision_tenant_email_identity(v_tid)");
  });
  it("treats null admin supplemental payloads as unchanged and refuses attempted writes", () => {
    expect(sql).toContain("v_access='admin_operational'");
    expect(sql).toContain("_knowledge_sources is not null");
    expect(sql).toContain("_paige_profile is not null");
    expect(sql).not.toContain("v_profile-'provenance') is distinct from");
  });
  it("requires a current email and explicit connection-source decision before replacement", () => {
    expect(sql).toContain("_expected_primary_business_email text");
    expect(sql).toContain("_primary_business_email_decision text");
    expect(sql).toContain("SETUP_EMAIL_CONFLICT");
    expect(sql).toContain("SETUP_EMAIL_OVERRIDE_REQUIRED");
    expect(sql).toContain("primary_email_provenance");
    expect(sql).toContain(
      "v_meta.primary_email_snapshot is distinct from v_current_email",
    );
  });
  it("allowlists profile fields, bounds collections and creates provenance server-side", () => {
    expect(sql).toContain("v_profile_keys constant text[]");
    expect(sql).toContain("jsonb_array_length(_knowledge_sources)>100");
    expect(sql).toContain("jsonb_array_length(_voice_examples)>100");
    expect(sql).toContain("v_profile_provenance := '{}'::jsonb");
    expect(sql).not.toContain(
      "v_profile_provenance jsonb := coalesce(v_profile->'provenance'",
    );
  });
  it("pins every RPC to the authenticated canonical top-level Solo tenant", () => {
    expect(sql).toContain("solo_setup_assert_canonical_tenant");
    expect(sql).toContain("account_type::text='standalone'");
    expect(sql).toContain("parent_tenant_id is null");
    expect(sql).toContain("current_user_tenant_id()");
  });
  it("uses stable tenant-owned upserts and revision conflict detection", () => {
    expect(sql).toContain("_expected_context_revision");
    expect(sql).toContain("on conflict(id) do update");
    expect(sql).toContain("Knowledge source belongs to another workspace");
    expect(sql).toContain("Voice example belongs to another workspace");
  });
  it("keeps Setup knowledge and voice records out of model and network systems", () => {
    expect(sql).toContain("not connected to PAIGE");
    expect(sql).not.toContain("tenant_knowledge_docs");
    expect(sql).not.toContain("kb-ingest-url");
    expect(sql).not.toMatch(/insert into public\.(paige_rail|mind_|spine_)/i);
  });
  it("keeps browser roles behind bounded security-definer contracts", () => {
    expect(sql).toContain(
      "revoke all on table public.tenant_setup_knowledge_sources from public,anon,authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.save_solo_business_context",
    );
  });
  it("searches a complete separately sealed official Census 2022 code reference", () => {
    expect(sql).toContain("public.naics_2022_official_reference");
    expect(naicsSql).toContain("U.S. Census Bureau");
    expect(naicsSql).toContain(
      "('541611','Administrative Management and General Management Consulting Services')",
    );
    expect((naicsSql.match(/^ {2}\('/gm) ?? []).length).toBeGreaterThan(1000);
  });
});
