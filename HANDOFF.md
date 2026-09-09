# Neato Echo — Developer Handoff

> **Audience:** an experienced developer taking over / co-maintaining this codebase.
> **This engagement has two thrusts:** (1) **harden the existing desktop app** — go through
> it and make sure it's solid from a **security** standpoint; and (2) **bring the product to
> mobile** — the larger body of work described in the roadmap.
>
> **Repository (public):** <https://github.com/markhiltonapps/neato-echo>
> **Canonical technical reference:** [`CLAUDE.md`](./CLAUDE.md) in the repo root — a long,
> current, per-subsystem map of the app. **Read this HANDOFF for orientation, then use
> `CLAUDE.md` as the encyclopedia.** This document doesn't repeat `CLAUDE.md`; it adds the
> product overview, install/ops, the security review scope, the roadmap, and the decisions.

---

## 1. What Neato Echo actually does

**Neato Echo is a privacy-first desktop app for voice → text.** You talk; it writes. It does
three things, and its defining trait is that all of it can run **entirely on your own
computer** with **no audio or text ever leaving the device** (cloud services are strictly
opt-in).

1. **Dictation.** Press a global hotkey and speak; your words are transcribed and pasted
   straight into whatever app you're using (email, docs, chat, code). Optional AI cleanup
   fixes filler and punctuation. There's a custom dictionary for names/jargon.
2. **Meeting transcription.** Record a meeting (in person or a video call like Teams/Zoom/
   Meet). It captures **your microphone *and* the other participants' audio** as separate
   streams, labels who said what (speaker diarization), and turns the raw transcript into
   clean, structured **notes and summaries**.
3. **AI notes & assistant.** Your transcripts become notes you can organize into folders,
   search by meaning (not just keywords), and **chat with** — ask questions about your own
   meetings and notes. It connects to your calendar (Google / Microsoft / Apple) and gives
   you a "prepare for your day" briefing. You can also drop in an audio file or a YouTube
   URL and get a transcript back.

**How the privacy promise works:** speech-to-text (NVIDIA Parakeet / whisper.cpp),
summarization and chat (a local LLM via llama.cpp — Qwen 3.5 2B by default), and semantic
search (a local vector database) all run **on the machine**. Users who *want* cloud power
can bring their own API keys (OpenAI, Anthropic, Gemini, etc.) or use a hosted option, but
that's a choice — the product works, and sells itself, on being fully local.

**Lineage:** Neato Echo is a rebrand + fork of the open-source **OpenWhispr** (MIT license).
The `README.md` still carries upstream OpenWhispr branding; the shipping product is Neato
Echo.

---

## 2. Install it & platform availability

**Try the real app first — it's the fastest way to understand it.**

- **Download & install (Windows):** grab the latest build from the **Releases page** →
  <https://github.com/markhiltonapps/neato-echo/releases/latest>
  - `Neato-Echo-Setup-<version>.exe` — the normal installer (auto-updates itself thereafter).
  - `Neato-Echo-Portable-<version>.exe` — a no-install portable build.
- **Auto-update:** installed builds update themselves from GitHub Releases on launch
  (via `electron-updater` reading `latest.yml`).

### Platform status — and a goal for this engagement
- **Windows** — ✅ **shipping today** and the primary, most-tested platform.
- **macOS** — 🎯 **wanted.** The codebase is cross-platform (Electron, and macOS-specific
  code paths already exist — Dock handling, Globe-key hotkey, CoreAudio mic listener,
  AppleScript paste, Apple Calendar via EventKit, a notarize CI workflow). It is **not
  currently built or released**. Bringing macOS to release parity — building/signing/
  **notarizing**, packaging the sidecars and native helpers for macOS (incl. Apple Silicon),
  and testing — is part of the desired work.
- **Linux** — 🎯 **possibly.** Cross-platform code paths exist (AppImage packaging,
  Wayland/X11 hotkeys and paste, PulseAudio/PipeWire audio). Getting it to a
  reliable, releasable state is a stretch goal.

> Making macOS (and possibly Linux) first-class is a concrete deliverable — see §11 for the
> build/packaging details and §15 for the "how much do we invest" decision.

---

## 3. The engagement — two mandates

**Mandate A — Security hardening of the current app.** Before and alongside the mobile work,
audit the shipping desktop app and make sure it is solid: no unsafe IPC, secrets handled
correctly, no unexpected network egress, safe auto-update and supply chain, and the privacy
promise actually holds. Scope in **§4**.

**Mandate B — Bring the product to mobile (the bulk of the work).** iOS + Android apps that
record on the go, transcribe **on-device**, and **sync** back to the desktop hub; and,
later, a wearable capture device. Overview in **§5**, full detail in **§14**.

