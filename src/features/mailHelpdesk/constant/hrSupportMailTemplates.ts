export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  category: string;
}

export const DEFAULT_HR_TEMPLATES: EmailTemplate[] = [
  // ===============================
  // Talent Acquisition
  // ===============================
  {
    id: "HR-1",
    name: "Employee Referral Acknowledgement",
    subject: "Acknowledgement: Employee Referral Received",
    content: `
      <p>Dear [Employee Name],</p>
      <p>We have received your referral for the position of [Position Name].</p>
      <p>Our Talent Acquisition team will review the candidate’s profile and reach out if shortlisted.</p>
      <p>Thank you for helping us grow our team!</p>
      <p>Regards,<br/>Talent Acquisition Team</p>
    `,
    category: "Talent Acquisition",
  },
  {
    id: "HR-2",
    name: "Internal Job Posting Confirmation",
    subject: "Application Received: [Job Title]",
    content: `
      <p>Dear [Employee Name],</p>
      <p>Your application for the internal job posting [Job Title] has been received successfully.</p>
      <p>Our team will review your application and get back to you with the next steps.</p>
      <p>Regards,<br/>Talent Acquisition Team</p>
    `,
    category: "Talent Acquisition",
  },

  // ===============================
  // Learning & Development
  // ===============================
  {
    id: "HR-3",
    name: "Training Enrollment Confirmation",
    subject: "Enrollment Confirmed: [Training Name]",
    content: `
      <p>Dear [Employee Name],</p>
      <p>You have been successfully enrolled in the training session: <strong>[Training Name]</strong> scheduled on [Date].</p>
      <p>For any queries, please contact the Learning & Development team.</p>
      <p>Regards,<br/>L&D Team</p>
    `,
    category: "Learning & Development",
  },
  {
    id: "HR-4",
    name: "Predictive Index Assessment Invitation",
    subject: "Invitation: Predictive Index Assessment",
    content: `
      <p>Dear [Employee Name],</p>
      <p>You are requested to complete your Predictive Index assessment using the link below:</p>
      <p><a href='[Assessment Link]'>Start Assessment</a></p>
      <p>Please complete it by [Deadline Date].</p>
      <p>Regards,<br/>L&D Team</p>
    `,
    category: "Learning & Development",
  },
  {
    id: "HR-5",
    name: "Training Completion Appreciation",
    subject: "Congratulations on Completing [Training Name]",
    content: `
      <p>Dear [Employee Name],</p>
      <p>Congratulations on successfully completing the <strong>[Training Name]</strong> program!</p>
      <p>We encourage you to apply these learnings in your daily work and share feedback with the L&D team.</p>
      <p>Best regards,<br/>Learning & Development</p>
    `,
    category: "Learning & Development",
  },
  {
    id: "HR-6",
    name: "LinkedIn Learning Access Granted",
    subject: "Access Granted: LinkedIn Learning Platform",
    content: `
      <p>Dear [Employee Name],</p>
      <p>Your access to <strong>LinkedIn Learning</strong> has been activated.</p>
      <p>You can now explore and complete professional courses at your convenience: <a href='[Learning Portal Link]'>Start Learning</a></p>
      <p>Happy learning!<br/>L&D Team</p>
    `,
    category: "Learning & Development",
  },

  // ===============================
  // HR Operations
  // ===============================
  {
    id: "HR-7",
    name: "Salary Query Acknowledgement",
    subject: "Salary Query Received: [Request ID]",
    content: `
      <p>Dear [Employee Name],</p>
      <p>We have received your query regarding your salary for [Month/Year].</p>
      <p>Our HR Operations team will review the concern and get back to you shortly.</p>
      <p>Regards,<br/>HR Operations Team</p>
    `,
    category: "HR Operations",
  },
  {
    id: "HR-8",
    name: "HR Letter Issuance Confirmation",
    subject: "HR Letter Issued: [Letter Type]",
    content: `
      <p>Dear [Employee Name],</p>
      <p>Your requested HR letter ([Letter Type]) has been issued.</p>
      <p>You can download it from the SuccessFactors portal or collect it from the HR desk.</p>
      <p>Regards,<br/>HR Operations Team</p>
    `,
    category: "HR Operations",
  },
  {
    id: "HR-9",
    name: "Leave Request Acknowledgement",
    subject: "Leave Application Received",
    content: `
      <p>Dear [Employee Name],</p>
      <p>Your leave request for the period [From Date] to [To Date] has been received.</p>
      <p>You will be notified once it is approved or rejected by your reporting manager.</p>
      <p>Regards,<br/>HR Operations Team</p>
    `,
    category: "HR Operations",
  },
  {
    id: "HR-10",
    name: "HR Master Data Update Confirmation",
    subject: "HR Master Data Updated",
    content: `
      <p>Dear [Employee Name],</p>
      <p>Your HR master data update request ([Field Name]) has been successfully processed.</p>
      <p>Updated details will reflect in SuccessFactors shortly.</p>
      <p>Regards,<br/>HR Operations Team</p>
    `,
    category: "HR Operations",
  },

  // ===============================
  // Talent Management
  // ===============================
  {
    id: "HR-11",
    name: "New Joinee Welcome Email",
    subject: "Welcome to [Company Name]!",
    content: `
      <p>Dear [Employee Name],</p>
      <p>Welcome to <strong>[Company Name]</strong>! We’re thrilled to have you on board.</p>
      <p>Please complete your joining formalities as per the checklist shared earlier.</p>
      <p>Wishing you all the best in your new journey!</p>
      <p>Regards,<br/>Talent Management Team</p>
    `,
    category: "Talent Management",
  },
  {
    id: "HR-12",
    name: "Mediclaim Enrollment Confirmation",
    subject: "Mediclaim Enrollment Successful",
    content: `
      <p>Dear [Employee Name],</p>
      <p>Your Mediclaim and Insurance enrollment has been successfully completed.</p>
      <p>Policy Number: [Policy Number]<br/>Effective Date: [Start Date]</p>
      <p>For any assistance, contact [Insurance Contact Person].</p>
      <p>Regards,<br/>HR - Talent Management</p>
    `,
    category: "Talent Management",
  },
  {
    id: "HR-13",
    name: "Employee Counselling Support Offer",
    subject: "Confidential Counselling Support Available",
    content: `
      <p>Dear [Employee Name],</p>
      <p>We understand that work and personal life can be challenging at times.</p>
      <p>Our <strong>Employee Counselling Support</strong> service is available to you confidentially.</p>
      <p>To book a session, contact [Counsellor Name] at [Email/Phone].</p>
      <p>Regards,<br/>HR - Talent Management</p>
    `,
    category: "Talent Management",
  },

  // ===============================
  // Administration
  // ===============================
  {
    id: "HR-14",
    name: "Visiting Card Request Acknowledgement",
    subject: "Visiting Card Request Received",
    content: `
      <p>Dear [Employee Name],</p>
      <p>Your request for a visiting card has been received.</p>
      <p>The Admin team will process the request and notify you once it is ready for collection.</p>
      <p>Regards,<br/>Administration Team</p>
    `,
    category: "Administration",
  },
  {
    id: "HR-15",
    name: "Duplicate ID Card Issuance",
    subject: "Duplicate ID Card Issued",
    content: `
      <p>Dear [Employee Name],</p>
      <p>Your duplicate ID card has been issued successfully.</p>
      <p>Please collect it from the Admin department at [Location].</p>
      <p>Regards,<br/>Administration Team</p>
    `,
    category: "Administration",
  },
  {
    id: "HR-16",
    name: "Housekeeping Request Update",
    subject: "Housekeeping Request [Request ID] Resolved",
    content: `
      <p>Dear [Employee Name],</p>
      <p>Your housekeeping support request ([Request ID]) has been resolved.</p>
      <p>If you face further issues, please raise a new request.</p>
      <p>Regards,<br/>Administration Team</p>
    `,
    category: "Administration",
  },

  // ===============================
  // Records
  // ===============================
  {
    id: "HR-17",
    name: "Record Request Acknowledgement",
    subject: "Record Request Received",
    content: `
      <p>Dear [Employee Name],</p>
      <p>We have received your request for [Record Type].</p>
      <p>Our Records team will process it and notify you once available.</p>
      <p>Regards,<br/>Records Management Team</p>
    `,
    category: "Records",
  },

  // ===============================
  // Finance
  // ===============================
  {
    id: "HR-18",
    name: "Tax Declaration Confirmation",
    subject: "Tax Declaration Received for [FY Year]",
    content: `
      <p>Dear [Employee Name],</p>
      <p>Your tax declaration for the financial year [FY Year] has been received successfully.</p>
      <p>If you need to make changes, please resubmit before [Deadline].</p>
      <p>Regards,<br/>Finance Team</p>
    `,
    category: "Finance",
  },
  {
    id: "HR-19",
    name: "Vendor Invoice Processing Delay Notification",
    subject: "Update: Vendor Invoice Processing Delay",
    content: `
      <p>Dear [Employee Name],</p>
      <p>This is to inform you that processing of the vendor invoice [Invoice Number] is delayed due to [Reason].</p>
      <p>We are working to resolve this and expect completion by [Expected Date].</p>
      <p>Regards,<br/>Finance Department</p>
    `,
    category: "Finance",
  },
];
