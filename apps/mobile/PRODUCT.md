---
name: Neato Echo (mobile)
one_liner: An offline-first, bring-your-own-key voice recorder that transcribes, summarizes, and translates on the phone — and syncs to your own cloud and desktop.
platform: android
mode: operate
---

# Neato Echo — mobile companion

## What it is

The mobile companion to the Neato Echo desktop app. A voice recorder that does the
whole loop **on-device**: record → transcribe → summarize → translate. It syncs to
the user's own Neato Cloud (Supabase) and, through it, to the desktop app.

## Who it's for

Mark and a small internal test group (5–10 people) today; individuals and small teams
who want capable, private voice notes and meeting capture without handing audio to a
third-party service. Explicitly appeals to users who value **off-grid / offline-capable**
operation — the core loop works with no internet.

## Core jobs (what a user comes to do)

- **Capture** a voice note or meeting, hands-free-ish, and get a clean transcript.
- **Transcribe on-device** in up to ~99 languages (auto-detected), no cloud required.
- **Summarize** with a chosen style (recap, action items, team meeting, interview,
  sales call, …) or a **custom style** written in the user's own prompt.
- **Translate** any transcript into any language.
- **Ask across recordings** (Ask Neddy chat) — questions, and agentic actions like
  "move this meeting into Developers" (creates the folder if needed).
- **Organize** into folders (create / rename / move / reorder), browse by **calendar**
  or by **Today / This week / This month**.
- **Import a YouTube video's** transcript (captioned videos), on-device.
- **Sync** recordings, folders, summary styles, and chats to the user's own cloud and
  desktop — two-way, with clear origin (mobile vs desktop) badges.

## Principles / constraints

- **Offline-first.** Recording, transcription (whisper.rn), and summarization/translation
  with a BYO key must work with no connection. Cloud is additive, never required.
- **Bring your own key / your own cloud.** No mandatory Neato account; BYOK Anthropic or
  the opt-in Neato Cloud (Supabase). Audio never goes to a third party the user didn't choose.
- **Privacy.** Audio stays on device unless the user syncs it to their own bucket.
- **Cross-platform parity.** Whatever ships on mobile should have a desktop counterpart and
  vice versa; shared logic lives in `@neato/core`.
- **Android-first** (React Native / Expo, single `App.tsx`); iOS not a current target.

## Non-goals (for now)

- No mandatory sign-in or subscription to use the core loop.
- No server-side audio processing by default (YouTube Tier B, a download+Whisper worker,
  is deliberately deferred to preserve the off-grid stance).
- Not a real-time/streaming transcriber on mobile yet (desktop does streaming meetings).

## Success looks like

A user can record in any supported language, get a readable speaker-labeled transcript,
summarize/translate it, organize it, and see it on their other device — all without
thinking about infrastructure, and mostly without a connection.
