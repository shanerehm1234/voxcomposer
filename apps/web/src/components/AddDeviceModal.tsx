import type { FixtureIndexEntry, VoxDevice, VoxDeviceType } from '@voxcomposer/shared';
import { useEffect, useMemo, useState } from 'react';
import { defaultDeviceName, kindLabel, kindToType } from '../devices/kind.js';
import { loadFixtureIndex } from '../fixtures/vibrary.js';
import { openExternal } from '../openExternal.js';
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
  /** Whether the Vox Master connection is up — scans go through it, so when it's
   *  down the "no devices found" guidance must say so instead of blaming the remote. */
  masterConnected?: boolean;
  /** The remote's LAN IP (when the Master reports one) — shows an "open its
   *  web UI" link so hardware settings (pixel count, color order, brightness
   *  limits…) are one tap away. They live on the remote, not here. */
  deviceIp?: string;
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

/** Types we trust enough to lock the selector (i.e. not a manual guess). */
function isKnownType(t: string | undefined): boolean {
  return t !== undefined && t !== 'custom';
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
  masterConnected = true,
  deviceIp,
}: AddDeviceModalProps) {
  const [id, setId] = useState(initial?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<VoxDeviceType>(initial?.type ?? 'pixel');
  // Type is a fact about the hardware. Once we know it — the remote told us
  // its kind, or the device was already added — changing it just breaks
  // tracks, so the selector only appears for manual/unknown adds.
  const [typeLocked, setTypeLocked] = useState(isKnownType(initial?.type));
  const apiVersion = initial?.apiVersion ?? '1.0.0';
  const [error, setError] = useState('');
  const [manualEntry, setManualEntry] = useState(false);

  // Relay outputs: how many and what each one switches.
  const [relayCount, setRelayCount] = useState(initial?.relayCount ?? 2);
  const [relayLabels, setRelayLabels] = useState<string[]>(initial?.relayLabels ?? []);

  // Pixel props: LED count for previews (the hardware config lives in WLED).
  const [pixelCount, setPixelCount] = useState(
    initial?.pixelCount ? String(initial.pixelCount) : '',
  );

  // DMX fixture patch (see shared/vox/fixture.ts) — profile + wire address.
  const [fixtureId, setFixtureId] = useState(initial?.fixture?.profileId ?? '');
  const [universe, setUniverse] = useState(String(initial?.fixture?.universe ?? 0));
  const [startChannel, setStartChannel] = useState(String(initial?.fixture?.startChannel ?? 1));
  const [fixtureQuery, setFixtureQuery] = useState('');
  const [fixtureIndex, setFixtureIndex] = useState<FixtureIndexEntry[] | null>(null);
  useEffect(() => {
    if (type !== 'dmx' || fixtureIndex) return;
    void loadFixtureIndex().then(setFixtureIndex);
  }, [type, fixtureIndex]);
  const fixtureMatches = useMemo(() => {
    if (!fixtureIndex) return [];
    const q = fixtureQuery.trim().toLowerCase();
    if (!q) return [];
    return fixtureIndex
      .filter((f) => `${f.manufacturer} ${f.name} ${f.mode}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [fixtureIndex, fixtureQuery]);
  const selectedFixture = useMemo(
    () => fixtureIndex?.find((f) => f.id === fixtureId) ?? null,
    [fixtureIndex, fixtureId],
  );

  const isEdit = !!initial;
  const pickable = discovered.filter((d) => !existingIds.includes(d.deviceId));
  const macLocked = !isEdit && !!id && !manualEntry;

  const pick = (d: DiscoveredDevice) => {
    setId(d.deviceId);
    if (!name.trim()) setName(defaultDeviceName(d));
    const t = kindToType(d.kind, d.ip);
    setType(t);
    setTypeLocked(Boolean(d.kind) && isKnownType(t));
    if (t === 'relay' && d.channels) setRelayCount(d.channels);
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
    const device: VoxDevice = { id: trimmedId, name: trimmedName, type, apiVersion };
    if (type === 'dmx' && fixtureId) {
      const uni = Math.max(0, parseInt(universe) || 0);
      const start = Math.max(1, Math.min(512, parseInt(startChannel) || 1));
      device.fixture = { profileId: fixtureId, universe: uni, startChannel: start };
    }
    if (type === 'pixel' && pixelCount.trim()) {
      const n = parseInt(pixelCount);
      if (Number.isFinite(n) && n >= 1) device.pixelCount = Math.min(2048, n);
    }
    if (type === 'relay') {
      device.relayCount = relayCount;
      const labels = relayLabels.slice(0, relayCount).map((l) => l.trim());
      if (labels.some((l) => l.length > 0)) device.relayLabels = labels;
    }
    onSave(device);
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
                  {!masterConnected
                    ? 'Not connected to a Vox Master — remotes are discovered through it. Check the host in Settings.'
                    : scanning
                      ? 'Listening for Vox-Link beacons…'
                      : 'No new devices seen yet — power it on, then Rescan.'}
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
                    <span className="font-medium">{kindLabel(d.kind, d.ip)} Remote</span>
                    <span className="font-mono text-[10px] text-muted">
                      {d.deviceId}
                      {d.ip ? ` · ${d.ip}` : ''}
                    </span>
                  </span>
                  <span className="font-mono text-[10px] text-muted">{d.rssi} dBm</span>
                </button>
              ))}
            </div>
            {!manualEntry && pickable.length === 0 && !scanning && (
              <div className="mt-2 rounded-lg border border-border/60 bg-bg/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted">
                Not showing up? Check that the remote is <span className="text-text">powered on</span>,
                joined to the <span className="text-text">same Wi-Fi as the Master</span>, and that the
                Master is connected (see Settings) — then Rescan.
              </div>
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
          {manualEntry && (
            <Field label="MAC address" desc="Printed on the remote's board / its own web UI.">
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="AA:BB:CC:00:11:22"
                className="w-full rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 font-mono text-[13px] text-text placeholder:text-muted focus:border-purple/50 focus:outline-none"
              />
            </Field>
          )}
          {(macLocked || (isEdit && !manualEntry)) && (
            <p className="font-mono text-[10px] text-muted/50">ID {id}</p>
          )}
          {typeLocked ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-text">Type</span>
              <span className="rounded-md bg-bg px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-l ring-1 ring-inset ring-teal/30">
                {TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type}
              </span>
            </div>
          ) : (
            <Field label="Type" desc="What kind of prop this is — newer remotes report it themselves.">
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
          )}

          {type === 'relay' && (
            <Field label="Relay outputs" desc="Name what each output switches — those names show up when placing clips.">
              <select
                value={relayCount}
                onChange={(e) => setRelayCount(Number(e.target.value))}
                className="mb-1 w-full rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 text-[13px] text-text focus:border-purple/50 focus:outline-none"
              >
                {[2, 4, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} relays
                  </option>
                ))}
              </select>
              {Array.from({ length: relayCount }, (_, i) => (
                <input
                  key={i}
                  value={relayLabels[i] ?? ''}
                  onChange={(e) =>
                    setRelayLabels((ls) => {
                      const next = [...ls];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  placeholder={`Relay ${i + 1} — e.g. ${i === 0 ? 'Fog machine' : 'Air horn'}`}
                  className="mb-1 w-full rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 text-[13px] text-text placeholder:text-muted focus:border-purple/50 focus:outline-none"
                />
              ))}
            </Field>
          )}

          {type === 'pixel' && (
            <Field
              label="Pixel count"
              desc="How many LEDs this prop drives — used for the previews. Ring, strip, matrix: any shape."
            >
              <input
                value={pixelCount}
                onChange={(e) => setPixelCount(e.target.value)}
                placeholder="e.g. 35"
                inputMode="numeric"
                className="w-full rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 font-mono text-[13px] text-text placeholder:text-muted focus:border-purple/50 focus:outline-none"
              />
            </Field>
          )}

          {deviceIp && (
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-bg/40 px-2.5 py-2">
              <span className="text-[11px] leading-relaxed text-muted">
                Hardware settings (pixel type, color order, brightness limit…) live on the
                remote itself.
              </span>
              <button
                onClick={() => openExternal(`http://${deviceIp}`)}
                className="ml-2 shrink-0 rounded-lg border border-teal/40 bg-teal/10 px-2.5 py-1.5 text-[12px] font-medium text-teal-l hover:bg-teal/20"
              >
                Open its web UI ↗
              </button>
            </div>
          )}

          {type === 'dmx' && (
            <Field
              label="Fixture (from the Vibrary)"
              desc="Assign a profile to program looks — pan/tilt/color/gobo by name — instead of raw channels."
            >
              {selectedFixture || fixtureId ? (
                <div className="flex items-center justify-between rounded-lg border border-teal/40 bg-teal/5 px-2.5 py-1.5">
                  <span className="flex flex-col">
                    <span className="text-[12px] font-medium text-text">
                      {selectedFixture
                        ? `${selectedFixture.manufacturer} ${selectedFixture.name}`
                        : fixtureId}
                    </span>
                    <span className="text-[10px] text-muted">
                      {selectedFixture ? `${selectedFixture.mode} · ${selectedFixture.footprint} ch` : 'profile'}
                    </span>
                  </span>
                  <button
                    onClick={() => {
                      setFixtureId('');
                      setFixtureQuery('');
                    }}
                    className="text-[11px] text-muted hover:text-[#E8623D]"
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={fixtureQuery}
                    onChange={(e) => setFixtureQuery(e.target.value)}
                    placeholder={
                      fixtureIndex === null
                        ? 'Loading fixture library…'
                        : fixtureIndex.length === 0
                          ? 'Library unreachable — connect once to cache it'
                          : `Search ${fixtureIndex.length} fixtures…`
                    }
                    className="w-full rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 text-[13px] text-text placeholder:text-muted focus:border-purple/50 focus:outline-none"
                  />
                  {fixtureMatches.length > 0 && (
                    <div className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                      {fixtureMatches.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setFixtureId(f.id)}
                          className="flex w-full items-center justify-between rounded-md border border-border/60 bg-bg/40 px-2 py-1 text-left text-[12px] text-text/90 hover:border-teal/50"
                        >
                          <span>
                            {f.manufacturer} {f.name}
                          </span>
                          <span className="font-mono text-[10px] text-muted">
                            {f.mode} · {f.footprint}ch
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {fixtureId && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] text-muted">Universe</span>
                    <input
                      value={universe}
                      onChange={(e) => setUniverse(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-border/70 bg-bg/50 px-2.5 py-1.5 font-mono text-[12px] text-text focus:border-purple/50 focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-muted">Start address</span>
                    <input
                      value={startChannel}
                      onChange={(e) => setStartChannel(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-border/70 bg-bg/50 px-2.5 py-1.5 font-mono text-[12px] text-text focus:border-purple/50 focus:outline-none"
                    />
                  </label>
                </div>
              )}
            </Field>
          )}
        </div>

        {error && <p className="mt-3 text-[12px] text-[#E8623D]">{error}</p>}

        {!isEdit && !manualEntry && (
          <button
            onClick={() => setManualEntry(true)}
            className="mt-3 text-[10px] text-muted/60 hover:text-muted"
          >
            Advanced: add by MAC address
          </button>
        )}

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
