import type { VoxClip, VoxShow } from '@voxcomposer/shared';
import { useEffect, useState } from 'react';
import { pluginRegistry } from '../plugins/registry.js';
import { trackColor } from '../styles/palette.js';

/** Neck-motion presets the skull board understands per axis / for speed. */
const AXIS_MODES = ['fixed', 'wander', 'track', 'sweep', 'nod'];
const SPEED_MODES = ['slow', 'talk', 'talk+', 'fast'];

interface ClipInspectorProps {
  clip: VoxClip | null;
  show: VoxShow;
  /** Commit an edited clip to the undo stack. */
  onChange: (next: VoxClip) => void;
  /** How many clips are selected (the inspector edits the primary one). */
  selectionCount?: number;
}

export function ClipInspector({ clip, show, onChange, selectionCount = 0 }: ClipInspectorProps) {
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
          <ClipFields key={clip.id} clip={clip} show={show} onChange={onChange} />
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
}: {
  clip: VoxClip;
  show: VoxShow;
  onChange: (next: VoxClip) => void;
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
  const plugin = pluginRegistry.forTrackType(draft.type);
  const neck = data.neck as Record<string, string> | undefined;
  const deviceId = typeof data.deviceId === 'string' ? data.deviceId : undefined;
  const device = show.devices.find((d) => d.id === deviceId);

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

      <div className="mt-2.5">
        <FieldLabel>Device</FieldLabel>
        <select
          value={deviceId ?? ''}
          onChange={(e) => commitData({ deviceId: e.target.value })}
          className="w-full rounded-lg border border-border/80 bg-bg/60 px-3 py-2 text-[13px] text-text focus:border-purple/50 focus:outline-none"
        >
          {show.devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {plugin?.renderInspector && (
        <>
          <SectionDivider>{plugin.name}</SectionDivider>
          {plugin.renderInspector(draft, { onChange: (d) => commitData(d) })}
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

      {isDmx && (
        <>
          <SectionDivider>DMX</SectionDivider>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Universe"
              value={String(data.universe ?? 0)}
              onChange={(v) => patchData({ universe: parseInt(v) || 0 })}
              onCommit={() => commit()}
            />
            <NumberField
              label="Channel"
              value={String(data.channel ?? 1)}
              onChange={(v) => patchData({ channel: clampInt(v, 1, 512) })}
              onCommit={() => commit()}
            />
            <NumberField
              label="Value (0–255)"
              value={String(data.value ?? 0)}
              onChange={(v) => patchData({ value: clampInt(v, 0, 255) })}
              onCommit={() => commit()}
            />
            <NumberField
              label="Fade (ms)"
              value={String(data.fadeMs ?? 0)}
              onChange={(v) => patchData({ fadeMs: Math.max(0, parseInt(v) || 0) })}
              onCommit={() => commit()}
            />
          </div>
        </>
      )}

      {isRelay && (
        <>
          <SectionDivider>Relay</SectionDivider>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Channel"
              value={String(data.channel ?? 0)}
              onChange={(v) => patchData({ channel: Math.max(0, parseInt(v) || 0) })}
              onCommit={() => commit()}
            />
            <div>
              <FieldLabel>Action</FieldLabel>
              <select
                value={String(data.action ?? 'pulse')}
                onChange={(e) => commitData({ action: e.target.value })}
                className="w-full rounded-lg border border-border/80 bg-bg/60 px-2.5 py-2 text-[13px] text-text focus:border-purple/50 focus:outline-none"
              >
                <option value="on">On</option>
                <option value="off">Off</option>
                <option value="pulse">Pulse</option>
              </select>
            </div>
          </div>
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

      {device?.inventory && (
        <>
          <SectionDivider>SD Card · {device.name}</SectionDivider>
          <div className="mb-2.5 flex items-center justify-between text-[11px] text-muted">
            <span>{device.inventory.length} files</span>
            <span className="font-mono">2.1 / 32 MB</span>
          </div>
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-bg">
            <div className="h-full w-[7%] rounded-full bg-teal/70" />
          </div>
          <ul className="space-y-1">
            {device.inventory.map((file) => {
              const active = file === data.filename;
              return (
                <li
                  key={file}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 font-mono text-xs ${
                    active ? 'bg-purple/10 text-text ring-1 ring-inset ring-purple/25' : 'text-muted'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-purple-l' : 'bg-muted/40'}`} />
                  {file}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
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
