"""Render the Android launcher icons (adaptive foreground + legacy PNGs) from the app logo design."""
from pathlib import Path
from PIL import Image, ImageDraw

RES = Path(__file__).resolve().parent.parent / 'android' / 'app' / 'src' / 'main' / 'res'
GREEN, GOLD, CREAM = (31, 107, 82), (232, 217, 160), (246, 236, 196)


def draw_logo(img, box):
    """Open book with an eight-point star above it, drawn inside `box` = (x, y, size)."""
    x0, y0, size = box
    d = ImageDraw.Draw(img)
    k = size / 120

    def P(x, y):
        return (x0 + x * k, y0 + y * k)

    # star: two squares, one rotated 45 degrees
    cx, cy, r = 60, 29, 10
    d.polygon([P(cx - r, cy - r), P(cx + r, cy - r), P(cx + r, cy + r), P(cx - r, cy + r)], fill=GOLD)
    q = r * 1.4142
    d.polygon([P(cx, cy - q), P(cx + q, cy), P(cx, cy + q), P(cx - q, cy)], fill=GOLD)
    d.ellipse([P(cx - 4.5, cy - 4.5), P(cx + 4.5, cy + 4.5)], fill=GREEN)

    def bez(p0, p1, p2, p3, n=24):
        pts = []
        for i in range(n + 1):
            t = i / n
            a = (1 - t) ** 3
            b = 3 * (1 - t) ** 2 * t
            c = 3 * (1 - t) * t ** 2
            e = t ** 3
            pts.append(P(a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]))
        return pts

    left = [P(60, 99)] + bez((60, 99), (48, 89), (32, 87), (17, 91)) + [P(17, 52)] + bez((17, 52), (32, 48), (48, 50), (60, 60))
    right = [P(60, 99)] + bez((60, 99), (72, 89), (88, 87), (103, 91)) + [P(103, 52)] + bez((103, 52), (88, 48), (72, 50), (60, 60))
    d.polygon(left, fill=GOLD)
    d.polygon(right, fill=CREAM)
    for dy in (63, 72, 81):
        for sx in (1, -1):
            a, b = (26, 53) if sx == 1 else (94, 67)
            d.line([P(a, dy), P(a + (b - a) * 0.5, dy - 2), P(b, dy + 4)], fill=GREEN, width=max(1, int(2 * k)))
    d.line([P(60, 60), P(60, 99)], fill=GREEN, width=max(1, int(2.5 * k)))


def foreground():
    s = 432 * 2   # 108dp @ xxxhdpi, drawn 2x then downsampled
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    size = s * 0.52               # keep inside the adaptive-icon safe zone (66dp of 108dp)
    draw_logo(img, ((s - size) / 2, (s - size) / 2 + s * 0.01, size))
    return img.resize((432, 432), Image.LANCZOS)


def legacy(px):
    s = px * 4
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=GREEN)
    size = s * 0.74
    draw_logo(img, ((s - size) / 2, (s - size) / 2, size))
    return img.resize((px, px), Image.LANCZOS)


(RES / 'drawable-nodpi').mkdir(parents=True, exist_ok=True)
foreground().save(RES / 'drawable-nodpi' / 'ic_foreground.png')
for name, px in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
    (RES / f'mipmap-{name}').mkdir(parents=True, exist_ok=True)
    legacy(px).save(RES / f'mipmap-{name}' / 'ic_launcher.png')
print('icons written')
