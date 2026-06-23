import axios from "axios";
import { toast } from "@/hooks/use-toast";

export const sapClientBase = axios.create({
  baseURL: "https://gera-crm-server-dev.azurewebsites.net",
  headers: {
    "Content-Type": "application/json",
  },
});

export type SapAuth = { userName: string; passWord: string };

export const getAuthCredentials = (): SapAuth | null => {
  try {
    const raw = sessionStorage.getItem("helpdesk-cred");
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

export const resolveCredentials = (): SapAuth => {
  // if (USE_STATIC_SAP_CREDS) return getStaticCredentials();
  return getAuthCredentials();
  // return getAuthCredentials() ?? getStaticCredentials();
};

export const appendAuthToFormData = (formData: FormData): void => {
  const { userName, passWord } = resolveCredentials();
  formData.append("userName", userName);
  formData.append("passWord", passWord);
};

// export const mockAuthCredential = () => {
//   const credToStore = { userName: SAP_USER, passWord: SAP_PASS };
//   sessionStorage.setItem("cred", JSON.stringify(credToStore));
// };

const DEV_URLS = {
  base: "https://gera-crm-server-dev.azurewebsites.net",
};

const PROD_URLS = {
  base: "https://gera-crm-server.azurewebsites.net",
};

const ENV_URLS = DEV_URLS; // PROD_URLS; // DEV_URLS; //PROD_URLS; //  DEV_URLS; // PROD_URLS

export const RESOLVED_BACKEND_BASE_URL = ENV_URLS.base;

// Reconfigure axios clients to use resolved URLs
sapClientBase.defaults.baseURL = RESOLVED_BACKEND_BASE_URL;

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
  // Leave Coverage / SPOC availability (plausible names; graceful fallback).
  SPOC_AVAILABILITY: "/api/hr/get-spoc-availability",
  SPOC_AVAILABILITY_SAVE: "/api/hr/post-spoc-availability",
  HR_HELPDESK_LIST: "/api/hr/get-hr-email-list",
  HR_TICKET_DETAIL: "/api/hr/get-hr-ticket-details",
  GET_EMPLOYEE_INFO: "/api/hr/get-parking-employee",
  HR_POST_TICKET_DETAIL: "/api/hr/post-hr-ticket-details",
  ALL_CATEGORY: "/api/it-tracker/category",
  HELPDESK_EMAIL_LIST: "/api/it-tracker/get-ticket-list",
  HELPDESK_TICKET_DETAIL: "/api/it-tracker/get-ticket-details",
  HELPDESK_POST_TICKET_DETAIL: "/api/it-tracker/post-ticket-details",
  HELPDESK_GET_TICKET_LIST: "/api/it-tracker/get-email-list",
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
        sessionStorage.removeItem("gera-user");
        sessionStorage.removeItem("roles");
        sessionStorage.removeItem("helpdesk-cred");

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
