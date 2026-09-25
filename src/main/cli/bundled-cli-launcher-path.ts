import { join } from 'node:path'

// Why `orca-wilde` on Linux: GNOME Orca ships /usr/bin/orca and stock Orca owns
// `orca-ide`, so the fork's CLI claims neither. Mirrors CLI_COMMAND_NAME in
// config/fork-identity.cjs.
export const LINUX_CLI_COMMAND_NAME = 'orca-wilde'

/** Absolute path of the CLI launcher this app ships in its own resources bundle.
 *  Lives apart from cli-installer so callers that only need the path (PTY env
 *  assembly) don't pull in the installer's `electron` dependency. */
export function getBundledLauncherPath(
  platform: NodeJS.Platform,
  resourcesPath: string
): string | null {
  if (platform === 'darwin') {
    return join(resourcesPath, 'bin', 'orca-wilde')
  }
  if (platform === 'linux') {
    return join(resourcesPath, 'bin', LINUX_CLI_COMMAND_NAME)
  }
  if (platform === 'win32') {
    return join(resourcesPath, 'bin', 'orca-wilde.exe')
  }
  return null
}
