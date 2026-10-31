"""Python sources keep their runtime and enter the same two subscription routes."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import audit_subscription_routes
import build_catalog
import build_selfhost


class PythonCatalogTests(unittest.TestCase):
    def test_python_header_and_category_are_preserved(self):
        header = '# LumeSource: ' + json.dumps({
            'id': 'gulu_test', 'name': 'Python 测试', 'version': '1.0.1',
            'category': 'video', 'contentCategory': 'movie',
        }, ensure_ascii=False)
        source = header + '\n# LumeRuntime: python\nclass Spider: pass\n'
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'movie').mkdir()
            (root / 'movie/test.py').write_text(source, encoding='utf-8')
            (root / 'metadata').mkdir()
            (root / 'metadata/content-ratings.json').write_text('{"sources":{}}', encoding='utf-8')
            with patch.object(build_catalog, 'ROOT', root):
                rows = build_catalog.read_sources()
                self.assertEqual(rows[0]['path'], 'movie/test.py')
                self.assertEqual(rows[0]['kind'], 'movie')
                self.assertIn('movie/test.py', build_catalog.manifest(rows, '电影'))
            self.assertEqual(audit_subscription_routes.identity(source.encode())['version'], '1.0.1')
            with patch.object(build_selfhost, 'ROOT', root):
                build_selfhost.build('https://sources.test/', root / 'output')
            self.assertEqual((root / 'output/movie/test.py').read_text(encoding='utf-8'), source)


if __name__ == '__main__':
    unittest.main(verbosity=2)
