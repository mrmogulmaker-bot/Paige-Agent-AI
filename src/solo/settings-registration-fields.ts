/**
 * The business facts a carrier registration cannot be filed without.
 *
 * WHY THIS FILE EXISTS. `comms-a2p-register` decides whether a brand can be filed by
 * running `missingProfile()` over `tenant_legal_profile`, and returns the shortfall as
 * `missing_profile_fields`. Registration has always been able to NAME that shortfall. It
 * could not let anyone RESOLVE it, because the mapping from those carrier columns back to
 * the Setup brief keys an owner actually edits existed nowhere — it was implied by two
 * screens and a Postgres function that had never been written down together.
 *
 * So this is that mapping, in one place: carrier column -> brief key -> the control an
 * owner uses. Setup renders these facts inside its own five-subtab information
 * architecture; Registration renders the same facts as the shortfall blocking a filing.
 * Same record, same seam, two framings — and one list, so a field cannot be required by
 * the filing and unreachable in the UI without this file being wrong out loud.
 *
 * WHAT IS DELIBERATELY ABSENT. `business_identity` is server-set to 'direct_customer' by
 * `save_solo_setup_identity` and is not an owner decision. The four representative
 * identity columns the carrier requires — first name, last name, email, business title —
 * are DERIVED from the named Team member by `sync_a2p_representative_identity`
 * (20261201000700), never typed, so the control here is the person, not four boxes whose
 * answers the server would recompute anyway.
 */
import { COUNTRY_OPTIONS, type AddressOption } from "./setup-address-options";
import type { SoloSetupTextField } from "./settings-setup-contract";

/**
 * `businessRegistrationNumber` is write-only: it leaves for the Vault and comes back masked.
 * `authorizedRepresentativeUserId` is not a text fact either — it is the Team member whose
 * name, email and title the server derives, so the control for it is a person picker.
 */
export type RegistrationEditableField =
  | SoloSetupTextField
  | "businessRegistrationNumber"
  | "authorizedRepresentativeUserId";

export type RegistrationField = {
  key: RegistrationEditableField;
  label: string;
  hint?: string;
  /** The `tenant_legal_profile` column the filing reads. Named so the two never drift apart. */
  carrierColumn: string;
  options?: Array<string | AddressOption>;
  /** Never rendered as readable text, never sent back to the browser, never resubmitted. */
  secret?: boolean;
  /** Useful to complete here, but not something the filing is blocked on. */
  optional?: boolean;
};

/** Kept in the shape Setup uses so a shared descriptor can replace both copies later. */
export const ENTITY_TYPE_OPTIONS: readonly string[] = [
  "",
  "Individual / sole proprietor",
  "Co-operative",
  "Corporation",
  "Limited Liability Company",
  "Non-profit Corporation",
  "Partnership",
  "Trust",
  "Other legal person",
];

export const REGISTRATION_IDENTIFIER_OPTIONS: readonly string[] = [
  "", "EIN", "DUNS", "CBN", "CN", "ACN", "CIN", "VAT", "VATRN", "RN", "OTHER",
];

export const REPRESENTATIVE_POSITION_OPTIONS: readonly string[] = [
  "", "Director", "GM", "VP", "CEO", "CFO", "General Counsel", "Other",
];

/** The five the provider accepts. Anything else is rejected by the save seam, not by us. */
export const REGION_OPTIONS: readonly string[] = [
  "USA_AND_CANADA", "AFRICA", "ASIA", "EUROPE", "LATIN_AMERICA",
];

export const REGISTRATION_BUSINESS_FIELDS: readonly RegistrationField[] = [
  { key: "legalName", label: "Legal business name", carrierColumn: "legal_business_name",
    hint: "Exactly as it appears on the registration document. Carriers compare the two." },
  { key: "entityType", label: "Entity type", carrierColumn: "entity_type", options: [...ENTITY_TYPE_OPTIONS] },
  { key: "website", label: "Business website", carrierColumn: "website_url" },
  { key: "industry", label: "Industry", carrierColumn: "business_industry" },
  { key: "regionsOfOperation", label: "Regions of operation", carrierColumn: "business_regions_of_operation",
    hint: "USA_AND_CANADA, AFRICA, ASIA, EUROPE, or LATIN_AMERICA; separate regions with commas." },
  { key: "businessRegistrationIdentifier", label: "Registration identifier", carrierColumn: "business_registration_identifier",
    options: [...REGISTRATION_IDENTIFIER_OPTIONS] },
  { key: "businessRegistrationNumber", label: "Tax or registration number", carrierColumn: "business_registration_number_secret_ref",
    secret: true, hint: "Held in the protected Vault boundary and masked the moment it is saved." },
  { key: "registeredStreet", label: "Street address", carrierColumn: "registered_street" },
  { key: "registeredStreetSecondary", label: "Suite / address line 2", carrierColumn: "registered_street_secondary", optional: true },
  { key: "registeredCity", label: "City", carrierColumn: "registered_city" },
  { key: "registeredRegion", label: "State, province, territory, or region", carrierColumn: "registered_region" },
  { key: "registeredPostalCode", label: "Postal code", carrierColumn: "registered_postal_code" },
  { key: "registeredIsoCountry", label: "Country", carrierColumn: "registered_iso_country", options: COUNTRY_OPTIONS },
  { key: "authorizedRepresentativePhone", label: "Representative phone", carrierColumn: "authorized_representative_phone",
    hint: "Include + and the country code." },
  { key: "authorizedRepresentativeJobPosition", label: "Representative position", carrierColumn: "authorized_representative_job_position",
    options: [...REPRESENTATIVE_POSITION_OPTIONS] },
];

/**
 * The carrier columns `missingProfile()` checks that no field above can supply, because
 * the server derives them. Listed so a reader can account for every required column
 * rather than wonder which ones this file forgot.
 */
export const REGISTRATION_DERIVED_COLUMNS: readonly string[] = [
  "business_identity",
  "authorized_representative_first_name",
  "authorized_representative_last_name",
  "authorized_representative_email",
  "authorized_representative_business_title",
];
