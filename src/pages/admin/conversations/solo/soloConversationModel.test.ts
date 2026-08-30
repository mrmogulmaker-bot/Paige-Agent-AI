import { describe, expect, it } from "vitest";
import type { DbThread, MessageRow } from "../inbox-shared";
import {
  buildSoloConversationLinks,
  canSendInSolo,
  conversationNeedsAttention,
  createAccountEpochGuard,
  getSoloChannelTruth,
} from "./soloConversationModel";

const thread = (overrides: Partial<DbThread> = {}): DbThread => ({
  id: "thread-1",
  thread_key: "contact:tenant-a:contact-1",
  contact_id: "contact-1",
  snoozed_until: null,
  archived_at: null,
  labels: [],
  unread_count: 0,
  last_message_at: "2026-08-20T12:00:00.000Z",
  last_direction: "inbound",
  clients: null,
  ...overrides,
});

const message = (overrides: Partial<MessageRow> = {}): MessageRow => ({
  id: "message-1",
  thread_key: "contact:tenant-a:contact-1",
  contact_id: "contact-1",
  connector_id: "connector-1",
  channel_type: "email",
  direction: "inbound",
  status: "received",
  sender: null,
  recipients: null,
  subject: null,
  body_text: "Hello",
  body_html: null,
  attachments: null,
  provider_message_id: null,
  in_reply_to_provider_id: null,
  action_id: null,
  error: null,
  scheduled_for: null,
  sent_at: null,
  created_at: "2026-08-20T12:00:00.000Z",
  call_duration_seconds: null,
  recording_url: null,
  transcript: null,
  clients: null,
  ...overrides,
});

describe("Solo Conversations truth model", () => {
  it("counts attention once for unread, draft, or an overdue inbound needing a reply and excludes archived and future-snoozed", () => {
    const now = new Date("2026-08-28T12:00:00.000Z").getTime();
    expect(conversationNeedsAttention(thread({ unread_count: 2 }), [], now)).toBe(true);
    expect(conversationNeedsAttention(thread(), [message({ direction: "outbound", status: "draft" })], now)).toBe(true);
    expect(conversationNeedsAttention(thread({ last_direction: "inbound" }), [], now)).toBe(true);
    expect(conversationNeedsAttention(thread({ last_direction: "outbound" }), [], now)).toBe(false);
    expect(conversationNeedsAttention(thread({ archived_at: "2026-08-21T00:00:00.000Z", unread_count: 2 }), [], now)).toBe(false);
    expect(conversationNeedsAttention(thread({ snoozed_until: "2026-09-01T00:00:00.000Z", unread_count: 2 }), [], now)).toBe(false);
  });

  it("keeps every route on the same Solo account and uses the allowlisted Connections return", () => {
    expect(buildSoloConversationLinks("1971670", "contact-1")).toEqual({
      people: "/solo/1971670/clients/people?person=contact-1",
      portal: "/solo/1971670/clients/portal",
      campaigns: "/solo/1971670/growth",
      connections: "/solo/1971670/settings/connections?origin=conversations&returnTo=%2Fsolo%2F1971670%2Fclients%2Fconversations",
    });
  });

  it("never upgrades connector presence into mailbox, A2P, webhook, or operational proof", () => {
    const truth = getSoloChannelTruth([{ channel_type: "sms", active: true, status: "active", from_address: "+12025550142" }]);
    expect(truth.find((item) => item.id === "sms")).toMatchObject({
      availability: "PARTIAL",
      identity: "+12025550142",
      sendPermission: "Not reported",
      inbound: "Not reported",
      operationalHealth: "Not reported",
      a2p: "Not reported",
      providerSource: "Not reported",
    });
    const apple = truth.find((item) => item.id === "apple-business")!;
    const video = truth.find((item) => item.id === "video")!;
    const portal = truth.find((item) => item.id === "portal")!;
    expect(apple.label).toBe("Apple Messages for Business");
    expect(apple.setupOwner).toBe("Not available");
    expect(apple.providerSource).toContain("ordinary consumer iMessage is not offered");
    expect(video).toMatchObject({ availability: "UNAVAILABLE", identity: "Not applicable", setupOwner: "Not available" });
    expect(portal.setupOwner).toBe("Clients → Portal");
    expect(JSON.stringify(truth)).not.toMatch(/consumer iMessage available/i);
  });

  it("rejects late work from an earlier account epoch", () => {
    const guard = createAccountEpochGuard("tenant-a");
    const a = guard.capture();
    guard.advance("tenant-b");
    const b = guard.capture();
    expect(guard.accept(a)).toBe(false);
    expect(guard.accept(b)).toBe(true);
  });

  it("fails closed for governed and status-only channel sends", () => {
    expect(canSendInSolo("human", "email")).toBe(true);
    expect(canSendInSolo("draft", "sms")).toBe(true);
    expect(canSendInSolo("governed", "email")).toBe(false);
    expect(canSendInSolo("human", "instagram")).toBe(false);
    expect(canSendInSolo("human", "voice")).toBe(false);
  });
});
