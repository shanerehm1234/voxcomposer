import type { VoxDevice, VoxDeviceType } from '@voxcomposer/shared';
import { useState } from 'react';
import type { DiscoveredDevice } from '../voxlink/client.js';

interface AddDeviceModalProps {
  /** Existing device ids, to reject duplicates (and to support editing one in place). */
  existingIds: string[];
  /** When editing an existing device, its current values; omit to create new. */
  initial?: VoxDevice;
  onSave: (device: VoxDevice) => void;
  onClose: () => void;
  /** Present only when editing an existing device. */
  onRemove?: () => void;
  /** Remotes seen on the most recent `device_scan`, not yet added — lets the
   * user pick a device instead of typing its MAC. Omit (or pass []) when
   * editing, or if no scan has run yet. */
  discovered?: DiscoveredDevice[];
  /** True while a scan is in flight (disables the rescan button, shows a hint). */
  scanning?: boolean;
  /** Re-run the scan, e.g. if the device hasn't shown up yet. */
  onRescan?: () => void;
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

/** A friendly default name for a freshly-discovered device, e.g. "VoxPixel F8:3C". */
function defaultNameFor(d: DiscoveredDevice): string {
  const suffix = d.deviceId.split(':').slice(-2).join(':');
  return d.ip ? `VoxPixel ${suffix}` : `Remote ${suffix}`;
}

/**
 * Modal for adding (or editing) a VoxDevice. The id field doubles as the
 * remote's MAC address — that's the stable identity Vox-Link and the Master
 * use to address it. New devices are normally picked from `discovered` (a
 * live device_scan) so nobody has to type a MAC by hand; manual entry is
 * still available as a fallback for a device that hasn't beaconed yet.
 */
export function AddDeviceModal({
  existingIds,
  initial,
  onSave,
  onClose,
  onRemove,
  discovered = [],
  scanning = false,
  onRescan,
}: AddDeviceModalProps) {
  const [id, setId] = useState(initial?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<VoxDeviceType>(initial?.type ?? 'pixel');
  const [apiVersion, setApiVersion] = useState(initial?.apiVersion ?? '1.0.0');
  const [error, setError] = useState('');
  const [manualEntry, setManualEntry] = useState(false);

  const isEdit = !!initial;
  const pickable = discovered.filter((d) => !existingIds.includes(d.deviceId));
  const macLocked = !isEdit && !!id && !manualEntry;

  const pick = (d: DiscoveredDevice) => {
    setId(d.deviceId);
    if (!name.trim()) setName(defaultNameFor(d));
    if (d.ip) setType('pixel');
    setError('');
  };

  const handleSave = () => {
    const trimmedId = id.trim().toUpperCase();
    const trimmedName = name.trim();
    if (!trimmedId) return setError('Pick a device, or enter a MAC manually.');
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
          {isEdit
            ? "Devices are addressed by their Vox-Link MAC — the Master routes clip data to it."
            : 'Pick a remote that broadcast itself on the network — no need to type its MAC.'}
        </p>

        {!isEdit && (
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-text">Nearby devices</span>
              {onRescan && (
                <button
                  onClick={onRescan}
                  disabled={scanning}
                  className="text-[11px] font-medium text-purple-l hover:text-purple disabled:opacity-50"
                >
                  {scanning ? 'Scanning…' : 'Rescan'}
                </button>
              )}
            </div>
            <div className="mt-1.5 max-h-36 space-y-1 overflow-y-auto">
              {pickable.length === 0 && (
                <p className="rounded-lg border border-dashed border-border/60 px-2.5 py-2 text-[12px] text-muted">
                  {scanning ? 'Listening for Vox-Link beacons…' : "No new devices seen yet — power it on, then Rescan."}
                </p>
              )}
              {pickable.map((d) => (
                <button
                  key={d.deviceId}
                  onClick={() => pick(d)}
                  className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                    id === d.deviceId
                      ? 'border-purple/60 bg-purple/10 text-text'
                      : 'border-border/70 bg-bg/40 text-text/90 hover:border-purple/40'
                  }`}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{d.ip ? 'VoxPixel Remote' : 'Vox-Link remote'}</span>
                    <span className="font-mono text-[10px] text-muted">
                      {d.deviceId}
                      {d.ip ? ` · ${d.ip}` : ''}
                    </span>
                  </span>
                  <span className="font-mono text-[10px] text-muted">{d.rssi} dBm</span>
                </button>
              ))}
            </div>
            {!manualEntry && (
              <button
                onClick={() => {
                  setManualEntry(true);
                  setId('');
                }}
                className="mt-1.5 text-[11px] text-muted hover:text-text"
              >
                Don't see it? Enter a MAC manually
              </button>
            )}
          </div>
        )}

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
          {(isEdit || manualEntry || (!id && pickable.length === 0 && !scanning)) && (
            <Field label="MAC address" desc="The remote's WiFi MAC — its Vox-Link identity.">
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                disabled={isEdit}
                placeholder="AA:BB:CC:00:11:22"
                className="w-full rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 font-mono text-[13px] text-text placeholder:text-muted focus:border-purple/50 focus:outline-none disabled:opacity-60"
              />
            </Field>
          )}
          {macLocked && (
            <p className="font-mono text-[11px] text-muted">Selected: {id}</p>
          )}
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
