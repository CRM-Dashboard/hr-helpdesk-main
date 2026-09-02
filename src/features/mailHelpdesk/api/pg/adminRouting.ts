/**
 * Admin — routing rules, OLA policies and workflows.
 *
 * None of the three has a `PATCH`, and that is deliberate: a ticket pins the row
 * it resolved against, so editing in place would rewrite history rather than
 * change the future. Routing and OLA supersede into a new id; a workflow is
 * copied to a draft, edited, then published.
 */
import { PG_ENDPOINT, pgPath } from "@/services/endPoints";
import { pgQuery, pgRequest } from "@/services/pgClient";
import type {
  CreateOlaPolicyBody,
  CreateRoutingRuleBody,
  CreateWorkflowBody,
  CreateWorkflowVersionBody,
  OlaPolicyFilters,
  OlaPolicyRow,
  OlaStageRow,
  PublishWorkflowBody,
  PutOlaStagesBody,
  RoutingGapRow,
  RoutingPreviewBody,
  RoutingPreviewResponse,
  RoutingRuleFilters,
  RoutingRuleRow,
  SupersedeOlaPolicyBody,
  SupersedeRoutingRuleBody,
  WorkflowRow,
  WorkflowStateBody,
  WorkflowStateRow,
  WorkflowTransitionBody,
  WorkflowTransitionConfig,
} from "../../types/pg";
import { ifMatch } from "./adminShared";

// --- routing rules ---------------------------------------------------------

/**
 * The rules, **not paginated** and in resolution order (`specificity DESC,
 * effective_from DESC`) — so the grid reads top-to-bottom the way the engine
 * scans, with the catch-all at the bottom. Re-sorting alphabetically hides the
 * one thing an administrator needs to see: which rule wins.
 *
 * @param departmentId the department
 * @param filters scope, `userId`, and the superseded/inactive opt-ins
 * @returns the rules, with category, priority and user names joined in
 */
export const listRoutingRules = async (
  departmentId: string,
  filters?: RoutingRuleFilters,
): Promise<RoutingRuleRow[]> => {
  const { data } = await pgRequest<RoutingRuleRow[]>({
    method: "GET",
    url: `${pgPath(PG_ENDPOINT.ADMIN_ROUTING_RULES, { departmentId })}${pgQuery(filters)}`,
  });
  return data;
};

/**
 * @param departmentId the department
 * @param ruleId the rule
 * @returns the rule with its `etag`
 */
export const getRoutingRule = async (
  departmentId: string,
  ruleId: string,
): Promise<RoutingRuleRow> => {
  const { data } = await pgRequest<RoutingRuleRow>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.ADMIN_ROUTING_RULE, { departmentId, ruleId }),
  });
  return data;
};

/**
 * Creates a rule. All three scopes null is legal — that is the catch-all, and
 * every department needs one.
 *
 * Naming somebody currently unassignable is allowed and returns `warnings`: they
 * may be on leave with cover arranged, and refusing would make the table
 * un-editable around a person's absence.
 *
 * @param departmentId the department
 * @param body scope, the three people, and the strategy
 * @returns the new rule, with `warnings`
 * @throws {HelpdeskApiError} 409 when a live rule already covers the exact scope
 *   — `details` carries `existingRuleId` and the supersede path; follow it rather
 *   than surfacing the error
 */
export const createRoutingRule = async (
  departmentId: string,
  body: CreateRoutingRuleBody,
): Promise<RoutingRuleRow> => {
  const { data } = await pgRequest<RoutingRuleRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_ROUTING_RULES, { departmentId }),
    data: body,
  });
  return data;
};

/**
 * The Save button. Closes the incumbent and opens a successor at the same
 * instant, so the scope is never covered by neither version.
 *
 * Unspecified fields carry forward, and cross-field rules are re-checked against
 * the **merged** row — so `{ primaryUserId: X }` alone is a 422 when X is the
 * carried-forward backup.
 *
 * @param departmentId the department
 * @param ruleId the incumbent
 * @param body the changed fields; scope fields are refused with 422
 * @param etag the incumbent's token
 * @returns the successor — **a new id**, which the client must adopt
 * @throws {HelpdeskApiError} 409 when the rule was already superseded
 */
