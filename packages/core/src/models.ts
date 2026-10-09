// Canonical, platform-agnostic data shapes shared by desktop, mobile, and cloud.
// Apps map their own storage records to/from these.

export type SummaryStyle = {
  key: string;
  label: string;
  prompt: string;
  builtin?: boolean;
};

export type ChatMsg = { role: "user" | "assistant"; content: string };

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMsg[];
  created: number; // epoch ms
  updated: number; // epoch ms
};

export type Folder = {
  id: string;
  name: string;
  created: number; // epoch ms
};

// The canonical recording metadata (audio itself lives in platform storage / cloud blob).
export type RecordingMeta = {
  id: string;
  name: string;
  date: string; // ISO 8601
  durationMillis: number;
  transcript?: string;
  summary?: string;
  summaryType?: string; // SummaryStyle.key
  folderId?: string | null;
};
