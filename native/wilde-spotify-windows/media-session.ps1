# Wilde Spotify mini-player: Windows media-session bridge.
#
# Reads the Spotify desktop app's session from the Windows media transport controls (the same
# feed as the Windows volume/media overlay) and relays transport commands. No Spotify login.
#
# Protocol (NDJSON, one object per line):
#   stdin : {"id":1,"cmd":"toggle"|"next"|"previous"|"snapshot"}
#   stdout: {"type":"state",...}            pushed on change, and every second while playing
#           {"type":"result","id":1,"ok":true}
#           {"type":"error","message":"..."}
# Exits when stdin closes (the Electron host went away).

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($operation, [Type]$resultType) {
  $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($operation))
  # Why bounded: a wedged Spotify session must not hang the whole bridge.
  if (-not $task.Wait(4000)) { throw 'media session call timed out' }
  $task.Result
}

function Write-Message($object) {
  [Console]::Out.WriteLine(($object | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
}

$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$manager = Await ($managerType::RequestAsync()) $managerType
$propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$streamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType]

function Get-SpotifySession {
  foreach ($session in $manager.GetSessions()) {
    if ($session.SourceAppUserModelId -match 'Spotify') { return $session }
  }
  return $null
}

function Read-Artwork($thumbnail) {
  if (-not $thumbnail) { return $null }
  try {
    $stream = Await ($thumbnail.OpenReadAsync()) $streamType
    # Why reflection: PowerShell 5.1 surfaces the WinRT stream as a bare __ComObject and refuses
    # to cast it to IInputStream; reflection lets the CLR QueryInterface it instead.
    $size = [Windows.Storage.Streams.IRandomAccessStream].GetProperty('Size').GetValue($stream)
    if ($size -le 0 -or $size -gt 4MB) { return $null }
    $contentType = [Windows.Storage.Streams.IContentTypeProvider].GetProperty('ContentType').GetValue($stream)
    $dataReader = [Windows.Storage.Streams.DataReader].GetConstructor(@([Windows.Storage.Streams.IInputStream])).Invoke(@($stream))
    $loaded = Await ($dataReader.LoadAsync([uint32]$size)) ([uint32])
    $bytes = New-Object byte[] $loaded
    $dataReader.ReadBytes($bytes)
    if (-not $contentType) { $contentType = 'image/png' }
    return "data:$contentType;base64,$([Convert]::ToBase64String($bytes))"
  } catch {
    return $null
  }
}

$script:lastTrackKey = $null
$script:lastArtwork = $null

function Get-State {
  $session = Get-SpotifySession
  if (-not $session) { return @{ type = 'state'; available = $false } }
  $properties = Await ($session.TryGetMediaPropertiesAsync()) $propertiesType
  $timeline = $session.GetTimelineProperties()
  $playback = $session.GetPlaybackInfo()
  $trackKey = "$($properties.Title)|$($properties.Artist)|$($properties.AlbumTitle)"
  $artworkChanged = $trackKey -ne $script:lastTrackKey
  if ($artworkChanged) {
    $script:lastTrackKey = $trackKey
    $script:lastArtwork = Read-Artwork $properties.Thumbnail
  }
  $state = @{
    type = 'state'
    available = $true
    title = $properties.Title
    artist = $properties.Artist
    album = $properties.AlbumTitle
    trackKey = $trackKey
    status = "$($playback.PlaybackStatus)"
    positionMs = [math]::Round($timeline.Position.TotalMilliseconds)
    durationMs = [math]::Round(($timeline.EndTime - $timeline.StartTime).TotalMilliseconds)
    # Why: Spotify only refreshes the timeline on play/pause/seek; the renderer extrapolates
    # from this timestamp while playing.
    positionUpdatedAtMs = $timeline.LastUpdatedTime.ToUnixTimeMilliseconds()
    canNext = $playback.Controls.IsNextEnabled
    canPrevious = $playback.Controls.IsPreviousEnabled
  }
  # Artwork only rides along when the track changes; the host caches it.
  if ($artworkChanged) { $state.artwork = $script:lastArtwork }
  return $state
}

function Invoke-Command($command) {
  $session = Get-SpotifySession
  if (-not $session) { return $false }
  $operation = switch ($command) {
    'toggle' { $session.TryTogglePlayPauseAsync() }
    'next' { $session.TrySkipNextAsync() }
    'previous' { $session.TrySkipPreviousAsync() }
    default { $null }
  }
  if (-not $operation) { return $false }
  return [bool](Await $operation ([bool]))
}

# Why not [Console]::In: it is a synchronized reader whose ReadLineAsync blocks, which would
# freeze polling until the next command arrives. A StreamReader over the raw handle is truly async.
$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.UTF8Encoding]::new($false))
$pendingLine = $reader.ReadLineAsync()
$lastEmitted = $null
$lastEmitAt = [DateTime]::MinValue

while ($true) {
  $forceEmit = $false
  while ($pendingLine.IsCompleted) {
    $line = $pendingLine.Result
    if ($null -eq $line) { exit 0 }
    $pendingLine = $reader.ReadLineAsync()
    if (-not $line.Trim()) { continue }
    try {
      $request = $line | ConvertFrom-Json
      if ($request.cmd -eq 'snapshot') {
        # Why: a (re)subscribing renderer needs artwork even if the track is unchanged.
        $script:lastTrackKey = $null
        $forceEmit = $true
        Write-Message @{ type = 'result'; id = $request.id; ok = $true }
      } else {
        $ok = Invoke-Command $request.cmd
        $forceEmit = $true
        Write-Message @{ type = 'result'; id = $request.id; ok = $ok }
      }
    } catch {
      Write-Message @{ type = 'result'; id = $request.id; ok = $false; message = "$_" }
    }
  }

  try {
    $state = Get-State
    $comparable = ($state.Clone() | ForEach-Object { $_.Remove('artwork'); $_.Remove('positionMs'); $_.Remove('positionUpdatedAtMs'); $_ } | ConvertTo-Json -Compress)
    $playing = $state.available -and $state.status -eq 'Playing'
    $stale = ([DateTime]::UtcNow - $lastEmitAt).TotalMilliseconds -ge 1000
    if ($forceEmit -or $state.ContainsKey('artwork') -or $comparable -ne $lastEmitted -or ($playing -and $stale)) {
      Write-Message $state
      $lastEmitted = $comparable
      $lastEmitAt = [DateTime]::UtcNow
    }
  } catch {
    Write-Message @{ type = 'error'; message = "$_" }
    Start-Sleep -Milliseconds 1500
  }
  Start-Sleep -Milliseconds 250
}
