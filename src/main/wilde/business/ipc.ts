import { app, ipcMain, dialog } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Store } from '../../persistence'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import { isTrustedBrowserRenderer } from '../../ipc/browser-renderer-trust'
import { getSecretStore } from '../../../shared/secret-store'
import {
  commandSchema,
  commandAuditSchema,
  type BusinessResult,
  type BusinessRequest
} from '../../../shared/wilde/commands'
import { targetKey, type BusinessTarget } from '../../../shared/wilde/domain'
import {
  navigationInputSchema,
  resolveBusinessCommand
} from '../../../shared/wilde/navigation-commands'
import { BusinessService } from './service'
import { listBusinessTargets } from './workspace-links'
import { listRemoteBusinessTargets } from './remote-workspace-links'
import { N8nCollector } from '../n8n/collector'
import { N8nConnectionStore } from '../n8n/connection-store'

export function registerWildeBusinessHandlers(store: Store, runtime: OrcaRuntimeService): void {
  const service = new BusinessService(store.getProfileStorageDirectory())
  const connections = new N8nConnectionStore(store.getProfileStorageDirectory(), getSecretStore())
  const collector = new N8nCollector(service, async () => connections.load())
  const enabled = process.env.ORCA_WILDE_BUSINESS_DISABLED !== '1'
  const authorize = (event: Electron.IpcMainInvokeEvent): void => {
    if (!enabled) {
      throw new Error('Business services are disabled for this installation.')
    }
    if (!isTrustedBrowserRenderer(event.sender) || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Business access denied.')
    }
  }
  const snapshot = () =>
    service.execute({ requestId: randomUUID(), command: { operation: 'snapshot' } })
  const targets = async () => {
    const data = await snapshot()
    if (!data.snapshot) {
      throw new Error(data.message)
    }
    const results = await Promise.all([
      listBusinessTargets(store, runtime, data.snapshot.ownerId),
      listRemoteBusinessTargets(app.getPath('userData'), data.snapshot.ownerId)
    ])
    return results.flat()
  }
  const previews = new Map<
    string,
    { senderId: number; targets: BusinessTarget[]; restore: boolean; expires: number }
  >()
  const execute = async (
    event: Electron.IpcMainInvokeEvent,
    request: BusinessRequest
  ): Promise<BusinessResult> => {
    for (const [token, preview] of previews) {
      if (preview.expires < Date.now()) {
        previews.delete(token)
      }
    }
    const command = request.command
    const preview = command.operation === 'commit' ? previews.get(command.token) : undefined
    if (command.operation === 'commit') {
      if (!preview || preview.senderId !== event.sender.id) {
        return { status: 'stale-context', message: 'Review the change again in this window.' }
      }
      if (preview.targets.length) {
        const catalog = await targets()
        if (
          preview.targets.some(
            (target) =>
              !catalog.some(
                (current) => current.available && targetKey(current) === targetKey(target)
              )
          )
        ) {
          return {
            status: 'stale-context',
            message: 'An assignment target changed or disconnected. Refresh and review again.'
          }
        }
      }
      if (preview.restore) {
        await collector.stop()
        try {
          connections.setEnabled(false)
        } catch {
          collector.start()
          return {
            status: 'failed',
            message:
              'Import was not applied: collection could not be durably paused. Check profile permissions and review again.'
          }
        }
      }
    }
    try {
      const result = await service.execute(request)
      if (result.preview) {
        previews.set(result.preview.token, {
          senderId: event.sender.id,
          targets: result.preview.targets ?? [],
          restore: command.operation === 'import-preview' && command.mode !== 'outcomes',
          expires: Date.now() + 300000
        })
      }
      if (command.operation === 'commit' && result.status === 'success') {
        previews.delete(command.token)
        if (preview?.restore) {
          collector.configurationChanged()
          result.message =
            'Business data imported. Collection is paused; explicitly reconnect after reviewing restored records.'
        }
      } else if (preview?.restore) {
        collector.configurationChanged()
        result.message += ' Collection remains paused; reconnect explicitly after reviewing.'
      }
      return result
    } catch (error) {
      if (preview?.restore) {
        collector.configurationChanged()
      }
      throw error
    }
  }
  ipcMain.handle(
    'wildeBusiness:execute',
    async (event, input: unknown): Promise<BusinessResult> => {
      authorize(event)
      const parsed = commandSchema.safeParse(input)
      if (!parsed.success) {
        return { status: 'rejected', message: 'Invalid business command.' }
      }
      const command = parsed.data.command
      const mutations =
        command.operation === 'save'
          ? [command]
          : command.operation === 'preview'
            ? command.mutations
            : []
      const assignments = mutations.flatMap((mutation) =>
        mutation.operation === 'save' && mutation.record.type === 'assignment'
          ? [mutation.record]
          : []
      )
      if (assignments.length) {
        const catalog = await targets()
        for (const assignment of assignments) {
          if (
            !catalog.some(
              (target) => target.available && targetKey(target) === targetKey(assignment.target)
            )
          ) {
            return {
              status: 'rejected',
              message:
                'Workspace or project is no longer available on its owning host. Reconnect or refresh before assigning.'
            }
          }
        }
      }
      return execute(event, parsed.data)
    }
  )
  ipcMain.handle('wildeBusiness:targets', (event) => {
    authorize(event)
    return targets()
  })
  ipcMain.handle('wildeBusiness:auditCommand', async (event, input: unknown) => {
    authorize(event)
    await service.recordCommandAudit(commandAuditSchema.parse(input))
  })
  ipcMain.handle('wildeBusiness:resolveCommand', async (event, input: unknown) => {
    authorize(event)
    const command = navigationInputSchema.parse(input)
    const data = await snapshot()
    if (!data.snapshot) {
      return { status: 'unavailable', message: data.message }
    }
    const catalog = /workspace|terminal/i.test(command.text) ? await targets() : []
    return resolveBusinessCommand(command, data.snapshot, catalog)
  })
  ipcMain.handle('wildeBusiness:connection', (event) => {
    authorize(event)
    return collector.state()
  })
  ipcMain.handle('wildeBusiness:sync', (event) => {
    authorize(event)
    return collector.sync()
  })
  ipcMain.handle('wildeBusiness:setConnectionEnabled', async (event, value: unknown) => {
    authorize(event)
    const enabled = z.boolean().parse(value)
    await collector.stop()
    try {
      connections.setEnabled(enabled)
    } catch (error) {
      collector.start()
      throw error
    }
    collector.configurationChanged()
    if (enabled) {
      collector.start()
    }
    return collector.sync()
  })
  ipcMain.handle('wildeBusiness:configureConnection', async (event, input: unknown) => {
    authorize(event)
    const args = z
      .object({
        label: z.string().min(1).max(240),
        baseUrl: z.string().max(2048),
        apiKey: z.string().max(8192),
        enabled: z.boolean()
      })
      .strict()
      .parse(input)
    await collector.stop()
    try {
      connections.save(args)
    } catch (error) {
      collector.start()
      throw error
    }
    collector.configurationChanged()
    collector.start()
    return collector.sync()
  })
  ipcMain.handle(
    'wildeBusiness:chooseImport',
    async (event, input: unknown): Promise<BusinessResult> => {
      authorize(event)
      const mode = z.enum(['merge', 'replace', 'outcomes']).parse(input)
      const selection = await dialog.showOpenDialog({
        title: 'Preview business import',
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (selection.canceled || !selection.filePaths[0]) {
        return { status: 'cancelled', message: 'Import cancelled.' }
      }
      const file = selection.filePaths[0]
      if ((await stat(file)).size > 10 * 1024 * 1024) {
        return { status: 'rejected', message: 'Import exceeds 10 MiB.' }
      }
      return execute(event, {
        requestId: randomUUID(),
        command: { operation: 'import-preview', content: await readFile(file, 'utf8'), mode }
      })
    }
  )
  ipcMain.handle('wildeBusiness:saveExport', async (event): Promise<BusinessResult> => {
    authorize(event)
    const result = await service.execute({
      requestId: randomUUID(),
      command: { operation: 'export' }
    })
    if (!result.exported) {
      return result
    }
    const selection = await dialog.showSaveDialog({
      title: 'Save business backup — contains private business records',
      defaultPath: 'wilde-business-backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (selection.canceled || !selection.filePath) {
      return { status: 'cancelled', message: 'Export cancelled.' }
    }
    await writeFile(selection.filePath, result.exported, { mode: 0o600 })
    return {
      status: 'success',
      message: 'Business backup saved. Credentials and Orca sessions were excluded.'
    }
  })
  if (enabled) {
    const timer = setTimeout(() => collector.start(), 15000)
    timer.unref()
    app.once('before-quit', () => {
      clearTimeout(timer)
      void collector.stop().finally(() => service.close())
    })
  }
}
