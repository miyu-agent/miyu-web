#!/usr/bin/env python3
# 第一次引导的像素样子用的两款字（蓝图 web.md「第一次引导」第 2 条，2026-10-19 项目主人选的「像素关卡」）：中文标题的 ZCOOL QingKe HuangYou
# 只截引导里会出现的字（软件包 welcome 的全部字、setup 的 welcome 一节、settings 的 onboard 一节，三种语言，加上全部 ASCII）；英文的
# Press Start 2P 原样拷过来不动（它的授权保留了字体名，截过、转过格式的就不能再叫这个名字）。两款都是 SIL OFL 1.1。改了引导的字以后照这个重做：
#   python3 tools/oobe-font.py --zcool <ZCOOLQingKeHuangYou.ttf> --press <PressStart2P.ttf>
# 原文件从 Google Fonts 取（fonts.google.com 的 ZCOOL QingKe HuangYou、Press Start 2P）。
import argparse, json, pathlib, shutil, subprocess, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'web-demo'
OUT = ROOT / 'packages' / 'welcome' / 'fonts'


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from strings(v)


def text():
    chars = set(chr(c) for c in range(0x20, 0x7f))
    welcome = json.loads((ROOT / 'packages/welcome/manifest.json').read_text(encoding='utf-8'))
    setup = json.loads((ROOT / 'packages/setup/manifest.json').read_text(encoding='utf-8'))
    settings = json.loads((ROOT / 'packages/settings/manifest.json').read_text(encoding='utf-8'))
    parts = [welcome.get('text', {})]
    parts += [lang.get('welcome', {}) for lang in setup.get('text', {}).values()]
    parts += [lang.get('onboard', {}) for lang in settings.get('text', {}).values()]
    for part in parts:
        for s in strings(part):
            chars.update(s)
    return ''.join(sorted(chars))


def main():
    ap = argparse.ArgumentParser(description='重做第一次引导用的两款字')
    ap.add_argument('--zcool', required=True, help='ZCOOLQingKeHuangYou 原文件（ttf）')
    ap.add_argument('--press', required=True, help='PressStart2P 原文件（ttf）')
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', suffix='.txt', delete=False) as f:
        f.write(text())
        chars = f.name
    subprocess.run(['pyftsubset', args.zcool, f'--text-file={chars}', '--flavor=woff2', '--layout-features=*',
                    f'--output-file={OUT / "zcool-qingke.woff2"}'], check=True)
    shutil.copyfile(args.press, OUT / 'press-start.ttf')
    for p in sorted(OUT.glob('*.woff2')) + sorted(OUT.glob('*.ttf')):
        print(p.name, p.stat().st_size)


if __name__ == '__main__':
    main()
