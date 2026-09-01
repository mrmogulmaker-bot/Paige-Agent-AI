/**
 * THE ACTION-RISK POLICY — the one place that decides how much proof an action needs.
 *
 * Every mutation Paige can perform is classified here, once, on the server. The classification is
 * a property of the ACTION, never of who is asking or how they asked, so nothing in a request can
 * move it: not the model's arguments, not the request body, not the calling surface, not a
 * hallucinated tool name. The only input is the tool's own name, and the only source of truth is
 * the table below.
 *
 * WHY THIS FILE EXISTS RATHER THAN A SET LITERAL INSIDE THE HANDLER. The split between an ordinary
 * action and a dangerous one first shipped as a `Set` and a comment beside the confirm gate. That
 * works exactly until someone adds the fifty-second write tool, at which point the new tool is
 * silently ordinary — because the permissive answer was the default. Mutation-testing found the
 * same shape from the other side: emptying three entries out of that set failed nothing, since the
 * checks drove one member and counted the rest. A policy that degrades quietly toward permissive is
 * not a policy.
 *
 * THE THREE RULES THIS FILE ENFORCES
 *
 *   1. FAIL CLOSED. An action that is not classified is not runnable. `classifyAction` answers
 *      "unclassified" for anything absent, and the caller must refuse rather than guess. Adding a
 *      write tool without classifying it makes that tool inert, loudly, instead of ungoverned,
 *      silently — and CI (`lint:action-risk`) fails the change before it can reach anyone.
 *   2. NOTHING FROM THE REQUEST CAN LOWER A CLASS. The lookup is by tool name against a frozen Map.
 *      A Map, specifically, and not an object literal: `({} as any)["constructor"]` is truthy, so an
 *      object lookup would classify a tool called `constructor` or `__proto__` as whatever the
 *      prototype chain happened to return. A Map has no prototype chain to walk.
 *   3. RAISING PAIGE'S OWN AUTONOMY IS NOT A CHAT ACTION AT ALL. `owner_only` is not "needs a
 *      stronger approval" — it is "this does not happen here, at any approval strength, however
 *      the operator words it." It belongs to the owner in Settings.
 */

/**
 * `ordinary`   — reversible, in-tenant, and its effects stay inside the workspace. A compact
 *                confirmation is enough: the person is read the exact stored action and answers.
 * `high`       — irreversible, changes who may do what, reaches outside the platform, spends
 *                money, or becomes visible to a client. Requires the rendered approval card, whose
 *                fingerprint travels in the request BODY and therefore cannot be produced by the
 *                model. The model reporting "they said yes" is not accepted for these.
 * `owner_only` — never performed from Chat, at any approval strength. Owner-controlled Settings.
 */
export type ActionRisk = "ordinary" | "high" | "owner_only";

/** What `classifyAction` can answer. "unclassified" is a refusal, not a permissive default. */
export type ActionRiskVerdict = ActionRisk | "unclassified";

/**
 * EVERY MUTATION PAIGE CAN PERFORM, AND WHY IT SITS WHERE IT SITS.
 *
 * The reason column is not decoration. When a later reader disagrees with a classification, the
 * reason is what they argue with — and when a new tool is added, the reasons are the rubric that
 * says where it goes. An entry with no defensible reason is an entry that should be `high`.
 */
