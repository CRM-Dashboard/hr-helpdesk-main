/**
 * Routing rules, OLA policies and workflows.
 *
 * All three supersede rather than update, so a successful "save" returns a row
 * with a **new id**. Each mutation therefore invalidates its list rather than
 * patching the cache: a client holding the old id gets a 409 on its next write,
 * which is correct but not something to discover from a stale grid.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  createOlaPolicy,
  createRoutingRule,
  createWorkflow,
  createWorkflowState,
  createWorkflowTransition,
  createWorkflowVersion,
  deleteWorkflowState,
  deleteWorkflowTransition,
  getOlaPolicy,
  getWorkflow,
  listOlaPolicies,
  listRoutingGaps,
  listRoutingRules,
  listWorkflows,
  previewRouting,
  publishWorkflow,
  putOlaStages,
  retireOlaPolicy,
  retireRoutingRule,
  supersedeOlaPolicy,
  supersedeRoutingRule,
  updateWorkflowState,
  updateWorkflowTransition,
} from "../../api/pg";
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
import { adminKeys, helpdeskKeys } from "./queryKeys";

// --- routing rules ---------------------------------------------------------

/**
 * The rules in resolution order. Do not re-sort — the order **is** the answer to
 * "which rule wins".
 *
 * @param departmentId the department
 * @param filters scope, `userId`, superseded/inactive opt-ins
 * @param enabled skip until the screen is open
 * @returns the rules with names joined in
 */
export const useRoutingRules = (
  departmentId: string | null | undefined,
  filters?: RoutingRuleFilters,
  enabled = true,
): UseQueryResult<RoutingRuleRow[], Error> =>
  useQuery({
    queryKey: adminKeys.routingRules(departmentId ?? "", filters),
    queryFn: () => listRoutingRules(departmentId as string, filters),
    enabled: enabled && Boolean(departmentId),
  });

/**
 * Categories with no rule of their own, ranked by traffic.
 *
 * @param departmentId the department
 * @param enabled skip until the panel is open
 * @returns the gaps, most trafficked first
 */
export const useRoutingGaps = (
  departmentId: string | null | undefined,
  enabled = true,
): UseQueryResult<RoutingGapRow[], Error> =>
  useQuery({
    queryKey: adminKeys.routingGaps(departmentId ?? ""),
    queryFn: () => listRoutingGaps(departmentId as string),
    enabled: enabled && Boolean(departmentId),
  });

/**
 * "Who would get this ticket?", answered by the real resolver.
 *
 * Modelled as a query rather than a mutation even though the verb is POST: it
 * writes nothing, it is gated on `.read`, and a query gets caching and
 * deduplication — which the 60-per-minute admin limiter makes worth having when
 * this is wired to a live editor. **Debounce the `scope` you pass in** (250–400 ms).
 *
 * @param departmentId the department
 * @param scope the category/subcategory/priority a hypothetical ticket carries
 * @param enabled skip while the editor has nothing to preview
 * @returns the resolution, its `reason` and a `warning` written to be shown
 */
export const useRoutingPreview = (
  departmentId: string | null | undefined,
  scope: RoutingPreviewBody,
  enabled = true,
): UseQueryResult<RoutingPreviewResponse, Error> =>
  useQuery({
    queryKey: adminKeys.routingPreview(departmentId ?? "", scope),
    queryFn: () => previewRouting(departmentId as string, scope),
    enabled: enabled && Boolean(departmentId),
    staleTime: 30_000,
  });

/**
 * Invalidates the routing subtree and the readiness that depends on it.
 *
 * @param queryClient the client from `useQueryClient`
 * @param departmentId the department that was written
 */
const invalidateRouting = (
  queryClient: ReturnType<typeof useQueryClient>,
  departmentId: string,
): void => {
  queryClient.invalidateQueries({
    queryKey: adminKeys.routingRuleLists(departmentId),
  });
  queryClient.invalidateQueries({ queryKey: adminKeys.routingGaps(departmentId) });
  // NO_CATCHALL_ROUTING_RULE is a blocking check, and AI_CLASSIFICATION's
  // 409 turns on whether a catch-all exists.
  queryClient.invalidateQueries({ queryKey: adminKeys.readiness(departmentId) });
  queryClient.invalidateQueries({ queryKey: adminKeys.features(departmentId) });
};

/**
 * @returns a mutation taking `{ departmentId, body }`; on a 409 follow
 *   `details.supersede` rather than surfacing the error — a live rule already
 *   covers that exact scope and two rules there would tie
 */
