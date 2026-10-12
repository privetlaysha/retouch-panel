Montserrat — LOCAL (no CDN)

Drop these two files here so the panel uses Montserrat offline:
  - Montserrat-Regular.woff2   (weight 400)
  - Montserrat-SemiBold.woff2  (weight 600)

Get them free from Google Fonts (fonts.google.com/specimen/Montserrat) or
fontsource (github.com/fontsource/font-files -> montserrat). Until they are
present the panel falls back to the system sans stack (system-ui / Segoe UI /
Roboto / Helvetica / Arial) - still no network dependency.


Status Screen pixel fonts (both open-license, SIL OFL):
  - VT323-Regular.woff2        (fonts.google.com/specimen/VT323) - main LCD text
  - PressStart2P-Regular.woff2 (fonts.google.com/specimen/Press+Start+2P) - optional chunky variant
Drop them in this folder; until then the Screen uses a monospace fallback.
