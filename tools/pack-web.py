#!/usr/bin/env python3
# 把网页打成软件包文件 `miyu-webui-<版本>-<系统>.miyu`（包编号 miyu-webui，核心设计 48）（蓝图 web-ui.md「怎么走」第一条第 6 款，2026-10-29：新装的 Miyu 只有核心，网页要从软件源装）。
# 照装好的样子搭一个包文件夹，再交核心的 `miyu pkg pack` 打（核心 packages.md、cli/pkg.md 的 pack）：
#   package.toml  这个仓库的 miyu-webui/package.toml，[package] 里补上版本（照 Cargo.toml 的工作区版本）和 targets（照 --target）
#   web.json、matugen/  这个仓库的 miyu-webui/ 原样
#   pages/        web-demo 里给浏览器的七样：index.html、distro.json、src、styles、packages、resources、vendor
#   bin/miyu-web  --binary 给的程序（这一种系统上编好的 release，脚本不编）
# 仓库里的清单不写 targets：它也是随 Miyu 一起装进资源目录的那一份，写死了别的系统就装不上。
#   python3 tools/pack-web.py --miyu <主程序 miyu> --binary target/release/miyu-web --target linux-x86_64 --out <目录>
import argparse, json, pathlib, re, shutil, subprocess, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
# 包编号：包文件夹叫这个名字，pkg pack 照文件夹名定编号、出的文件名
PACKAGE = 'miyu-webui'
PAGES = ['index.html', 'distro.json', 'src', 'styles', 'packages', 'resources', 'vendor']
TARGETS = ['linux-x86_64', 'linux-aarch64', 'macos-aarch64', 'windows-x86_64']


def workspace_version():
    text = (ROOT / 'Cargo.toml').read_text(encoding='utf-8')
    section = re.search(r'^\[workspace\.package\]\n(.*?)(?=^\[|\Z)', text, re.M | re.S)
    found = re.search(r'^version\s*=\s*"([^"]+)"', section.group(1) if section else '', re.M)
    if not found:
        raise SystemExit('Cargo.toml 的 [workspace.package] 里没有 version')
    return found.group(1)


def manifest(version, target):
    text = (ROOT / PACKAGE / 'package.toml').read_text(encoding='utf-8')
    if re.search(r'^(version|targets)\s*=', text, re.M):
        raise SystemExit(f'{PACKAGE}/package.toml 自己写了 version 或 targets：脚本不覆盖，先拿掉')
    head = re.search(r'^\[package\]\n', text, re.M)
    if not head:
        raise SystemExit(f'{PACKAGE}/package.toml 里没有 [package]')
    added = f'version = "{version}"\ntargets = ["{target}"]\n'
    return text[:head.end()] + added + text[head.end():]


def main():
    ap = argparse.ArgumentParser(description='把网页打成软件包文件')
    ap.add_argument('--miyu', required=True, help='主程序 miyu（打包用它的 pkg pack，不连核心）')
    ap.add_argument('--binary', required=True, help='这一种系统上编好的 miyu-web（release）')
    ap.add_argument('--target', required=True, choices=TARGETS, help='打给哪一种系统，和 --binary 对上')
    ap.add_argument('--out', required=True, help='包文件写到哪个目录')
    ap.add_argument('--version', help='版本，不写照 Cargo.toml 的工作区版本')
    args = ap.parse_args()

    binary = pathlib.Path(args.binary).resolve()
    if not binary.is_file():
        raise SystemExit(f'没有程序：{binary}')
    version = args.version or workspace_version()
    with tempfile.TemporaryDirectory(prefix='miyu-pack-web-') as scratch:
        pkg = pathlib.Path(scratch) / PACKAGE
        pkg.mkdir()
        (pkg / 'package.toml').write_text(manifest(version, args.target), encoding='utf-8')
        shutil.copy2(ROOT / PACKAGE / 'web.json', pkg / 'web.json')
        shutil.copytree(ROOT / PACKAGE / 'matugen', pkg / 'matugen')
        (pkg / 'pages').mkdir()
        for name in PAGES:
            src = ROOT / 'web-demo' / name
            (shutil.copytree if src.is_dir() else shutil.copy2)(src, pkg / 'pages' / name)
        (pkg / 'bin').mkdir()
        name = 'miyu-web.exe' if args.target.startswith('windows') else 'miyu-web'
        shutil.copy2(binary, pkg / 'bin' / name)
        (pkg / 'bin' / name).chmod(0o755)
        done = subprocess.run([args.miyu, 'pkg', 'pack', str(pkg), '--target', args.target, '-o', args.out, '--format', 'json'],
                              check=True, capture_output=True, text=True)
    print(json.dumps(json.loads(done.stdout), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
