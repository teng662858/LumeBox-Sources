// Produce standalone source files. Shared helpers are expanded at build time.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const helper = fs.readFileSync(path.join(__dirname, 'audiobook_helpers.js.txt'), 'utf8');
for (const [id, name, base, template] of [
  ['qilin70_audiobook', '麒麟听书', 'https://www.70ts.com', '70ts'],
  ['ting13_audiobook', '13听书网', 'https://www.ting13.cc', 'ting13'],
  ['ting8_audiobook', '听书吧', 'https://www.ting8.cc', 'ting8'],
  ['yuetingba_audiobook', '悦听吧', 'http://www.yuetingba.cn', 'yuetingba'],
]) {
  const target = path.join(root, 'audiobook', name + '.js');
  const previous = fs.existsSync(target)
    ? JSON.parse(fs.readFileSync(target, 'utf8').split('\n')[0].replace(/^\/\/ LumeSource:\s*/, ''))
    : {};
  const identity = { ...previous, id, name, version: '1.0.2', category: 'video', group: '有声小说', mediaType: 'audio', icon: previous.icon || base + '/favicon.ico' };
  const body = fs.readFileSync(path.join(__dirname, 'audiobook_templates', template + '.js.txt'), 'utf8');
  fs.writeFileSync(path.join(root, 'audiobook', name + '.js'),
    '// LumeSource: ' + JSON.stringify(identity) + '\n' +
    '// Standalone build: node tools/build_audiobooks.cjs\n' +
    '// Only public site catalogues and player requests; no account or paid-content bypass.\n' +
    helper + '\nH.base=' + JSON.stringify(base) + ';H.name=' + JSON.stringify(name) + ';\n' +
    'var LumeSource=Object.assign(' + JSON.stringify(identity) + ',{\n' + body + '\n});\n');
}
