import type { VoxClip } from '@voxcomposer/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader } from './components/AppHeader.js';
import { ClipInspector } from './components/ClipInspector.js';
import { DeviceSidebar } from './components/DeviceSidebar.js';
import { DevicesView } from './components/DevicesView.js';
import { MediaView } from './components/MediaView.js';
import { SettingsView } from './components/SettingsView.js';
import { Toast, type ToastMessage } from './components/Toast.js';
import { makeDemoState } from './demo/demoData.js';
import { findClip, replaceClip } from './timeline/edits.js';
import { useHistory } from './timeline/history.js';
import { Timeline } from './timeline/Timeline.js';
import { decodeAudioFile } from './audio/analyze.js';
import { registerAsset } from './audio/registry.js';
import { useInstallPrompt } from './pwa/useInstallPrompt.js';
import { clearAll, loadAllAudio, loadShowFromDb, saveShow } from './storage/db.js';
import { downloadShow, readShowFile } from './vox/voxFile.js';

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

  const remotesOnline = demo.devices.filter((d) => d.connection === 'online').length;
  const { canInstall, promptInstall } = useInstallPrompt();

  const editClip = useCallback(
    (next: VoxClip) => commit(replaceClip(show, next.id, next)),
    [commit, show],
  );

  // --- Toasts ---------------------------------------------------------------
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const showToast = useCallback((text: string, kind: ToastMessage['kind'] = 'info') => {
    setToast({ id: Date.now(), text, kind });
  }, []);

  // --- .vox export / import -------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(() => {
    downloadShow(show);
    showToast(`Exported “${show.name}”`, 'success');
  }, [show, showToast]);

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const result = await readShowFile(file);
        commit(result.show);
        setSelectedClipIds([]);
        showToast(
          result.migrated
            ? `Imported — updated v${result.fromVersion} → v${result.toVersion}`
            : `Imported “${result.show.name}”`,
          'success',
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not read .vox file', 'error');
      }
    },
    [commit, showToast],
  );

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
        onImport={() => fileInputRef.current?.click()}
        onInstall={canInstall ? promptInstall : undefined}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".vox,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
          e.target.value = '';
        }}
      />
      <div className="flex min-h-0 flex-1">
        <DeviceSidebar
          devices={demo.devices}
          showFiles={demo.showFiles}
          master={demo.master}
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={setSelectedDeviceId}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {activeView === 'timeline' && (
            <Timeline
              show={show}
              selectedClipIds={selectedClipIds}
              onSelectClips={setSelectedClipIds}
              onCommit={commit}
            />
          )}
          {activeView === 'devices' && <DevicesView devices={demo.devices} />}
          {activeView === 'media' && <MediaView media={demo.media} />}
          {activeView === 'settings' && (
            <SettingsView master={demo.master} onReset={handleReset} />
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
    </div>
  );
}
