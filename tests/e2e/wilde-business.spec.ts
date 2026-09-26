import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import { ensureTerminalVisible, waitForSessionReady } from './helpers/store'
import { composeWorktreeHostIdentity } from '../../src/shared/worktree/host-qualified-identity'

const CLIENT = 'Disposable Harbour Electrical'
const PROJECT = 'Disposable booking intake'
const NOTE = 'Disposable delivery handoff'
const NOTE_BODY = 'Fixture evidence: intake routing approved; next action is a supervised handoff.'

async function openClients(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Wilde business', exact: true })
    .getByRole('button', { name: 'Clients', exact: true })
    .click()
  await expect(page.getByRole('main', { name: 'Wilde business' })).toBeVisible()
}

test('persists client delivery, knowledge and exact workspace assignment across restart', async ({
  testRepoPath
}, testInfo) => {
  test.setTimeout(300_000)
  const session = createRestartSession(testInfo, {
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_WILDE_BUSINESS_DISABLED: '0'
  })
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null
  try {
    const first = await session.launch()
    firstApp = first.app
    await waitForSessionReady(first.page)
    const worktreeId = await attachRepoAndOpenTerminal(first.page, testRepoPath)
    await ensureTerminalVisible(first.page)
    await openClients(first.page)

    await first.page.getByRole('button', { name: 'New client', exact: true }).click()
    await first.page.getByLabel('Client name', { exact: true }).fill(CLIENT)
    await first.page.getByLabel('Owner', { exact: true }).fill('Disposable operator')
    await first.page.getByRole('button', { name: 'Save client', exact: true }).click()
    await expect(first.page.getByRole('dialog')).toHaveCount(0)
    await first.page.getByRole('button', { name: CLIENT, exact: true }).click()
    await expect(first.page.getByRole('heading', { name: CLIENT, exact: true })).toBeVisible()

    await first.page.getByRole('button', { name: 'New delivery project', exact: true }).click()
    await first.page.getByLabel('Project title', { exact: true }).fill(PROJECT)
    await first.page
      .getByLabel('Intended outcome', { exact: true })
      .fill('Every fixture enquiry reaches a reviewed queue.')
    await first.page.getByLabel('Next action', { exact: true }).fill('Prepare the fixture handoff.')
    await first.page.getByRole('button', { name: 'Save project', exact: true }).click()
    await expect(first.page.getByRole('heading', { name: PROJECT, exact: true })).toBeVisible()
    await first.page.getByRole('button', { name: 'Add delivery note', exact: true }).click()
    await first.page.getByLabel('Note title', { exact: true }).fill(NOTE)
    await first.page.getByLabel('Note content', { exact: true }).fill(NOTE_BODY)
    await first.page.getByRole('button', { name: 'Save note', exact: true }).click()
    await expect(first.page.getByRole('dialog')).toHaveCount(0)

    // Assignment setup crosses the real preload, IPC, validation and SQLite worker boundaries.
    const assigned = await first.page.evaluate(
      async ({ worktreeId, clientName, projectTitle }) => {
        const api = window.api.wildeBusiness
        if (!api) {
          throw new Error('Business preload bridge is unavailable')
        }
        const result = await api.execute({
          requestId: crypto.randomUUID(),
          command: { operation: 'snapshot' }
        })
        if (result.status !== 'success' || !result.snapshot) {
          throw new Error(result.message)
        }
        const client = result.snapshot.records.find(
          (record) => record.type === 'client' && record.name === clientName
        )
        const project = result.snapshot.records.find(
          (record) => record.type === 'project' && record.title === projectTitle
        )
        const available = (await api.targets()).find(
          (target) =>
            target.kind === 'worktree' && target.locator === worktreeId && target.hostId === 'local'
        )
        if (
          !client ||
          project?.type !== 'project' ||
          project.clientId !== client.id ||
          !available?.available
        ) {
          throw new Error('Fixture client, project or exact local workspace is unavailable')
        }
        const target = {
          kind: available.kind,
          ownerId: available.ownerId,
          hostId: available.hostId,
          stableId: available.stableId,
          locator: available.locator,
          name: available.name
        }
        const now = new Date().toISOString()
        const preview = await api.execute({
          requestId: crypto.randomUUID(),
          command: {
            operation: 'preview',
            mutations: [
              {
                operation: 'save',
                record: {
                  id: crypto.randomUUID(),
                  revision: 0,
                  createdAt: now,
                  updatedAt: now,
                  archivedAt: null,
                  type: 'assignment',
                  clientId: client.id,
                  projectId: project.id,
                  target,
                  reason: 'Disposable restart acceptance fixture'
                }
              }
            ]
          }
        })
        if (
          preview.status !== 'needs-confirmation' ||
          !preview.preview ||
          preview.preview.conflicts
        ) {
          throw new Error(`Assignment preview failed: ${preview.message}`)
        }
        const commit = await api.execute({
          requestId: crypto.randomUUID(),
          command: { operation: 'commit', token: preview.preview.token }
        })
        if (commit.status !== 'success') {
          throw new Error(`Assignment commit failed: ${commit.message}`)
        }
        return target
      },
      { worktreeId, clientName: CLIENT, projectTitle: PROJECT }
    )

    await first.page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await first.page.getByRole('tab', { name: 'Workspaces', exact: true }).click()
    await expect(
      first.page
        .getByRole('main', { name: 'Wilde business' })
        .getByText(assigned.name, { exact: true })
    ).toBeVisible()
    await expect(
      first.page
        .getByRole('main', { name: 'Wilde business' })
        .getByText(`worktree · ${assigned.hostId} · ${assigned.locator}`, { exact: true })
    ).toBeVisible()
    await testInfo.attach('business-assignment-before-restart', {
      body: await first.page.screenshot(),
      contentType: 'image/png'
    })
    await session.close(firstApp)
    firstApp = null

    const second = await session.launch()
    secondApp = second.app
    await waitForSessionReady(second.page)
    await openClients(second.page)
    await second.page.getByRole('button', { name: CLIENT, exact: true }).click()
    await expect(second.page.getByRole('heading', { name: PROJECT, exact: true })).toBeVisible()
    await second.page.getByRole('tab', { name: 'Knowledge', exact: true }).click()
    await expect(second.page.getByRole('heading', { name: NOTE, exact: true })).toBeVisible()
    await expect(second.page.getByText(NOTE_BODY, { exact: true })).toBeVisible()
    await second.page.getByText(NOTE_BODY, { exact: true }).scrollIntoViewIfNeeded()
    await testInfo.attach('business-note-after-restart', {
      body: await second.page.screenshot(),
      contentType: 'image/png'
    })

    await second.page.getByRole('tab', { name: 'Workspaces', exact: true }).click()
    const business = second.page.getByRole('main', { name: 'Wilde business' })
    await expect(business.getByText(assigned.name, { exact: true })).toBeVisible()
    await expect(
      business.getByText(`worktree · ${assigned.hostId} · ${assigned.locator}`, { exact: true })
    ).toBeVisible()
    await business.getByRole('button', { name: 'Open', exact: true }).click()
    await expect(second.page.locator('.xterm').first()).toBeVisible({ timeout: 30_000 })
    const activeWorkspace = second.page.locator(
      '[role="option"][data-worktree-id][aria-current="page"]'
    )
    await expect(activeWorkspace).toHaveAttribute('data-worktree-id', worktreeId)
    await expect(activeWorkspace).toHaveAttribute(
      'data-worktree-host-identity',
      composeWorktreeHostIdentity('local', worktreeId)
    )
    await expect(second.page.getByRole('main', { name: 'Wilde business' })).toHaveCount(0)
    await testInfo.attach('business-workspace-reopened', {
      body: await second.page.screenshot(),
      contentType: 'image/png'
    })
    await second.page.getByRole('button', { name: 'Return to client', exact: true }).click()
    await expect(second.page.getByRole('heading', { name: CLIENT, exact: true })).toBeVisible()
    await second.page.getByRole('tab', { name: 'Knowledge', exact: true }).click()
    await expect(second.page.getByText(NOTE_BODY, { exact: true })).toBeVisible()
    await second.page.getByLabel('Command', { exact: true }).fill('Open their active projects.')
    await second.page.getByRole('button', { name: 'Run command', exact: true }).click()
    await expect(second.page.getByRole('heading', { name: PROJECT, exact: true })).toBeVisible()
    await second.page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await second.page.getByRole('tab', { name: 'Activity', exact: true }).click()
    await expect(
      second.page.getByText('Command: show projects — completed', { exact: true })
    ).toBeVisible()
  } finally {
    for (const app of [secondApp, firstApp]) {
      if (app) {
        await session.close(app).catch(() => undefined)
      }
    }
    await session.dispose()
  }
})

