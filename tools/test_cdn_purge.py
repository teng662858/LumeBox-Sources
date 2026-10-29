import io
import json
import unittest
from unittest.mock import patch

from purge_cdn_cache import (
    changed_paths,
    existing_paths,
    partition_paths,
    published_paths,
    purge_one,
    purge_url,
)


class CdnPurgeTests(unittest.TestCase):
    def test_only_published_files_and_known_legacy_routes_are_selected(self):
        self.assertEqual(published_paths([
            'video/41看片.js', 'metadata/catalog.json', 'subscriptions/cdn/video.txt',
            'tools/test.js', '.github/workflows/purge.yml', '../video/private.js',
            '/video/private.js', 'video\\private.js', 'videos', 'video/41看片.js',
        ], {'videos': 'subscriptions/videos.txt'}), [
            'metadata/catalog.json', 'subscriptions/cdn/video.txt', 'video/41看片.js', 'videos',
        ])

    def test_chinese_paths_use_utf8_url_encoding(self):
        self.assertEqual(purge_url('owner/sources', 'video/41看片.js'),
                         'https://purge.jsdelivr.net/gh/owner/sources@main/video/41%E7%9C%8B%E7%89%87.js')
        with self.assertRaises(ValueError):
            purge_url('https://other.test/', 'video/a.js')

    def test_provider_acknowledgement_is_required_and_failures_are_retried(self):
        attempts, sleeps = [], []
        def opener(url, timeout):
            attempts.append(url)
            result = {'status': 'finished', 'paths': {
                '/gh/owner/sources@main/video/a.js': {
                    'throttled': False, 'providers': {'CF': len(attempts) > 1, 'FY': True},
                },
            }}
            return io.StringIO(json.dumps(result))
        self.assertEqual(purge_one('owner/sources', 'video/a.js', opener=opener, sleep=sleeps.append)['status'], 'finished')
        self.assertEqual(len(attempts), 2)
        self.assertEqual(sleeps, [2])

    def test_missing_or_throttled_paths_do_not_count_as_success(self):
        def opener(url, timeout):
            return io.StringIO('{"status":"finished","paths":{}}')
        with self.assertRaises(RuntimeError):
            purge_one('owner/sources', 'video/a.js', opener=opener, sleep=lambda _: None)

    def test_changed_paths_preserve_unicode_and_spaces_and_deleted_files(self):
        with patch('purge_cdn_cache.subprocess.check_output', return_value='video/41看片.js\0video/removed.js\0'.encode()) as run:
            self.assertEqual(changed_paths('a' * 40, 'b' * 40), ['video/41看片.js', 'video/removed.js'])
            self.assertEqual(run.call_args.args[0], ['git', 'diff', '--no-renames', '--name-only', '-z', 'a' * 40, 'b' * 40])

    def test_first_publication_uses_the_full_tree_and_rejects_non_revision_inputs(self):
        with patch('purge_cdn_cache.subprocess.check_output', return_value=b'video/a.js\0') as run:
            self.assertEqual(changed_paths('0' * 40, 'b' * 40), ['video/a.js'])
            self.assertEqual(run.call_args.args[0][1], 'ls-tree')
        with self.assertRaises(ValueError):
            changed_paths('--invalid', 'b' * 40)

    def test_deleted_paths_are_skipped_but_alias_routes_are_kept(self):
        aliases = {'videos': 'subscriptions/videos.txt'}
        kept, removed = partition_paths(
            ['video/new.js', 'video/gone.js', 'videos', 'metadata/catalog.json'],
            {'video/new.js', 'metadata/catalog.json'},
            aliases,
        )
        self.assertEqual(kept, ['video/new.js', 'videos', 'metadata/catalog.json'])
        self.assertEqual(removed, ['video/gone.js'])

    def test_existing_paths_reads_the_published_tree(self):
        with patch('purge_cdn_cache.subprocess.check_output', return_value=b'video/a.js\0metadata/catalog.json\0') as run:
            self.assertEqual(existing_paths('c' * 40), {'video/a.js', 'metadata/catalog.json'})
            self.assertEqual(run.call_args.args[0][1], 'ls-tree')
        with self.assertRaises(ValueError):
            existing_paths('main')


if __name__ == '__main__':
    unittest.main()
