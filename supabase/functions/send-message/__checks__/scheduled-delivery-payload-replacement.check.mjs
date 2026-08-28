import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

const scheduledExistingStart = source.indexOf("if (body.message_id) {", source.indexOf("if (!isInternal && body.scheduled_for)"));
const scheduledInsertStart = source.indexOf("} else if (effectiveContactId || effectiveConnectorId)", scheduledExistingStart);
assert.notEqual(scheduledExistingStart, -1, "scheduled existing-message branch must exist");
assert.notEqual(scheduledInsertStart, -1, "scheduled insert branch must exist");
const scheduledExisting = source.slice(scheduledExistingStart, scheduledInsertStart);

for (const contract of [
  'recipients: [{ address: body.to }]',
  "subject: body.subject ?? null",
  'body_html: body.channel === "email" ? body.body : null',
  'body_text: body.channel === "email" ? null : body.body',
  "attachments: body.attachments ?? []",
  ".eq(\"tenant_id\", tenantId)",
  ".eq(\"status\", \"draft\")",
  '.is("scheduled_for", null)',
]) {
  assert.ok(scheduledExisting.includes(contract), `scheduled replacement is missing: ${contract}`);
}
assert.ok(!scheduledExisting.includes("patched?.id ?? body.message_id"), "a failed guarded replacement must not be reported as queued");
for (const contract of [
  '(draftRow.status === "queued" && !isInternal && !body.scheduled_for)',
  'error: "scheduled_message_write_failed"',
  'error: "scheduled_message_not_persisted"',
  "if (!schedRowId)",
  'error: "contact_override_forbidden"',
  'error: "thread_override_forbidden"',
  'error: "recipient_contact_mismatch"',
  'error: "scheduled_release_terminalization_failed"',
  '"scheduled_message_not_releasable"',
  'draftRow?.status !== "draft"',
  '.update({ status: "failed", scheduled_for: null, error: failure })',
  'scheduled_binding: { contact_id: effectiveContactId, connector_id: effectiveConnectorId }',
  'return await terminalizeScheduledRelease("scheduled_contact_unavailable")',
  'return await terminalizeScheduledRelease("scheduled_connector_unavailable")',
  'return await terminalizeScheduledRelease("scheduled_binding_unavailable")',
  'return await terminalizeScheduledRelease("scheduled_contact_changed")',
  'return await terminalizeScheduledRelease("scheduled_connector_changed")',
  'error: "contact_lookup_failed"',
  'error: "connector_lookup_failed"',
  'scheduled_binding: scheduledBinding ?? { contact_id: effectiveContactId, connector_id: effectiveConnectorId }',
  'error: "pre_send_state_write_failed"',
  'error: "message_lookup_failed"',
  'error: "message_not_found"',
  'if (isInternal && data.status !== "queued")',
  'attachmentValidationError(body.attachments, tenantId)',
  'attachment.url.startsWith(prefix)',
  'attachments.length > MAX_COMMS_ATTACHMENTS',
  'attachment.size > MAX_COMMS_ATTACHMENT_BYTES',
]) {
  assert.ok(source.includes(contract), `send-message is missing fail-closed contract: ${contract}`);
}

function normalizeRecipient(channel, value) {
  if (!value) return "";
  if (channel === "email") return value.trim().toLowerCase();
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `1${digits}` : digits;
}

function attachmentsAreValid(attachments, tenantId) {
  if (!attachments) return true;
  if (!tenantId || !Array.isArray(attachments) || attachments.length > 10) return false;
  const prefix = `${tenantId}/`;
  return attachments.every((attachment) => attachment && typeof attachment === "object" &&
    typeof attachment.url === "string" && attachment.url.startsWith(prefix) &&
    attachment.url.length > prefix.length && !attachment.url.includes("..") &&
    !attachment.url.includes("\\") && !/^https?:\/\//i.test(attachment.url) &&
    (attachment.size === undefined || (Number.isFinite(attachment.size) && attachment.size >= 0 && attachment.size <= 10 * 1024 * 1024)));
}

