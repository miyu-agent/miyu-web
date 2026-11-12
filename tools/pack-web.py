#!/usr/bin/env python3
# 把网页打成软件包文件 `webui-<版本>-<系统>.miyu`（包编号 webui，核心设计 48）（蓝图 web-ui.md「怎么走」第一条第 6 款，2026-10-29：新装的 Miyu 只有核心，网页要从软件源装）。
# 照装好的样子搭一个包文件夹，再交核心的 `miyu pkg pack` 打（核心 packages.md、cli/pkg.md 的 pack）：
#   package.toml  这个仓库的 webui/package.toml 原样（2026-11-04 起清单自己写 version、targets，W-1095：发版照官方打包模板，
#                 模板照清单的 version 核对标签）；version 要和 Cargo.toml 的工作区版本一样，--target 要在 targets 里
#   web.json、matugen/  这个仓库的 webui/ 原样
#   THIRD-PARTY-LICENSES.txt  这个仓库的 webui/ 原样（cargo xtask notices 生成的第三方许可证清单），LICENSE 照仓库根的
#   loading.html  这个仓库的 webui/ 原样（桌面端启动时的等待页，node tools/loading.mjs 生成）
#   pages/        web-demo 里给浏览器的八样：index.html、manifest.webmanifest（应用清单，AP-6）、distro.json、src、styles、packages、resources、vendor
#   bin/miyu-web  --binary 给的程序（这一种系统上编好的 release，脚本不编）
# 清单的 targets 写全了三种（托盘程序装进资源目录的也是这一份，写全了在这三种上都认）。
#   python3 tools/pack-web.py --miyu <主程序 miyu> --binary target/release/miyu-web --target linux-x86_64 --out <目录>
#   python3 tools/pack-web.py --stage <目录> --binary … --target …   只搭包文件夹、不打（发版时交给官方打包模板打，release.yml）
import argparse, json, pathlib, re, shutil, subprocess, tempfile, tomllib

ROOT = pathlib.Path(__file__).resolve().parent.parent
# 包编号：包文件夹叫这个名字，pkg pack 照文件夹名定编号、出的文件名
PACKAGE = 'webui'
PAGES = ['index.html', 'manifest.webmanifest', 'distro.json', 'src', 'styles', 'packages', 'resources', 'vendor']
TARGETS = ['linux-x86_64', 'linux-aarch64', 'macos-aarch64', 'windows-x86_64']


def workspace_version():
    text = (ROOT / 'Cargo.toml').read_text(encoding='utf-8')
    section = re.search(r'^\[workspace\.package\]\n(.*?)(?=^\[|\Z)', text, re.M | re.S)
    found = re.search(r'^version\s*=\s*"([^"]+)"', section.group(1) if section else '', re.M)
    if not found:
        raise SystemExit('Cargo.toml 的 [workspace.package] 里没有 version')
    return found.group(1)


def manifest(target):
    """清单原样：version 要和工作区版本一样，--target 要在 targets 里。"""
    text = (ROOT / PACKAGE / 'package.toml').read_text(encoding='utf-8')
    data = tomllib.loads(text).get('package', {})
    version, targets = data.get('version'), data.get('targets') or []
    if version != workspace_version():
        raise SystemExit(f'{PACKAGE}/package.toml 的 version {version!r} 和 Cargo.toml 的工作区版本 {workspace_version()!r} 不一样')
    if target not in targets:
        raise SystemExit(f'{target} 不在 {PACKAGE}/package.toml 的 targets 里：{targets}')
    return text


def stage(pkg, binary, target):
    """照装好的样子搭包文件夹 `pkg`。"""
    pkg.mkdir(parents=True)
    (pkg / 'package.toml').write_text(manifest(target), encoding='utf-8')
    shutil.copy2(ROOT / PACKAGE / 'web.json', pkg / 'web.json')
    shutil.copytree(ROOT / PACKAGE / 'matugen', pkg / 'matugen')
    # 许可证：自己的（AGPL-3.0-or-later）和第三方的清单，随包发（核心 licenses.md「第三方许可证清单」第 7 条）
    shutil.copy2(ROOT / PACKAGE / 'THIRD-PARTY-LICENSES.txt', pkg / 'THIRD-PARTY-LICENSES.txt')
    # 桌面端启动时的等待页（tools/loading.mjs 生成，外壳从资源目录读）
    shutil.copy2(ROOT / PACKAGE / 'loading.html', pkg / 'loading.html')
    shutil.copy2(ROOT / 'LICENSE', pkg / 'LICENSE')
    (pkg / 'pages').mkdir()
    for name in PAGES:
        src = ROOT / 'web-demo' / name
        (shutil.copytree if src.is_dir() else shutil.copy2)(src, pkg / 'pages' / name)
    (pkg / 'bin').mkdir()
    name = 'miyu-web.exe' if target.startswith('windows') else 'miyu-web'
    shutil.copy2(binary, pkg / 'bin' / name)
    (pkg / 'bin' / name).chmod(0o755)


def main():
    ap = argparse.ArgumentParser(description='把网页打成软件包文件')
    ap.add_argument('--miyu', help='主程序 miyu（打包用它的 pkg pack，不连核心）；写了 --stage 的不用')
    ap.add_argument('--binary', required=True, help='这一种系统上编好的 miyu-web（release）')
    ap.add_argument('--target', required=True, choices=TARGETS, help='打给哪一种系统，和 --binary 对上')
    ap.add_argument('--out', help='包文件写到哪个目录')
    ap.add_argument('--stage', help='只搭包文件夹（这个目录还不能有），不打：发版时交给官方打包模板（release.yml）')
    args = ap.parse_args()

    binary = pathlib.Path(args.binary).resolve()
    if not binary.is_file():
        raise SystemExit(f'没有程序：{binary}')
    if args.stage:
        folder = pathlib.Path(args.stage)
        if folder.exists():
            raise SystemExit(f'{folder} 已经有了')
        stage(folder, binary, args.target)
        print(folder)
        return
    if not args.miyu or not args.out:
        raise SystemExit('打包要 --miyu 和 --out（只搭文件夹的写 --stage）')
    with tempfile.TemporaryDirectory(prefix='miyu-pack-web-') as scratch:
        pkg = pathlib.Path(scratch) / PACKAGE
        stage(pkg, binary, args.target)
        done = subprocess.run([args.miyu, 'pkg', 'pack', str(pkg), '--target', args.target, '-o', args.out, '--format', 'json'],
                              check=True, capture_output=True, text=True)
    print(json.dumps(json.loads(done.stdout), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
