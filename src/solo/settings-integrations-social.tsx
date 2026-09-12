/**
 * Social provider readiness inside Settings → Integrations.
 *
 * Phase 0 intentionally performs no provider/account read and exposes no connection action.
 * paige_social_accounts does not have a replay-safe canonical contract yet, and paige-social
 * implements no tenant-owner OAuth initiation. A declared public handle belongs to
 * social.presence; it is not provider authorization.
 */
export function SocialMediaSection() {
  return (
    <section className="social-media-section" aria-label="Social media accounts">
      <header style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>
          Social Media Accounts
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.5 }}>
          Provider connections are not available yet. No platform is connected, authorized, or
          available for publishing from this workspace through Paige today.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gap: 10,
          padding: "14px 16px",
          borderRadius: 14,
          border: "1px solid var(--line)",
          background: "var(--surface-sunk)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <strong style={{ fontSize: 13, color: "var(--ink)" }}>Provider connection</strong>
          <span className="pill pill-w">UNAVAILABLE</span>
        </div>
        <p style={{ margin: 0, maxWidth: 720, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)" }}>
          Paige needs a tenant-authorized provider, an account-selection step, approved scopes, and
          provider readback before a Connect control can be offered here. No OAuth flow or provider
          action is started from this screen.
        </p>
        <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-3)" }}>
          Declared handles are not connections. They can be recorded in Campaigns → Social so Paige
          knows which public accounts belong to this business; they cannot publish or read analytics.
        </p>
      </div>
    </section>
  );
}
