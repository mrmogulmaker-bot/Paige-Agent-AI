import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnchoredTranscriptScroll } from "./anchoredTranscriptScroll";

type Geometry = {
  viewportTop: number;
  clientHeight: number;
  scrollHeight: number;
  items: Record<string, { top: number; height: number }>;
};

function transcriptFixture(geometry: Geometry) {
  const element = document.createElement("div");
  Object.defineProperties(element, {
    clientHeight: { configurable: true, get: () => geometry.clientHeight },
    scrollHeight: { configurable: true, get: () => geometry.scrollHeight },
  });
  element.getBoundingClientRect = () => ({
    x: 0, y: geometry.viewportTop, left: 0, right: 600,
    top: geometry.viewportTop, bottom: geometry.viewportTop + geometry.clientHeight,
    width: 600, height: geometry.clientHeight, toJSON: () => ({}),
  });

  const render = (ids: string[]) => {
    element.replaceChildren(...ids.map((id) => {
      const item = document.createElement("article");
      item.dataset.paigeMessageId = id;
      item.getBoundingClientRect = () => {
        const box = geometry.items[id];
        const top = geometry.viewportTop + box.top - element.scrollTop;
        return {
          x: 0, y: top, left: 0, right: 600, top, bottom: top + box.height,
          width: 600, height: box.height, toJSON: () => ({}),
        };
      };
      return item;
    }));
  };

  return { element, render };
}

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("createAnchoredTranscriptScroll", () => {
  it.each([
    ["wheel", () => new WheelEvent("wheel")],
    ["touch", () => new Event("touchstart")],
    ["pointer/scrollbar", () => new Event("pointerdown")],
    ["keyboard", () => new KeyboardEvent("keydown", { key: "ArrowUp" })],
  ])("lets a deliberate %s movement one pixel away from bottom immediately win", (label, inputEvent) => {
    const geometry: Geometry = {
      viewportTop: 0, clientHeight: 300, scrollHeight: 1_200,
      items: { a: { top: 0, height: 300 }, b: { top: 300, height: 300 }, c: { top: 600, height: 300 }, d: { top: 900, height: 300 } },
    };
    const { element, render } = transcriptFixture(geometry);
    render(["a", "b", "c", "d"]);
    const controller = createAnchoredTranscriptScroll({ storagePrefix: "test-one-pixel-" + label });
    controller.setContext("thread-a");
    controller.attach(element);
    expect(element.scrollTop).toBe(900);
    element.dispatchEvent(inputEvent());
    element.scrollTop = 899;
    expect(controller.handleScroll()).toBe(false);
    const before = element.querySelector<HTMLElement>('[data-paige-message-id="c"]')!.getBoundingClientRect().top
      - element.getBoundingClientRect().top;
    geometry.items.d.height += 120;
    geometry.scrollHeight += 120;
    controller.notifyLayoutChange();
    expect(element.scrollTop).toBe(899);
    expect(element.querySelector<HTMLElement>('[data-paige-message-id="c"]')!.getBoundingClientRect().top
      - element.getBoundingClientRect().top).toBe(before);
    expect(element.scrollTop).not.toBe(geometry.scrollHeight - geometry.clientHeight);
  });

  it("does not let hidden/minimized geometry replace a valid reading anchor", () => {
    const geometry: Geometry = {
      viewportTop: 20, clientHeight: 300, scrollHeight: 1_200,
      items: { a: { top: 0, height: 300 }, b: { top: 300, height: 300 }, c: { top: 600, height: 300 }, d: { top: 900, height: 300 } },
    };
    const { element, render } = transcriptFixture(geometry);
    render(["a", "b", "c", "d"]);
    const controller = createAnchoredTranscriptScroll({ storagePrefix: "test-hidden-return" });
    controller.setContext("thread-a");
    controller.attach(element);
    element.dispatchEvent(new WheelEvent("wheel"));
    element.scrollTop = 425;
    controller.handleScroll();
    const before = element.querySelector<HTMLElement>('[data-paige-message-id="b"]')!.getBoundingClientRect().top
      - element.getBoundingClientRect().top;
    geometry.clientHeight = 0;
    geometry.scrollHeight = 0;
    element.scrollTop = 0;
    controller.handleScroll();
    controller.notifyLayoutChange();
    geometry.viewportTop = 80;
    geometry.clientHeight = 300;
    geometry.scrollHeight = 1_200;
    controller.notifyLayoutChange();
    expect(element.scrollTop).toBe(425);
    expect(element.querySelector<HTMLElement>('[data-paige-message-id="b"]')!.getBoundingClientRect().top
      - element.getBoundingClientRect().top).toBe(before);
  });

  it("keeps automatic following for ordinary near-bottom layout drift without user input", () => {
    const geometry: Geometry = {
      viewportTop: 0, clientHeight: 300, scrollHeight: 1_200,
      items: { a: { top: 0, height: 300 }, b: { top: 300, height: 300 }, c: { top: 600, height: 300 }, d: { top: 900, height: 300 } },
    };
    const { element, render } = transcriptFixture(geometry);
    render(["a", "b", "c", "d"]);
    const controller = createAnchoredTranscriptScroll({ storagePrefix: "test-near-bottom-layout" });
    controller.setContext("thread-a");
    controller.attach(element);
    element.scrollTop = 899;
    controller.handleScroll();
    geometry.items.d.height += 120;
    geometry.scrollHeight += 120;
    controller.notifyLayoutChange();
    expect(element.scrollTop).toBe(1_020);
    expect(controller.isAtBottom()).toBe(true);
  });

  it("resumes automatic following only after deliberate movement reaches the exact bottom", () => {
    const geometry: Geometry = {
      viewportTop: 0, clientHeight: 300, scrollHeight: 1_200,
      items: { a: { top: 0, height: 300 }, b: { top: 300, height: 300 }, c: { top: 600, height: 300 }, d: { top: 900, height: 300 } },
    };
    const { element, render } = transcriptFixture(geometry);
    render(["a", "b", "c", "d"]);
    const controller = createAnchoredTranscriptScroll({ storagePrefix: "test-return-exact-bottom" });
    controller.setContext("thread-a");
    controller.attach(element);

    element.dispatchEvent(new WheelEvent("wheel"));
    element.scrollTop = 899;
    expect(controller.handleScroll()).toBe(false);
    element.dispatchEvent(new WheelEvent("wheel"));
    element.scrollTop = 900;
    expect(controller.handleScroll()).toBe(true);

    geometry.items.d.height += 120;
    geometry.scrollHeight += 120;
    controller.notifyLayoutChange();
    expect(element.scrollTop).toBe(1_020);
  });

  it("keeps the same visible message and pixel offset through reflow and prepends", () => {
    const geometry: Geometry = {
      viewportTop: 50,
      clientHeight: 300,
      scrollHeight: 1_200,
      items: {
        a: { top: 0, height: 300 },
        b: { top: 300, height: 300 },
        c: { top: 600, height: 300 },
        d: { top: 900, height: 300 },
      },
    };
    const { element, render } = transcriptFixture(geometry);
    render(["a", "b", "c", "d"]);
    const controller = createAnchoredTranscriptScroll({ storagePrefix: "test-anchor" });
    controller.setContext("thread-a");
    controller.attach(element);

    element.dispatchEvent(new WheelEvent("wheel"));
    element.scrollTop = 410;
    controller.handleScroll();
    const before = element.querySelector<HTMLElement>('[data-paige-message-id="b"]')!
      .getBoundingClientRect().top - element.getBoundingClientRect().top;
    expect(before).toBe(-110);

    geometry.items.a.height += 120;
    for (const id of ["b", "c", "d"]) geometry.items[id].top += 120;
    geometry.scrollHeight += 120;
    controller.notifyLayoutChange();

    const afterReflow = element.querySelector<HTMLElement>('[data-paige-message-id="b"]')!
      .getBoundingClientRect().top - element.getBoundingClientRect().top;
    expect(afterReflow).toBe(before);
    expect(element.scrollTop).toBe(530);

    geometry.items.older = { top: 0, height: 180 };
    for (const id of ["a", "b", "c", "d"]) geometry.items[id].top += 180;
    geometry.scrollHeight += 180;
    render(["older", "a", "b", "c", "d"]);
    controller.notifyLayoutChange();

    const afterPrepend = element.querySelector<HTMLElement>('[data-paige-message-id="b"]')!
      .getBoundingClientRect().top - element.getBoundingClientRect().top;
    expect(afterPrepend).toBe(before);
    expect(element.scrollTop).toBe(710);
  });

  it("follows layout growth only while bottom-pinned", () => {
    const geometry: Geometry = {
      viewportTop: 0,
      clientHeight: 300,
      scrollHeight: 900,
      items: {
        a: { top: 0, height: 300 }, b: { top: 300, height: 300 }, c: { top: 600, height: 300 },
      },
    };
    const { element, render } = transcriptFixture(geometry);
    render(["a", "b", "c"]);
    const controller = createAnchoredTranscriptScroll({ storagePrefix: "test-bottom" });
    controller.setContext("thread-a");
    controller.attach(element);
    expect(element.scrollTop).toBe(600);

    geometry.items.c.height += 140;
    geometry.scrollHeight += 140;
    controller.notifyLayoutChange();
    expect(element.scrollTop).toBe(740);

    element.dispatchEvent(new WheelEvent("wheel"));
    element.scrollTop = 420;
    controller.handleScroll();
    geometry.items.a.height += 90;
    geometry.items.b.top += 90;
    geometry.items.c.top += 90;
    geometry.scrollHeight += 90;
    controller.notifyLayoutChange();
    expect(element.scrollTop).toBe(510);
    expect(element.scrollTop).not.toBe(geometry.scrollHeight - geometry.clientHeight);
  });

  it("restores positions per thread and through a same-session controller remount", () => {
    const geometry: Geometry = {
      viewportTop: 0,
      clientHeight: 300,
      scrollHeight: 1_200,
      items: {
        a: { top: 0, height: 300 }, b: { top: 300, height: 300 }, c: { top: 600, height: 300 }, d: { top: 900, height: 300 },
      },
    };
    const first = transcriptFixture(geometry);
    first.render(["a", "b", "c", "d"]);
    const controller = createAnchoredTranscriptScroll({ storagePrefix: "test-thread" });
    controller.setContext("thread-a");
    controller.attach(first.element);
    first.element.dispatchEvent(new WheelEvent("wheel"));
    first.element.scrollTop = 425;
    controller.handleScroll();

    controller.setContext("thread-b");
    expect(first.element.scrollTop).toBe(900);
    first.element.dispatchEvent(new WheelEvent("wheel"));
    first.element.scrollTop = 155;
    controller.handleScroll();
    controller.setContext("thread-a");
    expect(first.element.scrollTop).toBe(425);
    controller.detach();

    const remount = transcriptFixture(geometry);
    remount.render(["a", "b", "c", "d"]);
    const restored = createAnchoredTranscriptScroll({ storagePrefix: "test-thread" });
    restored.setContext("thread-a");
    restored.attach(remount.element);
    expect(remount.element.scrollTop).toBe(425);
  });

  it("does not overwrite the outgoing thread when React commits the incoming DOM first", () => {
    const geometry: Geometry = {
      viewportTop: 0,
      clientHeight: 300,
      scrollHeight: 1_200,
      items: {
        a: { top: 0, height: 300 }, b: { top: 300, height: 300 }, c: { top: 600, height: 300 }, d: { top: 900, height: 300 },
        x: { top: 0, height: 600 }, y: { top: 600, height: 600 },
      },
    };
    const { element, render } = transcriptFixture(geometry);
    render(["a", "b", "c", "d"]);
    const controller = createAnchoredTranscriptScroll({ storagePrefix: "test-commit-order" });
    controller.setContext("thread-a");
    controller.attach(element);
    element.dispatchEvent(new WheelEvent("wheel"));
    element.scrollTop = 425;
    controller.handleScroll();

    // React commits thread B before the layout effect changes controller context.
    render(["x", "y"]);
    controller.setContext("thread-b");
    expect(element.scrollTop).toBe(900);

    // A failed B hydration rolls the UI back to A before context follows it.
    render(["a", "b", "c", "d"]);
    controller.setContext("thread-a");
    expect(element.scrollTop).toBe(425);
    expect(JSON.parse(sessionStorage.getItem("test-commit-order:thread-a")!)).toEqual({
      kind: "anchor", messageId: "b", offsetPx: -125,
    });
  });

  it("keeps intentional smooth bottom-follow through intermediate scroll events", () => {
    const geometry: Geometry = {
      viewportTop: 0,
      clientHeight: 300,
      scrollHeight: 1_200,
      items: {
        a: { top: 0, height: 300 }, b: { top: 300, height: 300 }, c: { top: 600, height: 300 }, d: { top: 900, height: 300 },
      },
    };
    const { element, render } = transcriptFixture(geometry);
    render(["a", "b", "c", "d"]);
    const controller = createAnchoredTranscriptScroll({ storagePrefix: "test-smooth" });
    controller.setContext("thread-a");
    controller.attach(element);
    element.dispatchEvent(new WheelEvent("wheel"));
    element.scrollTop = 400;
    controller.handleScroll();
    element.scrollTo = vi.fn();

    controller.jumpToBottom("smooth");
    for (const scrollTop of [520, 700, 860, 900]) {
      element.scrollTop = scrollTop;
      expect(controller.handleScroll()).toBe(true);
    }
    geometry.items.d.height += 120;
    geometry.scrollHeight += 120;
    controller.notifyLayoutChange();
    expect(element.scrollTop).toBe(1_020);
  });

  it("lets genuine user input cancel an intentional smooth bottom transition", () => {
    const geometry: Geometry = {
      viewportTop: 0,
      clientHeight: 300,
      scrollHeight: 1_200,
      items: {
        a: { top: 0, height: 300 }, b: { top: 300, height: 300 }, c: { top: 600, height: 300 }, d: { top: 900, height: 300 },
      },
    };
    const { element, render } = transcriptFixture(geometry);
    render(["a", "b", "c", "d"]);
    const controller = createAnchoredTranscriptScroll({ storagePrefix: "test-smooth-cancel" });
    controller.setContext("thread-a");
    controller.attach(element);
    element.scrollTop = 400;
    controller.handleScroll();
    element.scrollTo = vi.fn();

    controller.jumpToBottom("smooth");
    element.dispatchEvent(new WheelEvent("wheel"));
    element.scrollTop = 520;
    expect(controller.handleScroll()).toBe(false);
    geometry.items.a.height += 80;
    for (const id of ["b", "c", "d"]) geometry.items[id].top += 80;
    geometry.scrollHeight += 80;
    controller.notifyLayoutChange();
    expect(element.scrollTop).toBe(600);
    expect(element.scrollTop).not.toBe(geometry.scrollHeight - geometry.clientHeight);
  });
});
