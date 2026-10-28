import type { SummaryStyle } from "./models";

export const SUMMARY_PERSONA =
  "You are Neddy, a meeting-notes assistant. Be concise and skip preamble. ";

export const BUILTIN_SUMMARY_STYLES: SummaryStyle[] = [
  {
    key: "recap",
    label: "Recap",
    builtin: true,
    prompt:
      SUMMARY_PERSONA +
      "Summarize this transcript as: a one-line summary, then the key points as bullets, then an 'Action items' list.",
  },
  {
    key: "actions",
    label: "Action items",
    builtin: true,
    prompt:
      SUMMARY_PERSONA +
      "Extract only the concrete action items, decisions, and follow-ups as a checklist. Include the owner and due date when mentioned. If there are none, say so plainly.",
  },
  {
    key: "narrative",
    label: "Narrative",
    builtin: true,
    prompt:
      SUMMARY_PERSONA +
      "Write a short narrative summary in one or two flowing paragraphs capturing what was discussed and decided.",
  },
  {
    key: "qa",
    label: "Q&A",
    builtin: true,
    prompt:
      SUMMARY_PERSONA +
      "Extract the main questions or topics raised and their answers/resolutions as a Q&A list, each as 'Q: …' then 'A: …'.",
  },
  {
    key: "team-meeting",
    label: "Team meeting",
    builtin: true,
    prompt:
      SUMMARY_PERSONA +
      "Summarize this team meeting with these sections: **Decisions**, **Action items** (owner + due date when mentioned), **Discussion highlights**, and **Blockers / risks**. Use bullets; skip empty sections.",
  },
  {
    key: "interview",
    label: "Interview",
    builtin: true,
    prompt:
      SUMMARY_PERSONA +
      "Summarize this interview: a one-line overall impression, then **Strengths**, **Concerns**, **Notable answers** (with the question), and a **Recommended next step**. Be balanced and specific.",
  },
  {
    key: "product",
    label: "Product discussion",
    builtin: true,
    prompt:
      SUMMARY_PERSONA +
      "Summarize this product discussion: **Problem / context**, **Proposed solutions or ideas**, **Decisions**, **Open questions**, and **Action items** (owner + due date when mentioned).",
  },
  {
    key: "sales-call",
    label: "Sales call",
    builtin: true,
    prompt:
      SUMMARY_PERSONA +
      "Summarize this sales call: **Customer & context**, **Pain points / needs**, **Objections**, **Interest / buying signals**, **Next steps** (owner + date), and any **pricing or commitments** mentioned.",
  },
  {
    key: "one-on-one",
    label: "1:1",
    builtin: true,
    prompt:
      SUMMARY_PERSONA +
      "Summarize this 1:1: **Updates**, **Wins**, **Challenges / blockers**, **Feedback** (both directions), and **Follow-ups / commitments** with owners.",
  },
  {
    key: "brainstorm",
    label: "Brainstorm",
    builtin: true,
    prompt:
      SUMMARY_PERSONA +
      "Summarize this brainstorm: group the **Ideas** by theme, call out the **Most promising** ones, note any **Concerns**, and list agreed **Next steps**.",
  },
  {
    key: "lecture",
    label: "Lecture / talk",
    builtin: true,
    prompt:
      SUMMARY_PERSONA +
      "Summarize this lecture or talk: a short **Overview**, the **Key points** as bullets in the order presented, important **Definitions or examples**, and **Takeaways**.",
  },
];

export const DEFAULT_SUMMARY_STYLE = BUILTIN_SUMMARY_STYLES[0].key;

// Build a SummaryStyle from a user's own prompt. The persona keeps tone/format
// consistent with the built-ins; the user's text drives the actual instruction.
export function customSummaryStyle(key: string, label: string, userPrompt: string): SummaryStyle {
  return {
    key,
    label: label.trim() || "Custom",
    builtin: false,
    prompt: SUMMARY_PERSONA + userPrompt.trim(),
  };
}