export const supersedeRoutingRule = async (
  departmentId: string,
  ruleId: string,
  body: SupersedeRoutingRuleBody,
  etag: string,
): Promise<RoutingRuleRow> => {
  const { data } = await pgRequest<RoutingRuleRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_ROUTING_SUPERSEDE, { departmentId, ruleId }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

/**
 * Retires a rule: `effective_to = now()`, `is_active = false`. Removes nothing —
 * a closed ticket's `routing_rule_id` must always resolve.
 *
 * @param departmentId the department
 * @param ruleId the rule
 * @param etag the row's token
 * @returns the retired row
 * @throws {HelpdeskApiError} 409 on the department's only catch-all — without one
 *   every unmatched ticket is silently unassigned. Disable the delete control on
 *   a lone catch-all and leave supersede enabled.
 */
export const retireRoutingRule = async (
  departmentId: string,
  ruleId: string,
  etag: string,
): Promise<RoutingRuleRow> => {
  const { data } = await pgRequest<RoutingRuleRow>({
    method: "DELETE",
    url: pgPath(PG_ENDPOINT.ADMIN_ROUTING_RULE, { departmentId, ruleId }),
    headers: ifMatch(etag),
  });
  return data;
};

/**
 * *"Who would actually get this ticket?"* — answered by `resolveAssignee`, the
 * same function ticket creation calls, writing nothing. Specificity tie-breaks,
 * eligibility drops and the out-of-office chain walk are all included.
 *
 * It is the only way to see the rules' combined effect, so it belongs beside the
 * editor and re-run on every change. Debounce it: the admin limiter is 60/minute.
 *
 * @param departmentId the department
 * @param body the scope a hypothetical ticket would carry; `{}` is unclassified
 * @returns the resolution, its `reason`, and a `warning` written to be shown
 */
export const previewRouting = async (
  departmentId: string,
  body: RoutingPreviewBody,
): Promise<RoutingPreviewResponse> => {
  const { data } = await pgRequest<RoutingPreviewResponse>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_ROUTING_PREVIEW, { departmentId }),
    data: body,
  });
  return data;
};

/**
 * Categories with no rule of their own, already ranked by traffic — show it as
 * "212 tickets in 90 days fall through to the catch-all".
 *
 * @param departmentId the department
 * @returns the gaps, most trafficked first
 */
export const listRoutingGaps = async (
  departmentId: string,
): Promise<RoutingGapRow[]> => {
  const { data } = await pgRequest<RoutingGapRow[]>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.ADMIN_ROUTING_GAPS, { departmentId }),
  });
  return data;
};

// --- OLA policies ----------------------------------------------------------

/**
 * Policies in resolution order, most specific first. Not paginated.
 *
 * @param departmentId the department
 * @param filters scope and the superseded/inactive opt-ins
 * @returns the policies
 */
export const listOlaPolicies = async (
  departmentId: string,
  filters?: OlaPolicyFilters,
): Promise<OlaPolicyRow[]> => {
  const { data } = await pgRequest<OlaPolicyRow[]>({
    method: "GET",
    url: `${pgPath(PG_ENDPOINT.ADMIN_OLA_POLICIES, { departmentId })}${pgQuery(filters)}`,
  });
  return data;
};

/**
 * One policy with its ladder, its live clock count and `stages_editable` — the
 * two fields a UI must branch on to decide between an editable ladder and a
 * read-only one with a Supersede button.
 *
 * @param departmentId the department
 * @param policyId the policy
 * @returns the policy, its stages and its `etag`
 */
