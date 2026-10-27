"""Build deterministic source classifications and backwards-compatible manifests.

Run: python tools/build_catalog.py [--check]
Only reads source headers; never executes adapters or requests media.
"""
import argparse
import hashlib
import json
import pathlib
import re
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = 'https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/'
KINDS = {'comic': '漫画', 'photo': '美图', 'movie': '影视',
         'video': '视频与直播', 'audiobook': '有声小说'}
MOVIES = {'luttt_video', 'gztv5_video', 'jpyy2_video', 'ysxq-boju',
          'a123tv', 'fdzys', 'flixflop', 'duanju2', 'olehdtv', 'huavod'}
# These aliases already share an ID. Keep the original canonical entries rather
# than letting directory order silently replace them with a different adapter.
PREFERRED = {'hstv_video': 'video/好色TV.js',
             'jiuse91_video': 'video/九色91Porny.js'}


def url(path):
    return RAW + path


def read_sources():
    found = {}
    for folder in KINDS:
        for path in sorted((ROOT / folder).glob('*.js')):
            text = path.read_text(encoding='utf-8-sig')
            match = re.search(r'^\s*//\s*@?LumeSource\s*[:=]\s*(\{[^\n]+\})', text, re.M)
            if not match:
                continue  # Legacy manifests with a .js suffix are not adapters.
            meta = json.loads(match[1])
            relative = path.relative_to(ROOT).as_posix()
            found.setdefault(meta['id'], []).append((relative, meta))
    ratings = json.loads((ROOT / 'metadata/content-ratings.json').read_text(encoding='utf-8'))['sources']
    rows = []
    for sid, candidates in found.items():
        preferred = PREFERRED.get(sid)
        canonical = next((pair for pair in candidates if pair[0] == preferred), None)
        if canonical is None:
            # Prefer already-canonical photo/movie/audiobook locations over
            # byte-identical copies left under comic/video for old URLs.
            canonical = next((pair for pair in candidates
                              if pair[0].split('/')[0] in ('photo', 'movie', 'audiobook')),
                             candidates[0])
        path, meta = canonical
        if sid in MOVIES or meta.get('contentCategory') == 'movie':
            kind = 'movie'
        elif meta.get('mediaType') == 'audio' or sid.endswith('_audiobook'):
            kind = 'audiobook'
        elif path.startswith('photo/'):
            kind = 'photo'
        else:
            kind = 'comic' if meta.get('category') == 'comic' else 'video'
        rows.append({
            'id': sid, 'name': meta['name'], 'version': meta['version'],
            'kind': kind, 'appSection': 'comic' if kind in ('comic', 'photo') else 'video',
            'path': path, 'url': url(path),
            'aliases': [p for p, _ in candidates if p != path],
            'rating': ratings.get(sid, {}).get('rating', '18+' if meta.get('contentCategory') == 'adult' else 'unknown'),
            'iconDeclared': bool(meta.get('icon') or meta.get('iconUrl')),
        })
    return sorted(rows, key=lambda row: (list(KINDS).index(row['kind']), row['name'].casefold(), row['id']))


def manifest(rows, heading):
    return '# ' + heading + '\n# 自动生成；修改脚本后运行 python tools/build_catalog.py\n' + ''.join(
        row['url'] + '\n' for row in rows)


CDN = 'https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/'
LEGACY = {
    'all': 'subscriptions/all.json',
    'comics': 'subscriptions/comics.txt', 'photos': 'subscriptions/comics.txt',
    '漫画订阅.js': 'subscriptions/comics.txt',
    'comic/sources.js': 'subscriptions/comics.txt', 'comic/sources.txt': 'subscriptions/comics.txt',
    'photo/sources.txt': 'subscriptions/comics.txt',
    'videos': 'subscriptions/videos.txt', 'movies': 'subscriptions/videos.txt',
    '视频订阅.js': 'subscriptions/videos.txt',
    'video/sources.js': 'subscriptions/videos.txt', 'video/sources.txt': 'subscriptions/videos.txt',
    'movie/sources.txt': 'subscriptions/videos.txt',
    'audiobooks': 'subscriptions/audiobook.txt',
    **{name: 'subscriptions/legacy/' + name + '.txt'
       for name in ('videos-hd', 'videos-18plus', 'videos-hd-cdn', 'videos-18plus-cdn')},
}

