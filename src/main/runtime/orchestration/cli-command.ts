import type { ProjectExecutionRuntimeResolution } from '../../../shared/project-execution-runtime'

// Why 'orca' persists: SSH-remote terminals resolve the shared remote relay
// shim, which keeps the stock name (see ~/.orca-remote). 'orca-dev' is the
// dev-checkout command. Everything local and packaged is 'orca-wilde'.
export type OrchestrationCliCommand = 'orca' | 'orca-dev' | 'orca-wilde'

export function resolveTerminalOrchestrationCliCommand(args: {
  connectionId: string | null
  isWsl: boolean | null | undefined
  worktreeId: string
  projectRuntime?: ProjectExecutionRuntimeResolution
  runtimeCliCommand?: OrchestrationCliCommand
}): OrchestrationCliCommand {
  if (args.connectionId) {
    return 'orca'
  }
  if (args.runtimeCliCommand) {
    return args.runtimeCliCommand
  }
  // Local (native + WSL) packaged/dev terminals all resolve the fork command;
  // the stock `orca`/`orca-ide` names are never emitted here.
  return 'orca-wilde'
}
