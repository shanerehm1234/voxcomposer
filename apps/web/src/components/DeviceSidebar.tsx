import type { VoxDevice } from '@voxcomposer/shared';
import { useState } from 'react';
import type { DemoDevice, DeviceConnection } from '../demo/demoData.js';
import { DEVICE_DRAG_TYPE } from '../dnd.js';
import { pluginRegistry } from '../plugins/registry.js';
import { registerBuiltins } from '../plugins/builtins.js';
import { getPluginConfig } from '../plugins/config.js';
import { openExternal } from '../openExternal.js';
import { masterWsUrl, scanForDevices, type DiscoveredDevice } from '../voxlink/client.js';
import { getMasterConfig, masterHttpBase } from '../voxlink/master.js';
import { AddDeviceModal } from './AddDeviceModal.js';
import { resolveDeviceIcon } from './icons.js';

// Ensure the built-in plugins are registered so the Plugins section can list them.
registerBuiltins();

interface DeviceSidebarProps {
  devices: DemoDevice[];
  master: { connected: boolean; ip: string };
  selectedDeviceId: string | null;
  onSelectDevice: (id: string) => void;
  onAddDevice: (device: VoxDevice) => void;
  onRemoveDevice: (id: string) => void;
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
  master,
  selectedDeviceId,
  onSelectDevice,
  onAddDevice,
  onRemoveDevice,
}: DeviceSidebarProps) {
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

  return (
    <aside className="hidden w-60 flex-col border-r border-border/70 bg-bg2/60 md:flex">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SectionLabel>Vox-Link Devices</SectionLabel>
        <ul className="space-y-0.5 px-2">
          {devices.map((d) => {
            const Icon = resolveDeviceIcon(d.type, d.iconHint);
            const selected = d.id === selectedDeviceId;
            const offline = d.connection === 'offline';
            const openEditor = () => {
              setEditing({
                id: d.id,
                name: d.name,
                type: d.type,
                apiVersion: d.apiVersion ?? '1.0.0',
                pixelCount: d.pixelCount,
                relayCount: d.relayCount,
                relayLabels: d.relayLabels,
                onboard: d.onboard,
                fixture: d.fixture,
              });
              setModalOpen(true);
            };
            return (
              <li key={d.id}>
                <button
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      DEVICE_DRAG_TYPE,
                      JSON.stringify({ id: d.id, name: d.name, type: d.type, onboard: d.onboard }),
                    );
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => onSelectDevice(d.id)}
                  onDoubleClick={openEditor}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openEditor();
                  }}
                  title="Drag onto the timeline to add its track · double-click to edit"
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
          <SidebarButton
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
              runScan();
            }}
          >
            + Add device
          </SidebarButton>
          <SidebarButton onClick={runScan}>{scanning ? 'Scanning…' : 'Scan remotes'}</SidebarButton>
        </div>

        <SectionLabel>Plugins</SectionLabel>
        <ul className="space-y-0.5 px-2">
          {pluginRegistry.list().map((p) => {
            const configured = p.isConfigured ? p.isConfigured(getPluginConfig(p.id)) : true;
            return (
              <li key={p.id}>
                <button
                  draggable
                  onDragStart={(e) => {
                    // Reuse the device-drop plumbing: the timeline turns a
                    // plugin trackType into a plugin lane (see addDeviceTracks).
                    e.dataTransfer.setData(
                      DEVICE_DRAG_TYPE,
                      JSON.stringify({ id: p.id, name: p.name, type: p.trackType }),
                    );
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title="Drag onto the timeline to add this plugin's track"
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-text/90 transition-all duration-150 hover:bg-bg3/50"
                >
                  <span
                    className="grid h-4 w-4 shrink-0 place-items-center rounded font-display text-[8px] font-bold"
                    style={{ backgroundColor: `${p.color ?? '#534AB7'}33`, color: p.color ?? '#AFA9EC' }}
                  >
                    {p.name.slice(0, 1)}
                  </span>
                  <span className="flex-1 truncate font-medium">{p.name}</span>
                  {!configured && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                      style={{ backgroundColor: '#F5A62322', color: '#F5A623' }}
                      title="Set up in Settings → Plugins"
                    >
                      setup
                    </span>
                  )}
                </button>
              </li>
            );
          })}
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
        <button
          onClick={() => openExternal(masterHttpBase())}
          className="mt-1.5 inline-block text-[11px] text-muted transition-colors hover:text-teal-l"
        >
          Open web UI ↗
        </button>
      </div>

      {modalOpen && (
        <AddDeviceModal
          existingIds={devices.map((d) => d.id)}
          initial={editing ?? undefined}
          deviceIp={editing ? devices.find((d) => d.id === editing.id)?.ip : undefined}
          discovered={discovered}
          scanning={scanning}
          onRescan={runScan}
          masterConnected={master.connected}
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
    </aside>
  );
}

function SidebarButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-lg border border-border/80 bg-bg3/30 px-2 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-purple/40 hover:text-text"
    >
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