export const getOlaPolicy = async (
  departmentId: string,
  policyId: string,
): Promise<OlaPolicyRow> => {
  const { data } = await pgRequest<OlaPolicyRow>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.ADMIN_OLA_POLICY, { departmentId, policyId }),
  });
  return data;
};

/**
 * @param departmentId the department
 * @param policyId the policy
 * @returns the ladder alone
 */
export const getOlaStages = async (
  departmentId: string,
  policyId: string,
): Promise<OlaStageRow[]> => {
  const { data } = await pgRequest<OlaStageRow[]>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.ADMIN_OLA_STAGES, { departmentId, policyId }),
  });
  return data;
};

/**
 * Creates a policy, deliberately **with no ladder** — measuring without
 * escalating is legal, and requiring stages here would make a two-step wizard
 * impossible.
 *
 * @param departmentId the department
 * @param body name, calendar, scope and at least one target
 * @returns the new policy
 * @throws {HelpdeskApiError} 422 with no target, or with both `pauseOnCollaboration`
 *   and a non-zero extension (they would count the same delay twice); 400 with
 *   actionable text when the calendar has no working days
 */
export const createOlaPolicy = async (
  departmentId: string,
  body: CreateOlaPolicyBody,
): Promise<OlaPolicyRow> => {
  const { data } = await pgRequest<OlaPolicyRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_OLA_POLICIES, { departmentId }),
    data: body,
  });
  return data;
};

/**
 * Replaces the **whole** ladder. There is no per-stage verb: thresholds must
 * ascend with `stage_no` and exactly one stage may be the breach stage, so
 * moving a threshold or the breach flag has no valid intermediate state.
 *
 * No `If-Match` — the token would be the policy's while the rows written are its
 * stages. The real precondition is `stages_editable`.
 *
 * @param departmentId the department
 * @param policyId the policy
 * @param body 1–20 stages, `stageNo` explicit rather than positional
 * @returns the stored ladder
 * @throws {HelpdeskApiError} 409 when clocks are running against the policy —
 *   the ladder is read live at every evaluation, so editing it would re-time
 *   escalation for tickets already started. Supersede instead.
 */
export const putOlaStages = async (
  departmentId: string,
  policyId: string,
  body: PutOlaStagesBody,
): Promise<OlaStageRow[]> => {
  const { data } = await pgRequest<OlaStageRow[]>({
    method: "PUT",
    url: pgPath(PG_ENDPOINT.ADMIN_OLA_STAGES, { departmentId, policyId }),
    data: body,
  });
  return data;
};

/**
 * New version of a policy. Omit `stages` and the incumbent's ladder is **cloned**
 * — which is what makes supersede a usable way to edit a live ladder, rather than
 * requiring the caller to re-send stages they may not be holding.
 *
 * @param departmentId the department
 * @param policyId the incumbent
 * @param body the changed fields; scope fields are refused
 * @param etag the incumbent's token
 * @returns the successor: new id, `version_no + 1`, `stages_editable: true`
 */
export const supersedeOlaPolicy = async (
  departmentId: string,
  policyId: string,
  body: SupersedeOlaPolicyBody,
  etag: string,
): Promise<OlaPolicyRow> => {
  const { data } = await pgRequest<OlaPolicyRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_OLA_SUPERSEDE, { departmentId, policyId }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

/**
 * Retires a policy. There is no last-one-out guard — a department with no OLA
 * policy is legal, and tickets are simply created with no clock.
 *
 * Clocks already running continue under it, and the response says so in `warning`.
 *
 * @param departmentId the department
 * @param policyId the policy
 * @param etag the row's token
 * @returns the retired policy, with `live_instances` and a `warning`
 */
export const retireOlaPolicy = async (
  departmentId: string,
  policyId: string,
  etag: string,
): Promise<OlaPolicyRow> => {
  const { data } = await pgRequest<OlaPolicyRow>({
    method: "DELETE",
    url: pgPath(PG_ENDPOINT.ADMIN_OLA_POLICY, { departmentId, policyId }),
    headers: ifMatch(etag),
  });
  return data;
};

// --- workflows -------------------------------------------------------------

/**
 * Every version, newest first per code. Not paginated — a workflow screen is a
 * version history. Without states, transitions or validation.
 *
 * @param departmentId the department
 * @returns the versions, each flagged `is_draft` / `is_live`
 */
export const listWorkflows = async (
  departmentId: string,
): Promise<WorkflowRow[]> => {
  const { data } = await pgRequest<WorkflowRow[]>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.ADMIN_WORKFLOWS, { departmentId }),
  });
  return data;
};

