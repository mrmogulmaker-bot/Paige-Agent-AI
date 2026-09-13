import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

export type SignupPhoneCountry = CountryCode;
export const DEFAULT_SIGNUP_PHONE_COUNTRY: SignupPhoneCountry = "US";

export type SignupPhoneCountryOption = Readonly<{
  code: SignupPhoneCountry;
  label: string;
  callingCode: string;
}>;

export function signupPhoneCountryOptions(locale = "en"): SignupPhoneCountryOption[] {
  const names = typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames([locale], { type: "region" })
    : null;

  return getCountries()
    .map((code) => ({
      code,
      label: names?.of(code) || code,
      callingCode: `+${getCountryCallingCode(code)}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Converts the customer's local or international input to the E.164 value
 * persisted by Auth. An explicit + prefix wins; otherwise the selected country
 * supplies the calling code so customers never have to type it themselves.
 */
export function normalizeSignupMobile(
  value: string,
  country: SignupPhoneCountry = DEFAULT_SIGNUP_PHONE_COUNTRY,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumberFromString(trimmed, country);
  return parsed?.isValid() ? parsed.number : null;
}