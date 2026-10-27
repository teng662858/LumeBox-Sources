"""Invalidate mutable jsDelivr @main URLs after a source publication."""
import argparse
import json
import pathlib
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
PUBLIC_FOLDERS = {'comic', 'photo', 'movie', 'video', 'audiobook', 'subscriptions', 'metadata'}


def published_paths(paths, aliases=()):
    result = set()
    for path in paths:
        parts = pathlib.PurePosixPath(path).parts
        if (not parts or path.startswith('/') or '\\' in path or
                any(part in ('.', '..') for part in parts)):
            continue
        if parts[0] in PUBLIC_FOLDERS or path in aliases:
            result.add(path)
    return sorted(result)


def purge_url(repository, path):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Invalid GitHub repository')
    return 'https://purge.jsdelivr.net/gh/' + repository + '@main/' + urllib.parse.quote(path, safe='/')


def purge_one(repository, path, *, opener=urllib.request.urlopen, sleep=time.sleep):
    url = purge_url(repository, path)
    error = None
    for attempt in range(3):
        try:
            with opener(url, timeout=25) as response:
                payload = json.load(response)
            states = payload.get('paths') or {}
            expected = urllib.parse.unquote(urllib.parse.urlsplit(url).path)
            state = next((value for key, value in states.items()
                          if urllib.parse.unquote(key) == expected), None)
            providers = state.get('providers', {}) if isinstance(state, dict) else {}
            if (payload.get('status') != 'finished' or not providers or
                    state.get('throttled') or any(value is not True for value in providers.values())):
                raise ValueError('CDN purge incomplete or throttled')
            return {'path': path, 'status': 'finished', 'providers': providers}
        except Exception as failure:
            error = failure
            if attempt < 2:
                sleep(2 ** (attempt + 1))
    raise RuntimeError(f'{path}: {error}') from error


def changed_paths(before, after):
    if not re.fullmatch(r'[0-9a-f]{40,64}', after):
        raise ValueError('Expected a full commit SHA')
    if not before or set(before) == {'0'}:
        command = ['git', 'ls-tree', '-r', '--name-only', '-z', after]
    else:
        if not re.fullmatch(r'[0-9a-f]{40,64}', before):
            raise ValueError('Expected a full base commit SHA')
        command = ['git', 'diff', '--no-renames', '--name-only', '-z', before, after]
    raw = subprocess.check_output(command, cwd=ROOT)
    return raw.decode('utf-8').strip('\0').split('\0') if raw else []


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', required=True)
    parser.add_argument('--before', default='')
    parser.add_argument('--after', required=True)
    args = parser.parse_args()
    aliases = json.loads((ROOT / 'metadata/legacy-paths.json').read_text(encoding='utf-8'))
    paths = published_paths(changed_paths(args.before, args.after), aliases)
    failures = []
    for path in paths:
        try:
            print(json.dumps(purge_one(args.repository, path), ensure_ascii=True), flush=True)
        except Exception as error:
            failures.append(str(error))
            print(json.dumps({'path': path, 'error': str(error)}, ensure_ascii=True), flush=True)
    print(f'Purged {len(paths) - len(failures)}/{len(paths)} published paths')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
