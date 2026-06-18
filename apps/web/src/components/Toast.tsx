import { useEffect } from 'react';

export interface ToastMessage {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const tone =
    toast.kind === 'success'
      ? 'border-teal/40 text-teal-l'
      : toast.kind === 'error'
        ? 'border-[#E8623D]/50 text-[#E8623D]'
        : 'border-purple/40 text-purple-l';

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      <div
        className={`vox-toast pointer-events-auto flex items-center gap-2.5 rounded-xl border bg-bg2/95 px-4 py-2.5 text-[13px] font-medium shadow-2xl backdrop-blur ${tone}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {toast.text}
      </div>
    </div>
  );
}
