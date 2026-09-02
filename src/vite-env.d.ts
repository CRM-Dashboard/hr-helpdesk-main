/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Host the helpdesk API is mounted on, e.g. "http://localhost:5000". */
  readonly VITE_API_BASE_URL?: string;
  /** Overrides the interim `x-user-email` identity in development. */
  readonly VITE_HELPDESK_USER_EMAIL?: string;
  /**
   * Support mailbox CC'd on collaboration mail, for a department whose
   * `support_email` is unset or unreadable. Inbound replies route through it.
   */
  readonly VITE_HELPDESK_SUPPORT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
