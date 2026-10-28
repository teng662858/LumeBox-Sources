"""Download both published subscription routes and compare manifests and scripts.

Usage: python tools/audit_subscription_routes.py [--output PATH]
Checks actual stable URLs without cache-busting query strings. Source websites
and playback are outside this inventory/integrity audit.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RAW = 'https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/'
CDN = 'https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/'


def download(url):
    for attempt in range(3):
        try:
            with urlopen(Request(quote(url, safe=':/@%'), headers={
                'User-Agent': 'LumeBox-subscription-audit/1.0',
            }), timeout=30) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def normalized_manifest(data):
    text = data.decode('utf-8-sig').replace(CDN, RAW)
    text = text.replace('/subscriptions/cdn/', '/subscriptions/')
    return re.sub(r'(/subscriptions/[\w-]+)\.[0-9a-f]{8}\.txt', r'\1.txt', text)


def identity(data):
    match = re.search(r'^\s*//\s*@?LumeSource\s*[:=]\s*(\{[^\n]+\})',
                      data.decode('utf-8-sig'), re.M)
    if not match:
        raise ValueError('Missing source identity header')
    meta = json.loads(match[1])
    return {key: meta.get(key) for key in ('id', 'name', 'version')}


def audit():
    catalog = json.loads((ROOT / 'metadata/catalog.json').read_text('utf-8'))
    paths = {'subscriptions/all.json', 'subscriptions/cdn/all.json'}
    for name in ('comic', 'photo', 'movie', 'video', 'audiobook', 'comics', 'videos'):
        paths.update((f'subscriptions/{name}.txt', f'subscriptions/cdn/{name}.txt'))
    paths.update(p.relative_to(ROOT).as_posix()
                 for p in (ROOT / 'subscriptions/legacy').glob('*.txt'))
    total = json.loads((ROOT / 'subscriptions/cdn/all.json').read_text('utf-8'))
    paths.update(url[len(CDN):] for urls in total['sections'].values() for url in urls)
    paths.update(row['path'] for row in catalog['sources'])
    jobs = [(route, path) for path in sorted(paths) for route in ('raw', 'cdn')]
    downloads, errors = {}, []
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(download, (RAW if route == 'raw' else CDN) + path):
                   (route, path) for route, path in jobs}
        for i, future in enumerate(as_completed(futures), 1):
            route, path = futures[future]
            try:
                downloads[route, path] = future.result()
            except Exception as error:
                errors.append({'route': route, 'path': path, 'error': str(error)})
            if i % 50 == 0 or i == len(jobs):
                print(f'Downloaded {i}/{len(jobs)}; failures {len(errors)}', flush=True)
    # Every manifest must match the checkout; every CDN script must match raw
    # and the published catalog, including implementation bytes, not just version.
    for path in sorted(paths):
        # Git may check files out with CRLF on Windows; compare published blobs.
        expected = subprocess.check_output(['git', 'show', f'HEAD:{path}'], cwd=ROOT)
        for route in ('raw', 'cdn'):
            actual = downloads.get((route, path))
            if actual is None:
                continue
            if actual != expected:
                errors.append({'route': route, 'path': path,
                               'error': 'Published bytes differ from checkout',
                               'expectedSha256': hashlib.sha256(expected).hexdigest(),
                               'actualSha256': hashlib.sha256(actual).hexdigest()})
    pairs = [('subscriptions/all.json', 'subscriptions/cdn/all.json')]
    pairs += [(f'subscriptions/{name}.txt', f'subscriptions/cdn/{name}.txt')
              for name in ('comic', 'photo', 'movie', 'video', 'audiobook', 'comics', 'videos')]
    pairs += [(f'subscriptions/legacy/{name}.txt', f'subscriptions/legacy/{name}-cdn.txt')
              for name in ('videos-hd', 'videos-18plus')]
    for raw_path, cdn_path in pairs:
        raw = downloads.get(('raw', raw_path))
        cdn = downloads.get(('cdn', cdn_path))
        if raw is not None and cdn is not None and normalized_manifest(raw) != normalized_manifest(cdn):
            errors.append({'path': raw_path, 'error': 'Route manifest contents differ'})
    sources = []
    for row in catalog['sources']:
        path = row['path']
        result = {'path': path, 'id': row['id'], 'version': row['version']}
        for route in ('raw', 'cdn'):
            data = downloads.get((route, path))
            if data is None:
                continue
            try:
                meta = identity(data)
                result[route] = {**meta, 'sha256': hashlib.sha256(data).hexdigest()}
                if meta['id'] != row['id'] or meta['version'] != row['version']:
                    errors.append({'route': route, 'path': path, 'error': 'Catalog identity/version mismatch'})
            except Exception as error:
                errors.append({'route': route, 'path': path, 'error': str(error)})
        sources.append(result)
    return {'checkedAt': datetime.now(timezone.utc).isoformat(),
            'revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
            'counts': catalog['counts'], 'sourceCount': len(sources),
            'downloadCount': len(jobs), 'manifestPairs': len(pairs),
            'errors': errors, 'sources': sources}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    report = audit()
    if args.output:
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps({key: value for key, value in report.items() if key != 'sources'},
                     ensure_ascii=True, indent=2))
    raise SystemExit(bool(report['errors']))
