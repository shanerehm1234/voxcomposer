import type { VoxDevice } from '@voxcomposer/shared';
import { useState } from 'react';
import type { DemoDevice } from '../demo/demoData.js';
import { PALETTE } from '../styles/palette.js';
import { masterWsUrl, scanForDevices, type DiscoveredDevice } from '../voxlink/client.js';
import { getMasterConfig } from '../voxlink/master.js';
import { AddDeviceModal } from './AddDeviceModal.js';
import {
  IconBattery,
  IconCheck,
  IconChip,
  IconPlus,
  IconRefresh,
  IconSdCard,
  resolveDeviceIcon,
} from './icons.js';

const DEVICE_ACCENT: Record<string, string> = {
  skull: PALETTE.purpleL,
  dmx: PALETTE.teal,
  relay: '#E0A92B',
  sense: PALETTE.muted,
  audio: '#E8623D',
  pixel: PALETTE.tealL,
  custom: PALETTE.muted,
};

interface DevicesViewProps {
  devices: DemoDevice[];
  onAddDevice: (device: VoxDevice) => void;
  onRemoveDevice: (id: string) => void;
}

export function DevicesView({ devices, onAddDevice, onRemoveDevice }: DevicesViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VoxDevice | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
  const [scanning, setScanning] = useState(false);

  const runScan = () => {
    setScanning(true);
    const cfg = getMasterConfig();
    scanForDevices(masterWsUrl(cfg.host, Number(cfg.port) || 80))
      .then(setDiscovered)
      .finally(() => setScanning(false));
  };

  const onlineDevices = devices.filter((d) => d.connection === 'online');
  const online = onlineDevices.length;

  const avgRssi =
    onlineDevices.filter((d) => d.rssi !== undefined).length > 0
      ? Math.round(
          onlineDevices.reduce((s, d) => s + (d.rssi ?? 0), 0) /
            onlineDevices.filter((d) => d.rssi !== undefined).length,
        )
      : undefined;
  const totalUsedMb = devices.reduce((s, d) => s + (d.sdUsedMb ?? 0), 0);
  const totalMb = devices.reduce((s, d) => s + (d.sdTotalMb ?? 0), 0);
  const lowBatteries = devices.filter((d) => d.battery !== undefined && d.battery < 20).length;

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        title="Devices"
        subtitle={`${devices.length} paired · ${online} online`}
        actions={
          <>
            <ScanButton scanning={scanning} onScan={runScan} />
            <PrimaryButton
              icon={<IconPlus className="h-4 w-4" />}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
                runScan();
              }}
            >
              Add device
            </PrimaryButton>
          </>
        }
      />

      {/* At-a-glance telemetry */}
      <div className="grid grid-cols-2 gap-px border-b border-border/70 bg-border/40 md:grid-cols-4">
        <SummaryStat
          label="Online"
          value={`${online} / ${devices.length}`}
          tone={online === devices.length ? 'teal' : 'default'}
          title="Remotes currently reachable over Vox-Link"
        />
        <SummaryStat
          label="Avg signal"
          value={avgRssi !== undefined ? `${avgRssi} dBm` : '—'}
          tone={avgRssi !== undefined && avgRssi >= -60 ? 'teal' : 'amber'}
          title="Mean RSSI across online remotes"
        />
        <SummaryStat
          label="SD usage"
          value={totalMb > 0 ? `${totalUsedMb.toFixed(1)} / ${totalMb} MB` : '—'}
          title="Combined storage used across all SD cards"
        />
        <SummaryStat
          label="Low battery"
          value={lowBatteries > 0 ? `${lowBatteries} device${lowBatteries > 1 ? 's' : ''}` : 'None'}
          tone={lowBatteries > 0 ? 'red' : 'teal'}
          title="Battery-powered remotes below 20%"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {devices.map((d) => (
            <DeviceCard
              key={d.id}
              device={d}
              onConfigure={() => {
                setEditing({ id: d.id, name: d.name, type: d.type, apiVersion: d.apiVersion ?? '1.0.0' });
                setModalOpen(true);
              }}
            />
          ))}
          <PairCard
            discovered={discovered.filter((d) => !devices.some((dv) => dv.id === d.deviceId))}
            scanning={scanning}
            onScan={runScan}
            onManualAdd={() => {
              setModalOpen(true);
              runScan();
            }}
            onPick={(d) => {
              onAddDevice({
                id: d.deviceId,
                name: d.ip ? `VoxPixel ${d.deviceId.split(':').slice(-2).join(':')}` : `Remote ${d.deviceId}`,
                type: d.ip ? 'pixel' : 'custom',
                apiVersion: '1.0.0',
              });
            }}
          />
        </div>
      </div>

      {modalOpen && (
        <AddDeviceModal
          existingIds={devices.map((d) => d.id)}
          initial={editing ?? undefined}
          discovered={discovered}
          scanning={scanning}
          onRescan={runScan}
          onClose={() => setModalOpen(false)}
          onSave={(device) => {
            onAddDevice(device);
            setModalOpen(false);
          }}
          onRemove={
            editing
              ? () => {
                  onRemoveDevice(editing.id);
                  setModalOpen(false);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = 'default',
  title,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'teal' | 'amber' | 'red';
  title?: string;
}) {
  const toneClass =
    tone === 'teal'
      ? 'text-teal-l'
      : tone === 'amber'
        ? 'text-[#E0A92B]'
        : tone === 'red'
          ? 'text-[#E8623D]'
          : 'text-text';
  return (
    <div className="bg-bg2/50 px-5 py-3" title={title}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className={`mt-1 font-mono text-lg ${toneClass}`}>{value}</div>
    </div>
  );
}

function DeviceCard({ device: d, onConfigure }: { device: DemoDevice; onConfigure: () => void }) {
  const accent = DEVICE_ACCENT[d.type] ?? PALETTE.muted;
  const Icon = resolveDeviceIcon(d.type, d.iconHint);
  const online = d.connection === 'online';

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-bg2/60 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:bg-bg2 ${
        online ? 'border-border/70 hover:border-purple/40' : 'border-border/50 opacity-80'
      }`}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl"
        style={{ background: online ? accent : 'transparent' }}
      />

      <div className="flex items-start gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-[15px] font-semibold text-text">{d.name}</h3>
            <StatusBadge connection={d.connection} />
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
            <span className="font-mono">{d.id}</span>
            <span>·</span>
            <span className="uppercase tracking-wide">{d.type}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Stat
          icon={<SignalGlyph online={online} rssi={d.rssi} />}
          label="Signal"
          value={online && d.rssi !== undefined ? `${d.rssi} dBm` : '—'}
          title={online ? 'Vox-Link signal strength (RSSI). Closer to 0 is stronger.' : 'Offline'}
        />
        <Stat
          icon={<IconChip className="h-3.5 w-3.5" />}
          label="Vox-Link API"
          value={d.apiVersion ?? '—'}
          title="Vox-Link protocol version this remote's firmware supports"
        />
        {d.battery !== undefined && (
          <Stat
            icon={<IconBattery className="h-3.5 w-3.5" />}
            label="Battery"
            value={`${d.battery}%`}
            valueClass={d.battery < 20 ? 'text-[#E8623D]' : d.battery < 50 ? 'text-[#E0A92B]' : 'text-teal-l'}
            title={d.battery < 20 ? 'Low battery — replace or recharge soon' : 'Remaining battery'}
          />
        )}
        <Stat
          icon={<IconSdCard className="h-3.5 w-3.5" />}
          label="SD card"
          value={d.sdTotalMb ? `${d.fileCount ?? 0} files` : '—'}
          title="Audio files staged on this remote's SD card"
        />
      </div>

      {d.sdTotalMb && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] text-muted">
            <span>Storage</span>
            <span className="font-mono">
              {d.sdUsedMb?.toFixed(1)} / {d.sdTotalMb} MB
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-bg">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, ((d.sdUsedMb ?? 0) / d.sdTotalMb) * 100)}%`,
                backgroundColor: accent,
              }}
            />
          </div>
        </div>
      )}

      {d.audioSpec && (
        <div
          className="mt-3 flex items-center gap-2 rounded-lg border border-border/50 bg-bg/40 px-2.5 py-1.5"
          title="Playback format this remote's codec requires. Imported MP3/OGG transcode to this spec at sync time."
        >
          <span className="text-[10px] uppercase tracking-wide text-muted">Plays</span>
          <span className="font-mono text-[11px] text-text">
            {(d.supportsFormats ?? ['wav']).join('/').toUpperCase()}
          </span>
          <span className="text-muted">·</span>
          <span className="font-mono text-[11px] text-muted">
            {(d.audioSpec.sampleRate / 1000).toFixed(d.audioSpec.sampleRate % 1000 ? 2 : 0)} kHz ·{' '}
            {d.audioSpec.bitDepth}-bit · {d.audioSpec.channels === 1 ? 'mono' : 'stereo'}
          </span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
        <span className="text-[11px] text-muted">
          {online ? d.firmware : `Last seen ${d.lastSeen ?? 'unknown'}`}
        </span>
        <div className="flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <CardAction>Identify</CardAction>
          <CardAction onClick={onConfigure}>Configure</CardAction>
        </div>
      </div>
    </div>
  );
}

