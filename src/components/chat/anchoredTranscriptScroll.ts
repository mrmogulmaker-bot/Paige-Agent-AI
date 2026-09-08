type TranscriptPosition =
  | { kind: "bottom" }
  | {
      kind: "anchor";
      messageId: string;
      semanticKey?: string;
      indexFromStart?: number;
      indexFromEnd?: number;
      offsetPx: number;
    };

type AnchoredTranscriptScrollOptions = {
  storagePrefix: string;
  onPinnedChange?: (pinned: boolean) => void;
};

const MESSAGE_SELECTOR = "[data-paige-message-id]";
const EXACT_BOTTOM_EPSILON_PX = 0.5;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Tab"]);

// The database owns persisted turn IDs, while an in-flight turn starts with a
// client ID. Keep a content-derived, non-reversible reconciliation key so an
// anchor can survive that identity hand-off without storing transcript text.
export function messageScrollAnchorKey(role: string, content: string) {
  let hash = 2166136261;
  const value = `${role}\u0000${content}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${role}:${(hash >>> 0).toString(36)}:${content.length}`;
}

export function createAnchoredTranscriptScroll({
  storagePrefix,
  onPinnedChange,
}: AnchoredTranscriptScrollOptions) {
  let context = "default";
  let element: HTMLDivElement | null = null;
  let position: TranscriptPosition = { kind: "bottom" };
  let mutationObserver: MutationObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let animationFrame: number | null = null;
  let releaseFrame: number | null = null;
  let userIntentFrame: number | null = null;
  let userIntentStableFrames = 0;
  let userIntentLastScrollTop = 0;
  let restoring = false;
  let intentionalBottom = false;
  let pendingUserMovement = false;
  let continuousUserMovement = false;
  let pendingContextDomSignature: string | null = null;
  let boundView: Window | null = null;

  const messageDomSignature = () => element
    ? Array.from(element.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR))
      .map((item) => item.dataset.paigeMessageId ?? "")
      .join("\u0000")
    : "";

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
  const hasVisibleGeometry = () => {
    if (!element || element.closest("[hidden]")) return false;
    const view = element.ownerDocument.defaultView;
    for (let owner: HTMLElement | null = element; owner; owner = owner.parentElement) {
      const style = view?.getComputedStyle(owner);
      if (style?.display === "none"
        || style?.visibility === "hidden"
        || style?.visibility === "collapse"
        || style?.contentVisibility === "hidden") return false;
    }
    return element.clientHeight > 0 && element.scrollHeight > 0;
  };

  const restore = () => {
    if (!element || !hasVisibleGeometry()) return;
    bindCurrentView();
    if (position.kind === "bottom") {
      const target = Math.max(0, element.scrollHeight - element.clientHeight);
      if (Math.abs(element.scrollTop - target) > EXACT_BOTTOM_EPSILON_PX) {
        markRestoring();
        element.scrollTop = target;
      }
      announcePinned();
      return;
    }
    const anchorPosition = position;
    const items = Array.from(element.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR));
    const awaitingIncomingThread = pendingContextDomSignature !== null;
    if (awaitingIncomingThread && messageDomSignature() === pendingContextDomSignature) return;

    let anchor = items.find((item) => item.dataset.paigeMessageId === anchorPosition.messageId);
    if (!anchor && anchorPosition.semanticKey) {
      const semanticMatches = items.filter((item) => item.dataset.paigeMessageAnchorKey === anchorPosition.semanticKey);
      if (awaitingIncomingThread) {
        // A semantic match may repeat across threads. During a context handoff,
        // also require its recorded relative position before accepting a new ID.
        anchor = semanticMatches.find((item) =>
          anchorPosition.indexFromEnd !== undefined
          && items.length - 1 - items.indexOf(item) === anchorPosition.indexFromEnd)
          ?? semanticMatches.find((item) =>
            anchorPosition.indexFromEnd === undefined
            && anchorPosition.indexFromStart !== undefined
            && items.indexOf(item) === anchorPosition.indexFromStart);
      } else {
        anchor = semanticMatches.length === 1
          ? semanticMatches[0]
          : semanticMatches.find((item) => items.length - 1 - items.indexOf(item) === anchorPosition.indexFromEnd)
            ?? semanticMatches.find((item) => items.indexOf(item) === anchorPosition.indexFromStart);
      }
    }
    // Never guess from a bare list index. During refresh/hydration, transient
    // content can occupy the same index and must not replace a valid anchor.
    if (!anchor) return;
    pendingContextDomSignature = null;
    const reconciledIndex = items.indexOf(anchor);
    const reconciledMessageId = anchor.dataset.paigeMessageId;
    const reconciledSemanticKey = anchor.dataset.paigeMessageAnchorKey;
    const reconciledIndexFromEnd = items.length - 1 - reconciledIndex;
    if (reconciledMessageId && (
      reconciledMessageId !== anchorPosition.messageId
      || reconciledSemanticKey !== anchorPosition.semanticKey
      || reconciledIndex !== anchorPosition.indexFromStart
      || reconciledIndexFromEnd !== anchorPosition.indexFromEnd
    )) {
      position = {
        ...anchorPosition,
        messageId: reconciledMessageId,
        semanticKey: reconciledSemanticKey,
        indexFromStart: reconciledIndex,
        indexFromEnd: reconciledIndexFromEnd,
      };
      persist();
    }
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
    if (userIntentFrame !== null && element) {
      const cancel = element.ownerDocument.defaultView?.cancelAnimationFrame?.bind(element.ownerDocument.defaultView)
        ?? cancelAnimationFrame;
      cancel(userIntentFrame);
      userIntentFrame = null;
    }
    restoring = false;
  };

  const cancelProgrammaticMovement = () => {
    intentionalBottom = false;
    if (releaseFrame !== null && element) {
      const cancel = element.ownerDocument.defaultView?.cancelAnimationFrame?.bind(element.ownerDocument.defaultView)
        ?? cancelAnimationFrame;
      cancel(releaseFrame);
      releaseFrame = null;
    }
    restoring = false;
  };

  const endUserMovement = () => {
    continuousUserMovement = false;
    pendingUserMovement = false;
    userIntentStableFrames = 0;
    if (userIntentFrame !== null && element) {
      const cancel = element.ownerDocument.defaultView?.cancelAnimationFrame?.bind(element.ownerDocument.defaultView)
        ?? cancelAnimationFrame;
      cancel(userIntentFrame);
      userIntentFrame = null;
    }
  };

  const releaseUserMovementAfterLayoutSettles = () => {
    if (!element || continuousUserMovement) return;
    const view = element.ownerDocument.defaultView;
    const request = view?.requestAnimationFrame?.bind(view) ?? requestAnimationFrame;
    const cancel = view?.cancelAnimationFrame?.bind(view) ?? cancelAnimationFrame;
    if (userIntentFrame !== null) cancel(userIntentFrame);
    userIntentLastScrollTop = element.scrollTop;
    userIntentStableFrames = 0;
    const check = () => {
      userIntentFrame = null;
      if (!element || continuousUserMovement) return;
      if (Math.abs(element.scrollTop - userIntentLastScrollTop) <= EXACT_BOTTOM_EPSILON_PX) {
        userIntentStableFrames += 1;
      } else {
        userIntentLastScrollTop = element.scrollTop;
        userIntentStableFrames = 0;
      }
      if (userIntentStableFrames >= 2) {
        endUserMovement();
        return;
      }
      userIntentFrame = request(check);
    };
    userIntentFrame = request(check);
  };

  const beginOneShotUserMovement = (event?: Event) => {
    if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return;
    cancelProgrammaticMovement();
    pendingUserMovement = true;
    releaseUserMovementAfterLayoutSettles();
  };

  const beginContinuousUserMovement = () => {
    cancelProgrammaticMovement();
    pendingUserMovement = true;
    continuousUserMovement = true;
  };

  const beginKeyboardUserMovement = (event: KeyboardEvent) => {
    if (!SCROLL_KEYS.has(event.key)) return;
    beginContinuousUserMovement();
  };

  const beginWindowTabMovement = (event: KeyboardEvent) => {
    // Reverse Tab can enter an offscreen message control from the composer, so
    // its initiating keydown is outside the transcript even though the browser
    // then scrolls this transcript to reveal the focused descendant.
    if (event.key !== "Tab") return;
    beginContinuousUserMovement();
  };

  const beginTranscriptFocusMovement = (event: FocusEvent) => {
    if (!element) return;
    const NodeConstructor = element.ownerDocument.defaultView?.Node;
    if (!NodeConstructor || !(event.target instanceof NodeConstructor) || !element.contains(event.target)) return;
    if (event.relatedTarget instanceof NodeConstructor && element.contains(event.relatedTarget)) return;
    beginContinuousUserMovement();
  };

  const beginPointerUserMovement = (event: Event) => {
    // Native scrollbar drags target the scroll owner. A click on message
    // content is not a scroll instruction and must not arm a later update.
    if (event.target !== element) return;
    beginContinuousUserMovement();
  };

  const finishContinuousUserInput = () => {
    continuousUserMovement = false;
    releaseUserMovementAfterLayoutSettles();
  };

  const bindCurrentView = () => {
    const nextView = element?.ownerDocument.defaultView ?? null;
    if (nextView === boundView) return;
    boundView?.removeEventListener("pointerup", finishContinuousUserInput);
    boundView?.removeEventListener("pointercancel", finishContinuousUserInput);
    boundView?.removeEventListener("keydown", beginWindowTabMovement);
    boundView?.removeEventListener("keyup", finishContinuousUserInput);
    boundView?.removeEventListener("blur", finishContinuousUserInput);
    boundView = nextView;
    boundView?.addEventListener("pointerup", finishContinuousUserInput, { passive: true });
    boundView?.addEventListener("pointercancel", finishContinuousUserInput, { passive: true });
    boundView?.addEventListener("keydown", beginWindowTabMovement);
    boundView?.addEventListener("keyup", finishContinuousUserInput);
    boundView?.addEventListener("blur", finishContinuousUserInput);
  };

  const handleScroll = () => {
    if (!element) return pinned();
    bindCurrentView();
    if (!hasVisibleGeometry()) {
      pendingUserMovement = false;
      return pinned();
    }
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    const atExactBottom = distanceFromBottom <= EXACT_BOTTOM_EPSILON_PX;
    if (restoring) return pinned();
    if (intentionalBottom) {
      position = { kind: "bottom" };
      if (atExactBottom) intentionalBottom = false;
      persist();
      announcePinned();
      return true;
    }
    const userMoved = pendingUserMovement || continuousUserMovement;
    if (!userMoved) {
      // Resize, hydration and browser anchoring may emit scroll events. They do
      // not own the reading position and must not replace the saved intent.
      return pinned();
    }
    pendingContextDomSignature = null;
    if (atExactBottom) {
      position = { kind: "bottom" };
    } else {
      const viewport = element.getBoundingClientRect();
      const items = Array.from(element.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR));
      const anchor = items.find((item) => item.getBoundingClientRect().bottom > viewport.top)
        ?? items[0];
      if (anchor?.dataset.paigeMessageId) {
        const anchorIndex = items.indexOf(anchor);
        position = {
          kind: "anchor",
          messageId: anchor.dataset.paigeMessageId,
          semanticKey: anchor.dataset.paigeMessageAnchorKey,
          indexFromStart: anchorIndex,
          indexFromEnd: items.length - 1 - anchorIndex,
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
    element?.removeEventListener("wheel", beginOneShotUserMovement);
    element?.removeEventListener("touchstart", beginContinuousUserMovement);
    element?.removeEventListener("touchend", finishContinuousUserInput);
    element?.removeEventListener("touchcancel", finishContinuousUserInput);
    element?.removeEventListener("pointerdown", beginPointerUserMovement);
    element?.removeEventListener("keydown", beginKeyboardUserMovement);
    element?.removeEventListener("focusin", beginTranscriptFocusMovement);
    boundView?.removeEventListener("pointerup", finishContinuousUserInput);
    boundView?.removeEventListener("pointercancel", finishContinuousUserInput);
    boundView?.removeEventListener("keydown", beginWindowTabMovement);
    boundView?.removeEventListener("keyup", finishContinuousUserInput);
    boundView?.removeEventListener("blur", finishContinuousUserInput);
    boundView = null;
    element?.removeEventListener("scrollend", endUserMovement);
    intentionalBottom = false;
    pendingUserMovement = false;
    continuousUserMovement = false;
    element = null;
  };

  return {
    setContext(nextContext: string) {
      if (nextContext === context) return;
      cancelProgrammaticMovement();
      pendingUserMovement = false;
      continuousUserMovement = false;
      context = nextContext;
      position = readPosition();
      if (element && position.kind === "anchor") {
        const incomingPosition = position;
        const items = Array.from(element.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR));
        // Content can legitimately repeat across threads. Only the persisted,
        // thread-owned ID proves this is the incoming DOM; semantic matching is
        // safe only after the mounted message-ID set changes.
        const incomingAnchorIsMounted = items.some((item) =>
          item.dataset.paigeMessageId === incomingPosition.messageId);
        pendingContextDomSignature = incomingAnchorIsMounted ? null : messageDomSignature();
      } else {
        pendingContextDomSignature = null;
      }
      restore();
    },
    adoptContext(nextContext: string) {
      if (nextContext === context) return;
      // The server can assign the durable thread ID after a new conversation is
      // already visible. That is an identity adoption, not a thread switch.
      cancelProgrammaticMovement();
      context = nextContext;
      pendingContextDomSignature = null;
      persist();
      announcePinned();
    },
    attach(nextElement: HTMLDivElement | null) {
      if (element === nextElement) return;
      detach();
      element = nextElement;
      if (!element) return;
      element.style.overflowAnchor = "none";
      element.addEventListener("wheel", beginOneShotUserMovement, { passive: true });
      element.addEventListener("touchstart", beginContinuousUserMovement, { passive: true });
      element.addEventListener("touchend", finishContinuousUserInput, { passive: true });
      element.addEventListener("touchcancel", finishContinuousUserInput, { passive: true });
      element.addEventListener("pointerdown", beginPointerUserMovement, { passive: true });
      element.addEventListener("keydown", beginKeyboardUserMovement);
      element.addEventListener("focusin", beginTranscriptFocusMovement);
      // Tab can move focus outside the transcript before keyup. Window owns the
      // release so keyboard intent cannot remain armed for a later layout scroll.
      bindCurrentView();
      element.addEventListener("scrollend", endUserMovement);
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
    notifyLayoutChange() {
      bindCurrentView();
      restore();
    },
    isAtBottom: pinned,
    jumpToBottom(behavior: ScrollBehavior = "auto") {
      if (!element) return;
      intentionalBottom = behavior === "smooth";
      pendingContextDomSignature = null;
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
