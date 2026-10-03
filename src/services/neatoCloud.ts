import { createClient } from "@supabase/supabase-js";
import type { NoteItem } from "../types/electron";

// Neato Cloud = the shared Supabase backend (NeatoRecall project), same one the mobile
// app uses. Publishable key is safe in the client; RLS enforces per-user access. In the
// Electron renderer, supabase-js persists the auth session in localStorage by default.
const SUPABASE_URL = "https://djrgoduukyqarozqyxbu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_oFOe6rf_a1tHoHDuwmrciA_bYwE-M5x";

export const neatoCloud = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Persist a note.id -> echo_recordings.id mapping locally so re-pushing is idempotent
// (upsert) without adding a column to the desktop's SQLite (its cloud_id belongs to the
// existing OpenWhispr cloud sync).
const ECHO_ID_MAP_KEY = "neato.echoIdMap.v1";
// The id map is kept in userData (via IPC) so it survives app reinstalls — that's
// what keeps re-pushing idempotent and prevents duplicate cloud rows. localStorage
// is still read once for migration and written as a mirror, but the file wins.
async function loadEchoIdMap(): Promise<Record<string, string>> {
  try {
    const fromFile = await window.electronAPI.neatoIdMapRead?.();
    if (fromFile && Object.keys(fromFile).length) return fromFile;
  } catch {
    // fall through to the localStorage migration path
  }
  try {
    return JSON.parse(localStorage.getItem(ECHO_ID_MAP_KEY) || "{}");
  } catch {
    return {};
  }
}
async function saveEchoIdMap(map: Record<string, string>) {
  try {
    await window.electronAPI.neatoIdMapWrite?.(map);
  } catch {
    // file write unavailable — the localStorage mirror below still helps
  }
  try {
    localStorage.setItem(ECHO_ID_MAP_KEY, JSON.stringify(map));
  } catch {
    // acceptable — the userData file is the source of truth
  }
}