function ScanButton({ scanning, onScan }: { scanning: boolean; onScan: () => void }) {
  return (
    <button
      onClick={onScan}
      disabled={scanning}
      className="flex items-center gap-2 rounded-lg border border-border/80 bg-bg3/40 px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-text disabled:opacity-60"
    >
      <IconRefresh className={`h-4 w-4 ${scanning ? 'animate-spin text-purple-l' : ''}`} />
      {scanning ? 'Scanning…' : 'Scan all'}
    </button>
  );
}

/**
 * Listens for real Vox-Link `device_scan` results (via the Master) and lets
 * you add a discovered remote with one click — no MAC typing. Right-click (or
 * "Don't see it?") falls back to the manual-entry modal for a remote that
 * hasn't beaconed yet.
 */
function PairCard({
  discovered,
  scanning,
  onScan,
  onManualAdd,
  onPick,
}: {
  discovered: DiscoveredDevice[];
  scanning: boolean;
  onScan: () => void;
  onManualAdd: () => void;
  onPick: (d: DiscoveredDevice) => void;
}) {
  if (discovered.length > 0) {
    return (
      <div className="flex min-h-[200px] flex-col gap-2 rounded-2xl border-2 border-dashed border-teal/40 p-4">
        <span className="text-sm font-medium text-teal-l">
          {discovered.length} remote{discovered.length > 1 ? 's' : ''} found
        </span>
        <div className="flex-1 space-y-1.5 overflow-y-auto">
          {discovered.map((d) => (
            <button
              key={d.deviceId}
              onClick={() => onPick(d)}
              className="flex w-full items-center justify-between rounded-lg border border-border/70 bg-bg2/60 px-2.5 py-1.5 text-left text-[12px] hover:border-teal/50"
            >
              <span className="flex flex-col">
                <span className="font-medium text-text">{d.ip ? 'VoxPixel Remote' : 'Vox-Link remote'}</span>
                <span className="font-mono text-[10px] text-muted">
                  {d.deviceId}
                  {d.ip ? ` · ${d.ip}` : ''}
                </span>
              </span>
              <IconCheck className="h-4 w-4 text-teal-l" />
            </button>
          ))}
        </div>
        <button onClick={onScan} className="text-[11px] text-muted hover:text-text">
          Rescan
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onScan}
      onContextMenu={(e) => {
        e.preventDefault();
        onManualAdd();
      }}
      title="Click to scan, or right-click to add a device manually"
      className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/60 text-muted transition-colors hover:border-purple/50 hover:text-purple-l"
    >
      {scanning ? (
        <>
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-purple/40 bg-purple/10">
            <IconRefresh className="h-5 w-5 animate-spin text-purple-l" />
          </span>
          <span className="text-sm font-medium text-purple-l">Listening for remotes…</span>
          <span className="text-[11px] text-muted">Vox-Link broadcasts itself — no pairing button needed</span>
        </>
      ) : (
        <>
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-bg2/60">
            <IconPlus className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium">Pair a new remote</span>
          <span className="max-w-[14rem] text-center text-[11px] text-muted">
            Power it on, then click to scan — it shows up automatically
          </span>
        </>
      )}
    </button>
  );
}

