// Persists a meeting's full audio so it can be synced to and played on the mobile
// app. During a meeting the two 24 kHz s16le PCM streams (mic + system tap) are
// appended to temp files — streamed to disk, so a long meeting never grows memory —
// then mixed into a single compressed .m4a keyed by note id when the meeting stops.
//
// Going-forward only: nothing here backfills meetings recorded before it existed.
// Everything is best-effort — a capture or mix failure must never disrupt a meeting.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { app } = require("electron");
const { spawn } = require("child_process");
const { getFFmpegPath } = require("./ffmpegUtils");
const debugLogger = require("./debugLogger");

const SAMPLE_RATE = 24000;

function safeUnlink(p) {
  if (!p) return;
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // best-effort cleanup
  }
}

// Mix one or two raw PCM tracks into a compressed .m4a. With both tracks present
// they're summed (amix); the meeting pipeline zero-fills gaps so the two stay
// time-aligned. Resolves true on success, false on any failure (never throws).
function mixToM4a({ micPath, systemPath, outPath }) {
  return new Promise((resolve) => {
    const ffmpeg = getFFmpegPath();
    if (!ffmpeg) {
      debugLogger.debug("Meeting audio: no ffmpeg available, skipping mix");
      resolve(false);
      return;
    }
    const inputs = [micPath, systemPath].filter(Boolean);
    if (inputs.length === 0) {
      resolve(false);
      return;
    }
    const args = [];
    for (const p of inputs) {
      args.push("-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", p);
    }
    if (inputs.length === 2) {
      // normalize=0 keeps both voices at full level instead of ducking each other.
      args.push("-filter_complex", "amix=inputs=2:duration=longest:normalize=0");
    }
    args.push("-c:a", "aac", "-b:a", "64k", "-y", outPath);

    let stderr = "";
    let proc;
    try {
      proc = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    } catch (e) {
      debugLogger.debug("Meeting audio: ffmpeg spawn failed", { error: e.message });
      resolve(false);
      return;
    }
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => {
      const ok = code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 0;
      if (!ok) debugLogger.debug("Meeting audio: ffmpeg mix failed", { code, stderr: stderr.slice(-300) });
      resolve(ok);
    });
  });
}

class MeetingAudioRecorder {
  constructor() {
    this._reset();
  }

  _reset() {
    this.active = false;
    this.noteId = null;
    this.micPath = null;
    this.systemPath = null;
    this.micStream = null;
    this.systemStream = null;
    this.micBytes = 0;
    this.systemBytes = 0;
  }

