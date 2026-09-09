# Neato Echo — Developer Handoff

> **Audience:** an experienced developer taking over / co-maintaining this codebase.
> **Goal:** give you everything needed to clone it, understand the stack, run and
> ship it, battle-test it, and build the roadmap (mobile + sync + wearable).
>
> **Repository:** <https://github.com/markhiltonapps/neato-echo> (private — access will be shared)
> **Canonical technical reference:** [`CLAUDE.md`](./CLAUDE.md) in the repo root. It is a
> long, current, per-subsystem map of the app. **Read this HANDOFF first for orientation,
> then use `CLAUDE.md` as the encyclopedia.** This document deliberately does *not* repeat
> `CLAUDE.md`; it adds the things it doesn't cover: onboarding, build/release/ops, the
> product roadmap, and the open decisions.

---

## 0. TL;DR — what you're inheriting

**Neato Echo** is a **local-first desktop app** (Windows-primary, also macOS/Linux) for
**voice dictation, meeting transcription, and AI notes**. Its selling point is privacy:
speech-to-text, summarization, chat, and semantic search can all run **entirely on the
user's machine** with no data leaving the device. It also supports optional cloud/BYOK
providers for users who want them.

- **Origin:** it's a rebrand + fork of the open-source **OpenWhispr** (MIT license). The
  `README.md` still carries the upstream OpenWhispr branding; the shipping product is
  Neato Echo. Treat OpenWhispr as the lineage, not the current product.
- **Shipping today:** Windows installer + portable builds, auto-updating from GitHub
  Releases. Current version at time of writing: **1.1.27**.
- **Where it's going:** paid **mobile apps** (iOS/Android) that record on the go and
  transcribe **on-device**, **sync** those recordings back to the desktop app, and
  eventually a **Sona-type audio wearable** that feeds the mobile app.
- **Business model (direction):** a **lifetime desktop purchase**, with a **small paid tier**
  for the mobile app + cross-device sync.

---

## 1. Tech stack at a glance

| Layer | Technology |
|---|---|
| Desktop shell | **Electron 41** (context isolation, main/renderer/preload) |
| UI | **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, shadcn/Radix |
| State | **Zustand** stores |
| Local DB | **better-sqlite3** (SQLite, WAL mode) |
| Speech-to-text (local) | **NVIDIA Parakeet** via **sherpa-onnx**; **whisper.cpp** also supported |
| LLM (local) | **llama.cpp** server (`llama-server`), default model **Qwen 3.5 2B** GGUF |
| Semantic search (local) | **Qdrant** (vector DB sidecar) + **all-MiniLM-L6-v2** embeddings via ONNX Runtime |
| ONNX inference | `onnxruntime-node` in a dedicated **utility process** (crash isolation) |
| Audio | **FFmpeg** (bundled via `ffmpeg-static`), Web Audio worklets, native OS audio helpers |
| Cloud/BYOK (optional) | OpenAI, Anthropic, Google Gemini, Groq, Mistral, xAI, plus "Neato/OpenWhispr Cloud" |
| i18n | react-i18next, **10 languages**, parity-enforced by tests |
| Packaging | **electron-builder** (NSIS installer + portable), **electron-updater** |
| Node | **24** (pinned in `.nvmrc`; `engines.node >= 24`) — see gotchas |

Native helpers (compiled from C/Swift, or downloaded prebuilt): global hotkey listeners,
mic-usage listeners, **system-audio capture helper** (meeting mode), clipboard/paste
helpers, calendar listener (macOS), acoustic-echo-cancellation helper. See
`resources/`, `scripts/download-*.js`, and `.github/workflows/build-*.yml`.

---

## 2. Repository & references

- **Code:** <https://github.com/markhiltonapps/neato-echo>
- **[`CLAUDE.md`](./CLAUDE.md)** — the deep, current, per-subsystem technical reference
  (file responsibilities, IPC channels, the transcription/echo pipeline, calendar sync
  internals, the AI provider registry, model registry, etc.). This is the single most
  valuable file in the repo for understanding *how* things work.
- **`README.md`** — upstream OpenWhispr readme (lineage/branding, not current product).
- **`LICENSE`** — MIT (inherited from OpenWhispr).
- **`docs/network-allowlist.md`** — the exact set of network endpoints the app is
  allowed to reach (important for the privacy story and for firewalled environments).
- **`.github/workflows/`** — CI: native-helper builds, CodeQL, an LLM "canary", and the
  signed build/notarize pipeline.

---

## 3. Getting started

