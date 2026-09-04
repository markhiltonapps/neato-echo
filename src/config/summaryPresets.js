// Neato Echo built-in summary presets.
//
// Seeded once into the `actions` table as ordinary, editable actions so every
// teammate starts with the same set and can tweak, delete, or add their own.
// The seed is guarded by an `app_meta` flag; deleting a preset is permanent.
const SUMMARY_PRESETS_SEED_KEY = "summary_presets_seeded_v1";

const SHARED_RULES =
  "Work only from the provided notes and transcript. Never invent facts, names, numbers, or commitments. " +
  "If something is unclear or missing, say so briefly instead of guessing. Write in clean markdown with short sections and bullet points. " +
  'Use the speaker names given in the transcript; refer to the note owner as "you" only when the transcript marks them that way.';

const SUMMARY_PRESETS = [
  {
    name: "Team Meeting",
    description: "Decisions, action items, and open questions",
    icon: "sparkles",
    prompt:
      "Summarize this team meeting. " +
      SHARED_RULES +
      " Structure the output as: **Summary** (2-4 sentences), **Decisions** (what was agreed), " +
      "**Action Items** (one bullet each: owner, task, due date if mentioned), **Open Questions**, and **Next Meeting** if a follow-up was discussed. " +
      "Omit any section that has nothing in it.",
  },
  {
    name: "Interview",
    description: "Candidate strengths, concerns, and next steps",
    icon: "sparkles",
    prompt:
      "Summarize this interview for the hiring team. " +
      SHARED_RULES +
      " Structure the output as: **Candidate** (role discussed and background covered), **Strengths** (with supporting evidence from their answers), " +
      "**Concerns or Gaps**, **Notable Answers** (short quotes or paraphrases on key questions), **Candidate's Questions**, and **Recommended Next Steps**. " +
      "Stay neutral and factual; do not make a hire/no-hire call unless the interviewers stated one.",
  },
  {
    name: "Sales Call",
    description: "Needs, objections, and the follow-up plan",
    icon: "sparkles",
    prompt:
      "Summarize this sales call. " +
      SHARED_RULES +
      " Structure the output as: **Prospect** (company, people, and roles mentioned), **Needs and Pain Points**, **Current Situation** (existing tools, timeline, budget if mentioned), " +
      "**Objections and How They Were Addressed**, **Commitments Made** (by either side), and **Follow-Up Plan** (owner and timing for each next step). " +
      "Flag any pricing or delivery promises verbatim.",
  },
  {
    name: "One-on-one",
    description: "Wins, blockers, feedback, and commitments",
    icon: "sparkles",
    prompt:
      "Summarize this one-on-one conversation. " +
      SHARED_RULES +
      " Structure the output as: **Wins Since Last Time**, **Blockers and Support Needed**, **Feedback Shared** (in both directions), **Growth and Career Topics**, " +
      "and **Commitments** (who will do what before the next one-on-one). Keep the tone private and supportive; this is for the two participants only.",
  },
  {
    name: "Customer Support",
    description: "Issue, troubleshooting, resolution, and follow-ups",
    icon: "sparkles",
    prompt:
      "Summarize this customer support conversation as a case note. " +
      SHARED_RULES +
      " Structure the output as: **Customer and Context** (who, product, environment), **Reported Issue** (in the customer's terms), **Troubleshooting Performed** (steps in order and their results), " +
      "**Resolution or Current Status**, **Follow-Ups** (owner and timing), and **Suggested Tags** (3-6 short keywords for searching later). " +
      "Note the customer's sentiment in one line if it was clearly expressed.",
  },
];

module.exports = { SUMMARY_PRESETS, SUMMARY_PRESETS_SEED_KEY };
