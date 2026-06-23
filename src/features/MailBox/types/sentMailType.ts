// Root Response
export interface GraphSentItemsResponse {
  "@odata.context": string;
  value: GraphSentMessage[];
}

export interface GraphSentDTOResponse {
  mails: GraphSentMessage[];
  nextLink: string | null;
}

// Message Object
export interface GraphSentMessage {
  "@odata.etag": string;
  id: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  changeKey: string;
  categories: string[];
  receivedDateTime: string;
  sentDateTime: string;
  hasAttachments: boolean;
  internetMessageId: string;
  subject: string;
  bodyPreview: string;
  importance: string;
  parentFolderId: string;
  conversationId: string;
  conversationIndex: string;
  isDeliveryReceiptRequested: boolean;
  isReadReceiptRequested: boolean;
  isRead: boolean;
  isDraft: boolean;
  webLink: string;
  inferenceClassification: string;
  body: EmailBody;
  sender: EmailContact;
  from: EmailContact;
  toRecipients: EmailRecipient[];
  ccRecipients: EmailRecipient[];
  bccRecipients: EmailRecipient[];
  replyTo: EmailRecipient[];
  flag: FlagStatus;
}

// Body Field
export interface EmailBody {
  contentType: "html" | "text";
  content: string;
}

// Contact field (sender/from)
export interface EmailContact {
  emailAddress: EmailAddress;
}

// Recipients (to/cc/bcc/replyTo)
export interface EmailRecipient {
  emailAddress: EmailAddress;
}

// Address
export interface EmailAddress {
  name: string;
  address: string;
}

// Flag
export interface FlagStatus {
  flagStatus: "notFlagged" | "complete" | "flagged";
}