  // Directory holding finished meeting recordings (one <noteId>.m4a each).
  static audioDir() {
    const dir = path.join(app.getPath("userData"), "meeting-audio");
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // if this fails, finish() will fail gracefully too
    }
    return dir;
  }

  static audioPathForNote(noteId) {
    return path.join(MeetingAudioRecorder.audioDir(), `${noteId}.m4a`);
  }

  static metaPathForNote(noteId) {
    return path.join(MeetingAudioRecorder.audioDir(), `${noteId}.json`);
  }

  // Begin capturing a meeting's audio. Only meetings tied to a note are captured,
  // so the file can be keyed by note id and uploaded on push.
  start(noteId) {
    if (!noteId) return;
    if (this.active) this.abort(); // never leak a prior session's streams
    try {
      const stamp = Date.now();
      this.micPath = path.join(os.tmpdir(), `ow-meetaudio-mic-${stamp}.pcm`);
      this.systemPath = path.join(os.tmpdir(), `ow-meetaudio-sys-${stamp}.pcm`);
      this.micStream = fs.createWriteStream(this.micPath);
      this.systemStream = fs.createWriteStream(this.systemPath);
      this.micStream.on("error", () => {});
      this.systemStream.on("error", () => {});
      this.noteId = noteId;
      this.micBytes = 0;
      this.systemBytes = 0;
      this.active = true;
    } catch (e) {
      debugLogger.debug("Meeting audio: failed to start capture", { error: e.message });
      this._reset();
    }
  }

  // Append a dispatched PCM chunk. Called from the single meeting audio choke point,
  // so it captures the same mic/system streams that feed transcription.
  append(source, buffer) {
    if (!this.active || !buffer || buffer.length === 0) return;
    try {
      if (source === "mic" && this.micStream) {
        this.micStream.write(Buffer.from(buffer));
        this.micBytes += buffer.length;
      } else if (source === "system" && this.systemStream) {
        this.systemStream.write(Buffer.from(buffer));
        this.systemBytes += buffer.length;
      }
    } catch {
      // a write failure shouldn't disrupt the meeting
    }
  }

  // Close the temp streams and mix into the note's .m4a. Returns the output path,
  // or null when there was nothing to save. Never throws.
  async finish() {
    if (!this.active) return null;
    const { noteId, micPath, systemPath, micBytes, systemBytes } = this;
    this.active = false;
    await Promise.all([
      new Promise((r) => (this.micStream ? this.micStream.end(r) : r())),
      new Promise((r) => (this.systemStream ? this.systemStream.end(r) : r())),
    ]);
    this._reset();

    if (micBytes === 0 && systemBytes === 0) {
      safeUnlink(micPath);
      safeUnlink(systemPath);
      return null;
    }
    try {
      const out = MeetingAudioRecorder.audioPathForNote(noteId);
      const ok = await mixToM4a({
        micPath: micBytes > 0 ? micPath : null,
        systemPath: systemBytes > 0 ? systemPath : null,
        outPath: out,
      });
      if (ok) {
        // The note carries no duration, so derive it from the captured PCM
        // (s16le mono @ SAMPLE_RATE) and stash it beside the audio for cloud sync.
        try {
          const micMs = Math.round((micBytes / 2 / SAMPLE_RATE) * 1000);
          const systemMs = Math.round((systemBytes / 2 / SAMPLE_RATE) * 1000);
          const durationMs = Math.max(micMs, systemMs);
          // micMs/systemMs are diagnostics: if one stream runs ~2x the real meeting
          // length, that's the capture artifact behind the doubled duration.
          fs.writeFileSync(
            MeetingAudioRecorder.metaPathForNote(noteId),
            JSON.stringify({ durationMs, micMs, systemMs })
          );
          debugLogger.info("Meeting audio saved", { noteId, durationMs, micMs, systemMs });
        } catch {
          // duration is best-effort; missing it just shows 0:00
        }
      }
      return ok ? out : null;
    } catch (e) {
      debugLogger.debug("Meeting audio: finish failed", { error: e.message });
      return null;
    } finally {
      safeUnlink(micPath);
      safeUnlink(systemPath);
    }
  }

  // Drop the current capture without producing a file (cancelled/failed meeting).
  abort() {
    try {
      this.micStream?.destroy();
    } catch {
      // ignore
    }
    try {
      this.systemStream?.destroy();
    } catch {
      // ignore
    }
    safeUnlink(this.micPath);
    safeUnlink(this.systemPath);
    this._reset();
  }
}

const meetingAudioRecorder = new MeetingAudioRecorder();

module.exports = {
  meetingAudioRecorder,
  getMeetingAudioPath: (noteId) => MeetingAudioRecorder.audioPathForNote(noteId),
  meetingAudioExists: (noteId) => {
    try {
      return fs.existsSync(MeetingAudioRecorder.audioPathForNote(noteId));
    } catch {
      return false;
    }
  },
  // Duration (ms) of a saved meeting recording, derived from its PCM at capture time.
  getMeetingAudioDurationMs: (noteId) => {
    try {
      const meta = JSON.parse(fs.readFileSync(MeetingAudioRecorder.metaPathForNote(noteId), "utf8"));
      return typeof meta.durationMs === "number" ? meta.durationMs : null;
    } catch {
      return null;
    }
  },
};
