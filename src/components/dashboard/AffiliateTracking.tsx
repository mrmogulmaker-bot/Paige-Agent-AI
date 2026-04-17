// v2: legacy application/approval flow removed.
// Affiliate enrollment is now automatic via user_roles (admin/coach).
// This wrapper renders the v2 MyReferralsPanel for the current user.
import MyReferralsPanel from "./MyReferralsPanel";

export function AffiliateTracking() {
  return <MyReferralsPanel />;
}
