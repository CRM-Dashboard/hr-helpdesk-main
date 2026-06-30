import {
  appendAuthToFormData,
  END_POINTS,
  sapClientBase,
} from "@/services/sapClient";
import {
  CollaborationActivity,
  CollaborationData,
  CollaborationFormValues,
} from "../collaboration/types";

/**
 * The backend may return the three lookup lists either at the top level of the
 * response or nested inside `response[0]`. Normalise both shapes to a flat object.
 */
function unwrapDetailResponse(data: any): any {
  if (!data) return {};
  if (Array.isArray(data?.response)) return data.response[0] ?? {};
  if (Array.isArray(data)) return data[0] ?? {};
  return data;
}

/**
 * Fetch the collaboration lookups for a ticket: existing activities, the
 * department list and the assignable users list.
 */
export async function fetchCollaborationData(
  ticketId: string,
): Promise<CollaborationData> {
  const formData = new FormData();
  appendAuthToFormData(formData);
  formData.append("ticketId", String(ticketId));

  const { data } = await sapClientBase.post<any>(
    END_POINTS.GET_TICKET_DETAIL,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );

  const detail = unwrapDetailResponse(data);

  return {
    activitydata: Array.isArray(detail?.activitydata)
      ? (detail.activitydata as CollaborationActivity[])
      : [],
    deptdata: Array.isArray(detail?.deptdata) ? detail.deptdata : [],
    userdata: Array.isArray(detail?.userdata) ? detail.userdata : [],
  };
}

/**
 * Persist a new collaboration activity against the ticket. Extra metadata
 * (e.g. the sent email's message/conversation ids) can be merged into `extra`.
 */
export async function addCollaborator(
  ticketId: string,
  values: CollaborationFormValues,
  extra: Record<string, any> = {},
): Promise<any> {
  const formData = new FormData();
  appendAuthToFormData(formData);
  formData.append("ticketId", String(ticketId));
  formData.append(
    "data",
    JSON.stringify({
      ticket_id: String(ticketId),
      activity_des: values.activityDes,
      assigned: values.assigned,
      dept: values.dept,
      comments: values.comments,
      colab_mode: "Email",
      ...extra,
    }),
  );

  const { data } = await sapClientBase.post<any>(
    END_POINTS.CRM_ADD_COLLAB,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}