### The work, in order

A sequenced plan — get access and a security baseline first, ship the operational
must-haves that make it a sellable product (signing, licensing, macOS), then build mobile.
Each item is detailed in the section noted.

**Phase 0 — Onboard**
1. **Get access & set up:** the repo, the **DigitalOcean** account (hosting + DNS), **Nylas**,
   the **neatoventures.com** domain/DNS, and Lemon Squeezy once created. Install the app
   (§2), read `CLAUDE.md`, run it locally (§7).

**Phase 1 — Secure the current app (Mandate A)**
2. **Security audit + fixes** (§4). Deliver a findings report; fix material issues; verify no
   secrets are committed to the public repo and rotate anything exposed.

**Phase 2 — Operational must-haves (turn it into a sellable product)**
3. **Code signing** — obtain a **Windows code-signing certificate** (and an **Apple Developer**
   account for macOS); wire signing into the build so installs are trusted and updates are
   verified (§11). *Not set up today.*
4. **Licensing / activation (anti-sharing)** — integrate **Lemon Squeezy** (or similar): sell a
   license and **add an in-app activation gate** — on first run the app asks for a key,
   validates/activates it against the vendor's license API, and **caches activation so it
   keeps working offline**. Only ever transmit the key, never user content, so the privacy
   promise holds (§14.4). *New feature to build.*
5. **macOS build to release parity** (and possibly Linux) — build/sign/notarize, package the
   sidecars + native helpers per target, wire the update channel, test (§2, §11).
6. **Stand up the not-yet-configured vendors:** reconcile **Nylas** with the desktop's current
   *direct* Google/Microsoft OAuth (pick one, make it consistent); wire **Resend** for
   transactional email; add **error tracking + product analytics** (e.g. Sentry / PostHog —
   none exist yet); confirm and harden what the DigitalOcean backend (`echo.neatoventures.com`)
   does (§6-H, §4).
7. **Accounts / auth** — decide whether it's even needed (key-based licensing + user-owned
   sync may avoid it). If needed, pick a provider. *Not set up today.*

**Phase 3 — Mobile (Mandate B — the bulk)**
8. Decide the **mobile framework** + **on-device STT model** (§15).
9. Build **iOS + Android**: record → transcribe **on-device** → store → sync, reusing the
   desktop's segment/note model (§14.1).
10. Decide and build **sync** — Option A (user-owned cloud) vs B (managed backend) (§14.2).
11. Gate **mobile + sync** behind the paid tier / license (§14.4).

**Phase 4 — Wearable (later)**
12. Confirm the Sona **hardware / BLE protocol**; abstract the capture source; integrate (§14.3).

---

## 4. Security review — what to audit

This is a **scope for the review**, not a list of known vulnerabilities. The app is built
with the right instincts (context isolation, a narrow IPC surface, encrypted secrets, a
network allowlist, no remote code execution); your job is to verify that end-to-end and
close any gaps. Start from `CLAUDE.md`'s "Security Considerations" section, then work
through:

- **Electron hardening.** Confirm context isolation, `sandbox`, disabled `nodeIntegration`,
  and that the **preload bridge (`preload.js` → `window.electronAPI`) exposes only the
  minimum**. Audit every IPC handler in `src/helpers/ipcHandlers.js` for input validation
  and path traversal (there's a `resolveAllowedAudioPath`-style pattern — verify it's
  applied everywhere a path crosses the boundary).
- **Secrets at rest.** 12 secrets (BYOK API keys + enterprise creds) are encrypted with
  Electron **`safeStorage`** (OS keychain) as per-key files in `userData/secure-keys/`.
  Verify none leak to `localStorage`, logs, or `.env`. **Flag/deal with the documented
  Linux-without-keyring plaintext fallback** — it's a real weak spot for the Linux target.
- **Calendar OAuth tokens.** Google/Microsoft tokens live in SQLite
  (`google_calendar_tokens` / `microsoft_calendar_tokens`). Verify how they're stored
  (encrypted vs plaintext in the DB), refresh handling, and revocation.
- **Network egress / privacy.** `docs/network-allowlist.md` is the contract for what the app
  may contact. Verify the app honors it, the CSP is enforced, and nothing phones home in
  local-only mode. This underpins the entire product claim.
- **Local servers.** The app runs loopback sidecars (llama-server, Qdrant, sherpa-onnx WS)
  and a **CLI bridge** (`cliBridge.js`) — a loopback HTTP server (127.0.0.1, ports
  8200–8219) with bearer-token auth (token in `~/.openwhispr/cli-bridge.json`). Audit the
  binding (localhost-only), the token file's permissions and generation, and that no
  sidecar port is reachable off-host.