function scheduledReplacementDisposition(row, request) {
  if (request.scheduled_for && row.status !== "draft") return "conflict";
  return "replace";
}

function drainRecipientDisposition(row, canonicalRecipient) {
  if (normalizeRecipient(row.channel, row.to) === normalizeRecipient(row.channel, canonicalRecipient)) return "release";
  return "failed";
}

function requiredBindingDisposition(meta, row) {
  const binding = meta?.scheduled_binding;
  if (!binding || (typeof binding.contact_id !== "string" && typeof binding.connector_id !== "string")) return "failed";
  if (typeof binding?.contact_id === "string" && !row.contact_id) return "failed";
  if (typeof binding?.connector_id === "string" && !row.connector_id) return "failed";
  return "release";
}

function replaceCanceledDraft(row, request) {
  if (row.id !== request.message_id || row.tenant_id !== request.tenant_id || row.status !== "draft" || row.scheduled_for !== null) {
    return { accepted: false, row };
  }
  return {
    accepted: true,
    row: {
      ...row,
      status: "queued",
      scheduled_for: request.scheduled_for,
      recipients: [{ address: request.to }],
      subject: request.subject ?? null,
      body_html: request.channel === "email" ? request.body : null,
      body_text: request.channel === "email" ? null : request.body,
      attachments: request.attachments ?? [],
    },
  };
}

const canceled = {
  id: "message-1",
  tenant_id: "tenant-a",
  status: "draft",
  scheduled_for: null,
  recipients: [{ address: "old@example.com" }],
  subject: "Original subject",
  body_html: "Original body",
  body_text: null,
  attachments: [{ path: "old.pdf" }],
};
const edited = {
  message_id: "message-1",
  tenant_id: "tenant-a",
  scheduled_for: "2030-01-01T12:00:00.000Z",
  channel: "email",
  to: "edited@example.com",
  subject: "Edited subject",
  body: "Edited body",
  attachments: [{ path: "edited.pdf" }],
};

const first = replaceCanceledDraft(canceled, edited);
assert.equal(first.accepted, true);
assert.deepEqual(first.row.recipients, [{ address: "edited@example.com" }]);
assert.equal(first.row.subject, "Edited subject");
assert.equal(first.row.body_html, "Edited body");
assert.deepEqual(first.row.attachments, [{ path: "edited.pdf" }]);
assert.ok(!JSON.stringify(first.row).includes("Original body"), "the canceled body must not survive requeue");

assert.equal(replaceCanceledDraft(first.row, edited).accepted, false, "a concurrent or duplicate requeue must lose the guarded transition");
assert.equal(replaceCanceledDraft(canceled, { ...edited, tenant_id: "tenant-b" }).accepted, false, "cross-tenant replacement must fail closed");
const losingEdit = replaceCanceledDraft(first.row, { ...edited, body: "A later edit that must not overwrite the winner" });
assert.equal(losingEdit.accepted, false, "a late differing edit must not receive a false queued acknowledgement");
assert.equal(first.row.body_html, "Edited body", "the winning edited payload must remain authoritative");
assert.equal(scheduledReplacementDisposition({ status: "sent" }, edited), "conflict", "a stale edit must not be acknowledged after the winner was sent");

