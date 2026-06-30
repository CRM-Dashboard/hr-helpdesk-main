import axios from "axios";
import { toast } from "@/hooks/use-toast";
import { STORAGE_KEY } from "@/constant";

// export const base_URL = `http://localhost:5000`;

export const base_URL = `https://gera-crm-server-dev.azurewebsites.net`;

//export const base_URL = `https://gera-crm-server.azurewebsites.net`;

export const sapClientBase = axios.create({
  baseURL: base_URL,
});

export type SapAuth = { userName: string; passWord: string };

export const getAuthCredentials = (): SapAuth | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY.CredentialSecret);
    if (!raw) return null;
    const cred = JSON.parse(raw);
    const userName = cred?.userName;
    const passWord = cred?.passWord;
    if (!userName || !passWord) return null;
    return { userName, passWord };
  } catch {
    return null;
  }
};

export const appendAuthToFormData = (formData: FormData): void => {
  const { userName, passWord } = getAuthCredentials();
  formData.append("userName", userName);
  formData.append("passWord", passWord);
};

/**
 * END POINTS: object storing all end points
 *
 * @returns object (object containing all the project end points in a key value pair)
 */
export const END_POINTS = {
  IN_LINE_EMAIL: "/api/graph/fetch-inline-email",
  GET_TICKET_DETAIL: "/api/ticket/get-ticket-details",
  GET_TOKEN: "/api/ticket/get-token",
  HR_CATEGORY: "/api/hr/get-catgegory",
  // Write endpoint for the Category/SPOC/OLA admin config.
  // NOTE: plausible name mirroring the post-* endpoints; swap to the real
  // backend route once available. UI degrades gracefully if it 404s.
  HR_CATEGORY_SAVE: "/api/hr/post-category",
  HR_HELPDESK_LIST: "/api/hr/get-hr-email-list",
  HR_TICKET_DETAIL: "/api/hr/get-hr-ticket-details",
  GET_EMPLOYEE_INFO: "/api/hr/get-parking-employee",
  HR_POST_TICKET_DETAIL: "/api/hr/post-hr-ticket-details",
  ALL_CATEGORY: "/api/it-tracker/category",
  HELPDESK_EMAIL_LIST: "/api/it-tracker/get-ticket-list",
  HELPDESK_TICKET_DETAIL: "/api/it-tracker/get-ticket-details",
  HELPDESK_POST_TICKET_DETAIL: "/api/it-tracker/post-ticket-details",
  HELPDESK_GET_TICKET_LIST: "/api/it-tracker/get-email-list",
  // Out of Office
  CRM_OOO_GET: "/api/hr/get-hr-ooo",
  CRM_OOO_POST: "/api/hr/post-hr-ooo",
  CRM_OOO_DELETE: "/api/hr/delete-hr-ooo",
  // collab
  CRM_ADD_COLLAB: "/api/ticket/add-collabrator",
  CRM_TASK_COLLAB_DETAIL: "/api/ticket/get-tasks-details",
  // Ticket Actions
  GET_TICKET_ACTIONS: "/api/hr/get-ticket-action",
  POST_TICKET_ACTIONS: "/api/hr/post-ticket-action",
};

/**
 * Setup 401 interceptor for axios clients
 * When a 401 error occurs, clear session and redirect to login
 */
const setup401Interceptor = (axiosInstance: any) => {
  axiosInstance.interceptors.response.use(
    (response: any) => response,
    (error: any) => {
      if (error.response && error.response.status === 401) {
        // Clear all session storage
        sessionStorage.removeItem(STORAGE_KEY.CredUser);
        sessionStorage.removeItem(STORAGE_KEY.CredRoles);
        sessionStorage.removeItem(STORAGE_KEY.CredentialSecret);

        // Show toast notification
        toast({
          title: "Session Expired",
          description: "Your session has expired. Please login again.",
          variant: "destructive",
        });

        // Redirect to login page
        window.location.href = "/helpdesk";
      }
      return Promise.reject(error);
    },
  );
};

// Apply 401 interceptor to all axios clients
setup401Interceptor(sapClientBase);