### Prerequisites
- **Node 24** (use `nvm`: `nvm install 24 && nvm use 24`). Building/installing deps with a
  different major version will produce a `package-lock.json` that breaks `npm ci` in CI.
- Git, and platform build tooling for native helpers (Visual Studio Build Tools on
  Windows; Xcode CLT on macOS). Most native binaries are **downloaded prebuilt** during
  `predev`/`prebuild`, so you usually don't compile them yourself.
- ~a few GB of free disk for the bundled ML sidecars and the first-run model downloads.

### Install & run (development)
```bash
nvm use 24
npm ci                 # lockfile-faithful install
npm run dev            # concurrently runs the Vite renderer + Electron main
```
`predev`/`prestart` download the sidecar binaries (whisper.cpp, llama-server, sherpa-onnx,
Qdrant, yt-dlp, AEC helper, VAD/embedding/diarization models). The **embedding model** and
some ML models also **auto-download on first app launch** into `~/.cache/neato-echo/`.

### Useful scripts (`package.json`)
```bash
npm run dev            # dev (renderer + main)
npm start              # electron .  (against a built renderer)
npm run build:renderer # vite build (renderer only) -> src/dist
npm run typecheck      # cd src && tsc --noEmit
npm test               # node --import tsx --test "test/**/*.test.js"
npm run pack           # unsigned local build (electron-builder --dir)
npm run build:win      # signed Windows build (needs signing env)
```

### Producing a release build (Windows, what we ship today)
```bash
npm run build:renderer
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win nsis portable
```
This yields, under `dist/`:
`Neato-Echo-Setup-<v>.exe`, `Neato-Echo-Setup-<v>.exe.blockmap`,
`Neato-Echo-Portable-<v>.exe`, and `latest.yml`. See §7 for the full release flow.

---

## 4. Architecture overview

**Three Electron contexts** (standard, hardened): **main** process (`main.js`, IPC,
DB, window/manager lifecycle), **renderer** (the React app, context-isolated), and a
**preload** bridge (`preload.js` → `window.electronAPI`). All privileged work is IPC'd
from the renderer to main.

**Dual-window UX:** a small always-on-top **dictation pill/overlay** and a full
**Control Panel** window (Home, Chat, Notes, Upload, Dictionary, Integrations, Settings).
Both are the same React bundle, routed by URL.

**Sidecar processes** (spawned/managed by main, torn down on quit; see `sidecarRegistry`,
`sidecarReaper`, `sidecarPidFile`):
- **`llama-server`** (llama.cpp) — local LLM for cleanup/summaries/chat. Vulkan-accelerated
  where available, CPU fallback. One model loaded at a time; idle-timeout unloads to free VRAM.
- **Qdrant** — local vector DB for semantic note search.
- **sherpa-onnx websocket server(s)** — Parakeet STT (offline + online/streaming variants).
- **ONNX utility process** — hosts *all* `onnxruntime-node` inference (text + speaker
  embeddings, fbank). Native crashes are confined here and the process respawns with backoff.

**Audio / meeting capture:** dictation is MediaRecorder → IPC → temp file → STT. **Meeting
mode records two streams**: the **microphone** (labeled *"You"*) and **system audio** (the
other participants, via a native loopback helper on Windows / display-media fallback),
with an echo-leak + duplicate-suppression pipeline so the remote voice heard through the
speakers doesn't pollute the mic transcript. **This two-stream design is central to the
mobile roadmap** — see §8.

For the exhaustive file-by-file map (every helper, hook, IPC channel, the exact
transcription/diarization/echo policy seams, calendar internals, the inference-provider
registry, the model registry) → **`CLAUDE.md`**.

---

## 5. Data, storage & privacy

**Local SQLite** (better-sqlite3, WAL) is the source of truth. Tables include:
`transcriptions`, `notes`, `folders`/`folders_new`, `spaces`, `actions`,
`agent_conversations`/`agent_messages`, `custom_dictionary`, `snippets`,
`google_calendar_tokens`/`google_calendars`, `microsoft_calendar_tokens`/
`microsoft_calendars`, `apple_calendars`, `calendar_events`, `contacts`,
`speaker_profiles`/`speaker_mappings`/`note_speaker_embeddings`, `analytics_*`,
`app_meta`, and vector-purge bookkeeping. (See `src/helpers/database.js`.)

**Where things live (per-user):**
- App DB + settings: Electron `userData` (e.g. `%AppData%/neato-echo/` on Windows).
- Downloaded models & vector data: `~/.cache/neato-echo/` (whisper/parakeet models,
  embedding model, `qdrant-data/`). **App updates never touch `~/.cache`.**
