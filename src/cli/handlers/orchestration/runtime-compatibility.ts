import { RuntimeClientError } from '../../runtime-client'

export function resolveCompatibilityCliCommand():
  | 'orca'
  | 'orca-ide'
  | 'orca-dev'
  | 'orca-wilde' {
  const configured = process.env.ORCA_CLI_COMMAND
  // Why accept stock names: a caller may export ORCA_CLI_COMMAND pointing at a
  // stock Orca shim (e.g. a remote-managed session); pass it through verbatim.
  if (
    configured === 'orca' ||
    configured === 'orca-ide' ||
    configured === 'orca-dev' ||
    configured === 'orca-wilde'
  ) {
    return configured
  }
  return 'orca-wilde'
}

export function resolvePackagedWindowsCompatibilityCommand():
  | 'orca'
  | 'orca-ide'
  | 'orca-wilde'
  | undefined {
  if (process.env.ORCA_WINDOWS_PACKAGED_CLI_LAUNCHER !== '1') {
    return undefined
  }
  const command = process.env.ORCA_CLI_COMMAND
  if (command === 'orca' || command === 'orca-ide' || command === 'orca-wilde') {
    return command
  }
  throw new RuntimeClientError(
    'invalid_argument',
    'The packaged Orca launcher did not provide a valid resume command. No question was created.'
  )
}

export async function flushOrchestrationStdout(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write('', (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

export function isDevCliInvocation(): boolean {
  return (
    process.env.ORCA_DEV_CLI_INVOCATION === '1' ||
    (process.env.ORCA_USER_DATA_PATH?.includes('orca-dev') ?? false)
  )
}
