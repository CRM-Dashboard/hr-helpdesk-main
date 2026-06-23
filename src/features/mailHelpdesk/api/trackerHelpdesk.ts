import {
  appendAuthToFormData,
  END_POINTS,
  sapClientBase,
} from "@/services/sapClient";
import { TicketDetailData, TicketListData } from "../types/helpdeskDataTypes";
import axios from "axios";
import { CategoryItem, HRCategories } from "../types/HRCategoryType";
import {
  InternalNote,
  SnoozeRecord,
  TicketCollaborator,
} from "../types/collaboration";
import {
  LeaveCoverageEvent,
  SpocAvailability,
} from "../types/leaveCoverage";

export async function fetchHelpdeskEmailListData(
  loggedInUser: string,
): Promise<TicketListData[]> {
  try {
    const formData = new FormData();

    // Add required authentication and metadata fields
    appendAuthToFormData(formData);
    formData.append("sapid", loggedInUser); // "VISHALJ"

    const response = await sapClientBase.post<TicketListData[]>(
      END_POINTS.HELPDESK_EMAIL_LIST,
      // END_POINTS.HR_HELPDESK_LIST,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    // console.log("Response data ticket list:", response.data);

    const { data } = response;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Unexpected Email-List API response");
    }

    // console.log("Returning tracker data:", data[0]);
    return data;
  } catch (error: any) {
    console.error("API call failed:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    if (error.code === "ERR_NETWORK") {
      if (error.message.includes("CORS")) {
        throw new Error(
          "CORS Error: The server needs to allow cross-origin requests from your domain. Please contact the API administrator.",
        );
      } else if (error.response?.status === 401) {
        throw new Error(
          "Authentication failed: Please check your credentials in the API configuration.",
        );
      } else {
        throw new Error(
          "Network Error: Cannot connect to the server. Please check if the server is running and accessible.",
        );
      }
    }

    throw error;
  }
}

export async function fetchTicketDetailData(
  passedTicketId: number,
): Promise<TicketDetailData[]> {
  try {
    const formData = new FormData();

    // Add required authentication and metadata fields
    appendAuthToFormData(formData);
    formData.append("ticketId", String(passedTicketId));

    // const response = await axios.get(
    //   `http://115.124.113.252:8000/sap/bc/parking/hr_ticket_details?sap-client=250&ticketId=${passedTicketId}`
    // );

    const response = await sapClientBase.post<TicketDetailData>(
      END_POINTS.HELPDESK_TICKET_DETAIL,
      // END_POINTS.HR_TICKET_DETAIL,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    // console.log("Response data ticket detail list:", response.data);

    const { data } = response;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Unexpected Email-Detail API response");
    }

    return data;
  } catch (error) {
    console.log("error while getting ticket detail :", error);
  }
}