- **Secrets** (BYOK API keys + enterprise creds — 12 total) are encrypted at rest with
  Electron **`safeStorage`** (OS keychain: DPAPI / Keychain / libsecret), stored as
  per-key files under `userData/secure-keys/`. Linux without a keyring falls back to
  plaintext (Electron default).
- Non-secret prefs live in `localStorage`; non-secret env (transcription provider, model)
  in `.env`.

**Privacy model:** in the default local-first configuration, **audio and text never leave
the device** — STT (Parakeet), summarization/chat (llama.cpp), and semantic search
(Qdrant + MiniLM) all run locally. Cloud is strictly opt-in (BYOK or the hosted
"Neato/OpenWhispr Cloud"). The allowlist of endpoints the app may contact is documented
in `docs/network-allowlist.md`. **Preserve this guarantee** — it's the product's core
promise and directly shapes the mobile decisions below.

> ⚠️ **Never open the live SQLite DB from another process while the app is running.** It's
> in WAL mode; an external read-write/checkpoint can corrupt it. Use the app's own IPC or
> quit the app first.

---

## 6. Core subsystems — where to look

| Subsystem | Start here |
|---|---|
| Main entry / managers | `main.js`, `src/helpers/ipcHandlers.js`, `preload.js` |
| Local STT (Parakeet/sherpa-onnx) | `src/helpers/parakeet.js`, `parakeetServer.js`, `scripts/download-sherpa-onnx.js` |
| Local STT (whisper.cpp) | `src/helpers/whisper.js`, `whisperServer.js` |
| Local LLM (llama.cpp) | `src/helpers/llamaServer.js`, `modelManagerBridge.js`, `src/models/modelRegistryData.json` |
| AI routing / providers | `src/services/ReasoningService.ts`, `src/services/ai/inferenceProviders/*`, `src/config/inferenceScopes.ts` |
| Semantic search | `src/helpers/qdrantManager.js`, `vectorIndex.js`, `localEmbeddings.js` |
| Meeting capture & pipeline | `src/stores/meetingRecordingStore.ts`, `meetingSegmentReducer.ts`, `src/helpers/meeting*` |
| Diarization / speakers | `src/utils/transcriptSpeakerState.ts`, `speaker_*` tables, `MeetingTranscriptChat.tsx` |
| Calendar (Google/MS/Apple) | `src/helpers/*CalendarManager.js`, `calendarReminderScheduler.js` |
| Notes / editor | `src/components/notes/*` (`PersonalNotesView`, `NoteEditor`, `RichTextEditor`) |
| Upload/transcribe jobs | `src/components/notes/UploadAudioView.tsx`, `src/stores/uploadJobStore.ts`, `batchQueueStore.ts` |
| Settings / models UI | `src/components/SettingsPage.tsx`, `settings/*` |
| i18n | `src/locales/<lang>/translation.json`, `test/locales/translationCoverage.test.js` |
| Design tokens / brand | `src/index.css` (`--color-brand-*`, `--font-brand`), self-hosted fonts in `src/assets/fonts/` |

---

## 7. Build, signing, release & auto-update

The current release flow (Windows) is deliberately simple and repeatable:

1. Bump `version` in `package.json`, commit `chore(release): <v>`, push.
2. `npm run build:renderer`.
3. `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win nsis portable`
   (signing via `signtool` when a cert is configured; `CSC_IDENTITY_AUTO_DISCOVERY=false`
   for unsigned local builds).
4. `git tag v<v> && git push origin v<v>`.
5. `gh release create v<v> <Setup.exe> <Setup.exe.blockmap> <Portable.exe> latest.yml
   --repo markhiltonapps/neato-echo --verify-tag --latest`.
6. Verify the update feed serves the new version:
   `https://github.com/markhiltonapps/neato-echo/releases/latest/download/latest.yml`.

**Auto-update:** `electron-updater` reads `latest.yml` from the GitHub "latest" release
(a generic feed). Existing installs pick up the new version on next launch. The
`.exe.blockmap` enables differential downloads.

**Signing:** Windows uses `signtool`. macOS builds go through the notarize workflow
(`.github/workflows/build-and-notarize.yml`) and `afterSign.js` (which skips signing when
`CSC_IDENTITY_AUTO_DISCOVERY=false`).

**Native helpers** are built by their own CI workflows and downloaded as prebuilt binaries
during `prebuild*`; you rarely compile them locally.

---

## 8. Testing & quality gates

