# Vox Composer — Philips Hue plugin

Drive a [Philips Hue](https://www.philips-hue.com/) light or room (colour,
brightness, on/off, with a fade) from a timeline clip — over the **local bridge
API**, no cloud. Snap a room blood-red on a scare, then fade back.

## Setup

1. Find your bridge IP (the Hue app → Settings → My Hue System → your bridge, or
   your router's device list).
2. Get a bridge **username** (API key), once:
   - Press the round **link button** on top of the bridge.
   - Within 30s, POST `{"devicetype":"voxcomposer#haunt"}` to
     `http://{bridgeIp}/api` (e.g. with `curl`). The response contains your
     `username`.
   - List light/group ids at `http://{bridgeIp}/api/{username}/lights` and
     `.../groups`.
3. Install this plugin (Settings → Plugins), approve **network**.
4. Add a **Custom / plugin** device, pick *Philips Hue*, drag it to the timeline,
   add a clip, and set the bridge IP, username, target (light/group), id,
   on/off, brightness, colour, and fade.

## How it works

On each active frame it PUTs to the bridge:

```
PUT http://{bridgeIp}/api/{username}/lights/{id}/state      (a light)
PUT http://{bridgeIp}/api/{username}/groups/{id}/action     (a room/group)
{ "on": true, "bri": 1..254, "hue": 0..65535, "sat": 0..254, "transitiontime": ds }
```

Your `#rrggbb` colour is converted to Hue's hue/sat automatically.

**CORS:** the bridge sends no CORS headers, so the request is relayed through the
Vox Master (which shares the LAN with the bridge) — automatic, no setup.

See [`docs/WRITING_A_PLUGIN.md`](../../../docs/WRITING_A_PLUGIN.md) for the SDK.
MIT licensed — fork it as a template.
