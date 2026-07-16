import type { VoxClip, VoxDevice } from '@voxcomposer/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader } from './components/AppHeader.js';
import { ClipInspector } from './components/ClipInspector.js';
import { DeviceSidebar } from './components/DeviceSidebar.js';
import { DevicesView } from './components/DevicesView.js';
import { MediaView } from './components/MediaView.js';
import { SettingsView } from './components/SettingsView.js';
import { ShowsView } from './components/ShowsView.js';
import { ShortcutsOverlay } from './components/ShortcutsOverlay.js';
import { Toast, type ToastMessage } from './components/Toast.js';
import { type DemoDevice, isDemoMode, makeDemoState, makeEmptyState } from './demo/demoData.js';
import { defaultDeviceName, kindToType } from './devices/kind.js';
import { addBytesToLibrary, getMedia, importMediaFiles, type MediaFile } from './media/library.js';
import { addClip, addDevice, findClip, newClipId, removeDevice, replaceClip } from './timeline/edits.js';
import { useHistory } from './timeline/history.js';
import { setPluginShow } from './plugins/host.js';
import { Timeline } from './timeline/Timeline.js';
import { decodeAudioFile } from './audio/analyze.js';
import { isAcceptedAudio, isAcceptedAudioName } from './audio/format.js';
import { buildAudioClip } from './audio/import.js';
import { registerAsset } from './audio/registry.js';
import { useInstallPrompt } from './pwa/useInstallPrompt.js';
import { clearAll, loadAllAudio, loadShowFromDb, saveAudioBlob, saveShow } from './storage/db.js';
import {
  saveShow as saveShowToFile,
  downloadShowPackage,
  looksLikeZip,
  parseShowBytes,
  readShowPackage,
} from './vox/voxFile.js';
import { activateMasterShow, getMasterConfig, playOnMaster, sendShowToMaster } from './voxlink/master.js';
import { neededAudio, syncDeviceAudio } from './audio/sync.js';
import { SendResultModal, type DeviceAudioResult, type SendReport } from './components/SendResultModal.js';
import { useMasterStatus } from './voxlink/useMasterStatus.js';

// Scheduling deliberately has no view here: the schedule lives on the Vox
// Master (its touchscreen or its web UI). The Composer authors shows.
const VIEWS = ['timeline', 'devices', 'media', 'shows', 'settings'];

function readViewFromHash(): string {
  const h = window.location.hash.slice(1);
  return VIEWS.includes(h) ? h : 'timeline';
}

// Browsers block an HTTPS page from opening a plaintext ws:// connection
// (mixed content) — no permission prompt, no override. That's exactly the
// case for the hosted demo (https://voxcomposer.app) trying to reach a
// local Vox Master, which only ever speaks ws://. Computed once; the
// protocol doesn't change without a full page reload.
const isHttpsOrigin = window.location.protocol === 'https:';

