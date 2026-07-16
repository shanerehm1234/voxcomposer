import type { VoxShow } from '@voxcomposer/shared';
import { pluginRegistry } from './registry.js';
import { getPluginConfig } from './config.js';
import { deviceAudioName } from '../audio/sync.js';

/**
 * Bake every plugin clip's side effect into the show as a plain
 * {@link BakedHttpAction} on `clip.data.baked`, so the Vox Master can replay it
 * at cue time with no laptop present. Each plugin's `compileClip(clip, config)`
 * turns its selection (which Hue scene, which HA service) + the plugin's global
 * config (bridge key / HA token) into a concrete HTTP request.
 *
 * IMPORTANT: only bake into the copy sent to the Master — the baked action can
 * contain credentials (an HA bearer token), so it must NOT go into a .vox the
 * user saves to disk or shares. Callers use this for the Master upload only.
 */
export function bakeShow(show: VoxShow): VoxShow {
  return {
    ...show,
    tracks: show.tracks.map((track) => {
      // Audio clips reference the source file (growl.mp3), but the device plays
      // the transcoded WAV that audio sync uploaded (growl.wav) — rewrite the
      // filename to the on-device name so the OcularVox actually finds it.
      if (track.type === 'audio') {
        return {
          ...track,
          clips: track.clips.map((clip) => {
            const fn = (clip.data as { filename?: string }).filename;
            if (!fn) return clip;
            return { ...clip, data: { ...clip.data, filename: deviceAudioName(fn) } };
          }),
        };
      }
      const plugin = pluginRegistry.forTrackType(track.type);
      if (!plugin?.compileClip) return track;
      const config = getPluginConfig(plugin.id);
      return {
        ...track,
        clips: track.clips.map((clip) => {
          const action = plugin.compileClip!(clip, config);
          if (!action) return clip;
          return { ...clip, data: { ...clip.data, baked: action } };
        }),
      };
    }),
  };
}

/** How many plugin clips would bake to an action — for a pre-send summary. */
export function countBaked(show: VoxShow): number {
  let n = 0;
  for (const track of show.tracks) {
    const plugin = pluginRegistry.forTrackType(track.type);
    if (!plugin?.compileClip) continue;
    const config = getPluginConfig(plugin.id);
    for (const clip of track.clips) if (plugin.compileClip(clip, config)) n++;
  }
  return n;
}
