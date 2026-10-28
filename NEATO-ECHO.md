# Neato Echo — maintainer notes

Neato Echo is a Neato Ventures fork of [OpenWhispr](https://github.com/OpenWhispr/openwhispr) (MIT).
This file records what differs from upstream and how to build and release. Everything else in
the repository is upstream's and should stay mergeable.

## What changed from upstream

| Area | Change | Where |
|---|---|---|
| Identity | Product name, app id `com.neatoventures.neatoecho`, `neatoecho://` URL scheme, icons, locale strings, default assistant name "Echo" | `package.json`, `electron-builder.json`, `main.js`, `src/assets`, `src/locales/*` |
| Edition | Local-first edition flag; cloud accounts hidden unless `VITE_NEATO_ACCOUNTS_ENABLED=true` at build time | `src/config/edition.ts` and the few call sites that import it |
| Defaults | On-device Parakeet for dictation and meetings, AI cleanup off, local cleanup mode | `src/stores/settingsStore.ts` (fallback defaults only) |
| Summaries | Five editable summary presets seeded once; post-recording picker | `src/config/summaryPresets.js`, `src/helpers/database.js`, `src/components/notes/PostRecordingSummaryDialog.tsx` |
| Storage | Model and vector cache under `~/.cache/neato-echo` | `src/helpers/modelDirUtils.js` and friends |
| Releases | Installer `Neato-Echo-Setup-<version>.exe`, portable `Neato-Echo-Portable-<version>.exe`, updater feed `markhiltonapps/neato-echo` | `electron-builder.json` |

Internal identifiers (IPC channel names, `OPENWHISPR_*` environment variables, storage keys,
D-Bus names) are deliberately unchanged.

## Building on Windows

```bash
npm ci
npm run build:win
```

`build:win` runs `prebuild:win` first, which compiles the native helpers and downloads the
bundled binaries and models into `resources/bin`. The Windows key listener compiles with MSVC;
run the build from a shell where `cl.exe` is on the PATH (a "Developer Command Prompt", or
`call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64`
first). Without it the script tries to download a prebuilt listener from upstream's releases,
which may be older than the source in `resources/`.

Output lands in `dist/`: the NSIS installer, the portable exe, `latest.yml`, and the `.blockmap`.
Builds are unsigned until a code-signing certificate is configured (`win.azureSignOptions` or
`WIN_CSC_LINK`); SmartScreen shows "More info → Run anyway" on first launch.

## Releasing

1. Bump `version` in `package.json` and `package-lock.json` (root entry) and commit.
2. Build (`npm run build:win`).
3. Create a GitHub release tagged `v<version>` on `markhiltonapps/neato-echo` and attach
   `Neato-Echo-Setup-<version>.exe`, its `.blockmap`, `latest.yml`, and optionally the portable exe.
   `latest.yml` and the blockmap are what the in-app auto-updater reads.
4. The website reads the releases API, so the Download button and changelog update themselves.

Do not push upstream's tags to this fork: GitHub lists bare tags in the releases feed and the
auto-updater would treat an upstream tag as a newer version.

## Syncing upstream

```bash
git fetch upstream
git merge upstream/main
```

Conflicts, if any, will be in the small set of files listed above.

## Testing

`npm test` runs upstream's suite. On a Windows developer machine, 42 test files fail identically
on upstream and on this fork (platform-specific helpers); compare against a clean upstream
checkout before treating a failure as a regression. `npm run typecheck` and `npm run lint`
should be clean.

## Working with Claude Code

Do not launch or install the app from a Claude Code session on Windows. The Claude desktop app
runs as an MSIX package with file virtualization, so anything started from its sessions writes
`AppData` to a private redirected copy that the user's normal launches never see. Build from
Claude, then install and run from the Start Menu.