const RISK: ReadonlyArray<readonly [string, ActionRisk, string]> = [
  // ── owner_only ────────────────────────────────────────────────────────────────────────────
  // §67's red line. How much Paige may do unattended is the operator's decision about Paige, and
  // an assistant that can argue its way into more authority has no ceiling — the wording of the
  // request is exactly the thing that must not matter. Turning a process LIVE is the same decision
  // wearing different clothes: a dark process that starts firing is authority Paige did not have a
  // moment ago. Both move to Settings, where a person changes them deliberately rather than at the
  // end of a conversation Paige was steering.
  ["automation_set_grant", "owner_only", "changes how much Paige may do alone"],
  ["automation_set_state", "owner_only", "makes a process live, which is the same decision"],

  // ── high: cannot be undone ────────────────────────────────────────────────────────────────
  ["crm_delete_contact", "high", "destroys a client record and its related rows"],
  ["comms_buy_number", "high", "commits the tenant to a recurring charge on a provider account"],
  ["comms_set_primary_number", "high", "changes the number every client sees when the tenant contacts them"],
  ["n8n_delete_workflow", "high", "permanently deletes an automation"],
  ["plan_remove_item", "high", "cancels a milestone, task or reminder"],

  // ── high: changes who may do what ─────────────────────────────────────────────────────────
  ["member_grant_role", "high", "grants a staff role"],
  ["member_revoke_role", "high", "removes a staff role"],
  ["crm_assign_coach", "high", "changes who can see a client"],
  ["crm_assign_contact", "high", "changes who owns and can see a client"],
  // Runs as service role against the orchestrator, so whatever the specialist then does is outside
  // this gate. Until that path is itself governed, delegating IS the authority decision.
  ["delegate_to_subagent", "high", "dispatches work that executes outside this gate"],

  // ── high: reaches outside the platform ────────────────────────────────────────────────────
  // Every provider action, including the brakes. Deactivating and archiving are safety-directional,
  // but they still act on the operator's own n8n account, and "which provider calls are safe" is a
  // judgement this file should not be making per-verb.
  ["n8n_activate_workflow", "high", "makes an external automation live"],
  ["n8n_deactivate_workflow", "high", "acts on the operator's provider account"],
  ["n8n_create_workflow", "high", "writes to the operator's provider account"],
  ["n8n_update_workflow", "high", "writes to the operator's provider account"],
  ["n8n_run_workflow", "high", "fires an external automation with real effects"],
  ["n8n_archive_workflow", "high", "acts on the operator's provider account"],
  ["zapier_run_action", "high", "runs an action in a third-party app"],
  ["calendar_book_meeting", "high", "books a real event with a real person"],

  // ── high: becomes visible to a client, or goes public ─────────────────────────────────────
  ["growth_page_publish", "high", "puts a page live at a public URL"],
  ["growth_funnel_publish", "high", "puts a whole sequence live"],
  ["program_enroll", "high", "enrols a real person into a programme"],
  // Filing a document is HIGH because one of its two outcomes hands a real document to a real
  // person outside the workspace, and that cannot be walked back — moving it to `internal`
  // afterwards does not unread it. The class is a property of the ACTION, so it does not soften
  // when the arguments happen to say `internal`: rule 2 of this file is that nothing in a request
  // may lower a classification, and splitting this into a share tool and a file tool purely to win
  // a cheaper gate for one path would be that same lowering wearing a second tool name.
  //
  // It also sits alongside `document_generate`, which is `ordinary` on the stated grounds that
  // "producing an artefact is not handing it to anyone, and giving it to a client is the separate
  // act where the visibility decision belongs." This IS that separate act. The two entries are the
  // two halves of one sentence, and they only stay coherent together.
  ["crm_file_document", "high", "can put a document in front of the client, which cannot be undone"],

  // ── high: spends money ────────────────────────────────────────────────────────────────────
  ["marketplace_install", "high", "installs a paid capability"],
  ["marketplace_uninstall", "high", "changes what the workspace is billed for"],

  // ── ordinary ──────────────────────────────────────────────────────────────────────────────
  // Reversible in-tenant record work. The operator sees the exact stored action before it runs and
  // can undo it afterwards; nothing leaves the workspace and nobody's permissions change.
  ["crm_create_contact", "ordinary", "adds a record the operator can edit or delete"],
  ["crm_update_contact", "ordinary", "edits fields on a record"],
  ["crm_update_pipeline_stage", "ordinary", "moves a client between stages"],
  ["crm_create_task", "ordinary", "files work on the operator's own queue"],
  ["crm_log_activity", "ordinary", "appends to a client's timeline"],
  // Staff-only by construction — `client_notes` has no client-facing read policy at all — and
  // deletable by its author or a tenant admin. The destination is constrained by the database
  // (20261031000000), so a wrong routing decision cannot land on another tenant's client.
  ["crm_add_note", "ordinary", "files a staff-only note on a client's record"],
  ["update_business_profile", "ordinary", "edits the workspace's own profile"],
  // Comms (merged from main 2026-09-01). Naming a number is a label; drafting a registration
  // prepares compliance copy and explicitly does NOT submit it. Buying a number and changing the
  // primary are high: one is a recurring charge against a provider account, the other changes the
  // number every client sees on their phone. Both fall squarely in the owner's high-risk coverage
  // of billing, connections, provider actions and client-visible changes.
  ["comms_name_number", "ordinary", "renames a number in the workspace's own list"],
  ["comms_draft_registration", "ordinary", "drafts carrier copy; submitting it is a separate act"],
  // `pipeline_create` / `pipeline_add_stage` were classified here and are NOT tools — they exist
  // only in a label switch. The tool that exists is `pipeline_configure`, and it was omitted, so
  // deriving the gated set from this policy silently UNGATED a previously-gated write (§58). The
  // lint could not see it: `configure` was not a mutation verb, so the backstop read it as a query.
  // Both halves are fixed — the entry below, and `configure` added to MUTATION_VERB.
  ["pipeline_configure", "ordinary", "saves a pipeline draft the operator reviews; activation is a separate act"],
  ["propose_business_brief_update", "ordinary", "stages a suggestion the operator approves before it applies"],
  ["deal_create", "ordinary", "adds an opportunity"],
  ["deal_move_stage", "ordinary", "moves a deal between stages"],
  // The client seat's ONLY write, and on the portal it is the client editing their own profile.
  // Reversible, in-tenant, and scoped to the client already in focus.
  ["update_client_data", "ordinary", "edits fields on the focused client's record"],
  ["draft_marketing_content", "ordinary", "produces a draft nobody has sent"],
  ["generate_image", "ordinary", "produces an image nobody has published"],
  ["content_save", "ordinary", "saves to the workspace's own library"],
  ["growth_page_save", "ordinary", "saves a DRAFT; publishing is the separate high-risk act"],
  ["growth_funnel_build", "ordinary", "builds DRAFT rows; publishing is separate"],
  // Produces the artefact; it does not hand it to anyone. "A client might be given this one day"
  // is true of most things the workspace holds, and classifying on what MIGHT later happen to an
  // artefact would put half the library in `high`. Giving it to a client is the separate act, and
  // that act is where the visibility decision belongs.
  ["document_generate", "ordinary", "produces a document; sharing it is a separate act"],
  ["action_file", "ordinary", "files work between Paige's own departments"],
  ["action_advance", "ordinary", "moves a unit of work along its lifecycle"],
  ["save_to_knowledge_base", "ordinary", "stores tenant-private reference material"],
  // Proposes a specialist for approval — it does not run one. `delegate_to_subagent`, which does,
  // is high above.
  ["forge_subagent", "ordinary", "proposes a specialist; approval is a separate act"],
  // Targets the operator or a teammate, never a client or an outside address, so the email channel
  // is internal notification rather than outbound contact. If a reminder ever becomes addressable
  // to a client, this entry moves to `high`.
  ["plan_set_reminder", "ordinary", "notifies the operator or a teammate"],
  ["plan_create", "ordinary", "creates a plan the operator owns"],
  ["plan_add_milestone", "ordinary", "adds a dated checkpoint"],
  ["plan_assign_task", "ordinary", "assigns work to a teammate, routed to approval"],
  ["plan_update_item", "ordinary", "edits a plan item"],
  ["author_event_kind", "ordinary", "defines a kind of activity to track"],
  // Born at `confirm` + `draft` by construction, so it creates something that cannot act. Turning
  // it on is `automation_set_state`, which is owner_only.
  ["automation_draft", "ordinary", "writes down a process that cannot yet run"],
];

