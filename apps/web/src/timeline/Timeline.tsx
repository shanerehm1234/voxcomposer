import type { VoxClip, VoxShow } from '@voxcomposer/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeAudioFile } from '../audio/analyze.js';
import { startPlayback, stopPlayback } from '../audio/engine.js';
import { detectFormat, hashFile, isAcceptedAudio } from '../audio/format.js';
import { copyAsset, registerAsset } from '../audio/registry.js';
import { trackColor } from '../styles/palette.js';
import { saveAudioBlob } from '../storage/db.js';
import {
  IconLoop,
  IconMusic,
  IconPause,
  IconPlay,
  IconSkipStart,
  IconStop,
} from '../components/icons.js';
import {
  addClip,
  applyDrag,
  findClip,
  findTrackIdOfClip,
  newClipId,
  pasteClip,
  removeClip,
  replaceClip,
  snap,
  type DragMode,
} from './edits.js';
import { clipAtPoint } from './hitTest.js';
import { drawTimeline, trackIndexAtY, type RenderState } from './render.js';
import { formatTimecode } from './ruler.js';
import {
  fitToWidth,
  LAYOUT,
  panByPx,
  xToMs,
  zoomAt,
  ZOOM,
  type Viewport,
} from './viewport.js';

interface TimelineProps {
  show: VoxShow;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  /** Commit a discrete edit (after a drag/resize/delete) to the undo stack. */
  onCommit: (next: VoxShow) => void;
}

/**
 * The custom Canvas timeline. State that changes per animation frame (playhead,
 * viewport during a drag) lives in refs and is drawn directly to the canvas;
 * React state is reserved for things the surrounding chrome reads (the time
 * readout, zoom label), so the component never re-renders at frame rate.
 */
