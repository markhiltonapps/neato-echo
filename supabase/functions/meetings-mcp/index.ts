// Neato Echo — hosted HTTP MCP server (Supabase Edge Function).
// Exposes read-only meeting tools over Streamable-HTTP MCP so a remote AI agent can
// absorb a user's meetings.
//
// Multi-tenant by design: the caller presents an access key (Authorization: Bearer
// <key>, x-api-key, or ?key=). The function SHA-256-hashes it and looks it up in
// public.echo_mcp_keys to find which account it unlocks, then scopes every query to
// that account via the service-role key. One key = one account's meetings. Minting a
// key for a new user (a row in echo_mcp_keys) is all it takes to onboard them — no
// code change, and no one can read anyone else's data.
//
// Platform env (auto-injected): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// Security: a key grants internet read access to ONE account's transcripts. Keys are
// stored hashed, so a DB leak never exposes a usable key. Distribute keys privately.

const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function presentedKey(req: Request): string {
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const xkey = (req.headers.get("x-api-key") || "").trim();
  const qkey = new URL(req.url).searchParams.get("key") || "";
  return bearer || xkey || qkey;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Resolve the presented key to the account it unlocks, or null if unknown/revoked.
async function resolveOwner(req: Request): Promise<string | null> {
  const key = presentedKey(req);
  if (!key) return null;
  const hash = await sha256Hex(key);
  const rows = await db(`echo_mcp_keys?select=user_id,revoked&key_hash=eq.${hash}&limit=1`);
  const row = rows[0];
  if (!row || row.revoked) return null;
  return row.user_id as string;
}

async function db(pathAndQuery: string): Promise<any[]> {
  const res = await fetch(`${SB_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
  });
  if (!res.ok) throw new Error(`database error ${res.status}: ${await res.text()}`);
  return res.json();
}

const enc = (s: string) => encodeURIComponent(s);
const sanitize = (s: string) => (s || "").replace(/[(),*%]/g, " ").trim();

function readableTranscript(raw: unknown): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed)) {
      return parsed
        .map((seg: any) => {
          const who = seg.speakerLabel || seg.speaker || (seg.source === "mic" ? "You" : "Speaker");
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

const fmtDuration = (ms: number | null) => {
  if (!ms) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const TOOLS = [
  {
    name: "search_meetings",
    description:
      "Search your recorded meetings and voice notes by title, summary, or transcript text. Returns compact matches (id, title, date, summary snippet). Use get_meeting for full content.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words/phrases to search across titles, summaries, transcripts." },
        limit: { type: "number", description: "Max results (default 10)." },
      },
      required: ["query"],
    },
  },
  {
    name: "list_meetings",
    description:
      "List your meetings, most recent first. Optional date range (YYYY-MM-DD) or folder name.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)." },
        since: { type: "string", description: "On/after this date, YYYY-MM-DD." },
        until: { type: "string", description: "On/before this date, YYYY-MM-DD." },
        folder: { type: "string", description: "Folder name (exact, case-insensitive)." },
      },
    },
  },
  {
    name: "get_meeting",
    description:
      "Get one meeting in full: title, date, duration, summary, and readable speaker-labeled transcript. Pass an id from search_meetings/list_meetings.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The meeting id." } },
      required: ["id"],
    },
  },
  {
    name: "list_folders",
    description: "List your folders.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function resolveFolderId(owner: string, name: string): Promise<string | null> {
  const rows = await db(`echo_folders?select=id,name&user_id=eq.${owner}`);
  const m = rows.find((f) => (f.name || "").toLowerCase() === name.toLowerCase());
  return m?.id ?? null;
}

async function callTool(owner: string, name: string, args: Record<string, any>): Promise<string> {
  const base = `user_id=eq.${owner}&deleted_at=is.null`;
  if (name === "search_meetings") {
    const q = sanitize(args.query || "");
    const limit = Math.min(50, Math.max(1, Number(args.limit) || 10));
    const orFilter = `or=(name.ilike.*${enc(q)}*,summary.ilike.*${enc(q)}*,transcript.ilike.*${enc(q)}*)`;
    const rows = await db(
      `echo_recordings?select=id,name,recorded_at,summary,duration_ms,origin&${base}&${orFilter}&order=recorded_at.desc&limit=${limit}`
    );
    return JSON.stringify(
      rows.map((r) => ({
        id: r.id,
        title: r.name || "Untitled",
        recorded_at: r.recorded_at,
        duration: fmtDuration(r.duration_ms),
        origin: r.origin || undefined,
        summary_snippet: (r.summary || "").slice(0, 280),
      })),
      null,
      2
    );
  }
  if (name === "list_meetings") {
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 20));
    let q = `echo_recordings?select=id,name,recorded_at,summary,duration_ms,origin&${base}&order=recorded_at.desc&limit=${limit}`;
    if (args.since) q += `&recorded_at=gte.${enc(args.since)}T00:00:00Z`;
    if (args.until) q += `&recorded_at=lte.${enc(args.until)}T23:59:59Z`;
    if (args.folder) {
      const fid = await resolveFolderId(owner, String(args.folder));
      if (!fid) return `No folder named "${args.folder}" was found.`;
      q += `&folder_id=eq.${fid}`;
    }
    const rows = await db(q);
    return JSON.stringify(
      rows.map((r) => ({
        id: r.id,
        title: r.name || "Untitled",
        recorded_at: r.recorded_at,
        duration: fmtDuration(r.duration_ms),
        origin: r.origin || undefined,
        has_summary: !!r.summary,
      })),
      null,
      2
    );
  }
  if (name === "get_meeting") {
    const id = sanitize(String(args.id || ""));
    const rows = await db(
      `echo_recordings?select=id,name,recorded_at,duration_ms,summary,transcript,origin&${base}&id=eq.${enc(id)}&limit=1`
    );
    const r = rows[0];
    if (!r) return `No meeting found with id ${id}.`;
    return JSON.stringify(
      {
        id: r.id,
        title: r.name || "Untitled",
        recorded_at: r.recorded_at,
        duration: fmtDuration(r.duration_ms),
        origin: r.origin || undefined,
        summary: r.summary || null,
        transcript: readableTranscript(r.transcript),
      },
      null,
      2
    );
  }
  if (name === "list_folders") {
    const rows = await db(`echo_folders?select=id,name&user_id=eq.${owner}&order=sort_order.asc`);
    return JSON.stringify(rows.map((f) => ({ id: f.id, name: f.name })), null, 2);
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handleRpc(owner: string, msg: any): Promise<any | null> {
  const { id, method, params } = msg || {};
  // Notifications (no id) get no response.
  if (id === undefined || id === null) return null;
  try {
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion || "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "neato-echo", version: "0.1.0" },
        },
      };
    }
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    if (method === "tools/call") {
      const text = await callTool(owner, params?.name, params?.arguments || {});
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } };
    }
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (e) {
    return { jsonrpc: "2.0", id, error: { code: -32603, message: (e as Error).message } };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const owner = await resolveOwner(req);
  if (!owner) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...CORS, "content-type": "application/json" },
    });
  }

  if (req.method === "GET") {
    // Some clients probe with GET; report readiness.
    return new Response(JSON.stringify({ name: "neato-echo", mcp: "streamable-http" }), {
      headers: { ...CORS, "content-type": "application/json" },
    });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }), {
      status: 400,
      headers: { ...CORS, "content-type": "application/json" },
    });
  }
  // Single request or batch.
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(owner, m)))).filter(Boolean);
    return new Response(JSON.stringify(out), { headers: { ...CORS, "content-type": "application/json" } });
  }
  const resp = await handleRpc(owner, body);
  if (resp === null) return new Response(null, { status: 202, headers: CORS });
  return new Response(JSON.stringify(resp), { headers: { ...CORS, "content-type": "application/json" } });
});
