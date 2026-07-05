import { VOX_EVENTS, type VoxClip, type VoxShow } from '@voxcomposer/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { startPlayback, stopPlayback } from '../audio/engine.js';
import { isAcceptedAudio } from '../audio/format.js';
import { buildAudioClip } from '../audio/import.js';
import { copyAsset, getAsset } from '../audio/registry.js';
import { trackColor } from '../styles/palette.js';
import { saveAudioBlob } from '../storage/db.js';
import {
  IconLoop,
  IconMusic,
  IconPause,
  IconPlay,
  IconSkipStart,
  IconSkull,
  IconStop,
} from '../components/icons.js';
import { DEVICE_DRAG_TYPE } from '../dnd.js';
import { addBytesToLibrary, getMedia, MEDIA_DRAG_TYPE } from '../media/library.js';
import { publishStageFrame } from '../stage/stageBus.js';
import { StagePanel } from '../stage/StagePanel.js';
import {
  addClip,
  applyDrag,
  findClip,
  findTrackIdOfClip,
  newClipId,
  pasteClip,
  removeClip,
  removeTrack,
  replaceClip,
  setTrackLabel,
  snap,
  type DragMode,
} from './edits.js';
import { clipAtPoint, clipsInRect } from './hitTest.js';
import { resolveActiveClipStates } from './livePreview.js';
import { drawTimeline, trackIndexAtY, trackTop, type RenderState } from './render.js';
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
  /** Currently selected clip ids; the last entry is the "primary" selection. */
  selectedClipIds: string[];
  onSelectClips: (clipIds: string[]) => void;
  /** Commit a discrete edit (after a drag/resize/delete) to the undo stack. */
  onCommit: (next: VoxShow) => void;
  /** Surface a brief status message (e.g. where a dropped clip landed). */
  onNotify?: (text: string, kind?: 'info' | 'success' | 'error') => void;
  /**
   * Stream the clips active at the playhead to the real Master/remotes as
   * `preview_frame`s — the "Output to Pixels"-style live preview toggle in
   * the header. `sendToMaster` is `useMasterStatus()`'s `send`; it already
   * no-ops when the Master isn't reachable, so this is safe to enable with
   * no hardware connected.
   */
  livePreviewOn?: boolean;
  sendToMaster?: (event: string, payload?: unknown) => boolean;
}

/**
 * The custom Canvas timeline. State that changes per animation frame (playhead,
 * viewport during a drag) lives in refs and is drawn directly to the canvas;
 * React state is reserved for things the surrounding chrome reads (the time
 * readout, zoom label), so the component never re-renders at frame rate.
 */
