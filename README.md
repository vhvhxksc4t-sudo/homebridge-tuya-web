# Homebridge Tuya Web

[![GitHub release](https://img.shields.io/github/release/vhvhxksc4t-sudo/homebridge-tuya-web.svg)](https://github.com/vhvhxksc4t-sudo/homebridge-tuya-web/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub issues](https://img.shields.io/github/issues/vhvhxksc4t-sudo/homebridge-tuya-web)](https://github.com/vhvhxksc4t-sudo/homebridge-tuya-web/issues)

A Homebridge plugin for controlling Tuya smart home devices through Apple HomeKit. Uses the official **Tuya IoT Platform REST API** for a stable, long-term supported integration.

> **Note:** This is a community fork of [homebridge-plugins/homebridge-tuya-web](https://github.com/homebridge-plugins/homebridge-tuya-web). The original plugin used an unofficial Home Assistant API that Tuya has deprecated. This fork has been rewritten to use the official Tuya IoT Platform API.

---

## Migrating from the Original Plugin

If you previously used `@milo526/homebridge-tuya-web`, `@vhvhxksc4t/homebridge-tuya-web`, or another version of this plugin, read this carefully before starting.

### ⚠️ HomeKit Automations Warning

**If you need to set up a new child bridge during migration, all HomeKit automations tied to your Tuya devices will break and must be recreated manually.** HomeKit does not provide any way to migrate automations between bridges — this is a HomeKit limitation with no workaround.

If you have many automations, weigh that cost before migrating. The new API is more stable long-term, but the one-time migration cost is real.

### Before You Start

- **Back up your `config.json`** — the Homebridge UI's uninstall removes the old plugin's config block, including any device overrides you had set up. Note these down before proceeding.
- **Note your device type overrides** — if you had devices set to a different type than their default (e.g. a smart plug configured as `light`), you'll need to re-apply those in the new plugin's Device Settings.

### Migration Steps

1. Note down all device overrides from the old plugin's settings
2. Install `homebridge-tuya-web-v2` via the Homebridge UI plugin search
3. Configure it with your Tuya IoT Platform credentials (see setup steps below)
4. Re-apply any device type overrides in the new plugin's Device Settings
5. **Disable the old plugin** (do not uninstall yet) and restart Homebridge
6. Verify your devices are working correctly
7. Uninstall the old plugin once satisfied
8. Remove any stale accessories from the Home app by long-pressing the tile and selecting **Remove Accessory**, or via **Homebridge Settings → Remove Single Cached Accessory**

> **Tip:** If Homebridge asks you to set up a new child bridge in HomeKit during this process, doing so will break existing automations. If automation continuity matters, try keeping everything under the main Homebridge bridge rather than a child bridge during the transition.

---

## Prerequisites

This plugin requires a free **Tuya IoT Platform** developer account. This is separate from your Smart Life or Tuya Smart app account — you need both.

- A Smart Life or Tuya Smart app account with your devices already added
- A Tuya IoT Platform developer account (free, created at [platform.tuya.com](https://platform.tuya.com))

---

## Step 1 — Create a Tuya IoT Platform Account

1. Go to [platform.tuya.com](https://platform.tuya.com) and click **Sign Up**
2. Register using your email address (this is separate from your app account)
3. Log in once your account is confirmed

---

## Step 2 — Create a Cloud Project

1. From the dashboard, navigate to **Cloud → Development**
2. Click **Create Cloud Project**
3. Fill in the project details:
   - **Project Name:** Anything descriptive, e.g. `Homebridge`
   - **Industry:** Smart Home
   - **Development Method:** Smart Home
   - **Data Center:** Choose the region where your Smart Life/Tuya app account was originally registered — this is **not** based on your physical location. If you're unsure, check your Smart Life app account settings, or try Western America first if your account was created in the US or Canada (see [Region Reference](#region-reference) below)
4. Click **Create**
5. On the **Authorize API Services** screen that appears, keep the pre-selected services and click **Authorize**. The essential services are:
   - IoT Core
   - Authorization Token Management
   - Smart Home Basic Service

---

## Step 3 — Get Your API Credentials

1. After the project is created, click the **Overview** tab
2. Copy your **Access ID (Client ID)** and **Access Secret (Client Secret)** — you will need these for the plugin config

---

## Step 4 — Link Your Smart Life App Account

This step connects your existing Tuya/Smart Life devices to the API project.

1. In your project, click the **Devices** tab
2. Click **Link App Account**
3. Click **Add App Account**
4. Select **Tuya App Account Authorization** from the dropdown
5. A QR code will appear — scan it using the **Smart Life** or **Tuya Smart** app
6. Your devices will appear in the **All Devices** tab once linked

> **Important:** If your devices don't appear after linking, the data center region is almost certainly wrong. The region is tied to where your Smart Life/Tuya account was **originally created**, not your physical location. You may need to delete the project and recreate it with a different region, or update your Smart Life account's region to match.

---

## Step 5 — Install the Plugin

Install via npm (once published) or via the Homebridge UI plugin search:

```bash
npm install -g @vhvhxksc4t/homebridge-tuya-web
```

Or install the latest from GitHub directly on your Homebridge host:

```bash
# From the Homebridge terminal
git clone https://github.com/vhvhxksc4t-sudo/homebridge-tuya-web.git /tmp/tuya-plugin
cp -r /tmp/tuya-plugin /var/lib/homebridge/node_modules/@vhvhxksc4t/homebridge-tuya-web
cd /var/lib/homebridge/node_modules/@vhvhxksc4t/homebridge-tuya-web && npm install --production
sudo hb-service restart
```

---

## Step 6 — Configure the Plugin

Add the following to your Homebridge `config.json` under `platforms`, replacing the placeholder values with your actual credentials from Step 3:

```json
{
  "platform": "TuyaWebPlatform",
  "name": "TuyaWebPlatform",
  "options": {
    "accessId": "your_access_id_here",
    "accessSecret": "your_access_secret_here",
    "region": "us"
  }
}
```

### Options

| Option | Required | Description |
|---|---|---|
| `accessId` | Yes | Access ID from your Tuya IoT Platform project Overview |
| `accessSecret` | Yes | Access Secret from your Tuya IoT Platform project Overview |
| `region` | No | Data center region code. Defaults to `us`. See [Region Reference](#region-reference) |
| `pollingInterval` | No | Seconds between cloud polls for device state updates. Omit to disable polling. Recommended minimum: 30. |

### Region Reference

| Region | Code |
|---|---|
| China | `cn` |
| Western America (US & Canada) | `us` |
| Central Europe | `eu` |
| India | `in` |

---

## Supported Device Types

| Type | HomeKit Service | Notes |
|---|---|---|
| switch | Switch | On/Off |
| outlet | Outlet | On/Off |
| light | Lightbulb | On/Off, Brightness, Color Temperature, Color (where supported by device) |
| dimmer | Lightbulb | On/Off, Brightness |
| fan | Fan | On/Off, Speed |
| cover | Window Covering | Open/Close/Stop |
| climate | Thermostat | Mode, Target Temperature, Current Temperature |
| scene | Switch | One-way trigger |
| garage | Garage Door Opener | Open/Close |
| temperature_sensor | Temperature Sensor | Read-only |
| window | Window | Open/Close |

---

## Advanced Configuration

### Override Device Type

The API determines device type from the Tuya device category. If a device is mapped to the wrong type, you can override it:

```json
{
  "platform": "TuyaWebPlatform",
  "name": "TuyaWebPlatform",
  "options": { "accessId": "...", "accessSecret": "...", "region": "us" },
  "defaults": [
    {
      "id": "<device name or Tuya device ID>",
      "device_type": "outlet"
    }
  ]
}
```

> After changing a device type, remove its cached accessory in the Homebridge UI (`Settings → Remove Single Cached Accessory`) to avoid duplicates.

### Thermostat Settings

Thermostats support additional per-device configuration for temperature range and scaling:

```json
"defaults": [
  {
    "id": "<device name or ID>",
    "device_type": "climate",
    "min_temper": 16,
    "max_temper": 30,
    "current_temperature_factor": 0.1
  }
]
```

- `min_temper` / `max_temper` — Temperature range in °C (half-degree increments)
- `current_temperature_factor` — Multiplier applied to the raw sensor value. Use `0.1` if HomeKit shows e.g. `220` when the actual temperature is `22°C`

### Hide Devices

Prevent specific devices from appearing in HomeKit (useful when another plugin already exposes them):

```json
{
  "platform": "TuyaWebPlatform",
  "name": "TuyaWebPlatform",
  "options": { "accessId": "...", "accessSecret": "...", "region": "us" },
  "hiddenAccessories": ["device name or ID", "another device"]
}
```

### Scenes

Scenes are hidden by default. To expose them in HomeKit:

**All scenes:**
```json
"scenes": true
```

**Specific scenes only:**
```json
"scenes": true,
"scenesWhitelist": ["Scene name or ID"]
```

---

## Support

This is a community-maintained plugin with no official support.

- **Bugs:** [Open an issue](https://github.com/vhvhxksc4t-sudo/homebridge-tuya-web/issues)
- **Community help:** [Homebridge Discord](https://discord.gg/kqNCe2D) or [Homebridge Reddit](https://www.reddit.com/r/homebridge/)

---

## License

MIT — see [LICENSE](LICENSE)
