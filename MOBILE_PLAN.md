# Neato Echo Mobile — Plan of Attack

Cross-platform iOS + Android app built with React Native (Expo, development build), running speech-to-text fully on-device, with notes synced through the user's own cloud (iCloud Drive on iOS, Google Drive on Android and Windows). No Neato Ventures servers. Lifetime pricing stays viable because the monthly infrastructure cost is $0.

This is a roadmap, not code. Every file reference points at the current desktop repo (`C:\Users\markh\openwhisper`, branch `neato-echo`, v1.1.1) so the port can be driven from the real source rather than from memory. Line numbers are from the working tree on 2026-09-05 and will drift; the file names will not.

---

## 0. Ground truths that shape everything below

1. **The desktop app is not portable as a whole.** Recording is Web Audio + MediaRecorder, transcription is a spawned sherpa-onnx or whisper-server sidecar, summaries are a spawned llama-server, storage is a synchronous `better-sqlite3` database, and every renderer feature talks to the main process through ~100 IPC channels. None of that exists on a phone. What ports is the *policy*: routing decisions, reducers, validators, prompt assembly, the model registry, the settings shape, the summary presets, and the i18n bundle.
2. **The phone cannot do what the desktop's headline feature does.** There is no global hotkey, no pasting into whatever app is focused, and (on iOS) no capture of another app's audio. The mobile product is therefore a *notes and meetings* app first and a dictation app second. Section 4 designs the UI around that.
3. **Sync is a file format decision, not a networking decision.** With BYOC, the app never talks to a Neato server; it reads and writes a folder that the user's cloud provider keeps mirrored. So the note storage format must be designed for a cloud folder from day one (Section 5). SQLite on the phone becomes a rebuildable index, not the source of truth. This is the single biggest divergence from the desktop, which treats `transcriptions.db` as the truth.
4. **Two speech engines, one abstraction.** Whisper GGML via whisper.cpp is the safe, proven path on both platforms. The desktop's default engines (Parakeet TDT, Nemotron streaming) are sherpa-onnx models; a React Native sherpa-onnx binding exists but its Expo support and NeMo transducer coverage must be verified before it is relied on. The plan puts Whisper in Phase 2 and Parakeet/Nemotron in Phase 5 behind the same `SpeechEngine` interface.

---

## 1. Architectural map: what exists today and what ports

### 1.1 Audio recording (desktop) → mobile capture layer

| Desktop module | What it does | Verdict |
|---|---|---|
| `src/helpers/audioManager.js` (5,306 lines) | Dictation engine: MediaRecorder batch capture (`startRecording` :1194-1400, 250 ms timeslices :118), a 16 kHz AudioWorklet PCM path for live preview and streaming-commit (`:592-635`, `:1318-1356`), a speech-gate analyser (`:1238-1268`), `finalizeBatchRecording` (`:1456-1548`), `processAudio` (`:1807-1997`) and engine dispatch (`:1842-1892`). | **Rewrite the capture; keep the control flow.** The state machine, cancellation-generation guards, and the error taxonomy (`NotAllowedError`, `NotFoundError`, `NotReadableError`, `MicUnusableError`) transfer as design. The Web Audio graph does not. |
| `src/helpers/recordingValidation.js`, `recordingGuard.js`, `localSpeechGate.js` | Degenerate-recording check (`evaluateFinishedRecording`), the 256-byte floor, RMS/peak speech gate. | **Port verbatim.** Zero imports. |
| `src/stores/meetingRecordingStore.ts` (1,746 lines) | Meeting capture: mic at 24 kHz with AEC/NS/AGC deliberately off (`:111-115`), system audio via `getDisplayMedia` (`:170-242`), 800-sample PCM chunks to main (`:1228-1235`), session-guarded segment intake (`:1000-1087`). | **Rewrite capture; keep the state shape** (`MeetingRecordingState` `:81-107`, `TranscriptSegment` `:50-63`). System-audio capture has no mobile equivalent; on a phone a "meeting" is the room, recorded through the mic. |
| `src/stores/meetingSegmentReducer.ts` | Pure `(state, event) → state` for `partial` / `final` / `retract` events with timestamp-ordered insertion. | **Port verbatim.** This is the contract the mobile store implements against any engine. |
| `src/helpers/meetingMicGate.js`, `src/utils/audioUtils.js` | Chunk RMS/peak stats and send/skip verdicts; 24 kHz → 16 kHz downsample, PCM16 → WAV header, PCM16 → float32. | **Port the algorithms;** rewrite `Buffer` calls as `DataView`/typed arrays. |
| `src/hooks/useAudioRecording.js` (883 lines) | The dictation lifecycle `idle → preparing → recording → processing → idle` (`:97-108`), lock discipline (`:50-53`), delivery branch (paste vs clipboard `:592-646`). | **Port the lifecycle shape; drop delivery.** On mobile the result goes into a note or the clipboard, never "pasted at the cursor". |
| `src/hooks/useLiveTranscriptPanel.js`, `useMainWindowSizeOwner.js` | Floating-window choreography. | **Do not port.** Desktop window semantics only. |

### 1.2 Model management → mobile model store