/**
 * A Map, deliberately. An object literal would answer `classifyAction("constructor")` with a
 * function off the prototype chain, and any truthiness check downstream would then treat an
 * invented tool name as classified. A Map has no prototype to walk, so an unknown key is genuinely
 * unknown — which is the whole basis of rule 1.
 */
const RISK_BY_TOOL: ReadonlyMap<string, ActionRisk> = new Map(RISK.map(([t, r]) => [t, r]));
const REASON_BY_TOOL: ReadonlyMap<string, string> = new Map(RISK.map(([t, , why]) => [t, why]));

/**
 * Tools whose names read like a mutation but which persist nothing. Each needs a reason, so that
 * "this one is fine" is a decision on the record rather than an omission. `runtimeWriteGuard` uses
 * this list, and CI checks it has not grown silently.
 */
//
// TWO SHAPES QUALIFY, and the second was added 2026-09-01 when `propose_action` surfaced. The
// first is "persists nothing" — it drafts in memory and a named separate tool does the saving.
// The second is "persists ONLY a request for a human decision, and the act that carries the risk
// is separately gated." Those are different statements and the list would be lying if it made
// the second wear the first's words.
//
// `propose_action` is the second shape, and gating it would be actively wrong: its entire purpose
// is to route work to a person, so a confirm in front of it asks the operator to approve being
// asked. The send it proposes is what carries the risk, and the send is gated. Exempting it is a
// decision on the record — which is the point of this list existing at all.
const NON_MUTATING_EXEMPT: ReadonlyMap<string, string> = new Map([
  ["growth_page_generate", "drafts a page in memory and returns it; saving is growth_page_save"],
  ["growth_funnel_generate", "drafts a funnel in memory; building it is growth_funnel_build"],
  ["propose_action", "files a request for the operator's decision and sends nothing; the send it proposes is the gated act"],
  // ADDED 2026-09-02 with the Pipelines merge. It persists a row, so the verb backstop was right
  // to stop it — but the row is the archive's own binding: single-use, expiring, scoped to this
  // tenant and this requester, and it changes nothing anyone would notice. Its whole purpose is to
  // show the operator what archiving would cost BEFORE they answer. Gating it would demand an
  // approval to be shown the consequences, and would put a second approval in front of one act,
  // which is the duplication the merge removed. The archive itself stays gated, and additionally
  // cannot run unless this preview exists and predates the turn.
  ["pipeline_archive_preview", "mints the archive's own single-use binding and shows the consequence; the archive it prepares is the gated act"],
]);

