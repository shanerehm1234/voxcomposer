import { useMemo, useRef, useState } from 'react';
import { AUDIO_ACCEPT } from '../audio/format.js';
import {
  deleteMedia,
  importMediaFiles,
  MEDIA_DRAG_TYPE,
  togglePreview,
  useMediaLibrary,
  usePreviewingId,
  type MediaFile,
} from '../media/library.js';
import { PrimaryButton, ViewHeader } from './DevicesView.js';
import { IconMusic, IconPause, IconPlay, IconSearch, IconUpload } from './icons.js';
import { WaveformThumb } from './WaveformThumb.js';

const FORMAT_COLOR: Record<string, string> = {
  wav: '#5DCAA5',
  mp3: '#E0A92B',
  ogg: '#AFA9EC',
  m4a: '#7AA2F7',
};

type Filter = 'all' | 'wav' | 'mp3' | 'ogg' | 'm4a';

export function MediaView({
  onNotify,
}: {
  onNotify: (text: string, kind?: 'info' | 'success' | 'error') => void;
}) {
  const media = useMediaLibrary();
  const previewingId = usePreviewingId();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () =>
      media.filter(
        (m) =>
          (filter === 'all' || m.format === filter) &&
          m.filename.toLowerCase().includes(query.toLowerCase()),
      ),
    [media, filter, query],
  );

  const totalBytes = media.reduce((sum, m) => sum + m.sizeBytes, 0);

  const runImport = async (files: File[]) => {
    if (files.length === 0) return;
    const r = await importMediaFiles(files);
    if (r.added.length > 0) {
      onNotify(
        `Imported ${r.added.length} file${r.added.length === 1 ? '' : 's'}`,
        'success',
      );
    }
    if (r.duplicates.length > 0) onNotify(`Already in the library: ${r.duplicates.join(', ')}`, 'info');
    if (r.failed.length > 0) onNotify(`Couldn't read: ${r.failed.join(', ')}`, 'error');
  };

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
          setDropActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDropActive(false);
        void runImport(Array.from(e.dataTransfer.files));
      }}
    >
      <ViewHeader
        title="Media Library"
        subtitle={
          media.length === 0
            ? 'Audio you import lives here — stored on this device, never uploaded'
            : `${media.length} file${media.length === 1 ? '' : 's'} · ${(totalBytes / (1024 * 1024)).toFixed(1)} MB · stored locally`
        }
        actions={
          <PrimaryButton
            icon={<IconUpload className="h-4 w-4" />}
            onClick={() => fileRef.current?.click()}
          >
            Import audio
          </PrimaryButton>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          void runImport(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      <div className="flex items-center gap-3 border-b border-border/60 bg-bg2/20 px-5 py-2.5">
        <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-bg/40 p-1">
          {(['all', 'wav', 'mp3', 'ogg', 'm4a'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium uppercase transition-colors ${
                filter === f
                  ? 'bg-bg3 text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                  : 'text-muted hover:text-text'
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
            placeholder="Search files…"
            className="w-full rounded-lg border border-border/70 bg-bg/50 py-1.5 pl-8 pr-3 text-[13px] text-text placeholder:text-muted focus:border-purple/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {media.length === 0 ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="grid h-full w-full place-items-center rounded-2xl border-2 border-dashed border-border/60 text-muted transition-colors hover:border-purple/50 hover:text-purple-l"
          >
            <span className="flex flex-col items-center gap-3">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-border bg-bg2/60">
                <IconMusic className="h-6 w-6" />
              </span>
              <span className="text-sm font-medium">Drop audio here, or click to browse</span>
              <span className="text-[11px]">WAV and MP3 (also OGG/M4A) · converts to WAV for devices at sync</span>
            </span>
          </button>
        ) : filtered.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted">No files match.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((m) => (
              <MediaCard
                key={m.id}
                item={m}
                previewing={previewingId === m.id}
                onPreview={() => togglePreview(m.id)}
                onDelete={() => {
                  void deleteMedia(m.id);
                  onNotify(`Removed “${m.filename}” from the library`, 'info');
                }}
              />
            ))}
          </div>
        )}
      </div>

      {dropActive && (
        <div className="pointer-events-none absolute inset-0 z-10 m-3 flex items-center justify-center rounded-xl border-2 border-dashed border-purple-l/70 bg-purple/10 backdrop-blur-[1px]">
          <div className="flex items-center gap-2.5 rounded-xl border border-purple-l/40 bg-bg2/90 px-4 py-2.5 text-sm font-medium text-purple-l shadow-2xl">
            <IconMusic className="h-4 w-4" />
            Drop to add to the library
          </div>
        </div>
      )}
    </div>
  );
}

function MediaCard({
  item,
  previewing,
  onPreview,
  onDelete,
}: {
  item: MediaFile;
  previewing: boolean;
  onPreview: () => void;
  onDelete: () => void;
}) {
  const color = FORMAT_COLOR[item.format] ?? '#718096';
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(MEDIA_DRAG_TYPE, item.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title="Drag onto the timeline to place this audio"
      className="group cursor-grab overflow-hidden rounded-xl border border-border/70 bg-bg2/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-purple/40 hover:bg-bg2 active:cursor-grabbing"
    >
      <div className="relative h-16 border-b border-border/50 bg-bg/40 px-3 pt-2">
        <WaveformThumb peaks={item.peaks} color={color} height={48} />
        <button
          onClick={onPreview}
          aria-label={previewing ? 'Stop preview' : 'Preview'}
          className={`absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full ring-1 ring-border backdrop-blur transition-opacity hover:bg-bg3 ${
            previewing ? 'bg-purple/30 text-purple-l opacity-100' : 'bg-bg2/80 text-purple-l opacity-0 group-hover:opacity-100'
          }`}
        >
          {previewing ? <IconPause className="h-3.5 w-3.5" /> : <IconPlay className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <FormatBadge format={item.format} />
          <span className="ml-auto font-mono text-[11px] text-muted">
            {(item.durationMs / 1000).toFixed(1)}s
          </span>
        </div>
        <h3 className="mt-1.5 truncate font-mono text-[13px] text-text" title={item.filename}>
          {item.filename}
        </h3>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
          <span>{(item.sizeBytes / 1024).toFixed(0)} KB</span>
          <button
            onClick={onDelete}
            className="rounded px-1.5 py-0.5 text-muted/70 opacity-0 transition-opacity hover:bg-[#E8623D]/10 hover:text-[#E8623D] group-hover:opacity-100"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

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