| Desktop module | What it does | Verdict |
|---|---|---|
| `src/models/modelRegistryData.json`, `src/models/ModelRegistry.ts` | Single source of truth: 6 Whisper GGML entries with absolute HuggingFace URLs and `expectedSizeBytes` (`:141-203`), 5 sherpa-onnx archives (`:2-120`), Qwen 3.5 GGUF entries with `hfRepo`/`fileName`/`sizeBytes` (`:749-793`), URL builder `:209-211`. | **Port verbatim,** then add a `mobile` block per entry: which engine binding loads it, whether it fits a phone, and the mobile-specific download URL (Core ML encoder for Whisper on iOS). |
| `src/components/onboarding/autoLocalModels.ts` | Pure picker: English → streaming Nemotron, else Parakeet TDT; < 8 GB RAM → Qwen 2B, else 4B. | **Port,** with phone thresholds (Section 2.4). |
| `src/helpers/downloadUtils.js` | Resume via `Range` headers, 3 retries with capped backoff, 30 s stall timer, `.tmp` + atomic rename, 10 % size tolerance, 24 h stale-temp sweep. | **Re-implement the algorithm** over `expo-file-system`'s resumable downloads. The policy (retries, stall, tolerance) is worth copying line for line. |
| `src/helpers/whisper.js`, `parakeet.js`, `modelManagerBridge.js` | Per-engine download orchestration, disk-space prechecks (1.2× / 2.5× / 1.2×), single-flight guards, error codes (`DOWNLOAD_IN_PROGRESS`, `DOWNLOAD_CANCELLED`, `EXTRACTION_FAILED`, `INSUFFICIENT_DISK_SPACE`, `DOWNLOAD_CORRUPTED`). | **Port the orchestration and error codes;** the sidecar start/stop logic is gone. |
| `src/helpers/parakeetServer.js` `isModelDownloaded` (`:55-69`), `parakeetModelInfo.js` | "Every required file exists and is > 0 bytes" integrity rule; required-file manifests per model type. | **Port verbatim.** This is the fix for the 1.0.2 "empty model file" bug and must survive. |
| `src/hooks/useModelDownload.ts` | Renderer state machine: progress throttling (100 ms), version-guarded races, hydrate-after-remount, cancel blocked while installing. | **Port the state machine;** swap the three IPC progress channels for an event emitter from the native download task. |
| `whisperServer.js`, `parakeetWsServer.js`, `llamaServer.js` | Sidecar processes, ports, GPU ladders, health polling. | **Do not port.** Replaced by in-process native bindings. |

### 1.3 Transcription and summary state → mobile services

| Desktop module | What it does | Verdict |
|---|---|---|
| `src/helpers/dictationRouting.js` | Pure routing: cleanup vs agent vs translation vs skip, wake-word language, lifecycle input kind. | **Port verbatim.** |
| `src/helpers/parakeetWsResult.js` | Online-stream accumulator: latest-wins per segment id, partial appended after finals. | **Port verbatim;** it is the merge rule for any streaming engine. |
| `src/helpers/transcriptionTimeout.js` | 5 min floor, 10× real-time per audio second, 24 h ceiling. | **Port,** with phone-scale constants. |
| `src/stores/settingsStore.ts` (3,461 lines) | Flat Zustand store hydrated synchronously from `localStorage`; per-mode `meeting*` / `upload*` fields with fallback selectors (`:2527-2576`); `selectResolvedLLMConfig` (`:2624-2667`). | **Port the shape and selectors; replace persistence.** Synchronous hydration must become an async "hydrate then construct" boot step. Keep `readBoolean`'s asymmetric semantics or migrations misbehave. |
| `src/config/edition.ts`, `src/config/inferenceScopes.ts`, `src/config/summaryPresets.js` | Edition flags, the six LLM scopes, the five summary presets with `SHARED_RULES`. | **Port verbatim** (convert `summaryPresets.js` to ESM). |
| `src/stores/actionProcessingStore.ts` | Runs a summary action: chooses `BASE_SYSTEM_PROMPT` vs `MEETING_SYSTEM_PROMPT` (`:58-88`), appends the preset prompt (`:143`), calls `reasoningService.processText` non-streaming at temperature 0.3 (`:147-152`), writes `enhanced_content` + `enhancement_prompt` + `enhanced_at_content_hash`. | **Port almost verbatim;** the only seam is `updateNote`. Highest-value module in the summary path. |
| `PersonalNotesView.tsx` `handleRunAction` (`:726-784`) | Assembles note content + `## Meeting Context` + speaker-prefixed transcript into the user message. | **Extract into a pure function, then port.** Note that "is this a meeting" is decided by `parseTranscriptSegments(...).length > 0`, not `note_type`. |
| `src/services/ai/inferenceProviders/*` | `InferenceProvider` interface (`types.ts:34-39`), registry of 13 ids → 10 implementations, `local.ts` as an IPC stub. | **Port interface + registry;** write a new `local` provider over the on-device LLM binding; keep the cloud providers (they are plain `fetch`). |
| `src/helpers/database.js` | Schema and seeding (Section 5.2 maps it to files). | **Do not port.** Replaced by the vault format + a rebuildable SQLite index. |
| `src/helpers/meetingDetectionEngine.js` | Process/mic/calendar detection, auto-end. | **Do not port.** Only the calendar-driven prompt has a mobile analogue (Section 4.4). |
| Search: `noteSearch.js`, `searchNotesTool.ts`, RRF block (`ipcHandlers.js:1894-1915`), `localEmbeddings.js`, `vectorIndex.js` | FTS5 query builder, fallback chain, Reciprocal Rank Fusion (K=60), MiniLM + Qdrant sidecar. | **Port FTS5 + RRF;** replace Qdrant with an in-process vector table (Section 2.5). MiniLM via ONNX Runtime is optional in phase 1. |
| `src/utils/snippets.ts`, `dictionaryStartup.js`, `appendDictionarySuffix` | Snippet expansion (longest trigger first), dictionary startup reconciliation, prompt suffix. | **Port;** verify Hermes supports regex lookbehind (`snippets.ts:44`) or rewrite the boundary check with capture groups. |
| `src/i18n.ts`, `src/locales/*` | 10 UI languages, ~2,880 keys each, eagerly bundled. | **Port verbatim;** replace the two `navigator` / `localStorage` reads. Consider lazy-loading non-English bundles (~1.8 MB of JSON). |

### 1.4 What the mobile app will contain (target shape)

