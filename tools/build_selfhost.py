"""Build a self-hosted static tree (Cloudflare Pages / R2 / nginx) from this repo.

Usage:
    python tools/build_selfhost.py --base https://sources.example.com/ [--out public] [--clean]

What it does:
    1. Reads scripts (comic/photo/movie/video/audiobook) and metadata/catalog.json as-is.
    2. Rewrites every subscription manifest so its URLs point at --base instead of
       raw.githubusercontent.com / cdn.jsdelivr.net (the two GitHub routes).
    3. Emits subscriptions/all.json whose section entries point at the local
       category manifests (no content-addressed hash names needed: we control cache).
    4. Writes a `_headers` file that disables edge caching, so a re-deploy is
       visible immediately.

The output directory is meant to be uploaded wholesale:
    npx wrangler pages deploy public --project-name <project>
    aws s3 sync public s3://<bucket> --endpoint-url https://<account>.r2.cloudflarestorage.com
"""
import argparse
import json
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE_DIRS = ('comic', 'photo', 'movie', 'video', 'audiobook', 'web')
RAW = 'https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/'
CDN = 'https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/'
# 总订阅里只保留这几份清单
ALL_SECTIONS = {
    'comic': ('comic', 'photo'),
    'video': ('movie', 'video', 'audiobook'),
}


def normalize_base(value):
    base = str(value or '').strip()
    if not re.fullmatch(r'https?://[^/\s]+(?:/[^/\s]+)*/?', base):
        raise SystemExit(f'--base 需要形如 https://host/ 的地址，收到：{value!r}')
    return base.rstrip('/') + '/'


def rewrite(text, base):
    """把两条 GitHub 线路的前缀换成自建前缀（顺带统一 LF）。"""
    text = text.replace('\r\n', '\n')
    text = text.replace(RAW, base).replace(CDN, base)
    # metadata/catalog.json 里用的是同一批前缀，但可能带转义斜杠
    text = text.replace(RAW.replace('/', '\\/'), base)
    text = text.replace(CDN.replace('/', '\\/'), base)
    return text


def manifest_sources():
    """要产出的清单：分类 txt + 合并 txt。命名与订阅端一致。"""
    names = ['comic', 'photo', 'movie', 'video', 'audiobook']
    return names + ['comics', 'videos']


def build(base, out, clean=False):
    # 输出目录可能被本地静态服务/杀软占用（Windows 上 rmtree 会 WinError 32），
    # 所以清空失败不致命：下面用「写入当前文件 + 删除过期文件」保证最终内容正确。
    if clean:
        shutil.rmtree(out, ignore_errors=True)
    (out / 'subscriptions').mkdir(parents=True, exist_ok=True)

    copied = 0
    for folder in SOURCE_DIRS:
        src = ROOT / folder
        if not src.is_dir():
            continue
        dst = out / folder
        dst.mkdir(parents=True, exist_ok=True)
        keep = set()
        extensions = ('.html', '.htm') if folder == 'web' else ('.js', '.py')
        for path in sorted(p for p in src.iterdir() if p.is_file() and p.suffix in extensions):
            # 统一成 LF：Windows 工作区的 CRLF 会让自建线路与 GitHub 线路的字节/md5 不一致。
            data = path.read_bytes().replace(b'\r\n', b'\n')
            (dst / path.name).write_bytes(data)
            keep.add(path.name)
            copied += 1
        # 仓库里删掉的源，自建线路上也不能继续提供旧文件
        for stale in (p for p in dst.iterdir() if p.is_file() and p.suffix in extensions):
            if stale.name not in keep:
                try:
                    stale.unlink()
                except OSError as error:
                    print(f'warn: 清理过期脚本失败 {stale.name}: {error}')

    meta_src = ROOT / 'metadata/catalog.json'
    if meta_src.is_file():
        (out / 'metadata').mkdir(parents=True, exist_ok=True)
        (out / 'metadata/catalog.json').write_text(
            rewrite(meta_src.read_text(encoding='utf-8'), base), encoding='utf-8', newline='\n')

    rewritten = 0
    wanted = set(manifest_sources())
    for name in manifest_sources():
        src = ROOT / 'subscriptions' / (name + '.txt')
        if not src.is_file():
            continue
        (out / 'subscriptions' / (name + '.txt')).write_text(
            rewrite(src.read_text(encoding='utf-8'), base), encoding='utf-8', newline='\n')
        rewritten += 1
    for stale in (out / 'subscriptions').glob('*.txt'):
        if stale.stem not in wanted:
            try:
                stale.unlink()
            except OSError as error:
                print(f'warn: 清理过期清单失败 {stale.name}: {error}')

    # 总订阅：直接指向自建的分类清单
    total = {
        'format': 'lume.total-subscription',
        'version': 1,
        'sections': {
            key: [base + 'subscriptions/' + kind + '.txt' for kind in kinds]
            for key, kinds in ALL_SECTIONS.items()
        },
    }
    (out / 'subscriptions/all.json').write_text(
        json.dumps(total, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')

    # 目录索引：方便用浏览器/curl 一眼看出内容是否刷新
    (out / 'index.html').write_text(
        '<!doctype html><meta charset="utf-8"><title>LumeBox sources</title>'
        '<h1>LumeBox 源（自建线路）</h1>'
        '<p><a href="subscriptions/all.json">subscriptions/all.json</a></p>'
        '<ul>' + ''.join(f'<li><a href="subscriptions/{n}.txt">{n}.txt</a></li>' for n in manifest_sources()) + '</ul>'
        f'<p>base: {base}</p>', encoding='utf-8', newline='\n')

    # Cloudflare Pages 的响应头：不缓存，重新部署立即生效
    (out / '_headers').write_text('/*\n  Cache-Control: no-store\n', encoding='utf-8', newline='\n')
    return {'scripts': copied, 'manifests': rewritten}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--base', required=True, help='自建线路的公开根地址，如 https://sources.example.com/')
    parser.add_argument('--out', default='public', help='输出目录（默认 public）')
    parser.add_argument('--clean', action='store_true', help='先清空输出目录')
    args = parser.parse_args()

    base = normalize_base(args.base)
    out = (ROOT / args.out).resolve()
    if ROOT not in out.parents:
        raise SystemExit(f'--out 必须在仓库内：{out}')
    stats = build(base, out, clean=args.clean)
    print(f'base={base} out={out.relative_to(ROOT)}')
    print(f'  scripts  {stats["scripts"]}')
    print(f'  manifests {stats["manifests"]} + all.json')
    print('next: npx wrangler pages deploy ' + args.out + ' --project-name <project>')
    return 0


if __name__ == '__main__':
    sys.exit(main())
