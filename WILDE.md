# Orca, Wilde Systems theme

A themed build of [Orca](https://github.com/stablyai/orca) with the Wilde Systems identity: oil-slick
contour material behind the left and right sidebars, the Wilde Systems mark beside the Orca mark in
the title bar, a mint/lavender dark palette, and a matching terminal color theme. It is **not** an
official Orca release and is not affiliated with or endorsed by stablyai.

It installs over regular Orca and uses the same app identity and profile, so settings, projects,
sign-ins and the `orca` CLI carry over unchanged. Wilde turns on the first time the build loads a
profile; switch it off (or tune sidebar material, intensity and motion) in
**Settings > Appearance > Wilde Systems**. Light mode always shows stock Orca.

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

Everything Wilde is gated on `[data-wilde-appearance="on"].dark`, so switching it off restores stock
styling. The main files:

- `src/renderer/src/assets/wilde-theme.css`, `wilde-sidebar.css`: palette tokens, sidebar material, title bar lockup
- `src/renderer/src/app-shell/WildeBrandLockup.tsx`: WS mark and wordmark in the title bar
- `src/shared/wilde-appearance.ts` and `components/settings/WildeAppearanceSetting.tsx`: the setting
- `src/renderer/src/lib/terminal-themes/wilde.ts`: the "Wilde Systems Dark" terminal theme
- `resources/wilde/`, `resources/build/icon.*`, `resources/icon*.png`: marks and the app icon

## License and trademarks

Orca's source is MIT-licensed (see [LICENSE](LICENSE)); that license and its notices are unchanged
and apply to this build's code. The Wilde Systems name, the WS mark and the Wilde app icon in
`resources/wilde/` and `resources/build/` are trademarks of Wilde Systems and are **not** covered
by the MIT license; see [resources/wilde/TRADEMARK.md](resources/wilde/TRADEMARK.md).
