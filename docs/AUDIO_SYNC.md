# Audio sync — getting show audio onto the OcularVox SD

## The goal

A show references audio files by name (e.g. `growl.wav` on the OcularVox skull's
track). For that audio to actually play on cue, the file has to physically be on
the skull's SD card. Today the user has to copy files by hand. This feature makes
Vox Composer **diff the show's audio against what's on the device and push the
missing files over the network**, transcoding to WAV when needed.

## What already works (don't rebuild it)

- **Playback on the skull is done.** The engine dispatches an `audio` clip to the
  addressed device over Vox-Link; the OcularVox C3 forwards it as
  `{"action":"play","file":"/audio/<name>"}` and the RP2040 plays it off its SD
  (`OVP_AUDIO` / the `play` command). So once the file is on the SD, cueing it
  from a scheduled show already works.
- **Live preview plays locally in the browser** (see `livePreview.ts` —
  `LIVE_PREVIEW_TYPES` deliberately excludes `audio`). So preview never needs the
  file on the device; only real/scheduled playback does.
- **The device already reports an inventory.** The OcularVox C3 sends a
  `device_inventory` frame; the Master stores it and exposes it in `/status`
  `fileList`. Today that lists `/eyes`; extend the producer to also list
  `/audio` (see step 1).
- **A file-transfer protocol exists.** The C3 ↔ RP2040 bridge has
  `OVP_FILE_OPEN` / `OVP_FILE_DATA` / `OVP_FILE_CLOSE` (path + size, then chunks,
  then commit). The RP2040 OTA path uses `path:"flash:fw"`; SD files use a real
  path like `"/audio/growl.wav"`.

## The three pieces to build

### 1. Report the `/audio` inventory (firmware — small)

The eye-inventory producer (`esp32c3/main/link.c` `send_inventory()`) currently
lists only `/eyes`. Audio needs a **typed inventory** so the Composer can tell
eye files from audio files. Two clean options:

- Extend the `device_inventory` frame to `{"eyes":[...],"audio":[...]}` (bump the
  Master parser + `fileList` accordingly), **or**
- Have the Composer query the C3 directly: `POST /api/files {"dir":"/audio"}` —
  the C3 already proxies `OVP_LIST_FILES` and returns `{files:[{n,s},...]}`.

The direct-query option needs no firmware change and gives sizes (useful for a
"already up to date" check by size). Prefer it for v1; fold audio into the
Master inventory later for the offline case.

### 2. Transcode to WAV in the browser (Composer — done-ish)

The boards play PCM WAV. Source clips may be MP3/OGG/M4A. The Composer already
**decodes** any of these to PCM (`audio/analyze.ts` — native WAV fast-path +
`decodeAudioData` fallback). Add the reverse: **encode PCM → 16-bit WAV**
(`audio/wav.ts`, shipped with this doc). So `mediaBlob → decode → encodeWav →
bytes` gives a device-ready file. Downsample/mono-mix here if the board wants a
specific rate (the OcularVox jaw FFT is fine with 16-bit; confirm the target
sample rate before shipping).

### 3. The sync flow (Composer + one C3 endpoint)

1. Enumerate the show's audio clips per OcularVox device (`clip.type === 'audio'`,
   grouped by `track.deviceId`).
2. For each device, fetch its `/audio` listing (step 1).
3. Diff by filename (and, when available, size/hash) → the **missing set**.
4. For each missing file: pull the source from the media library
   (`getMedia(clipId)`), transcode to WAV (step 2), and **upload** it.
5. Show progress + a "device is in sync" state per show.

**Upload transport.** The C3 needs an HTTP endpoint that streams a body to an SD
path via the existing bridge protocol — mirror `rp_ota_post` in
`esp32c3/main/web.c` but with `path:"/audio/<name>"` instead of `"flash:fw"`,
e.g.:

```
POST /api/upload?path=/audio/growl.wav        (body = WAV bytes)
  → OVP_FILE_OPEN {"path":"/audio/growl.wav","size":N}
  → OVP_FILE_DATA (2 KB chunks)
  → OVP_FILE_CLOSE
```

The RP2040 `FILE_OPEN` handler must accept an SD path (create/truncate under
FatFS) in addition to `flash:*`. The Composer POSTs directly to the device's C3
(its IP is in the device inventory / `/status`) — no need to relay bulk audio
through the Master.

## Sequencing

1. **`audio/wav.ts` encoder + test** — shipped now (Composer-only, no hardware).
2. **C3 `POST /api/upload?path=` + RP2040 SD `FILE_OPEN`** — the transport (needs
   the skull to test).
3. **Composer "Sync audio" action** — diff + transcode + upload with progress,
   surfaced per device in the Devices view or a pre-flight before "Send to
   Master".
4. **Typed inventory** (fold `/audio` into `device_inventory`) — nice-to-have so
   the Master's `/status` shows audio too and offline sync is possible.

## Open questions

- **Target format:** confirm the OcularVox WAV requirements (sample rate, mono vs
  stereo, bit depth). The encoder can match once known.
- **Dedup:** filename collisions across shows — namespace by content hash, or
  warn on mismatched same-name files.
- **Free space:** check the SD's free bytes (the C3 `/status` reports
  `sdUsedMB`/`sdTotalMB`) before a big push.
