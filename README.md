# My Retouch Panel for Photoshop

A free, open-source **UXP retouching panel** for Adobe Photoshop — a compact 208 px docked panel
with one-click Dodge & Burn, Frequency Separation, luminosity selections and everyday retouch helpers.

No licenses, no accounts, no servers, no obfuscation. Just HTML + CSS + a single readable `index.js`.

![My Retouch Panel](docs/screenshot.png)

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

1. Copy the `MyRetouchPanel` folder to:
   - **macOS:** `~/Library/Application Support/Adobe/UXP/Plugins/External/`
   - **Windows:** `%APPDATA%\Adobe\UXP\Plugins\External\`
2. Register it in `PluginsInfo/v1/PS.json` (same `Adobe/UXP` folder) by adding:

```json
{
  "hostMinVersion": "23.3.0",
  "name": "My Retouch Panel",
  "path": "$localPlugins/External/MyRetouchPanel",
  "pluginId": "com.kimi.myretouchpanel",
  "status": "enabled",
  "type": "uxp",
  "versionString": "1.0.0"
}
```

3. Restart Photoshop → `Plugins → My Retouch Panel`.

**Alternative (developer route):** open [UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/installation/),
`Add Plugin…` → select `MyRetouchPanel/manifest.json` → `Load`.

Requires Photoshop **23.3 or newer** (UXP panels).

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

## License

MIT — do whatever you want.
