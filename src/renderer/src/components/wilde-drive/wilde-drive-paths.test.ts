import { describe, expect, it } from 'vitest'
import {
  driveAbsoluteFromRelative,
  driveBaseName,
  driveParentPath,
  isValidDriveEntryName,
  joinDrivePath
} from './wilde-drive-paths'

describe('wilde drive paths', () => {
  it('joins under a drive root without doubling the separator', () => {
    expect(joinDrivePath('H:\\', 'My Drive', '\\')).toBe('H:\\My Drive')
    expect(joinDrivePath('H:\\My Drive', 'a.md', '\\')).toBe('H:\\My Drive\\a.md')
  })

  it('finds parents and names, keeping drive roots as directories', () => {
    expect(driveParentPath('H:\\My Drive')).toBe('H:\\')
    expect(driveParentPath('H:\\My Drive\\notes\\a.md')).toBe('H:\\My Drive\\notes')
    expect(driveBaseName('H:\\My Drive\\notes\\')).toBe('notes')
  })

  it('maps listFiles relative paths back to absolute Windows paths', () => {
    expect(driveAbsoluteFromRelative('H:\\', 'My Drive/notes/a b.md')).toBe(
      'H:\\My Drive\\notes\\a b.md'
    )
  })

  it('rejects names Windows or Drive cannot hold', () => {
    expect(isValidDriveEntryName('Plan.md')).toBe(true)
    expect(isValidDriveEntryName('a/b')).toBe(false)
    expect(isValidDriveEntryName('  ')).toBe(false)
    expect(isValidDriveEntryName('..')).toBe(false)
  })
})
