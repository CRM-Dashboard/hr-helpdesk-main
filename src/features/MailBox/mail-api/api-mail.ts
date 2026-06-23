import {
  appendAuthToFormData,
  END_POINTS,
  sapClientBase,
} from "@/services/sapClient";

export interface ticketDetailMailBox {
  TICKET_ID: string;
  ID: string;
  TICKET_DESC: string;
  CATEGORY: string;
  SUB_CATEGORY: string;
  STATUS: string;
  STATUS_TXT: string;
  PRIORITY: string;
  ASSIGNED: string;
  ASSIGNED_TO: string;
  PLAN_START_DT: string;
  PLAN_END_DT: string;
  PLAN_DAYS: number;
  START_DT: string;
  END_DT: string;
  ACT_DAYS: number;
  REMARK: string;
  ERDAT: string;
  UZEIT: string;
  CREATED_DATE_TIME: string;
  HAS_ATTACHMENTS: string;
  BODY_PREVIEW: string;
  CONVERSATION_ID: string;
  SENDER: string;
  SUBJECT: string;
  TRANSPORT_ID: string;
}

export const getAllTicketDetail = async (
  conversationIds: { conversation_id: string }[],
): Promise<ticketDetailMailBox[]> => {
  if (!conversationIds || conversationIds.length === 0) return [];

  try {
    const formData = new FormData();
    appendAuthToFormData(formData);
    formData.append("data", JSON.stringify(conversationIds));

    const response = await sapClientBase.post(
      END_POINTS.HELPDESK_GET_TICKET_LIST,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    return response.data;
  } catch (error) {
    throw new Error(error.message);
  }
};
