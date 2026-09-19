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
  setupHref,
  dismissed,
  onDismiss,
}: {
  setupHref: string | null;
  dismissed: boolean;
  onDismiss: () => void;
}) {
  if (dismissed || setupHref == null) return null;
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
        <Link to={setupHref} style={{ color: "var(--gold-bright)", textDecoration: "none" }}>
          Finish setup when you&apos;re ready
        </Link>{" "}
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