/**
 * One version whole — states, transitions and a `validation` block.
 *
 * Render the editor from `is_draft` and the Publish button from
 * `validation.publishable`, and the UI can never offer a publish the server will
 * refuse. Never branch on the dates: a draft's `effective_from` is `'infinity'`,
 * which reaches the wire as `null`.
 *
 * @param departmentId the department
 * @param workflowId the version
 * @returns the version, its rows and its validation checks
 */
export const getWorkflow = async (
  departmentId: string,
  workflowId: string,
): Promise<WorkflowRow> => {
  const { data } = await pgRequest<WorkflowRow>({
    method: "GET",
    url: pgPath(PG_ENDPOINT.ADMIN_WORKFLOW, { departmentId, workflowId }),
  });
  return data;
};

/**
 * @param departmentId the department
 * @param body code and name
 * @returns the new workflow, as a draft
 */
export const createWorkflow = async (
  departmentId: string,
  body: CreateWorkflowBody,
): Promise<WorkflowRow> => {
  const { data } = await pgRequest<WorkflowRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_WORKFLOWS, { departmentId }),
    data: body,
  });
  return data;
};

/**
 * A draft copy — how a live workflow is edited. The copy remaps every id in
 * three passes, so no row in the new version points at the old one's uuids.
 *
 * @param departmentId the department
 * @param workflowId the source version
 * @param body `copyFrom` defaults true: the usual reason to make a version is to
 *   change one row of fifteen, and retyping the other fourteen is how mistakes happen
 * @returns the draft
 * @throws {HelpdeskApiError} 409 when a draft is already open for this code
 */
export const createWorkflowVersion = async (
  departmentId: string,
  workflowId: string,
  body: CreateWorkflowVersionBody = {},
): Promise<WorkflowRow> => {
  const { data } = await pgRequest<WorkflowRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_WORKFLOW_VERSIONS, { departmentId, workflowId }),
    data: body,
  });
  return data;
};

/**
 * Cutover. Validation runs first, and the outgoing version's window closes at
 * the same instant the new one opens.
 *
 * The response carries a `warning` worth surfacing: agents fetch `/auth/me` once
 * on mount and cache the state vocabulary, so every open session is one refresh
 * behind until it re-fetches.
 *
 * @param departmentId the department
 * @param workflowId the draft to publish
 * @param body `effectiveFrom` may be future-dated; back-dating is a 422
 * @param etag the draft's token
 * @returns the published version and `supersededWorkflowId`
 * @throws {HelpdeskApiError} 409 with `details.failed` and `details.checks`
 */
export const publishWorkflow = async (
  departmentId: string,
  workflowId: string,
  body: PublishWorkflowBody,
  etag: string,
): Promise<WorkflowRow> => {
  const { data } = await pgRequest<WorkflowRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_WORKFLOW_PUBLISH, { departmentId, workflowId }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

/**
 * Adds a state to a **draft**.
 *
 * @param departmentId the department
 * @param workflowId the draft
 * @param body `code` is required here and refused on PATCH
 * @returns the new state
 * @throws {HelpdeskApiError} 409 once the version is published
 */
export const createWorkflowState = async (
  departmentId: string,
  workflowId: string,
  body: WorkflowStateBody,
): Promise<WorkflowStateRow> => {
  const { data } = await pgRequest<WorkflowStateRow>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_WORKFLOW_STATES, { departmentId, workflowId }),
    data: body,
  });
  return data;
};