```
apps/mobile/
  app/                     Expo Router screens (Section 4)
  src/core/                ← copied verbatim from desktop, no platform imports
    routing/  dictationRouting.js, transcriptionFallback.js
    audio/    recordingValidation, localSpeechGate, meetingMicGate, audioUtils (typed-array rewrite)
    meeting/  meetingSegmentReducer.ts, meetingTranscriptPersistence.ts, meetingJoinUrl.js
    models/   modelRegistryData.json, ModelRegistry.ts, parakeetModelInfo.js, autoLocalModels.ts
    stream/   parakeetWsResult.js, transcriptionTimeout.js
    text/     snippets.ts, chineseScript.js, dictionaryEchoFilter.js, sanitizeGeneratedTitle.ts, llmTranscript.ts
    prompts/  summaryPresets, inferenceScopes, actionProcessing prompts, appendDictionarySuffix
    settings/ settings shape + selectResolved* selectors
    i18n/     locales, normalizeUiLanguage
  src/platform/            ← new, per-platform native seams
    audio/    recorder (expo-audio), PCM tap for live preview
    speech/   SpeechEngine interface → WhisperEngine (whisper.rn), SherpaEngine (react-native-sherpa-onnx)
    llm/      LocalLlm (llama.rn) implementing InferenceProvider
    files/    model store, vault store (expo-file-system)
    sync/     VaultSync interface → ICloudVault (iOS), DriveVault (Android)
    db/       expo-sqlite index + FTS5
```

The rule that keeps the port honest: nothing in `src/core` may import from `src/platform`. Enforce it with an ESLint `no-restricted-imports` rule from day one.

---

## 2. Dependency and native module strategy

Expo Go cannot load any of the native modules below. The project runs as an **Expo development build** (`expo prebuild` + `expo run:ios` / `expo run:android`, or EAS Build), with the New Architecture enabled (llama.rn requires it from v0.10). iOS builds require a Mac; plan for a Mac mini or a cloud Mac before Phase 3.

### 2.1 Audio capture: `expo-audio`

- `expo-audio` (not the deprecated `expo-av`) for recording, with its config plugin providing `iosBackgroundMode: true`, microphone permission strings, `RECORD_AUDIO` + `FOREGROUND_SERVICE` on Android, and the Android foreground-service notification ("Recording audio", stop button). Background recording on iOS continues under the `audio` `UIBackgroundModes` key with only the system's red status indicator.
- Recording format: AAC in `.m4a` for the saved file (small, playable everywhere), sample rate 16 kHz mono is *not* guaranteed by the recorder, so the engine layer decodes the file and resamples. For live preview (streaming) the app needs raw PCM frames, which `expo-audio` does not expose; use `react-native-audio-api`'s `AudioRecorder` (Software Mansion) as the PCM tap, or whisper.rn's own realtime audio input. Decide in Phase 2 spike; the abstraction is one interface: `start() / onPcm16(frame) / stop() → filePath`.
- Port the desktop's mic policy: no AEC/NS/AGC for meeting capture (`meetingRecordingStore.ts:111-115`), 16 kHz mono s16le as the engine wire format, 800-sample frames.

### 2.2 Speech-to-text: `whisper.rn` first, sherpa-onnx second

**`whisper.rn`** (mybigday, React Native binding of whisper.cpp; v0.5.x):
- `initWhisper({ filePath })` loads a GGML `.bin`; `transcribe(audioFilePath, { language, maxThreads, prompt })` returns `{ stop, promise }`; `RealtimeTranscriber` takes a 16 kHz mono PCM16 stream with VAD-driven slicing and `onTranscribe` callbacks.
- iOS: Core ML encoder (`coreMLModelAsset`, `.mlmodelc` files) for 2-3× speed on A-series chips; Extended Virtual Addressing entitlement recommended for medium/large models. Android: CPU with XNNPACK; `useGpu` on the Parakeet path.
- whisper.rn now also exposes `initParakeet({ filePath, useGpu })` loading a **GGUF Parakeet** model. This is the shortcut to the desktop's default engine without a second native library. Verify in the Phase 2 spike which Parakeet variants it accepts and whether output quality matches the sherpa-onnx int8 build the desktop ships.
- Model files: the same `ggml-*.bin` files the desktop registry already points at (`modelRegistryData.json:141-203`). Phone defaults: `tiny` (75 MB) for older Android, `base` (142 MB) as the recommended default, `small` (466 MB) as the accuracy step-up, `large-v3-turbo` (1.6 GB) only on flagship iPhones with EVA enabled. Never `medium`/`large` on phones.

**`react-native-sherpa-onnx`** (XDcobra; TurboModule, Android API 24+, iOS 13+):
- Offline and streaming recognizers, NNAPI / Core ML / XNNPACK acceleration, models loaded from app assets, filesystem, or Play Asset Delivery. Documented families are Zipformer/Transducer, Paraformer, NeMo CTC, Whisper, SenseVoice; **NeMo transducer (Parakeet TDT) and the streaming FastConformer (Nemotron) are not listed**, and Expo config-plugin support is not documented. Treat as Phase 5 research: if it loads the desktop's `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8` and `nemotron-speech-streaming-en-0.6b` archives, the phone gets the same streaming experience as the PC; if not, whisper.rn's Parakeet GGUF path is the fallback.

**Engine abstraction** (`src/platform/speech/SpeechEngine.ts`), mirroring what the desktop's `processAudio` dispatch does implicitly:
- `load(modelId)`, `unload()`, `transcribeFile(path, { language, prompt, signal })`, `createStream({ language, onPartial, onFinal }) → { sendPcm16, finish, abort }`.
- The stream's `finish` semantics copy `parakeetWsServer.createOnlineStream` (`:435-575`): a flush deadline that extends while results keep arriving and a `truncated` flag; the accumulator is `parakeetWsResult.createOnlineAccumulator`.
- The file path copies `parakeetServer.transcribe` (`:108-218`): 16 kHz normalization, RMS silence gate at 0.001, 15 s segmentation for non-streaming models, one empty-decode retry, `" "` join.

### 2.3 Summaries and the assistant: `llama.rn`