test('records a real microphone capability attempt without storing audio @wilde-microphone', async (// oxlint-disable-next-line no-empty-pattern -- This opt-in test owns its isolated Electron launch.
{}, testInfo) => {
  test.skip(
    process.env.ORCA_WILDE_TEST_MIC !== '1',
    'Physical microphone capture requires ORCA_WILDE_TEST_MIC=1; ordinary runs do not access a microphone.'
  )
  test.setTimeout(120_000)
  const session = createRestartSession(testInfo, { ORCA_BACKGROUND_LAUNCH: '1' })
  let launched: ElectronApplication | null = null
  try {
    const { app, page } = await session.launch()
    launched = app
    await waitForSessionReady(page)
    expect(app.process().spawnargs.join(' ')).not.toContain('use-fake-device-for-media-stream')
    expect(app.process().spawnargs.join(' ')).not.toContain('use-file-for-fake-audio-capture')
    const capability = await page.evaluate(async () => {
      let stream: MediaStream | undefined
      let context: AudioContext | undefined
      let acquireTimer: ReturnType<typeof setTimeout> | undefined
      let expired = false
      const stopTracks = (candidate: MediaStream) =>
        candidate.getTracks().forEach((track) => track.stop())
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          return { available: false, reason: 'getUserMedia-unavailable', tracksStopped: true }
        }
        const pending = navigator.mediaDevices.getUserMedia({ audio: true })
        void pending.then(
          (lateStream) => {
            if (expired) {
              stopTracks(lateStream)
            }
          },
          () => undefined
        )
        stream = await Promise.race([
          pending,
          new Promise<never>((_, reject) => {
            acquireTimer = setTimeout(
              () => reject(new DOMException('Acquisition timed out', 'TimeoutError')),
              5000
            )
          })
        ])
        clearTimeout(acquireTimer)
        context = new AudioContext()
        await Promise.race([
          context.resume(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new DOMException('Audio context suspended', 'TimeoutError')),
              2000
            )
          )
        ])
        const source = context.createMediaStreamSource(stream)
        const analyser = context.createAnalyser()
        analyser.fftSize = 2048
        const silent = context.createGain()
        silent.gain.value = 0
        source.connect(analyser)
        analyser.connect(silent)
        silent.connect(context.destination)
        const samples = new Float32Array(analyser.fftSize)
        let squareSum = 0
        let count = 0
        const start = performance.now()
        while (performance.now() - start < 500) {
          analyser.getFloatTimeDomainData(samples)
          for (const sample of samples) {
            squareSum += sample * sample
            count++
          }
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        const rms = count ? Math.sqrt(squareSum / count) : 0
        const capturedMs = performance.now() - start
        const running = context.state === 'running'
        const liveAudioTracks = stream
          .getAudioTracks()
          .filter((track) => track.readyState === 'live').length
        samples.fill(0)
        source.disconnect()
        analyser.disconnect()
        silent.disconnect()
        stopTracks(stream)
        return {
          available: running && liveAudioTracks > 0,
          reason:
            running && liveAudioTracks > 0
              ? rms > 0
                ? 'captured-signal'
                : 'captured-silent'
              : 'capture-not-running',
          rms,
          capturedMs,
          sampleRate: context.sampleRate,
          liveAudioTracks,
          tracksStopped: stream.getTracks().every((track) => track.readyState === 'ended')
        }
      } catch (error) {
        return {
          available: false,
          reason: error instanceof DOMException ? error.name : 'capture-failed',
          tracksStopped: true
        }
      } finally {
        expired = true
        clearTimeout(acquireTimer)
        if (stream) {
          stopTracks(stream)
        }
        if (context) {
          await context.close().catch(() => undefined)
        }
      }
    })
    await testInfo.attach('physical-microphone-capability', {
      body: JSON.stringify(
        {
          ...capability,
          source: 'Actual getUserMedia default input; hardware device identity not asserted',
          audioPersisted: false,
          transcriptionAttempted: false
        },
        null,
        2
      ),
      contentType: 'application/json'
    })
    test.skip(
      !capability.available,
      `Actual microphone capture unavailable: ${capability.reason}. Capability attachment records the attempt; transcription was not tested.`
    )
    expect(capability.tracksStopped).toBe(true)
    expect(capability.capturedMs).toBeGreaterThanOrEqual(500)
    expect(Number.isFinite(capability.rms)).toBe(true)
  } finally {
    if (launched) {
      await session.close(launched).catch(() => undefined)
    }
    await session.dispose()
  }
})