LEGACY.update({item['from']: item['to'] for item in json.loads((ROOT / 'metadata/moved-scripts.json').read_text(encoding='utf-8'))})


def build():
    rows = read_sources()
    groups = {kind: [row for row in rows if row['kind'] == kind] for kind in KINDS}
    out = {}
    for kind, label in KINDS.items():
        raw = manifest(groups[kind], label)
        out['subscriptions/' + kind + '.txt'] = raw
        # Every script URL is CDN-hosted too; the route never falls back to raw.
        out['subscriptions/cdn/' + kind + '.txt'] = raw.replace(RAW, CDN)
    for name, kinds in [('comics', ('comic','photo')), ('videos', ('movie','video','audiobook'))]:
        raw = manifest([row for kind in kinds for row in groups[kind]], name)
        out['subscriptions/' + name + '.txt'] = raw
        out['subscriptions/cdn/' + name + '.txt'] = raw.replace(RAW, CDN)
    for is_cdn in (False, True):
        prefix = CDN if is_cdn else RAW
        folder = 'subscriptions/cdn/' if is_cdn else 'subscriptions/'
        def entry(kind, prefix=prefix, folder=folder, is_cdn=is_cdn):
            target = folder + kind + '.txt'
            if not is_cdn:
                return prefix + target
            # CDN 会对同一 URL 长期缓存：用内容哈希做查询串，清单一变 URL 就变，
            # 各边缘都能立刻拿到新版本（App 原样请求，查询串不影响解析）。
            digest = hashlib.sha1(out[target].encode('utf-8')).hexdigest()[:10]
            return prefix + target + '?v=' + digest
        out[folder + 'all.json'] = json.dumps({
            'format': 'lume.total-subscription', 'version': 1,
            'sections': {
                'comic': [entry(kind) for kind in ('comic','photo')],
                'video': [entry(kind) for kind in ('movie','video','audiobook')],
            },
        }, ensure_ascii=False, indent=2) + '\n'
    out['metadata/catalog.json'] = json.dumps({
        'format':'lume.source-catalog', 'version':1,
        'counts':{kind:len(members) for kind,members in groups.items()},
        'verification':'Metadata inventory only; not a live cover or playback availability report.',
        'sources':rows,
    }, ensure_ascii=False, indent=2) + '\n'
    out['metadata/legacy-paths.json'] = json.dumps(LEGACY, ensure_ascii=False, indent=2) + '\n'
    for name in ('videos-hd', 'videos-18plus'):
        text = (ROOT / ('subscriptions/legacy/' + name + '.txt')).read_text(encoding='utf-8')
        for old, new in LEGACY.items():
            text = text.replace(RAW + old, RAW + new)
        text = '\n'.join(line for line in text.splitlines() if not (line.startswith(RAW) and line.endswith('.js') and not (ROOT / urllib.parse.unquote(line[len(RAW):])).is_file())) + '\n'
        out['subscriptions/legacy/' + name + '.txt'] = text
        out['subscriptions/legacy/' + name + '-cdn.txt'] = text.replace(RAW, CDN)
    out['README.md'] = '# LumeBox 源仓库\n\n订阅入口统一放在 `subscriptions/`，分类与分级数据放在 `metadata/`。根目录只保留说明和各功能目录。\n\n订阅格式：总入口是 JSON，分类 TXT 文件列出 JS 地址；TXT 是清单，不是 Python 或旧版脚本。实际源文件仍是 `.js`。\n\n## 一次导入\n\n- [国内 CDN 线路](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/all.json)\n- [GitHub 原站线路](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/all.json)\n\n在 APP 的“总订阅导入导出”中选择线路或粘贴链接。国内 CDN 线路的清单和脚本都走 CDN；能否直连取决于当前网络，更新可能有 CDN 缓存延迟。两条线路内容相同，选择一条即可。\n\n## 按需分类\n\n| 分类 | 独立源数 | 原站 | 国内 CDN |\n| --- | ---: | --- | --- |\n' + ''.join(f"| {KINDS[kind]} | {len(groups[kind])} | [订阅]({RAW}subscriptions/{kind}.txt) | [订阅]({CDN}subscriptions/cdn/{kind}.txt) |\n" for kind in KINDS) + f"\n共 **{len(rows)} 个独立源**，同 ID 不重复收录。美图导入 APP 漫画板块，有声导入视频板块。\n" + '\n## 仓库目录\n\n| 目录 | 内容 |\n| --- | --- |\n| `subscriptions/` | 所有订阅入口；`cdn/` 是国内 CDN 线路；`legacy/` 为迁移用旧子集 |\n| `metadata/` | 唯一源目录、18+ 分级与旧地址迁移表 |\n| `comic/`、`photo/` | 漫画、美图源脚本 |\n| `movie/`、`video/`、`audiobook/` | 影视、视频、有声源脚本，分别存放 |\n| `docs/` | 使用与维护说明 |\n| `tools/`、`snapshots/`、`licenses/` | 工具、回归样本、授权 |\n\n[完整源目录](docs/源目录.md) · [地址迁移说明](docs/源分类与兼容地址.md) · [维护说明](docs/README.md)\n\n旧根目录订阅文件已收起，需要配套新版 APP 自动迁移旧地址，或使用上方新入口。18+ 是内容分级；未分级不代表全年龄。目录整理与离线检查不代表所有封面、图标和播放当前可用。\n'
    directory = '# 源目录\n\n同一 ID 只列一次。[返回入口](../README.md)。分级“未分级”不是全年龄结论；本目录不是实时可用性报告。\n'
    for kind,label in KINDS.items():
        directory += f'\n## {label}（{len(groups[kind])}）\n\n| 源 | 版本 | 分级 |\n| --- | --- | --- |\n'
        for row in groups[kind]:
            directory += f"| [{row['name']}](../{urllib.parse.quote(row['path'])}) | {row['version']} | {'18+' if row['rating']=='18+' else '未分级'} |\n"
    out['docs/源目录.md'] = directory
    out['docs/源分类与兼容地址.md'] = '# 订阅地址迁移\n\n根目录不再平铺各类清单。所有入口在 `subscriptions/`，索引数据在 `metadata/`；脚本 ID 和有效脚本原地址不变。\n\n新版 APP 会把已保存的旧官方清单地址迁移到新地址，保留启用状态、成员与排除记录。旧版 APP 不认识迁移规则，需要升级或重新填写 README 的新地址。迁移表见 `metadata/legacy-paths.json`；这不是服务器 HTTP 重定向，直接用浏览器打开已删除的旧文件地址仍会 404。\n\n选择国内 CDN 线路时，总订阅、分类清单与脚本均走 CDN，不再把子链接指回 raw.githubusercontent.com。原站线路仍可选。两条线路的 ID 集合一致，无需同时导入。\n\n已删除的重复脚本记录在 `metadata/removed-duplicates.json`。需要查看历史内容时使用 Git 历史。封面、图标和播放的实时检测独立进行，不由清单目录的检查结果代替。\n'
    return out


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs = build()
    changed = []
    for name, content in outputs.items():
        path = ROOT / name
        if not path.exists() or path.read_text(encoding='utf-8') != content:
            changed.append(name)
            if not args.check:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding='utf-8')
    if args.check and changed:
        raise SystemExit('Generated files differ: ' + ', '.join(changed))
    print(f"{'Checked' if args.check else 'Generated'} {len(outputs)} catalog files; changed {len(changed)}")
