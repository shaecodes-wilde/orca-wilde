export const DEFAULT_MAC_COMMAND_PATH = '/usr/local/bin/orca-wilde'
export const DEV_COMMAND_NAME = 'orca-dev'
// Why 'orca': this is the historical command name the product line once used;
// cleanup only fires when the resolved target lives inside fork-owned trees, so
// stock Orca's own files are never managed.
export const LEGACY_LINUX_COMMAND_NAME = 'orca'
// Why: marks a ~/.local/bin/orca-wilde dispatcher file the serve path wrote so
// repeat serve starts overwrite our own file but never clobber a user's own
// file — and so CliCommandInspection reads it as managed (stale), not conflict.
export const LINUX_SERVE_DISPATCHER_MARKER = '# orca-wilde-serve-cli-dispatcher'
export const DEV_LAUNCHER_DIR = ['cli', 'bin'] as const
export const WINDOWS_PATH_WRITE_TIMEOUT_MS = 5_000