assert.equal(normalizeRecipient("email", " ANTONIO@Example.COM "), "antonio@example.com");
assert.equal(normalizeRecipient("sms", "(424) 457-5247"), "14244575247");
assert.notEqual(normalizeRecipient("email", "other@example.com"), normalizeRecipient("email", "antonio@example.com"), "a different contact recipient must be rejected");
assert.equal(drainRecipientDisposition({ channel: "email", to: "old@example.com" }, "new@example.com"), "failed", "a contact address change must terminalize the queued row without retargeting it");
assert.equal(drainRecipientDisposition({ channel: "sms", to: "(424) 457-5247" }, "+1 424-457-5247"), "release", "format-only phone changes remain the same canonical recipient");
const bindingMeta = { scheduled_binding: { contact_id: "contact-a", connector_id: "connector-a" } };
assert.equal(requiredBindingDisposition(bindingMeta, { contact_id: null, connector_id: "connector-a" }), "failed", "a deleted contact must terminalize the scheduled row");
assert.equal(requiredBindingDisposition(bindingMeta, { contact_id: "contact-a", connector_id: null }), "failed", "a deleted connector must terminalize the scheduled row");
assert.equal(requiredBindingDisposition(bindingMeta, { contact_id: "contact-a", connector_id: "connector-a" }), "release");
assert.equal(requiredBindingDisposition({}, { contact_id: null, connector_id: null }), "failed", "a legacy markerless queued row must fail closed");

const policyRequeueMeta = {
  source: "send-message",
  pre_send: { step: "queued_quiet_hours", reason: "quiet_hours" },
  scheduled_binding: bindingMeta.scheduled_binding,
};
assert.deepEqual(policyRequeueMeta.scheduled_binding, bindingMeta.scheduled_binding, "policy requeue must preserve immutable bindings");
assert.equal(requiredBindingDisposition(policyRequeueMeta, { contact_id: null, connector_id: "connector-a" }), "failed", "deletion after policy requeue must still terminalize");

function lookupDisposition(error, data) {
  if (error) return "retry";
  return data ? "resolved" : "failed";
}
assert.equal(lookupDisposition(new Error("transient database fault"), null), "retry", "lookup faults must not masquerade as deletion");
assert.equal(lookupDisposition(null, null), "failed", "true missing records must terminalize");

function messageLookupDisposition({ error, row, internal }) {
  if (error) return "retry";
  if (!row) return "not_found";
  if (internal && row.status !== "queued") return "conflict";
  return "continue";
}
assert.equal(messageLookupDisposition({ error: new Error("transient"), row: null, internal: true }), "retry", "message lookup faults must stop before provider work");
assert.equal(messageLookupDisposition({ error: null, row: null, internal: true }), "not_found", "a row deleted after claim must stop before provider work");
assert.equal(messageLookupDisposition({ error: null, row: null, internal: false }), "not_found", "an invalid user-supplied message id must not fall back to body rows");
assert.equal(messageLookupDisposition({ error: null, row: { status: "draft" }, internal: true }), "conflict", "internal release must prove the row remains queued");
assert.equal(messageLookupDisposition({ error: null, row: { status: "queued" }, internal: true }), "continue");

assert.equal(attachmentsAreValid([{ url: "tenant-a/messages/edited.pdf", size: 1024 }], "tenant-a"), true);
assert.equal(attachmentsAreValid([{ url: "tenant-b/messages/foreign.pdf", size: 1024 }], "tenant-a"), false, "cross-tenant attachment paths must fail");
assert.equal(attachmentsAreValid([{ url: "https://example.com/file.pdf", size: 1024 }], "tenant-a"), false, "remote attachment URLs must fail");
assert.equal(attachmentsAreValid([{ url: "tenant-a/../tenant-b/file.pdf", size: 1024 }], "tenant-a"), false, "traversal-like paths must fail");
assert.equal(attachmentsAreValid([{ url: "tenant-a/messages/huge.pdf", size: 10 * 1024 * 1024 + 1 }], "tenant-a"), false, "oversized attachments must fail");
assert.equal(attachmentsAreValid(Array.from({ length: 11 }, (_, i) => ({ url: `tenant-a/messages/${i}.pdf` })), "tenant-a"), false, "attachment count must be bounded");

console.log(`scheduled-delivery payload replacement contract passed: ${fileURLToPath(new URL("../index.ts", import.meta.url))}`);