export function Timeline({
  show,
  selectedClipIds,
  onSelectClips,
  onCommit,
  onNotify,
  livePreviewOn = false,
  sendToMaster,
}: TimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectOne = useCallback(
    (id: string | null) => onSelectClips(id ? [id] : []),
    [onSelectClips],
  );

  // Frame-rate state (refs — no re-render).
  const viewportRef = useRef<Viewport>({ pxPerMs: 0.05, scrollMs: 0 });
  const playheadRef = useRef(0);
  const livePreviewOnRef = useRef(livePreviewOn);
  livePreviewOnRef.current = livePreviewOn;
  const sendToMasterRef = useRef(sendToMaster);
  sendToMasterRef.current = sendToMaster;
  const lastPreviewSendRef = useRef(0);
  // Relay clips active in the last preview frame, for edge detection (see the
  // rAF loop). Keyed by clip id; cleared when the preview toggles off.
  const prevRelayStatesRef = useRef<Map<string, ReturnType<typeof resolveActiveClipStates>[number]>>(
    new Map(),
  );
  // Pixel/eyes clips active last frame (keyed "deviceId:type"), so a device
  // whose clip just ended gets an explicit "off" (see the rAF loop).
  const prevHoldStatesRef = useRef<Map<string, ReturnType<typeof resolveActiveClipStates>[number]>>(
    new Map(),
  );
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

  // Active clip drag/resize, if any. `origins` holds the starting position of
  // every clip being dragged (all selected for a move; just the grabbed clip
  // for a resize), so a group move keeps relative spacing.
  const dragRef = useRef<{
    primaryId: string;
    mode: DragMode;
    grabMs: number;
    origins: { id: string; startMs: number; durationMs: number }[];
    moved: boolean;
  } | null>(null);

  // Active rubber-band marquee, if any.
  const marqueeRef = useRef<{
    startCx: number;
    startY: number;
    additive: boolean;
    base: string[];
    moved: boolean;
    rect: { x: number; y: number; w: number; h: number };
  } | null>(null);

  // Tell the Master to release any remotes it's holding in a live-preview
  // state as soon as the toggle goes off (otherwise the last frame's effect
  // would just stick on the hardware forever).
  useEffect(() => {
    if (!livePreviewOn) {
      sendToMaster?.(VOX_EVENTS.previewStop, {}); // remotes fail safe (relays open, pixels dark)
      prevRelayStatesRef.current = new Map();
      prevHoldStatesRef.current = new Map();
    }
    // Only fire on the actual on->off/off->on transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePreviewOn]);

  // Resync the draft whenever the committed show changes (and we're not mid-drag).
  useEffect(() => {
    if (!dragRef.current) {
      draftRef.current = show;
      dirtyRef.current = true;
    }
  }, [show]);

  // Keep the canvas selection set in sync with the lifted selection prop.
  useEffect(() => {
    selectionRef.current = new Set(selectedClipIds);
    dirtyRef.current = true;
  }, [selectedClipIds]);

  // Chrome state (low-frequency).
  const [displayMs, setDisplayMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loopOn, setLoopOn] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Virtual stage visibility — remembered across sessions, on by default (it's
  // the closest thing to seeing your props without dragging them out).
  const [stageOn, setStageOn] = useState(() => localStorage.getItem('vox.stage.open') !== '0');
  const toggleStage = useCallback(() => {
    setStageOn((on) => {
      localStorage.setItem('vox.stage.open', on ? '0' : '1');
      return !on;
    });
  }, []);
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
      marquee: marqueeRef.current?.rect ?? null,
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
      // Feed the virtual stage (a cheap assignment; the StagePanel decides
      // whether anything actually needs repainting).
      publishStageFrame(draftRef.current, playheadRef.current, playingRef.current);
      // Live preview: stream the clips active at the playhead to the real
      // Master at ~10Hz (plenty for LED/relay/servo state — this isn't audio
      // sample-accurate timing). Throttled independently of `dirty` so it
      // also fires while paused/scrubbing, not just during playback.
      //
      // A remote holds whatever it was last told, so when a clip ENDS we must
      // actively send an "off" — otherwise a pixel/eyes effect (or a latched
      // relay) keeps running past the clip. So we track what was active last
      // frame and, for any device whose clip just ended with nothing else
      // active on it, send the matching off. Relays additionally suppress
      // re-sends while active (a pulse re-triggers if repeated); pixels/eyes
      // are idempotent so they stream continuously.
      if (livePreviewOnRef.current && ts - lastPreviewSendRef.current >= 100) {
        lastPreviewSendRef.current = ts;
        const states = resolveActiveClipStates(draftRef.current, playheadRef.current);
        const out: typeof states = [];
        const relaysNow = new Map<string, (typeof states)[number]>();
        // Devices with an active pixel/eyes clip this frame (keyed device+type).
        const holdNow = new Map<string, (typeof states)[number]>();
        for (const s of states) {
          if (s.type === 'relay') {
            relaysNow.set(s.clipId, s);
            if (!prevRelayStatesRef.current.has(s.clipId)) out.push(s); // rising edge
            continue;
          }
          if (s.type === 'pixel' || s.type === 'eyes') holdNow.set(`${s.deviceId}:${s.type}`, s);
          out.push(s);
        }
        // Falling edge of a latching relay: release it.
        for (const [clipId, old] of prevRelayStatesRef.current) {
          if (relaysNow.has(clipId)) continue;
          const oldData = old.data as Record<string, unknown>;
          if (oldData.action === 'on') {
            out.push({ ...old, data: { channel: oldData.channel ?? 1, action: 'off' } });
          }
        }
        // Falling edge of a pixel/eyes clip: tell the device to go dark.
        for (const [key, old] of prevHoldStatesRef.current) {
          if (holdNow.has(key)) continue;
          out.push({ ...old, data: { animation: 'off' } });
        }
        prevRelayStatesRef.current = relaysNow;
        prevHoldStatesRef.current = holdNow;
        sendToMasterRef.current?.(VOX_EVENTS.previewFrame, {
          timestamp: playheadRef.current,
          states: out,
        });
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
      const rect = canvasRef.current!.getBoundingClientRect();
      const y = e.clientY - rect.top;
      if (e.button === 1 || e.altKey) {
        // Middle/Alt-drag = pan.
        panningRef.current = { x: e.clientX, scrollMs: viewportRef.current.scrollMs };
      } else if (y < LAYOUT.rulerHeight) {
        // Click/drag the ruler to move the playhead (play starts from here).
        scrubbingRef.current = true;
        playheadRef.current = Math.max(0, xToMs(viewportRef.current, cx));
        setDisplayMs(playheadRef.current);
        dirtyRef.current = true;
      } else {
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        const hit = clipAtPoint(draftRef.current, viewportRef.current, cx, y);
        if (hit) {
          if (additive) {
            // Toggle this clip in/out of the selection; don't start a drag.
            const sel = selectionRef.current;
            const next = sel.has(hit.clipId)
              ? [...sel].filter((id) => id !== hit.clipId)
              : [...sel, hit.clipId];
            onSelectClips(next);
          } else {
            // Click a clip: keep an existing multi-selection (so you can drag the
            // group), otherwise select just this one. Then arm a drag.
            const inSel = selectionRef.current.has(hit.clipId);
            if (!inSel) onSelectClips([hit.clipId]);
            const mode: DragMode = hit.zone === 'body' ? 'move' : hit.zone;
            const dragIds =
              mode === 'move' && inSel ? [...selectionRef.current] : [hit.clipId];
            const origins = dragIds
              .map((id) => {
                const c = findClip(draftRef.current, id);
                return c ? { id, startMs: c.startMs, durationMs: c.durationMs } : null;
              })
              .filter((o): o is { id: string; startMs: number; durationMs: number } => o !== null);
            dragRef.current = {
              primaryId: hit.clipId,
              mode,
              grabMs: xToMs(viewportRef.current, cx),
              origins,
              moved: false,
            };
          }
        } else {
          // Empty space: begin a marquee. A click (no movement) clears the
          // selection and scrubs; a drag rubber-band selects.
          marqueeRef.current = {
            startCx: cx,
            startY: y,
            additive,
            base: additive ? [...selectionRef.current] : [],
            moved: false,
            rect: { x: LAYOUT.trackHeaderWidth + cx, y, w: 0, h: 0 },
          };
        }
      }
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [onSelectClips],
  );

  const MOVE_THRESHOLD = 4;

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
      if (drag.mode === 'move') {
        // Snap the delta off the primary clip, then shift the whole group by the
        // same amount so relative spacing is preserved.
        const primary = drag.origins.find((o) => o.id === drag.primaryId) ?? drag.origins[0];
        if (primary) {
          const snapped = applyDrag(primary.startMs, primary.durationMs, 'move', deltaMs, !e.altKey);
          const effDelta = snapped.startMs - primary.startMs;
          let next = draftRef.current;
          for (const o of drag.origins) {
            const clip = findClip(next, o.id);
            if (clip) {
              next = replaceClip(next, o.id, { ...clip, startMs: Math.max(0, o.startMs + effDelta) });
            }
          }
          draftRef.current = next;
        }
      } else {
        const o = drag.origins[0];
        const clip = o && findClip(draftRef.current, o.id);
        if (o && clip) {
          const upd = applyDrag(o.startMs, o.durationMs, drag.mode, deltaMs, !e.altKey);
          // Audio clips can't be stretched past their real length (no time-stretch
          // yet) — cap the duration at the decoded asset's length.
          const assetMs = getAsset(o.id)?.durationMs;
          if (clip.type === 'audio' && assetMs && upd.durationMs > assetMs) {
            if (drag.mode === 'resize-end') {
              upd.durationMs = assetMs;
            } else {
              // resize-start: keep the right edge fixed, clamp the left edge.
              const rightEdge = o.startMs + o.durationMs;
              upd.startMs = Math.max(0, rightEdge - assetMs);
              upd.durationMs = rightEdge - upd.startMs;
            }
          }
          draftRef.current = replaceClip(draftRef.current, o.id, { ...clip, ...upd });
        }
      }
      drag.moved = true;
      dirtyRef.current = true;
      return;
    }

    const mq = marqueeRef.current;
    if (mq) {
      const cx = contentXFromEvent(e);
      const y = e.clientY - canvasRef.current!.getBoundingClientRect().top;
      if (!mq.moved && Math.abs(cx - mq.startCx) < MOVE_THRESHOLD && Math.abs(y - mq.startY) < MOVE_THRESHOLD) {
        return; // not yet a drag
      }
      mq.moved = true;
      mq.rect = { x: LAYOUT.trackHeaderWidth + mq.startCx, y: mq.startY, w: cx - mq.startCx, h: y - mq.startY };
      // Live preview: highlight intersected clips (render only — no React churn).
      const inside = clipsInRect(draftRef.current, viewportRef.current, {
        x: mq.startCx,
        y: mq.startY,
        w: cx - mq.startCx,
        h: y - mq.startY,
      });
      selectionRef.current = new Set(mq.additive ? [...mq.base, ...inside] : inside);
      dirtyRef.current = true;
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
    // updateHoverCursor is a stable useCallback([]) defined below; listing it
    // would require reordering the declarations for zero behavioural gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const mq = marqueeRef.current;
    if (mq) {
      marqueeRef.current = null;
      if (mq.moved) {
        // Commit the marquee selection to React state.
        onSelectClips([...selectionRef.current]);
      } else {
        // A plain click on empty space: clear selection and scrub there.
        onSelectClips([]);
        playheadRef.current = Math.max(0, xToMs(viewportRef.current, mq.startCx));
        setDisplayMs(playheadRef.current);
      }
      dirtyRef.current = true;
    }

    scrubbingRef.current = false;
    panningRef.current = null;
  }, [onCommit, onSelectClips]);

  // --- Wheel: pan horizontally; Ctrl/Cmd = zoom at cursor -------------------
  const onWheel = useCallback((e: React.WheelEvent) => {
    const cx = e.clientX - canvasRef.current!.getBoundingClientRect().left - LAYOUT.trackHeaderWidth;
    // Normalise line-mode wheels to pixels for consistent feel.
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
    if (e.shiftKey) {
      // Shift+wheel = horizontal pan.
      viewportRef.current = panByPx(viewportRef.current, dx || dy);
    } else {
      // Wheel = smooth zoom toward the cursor (the critical timeline gesture).
      const factor = Math.exp(-dy * 0.0015);
      viewportRef.current = zoomAt(viewportRef.current, Math.max(0, cx), viewportRef.current.pxPerMs * factor);
    }
    dirtyRef.current = true;
  }, []);

  // --- Audio import via OS file drop ---------------------------------------
  // `bytes` is read synchronously in the drop handler (see onDrop) — re-reading
  // a dropped file later fails on some platforms, so we never touch the File again.
  const importAudioBytes = useCallback(
    async (bytes: ArrayBuffer, filename: string, mime: string, dropX: number, dropY: number) => {
      // Place on the track under the cursor if it's audio; else the first audio
      // track; else create one — a drop on an empty show must Just Work.
      const idx = trackIndexAtY(dropY, show.tracks.length);
      const underCursor = idx >= 0 ? show.tracks[idx] : undefined;
      let target =
        underCursor?.type === 'audio' ? underCursor : show.tracks.find((t) => t.type === 'audio');
      let base = show;
      if (!target) {
        const dev = show.devices[0];
        target = {
          id: newClipId(),
          deviceId: dev?.id ?? 'unassigned',
          type: 'audio',
          label: dev ? dev.name : 'Audio',
          clips: [],
        };
        base = { ...show, tracks: [...show.tracks, target] };
      }

      setImporting(true);
      try {
        // Mirror into the media library so the Media tab knows about it too.
        void addBytesToLibrary(bytes.slice(0), filename, mime);
        const startMs = Math.max(0, snap(xToMs(viewportRef.current, dropX), true));
        const clip = await buildAudioClip(bytes, filename, mime, target.deviceId, startMs);
        const next = addClip(base, target.id, clip);
        draftRef.current = next;
        onCommit(next);
        selectOne(clip.id);
        dirtyRef.current = true;
        onNotify?.(
          `Added “${filename}” to ${target.label} at ${(startMs / 1000).toFixed(1)}s`,
          'success',
        );
      } catch (err) {
        console.error('Audio import failed:', err);
        onNotify?.(`Couldn't import “${filename}”`, 'error');
      } finally {
        setImporting(false);
      }
    },
    [show, onCommit, selectOne, onNotify],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes('Files') ||
      e.dataTransfer.types.includes(MEDIA_DRAG_TYPE) ||
      e.dataTransfer.types.includes(DEVICE_DRAG_TYPE)
    ) {
      e.preventDefault();
      setDropActive(true);
    }
  }, []);

  // Drop a device from the sidebar: create the track(s) it performs on. A
  // skull gets its two surfaces (voice audio + eyes); everything else gets
  // its one native track type.
  const addDeviceTracks = useCallback(
    (device: { id: string; name: string; type: string; onboard?: string[] }) => {
      const trackTypes =
        device.onboard && device.onboard.length > 0
          ? device.onboard // the Vox Master: one lane per backpack output type
          : device.type === 'skull'
            ? ['audio', 'eyes']
            : device.type === 'pixel' || device.type === 'dmx' || device.type === 'relay'
              ? [device.type]
              : device.type === 'audio'
                ? ['audio']
                : [];
      if (trackTypes.length === 0) {
        onNotify?.(`“${device.name}” has no timeline tracks — use + Track for plugin lanes`, 'info');
        return;
      }
      let next = draftRef.current;
      const added: string[] = [];
      for (const type of trackTypes) {
        // One lane per (device, type) by default — a second drop selects
        // rather than silently duplicating. More lanes via + Track.
        if (next.tracks.some((t) => t.deviceId === device.id && t.type === type)) continue;
        next = {
          ...next,
          tracks: [
            ...next.tracks,
            {
              id: newClipId(),
              deviceId: device.id,
              type,
              label: trackTypes.length > 1 && type === 'eyes' ? `${device.name} — Eyes` : device.name,
              clips: [],
            },
          ],
        };
        added.push(type);
      }
      if (added.length === 0) {
        onNotify?.(`“${device.name}” is already on the timeline`, 'info');
        return;
      }
      draftRef.current = next;
      onCommit(next);
      dirtyRef.current = true;
      onNotify?.(
        device.type === 'skull'
          ? `Added “${device.name}” — drop audio on its track, program eyes on the other`
          : `Added a ${added[0]} track for “${device.name}”`,
        'success',
      );
    },
    [onCommit, onNotify],
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear when leaving the wrapper, not when crossing child elements.
    if (e.currentTarget === e.target) setDropActive(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropActive(false);

      // A device from the sidebar: add its track(s), wherever it lands.
      const deviceJson = e.dataTransfer.getData(DEVICE_DRAG_TYPE);
      if (deviceJson) {
        try {
          addDeviceTracks(JSON.parse(deviceJson));
        } catch {
          /* malformed payload — ignore */
        }
        return;
      }

      const rect = canvasRef.current!.getBoundingClientRect();
      const dropX = e.clientX - rect.left - LAYOUT.trackHeaderWidth;
      const dropY = e.clientY - rect.top;
      if (dropX < 0) return;

      // A card dragged from the Media Library carries its id, not a File.
      const mediaId = e.dataTransfer.getData(MEDIA_DRAG_TYPE);
      if (mediaId) {
        const media = getMedia(mediaId);
        if (!media) return;
        void media.blob
          .arrayBuffer()
          .then((b) => importAudioBytes(b, media.filename, media.blob.type, dropX, dropY));
        return;
      }

      const file = Array.from(e.dataTransfer.files).find(isAcceptedAudio);
      if (!file) return; // .vox/.zip handled at the window level (App)
      // Read the bytes NOW, synchronously, while the dropped file is still valid.
      const bytes = file.arrayBuffer();
      const { name, type } = file;
      void bytes.then((b) => importAudioBytes(b, name, type, dropX, dropY));
    },
    [importAudioBytes, addDeviceTracks],
  );

  // --- Duplicate / copy / paste (operate on the whole selection) -----------
  const clipboardRef = useRef<VoxClip[]>([]);

  /** Carry an audio clip's decoded asset + persisted blob to a new clip id. */
  const carryAudio = useCallback((fromId: string, toId: string) => {
    const asset = copyAsset(fromId, toId);
    if (asset) void saveAudioBlob(toId, asset.filename, asset.blob);
  }, []);

  const duplicateSelected = useCallback(() => {
    const ids = [...selectionRef.current];
    if (ids.length === 0) return;
    let next = draftRef.current;
    const newIds: string[] = [];
    for (const id of ids) {
      const trackId = findTrackIdOfClip(next, id);
      const clip = findClip(next, id);
      if (!trackId || !clip) continue;
      const at = snap(clip.startMs + clip.durationMs, true);
      const res = pasteClip(next, trackId, clip, at);
      carryAudio(clip.id, res.clip.id);
      next = res.show;
      newIds.push(res.clip.id);
    }
    if (newIds.length === 0) return;
    draftRef.current = next;
    onCommit(next);
    onSelectClips(newIds);
  }, [onCommit, onSelectClips, carryAudio]);

  const copySelected = useCallback(() => {
    const ids = [...selectionRef.current];
    clipboardRef.current = ids
      .map((id) => findClip(draftRef.current, id))
      .filter((c): c is VoxClip => c !== null);
  }, []);

  const pasteClipboard = useCallback(() => {
    const clips = clipboardRef.current;
    if (clips.length === 0) return;
    // Preserve relative timing: anchor the earliest clip at the playhead.
    const minStart = Math.min(...clips.map((c) => c.startMs));
    const base = snap(playheadRef.current, true);
    let next = draftRef.current;
    const newIds: string[] = [];
    for (const clip of clips) {
      const trackId =
        findTrackIdOfClip(next, clip.id) ??
        next.tracks.find((t) => t.type === clip.type)?.id ??
        next.tracks[0]?.id;
      if (!trackId) continue;
      const res = pasteClip(next, trackId, clip, base + (clip.startMs - minStart));
      carryAudio(clip.id, res.clip.id);
      next = res.show;
      newIds.push(res.clip.id);
    }
    if (newIds.length === 0) return;
    draftRef.current = next;
    onCommit(next);
    onSelectClips(newIds);
  }, [onCommit, onSelectClips, carryAudio]);

  const deleteSelected = useCallback(() => {
    const ids = [...selectionRef.current];
    if (ids.length === 0) return;
    let next = draftRef.current;
    for (const id of ids) next = removeClip(next, id);
    draftRef.current = next;
    onCommit(next);
    onSelectClips([]);
  }, [onCommit, onSelectClips]);

  /** Select every clip on the track that holds the primary selection. */
  const selectTrackClips = useCallback(() => {
    const anchor = selectionRef.current.values().next().value as string | undefined;
    const trackId = anchor ? findTrackIdOfClip(draftRef.current, anchor) : null;
    const track = trackId ? draftRef.current.tracks.find((t) => t.id === trackId) : null;
    const target = track ?? draftRef.current.tracks.find((t) => t.clips.length > 0);
    if (target) onSelectClips(target.clips.map((c) => c.id));
  }, [onSelectClips]);

  // --- Double-click an empty lane to create a clip -------------------------
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left - LAYOUT.trackHeaderWidth;
      const y = e.clientY - rect.top;
      if (cx < 0) return;
      const idx = trackIndexAtY(y, draftRef.current.tracks.length);
      const track = idx >= 0 ? draftRef.current.tracks[idx] : undefined;
      // Audio clips come from dropping a file; everything else is created here.
      if (!track || track.type === 'audio') return;
      if (clipAtPoint(draftRef.current, viewportRef.current, cx, y)) return; // not on a clip

      const startMs = Math.max(0, snap(xToMs(viewportRef.current, cx), true));
      const { durationMs, data } = defaultClipFor(track.type);
      const clip: VoxClip = { id: newClipId(), startMs, durationMs, type: track.type, data };
      const next = addClip(draftRef.current, track.id, clip);
      draftRef.current = next;
      onCommit(next);
      selectOne(clip.id);
      dirtyRef.current = true;
    },
    [onCommit, selectOne],
  );

  // --- Right-click context menu --------------------------------------------
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    kind: 'clip' | 'empty' | 'track';
    trackId?: string;
  } | null>(null);
  const [renaming, setRenaming] = useState<{ trackId: string; label: string } | null>(null);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const xInCanvas = e.clientX - rect.left;
      const cx = xInCanvas - LAYOUT.trackHeaderWidth;
      const y = e.clientY - rect.top;
      e.preventDefault();
      const wrapRect = wrapRef.current!.getBoundingClientRect();
      const mx = e.clientX - wrapRect.left;
      const my = e.clientY - wrapRect.top;

      // Right-click in the track header column → a track menu.
      if (cx < 0 && y >= LAYOUT.rulerHeight) {
        const idx = trackIndexAtY(y, draftRef.current.tracks.length);
        const track = idx >= 0 ? draftRef.current.tracks[idx] : undefined;
        if (track) setMenu({ x: mx, y: my, kind: 'track', trackId: track.id });
        return;
      }
      if (cx < 0) return;

      const hit = clipAtPoint(draftRef.current, viewportRef.current, cx, y);
      // Right-clicking a clip that isn't selected selects just it; keep an
      // existing multi-selection so context actions apply to the whole group.
      if (hit && !selectionRef.current.has(hit.clipId)) selectOne(hit.clipId);
      setMenu({ x: mx, y: my, kind: hit ? 'clip' : 'empty' });
    },
    [selectOne],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const deleteTrack = useCallback(
    (trackId: string) => {
      const next = removeTrack(draftRef.current, trackId);
      draftRef.current = next;
      onCommit(next);
      onSelectClips([]);
    },
    [onCommit, onSelectClips],
  );

  const commitRename = useCallback(() => {
    setRenaming((r) => {
      if (r && r.label.trim()) {
        const next = setTrackLabel(draftRef.current, r.trackId, r.label.trim());
        draftRef.current = next;
        onCommit(next);
      }
      return null;
    });
  }, [onCommit]);

  // --- Add track ------------------------------------------------------------
  const addTrack = useCallback(
    (type: string) => {
      const cur = draftRef.current;
      const wants =
        type === 'dmx'
          ? ['dmx']
          : type === 'relay'
            ? ['relay']
            : type === 'pixel'
              ? ['pixel']
              : type === 'eyes'
                ? ['skull']
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
        } else if (k === 'a') {
          e.preventDefault();
          selectTrackClips();
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
          if (selectionRef.current.size > 0) {
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
    duplicateSelected,
    copySelected,
    pasteClipboard,
    deleteSelected,
    selectTrackClips,
    setLoopIn,
    setLoopOut,
    toggleLoop,
  ]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative z-30 flex items-center gap-3 border-b border-border/70 bg-bg2/60 px-4 py-2 backdrop-blur">
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
          <TransportButton title="Virtual stage — preview your props without hardware" onClick={toggleStage} accent={stageOn}>
            <IconSkull className="h-4 w-4" />
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
            aria-label="Add a track"
            aria-haspopup="menu"
            aria-expanded={addOpen}
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
                    ['pixel', 'VoxPixel'],
                    ['eyes', 'Eyes'],
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
          <Kbd>Space</Kbd> play · <Kbd>I/O/L</Kbd> loop · <Kbd>⇧</Kbd>/drag multi-select ·{' '}
          <Kbd>⌘A</Kbd> track · <Kbd>⌘D</Kbd> dup · <Kbd>⌘Z</Kbd> undo
        </span>
      </div>
      {stageOn && <StagePanel />}
      <div
        ref={wrapRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <canvas
          ref={canvasRef}
          role="application"
          aria-label="Show timeline editor — drag clips, scrub the playhead, and use keyboard shortcuts"
          tabIndex={0}
          className="block touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
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
              {menu.kind === 'track' ? (
                <>
                  <MenuItem
                    label="Rename track"
                    onClick={() => {
                      const t = draftRef.current.tracks.find((tr) => tr.id === menu.trackId);
                      if (t) setRenaming({ trackId: t.id, label: t.label });
                      closeMenu();
                    }}
                  />
                  <div className="my-1 h-px bg-border/60" />
                  <MenuItem
                    label="Delete track"
                    danger
                    onClick={() => {
                      if (menu.trackId) deleteTrack(menu.trackId);
                      closeMenu();
                    }}
                  />
                </>
              ) : menu.kind === 'clip' ? (
                <>
                  <MenuItem label="Duplicate" hint="⌘D" onClick={() => { duplicateSelected(); closeMenu(); }} />
                  <MenuItem label="Copy" hint="⌘C" onClick={() => { copySelected(); closeMenu(); }} />
                  <MenuItem label="Paste" hint="⌘V" disabled={clipboardRef.current.length === 0} onClick={() => { pasteClipboard(); closeMenu(); }} />
                  <div className="my-1 h-px bg-border/60" />
                  <MenuItem label="Delete" hint="⌫" danger onClick={() => { deleteSelected(); closeMenu(); }} />
                </>
              ) : (
                <MenuItem label="Paste" hint="⌘V" disabled={clipboardRef.current.length === 0} onClick={() => { pasteClipboard(); closeMenu(); }} />
              )}
            </div>
          </>
        )}

        {renaming &&
          (() => {
            const row = draftRef.current.tracks.findIndex((t) => t.id === renaming.trackId);
            if (row < 0) return null;
            return (
              <input
                autoFocus
                value={renaming.label}
                onChange={(e) =>
                  setRenaming((r) => (r ? { ...r, label: e.target.value } : r))
                }
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenaming(null);
                }}
                className="absolute z-40 rounded-md border border-purple/60 bg-bg2 px-2 py-1 text-[13px] font-medium text-text shadow-xl focus:outline-none"
                style={{ left: 8, top: trackTop(row) + LAYOUT.trackHeight / 2 - 14, width: LAYOUT.trackHeaderWidth - 16 }}
              />
            );
          })()}

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
      aria-label={title}
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

/** Default duration + payload for a newly double-click-created clip. 5s —
 * long enough to grab the resize handles without zooming in first. */
function defaultClipFor(type: string): { durationMs: number; data: Record<string, unknown> } {
  switch (type) {
    case 'dmx':
      return { durationMs: 5000, data: { universe: 0, channel: 1, value: 255, fadeMs: 0 } };
    case 'relay':
      // ON = closed for exactly the clip's length (the engine emits the
      // matching off at the end) — the intuitive default.
      return { durationMs: 5000, data: { channel: 1, action: 'on' } };
    case 'servo':
    case 'neck':
      return {
        durationMs: 5000,
        data: {
          axis: 'default',
          keyframes: [
            { timeMs: 0, value: 0 },
            { timeMs: 5000, value: 1 },
          ],
        },
      };
    case 'pixel':
      return { durationMs: 5000, data: { animation: 'glow', color: '#FF6A00', brightness: 220 } };
    case 'eyes':
      return { durationMs: 5000, data: { animation: 'idle', color: '#AFA9EC' } };
    default:
      // Plugin track types (wled/http/udp/…): empty payload; the plugin's
      // inspector + summary guide the user to fill it in.
      return { durationMs: 5000, data: {} };
  }
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
