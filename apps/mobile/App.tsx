import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
  Linking,
  Switch,
  Share,
  KeyboardAvoidingView,
  Platform,
  AppState,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from "@expo-google-fonts/outfit";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as FS from "expo-file-system/legacy";
import { File as FsFile, Paths, FileMode, UploadType } from "expo-file-system";
import { initWhisper } from "whisper.rn";
import { useAudioStream, useAudioPlayer, AudioModule } from "expo-audio";
import {
  BUILTIN_SUMMARY_STYLES,
  DEFAULT_SUMMARY_STYLE,
  colors as coreColors,
  buildContext,
  chatSystem,
  insightsSystem,
  titlePrompt,
  summarizePrompt,
  syncBaseName,
  parseTranscriptSegments,
  groupTranscriptForReading,
  customSummaryStyle,
  SUMMARY_PERSONA,
  DATE_RANGES,
  isInRange,
  dateBucket,
  type DateRange,
  type SummaryStyle,
} from "@neato/core";
import { supabase, SUPABASE_URL, AUDIO_BUCKET } from "./supabase";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

// ── Neato Echo "Neddy" design tokens (ported from the desktop app's index.css) ──
// Palette comes from the shared @neato/core tokens; the two translucent values are
// RN-specific and layered on top.
const C = {
  ...coreColors,
  tealSoft: "rgba(94,148,145,0.13)",
  borderRim: "rgba(255,255,255,0.7)", // molded-plastic top rim
};
// Outfit family — the app's body voice
const F = {
  reg: "Outfit_400Regular",
  med: "Outfit_500Medium",
  semi: "Outfit_600SemiBold",
  bold: "Outfit_700Bold",
  xbold: "Outfit_800ExtraBold",
};
// Molded-plastic convex gloss (gloss-convex): bright crown → fade → whisper of shade
const GLOSS = ["rgba(255,255,255,0.5)", "rgba(255,255,255,0.2)", "rgba(255,255,255,0)", "rgba(58,40,20,0.08)"] as const;
const GLOSS_LOC = [0, 0.3, 0.52, 1] as const;

const neddyMascot = require("./assets/neddy.webp");
const neddyHead = require("./assets/neddy-head.webp");

const STORAGE_KEY = "neato.recordings.v1";
const KEY_STORE = "anthropicKey";
// Multilingual base model (~142 MB) — transcribes ~99 languages with auto-detect,
// and Whisper can translate any of them to English. (Was ggml-base.en, English-only.)
const MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
const MODEL_PATH = FS.documentDirectory + "ggml-base.bin";
const strip = (p: string) => p.replace(/^file:\/\//, "");

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Pull the 11-char video id out of any common YouTube URL form.
function parseYouTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /shorts\/([\w-]{11})/,
    /embed\/([\w-]{11})/,
    /live\/([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  const bare = url.trim().match(/^([\w-]{11})$/);
  return bare ? bare[1] : null;
}

// Extract the first brace-balanced JSON object following a marker in HTML. Robust to
// nested braces/strings (a plain regex breaks on YouTube's huge nested payloads).
function extractBalancedJson(html: string, marker: string): any | null {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = html.indexOf("{", i);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// Small "where it came from" badge shown on each recording card.
function originBadge(origin?: string): { label: string; bg: string; color: string } | null {
  switch (origin) {
    case "mobile":
      return { label: "Mobile", bg: "rgba(94,148,145,0.14)", color: coreColors.tealDim };
    case "desktop":
      return { label: "Desktop", bg: "rgba(207,138,52,0.16)", color: coreColors.amber };
    case "youtube":
      return { label: "YouTube", bg: "rgba(194,85,74,0.13)", color: coreColors.destructive };
    default:
      return null;
  }
}

let whisperCtx: any = null;
async function ensureWhisper(setStatus: (s: string) => void) {
  if (whisperCtx) return whisperCtx;
  const info = await FS.getInfoAsync(MODEL_PATH);
  if (!info.exists) {
    // Reclaim the old English-only model if it's still around from a prior version.
    FS.deleteAsync(FS.documentDirectory + "ggml-base.en.bin", { idempotent: true }).catch(() => {});
    setStatus("Downloading speech model (~142 MB, one time)… 0%");
    const dl = FS.createDownloadResumable(MODEL_URL, MODEL_PATH, {}, (p) => {
      const { totalBytesWritten, totalBytesExpectedToWrite } = p;
      if (totalBytesExpectedToWrite > 0) {
        const pct = Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100);
        setStatus(`Downloading speech model (~142 MB, one time)… ${pct}%`);
      } else {
        setStatus(`Downloading speech model… ${(totalBytesWritten / 1e6).toFixed(0)} MB`);
      }
    });
    await dl.downloadAsync();
  }
  setStatus("Loading model…");
  whisperCtx = await initWhisper({ filePath: strip(MODEL_PATH) });
  return whisperCtx;
}

// 44-byte 16-bit mono PCM WAV header. Written once with a placeholder size at
// record start, then rewritten in place at stop once the real dataSize is known,
// so PCM can stream straight to disk without buffering the whole take in memory.
function wavHeader(dataSize: number, sampleRate: number, channels = 1) {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const buf = new ArrayBuffer(44);
  const view = new DataView(buf);
  let o = 0;
  const ws = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o++, s.charCodeAt(i));
  };
  ws("RIFF");
  view.setUint32(o, 36 + dataSize, true); o += 4;
  ws("WAVE");
  ws("fmt ");
  view.setUint32(o, 16, true); o += 4;
  view.setUint16(o, 1, true); o += 2; // PCM
  view.setUint16(o, channels, true); o += 2;
  view.setUint32(o, sampleRate, true); o += 4;
  view.setUint32(o, byteRate, true); o += 4;
  view.setUint16(o, blockAlign, true); o += 2;
  view.setUint16(o, bitsPerSample, true); o += 2;
  ws("data");
  view.setUint32(o, dataSize, true); o += 4;
  return new Uint8Array(buf);
}

// Hard cap so a forgotten recording can't fill the disk (streams to disk, so this
// is a disk backstop, not a memory one). 2 hours @ 16kHz mono 16-bit ≈ 230 MB.
const MAX_RECORD_SEC = 2 * 60 * 60;

// Flat waveform mark — on-palette (replaces the color mic emoji on cards and buttons).
function Waveform({ color = C.teal, scale = 1 }: { color?: string; scale?: number }) {
  const bars = [9, 17, 12, 21, 14, 8];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2.5 * scale }}>
      {bars.map((h, i) => (
        <View key={i} style={{ width: 3 * scale, height: h * scale, borderRadius: 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

// Render inline **bold** spans within a line of insight text.
function renderInline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      return (
        <Text key={keyPrefix + i} style={{ fontFamily: F.bold }}>
          {p.slice(2, -2)}
        </Text>
      );
    }
    return <Text key={keyPrefix + i}>{p}</Text>;
  });
}

// Lightweight markdown renderer for Neddy's insights: headings, action-item
// checkboxes, bullets, numbered lists, quotes, and bold — styled to the Neddy look.
function InsightsMarkdown({ text }: { text: string }) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const nodes: ReactNode[] = [];
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) {
      nodes.push(<View key={i} style={{ height: 8 }} />);
      return;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#{1,6}\s+(.*)$/))) {
      nodes.push(
        <Text key={i} style={styles.mdHeading}>
          {m[1].replace(/\*\*/g, "")}
        </Text>
      );
      return;
    }
    if ((m = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/))) {
      const checked = m[1].toLowerCase() === "x";
      const body = m[2];
      nodes.push(
        <View key={i} style={styles.mdCheckRow}>
          <View style={[styles.mdCheckbox, checked && styles.mdCheckboxOn]}>
            {checked ? <Text style={styles.mdCheckMark}>✓</Text> : null}
          </View>
          <Text style={styles.mdCheckText}>{renderInline(body, i + "c")}</Text>
        </View>
      );
      return;
    }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      nodes.push(
        <View key={i} style={styles.mdBulletRow}>
          <Text style={styles.mdBulletDot}>•</Text>
          <Text style={styles.mdBulletText}>{renderInline(m[1], i + "b")}</Text>
        </View>
      );
      return;
    }
    if ((m = line.match(/^\s*(\d+)\.\s+(.*)$/))) {
      nodes.push(
        <View key={i} style={styles.mdBulletRow}>
          <Text style={[styles.mdBulletDot, { color: C.tealDim }]}>{m[1]}.</Text>
          <Text style={styles.mdBulletText}>{renderInline(m[2], i + "n")}</Text>
        </View>
      );
      return;
    }
    if ((m = line.match(/^>\s+(.*)$/))) {
      nodes.push(
        <Text key={i} style={styles.mdQuote}>
          {renderInline(m[1], i + "q")}
        </Text>
      );
      return;
    }
    nodes.push(
      <Text key={i} style={styles.mdPara}>
        {renderInline(line, i + "p")}
      </Text>
    );
  });
  return <View>{nodes}</View>;
}

// Drawn calendar glyph (header stripe + grid dots) — on-palette, matching the app's
// drawn-icon style rather than a full-color emoji.
function CalendarGlyph({ color = C.tealDim }: { color?: string }) {
  return (
    <View style={{ width: 18, height: 17, borderWidth: 1.6, borderColor: color, borderRadius: 4, overflow: "hidden" }}>
      <View style={{ height: 5, backgroundColor: color }} />
      <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 2, paddingTop: 2, gap: 1.5 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: color, opacity: 0.55 }} />
        ))}
      </View>
    </View>
  );
}

// Live input meter — a scrolling teal waveform driven by recent mic levels (0..1).
const METER_BARS = 30;
function LiveMeter({ levels }: { levels: number[] }) {
  const data = [...levels];
  while (data.length < METER_BARS) data.unshift(0);
  const shown = data.slice(-METER_BARS);
  return (
    <View style={styles.meter}>
      {shown.map((lv, i) => (
        <View
          key={i}
          style={{
            width: 3.5,
            borderRadius: 2,
            backgroundColor: C.teal,
            height: 3 + lv * 40,
            opacity: 0.3 + lv * 0.7,
          }}
        />
      ))}
    </View>
  );
}

type Rec = {
  uri: string;
  durationMillis: number;
  date: Date;
  name?: string;
  transcript?: string;
  summary?: string;
  summaryType?: string; // which SUMMARY_TYPES style produced the summary
  synced?: number; // epoch ms of last successful Dropbox sync (cleared when metadata changes)
  audioSynced?: boolean; // the .wav has been uploaded at least once (skip re-uploading it)
  autoNamed?: boolean; // the name was generated from the summary (safe to replace; a manual rename clears it)
  syncedBase?: string; // the Dropbox filename base currently in the cloud (to clean up on rename)
  cloudId?: string; // row id in Supabase echo_recordings (once pushed to Neato Cloud)
  cloudSynced?: number; // epoch ms of last successful Neato Cloud push (cleared when metadata changes)
  cloudAudioPath?: string; // storage path in the echo-audio bucket once the .wav is uploaded (enables playback of pulled recordings)
  cloudFolderId?: string; // echo_folders.id this recording belongs to (mirrors the desktop's folders)
  origin?: string; // where it was created: "mobile" | "desktop" | "youtube"
};

type Folder = { id: string; name: string; sortOrder: number };

type ChatMsg = { role: "user" | "assistant"; content: string };
type Conversation = {
  id: string;
  title: string;
  messages: ChatMsg[];
  created: number;
  updated: number;
  cloudId?: string; // echo_conversations.id (uuid) once synced to Neato Cloud
};

const AUTOSYNC_STORE = "neato.autosync.v1";
const AUTOCLOUD_STORE = "neato.autocloud.v1";
const CHATS_STORE = "neato.chats.v1";
const FOLDERS_STORE = "neato.folders.v1";
const STYLES_STORE = "neato.summaryStyles.v1";
const DBX_REFRESH_STORE = "dropboxRefresh"; // long-lived OAuth refresh token (SecureStore)
const DBX_APP_KEY = "ms570m1vr5wecz7"; // public PKCE client id for the Neato Echo Dropbox app
const DBX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const DBX_FOLDER = "/Neato Echo";
const DBX_UPLOAD_URL = "https://content.dropboxapi.com/2/files/upload";

// Summary styles now come from the shared @neato/core package (used by desktop too).
const SUMMARY_TYPES = BUILTIN_SUMMARY_STYLES;
// Common translation targets (the LLM can handle any, these keep the picker tidy).
const TRANSLATE_LANGS = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Dutch",
  "Russian",
  "Chinese (Simplified)",
  "Japanese",
  "Korean",
  "Arabic",
  "Hindi",
];
const DEFAULT_SUMMARY_TYPE = DEFAULT_SUMMARY_STYLE;