export const useCreateRoutingRule = (): UseMutationResult<
  RoutingRuleRow,
  Error,
  { departmentId: string; body: CreateRoutingRuleBody }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, body }) => createRoutingRule(departmentId, body),
    onSuccess: (_row, { departmentId }) =>
      invalidateRouting(queryClient, departmentId),
  });
};

/**
 * The Save button on a routing rule.
 *
 * @returns a mutation taking `{ departmentId, ruleId, body, etag }`. The result
 *   is the **successor**, with a new id the client must adopt; unspecified fields
 *   carried forward, and cross-field rules were checked against the merged row
 */
export const useSupersedeRoutingRule = (): UseMutationResult<
  RoutingRuleRow,
  Error,
  {
    departmentId: string;
    ruleId: string;
    body: SupersedeRoutingRuleBody;
    etag: string;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, ruleId, body, etag }) =>
      supersedeRoutingRule(departmentId, ruleId, body, etag),
    onSuccess: (_row, { departmentId }) =>
      invalidateRouting(queryClient, departmentId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, ruleId, etag }`; a 409 on the only
 *   catch-all is the guard doing its job — disable the control rather than
 *   letting the user find out
 */
export const useRetireRoutingRule = (): UseMutationResult<
  RoutingRuleRow,
  Error,
  { departmentId: string; ruleId: string; etag: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, ruleId, etag }) =>
      retireRoutingRule(departmentId, ruleId, etag),
    onSuccess: (_row, { departmentId }) =>
      invalidateRouting(queryClient, departmentId),
  });
};

// --- OLA policies ----------------------------------------------------------

/**
 * @param departmentId the department
 * @param filters scope and the superseded/inactive opt-ins
 * @param enabled skip until the screen is open
 * @returns the policies in resolution order
 */
export const useOlaPolicies = (
  departmentId: string | null | undefined,
  filters?: OlaPolicyFilters,
  enabled = true,
): UseQueryResult<OlaPolicyRow[], Error> =>
  useQuery({
    queryKey: adminKeys.olaPolicies(departmentId ?? "", filters),
    queryFn: () => listOlaPolicies(departmentId as string, filters),
    enabled: enabled && Boolean(departmentId),
  });

/**
 * One policy with its ladder.
 *
 * @param departmentId the department
 * @param policyId the policy, or null while nothing is open
 * @returns the policy, its stages, `live_instances` and `stages_editable` — the
 *   last two decide between an editable ladder and a Supersede button
 */
export const useOlaPolicy = (
  departmentId: string | null | undefined,
  policyId: string | null | undefined,
): UseQueryResult<OlaPolicyRow, Error> =>
  useQuery({
    queryKey: adminKeys.olaPolicy(departmentId ?? "", policyId ?? ""),
    queryFn: () => getOlaPolicy(departmentId as string, policyId as string),
    enabled: Boolean(departmentId) && Boolean(policyId),
  });

/**
 * Invalidates the OLA subtree.
 *
 * @param queryClient the client from `useQueryClient`
 * @param departmentId the department that was written
 */
const invalidateOla = (
  queryClient: ReturnType<typeof useQueryClient>,
  departmentId: string,
): void => {
  queryClient.invalidateQueries({ queryKey: adminKeys.olaPolicyLists(departmentId) });
  // NO_OLA_POLICY is a readiness warning.
  queryClient.invalidateQueries({ queryKey: adminKeys.readiness(departmentId) });
};

/**
 * Creates a policy — deliberately with no ladder. Add stages as a second step.
 *
 * @returns a mutation taking `{ departmentId, body }`
 */
export const useCreateOlaPolicy = (): UseMutationResult<
  OlaPolicyRow,
  Error,
  { departmentId: string; body: CreateOlaPolicyBody }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, body }) => createOlaPolicy(departmentId, body),
    onSuccess: (_row, { departmentId }) => invalidateOla(queryClient, departmentId),
  });
};

/**
 * Replaces the whole escalation ladder.
 *
 * @returns a mutation taking `{ departmentId, policyId, body }`; a 409 means
 *   clocks are running against the policy — offer Supersede, which clones the
 *   ladder onto an immediately editable successor
 */
export const usePutOlaStages = (): UseMutationResult<
  OlaStageRow[],
  Error,
  { departmentId: string; policyId: string; body: PutOlaStagesBody }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, policyId, body }) =>
      putOlaStages(departmentId, policyId, body),
    onSuccess: (_rows, { departmentId, policyId }) => {
      invalidateOla(queryClient, departmentId);
      queryClient.invalidateQueries({
        queryKey: adminKeys.olaPolicy(departmentId, policyId),
      });
    },
  });
};

/**
 * @returns a mutation taking `{ departmentId, policyId, body, etag }`; the
 *   successor has a new id, `live_instances: 0` and an editable ladder, cloned
 *   from the incumbent unless `stages` was supplied
 */
export const useSupersedeOlaPolicy = (): UseMutationResult<
  OlaPolicyRow,
  Error,
  {
    departmentId: string;
    policyId: string;
    body: SupersedeOlaPolicyBody;
    etag: string;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, policyId, body, etag }) =>
      supersedeOlaPolicy(departmentId, policyId, body, etag),
    onSuccess: (_row, { departmentId }) => invalidateOla(queryClient, departmentId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, policyId, etag }`; the result's
 *   `warning` reports clocks that keep running under the retired policy
 */
