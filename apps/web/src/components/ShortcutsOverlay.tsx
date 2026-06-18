import { useEffect } from 'react';

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Transport',
    items: [
      ['Space', 'Play / pause'],
      ['K', 'Stop (return to start)'],
      ['← / →', 'Step 100 ms (⇧ = 1 s)'],
      ['I / O', 'Set loop in / out'],
      ['L', 'Toggle loop playback'],
    ],
  },
  {
    title: 'Selection',
    items: [
      ['Click', 'Select a clip'],
      ['⇧ / ⌘-click', 'Add / remove from selection'],
      ['Drag empty', 'Rubber-band select'],
      ['⌘A', 'Select all clips on track'],
    ],
  },
  {
    title: 'Editing',
    items: [
      ['⌘Z / ⌘⇧Z', 'Undo / redo'],
      ['⌘D', 'Duplicate selection'],
      ['⌘C / ⌘V', 'Copy / paste'],
      ['⌫ / Del', 'Delete selection'],
      ['Alt-drag clip', 'Move without snapping'],
    ],
  },
  {
    title: 'View & file',
    items: [
      ['Ctrl + wheel', 'Zoom to cursor'],
      ['+ / −', 'Zoom in / out'],
      ['⌘⇧F', 'Fit show to window'],
      ['Alt-drag', 'Pan the timeline'],
      ['⌘S / ⌘E', 'Export .vox'],
    ],
  },
];

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="vox-toast w-full max-w-2xl overflow-hidden rounded-2xl border border-border/80 bg-bg2/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5">
          <h2 className="font-display text-[15px] font-semibold text-text">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-muted transition-colors hover:text-text"
          >
            Esc ✕
          </button>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 p-5 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80">
                {group.title}
              </h3>
              <dl className="space-y-1.5">
                {group.items.map(([keys, desc]) => (
                  <div key={keys} className="flex items-center justify-between gap-4">
                    <dd className="text-[13px] text-text/90">{desc}</dd>
                    <dt>
                      <kbd className="rounded border border-border/80 bg-bg/60 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                        {keys}
                      </kbd>
                    </dt>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