export function App() {
  // Real installs boot empty; the hosted demo boots dressed (see isDemoMode).
  const demo = useMemo(() => (isDemoMode() ? makeDemoState() : makeEmptyState()), []);
  const { state: show, commit, set, undo, redo } = useHistory(demo.show);

  // Keep the plugin host's view of the show current, so a plugin's
  // api.getCurrentShow() (and anything reading the live show) sees real data.
  useEffect(() => setPluginShow(show), [show]);

  const [activeView, setActiveView] = useState(readViewFromHash);

  // Keep the URL hash in sync so tabs are deep-linkable / shareable.
  useEffect(() => {
    if (window.location.hash.slice(1) !== activeView) {
      window.history.replaceState(null, '', `#${activeView}`);
    }
  }, [activeView]);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>(['c-skelly1-intro']);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>('SK:01');

  // The primary (last) selection drives the inspector.
  const primaryClipId = selectedClipIds[selectedClipIds.length - 1] ?? null;
  const selectedClip = useMemo(
    () => (primaryClipId ? findClip(show, primaryClipId) : null),
    [show, primaryClipId],
  );

  // The sidebar/devices view render `show.devices` (the persisted source of
  // truth — same list +Track and the inspector read). While the Master is
  // reachable, live `device_status` reports (rssi/online/ip) override demo
  // telemetry per device; fields the Vox-Link protocol doesn't carry yet
  // (firmware/battery/SD usage) keep falling back to the demo data so the UI
  // still has something to show. Without a reachable Master (no hardware on
  // hand), this is exactly the old all-demo behavior.
  const masterStatus = useMasterStatus();
  // Devices the user explicitly removed this session — auto-attach and the
  // onboard-Master effect both respect it, so a removal sticks.
  const dismissedRef = useRef<Set<string>>(new Set());
  const masterMac = masterStatus.info?.mac;
  const sidebarDevices = useMemo<DemoDevice[]>(() => {
    const telemetryById = new Map(demo.devices.map((d) => [d.id, d]));
    // MACs must match case-insensitively: the Master reports uppercase, but a
    // device may have been stored with other casing (the remote's strcasecmp
    // still routes commands, so it plays fine yet would read "offline").
    const liveByMac = new Map(
      [...masterStatus.devices].map(([id, s]) => [id.toUpperCase(), s]),
    );
    return show.devices.map((d) => {
      // The Vox Master itself is the hub, not a Vox-Link remote, so it never
      // appears in the device_status roster — its liveness follows the
      // Master connection directly.
      if (masterMac && d.id.toUpperCase() === masterMac.toUpperCase()) {
        return {
          ...d,
          connection: masterStatus.connected ? 'online' : 'offline',
          relayCount:
            masterStatus.info?.onboard?.find((o) => o.type === 'relay')?.channels ?? d.relayCount,
        } as DemoDevice;
      }
      const t = telemetryById.get(d.id);
      const live = liveByMac.get(d.id.toUpperCase());
      if (live) {
        return {
          ...d,
          connection: live.online ? 'online' : 'offline',
          iconHint: t?.iconHint,
          ip: live.ip,
          // Hardware-reported output count wins over a manual guess.
          relayCount: live.channels ?? d.relayCount,
          rssi: live.rssi,
          firmware: t?.firmware,
          battery: t?.battery,
          sdUsedMb: t?.sdUsedMb,
          sdTotalMb: t?.sdTotalMb,
          fileCount: t?.fileCount,
          lastSeen: live.online ? undefined : (t?.lastSeen ?? 'recently'),
        };
      }
      return {
        ...d,
        connection: t?.connection ?? 'offline',
        iconHint: t?.iconHint,
        rssi: t?.rssi,
        firmware: t?.firmware,
        battery: t?.battery,
        sdUsedMb: t?.sdUsedMb,
        sdTotalMb: t?.sdTotalMb,
        fileCount: t?.fileCount,
        lastSeen: t?.lastSeen ?? (t ? undefined : 'never'),
      };
    });
  }, [show.devices, demo.devices, masterStatus.devices, masterStatus.connected, masterStatus.info, masterMac]);

  const remotesOnline = sidebarDevices.filter((d) => d.connection === 'online').length;
  const { canInstall, promptInstall } = useInstallPrompt();

  // "Output to Pixels"-style live preview: while on, the Timeline streams
  // the clips at the playhead to the real Master/remotes as preview_frames.
  const [livePreviewOn, setLivePreviewOn] = useState(false);

  const editClip = useCallback(
    (next: VoxClip) => commit(replaceClip(show, next.id, next)),
    [commit, show],
  );

  // --- Keyboard help overlay ('?') -----------------------------------------
  const [showHelp, setShowHelp] = useState(false);
  const [sendReport, setSendReport] = useState<SendReport | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '?') {
        e.preventDefault();
        setShowHelp((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- Toasts ---------------------------------------------------------------
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const showToast = useCallback((text: string, kind: ToastMessage['kind'] = 'info') => {
    setToast({ id: Date.now(), text, kind });
  }, []);

  const toggleLivePreview = useCallback(() => {
    setLivePreviewOn((wasOn) => {
      const turningOn = !wasOn;
      if (turningOn && !masterStatus.connected) {
        showToast('Live preview armed — will stream once a Master is reachable', 'info');
      }
      return turningOn;
    });
  }, [masterStatus.connected, showToast]);

  // Auto-attach: pairing itself only ever happens on the Master (see
  // docs/PAIRING.md in the VoxMaster repo — the Composer is a consumer of its
  // roster, not a second place to pair). Once the Master reports a remote as
  // paired, it should just show up in the current show without the user
  // re-entering its MAC by hand. Built as one combined show update (not one
  // commit per device) — commit() replaces `present` outright, so multiple
  // commits in the same effect run against the same stale `show` would lose
  // all but the last.
  //
  // Two guards keep this from fighting the user: only ONLINE paired remotes
  // attach (an unplugged prop shouldn't keep resurrecting), and a device the
  // user explicitly removed this session stays removed.
  useEffect(() => {
    const newDevices: VoxDevice[] = [];
    for (const status of masterStatus.devices.values()) {
      if (!status.paired || !status.online) continue;
      if (dismissedRef.current.has(status.deviceId)) continue;
      if (show.devices.some((d) => d.id === status.deviceId)) continue;
      const type = kindToType(status.kind, status.ip);
      newDevices.push({
        id: status.deviceId,
        name: status.name || defaultDeviceName(status),
        type,
        apiVersion: '1.0.0',
        ...(type === 'relay' && status.channels ? { relayCount: status.channels } : {}),
      });
    }
    if (newDevices.length === 0) return;
    commit(newDevices.reduce(addDevice, show));
    showToast(
      newDevices.length === 1
        ? `“${newDevices[0]!.name}” is paired on the Master — added to the show`
        : `${newDevices.length} paired Master remotes added to the show`,
      'success',
    );
  }, [masterStatus.devices, show, commit, showToast]);

  // The Vox Master carries its own backpack I/O (relay/dmx/audio outputs). Add
  // it to the show automatically the first time we see a connected Master, so
  // its onboard outputs are just there — no manual "add the Master" step.
  // Respects the dismissed set, so removing it makes it stay gone.
  useEffect(() => {
    const info = masterStatus.info;
    if (!info?.mac || info.onboard.length === 0) return;
    if (dismissedRef.current.has(info.mac)) return;
    if (show.devices.some((d) => d.id === info.mac)) return;
    const relay = info.onboard.find((o) => o.type === 'relay');
    commit(
      addDevice(show, {
        id: info.mac,
        name: 'Vox Master',
        type: 'relay',
        apiVersion: '1.0.0',
        onboard: info.onboard.map((o) => o.type),
        ...(relay?.channels ? { relayCount: relay.channels } : {}),
      }),
    );
    showToast('Vox Master added — its onboard relay/DMX/audio outputs are ready', 'success');
  }, [masterStatus.info, show, commit, showToast]);

  const handleAddDevice = useCallback(
    (device: VoxDevice) => {
      const isNew = !show.devices.some((d) => d.id === device.id);
      commit(addDevice(show, device));
      setSelectedDeviceId(device.id);
      showToast(isNew ? `Added “${device.name}”` : `Updated “${device.name}”`, 'success');
    },
    [show, commit, showToast],
  );

  const handleRemoveDevice = useCallback(
    (id: string) => {
      const device = show.devices.find((d) => d.id === id);
      dismissedRef.current.add(id);  // don't let auto-attach re-add what the user removed
      commit(removeDevice(show, id));
      if (selectedDeviceId === id) setSelectedDeviceId(null);
      showToast(`Removed “${device?.name ?? id}”`, 'info');
    },
    [show, commit, showToast, selectedDeviceId],
  );

  // --- .vox export / import -------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleNewShow = useCallback(() => {
    const ok = window.confirm(
      'Start a new empty show? The current show will be replaced (Ctrl+Z undoes this until you close the app — Save a .vox first if you want to keep it).',
    );
    if (!ok) return;
    commit(makeEmptyState().show);
    setSelectedClipIds([]);
    setSelectedDeviceId(null);
    showToast('New show — add your devices, then drag audio onto the timeline', 'success');
  }, [commit, showToast]);

  const handleExport = useCallback(async () => {
    const r = await saveShowToFile(show);
    if (r.cancelled) return; // user dismissed the Save dialog — say nothing
    if (r.method === 'download') {
      showToast(`Saved “${show.name}” to your downloads`, 'success');
    } else if (r.path) {
      showToast(`Saved “${show.name}” → ${r.path}`, 'success');
    } else {
      showToast(`Saved “${show.name}”`, 'success');
    }
  }, [show, showToast]);

  const handleExportPackage = useCallback(async () => {
    showToast('Packaging show + audio…', 'info');
    const count = await downloadShowPackage(show);
    showToast(`Packaged ${show.name} + ${count} audio file${count === 1 ? '' : 's'}`, 'success');
  }, [show, showToast]);

  const handleSendToMaster = useCallback(async () => {
    setSendReport({ status: 'sending', showName: show.name });
    const r = await sendShowToMaster(show);
    if (!r.ok) {
      setSendReport({ status: 'error', showName: show.name, error: r.error ?? 'Send failed' });
      return;
    }
    // Make the just-sent show the Master's active one, so Play (and the Master's
    // own play control) runs THIS show rather than whatever was active before.
    const activated = r.slug ? await activateMasterShow(r.slug) : false;
    // Auto-sync each online skull's audio as part of the send (no separate step).
    const skulls = sidebarDevices.filter(
      (d) => d.type === 'skull' && d.connection === 'online' && d.ip && neededAudio(show, d.id).length > 0,
    );
    const audio: DeviceAudioResult[] = [];
    for (const d of skulls) {
      setSendReport({ status: 'syncing', showName: r.name ?? show.name, clips: r.clips, syncingName: d.name });
      try {
        const items = await syncDeviceAudio(show, d.id, d.ip!);
        audio.push({
          device: d.name,
          done: items.filter((i) => i.status === 'done').length,
          failed: items.filter((i) => i.status === 'error').length,
          total: items.length,
        });
      } catch {
        audio.push({ device: d.name, done: 0, failed: 0, total: 0, error: 'unreachable' });
      }
    }
    setSendReport({
      status: 'done',
      showName: r.name ?? show.name,
      clips: r.clips,
      durationMs: r.durationMs,
      audio,
      activated,
    });
  }, [show, sidebarDevices]);

  // Import a show from already-read bytes (a .vox JSON or a .zip package). Bytes
  // are read synchronously at the drop/pick site — re-reading a dropped file
  // later fails on some platforms.
  const handleImportBytes = useCallback(
    async (bytes: ArrayBuffer, filename: string) => {
      try {
        if (filename.toLowerCase().endsWith('.zip') || looksLikeZip(bytes)) {
          const pkg = await readShowPackage(bytes);
          // Packaged audio belongs in the media library too, not just on clips.
          for (const a of pkg.audio) {
            void a.blob.arrayBuffer().then((b) => addBytesToLibrary(b, a.filename, a.blob.type));
          }
          const byName = new Map(pkg.audio.map((a) => [a.filename, a.blob]));
          for (const track of pkg.result.show.tracks) {
            if (track.type !== 'audio') continue;
            for (const clip of track.clips) {
              const fn = (clip.data as Record<string, unknown>).filename;
              const blob = typeof fn === 'string' ? byName.get(fn) : undefined;
              if (!blob || typeof fn !== 'string') continue;
              try {
                const decoded = await decodeAudioFile(new File([blob], fn));
                registerAsset(clip.id, decoded, fn, blob);
                void saveAudioBlob(clip.id, fn, blob);
              } catch {
                /* skip undecodable asset */
              }
            }
          }
          commit(pkg.result.show);
          setSelectedClipIds([]);
          showToast(
            `Imported “${pkg.result.show.name}” + ${pkg.audio.length} audio file${
              pkg.audio.length === 1 ? '' : 's'
            }`,
            'success',
          );
          return;
        }

        const result = parseShowBytes(bytes);
        commit(result.show);
        setSelectedClipIds([]);
        showToast(
          result.migrated
            ? `Imported — updated v${result.fromVersion} → v${result.toVersion}`
            : `Imported “${result.show.name}”`,
          'success',
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not read file', 'error');
      }
    },
    [commit, showToast],
  );

  // Add an audio file (picked via the open button) to the first audio track,
  // creating one if the show doesn't have any yet.
  const importAudioFromBytes = useCallback(
    async (bytes: ArrayBuffer, filename: string, mime: string) => {
      let track = show.tracks.find((t) => t.type === 'audio');
      let base = show;
      if (!track) {
        const dev = show.devices[0];
        track = {
          id: newClipId(),
          deviceId: dev?.id ?? 'unassigned',
          type: 'audio',
          label: dev ? dev.name : 'Audio',
          clips: [],
        };
        base = { ...show, tracks: [...show.tracks, track] };
      }
      try {
        void addBytesToLibrary(bytes.slice(0), filename, mime);
        const startMs = track.clips.reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0);
        const clip = await buildAudioClip(bytes, filename, mime, track.deviceId, startMs);
        commit(addClip(base, track.id, clip));
        setSelectedClipIds([clip.id]);
        showToast(`Added “${filename}” to ${track.label}`, 'success');
      } catch {
        showToast(`Couldn't import “${filename}”`, 'error');
      }
    },
    [show, commit, showToast],
  );

  // Place a Media-library file onto the timeline. Media and Timeline are
  // separate full-screen tabs (no drag path between them), so the Media tab's
  // "Add to timeline" button / double-click routes here, then jumps to the
  // timeline so the user sees the clip land.
  const addMediaToTimeline = useCallback(
    (item: MediaFile) => {
      const m = getMedia(item.id);
      if (!m) {
        showToast(`Couldn't find “${item.filename}” in the library`, 'error');
        return;
      }
      void m.blob.arrayBuffer().then((b) => {
        void importAudioFromBytes(b, item.filename, m.blob.type);
        setActiveView('timeline');
      });
    },
    [importAudioFromBytes, showToast],
  );

  // --- Drag a .vox / .zip anywhere to import (window-level = reliable) ------
  // Window listeners avoid React event-bubbling quirks where a drop on the
  // timeline canvas (which handles audio drops) wouldn't reach a parent handler.
  useEffect(() => {
    const isShowFile = (n: string) => n.endsWith('.vox') || n.endsWith('.zip');
    const onDragOver = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      // A drop on the timeline canvas is handled there (with precise placement)
      // and already prevented — don't re-import it here.
      if (e.defaultPrevented) return;

      const files = Array.from(e.dataTransfer?.files ?? []);
      const types = Array.from(e.dataTransfer?.types ?? []);

      // ALWAYS stop the webview from navigating to / opening a dropped file —
      // its default action replaces the whole app with a full-screen media
      // player. This must happen for audio too, not just .vox/.zip.
      if (files.length > 0 || types.includes('Files')) e.preventDefault();

      // Read bytes NOW, while the dropped File reference is still valid.
      const showFile = files.find((f) => isShowFile(f.name.toLowerCase()));
      if (showFile) {
        const name = showFile.name;
        void showFile
          .arrayBuffer()
          .then((b) => handleImportBytes(b, name))
          .catch(() =>
            showToast('Couldn’t read the dropped file — use the Open button instead.', 'error'),
          );
        return;
      }

      // Audio dropped anywhere but the timeline canvas: add it to an audio track
      // (same as the Media tab's "Add to timeline"), rather than opening it.
      const audio = files.find((f) => isAcceptedAudio(f));
      if (audio) {
        const { name, type } = audio;
        void audio
          .arrayBuffer()
          .then((b) => importAudioFromBytes(b, name, type))
          .catch(() =>
            showToast('Couldn’t read the dropped audio — use Import in the Media tab.', 'error'),
          );
        return;
      }

      // Some Linux file managers hand over a URI instead of a readable File.
      if (files.length === 0 && (types.includes('Files') || types.includes('text/uri-list'))) {
        showToast('Drag-drop didn’t provide the file — use the Open button (folder icon).', 'info');
      }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleImportBytes, importAudioFromBytes, showToast]);

  // Timeline registers a position-aware audio placer here (drop lands on the
  // track under the cursor). Null when the timeline isn't showing.
  const timelinePlaceRef = useRef<
    ((bytes: ArrayBuffer, name: string, mime: string, clientX: number, clientY: number) => boolean) | null
  >(null);
  const registerTimelineDrop = useCallback((fn: typeof timelinePlaceRef.current) => {
    timelinePlaceRef.current = fn;
  }, []);

  // --- Desktop (Tauri) OS file drops ----------------------------------------
  // WebKitGTK never gives the page a real HTML5 file drop, so the desktop shell
  // catches the native drop in Rust and calls this with each {id,name} plus the
  // drop position; we fetch the bytes back over /__drop and import them, placing
  // audio on the track under the cursor. No-op in a plain browser (OS drops work
  // natively there).
  useEffect(() => {
    interface DropItem {
      id: number;
      name: string;
    }
    const g = window as unknown as {
      __voxDrop?: (items: DropItem[], physX?: number, physY?: number) => void;
    };
    g.__voxDrop = (items, physX, physY) => {
      const dpr = window.devicePixelRatio || 1;
      const clientX = (physX ?? 0) / dpr;
      const clientY = (physY ?? 0) / dpr;
      for (const it of items) {
        void fetch(`/__drop?id=${it.id}`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('drop fetch failed'))))
          .then((bytes) => {
            const lower = it.name.toLowerCase();
            if (lower.endsWith('.vox') || lower.endsWith('.zip')) {
              handleImportBytes(bytes, it.name);
            } else if (isAcceptedAudioName(it.name)) {
              // Place on the track under the cursor if the timeline is showing
              // and the drop landed on it; otherwise append to an audio track.
              const placed = timelinePlaceRef.current?.(bytes, it.name, '', clientX, clientY);
              if (!placed) void importAudioFromBytes(bytes, it.name, '');
            } else {
              showToast(`Can't import “${it.name}” — drop a WAV/MP3 or .vox`, 'error');
            }
          })
          .catch(() => showToast(`Couldn't read “${it.name}”`, 'error'));
      }
    };
    return () => {
      delete g.__voxDrop;
    };
  }, [handleImportBytes, importAudioFromBytes, showToast]);

  // --- Persistence: restore on mount, autosave on change --------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadShowFromDb();
      if (!saved || cancelled) {
        // First-time visitor: a gentle nudge on what to try.
        if (!cancelled && !localStorage.getItem('vox.welcomed')) {
          localStorage.setItem('vox.welcomed', '1');
          setTimeout(
            () => showToast('Welcome! Drag a .wav onto the timeline to begin', 'info'),
            600,
          );
        }
        return;
      }
      // Re-decode any persisted audio before showing the restored show, so the
      // timeline paints real waveforms straight away.
      const audios = await loadAllAudio();
      await Promise.all(
        audios.map(async (a) => {
          try {
            const decoded = await decodeAudioFile(new File([a.blob], a.filename));
            registerAsset(a.clipId, decoded, a.filename, a.blob);
          } catch {
            /* skip undecodable asset */
          }
        }),
      );
      if (cancelled) return;
      set(saved);
      setSelectedClipIds([]);
      showToast('Restored your last session', 'info');
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Only persist once the user has changed something (not the pristine demo).
    if (show === demo.show) return;
    const t = setTimeout(() => void saveShow(show), 600);
    return () => clearTimeout(t);
  }, [show, demo.show]);

  const handleReset = useCallback(async () => {
    await clearAll();
    window.location.reload();
  }, []);

  // Undo / redo (editing keys live in the Timeline).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      } else if (key === 's' || key === 'e') {
        // Ctrl/Cmd+S (save) and Ctrl/Cmd+E (export) both download the .vox.
        e.preventDefault();
        handleExport();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, handleExport]);

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      {isHttpsOrigin && (
        <div className="shrink-0 bg-purple-d px-4 py-2 text-center text-xs text-text">
          Running over HTTPS (e.g. the hosted voxcomposer.app demo) — browsers block the
          unencrypted ws:// connection a local Vox Master uses, so devices won't show up here. For
          a real show, run Composer on the same network as the Master over plain HTTP.
        </div>
      )}
      <AppHeader
        remotesOnline={remotesOnline}
        activeView={activeView}
        showName={show.name}
        onRenameShow={(name) => set({ ...show, name })}
        onSelectView={setActiveView}
        onNewShow={handleNewShow}
        onOpenShow={() => fileInputRef.current?.click()}
        onImportAudio={() => audioInputRef.current?.click()}
        onExport={handleExport}
        onExportPackage={() => void handleExportPackage()}
        onSendToMaster={() => void handleSendToMaster()}
        onInstall={canInstall ? promptInstall : undefined}
        onShowHelp={() => setShowHelp(true)}
        livePreviewOn={livePreviewOn}
        onToggleLivePreview={toggleLivePreview}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".vox,application/json,.zip,application/zip,audio/*,.mp3,.wav,.ogg,.m4a"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const { name, type } = file;
            void file
              .arrayBuffer()
              .then((b) =>
                isAcceptedAudioName(name)
                  ? importAudioFromBytes(b, name, type)
                  : handleImportBytes(b, name),
              );
          }
          e.target.value = '';
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) {
            void importMediaFiles(files).then((r) => {
              if (r.added.length > 0) {
                showToast(
                  `Imported ${r.added.length} file${r.added.length === 1 ? '' : 's'} to the Media library`,
                  'success',
                );
                setActiveView('media');
              }
              if (r.failed.length > 0) showToast(`Couldn't read: ${r.failed.join(', ')}`, 'error');
            });
          }
          e.target.value = '';
        }}
      />
      <div className="flex min-h-0 flex-1">
        <DeviceSidebar
          devices={sidebarDevices}
          master={{ connected: masterStatus.connected, ip: getMasterConfig().host }}
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={setSelectedDeviceId}
          onAddDevice={handleAddDevice}
          onRemoveDevice={handleRemoveDevice}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {activeView === 'timeline' && (
            <Timeline
              show={show}
              selectedClipIds={selectedClipIds}
              onSelectClips={setSelectedClipIds}
              onCommit={commit}
              onNotify={showToast}
              livePreviewOn={livePreviewOn}
              sendToMaster={masterStatus.send}
              registerFileDrop={registerTimelineDrop}
            />
          )}
          {activeView === 'devices' && (
            <DevicesView
              devices={sidebarDevices}
              master={{ connected: masterStatus.connected, host: getMasterConfig().host }}
              show={show}
              onAddDevice={handleAddDevice}
              onRemoveDevice={handleRemoveDevice}
              onNotify={showToast}
            />
          )}
          {activeView === 'media' && (
            <MediaView onNotify={showToast} onAddToTimeline={addMediaToTimeline} />
          )}
          {activeView === 'shows' && (
            <ShowsView
              master={{ connected: masterStatus.connected, host: getMasterConfig().host }}
              onNotify={showToast}
            />
          )}
          {activeView === 'settings' && (
            <SettingsView
              master={{ connected: masterStatus.connected, ip: getMasterConfig().host }}
              onReset={handleReset}
            />
          )}
        </main>
        {activeView === 'timeline' && (
          <ClipInspector
            clip={selectedClip}
            show={show}
            onChange={editClip}
            selectionCount={selectedClipIds.length}
            deviceInventories={masterStatus.inventories}
          />
        )}
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <ShortcutsOverlay open={showHelp} onClose={() => setShowHelp(false)} />
      {sendReport && (
        <SendResultModal
          report={sendReport}
          onClose={() => setSendReport(null)}
          onPlay={() => {
            void playOnMaster().then((ok) =>
              showToast(ok ? 'Playing on the Master' : 'Could not start playback', ok ? 'success' : 'error'),
            );
            setSendReport(null);
          }}
        />
      )}
    </div>
  );
}
