import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageComposer } from "./MessageComposer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function keydown(target: HTMLTextAreaElement, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init });
  const allowed = target.dispatchEvent(event);
  return { event, allowed };
}

describe("MessageComposer keyboard sending", () => {
  const mounted: Array<{ host: HTMLDivElement; root: ReturnType<typeof createRoot> }> = [];

  afterEach(() => {
    for (const { host, root } of mounted.splice(0)) {
      act(() => root.unmount());
      host.remove();
    }
  });

  function renderComposer(props: Partial<React.ComponentProps<typeof MessageComposer>> = {}) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ host, root });
    const onSend = props.onSend ?? vi.fn();
    act(() => root.render(
      <MessageComposer
        value="Hello Antonio"
        onChange={() => undefined}
        onSend={onSend}
        sendOnEnter
        {...props}
      />,
    ));
    return { root, textarea: host.querySelector("textarea") as HTMLTextAreaElement, onSend };
  }

  it("sends on plain Enter and leaves Shift+Enter available for a newline", () => {
    const onSend = vi.fn();
    const { textarea } = renderComposer({ onSend });

    const plain = keydown(textarea, {});
    expect(plain.event.defaultPrevented).toBe(true);
    expect(plain.allowed).toBe(false);
    expect(onSend).toHaveBeenCalledTimes(1);

    const shifted = keydown(textarea, { shiftKey: true });
    expect(shifted.event.defaultPrevented).toBe(false);
    expect(shifted.allowed).toBe(true);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("does not send while an IME composition is active", () => {
    const onSend = vi.fn();
    const { textarea } = renderComposer({ onSend });
    const composing = keydown(textarea, { isComposing: true });
    expect(composing.event.defaultPrevented).toBe(false);
    expect(onSend).not.toHaveBeenCalled();
  });

  it.each([
    { label: "sending", props: { sending: true } },
    { label: "disabled", props: { disabled: true } },
    { label: "send-disabled", props: { sendDisabled: true } },
  ])("does not submit when $label", ({ props }) => {
    const onSend = vi.fn();
    const { textarea } = renderComposer({ onSend, ...props });
    keydown(textarea, {});
    expect(onSend).not.toHaveBeenCalled();
  });

  it("coalesces repeated Enter presses while the current send is unresolved", async () => {
    let resolveSend: (() => void) | undefined;
    const onSend = vi.fn(() => new Promise<void>((resolve) => { resolveSend = resolve; }));
    const { textarea } = renderComposer({ onSend });

    keydown(textarea, {});
    keydown(textarea, {});
    expect(onSend).toHaveBeenCalledTimes(1);

    await act(async () => resolveSend?.());
    keydown(textarea, {});
    expect(onSend).toHaveBeenCalledTimes(2);
  });
});
