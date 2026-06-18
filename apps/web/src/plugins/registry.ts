import { validateManifest, type VoxPlugin } from '@voxcomposer/plugin-sdk';

/**
 * In-app registry of loaded plugins. Plugins run trusted, in-process; the
 * registry validates each plugin's manifest before accepting it and indexes by
 * both id and the custom track type it registers, so the timeline can route a
 * clip to the plugin that owns its track type.
 */
export class PluginRegistry {
  private byId = new Map<string, VoxPlugin>();
  private byTrackType = new Map<string, VoxPlugin>();

  /** Validate and register a plugin. Throws on a bad manifest or id/type clash. */
  register(plugin: VoxPlugin): void {
    validateManifest(plugin);
    if (this.byId.has(plugin.id)) {
      throw new Error(`Plugin "${plugin.id}" is already registered.`);
    }
    if (this.byTrackType.has(plugin.trackType)) {
      throw new Error(
        `Track type "${plugin.trackType}" is already owned by ${this.byTrackType.get(plugin.trackType)!.id}.`,
      );
    }
    this.byId.set(plugin.id, plugin);
    this.byTrackType.set(plugin.trackType, plugin);
  }

  unregister(id: string): void {
    const plugin = this.byId.get(id);
    if (!plugin) return;
    this.byId.delete(id);
    this.byTrackType.delete(plugin.trackType);
  }

  get(id: string): VoxPlugin | undefined {
    return this.byId.get(id);
  }

  /** The plugin that owns a given track type, if any. */
  forTrackType(trackType: string): VoxPlugin | undefined {
    return this.byTrackType.get(trackType);
  }

  list(): VoxPlugin[] {
    return [...this.byId.values()];
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }
}

/** App-wide singleton registry. */
export const pluginRegistry = new PluginRegistry();
