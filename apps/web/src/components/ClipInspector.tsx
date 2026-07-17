import {
  BUILT_IN_EYES,
  compileLook,
  type FixtureLook,
  type FixtureProfile,
  type VoxClip,
  type VoxShow,
} from '@voxcomposer/shared';
import { useEffect, useMemo, useState } from 'react';
import { loadFixtureProfile } from '../fixtures/vibrary.js';
import { paramsFromClipData, PIXEL_EFFECTS } from '../pixel/engine.js';
import { effectiveAnimation } from '../pixel/wled.js';
import type { VoxPlugin } from '@voxcomposer/plugin-sdk';
import type { DeviceInventory } from '../voxlink/useMasterStatus.js';
import { pluginRegistry } from '../plugins/registry.js';
import { getPluginConfig } from '../plugins/config.js';
import { getPluginApi } from '../plugins/host.js';
import { trackColor } from '../styles/palette.js';
import { PixelPreview } from './PixelPreview.js';
import { EyePreview } from './EyePreview.js';
import { FixturePreview } from './FixturePreview.js';

/** Neck-motion presets the skull board understands per axis / for speed. */
const AXIS_MODES = ['fixed', 'wander', 'track', 'sweep', 'nod'];
const SPEED_MODES = ['slow', 'talk', 'talk+', 'fast'];

/** The nine gaze directions of the eyes look-pad, row-major. */
const LOOK_GRID: { x: number; y: number; glyph: string }[] = [
  { x: -1, y: -1, glyph: '↖' },
  { x: 0, y: -1, glyph: '↑' },
  { x: 1, y: -1, glyph: '↗' },
  { x: -1, y: 0, glyph: '←' },
  { x: 0, y: 0, glyph: '●' },
  { x: 1, y: 0, glyph: '→' },
  { x: -1, y: 1, glyph: '↙' },
  { x: 0, y: 1, glyph: '↓' },
  { x: 1, y: 1, glyph: '↘' },
];

interface ClipInspectorProps {
  clip: VoxClip | null;
  show: VoxShow;
  /** Commit an edited clip to the undo stack. */
  onChange: (next: VoxClip) => void;
  /** How many clips are selected (the inspector edits the primary one). */
  selectionCount?: number;
  /** Live SD inventory per device (UPPERCASE MAC), from the Master's /status —
   * drives the Eye picker's SD-card list. */
  deviceInventories?: Map<string, DeviceInventory>;
}

export function ClipInspector({
  clip,
  show,
  onChange,
  selectionCount = 0,
  deviceInventories,
}: ClipInspectorProps) {
  return (
    <aside className="hidden w-72 flex-col overflow-y-auto border-l border-border/70 bg-bg2/60 lg:flex">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/80">
          Clip Inspector
        </div>
        {clip && (
          <span
            className="ml-auto rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{
              color: trackColor(clip.type).accent,
              backgroundColor: `${trackColor(clip.type).accent}1f`,
            }}
          >
            {clip.type}
          </span>
        )}
      </div>
      {clip ? (
        <>
          {selectionCount > 1 && (
            <div className="mx-4 mb-2 rounded-lg border border-purple/30 bg-purple/10 px-3 py-2 text-[12px] text-purple-l">
              {selectionCount} clips selected · editing primary
            </div>
          )}
          <ClipFields
            key={clip.id}
            clip={clip}
            show={show}
            onChange={onChange}
            deviceInventories={deviceInventories}
          />
        </>
      ) : (
        <EmptyState />
      )}
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-bg3/40 text-muted">
        ⌘
      </div>
      <p className="text-[13px] text-muted">Select a clip on the timeline to inspect and edit it.</p>
    </div>
  );
}