export async function assignMemberToTicketDetail(ticketDetail: any) {
  try {
    const formData = new FormData();

    // Add required authentication and metadata fields
    appendAuthToFormData(formData);
    formData.append("action", "ASSIGN");

    formData.append("data", JSON.stringify(ticketDetail));

    // console.log("assign detail data:", formData.get("data"));

    const response = await sapClientBase.post<any>(
      END_POINTS.HELPDESK_POST_TICKET_DETAIL,
      // END_POINTS.HR_POST_TICKET_DETAIL,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    // console.log("Response post assigned data ticket detail:", response);

    // const { data } = response;

    return response;
    // return data;
  } catch (error) {
    console.log("error while posting assigned detail :", error);
  }
}

export async function changeTicketStatusToRead(payload: any) {
  try {
    const formData = new FormData();

    // Add required authentication and metadata fields
    appendAuthToFormData(formData);
    formData.append("action", "READ");

    formData.append("data", JSON.stringify(payload));

    // console.log("assign detail data:", formData.get("data"));

    const response = await sapClientBase.post<any>(
      END_POINTS.HELPDESK_POST_TICKET_DETAIL,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    // console.log("Response post assigned data ticket detail:", response);

    return response;
  } catch (error) {
    console.log("error while posting assigned detail :", error);
  }
}

export async function updateTicketDetail(ticketDetail: any) {
  try {
    const formData = new FormData();

    // Add required authentication and metadata fields
    appendAuthToFormData(formData);
    formData.append("action", "UPDATE");

    formData.append("data", JSON.stringify(ticketDetail));

    // console.log("posted detail data:", formData.get("data"));

    const response = await sapClientBase.post<any>(
      END_POINTS.HELPDESK_POST_TICKET_DETAIL,
      // END_POINTS.HR_POST_TICKET_DETAIL,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );
    // console.log("Response post data detail:", response);

    return response;
  } catch (error) {
    console.log("error while posting ticket detail :", error);
  }
}

/**
 * Snooze a ticket (BRD 7.9). Pauses the OLA for the requested working hours.
 * Uses the shared action-based post endpoint. The backend action may not be
 * implemented yet; callers should handle rejection gracefully.
 */
export async function snoozeTicket(record: SnoozeRecord): Promise<any> {
  const formData = new FormData();
  appendAuthToFormData(formData);
  formData.append("action", "SNOOZE");
  formData.append("data", JSON.stringify(record));

  const response = await sapClientBase.post<any>(
    END_POINTS.HELPDESK_POST_TICKET_DETAIL,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response?.data;
}

/**
 * Add an internal collaborator to a ticket (BRD 7.10). The SPOC remains the
 * OLA owner; collaborators only participate in the internal sub-thread.
 */
export async function addTicketCollaborator(
  payload: TicketCollaborator,
): Promise<any> {
  const formData = new FormData();
  appendAuthToFormData(formData);
  formData.append("action", "ADD_COLLABORATOR");
  formData.append("data", JSON.stringify(payload));

  const response = await sapClientBase.post<any>(
    END_POINTS.HELPDESK_POST_TICKET_DETAIL,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response?.data;
}

/**
 * Fetch all SPOC availability / leave-coverage records.
 * Tolerates a few response shapes; returns a flat array.
 */
export async function fetchSpocAvailability(): Promise<SpocAvailability[]> {
  const formData = new FormData();
  appendAuthToFormData(formData);

  const response = await sapClientBase.post<any>(
    END_POINTS.SPOC_AVAILABILITY,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );

  const data = response?.data ?? {};
  const list =
    data.SpocAvailability ??
    data.availability ??
    (Array.isArray(data) ? data : []);
  return Array.isArray(list) ? (list as SpocAvailability[]) : [];
}

/** Create/update a SPOC availability (leave) record. */
export async function setSpocAvailability(
  record: SpocAvailability,
  action: "SET" | "UPDATE" = "SET",
): Promise<any> {
  const formData = new FormData();
  appendAuthToFormData(formData);
  formData.append("action", action);
  formData.append("data", JSON.stringify(record));

  const response = await sapClientBase.post<any>(
    END_POINTS.SPOC_AVAILABILITY_SAVE,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response?.data;
}

/** Clear a SPOC availability (leave) record. */
export async function clearSpocAvailability(
  record: SpocAvailability,
): Promise<any> {
  const formData = new FormData();
  appendAuthToFormData(formData);
  formData.append("action", "CLEAR");
  formData.append("data", JSON.stringify(record));

  const response = await sapClientBase.post<any>(
    END_POINTS.SPOC_AVAILABILITY_SAVE,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response?.data;
}

/**
 * Log a "Leave Coverage" event against a ticket's history (written when a
 * ticket is assigned to a SPOC who is on leave).
 */
export async function logLeaveCoverageEvent(
  event: LeaveCoverageEvent,
): Promise<any> {
  const formData = new FormData();
  appendAuthToFormData(formData);
  formData.append("action", "LEAVE_COVERAGE");
  formData.append("data", JSON.stringify(event));

  const response = await sapClientBase.post<any>(
    END_POINTS.HELPDESK_POST_TICKET_DETAIL,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response?.data;
}

/** Post an internal-only note to the collaboration sub-thread (BRD 7.10). */
export async function postInternalNote(note: InternalNote): Promise<any> {
  const formData = new FormData();
  appendAuthToFormData(formData);
  formData.append("action", "INTERNAL_NOTE");
  formData.append("data", JSON.stringify(note));

  const response = await sapClientBase.post<any>(
    END_POINTS.HELPDESK_POST_TICKET_DETAIL,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response?.data;
}

export async function getDepartmentCategoryList(): Promise<HRCategories> {
  try {
    const formData = new FormData();

    // Add required authentication and metadata fields
    appendAuthToFormData(formData);

    const response = await sapClientBase.post<HRCategories>(
      END_POINTS.HR_CATEGORY,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    // const response = await axios.get(
    //   "http://115.124.113.252:8000/sap/bc/parking/category?sap-client=250&sap-user=VISHALJ&sap-password=Winner@2005"
    // );

    return response.data;
  } catch (error) {
    console.error("Failed to get HR category info:", error);
    throw new Error(`Failed to fetch the HR category data: ${error.message}`);
  }
}

/**
 * Fetch the Category -> SubCategory -> SPOC -> TAT/ESC matrix as a flat list.
 * Tolerates both API response shapes ({ HRCategory } and { Category }).
 */
export async function fetchCategoryMappings(): Promise<CategoryItem[]> {
  const formData = new FormData();
  appendAuthToFormData(formData);

  const response = await sapClientBase.post<any>(END_POINTS.HR_CATEGORY, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  const data = response?.data ?? {};
  const list = data.HRCategory ?? data.Category ?? (Array.isArray(data) ? data : []);
  return Array.isArray(list) ? (list as CategoryItem[]) : [];
}

export type CategoryMappingAction = "CREATE" | "UPDATE" | "DELETE";

/**
 * Create/Update a category mapping. Uses the action-based FormData pattern
 * shared with the ticket-detail endpoints. The write endpoint may not exist
 * yet on the backend; callers should handle rejection gracefully.
 */
export async function saveCategoryMapping(
  item: CategoryItem,
  action: Exclude<CategoryMappingAction, "DELETE"> = "CREATE",
): Promise<any> {
  const formData = new FormData();
  appendAuthToFormData(formData);
  formData.append("action", action);
  formData.append("data", JSON.stringify(item));

  const response = await sapClientBase.post<any>(
    END_POINTS.HR_CATEGORY_SAVE,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return response?.data;
}

/**
 * Delete a category mapping identified by category + subCategory.
 */
export async function deleteCategoryMapping(item: CategoryItem): Promise<any> {
  const formData = new FormData();
  appendAuthToFormData(formData);
  formData.append("action", "DELETE");
  formData.append("data", JSON.stringify(item));

  const response = await sapClientBase.post<any>(
    END_POINTS.HR_CATEGORY_SAVE,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return response?.data;
}

export async function getAllDepartmentCategoryList(): Promise<any> {
  try {
    const formData = new FormData();

    // Add required authentication and metadata fields
    appendAuthToFormData(formData);

    const response = await sapClientBase.post<any>(
      END_POINTS.ALL_CATEGORY,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error("Failed to get HR category info:", error);
    throw new Error(`Failed to fetch the HR category data: ${error.message}`);
  }
}