- **Unit/integration tests:** `npm test` → `node --import tsx --test "test/**/*.test.js"`.
  The codebase favors **pure, unit-tested "seams"** for the tricky logic (the meeting
  echo/gate/holdback policies, the segment reducer, dock/autostart policy, inference
  routing, PCM fixtures for the audio pipeline). Extend these rather than testing through
  the UI.
- **Typecheck:** `npm run typecheck` (`tsc --noEmit`). Keep it green.
- **i18n parity:** `test/locales/translationCoverage.test.js` enforces that every `t()`
  key exists in `en` and in **all 10 locales** with matching interpolation variables.
  Adding a UI string means adding its key to every locale.
- **Known local-test quirk:** some tests import main-process modules that read Electron's
  `app` (e.g. `debugLogger`) and will throw on **Windows** when run outside Electron
  (`app.isPackaged` undefined). The same tests pass on CI's Linux because a
  `process.platform !== "win32"` check short-circuits first. Don't be alarmed by that
  specific failure locally.

---

## 9. Operational gotchas ("here be dragons")

- **Node 24 only** for `npm install`/`npm ci` (lockfile compatibility).
- **Don't touch the live WAL DB** from outside the app (corruption). See §5.
- **Offline/self-hosted assets:** fonts are self-hosted (`src/assets/fonts/`), sidecar
  binaries are bundled/downloaded — the app must work with no network. Don't introduce a
  web-font CDN or a required remote dependency without a local fallback; it breaks the
  offline/privacy promise. `docs/network-allowlist.md` is the contract.
- **One local LLM model loaded at a time.** Switching the model per feature-scope restarts
  `llama-server`. Transient `ECONNRESET`/socket drops from the server are retried once
  (`modelManagerBridge.runInference`).
- **`~/.cache/neato-echo` persists across app updates** — models aren't re-downloaded on
  update. Be careful not to invalidate that inadvertently.
- **12 encrypted secrets** via `safeStorage`; adding a new one means the encrypt/store/load
  path in `environment.js` (`SECRET_KEYS`) plus IPC get/save handlers.
- **Windows is the primary target** and the most-tested platform; macOS/Linux paths exist
  and are wired but get less real-world exercise.

---

## 10. Roadmap — where we want to take Neato Echo

The desktop app is the **hub**. The near-term product goals, in priority order:

### 10.1 Mobile apps (iOS + Android) — on-device transcription
**Decision made:** mobile records and transcribes **on-device** to preserve the
"nothing leaves your device" promise end-to-end.

Implications for the developer to scope:
- **STT on mobile:** the desktop uses Parakeet/whisper.cpp, which are heavy. On phones,
  candidate approaches: `whisper.cpp` compiled for mobile (a small/tiny/quantized model),
  Apple's on-device Speech framework (iOS), Android's on-device SpeechRecognizer /
  a bundled small model, or a small ONNX/GGML model via a mobile runtime. **Accuracy vs.
  battery vs. model size is the core tradeoff** — expect to prototype a couple.
- **App shape:** a focused "record → transcribe locally → store → sync" flow, plus review.
  It does **not** need to replicate the full desktop feature set on day one.
- **Reuse:** the transcript data model (speaker-labeled segments) and the note/meeting
  schema should be shared so mobile recordings slot into the desktop's notes cleanly.
- *Stack is an open decision* (see §11). React Native/Expo maximizes shared TS/logic;
  native (Swift/Kotlin) maximizes on-device ML integration. This is worth an early call.

### 10.2 Sync — getting mobile recordings to the desktop hub
**Decision: undecided — two options to weigh.** Present both to whoever builds it; the
owner's stated preference leans strongly toward **Option A (no server to run or pay for).**

- **Option A — user-owned cloud storage (zero backend cost).** Each recording (audio
  and/or its on-device transcript + metadata) is written to a folder in the *user's own*
  Google Drive / iCloud / Dropbox. Both the mobile app and the desktop app **watch that
  folder** and import new items. **Pros:** no infrastructure for us to run or fund; data
  stays in the user's account; aligns with the privacy story. **Cons:** relies on each
  user connecting storage; per-provider quirks/quotas; conflict handling and "is it there
  yet / how fresh" are on us; no server-side guarantees.
- **Option B — a lightweight managed sync backend.** A small service (e.g. object storage
  + a thin API, or a managed backend-as-a-service) that we host. **Pros:** seamless,
  reliable, no per-user setup; enables future cross-user features. **Cons:** recurring
  cost and maintenance; we now hold user data (weakens the "we can't see it" story unless
  end-to-end encrypted); the paid tier must cover it.