function ClipFields({
  clip,
  show,
  onChange,
  deviceInventories,
}: {
  clip: VoxClip;
  show: VoxShow;
  onChange: (next: VoxClip) => void;
  deviceInventories?: Map<string, DeviceInventory>;
}) {
  // Local editable copy. Re-seeded when the selected/committed clip changes
  // (selection, undo, or a timeline drag) — never mid-keystroke, since text
  // fields commit on blur rather than per character.
  const [draft, setDraft] = useState<VoxClip>(clip);
  useEffect(() => setDraft(clip), [clip]);

  const data = draft.data as Record<string, unknown>;
  const isAudio = draft.type === 'audio';
  const isDmx = draft.type === 'dmx';
  const isRelay = draft.type === 'relay';
  const isPixel = draft.type === 'pixel';
  const isEyes = draft.type === 'eyes';
  const plugin = pluginRegistry.forTrackType(draft.type);
  const neck = data.neck as Record<string, string> | undefined;
  const deviceId = typeof data.deviceId === 'string' ? data.deviceId : undefined;
  const device = show.devices.find((d) => d.id === deviceId);

  // DMX clips route by their owning track's device; if that device has a
  // fixture patched (see AddDeviceModal), the raw channel fields give way to
  // a look editor driven by the fixture's profile.
  const trackDevice = useMemo(() => {
    const track = show.tracks.find((t) => t.clips.some((c) => c.id === clip.id));
    return track ? show.devices.find((d) => d.id === track.deviceId) : undefined;
  }, [show, clip.id]);
  // The device's live typed SD inventory (eyes + audio) from the Master's /status,
  // keyed by MAC. Drives both the Eye picker and the audio "on the skull" list.
  const liveInv =
    deviceInventories?.get((trackDevice?.id ?? deviceId ?? '').toUpperCase()) ??
    deviceInventories?.get((deviceId ?? '').toUpperCase());
  const fixture = draft.type === 'dmx' ? trackDevice?.fixture : undefined;
  const [profile, setProfile] = useState<FixtureProfile | null>(null);
  useEffect(() => {
    setProfile(null);
    if (fixture) void loadFixtureProfile(fixture.profileId).then(setProfile);
  }, [fixture, fixture?.profileId]);

  // Effect-engine params for the pixel/eyes preview (and the param editors).
  const previewParams = useMemo(() => {
    const base = paramsFromClipData(draft.data as Record<string, unknown>);
    if (draft.type !== 'pixel') return { ...base, animation: 'glow' }; // eyes: a soft stand-in
    const wledFx = typeof (draft.data as Record<string, unknown>).wledFx === 'number'
      ? ((draft.data as Record<string, unknown>).wledFx as number)
      : undefined;
    return { ...base, animation: effectiveAnimation(base.animation, wledFx).animation };
  }, [draft]);
  const effectDef = PIXEL_EFFECTS.find((e) => e.id === String(data.animation ?? 'solid'));

  const patch = (changes: Partial<VoxClip>) => setDraft((d) => ({ ...d, ...changes }));
  const patchData = (changes: Record<string, unknown>) =>
    setDraft((d) => ({ ...d, data: { ...d.data, ...changes } }));
  const commit = (next: VoxClip = draft) => onChange(next);
  /** Apply a data change and commit immediately (for discrete controls). */
  const commitData = (changes: Record<string, unknown>) => {
    const next = { ...draft, data: { ...draft.data, ...changes } };
    setDraft(next);
    onChange(next);
  };

  return (
    <div className="px-4 pb-6">
      {isAudio && (
        <>
          <TextField
            label="File"
            value={String(data.filename ?? '')}
            mono
            onChange={(v) => patchData({ filename: v })}
            onCommit={() => commit()}
          />
          {typeof data.sourceFormat === 'string' && (
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
              <span
                className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-purple-l"
                style={{ backgroundColor: 'rgba(175,169,236,0.14)' }}
              >
                {String(data.sourceFormat)}
              </span>
              {data.sourceFormat !== 'wav' && <span>transcodes to WAV on sync</span>}
            </div>
          )}
        </>
      )}

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <NumberField
          label="Start (s)"
          value={(draft.startMs / 1000).toFixed(2)}
          onChange={(v) => patch({ startMs: Math.max(0, Math.round(parseFloat(v) * 1000) || 0) })}
          onCommit={() => commit()}
        />
        <NumberField
          label="Duration (s)"
          value={(draft.durationMs / 1000).toFixed(2)}
          onChange={(v) =>
            patch({ durationMs: Math.max(50, Math.round(parseFloat(v) * 1000) || 50) })
          }
          onCommit={() => commit()}
        />
      </div>

      {plugin?.renderInspector && (
        <>
          <SectionDivider>{plugin.name}</SectionDivider>
          {plugin.renderInspector(draft, {
            onChange: (d) => commitData(d),
            config: getPluginConfig(plugin.id),
            api: getPluginApi(plugin),
          })}
          <PluginTestButton plugin={plugin} clip={draft} />
        </>
      )}

      {isAudio && (
        <div className="mt-3">
          <FieldLabel>Volume</FieldLabel>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              aria-label="Volume"
              value={Math.round(Number(data.volume ?? 1) * 100)}
              onChange={(e) => patchData({ volume: Number(e.target.value) / 100 })}
              onPointerUp={() => commit()}
              onKeyUp={() => commit()}
              className="vox-range h-1.5 flex-1"
            />
            <span className="w-10 text-right font-mono text-xs text-text">
              {Math.round(Number(data.volume ?? 1) * 100)}%
            </span>
          </div>
        </div>
      )}

      {isAudio && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <NumberField
            label="Fade in (s)"
            value={((Number(data.fadeInMs ?? 0)) / 1000).toFixed(2)}
            onChange={(v) => patchData({ fadeInMs: Math.max(0, Math.round(parseFloat(v) * 1000) || 0) })}
            onCommit={() => commit()}
          />
          <NumberField
            label="Fade out (s)"
            value={((Number(data.fadeOutMs ?? 0)) / 1000).toFixed(2)}
            onChange={(v) => patchData({ fadeOutMs: Math.max(0, Math.round(parseFloat(v) * 1000) || 0) })}
            onCommit={() => commit()}
          />
        </div>
      )}

      {isAudio && (
        <div className="mt-3 flex items-center justify-between">
          <div>
            <FieldLabel>Jaw sync</FieldLabel>
            <p className="text-[10px] text-muted">Skull board runs onboard FFT</p>
          </div>
          <Toggle
            on={Boolean(data.jawSync)}
            onChange={(on) => commitData({ jawSync: on, jawMode: on ? 'FFT auto' : undefined })}
          />
        </div>
      )}

      {isDmx && profile && fixture && (
        <>
          <div className="mb-3 overflow-hidden rounded-lg border border-border/60 bg-bg/40">
            <FixturePreview profile={profile} look={(data.look as FixtureLook | undefined) ?? {}} />
          </div>
          <LookEditor
            profile={profile}
            look={(data.look as FixtureLook | undefined) ?? {}}
            onEdit={(look) => patchData({ look })}
            onCommit={(look) => {
              const levels = compileLook(profile, fixture.startChannel, look);
              commitData({ look, levels, universe: fixture.universe });
            }}
          />
        </>
      )}

      {isDmx && !(profile && fixture) && (
        <>
          {fixture && !profile && (
            <p className="mb-2 text-[11px] text-muted">
              Loading fixture profile… raw channels below work meanwhile.
            </p>
          )}
          <DmxRawEditor
            key={clip.id}
            universe={typeof data.universe === 'number' ? data.universe : 0}
            fadeMs={typeof data.fadeMs === 'number' ? data.fadeMs : 0}
            levels={readDmxLevels(data)}
            onCommit={(next) => {
              // Write the multi-channel form and drop the legacy single-channel
              // fields so the two can never disagree.
              const nextData = { ...draft.data } as Record<string, unknown>;
              delete nextData.channel;
              delete nextData.value;
              onChange({ ...draft, data: { ...nextData, ...next } });
            }}
          />
        </>
      )}

      {isRelay && (
        <>
          <SectionDivider>Relay</SectionDivider>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Relay</FieldLabel>
              <select
                value={String(Math.max(1, Number(data.channel) || 1))}
                onChange={(e) => commitData({ channel: Number(e.target.value) })}
                className="w-full rounded-lg border border-border/80 bg-bg/60 px-2.5 py-2 text-[13px] text-text focus:border-purple/50 focus:outline-none"
              >
                {Array.from({ length: trackDevice?.relayCount ?? 4 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {trackDevice?.relayLabels?.[n - 1]?.trim()
                      ? `${n} · ${trackDevice.relayLabels[n - 1]}`
                      : `Relay ${n}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Action</FieldLabel>
              <select
                value={String(data.action ?? 'pulse')}
                onChange={(e) => commitData({ action: e.target.value })}
                className="w-full rounded-lg border border-border/80 bg-bg/60 px-2.5 py-2 text-[13px] text-text focus:border-purple/50 focus:outline-none"
              >
                <option value="on">On (for the clip's length)</option>
                <option value="off">Off</option>
                <option value="pulse">Pulse (one-shot)</option>
              </select>
            </div>
          </div>
          {String(data.action ?? 'on') === 'pulse' && (
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <NumberField
                label="Pulse width (ms)"
                value={String(data.durationMs ?? 500)}
                onChange={(v) => patchData({ durationMs: Math.max(50, parseInt(v) || 500) })}
                onCommit={() => commit()}
              />
            </div>
          )}
        </>
      )}

      {(isPixel || isEyes) && (
        <>
          <SectionDivider>{isPixel ? 'VoxPixel' : 'Eyes'}</SectionDivider>
          <div className="overflow-hidden rounded-lg border border-border/60 bg-bg/40">
            {isEyes ? (
              <EyePreview
                color={String(data.color ?? '#FF6A00')}
                lookX={Number(data.lookX ?? 0)}
                lookY={Number(data.lookY ?? 0)}
                animation={String(data.animation ?? 'idle')}
              />
            ) : (
              <PixelPreview
                params={previewParams}
                count={Math.min(trackDevice?.pixelCount ?? 16, 60)}
              />
            )}
          </div>

          {isEyes &&
            (() => {
              // Which eye texture the skull shows for this clip: the 9 built-in
              // eyes plus whatever .eye files the device reported (live from the
              // Master's /status, falling back to any inventory saved on the
              // device). Empty = leave the current eye as-is.
              // Live typed eyes when the Master reports them; else the flat
              // inventory saved on the device (offline fallback).
              const sdEyes = (
                liveInv?.eyes ??
                trackDevice?.inventory ??
                device?.inventory ??
                []
              ).filter((n) => !BUILT_IN_EYES.includes(n as (typeof BUILT_IN_EYES)[number]));
              return (
                <div className="mt-2.5">
                  <FieldLabel>Eye</FieldLabel>
                  <select
                    value={String(data.eye ?? '')}
                    onChange={(e) => commitData({ eye: e.target.value || undefined })}
                    className="w-full rounded-lg border border-border/80 bg-bg/60 px-2.5 py-2 text-[13px] text-text focus:border-purple/50 focus:outline-none"
                  >
                    <option value="">(keep current)</option>
                    <optgroup label="Built-in">
                      {BUILT_IN_EYES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </optgroup>
                    {sdEyes.length > 0 && (
                      <optgroup label="SD card">
                        {sdEyes.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {sdEyes.length === 0 && (
                    <p className="mt-1 text-[10px] text-muted">
                      Connect the skull &amp; scan devices to list its SD-card eyes.
                    </p>
                  )}
                </div>
              );
            })()}

          {isPixel && (
            <div className="mt-2.5">
              <FieldLabel>Effect</FieldLabel>
              <select
                value={String(data.animation ?? 'solid')}
                onChange={(e) =>
                  // Changing the effect also clears any legacy WLED fields, so
                  // old clips converge on the one built-in effect source.
                  commitData({
                    animation: e.target.value,
                    wledFx: undefined,
                    palette: undefined,
                    intensity: undefined,
                  })
                }
                className="w-full rounded-lg border border-border/80 bg-bg/60 px-2.5 py-2 text-[13px] text-text focus:border-purple/50 focus:outline-none"
              >
                {PIXEL_EFFECTS.map((fx) => (
                  <option key={fx.id} value={fx.id}>
                    {fx.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Per-effect knobs — only the ones this effect actually reads. */}
          {isPixel && effectDef && (
            <>
              <div className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-2.5">
                {effectDef.uses.speed && (
                  <ParamSlider
                    label="Speed"
                    min={0}
                    max={255}
                    value={Number(data.speed ?? 128)}
                    onEdit={(v) => patchData({ speed: v })}
                    onCommit={(v) => commitData({ speed: v })}
                  />
                )}
                {effectDef.uses.density && (
                  <ParamSlider
                    label={String(data.animation) === 'lightning' ? 'Strike rate' : 'Density'}
                    min={0}
                    max={255}
                    value={Number(data.density ?? 64)}
                    onEdit={(v) => patchData({ density: v })}
                    onCommit={(v) => commitData({ density: v })}
                  />
                )}
                {effectDef.uses.size && (
                  <ParamSlider
                    label="Length (px)"
                    min={1}
                    max={30}
                    value={Number(data.size ?? 4)}
                    onEdit={(v) => patchData({ size: v })}
                    onCommit={(v) => commitData({ size: v })}
                  />
                )}
                {effectDef.uses.trail && (
                  <ParamSlider
                    label="Trail (px)"
                    min={0}
                    max={30}
                    value={Number(data.trail ?? 8)}
                    onEdit={(v) => patchData({ trail: v })}
                    onCommit={(v) => commitData({ trail: v })}
                  />
                )}
                {effectDef.uses.direction && (
                  <div>
                    <FieldLabel>Direction</FieldLabel>
                    <select
                      value={data.direction === 'reverse' ? 'reverse' : 'forward'}
                      onChange={(e) => commitData({ direction: e.target.value })}
                      className="w-full rounded-lg border border-border/80 bg-bg/60 px-2.5 py-2 text-[13px] text-text focus:border-purple/50 focus:outline-none"
                    >
                      <option value="forward">Forward</option>
                      <option value="reverse">Reverse</option>
                    </select>
                  </div>
                )}
              </div>
            </>
          )}
          {isPixel && (
            <div className="mt-2.5">
              <FieldLabel>Color (primary)</FieldLabel>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={String(data.color ?? '#FF6A00')}
                  onChange={(e) => commitData({ color: e.target.value })}
                  className="h-8 w-12 cursor-pointer rounded border border-border/80 bg-bg/60"
                  aria-label="Color"
                />
                <input
                  value={String(data.color ?? '#FF6A00')}
                  onChange={(e) => patchData({ color: e.target.value })}
                  onBlur={() => commit()}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  className="flex-1 rounded-lg border border-border/80 bg-bg/60 px-3 py-2 font-mono text-xs text-text focus:border-purple/50 focus:outline-none"
                />
              </div>
            </div>
          )}

          {isPixel && effectDef?.uses.color2 && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between">
                <FieldLabel>{effectDef?.uses.color2 ?? 'Secondary'}</FieldLabel>
                {typeof data.color2 === 'string' && (
                  <button
                    onClick={() => commitData({ color2: undefined })}
                    className="mb-1 text-[10px] text-muted hover:text-[#E8623D]"
                    title="Back to off/black"
                  >
                    off
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={String(data.color2 ?? '#000000')}
                  onChange={(e) => commitData({ color2: e.target.value })}
                  className="h-8 w-12 cursor-pointer rounded border border-border/80 bg-bg/60"
                  aria-label="Secondary color"
                />
                <span className="font-mono text-xs text-muted">
                  {typeof data.color2 === 'string' ? String(data.color2) : 'off (black)'}
                </span>
              </div>
            </div>
          )}
          {isPixel && (
            <div className="mt-3">
              <FieldLabel>Brightness</FieldLabel>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={255}
                  aria-label="Brightness"
                  value={Number(data.brightness ?? 255)}
                  onChange={(e) => patchData({ brightness: Number(e.target.value) })}
                  onPointerUp={() => commit()}
                  onKeyUp={() => commit()}
                  className="vox-range h-1.5 flex-1"
                />
                <span className="w-10 text-right font-mono text-xs text-text">
                  {Number(data.brightness ?? 255)}
                </span>
              </div>
            </div>
          )}

          {isPixel && (
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <NumberField
                label="Fade in (s)"
                value={((Number(data.fadeInMs ?? 0)) / 1000).toFixed(2)}
                onChange={(v) => patchData({ fadeInMs: Math.max(0, Math.round(parseFloat(v) * 1000) || 0) })}
                onCommit={() => commit()}
              />
              <NumberField
                label="Fade out (s)"
                value={((Number(data.fadeOutMs ?? 0)) / 1000).toFixed(2)}
                onChange={(v) => patchData({ fadeOutMs: Math.max(0, Math.round(parseFloat(v) * 1000) || 0) })}
                onCommit={() => commit()}
              />
            </div>
          )}

          {isEyes && (
            <div className="mt-3">
              <FieldLabel>Looking</FieldLabel>
              <div className="grid w-fit grid-cols-3 gap-1">
                {LOOK_GRID.map((g) => {
                  const active =
                    Number(data.lookX ?? 0) === g.x && Number(data.lookY ?? 0) === g.y;
                  return (
                    <button
                      key={`${g.x},${g.y}`}
                      onClick={() => commitData({ lookX: g.x, lookY: g.y })}
                      aria-label={`Look ${g.glyph}`}
                      className={`grid h-8 w-8 place-items-center rounded-md text-[13px] transition-colors ${
                        active
                          ? 'bg-purple/30 text-purple-l ring-1 ring-purple/50'
                          : 'bg-bg/60 text-muted ring-1 ring-inset ring-border/70 hover:text-text'
                      }`}
                    >
                      {g.glyph}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10px] text-muted">Where the eyes point during this clip</p>
            </div>
          )}

        </>
      )}

      {neck && (
        <>
          <SectionDivider>Neck Motion</SectionDivider>
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="Pan"
              value={neck.pan ?? 'fixed'}
              options={AXIS_MODES}
              onChange={(v) => commitData({ neck: { ...neck, pan: v } })}
            />
            <SelectField
              label="Tilt"
              value={neck.tilt ?? 'fixed'}
              options={AXIS_MODES}
              onChange={(v) => commitData({ neck: { ...neck, tilt: v } })}
            />
            <SelectField
              label="Roll"
              value={neck.roll ?? 'fixed'}
              options={AXIS_MODES}
              onChange={(v) => commitData({ neck: { ...neck, roll: v } })}
            />
            <SelectField
              label="Speed"
              value={neck.speed ?? 'talk'}
              options={SPEED_MODES}
              onChange={(v) => commitData({ neck: { ...neck, speed: v } })}
            />
          </div>
        </>
      )}

      {(() => {
        // What audio is actually on the skull's SD right now: the Master's live
        // typed inventory when available, else the flat list saved on the device.
        const sdAudio = liveInv?.audio ?? device?.inventory;
        if (!sdAudio) return null;
        const live = liveInv?.audio != null;
        return (
          <>
            <SectionDivider>SD Card · {device?.name ?? trackDevice?.name ?? 'Device'}</SectionDivider>
            <div className="mb-2.5 text-[11px] text-muted">
              {sdAudio.length} audio file{sdAudio.length === 1 ? '' : 's'}{' '}
              {live ? 'on the skull now' : 'on last scan'}
            </div>
            {sdAudio.length === 0 ? (
              <div className="rounded-md bg-bg/40 px-2 py-1.5 text-[11px] text-muted">
                No audio synced yet — Send to Master syncs this show’s audio.
              </div>
            ) : (
              <ul className="space-y-1">
                {sdAudio.map((file) => {
                  const active = file === data.filename;
                  return (
                    <li
                      key={file}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 font-mono text-xs ${
                        active ? 'bg-purple/10 text-text ring-1 ring-inset ring-purple/25' : 'text-muted'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-purple-l' : 'bg-muted/40'}`}
                      />
                      {file}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        );
      })()}
    </div>
  );
}

