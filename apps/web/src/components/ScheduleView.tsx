import { useCallback, useEffect, useState } from 'react';
import {
  clearScheduleOnMaster,
  emptySchedule,
  getScheduleFromMaster,
  listMasterShows,
  sendScheduleToMaster,
  setScheduleOverride,
  type LibraryShow,
  type ScheduleDay,
  type ScheduleEntry,
  type SchedulePlaylist,
  type VoxSchedule,
} from '../voxlink/master.js';
import { IconCheck, IconPlus, IconRefresh } from './icons.js';
import { ViewHeader } from './DevicesView.js';

// Authoring UI for vox_schedule (playlists + day/time schedule entries) on
// the Vox Master — see VOXMASTER's docs/SCHEDULER.md. The Master itself has
// no editor for this; it only exposes GET/POST/DELETE /schedule + the
// /schedule/override toggle. This view is the only place these get authored.

const DAYS: { id: ScheduleDay; label: string }[] = [
  { id: 'sun', label: 'Sun' },
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
];

function secToHHMM(sec: number): string {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hhmmToSec(hhmm: string): number {
  const parts = hhmm.split(':').map((n) => Number(n) || 0);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60;
}

function newId(): string {
  return `entry-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

interface ScheduleViewProps {
  onNotify: (text: string, kind?: 'info' | 'success' | 'error') => void;
}

export function ScheduleView({ onNotify }: ScheduleViewProps) {
  const [schedule, setSchedule] = useState<VoxSchedule>(emptySchedule());
  const [shows, setShows] = useState<LibraryShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overrideOn, setOverrideOn] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const [sched, lib] = await Promise.all([getScheduleFromMaster(), listMasterShows()]);
    setSchedule(sched);
    setShows(lib);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const push = useCallback(
    async (next: VoxSchedule) => {
      setSchedule(next);
      setSaving(true);
      const result = await sendScheduleToMaster(next);
      setSaving(false);
      if (!result.ok) onNotify(result.error ?? 'Failed to push schedule to Master', 'error');
    },
    [onNotify],
  );

  const addPlaylist = useCallback(() => {
    const name = `Playlist ${schedule.playlists.length + 1}`;
    void push({ ...schedule, playlists: [...schedule.playlists, { name, showSlugs: [], loop: true }] });
  }, [schedule, push]);

  const updatePlaylist = useCallback(
    (index: number, patch: Partial<SchedulePlaylist>) => {
      const playlists = schedule.playlists.map((p, i) => (i === index ? { ...p, ...patch } : p));
      void push({ ...schedule, playlists });
    },
    [schedule, push],
  );

  const removePlaylist = useCallback(
    (index: number) => {
      const removed = schedule.playlists[index];
      const playlists = schedule.playlists.filter((_, i) => i !== index);
      const entries = schedule.entries.filter((e) => e.playlist !== removed?.name);
      void push({ ...schedule, playlists, entries });
    },
    [schedule, push],
  );

  const addEntry = useCallback(() => {
    if (schedule.playlists.length === 0) {
      onNotify('Add a playlist first', 'error');
      return;
    }
    const entry: ScheduleEntry = {
      id: newId(),
      label: `Schedule ${schedule.entries.length + 1}`,
      playlist: schedule.playlists[0]?.name ?? '',
      days: ['fri', 'sat', 'sun'],
      startSec: hhmmToSec('18:00'),
      endSec: hhmmToSec('23:00'),
      enabled: true,
    };
    void push({ ...schedule, entries: [...schedule.entries, entry] });
  }, [schedule, push, onNotify]);

  const updateEntry = useCallback(
    (id: string, patch: Partial<ScheduleEntry>) => {
      const entries = schedule.entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
      void push({ ...schedule, entries });
    },
    [schedule, push],
  );

  const removeEntry = useCallback(
    (id: string) => {
      void push({ ...schedule, entries: schedule.entries.filter((e) => e.id !== id) });
    },
    [schedule, push],
  );

  const toggleDay = useCallback(
    (entry: ScheduleEntry, day: ScheduleDay) => {
      const days = entry.days.includes(day) ? entry.days.filter((d) => d !== day) : [...entry.days, day];
      updateEntry(entry.id, { days });
    },
    [updateEntry],
  );

  const handleOverride = useCallback(
    async (on: boolean) => {
      const ok = await setScheduleOverride(on);
      if (ok) {
        setOverrideOn(on);
        onNotify(on ? 'Schedule paused — manual control' : 'Schedule resumed', 'info');
      } else {
        onNotify('Could not reach the Master', 'error');
      }
    },
    [onNotify],
  );

  const handleClear = useCallback(async () => {
    if (!confirm('Clear the entire schedule on the Master?')) return;
    const ok = await clearScheduleOnMaster();
    if (ok) {
      setSchedule(emptySchedule());
      onNotify('Schedule cleared', 'info');
    } else {
      onNotify('Could not reach the Master', 'error');
    }
  }, [onNotify]);

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        title="Schedule"
        subtitle="Playlists + day/time rules — what plays when, without you pressing play"
        actions={
          <>
            <button
              onClick={() => void reload()}
              title="Reload from the Master"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/80 bg-bg3/40 text-muted transition-colors hover:text-text"
            >
              <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => void handleOverride(!overrideOn)}
              title="Pause the resolver for manual play, or resume normal scheduling"
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                overrideOn
                  ? 'bg-[#E8623D]/15 text-[#E8623D] ring-1 ring-inset ring-[#E8623D]/30'
                  : 'border border-border/80 bg-bg3/40 text-muted hover:text-text'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${overrideOn ? 'bg-[#E8623D]' : 'bg-teal'}`} />
              {overrideOn ? 'Schedule paused' : 'Schedule active'}
            </button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 p-6">
          {saving && <div className="text-[11px] text-muted">Saving to Master…</div>}

          <Section
            title="Playlists"
            desc="An ordered list of library shows. v1 plays only the first show in the list (looped if you turn that on) — true multi-show sequencing is a future enhancement."
            action={
              <button
                onClick={addPlaylist}
                className="flex items-center gap-1.5 rounded-lg border border-purple/40 bg-purple/10 px-2.5 py-1.5 text-[12px] font-medium text-purple-l transition-colors hover:bg-purple/20"
              >
                <IconPlus className="h-3.5 w-3.5" />
                Add playlist
              </button>
            }
          >
            {schedule.playlists.length === 0 && (
              <p className="px-3 py-4 text-center text-[12px] text-muted">No playlists yet.</p>
            )}
            <div className="space-y-2 p-2">
              {schedule.playlists.map((pl, i) => (
                <PlaylistRow
                  key={i}
                  playlist={pl}
                  shows={shows}
                  onChange={(patch) => updatePlaylist(i, patch)}
                  onRemove={() => removePlaylist(i)}
                />
              ))}
            </div>
          </Section>

          <Section
            title="Schedule entries"
            desc="Which playlist plays on which days, in which time window. First match wins if windows overlap."
            action={
              <button
                onClick={addEntry}
                className="flex items-center gap-1.5 rounded-lg border border-purple/40 bg-purple/10 px-2.5 py-1.5 text-[12px] font-medium text-purple-l transition-colors hover:bg-purple/20"
              >
                <IconPlus className="h-3.5 w-3.5" />
                Add entry
              </button>
            }
          >
            {schedule.entries.length === 0 && (
              <p className="px-3 py-4 text-center text-[12px] text-muted">No schedule entries yet.</p>
            )}
            <div className="space-y-2 p-2">
              {schedule.entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  playlists={schedule.playlists}
                  onChange={(patch) => updateEntry(entry.id, patch)}
                  onToggleDay={(day) => toggleDay(entry, day)}
                  onRemove={() => removeEntry(entry.id)}
                />
              ))}
            </div>
          </Section>

          <div className="flex justify-end">
            <button
              onClick={() => void handleClear()}
              className="rounded-lg border border-[#E8623D]/40 bg-[#E8623D]/10 px-3 py-1.5 text-[13px] font-medium text-[#E8623D] transition-colors hover:bg-[#E8623D]/20"
            >
              Clear schedule on Master
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-bg2/50">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-3.5">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-text">{title}</h3>
          {desc && <p className="mt-0.5 text-[12px] text-muted">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function PlaylistRow({
  playlist,
  shows,
  onChange,
  onRemove,
}: {
  playlist: SchedulePlaylist;
  shows: LibraryShow[];
  onChange: (patch: Partial<SchedulePlaylist>) => void;
  onRemove: () => void;
}) {
  const primarySlug = playlist.showSlugs[0] ?? '';
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-bg/30 px-3 py-2.5">
      <input
        value={playlist.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="w-40 rounded-lg border border-border/70 bg-bg/50 px-2.5 py-1.5 text-[13px] text-text focus:border-purple/50 focus:outline-none"
      />
      <select
        value={primarySlug}
        onChange={(e) => onChange({ showSlugs: e.target.value ? [e.target.value] : [] })}
        className="flex-1 rounded-lg border border-border/70 bg-bg/50 px-2.5 py-1.5 text-[13px] text-text focus:border-purple/50 focus:outline-none"
      >
        <option value="">Select a show…</option>
        {shows.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.name}
          </option>
        ))}
        {primarySlug && !shows.some((s) => s.slug === primarySlug) && (
          <option value={primarySlug}>{primarySlug} (not on Master)</option>
        )}
      </select>
      <label className="flex items-center gap-1.5 text-[12px] text-muted">
        <input
          type="checkbox"
          checked={playlist.loop}
          onChange={(e) => onChange({ loop: e.target.checked })}
          className="h-3.5 w-3.5 accent-purple"
        />
        Loop
      </label>
      <button onClick={onRemove} className="text-[12px] text-muted hover:text-[#E8623D]">
        Remove
      </button>
    </div>
  );
}

