#!/usr/bin/env node
// Compiles the Wilde Spotify visualizer's audio tap (native/wilde-spotify-windows/SpotifyAudioTap.cs)
// with the .NET Framework csc.exe that ships with Windows, mirroring build-windows-cli-launcher.mjs.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

if (process.platform !== 'win32') {
  console.log('[native-build] Wilde Spotify audio tap is Windows-only; skipping')
  process.exit(0)
}

const repoRoot = resolve(import.meta.dirname, '../..')
const sourcePath = join(repoRoot, 'native', 'wilde-spotify-windows', 'SpotifyAudioTap.cs')
const outputDirectory = join(repoRoot, 'native', 'wilde-spotify-windows', '.build')
const outputPath = join(outputDirectory, 'wilde-spotify-audio-tap.exe')

const windowsDirectory = process.env.WINDIR ?? process.env.SystemRoot
const compilerPath = [
  join(windowsDirectory ?? '', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  join(windowsDirectory ?? '', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
].find((candidate) => windowsDirectory && existsSync(candidate))
if (!compilerPath) {
  throw new Error('Unable to find the .NET Framework C# compiler required for the Wilde Spotify audio tap.')
}

if (existsSync(outputPath) && statSync(outputPath).mtimeMs >= statSync(sourcePath).mtimeMs) {
  console.log(`[native-build] reusing Wilde Spotify audio tap at ${outputPath}`)
  process.exit(0)
}

mkdirSync(outputDirectory, { recursive: true })
const result = spawnSync(
  compilerPath,
  ['/nologo', '/target:exe', '/optimize+', '/warnaserror+', `/out:${outputPath}`, sourcePath],
  { cwd: repoRoot, stdio: 'inherit' }
)
if (result.error) {
  throw result.error
}
process.exit(result.status ?? 1)