/**
 * Edits a draft state. May send half a coherence pair — `{ isClosed: true }`
 * alone is checked against the **stored** `is_terminal`, which a validator
 * looking only at the body could not see.
 *
 * @param departmentId the department
 * @param workflowId the draft
 * @param stateId the state
 * @param body the changed fields; `code` is refused with 422
 * @param etag the state row's token
 * @returns the updated state
 */
export const updateWorkflowState = async (
  departmentId: string,
  workflowId: string,
  stateId: string,
  body: WorkflowStateBody,
  etag: string,
): Promise<WorkflowStateRow> => {
  const { data } = await pgRequest<WorkflowStateRow>({
    method: "PATCH",
    url: pgPath(PG_ENDPOINT.ADMIN_WORKFLOW_STATE, {
      departmentId,
      workflowId,
      stateId,
    }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

/**
 * A genuine hard delete, and the module's one honest exception to "configuration
 * is never deleted": a draft has governed no ticket, and the code uniqueness
 * index is not partial on a deleted flag, so a soft delete would hold the code
 * hostage forever. No `If-Match` — the precondition that matters is "still a draft?".
 *
 * @param departmentId the department
 * @param workflowId the draft
 * @param stateId the state
 * @throws {HelpdeskApiError} 409 naming the transitions that still reference it
 */
export const deleteWorkflowState = async (
  departmentId: string,
  workflowId: string,
  stateId: string,
): Promise<void> => {
  await pgRequest<unknown>({
    method: "DELETE",
    url: pgPath(PG_ENDPOINT.ADMIN_WORKFLOW_STATE, {
      departmentId,
      workflowId,
      stateId,
    }),
  });
};

/**
 * Adds a transition to a draft. `fromStateId: null` is the **creation**
 * transition — without one no ticket can be created against the workflow.
 *
 * @param departmentId the department
 * @param workflowId the draft
 * @param body endpoints, code, label and the actor/role gates
 * @returns the new transition
 */
export const createWorkflowTransition = async (
  departmentId: string,
  workflowId: string,
  body: WorkflowTransitionBody,
): Promise<WorkflowTransitionConfig> => {
  const { data } = await pgRequest<WorkflowTransitionConfig>({
    method: "POST",
    url: pgPath(PG_ENDPOINT.ADMIN_WORKFLOW_TRANSITIONS, {
      departmentId,
      workflowId,
    }),
    data: body,
  });
  return data;
};

/**
 * Edits a draft transition. Its endpoints and `code` are refused with 422: an
 * edge whose endpoints moved is a different edge, and it could collide with a
 * real one. On a draft, delete it and add the edge you meant.
 *
 * @param departmentId the department
 * @param workflowId the draft
 * @param transitionId the transition
 * @param body the changed fields
 * @param etag the transition row's token
 * @returns the updated transition
 */
export const updateWorkflowTransition = async (
  departmentId: string,
  workflowId: string,
  transitionId: string,
  body: WorkflowTransitionBody,
  etag: string,
): Promise<WorkflowTransitionConfig> => {
  const { data } = await pgRequest<WorkflowTransitionConfig>({
    method: "PATCH",
    url: pgPath(PG_ENDPOINT.ADMIN_WORKFLOW_TRANSITION, {
      departmentId,
      workflowId,
      transitionId,
    }),
    data: body,
    headers: ifMatch(etag),
  });
  return data;
};

/**
 * @param departmentId the department
 * @param workflowId the draft
 * @param transitionId the transition
 * @throws {HelpdeskApiError} 409 once the version is published
 */
export const deleteWorkflowTransition = async (
  departmentId: string,
  workflowId: string,
  transitionId: string,
): Promise<void> => {
  await pgRequest<unknown>({
    method: "DELETE",
    url: pgPath(PG_ENDPOINT.ADMIN_WORKFLOW_TRANSITION, {
      departmentId,
      workflowId,
      transitionId,
    }),
  });
};
