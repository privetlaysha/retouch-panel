# LAYSHA Retouch for Photoshop

A free, open-source **UXP retouching panel** for Adobe Photoshop — a compact 208 px docked panel
with one-click Dodge & Burn, Frequency Separation, luminosity selections and everyday retouch helpers.

No licenses, no accounts, no servers, no obfuscation. Just HTML + CSS + a single readable `index.js`.

![LAYSHA Retouch](docs/screenshot.png)

## Why

Commercial retouch panels are usually just a thin HTML shell over Photoshop `batchPlay` calls
locked behind license servers. This panel does the same job with fully open, commented code that
you can read, tweak and extend.

## Features

**Tools row** — Brush, Spot Healing Brush, Remove, Clone Stamp, Crop.

**DODGE & BURN**
- `DB Curves` — Dodge + Burn curves group with black (hide-all) masks, brush auto-selected
- `D` / `B` — single Dodge or Burn curve
- Global D&B 50% gray layer (Soft Light), 50% gray Overlay layer
- Visual Aid check layers (B/W view, strong contrast, alt)

**SKIN WORK & FS**
- `New Skin` — Frequency Separation (Gaussian Blur 8 px)
- `Median` — Frequency Separation (Median 10 px)
- `Add Texture` — digital skin texture (50% gray + monochromatic noise, Overlay)
- `Remove Hairs` — fresh layer + Spot Healing Brush

**SELECTIONS & MASKING**
- Lasso, Object Selection, Selection Brush, Select Subject, Rectangular Marquee, Pen
- `Luminosity` — luminosity selection from the RGB channel, `+` / `−` channel ops, `Invert`

**FACE, MAKEUP & HAIR**
- Skin Tone, Anti-Pink, Anti-Redness — Hue/Saturation layers with black masks
- Eyes / Teeth brightening layers (paint on the mask)
- Glow (Blur 30 px + Soft Light 50%, masked)
- Hair Highlights curve + quick white/black brush presets

**FINISH & EXPORT**
- Solar Curve (tone-check), Flatten Image, Image Size dialog
- Over-Saturation check layer (Selective Color trick)

**MY ACTIONS**
- `A`–`F` run your own actions named `A`–`F` from an action set called **My Panel Actions**
- Quick adjustment layers: Levels, Curves, Hue/Saturation, Selective Color, Color Balance
- Liquify, Sharpen (Stamp Visible + High Pass + Overlay), New Layer, Stamp Visible,
  120 % size, Save for Web (2048 px), Save As

## Installation

No installer needed — UXP panels are plain folders. Two panels are included; install either or both:
**MyRetouchPanel** (dark, v5 layout) and **MyRetouchPanel6** (v6 layout with tabs and themes).

### Step 1 — Download

On this GitHub page click **Code → Download ZIP**, then unzip it. (Or `git clone` if you use git.)

### Step 2 — Copy the panel folder(s)

Copy `MyRetouchPanel` and/or `MyRetouchPanel6` into Photoshop's UXP plugins folder:

- **macOS:** `~/Library/Application Support/Adobe/UXP/Plugins/External/`
  (in Finder press `⌘⇧G` and paste the path; create the folders if they don't exist)
- **Windows:** `%APPDATA%\Adobe\UXP\Plugins\External\`
  (paste into Explorer's address bar)

### Step 3 — Register the panel(s)

In the same `Adobe/UXP` folder open `PluginsInfo/v1/PS.json`
(create the folders and the file if missing). Add one entry per panel inside `"plugins": [ … ]`:

```json
{
  "plugins": [
    {
      "hostMinVersion": "23.3.0",
      "name": "LAYSHA Retouch",
      "path": "$localPlugins/External/MyRetouchPanel",
      "pluginId": "com.kimi.myretouchpanel",
      "status": "enabled",
      "type": "uxp",
      "versionString": "1.0.0"
    },
    {
      "hostMinVersion": "26.0.0",
      "name": "LAYSHA Retouch 6",
      "path": "$localPlugins/External/MyRetouchPanel6",
      "pluginId": "com.kimi.myretouchpanel6",
      "status": "enabled",
      "type": "uxp",
      "versionString": "1.0.0"
    }
  ]
}
```

If the file already has other plugins, keep them — just add these entries.

### Step 4 — Restart Photoshop

`Plugins` menu → **LAYSHA Retouch** / **LAYSHA Retouch 6**. Done.

**Alternative (developer route):** open [UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/installation/),
`Add Plugin…` → select `MyRetouchPanel/manifest.json` → `Load`. No PS.json editing needed.

Requires Photoshop **23.3 or newer** (UXP panels).

### Коротко по-русски

1. **Code → Download ZIP** на этой странице, распаковать.
2. Папку `MyRetouchPanel6` (или `MyRetouchPanel`) скопировать в
   `~/Library/Application Support/Adobe/UXP/Plugins/External/` (в Finder: `⌘⇧G`, вставить путь).
3. В файле `Adobe/UXP/PluginsInfo/v1/PS.json` добавить запись панели (пример выше —
   если файла нет, создать его целиком по образцу).
4. Перезапустить Photoshop → меню **Plugins → LAYSHA Retouch 6**.

## Project structure

```
MyRetouchPanel/
├── manifest.json   # UXP manifest (panel 208×743, docked)
├── index.html      # panel markup
├── css/styles.css  # dark theme
├── index.js        # all logic — readable batchPlay descriptors
├── img/            # button icons
└── lib/            # jQuery (optional, kept for compatibility)
```

## How it works

Every button calls a function in the `Scripts` map inside `index.js`. Each function is built from
small Photoshop Action Descriptors (`dMakeLayer`, `dSetCurve`, `dMaskHideAll`, …) executed via
`action.batchPlay()`. Click handling uses `data-cmd` attributes + a delegated `click` listener
because UXP blocks inline `onClick` handlers.

Want a new button? Add a `<div data-cmd="MyThing">`, write `Scripts.MyThing = …`, reload. That's it.

## My Actions (buttons A–F)

The **A B C D E F** buttons run *your own* Photoshop actions. The rules:

1. Open the **Actions** panel in Photoshop (`Window → Actions`).
2. Recommended: create an action **set** named exactly `My Panel Actions` and record actions
   named exactly `A`, `B`, `C`, `D`, `E`, `F` (single letters) inside it.
3. Done — button A plays action `A`, button B plays `B`, and so on. Works in both panels.

If no `My Panel Actions` set exists, the panel falls back to the first action named `A`–`F`
found in *any* set — so a single action named `A` anywhere in your Actions panel already binds
to button A.

If a slot has no matching action, the panel says so on its info screen instead of failing
(`"A": no action in set "My Panel Actions"`).

По-русски: создай в панели **Операции (Actions)** набор `My Panel Actions`, а в нём экшены
с именами `A`–`F` — кнопки панели будут запускать их по букве.

## License

MIT — do whatever you want.

## Version 6 UI (MyRetouchPanel6/)

A second variant of the panel recreating the 6.0 layout: light/dark/black themes, Skin & Face tabs,
a Visual Aid selector, status screen, tool flyouts and a New Skin drawer with FS sliders.
Everything 5.2 does, plus:

- **Select People** — eyes / lips / teeth / hair / body selections (PS 25.9+, experimental descriptor)
- **Auto Skin Mask** — one-click facial skin isolation into a masked adjustment layer
- **Film Grain** — full-frame grain layer
- **Smart Liquify** — converts to Smart Object first, so Liquify stays editable
- **Image Size with Preserve Details 2.0**

![LAYSHA Retouch 6](docs/screenshot-v6.png)
