import { useState } from 'react';
import type { DemoDevice } from '../demo/demoData.js';
import { PALETTE } from '../styles/palette.js';
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

export function DevicesView({ devices }: { devices: DemoDevice[] }) {
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
            <ScanButton />
            <PrimaryButton icon={<IconPlus className="h-4 w-4" />}>Pair new device</PrimaryButton>
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
            <DeviceCard key={d.id} device={d} />
          ))}
          <PairCard />
        </div>
      </div>
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

function DeviceCard({ device: d }: { device: DemoDevice }) {
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
          <CardAction>Configure</CardAction>
        </div>
      </div>
    </div>
  );
}

function ScanButton() {
  const [scanning, setScanning] = useState(false);
  const run = () => {
    if (scanning) return;
    setScanning(true);
    setTimeout(() => setScanning(false), 1700);
  };
  return (
    <button
      onClick={run}
      className="flex items-center gap-2 rounded-lg border border-border/80 bg-bg3/40 px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-text"
    >
      <IconRefresh className={`h-4 w-4 ${scanning ? 'animate-spin text-purple-l' : ''}`} />
      {scanning ? 'Scanning…' : 'Scan all'}
    </button>
  );
}

function PairCard() {
  const [state, setState] = useState<'idle' | 'listening' | 'found'>('idle');
  const run = () => {
    if (state !== 'idle') return;
    setState('listening');
    setTimeout(() => {
      setState('found');
      setTimeout(() => setState('idle'), 3500);
    }, 2200);
  };

  return (
    <button
      onClick={run}
      className={`flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-muted transition-colors ${
        state === 'found'
          ? 'border-teal/50 text-teal-l'
          : 'border-border/60 hover:border-purple/50 hover:text-purple-l'
      }`}
    >
      {state === 'listening' ? (
        <>
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-purple/40 bg-purple/10">
            <IconRefresh className="h-5 w-5 animate-spin text-purple-l" />
          </span>
          <span className="text-sm font-medium text-purple-l">Listening for remotes…</span>
          <span className="text-[11px] text-muted">Hold the pair button on your remote</span>
        </>
      ) : state === 'found' ? (
        <>
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-teal/40 bg-teal/10">
            <IconCheck className="h-5 w-5 text-teal-l" />
          </span>
          <span className="text-sm font-medium">Found “Crypt Skull”</span>
          <span className="text-[11px] text-muted">Paired over Vox-Link · added to your devices</span>
        </>
      ) : (
        <>
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-bg2/60">
            <IconPlus className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium">Pair a new remote</span>
          <span className="max-w-[14rem] text-center text-[11px] text-muted">
            Put a Vox remote in pairing mode, then add it over Vox-Link
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

function CardAction({ children }: { children: React.ReactNode }) {
  return (
    <button className="rounded-md border border-border bg-bg3/40 px-2 py-1 text-[11px] text-muted transition-colors hover:text-text">
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
    <div className="flex items-center gap-4 border-b border-border/70 bg-bg2/40 px-5 py-3.5">
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
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <button className="flex items-center gap-2 rounded-lg bg-gradient-to-b from-purple to-purple-d px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-[0_2px_12px_rgba(83,74,183,0.4)] transition-all hover:brightness-110">
      {icon}
      {children}
    </button>
  );
}