// --- DMX look editor ----------------------------------------------------------

/** Friendly labels for fixture channel roles ("PAN_TILT_SPEED" → "Movement speed"). */
const ROLE_LABELS: Record<string, string> = {
  PAN: 'Pan',
  TILT: 'Tilt',
  PAN_TILT_SPEED: 'Movement speed',
  DIMMER: 'Dimmer',
  SHUTTER: 'Shutter / strobe',
  FOCUS: 'Focus',
  ZOOM: 'Zoom',
  IRIS: 'Iris',
  PRISM: 'Prism',
  PRISM_ROTATION: 'Prism rotation',
  FROST: 'Frost',
  GOBO_ROTATION: 'Gobo rotation',
  CTO: 'Color temp',
  EFFECTS: 'Effects',
};

function roleLabel(role: string): string {
  return (
    ROLE_LABELS[role] ??
    role
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

/**
 * Program the fixture by look — named controls from its profile instead of
 * raw channel numbers. Wheel roles render their profile's named slots;
 * everything else is a 0–255 slider. Untouched controls stay out of the look
 * (the fixture keeps whatever its last cue set), matching how lighting desks
 * treat unset parameters.
 */
function LookEditor({
  profile,
  look,
  onEdit,
  onCommit,
}: {
  profile: FixtureProfile;
  look: FixtureLook;
  onEdit: (look: FixtureLook) => void;
  onCommit: (look: FixtureLook) => void;
}) {
  const wheelSlots = (role: string) =>
    role === 'COLOR_WHEEL' ? profile.color_wheel : role === 'GOBO_WHEEL' ? profile.gobo_wheel : undefined;

  return (
    <>
      <SectionDivider>
        {profile.manufacturer} {profile.name} · Look
      </SectionDivider>
      <div className="space-y-2.5">
        {profile.channels.map((ch) => {
          const slots = wheelSlots(ch.role);
          const set = look[ch.role] !== undefined;
          if (slots && slots.length > 0) {
            return (
              <div key={ch.role}>
                <FieldLabel>{ch.role === 'COLOR_WHEEL' ? 'Color' : 'Gobo'}</FieldLabel>
                <select
                  value={set ? String(look[ch.role]) : ''}
                  onChange={(e) => {
                    const next = { ...look };
                    if (e.target.value === '') delete next[ch.role];
                    else next[ch.role] = Number(e.target.value);
                    onCommit(next);
                  }}
                  className="w-full rounded-lg border border-border/80 bg-bg/60 px-2.5 py-2 text-[13px] text-text focus:border-purple/50 focus:outline-none"
                >
                  <option value="">(leave as-is)</option>
                  {slots.map((s) => (
                    <option key={`${s.value}-${s.name}`} value={s.value}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          }
          return (
            <div key={ch.role}>
              <div className="flex items-center justify-between">
                <FieldLabel>{roleLabel(ch.role)}</FieldLabel>
                {set && (
                  <button
                    onClick={() => {
                      const next = { ...look };
                      delete next[ch.role];
                      onCommit(next);
                    }}
                    className="mb-1 text-[10px] text-muted hover:text-[#E8623D]"
                    title="Remove from this look — the fixture keeps its previous value"
                  >
                    unset
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={255}
                  aria-label={roleLabel(ch.role)}
                  value={set ? Number(look[ch.role]) : (ch.default ?? 0)}
                  onChange={(e) => onEdit({ ...look, [ch.role]: Number(e.target.value) })}
                  onPointerUp={(e) =>
                    onCommit({ ...look, [ch.role]: Number((e.target as HTMLInputElement).value) })
                  }
                  onKeyUp={(e) =>
                    onCommit({ ...look, [ch.role]: Number((e.target as HTMLInputElement).value) })
                  }
                  className={`vox-range h-1.5 flex-1 ${set ? '' : 'opacity-40'}`}
                />
                <span className={`w-8 text-right font-mono text-[10px] ${set ? 'text-text' : 'text-muted/50'}`}>
                  {set ? Number(look[ch.role]) : '—'}
                </span>
              </div>
            </div>
          );
        })}
        {Object.keys(look).length > 0 && (
          <button
            onClick={() => onCommit({})}
            className="rounded-md border border-border bg-bg3/40 px-2 py-1 text-[11px] text-muted transition-colors hover:text-[#E8623D]"
          >
            Reset look
          </button>
        )}
      </div>
    </>
  );
}

/** A DMX level: an absolute channel (1..512) and its value (0..255). */
interface DmxLevel {
  channel: number;
  value: number;
}

/** Read a raw DMX clip's channels from `levels[]`, falling back to the legacy
 *  single `{channel,value}` shape so old clips migrate seamlessly on edit. */
function readDmxLevels(data: Record<string, unknown>): DmxLevel[] {
  if (Array.isArray(data.levels)) {
    return (data.levels as unknown[])
      .filter((l): l is DmxLevel => !!l && typeof l === 'object' && 'channel' in l)
      .map((l) => ({ channel: Number(l.channel) || 0, value: Number(l.value) || 0 }));
  }
  if (typeof data.channel === 'number') {
    return [{ channel: data.channel, value: typeof data.value === 'number' ? data.value : 0 }];
  }
  return [];
}

/**
 * The manual/raw DMX editor for a device with no fixture profile patched — set
 * any number of arbitrary channels to values in one clip (writes `levels[]`,
 * the same wire format the fixture look editor compiles to). This is the
 * "poke whatever gear I plugged in" path. Universe 0 = the Master's onboard
 * RS-485 port; 1+ addresses a VoxDMX remote (each remote owns its own universe).
 */
function DmxRawEditor({
  universe: universe0,
  fadeMs: fadeMs0,
  levels: levels0,
  onCommit,
}: {
  universe: number;
  fadeMs: number;
  levels: DmxLevel[];
  onCommit: (next: { universe: number; fadeMs: number; levels: DmxLevel[] }) => void;
}) {
  const [rows, setRows] = useState<DmxLevel[]>(levels0.length ? levels0 : [{ channel: 1, value: 255 }]);
  const [universe, setUniverse] = useState(universe0);
  const [fadeMs, setFadeMs] = useState(fadeMs0);

  /** Commit sanitized state: valid channels only, sorted by channel. */
  const commit = (nextRows: DmxLevel[], uni = universe, fade = fadeMs) => {
    const levels = nextRows
      .filter((r) => r.channel >= 1 && r.channel <= 512)
      .map((r) => ({ channel: r.channel, value: Math.max(0, Math.min(255, r.value | 0)) }))
      .sort((a, b) => a.channel - b.channel);
    onCommit({ universe: Math.max(0, uni | 0), fadeMs: Math.max(0, fade | 0), levels });
  };

  const setRow = (i: number, patch: Partial<DmxLevel>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    const used = new Set(rows.map((r) => r.channel));
    let next = 1;
    while (used.has(next) && next < 512) next++;
    const nextRows = [...rows, { channel: next, value: 255 }];
    setRows(nextRows);
    commit(nextRows);
  };
  const removeRow = (i: number) => {
    const nextRows = rows.filter((_, j) => j !== i);
    setRows(nextRows);
    commit(nextRows);
  };

  return (
    <>
      <SectionDivider>DMX · manual channels</SectionDivider>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Universe"
          value={String(universe)}
          onChange={(v) => setUniverse(Math.max(0, parseInt(v) || 0))}
          onCommit={() => commit(rows)}
        />
        <NumberField
          label="Fade (ms)"
          value={String(fadeMs)}
          onChange={(v) => setFadeMs(Math.max(0, parseInt(v) || 0))}
          onCommit={() => commit(rows)}
        />
      </div>

      <div className="mt-3 space-y-1.5">
        <FieldLabel>Channels</FieldLabel>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={512}
              aria-label="channel"
              value={String(r.channel)}
              onChange={(e) => setRow(i, { channel: clampInt(e.target.value, 1, 512) })}
              onBlur={() => commit(rows)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="w-16 rounded-lg border border-border/80 bg-bg/60 px-2.5 py-2 font-mono text-xs text-text focus:border-purple/50 focus:outline-none"
            />
            <span className="text-[11px] text-muted">→</span>
            <input
              type="number"
              min={0}
              max={255}
              aria-label="value"
              value={String(r.value)}
              onChange={(e) => setRow(i, { value: clampInt(e.target.value, 0, 255) })}
              onBlur={() => commit(rows)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="w-16 rounded-lg border border-border/80 bg-bg/60 px-2.5 py-2 font-mono text-xs text-text focus:border-purple/50 focus:outline-none"
            />
            <input
              type="range"
              min={0}
              max={255}
              aria-label="value slider"
              value={r.value}
              onChange={(e) => setRow(i, { value: Number(e.target.value) })}
              onPointerUp={() => commit(rows)}
              onKeyUp={() => commit(rows)}
              className="vox-range h-1.5 flex-1"
            />
            <button
              onClick={() => removeRow(i)}
              title="Remove channel"
              className="rounded-md border border-border bg-bg3/40 px-2 py-1.5 text-[11px] text-muted transition-colors hover:text-[#E8623D]"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={addRow}
          className="mt-1 rounded-md border border-border bg-bg3/40 px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:text-text"
        >
          + Add channel
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-muted">
        Universe <span className="text-text">0</span> is the Master&rsquo;s onboard DMX port;{' '}
        <span className="text-text">1+</span> addresses a VoxDMX remote (each remote is its own universe).
      </p>
    </>
  );
}

// --- field primitives -------------------------------------------------------

function TextField({
  label,
  value,
  mono,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <div className="mt-2.5">
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className={`w-full rounded-lg border border-border/80 bg-bg/60 px-3 py-2 text-[13px] text-text focus:border-purple/50 focus:outline-none ${
          mono ? 'font-mono text-xs' : ''
        }`}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="w-full rounded-lg border border-border/80 bg-bg/60 px-3 py-2 font-mono text-xs text-text focus:border-purple/50 focus:outline-none"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border/80 bg-bg/60 px-2.5 py-2 text-[13px] capitalize text-text focus:border-purple/50 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[11px] font-medium text-muted">{children}</div>;
}

function ParamSlider({
  label,
  min,
  max,
  value,
  onEdit,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onEdit: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          aria-label={label}
          value={value}
          onChange={(e) => onEdit(Number(e.target.value))}
          onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
          className="vox-range h-1.5 flex-1"
        />
        <span className="w-8 text-right font-mono text-[10px] text-text">{value}</span>
      </div>
    </div>
  );
}

function SectionDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-6 flex items-center gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80">
        {children}
      </span>
      <span className="h-px flex-1 bg-border/70" />
    </div>
  );
}

/**
 * "Test cue" for a plugin clip — fire the clip's action right now so the user
 * can confirm it works without playing the whole show. Prefers the baked action
 * (compileClip) so it reports the device's HTTP status; falls back to onFrame.
 */
function PluginTestButton({ plugin, clip }: { plugin: VoxPlugin; clip: VoxClip }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  if (!plugin.compileClip && !plugin.onFrame) return null;

  const fire = async () => {
    setBusy(true);
    setStatus('firing…');
    try {
      const config = getPluginConfig(plugin.id);
      const api = getPluginApi(plugin);
      if (plugin.compileClip) {
        const action = plugin.compileClip(clip, config);
        if (!action) {
          setStatus('nothing to fire yet — finish setting up the cue');
          setBusy(false);
          return;
        }
        const res = await api.sendHTTP(action.url, {
          method: action.method,
          headers: action.headers,
          body: action.body,
        });
        setStatus(res.ok ? 'sent ✓' : `device returned HTTP ${res.status}`);
      } else {
        plugin.onFrame!(0, clip, api);
        setStatus('sent ✓');
      }
    } catch {
      setStatus('couldn’t reach the device — is the Master online?');
    }
    setBusy(false);
  };

  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      <button
        onClick={fire}
        disabled={busy}
        className="rounded-md border border-purple/50 bg-purple/15 px-3 py-1.5 text-[12px] font-medium text-purple-l transition-colors hover:bg-purple/25 disabled:opacity-40"
      >
        {busy ? 'Testing…' : 'Test cue'}
      </button>
      {status && <span className="text-[11px] text-muted">{status}</span>}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
        on ? 'bg-gradient-to-r from-purple to-purple-l' : 'bg-bg3 ring-1 ring-inset ring-border'
      }`}
      role="switch"
      aria-checked={on}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-200 ${
          on ? 'left-[1.375rem]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function clampInt(v: string, lo: number, hi: number): number {
  const n = parseInt(v) || 0;
  return Math.max(lo, Math.min(hi, n));
}
