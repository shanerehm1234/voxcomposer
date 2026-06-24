import type { VoxDevice, VoxDeviceType } from '@voxcomposer/shared';
import { useState } from 'react';

interface AddDeviceModalProps {
  /** Existing device ids, to reject duplicates (and to support editing one in place). */
  existingIds: string[];
  /** When editing an existing device, its current values; omit to create new. */
  initial?: VoxDevice;
  onSave: (device: VoxDevice) => void;
  onClose: () => void;
  /** Present only when editing an existing device. */
  onRemove?: () => void;
}

const TYPE_OPTIONS: { value: VoxDeviceType; label: string }[] = [
  { value: 'skull', label: 'Skull (audio + jaw/neck)' },
  { value: 'pixel', label: 'VoxPixel (addressable LEDs)' },
  { value: 'dmx', label: 'DMX' },
  { value: 'relay', label: 'Relay' },
  { value: 'audio', label: 'Audio only' },
  { value: 'sense', label: 'Sensor' },
  { value: 'custom', label: 'Custom / plugin' },
];

const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

/**
 * Modal for adding (or editing) a VoxDevice. The id field doubles as the
 * remote's MAC address — that's the stable identity Vox-Link and the Master
 * use to address it, so it's validated as a MAC rather than a free label.
 */
export function AddDeviceModal({
  existingIds,
  initial,
  onSave,
  onClose,
  onRemove,
}: AddDeviceModalProps) {
  const [id, setId] = useState(initial?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<VoxDeviceType>(initial?.type ?? 'pixel');
  const [apiVersion, setApiVersion] = useState(initial?.apiVersion ?? '1.0.0');
  const [error, setError] = useState('');

  const isEdit = !!initial;

  const handleSave = () => {
    const trimmedId = id.trim().toUpperCase();
    const trimmedName = name.trim();
    if (!trimmedId) return setError('MAC address is required.');
    if (!MAC_RE.test(trimmedId)) return setError('Use MAC format, e.g. AA:BB:CC:00:11:22.');
    if (!trimmedName) return setError('Give the device a name.');
    if (!isEdit && existingIds.includes(trimmedId)) {
      return setError('A device with that MAC already exists.');
    }
    onSave({ id: trimmedId, name: trimmedName, type, apiVersion });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border/70 bg-bg2 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-device-title"
      >
        <h2 id="add-device-title" className="font-display text-[15px] font-semibold text-text">
          {isEdit ? 'Edit device' : 'Add device'}
        </h2>
        <p className="mt-0.5 text-[12px] text-muted">
          Devices are addressed by their Vox-Link MAC — the Master routes clip data to it.
        </p>

        <div className="mt-4 space-y-3">
          <Field label="Name">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Porch VoxPixel"
              className="w-full rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 text-[13px] text-text placeholder:text-muted focus:border-purple/50 focus:outline-none"
            />
          </Field>
          <Field label="MAC address" desc="The remote's WiFi MAC — its Vox-Link identity.">
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={isEdit}
              placeholder="AA:BB:CC:00:11:22"
              className="w-full rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 font-mono text-[13px] text-text placeholder:text-muted focus:border-purple/50 focus:outline-none disabled:opacity-60"
            />
          </Field>
          <Field label="Type">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as VoxDeviceType)}
              className="w-full rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 text-[13px] text-text focus:border-purple/50 focus:outline-none"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vox-Link API version">
            <input
              value={apiVersion}
              onChange={(e) => setApiVersion(e.target.value)}
              placeholder="1.0.0"
              className="w-full rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 font-mono text-[13px] text-text placeholder:text-muted focus:border-purple/50 focus:outline-none"
            />
          </Field>
        </div>

        {error && <p className="mt-3 text-[12px] text-[#E8623D]">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          {onRemove ? (
            <button
              onClick={onRemove}
              className="rounded-lg border border-[#E8623D]/40 bg-[#E8623D]/10 px-3 py-1.5 text-[12px] font-medium text-[#E8623D] hover:bg-[#E8623D]/20"
            >
              Remove
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border bg-bg3/40 px-3.5 py-1.5 text-[13px] text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg bg-gradient-to-b from-purple to-purple-d px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-[0_2px_12px_rgba(83,74,183,0.4)] transition-all hover:brightness-110"
            >
              {isEdit ? 'Save' : 'Add device'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium text-text">{label}</span>
      {desc && <span className="mt-0.5 block text-[11px] text-muted">{desc}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
