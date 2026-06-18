import { useMemo, useState } from 'react';
import type { MediaItem, MediaKind } from '../demo/demoData.js';
import { PALETTE } from '../styles/palette.js';
import { GhostButton, PrimaryButton, ViewHeader } from './DevicesView.js';
import { IconCheck, IconPlay, IconSearch, IconUpload } from './icons.js';
import { WaveformThumb } from './WaveformThumb.js';

const KIND_COLOR: Record<MediaKind, string> = {
  voice: '#E8623D',
  ambient: PALETTE.purpleL,
  sfx: PALETTE.teal,
};

const KIND_LABEL: Record<MediaKind, string> = {
  voice: 'Voice',
  ambient: 'Ambient',
  sfx: 'SFX',
};

type Filter = 'all' | MediaKind;

export function MediaView({ media }: { media: MediaItem[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () =>
      media.filter(
        (m) =>
          (filter === 'all' || m.kind === filter) &&
          m.filename.toLowerCase().includes(query.toLowerCase()),
      ),
    [media, filter, query],
  );

  const totalKb = media.reduce((sum, m) => sum + m.sizeKb, 0);

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        title="Media Library"
        subtitle={`${media.length} clips · ${(totalKb / 1024).toFixed(1)} MB · stored locally`}
        actions={
          <>
            <GhostButton icon={<IconCheck className="h-4 w-4" />}>Sync to remotes</GhostButton>
            <PrimaryButton icon={<IconUpload className="h-4 w-4" />}>Import audio</PrimaryButton>
          </>
        }
      />

      <div className="flex items-center gap-3 border-b border-border/60 bg-bg2/20 px-5 py-2.5">
        <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-bg/40 p-1">
          {(['all', 'voice', 'ambient', 'sfx'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium capitalize transition-colors ${
                filter === f ? 'bg-bg3 text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'text-muted hover:text-text'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-64">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clips…"
            className="w-full rounded-lg border border-border/70 bg-bg/50 py-1.5 pl-8 pr-3 text-[13px] text-text placeholder:text-muted focus:border-purple/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {filtered.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted">No clips match.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((m) => (
              <MediaCard key={m.id} item={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaCard({ item }: { item: MediaItem }) {
  const color = KIND_COLOR[item.kind];
  return (
    <div className="group overflow-hidden rounded-xl border border-border/70 bg-bg2/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-purple/40 hover:bg-bg2">
      <div className="relative h-16 border-b border-border/50 bg-bg/40 px-3 pt-2">
        <WaveformThumb seedKey={item.filename} color={color} height={48} />
        <button className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-bg2/80 text-purple-l opacity-0 ring-1 ring-border backdrop-blur transition-opacity group-hover:opacity-100 hover:bg-bg3">
          <IconPlay className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{ color, backgroundColor: `${color}1f` }}
          >
            {KIND_LABEL[item.kind]}
          </span>
          <FormatBadge format={item.format} />
          <span className="ml-auto font-mono text-[11px] text-muted">
            {(item.durationMs / 1000).toFixed(1)}s
          </span>
        </div>
        <h3 className="mt-1.5 truncate font-mono text-[13px] text-text" title={item.filename}>
          {item.filename}
        </h3>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
          <span>{item.sizeKb} KB</span>
          {item.syncedDeviceIds.length > 0 ? (
            <span className="flex items-center gap-1 text-teal-l">
              <IconCheck className="h-3 w-3" />
              Synced to {item.syncedDeviceIds.length}
            </span>
          ) : item.format !== 'wav' ? (
            <span className="text-muted/70" title="Will transcode to WAV when synced to a WAV-only device">
              → WAV on sync
            </span>
          ) : (
            <span className="text-muted/70">Not synced</span>
          )}
        </div>
      </div>
    </div>
  );
}

const FORMAT_COLOR: Record<string, string> = {
  wav: '#5DCAA5',
  mp3: '#E0A92B',
  ogg: '#AFA9EC',
  m4a: '#7AA2F7',
};

function FormatBadge({ format }: { format: string }) {
  const color = FORMAT_COLOR[format] ?? '#718096';
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
      style={{ color, backgroundColor: `${color}1f` }}
      title={format === 'wav' ? 'Ready for WAV-only devices' : `${format.toUpperCase()} — transcodes to WAV at sync`}
    >
      {format}
    </span>
  );
}
