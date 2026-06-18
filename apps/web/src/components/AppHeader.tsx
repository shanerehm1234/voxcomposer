import {
  IconDevices,
  IconExport,
  IconFolderOpen,
  IconMedia,
  IconPlay,
  IconPlus,
  IconSettings,
  IconTimeline,
} from './icons.js';

interface AppHeaderProps {
  remotesOnline: number;
  activeView: string;
  onSelectView: (view: string) => void;
  onExport: () => void;
  onImport: () => void;
  onShowHelp: () => void;
  onInstall?: () => void;
}

const NAV = [
  { id: 'timeline', label: 'Timeline', Icon: IconTimeline },
  { id: 'devices', label: 'Devices', Icon: IconDevices },
  { id: 'media', label: 'Media', Icon: IconMedia },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
] as const;

export function AppHeader({
  remotesOnline,
  activeView,
  onSelectView,
  onExport,
  onImport,
  onInstall,
  onShowHelp,
}: AppHeaderProps) {
  return (
    <header className="relative flex items-center gap-4 border-b border-border/70 bg-bg2/80 px-4 py-2.5 backdrop-blur">
      {/* Brand */}
      <div className="flex items-center gap-2.5 pr-1">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-purple to-purple-d shadow-[0_0_12px_rgba(83,74,183,0.45)]">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-purple-l" />
        </span>
        <span className="font-display text-[15px] font-bold tracking-tight">
          Vox<span className="text-purple-l">Composer</span>
        </span>
      </div>

      <div className="h-6 w-px bg-border/70" />

      {/* Primary nav */}
      <nav className="flex items-center gap-1">
        {NAV.map(({ id, label, Icon }) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              onClick={() => onSelectView(id)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-150 ${
                active
                  ? 'bg-bg3 text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ring-1 ring-purple/30'
                  : 'text-muted hover:bg-bg3/50 hover:text-text'
              }`}
            >
              <Icon
                className={`h-4 w-4 transition-colors ${active ? 'text-purple-l' : 'text-muted group-hover:text-text'}`}
              />
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        {onInstall && (
          <button
            onClick={onInstall}
            title="Install Vox Composer as an app"
            className="flex items-center gap-1.5 rounded-lg border border-purple/40 bg-purple/10 px-2.5 py-1.5 text-[12px] font-medium text-purple-l transition-colors hover:bg-purple/20"
          >
            <IconPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Install</span>
          </button>
        )}
        <button
          onClick={onImport}
          title="Open a .vox show file"
          aria-label="Open a .vox show file"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/80 bg-bg3/40 text-muted transition-colors hover:text-text"
        >
          <IconFolderOpen className="h-4 w-4" />
        </button>
        <button
          onClick={onExport}
          title="Download this show as a .vox file"
          aria-label="Export .vox file"
          className="flex items-center gap-2 rounded-lg border border-border/80 bg-bg3/40 px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-text"
        >
          <IconExport className="h-4 w-4" />
          <span className="hidden sm:inline">
            Export<span className="text-muted/70">.vox</span>
          </span>
        </button>

        <div
          title="Remotes currently reachable over Vox-Link"
          role="status"
          aria-label={`${remotesOnline} remotes online`}
          className="flex items-center gap-2 rounded-lg border border-teal/25 bg-teal/10 px-3 py-1.5 text-[13px]"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
          </span>
          <span className="font-semibold text-teal-l">{remotesOnline}</span>
          <span className="hidden text-muted sm:inline">online</span>
        </div>

        <button
          onClick={onShowHelp}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
          className="hidden h-8 w-8 items-center justify-center rounded-lg border border-border/80 bg-bg3/40 font-mono text-[13px] text-muted transition-colors hover:text-text sm:flex"
        >
          ?
        </button>

        <button
          title="Stream this show live to the remotes over Vox-Link"
          aria-label="Preview live"
          className="flex items-center gap-2 rounded-lg bg-gradient-to-b from-purple to-purple-d px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-[0_2px_12px_rgba(83,74,183,0.4)] transition-all hover:shadow-[0_2px_18px_rgba(83,74,183,0.6)] hover:brightness-110"
        >
          <IconPlay className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Preview live</span>
        </button>
      </div>
    </header>
  );
}
