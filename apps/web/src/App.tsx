import type { VoxClip, VoxDevice } from '@voxcomposer/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader } from './components/AppHeader.js';
import { ClipInspector } from './components/ClipInspector.js';
import { DeviceSidebar } from './components/DeviceSidebar.js';
import { DevicesView } from './components/DevicesView.js';
import { MediaView } from './components/MediaView.js';
import { SettingsView } from './components/SettingsView.js';
import { ShortcutsOverlay } from './components/ShortcutsOverlay.js';
import { Toast, type ToastMessage } from './components/Toast.js';
import { type DemoDevice, makeDemoState } from './demo/demoData.js';
import { addClip, addDevice, findClip, removeDevice, replaceClip } from './timeline/edits.js';
import { useHistory } from './timeline/history.js';
import { Timeline } from './timeline/Timeline.js';
import { decodeAudioFile } from './audio/analyze.js';
import { isAcceptedAudioName } from './audio/format.js';
import { buildAudioClip } from './audio/import.js';
import { registerAsset } from './audio/registry.js';
import { useInstallPrompt } from './pwa/useInstallPrompt.js';
import { clearAll, loadAllAudio, loadShowFromDb, saveAudioBlob, saveShow } from './storage/db.js';
import {
  downloadShow,
  downloadShowPackage,
  looksLikeZip,
  parseShowBytes,
  readShowPackage,
} from './vox/voxFile.js';
import { getMasterConfig, sendShowToMaster } from './voxlink/master.js';
import { useMasterStatus } from './voxlink/useMasterStatus.js';

const VIEWS = ['timeline', 'devices', 'media', 'settings'];

function readViewFromHash(): string {
  const h = window.location.hash.slice(1);
  return VIEWS.includes(h) ? h : 'timeline';
}

export function App() {
  const demo = useMemo(() => makeDemoState(), []);
  const { state: show, commit, set, undo, redo } = useHistory(demo.show);

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
  const sidebarDevices = useMemo<DemoDevice[]>(() => {
    const telemetryById = new Map(demo.devices.map((d) => [d.id, d]));
    return show.devices.map((d) => {
      const t = telemetryById.get(d.id);
      const live = masterStatus.devices.get(d.id);
      if (live) {
        return {
          ...d,
          connection: live.online ? 'online' : 'offline',
          iconHint: t?.iconHint,
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
  }, [show.devices, demo.devices, masterStatus.devices]);

  const remotesOnline = sidebarDevices.filter((d) => d.connection === 'online').length;
  const { canInstall, promptInstall } = useInstallPrompt();

  const editClip = useCallback(
    (next: VoxClip) => commit(replaceClip(show, next.id, next)),
    [commit, show],
  );

  // --- Keyboard help overlay ('?') -----------------------------------------
  const [showHelp, setShowHelp] = useState(false);
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
      commit(removeDevice(show, id));
      if (selectedDeviceId === id) setSelectedDeviceId(null);
      showToast(`Removed “${device?.name ?? id}”`, 'info');
    },
    [show, commit, showToast, selectedDeviceId],
  );

  // --- .vox export / import -------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(() => {
    downloadShow(show);
    showToast(`Exported “${show.name}”`, 'success');
  }, [show, showToast]);

  const handleExportPackage = useCallback(async () => {
    showToast('Packaging show + audio…', 'info');
    const count = await downloadShowPackage(show);
    showToast(`Packaged ${show.name} + ${count} audio file${count === 1 ? '' : 's'}`, 'success');
  }, [show, showToast]);

  const handleSendToMaster = useCallback(async () => {
    showToast('Sending show to the Vox Master…', 'info');
    const r = await sendShowToMaster(show);
    if (r.ok) {
      showToast(`Sent “${r.name ?? show.name}” to the Master · ${r.clips ?? '?'} clips`, 'success');
    } else {
      showToast(r.error ?? 'Send failed', 'error');
    }
  }, [show, showToast]);

  // Import a show from already-read bytes (a .vox JSON or a .zip package). Bytes
  // are read synchronously at the drop/pick site — re-reading a dropped file
  // later fails on some platforms.
  const handleImportBytes = useCallback(
    async (bytes: ArrayBuffer, filename: string) => {
      try {
        if (filename.toLowerCase().endsWith('.zip') || looksLikeZip(bytes)) {
          const pkg = await readShowPackage(bytes);
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

  // Add an audio file (picked via the open button) to the first audio track.
  const importAudioFromBytes = useCallback(
    async (bytes: ArrayBuffer, filename: string, mime: string) => {
      const track = show.tracks.find((t) => t.type === 'audio');
      if (!track) {
        showToast('No audio track yet — open the Timeline and add one', 'error');
        return;
      }
      try {
        const startMs = track.clips.reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0);
        const clip = await buildAudioClip(bytes, filename, mime, track.deviceId, startMs);
        commit(addClip(show, track.id, clip));
        setSelectedClipIds([clip.id]);
        showToast(`Added “${filename}” to ${track.label}`, 'success');
      } catch {
        showToast(`Couldn't import “${filename}”`, 'error');
      }
    },
    [show, commit, showToast],
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
      const files = Array.from(e.dataTransfer?.files ?? []);
      const file = files.find((f) => isShowFile(f.name.toLowerCase()));
      if (file) {
        e.preventDefault();
        const name = file.name;
        // Read the bytes NOW, while the dropped file reference is still valid.
        void file
          .arrayBuffer()
          .then((b) => handleImportBytes(b, name))
          .catch(() =>
            showToast('Couldn’t read the dropped file — use the Open button instead.', 'error'),
          );
        return;
      }
      // Some Linux file managers drop a URI instead of a readable File. Audio
      // drops are handled by the timeline canvas; if nothing readable arrived,
      // point the user at the reliable Open button.
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (files.length === 0 && (types.includes('Files') || types.includes('text/uri-list'))) {
        e.preventDefault();
        showToast('Drag-drop didn’t provide the file — use the Open button (folder icon).', 'info');
      }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleImportBytes, showToast]);

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
      <AppHeader
        remotesOnline={remotesOnline}
        activeView={activeView}
        onSelectView={setActiveView}
        onExport={handleExport}
        onExportPackage={() => void handleExportPackage()}
        onSendToMaster={() => void handleSendToMaster()}
        onImport={() => fileInputRef.current?.click()}
        onInstall={canInstall ? promptInstall : undefined}
        onShowHelp={() => setShowHelp(true)}
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
      <div className="flex min-h-0 flex-1">
        <DeviceSidebar
          devices={sidebarDevices}
          showFiles={demo.showFiles}
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
            />
          )}
          {activeView === 'devices' && (
            <DevicesView
              devices={sidebarDevices}
              onAddDevice={handleAddDevice}
              onRemoveDevice={handleRemoveDevice}
            />
          )}
          {activeView === 'media' && <MediaView media={demo.media} />}
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
          />
        )}
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <ShortcutsOverlay open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