- **Recommendation to document:** start with **Option A** to honor the zero-infra intent
  and the privacy story (optionally **end-to-end encrypt** the payload so even the storage
  provider can't read it), and keep the sync layer abstracted behind an interface so
  Option B can be added later without reworking the apps.
- **Regardless of option:** define a **sync payload format** (audio file + a JSON sidecar
  of speaker-labeled segments + note metadata + a stable id + timestamps), an **idempotent
  import** on the desktop (dedupe by id), and a simple **conflict rule** (last-write-wins
  per note, or append-only recordings). Reuse the existing transcript-segment serialization
  (`serializeTranscriptSegments`) so mobile and desktop speak the same shape.

### 10.3 Wearable (Sona-type audio capture device) — later
The intent is an **audio-capture wearable** that records on the go and feeds the mobile
app, which then transcribes and syncs (§10.1–10.2).

> ⚠️ **Assumptions to confirm with the owner before scoping** (placeholders, not facts):
> the device is an **audio recorder** that pairs to the phone over **Bluetooth LE** and
> streams/transfers audio to the mobile app; the mobile app is the transcription + sync
> point (the wearable itself is "dumb capture"). Confirm the actual hardware, its BLE/audio
> protocol, whether it does any on-device processing, and battery/storage constraints.

Design the mobile app so the **capture source is abstracted** (phone mic *or* a paired
wearable) and everything downstream (transcribe → store → sync) is identical.

### 10.4 Monetization
- **Desktop: lifetime purchase** (one-time). Fits the local-first, no-recurring-cost
  positioning.
- **Paid tier: mobile app + cross-device sync** (small fee). The entitlement gates the
  mobile app and the sync feature, not the core desktop functionality.
- **To design:** license/entitlement checks (a signed license key validated **offline**
  keeps the privacy promise; avoid a mandatory phone-home), the purchase/fulfilment
  channel (App Store / Play Store handle mobile IAP; the desktop lifetime license needs a
  seller + key issuance), and how the desktop and mobile learn a user is entitled without
  a central account (e.g. the license key travels in the same user-owned storage, or a
  minimal entitlement check).

---

## 11. Open decisions for the incoming developer

1. **Mobile framework** — React Native/Expo (share TS + business logic, faster) vs native
   Swift + Kotlin (best on-device ML + wearable BLE integration). Recommend deciding this
   before any mobile code.
2. **Mobile on-device STT model/runtime** — which small model and runtime hits the
   accuracy/size/battery target on both platforms.
3. **Sync: Option A vs B** (§10.2), and whether to end-to-end encrypt the payload.
4. **Licensing/entitlement mechanism** that preserves offline/privacy (§10.4).
5. **Wearable hardware/protocol** — confirm the real device before committing (§10.3).
6. **macOS/Linux investment level** — currently secondary; decide if they're first-class.

---

## 12. How to battle-test what exists (a starting checklist)

- Fresh install on a clean Windows machine → complete onboarding → confirm local models
  download and the app works **fully offline** (pull the network and re-test dictation,
  summaries, chat, semantic search).
- Dictation: global hotkey, push-to-talk, paste-at-caret across a few apps; custom dictionary.
- Meeting mode on a real video call (Teams/Zoom/Meet): confirm **both** speakers are
  captured (headphones on), diarization, the system-audio-silent warning fires when it
  should, echo/duplicate suppression, and speaker renaming on a saved meeting.
- Upload a long file / YouTube URL → background transcription survives tab switches → ETA
  and progress → note is saved.
- Local LLM: force an `llama-server` crash mid-generation and confirm the retry recovers.
- Calendars: connect Google/Microsoft/Apple; confirm events, reminders, and the Home
  "Prepare for your day" briefing.
- Update path: install an older build, publish a newer release, confirm auto-update.
- Run `npm test`, `npm run typecheck`, and the i18n coverage test; read `CLAUDE.md`'s own
  "Testing Checklist" and "Common Issues" sections.
- Security/privacy: verify no unexpected egress against `docs/network-allowlist.md`;
  confirm secrets are in `secure-keys/` and not in `localStorage`/`.env`.

---

## 13. Contacts & context

- **Owner / product direction:** Mark Hilton (`markhilton@tokbird.com`).
- **Deepest technical reference:** `CLAUDE.md` (read it in full early).
- **Lineage:** fork/rebrand of open-source **OpenWhispr** (MIT) — useful for upstream
  context, issues, and prior art, but the current product is Neato Echo.

*Welcome aboard — start with `CLAUDE.md` and the §12 checklist, and raise the §11 decisions
early; they gate the mobile/wearable roadmap.*
