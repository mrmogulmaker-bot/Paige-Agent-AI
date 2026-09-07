import { act, forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAnchoredTranscriptScroll } from "./anchoredTranscriptScroll";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Item = { id: string; height: number; text: string };
type TranscriptHarnessApi = {
  append: (item: Item) => void;
  changeHeight: (id: string, height: number) => void;
  measure: (id: string) => { offset: number; scrollTop: number; bottomGap: number };
  prepend: (items: Item[]) => void;
  resize: (height: number) => void;
  scrollTo: (top: number) => void;
  switchThread: (threadId: string, items: Item[]) => void;
};

const THREAD_A: Item[] = [
  { id: "a", height: 300, text: "A one" },
  { id: "b", height: 300, text: "A two" },
  { id: "c", height: 300, text: "A three" },
  { id: "d", height: 300, text: "A four" },
];
const THREAD_B: Item[] = [
  { id: "x", height: 600, text: "B one" },
  { id: "y", height: 600, text: "B two" },
];

const TranscriptHarness = forwardRef<TranscriptHarnessApi>((_, apiRef) => {
  const [threadId, setThreadId] = useState("thread-a");
  const [items, setItems] = useState(THREAD_A);
  const [viewportHeight, setViewportHeight] = useState(300);
  const ownerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef(createAnchoredTranscriptScroll({ storagePrefix: "react-flow" }));

  const attach = useCallback((node: HTMLDivElement | null) => {
    ownerRef.current = node;
    if (node) {
      Object.defineProperties(node, {
        clientHeight: { configurable: true, get: () => Number(node.dataset.viewportHeight) },
        scrollHeight: {
          configurable: true,
          get: () => Array.from(node.children).reduce((total, child) => total + Number((child as HTMLElement).dataset.height), 0),
        },
      });
      node.getBoundingClientRect = () => ({
        x: 0, y: 0, left: 0, right: 600, top: 0, bottom: Number(node.dataset.viewportHeight),
        width: 600, height: Number(node.dataset.viewportHeight), toJSON: () => ({}),
      });
    }
    controllerRef.current.attach(node);
  }, []);

  const wireItemGeometry = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    node.getBoundingClientRect = () => {
      const owner = ownerRef.current!;
      let top = -owner.scrollTop;
      let sibling = node.previousElementSibling as HTMLElement | null;
      while (sibling) {
        top += Number(sibling.dataset.height);
        sibling = sibling.previousElementSibling as HTMLElement | null;
      }
      const height = Number(node.dataset.height);
      return {
        x: 0, y: top, left: 0, right: 600, top, bottom: top + height,
        width: 600, height, toJSON: () => ({}),
      };
    };
  }, []);

  useLayoutEffect(() => {
    controllerRef.current.setContext(threadId);
  }, [threadId]);

  useLayoutEffect(() => {
    controllerRef.current.notifyLayoutChange();
  }, [items, viewportHeight]);

  useImperativeHandle(apiRef, () => ({
    append: (item) => setItems((current) => [...current, item]),
    changeHeight: (id, height) => setItems((current) => current.map((item) => item.id === id ? { ...item, height } : item)),
    measure: (id) => {
      const owner = ownerRef.current!;
      const item = owner.querySelector<HTMLElement>(`[data-paige-message-id="${id}"]`)!;
      return {
        offset: item.getBoundingClientRect().top - owner.getBoundingClientRect().top,
        scrollTop: owner.scrollTop,
        bottomGap: owner.scrollHeight - owner.scrollTop - owner.clientHeight,
      };
    },
    prepend: (older) => setItems((current) => [...older, ...current]),
    resize: setViewportHeight,
    scrollTo: (top) => {
      const owner = ownerRef.current!;
      owner.dispatchEvent(new WheelEvent("wheel"));
      owner.scrollTop = top;
      controllerRef.current.handleScroll();
    },
    switchThread: (nextThreadId, nextItems) => {
      // This matches PaigeAIChat: message hydration and context state commit together.
      setItems(nextItems);
      setThreadId(nextThreadId);
    },
  }), []);

  return (
    <div
      ref={attach}
      data-paige-transcript-scroll="true"
      data-viewport-height={viewportHeight}
      onScroll={() => controllerRef.current.handleScroll()}
    >
      {items.map((item) => (
        <article
          ref={wireItemGeometry}
          key={item.id}
          data-height={item.height}
          data-paige-message-id={item.id}
        >
          {item.text}
        </article>
      ))}
    </div>
  );
});
TranscriptHarness.displayName = "TranscriptHarness";

describe("anchored transcript React affected flow", () => {
  let host: HTMLDivElement;
  let root: Root;
  let api: TranscriptHarnessApi;

  beforeEach(() => {
    sessionStorage.clear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root.render(<TranscriptHarness ref={(value) => { if (value) api = value; }} />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    sessionStorage.clear();
  });

  it("preserves the same text and offset through React updates and A-B-A thread commits", () => {
    act(() => api.scrollTo(425));
    const baseline = api.measure("b");
    expect(baseline.offset).toBe(-125);

    act(() => api.append({ id: "stream", height: 140, text: "streamed output" }));
    expect(api.measure("b")).toMatchObject({ offset: baseline.offset, scrollTop: baseline.scrollTop });

    act(() => api.changeHeight("a", 390));
    expect(api.measure("b")).toMatchObject({ offset: baseline.offset, scrollTop: 515 });

    act(() => api.resize(240));
    expect(api.measure("b").offset).toBe(baseline.offset);

    act(() => api.prepend([{ id: "older", height: 180, text: "older history" }]));
    expect(api.measure("b")).toMatchObject({ offset: baseline.offset, scrollTop: 695 });

    act(() => api.switchThread("thread-b", THREAD_B));
    act(() => api.scrollTo(155));
    act(() => api.switchThread("thread-a", [
      { id: "older", height: 180, text: "older history" },
      { ...THREAD_A[0], height: 390 },
      ...THREAD_A.slice(1),
      { id: "stream", height: 140, text: "streamed output" },
    ]));
    expect(api.measure("b")).toMatchObject({ offset: baseline.offset, scrollTop: 695 });

    act(() => api.switchThread("thread-b", THREAD_B));
    expect(api.measure("x").scrollTop).toBe(155);
  });

  it("keeps a bottom-pinned React transcript following streamed growth", () => {
    expect(api.measure("d").bottomGap).toBe(0);
    act(() => api.append({ id: "stream", height: 160, text: "streamed output" }));
    expect(api.measure("stream").bottomGap).toBe(0);
  });
});
