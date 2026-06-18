import type { DemoDevice, DeviceConnection } from '../demo/demoData.js';
import { resolveDeviceIcon } from './icons.js';

interface DeviceSidebarProps {
  devices: DemoDevice[];
  showFiles: { name: string; active: boolean }[];
  master: { connected: boolean; ip: string };
  selectedDeviceId: string | null;
  onSelectDevice: (id: string) => void;
}

function StatusDot({ connection }: { connection: DeviceConnection }) {
  if (connection === 'online') {
    return <span className="h-2 w-2 rounded-full bg-teal shadow-[0_0_7px_rgba(29,158,117,0.9)]" />;
  }
  if (connection === 'connecting') {
    return <span className="h-2 w-2 animate-pulse rounded-full bg-purple-l shadow-[0_0_7px_rgba(175,169,236,0.8)]" />;
  }
  return <span className="h-2 w-2 rounded-full bg-muted/40 ring-1 ring-inset ring-muted/30" />;
}

/** Four-bar signal strength derived from RSSI (dBm). */
function SignalBars({ rssi }: { rssi?: number }) {
  if (rssi === undefined) return null;
  const level = rssi >= -50 ? 4 : rssi >= -60 ? 3 : rssi >= -70 ? 2 : 1;
  return (
    <span className="flex items-end gap-[2px]" title={`${rssi} dBm`}>
      {[3, 6, 9, 12].map((h, i) => (
        <span
          key={h}
          className={`w-[3px] rounded-sm ${i < level ? 'bg-teal-l' : 'bg-muted/25'}`}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

export function DeviceSidebar({
  devices,
  showFiles,
  master,
  selectedDeviceId,
  onSelectDevice,
}: DeviceSidebarProps) {
  return (
    <aside className="hidden w-60 flex-col border-r border-border/70 bg-bg2/60 md:flex">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SectionLabel>Vox-Link Devices</SectionLabel>
        <ul className="space-y-0.5 px-2">
          {devices.map((d) => {
            const Icon = resolveDeviceIcon(d.type, d.iconHint);
            const selected = d.id === selectedDeviceId;
            const offline = d.connection === 'offline';
            return (
              <li key={d.id}>
                <button
                  onClick={() => onSelectDevice(d.id)}
                  className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-all duration-150 ${
                    selected
                      ? 'bg-bg3 text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ring-1 ring-purple/30'
                      : 'text-text/90 hover:bg-bg3/50'
                  }`}
                >
                  <StatusDot connection={d.connection} />
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      offline ? 'text-muted/50' : 'text-muted group-hover:text-purple-l'
                    }`}
                  />
                  <span className={`flex-1 truncate font-medium ${offline ? 'text-muted' : ''}`}>
                    {d.name}
                  </span>
                  {d.connection === 'online' ? (
                    <SignalBars rssi={d.rssi} />
                  ) : (
                    <span className="rounded-md bg-bg px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted ring-1 ring-inset ring-border">
                      {d.type}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex gap-2 px-3">
          <SidebarButton>+ Add device</SidebarButton>
          <SidebarButton>Scan remotes</SidebarButton>
        </div>

        <SectionLabel className="mt-6">Show Files</SectionLabel>
        <ul className="space-y-0.5 px-2 pb-3">
          {showFiles.map((f) => (
            <li key={f.name}>
              <button
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                  f.active
                    ? 'bg-bg3 text-text ring-1 ring-purple/30'
                    : 'text-muted hover:bg-bg3/50 hover:text-text'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    f.active ? 'bg-purple-l shadow-[0_0_6px_rgba(175,169,236,0.8)]' : 'bg-muted/40'
                  }`}
                />
                <span className="font-mono text-xs">{f.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border/70 bg-bg2/40 px-4 py-3">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          Master Station
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              master.connected ? 'bg-teal shadow-[0_0_7px_rgba(29,158,117,0.9)]' : 'bg-muted/40'
            }`}
          />
          <span className={`text-[13px] font-medium ${master.connected ? 'text-teal-l' : 'text-muted'}`}>
            {master.connected ? 'Connected' : 'Offline'}
          </span>
          <span className="ml-auto font-mono text-[11px] text-muted">{master.ip}</span>
        </div>
      </div>
    </aside>
  );
}

function SidebarButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="flex-1 rounded-lg border border-border/80 bg-bg3/30 px-2 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-purple/40 hover:text-text">
      {children}
    </button>
  );
}

function SectionLabel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`px-4 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/80 ${className}`}
    >
      {children}
    </div>
  );
}
