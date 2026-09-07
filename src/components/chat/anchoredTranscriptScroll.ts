type TranscriptPosition =
  | { kind: "bottom" }
  | { kind: "anchor"; messageId: string; offsetPx: number };

type AnchoredTranscriptScrollOptions = {
  storagePrefix: string;
  bottomThreshold?: number;
  onPinnedChange?: (pinned: boolean) => void;
};

const MESSAGE_SELECTOR = "[data-paige-message-id]";

export function createAnchoredTranscriptScroll({
  storagePrefix,
  bottomThreshold = 48,
  onPinnedChange,
}: AnchoredTranscriptScrollOptions) {
  let context = "default";
  let element: HTMLDivElement | null = null;
  let position: TranscriptPosition = { kind: "bottom" };
  let mutationObserver: MutationObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let animationFrame: number | null = null;
  let releaseFrame: number | null = null;
  let restoring = false;
  let intentionalBottom = false;

  const markRestoring = () => {
    if (!element) return;
    restoring = true;
    const view = element.ownerDocument.defaultView;
    const request = view?.requestAnimationFrame?.bind(view) ?? requestAnimationFrame;
    const cancel = view?.cancelAnimationFrame?.bind(view) ?? cancelAnimationFrame;
    if (releaseFrame !== null) cancel(releaseFrame);
    releaseFrame = request(() => {
      releaseFrame = null;
      restoring = false;
    });
  };

  const storageKey = () => `${storagePrefix}:${encodeURIComponent(context)}`;
  const readPosition = (): TranscriptPosition => {
    try {
      const raw = sessionStorage.getItem(storageKey());
      if (!raw) return { kind: "bottom" };
      const parsed = JSON.parse(raw) as TranscriptPosition;
      if (parsed.kind === "bottom") return parsed;
      if (parsed.kind === "anchor" && typeof parsed.messageId === "string" && Number.isFinite(parsed.offsetPx)) {
        return parsed;
      }
    } catch { /* session storage can be unavailable in hardened browsers */ }
    return { kind: "bottom" };
  };
  const persist = () => {
    try { sessionStorage.setItem(storageKey(), JSON.stringify(position)); } catch { /* best effort */ }
  };
  const pinned = () => position.kind === "bottom";
  const announcePinned = () => onPinnedChange?.(pinned());

  const restore = () => {
    if (!element) return;
    if (position.kind === "bottom") {
      element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
      announcePinned();
      return;
    }
    const anchorPosition = position;
    const anchor = Array.from(element.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR))
      .find((item) => item.dataset.paigeMessageId === anchorPosition.messageId);
    if (!anchor) return;
    const delta = anchor.getBoundingClientRect().top
      - element.getBoundingClientRect().top
      - anchorPosition.offsetPx;
    if (Math.abs(delta) > 0.75) {
      markRestoring();
      element.scrollTop += delta;
    }
    announcePinned();
  };

  const scheduleRestore = () => {
    if (!element || animationFrame !== null) return;
    const view = element.ownerDocument.defaultView;
    const request = view?.requestAnimationFrame?.bind(view) ?? requestAnimationFrame;
    animationFrame = request(() => {
      animationFrame = null;
      restore();
    });
  };

  const observeSizes = () => {
    if (!element || !resizeObserver) return;
    resizeObserver.disconnect();
    resizeObserver.observe(element);
    const observed = new Set<HTMLElement>([
      ...Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement),
      ...Array.from(element.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR)),
    ]);
    observed.forEach((item) => resizeObserver?.observe(item));
  };

  const disconnectObservers = () => {
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    mutationObserver = null;
    resizeObserver = null;
    if (animationFrame !== null && element) {
      const cancel = element.ownerDocument.defaultView?.cancelAnimationFrame?.bind(element.ownerDocument.defaultView)
        ?? cancelAnimationFrame;
      cancel(animationFrame);
      animationFrame = null;
    }
    if (releaseFrame !== null && element) {
      const cancel = element.ownerDocument.defaultView?.cancelAnimationFrame?.bind(element.ownerDocument.defaultView)
        ?? cancelAnimationFrame;
      cancel(releaseFrame);
      releaseFrame = null;
    }
    restoring = false;
  };

  const cancelIntentionalBottom = () => {
    intentionalBottom = false;
    if (releaseFrame !== null && element) {
      const cancel = element.ownerDocument.defaultView?.cancelAnimationFrame?.bind(element.ownerDocument.defaultView)
        ?? cancelAnimationFrame;
      cancel(releaseFrame);
      releaseFrame = null;
    }
    restoring = false;
  };

  const handleScroll = () => {
    if (!element) return true;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (restoring && distanceFromBottom > bottomThreshold) return pinned();
    if (intentionalBottom) {
      position = { kind: "bottom" };
      if (distanceFromBottom <= bottomThreshold) intentionalBottom = false;
      persist();
      announcePinned();
      return true;
    }
    if (distanceFromBottom <= bottomThreshold) {
      position = { kind: "bottom" };
    } else {
      const viewport = element.getBoundingClientRect();
      const items = Array.from(element.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR));
      const anchor = items.find((item) => item.getBoundingClientRect().bottom > viewport.top)
        ?? items[0];
      if (anchor?.dataset.paigeMessageId) {
        position = {
          kind: "anchor",
          messageId: anchor.dataset.paigeMessageId,
          offsetPx: anchor.getBoundingClientRect().top - viewport.top,
        };
      }
    }
    persist();
    announcePinned();
    return pinned();
  };

  const detach = () => {
    disconnectObservers();
    element?.removeEventListener("wheel", cancelIntentionalBottom);
    element?.removeEventListener("touchstart", cancelIntentionalBottom);
    element?.removeEventListener("pointerdown", cancelIntentionalBottom);
    element?.removeEventListener("keydown", cancelIntentionalBottom);
    intentionalBottom = false;
    element = null;
  };

  return {
    setContext(nextContext: string) {
      if (nextContext === context) return;
      cancelIntentionalBottom();
      context = nextContext;
      position = readPosition();
      restore();
    },
    attach(nextElement: HTMLDivElement | null) {
      if (element === nextElement) return;
      detach();
      element = nextElement;
      if (!element) return;
      element.style.overflowAnchor = "none";
      element.addEventListener("wheel", cancelIntentionalBottom, { passive: true });
      element.addEventListener("touchstart", cancelIntentionalBottom, { passive: true });
      element.addEventListener("pointerdown", cancelIntentionalBottom, { passive: true });
      element.addEventListener("keydown", cancelIntentionalBottom);
      const view = element.ownerDocument.defaultView;
      const Mutation = view?.MutationObserver ?? globalThis.MutationObserver;
      const Resize = view?.ResizeObserver ?? globalThis.ResizeObserver;
      if (typeof Mutation !== "undefined") {
        mutationObserver = new Mutation(() => { observeSizes(); scheduleRestore(); });
        mutationObserver.observe(element, { childList: true, subtree: true, characterData: true });
      }
      if (typeof Resize !== "undefined") {
        resizeObserver = new Resize(() => scheduleRestore());
        observeSizes();
      }
      restore();
    },
    detach,
    destroy: detach,
    handleScroll,
    notifyLayoutChange: restore,
    isAtBottom: pinned,
    jumpToBottom(behavior: ScrollBehavior = "auto") {
      if (!element) return;
      intentionalBottom = behavior === "smooth";
      position = { kind: "bottom" };
      persist();
      if (typeof element.scrollTo === "function") {
        element.scrollTo({ top: element.scrollHeight, behavior });
      } else {
        element.scrollTop = element.scrollHeight;
      }
      announcePinned();
    },
  };
}