const AUDIO_BUCKET = "echo-audio";
// Notes whose meeting audio has already been uploaded, so re-pushing doesn't
// re-upload it every time.
const AUDIO_UPLOADED_KEY = "neato.echoAudioUploaded.v1";
function loadAudioUploaded(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(AUDIO_UPLOADED_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveAudioUploaded(map: Record<string, string>) {
  try {
    localStorage.setItem(AUDIO_UPLOADED_KEY, JSON.stringify(map));
  } catch {
    // acceptable — worst case audio re-uploads next push
  }
}

// Upload a note's saved meeting recording (mixed mic + system .m4a, produced by
// the desktop meeting pipeline) to the private echo-audio bucket. Returns the
// storage path to record as audio_path, or null when there's nothing to upload.
// Best-effort: an audio failure never blocks the notes push.
async function uploadNoteAudio(
  noteId: string | number,
  userId: string,
  echoId: string,
  uploaded: Record<string, string>
): Promise<{ path: string; durationMs: number | null } | null> {
  const key = String(noteId);
  const storagePath = `${userId}/${echoId}.m4a`;
  if (uploaded[key]) return { path: storagePath, durationMs: null }; // already uploaded
  try {
    const res = await window.electronAPI.getMeetingAudio?.(noteId);
    if (!res?.data) return null; // no saved audio for this note
    const { error } = await neatoCloud.storage
      .from(AUDIO_BUCKET)
      .upload(storagePath, res.data, { contentType: res.contentType || "audio/mp4", upsert: true });
    if (error) throw error;
    uploaded[key] = storagePath;
    return { path: storagePath, durationMs: res.durationMs ?? null };
  } catch {
    return null;
  }
}

// Pull dedup map: cloud recording id -> local note id (userData file, survives reinstalls).
async function loadPullMap(): Promise<Record<string, number>> {
  try {
    const m = await window.electronAPI.neatoPullMapRead?.();
    return m || {};
  } catch {
    return {};
  }
}
async function savePullMap(map: Record<string, number>) {
  try {
    await window.electronAPI.neatoPullMapWrite?.(map);
  } catch {
    // acceptable — worst case a re-pull re-checks by map next time
  }
}

// Pull recordings that ORIGINATED on other devices (e.g. the phone) down into the
// desktop as notes. Conservative + additive: it never edits or deletes existing
// notes, skips this desktop's own pushed rows (so it can't duplicate them), and
// dedups via a persistent pull map so re-pulling is idempotent. Returns count added.
export async function pullNotesFromCloud(): Promise<number> {
  const {
    data: { session },
  } = await neatoCloud.auth.getSession();
  if (!session) throw new Error("Not signed in to Neato Cloud");

  // Fetch everything, tombstones included, so deletions made elsewhere propagate down.
  const { data: rows, error } = await neatoCloud.from("echo_recordings").select("*");
  if (error) throw error;

  const pushMap = await loadEchoIdMap(); // this desktop's own note.id -> echo id
  const pushedEchoIds = new Set(Object.values(pushMap));
  const pullMap = await loadPullMap(); // echo id -> local note id (already pulled)
  // echo id -> local note id for notes THIS desktop pushed, so a delete elsewhere can
  // remove our original too.
  const echoToPushedLocal = new Map<string, number>();
  for (const [localId, echoId] of Object.entries(pushMap)) {
    echoToPushedLocal.set(echoId, Number(localId));
  }

  // Create any folders that originated on another device (keyed by the shared
  // client_folder_id) so mobile-made folders show up here and recordings can map into
  // them. Then (re)build the folder lookup from the refreshed local folder list.
  const { data: cloudFolders } = await neatoCloud.from("echo_folders").select("*");
  for (const cf of cloudFolders || []) {
    if (!cf?.id) continue;
    try {
      await window.electronAPI.neatoUpsertFolder?.({
        clientFolderId: cf.id,
        name: cf.name || "Folder",
        sortOrder: cf.sort_order ?? 0,
      });
    } catch {
      // best-effort; a recording just falls back to no folder if this fails
    }
  }
  const localFolders = (await window.electronAPI.getFolders?.(null)) || [];
  const folderByClientId = new Map<string, number>();
  for (const f of localFolders) folderByClientId.set(f.client_folder_id, f.id);

  let added = 0;
  let deleted = 0;
  for (const r of rows || []) {
    // Tombstone: remove the local copy (whether we pulled it or pushed it) and forget it.
    if (r.deleted_at) {
      const localId = pullMap[r.id] ?? echoToPushedLocal.get(r.id);
      if (localId) {
        try {
          await window.electronAPI.deleteNote(localId);
          deleted++;
        } catch {
          // leave it; a later pull retries
        }
      }
      if (pullMap[r.id]) delete pullMap[r.id];
      continue;
    }
    if (pushedEchoIds.has(r.id)) continue; // our own pushed note — don't pull it back
    if (pullMap[r.id]) {
      // Already pulled — backfill the origin badge for notes pulled before this shipped.
      if (r.origin) await window.electronAPI.neatoSetNoteOrigin?.(pullMap[r.id], r.origin);
      continue;
    }
    const title = (r.name || "Recording").toString().slice(0, 200);
    const content = r.summary || "";
    const audioDuration = r.duration_ms ? Math.round(r.duration_ms / 1000) : null;
    const localFolderId = r.folder_id ? folderByClientId.get(r.folder_id) ?? null : null;
    try {
      const res = await window.electronAPI.saveNote(
        title,
        content,
        "personal",
        null,
        audioDuration,
        localFolderId,
        null
      );
      const noteId = res?.note?.id;
      if (!noteId) continue;
      if (r.transcript || r.summary) {
        await window.electronAPI.updateNote(noteId, {
          transcript: r.transcript || null,
          enhanced_content: r.summary || null,
        });
      }
      await window.electronAPI.neatoSetNoteOrigin?.(noteId, r.origin || "mobile");
      pullMap[r.id] = noteId;
      added++;
    } catch {
      // skip this row; a later pull retries it (not yet in the pull map)
    }
  }
  await savePullMap(pullMap);
  return added + deleted;
}

// Push desktop Ask-Neddy conversations up to echo_conversations so they appear in
// the mobile app. Uses each conversation's stable client_conversation_id as the cloud
// id (idempotent, no map). Cloud->desktop merge is a later step. Returns count pushed.
export async function pushConversationsToCloud(): Promise<number> {
  const {
    data: { session },
  } = await neatoCloud.auth.getSession();
  if (!session) throw new Error("Not signed in to Neato Cloud");
  const api = window.electronAPI as any;
  const convs = (await api.getAgentConversations?.(1000)) || [];
  const rows = [];
  for (const c of convs) {
    const id = c.client_conversation_id;
    if (!id) continue; // need a stable uuid to stay idempotent
    // Only standalone Ask-Neddy chats sync. Note/space/folder-scoped conversations live
    // with their container and must not appear in the mobile chat list.
    if (c.note_id != null || c.space_id != null || c.folder_id != null) continue;
    const msgs = (await api.getAgentMessages?.(c.id)) || [];
    const messages = msgs.map((m: any) => ({ role: m.role, content: m.content }));
    if (messages.length === 0) continue;
    rows.push({
      id,
      user_id: session.user.id,
      title: c.title || "Chat",
      messages,
      updated_at: c.updated_at ? new Date(c.updated_at).toISOString() : new Date().toISOString(),
    });
  }
  if (rows.length) {
    const { error } = await neatoCloud.from("echo_conversations").upsert(rows);
    if (error) throw error;
  }

  // Propagate local deletions: push a tombstone (deleted_at) for each standalone chat
  // deleted on this desktop, so it disappears on the phone too. Best-effort per row.
  const tombstones = (await api.neatoGetConversationTombstones?.()) || [];
  for (const t of tombstones) {
    if (!t.client_conversation_id) continue;
    const deletedAt = t.updated_at
      ? new Date(t.updated_at.replace(" ", "T") + "Z").toISOString()
      : new Date().toISOString();
    const { error } = await neatoCloud
      .from("echo_conversations")
      .upsert({ id: t.client_conversation_id, user_id: session.user.id, deleted_at: deletedAt });
    if (!error) await api.neatoMarkConversationSynced?.(t.id);
  }

  return rows.length;
}

// Pull Ask-Neddy conversations DOWN from echo_conversations into the desktop's local
// agent_conversations, so chats started on the phone show up on the PC. Merge is
// last-write-wins by updated_at (handled in the DB layer, keyed on
// client_conversation_id); it never resurrects a chat deleted locally. Returns the
// number of conversations created or updated.
export async function pullConversationsFromCloud(): Promise<number> {
  const {
    data: { session },
  } = await neatoCloud.auth.getSession();
  if (!session) throw new Error("Not signed in to Neato Cloud");

  // Fetch everything including tombstones (deleted_at set) so deletions propagate down.
  const { data: rows, error } = await neatoCloud.from("echo_conversations").select("*");
  if (error) throw error;

  let changed = 0;
  for (const r of rows || []) {
    if (!r.id) continue;
    const messages = Array.isArray(r.messages) ? r.messages : [];
    try {
      const res = await window.electronAPI.neatoUpsertConversation?.({
        clientConversationId: r.id,
        title: r.title || "Chat",
        messages,
        updatedAt: r.updated_at || null,
        deletedAt: r.deleted_at || null,
      });
      if (res?.status === "created" || res?.status === "updated" || res?.status === "deleted")
        changed++;
    } catch {
      // skip this row; a later pull retries it
    }
  }
  return changed;
}

// Push all (non-deleted) desktop notes to echo_recordings. Returns the count pushed.
export async function pushNotesToCloud(): Promise<number> {
  const {
    data: { session },
  } = await neatoCloud.auth.getSession();
  if (!session) throw new Error("Not signed in to Neato Cloud");

  const notes: NoteItem[] = await window.electronAPI.getNotes(null, 1000, null, null);
  const live = (notes || []).filter((n) => !n.deleted_at);
  const map = await loadEchoIdMap();
  const uploaded = loadAudioUploaded();
  // Notes that were PULLED from the cloud already live there — re-pushing them would
  // create a duplicate under a new (desktop) id. Skip them.
  const pullMap = await loadPullMap();
  const pulledLocalIds = new Set(Object.values(pullMap));

  // Sync folders first so the phone can group recordings the same way the desktop
  // does. The desktop's stable client_folder_id becomes the cloud folder id.
  const folders = (await window.electronAPI.getFolders?.(null)) || [];
  const folderIdToUuid = new Map<number, string>();
  for (const f of folders) folderIdToUuid.set(f.id, f.client_folder_id);
  if (folders.length) {
    const folderRows = folders.map((f) => ({
      id: f.client_folder_id,
      user_id: session.user.id,
      name: f.name,
      sort_order: f.sort_order ?? 0,
    }));
    const { error: fErr } = await neatoCloud.from("echo_folders").upsert(folderRows);
    if (fErr) throw fErr;
  }

  const rows = [];
  for (const n of live) {
    if (pulledLocalIds.has(n.id)) continue; // came from the cloud — don't duplicate it
    const key = String(n.id);
    const id = map[key] || uuidv4();
    map[key] = id;
    const durationSec = (n as any).audio_duration_seconds || 0;
    // Upload the meeting recording (if this note has one) before the upsert so the
    // row carries a playable audio_path.
    const audio = await uploadNoteAudio(n.id, session.user.id, id, uploaded);
    // Prefer the note's own duration; fall back to the length derived from the
    // captured meeting audio (meeting notes don't store a duration).
    const durationMs = durationSec ? Math.round(durationSec * 1000) : audio?.durationMs ?? 0;
    rows.push({
      id,
      user_id: session.user.id,
      name: n.title || "Untitled note",
      recorded_at: n.created_at ? new Date(n.created_at).toISOString() : new Date().toISOString(),
      duration_ms: durationMs,
      transcript: n.transcript || null,
      summary: n.enhanced_content || n.content || null,
      summary_type: null as string | null,
      audio_path: audio?.path ?? null,
      folder_id: n.folder_id != null ? folderIdToUuid.get(n.folder_id) ?? null : null,
      origin: "desktop",
    });
  }

  if (rows.length) {
    const { error } = await neatoCloud.from("echo_recordings").upsert(rows);
    if (error) throw error;
    saveAudioUploaded(uploaded);
  }

  // Propagate deletions: any note we previously pushed (idmap) or pulled (pullMap) that is
  // no longer live locally was deleted here — tombstone its cloud row so it disappears on
  // the phone too, then forget the mapping.
  const liveIds = new Set(live.map((n) => n.id));
  const tombstoneEchoIds: string[] = [];
  for (const [localId, echoId] of Object.entries(map)) {
    if (!liveIds.has(Number(localId))) {
      tombstoneEchoIds.push(echoId);
      delete map[localId];
    }
  }
  for (const [echoId, localId] of Object.entries(pullMap)) {
    if (!liveIds.has(Number(localId))) {
      tombstoneEchoIds.push(echoId);
      delete pullMap[echoId];
    }
  }
  if (tombstoneEchoIds.length) {
    const nowIso = new Date().toISOString();
    await neatoCloud
      .from("echo_recordings")
      .update({ deleted_at: nowIso })
      .in("id", tombstoneEchoIds);
    await savePullMap(pullMap);
  }

  await saveEchoIdMap(map);
  return rows.length;
}