- **Supply chain / binary integrity.** Native helpers and ML sidecars are **downloaded**
  during `predev`/`prebuild` (`scripts/download-*.js`) from GitHub releases and model hosts.
  Verify downloads are integrity-checked (checksums/signatures) and can't be MITM'd; review
  `package-lock.json` / `npm audit` and the CI (`.github/workflows/`, incl. CodeQL).
- **Auto-update integrity.** electron-updater + code signing: confirm updates are signed and
  verified, and the `latest.yml`/blockmap path can't be tampered into installing a bad build.
- **Data & files.** SQLite in WAL mode (don't allow external processes to open it live —
  corruption risk); temp audio files are created and **must be cleaned up**; verify no
  sensitive data in crash logs / debug logs (debug logging is opt-in).
- **Content protection.** The dictation pill and meeting overlays use `setContentProtection`
  so they don't appear in screen shares — verify this holds where it's claimed.

Deliverable for Mandate A: a short security report (findings + severity + fixes), and PRs
for anything material.

---

## 5. Bringing mobile online — the plan (overview)

**The desktop app is the hub.** The goal is mobile apps that let people capture audio away
from their computer and have it show up, transcribed, in Neato Echo — **without giving up the
privacy promise**.

- **Record anywhere:** native **iOS and Android** apps with a focused "record → transcribe
  → store → sync" flow (not a full re-implementation of the desktop).
- **Transcribe on the device:** to keep the "nothing leaves your device" story end-to-end,
  mobile transcription runs **on-device** (a small/quantized local model). *Decision made.*
- **Sync to the desktop hub:** a recording made on the phone appears on the desktop. **Two
  approaches are on the table** — the user's own cloud storage (no backend for us to run) vs.
  a small hosted sync service — documented with a recommendation in §14.
- **Later, a wearable:** a Sona-type audio-capture device that feeds the mobile app.
- **Business model:** the desktop app is a **lifetime purchase**; the **mobile app +
  cross-device sync** is a small paid tier.

Full detail — architecture, the sync options and payload format, the wearable assumptions,
and monetization/entitlement — is in **§14**. The decisions to make first are in **§15**.

---

## 6. Tech stack at a glance

| Layer | Technology |
|---|---|
| Desktop shell | **Electron 41** (context isolation, main/renderer/preload) |
| UI | **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, shadcn/Radix |
| State | **Zustand** stores |
| Local DB | **better-sqlite3** (SQLite, WAL mode) |
| Speech-to-text (local) | **NVIDIA Parakeet** via **sherpa-onnx**; **whisper.cpp** also supported |
| LLM (local) | **llama.cpp** (`llama-server`), default model **Qwen 3.5 2B** GGUF |
| Semantic search (local) | **Qdrant** vector DB + **all-MiniLM-L6-v2** embeddings (ONNX Runtime) |
| ONNX inference | `onnxruntime-node` in a dedicated **utility process** (crash isolation) |
| Audio | **FFmpeg** (bundled), Web Audio worklets, native OS audio/hotkey/paste helpers |
| Cloud/BYOK (optional) | OpenAI, Anthropic, Gemini, Groq, Mistral, xAI, plus a hosted cloud |
| i18n | react-i18next, **10 languages**, parity-enforced by tests |
| Packaging | **electron-builder** (NSIS installer + portable), **electron-updater** |
| Node | **24** (pinned in `.nvmrc`; `engines.node >= 24`) — see gotchas |

---

### Complete third-party inventory & credentials

Everything external the app depends on, and — where one is needed — **which account or
credential it requires and where that's configured**. **No secret values appear here.**
User-supplied API keys are entered in-app and stored **encrypted** via Electron
`safeStorage` in `userData/secure-keys/`; app-level credentials (OAuth clients, signing
certs) belong to the owner and are provided out of band. This doubles as a checklist for
the security review (§4).

**A. Bundled / downloaded engines & binaries** — ship with the app; no per-user account.

| Component | Maker / source | Used for | License |
|---|---|---|---|
| **sherpa-onnx** | k2-fsa (`github.com/k2-fsa/sherpa-onnx`) | Parakeet STT runtime | Apache-2.0 |
| **whisper.cpp** | ggml-org (ggerganov) | speech-to-text | MIT |
| **llama.cpp** (`llama-server`) | ggml-org (ggerganov) | local LLM inference | MIT |
| **Qdrant** | Qdrant (`qdrant.tech`) | local vector DB (semantic search) | Apache-2.0 |
| **ONNX Runtime** (`onnxruntime-node`) | Microsoft | text/speaker embeddings, fbank | MIT |
| **FFmpeg** (`ffmpeg-static`) | FFmpeg | audio decode/convert | LGPL/GPL |
| **yt-dlp** | yt-dlp project | YouTube audio download | Unlicense |
| **NirCmd** | NirSoft | Windows clipboard/paste fallback | Freeware (Windows) |

