#!/usr/bin/env python3
# 像素风皮肤的图标（蓝图 web.md「皮肤」第 6 条）：把界面用的 Lucide 图标（web-demo/resources/lucide.json）一个个画到 12×12 的格子上，
# 一格是 24 的画布上 2 个单位；格子里落到线的就涂满，横着连在一起的并成一段，一个图标一条路径。写成和 lucide.json 一个写法的图标表
# （packages/skin-pixel/icons.json），skin 包照它换掉页面上的图标。改了 lucide.json 以后照这个重做：
#   python3 tools/pixel-icons.py
# 要本机有 rsvg-convert（librsvg）和 Pillow。
import argparse, io, json, pathlib, subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'web-demo'


def svg_of(shapes, stroke):
    parts = []
    for tag, attrs in shapes:
        a = ' '.join(f'{k}="{v}"' for k, v in attrs.items())
        parts.append(f'<{tag} {a}/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="#000" '
            f'stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round">{"".join(parts)}</svg>')


def cells(shapes, grid, stroke, cut):
    from PIL import Image
    png = subprocess.run(['rsvg-convert', '--format', 'png'], input=svg_of(shapes, stroke).encode(), capture_output=True, check=True).stdout
    img = Image.open(io.BytesIO(png)).convert('RGBA')
    alpha = img.getchannel('A').resize((grid, grid), Image.BOX)
    return [[alpha.getpixel((x, y)) / 255 >= cut for x in range(grid)] for y in range(grid)]


def rects(on, unit):
    """横着连在一起的格子并成一段，整个图标写成一条路径"""
    d = []
    for y, row in enumerate(on):
        x = 0
        while x < len(row):
            if not row[x]:
                x += 1
                continue
            start = x
            while x < len(row) and row[x]:
                x += 1
            d.append(f'M{start * unit} {y * unit}h{(x - start) * unit}v{unit}h-{(x - start) * unit}z')
    return [['path', {'d': ''.join(d), 'fill': 'currentColor', 'stroke': 'none'}]] if d else []


def main():
    ap = argparse.ArgumentParser(description='把 Lucide 图标画成像素格子')
    ap.add_argument('--grid', type=int, default=12, help='一边几格（24 的画布要能整除）')
    ap.add_argument('--stroke', type=float, default=2.4, help='先照多粗的线画，再落到格子上')
    ap.add_argument('--cut', type=float, default=0.34, help='一格里线占多少才涂满（0–1）')
    ap.add_argument('--out', default=str(ROOT / 'packages' / 'skin-pixel' / 'icons.json'), help='写到哪')
    args = ap.parse_args()
    unit = 24 // args.grid
    icons = json.loads((ROOT / 'resources' / 'lucide.json').read_text())['icons']
    table = {name: rects(cells(shapes, args.grid, args.stroke, args.cut), unit) for name, shapes in icons.items()}
    note = f'像素风的图标：照 resources/lucide.json 画到 {args.grid}×{args.grid} 的格子上（tools/pixel-icons.py 生成，别手改）'
    pathlib.Path(args.out).write_text(json.dumps({'note': note, 'icons': table}, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(table)} 个图标 → {args.out}')


if __name__ == '__main__':
    main()
