// Packaged command names; mirror CLI_COMMAND_NAME in config/fork-identity.cjs.
// `orca`/`orca-ide`/`orca.cmd` remain stock Orca's names — never emitted here.
export function getOrcaCliCommandNameForPlatform(platform: NodeJS.Platform): string {
  if (platform === 'linux') {
    return 'orca-wilde'
  }
  if (platform === 'win32') {
    return 'orca-wilde.cmd'
  }
  return 'orca-wilde'
}
