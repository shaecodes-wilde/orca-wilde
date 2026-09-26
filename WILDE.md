# Orca, Wilde Systems theme

A themed build of [Orca](https://github.com/stablyai/orca) with the Wilde Systems identity: an oil-slick
photo backdrop behind the left and right sidebars, the Wilde Systems mark beside the Orca mark in
the title bar, a mint/lavender dark palette, and a matching terminal color theme. It is **not** an
official Orca release and is not affiliated with or endorsed by stablyai.

It installs over regular Orca and uses the same app identity and profile, so settings, projects,
sign-ins and the `orca` CLI carry over unchanged. Wilde turns on the first time the build loads a
profile; switch it off (or tune sidebar material and intensity) in
**Settings > Appearance > Wilde Systems**. In light mode the sidebars stay Wilde-dark and the rest
of the app is stock Orca.

## Business workspace

Home, Clients, Workspaces and Automations add a local single-operator business workspace.
Client records, delivery notes and reviewed workspace assignments live in a separate
SQLite database inside the active profile. Automations reads an existing n8n server;
it does not install n8n or deploy workflows. Existing scheduled agent automations remain
available. Local push-to-talk navigation uses an already installed Parakeet model.

See [setup, privacy, backup and voice coverage](docs/wilde-super-app-setup.md) and
[verification evidence](docs/audits/wilde-super-app/README.md). Set
`ORCA_WILDE_BUSINESS_DISABLED=1` before launching to disable the business interface and
collector independently of the appearance theme. Keep the business database for recovery;
disabling does not delete it. The installed app/profile are not a test environment.

Code: `src/main/wilde/business/`, `src/main/wilde/n8n/`, `src/shared/wilde/`,
`src/renderer/src/components/wilde-business/`, and `src/renderer/src/app-shell/WildeBusiness*`.

## Spotify mini-player

On Windows, a Spotify player is docked at the bottom of the right sidebar. Now playing and
play/pause/previous/next come from the Spotify desktop app through Windows' media controls, so they
work with no login. Seeking, the Liked Songs heart and the "Recently played" menu (which plays an
album or playlist on this PC) use the Spotify Web API and need a one-time connection (Premium for
playback control):

1. At https://developer.spotify.com/dashboard, create an app and select **Web API**.
2. Add the redirect URI `http://127.0.0.1:43117/callback`.
3. Paste the app's **Client ID** into **Settings > Appearance > Wilde Systems > Spotify account**
   and click **Connect Spotify**. No client secret is needed (PKCE); the refresh token is sealed
   with Windows secure storage in the Orca profile.

Also on the card: a **volume** button (bottom right) that sets Spotify's own in-app volume, not
the Windows volume (scroll over it to step ±5; Premium), and a **visualizer** ring of lavender bars
around play/pause. The visualizer listens to Spotify's audio only (WASAPI process loopback via
`native/wilde-spotify-windows/SpotifyAudioTap.cs`, compiled with the .NET Framework `csc.exe` that
ships with Windows), analyses it in memory (never recorded), and captures nothing while paused or
while Orca is hidden; it costs about 1.5% of one CPU core while playing. Switch it off with
**Visualizer** in Settings.

Turn the player off with the **Spotify player** switch in the same section. Code:
`src/main/wilde/spotify/`, `native/wilde-spotify-windows/media-session.ps1`,
`src/renderer/src/components/wilde-spotify/`.

## OBS scene bar

A strip of OBS controls sits in the left sidebar above the settings gear: three numbered
scene-preset buttons, a microphone mute, and a small status readout. It talks to OBS over the
built-in obs-websocket v5 server (OBS ≥ 28) — the button presses are ordinary scene switches,
and the mic button toggles your Mic/Aux input inside OBS.

One-time setup: in OBS, open **Tools → WebSocket Server Settings** and tick **Enable WebSocket
Server**. Orca reads the port and password from OBS's own config file
(`%APPDATA%\obs-studio\plugin_config\obs-websocket\config.json`), so there's nothing else to
enter. While OBS is unreachable the bar dims and shows "OBS offline"; it reconnects on its own
every few seconds.

The presets map to `Orca Capture` (1), `Display 1 Scene 2` (2) and `Camera Full Screen` (3) —
the active scene's button stays highlighted, and the mic icon goes red while muted. Renaming a
scene in OBS or changing which preset points where lives in `wilde-obs.json` in the Orca
profile (`presets`, plus `host`/`port`/`micInputName` overrides if the auto-detect ever picks
the wrong input). Turn the bar off with **OBS controls** in Settings → Appearance → Wilde
Systems. Code: `src/main/wilde/obs/`, `src/renderer/src/components/wilde-obs/`.

## Updates

Auto-update is disabled in this build (`src/main/updater/fork-update-feed.ts`): stock Orca's update
feed would replace the themed build with stock Orca. To pick up a new Orca release, merge upstream and
rebuild:

```sh
git fetch origin && git merge origin/main   # origin = stablyai/orca
corepack pnpm install --frozen-lockfile
corepack pnpm build:win                     # or build:mac / build:linux
```

Then run the installer from `dist/`. To go back to stock Orca, install it from
[onOrca.dev](https://onOrca.dev); your profile is unaffected.

## What changed from upstream

Everything Wilde is gated on `[data-wilde-appearance="on"]` (app-wide overrides also on `.dark`;
the sidebars carry their own `dark` class so they stay Wilde in light mode), so switching it off
restores stock styling. The sidebar material is `assets/wilde/oil-slick-photo.jpg`, a
`background-attachment: fixed` layer so both sidebars show one continuous image. The main files:

- `src/renderer/src/assets/wilde-theme.css`, `wilde-sidebar.css`: palette tokens, sidebar material, title bar lockup
- `src/renderer/src/assets/wilde-attention.css`, `components/sidebar/worktree-list/attention/`,
  `lib/wilde-attention-viewed.ts`: sidebar attention cards. A breathing lavender card wraps a
  group whose workspace needs you (permission prompt, question, error, unread output). A mint card
  marks an agent that finished since you last opened or typed in that workspace. In the flat
  ('none') grouping the workspace card itself is tinted. Small upstream hooks:
  `set-active-worktree.ts` / `worktree-unread-activity.ts` (mark viewed), `group-sections.ts`
  (project header `worktreeIds`), `worktree-card-surface.tsx`, `VirtualizedWorktreeViewport.tsx`
- `src/renderer/src/app-shell/WildeBrandLockup.tsx`: WS mark and wordmark in the title bar
- `src/shared/wilde-appearance.ts` and `components/settings/WildeAppearanceSetting.tsx`: the setting
- `src/renderer/src/lib/terminal-themes/wilde.ts`: the "Wilde Systems Dark" terminal theme
- `resources/wilde/`, `resources/build/icon.*`, `resources/icon*.png`: marks and the app icon

## License and trademarks

Orca's source is MIT-licensed (see [LICENSE](LICENSE)); that license and its notices are unchanged
and apply to this build's code. The Wilde Systems name, the WS mark and the Wilde app icon in
`resources/wilde/` and `resources/build/` are trademarks of Wilde Systems and are **not** covered
by the MIT license; see [resources/wilde/TRADEMARK.md](resources/wilde/TRADEMARK.md).