- `llama.rn` (mybigday, React Native binding of llama.cpp; JSI bridge, Metal on iOS, Hexagon NPU on supported Android, New Architecture required). Loads the same GGUF files the desktop uses.
- Phone defaults from `autoLocalModels.ts` become: ≥ 8 GB device RAM → `qwen3.5-4b-q4_k_m` (2.7 GB); 6-8 GB → `qwen3.5-2b-q4_k_m` (1.3 GB); < 6 GB → summaries via a cloud key or "on your PC" (Section 5.6). Read RAM through `expo-device`'s `totalMemory`.
- Context size capped at 8,192 on phones (desktop caps at 16,384 in `modelManagerBridge.js:21` for the same RAM reason). Idle unload after 2 minutes, not the desktop's 5, because iOS will jettison a backgrounded app holding 3 GB.
- Implement as a new `InferenceProvider` (`src/services/ai/inferenceProviders/types.ts:34-39`) so `actionProcessingStore.ts` and the chat path run unchanged. Cloud providers (OpenAI, Anthropic, Gemini, Groq) port as-is since they are `fetch`-based; the Anthropic IPC-bridge workaround for CORS is unnecessary on native.

### 2.4 Model file management: `expo-file-system`

- Storage root: `FileSystem.documentDirectory + "models/"` on both platforms. On iOS mark the directory `excludeFromBackup` (models are re-downloadable and iCloud backup would otherwise upload gigabytes). On Android this lives in internal app storage; do not use external storage for models.
- Layout mirrors the desktop cache (`modelDirUtils.js:136-138`): `models/whisper/ggml-base.bin`, `models/whisper/ggml-base-encoder.mlmodelc/` (iOS), `models/parakeet/<id>/…`, `models/llm/<file>.gguf`.
- Downloads use `FileSystem.createDownloadResumable` with the desktop policy from `downloadUtils.js`: `.tmp` suffix, resume from the partial length, 3 retries with 1 s → 30 s backoff, 30 s stall timer, atomic rename, size check with 10 % tolerance, stale `.tmp` sweep at launch. Free-space precheck via `FileSystem.getFreeDiskStorageAsync` at the desktop multipliers (1.2× for single files, 2.5× for archives).
- Archives: sherpa-onnx models ship as `.tar.bz2`. There is no bzip2 in Expo; either host re-packed `.zip` (or plain-file) mirrors of the four archives on GitHub Releases under `markhiltonapps/neato-echo-models`, or download the individual `.onnx` + `tokens.txt` files. Re-hosting is simpler and lets the registry pin `expectedSizeBytes` per file, which the desktop only has for Cohere.
- Core ML encoders for iOS come from the `ggerganov/whisper.cpp` HuggingFace repo as `ggml-<model>-encoder.mlmodelc.zip`; unzip with `expo-file-system` + a small zip module (or ship them pre-unzipped in the same mirror).
- Integrity rule copied from `parakeetServer.isModelDownloaded`: a model is installed only if every required file exists with size > 0. Registry entries gain a `files: [{ name, expectedSizeBytes }]` list so the check is data-driven.
- Downloads run in a foreground JS task while the app is open; for the 2.7 GB summary model, also register `expo-background-task` (or keep the screen-on hint) so a user can lock the phone during the first download.

### 2.5 Storage and search: `expo-sqlite`

- `expo-sqlite` (async API) as the **index**, never the source of truth (Section 5). Tables: `notes_index`, `notes_fts` (FTS5 external-content, same trigger design as `database.js:331-371`), `folders`, `actions`, `custom_dictionary`, `snippets`, `speaker_mappings`, `sync_state`. Verify FTS5 is compiled into the Expo SQLite build in the Phase 1 spike; if not, `op-sqlite` ships FTS5.
- Semantic search: skip Qdrant. Store 384-dim MiniLM vectors as a BLOB column and brute-force cosine over a few thousand notes in JS, or use `sqlite-vec` via `op-sqlite`. Keep the RRF fusion (K=60, 0.3 score floor) from `ipcHandlers.js:1894-1915`. MiniLM inference needs `onnxruntime-react-native`; defer to Phase 6.

### 2.6 Platform entry points

