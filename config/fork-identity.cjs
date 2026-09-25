// Frozen identity for the Wilde Systems fork ("Orca Wilde").
// CJS so electron-builder.config.cjs and plain Node scripts can require it
// outside the TS build. Keep every packaging-facing rename here; in-repo
// consumers reference these names so a future rename is one file.
//
// Deliberately NOT here (shared compatibility surfaces that stay "Orca"):
// ~/.orca agent hooks, ~/.orca-remote SSH roots, ORCA_* env vars, RPC
// identifiers, and the remote-side `orca` command role.

const PRODUCT_NAME = 'Orca Wilde'
const APP_ID = 'systems.wilde.orca'
const DEV_PRODUCT_NAME = 'Orca Wilde Dev'
const DEV_APP_ID = 'systems.wilde.orca.dev'

// Windows executable carries no space so bare image-name lookups, ProgIDs, and
// relocated daemon copies stay predictable (`OrcaWilde.exe`).
const WINDOWS_EXECUTABLE_NAME = 'OrcaWilde'
const WINDOWS_MARKDOWN_PROG_ID = 'OrcaWilde.Markdown'

// Linux keeps the historical "not `orca`" rule: Ubuntu's GNOME Orca
// screen-reader package owns /usr/bin/orca, and stock Orca owns `orca-ide`,
// so the fork's packaged command is orca-wilde on every platform.
const CLI_COMMAND_NAME = 'orca-wilde'
const LINUX_EXECUTABLE_NAME = CLI_COMMAND_NAME
const URI_SCHEME = 'orca-wilde'

// Windows daemon-host relocation root: %LOCALAPPDATA%\<name>\daemon-host.
// Must stay in sync with the uninstall sweep in config/nsis/orca-installer-hooks.nsh.
const WINDOWS_DAEMON_ROOT_NAME = 'OrcaWilde'

// WSL per-user data directory under ~/.local/share and the managed PowerShell
// bridge filename inside it.
const WSL_SHARE_DIR_NAME = 'orca-wilde'
const WSL_BRIDGE_FILENAME = 'orca-wilde-bridge.ps1'

// The public source fork lives at github.com/shaecodes-wilde/orca-wilde. It
// publishes no release builds, so updater feed setup stays disabled in
// src/main/updater/updater-setup.ts until a real feed exists.
const PUBLISH_OWNER = 'shaecodes-wilde'
const PUBLISH_REPO = 'orca-wilde'
const PUBLISH_DEV_CHANNEL_REPOS = {
  hourly: 'orca-wilde-hourly',
  daily: 'orca-wilde-daily',
  adhoc: 'orca-wilde-adhoc'
}

module.exports = {
  PRODUCT_NAME,
  APP_ID,
  DEV_PRODUCT_NAME,
  DEV_APP_ID,
  WINDOWS_EXECUTABLE_NAME,
  WINDOWS_MARKDOWN_PROG_ID,
  CLI_COMMAND_NAME,
  LINUX_EXECUTABLE_NAME,
  URI_SCHEME,
  WINDOWS_DAEMON_ROOT_NAME,
  WSL_SHARE_DIR_NAME,
  WSL_BRIDGE_FILENAME,
  PUBLISH_OWNER,
  PUBLISH_REPO,
  PUBLISH_DEV_CHANNEL_REPOS
}
