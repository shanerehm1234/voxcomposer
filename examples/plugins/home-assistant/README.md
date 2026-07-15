# Vox Composer — Home Assistant plugin

Call a [Home Assistant](https://www.home-assistant.io/) service (turn lights on,
run a scene, fire a script, flip a smart plug) at a timeline instant. Tie your
whole-house automation into a haunt cue sheet.

## Setup

1. In Home Assistant, create a **Long-Lived Access Token**: Profile → Security →
   *Long-lived access tokens* (bottom of the page) → Create Token.
2. Install this plugin in Vox Composer (Settings → Plugins), approve the
   **network** permission.
3. Add a **Custom / plugin** device, pick *Home Assistant*, drag it to the
   timeline, and add a clip.
4. In the clip inspector, set your HA URL (e.g. `http://homeassistant.local:8123`),
   paste the token, choose a **service** (e.g. `light.turn_on`), and the
   **entity id** (e.g. `light.porch`). Optional per-service data as JSON, e.g.
   `{"brightness":255,"rgb_color":[255,0,0]}`.

## How it works

On each active frame it POSTs to HA's REST API:

```
POST {url}/api/services/{domain}/{service}
Authorization: Bearer {token}
{ "entity_id": "...", ...service data }
```

**CORS:** add your Composer origin to HA's `http.cors_allowed_origins`, or just
let it fall back through the Vox Master relay (automatic).

See [`docs/WRITING_A_PLUGIN.md`](../../../docs/WRITING_A_PLUGIN.md) for the SDK
this is built on. MIT licensed — fork it as a template.