- `expo-share-intent` (v8): receive audio files (`.m4a`, `.mp3`, `.wav`) and text shared from other apps into a new note; this is the mobile equivalent of the desktop's Upload page.
- `expo-notifications` for the calendar-driven "meeting starting, take notes?" prompt; `expo-calendar` to read events (replaces the desktop's Google/Microsoft OAuth flows: the phone already has the calendars).
- `expo-clipboard` for "copy transcript"; `expo-haptics` for record start/stop.
- Widgets and quick actions (Section 4.2) need small native targets and are Phase 4.

### 2.7 Things to verify in the first week (spike list)

1. whisper.rn builds in an Expo dev build on both platforms with the New Architecture on, and `RealtimeTranscriber` accepts PCM from the chosen recorder.
2. whisper.rn `initParakeet` accepts a Parakeet GGUF and its output matches the desktop's quality on a 60-second sample.
3. llama.rn loads `qwen3.5-2b-q4_k_m` on a mid-range Android (e.g. Pixel 7a, 8 GB) and produces a Team Meeting summary of a 10-minute transcript in under 60 s.
4. `expo-sqlite` FTS5 availability.
5. Hermes regex lookbehind for `snippets.ts`.
6. iCloud ubiquity container access from an Expo module on iOS (Section 5.4).

---

## 3. Step-by-step migration

Each phase ends with something a teammate can install through TestFlight / Play internal testing. Effort assumes Claude Code doing the typing and a person doing device testing; calendar time is dominated by device round-trips and store review, not coding.

### Phase 0 — Workspace (days 1-2)

1. Create `apps/mobile` as a new Expo project in a separate repo (`markhiltonapps/neato-echo-mobile`) rather than inside the Electron repo; the desktop repo's Node 24 / electron-builder toolchain and the Expo toolchain should not share a `package-lock.json`. Share core code by publishing `@neato/echo-core` from a new `packages/core` directory copied out of `src/` (Section 1.4), versioned in lockstep.
2. Expo SDK current stable, TypeScript strict, Expo Router, New Architecture enabled, Hermes. Add `expo-dev-client`. Configure EAS Build profiles for `development`, `preview` (internal distribution), `production`.
3. Bundle identifiers: `com.neatoventures.neatoecho` (matches the desktop `appId` in `electron-builder.json`), URL scheme `neatoecho`.
4. Brand: import `src/assets/logo.svg` (the authoritative mark) for the app icon and splash; bundle Space Mono and Outfit via `expo-font`; convert the `neato-echo-site/DESIGN.md` HSL tokens to a theme object. Honour the Brown Ink Rule (no gray) and Two Signals Rule (teal structures, orange acts); draw the die-cut offset shadow as a layered view since native shadows cannot do a hard `5px 5px 0`.
5. Copy `src/locales` and `i18n.ts`; replace `navigator.language` with `expo-localization`.
6. ESLint boundary rule (`core` may not import `platform`). CI: typecheck + `node --test` on the core package (the desktop already has tests for `dictationRouting`, `meetingSegmentReducer`, `meetingMicGate`, `flow.ts`, `autoLocalModels`; they run unchanged).

### Phase 1 — Storage first: the vault and the index (days 3-6)

The BYOC decision means storage is designed before recording, not after.

1. Implement the **vault** (Section 5.2) under `FileSystem.documentDirectory + "NeatoEcho/"` as a plain folder. Everything reads and writes through one `VaultStore` module: `writeNote`, `appendTranscriptSegments`, `writeSummary`, `readNote`, `listNotes`, `tombstone`.
2. Implement the SQLite **index** and the `reindex(vaultRoot)` routine that rebuilds every table from the folder. The app must survive deleting the database file.
3. Port `noteSearch.js` (FTS5 query builder) and the RRF block.
4. Port `summaryPresets.js` and the desktop seeding rule (`app_meta.summary_presets_seeded_v1`, presets stored as ordinary editable actions with `is_builtin = 0`) into `actions/*.json` files in the vault.
5. Port `settingsStore` shape + `selectResolved*` selectors over `expo-secure-store` (API keys) and `AsyncStorage` / MMKV (everything else) with an async boot hydration.
6. Milestone: notes list, note editor, folders, search, working entirely offline with hand-written test notes.

### Phase 2 — Speech engine and the model store (days 7-12)

1. Model store per Section 2.4: registry with `files[]`, resumable downloads with the desktop retry policy, integrity check, delete, free-space precheck, stale-temp sweep.
2. `WhisperEngine` over whisper.rn: file transcription first (`transcribeFile`), then `createStream` using `RealtimeTranscriber`.
3. Port `recordingValidation`, `localSpeechGate`, `parakeetWsResult`, `transcriptionTimeout`, and the segmentation/silence-gate policy from `parakeetServer.transcribe`.
4. Upload path: pick or share an audio file → transcribe → new note. This exercises the engine without touching the microphone.
5. Milestone: share a voice memo into the app, get a transcript into a vault note.

### Phase 3 — Recording (days 13-18)

1. Recorder module over `expo-audio`, with background mode on iOS and the foreground service on Android. Save `.m4a` into the note's `audio/` folder.
2. PCM tap for live preview feeding `WhisperEngine.createStream`; the preview text reducer is `buildLiveTranscriptionPreview` from `src/utils/transcriptionPreview.ts`.
3. Dictation lifecycle ported from `useAudioRecording.js` (`idle → preparing → recording → processing → idle`), minus paste. Result lands in the open note or a new note.
4. Meeting recording: same recorder, long-form, chunked transcription every 5 s (the desktop's `LOCAL_MEETING_CHUNK_INTERVAL_MS`) through `meetingSegmentReducer`, segments appended to `transcript.jsonl` as they finalize (append-only is what makes sync safe; Section 5.3).
5. Interruption handling: phone call, Siri, headphone unplug, app killed. On relaunch, a `recording.lock` file inside the note folder plus the partial `.m4a` triggers a "Recover recording?" prompt, the mobile form of the desktop's salvaged-recording path (`audioManager.js:1477-1488`).
6. Milestone: 30-minute meeting recorded with the screen locked, transcript readable afterwards.

### Phase 4 — Summaries and the assistant (days 19-23)

1. `LocalLlm` provider over llama.rn implementing `InferenceProvider`; cloud providers ported as-is.
2. Port `actionProcessingStore.ts` and the extracted `handleRunAction` assembly (note content + meeting context + speaker-prefixed transcript). Keep the desktop's two divergences in mind and fix them on the way: send `getDictionaryHintWords` rather than raw `customDictionary`, and send the dictionary for personal notes too (`actionProcessingStore.ts:142-146`).
3. Post-recording summary sheet with the five presets + user actions, same "Don't ask again" preference key `askSummaryAfterRecording`.
4. Summary output written to `summary.md` in the vault with frontmatter (preset, generated time, content hash) so a summary is never considered fresh for a transcript it did not see (the desktop's `enhanced_at_content_hash` rule).
5. Chat with a note (note-scoped conversation), stored under the note folder as `chat/<conversationId>.jsonl`.
6. Milestone: end a meeting, tap Team Meeting, get the summary on-device.

### Phase 5 — Sync (days 24-30)

Detailed in Section 5. Order: desktop watched folder first (it is the smallest change and unblocks testing), then iOS iCloud, then Android Drive.

### Phase 6 — Polish, second engines, store submission (days 31-40)

1. sherpa-onnx spike for Parakeet/Nemotron streaming (Section 2.2); adopt if it clears the quality bar.
2. Semantic search (MiniLM via ONNX Runtime) if FTS5 alone proves insufficient.
3. Widgets, App Intents / Shortcuts, Quick Settings tile (Section 4.2).
4. Privacy manifests, microphone permission strings, background-mode justifications, App Store screenshots. Expect one Apple rejection round on background audio; the answer is that recording continues in the background for meeting notes and nothing is uploaded.

---

## 4. UI/UX adaptation

### 4.1 What replaces the hotkey

The desktop's centre of gravity is "press Ctrl+Win anywhere, text appears at the cursor". A phone has no cursor to paste into, so the mobile centre of gravity is **"one tap to start capturing, everything lands in a note"**.

- **Home = Notes list with a persistent record button.** A single teal-on-cream floating action button at the bottom centre (the desktop's dictation pill, reinterpreted). Tap = start a dictation into a new note; long-press = start a meeting recording. While recording, the FAB becomes a capsule showing elapsed time, live waveform (from `getRecordingAudioLevel`'s RMS, 80 ms cadence as on desktop), and the live preview text when the streaming engine is active.
- **Lock screen / Dynamic Island.** iOS Live Activity showing elapsed time and a Stop control; Android foreground-service notification with Stop. This is the "I started a meeting and put the phone down" case and is the mobile equivalent of the desktop's always-on-top meeting card.
- **Dictation into other apps** is offered honestly as a two-step: dictate in Neato Echo, then Share or Copy. A custom keyboard extension is possible on Android (a proper IME with a mic key) and constrained on iOS (keyboard extensions cannot use the microphone without Full Access and still cannot run 500 MB models). Defer; do not promise system-wide dictation on the phone.

### 4.2 System-level entry points

- **Share sheet** (`expo-share-intent`): audio files and text shared from Voice Memos, Files, WhatsApp, email → "New note from…" flow. Replaces the desktop Upload page.
- **iOS App Intents / Shortcuts**: "Start Neato Echo meeting", "Dictate a note". This gives Action Button (iPhone 15 Pro and later) and Back Tap support for free, which is the closest thing to a hotkey iOS allows.
- **Android**: Quick Settings tile "Neato Echo: Record" and a 1×1 home-screen widget; both start the foreground recording service directly.
- **Watch** (later): a one-button Apple Watch complication that starts a meeting on the phone.

### 4.3 Screens (Expo Router)

| Route | Content | Desktop source of truth |
|---|---|---|
| `/` Notes | Folder chips (Personal, Meetings, Videos seeded as on desktop), search, list, FAB | `PersonalNotesView.tsx`, folders seeding `database.js:384-392` |
| `/note/[id]` | Title, summary tab / transcript tab / chat tab; speaker labels editable; Copy, Share, Re-summarize | note editor + `PostRecordingSummaryDialog.tsx` |
| `/record` (modal) | Big stop button, elapsed, level meter, live text, "Add a marker" (writes a timestamped bookmark segment) | dictation pill + meeting recording state |
| `/setup` (first run) | Three screens: microphone, "Getting your phone ready" (auto model download with one progress bar, the 1.1.0 desktop design), optional sync | `AutoLocalSetupStep.tsx`, `SetupChoiceStep.tsx` |
| `/settings` | Speech engine & model, Summaries model, Sync (Section 5.5), Dictionary & snippets, Language, Support | `SettingsPage.tsx` sections `speechToText`, `intelligence`, `dictionary` |

Keep the desktop's copy and i18n keys wherever a screen has a counterpart, so the manual on echo.neatoventures.com describes both apps with one vocabulary.

### 4.4 Meeting detection on a phone

There is no process list and no system-audio tap. What remains is calendar: read events with `expo-calendar`, schedule a local notification one minute before the start (the desktop's `MEETING_REMINDER_LEAD_MS`), with a "Take notes" action that opens `/record` in meeting mode with the event title and attendees pre-filled. `meetingJoinUrl.js` ports verbatim to extract the join link for a "Join" action.

### 4.5 Design guardrails

Use the site's DESIGN.md as the source of truth: cream ground, teal for structure, burnt orange for the single action per screen, brown for every border and shadow, Space Mono uppercase for labels, Outfit for reading text. Native platform conventions win where they conflict with the desktop (iOS large titles, Android back gesture, system share sheets). No glass, no gray, no icon grids.

---

## 5. Bring-Your-Own-Cloud sync

Decision: users sync through a cloud they already pay for. iOS uses iCloud Drive; Android and Windows use Google Drive. Neato Ventures runs no server, stores no user data, and the lifetime license has no recurring cost behind it.

### 5.1 Principles

1. **The folder is the database.** Everything the user would grieve losing lives as files inside one folder, `Neato Echo/`, in a format a human can open. SQLite is a cache that can be deleted and rebuilt from the folder on any device.
2. **Small files, one concern each.** Cloud sync engines conflict at file granularity. A note is a folder of small files, not one big file, so two devices editing different parts of a note never touch the same bytes.
3. **Append when possible, overwrite when small.** Transcripts and chats are append-only line files. Metadata files are tiny and last-write-wins.
4. **Every write is stamped.** `updatedAt` (UTC, milliseconds) and `updatedBy` (device id) on every file that can change, so conflicts are decidable without a server.
5. **Never lose a version silently.** When two devices did change the same file, the loser is kept beside the winner as a `.conflict` copy, never deleted.

### 5.2 Vault format (the storage format on every platform)

```
Neato Echo/
  vault.json                          { "format": 1, "createdAt", "createdBy" }
  devices/
    <deviceId>.json                   { "name": "Mark's iPhone", "platform": "ios", "lastSeenAt", "appVersion" }
  folders.json                        [{ "id", "name", "sortOrder", "isDefault", "updatedAt", "updatedBy", "deleted" }]
  actions/
    <actionId>.json                   { "id", "name", "description", "prompt", "icon", "sortOrder", "updatedAt", "updatedBy", "deleted" }
  dictionary.jsonl                    one line per entry: { "id", "word", "createdAt", "deleted", "updatedAt", "updatedBy" }
  snippets.jsonl                      one line per entry: { "id", "trigger", "replacement", ... }
  notes/
    <noteId>/                         noteId = ULID (time-sortable, unique per device, no coordination)
      note.json                       { "id", "title", "type": "personal|meeting", "folderId", "createdAt",
                                        "updatedAt", "updatedBy", "deleted": false,
                                        "calendar": { "eventId", "title", "start", "end", "joinUrl" } | null,
                                        "participants": [...],
                                        "audio": [{ "file", "startedAt", "durationMs" }],
                                        "contentHash" }
      content.md                      the note body (personal notes; empty for pure meetings)
      transcript.jsonl                one segment per line, append-only:
                                      { "id", "ts", "source": "mic|system", "speaker", "speakerName", "text", "updatedBy" }
      speakers.json                   { "<speakerId>": { "name", "profileId", "locked", "updatedAt", "updatedBy" } }
      summary.md                      frontmatter { "preset", "presetId", "generatedAt", "contentHash", "model", "updatedBy" } + markdown
      chat/
        <conversationId>.jsonl        { "id", "role", "content", "createdAt", "updatedBy" } per line
      audio/
        2026-09-05T16-30-00Z.m4a      optional; excluded from sync when the user turns "Sync audio" off
  trash/
    (unused: deletion is a tombstone in note.json; hard purge after 30 days is done by each device locally)
```

Mapping from the desktop schema (`database.js`):

| Desktop column / table | Vault location |
|---|---|
| `notes.title, note_type, folder_id, created_at, updated_at, deleted_at, calendar_event_id, participants` | `note.json` |
| `notes.content` | `content.md` |
| `notes.transcript` (serialized `TranscriptSegment[]`) | `transcript.jsonl` |
| `notes.enhanced_content, enhancement_prompt, enhanced_at_content_hash` | `summary.md` + frontmatter |
| `speaker_mappings` | `speakers.json` |
| `agent_conversations`, `agent_messages` (note-scoped) | `chat/*.jsonl` |
| `folders` | `folders.json` |
| `actions` (incl. seeded summary presets) | `actions/*.json` |
| `custom_dictionary`, `snippets` | `dictionary.jsonl`, `snippets.jsonl` |
| `transcriptions` (dictation history) | **not synced** in v1; per-device history stays in the local index |
| `calendar_events`, tokens, `speaker_profiles.embedding` | **not synced**; device-local (embeddings are engine-specific and private) |
| `notes_fts`, vector index | rebuilt locally from the vault |

Identity rules: `noteId`, `segmentId`, `actionId` are ULIDs minted on the writing device. The desktop currently uses `INTEGER PRIMARY KEY AUTOINCREMENT` ids; the desktop migration (Section 5.5) assigns a ULID to every existing row once and keeps a `vault_id` column for the mapping.

Content hash: SHA-256 of `content.md` + `transcript.jsonl` at summary time, stored in `summary.md` frontmatter, so "summary is stale" is computable on any device.

Size: a one-hour meeting is roughly 60 KB of transcript, 5 KB of summary, and 30-60 MB of `.m4a`. Audio sync is a per-device toggle, default on for iCloud (users have space) and off for Google Drive free tier.

### 5.3 Conflict handling

**Rule of thumb: last write wins, by `updatedAt`, per file, and the loser is never thrown away.**

1. **Clock discipline.** Each device keeps a monotonic `vaultClock`: on every write, `updatedAt = max(now, lastSeenRemoteUpdatedAt + 1 ms)`. That keeps ordering sane when a phone's clock is minutes off. `updatedBy` is the tiebreak when timestamps are equal (lexically larger device id wins; arbitrary but deterministic).
2. **Detecting a real conflict.** The local index's `sync_state` table stores, per file, the hash of the version last synced (`baseHash`). On seeing a remote change: if the local file still equals `baseHash`, apply the remote version (no conflict). If the local file also changed since `baseHash`, both sides edited: apply the winner by `updatedAt`, and write the loser to `<name>.conflict-<deviceId>-<timestamp>.<ext>` in the same folder. The UI shows a small "This note has another version" banner on notes that carry a `.conflict` file, with "Keep this" / "Keep other" / "Keep both as a copy".
3. **Append-only files never conflict.** `transcript.jsonl` and `chat/*.jsonl` are merged by taking the union of lines by `id` and re-sorting by `ts`. Two devices recording the same meeting is not a supported case, but the merge still produces a readable result rather than a loss.
4. **Tombstones win over edits older than them.** `note.json.deleted = true` with `updatedAt` T beats any edit with `updatedAt < T`. An edit made after the deletion (on a device that had not seen it yet) resurrects the note and the app tells the user. Hard purge of a tombstoned folder happens locally 30 days after `updatedAt`, never as a sync operation.
5. **Whole-file LWW for the small lists.** `folders.json`, `actions/*.json`, `speakers.json`: per-entry `updatedAt` inside the file so two devices renaming different folders merge cleanly; the file-level winner is chosen only when the same entry changed on both.
6. **Audio is immutable.** An `.m4a` is written once and never modified, so it is copied, never merged; if two files share a name (practically impossible with timestamped names), the newer `note.json.audio[]` entry wins.
7. **What LWW cannot fix, and the app says so.** Editing the same personal-note body on two devices while both are offline produces a `.conflict` copy of `content.md`. That is acceptable for a 2-3 person team and is the same behaviour Obsidian, Logseq and Apple Notes-over-folders users already understand.

### 5.4 Integration plan per platform

**Desktop (Windows), first because it is the smallest change.**
1. Add a "Sync folder" setting: the user points Neato Echo at a folder inside a cloud client's synced tree (`%USERPROFILE%\Google Drive\Neato Echo`, `%USERPROFILE%\iCloudDrive\Neato Echo`, OneDrive, Dropbox all work). The app never talks to a cloud API on desktop; the cloud client does the syncing. This is the "watched folder" tier and costs no OAuth work.
2. Extend the existing one-way "Save notes as files" mirror (`noteFilesEnabled` / `noteFilesPath` in `settingsStore.ts`) into a two-way vault writer: every `database.js` write to `notes`, `folders`, `actions`, `custom_dictionary`, `snippets`, `speaker_mappings`, `agent_messages` also writes the vault file; a `chokidar` watcher on the vault folder imports remote changes through the conflict rules above. `sync_state` lives in the desktop SQLite.
3. One-time migration: assign ULIDs to existing rows, export everything into the vault, mark the database as "indexed from vault".
4. Verification: two Windows PCs on the same Google Drive account see each other's notes within the cloud client's sync latency (typically under a minute).

**iOS: iCloud Drive via the app's ubiquity container.**
1. Enable the iCloud Documents capability and a container `iCloud.com.neatoventures.neatoecho`. Files written under `<ubiquityURL>/Documents/Neato Echo/` appear in the Files app under "Neato Echo" and sync automatically; the OS handles upload, download, and offline queues.
2. Expo has no built-in iCloud Documents API. Options, in order of preference: `react-native-cloud-store` (iCloud Drive document read/write/list with change events), or a small custom Expo Module in Swift wrapping `FileManager.url(forUbiquityContainerIdentifier:)`, `startDownloadingUbiquitousItem`, and an `NSMetadataQuery` for change notifications. Write the module: it is under 200 lines of Swift and removes a dependency risk.
3. The vault lives in the container; the app's local `documentDirectory` copy is *not* used on iOS (the container is already local-with-sync). `NSMetadataQuery` results drive `sync_state` and the index update.
4. Verification: iPhone + Windows PC running "iCloud for Windows" with the vault at `%USERPROFILE%\iCloudDrive\Neato Echo` exchange notes.

**Android: Google Drive REST API.**
1. Android has no user-visible filesystem sync client, so the app talks to Drive directly. Google Sign-In through `@react-native-google-signin/google-signin` with the `drive.file` scope (the app can only see files it created; the folder is visible to the user in Drive as "Neato Echo"). Reuse the existing Google Cloud project `neato-echo` and register an Android OAuth client; the calendar verification work already in progress covers the consent screen.
2. `DriveVault` implements the same `VaultSync` interface as `ICloudVault`: `push(localChanges)`, `pull()`, `watch()`. Pull uses `changes.list` with a stored `startPageToken`, so each sync is one cheap request; push uploads changed files with `files.update` on known ids and `files.create` in the note's Drive folder for new ones. Folder ids are cached in `sync_state`.
3. Scheduling: sync on app foreground, after every recording ends, after every summary, and via `expo-background-fetch` roughly every 15 minutes when on Wi-Fi (Android permits; iOS does not need it because iCloud is push).
4. Verification: Android phone + Windows PC with Google Drive for Desktop syncing the same account.

**Cross-cloud reality.** iCloud and Google Drive do not sync with each other. The supported pairings are: iPhone ↔ Windows via iCloud for Windows; Android ↔ Windows via Google Drive for Desktop; iPhone ↔ Android is not supported in v1 and the setup screen says so. A user with both phones picks one cloud, which means Google Drive on iOS as a Phase 7 option (same `DriveVault` code, since it is pure REST).

### 5.5 Settings and UX for sync

- Setup screen 3: "Keep your notes on all your devices" with one switch per platform (iCloud Drive / Google Drive), explained in one line: "Your notes are saved in your own cloud. Neato Ventures never sees them."
- Settings → Sync: status line ("Up to date", "3 notes waiting", "Last synced 2 min ago"), "Sync audio recordings" toggle, "Show sync folder", "Rebuild index" (deletes and re-creates the SQLite index from the vault), and a list of notes with unresolved `.conflict` copies.
- Desktop gets the mirror image: a folder picker, the same status line, and the same conflict list, added to Settings → Privacy & Data.

### 5.6 What sync unlocks beyond notes

Because the PC and the phone share a vault, a phone that cannot run the 4B summary model can leave a `summary.request.json` in the note folder; the desktop app, when it next syncs, generates the summary and writes `summary.md`. No server, no cloud key, and the phone shows "Summary will be ready when your PC is on". This is optional (Phase 7) but is the cleanest answer to "phones are weak at LLMs" that keeps the $0 model.

### 5.7 Security and privacy notes

- Files in the user's cloud are protected by that cloud's encryption at rest and the user's own account security. Neato Echo does not add a second layer in v1; document this plainly in the privacy policy ("your notes live in your iCloud or Google Drive"). A per-vault passphrase with file-level encryption is possible later but breaks the "open it in Files" transparency and makes conflict copies unreadable, so it is deliberately out of scope.
- API keys for optional cloud providers never enter the vault; they stay in `expo-secure-store` on each device (the desktop keeps them in `safeStorage` under `userData/secure-keys/`).
- Device ids are random ULIDs, not hardware identifiers.

---

## 6. Where the BYOC decision changed the plan

For the record, these are the places this plan differs from a "port the desktop, add sync later" roadmap:

1. **Storage is Phase 1, before recording.** The vault format and the rebuildable index exist before a single second of audio is captured, so nothing is ever written in a shape that later needs a migration.
2. **SQLite demoted to an index.** The desktop's `transcriptions.db` is the source of truth; on mobile (and, after the desktop migration, on Windows too) the folder is. `Rebuild index` is a first-class setting.
3. **A note is a folder of small files, with an append-only transcript.** That structure exists purely to make cloud-folder syncing conflict-free in the common cases.
4. **ULIDs everywhere.** Autoincrement ids cannot be minted independently on two devices; the desktop gets a one-time id migration as part of the sync feature.
5. **Every mutable file carries `updatedAt` and `updatedBy`,** and the app keeps a monotonic clock, so last-write-wins is decidable offline.
6. **Desktop watched-folder first.** The cheapest integration (no cloud API on Windows) is also the one that lets the phone apps be tested against real data early.
7. **iPhone-to-Android is explicitly unsupported in v1**, stated in the setup UI, instead of being discovered by a user.
8. **The "summary on your PC" relay** replaces what would otherwise have been the first server-side feature.
