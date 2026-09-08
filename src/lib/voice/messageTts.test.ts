import { afterEach, describe, expect, it, vi } from "vitest";
describe("shared output pause/resume", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it("Hold wins over an unresolved Resume and never fetches another voice", async () => {
    vi.resetModules();
    const audio = { paused: true, currentTime: 0, src: "", play: vi.fn(async () => { audio.paused = false; }), pause: vi.fn(() => { audio.paused = true; }) };
    vi.stubGlobal("Audio", function () { return audio; });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const { messageTts } = await import("./messageTts");
    const fetchAudio = vi.fn(async () => new Blob(["test"]));
    await messageTts.toggle("one", fetchAudio);
    messageTts.pause();
    let finish!: () => void;
    audio.play.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const resuming = messageTts.resume();
    messageTts.pause();
    finish();
    await resuming;
    expect(messageTts.getSnapshot().status).toBe("paused");
    expect(audio.paused).toBe(true);
    await messageTts.toggle("one", fetchAudio);
    expect(messageTts.getSnapshot().status).toBe("playing");
    expect(fetchAudio).toHaveBeenCalledTimes(1);
    messageTts.stop();
  });
});
