// ISO 3166-1 country codes; names use the browser's English region display names.
// U.S. postal abbreviations: https://pe.usps.com/text/pub28/28apb.htm
export type AddressOption = { value: string; label: string };
const codes =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
export const COUNTRY_OPTIONS: AddressOption[] = codes
  .map((value) => ({ value, label: regionNames.of(value) || value }))
  .sort((a, b) =>
    a.value === "US"
      ? -1
      : b.value === "US"
        ? 1
        : a.label.localeCompare(b.label),
  );
export const US_STATE_OPTIONS: AddressOption[] =
  "AL|Alabama;AK|Alaska;AZ|Arizona;AR|Arkansas;CA|California;CO|Colorado;CT|Connecticut;DE|Delaware;DC|District of Columbia;FL|Florida;GA|Georgia;HI|Hawaii;ID|Idaho;IL|Illinois;IN|Indiana;IA|Iowa;KS|Kansas;KY|Kentucky;LA|Louisiana;ME|Maine;MD|Maryland;MA|Massachusetts;MI|Michigan;MN|Minnesota;MS|Mississippi;MO|Missouri;MT|Montana;NE|Nebraska;NV|Nevada;NH|New Hampshire;NJ|New Jersey;NM|New Mexico;NY|New York;NC|North Carolina;ND|North Dakota;OH|Ohio;OK|Oklahoma;OR|Oregon;PA|Pennsylvania;RI|Rhode Island;SC|South Carolina;SD|South Dakota;TN|Tennessee;TX|Texas;UT|Utah;VT|Vermont;VA|Virginia;WA|Washington;WV|West Virginia;WI|Wisconsin;WY|Wyoming;AS|American Samoa;GU|Guam;MP|Northern Mariana Islands;PR|Puerto Rico;VI|U.S. Virgin Islands;FM|Federated States of Micronesia;MH|Marshall Islands;PW|Palau;AA|Armed Forces Americas;AE|Armed Forces Europe;AP|Armed Forces Pacific"
    .split(";")
    .map((row) => {
      const [value, label] = row.split("|");
      return { value, label };
    });

export const ADDRESS_AUTOCOMPLETE: Record<string, string> = {
  registeredStreet: "section-business address-line1",
  registeredStreetSecondary: "section-business address-line2",
  registeredCity: "section-business address-level2",
  registeredRegion: "section-business address-level1",
  registeredPostalCode: "section-business postal-code",
  registeredIsoCountry: "section-business country",
};

export type ZipPlace = { city: string; region: string };
// Public lookup only; never send street address, business identity, tenant IDs or credentials.
// Suggestions are not address verification: https://docs.zippopotam.us/docs/v1/
export async function lookupUsZip(
  zip: string,
  signal?: AbortSignal,
): Promise<ZipPlace[]> {
  if (!/^\d{5}$/.test(zip)) throw new Error("Enter a five-digit ZIP code.");
  const response = await fetch(`https://api.zippopotam.us/us/${zip}`, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
  });
  if (response.status === 404) return [];
  if (!response.ok)
    throw new Error(
      "ZIP lookup is unavailable. Enter your city and state, or try again.",
    );
  const data = await response.json();
  if (
    data?.["post code"] !== zip ||
    data?.["country abbreviation"] !== "US" ||
    !Array.isArray(data.places)
  )
    throw new Error(
      "ZIP lookup returned an unexpected result. Enter your address manually.",
    );
  const result: ZipPlace[] = [];
  for (const place of data.places.slice(0, 50)) {
    const city = place?.["place name"],
      region = place?.["state abbreviation"];
    if (
      typeof city !== "string" ||
      !city.trim() ||
      city.length > 120 ||
      Array.from(city).some((character) => character.charCodeAt(0) < 32) ||
      !US_STATE_OPTIONS.some((option) => option.value === region)
    )
      continue;
    if (!result.some((item) => item.city === city && item.region === region))
      result.push({ city, region });
  }
  return result;
}

/**
 * Legal-identity option lists, shared by Setup's Business profile and by Registration's
 * carrier-record editor. They live beside COUNTRY_OPTIONS because both surfaces render the
 * same facts of the same record, and two copies of an enum is two things to drift.
 */
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
