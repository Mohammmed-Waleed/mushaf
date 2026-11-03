"""Render the app icon (same design as icons/icon.svg) to PNG at the sizes phones ask for."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'icons'
GREEN, GOLD = (31, 107, 82), (232, 217, 160)


def icon(size, pad=0.0):
    s = size * 4                      # draw large, then downsample for smooth edges
    img = Image.new('RGB', (s, s), GREEN)
    d = ImageDraw.Draw(img)
    k = s / 512
    inset = pad * s                   # extra margin for maskable icons
    def box(x0, y0, x1, y1):
        c = s / 2
        sc = 1 - 2 * pad
        return [c + (x0 * k - c) * sc, c + (y0 * k - c) * sc, c + (x1 * k - c) * sc, c + (y1 * k - c) * sc]
    d.rounded_rectangle(box(96, 76, 416, 436), radius=18 * k, outline=GOLD, width=max(2, int(10 * k * (1 - 2 * pad))))
    d.rounded_rectangle(box(116, 96, 396, 416), radius=8 * k, outline=GOLD, width=max(1, int(4 * k * (1 - 2 * pad))))
    d.line([box(256, 96, 256, 96)[0:2], box(256, 416, 256, 416)[0:2]], fill=GOLD, width=max(1, int(4 * k * (1 - 2 * pad))))
    for r, col in ((46, GOLD), (30, GREEN), (10, GOLD)):
        d.ellipse(box(256 - r, 256 - r, 256 + r, 256 + r), fill=col)
    return img.resize((size, size), Image.LANCZOS)


for name, size, pad in (('icon-192.png', 192, 0), ('icon-512.png', 512, 0), ('icon-maskable-512.png', 512, 0.1), ('apple-touch-icon.png', 180, 0)):
    icon(size, pad).save(OUT / name)
    print('wrote', name)
