param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
# Windows SAPI renders synthetic fixture speech to files without speaker playback.
$destination = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($destination) | Out-Null
$phrases = @(
  'Open Maritime Solar.',
  'Open their active projects.',
  'Switch to the contractor checklist workspace.',
  'Show failed automations this week.',
  'Go back.',
  'Draft a project note.'
)
$voice = New-Object -ComObject SAPI.SpVoice
try {
  for ($index = 0; $index -lt $phrases.Count; $index++) {
    $stream = New-Object -ComObject SAPI.SpFileStream
    try {
      $stream.Format.Type = 22 # 22,050 Hz, mono PCM16
      $stream.Open([System.IO.Path]::Combine($destination, "command-$index.wav"), 3, $false)
      $voice.AudioOutputStream = $stream
      $voice.Speak($phrases[$index]) | Out-Null
    } finally {
      $stream.Close()
      [System.Runtime.InteropServices.Marshal]::ReleaseComObject($stream) | Out-Null
    }
  }
  $phrases | ConvertTo-Json | Set-Content -LiteralPath ([System.IO.Path]::Combine($destination, 'phrases.json')) -Encoding UTF8
} finally {
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($voice) | Out-Null
}
