// @ts-nocheck
// SocialMediaSection — the 14-platform social media connection surface inside
// Integrations (owner ruling: "every connection goes in Integrations").
//
// DESIGN THESIS: A wall of instantly recognizable platform brands — each with its
// signature color, a clear connection state, and a one-click connect action.
// This surface tells the owner "this platform is serious" the moment they see it.
//
// The Upload-Post API handles the OAuth flow. Our `paige-social` edge function
// is the adapter. Paige reads these connections via `social_accounts`.
// NEXUS operates on them via `social_post` / `social_analytics`.
//
// States: loading / error+retry / empty (no connections yet) / populated.
// Design: brand-color chips, clean grid, honest status per platform.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ── Platform catalogue: brand colors for instant recognition ────────────────
const PLATFORMS = [
  { id: "instagram", name: "Instagram", color: "#E4405F", bg: "#FFE5EE", monogram: "Ig" },
  { id: "tiktok", name: "TikTok", color: "#00F2EA", bg: "#E0FBFA", monogram: "Tt", dark: true },
  { id: "youtube", name: "YouTube", color: "#FF0000", bg: "#FFE5E5", monogram: "Yt" },
  { id: "linkedin", name: "LinkedIn", color: "#0A66C2", bg: "#E1EEF9", monogram: "in" },
  { id: "facebook", name: "Facebook", color: "#1877F2", bg: "#E3F0FE", monogram: "f" },
  { id: "x", name: "X", color: "#000000", bg: "#E8E8E8", monogram: "X", dark: true },
  { id: "threads", name: "Threads", color: "#000000", bg: "#E8E8E8", monogram: "@", dark: true },
  { id: "pinterest", name: "Pinterest", color: "#E60023", bg: "#FFE5E7", monogram: "P" },
  { id: "reddit", name: "Reddit", color: "#FF4500", bg: "#FFE8E0", monogram: "r" },
  { id: "bluesky", name: "Bluesky", color: "#0285FF", bg: "#E2F1FF", monogram: "☁" },
  { id: "discord", name: "Discord", color: "#5865F2", bg: "#E8EAFE", monogram: "Dc" },
  { id: "telegram", name: "Telegram", color: "#26A5E4", bg: "#E0F2FC", monogram: "Tg" },
  { id: "google_business", name: "Google Business", color: "#4285F4", bg: "#E4EEFC", monogram: "GB" },
  { id: "snapchat", name: "Snapchat", color: "#FFFC00", bg: "#FFFECC", monogram: "Sc", dark: true },
];

interface ConnectedAccount {
  platform: string;
  handle: string;
  display_name: string | null;
  status: string;
  avatar_url: string | null;
}

export function SocialMediaSection() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Read from our paige_social_accounts table (per-tenant, RLS-gated).
      const { data, error: readErr } = await supabase
        .from("paige_social_accounts")
        .select("platform, handle, display_name, status, avatar_url")
        .order("platform");
      if (readErr) throw readErr;
      setAccounts((data ?? []) as ConnectedAccount[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load social media connections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const byPlatform = new Map(accounts.map((a) => [a.platform, a]));
  const connectedCount = accounts.length;

  const connect = async (platformId: string) => {
    setConnecting(platformId);
    try {
      // Call our paige-social edge function to initiate the Upload-Post OAuth flow.
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-social`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ action: "connect", platform: platformId }),
        }
      );
      const j = await r.json().catch(() => ({}));
      if (j?.connect_url) {
        // Open the OAuth flow in a new tab (Upload-Post's hosted connect page).
        window.open(j.connect_url, "_blank", "noopener");
      } else if (j?.error) {
        setError(j.error);
      }
    } catch {
      setError("Couldn't start the connection flow.");
    } finally {
      setConnecting(null);
    }
  };

  return (
    <section className="social-media-section" aria-label="Social media accounts">
      <header style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>
          Social Media Accounts
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.5 }}>
          Connect your accounts to post, schedule, and read analytics across 14 platforms.
          Paige (NEXUS) operates these connections — you approve every post.
        </p>
      </header>

      {loading ? (
        <p role="status" style={{ padding: "20px 0", fontSize: 13, color: "var(--ink-3)" }}>
          Loading social media connections…
        </p>
      ) : error ? (
        <div role="alert" style={{ padding: "14px 0" }}>
          <p style={{ fontSize: 13, color: "var(--ink-2)" }}>{error}</p>
          <button type="button" onClick={() => void load()} style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "var(--gold)", background: "none", border: 0, cursor: "pointer", padding: 0 }}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 14px", borderRadius: 12, background: "var(--surface-sunk)" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: connectedCount > 0 ? "var(--ok)" : "var(--ink-3)" }}>
              {connectedCount > 0 ? `${connectedCount} account${connectedCount === 1 ? "" : "s"} connected` : "No accounts connected yet"}
            </span>
            {connectedCount > 0 && (
              <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                · Paige can post to {Array.from(new Set(accounts.map((a) => a.platform))).join(", ")}
              </span>
            )}
          </div>

          {/* Platform grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            {PLATFORMS.map((p) => {
              const acct = byPlatform.get(p.id);
              const isConnected = !!acct;
              const isConnecting = connecting === p.id;
              return (
                <div key={p.id} style={{
                  display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px",
                  borderRadius: 14, border: `1px solid ${isConnected ? p.color + "33" : "var(--line)"}`,
                  background: isConnected ? p.bg : "var(--surface)",
                  transition: "border-color .15s, background .15s",
                  opacity: isConnecting ? 0.6 : 1,
                }}>
                  {/* Brand row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      display: "grid", placeItems: "center", width: 28, height: 28,
                      borderRadius: 8, background: p.dark ? p.color : p.color + "22",
                      color: p.dark ? "#fff" : p.color, fontSize: 11, fontWeight: 800,
                      letterSpacing: "-.02em",
                    }}>
                      {p.monogram}
                    </span>
                    <span style={{ fontSize: 12.8, fontWeight: 650, color: "var(--ink)" }}>
                      {p.name}
                    </span>
                  </div>

                  {/* Status row */}
                  {isConnected ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: acct.status === "connected" ? "var(--ok)" : "var(--warn)" }} />
                      <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>
                        @{acct.handle}
                      </span>
                      {acct.status !== "connected" && (
                        <span style={{ color: "var(--warn)", fontSize: 10.5, fontWeight: 600 }}>
                          {acct.status === "needs_reauth" ? "Re-auth needed" : acct.status}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void connect(p.id)}
                      disabled={isConnecting}
                      style={{
                        fontSize: 11.5, fontWeight: 650, padding: "5px 10px",
                        borderRadius: 8, border: `1px solid ${p.color}44`,
                        background: "transparent", color: p.dark ? "var(--ink)" : p.color,
                        cursor: isConnecting ? "wait" : "pointer",
                        transition: "background .12s",
                      }}
                    >
                      {isConnecting ? "Connecting…" : "Connect"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