function EntryRow({
  entry,
  playlists,
  onChange,
  onToggleDay,
  onRemove,
}: {
  entry: ScheduleEntry;
  playlists: SchedulePlaylist[];
  onChange: (patch: Partial<ScheduleEntry>) => void;
  onToggleDay: (day: ScheduleDay) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2.5 rounded-lg border border-border/60 bg-bg/30 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => onChange({ enabled: !entry.enabled })}
          title={entry.enabled ? 'Enabled' : 'Disabled'}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
            entry.enabled ? 'bg-gradient-to-r from-purple to-purple-l' : 'bg-bg3 ring-1 ring-inset ring-border'
          }`}
          role="switch"
          aria-checked={entry.enabled}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-md transition-all duration-200 ${
              entry.enabled ? 'left-[1.125rem]' : 'left-0.5'
            }`}
          />
        </button>
        <input
          value={entry.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="w-40 rounded-lg border border-border/70 bg-bg/50 px-2.5 py-1.5 text-[13px] text-text focus:border-purple/50 focus:outline-none"
        />
        <select
          value={entry.playlist}
          onChange={(e) => onChange({ playlist: e.target.value })}
          className="flex-1 rounded-lg border border-border/70 bg-bg/50 px-2.5 py-1.5 text-[13px] text-text focus:border-purple/50 focus:outline-none"
        >
          {playlists.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={secToHHMM(entry.startSec)}
          onChange={(e) => onChange({ startSec: hhmmToSec(e.target.value) })}
          className="rounded-lg border border-border/70 bg-bg/50 px-2.5 py-1.5 text-[13px] text-text focus:border-purple/50 focus:outline-none"
        />
        <span className="text-[12px] text-muted">to</span>
        <input
          type="time"
          value={secToHHMM(entry.endSec)}
          onChange={(e) => onChange({ endSec: hhmmToSec(e.target.value) })}
          className="rounded-lg border border-border/70 bg-bg/50 px-2.5 py-1.5 text-[13px] text-text focus:border-purple/50 focus:outline-none"
        />
        <button onClick={onRemove} className="text-[12px] text-muted hover:text-[#E8623D]">
          Remove
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        {DAYS.map((d) => {
          const active = entry.days.includes(d.id);
          return (
            <button
              key={d.id}
              onClick={() => onToggleDay(d.id)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                active ? 'bg-purple/20 text-purple-l ring-1 ring-inset ring-purple/40' : 'bg-bg3/50 text-muted hover:text-text'
              }`}
            >
              {active && <IconCheck className="mr-1 inline h-2.5 w-2.5" />}
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