function fmt(ms: number) {
  const s = Math.round((ms || 0) / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// Glossy filled control — molded-plastic gradient sheen over the fill + warm/teal glow.
function GlossButton({
  onPress,
  disabled,
  tone = "amber",
  children,
  style,
}: {
  onPress: () => void;
  disabled?: boolean;
  tone?: "amber" | "teal";
  children: React.ReactNode;
  style?: any;
}) {
  const bg = tone === "teal" ? C.teal : C.amber;
  const glow = tone === "teal" ? styles.glowTeal : styles.glowWarm;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.glossBtn,
        { backgroundColor: bg },
        glow,
        pressed && { transform: [{ translateY: 1 }], opacity: 0.94 },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={GLOSS as any}
        locations={GLOSS_LOC as any}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </Pressable>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });

  const [recs, setRecs] = useState<Rec[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [customStyles, setCustomStyles] = useState<SummaryStyle[]>([]);
  const [dateFilter, setDateFilter] = useState<DateRange>("all");
  // Folder filter for the home list: "all", "__unfiled" (on this phone), or a folder id.
  const [folderFilter, setFolderFilter] = useState<string>("all");
  // Built-in presets + the user's own custom summary styles.
  const allSummaryStyles = useMemo(() => [...SUMMARY_TYPES, ...customStyles], [customStyles]);
  const [loaded, setLoaded] = useState(false);

  // Recording streams 16kHz int16 PCM straight to the .wav file on disk, so memory
  // stays flat regardless of length. The header is patched with real sizes at stop.
  const fileRef = useRef<InstanceType<typeof FsFile> | null>(null);
  const handleRef = useRef<ReturnType<InstanceType<typeof FsFile>["open"]> | null>(null);
  const pcmBytesRef = useRef(0);
  const finalizingRef = useRef(false);
  const srRef = useRef(16000);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const { stream, isStreaming } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: "int16",
    onBuffer: (b) => {
      const h = handleRef.current;
      if (!h) return; // stray buffer after stop

      const i16 = new Int16Array(b.data);
      let sum = 0;
      for (let i = 0; i < i16.length; i++) {
        const v = i16[i] / 32768;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / (i16.length || 1));
      const level = Math.min(1, rms * 3.4); // amplify: speech RMS is low
      setLevels((prev) => [...prev.slice(-(METER_BARS - 1)), level]);

      try {
        const bytes = new Uint8Array(b.data);
        h.writeBytes(bytes);
        pcmBytesRef.current += bytes.length;
      } catch {
        // disk write hiccup — keep recording, drop this frame
      }
      if (b.sampleRate) srRef.current = b.sampleRate;
      setElapsed(b.timestamp || 0);
    },
  });

  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const player = useAudioPlayer(playingUri);

  const [selected, setSelected] = useState<Rec | null>(null);
  const [transcript, setTranscript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [status, setStatus] = useState("");

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryType, setSummaryType] = useState(DEFAULT_SUMMARY_TYPE);
  const [sheetTab, setSheetTab] = useState<"transcript" | "summary">("transcript");
  const [translation, setTranslation] = useState("");
  const [translationLang, setTranslationLang] = useState("");
  const [translating, setTranslating] = useState(false);
  const [showTranslate, setShowTranslate] = useState(false);
  const [busy, setBusy] = useState(false);
  // Desktop meeting notes carry a JSON segment array; phone recordings carry plain
  // text. When it's segments, we render read-only speaker bubbles instead of the
  // raw JSON in an editable field.
  const transcriptSegments = useMemo(() => parseTranscriptSegments(transcript), [transcript]);
  const [nameDraft, setNameDraft] = useState("");

  const [dbxRefresh, setDbxRefresh] = useState<string | null>(null); // "connected" = we have this
  const [dbxVerifier, setDbxVerifier] = useState<string | null>(null); // PKCE verifier for an in-progress connect
  const [dbxCode, setDbxCode] = useState(""); // the auth code the user pastes back
  const [dbxConnecting, setDbxConnecting] = useState(false);
  const dbxAccessRef = useRef<{ token: string; expiresAt: number } | null>(null); // cached short-lived access token
  const [showCloud, setShowCloud] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [session, setSession] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoCloud, setAutoCloud] = useState(false);
  const cloudInFlight = useRef<Set<string>>(new Set());

  const [showChat, setShowChat] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatView, setChatView] = useState<"list" | "thread">("list");
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatSelectMode, setChatSelectMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const chatScrollRef = useRef<any>(null);
  const activeChat = conversations.find((c) => c.id === activeChatId) || null;

  const [showInsights, setShowInsights] = useState(false);
  const [insightsText, setInsightsText] = useState("");
  const [insightsBusy, setInsightsBusy] = useState(false);
  // Custom-summary modal
  const [showStyleModal, setShowStyleModal] = useState(false);
  const [newStyleLabel, setNewStyleLabel] = useState("");
  const [newStylePrompt, setNewStylePrompt] = useState("");
  const [editingStyleKey, setEditingStyleKey] = useState<string | null>(null);
  // Folder-picker modal
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  // Folder rename/delete menu (long-press a folder header)
  const [folderMenu, setFolderMenu] = useState<Folder | null>(null);
  const [folderRenameDraft, setFolderRenameDraft] = useState("");
  // YouTube import
  const [showYouTube, setShowYouTube] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [ytBusy, setYtBusy] = useState(false);
  // Calendar view
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [calSelected, setCalSelected] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(false);
  const autoSyncInFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            uri: string;
            durationMillis: number;
            date: string;
            name?: string;
            transcript?: string;
            summary?: string;
            summaryType?: string;
            synced?: number;
            audioSynced?: boolean;
            autoNamed?: boolean;
            syncedBase?: string;
            cloudId?: string;
            cloudSynced?: number;
          }[];
          setRecs(parsed.map((p) => ({ ...p, date: new Date(p.date) })));
        }
      } catch {}
      try {
        setApiKey(await SecureStore.getItemAsync(KEY_STORE));
      } catch {}
      try {
        setDbxRefresh(await SecureStore.getItemAsync(DBX_REFRESH_STORE));
      } catch {}
      try {
        setAutoSync((await AsyncStorage.getItem(AUTOSYNC_STORE)) === "1");
      } catch {}
      try {
        // Neato Cloud sync is ON by default so users don't have to remember to Push/Pull;
        // only an explicit "0" turns it off.
        const v = await AsyncStorage.getItem(AUTOCLOUD_STORE);
        setAutoCloud(v === null ? true : v === "1");
      } catch {}
      try {
        const rawChats = await AsyncStorage.getItem(CHATS_STORE);
        if (rawChats) setConversations(JSON.parse(rawChats) as Conversation[]);
        const rawFolders = await AsyncStorage.getItem(FOLDERS_STORE);
        if (rawFolders) setFolders(JSON.parse(rawFolders) as Folder[]);
        const rawStyles = await AsyncStorage.getItem(STYLES_STORE);
        if (rawStyles) setCustomStyles(JSON.parse(rawStyles) as SummaryStyle[]);
      } catch {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const serial = recs.map((r) => ({
      uri: r.uri,
      durationMillis: r.durationMillis,
      date: r.date.toISOString(),
      name: r.name,
      transcript: r.transcript,
      summary: r.summary,
      summaryType: r.summaryType,
      synced: r.synced,
      audioSynced: r.audioSynced,
      autoNamed: r.autoNamed,
      syncedBase: r.syncedBase,
      cloudId: r.cloudId,
      cloudSynced: r.cloudSynced,
      cloudAudioPath: r.cloudAudioPath,
      cloudFolderId: r.cloudFolderId,
      origin: r.origin,
    }));
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(serial)).catch(() => {});
  }, [recs, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(FOLDERS_STORE, JSON.stringify(folders)).catch(() => {});
  }, [folders, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STYLES_STORE, JSON.stringify(customStyles)).catch(() => {});
  }, [customStyles, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(CHATS_STORE, JSON.stringify(conversations)).catch(() => {});
  }, [conversations, loaded]);

  useEffect(() => {
    if (!playingUri) return;
    // A fresh source (local file or a remote signed URL) starts at 0; seeking a
    // not-yet-loaded remote stream can throw, so just play.
    try {
      player.play();
    } catch (e) {
      Alert.alert("Playback error", String(e));
    }
  }, [playingUri]);

  // Neato Cloud (Supabase) auth session — restore on launch, track changes.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const displayName = (r: Rec) => {
    if (r.name && r.name.trim()) return r.name.trim();
    const idx = recs.findIndex((x) => x.uri === r.uri);
    return `Recording ${recs.length - (idx < 0 ? 0 : idx)}`;
  };

  // Group recordings into folder sections that mirror the desktop: unfiled phone
  // recordings first, then each folder in the desktop's sort order. Recordings whose
  // folder hasn't synced yet fall back to the unfiled section so none are hidden.
  const listSections = useMemo(() => {
    const now = Date.now();
    const visible = recs.filter((r) => isInRange(r.date.getTime(), dateFilter, now));
    const byFolder = new Map<string, Rec[]>();
    const unfiled: Rec[] = [];
    for (const r of visible) {
      if (r.cloudFolderId) {
        const arr = byFolder.get(r.cloudFolderId);
        if (arr) arr.push(r);
        else byFolder.set(r.cloudFolderId, [r]);
      } else {
        unfiled.push(r);
      }
    }
    const known = new Set(folders.map((f) => f.id));
    for (const [fid, items] of byFolder) if (!known.has(fid)) unfiled.push(...items);
    const byDate = (a: Rec, b: Rec) => b.date.getTime() - a.date.getTime();
    const out: { key: string; title: string | null; items: Rec[] }[] = [];
    if (unfiled.length) out.push({ key: "__unfiled", title: folders.length ? "On this phone" : null, items: unfiled.sort(byDate) });
    for (const f of [...folders].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const items = (byFolder.get(f.id) || []).sort(byDate);
      if (items.length) out.push({ key: f.id, title: f.name, items });
    }
    // Narrow to a single folder when one is picked; "all" shows every section.
    if (folderFilter !== "all") return out.filter((s) => s.key === folderFilter);
    return out;
  }, [recs, folders, dateFilter, folderFilter]);

  // Whether any recording is unfiled, so the "On this phone" chip only shows when
  // it would match something.
  const hasUnfiled = useMemo(() => recs.some((r) => !r.cloudFolderId || !folders.some((f) => f.id === r.cloudFolderId)), [recs, folders]);

  // If the selected folder disappears (deleted or renamed away), fall back to All so
  // the list never gets stuck showing nothing.
  useEffect(() => {
    if (folderFilter === "all" || folderFilter === "__unfiled") return;
    if (!folders.some((f) => f.id === folderFilter)) setFolderFilter("all");
  }, [folders, folderFilter]);

  // Calendar: group recordings by local calendar day, and build the month grid.
  const dayKey = (dt: Date) => `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
  const recsByDay = useMemo(() => {
    const map = new Map<string, Rec[]>();
    for (const r of recs) {
      const k = dayKey(r.date);
      const arr = map.get(k);
      if (arr) arr.push(r);
      else map.set(k, [r]);
    }
    return map;
  }, [recs]);
  const calGrid = useMemo(() => {
    const y = calMonth.getFullYear();
    const m = calMonth.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const firstWeekday = new Date(y, m, 1).getDay();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calMonth]);

  function openRec(r: Rec) {
    setPlayingUri(null); // stop any prior playback so the Play/Stop toggle is correct
    setSelected(r);
    setNameDraft(displayName(r));
    setTranscript(r.transcript ?? "");
    setSummary(r.summary ?? "");
    setSummaryType(r.summaryType ?? DEFAULT_SUMMARY_TYPE);
    setSheetTab(r.summary ? "summary" : "transcript");
    setTranslation("");
    setTranslationLang("");
    setStatus("");
  }

  // Persist a field onto a recording (and the open sheet) so it survives reload + syncs.
  function patchRec(uri: string, patch: Partial<Rec>) {
    setRecs((prev) => prev.map((r) => (r.uri === uri ? { ...r, ...patch } : r)));
    setSelected((s) => (s && s.uri === uri ? { ...s, ...patch } : s));
  }

  // Create a folder in the cloud + locally (reusing one with the same name). Returns
  // the folder, or null when offline/not signed in. Used by the folder picker + chat.
  async function createFolderCloud(name: string): Promise<Folder | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = folders.find((f) => f.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    if (!session) return null;
    const id = uuidv4();
    const sortOrder = folders.reduce((m, f) => Math.max(m, f.sortOrder), 0) + 1;
    const { error } = await supabase
      .from("echo_folders")
      .insert({ id, user_id: session.user.id, name: trimmed, sort_order: sortOrder });
    if (error) return null;
    const folder = { id, name: trimmed, sortOrder };
    setFolders((prev) => [...prev, folder]);
    return folder;
  }

  // Move a recording into a folder (folderId null = unfile). Updates local + cloud.
  async function moveRecToFolder(rec: Rec, folderId: string | null) {
    patchRec(rec.uri, { cloudFolderId: folderId ?? undefined });
    if (rec.cloudId && session) {
      await supabase.from("echo_recordings").update({ folder_id: folderId }).eq("id", rec.cloudId);
    }
  }

  // Rename a folder (cloud + local).
  async function renameFolder(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f)));
    if (session) {
      await supabase.from("echo_folders").update({ name: trimmed }).eq("id", id);
    }
  }

  // Reorder a folder by swapping sort_order with its neighbor (cloud + local).
  async function moveFolderOrder(id: string, dir: -1 | 1) {
    const sorted = [...folders].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((f) => f.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    let aOrder = a.sortOrder;
    let bOrder = b.sortOrder;
    if (aOrder === bOrder) bOrder = aOrder + dir; // break ties so the swap actually moves
    setFolders((prev) =>
      prev.map((f) =>
        f.id === a.id ? { ...f, sortOrder: bOrder } : f.id === b.id ? { ...f, sortOrder: aOrder } : f
      )
    );
    if (session) {
      await supabase.from("echo_folders").update({ sort_order: bOrder }).eq("id", a.id);
      await supabase.from("echo_folders").update({ sort_order: aOrder }).eq("id", b.id);
    }
  }

  // Delete a folder: its recordings become unfiled (not deleted), then the folder is
  // removed. Cloud + local stay in step.
  async function deleteFolderCloud(id: string) {
    setRecs((prev) =>
      prev.map((r) => (r.cloudFolderId === id ? { ...r, cloudFolderId: undefined } : r))
    );
    setFolders((prev) => prev.filter((f) => f.id !== id));
    if (session) {
      await supabase.from("echo_recordings").update({ folder_id: null }).eq("folder_id", id);
      await supabase.from("echo_folders").delete().eq("id", id);
    }
  }

  // Delete a custom summary style (cloud + local). Built-ins can't be deleted.
  async function deleteCustomStyle(style: SummaryStyle) {
    if (style.builtin) return;
    setCustomStyles((prev) => prev.filter((s) => s.key !== style.key));
    if (summaryType === style.key) setSummaryType(DEFAULT_SUMMARY_TYPE);
    if (session) {
      await supabase.from("echo_summary_styles").delete().eq("key", style.key);
    }
  }

  // Edit an existing custom style's name/prompt (cloud + local).
  async function updateCustomStyle(key: string, label: string, promptText: string) {
    if (!label.trim() || !promptText.trim()) return;
    const updated = customSummaryStyle(key, label, promptText); // re-applies persona
    setCustomStyles((prev) => prev.map((s) => (s.key === key ? updated : s)));
    if (session) {
      await supabase
        .from("echo_summary_styles")
        .update({ label: updated.label, prompt: updated.prompt })
        .eq("key", key);
    }
  }

  // Create a custom summary style from the user's own prompt; persist + sync to cloud.
  async function createCustomStyle(label: string, promptText: string): Promise<SummaryStyle | null> {
    if (!label.trim() || !promptText.trim()) return null;
    const style = customSummaryStyle(uuidv4(), label, promptText);
    setCustomStyles((prev) => [...prev, style]);
    if (session) {
      await supabase
        .from("echo_summary_styles")
        .insert({
          id: uuidv4(),
          user_id: session.user.id,
          key: style.key,
          label: style.label,
          prompt: style.prompt,
        })
        .then(
          () => {},
          () => {}
        );
    }
    return style;
  }

  function saveName() {
    if (!selected) return;
    const trimmed = nameDraft.trim();
    const idx = recs.findIndex((x) => x.uri === selected.uri);
    const positional = `Recording ${recs.length - (idx < 0 ? 0 : idx)}`;
    // Store a custom name only when it differs from the positional default.
    const next = trimmed && trimmed !== positional ? trimmed : undefined;
    // No real change (e.g. opened and closed the sheet) — don't touch flags or force a re-sync.
    if ((next ?? "") === (selected.name ?? "")) return;
    // A manual rename is user-owned: clear autoNamed so a later summary won't overwrite it,
    // and clear synced flags so both clouds re-sync the new name.
    patchRec(selected.uri, { name: next, autoNamed: false, synced: undefined, cloudSynced: undefined });
  }

  // Close the stream, patch the WAV header with real sizes, and file the recording.
  function finalize() {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    deactivateKeepAwake().catch(() => {}); // let the screen sleep again
    try {
      stream.stop();
    } catch {}
    const h = handleRef.current;
    const file = fileRef.current;
    handleRef.current = null;
    fileRef.current = null;
    const sr = srRef.current || 16000;
    const bytes = pcmBytesRef.current;
    try {
      if (h) {
        h.offset = 0; // seek back and stamp the real dataSize over the placeholder
        h.writeBytes(wavHeader(bytes, sr, 1));
        h.close();
      }
      if (bytes > 0 && file) {
        const durationMillis = Math.round((bytes / 2 / sr) * 1000);
        setRecs((prev) => [{ uri: file.uri, durationMillis, date: new Date(), origin: "mobile" }, ...prev]);
      } else if (file) {
        try {
          file.delete();
        } catch {}
      }
    } catch (e) {
      Alert.alert("Recording error", String(e));
    } finally {
      pcmBytesRef.current = 0;
      setElapsed(0);
      setLevels([]);
      finalizingRef.current = false;
    }
  }

  // Backstop: auto-stop at the hard cap so a forgotten recording can't fill the disk.
  useEffect(() => {
    if (isStreaming && elapsed >= MAX_RECORD_SEC) finalize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, isStreaming]);

  async function toggleRecord() {
    if (isStreaming) {
      finalize();
      return;
    }
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Microphone access needed",
          "Neato Echo needs your microphone to record. Turn it on in Settings, then tap Record again.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Open Settings", onPress: () => void Linking.openSettings() },
          ]
        );
        return;
      }
      const file = new FsFile(Paths.document, `rec-${Date.now()}.wav`);
      try {
        file.create({ overwrite: true });
      } catch {}
      const handle = file.open(FileMode.ReadWrite);
      handle.writeBytes(wavHeader(0, 16000, 1)); // placeholder; patched at stop
      fileRef.current = file;
      handleRef.current = handle;
      pcmBytesRef.current = 0;
      srRef.current = 16000;
      setElapsed(0);
      setLevels([]);
      await stream.start();
      activateKeepAwakeAsync().catch(() => {}); // keep capturing if the screen would sleep
    } catch (e) {
      // clean up a half-opened handle so we don't leak it
      try {
        handleRef.current?.close();
      } catch {}
      handleRef.current = null;
      fileRef.current = null;
      Alert.alert("Recording error", String(e));
    }
  }

  function remove(uri: string) {
    if (playingUri === uri) setPlayingUri(null);
    const rec = recs.find((r) => r.uri === uri);
    setRecs((prev) => prev.filter((r) => r.uri !== uri));
    if (uri && !uri.startsWith("cloud:")) {
      FS.deleteAsync(uri, { idempotent: true }).catch(() => {}); // reclaim disk (local files only)
    }
    // Cloud tombstone so the delete propagates to other devices on their next pull.
    if (rec?.cloudId && session) {
      supabase
        .from("echo_recordings")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", rec.cloudId)
        .then(
          () => {},
          () => {}
        );
    }
  }

  function confirmDelete(r: Rec, closeSheet = false) {
    Alert.alert("Delete this recording?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          remove(r.uri);
          if (closeSheet) setSelected(null);
        },
      },
    ]);
  }

  async function transcribe() {
    if (!selected) return;
    setTranscribing(true);
    setStatus("Preparing…");
    try {
      const ctx = await ensureWhisper(setStatus);
      setStatus("Transcribing on-device…");
      // Auto-detect the spoken language (multilingual model).
      const { promise } = ctx.transcribe(strip(selected.uri), { language: "auto" });
      const res = await promise;
      const text = (res?.result ?? "").trim();
      setTranscript(text || "(no speech detected)");
      patchRec(selected.uri, { transcript: text, synced: undefined, cloudSynced: undefined });
      setStatus("");
    } catch (e: any) {
      setStatus("");
      Alert.alert("Transcription failed", String(e?.message || e));
    } finally {
      setTranscribing(false);
    }
  }

  async function saveKey() {
    const t = keyInput.trim();
    if (!t) return;
    try {
      await SecureStore.setItemAsync(KEY_STORE, t);
      setApiKey(t);
      setKeyInput("");
    } catch (e) {
      Alert.alert("Could not save key", String(e));
    }
  }

  const canUseLLM = () => !!apiKey || !!session;

  // Single entry point for AI calls. BYOK key → call Anthropic directly; otherwise, if
  // signed into Neato Cloud → route through the built-in edge function (server-side key).
  async function callLLM(payload: {
    system?: string;
    messages: { role: string; content: string }[];
    max_tokens?: number;
    model?: string;
  }): Promise<any> {
    if (apiKey) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: payload.model || "claude-haiku-4-5",
          max_tokens: payload.max_tokens || 1024,
          ...(payload.system ? { system: payload.system } : {}),
          messages: payload.messages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      return data;
    }
    if (session) {
      const { data, error } = await supabase.functions.invoke("llm", { body: payload });
      if (error) throw new Error(error.message || "Neato Cloud AI error");
      if (data?.error) {
        throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "AI error");
      }
      return data;
    }
    throw new Error("Sign in to Neato Cloud (☁) or add your Anthropic key to use AI features.");
  }

  async function summarize() {
    if (!canUseLLM())
      return Alert.alert("AI not available", "Sign in to Neato Cloud (☁) or add your Anthropic key to summarize.");
    if (!transcript.trim()) return Alert.alert("Transcribe or paste a transcript first");
    setBusy(true);
    setSummary("");
    const style = allSummaryStyles.find((t) => t.key === summaryType) || SUMMARY_TYPES[0];
    try {
      const data = await callLLM({
        messages: [{ role: "user", content: summarizePrompt(style.prompt, transcript) }],
        max_tokens: 1024,
      });
      const text =
        (data?.content || [])
          .map((c: any) => c?.text)
          .filter(Boolean)
          .join("\n") || "(no content)";
      setSummary(text);
      if (selected) {
        patchRec(selected.uri, { summary: text, summaryType: style.key, synced: undefined, cloudSynced: undefined });
        // Auto-name from the summary's theme — unless the user set a manual title.
        if (!selected.name || selected.autoNamed) {
          const title = await deriveTitle(text);
          if (title) {
            patchRec(selected.uri, { name: title, autoNamed: true, synced: undefined, cloudSynced: undefined });
            setNameDraft(title);
          }
        }
      }
    } catch (e: any) {
      Alert.alert("Summarize failed", String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  // Translate the current transcript into a target language via the LLM (handles any
  // source → any target, unlike Whisper's translate which only goes to English).
  async function translateTo(lang: string) {
    if (!canUseLLM()) {
      Alert.alert("AI not available", "Sign in to Neato Cloud (☁) or add your Anthropic key to translate.");
      return;
    }
    // Translate the readable text — never the raw JSON of a segmented transcript.
    const segs = parseTranscriptSegments(transcript);
    const source = segs
      ? groupTranscriptForReading(segs, { selfName: "You" })
          .map((p) => `${p.label}: ${p.text}`)
          .join("\n\n")
      : transcript.trim();
    if (!source) {
      Alert.alert("Nothing to translate", "Transcribe this recording first.");
      return;
    }
    setShowTranslate(false);
    setTranslating(true);
    setTranslation("");
    setTranslationLang(lang);
    try {
      const data = await callLLM({
        system: `You are a translator. Translate the user's text into ${lang}. Preserve any "Speaker:" labels and line breaks. Output only the translation, with no preamble or notes.`,
        messages: [{ role: "user", content: source }],
        max_tokens: 2048,
      });
      const text =
        (data?.content || [])
          .map((c: any) => c?.text)
          .filter(Boolean)
          .join("\n") || "(no translation)";
      setTranslation(text);
    } catch (e: any) {
      setTranslationLang("");
      Alert.alert("Translation failed", String(e?.message || e));
    } finally {
      setTranslating(false);
    }
  }

  // Ask the LLM for a short Title-Case name that captures the meeting's theme.
  async function deriveTitle(summaryText: string): Promise<string | null> {
    try {
      const data = await callLLM({
        messages: [{ role: "user", content: titlePrompt(summaryText) }],
        max_tokens: 24,
      });
      const raw = (data?.content || [])
        .map((c: any) => c?.text)
        .filter(Boolean)
        .join(" ")
        .trim();
      const title = raw
        .split("\n")[0]
        .replace(/^["']|["']$/g, "")
        .replace(/[.]+$/, "")
        .trim()
        .slice(0, 60);
      return title || null;
    } catch {
      return null;
    }
  }

  // ── Dropbox OAuth (PKCE, no rebuild) ────────────────────────────────────────
  // Step 1: open Dropbox consent in the browser with a PKCE challenge (no redirect
  // URI → Dropbox shows a short auth code to copy back). token_access_type=offline
  // asks for a refresh token so we never expire again.
  function randomVerifier(len = 64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let s = "";
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function startDropboxConnect() {
    const verifier = randomVerifier();
    setDbxVerifier(verifier);
    setDbxCode("");
    const url =
      "https://www.dropbox.com/oauth2/authorize?" +
      `client_id=${DBX_APP_KEY}&response_type=code&token_access_type=offline` +
      `&code_challenge=${verifier}&code_challenge_method=plain`;
    Linking.openURL(url).catch((e) => Alert.alert("Couldn't open Dropbox", String(e)));
  }

  // Step 2: exchange the pasted code for tokens; keep the refresh token forever.
  async function completeDropboxConnect() {
    const code = dbxCode.trim();
    if (!code) return;
    if (!dbxVerifier) {
      Alert.alert("Start over", "Tap “Open Dropbox” first, then paste the code.");
      return;
    }
    setDbxConnecting(true);
    try {
      const res = await fetch(DBX_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          code_verifier: dbxVerifier,
          client_id: DBX_APP_KEY,
        }).toString(),
      });
      const data = await res.json();
      if (!res.ok || !data?.refresh_token) {
        throw new Error(data?.error_description || data?.error || `HTTP ${res.status}`);
      }
      await SecureStore.setItemAsync(DBX_REFRESH_STORE, data.refresh_token);
      dbxAccessRef.current = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in ?? 14400) * 1000,
      };
      setDbxRefresh(data.refresh_token);
      setDbxVerifier(null);
      setDbxCode("");
    } catch (e: any) {
      Alert.alert("Couldn't connect Dropbox", String(e?.message || e));
    } finally {
      setDbxConnecting(false);
    }
  }

  async function disconnectDropbox() {
    try {
      await SecureStore.deleteItemAsync(DBX_REFRESH_STORE);
    } catch {}
    dbxAccessRef.current = null;
    setDbxRefresh(null);
  }

  // ── Neato Cloud (Supabase) auth + metadata sync ─────────────────────────────
  async function signInCloud() {
    const email = authEmail.trim();
    if (!email || !authPassword) return;
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: authPassword });
      if (error) throw error;
      setAuthPassword("");
    } catch (e: any) {
      Alert.alert("Sign in failed", String(e?.message || e));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signUpCloud() {
    const email = authEmail.trim();
    if (!email || !authPassword) return;
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password: authPassword });
      if (error) throw error;
      Alert.alert("Account created", "If email confirmation is required, check your inbox, then sign in.");
      setAuthPassword("");
    } catch (e: any) {
      Alert.alert("Sign up failed", String(e?.message || e));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOutCloud() {
    await supabase.auth.signOut();
  }

  function toggleAutoCloud(v: boolean) {
    setAutoCloud(v);
    AsyncStorage.setItem(AUTOCLOUD_STORE, v ? "1" : "0").catch(() => {});
  }

  // A recording has local audio on disk (as opposed to a cloud-only pulled row).
  function hasLocalAudio(rec: Rec) {
    return !!rec.uri && !rec.uri.startsWith("cloud:") && !rec.uri.startsWith("youtube:");
  }

  // Upload a recording's local .wav to the private echo-audio bucket (streamed from
  // disk) so it can play after being pulled on another device. Returns the storage
  // path, or the existing one when there's nothing new to upload. The RLS policy
  // stamps `owner = auth.uid()`, so the upload MUST carry the user's access token.
  async function uploadAudioToCloud(rec: Rec, uid: string, id: string): Promise<string | null> {
    if (rec.cloudAudioPath) return rec.cloudAudioPath; // already in the cloud
    if (!hasLocalAudio(rec)) return null; // cloud-only row, nothing local to upload
    const token = session?.access_token;
    if (!token) return null;
    const info = await FS.getInfoAsync(rec.uri);
    if (!info.exists) return null;
    const path = `${uid}/${id}.wav`;
    const res = await new FsFile(rec.uri).upload(
      `${SUPABASE_URL}/storage/v1/object/${AUDIO_BUCKET}/${path}`,
      {
        httpMethod: "POST",
        uploadType: UploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "audio/wav",
          "x-upsert": "true",
        },
      }
    );
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Audio upload failed (${res.status}): ${(res.body || "").slice(0, 160)}`);
    }
    return path;
  }

  // Upsert one recording's metadata to Neato Cloud (idempotent by cloud id), plus a
  // one-time audio upload so the recording can be played after it's pulled elsewhere.
  async function pushOne(rec: Rec): Promise<Partial<Rec>> {
    const uid = session.user.id;
    const id = rec.cloudId || uuidv4();
    let audioPath = rec.cloudAudioPath ?? null;
    try {
      audioPath = await uploadAudioToCloud(rec, uid, id);
    } catch {
      // Best-effort: never let an audio failure block the notes push.
      audioPath = rec.cloudAudioPath ?? null;
    }
    const row = {
      id,
      user_id: uid,
      name: displayName(rec),
      recorded_at: rec.date.toISOString(),
      duration_ms: rec.durationMillis,
      transcript: rec.transcript ?? null,
      summary: rec.summary ?? null,
      summary_type: rec.summaryType ?? null,
      audio_path: audioPath,
      folder_id: rec.cloudFolderId && folders.some((f) => f.id === rec.cloudFolderId) ? rec.cloudFolderId : null,
      origin: rec.origin ?? (rec.uri.startsWith("youtube:") ? "youtube" : "mobile"),
    };
    const { error } = await supabase.from("echo_recordings").upsert(row);
    if (error) throw error;
    return { cloudId: id, cloudSynced: Date.now(), cloudAudioPath: audioPath ?? undefined };
  }

  // Push all recordings' metadata to Neato Cloud (echo_recordings). Deterministic
  // client-side ids make this an idempotent upsert; audio blobs are a later increment.
  // Push Ask-Neddy conversations to the cloud (best-effort; last-write-wins by time).
  async function pushConversations() {
    if (!session || conversations.length === 0) return;
    const { data: owned } = await supabase.from("echo_conversations").select("id");
    const ownedIds = new Set((owned || []).map((r: any) => r.id));
    const withIds = conversations.map((c) => ({
      conv: c,
      id: c.cloudId && ownedIds.has(c.cloudId) ? c.cloudId : uuidv4(),
    }));
    const rows = withIds.map(({ conv, id }) => ({
      id,
      user_id: session.user.id,
      title: conv.title,
      messages: conv.messages,
      updated_at: new Date(conv.updated || Date.now()).toISOString(),
    }));
    const { error } = await supabase.from("echo_conversations").upsert(rows);
    if (error) throw error;
    setConversations((prev) =>
      prev.map((c) => {
        const m = withIds.find((t) => t.conv.id === c.id);
        return m ? { ...c, cloudId: m.id } : c;
      })
    );
  }

  // Pull conversations and merge (newer cloud copy wins; new ones are added).
  // Mark chats deleted in the cloud so the deletion propagates to the desktop/other
  // devices on their next pull. Best-effort: local delete already happened.
  async function tombstoneChatsInCloud(cloudIds: (string | undefined)[]) {
    if (!session) return;
    const ids = cloudIds.filter((x): x is string => !!x);
    if (ids.length === 0) return;
    try {
      await supabase
        .from("echo_conversations")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
    } catch {
      // offline or transient — the chat is gone locally; cloud tombstone retries next delete
    }
  }

  async function pullConversations() {
    if (!session) return;
    const { data, error } = await supabase.from("echo_conversations").select("*");
    if (error) throw error;
    if (!data) return;
    setConversations((prev) => {
      let merged = [...prev];
      for (const row of data) {
        const rowUpdated = new Date(row.updated_at).getTime();
        const idx = merged.findIndex((c) => c.cloudId === row.id);
        // Cloud tombstone: the chat was deleted on another device — drop the local copy.
        if (row.deleted_at) {
          if (idx >= 0) merged.splice(idx, 1);
          continue;
        }
        if (idx >= 0) {
          if (rowUpdated > (merged[idx].updated || 0)) {
            merged[idx] = {
              ...merged[idx],
              title: row.title || merged[idx].title,
              messages: row.messages || [],
              updated: rowUpdated,
            };
          }
        } else {
          merged.unshift({
            id: `chat-${row.id}`,
            cloudId: row.id,
            title: row.title || "Chat",
            messages: row.messages || [],
            created: new Date(row.created_at).getTime() || rowUpdated,
            updated: rowUpdated,
          });
        }
      }
      // Stable, device-identical order: newest edit first, ties broken deterministically.
      merged.sort((a, b) => (b.updated || 0) - (a.updated || 0) || (b.created || 0) - (a.created || 0) || String(a.cloudId || a.id).localeCompare(String(b.cloudId || b.id)));
      return merged;
    });
  }

  async function pushToCloud(opts: { silent?: boolean } = {}) {
    if (!session) return;
    setCloudBusy(true);
    try {
      const uid = session.user.id;
      // Ids the CURRENT account owns (RLS returns only ours). A cloudId not in here
      // is stale/foreign — e.g. from a previous account — so reusing it would violate
      // RLS on upsert; mint a fresh id instead so it lands as a new row we own.
      const { data: ownedRows } = await supabase.from("echo_recordings").select("id");
      const ownedIds = new Set((ownedRows || []).map((r: any) => r.id));
      const ownFolderIds = new Set(folders.map((f) => f.id));
      const withIds = recs.map((r) => ({
        rec: r,
        id: r.cloudId && ownedIds.has(r.cloudId) ? r.cloudId : uuidv4(),
      }));
      // Upload any not-yet-uploaded local audio first (best-effort per recording),
      // so the pushed rows carry a playable audio_path.
      const audioByUri = new Map<string, string | null>();
      for (const { rec, id } of withIds) {
        let audioPath = rec.cloudAudioPath ?? null;
        try {
          audioPath = await uploadAudioToCloud(rec, uid, id);
        } catch {
          audioPath = rec.cloudAudioPath ?? null;
        }
        audioByUri.set(rec.uri, audioPath);
      }
      const rows = withIds.map(({ rec, id }) => ({
        id,
        user_id: uid,
        name: displayName(rec),
        recorded_at: rec.date.toISOString(),
        duration_ms: rec.durationMillis,
        transcript: rec.transcript ?? null,
        summary: rec.summary ?? null,
        summary_type: rec.summaryType ?? null,
        audio_path: audioByUri.get(rec.uri) ?? null,
        folder_id: rec.cloudFolderId && ownFolderIds.has(rec.cloudFolderId) ? rec.cloudFolderId : null,
        origin: rec.origin ?? (rec.uri.startsWith("youtube:") ? "youtube" : "mobile"),
      }));
      if (rows.length) {
        const { error } = await supabase.from("echo_recordings").upsert(rows);
        if (error) throw error;
        const at = Date.now();
        setRecs((prev) =>
          prev.map((r) => {
            const m = withIds.find((t) => t.rec.uri === r.uri);
            if (!m) return r;
            const audioPath = audioByUri.get(r.uri);
            return {
              ...r,
              cloudId: m.id,
              cloudSynced: at,
              cloudAudioPath: audioPath ?? r.cloudAudioPath,
            };
          })
        );
      }
      await pushConversations().catch(() => {}); // best-effort; don't fail the recordings push
      if (!opts.silent)
        Alert.alert("Synced", `${rows.length} recording${rows.length === 1 ? "" : "s"} pushed to Neato Cloud.`);
    } catch (e: any) {
      if (!opts.silent) Alert.alert("Cloud sync failed", String(e?.message || e));
      else throw e;
    } finally {
      setCloudBusy(false);
    }
  }

  // Pull cloud recordings and merge in any not present locally (metadata only for now;
  // audio isn't synced yet, so pulled-only items show notes but can't play audio).
  async function pullFromCloud(opts: { silent?: boolean } = {}) {
    if (!session) return;
    setCloudBusy(true);
    try {
      const { data, error } = await supabase
        .from("echo_recordings")
        .select("*")
        .is("deleted_at", null)
        .order("recorded_at", { ascending: false });
      if (error) throw error;

      // Fetch folders too, so the list can group recordings like the desktop does.
      const { data: folderData } = await supabase
        .from("echo_folders")
        .select("*")
        .order("sort_order", { ascending: true });
      if (folderData) {
        setFolders(
          folderData.map((f: any) => ({
            id: f.id,
            name: f.name,
            sortOrder: f.sort_order ?? 0,
          }))
        );
      }

      // Pull the user's custom summary styles too (shared across their devices).
      const { data: styleData } = await supabase.from("echo_summary_styles").select("*");
      if (styleData) {
        setCustomStyles(
          styleData.map((s: any) => ({
            key: s.key,
            label: s.label,
            prompt: s.prompt,
            builtin: false,
          }))
        );
      }

      const byId = new Map<string, any>((data || []).map((row: any) => [row.id, row]));
      const cloudIds = new Set(byId.keys());
      const have = new Set(recs.map((r) => r.cloudId).filter(Boolean));
      const additions: Rec[] = (data || [])
        .filter((row: any) => !have.has(row.id))
        .map((row: any) => ({
          uri: `cloud:${row.id}`,
          durationMillis: row.duration_ms || 0,
          date: new Date(row.recorded_at),
          name: row.name,
          transcript: row.transcript || undefined,
          summary: row.summary || undefined,
          summaryType: row.summary_type || undefined,
          cloudId: row.id,
          cloudSynced: Date.now(), // already in the cloud; don't auto-push back
          cloudAudioPath: row.audio_path || undefined,
          cloudFolderId: row.folder_id || undefined,
          origin: row.origin || undefined,
        }));

      // Reconcile: prune pull-only recordings that no longer exist in the cloud
      // (deleted or de-duplicated elsewhere). Only cloud-origin phantoms are
      // removed — locally recorded items are never touched, even if pushed.
      const isStaleCloud = (r: Rec) =>
        r.uri.startsWith("cloud:") && !!r.cloudId && !cloudIds.has(r.cloudId);
      const removed = recs.filter(isStaleCloud).length;

      // Refresh metadata on cloud-origin recordings already present locally, so
      // edits made elsewhere (e.g. a backfilled duration, a renamed note) show up.
      const refreshCloudRec = (r: Rec): Rec => {
        if (!r.uri.startsWith("cloud:") || !r.cloudId) return r;
        const row = byId.get(r.cloudId);
        if (!row) return r;
        return {
          ...r,
          durationMillis: row.duration_ms || 0,
          date: new Date(row.recorded_at),
          name: row.name,
          transcript: row.transcript || undefined,
          summary: row.summary || undefined,
          summaryType: row.summary_type || undefined,
          cloudAudioPath: row.audio_path || undefined,
          cloudFolderId: row.folder_id || undefined,
          origin: row.origin || r.origin,
        };
      };

      setRecs((prev) => [
        ...additions,
        ...prev.filter((r) => !isStaleCloud(r)).map(refreshCloudRec),
      ]);

      await pullConversations().catch(() => {}); // merge chat history too (best-effort)

      const parts = [];
      if (additions.length) parts.push(`${additions.length} added`);
      if (removed) parts.push(`${removed} removed`);
      if (!opts.silent)
        Alert.alert(
          "Pulled",
          parts.length ? `${parts.join(", ")}.` : "You're up to date — nothing changed."
        );
    } catch (e: any) {
      if (!opts.silent) Alert.alert("Pull failed", String(e?.message || e));
      else throw e;
    } finally {
      setCloudBusy(false);
    }
  }

  // Pull-to-refresh on the home list: full two-way sync (push then pull) with no
  // dialogs — the list just updates. Opens the cloud sheet if not signed in.
  async function swipeSync() {
    if (!session) {
      setShowCloud(true);
      return;
    }
    setRefreshing(true);
    // Push and pull independently — a push failure must not skip the pull, so a
    // swipe always brings cloud changes down even if the upload half hiccups.
    try {
      await pushToCloud({ silent: true });
    } catch {
      // ignore; still pull below
    }
    try {
      await pullFromCloud({ silent: true });
    } catch {
      // ignore; list stays as-is
    }
    setRefreshing(false);
  }

  // Return a valid short-lived access token, refreshing from the stored refresh token
  // when the cached one is missing or within 60s of expiry.
  async function getAccessToken(): Promise<string> {
    const cached = dbxAccessRef.current;
    if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
    const refresh = dbxRefresh || (await SecureStore.getItemAsync(DBX_REFRESH_STORE));
    if (!refresh) throw new Error("Dropbox not connected");
    const res = await fetch(DBX_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh,
        client_id: DBX_APP_KEY,
      }).toString(),
    });
    const data = await res.json();
    if (!res.ok || !data?.access_token) {
      throw new Error(data?.error_description || data?.error || `token refresh ${res.status}`);
    }
    dbxAccessRef.current = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 14400) * 1000,
    };
    return data.access_token;
  }

  // Readable, ASCII-safe Dropbox filename base from the recording's title + a short
  // stable id (unique + legible on the PC). The full title still lives in the .json.
  function computeSyncBase(rec: Rec) {
    const rawId = rec.uri.split("/").pop() || `rec-${Date.now()}.wav`;
    return syncBaseName(displayName(rec), rawId);
  }

  async function dropboxDelete(token: string, path: string) {
    try {
      await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
    } catch {
      // best-effort cleanup; a missing old file is fine
    }
  }

  // Upload a recording's .wav (streamed from disk) + a .json sidecar to Dropbox at `base`.
  async function uploadToDropbox(rec: Rec, token: string, base: string, opts: { audio?: boolean } = {}) {
    const audio = opts.audio !== false;
    if (audio) {
      const wavArg = {
        path: `${DBX_FOLDER}/${base}.wav`,
        mode: "overwrite",
        mute: true,
        autorename: false,
      };
      const res = await new FsFile(rec.uri).upload(DBX_UPLOAD_URL, {
        httpMethod: "POST",
        uploadType: UploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify(wavArg),
        },
      });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Audio upload failed (${res.status}): ${(res.body || "").slice(0, 180)}`);
      }
    }
    const meta = {
      name: displayName(rec),
      date: rec.date.toISOString(),
      durationMillis: rec.durationMillis,
      transcript: rec.transcript || "",
      summary: rec.summary || "",
      summaryType: rec.summaryType || "",
      audio: `${base}.wav`,
      app: "Neato Echo",
    };
    const jsonArg = {
      path: `${DBX_FOLDER}/${base}.json`,
      mode: "overwrite",
      mute: true,
      autorename: false,
    };
    const r2 = await fetch(DBX_UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify(jsonArg),
      },
      body: JSON.stringify(meta, null, 2),
    });
    if (!r2.ok) {
      const t = await r2.text().catch(() => "");
      throw new Error(`Notes upload failed (${r2.status}): ${t.slice(0, 180)}`);
    }
  }

  // Single push path used by manual + auto sync. Renames delete the old cloud files first,
  // then re-upload (audio included) under the new name, so the .wav/.json pair never splits.
  async function pushToDropbox(rec: Rec, token: string): Promise<Partial<Rec>> {
    const base = computeSyncBase(rec);
    const baseChanged = !!rec.syncedBase && rec.syncedBase !== base;
    if (baseChanged) {
      await dropboxDelete(token, `${DBX_FOLDER}/${rec.syncedBase}.wav`);
      await dropboxDelete(token, `${DBX_FOLDER}/${rec.syncedBase}.json`);
    }
    await uploadToDropbox(rec, token, base, { audio: baseChanged || !rec.audioSynced });
    return { synced: Date.now(), audioSynced: true, syncedBase: base };
  }

  async function syncSelected() {
    if (!selected) return;
    if (!dbxRefresh) {
      setShowCloud(true);
      return;
    }
    setSyncing(true);
    try {
      const token = await getAccessToken();
      // fold in whatever's on screen now (edited transcript / fresh summary)
      const recToSync: Rec = { ...selected, transcript, summary };
      const patch = await pushToDropbox(recToSync, token);
      patchRec(selected.uri, { transcript, summary, ...patch });
    } catch (e: any) {
      Alert.alert("Sync failed", String(e?.message || e));
    } finally {
      setSyncing(false);
    }
  }

  // Auto-sync: when enabled + connected, upload any recording whose cloud copy is
  // stale (new, or transcript/summary changed), one at a time. Audio uploads once.
  useEffect(() => {
    if (!autoSync || !dbxRefresh || !loaded) return;
    const pending = recs.find((r) => !r.synced && !autoSyncInFlight.current.has(r.uri));
    if (!pending) return;
    autoSyncInFlight.current.add(pending.uri);
    (async () => {
      try {
        const token = await getAccessToken();
        const patch = await pushToDropbox(pending, token);
        patchRec(pending.uri, patch);
      } catch {
        // leave it unsynced; a later change, toggle, or app restart retries
      } finally {
        autoSyncInFlight.current.delete(pending.uri);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs, autoSync, dbxRefresh, loaded]);

  function toggleAutoSync(v: boolean) {
    setAutoSync(v);
    AsyncStorage.setItem(AUTOSYNC_STORE, v ? "1" : "0").catch(() => {});
  }

  // Auto-sync to Neato Cloud: when enabled + signed in, push any recording whose cloud
  // copy is stale (new or metadata changed), one at a time.
  useEffect(() => {
    if (!autoCloud || !session || !loaded) return;
    const pending = recs.find((r) => !r.cloudSynced && !cloudInFlight.current.has(r.uri));
    if (!pending) return;
    cloudInFlight.current.add(pending.uri);
    (async () => {
      try {
        const patch = await pushOne(pending);
        patchRec(pending.uri, patch);
      } catch {
        // leave it unsynced; a later change, toggle, or app restart retries
      } finally {
        cloudInFlight.current.delete(pending.uri);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs, autoCloud, session, loaded]);

  // Full Neato Cloud sync (push + pull: recordings, folders, chats) on launch and whenever
  // the app returns to the foreground — so nothing needs a manual Push/Pull. Guarded so
  // overlapping runs can't stack.
  const cloudSyncRunning = useRef(false);
  useEffect(() => {
    if (!loaded || !session || !autoCloud) return;
    const runCloudSync = async () => {
      if (cloudSyncRunning.current) return;
      cloudSyncRunning.current = true;
      try {
        try {
          await pushToCloud({ silent: true });
        } catch {}
        try {
          await pullFromCloud({ silent: true });
        } catch {}
      } finally {
        cloudSyncRunning.current = false;
      }
    };
    void runCloudSync();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void runCloudSync();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, session, autoCloud]);

  // Map local recordings to the shared RecordingMeta shape and build the LLM context
  // via @neato/core (same logic the desktop + cloud use).
  function buildChatContext(): string {
    return buildContext(
      recs.map((r) => ({
        id: r.uri,
        name: displayName(r),
        date: r.date.toISOString(),
        durationMillis: r.durationMillis,
        transcript: r.transcript,
        summary: r.summary,
        summaryType: r.summaryType,
      }))
    );
  }

  // ── Conversation management (persisted history) ─────────────────────────────
  function openChatModal() {
    exitChatSelectMode();
    if (conversations.length === 0) {
      newChat();
    } else {
      setActiveChatId(null);
      setChatView("list");
    }
    setShowChat(true);
  }

  function exitChatSelectMode() {
    setChatSelectMode(false);
    setSelectedChatIds([]);
  }

  function toggleChatSelect(id: string) {
    setSelectedChatIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function deleteSelectedChats() {
    const ids = selectedChatIds;
    if (ids.length === 0) return;
    Alert.alert(`Delete ${ids.length} chat${ids.length > 1 ? "s" : ""}?`, "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          const cloudIds = conversations.filter((c) => ids.includes(c.id)).map((c) => c.cloudId);
          setConversations((prev) => prev.filter((c) => !ids.includes(c.id)));
          void tombstoneChatsInCloud(cloudIds);
          exitChatSelectMode();
        },
      },
    ]);
  }

  function newChat() {
    const id = `chat-${Date.now()}`;
    const now = Date.now();
    setConversations((prev) => [
      { id, title: "New chat", messages: [], created: now, updated: now },
      ...prev,
    ]);
    setActiveChatId(id);
    setChatInput("");
    setChatView("thread");
  }

  function openChat(id: string) {
    exitChatSelectMode();
    setActiveChatId(id);
    setChatInput("");
    setChatView("thread");
  }

  function backToChatList() {
    // Drop an untouched "New chat" so empties don't pile up.
    setConversations((prev) => prev.filter((c) => c.id !== activeChatId || c.messages.length > 0));
    setActiveChatId(null);
    setChatView("list");
  }

  function deleteChat(id: string) {
    Alert.alert("Delete this chat?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          const cloudId = conversations.find((c) => c.id === id)?.cloudId;
          setConversations((prev) => prev.filter((c) => c.id !== id));
          void tombstoneChatsInCloud([cloudId]);
          if (activeChatId === id) {
            setActiveChatId(null);
            setChatView("list");
          }
        },
      },
    ]);
  }

  // Find the recording a chat directive refers to, by fuzzy title match.
  function findRecByName(q: string): Rec | null {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    const exact = recs.find((r) => displayName(r).toLowerCase() === s);
    if (exact) return exact;
    return (
      recs.find((r) => {
        const n = displayName(r).toLowerCase();
        return n.includes(s) || s.includes(n);
      }) || null
    );
  }

  // Parse and run any <<MOVE ...>> / <<NEWFOLDER ...>> directives the assistant emitted.
  // Returns the reply with directives stripped, plus authoritative result lines.
  async function applyChatActions(text: string): Promise<{ cleaned: string; results: string[] }> {
    const results: string[] = [];
    const dirRe = /<<\s*(MOVE|NEWFOLDER)\s+([^>]*?)>>/g;
    const attr = (s: string, k: string) => {
      const mm = s.match(new RegExp(k + '\\s*=\\s*"([^"]*)"'));
      return mm ? mm[1] : "";
    };
    const found: { type: string; note: string; folder: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = dirRe.exec(text))) {
      found.push({ type: m[1], note: attr(m[2], "note"), folder: attr(m[2], "folder") });
    }
    for (const d of found) {
      if (d.type === "NEWFOLDER" && d.folder) {
        const f = await createFolderCloud(d.folder);
        results.push(f ? `Created folder "${f.name}"` : `Couldn't create folder "${d.folder}"`);
      } else if (d.type === "MOVE" && d.note && d.folder) {
        const rec = findRecByName(d.note);
        if (!rec) {
          results.push(`Couldn't find a recording matching "${d.note}"`);
          continue;
        }
        const f = await createFolderCloud(d.folder);
        if (!f) {
          results.push(`Couldn't open folder "${d.folder}"`);
          continue;
        }
        await moveRecToFolder(rec, f.id);
        results.push(`Moved "${displayName(rec)}" to "${f.name}"`);
      }
    }
    const cleaned = text.replace(dirRe, "").replace(/\n{3,}/g, "\n\n").trim();
    return { cleaned, results };
  }

  async function sendChat() {
    const q = chatInput.trim();
    const convId = activeChatId;
    if (!q || chatBusy || !convId) return;
    if (!canUseLLM()) {
      Alert.alert("AI not available", "Sign in to Neato Cloud (☁) or add your Anthropic key to chat.");
      return;
    }
    const context = buildChatContext();
    if (!context) {
      Alert.alert("Nothing to search yet", "Transcribe or summarize a recording first, then ask about it.");
      return;
    }
    const conv = conversations.find((c) => c.id === convId);
    const history: ChatMsg[] = [...(conv?.messages ?? []), { role: "user", content: q }];
    const nextTitle =
      conv && conv.messages.length === 0 ? q.replace(/\s+/g, " ").slice(0, 48) : conv?.title || "Chat";
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, messages: history, title: nextTitle, updated: Date.now() } : c))
    );
    setChatInput("");
    setChatBusy(true);
    requestAnimationFrame(() => chatScrollRef.current?.scrollToEnd?.({ animated: true }));
    try {
      // Give the assistant a way to organize recordings: it emits a directive line
      // the app executes (create folder / move recording), plus a plain-language reply.
      const orgSystem =
        chatSystem(context) +
        "\n\n## Organizing\nYou can move recordings into folders and create folders. When the user asks you to, " +
        "include ONE directive on its own line, then confirm in plain language:\n" +
        '- Move a recording: <<MOVE note="exact recording title" folder="folder name">>\n' +
        '- Create a folder: <<NEWFOLDER folder="folder name">>\n' +
        "A missing folder is created automatically when moving. Use the exact titles/folders below.\n" +
        "Recordings: " +
        recs.slice(0, 60).map((r) => `"${displayName(r)}"`).join(", ") +
        "\nFolders: " +
        (folders.length ? folders.map((f) => `"${f.name}"`).join(", ") : "(none yet)");
      const data = await callLLM({
        system: orgSystem,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: 1024,
      });
      const raw =
        (data?.content || [])
          .map((c: any) => c?.text)
          .filter(Boolean)
          .join("\n") || "(no answer)";
      const { cleaned, results } = await applyChatActions(raw);
      const text =
        results.length > 0
          ? (cleaned ? cleaned + "\n\n" : "") + results.map((r) => "• " + r).join("\n")
          : cleaned || raw;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, messages: [...c.messages, { role: "assistant", content: text }], updated: Date.now() }
            : c
        )
      );
    } catch (e: any) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: [...c.messages, { role: "assistant", content: "⚠️ " + String(e?.message || e) }],
                updated: Date.now(),
              }
            : c
        )
      );
    } finally {
      setChatBusy(false);
      requestAnimationFrame(() => chatScrollRef.current?.scrollToEnd?.({ animated: true }));
    }
  }

  // Import a YouTube video's captions as a recording — fully on-device (the phone
  // fetches the caption track directly; no backend). Works when the video has captions.
  async function importYouTube() {
    const id = parseYouTubeId(ytUrl);
    if (!id) {
      Alert.alert("Invalid link", "Paste a YouTube video URL (or its 11-character id).");
      return;
    }
    setYtBusy(true);
    try {
      const page = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const html = await page.text();
      const pr = extractBalancedJson(html, "ytInitialPlayerResponse");
      if (!pr) throw new Error("Couldn't read this video's page.");
      const title = pr?.videoDetails?.title || "YouTube video";
      const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!tracks || !tracks.length)
        throw new Error(
          "No captions found. This video doesn't have captions (subtitles), so there's nothing to import. Try a video that has captions."
        );
      const track = tracks.find((t: any) => (t.languageCode || "").startsWith("en")) || tracks[0];
      const capRes = await fetch(`${track.baseUrl}&fmt=json3`);
      const capJson = await capRes.json();
      const text = (capJson.events || [])
        .map((e: any) => (e.segs || []).map((s: any) => s.utf8).join(""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) throw new Error("The captions came back empty.");
      const lenSec = Number(pr?.videoDetails?.lengthSeconds || 0);
      const rec: Rec = {
        uri: `youtube:${id}`,
        durationMillis: lenSec ? lenSec * 1000 : 0,
        date: new Date(),
        name: title,
        transcript: text,
        origin: "youtube",
      };
      setRecs((prev) => [rec, ...prev]);
      setShowYouTube(false);
      setYtUrl("");
      openRec(rec);
    } catch (e: any) {
      Alert.alert("Import failed", String(e?.message || e));
    } finally {
      setYtBusy(false);
    }
  }

  function openInsights() {
    setShowInsights(true);
    if (!insightsText && !insightsBusy) generateInsights();
  }

  async function generateInsights() {
    if (!canUseLLM()) {
      Alert.alert("AI not available", "Sign in to Neato Cloud (☁) or add your Anthropic key to use insights.");
      return;
    }
    const context = buildChatContext();
    if (!context) {
      Alert.alert("Nothing to analyze yet", "Transcribe or summarize some recordings first.");
      return;
    }
    setInsightsBusy(true);
    try {
      const data = await callLLM({
        system: insightsSystem(context),
        messages: [{ role: "user", content: "Generate my insights." }],
        max_tokens: 1024,
      });
      const text =
        (data?.content || [])
          .map((c: any) => c?.text)
          .filter(Boolean)
          .join("\n") || "(no insights)";
      setInsightsText(text);
    } catch (e: any) {
      Alert.alert("Insights failed", String(e?.message || e));
    } finally {
      setInsightsBusy(false);
    }
  }

  // Play/stop the selected recording. Local recordings play straight off disk;
  // cloud-only (pulled) recordings stream from a short-lived signed URL.
  async function playSelected() {
    if (!selected) return;
    if (playingUri) {
      setPlayingUri(null);
      return;
    }
    if (hasLocalAudio(selected)) {
      setPlayingUri(selected.uri);
      return;
    }
    if (!selected.cloudAudioPath) {
      Alert.alert(
        "Audio not synced",
        "This recording's audio isn't in the cloud yet, so there's nothing to play here."
      );
      return;
    }
    try {
      const { data, error } = await supabase.storage
        .from(AUDIO_BUCKET)
        .createSignedUrl(selected.cloudAudioPath, 3600);
      if (error || !data?.signedUrl) throw error || new Error("Could not get audio URL");
      setPlayingUri(data.signedUrl);
    } catch (e: any) {
      Alert.alert("Playback error", String(e?.message || e));
    }
  }

  async function shareRec() {
    if (!selected) return;
    // Share the readable, speaker-labeled form of a segmented transcript — never raw JSON.
    const segs = parseTranscriptSegments(transcript);
    const t = segs
      ? groupTranscriptForReading(segs, { selfName: "You" })
          .map((p) => `${p.label}: ${p.text}`)
          .join("\n\n")
      : transcript.trim();
    const s = summary.trim();
    if (!t && !s) {
      Alert.alert("Nothing to share yet", "Transcribe or summarize this recording first.");
      return;
    }
    const parts = [displayName(selected), selected.date.toLocaleString()];
    if (s) parts.push("\n— Neddy's notes —\n" + s);
    if (t) parts.push("\n— Transcript —\n" + t);
    try {
      await Share.share({ message: parts.join("\n"), title: displayName(selected) });
    } catch {
      // user dismissed the share sheet
    }
  }

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {/* warm canvas glow — the mascot's amber halo */}
      <View pointerEvents="none" style={styles.canvasGlow} />
      <View pointerEvents="none" style={styles.canvasGlowInner} />

      <View style={styles.header}>
        <Image source={neddyMascot} style={styles.headMascot} resizeMode="contain" />
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>
            neato <Text style={{ color: C.teal }}>echo</Text>
          </Text>
          <Text style={styles.sub}>Record · transcribe on-device · summarize</Text>
        </View>
        <Pressable
          onPress={openChatModal}
          hitSlop={8}
          style={({ pressed }) => [styles.askBtn, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.askBtnText}>Chat</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowCalendar(true)}
          hitSlop={10}
          style={({ pressed }) => [styles.cloudBtn, pressed && { opacity: 0.8 }]}
        >
          <CalendarGlyph color={C.tealDim} />
        </Pressable>
        <Pressable
          onPress={() => setShowCloud(true)}
          hitSlop={10}
          style={({ pressed }) => [styles.cloudBtn, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.cloudGlyph}>☁</Text>
          <View style={[styles.cloudDot, { backgroundColor: dbxRefresh ? C.tealBright : "#c9bfa8" }]} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.list, isStreaming && { paddingBottom: 300 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={swipeSync}
            tintColor={C.teal}
            colors={[C.teal]}
          />
        }
      >
        {recs.length === 0 ? (
          <View style={styles.empty}>
            <Image source={neddyMascot} style={styles.emptyMascot} />
            <Text style={styles.emptyTitle}>No recordings yet</Text>
            <Text style={styles.emptyBody}>Tap the button below and Neddy will start listening.</Text>
          </View>
        ) : (
          <>
          <Pressable
            onPress={openInsights}
            style={({ pressed }) => [styles.insightsCard, pressed && { opacity: 0.9, transform: [{ translateY: 1 }] }]}
          >
            <View style={styles.insightsIcon}>
              <Text style={{ fontSize: 18, color: C.amber }}>✦</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.insightsCardTitle}>Insights</Text>
              <Text style={styles.insightsCardSub}>Themes & action items across all recordings</Text>
            </View>
            <Text style={styles.insightsChevron}>›</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setYtUrl("");
              setShowYouTube(true);
            }}
            style={({ pressed }) => [styles.insightsCard, pressed && { opacity: 0.9, transform: [{ translateY: 1 }] }]}
          >
            <View style={[styles.insightsIcon, { backgroundColor: "rgba(194,85,74,0.12)" }]}>
              <Text style={{ fontSize: 16, color: C.destructive }}>▶</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.insightsCardTitle}>Import from YouTube</Text>
              <Text style={styles.insightsCardSub}>Bring in a video's transcript (needs captions)</Text>
            </View>
            <Text style={styles.insightsChevron}>›</Text>
          </Pressable>
          <View style={styles.filterRow}>
            {DATE_RANGES.map((r) => {
              const active = dateFilter === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setDateFilter(r.key)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    active && styles.filterChipActive,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {folders.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.folderFilterRow}
              contentContainerStyle={styles.folderFilterContent}
            >
              {[
                { id: "all", name: "All folders" },
                ...(hasUnfiled ? [{ id: "__unfiled", name: "On this phone" }] : []),
                ...[...folders].sort((a, b) => a.sortOrder - b.sortOrder),
              ].map((f) => {
                const active = folderFilter === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => setFolderFilter(f.id)}
                    style={({ pressed }) => [
                      styles.filterChip,
                      active && styles.filterChipActive,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={1}>
                      {f.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          {listSections.length === 0 ? (
            <View style={styles.readEmpty}>
              <Text style={styles.readEmptyText}>Nothing in this range yet.</Text>
            </View>
          ) : null}
          {listSections.map((section) => (
            <View key={section.key}>
              {section.title ? (
                <Pressable
                  onLongPress={() => {
                    if (section.key !== "__unfiled") {
                      setFolderMenu({ id: section.key, name: section.title || "", sortOrder: 0 });
                      setFolderRenameDraft(section.title || "");
                    }
                  }}
                  style={styles.sectionHeaderRow}
                >
                  <Text style={styles.sectionHeader}>{section.title}</Text>
                  <Text style={styles.sectionCount}>{section.items.length}</Text>
                </Pressable>
              ) : null}
              {(() => {
                const now = Date.now();
                const buckets = section.items.map((r) => dateBucket(r.date.getTime(), now));
                const multi = new Set(buckets).size > 1;
                const rows: ReactNode[] = [];
                let last = "";
                section.items.forEach((r, idx) => {
                  const b = buckets[idx];
                  if (multi && b !== last) {
                    rows.push(
                      <Text key={"sh-" + section.key + "-" + b} style={styles.subHeader}>
                        {b}
                      </Text>
                    );
                    last = b;
                  }
                  rows.push(
                    <Pressable
                      key={r.uri}
                      onPress={() => openRec(r)}
                      onLongPress={() => confirmDelete(r)}
                      style={({ pressed }) => [
                        styles.card,
                        pressed && { opacity: 0.9, transform: [{ translateY: 1 }] },
                      ]}
                    >
                      <View style={styles.badge}>
                        <Waveform />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {displayName(r)}
                        </Text>
                        <View style={styles.cardMetaRow}>
                          {originBadge(r.origin) ? (
                            <View style={[styles.originChip, { backgroundColor: originBadge(r.origin)!.bg }]}>
                              <Text style={[styles.originChipText, { color: originBadge(r.origin)!.color }]}>
                                {originBadge(r.origin)!.label}
                              </Text>
                            </View>
                          ) : null}
                          <Text style={styles.cardMeta}>{r.date.toLocaleString()}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        {r.cloudSynced ? <Text style={styles.syncedMark}>☁</Text> : null}
                        <View style={styles.durPill}>
                          <Text style={styles.durText}>{fmt(r.durationMillis)}</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                });
                return rows;
              })()}
            </View>
          ))}
          </>
        )}
      </ScrollView>

      <LinearGradient
        pointerEvents="none"
        colors={["rgba(244,239,225,0)", C.bg, C.bg]}
        locations={[0, 0.45, 1]}
        style={styles.footerScrim}
      />

      <View style={styles.footer}>
        {isStreaming ? (
          <>
            <LiveMeter levels={levels} />
            <View style={styles.timerWrap}>
              <View style={styles.recDot} />
              <Text style={styles.timer}>{fmt(elapsed * 1000)}</Text>
            </View>
          </>
        ) : null}
        <GlossButton onPress={toggleRecord} tone={isStreaming ? "teal" : "amber"} style={styles.recBtn}>
          <Text style={[styles.recLabel, { color: isStreaming ? "#fff" : C.onAmber }]}>
            {isStreaming ? "◼  Stop" : "●  Record"}
          </Text>
        </GlossButton>
      </View>

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.root}>
          <StatusBar style="dark" />
          <View pointerEvents="none" style={styles.canvasGlow} />
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 60 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 4 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  onEndEditing={saveName}
                  onSubmitEditing={saveName}
                  returnKeyType="done"
                  placeholder="Recording"
                  placeholderTextColor="#b9ad99"
                  style={styles.titleInput}
                />
                <Text style={styles.renameHint}>Tap title to rename</Text>
              </View>
              <Pressable onPress={() => setSelected(null)} hitSlop={10} style={{ paddingTop: 4 }}>
                <Text style={styles.closeLink}>Close</Text>
              </Pressable>
            </View>
            {selected ? (
              <Text style={[styles.sub, { marginBottom: 18 }]}>
                {selected.date.toLocaleString()} · {fmt(selected.durationMillis)}
              </Text>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable
                onPress={playSelected}
                disabled={!selected || (!hasLocalAudio(selected) && !selected.cloudAudioPath)}
                style={({ pressed }) => [
                  styles.playBtn,
                  pressed && { opacity: 0.9 },
                  selected && !hasLocalAudio(selected) && !selected.cloudAudioPath && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.playText}>
                  {playingUri
                    ? "⏸  Stop"
                    : selected && !hasLocalAudio(selected) && !selected.cloudAudioPath
                      ? "No audio"
                      : "▶  Play"}
                </Text>
              </Pressable>
              <Pressable
                onPress={shareRec}
                style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.playText}>⤴  Share</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => {
                setNewFolderName("");
                setShowFolderModal(true);
              }}
              style={({ pressed }) => [styles.folderBar, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.folderBarLabel}>Folder</Text>
              <Text style={styles.folderBarValue} numberOfLines={1}>
                {(selected && folders.find((f) => f.id === selected.cloudFolderId)?.name) || "None"}
                {"  ›"}
              </Text>
            </Pressable>

            <View style={styles.segRow}>
              {(["transcript", "summary"] as const).map((m) => {
                const active = sheetTab === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setSheetTab(m)}
                    style={[styles.segBtn, active && styles.segBtnActive]}
                  >
                    <Text style={[styles.segText, active && styles.segTextActive]}>
                      {m === "transcript" ? "Transcript" : "Summary"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {sheetTab === "transcript" ? (
              <>
                {!transcriptSegments && (
                  <GlossButton
                    onPress={transcribe}
                    tone="amber"
                    disabled={transcribing}
                    style={{ alignSelf: "stretch", marginBottom: 10 }}
                  >
                    {transcribing ? (
                      <ActivityIndicator color={C.onAmber} />
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Waveform color={C.onAmber} scale={0.8} />
                        <Text style={[styles.recLabel, { color: C.onAmber, fontSize: 15 }]}>
                          Transcribe on-device
                        </Text>
                      </View>
                    )}
                  </GlossButton>
                )}
                {status ? <Text style={styles.status}>{status}</Text> : null}
                {transcriptSegments ? (
                  <View style={{ gap: 8 }}>
                    {groupTranscriptForReading(transcriptSegments, { selfName: "You" }).map(
                      (p, i) => (
                        <View
                          key={i}
                          style={[styles.spkRow, p.isSelf && styles.spkRowSelf]}
                        >
                          <View
                            style={[styles.spkBubble, p.isSelf ? styles.spkBubbleSelf : styles.spkBubbleOther]}
                          >
                            {!p.isSelf && <Text style={styles.spkLabel}>{p.label}</Text>}
                            <Text style={[styles.spkText, p.isSelf && styles.spkTextSelf]}>
                              {p.text}
                            </Text>
                          </View>
                        </View>
                      )
                    )}
                  </View>
                ) : (
                  <TextInput
                    value={transcript}
                    onChangeText={setTranscript}
                    placeholder="Transcript appears here (or paste one)…"
                    placeholderTextColor="#b9ad99"
                    multiline
                    style={[styles.input, { minHeight: 220, textAlignVertical: "top" }]}
                  />
                )}

                <Pressable
                  onPress={() => setShowTranslate(true)}
                  disabled={translating || !transcript.trim()}
                  style={({ pressed }) => [
                    styles.translateBtn,
                    (translating || !transcript.trim()) && { opacity: 0.5 },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={styles.translateBtnText}>
                    {translating ? "Translating…" : "Translate"}
                  </Text>
                </Pressable>

                {translation ? (
                  <View style={styles.translateCard}>
                    <View style={styles.translateHead}>
                      <Text style={styles.translateLangLabel}>{translationLang}</Text>
                      <Pressable
                        onPress={() => {
                          setTranslation("");
                          setTranslationLang("");
                        }}
                        hitSlop={8}
                      >
                        <Text style={styles.translateClear}>Clear</Text>
                      </Pressable>
                    </View>
                    <Text selectable style={styles.translateText}>
                      {translation}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                {apiKey ? (
                  <View style={styles.keyRow}>
                    <Text style={{ color: C.text, flex: 1, fontFamily: F.med, fontSize: 13 }}>
                      ✓ Anthropic key saved on this device
                    </Text>
                    <Pressable onPress={() => setApiKey(null)} hitSlop={8}>
                      <Text style={{ color: C.teal, fontFamily: F.semi }}>Change</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ marginBottom: 12 }}>
                    <TextInput
                      value={keyInput}
                      onChangeText={setKeyInput}
                      placeholder="Anthropic API key (sk-ant-…)"
                      placeholderTextColor="#b9ad99"
                      secureTextEntry
                      autoCapitalize="none"
                      style={styles.input}
                    />
                    <Pressable
                      onPress={saveKey}
                      style={({ pressed }) => [styles.smallBtn, pressed && { opacity: 0.9 }]}
                    >
                      <Text style={styles.smallBtnText}>Save key</Text>
                    </Pressable>
                  </View>
                )}
                <View style={styles.typeRow}>
                  {allSummaryStyles.map((t) => {
                    const active = summaryType === t.key;
                    return (
                      <Pressable
                        key={t.key}
                        onPress={() => setSummaryType(t.key)}
                        onLongPress={
                          t.builtin
                            ? undefined
                            : () =>
                                Alert.alert(t.label, "Custom summary style", [
                                  {
                                    text: "Edit",
                                    onPress: () => {
                                      setEditingStyleKey(t.key);
                                      setNewStyleLabel(t.label);
                                      setNewStylePrompt(
                                        t.prompt.startsWith(SUMMARY_PERSONA)
                                          ? t.prompt.slice(SUMMARY_PERSONA.length)
                                          : t.prompt
                                      );
                                      setShowStyleModal(true);
                                    },
                                  },
                                  {
                                    text: "Delete",
                                    style: "destructive",
                                    onPress: () => void deleteCustomStyle(t),
                                  },
                                  { text: "Cancel", style: "cancel" },
                                ])
                        }
                        style={({ pressed }) => [
                          styles.typeChip,
                          active && styles.typeChipActive,
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                          {t.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    onPress={() => {
                      setEditingStyleKey(null);
                      setNewStyleLabel("");
                      setNewStylePrompt("");
                      setShowStyleModal(true);
                    }}
                    style={({ pressed }) => [styles.typeChip, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={[styles.typeChipText, { color: C.teal }]}>＋ Custom</Text>
                  </Pressable>
                </View>
                <GlossButton onPress={summarize} tone="teal" disabled={busy} style={{ alignSelf: "stretch" }}>
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[styles.recLabel, { color: "#fff", fontSize: 15 }]}>
                      {summary ? "✦  Re-summarize" : "✦  Summarize with Claude"}
                    </Text>
                  )}
                </GlossButton>

                {summary ? (
                  <View style={styles.note}>
                    <View style={styles.noteHead}>
                      <Image source={neddyHead} style={styles.noteAvatar} />
                      <Text style={styles.noteTitle}>Neddy's notes</Text>
                      {SUMMARY_TYPES.find((t) => t.key === selected?.summaryType)?.label ? (
                        <View style={styles.readTypePill}>
                          <Text style={styles.readTypePillText}>
                            {SUMMARY_TYPES.find((t) => t.key === selected?.summaryType)?.label}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text selectable style={styles.noteBody}>
                      {summary}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.readEmpty}>
                    <Text style={styles.readEmptyText}>No summary yet. Pick a style and tap Summarize.</Text>
                  </View>
                )}
              </>
            )}

            {selected ? (
              <Pressable
                onPress={syncSelected}
                disabled={syncing}
                style={({ pressed }) => [
                  styles.syncBtn,
                  pressed && { opacity: 0.85 },
                  syncing && { opacity: 0.6 },
                ]}
              >
                {syncing ? (
                  <ActivityIndicator color={C.teal} />
                ) : (
                  <Text style={styles.syncBtnText}>
                    {selected.synced
                      ? "☁  Synced to Dropbox — tap to update"
                      : dbxRefresh
                        ? "☁  Sync to Dropbox"
                        : "☁  Connect Dropbox to sync"}
                  </Text>
                )}
              </Pressable>
            ) : null}

            {selected ? (
              <Pressable
                onPress={() => confirmDelete(selected, true)}
                style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.deleteText}>Delete recording</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showCloud} animationType="slide" onRequestClose={() => setShowCloud(false)}>
        <View style={styles.root}>
          <StatusBar style="dark" />
          <View pointerEvents="none" style={styles.canvasGlow} />
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 60 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
              <Text style={[styles.brand, { flex: 1, fontSize: 22 }]}>Cloud sync</Text>
              <Pressable onPress={() => setShowCloud(false)} hitSlop={10}>
                <Text style={styles.closeLink}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.label}>Neato Cloud (beta)</Text>
            {session ? (
              <>
                <View style={styles.keyRow}>
                  <Text
                    style={{ color: C.text, flex: 1, fontFamily: F.med, fontSize: 13 }}
                    numberOfLines={1}
                  >
                    ✓ Signed in as {session.user?.email}
                  </Text>
                  <Pressable onPress={signOutCloud} hitSlop={8}>
                    <Text style={{ color: C.destructive, fontFamily: F.semi }}>Sign out</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => pushToCloud()}
                    disabled={cloudBusy}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      { flex: 1, marginTop: 0 },
                      pressed && { opacity: 0.9 },
                      cloudBusy && { opacity: 0.6 },
                    ]}
                  >
                    {cloudBusy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.smallBtnText}>↑  Push</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => pullFromCloud()}
                    disabled={cloudBusy}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      { flex: 1, marginTop: 0, backgroundColor: C.surface3 },
                      pressed && { opacity: 0.9 },
                      cloudBusy && { opacity: 0.6 },
                    ]}
                  >
                    <Text style={[styles.smallBtnText, { color: C.tealDim }]}>↓  Pull</Text>
                  </Pressable>
                </View>

                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.toggleTitle}>Auto-sync to Neato Cloud</Text>
                    <Text style={styles.toggleSub}>
                      Push new and updated recordings automatically while signed in.
                    </Text>
                  </View>
                  <Switch
                    value={autoCloud}
                    onValueChange={toggleAutoCloud}
                    trackColor={{ false: "#d8cdb4", true: C.tealBright }}
                    thumbColor="#fbf8ef"
                  />
                </View>

                <Text style={styles.cloudHelp}>
                  {autoCloud
                    ? "Auto-sync is on — recordings upload on their own. Pull merges in recordings from your other devices."
                    : "Push sends your recordings' notes to Neato Cloud; Pull merges in recordings from your other devices."}{" "}
                  (Audio blob sync is coming next — for now this syncs titles, transcripts, and summaries.)
                </Text>
              </>
            ) : (
              <>
                <TextInput
                  value={authEmail}
                  onChangeText={setAuthEmail}
                  placeholder="Email"
                  placeholderTextColor="#b9ad99"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                />
                <TextInput
                  value={authPassword}
                  onChangeText={setAuthPassword}
                  placeholder="Password"
                  placeholderTextColor="#b9ad99"
                  secureTextEntry
                  style={[styles.input, { marginTop: 8 }]}
                />
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <Pressable
                    onPress={signInCloud}
                    disabled={authBusy}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      { flex: 1, marginTop: 0 },
                      pressed && { opacity: 0.9 },
                      authBusy && { opacity: 0.6 },
                    ]}
                  >
                    {authBusy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.smallBtnText}>Sign in</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={signUpCloud}
                    disabled={authBusy}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      { flex: 1, marginTop: 0, backgroundColor: C.surface3 },
                      pressed && { opacity: 0.9 },
                      authBusy && { opacity: 0.6 },
                    ]}
                  >
                    <Text style={[styles.smallBtnText, { color: C.tealDim }]}>Create account</Text>
                  </Pressable>
                </View>
                <Text style={styles.cloudHelp}>
                  Sign in to sync recordings across your devices via Neato Cloud (the built-in backend).
                </Text>
              </>
            )}

            <View style={{ height: 1, backgroundColor: C.border, marginVertical: 22 }} />

            <Text style={[styles.sub, { marginBottom: 20 }]}>
              Or sync to your own Dropbox. Files land in a "Neato Echo" folder your PC can see —
              nothing goes through anyone else's servers.
            </Text>

            {dbxRefresh ? (
              <>
                <View style={styles.keyRow}>
                  <Text style={{ color: C.text, flex: 1, fontFamily: F.med, fontSize: 13 }}>
                    ✓ Connected to Dropbox
                  </Text>
                  <Pressable onPress={disconnectDropbox} hitSlop={8}>
                    <Text style={{ color: C.destructive, fontFamily: F.semi }}>Disconnect</Text>
                  </Pressable>
                </View>

                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.toggleTitle}>Auto-sync new recordings</Text>
                    <Text style={styles.toggleSub}>
                      Upload automatically, and update the notes when you transcribe or summarize.
                    </Text>
                  </View>
                  <Switch
                    value={autoSync}
                    onValueChange={toggleAutoSync}
                    trackColor={{ false: "#d8cdb4", true: C.tealBright }}
                    thumbColor="#fbf8ef"
                  />
                </View>

                <Text style={styles.cloudHelp}>
                  {autoSync
                    ? "Auto-sync is on. New and updated recordings upload on their own — you can still tap Sync on any recording to push it now."
                    : "Open a recording and tap “Sync to Dropbox”. Each upload is a .wav plus a .json holding the name, transcript, and summary — so your PC gets everything."}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.label}>Connect Dropbox</Text>
                <Pressable
                  onPress={startDropboxConnect}
                  style={({ pressed }) => [
                    styles.smallBtn,
                    { alignSelf: "stretch" },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text style={styles.smallBtnText}>Open Dropbox to approve</Text>
                </Pressable>
                <Text style={styles.cloudHelp}>
                  Tap “Open Dropbox”, approve access, then copy the code Dropbox shows you and paste it below.
                </Text>

                <Text style={[styles.label, { marginTop: 18 }]}>Paste the code</Text>
                <TextInput
                  value={dbxCode}
                  onChangeText={setDbxCode}
                  placeholder="Paste the Dropbox code"
                  placeholderTextColor="#b9ad99"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <Pressable
                  onPress={completeDropboxConnect}
                  disabled={dbxConnecting}
                  style={({ pressed }) => [
                    styles.smallBtn,
                    { alignSelf: "stretch" },
                    pressed && { opacity: 0.9 },
                    dbxConnecting && { opacity: 0.6 },
                  ]}
                >
                  {dbxConnecting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.smallBtnText}>Connect</Text>
                  )}
                </Pressable>
                <Text style={styles.cloudHelp}>
                  You only do this once — after connecting, Neato Echo keeps itself signed in and syncs
                  automatically. No more expiring tokens.
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showChat} animationType="slide" onRequestClose={() => setShowChat(false)}>
        <KeyboardAvoidingView
          style={styles.root}
          // Inside a RN Modal the activity's adjustResize is ignored, so Android
          // needs an explicit behavior too or the keyboard covers the input.
          behavior="padding"
        >
          <StatusBar style="dark" />
          <View pointerEvents="none" style={styles.canvasGlow} />

          {chatView === "list" ? (
            <>
              <View style={styles.chatHeader}>
                {chatSelectMode ? (
                  <>
                    <Pressable onPress={exitChatSelectMode} hitSlop={10}>
                      <Text style={styles.closeLink}>Cancel</Text>
                    </Pressable>
                    <Text style={[styles.brand, { flex: 1, fontSize: 17, textAlign: "center" }]}>
                      {selectedChatIds.length} selected
                    </Text>
                    <Pressable onPress={deleteSelectedChats} hitSlop={10} disabled={selectedChatIds.length === 0}>
                      <Text
                        style={[
                          styles.closeLink,
                          { color: C.destructive },
                          selectedChatIds.length === 0 && { opacity: 0.4 },
                        ]}
                      >
                        Delete
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Image source={neddyMascot} style={styles.headMascot} resizeMode="contain" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.brand, { fontSize: 20 }]}>Chat</Text>
                      <Text style={styles.sub}>Chats across all your recordings</Text>
                    </View>
                    {conversations.length > 0 ? (
                      <Pressable onPress={() => setChatSelectMode(true)} hitSlop={10} style={{ marginRight: 14 }}>
                        <Text style={styles.closeLink}>Select</Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => setShowChat(false)} hitSlop={10}>
                      <Text style={styles.closeLink}>Close</Text>
                    </Pressable>
                  </>
                )}
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.chatList}>
                {!chatSelectMode ? (
                  <Pressable
                    onPress={newChat}
                    style={({ pressed }) => [styles.newChatBtn, pressed && { opacity: 0.9 }]}
                  >
                    <Text style={styles.newChatText}>＋  New chat</Text>
                  </Pressable>
                ) : null}

                {conversations.length === 0 ? (
                  <View style={styles.chatEmpty}>
                    <Image source={neddyMascot} style={styles.chatMascot} />
                    <Text style={styles.emptyTitle}>No chats yet</Text>
                    <Text style={styles.emptyBody}>Start one to ask Neddy about your recordings.</Text>
                  </View>
                ) : (
                  [...conversations]
                    .sort((a, b) => b.updated - a.updated)
                    .map((c) => {
                      const last = c.messages[c.messages.length - 1];
                      const selected = selectedChatIds.includes(c.id);
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => (chatSelectMode ? toggleChatSelect(c.id) : openChat(c.id))}
                          onLongPress={() => {
                            if (!chatSelectMode) {
                              setChatSelectMode(true);
                              setSelectedChatIds([c.id]);
                            }
                          }}
                          style={({ pressed }) => [
                            styles.convCard,
                            selected && styles.convCardSelected,
                            pressed && { opacity: 0.9, transform: [{ translateY: 1 }] },
                          ]}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                            {chatSelectMode ? (
                              <View style={[styles.checkDot, selected && styles.checkDotOn]}>
                                {selected ? <Text style={styles.checkMark}>✓</Text> : null}
                              </View>
                            ) : null}
                            <View style={{ flex: 1 }}>
                              <Text style={styles.convTitle} numberOfLines={1}>
                                {c.title}
                              </Text>
                              {last ? (
                                <Text style={styles.convSnippet} numberOfLines={1}>
                                  {last.content}
                                </Text>
                              ) : null}
                              <Text style={styles.convDate}>{new Date(c.updated).toLocaleString()}</Text>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })
                )}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={styles.chatHeader}>
                <Pressable onPress={backToChatList} hitSlop={10}>
                  <Text style={styles.closeLink}>‹ Chats</Text>
                </Pressable>
                <Text style={[styles.brand, { flex: 1, fontSize: 17, textAlign: "center" }]} numberOfLines={1}>
                  {activeChat?.title || "New chat"}
                </Text>
                <Pressable onPress={() => setShowChat(false)} hitSlop={10}>
                  <Text style={styles.closeLink}>Close</Text>
                </Pressable>
              </View>

              <ScrollView ref={chatScrollRef} style={{ flex: 1 }} contentContainerStyle={styles.chatList}>
                {!activeChat || activeChat.messages.length === 0 ? (
                  <View style={styles.chatEmpty}>
                    <Image source={neddyMascot} style={styles.chatMascot} />
                    <Text style={styles.emptyTitle}>Ask about anything you recorded</Text>
                    <Text style={styles.emptyBody}>Neddy answers using your transcripts and summaries.</Text>
                    <View style={styles.suggestWrap}>
                      {["What did I decide recently?", "Any action items for me?", "Summarize my last meeting"].map(
                        (s) => (
                          <Pressable
                            key={s}
                            onPress={() => setChatInput(s)}
                            style={({ pressed }) => [styles.suggestChip, pressed && { opacity: 0.85 }]}
                          >
                            <Text style={styles.suggestText}>{s}</Text>
                          </Pressable>
                        )
                      )}
                    </View>
                  </View>
                ) : (
                  activeChat.messages.map((m, i) => (
                    <View
                      key={i}
                      style={[styles.msgRow, m.role === "user" ? styles.msgRowUser : styles.msgRowAI]}
                    >
                      {m.role === "assistant" ? (
                        <Image source={neddyMascot} style={styles.msgAvatar} resizeMode="contain" />
                      ) : null}
                      <View style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAI]}>
                        <Text
                          selectable
                          style={[styles.bubbleText, m.role === "user" && { color: C.onAmber }]}
                        >
                          {m.content}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
                {chatBusy ? (
                  <View style={[styles.msgRow, styles.msgRowAI]}>
                    <Image source={neddyMascot} style={styles.msgAvatar} resizeMode="contain" />
                    <View style={[styles.bubble, styles.bubbleAI]}>
                      <ActivityIndicator color={C.teal} />
                    </View>
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.chatInputRow}>
                <TextInput
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="Ask a question…"
                  placeholderTextColor="#b9ad99"
                  multiline
                  style={styles.chatInput}
                />
                <Pressable
                  onPress={sendChat}
                  disabled={chatBusy || !chatInput.trim()}
                  style={({ pressed }) => [
                    styles.sendBtn,
                    (chatBusy || !chatInput.trim()) && { opacity: 0.4 },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text style={styles.sendBtnText}>↑</Text>
                </Pressable>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* Custom summary style creator */}
      <Modal visible={showStyleModal} transparent animationType="fade" onRequestClose={() => setShowStyleModal(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{editingStyleKey ? "Edit summary style" : "New summary style"}</Text>
            <TextInput
              value={newStyleLabel}
              onChangeText={setNewStyleLabel}
              placeholder="Name (e.g. Trade show recap)"
              placeholderTextColor="#b9ad99"
              style={styles.input}
            />
            <TextInput
              value={newStylePrompt}
              onChangeText={setNewStylePrompt}
              placeholder="Describe the summary you want Neddy to produce…"
              placeholderTextColor="#b9ad99"
              multiline
              style={[styles.input, { minHeight: 110, textAlignVertical: "top", marginTop: 10 }]}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => setShowStyleModal(false)}
                style={({ pressed }) => [styles.pickerBtnGhost, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.pickerBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (editingStyleKey) {
                    await updateCustomStyle(editingStyleKey, newStyleLabel, newStylePrompt);
                    setSummaryType(editingStyleKey);
                  } else {
                    const style = await createCustomStyle(newStyleLabel, newStylePrompt);
                    if (style) setSummaryType(style.key);
                  }
                  setEditingStyleKey(null);
                  setShowStyleModal(false);
                }}
                style={({ pressed }) => [styles.pickerBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.pickerBtnText}>{editingStyleKey ? "Save" : "Save & use"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Folder picker */}
      <Modal visible={showFolderModal} transparent animationType="fade" onRequestClose={() => setShowFolderModal(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Move to folder</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              <Pressable
                onPress={async () => {
                  if (selected) await moveRecToFolder(selected, null);
                  setShowFolderModal(false);
                }}
                style={({ pressed }) => [styles.folderOption, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.folderOptionText}>None (unfiled)</Text>
                {selected && !selected.cloudFolderId ? <Text style={styles.folderCheck}>✓</Text> : null}
              </Pressable>
              {[...folders]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={async () => {
                      if (selected) await moveRecToFolder(selected, f.id);
                      setShowFolderModal(false);
                    }}
                    style={({ pressed }) => [styles.folderOption, pressed && { opacity: 0.9 }]}
                  >
                    <Text style={styles.folderOptionText} numberOfLines={1}>
                      {f.name}
                    </Text>
                    {selected?.cloudFolderId === f.id ? <Text style={styles.folderCheck}>✓</Text> : null}
                  </Pressable>
                ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" }}>
              <TextInput
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="New folder name"
                placeholderTextColor="#b9ad99"
                style={[styles.input, { flex: 1, marginTop: 0 }]}
              />
              <Pressable
                onPress={async () => {
                  const folder = await createFolderCloud(newFolderName);
                  if (folder && selected) await moveRecToFolder(selected, folder.id);
                  setNewFolderName("");
                  setShowFolderModal(false);
                }}
                style={({ pressed }) => [styles.pickerBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.pickerBtnText}>Create</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => setShowFolderModal(false)}
              style={({ pressed }) => [styles.pickerBtnGhost, { marginTop: 10 }, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.pickerBtnGhostText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Import from YouTube */}
      <Modal visible={showYouTube} transparent animationType="fade" onRequestClose={() => setShowYouTube(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Import from YouTube</Text>
            <View style={styles.ytNote}>
              <Text style={styles.ytNoteText}>
                The video must have <Text style={{ fontFamily: F.bold }}>captions</Text> (subtitles) — Neato
                imports the caption text. Most videos have them, including auto-generated ones, but some don't.
              </Text>
            </View>
            <TextInput
              value={ytUrl}
              onChangeText={setYtUrl}
              placeholder="Paste a YouTube link…"
              placeholderTextColor="#b9ad99"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { marginTop: 12 }]}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => setShowYouTube(false)}
                style={({ pressed }) => [styles.pickerBtnGhost, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.pickerBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={importYouTube}
                disabled={ytBusy}
                style={({ pressed }) => [styles.pickerBtn, ytBusy && { opacity: 0.6 }, pressed && { opacity: 0.9 }]}
              >
                {ytBusy ? (
                  <ActivityIndicator color="#fdfbf3" />
                ) : (
                  <Text style={styles.pickerBtnText}>Import</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Translate language picker */}
      <Modal visible={showTranslate} transparent animationType="fade" onRequestClose={() => setShowTranslate(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Translate to…</Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {TRANSLATE_LANGS.map((lang) => (
                <Pressable
                  key={lang}
                  onPress={() => translateTo(lang)}
                  style={({ pressed }) => [styles.folderOption, pressed && { opacity: 0.9 }]}
                >
                  <Text style={styles.folderOptionText}>{lang}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setShowTranslate(false)}
              style={({ pressed }) => [styles.pickerBtnGhost, { marginTop: 10 }, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.pickerBtnGhostText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Calendar view */}
      <Modal visible={showCalendar} animationType="slide" onRequestClose={() => setShowCalendar(false)}>
        <View style={styles.root}>
          <StatusBar style="dark" />
          <View pointerEvents="none" style={styles.canvasGlow} />
          <View style={styles.chatHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.brand, { fontSize: 20 }]}>Calendar</Text>
              <Text style={styles.sub}>Browse recordings by day</Text>
            </View>
            <Pressable onPress={() => setShowCalendar(false)} hitSlop={10}>
              <Text style={styles.closeLink}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <View style={styles.calNav}>
              <Pressable
                onPress={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                hitSlop={12}
              >
                <Text style={styles.calNavArrow}>‹</Text>
              </Pressable>
              <Text style={styles.calMonthLabel}>
                {calMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </Text>
              <Pressable
                onPress={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                hitSlop={12}
              >
                <Text style={styles.calNavArrow}>›</Text>
              </Pressable>
            </View>

            <View style={styles.calWeekRow}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <Text key={i} style={styles.calWeekday}>
                  {d}
                </Text>
              ))}
            </View>

            <View style={styles.calGridWrap}>
              {calGrid.map((day, i) => {
                if (day == null) return <View key={i} style={styles.calCell} />;
                const k = `${calMonth.getFullYear()}-${calMonth.getMonth()}-${day}`;
                const count = recsByDay.get(k)?.length || 0;
                const selected = calSelected === k;
                return (
                  <Pressable
                    key={i}
                    onPress={() => setCalSelected(selected ? null : k)}
                    style={styles.calCell}
                  >
                    <View
                      style={[
                        styles.calDay,
                        count > 0 && !selected && styles.calDayHasRecs,
                        selected && styles.calDaySelected,
                      ]}
                    >
                      <Text style={[styles.calDayNum, selected && styles.calDayNumSelected]}>{day}</Text>
                      {count > 0 ? (
                        <View style={[styles.calDot, selected && { backgroundColor: "#fdfbf3" }]} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {calSelected ? (
              (recsByDay.get(calSelected) || [])
                .slice()
                .sort((a, b) => b.date.getTime() - a.date.getTime())
                .map((r) => (
                  <Pressable
                    key={r.uri}
                    onPress={() => {
                      setShowCalendar(false);
                      openRec(r);
                    }}
                    style={({ pressed }) => [
                      styles.card,
                      { marginTop: 10 },
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <View style={styles.badge}>
                      <Waveform />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {displayName(r)}
                      </Text>
                      <Text style={styles.cardMeta}>
                        {r.date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </Text>
                    </View>
                    <View style={styles.durPill}>
                      <Text style={styles.durText}>{fmt(r.durationMillis)}</Text>
                    </View>
                  </Pressable>
                ))
            ) : (
              <Text style={[styles.readEmptyText, { marginTop: 18 }]}>
                Tap a highlighted day to see its recordings.
              </Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Folder rename / delete */}
      <Modal visible={!!folderMenu} transparent animationType="fade" onRequestClose={() => setFolderMenu(null)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Folder</Text>
            <TextInput
              value={folderRenameDraft}
              onChangeText={setFolderRenameDraft}
              placeholder="Folder name"
              placeholderTextColor="#b9ad99"
              style={styles.input}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable
                onPress={() => setFolderMenu(null)}
                style={({ pressed }) => [styles.pickerBtnGhost, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.pickerBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (folderMenu) await renameFolder(folderMenu.id, folderRenameDraft);
                  setFolderMenu(null);
                }}
                style={({ pressed }) => [styles.pickerBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.pickerBtnText}>Save</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={() => folderMenu && moveFolderOrder(folderMenu.id, -1)}
                style={({ pressed }) => [styles.pickerBtnGhost, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.pickerBtnGhostText}>↑ Move up</Text>
              </Pressable>
              <Pressable
                onPress={() => folderMenu && moveFolderOrder(folderMenu.id, 1)}
                style={({ pressed }) => [styles.pickerBtnGhost, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.pickerBtnGhostText}>↓ Move down</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => {
                const target = folderMenu;
                if (!target) return;
                Alert.alert(
                  "Delete folder?",
                  `"${target.name}" will be removed. Its recordings are kept and become unfiled.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete folder",
                      style: "destructive",
                      onPress: async () => {
                        await deleteFolderCloud(target.id);
                        setFolderMenu(null);
                      },
                    },
                  ]
                );
              }}
              style={({ pressed }) => [{ marginTop: 14, alignItems: "center" }, pressed && { opacity: 0.8 }]}
            >
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.destructive }}>Delete folder</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showInsights} animationType="slide" onRequestClose={() => setShowInsights(false)}>
        <View style={styles.root}>
          <StatusBar style="dark" />
          <View pointerEvents="none" style={styles.canvasGlow} />
          <View style={styles.chatHeader}>
            <Image source={neddyHead} style={styles.headAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.brand, { fontSize: 20 }]}>Insights</Text>
              <Text style={styles.sub}>Across all your recordings</Text>
            </View>
            <Pressable onPress={() => setShowInsights(false)} hitSlop={10}>
              <Text style={styles.closeLink}>Close</Text>
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <View style={styles.statRow}>
              <View style={styles.statTile}>
                <Text style={styles.statNum}>{recs.length}</Text>
                <Text style={styles.statLabel}>recordings</Text>
              </View>
              <View style={styles.statTile}>
                <Text style={styles.statNum}>
                  {Math.floor(recs.reduce((n, r) => n + (r.durationMillis || 0), 0) / 60000)}m
                </Text>
                <Text style={styles.statLabel}>captured</Text>
              </View>
              <View style={styles.statTile}>
                <Text style={styles.statNum}>
                  {recs.filter((r) => r.date.getTime() >= Date.now() - 7 * 24 * 3600 * 1000).length}
                </Text>
                <Text style={styles.statLabel}>this week</Text>
              </View>
            </View>

            <Pressable
              onPress={generateInsights}
              disabled={insightsBusy}
              style={({ pressed }) => [
                styles.smallBtn,
                { alignSelf: "stretch", marginBottom: 16 },
                pressed && { opacity: 0.9 },
                insightsBusy && { opacity: 0.6 },
              ]}
            >
              {insightsBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.smallBtnText}>{insightsText ? "↻  Refresh insights" : "✦  Generate insights"}</Text>
              )}
            </Pressable>

            {insightsText ? (
              <View style={styles.note}>
                <View style={styles.noteHead}>
                  <Image source={neddyHead} style={styles.noteAvatar} />
                  <Text style={styles.noteTitle}>Neddy's insights</Text>
                </View>
                <InsightsMarkdown text={insightsText} />
              </View>
            ) : !insightsBusy ? (
              <Text style={styles.cloudHelp}>
                Neddy reads all your transcripts and summaries to surface open action items, recurring themes,
                and a short digest of what's been happening.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: "#3a2814",
  shadowOpacity: 0.12,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  canvasGlow: {
    position: "absolute",
    top: -150,
    right: -90,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(232,178,90,0.20)",
  },
  canvasGlowInner: {
    position: "absolute",
    top: -70,
    right: 10,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(207,138,52,0.10)",
  },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 64, paddingHorizontal: 20, paddingBottom: 10 },
  headAvatar: { width: 40, height: 40, borderRadius: 20 },
  // Full-body Neddy for the home header (not the circular head crop).
  headMascot: { width: 46, height: 52 },
  cloudBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
    alignItems: "center",
    justifyContent: "center",
    ...CARD_SHADOW,
  },
  cloudGlyph: { fontSize: 18, color: C.tealDim },
  cloudDot: { position: "absolute", top: 7, right: 7, width: 8, height: 8, borderRadius: 4 },
  askBtn: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    backgroundColor: C.teal,
    alignItems: "center",
    justifyContent: "center",
    ...CARD_SHADOW,
  },
  askBtnText: { fontFamily: F.bold, fontSize: 14, color: "#fff" },

  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  chatList: { padding: 16, paddingBottom: 20 },
  newChatBtn: {
    height: 50,
    borderRadius: 25,
    backgroundColor: C.teal,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    ...CARD_SHADOW,
  },
  newChatText: { fontFamily: F.bold, fontSize: 15, color: "#fff" },
  convCard: {
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    ...CARD_SHADOW,
  },
  convCardSelected: { borderColor: C.tealBright, backgroundColor: C.tealSoft },
  convTitle: { fontFamily: F.semi, fontSize: 15.5, color: C.text },
  convSnippet: { fontFamily: F.reg, fontSize: 13, color: C.sub, marginTop: 3 },
  convDate: { fontFamily: F.reg, fontSize: 11.5, color: C.sub, marginTop: 6 },
  checkDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkDotOn: { backgroundColor: C.teal, borderColor: C.teal },
  checkMark: { color: "#fff", fontSize: 13, fontFamily: F.bold, marginTop: -1 },
  chatEmpty: { alignItems: "center", marginTop: 30, paddingHorizontal: 16 },
  chatMascot: { width: 110, height: 125, resizeMode: "contain", marginBottom: 14, opacity: 0.96 },
  suggestWrap: { marginTop: 18, alignSelf: "stretch", gap: 8 },
  suggestChip: {
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  suggestText: { fontFamily: F.med, fontSize: 14, color: C.tealDim },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 12 },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowAI: { justifyContent: "flex-start" },
  msgAvatar: { width: 30, height: 34, marginBottom: 2 },
  bubble: { maxWidth: "82%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: C.amber2, borderBottomRightRadius: 6 },
  bubbleAI: {
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
    borderBottomLeftRadius: 6,
  },
  bubbleText: { fontFamily: F.reg, fontSize: 14.5, color: C.text, lineHeight: 21 },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface0,
  },
  chatInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 46,
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: F.reg,
    fontSize: 15,
    color: C.text,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.teal,
    alignItems: "center",
    justifyContent: "center",
    ...CARD_SHADOW,
  },
  sendBtnText: { color: "#fff", fontSize: 22, fontFamily: F.bold, marginTop: -2 },
  syncedMark: { fontSize: 14, color: C.tealBright },
  brand: { fontFamily: F.xbold, fontSize: 26, color: C.text, letterSpacing: 0.2 },
  sub: { marginTop: 3, fontFamily: F.med, fontSize: 12.5, color: C.sub },

  list: { padding: 16, paddingBottom: 190 },

  insightsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: "rgba(207,138,52,0.4)",
    borderTopColor: C.borderRim,
    borderRadius: 22,
    padding: 14,
    marginBottom: 14,
    ...CARD_SHADOW,
  },
  insightsIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(207,138,52,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  insightsCardTitle: { fontFamily: F.bold, fontSize: 16, color: C.text },
  insightsCardSub: { fontFamily: F.reg, fontSize: 12.5, color: C.sub, marginTop: 2 },
  insightsChevron: { fontFamily: F.bold, fontSize: 22, color: C.sub },

  statRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statTile: {
    flex: 1,
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    ...CARD_SHADOW,
  },
  statNum: { fontFamily: F.xbold, fontSize: 22, color: C.teal, fontVariant: ["tabular-nums"] },
  statLabel: { fontFamily: F.med, fontSize: 12, color: C.sub, marginTop: 3 },

  empty: { alignItems: "center", marginTop: 40, paddingHorizontal: 24 },
  emptyMascot: { width: 132, height: 150, resizeMode: "contain", marginBottom: 18, opacity: 0.96 },
  emptyTitle: { fontFamily: F.bold, fontSize: 18, color: C.text },
  emptyBody: { fontFamily: F.reg, fontSize: 14, color: C.sub, textAlign: "center", marginTop: 6, lineHeight: 20 },

  filterRow: { flexDirection: "row", gap: 8, marginTop: 4, marginBottom: 4, flexWrap: "wrap" },
  folderFilterRow: { marginTop: 2, marginBottom: 6, marginHorizontal: -2 },
  folderFilterContent: { gap: 8, paddingHorizontal: 2, paddingRight: 8 },
  filterChip: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
  },
  filterChipActive: { backgroundColor: C.teal, borderColor: C.teal },
  filterChipText: { fontFamily: F.semi, fontSize: 13, color: C.sub },
  filterChipTextActive: { color: "#fdfbf3" },
  folderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
  },
  folderBarLabel: { fontFamily: F.semi, fontSize: 14, color: C.text },
  folderBarValue: { fontFamily: F.med, fontSize: 13.5, color: C.tealDim, flexShrink: 1, textAlign: "right" },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(40,28,14,0.45)",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  pickerCard: {
    backgroundColor: C.bg,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
  },
  pickerTitle: { fontFamily: F.bold, fontSize: 18, color: C.text, marginBottom: 12 },
  pickerBtn: {
    backgroundColor: C.teal,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  pickerBtnText: { fontFamily: F.semi, fontSize: 15, color: "#fdfbf3" },
  pickerBtnGhost: {
    borderRadius: 12,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: C.border,
  },
  pickerBtnGhostText: { fontFamily: F.semi, fontSize: 15, color: C.sub },
  folderOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  folderOptionText: { fontFamily: F.med, fontSize: 15, color: C.text, flexShrink: 1 },
  folderCheck: { fontFamily: F.bold, fontSize: 16, color: C.teal },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionHeader: {
    fontFamily: F.bold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: C.sub,
  },
  sectionCount: {
    fontFamily: F.semi,
    fontSize: 11.5,
    color: C.tealDim,
    backgroundColor: C.tealSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
    overflow: "hidden",
  },
  subHeader: {
    fontFamily: F.semi,
    fontSize: 12,
    color: C.sub,
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  calNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  calNavArrow: { fontFamily: F.bold, fontSize: 26, color: C.teal, paddingHorizontal: 14 },
  calMonthLabel: { fontFamily: F.bold, fontSize: 17, color: C.text },
  calWeekRow: { flexDirection: "row", marginBottom: 4 },
  calWeekday: { width: "14.28%", textAlign: "center", fontFamily: F.semi, fontSize: 12, color: C.sub },
  calGridWrap: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.28%", alignItems: "center", paddingVertical: 4 },
  calDay: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  calDayHasRecs: { backgroundColor: C.tealSoft },
  calDaySelected: { backgroundColor: C.teal },
  calDayNum: { fontFamily: F.med, fontSize: 14.5, color: C.text },
  calDayNumSelected: { color: "#fdfbf3", fontFamily: F.bold },
  calDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.amber, marginTop: 2 },
  translateBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
  },
  translateBtnText: { fontFamily: F.semi, fontSize: 14, color: C.tealDim },
  translateCard: {
    marginTop: 12,
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
    borderRadius: 14,
    padding: 14,
    ...CARD_SHADOW,
  },
  translateHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  translateLangLabel: { fontFamily: F.bold, fontSize: 13, color: C.tealDim, letterSpacing: 0.3 },
  translateClear: { fontFamily: F.semi, fontSize: 13, color: C.teal },
  translateText: { fontFamily: F.reg, fontSize: 14.5, color: C.text, lineHeight: 22 },
  ytNote: {
    backgroundColor: "rgba(207,138,52,0.12)",
    borderWidth: 1,
    borderColor: "rgba(207,138,52,0.35)",
    borderRadius: 12,
    padding: 12,
  },
  ytNoteText: { fontFamily: F.med, fontSize: 13, color: C.onAmber, lineHeight: 19 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
    borderRadius: 22,
    padding: 13,
    marginBottom: 11,
    ...CARD_SHADOW,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: C.tealSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontFamily: F.semi, fontSize: 15.5, color: C.text },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" },
  originChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1.5 },
  originChipText: { fontFamily: F.semi, fontSize: 10.5, letterSpacing: 0.2 },
  cardMeta: { fontFamily: F.reg, fontSize: 12, color: C.sub, marginTop: 2 },
  durPill: {
    backgroundColor: C.tealSoft,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  durText: { fontFamily: F.semi, fontSize: 12.5, color: C.tealDim },

  footerScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 230 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingBottom: 42, paddingTop: 14 },
  meter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    height: 46,
    marginBottom: 8,
  },
  timerWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.destructive },
  timer: { fontFamily: F.bold, fontSize: 16, color: C.text, fontVariant: ["tabular-nums"] },

  glossBtn: {
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 36,
  },
  glowWarm: { shadowColor: "#cf8a34", shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  glowTeal: { shadowColor: "#5e9491", shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  recBtn: { minWidth: 190 },
  recLabel: { fontFamily: F.xbold, fontSize: 17, letterSpacing: 0.3 },

  titleInput: {
    fontFamily: F.xbold,
    fontSize: 22,
    color: C.text,
    paddingVertical: 2,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(94,148,145,0.4)",
  },
  renameHint: { fontFamily: F.reg, fontSize: 11, color: C.sub, marginTop: 3 },
  closeLink: { color: C.teal, fontFamily: F.bold, fontSize: 15 },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 22 },
  playBtn: {
    backgroundColor: C.tealSoft,
    borderWidth: 1,
    borderColor: "rgba(94,148,145,0.35)",
    borderRadius: 999,
    paddingHorizontal: 22,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  shareBtn: {
    backgroundColor: C.tealSoft,
    borderWidth: 1,
    borderColor: "rgba(94,148,145,0.35)",
    borderRadius: 999,
    paddingHorizontal: 22,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  playText: { fontFamily: F.bold, fontSize: 14.5, color: C.tealDim },

  label: { fontFamily: F.bold, fontSize: 12, color: C.sub, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 9 },

  segRow: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: C.surface3,
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  segBtn: { flex: 1, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  segBtnActive: { backgroundColor: C.surface0, ...CARD_SHADOW, elevation: 2 },
  segText: { fontFamily: F.bold, fontSize: 14, color: C.sub },
  segTextActive: { color: C.text },

  readTypePill: {
    marginLeft: "auto",
    backgroundColor: C.tealSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  readTypePillText: { fontFamily: F.semi, fontSize: 11.5, color: C.tealDim },
  readTranscript: {
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
    borderRadius: 16,
    padding: 16,
    ...CARD_SHADOW,
  },
  readTranscriptText: { fontFamily: F.reg, fontSize: 14.5, color: C.text, lineHeight: 22 },
  // Speaker bubbles for segmented (meeting) transcripts.
  spkRow: { flexDirection: "row", justifyContent: "flex-start" },
  spkRowSelf: { justifyContent: "flex-end" },
  spkBubble: { maxWidth: "86%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  spkBubbleOther: {
    backgroundColor: C.surface0,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
    borderTopLeftRadius: 6,
  },
  spkBubbleSelf: { backgroundColor: C.teal, borderTopRightRadius: 6 },
  spkLabel: { fontFamily: F.semi, fontSize: 11.5, color: C.tealDim, marginBottom: 3 },
  spkText: { fontFamily: F.reg, fontSize: 14.5, color: C.text, lineHeight: 21 },
  spkTextSelf: { color: "#fdfbf3" },
  readEmpty: { paddingVertical: 28, alignItems: "center" },
  readEmptyText: { fontFamily: F.reg, fontSize: 14, color: C.sub, textAlign: "center", lineHeight: 20 },

  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  typeChip: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
  },
  typeChipActive: {
    backgroundColor: C.tealSoft,
    borderColor: "rgba(94,148,145,0.55)",
  },
  typeChipText: { fontFamily: F.semi, fontSize: 13, color: C.sub },
  typeChipTextActive: { color: C.tealDim },
  status: { fontFamily: F.med, color: C.sub, marginBottom: 8, fontSize: 13 },
  input: {
    backgroundColor: C.surface0,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
    borderRadius: 14,
    padding: 13,
    color: C.text,
    fontFamily: F.reg,
    fontSize: 14.5,
    lineHeight: 20,
  },
  keyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.tealSoft,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 13,
    marginBottom: 12,
  },
  smallBtn: {
    marginTop: 10,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.teal,
    ...CARD_SHADOW,
  },
  smallBtnText: { color: "#fff", fontFamily: F.bold, fontSize: 14.5 },

  note: {
    marginTop: 22,
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
    borderRadius: 18,
    padding: 16,
    ...CARD_SHADOW,
  },
  noteHead: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 10 },
  noteAvatar: { width: 26, height: 26, borderRadius: 13 },
  noteTitle: { fontFamily: F.bold, fontSize: 15.5, color: C.teal },
  noteBody: { fontFamily: F.reg, fontSize: 14.5, color: C.text, lineHeight: 22 },
  // Insights markdown rendering
  mdHeading: {
    fontFamily: F.bold,
    fontSize: 15,
    color: C.tealDim,
    letterSpacing: 0.3,
    marginTop: 16,
    marginBottom: 8,
  },
  mdPara: { fontFamily: F.reg, fontSize: 14.5, color: C.text, lineHeight: 22, marginBottom: 6 },
  mdCheckRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  mdCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.tealBright,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  mdCheckboxOn: { backgroundColor: C.teal, borderColor: C.teal },
  mdCheckMark: { color: "#fdfbf3", fontFamily: F.bold, fontSize: 12, lineHeight: 14 },
  mdCheckText: { flex: 1, fontFamily: F.reg, fontSize: 14.5, color: C.text, lineHeight: 21 },
  mdBulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  mdBulletDot: { fontFamily: F.bold, fontSize: 15, color: C.amber, lineHeight: 21, width: 16 },
  mdBulletText: { flex: 1, fontFamily: F.reg, fontSize: 14.5, color: C.text, lineHeight: 21 },
  mdQuote: {
    fontFamily: F.reg,
    fontSize: 14.5,
    color: C.sub,
    fontStyle: "italic",
    lineHeight: 21,
    marginBottom: 8,
    paddingLeft: 12,
    borderLeftWidth: 3,
    borderLeftColor: C.tealSoft,
  },

  syncBtn: {
    marginTop: 18,
    alignSelf: "stretch",
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.tealSoft,
    borderWidth: 1,
    borderColor: "rgba(94,148,145,0.4)",
  },
  syncBtnText: { fontFamily: F.bold, fontSize: 14.5, color: C.tealDim },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface1,
    borderWidth: 1,
    borderColor: C.border,
    borderTopColor: C.borderRim,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  toggleTitle: { fontFamily: F.bold, fontSize: 14.5, color: C.text },
  toggleSub: { fontFamily: F.reg, fontSize: 12, color: C.sub, marginTop: 3, lineHeight: 17 },
  cloudHelp: { fontFamily: F.reg, fontSize: 12.5, color: C.sub, lineHeight: 19, marginTop: 16 },

  deleteBtn: {
    marginTop: 20,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  deleteText: { fontFamily: F.semi, fontSize: 14, color: C.destructive },
});
