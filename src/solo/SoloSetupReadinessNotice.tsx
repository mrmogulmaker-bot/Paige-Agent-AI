import React from "react";
import { Link } from "react-router-dom";

/**
 * SoloSetupReadinessNotice — the non-blocking setup reminder for the Solo
 * shell (owner adjudication 2026-09-19: Setup is NOT an access gate).
 *
 * WHERE IT LIVES (the layout contract): SoloApp renders this INSIDE its
 * height-owned `paige-solo` subtree as a flex:none row of a column layout —
 * the canonical shell (`[data-tenant-shell]`, full dynamic viewport height
 * + overflow:hidden)
 * remains the ONE viewport owner and `main.tcs-main` remains the ONE scroll
 * owner, so the reminder can never expand the document past the shell or
 * push controls below the usable viewport. It borrows the shell's existing
 * token vocabulary (the same CSS variables SoloApp already uses inline) —
 * no standalone styling system.
 *
 * BEHAVIOR: shown only while setup readiness is incomplete (the same
 * isSoloSetupComplete predicate the access seam uses as data); truthful copy
 * (PAIGE can help collect the missing context; everything else works);
 * keyboard-reachable Setup link and Dismiss button; dismissal is held by the
 * SHELL (SoloAppContent owns the state, which persists across route
 * remounts) and completing Setup retires it for good via the predicate.
 */
export function SoloSetupReadinessNotice({
  visible,
  setupHref,
  dismissed,
  onDismiss,
}: {
  /** Truthful readiness state — the notice itself is shown to every non-staff
   *  operator of an incomplete workspace (readiness debt is everyone's news). */
  visible: boolean;
  /** The deep link, present ONLY for callers who can actually edit Setup
   *  (the server-derived tenant owner). Read-only members/coaches see the
   *  notice without a CTA — Codex `1c401d1b` P2: a persistent "Finish setup"
   *  link leading to a surface the user cannot change is a dead-end CTA. */
  setupHref: string | null;
  dismissed: boolean;
  onDismiss: () => void;
}) {
  if (dismissed || !visible) return null;
  return (
    <div
      className="solo-setup-readiness"
      data-setup-readiness="incomplete"
      role="status"
      aria-live="polite"
      style={{
        flex: "none",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        padding: "6px 14px",
        borderBottom: "1px solid var(--line)",
        background: "var(--surface)",
        color: "var(--ink-2)",
        fontSize: 12.5,
      }}
    >
      <span style={{ minWidth: 0 }}>
        Setup isn&apos;t finished yet — business context makes PAIGE far more useful, and PAIGE can
        help you fill it in.{" "}
        {setupHref != null ? (
          <Link to={setupHref} style={{ color: "var(--gold-bright)", textDecoration: "none" }}>
            Finish setup when you&apos;re ready
          </Link>
        ) : (
          "Finish setup when you're ready (an owner or admin completes it from Settings)."
        )}{" "}
        — everything else works in the meantime.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss setup reminder"
        style={{
          flex: "none",
          marginLeft: "auto",
          border: "1px solid var(--line)",
          background: "var(--surface-2)",
          color: "var(--ink-3)",
          borderRadius: 8,
          padding: "2px 10px",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
