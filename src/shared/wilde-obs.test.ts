import { describe, expect, it } from 'vitest'
import { DEFAULT_WILDE_OBS_CONFIG, normalizeWildeObsConfig } from './wilde-obs'

describe('normalizeWildeObsConfig', () => {
  it('returns defaults for non-objects and fills missing fields', () => {
    expect(normalizeWildeObsConfig(undefined)).toEqual(DEFAULT_WILDE_OBS_CONFIG)
    expect(normalizeWildeObsConfig('x')).toEqual(DEFAULT_WILDE_OBS_CONFIG)
    expect(normalizeWildeObsConfig({ enabled: false }).enabled).toBe(false)
    expect(normalizeWildeObsConfig({ enabled: false }).presets).toEqual(
      DEFAULT_WILDE_OBS_CONFIG.presets
    )
  })

  it('keeps valid presets and drops malformed entries', () => {
    const config = normalizeWildeObsConfig({
      presets: [
        { label: '1', sceneName: 'A' },
        { label: 'toolonglabel', sceneName: 'B' },
        { label: '2' },
        { sceneName: 'C' },
        'junk'
      ]
    })
    expect(config.presets).toEqual([{ label: '1', sceneName: 'A' }])
  })

  it('falls back to default presets when every entry is invalid', () => {
    expect(normalizeWildeObsConfig({ presets: [] }).presets).toEqual(
      DEFAULT_WILDE_OBS_CONFIG.presets
    )
    expect(normalizeWildeObsConfig({ presets: 'nope' }).presets).toEqual(
      DEFAULT_WILDE_OBS_CONFIG.presets
    )
  })

  it('normalizes host, port and micInputName', () => {
    const config = normalizeWildeObsConfig({ host: ' 10.0.0.2 ', port: 4455.5, micInputName: ' ' })
    expect(config.host).toBe('10.0.0.2')
    expect(config.port).toBe(DEFAULT_WILDE_OBS_CONFIG.port)
    expect(config.micInputName).toBeNull()
    expect(normalizeWildeObsConfig({ micInputName: 'Mic/Aux' }).micInputName).toBe('Mic/Aux')
  })
})