export function Timeline({ show, selectedClipId, onSelectClip, onCommit }: TimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Frame-rate state (refs — no re-render).
  const viewportRef = useRef<Viewport>({ pxPerMs: 0.05, scrollMs: 0 });
  const playheadRef = useRef(0);
  const playingRef = useRef(false);
  const lastTickRef = useRef(0);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const selectionRef = useRef<Set<string>>(new Set());
  const dirtyRef = useRef(true);
  const rafRef = useRef(0);

  // Loop region (ms) + whether loop playback is armed.
  const loopRef = useRef<{ inMs: number; outMs: number } | null>(null);
  const loopEnabledRef = useRef(false);

  // The show currently drawn. Equals the `show` prop except mid-drag, when it
  // holds the in-progress edit so the canvas updates without committing to the
  // undo stack on every frame. Committed on pointer-up.
  const draftRef = useRef<VoxShow>(show);

  // Active clip drag/resize, if any.
  const dragRef = useRef<{
    clipId: string;
    mode: DragMode;
    grabMs: number;
    origStartMs: number;
    origDurMs: number;
    moved: boolean;
  } | null>(null);

  // Resync the draft whenever the committed show changes (and we're not mid-drag).
  useEffect(() => {
    if (!dragRef.current) {
      draftRef.current = show;
      dirtyRef.current = true;
    }
  }, [show]);

  // Keep the canvas selection set in sync with the lifted selection prop.
  useEffect(() => {
    selectionRef.current = selectedClipId ? new Set([selectedClipId]) : new Set();
    dirtyRef.current = true;
  }, [selectedClipId]);

  // Chrome state (low-frequency).
  const [displayMs, setDisplayMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loopOn, setLoopOn] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const lastDisplayRef = useRef(0);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  // --- Render ---------------------------------------------------------------
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height, dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const state: RenderState = {
      width,
      height,
      viewport: viewportRef.current,
      show: draftRef.current,
      playheadMs: playheadRef.current,
      selection: selectionRef.current,
      loop: loopRef.current,
      loopEnabled: loopEnabledRef.current,
    };
    drawTimeline(ctx, state);
  }, []);

  // --- rAF loop: advances playback, repaints only when dirty ---------------
  useEffect(() => {
    const loop = (ts: number) => {
      if (playingRef.current) {
        if (lastTickRef.current === 0) lastTickRef.current = ts;
        const delta = ts - lastTickRef.current;
        lastTickRef.current = ts;
        playheadRef.current = Math.min(show.duration, playheadRef.current + delta);
        dirtyRef.current = true;
        const loop = loopRef.current;
        if (loopEnabledRef.current && loop && playheadRef.current >= loop.outMs) {
          // Wrap to the loop start and re-cue audio from there.
          playheadRef.current = loop.inMs;
          lastTickRef.current = ts;
          startPlayback(draftRef.current, loop.inMs);
        } else if (playheadRef.current >= show.duration) {
          stop();
        }
      }
      if (dirtyRef.current) {
        dirtyRef.current = false;
        paint();
      }
      // Mirror playhead to chrome ~10x/sec for the readout.
      if (ts - lastDisplayRef.current > 100) {
        lastDisplayRef.current = ts;
        setDisplayMs(playheadRef.current);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint, show.duration]);

  // --- Size / DPR via ResizeObserver ---------------------------------------
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      sizeRef.current = { width, height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      // Fit the show on first valid measurement.
      if (viewportRef.current.scrollMs === 0 && viewportRef.current.pxPerMs === 0.05) {
        viewportRef.current = fitToWidth(show.duration, width - LAYOUT.trackHeaderWidth);
      }
      markDirty();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [markDirty, show.duration]);

  // --- Playback transport ---------------------------------------------------
  const play = useCallback(() => {
    if (playheadRef.current >= show.duration) playheadRef.current = 0;
    playingRef.current = true;
    lastTickRef.current = 0;
    startPlayback(draftRef.current, playheadRef.current);
    setPlaying(true);
  }, [show.duration]);

  const pause = useCallback(() => {
    playingRef.current = false;
    stopPlayback();
    setPlaying(false);
  }, []);

  function stop() {
    playingRef.current = false;
    playheadRef.current = 0;
    dirtyRef.current = true;
    stopPlayback();
    setPlaying(false);
    setDisplayMs(0);
  }

  const togglePlay = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [play, pause]);

  const stepBy = useCallback(
    (ms: number) => {
      playheadRef.current = Math.max(0, Math.min(show.duration, playheadRef.current + ms));
      markDirty();
      setDisplayMs(playheadRef.current);
    },
    [markDirty, show.duration],
  );

  // --- Loop region ----------------------------------------------------------
  const setLoopIn = useCallback(() => {
    const inMs = playheadRef.current;
    const prev = loopRef.current;
    const outMs = prev && prev.outMs > inMs ? prev.outMs : Math.min(show.duration, inMs + 2000);
    loopRef.current = { inMs, outMs };
    markDirty();
  }, [markDirty, show.duration]);

  const setLoopOut = useCallback(() => {
    const outMs = playheadRef.current;
    const prev = loopRef.current;
    const inMs = prev && prev.inMs < outMs ? prev.inMs : Math.max(0, outMs - 2000);
    loopRef.current = { inMs, outMs };
    markDirty();
  }, [markDirty]);

  const toggleLoop = useCallback(() => {
    // First press with no region yet: seed a region around the playhead.
    if (!loopRef.current) {
      const inMs = playheadRef.current;
      loopRef.current = { inMs, outMs: Math.min(show.duration, inMs + 4000) };
    }
    loopEnabledRef.current = !loopEnabledRef.current;
    setLoopOn(loopEnabledRef.current);
    markDirty();
  }, [markDirty, show.duration]);

  // --- Pointer: scrub playhead by clicking/dragging in ruler or lanes -------
  const scrubbingRef = useRef(false);
  const panningRef = useRef<{ x: number; scrollMs: number } | null>(null);

  const contentXFromEvent = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return e.clientX - rect.left - LAYOUT.trackHeaderWidth;
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const cx = contentXFromEvent(e);
      if (cx < 0) return; // inside the header column
      if (e.button === 1 || e.altKey) {
        // Middle/Alt-drag = pan.
        panningRef.current = { x: e.clientX, scrollMs: viewportRef.current.scrollMs };
      } else {
        const rect = canvasRef.current!.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const hit = clipAtPoint(draftRef.current, viewportRef.current, cx, y);
        if (hit) {
          // Select and arm a drag; the playhead stays put.
          onSelectClip(hit.clipId);
          const clip = findClip(draftRef.current, hit.clipId);
          if (clip) {
            dragRef.current = {
              clipId: hit.clipId,
              mode: hit.zone === 'body' ? 'move' : hit.zone,
              grabMs: xToMs(viewportRef.current, cx),
              origStartMs: clip.startMs,
              origDurMs: clip.durationMs,
              moved: false,
            };
          }
        } else {
          onSelectClip(null);
          scrubbingRef.current = true;
          playheadRef.current = Math.max(0, xToMs(viewportRef.current, cx));
          dirtyRef.current = true;
          setDisplayMs(playheadRef.current);
        }
      }
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [onSelectClip],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (panningRef.current) {
      const deltaPx = e.clientX - panningRef.current.x;
      viewportRef.current = panByPx(
        { ...viewportRef.current, scrollMs: panningRef.current.scrollMs },
        -deltaPx,
      );
      dirtyRef.current = true;
      return;
    }

    const drag = dragRef.current;
    if (drag) {
      const cx = contentXFromEvent(e);
      const deltaMs = xToMs(viewportRef.current, cx) - drag.grabMs;
      const next = applyDrag(drag.origStartMs, drag.origDurMs, drag.mode, deltaMs, !e.altKey);
      const clip = findClip(draftRef.current, drag.clipId);
      if (clip) {
        draftRef.current = replaceClip(draftRef.current, drag.clipId, { ...clip, ...next });
        drag.moved = true;
        dirtyRef.current = true;
      }
      return;
    }

    if (scrubbingRef.current) {
      const cx = contentXFromEvent(e);
      playheadRef.current = Math.max(0, xToMs(viewportRef.current, cx));
      dirtyRef.current = true;
      setDisplayMs(playheadRef.current);
      return;
    }

    // Idle hover: reflect what a click would do via the cursor.
    updateHoverCursor(e);
  }, []);

  const updateHoverCursor = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = contentXFromEvent(e);
    if (cx < 0) {
      canvas.style.cursor = 'default';
      return;
    }
    const y = e.clientY - canvas.getBoundingClientRect().top;
    const hit = clipAtPoint(draftRef.current, viewportRef.current, cx, y);
    canvas.style.cursor = !hit
      ? 'default'
      : hit.zone === 'body'
        ? 'grab'
        : 'ew-resize';
  }, []);

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current;
    if (drag) {
      if (drag.moved) onCommit(draftRef.current);
      dragRef.current = null;
    }
    scrubbingRef.current = false;
    panningRef.current = null;
  }, [onCommit]);

  // --- Wheel: pan horizontally; Ctrl/Cmd = zoom at cursor -------------------
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const cx = e.clientX - canvasRef.current!.getBoundingClientRect().left - LAYOUT.trackHeaderWidth;
      const dir = e.deltaY < 0 ? ZOOM.factor : 1 / ZOOM.factor;
      viewportRef.current = zoomAt(viewportRef.current, Math.max(0, cx), viewportRef.current.pxPerMs * dir);
    } else {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      viewportRef.current = panByPx(viewportRef.current, delta);
    }
    dirtyRef.current = true;
  }, []);

  // --- Audio import via OS file drop ---------------------------------------
  const importAudioFile = useCallback(
    async (file: File, dropX: number, dropY: number) => {
      // Choose the track under the cursor if it's audio; else the first audio track.
      const idx = trackIndexAtY(dropY, show.tracks.length);
      const underCursor = idx >= 0 ? show.tracks[idx] : undefined;
      const target =
        underCursor?.type === 'audio' ? underCursor : show.tracks.find((t) => t.type === 'audio');
      if (!target) return;

      setImporting(true);
      try {
        const decoded = await decodeAudioFile(file);
        const startMs = Math.max(0, snap(xToMs(viewportRef.current, dropX), true));
        const clipId =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `clip-${Date.now()}`;
        registerAsset(clipId, decoded, file.name, file);
        // Persist the raw audio locally so it survives a reload.
        void saveAudioBlob(clipId, file.name, file);

        const clip: VoxClip = {
          id: clipId,
          startMs,
          durationMs: Math.round(decoded.durationMs),
          type: 'audio',
          data: {
            filename: file.name,
            deviceId: target.deviceId,
            volume: 1,
            // Tells the OcularVox board to run its onboard FFT jaw sync; the
            // composer does not compute jaw movement, only plays the file on cue.
            jawSync: true,
            jawMode: 'FFT auto',
            // Source format + content hash. MP3/OGG/M4A play in-browser for
            // preview; the server transcodes to WAV at sync time if the target
            // device only supports WAV (cache keyed by this hash).
            sourceFormat: detectFormat(file),
            sourceHash: await hashFile(file),
          },
        };
        const next = addClip(show, target.id, clip);
        draftRef.current = next;
        onCommit(next);
        onSelectClip(clipId);
        dirtyRef.current = true;
      } catch (err) {
        console.error('Audio import failed:', err);
      } finally {
        setImporting(false);
      }
    },
    [show, onCommit, onSelectClip],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setDropActive(true);
    }
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear when leaving the wrapper, not when crossing child elements.
    if (e.currentTarget === e.target) setDropActive(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropActive(false);
      const file = Array.from(e.dataTransfer.files).find(isAcceptedAudio);
      if (!file) return;
      const rect = canvasRef.current!.getBoundingClientRect();
      const dropX = e.clientX - rect.left - LAYOUT.trackHeaderWidth;
      const dropY = e.clientY - rect.top;
      if (dropX < 0) return;
      void importAudioFile(file, dropX, dropY);
    },
    [importAudioFile],
  );

  // --- Duplicate / copy / paste --------------------------------------------
  const clipboardRef = useRef<VoxClip | null>(null);

  /** Carry an audio clip's decoded asset + persisted blob to a new clip id. */
  const carryAudio = useCallback((fromId: string, toId: string) => {
    const asset = copyAsset(fromId, toId);
    if (asset) void saveAudioBlob(toId, asset.filename, asset.blob);
  }, []);

  const duplicateSelected = useCallback(() => {
    if (!selectedClipId) return;
    const trackId = findTrackIdOfClip(draftRef.current, selectedClipId);
    const clip = findClip(draftRef.current, selectedClipId);
    if (!trackId || !clip) return;
    const at = snap(clip.startMs + clip.durationMs, true);
    const { show: next, clip: copy } = pasteClip(draftRef.current, trackId, clip, at);
    carryAudio(clip.id, copy.id);
    draftRef.current = next;
    onCommit(next);
    onSelectClip(copy.id);
  }, [selectedClipId, onCommit, onSelectClip, carryAudio]);

  const copySelected = useCallback(() => {
    if (!selectedClipId) return;
    const clip = findClip(draftRef.current, selectedClipId);
    if (clip) clipboardRef.current = clip;
  }, [selectedClipId]);

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip) return;
    const trackId =
      findTrackIdOfClip(draftRef.current, clip.id) ??
      (selectedClipId && findTrackIdOfClip(draftRef.current, selectedClipId)) ??
      draftRef.current.tracks.find((t) => t.type === clip.type)?.id ??
      draftRef.current.tracks[0]?.id;
    if (!trackId) return;
    const at = snap(playheadRef.current, true);
    const { show: next, clip: copy } = pasteClip(draftRef.current, trackId, clip, at);
    carryAudio(clip.id, copy.id);
    draftRef.current = next;
    onCommit(next);
    onSelectClip(copy.id);
  }, [selectedClipId, onCommit, onSelectClip, carryAudio]);

  const deleteSelected = useCallback(() => {
    if (!selectedClipId) return;
    draftRef.current = removeClip(draftRef.current, selectedClipId);
    onCommit(draftRef.current);
    onSelectClip(null);
  }, [selectedClipId, onCommit, onSelectClip]);

  // --- Right-click context menu --------------------------------------------
  const [menu, setMenu] = useState<{ x: number; y: number; hasClip: boolean } | null>(null);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left - LAYOUT.trackHeaderWidth;
      const y = e.clientY - rect.top;
      if (cx < 0) return;
      e.preventDefault();
      const hit = clipAtPoint(draftRef.current, viewportRef.current, cx, y);
      if (hit) onSelectClip(hit.clipId);
      const wrapRect = wrapRef.current!.getBoundingClientRect();
      setMenu({ x: e.clientX - wrapRect.left, y: e.clientY - wrapRect.top, hasClip: Boolean(hit) });
    },
    [onSelectClip],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  // --- Add track ------------------------------------------------------------
  const addTrack = useCallback(
    (type: string) => {
      const cur = draftRef.current;
      const wants =
        type === 'dmx'
          ? ['dmx']
          : type === 'relay'
            ? ['relay']
            : ['skull', 'audio'];
      const dev = cur.devices.find((d) => wants.includes(d.type)) ?? cur.devices[0];
      const track = {
        id: newClipId(),
        deviceId: dev?.id ?? 'unassigned',
        type,
        label: dev ? dev.name : `New ${type}`,
        clips: [],
      };
      const next = { ...cur, tracks: [...cur.tracks, track] };
      draftRef.current = next;
      onCommit(next);
      markDirty();
      setAddOpen(false);
    },
    [onCommit, markDirty],
  );

  // --- Keyboard shortcuts ---------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Clip clipboard shortcuts (Ctrl/Cmd). Undo/redo + save live in App.
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'd') {
          e.preventDefault();
          duplicateSelected();
        } else if (k === 'c') {
          copySelected();
        } else if (k === 'v') {
          pasteClipboard();
        }
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'k':
        case 'K':
          stop();
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedClipId) {
            e.preventDefault();
            deleteSelected();
          }
          break;
        case 'i':
        case 'I':
          setLoopIn();
          break;
        case 'o':
        case 'O':
          setLoopOut();
          break;
        case 'l':
        case 'L':
          toggleLoop();
          break;
        case 'ArrowLeft':
          stepBy(e.shiftKey ? -1000 : -100);
          break;
        case 'ArrowRight':
          stepBy(e.shiftKey ? 1000 : 100);
          break;
        case '+':
        case '=':
          viewportRef.current = zoomAt(
            viewportRef.current,
            (sizeRef.current.width - LAYOUT.trackHeaderWidth) / 2,
            viewportRef.current.pxPerMs * ZOOM.factor,
          );
          markDirty();
          break;
        case '-':
        case '_':
          viewportRef.current = zoomAt(
            viewportRef.current,
            (sizeRef.current.width - LAYOUT.trackHeaderWidth) / 2,
            viewportRef.current.pxPerMs / ZOOM.factor,
          );
          markDirty();
          break;
        case 'f':
        case 'F':
          if (e.ctrlKey && e.shiftKey) {
            e.preventDefault();
            viewportRef.current = fitToWidth(
              show.duration,
              sizeRef.current.width - LAYOUT.trackHeaderWidth,
            );
            markDirty();
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    togglePlay,
    stepBy,
    markDirty,
    show.duration,
    selectedClipId,
    onCommit,
    onSelectClip,
    duplicateSelected,
    copySelected,
    pasteClipboard,
    deleteSelected,
    setLoopIn,
    setLoopOut,
    toggleLoop,
  ]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border/70 bg-bg2/60 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-bg/40 p-1">
          <TransportButton title="Return to start (K)" onClick={stop}>
            <IconSkipStart className="h-4 w-4" />
          </TransportButton>
          <TransportButton title="Play / Pause (Space)" onClick={togglePlay} accent>
            {playing ? <IconPause className="h-4 w-4" /> : <IconPlay className="h-4 w-4" />}
          </TransportButton>
          <TransportButton title="Stop" onClick={stop}>
            <IconStop className="h-4 w-4" />
          </TransportButton>
          <TransportButton title="Loop region — L (set ends with I / O)" onClick={toggleLoop} accent={loopOn}>
            <IconLoop className="h-4 w-4" />
          </TransportButton>
        </div>

        <div className="flex items-baseline gap-2 rounded-xl border border-border/70 bg-bg/60 px-3.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <span className="font-mono text-lg font-medium tabular-nums tracking-wide text-purple-l [text-shadow:0_0_12px_rgba(175,169,236,0.4)]">
            {formatTimecode(displayMs, 1)}
          </span>
          <span className="font-mono text-xs text-muted">/ {formatTimecode(show.duration, 1)}</span>
        </div>

        <div className="relative">
          <button
            onClick={() => setAddOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-bg3/40 px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors hover:text-text"
          >
            <span className="text-purple-l">＋</span> Track
          </button>
          {addOpen && (
            <>
              <div className="fixed inset-0 z-20" onPointerDown={() => setAddOpen(false)} />
              <div className="vox-menu absolute left-0 top-full z-30 mt-1 min-w-[150px] overflow-hidden rounded-xl border border-border/80 bg-bg2/95 py-1 shadow-2xl backdrop-blur">
                {(
                  [
                    ['audio', 'Audio'],
                    ['dmx', 'DMX'],
                    ['relay', 'Relay'],
                    ['servo', 'Servo'],
                  ] as const
                ).map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => addTrack(t)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-text transition-colors hover:bg-purple/15"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: trackColor(t).accent }}
                    />
                    {label} track
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <span className="ml-auto hidden text-[11px] text-muted/80 2xl:block">
          <Kbd>Space</Kbd> play · <Kbd>I/O/L</Kbd> loop · <Kbd>⌘D</Kbd> dup · <Kbd>⌘Z</Kbd> undo ·{' '}
          <Kbd>Ctrl</Kbd>+wheel zoom
        </span>
      </div>
      <div
        ref={wrapRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <canvas
          ref={canvasRef}
          className="block touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onContextMenu={onContextMenu}
        />

        {menu && (
          <>
            <div className="fixed inset-0 z-20" onPointerDown={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} />
            <div
              className="vox-menu absolute z-30 min-w-[170px] overflow-hidden rounded-xl border border-border/80 bg-bg2/95 py-1 shadow-2xl backdrop-blur"
              style={{ left: menu.x, top: menu.y }}
            >
              {menu.hasClip ? (
                <>
                  <MenuItem label="Duplicate" hint="⌘D" onClick={() => { duplicateSelected(); closeMenu(); }} />
                  <MenuItem label="Copy" hint="⌘C" onClick={() => { copySelected(); closeMenu(); }} />
                  <MenuItem label="Paste" hint="⌘V" disabled={!clipboardRef.current} onClick={() => { pasteClipboard(); closeMenu(); }} />
                  <div className="my-1 h-px bg-border/60" />
                  <MenuItem label="Delete" hint="⌫" danger onClick={() => { deleteSelected(); closeMenu(); }} />
                </>
              ) : (
                <MenuItem label="Paste" hint="⌘V" disabled={!clipboardRef.current} onClick={() => { pasteClipboard(); closeMenu(); }} />
              )}
            </div>
          </>
        )}

        {dropActive && (
          <div className="pointer-events-none absolute inset-0 z-10 m-2 flex items-center justify-center rounded-xl border-2 border-dashed border-purple-l/70 bg-purple/10 backdrop-blur-[1px]">
            <div className="flex items-center gap-2.5 rounded-xl border border-purple-l/40 bg-bg2/90 px-4 py-2.5 text-sm font-medium text-purple-l shadow-2xl">
              <IconMusic className="h-4 w-4" />
              Drop audio to add a clip
            </div>
          </div>
        )}

        {importing && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-2 rounded-lg border border-border bg-bg2/95 px-3 py-1.5 text-xs text-muted shadow-xl">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-l" />
            Analyzing audio…
          </div>
        )}
      </div>
    </div>
  );
}

function TransportButton({
  children,
  onClick,
  title,
  accent = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title: string;
  accent?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 ${
        accent
          ? 'bg-gradient-to-b from-purple to-purple-d text-white shadow-[0_2px_8px_rgba(83,74,183,0.45)] hover:brightness-110'
          : 'text-muted hover:bg-bg3/70 hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border/80 bg-bg/60 px-1 py-0.5 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}

function MenuItem({
  label,
  hint,
  onClick,
  danger = false,
  disabled = false,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-[13px] transition-colors ${
        disabled
          ? 'cursor-not-allowed text-muted/40'
          : danger
            ? 'text-[#E8623D] hover:bg-[#E8623D]/10'
            : 'text-text hover:bg-purple/15'
      }`}
    >
      {label}
      {hint && <span className="font-mono text-[10px] text-muted">{hint}</span>}
    </button>
  );
}
