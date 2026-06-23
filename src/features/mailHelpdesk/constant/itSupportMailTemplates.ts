export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  category: string;
}

export const DEFAULT_IT_TEMPLATES: EmailTemplate[] = [
  // IT Support Category
  {
    id: "1",
    name: "Account Unblock Confirmation",
    subject: "Your Account Has Been Unblocked",
    content:
      "<p>Dear [User Name],</p><p>Your user ID [User ID] has been successfully unblocked.</p><p>You should now be able to log in without issues. If you still face any problems, please reach out to the IT Support team.</p><p>Regards,<br/>IT Support Team</p>",
    category: "IT Support",
  },
  {
    id: "2",
    name: "Password Change / Reset Confirmation",
    subject: "Password Reset for Your Account",
    content:
      "<p>Dear [User Name],</p><p>We have successfully reset the password for your user ID [User ID].</p><p>You can now log in using the temporary password provided: <strong>[Temporary Password]</strong>.</p><p>For security, please change your password immediately after login.</p><p>If you did not request this change, contact IT Support immediately.</p><p>Regards,<br/>IT Support Team</p>",
    category: "IT Support",
  },
  {
    id: "3",
    name: "Wi-Fi Issue Resolved",
    subject: "Wi-Fi Issue Resolution Update",
    content:
      "<p>Dear [User Name],</p><p>The reported Wi-Fi issue in your location ([Location/Department]) has been resolved.</p><p>You should now be able to connect without interruption.</p><p>If the issue persists, please reply to this email or raise a new ticket.</p><p>Regards,<br/>IT Support Team</p>",
    category: "IT Support",
  },
  {
    id: "4",
    name: "SAP Authorization Granted",
    subject: "SAP Access Granted for [Role/Transaction]",
    content:
      "<p>Dear [User Name],</p><p>Your SAP authorization request has been approved.</p><p>You now have access to the requested role/transaction: [Role/Transaction Name].</p><p>Please log in to confirm you can perform the required actions.</p><p>If you face any access issues, raise a ticket with IT Support.</p><p>Regards,<br/>IT Support Team</p>",
    category: "IT Support",
  },
  {
    id: "5",
    name: "Ticket Acknowledgement",
    subject: "Support Ticket #[Ticket ID] Acknowledgement",
    content:
      "<p>Dear [User Name],</p><p>We have received your support request with Ticket ID #[Ticket ID].</p><p>Our IT Support team is reviewing the issue and will get back to you shortly with an update.</p><p>Thank you for reaching out to us.</p><p>Best regards,<br/>IT Support Team</p>",
    category: "IT Support",
  },
  {
    id: "6",
    name: "Ticket Resolution",
    subject: "Support Ticket #[Ticket ID] Resolved",
    content:
      "<p>Dear [User Name],</p><p>Your reported issue (Ticket #[Ticket ID]) has been resolved.</p><p>Resolution Summary:<br/>[Brief Resolution Summary]</p><p>If the issue persists, please reply to this email or reopen the ticket.</p><p>Thank you for your patience.</p><p>Regards,<br/>IT Support Team</p>",
    category: "IT Support",
  },
  {
    id: "7",
    name: "Pending User Action",
    subject: "Action Required: Support Ticket #[Ticket ID]",
    content:
      "<p>Dear [User Name],</p><p>We are waiting for your input to proceed with Ticket #[Ticket ID].</p><p>Please provide the following details:<br/>[Required Details]</p><p>If we do not receive a response within [X] days, we will close the ticket.</p><p>Regards,<br/>IT Support Team</p>",
    category: "IT Support",
  },
  {
    id: "8",
    name: "Password Reset Instructions",
    subject: "Password Reset Request",
    content:
      "<p>Dear [User Name],</p><p>We received a request to reset your password.</p><p>You can reset your password using the following link: <a href='[Reset Link]'>Reset Password</a></p><p>If you did not request this change, please contact IT Support immediately.</p><p>Best regards,<br/>IT Support Team</p>",
    category: "IT Support",
  },
  {
    id: "9",
    name: "System Maintenance Notification",
    subject: "Planned Maintenance: [System/Application Name]",
    content:
      "<p>Dear All,</p><p>This is to inform you that [System/Application Name] will undergo scheduled maintenance on [Date] from [Start Time] to [End Time].</p><p>During this period, the system may be unavailable.</p><p>We appreciate your understanding and apologize for any inconvenience caused.</p><p>Regards,<br/>IT Support Team</p>",
    category: "IT Support",
  },
  {
    id: "10",
    name: "Incident Notification",
    subject: "Incident Alert: [System/Application Name]",
    content:
      "<p>Dear All,</p><p>We are aware of an issue affecting [System/Application Name].</p><p>Our team is actively working to resolve the issue and will provide updates as soon as possible.</p><p>We apologize for the inconvenience and appreciate your patience.</p><p>Regards,<br/>IT Support Team</p>",
    category: "IT Support",
  },
  {
    id: "11",
    name: "System Restored Notification",
    subject: "System Restored: [System/Application Name]",
    content:
      "<p>Dear All,</p><p>The issue affecting [System/Application Name] has been resolved and the system is now fully operational.</p><p>We appreciate your patience during the downtime.</p><p>Regards,<br/>IT Support Team</p>",
    category: "IT Support",
  },
  {
    id: "12",
    name: "Knowledge Base Article",
    subject: "Guide: [How-To/Procedure Title]",
    content:
      "<p>Dear Team,</p><p>Please find below the steps to [Task/Procedure]:</p><ol><li>[Step 1]</li><li>[Step 2]</li><li>[Step 3]</li></ol><p>For more details, visit our Knowledge Base: [KB Link]</p><p>Regards,<br/>IT Support Team</p>",
    category: "IT Support",
  },
  {
    id: "13",
    name: "Ticket Closure Notice",
    subject: "Ticket #[Ticket ID] Closed",
    content:
      "<p>Dear [User Name],</p><p>Your support ticket #[Ticket ID] has been closed as the issue has been resolved.</p><p>If you face this issue again, please raise a new ticket or reply to this email to reopen the case.</p><p>Thank you for working with us.</p><p>Regards,<br/>IT Support Team</p>",
    category: "IT Support",
  },
  {
    id: "14",
    name: "Follow-Up Survey",
    subject: "How Was Your IT Support Experience?",
    content:
      "<p>Dear [User Name],</p><p>We recently resolved your support ticket #[Ticket ID].</p><p>We would appreciate it if you could take a minute to provide feedback on your experience: <a href='[Survey Link]'>Take Survey</a></p><p>Your feedback helps us improve our support services.</p><p>Thank you,<br/>IT Support Team</p>",
    category: "IT Support",
  },
];
