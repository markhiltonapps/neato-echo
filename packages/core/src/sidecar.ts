import type { RecordingMeta } from "./models";

// The `.json` sidecar written next to each `.wav` in cloud sync. Versioned so both
// apps (and the cloud) read/write an identical shape.
export const SIDECAR_VERSION = 1;

export type SidecarV1 = {
  v: number;
  app: "Neato Echo";
  name: string;
  date: string; // ISO
  durationMillis: number;
  transcript: string;
  summary: string;
  summaryType: string;
  audio: string; // filename of the paired .wav
  folder?: string | null;
};

export function toSidecar(rec: RecordingMeta, audioFile: string): SidecarV1 {
  return {
    v: SIDECAR_VERSION,
    app: "Neato Echo",
    name: rec.name,
    date: rec.date,
    durationMillis: rec.durationMillis,
    transcript: rec.transcript || "",
    summary: rec.summary || "",
    summaryType: rec.summaryType || "",
    audio: audioFile,
    folder: rec.folderId ?? null,
  };
}

// Readable, ASCII-safe file/Dropbox base name from a title + a stable id.
export function syncBaseName(title: string, id: string): string {
  const shortId = id.replace(/\.[^/.]+$/, "").slice(-8);
  const safe =
    (title || "")
      .replace(/[^A-Za-z0-9 _-]+/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 48) || "recording";
  return `${safe}-${shortId}`;
}
