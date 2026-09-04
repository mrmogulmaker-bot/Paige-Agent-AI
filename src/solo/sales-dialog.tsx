import React from "react";
import { createPortal } from "react-dom";

type SalesNavigateEvent = Event & { destination: { url: string } };
type SalesNavigation = {
  addEventListener(type: "navigate", listener: (event: SalesNavigateEvent) => void): void;
  removeEventListener(type: "navigate", listener: (event: SalesNavigateEvent) => void): void;
};

/** Keep Sales editors inside Solo's theme, but outside the inert background. */
export function SalesDialogPortal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.querySelector(".solo-campaigns") ?? document.body);
}

export function useSalesDraftExit(draft: unknown, busy: boolean, onClose: () => void) {
  const initial = React.useRef(JSON.stringify(draft));
  const dirty = initial.current !== JSON.stringify(draft);
  const [pending, setPending] = React.useState<null | (() => void)>(null);
  const confirmationRef = React.useRef<HTMLDivElement>(null);
  const bypass = React.useRef(false);
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const request = React.useCallback((action = onClose) => {
    if (busy) return;
    if (dirty) setPending(() => action);
    else action();
  }, [busy, dirty, onClose]);
  React.useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (pending) setPending(null); else request();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if ((dirty || busy) && !bypass.current) { event.preventDefault(); event.returnValue = ""; }
    };
    // Browser Back/Forward and same-document navigation in browsers with Navigation API.
    // Full-page exits also retain the standard beforeunload protection.
    const navigation = (window as Window & { navigation?: SalesNavigation }).navigation;
    const openedAccount = location.pathname.split("/").slice(0, 3).join("/");
    const sameAccount = (url: string) => new URL(url, location.href).pathname.split("/").slice(0, 3).join("/") === openedAccount;
    const navigate = (event: SalesNavigateEvent) => {
      if (!sameAccount(event.destination.url)) return;
      if (bypass.current || !event.cancelable || (!dirty && !busy)) return;
      event.preventDefault();
      if (!busy) setPending(() => () => { bypass.current = true; window.location.assign(event.destination.url); });
    };
    const openedUrl = location.href;
    const openedState = history.state;
    let restoring = false;
    let pendingDestination = "";
    const pop = (event: PopStateEvent) => {
      if (restoring) { restoring = false; event.stopImmediatePropagation(); if (!busy) setPending(() => () => { bypass.current = true; window.location.assign(pendingDestination); }); return; }
      if (bypass.current || (!dirty && !busy) || !sameAccount(location.href)) return;
      const destination = location.href;
      event.stopImmediatePropagation();
      const delta = typeof openedState?.idx === "number" && typeof event.state?.idx === "number" ? openedState.idx - event.state.idx : 0;
      if (delta) { restoring = true; pendingDestination = destination; history.go(delta); return; }
      else history.pushState(openedState, "", openedUrl);
      if (!busy) setPending(() => () => { bypass.current = true; window.location.assign(destination); });
    };
    if (!navigation) window.addEventListener("popstate", pop, true);
    document.addEventListener("keydown", key);
    window.addEventListener("beforeunload", unload);
    navigation?.addEventListener("navigate", navigate);
    return () => {
      window.removeEventListener("popstate", pop, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", unload);
      navigation?.removeEventListener("navigate", navigate);
    };
  }, [dirty, busy, pending, request]);
  React.useLayoutEffect(() => {
    const panel = confirmationRef.current;
    if (!pending || !panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const siblings = [...(panel.parentElement?.children ?? [])].filter(node => node !== panel);
    siblings.forEach(node => node.setAttribute("inert", ""));
    panel.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { siblings.forEach(node => node.removeAttribute("inert")); previous?.isConnected && previous.focus(); };
  }, [pending]);
  const confirmation = pending ? <div className="so-discard" ref={confirmationRef} role="alertdialog" aria-modal="true" aria-labelledby="so-discard-title" aria-describedby="so-discard-description" onKeyDown={event => {
    if (event.key !== "Tab") return;
    event.preventDefault(); event.stopPropagation();
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    buttons[document.activeElement === buttons[0] ? 1 : 0]?.focus();
  }}>
    <h3 id="so-discard-title">Discard unsaved changes?</h3>
    <p id="so-discard-description">Your changes have not been saved. Continue editing to keep working.</p>
    <button className="btn btn-p" onClick={() => setPending(null)}>Continue editing</button>
    <button className="btn" onClick={() => { const action = pending; bypass.current = true; setPending(null); action(); }}>Discard changes</button>
  </div> : null;
  return { close: () => request(), request, confirmation, alive };
}