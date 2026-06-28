// Back-compat shim: BTF invite emails already in inboxes link to
// /workspace/accept-invite. The unified handler now lives at /accept-invite,
// so we just re-export it. The new component detects BTF tokens and renders
// the white-labeled Mogul Maker Academy experience.
export { default } from "@/pages/AcceptInvite";
