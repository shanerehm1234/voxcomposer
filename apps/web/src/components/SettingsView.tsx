import { VOX_FORMAT_VERSION, VOX_LINK_API_VERSION } from '@voxcomposer/shared';
import { useState } from 'react';
import { registerBuiltins } from '../plugins/builtins.js';
import { pluginRegistry } from '../plugins/registry.js';
import { masterWsUrl, testMasterConnection } from '../voxlink/client.js';
import { getMasterConfig, setMasterConfig } from '../voxlink/master.js';
import { IconCheck, IconChip, IconRefresh } from './icons.js';
import { ViewHeader } from './DevicesView.js';

// Ensure the bundled plugins are registered before the panel reads the list.
registerBuiltins();

interface SettingsViewProps {
  master: { connected: boolean; ip: string };
  onReset: () => void;
}

export function SettingsView({ master, onReset }: SettingsViewProps) {
  const [devMode, setDevMode] = useState(false);
  const [autosave, setAutosave] = useState(true);
  const [ip, setIp] = useState(getMasterConfig().host);
  const [port, setPort] = useState(getMasterConfig().port);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMsg, setTestMsg] = useState('');

  const runTest = async () => {
    if (testState === 'testing') return;
    // Persist so "Send to Master" and live preview share the same host.
    setMasterConfig(ip.trim(), port);
    setTestState('testing');
    setTestMsg('');
    const result = await testMasterConnection(masterWsUrl(ip.trim(), Number(port) || 80));
    if (result.ok) {
      setTestState('ok');
      setTestMsg(
        `Connected · ${result.devices} remote${result.devices === 1 ? '' : 's'} responding` +
          (result.apiVersion ? ` · Vox-Link v${result.apiVersion}` : ''),
      );
    } else {
      setTestState('fail');
      setTestMsg(result.error ?? 'Connection failed');
    }
    setTimeout(() => setTestState('idle'), 6000);
  };

  return (
    <div className="flex h-full flex-col">
      <ViewHeader title="Settings" subtitle="Connection, audio, plugins & more" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-5 p-6">
          <Section title="Master Connection" desc="How Vox Composer reaches your Master station over local WiFi.">
            <Row label="Master host" desc="voxmaster.local or its IP">

              <input
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                className="w-40 rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 text-right font-mono text-[13px] text-text focus:border-purple/50 focus:outline-none"
              />
            </Row>
            <Row label="Port" desc="8080 for the local mock; 80 for a Vox Master board">
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-24 rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 text-right font-mono text-[13px] text-text focus:border-purple/50 focus:outline-none"
              />
            </Row>
            <Row label="Status">
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
                  testState === 'ok'
                    ? 'bg-teal/12 text-teal-l ring-1 ring-inset ring-teal/25'
                    : testState === 'fail'
                      ? 'bg-[#E8623D]/12 text-[#E8623D] ring-1 ring-inset ring-[#E8623D]/25'
                      : 'bg-bg3/50 text-muted ring-1 ring-inset ring-border'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    testState === 'ok' ? 'bg-teal' : testState === 'fail' ? 'bg-[#E8623D]' : 'bg-muted'
                  }`}
                />
                {testState === 'ok' ? 'Connected' : testState === 'fail' ? 'Disconnected' : 'Unknown'}
              </span>
            </Row>
            {testMsg && (
              <div className={`px-3 pb-1 text-[12px] ${testState === 'fail' ? 'text-[#E8623D]' : 'text-teal-l'}`}>
                {testMsg}
              </div>
            )}
            <div className="pt-1">
              <button
                onClick={() => void runTest()}
                disabled={testState === 'testing'}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-[0_2px_12px_rgba(83,74,183,0.4)] transition-all hover:brightness-110 ${
                  testState === 'ok'
                    ? 'bg-gradient-to-b from-teal to-[#147a59]'
                    : testState === 'fail'
                      ? 'bg-gradient-to-b from-[#E8623D] to-[#a83a1f]'
                      : 'bg-gradient-to-b from-purple to-purple-d'
                }`}
              >
                {testState === 'testing' && <IconRefresh className="h-4 w-4 animate-spin" />}
                {testState === 'ok' && <IconCheck className="h-4 w-4" />}
                {testState === 'testing'
                  ? 'Connecting…'
                  : testState === 'ok'
                    ? 'Connected'
                    : 'Test connection'}
              </button>
            </div>
          </Section>

          <Section title="Audio & Playback" desc="Defaults for new shows and local preview.">
            <Row label="Default BPM">
              <input
                defaultValue="120"
                className="w-24 rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 text-right font-mono text-[13px] text-text focus:border-purple/50 focus:outline-none"
              />
            </Row>
            <Row label="Snap to grid">
              <select className="rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 text-[13px] text-text focus:border-purple/50 focus:outline-none">
                <option>100 ms</option>
                <option>250 ms</option>
                <option>500 ms</option>
                <option>1 s</option>
                <option>Beat</option>
              </select>
            </Row>
            <Row label="Autosave" desc="Keep local changes saved as you work">
              <Toggle on={autosave} onChange={setAutosave} />
            </Row>
          </Section>

          <Section title="Plugins" desc="Extend Vox Composer with custom track types and integrations.">
            <div className="space-y-1.5">
              {pluginRegistry.list().map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-bg/30 px-3 py-2.5"
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-xs font-bold"
                    style={{ backgroundColor: `${p.color ?? '#534AB7'}22`, color: p.color ?? '#AFA9EC' }}
                  >
                    {p.name.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-text">{p.name}</span>
                      <span className="rounded bg-bg3/60 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                        v{p.version}
                      </span>
                      <span className="rounded bg-purple-d/50 px-1.5 py-0.5 text-[10px] text-purple-l">
                        {p.trackType}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-muted">{p.description}</p>
                  </div>
                  <span className="flex items-center gap-1 rounded-md bg-teal/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-teal-l ring-1 ring-inset ring-teal/25">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                    Built-in
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                placeholder="https://…/my-plugin.js"
                className="flex-1 rounded-lg border border-border/70 bg-bg/50 px-3 py-1.5 text-[13px] text-text placeholder:text-muted focus:border-purple/50 focus:outline-none"
              />
              <button className="rounded-lg border border-border bg-bg3/40 px-3 py-1.5 text-[13px] text-muted hover:text-text">
                Install by URL
              </button>
            </div>
          </Section>

          <Section title="Developer" desc="Advanced tools for power users.">
            <Row label="Developer mode" desc="Raw .vox JSON editor, WebSocket debug, plugin console">
              <Toggle on={devMode} onChange={setDevMode} />
            </Row>
            <Row label="Reset demo" desc="Clear locally saved show & audio, restore the sample show">
              <button
                onClick={() => {
                  if (confirm('Clear your saved show and audio, and reload the demo?')) onReset();
                }}
                className="rounded-lg border border-[#E8623D]/40 bg-[#E8623D]/10 px-3 py-1.5 text-[13px] font-medium text-[#E8623D] transition-colors hover:bg-[#E8623D]/20"
              >
                Reset
              </button>
            </Row>
          </Section>

          <Section title="About">
            <Row label="App version">
              <span className="font-mono text-[13px] text-muted">0.1.0</span>
            </Row>
            <Row label=".vox format">
              <span className="font-mono text-[13px] text-muted">v{VOX_FORMAT_VERSION}</span>
            </Row>
            <Row label="Vox-Link API">
              <span className="inline-flex items-center gap-1.5 font-mono text-[13px] text-muted">
                <IconChip className="h-3.5 w-3.5" />v{VOX_LINK_API_VERSION}
              </span>
            </Row>
            <div className="flex gap-2 pt-1">
              <a
                href="https://github.com/rehmlights/voxcomposer"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-border bg-bg3/40 px-3 py-1.5 text-[13px] text-muted hover:text-text"
              >
                GitHub ↗
              </a>
              <a
                href="https://voxcomposer.com"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-border bg-bg3/40 px-3 py-1.5 text-[13px] text-muted hover:text-text"
              >
                Docs ↗
              </a>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-bg2/50">
      <div className="border-b border-border/60 px-5 py-3.5">
        <h3 className="font-display text-[15px] font-semibold text-text">{title}</h3>
        {desc && <p className="mt-0.5 text-[12px] text-muted">{desc}</p>}
      </div>
      <div className="space-y-1 p-2">{children}</div>
    </section>
  );
}

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-bg3/30">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-text">{label}</div>
        {desc && <div className="text-[11px] text-muted">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
        on ? 'bg-gradient-to-r from-purple to-purple-l' : 'bg-bg3 ring-1 ring-inset ring-border'
      }`}
      role="switch"
      aria-checked={on}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-200 ${
          on ? 'left-[1.375rem]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
