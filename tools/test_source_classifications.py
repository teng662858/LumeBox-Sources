import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

import build_catalog


class SourceClassificationsTest(unittest.TestCase):
    def test_four_reported_sources_and_audiobook_are_classified(self):
        rows = {row['id']: row for row in build_catalog.read_sources()}
        for sid in ['duboku_video', 'ptt_drama']:
            self.assertEqual(rows[sid]['kind'], 'movie')
        for sid in ['asmrba_video', 'asmrhoney_video']:
            self.assertEqual(rows[sid]['rating'], '18+')
        self.assertEqual(rows['yueting_video']['kind'], 'audiobook')

    def test_new_video_source_cannot_publish_without_content_classification(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            (root / 'video').mkdir()
            (root / 'metadata').mkdir()
            (root / 'metadata/content-ratings.json').write_text('{"sources":{}}', 'utf8')
            source = root / 'video/example.js'
            metadata = {'id': 'example_video', 'name': '示例', 'version': '1', 'category': 'video'}
            source.write_text('// LumeSource: ' + json.dumps(metadata), 'utf8')
            with patch.object(build_catalog, 'ROOT', root):
                with self.assertRaisesRegex(ValueError, 'contentCategory'):
                    build_catalog.read_sources()
                metadata['contentCategory'] = 'movie'
                source.write_text('// LumeSource: ' + json.dumps(metadata), 'utf8')
                self.assertEqual(build_catalog.read_sources()[0]['kind'], 'movie')


if __name__ == '__main__':
    unittest.main()
