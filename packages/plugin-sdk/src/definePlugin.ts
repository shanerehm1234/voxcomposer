import type { VoxPlugin } from './types.js';

/**
 * Identity helper for authoring a plugin with full type-checking and inference.
 *
 * @example
 * export default definePlugin({
 *   id: 'com.example.hello',
 *   name: 'Hello',
 *   version: '1.0.0',
 *   author: 'you',
 *   description: 'Says hi each frame',
 *   trackType: 'hello',
 *   permissions: ['network'],
 *   onFrame(ts, clip, api) { api.log('frame', ts); },
 * });
 */
export function definePlugin(plugin: VoxPlugin): VoxPlugin {
  return plugin;
}