export const useRetireOlaPolicy = (): UseMutationResult<
  OlaPolicyRow,
  Error,
  { departmentId: string; policyId: string; etag: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, policyId, etag }) =>
      retireOlaPolicy(departmentId, policyId, etag),
    onSuccess: (_row, { departmentId }) => invalidateOla(queryClient, departmentId),
  });
};

// --- workflows -------------------------------------------------------------

/**
 * Every version, newest first. Branch on `is_draft` / `is_live`, never the dates.
 *
 * @param departmentId the department
 * @param enabled skip until the screen is open
 * @returns the version history
 */
export const useWorkflows = (
  departmentId: string | null | undefined,
  enabled = true,
): UseQueryResult<WorkflowRow[], Error> =>
  useQuery({
    queryKey: adminKeys.workflows(departmentId ?? ""),
    queryFn: () => listWorkflows(departmentId as string),
    enabled: enabled && Boolean(departmentId),
  });

/**
 * One version whole.
 *
 * @param departmentId the department
 * @param workflowId the version, or null while nothing is open
 * @returns states, transitions and the `validation` block the Publish button
 *   should be rendered from
 */
export const useWorkflow = (
  departmentId: string | null | undefined,
  workflowId: string | null | undefined,
): UseQueryResult<WorkflowRow, Error> =>
  useQuery({
    queryKey: adminKeys.workflow(departmentId ?? "", workflowId ?? ""),
    queryFn: () => getWorkflow(departmentId as string, workflowId as string),
    enabled: Boolean(departmentId) && Boolean(workflowId),
  });

/**
 * Invalidates a workflow version and the list it belongs to.
 *
 * @param queryClient the client from `useQueryClient`
 * @param departmentId the department that was written
 * @param workflowId the version that was written
 */
const invalidateWorkflow = (
  queryClient: ReturnType<typeof useQueryClient>,
  departmentId: string,
  workflowId?: string,
): void => {
  queryClient.invalidateQueries({ queryKey: adminKeys.workflows(departmentId) });
  if (workflowId) {
    queryClient.invalidateQueries({
      queryKey: adminKeys.workflow(departmentId, workflowId),
    });
  }
  queryClient.invalidateQueries({ queryKey: adminKeys.readiness(departmentId) });
};

/**
 * @returns a mutation taking `{ departmentId, body }`
 */
export const useCreateWorkflow = (): UseMutationResult<
  WorkflowRow,
  Error,
  { departmentId: string; body: CreateWorkflowBody }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, body }) => createWorkflow(departmentId, body),
    onSuccess: (_row, { departmentId }) =>
      invalidateWorkflow(queryClient, departmentId),
  });
};

/**
 * A draft copy — the only way to edit a published workflow.
 *
 * @returns a mutation taking `{ departmentId, workflowId, body }`; a 409 means a
 *   draft is already open for this code
 */
export const useCreateWorkflowVersion = (): UseMutationResult<
  WorkflowRow,
  Error,
  {
    departmentId: string;
    workflowId: string;
    body?: CreateWorkflowVersionBody;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, workflowId, body }) =>
      createWorkflowVersion(departmentId, workflowId, body),
    onSuccess: (_row, { departmentId }) =>
      invalidateWorkflow(queryClient, departmentId),
  });
};

