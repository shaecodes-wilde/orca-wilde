import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

const modelDir = process.argv[2]
if (!modelDir) {
  throw new Error(
    'Pass an already installed Parakeet TDT v3 model directory. This check never downloads models.'
  )
}
const require = createRequire(import.meta.url)
const files = readdirSync(modelDir).filter(
  (file) => file.endsWith('.onnx') || file.endsWith('tokens.txt')
)
const fixture = readFileSync(process.argv[3] ?? join(modelDir, 'test_wavs', 'en.wav'))
const expected = process.argv[4]
if (fixture.toString('ascii', 0, 4) !== 'RIFF') {
  throw new Error('Fixture must be RIFF WAV')
}
let sampleRate = 0
let pcm
for (let offset = 12; offset + 8 <= fixture.length;) {
  const kind = fixture.toString('ascii', offset, offset + 4)
  const size = fixture.readUInt32LE(offset + 4)
  const start = offset + 8
  if (kind === 'fmt ') {
    if (
      fixture.readUInt16LE(start) !== 1 ||
      fixture.readUInt16LE(start + 2) !== 1 ||
      fixture.readUInt16LE(start + 14) !== 16
    ) {
      throw new Error('Expected mono PCM16 fixture')
    }
    sampleRate = fixture.readUInt32LE(start + 4)
  }
  if (kind === 'data') {
    pcm = fixture.subarray(start, start + size)
  }
  offset = start + size + (size % 2)
}
if (!pcm || sampleRate < 8000 || sampleRate > 48000) {
  throw new Error('Expected supported fixture sample rate')
}
const samples = new Float32Array(pcm.length / 2)
for (let i = 0; i < samples.length; i++) {
  samples[i] = pcm.readInt16LE(i * 2) / 32768
}
const nativePackage =
  process.platform === 'win32'
    ? 'sherpa-onnx-win-x64'
    : `sherpa-onnx-${process.platform}-${process.arch}`
const worker = new Worker(resolve('out/main/stt-worker.js'), {
  workerData: { sherpaModulePath: dirname(require.resolve(nativePackage)) }
})
const started = Date.now()
try {
  const final = await new Promise((resolveResult, reject) => {
    let transcript = ''
    const timer = setTimeout(() => reject(new Error('Local inference timed out')), 60000)
    worker.on('error', reject)
    worker.on('message', (message) => {
      if (message.type === 'ready') {
        worker.postMessage({ type: 'feed', samples, sampleRate })
        worker.postMessage({ type: 'stop' })
      }
      if (message.type === 'final') {
        transcript += message.text ?? ''
      }
      if (message.type === 'error') {
        clearTimeout(timer)
        reject(new Error('Local provider failed'))
      }
      if (message.type === 'stopped') {
        clearTimeout(timer)
        resolveResult(transcript)
      }
    })
    worker.postMessage({
      type: 'init',
      modelDir,
      modelType: 'transducer',
      streaming: false,
      sampleRate: 16000,
      files,
      modelingUnit: 'bpe'
    })
  })
  if (!String(final).trim()) {
    throw new Error('Provider produced no transcript')
  }
  const normalize = (value) =>
    String(value)
      .toLowerCase()
      .replace(/[.!?]+$/, '')
      .trim()
  const matches = expected ? normalize(final) === normalize(expected) : undefined
  console.log(
    JSON.stringify({
      provider: nativePackage,
      model: 'parakeet-tdt-0.6b-v3-int8',
      fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
      seconds: samples.length / sampleRate,
      elapsedMs: Date.now() - started,
      nonemptyTranscript: true,
      transcriptCharacters: String(final).length,
      expectedPhrase: expected,
      transcriptMatchesExpected: matches,
      physicalMicrophone: false
    })
  )
  if (matches === false) {
    throw new Error('Fixture transcript did not match the expected command')
  }
} finally {
  await worker.terminate()
}
