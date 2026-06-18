import type { VoxClip } from '@voxcomposer/shared';
import { definePlugin } from '@voxcomposer/plugin-sdk';

/** Shape of a Generic HTTP clip's payload (stored in clip.data). */
interface HttpClipData {
  url: string;
  method: 'GET' | 'POST';
  body?: string;
}

function read(clip: VoxClip): HttpClipData {
  const d = clip.data as Partial<HttpClipData>;
  return { url: d.url ?? '', method: d.method === 'POST' ? 'POST' : 'GET', body: d.body };
}

/**
 * Generic HTTP — fires an HTTP GET/POST to any URL when its clip plays. Useful
 * for custom integrations (home automation, webhooks, REST-controlled gear).
 *
 * The host calls onFrame while the clip is active; this plugin fires once per
 * activation (the host de-dupes repeated frames of the same clip).
 */
export default definePlugin({
  id: 'com.voxcomposer.generic-http',
  name: 'Generic HTTP',
  version: '1.0.0',
  author: 'rehmlights',
  description: 'Send an HTTP GET or POST to any URL at a timestamp.',
  trackType: 'http',
  permissions: ['network'],
  color: '#7AA2F7',

  summarizeClip(clip) {
    const { method, url } = read(clip);
    return url ? `${method} ${stripProtocol(url)}` : 'HTTP — configure URL';
  },

  onFrame(_timestamp, clip, api) {
    const { url, method, body } = read(clip);
    if (!url) return;
    void api
      .sendHTTP(url, { method, body: method === 'POST' ? body : undefined })
      .catch((err) => api.log('Generic HTTP request failed:', err));
  },
});

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
