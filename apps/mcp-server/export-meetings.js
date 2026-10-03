#!/usr/bin/env node
// One-shot export of ALL your Neato Echo meetings to feed an AI agent in bulk.
// Writes meetings-export.json (structured) and meetings-export.md (readable) next to this
// script. Signs into your Neato Cloud account (publishable key + your email/password), so
// it only ever reads YOUR data (RLS). No service-role key.
//
// Usage:
//   cd apps/mcp-server && npm install && cp .env.example .env   # fill in NEATO_EMAIL/PASSWORD
//   node export-meetings.js
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://djrgoduukyqarozqyxbu.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "sb_publishable_oFOe6rf_a1tHoHDuwmrciA_bYwE-M5x";
const EMAIL = process.env.NEATO_EMAIL;
const PASSWORD = process.env.NEATO_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Set NEATO_EMAIL and NEATO_PASSWORD (in .env or the environment).");
  process.exit(1);
}

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
    /* plain text */
  }
  return String(raw).trim();
}

const fmtDuration = (ms) => {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const main = async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (authErr) {
    console.error(`Neato Cloud sign-in failed: ${authErr.message}`);
    process.exit(1);
  }

  const { data: folders } = await supabase.from("echo_folders").select("id,name");
  const folderName = new Map((folders || []).map((f) => [f.id, f.name]));

  // Page through all recordings so very large libraries export completely.
  const rows = [];
  const PAGE = 100;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("echo_recordings")
      .select("id,name,recorded_at,duration_ms,summary,transcript,origin,folder_id")
      .is("deleted_at", null)
      .order("recorded_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`Query failed: ${error.message}`);
      process.exit(1);
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  const meetings = rows.map((r) => ({
    id: r.id,
    title: r.name || "Untitled",
    recorded_at: r.recorded_at,
    duration: fmtDuration(r.duration_ms),
    folder: r.folder_id ? folderName.get(r.folder_id) || null : null,
    origin: r.origin || null,
    summary: r.summary || null,
    transcript: readableTranscript(r.transcript),
  }));

  const here = dirname(fileURLToPath(import.meta.url));
  const jsonPath = join(here, "meetings-export.json");
  const mdPath = join(here, "meetings-export.md");

  writeFileSync(jsonPath, JSON.stringify(meetings, null, 2));

  const md = [
    `# Neato Echo — meeting export`,
    `_${meetings.length} meetings, exported ${new Date().toISOString()}_`,
    "",
    ...meetings.map((m) => {
      const meta = [m.recorded_at, m.duration && `${m.duration}`, m.folder, m.origin]
        .filter(Boolean)
        .join(" · ");
      return [
        `## ${m.title}`,
        meta,
        "",
        m.summary ? `### Summary\n${m.summary}` : "",
        m.transcript ? `### Transcript\n${m.transcript}` : "",
        "\n---\n",
      ]
        .filter(Boolean)
        .join("\n");
    }),
  ].join("\n");
  writeFileSync(mdPath, md);

  console.log(`Exported ${meetings.length} meetings:`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${mdPath}`);
};

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