/**
 * Publishes a draft.
 *
 * Also drops the cached `/auth/me`: publishing changes the department's state
 * vocabulary, and this session is holding the previous one. Other agents stay one
 * refresh behind — the response's `warning` says so, and it is worth showing.
 *
 * @returns a mutation taking `{ departmentId, workflowId, body, etag }`; a 409
 *   carries `details.checks`, the same list `useWorkflow` already rendered
 */
export const usePublishWorkflow = (): UseMutationResult<
  WorkflowRow,
  Error,
  {
    departmentId: string;
    workflowId: string;
    body: PublishWorkflowBody;
    etag: string;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, workflowId, body, etag }) =>
      publishWorkflow(departmentId, workflowId, body, etag),
    onSuccess: (_row, { departmentId, workflowId }) => {
      invalidateWorkflow(queryClient, departmentId, workflowId);
      // `/auth/me` is the only source of the state vocabulary, and it just changed.
      queryClient.invalidateQueries({ queryKey: helpdeskKeys.me() });
    },
  });
};

/**
 * @returns a mutation taking `{ departmentId, workflowId, body }`; 409 once the
 *   version is published — create a new version instead
 */
export const useCreateWorkflowState = (): UseMutationResult<
  WorkflowStateRow,
  Error,
  { departmentId: string; workflowId: string; body: WorkflowStateBody }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, workflowId, body }) =>
      createWorkflowState(departmentId, workflowId, body),
    onSuccess: (_row, { departmentId, workflowId }) =>
      invalidateWorkflow(queryClient, departmentId, workflowId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, workflowId, stateId, body, etag }`;
 *   `code` is refused, and half a coherence pair is accepted because the server
 *   checks it against the stored half
 */
export const useUpdateWorkflowState = (): UseMutationResult<
  WorkflowStateRow,
  Error,
  {
    departmentId: string;
    workflowId: string;
    stateId: string;
    body: WorkflowStateBody;
    etag: string;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, workflowId, stateId, body, etag }) =>
      updateWorkflowState(departmentId, workflowId, stateId, body, etag),
    onSuccess: (_row, { departmentId, workflowId }) =>
      invalidateWorkflow(queryClient, departmentId, workflowId),
  });
};

/**
 * A genuine hard delete — legitimate because a draft has governed no ticket.
 *
 * @returns a mutation taking `{ departmentId, workflowId, stateId }`; a 409 names
 *   the transitions still referencing the state
 */
export const useDeleteWorkflowState = (): UseMutationResult<
  void,
  Error,
  { departmentId: string; workflowId: string; stateId: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, workflowId, stateId }) =>
      deleteWorkflowState(departmentId, workflowId, stateId),
    onSuccess: (_v, { departmentId, workflowId }) =>
      invalidateWorkflow(queryClient, departmentId, workflowId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, workflowId, body }`;
 *   `fromStateId: null` is the creation transition
 */
export const useCreateWorkflowTransition = (): UseMutationResult<
  WorkflowTransitionConfig,
  Error,
  { departmentId: string; workflowId: string; body: WorkflowTransitionBody }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, workflowId, body }) =>
      createWorkflowTransition(departmentId, workflowId, body),
    onSuccess: (_row, { departmentId, workflowId }) =>
      invalidateWorkflow(queryClient, departmentId, workflowId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, workflowId, transitionId, body, etag }`;
 *   the endpoints and `code` are refused — delete and re-add the edge you meant
 */
export const useUpdateWorkflowTransition = (): UseMutationResult<
  WorkflowTransitionConfig,
  Error,
  {
    departmentId: string;
    workflowId: string;
    transitionId: string;
    body: WorkflowTransitionBody;
    etag: string;
  }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, workflowId, transitionId, body, etag }) =>
      updateWorkflowTransition(departmentId, workflowId, transitionId, body, etag),
    onSuccess: (_row, { departmentId, workflowId }) =>
      invalidateWorkflow(queryClient, departmentId, workflowId),
  });
};

/**
 * @returns a mutation taking `{ departmentId, workflowId, transitionId }`
 */
export const useDeleteWorkflowTransition = (): UseMutationResult<
  void,
  Error,
  { departmentId: string; workflowId: string; transitionId: string }
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, workflowId, transitionId }) =>
      deleteWorkflowTransition(departmentId, workflowId, transitionId),
    onSuccess: (_v, { departmentId, workflowId }) =>
      invalidateWorkflow(queryClient, departmentId, workflowId),
  });
};
