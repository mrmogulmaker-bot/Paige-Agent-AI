// Helpers for telling Paige what time it is in the user's local timezone.
// Edge functions run on Deno servers (UTC), so without this Paige would think
// it's 3am UTC when you're texting her at 8pm EST.

export interface UserClock {
  /** IANA timezone, e.g. "America/New_York". */
  userTimezone: string;
  /** ISO timestamp captured on the client at request time. */
  userTime: string;
  /** Pre-formatted human string in the user's locale, e.g. "Monday, April 19, 2026 at 8:14 PM EDT". */
  userTimeFormatted: string;
}

export function getUserClock(): UserClock {
  let timezone = "UTC";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    // ignore
  }

  const now = new Date();
  let formatted = now.toString();
  try {
    formatted = now.toLocaleString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });
  } catch {
    // ignore
  }

  return {
    userTimezone: timezone,
    userTime: now.toISOString(),
    userTimeFormatted: formatted,
  };
}
