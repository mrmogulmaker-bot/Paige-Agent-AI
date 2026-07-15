/**
 * Shared voice-session UI types. Kept in a neutral module (not tied to any one
 * component) so the dock and its call sites have one source of truth that
 * survives components being added or retired.
 */
export type VoiceModalStatus = "connecting" | "listening" | "speaking" | "thinking";

export interface VoiceTranscriptEntry {
  role: "user" | "assistant";
  content: string;
}
