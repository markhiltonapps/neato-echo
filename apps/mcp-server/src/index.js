#!/usr/bin/env node
// Neato Echo MCP server — exposes your meeting notes (transcripts + summaries) to any
// MCP-capable AI agent (Claude Desktop, Claude Code, etc.) as read-only tools.
//
// Auth: signs into your Neato Cloud account with the publishable (anon) key + your email
// and password, so Supabase row-level security scopes every query to *your* data. No
// service-role key is used or needed. Credentials come from the environment:
//   NEATO_EMAIL, NEATO_PASSWORD                (required)
//   SUPABASE_URL, SUPABASE_ANON_KEY            (optional — sensible Neato defaults)
//
// Run: node src/index.js  (configured as an MCP stdio server — see README.md)
import "dotenv/config"; // load NEATO_EMAIL/NEATO_PASSWORD from a local .env if present
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://djrgoduukyqarozqyxbu.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "sb_publishable_oFOe6rf_a1tHoHDuwmrciA_bYwE-M5x";
const EMAIL = process.env.NEATO_EMAIL;
const PASSWORD = process.env.NEATO_PASSWORD;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: true, persistSession: false, detectSessionInUrl: false },
});

// Sign in once, then reuse the session (supabase-js refreshes the token in-process).
let signInPromise = null;
async function ensureSignedIn() {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "Missing NEATO_EMAIL / NEATO_PASSWORD. Set them in the MCP server's environment."
    );
  }
  if (!signInPromise) {
    signInPromise = supabase.auth
      .signInWithPassword({ email: EMAIL, password: PASSWORD })
      .then(({ error }) => {
        if (error) {
          signInPromise = null; // allow a retry on the next call
          throw new Error(`Neato Cloud sign-in failed: ${error.message}`);
        }
      });
  }
  return signInPromise;
}

// Transcripts are stored either as desktop meeting JSON (an array of speaker segments) or
// as plain text (phone recordings). Render both as readable, speaker-labeled text.
function readableTranscript(raw) {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((seg) => {
          const who =
            seg.speakerLabel || seg.speaker || (seg.source === "mic" ? "You" : "Speaker");
          const text = (seg.text || "").trim();
          return text ? `${who}: ${text}` : "";
        })
        .filter(Boolean)
        .join("\n");
    }
  } catch {
    // not JSON — it's already plain text
  }
  return String(raw).trim();
}

function fmtDuration(ms) {
  if (!ms) return null;
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

async function resolveFolderName(name) {
  const { data } = await supabase.from("echo_folders").select("id,name");
  const match = (data || []).find((f) => f.name?.toLowerCase() === name.toLowerCase());
  return match?.id ?? null;
}

const server = new McpServer({ name: "neato-echo", version: "0.1.0" });

server.tool(
  "search_meetings",
  "Search the user's recorded meetings and voice notes by title, summary, or transcript text. Returns compact matches (id, title, date, summary snippet). Use get_meeting for full content.",
  {
    query: z.string().describe("Words or phrases to look for across titles, summaries, and transcripts."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)."),
  },
  async ({ query, limit }) => {
    await ensureSignedIn();
    const q = query.replace(/[%,]/g, " ").trim();
    const { data, error } = await supabase
      .from("echo_recordings")
      .select("id,name,recorded_at,summary,duration_ms,origin")
      .is("deleted_at", null)
      .or(`name.ilike.%${q}%,summary.ilike.%${q}%,transcript.ilike.%${q}%`)
      .order("recorded_at", { ascending: false })
      .limit(limit ?? 10);
    if (error) throw new Error(error.message);
    const results = (data || []).map((r) => ({
      id: r.id,
      title: r.name || "Untitled",
      recorded_at: r.recorded_at,
      duration: fmtDuration(r.duration_ms),
      origin: r.origin || undefined,
      summary_snippet: (r.summary || "").slice(0, 280),
    }));
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }
);

server.tool(
  "list_meetings",
  "List the user's recorded meetings and voice notes, most recent first. Optionally filter by date range (YYYY-MM-DD) or folder name.",
  {
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)."),
    since: z.string().optional().describe("Only meetings on/after this date, YYYY-MM-DD."),
    until: z.string().optional().describe("Only meetings on/before this date, YYYY-MM-DD."),
    folder: z.string().optional().describe("Folder name to filter by (exact, case-insensitive)."),
  },
  async ({ limit, since, until, folder }) => {
    await ensureSignedIn();
    let query = supabase
      .from("echo_recordings")
      .select("id,name,recorded_at,summary,duration_ms,origin,folder_id")
      .is("deleted_at", null)
      .order("recorded_at", { ascending: false })
      .limit(limit ?? 20);
    if (since) query = query.gte("recorded_at", `${since}T00:00:00Z`);
    if (until) query = query.lte("recorded_at", `${until}T23:59:59Z`);
    if (folder) {
      const fid = await resolveFolderName(folder);
      if (!fid) {
        return {
          content: [{ type: "text", text: `No folder named "${folder}" was found.` }],
        };
      }
      query = query.eq("folder_id", fid);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const results = (data || []).map((r) => ({
      id: r.id,
      title: r.name || "Untitled",
      recorded_at: r.recorded_at,
      duration: fmtDuration(r.duration_ms),
      origin: r.origin || undefined,
      has_summary: !!r.summary,
    }));
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }
);

server.tool(
  "get_meeting",
  "Get one meeting/note in full: title, date, duration, summary, and the readable speaker-labeled transcript. Pass an id from search_meetings or list_meetings.",
  {
    id: z.string().describe("The meeting/recording id."),
  },
  async ({ id }) => {
    await ensureSignedIn();
    const { data, error } = await supabase
      .from("echo_recordings")
      .select("id,name,recorded_at,duration_ms,summary,transcript,origin,folder_id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return { content: [{ type: "text", text: `No meeting found with id ${id}.` }] };
    }
    const out = {
      id: data.id,
      title: data.name || "Untitled",
      recorded_at: data.recorded_at,
      duration: fmtDuration(data.duration_ms),
      origin: data.origin || undefined,
      summary: data.summary || null,
      transcript: readableTranscript(data.transcript),
    };
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }
);

server.tool(
  "list_folders",
  "List the user's folders (the way their meetings/notes are organized).",
  {},
  async () => {
    await ensureSignedIn();
    const { data, error } = await supabase
      .from("echo_folders")
      .select("id,name,sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    const results = (data || []).map((f) => ({ id: f.id, name: f.name }));
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
// Log to stderr only — stdout is the MCP protocol channel.
console.error("neato-echo MCP server running (stdio).");