function StatusBadge({ connection }: { connection: DemoDevice['connection'] }) {
  if (connection === 'online') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-teal/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-l ring-1 ring-inset ring-teal/25">
        <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_5px_rgba(29,158,117,0.9)]" />
        Online
      </span>
    );
  }
  if (connection === 'connecting') {
    return (
      <span className="rounded-full bg-purple/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-l">
        Pairing
      </span>
    );
  }
  return (
    <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted ring-1 ring-inset ring-border">
      Offline
    </span>
  );
}

function SignalGlyph({ online, rssi }: { online: boolean; rssi?: number }) {
  const level = !online || rssi === undefined ? 0 : rssi >= -50 ? 4 : rssi >= -60 ? 3 : rssi >= -70 ? 2 : 1;
  return (
    <span className="flex items-end gap-[2px]">
      {[3, 5, 7, 9].map((h, i) => (
        <span
          key={h}
          className={`w-[2.5px] rounded-sm ${i < level ? 'bg-teal-l' : 'bg-muted/25'}`}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

function Stat({
  icon,
  label,
  value,
  valueClass = 'text-text',
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  title?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-bg/40 px-2.5 py-2" title={title}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted">
        <span className="text-muted">{icon}</span>
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-[13px] ${valueClass}`}>{value}</div>
    </div>
  );
}

function CardAction({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-border bg-bg3/40 px-2 py-1 text-[11px] text-muted transition-colors hover:text-text"
    >
      {children}
    </button>
  );
}

// --- shared view chrome -----------------------------------------------------

export function ViewHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/70 bg-bg2/40 px-5 py-3.5">
      <div>
        <h2 className="font-display text-lg font-semibold text-text">{title}</h2>
        <p className="text-[12px] text-muted">{subtitle}</p>
      </div>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </div>
  );
}

export function GhostButton({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <button className="flex items-center gap-2 rounded-lg border border-border/80 bg-bg3/40 px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-text">
      {icon}
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg bg-gradient-to-b from-purple to-purple-d px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-[0_2px_12px_rgba(83,74,183,0.4)] transition-all hover:brightness-110"
    >
      {icon}
      {children}
    </button>
  );
}