/**
 * Names that read as a mutation. Used ONLY to catch a write tool somebody forgot to classify — it
 * never lowers anything, and a classified tool never consults it. Calibrated against the 87 tool
 * names this handler declares: it matches every gated tool except `delegate_to_subagent` (which is
 * classified anyway) and exactly two non-persisting generators (exempted above).
 */
//
// EXTENDED 2026-09-01, after it failed to catch six ungoverned writes. `pipeline_configure` was a
// previously-gated tool this policy omitted, and `comms_buy_number` / `comms_name_number` arrived
// from main; none matched, so all three read as queries and would have dispatched with no gate at
// all. `configure`, `buy`, `name` and `propose` are added. A false POSITIVE here is harmless — it
// forces an explicit classification or a named exemption — while a false negative is an ungoverned
// write, so this list should err long. It remains a BACKSTOP, never the guard: the reconciliation
// that actually found those six compared the handler's declared tools against this policy, and
// that comparison is what `lint:action-risk` runs.
export const MUTATION_VERB = /(^|_)(create|update|delete|remove|save|send|publish|install|uninstall|grant|revoke|run|assign|enroll|book|set|draft|generate|file|advance|forge|archive|activate|deactivate|move|add|build|log|author|enable|disable|invite|upload|apply|approve|reject|import|export|sync|write|post|schedule|cancel|start|stop|trigger|fire|configure|buy|purchase|name|rename|propose|provision|claim|release)(_|$)/;

/** Every classified action. This is what the handler gates on — there is no second list. */
export function mutatingTools(): ReadonlySet<string> {
  return new Set(RISK_BY_TOOL.keys());
}

/**
 * The one classification call. Takes a tool name and nothing else, on purpose: an extra parameter
 * here is the seam through which a request would eventually be allowed to argue about its own risk.
 */
export function classifyAction(tool: string): ActionRiskVerdict {
  return RISK_BY_TOOL.get(tool) ?? "unclassified";
}

/** Why an action carries its class, for a message a person will read. Never a tool name. */
export function riskReason(tool: string): string | null {
  return REASON_BY_TOOL.get(tool) ?? null;
}

/**
 * THE LAST LINE, at runtime rather than in CI. A tool that is not classified but whose name reads
 * as a write is refused before it can execute. CI catches this case first and should always catch
 * it — but CI catches it in the repository, and this catches it in production, which is where a
 * missed classification would otherwise become an ungoverned write.
 *
 * Returns null when the tool may proceed as read-only.
 */
export function unclassifiedWriteReason(tool: string): string | null {
  if (RISK_BY_TOOL.has(tool)) return null;          // classified: the gate handles it
  if (NON_MUTATING_EXEMPT.has(tool)) return null;    // named, with a reason, as persisting nothing
  if (!MUTATION_VERB.test(tool)) return null;        // reads as a query
  return "this action has no risk classification, so it cannot run";
}

/** Exposed for the CI guard so the lint and the runtime cannot disagree about the exempt list. */
export function nonMutatingExemptions(): ReadonlyMap<string, string> {
  return NON_MUTATING_EXEMPT;
}