**B. Local models** — downloaded (mostly from **Hugging Face**) during setup / first run;
no account needed for the public models. A `GITHUB_TOKEN` only raises download rate limits.

| Model | Maker | Used for |
|---|---|---|
| **NVIDIA Parakeet** (tdt-0.6b-v3, unified-en, Nemotron streaming) | NVIDIA (via sherpa-onnx releases) | primary local STT |
| **Qwen 3.5 GGUF** (2B default, 4B/9B) | Alibaba / Qwen | local LLM (cleanup, summaries, chat) |
| **all-MiniLM-L6-v2** | sentence-transformers | embeddings for semantic search |
| **Whisper GGML** models | OpenAI / ggml | alternative local STT |
| **Silero VAD**, diarization models | resp. projects | voice activity + speaker separation |
| **Cohere Transcribe** | Cohere | optional most-accurate local STT model |

**C. Optional cloud AI / transcription providers (BYOK)** — the **user supplies their own
key**; it's stored encrypted (see above). None are required for the local-first product.

| Provider | Env key | Used for | Where to get a key |
|---|---|---|---|
| **OpenAI** | `OPENAI_API_KEY` | LLM + Whisper transcription | platform.openai.com |
| **Anthropic** (Claude) | `ANTHROPIC_API_KEY` | LLM | console.anthropic.com |
| **Google Gemini** | `GEMINI_API_KEY` | LLM | aistudio.google.com |
| **Groq** | `GROQ_API_KEY` | fast LLM inference | console.groq.com |
| **xAI** (Grok) | `XAI_API_KEY` | LLM | console.x.ai |
| **Mistral** | `MISTRAL_API_KEY` | LLM | console.mistral.ai |
| **OpenRouter** | `OPENROUTER_API_KEY` | multi-model LLM gateway | openrouter.ai |
| **Tinfoil** | `TINFOIL_API_KEY` | privacy-preserving cloud inference | tinfoil.sh |
| **AssemblyAI** | `ASSEMBLYAI_API_KEY` | realtime streaming transcription | assemblyai.com |
| **Deepgram** | `DEEPGRAM_API_KEY` | transcription | deepgram.com |
| **Corti** | `CORTI_API_KEY` / `CORTI_CLIENT_ID` / `CORTI_CLIENT_SECRET` | medical/healthcare transcription | corti.ai |
| **Custom / self-hosted** | `*_CUSTOM_API_KEY` (per scope) | point a scope at your own OpenAI-compatible endpoint (LAN/self-host) | — |

**D. Enterprise cloud backends** — for enterprise deployments; creds are the org's.

| Backend | Env keys | Used for |
|---|---|---|
| **AWS Bedrock** | `BEDROCK_ACCESS_KEY_ID` / `BEDROCK_SECRET_ACCESS_KEY` / `BEDROCK_SESSION_TOKEN` | managed LLMs |
| **Azure OpenAI** | `AZURE_OPENAI_API_KEY` | managed OpenAI models |
| **Google Vertex AI** | `VERTEX_API_KEY` | managed LLMs |
| **Neato / OpenWhispr Cloud** | (hosted) | optional first-party hosted transcription/LLM |

**E. Calendar connectivity.** The product uses **Nylas** to let users connect their **Google
and Microsoft** calendars.

> ⚠️ **Important discrepancy to reconcile (§4, work-item #6):** the **shipping desktop code in
> this repo does *direct* PKCE OAuth** to Google (`accounts.google.com`) and Microsoft
> (`login.microsoftonline.com`) — **it does not use Nylas.** So Nylas currently fronts calendar
> connectivity elsewhere (the hosted backend and/or a newer/planned path), while the desktop
> still has a direct-OAuth implementation. Pick one approach and make it consistent, and
> confirm no OAuth client secret is committed to the public repo (rotate if it is).

| Integration | What it needs |
|---|---|
| **Nylas** | a Nylas account/app + API credentials; brokers the Google/Microsoft calendar connections |
| **Google / Microsoft** (direct path in the desktop) | a Google Cloud project (Calendar API, OAuth client) / an Azure AD app registration — *only if the direct path is kept instead of Nylas* |
| **Apple Calendar** | **EventKit** on macOS — local, no cloud credential |

**F. Distribution, signing & infrastructure (the owner's accounts).**

| Service | Purpose | Notes |
|---|---|---|
| **GitHub** (`markhiltonapps/neato-echo`) | source, **Releases = the auto-update feed**, Actions CI | repo admin needed; CI uses repo secrets |
| **electron-builder / electron-updater** | packaging + auto-update | config in `package.json`/`electron-builder` |
| **Windows code-signing certificate** | trusted installs via `signtool` | a real cost; builds can be unsigned for testing |
| **Apple Developer Program** (~$99/yr) | **sign + notarize** macOS builds | **required to ship macOS** |
| **Hugging Face** | model hosting/downloads | public models; no account required |
| **jsDelivr / npm (fontsource)** | build-time font asset (Space Mono woff2) | not a runtime dependency |

**G. Key npm libraries.**
- **Vercel AI SDK** (`ai`, `@ai-sdk/openai`) — LLM/chat orchestration + tool-calling.
- `better-sqlite3` (DB), `zustand` (state), `react-i18next` (i18n),
  `@tanstack/react-virtual` (virtualized transcript), `@qdrant/js-client-rest` (vector DB),
  `@homebridge/dbus-native` (Linux D-Bus for Wayland hotkeys), `ps-list` (process detection).
- Full dependency list: `package.json`; run `npm audit` as part of the security pass.

**H. Operational & infrastructure vendors (the owner's accounts — the services that run the
product day-to-day).** Several are **not yet set up** and are part of the work (§3).

| Service | Status | Used for | Notes |
|---|---|---|---|
| **DigitalOcean** | **live** | hosts the **backend** and DNS | App Platform app `coral-app-aex7i.ondigitalocean.app`, served as **`https://echo.neatoventures.com`** — this is the `OPENWHISPR_API_URL` / `VITE_OPENWHISPR_API_URL` the desktop app calls for hosted/cloud features (e.g. large-file transcription, token minting). Confirm exactly what it runs and harden it (§4). |
| **Nylas** | **in use** | lets users connect Google + Microsoft calendars | ⚠️ reconcile with the desktop's current *direct* OAuth (§6-E, §4). |
| **neatoventures.com** (domain/DNS) | **live** | `echo.` subdomain → the DigitalOcean backend | registrar/DNS per the owner. |
| **Lemon Squeezy** | **planned** | selling licenses + **key/activation** (anti-sharing) | needs an **in-app activation gate** built — first-run key prompt, validate/activate via its license API, cache for offline use (§14.4, work-item #4). |
| **Resend** | **planned** | transactional email | not set up yet. |
| **Error tracking + analytics** | **to add** | crash/error reporting + product analytics | none configured; `analytics_*` tables exist locally only. Choose e.g. Sentry + PostHog. |
| **Code signing** (Windows cert + Apple Developer) | **to set up** | trusted installs + verified updates | not configured yet (work-item #3). |
| **Accounts / auth** | **not set up** | user accounts, if needed | may be avoidable with key-based licensing + user-owned sync (work-item #7). |
| **Object storage / CDN** | **none today** | — | everything is local; models download from source (Hugging Face, etc.). |

---

## 7. Getting started (development)

**Prerequisites:** **Node 24** (`nvm install 24 && nvm use 24` — a different major version
produces a `package-lock.json` that breaks `npm ci`), Git, and platform build tooling for
native helpers (most native binaries are downloaded prebuilt, so you rarely compile them).
Budget a few GB for sidecars and first-run model downloads.

```bash
nvm use 24
npm ci                 # lockfile-faithful install
npm run dev            # Vite renderer + Electron main

# quality gates
npm run typecheck      # cd src && tsc --noEmit
npm test               # node --import tsx --test "test/**/*.test.js"

# ship (Windows) — then tag + gh release; electron-updater reads latest.yml
npm run build:renderer
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win nsis portable
```
`predev`/`prebuild` download the sidecar binaries; the embedding model and some ML models
finish downloading on first launch into `~/.cache/neato-echo/`.

---

## 8. Architecture overview

**Three Electron contexts:** **main** (`main.js`, IPC, DB, window/sidecar lifecycle),
**renderer** (the React app, context-isolated), **preload** (`preload.js` →
`window.electronAPI` bridge). All privileged work is IPC'd from renderer to main.

**Dual-window UX:** a small always-on-top **dictation pill** and a full **Control Panel**
(Home, Chat, Notes, Upload, Dictionary, Integrations, Settings) — same React bundle, routed
by URL.

**Sidecar processes** (spawned/supervised by main; see `sidecarRegistry`, `sidecarReaper`,
`sidecarPidFile`):
- **`llama-server`** (llama.cpp) — local LLM; Vulkan-accelerated where available, CPU
  fallback; one model at a time, idle-unloaded to free VRAM.
- **Qdrant** — local vector DB for semantic note search.
- **sherpa-onnx websocket server(s)** — Parakeet STT (offline + streaming).
- **ONNX utility process** — hosts *all* `onnxruntime-node` inference; native crashes are
  confined here and it respawns with backoff.

**Audio / meeting capture:** dictation is MediaRecorder → IPC → temp file → STT. **Meeting
mode records two streams** — the **microphone** ("You") and **system audio** (other
participants, via a native loopback helper on Windows / display-media fallback) — with an
echo-leak + duplicate-suppression pipeline. This two-stream design is central to how the
mobile capture should be modeled.

The exhaustive file-by-file map (every helper, hook, IPC channel, the transcription/
diarization/echo policy seams, calendar internals, the inference-provider registry, the
model registry) is in **`CLAUDE.md`**.

---

## 9. Data, storage & privacy

**Local SQLite** (better-sqlite3, WAL) is the source of truth. Tables include:
`transcriptions`, `notes`, `folders`/`folders_new`, `spaces`, `actions`,
`agent_conversations`/`agent_messages`, `custom_dictionary`, `snippets`,
`google_calendar_tokens`/`google_calendars`, `microsoft_calendar_tokens`/
`microsoft_calendars`, `apple_calendars`, `calendar_events`, `contacts`,
`speaker_profiles`/`speaker_mappings`/`note_speaker_embeddings`, `analytics_*`, `app_meta`
(see `src/helpers/database.js`).

**Where things live (per-user):**
- App DB + settings: Electron `userData` (`%AppData%/neato-echo/` on Windows).
- Downloaded models & vector data: `~/.cache/neato-echo/`. **App updates never touch it.**
- **Secrets:** encrypted via Electron `safeStorage` (OS keychain) in `userData/secure-keys/`
  (Linux-without-keyring falls back to plaintext — a security item, see §4).
- Non-secret prefs in `localStorage`; non-secret env in `.env`.

**Privacy model:** in local-first mode, audio and text never leave the device. Cloud is
opt-in. `docs/network-allowlist.md` is the endpoint contract. **Preserve this** — it's the
product's core promise and shapes every mobile decision.

> ⚠️ **Never open the live WAL DB from another process while the app runs** — corruption
> risk. Use the app's IPC or quit first.

---

## 10. Core subsystems — where to look

| Subsystem | Start here |
|---|---|
| Main entry / IPC | `main.js`, `src/helpers/ipcHandlers.js`, `preload.js` |
| Local STT (Parakeet) | `src/helpers/parakeet.js`, `parakeetServer.js` |
| Local STT (whisper.cpp) | `src/helpers/whisper.js`, `whisperServer.js` |
| Local LLM | `src/helpers/llamaServer.js`, `modelManagerBridge.js`, `src/models/modelRegistryData.json` |
| AI routing / providers | `src/services/ReasoningService.ts`, `src/services/ai/inferenceProviders/*`, `src/config/inferenceScopes.ts` |
| Semantic search | `src/helpers/qdrantManager.js`, `vectorIndex.js`, `localEmbeddings.js` |
| Meeting capture & pipeline | `src/stores/meetingRecordingStore.ts`, `meetingSegmentReducer.ts`, `src/helpers/meeting*` |
| Diarization / speakers | `src/utils/transcriptSpeakerState.ts`, `speaker_*` tables, `MeetingTranscriptChat.tsx` |
| Calendar (Google/MS/Apple) | `src/helpers/*CalendarManager.js`, `calendarReminderScheduler.js` |
| Notes / editor | `src/components/notes/*` (`PersonalNotesView`, `NoteEditor`, `RichTextEditor`) |
| Upload/transcribe jobs | `UploadAudioView.tsx`, `src/stores/uploadJobStore.ts`, `batchQueueStore.ts` |
| Settings / models UI | `src/components/SettingsPage.tsx`, `settings/*` |
| i18n | `src/locales/<lang>/translation.json`, `test/locales/translationCoverage.test.js` |
| Design tokens / brand | `src/index.css` (`--color-brand-*`, `--font-brand`), fonts in `src/assets/fonts/` |
| CLI bridge (security) | `src/helpers/cliBridge.js` |

---

## 11. Build, signing, release & auto-update

Current release flow (Windows):
1. Bump `version` in `package.json`, commit `chore(release): <v>`, push.
2. `npm run build:renderer`.
3. `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win nsis portable`.
4. `git tag v<v> && git push origin v<v>`.
5. `gh release create v<v> <Setup.exe> <Setup.exe.blockmap> <Portable.exe> latest.yml
   --repo markhiltonapps/neato-echo --verify-tag --latest`.
6. Verify the feed: `.../releases/latest/download/latest.yml`.

**Auto-update:** `electron-updater` reads `latest.yml` from the GitHub "latest" release; the
`.exe.blockmap` enables differential downloads.

**Bringing macOS/Linux to release (part of this engagement):**
- **macOS:** build via `electron-builder --mac` (arm64 + x64), **sign + notarize** (there's
  a `build-and-notarize.yml` workflow and `afterSign.js`); ensure all **sidecars and native
  Swift/CoreAudio helpers** are compiled/downloaded for macOS and correctly `asar`-unpacked;
  wire the update feed for the `.dmg`/`.zip` channel; test on Apple Silicon.
- **Linux:** `electron-builder --linux` (AppImage/deb/rpm), package the Linux native helpers
  (Wayland/X11 hotkeys, PulseAudio audio), and validate on a couple of distros/desktops.
- Native-helper builds already have their own CI workflows (`.github/workflows/build-*.yml`);
  extend those to cover the new targets.

---

## 12. Testing & quality gates

- **Tests:** `npm test` (`node --import tsx --test`). The codebase favors **pure,
  unit-tested "seams"** for the tricky logic (meeting echo/gate/holdback policies, the
  segment reducer, dock/autostart policy, inference routing, PCM fixtures). Extend these.
- **Typecheck:** `npm run typecheck`. Keep it green.
- **i18n parity:** `test/locales/translationCoverage.test.js` enforces every `t()` key in
  `en` and all 10 locales with matching interpolation. New UI string ⇒ key in every locale.
- **Known local quirk:** some tests import main-process modules that read Electron's `app`
  (e.g. `debugLogger`) and throw on **Windows** run outside Electron; the same tests pass on
  CI's Linux (a `process.platform` check short-circuits first). Not a real failure.

---

## 13. Operational gotchas ("here be dragons")

- **Node 24 only** for `npm install`/`npm ci`.
- **Don't touch the live WAL DB** from outside the app (corruption).
- **Offline/self-hosted assets:** fonts are self-hosted; sidecars are bundled/downloaded —
  the app must work with no network. Don't add a web-font CDN or a required remote
  dependency without a local fallback; `docs/network-allowlist.md` is the contract.
- **One local LLM model at a time;** switching per feature-scope restarts `llama-server`.
  Transient `ECONNRESET` from the server is retried once (`modelManagerBridge.runInference`).
- **`~/.cache/neato-echo` persists across updates** — models aren't re-downloaded on update.
- **12 encrypted secrets** via `safeStorage`; adding one touches `environment.js`
  (`SECRET_KEYS`) + IPC get/save handlers.
- **Windows is the primary/most-tested target;** macOS/Linux paths exist but need exercise.

---

## 14. Roadmap detail — mobile / sync / wearable / monetization

The desktop app is the **hub**. Priorities:

### 14.1 Mobile apps (iOS + Android) — on-device transcription
**Decision made:** mobile records and transcribes **on-device** to preserve the
"nothing leaves your device" promise end-to-end. To scope:
- **STT on mobile:** desktop uses Parakeet/whisper.cpp (heavy). On phones, candidates:
  `whisper.cpp` compiled for mobile with a small/tiny/quantized model, Apple on-device
  Speech (iOS), Android on-device SpeechRecognizer / a bundled small model, or a small
  ONNX/GGML model via a mobile runtime. Accuracy vs. battery vs. size is the core tradeoff —
  expect to prototype.
- **App shape:** a focused capture/transcribe/review/sync app; not the full desktop feature
  set on day one.
- **Reuse:** share the transcript data model (speaker-labeled segments) and note schema so
  mobile recordings slot cleanly into the desktop's notes (reuse
  `serializeTranscriptSegments`).

### 14.2 Sync — getting mobile recordings to the desktop hub
**Decision: undecided — two options to weigh** (owner leans strongly to Option A, zero-infra):
- **Option A — user-owned cloud storage (no backend cost).** Each recording (audio and/or
  its on-device transcript + metadata) goes to a folder in the *user's own* Google Drive /
  iCloud / Dropbox; both apps **watch that folder** and import new items. **Pros:** no
  infra for us to run or fund; data stays in the user's account; fits the privacy story.
  **Cons:** relies on each user connecting storage; per-provider quirks/quotas; conflict
  handling and freshness are on us.
- **Option B — a lightweight managed sync backend.** A small hosted service (object storage
  + thin API, or a managed BaaS). **Pros:** seamless, reliable, no per-user setup.
  **Cons:** recurring cost + maintenance; we hold user data (weakens the story unless
  end-to-end encrypted); the paid tier must fund it.
- **Recommendation:** start with **Option A** (optionally **end-to-end encrypt** the payload
  so even the storage provider can't read it) and keep sync behind an interface so Option B
  can be added later. Define one **sync payload** (audio + a JSON sidecar of speaker-labeled
  segments + note metadata + stable id + timestamps), **idempotent import** on the desktop
  (dedupe by id), and a simple **conflict rule** (last-write-wins per note, or append-only
  recordings).

### 14.3 Wearable (Sona-type audio capture device) — later
Intent: an **audio-capture wearable** that records on the go and feeds the mobile app, which
transcribes and syncs.

> ⚠️ **Assumptions to confirm with the owner before scoping** (placeholders, not facts): the
> device is an **audio recorder** that pairs to the phone over **Bluetooth LE** and
> streams/transfers audio to the mobile app; the mobile app does the transcription + sync;
> the wearable is "dumb capture." Confirm the real hardware, BLE/audio protocol, any
> on-device processing, and battery/storage constraints.

Design the mobile app so the **capture source is abstracted** (phone mic *or* a paired
wearable) and everything downstream (transcribe → store → sync) is identical.

### 14.4 Monetization &amp; licensing (a required build, not just a decision)

- **Desktop: lifetime purchase** (one-time) — fits the local-first, no-recurring-cost story.
- **Paid tier: mobile app + cross-device sync** (small fee) — gates mobile + sync, not the
  core desktop app.
- **License key / activation gate (build this).** Today anyone can download and run the app;
  we need a **key/activation system to stop people downloading it and sharing it**. The plan
  is **Lemon Squeezy** (or a similar license vendor):
  - Lemon Squeezy sells the license and **issues a license key** on purchase; it has a
    **License API** (activate / validate / deactivate with a per-key activation limit).
  - **Add an in-app activation gate:** on first run (after download), the app **asks for a
    key**, calls the vendor's **activate** endpoint once, and **caches the activation locally**
    so the app keeps working **offline** thereafter (re-validate occasionally, with a grace
    period so a network blip never locks a paying user out).
  - **Privacy-preserving:** the activation call transmits **only the license key** (and maybe a
    device fingerprint) — **never audio, transcripts, or user content.** That keeps the
    "nothing leaves your device" promise intact for the actual data.
- **Fulfilment channels:** Lemon Squeezy for the desktop lifetime license; App Store / Play
  Store IAP for the mobile paid tier. Decide how the desktop and mobile share entitlement
  without a central account (e.g. the key travels in the user-owned sync storage, or a light
  entitlement check).

---

## 15. Open decisions for the incoming developer

1. **Mobile framework** — React Native/Expo (share TS + logic) vs native Swift + Kotlin
   (best on-device ML + wearable BLE). Decide before any mobile code.
2. **Mobile on-device STT model/runtime** — which small model/runtime hits the
   accuracy/size/battery target on both platforms.
3. **Sync: Option A vs B** (§14.2), and whether to end-to-end encrypt.
4. **Licensing/entitlement mechanism** that preserves offline/privacy (§14.4).
5. **Wearable hardware/protocol** — confirm the real device before committing (§14.3).
6. **macOS / Linux investment level** — how far to take each (§2, §11).

---

## 16. How to battle-test what exists

- Fresh install on a clean Windows machine → onboarding → confirm local models download and
  the app works **fully offline** (pull the network; re-test dictation, summaries, chat,
  search).
- Dictation: global hotkey, push-to-talk, paste-at-caret across several apps; custom dictionary.
- Meeting mode on a real video call: confirm **both** speakers captured (headphones on),
  diarization, the system-audio-silent warning, echo/duplicate suppression, and speaker
  renaming on a saved meeting.
- Upload a long file / YouTube URL → background transcription survives tab switches → ETA/
  progress → note saved.
- Local LLM: force an `llama-server` crash mid-generation; confirm the retry recovers.
- Calendars: connect Google/Microsoft/Apple; confirm events, reminders, the Home briefing.
- Update path: install an older build, publish a newer release, confirm auto-update.
- Security pass (Mandate A, §4): IPC surface, secrets, egress vs `docs/network-allowlist.md`,
  the CLI bridge, supply-chain integrity, auto-update signing.
- Run `npm test`, `npm run typecheck`, i18n coverage; read `CLAUDE.md`'s own "Testing
  Checklist" and "Common Issues" sections.

---

## 17. Contacts & context

- **Owner / product direction:** Mark Hilton (`markhilton@tokbird.com`).
- **Deepest technical reference:** `CLAUDE.md` (read it in full early).
- **Lineage:** fork/rebrand of open-source **OpenWhispr** (MIT).

*Welcome aboard — install the app (§2), read `CLAUDE.md`, run the §16 checklist, and raise
the §15 decisions early. The two jobs are: make the current app airtight (§4), and bring it
to mobile (§14).*
