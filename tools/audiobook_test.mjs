import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const names = ['麒麟听书', '13听书网', '听书吧', '悦听吧'];
const live = process.argv.includes('--live');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
const cookieFile = process.env.TING13_TEST_COOKIES;
const cookie = cookieFile ? JSON.parse(fs.readFileSync(cookieFile)).map(c => c.name + '=' + c.value).join('; ') : '';
const tools = {
  base64Encode: async s => Buffer.from(s).toString('base64'),
  base64Decode: async s => Buffer.from(s, 'base64').toString('utf8'),
  digest: async (algorithm, s) => crypto.createHash(algorithm).update(s).digest('hex'),
  aes: async o => {
    const key = Buffer.from(o.key, 'base64');
    const c = crypto.createDecipheriv('aes-' + key.length * 8 + '-cbc', key, Buffer.from(o.iv, 'base64'));
    return Buffer.concat([c.update(Buffer.from(o.data, 'base64')), c.final()]).toString('base64');
  },
};
for (const name of names.filter(n => !only || n === only)) {
  const context = { console };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'audiobook', name + '.js'), 'utf8'), context, { timeout: 2000 });
  const s = context.LumeSource;
  s.tools = tools;
  assert.equal(s.mediaType, 'audio');
  assert.equal(s.category, 'video');
  assert.equal(s.group, '有声小说');
  const { T } = context;
  // Full-text search pages also include unrelated recommendations: never show them as matches.
  assert.equal(T.searchItems('<a href="/book/1">别的书</a>', /^\/book\//, '不存在的关键词').length, 0);
  assert.equal(T.searchItems('<a href="/book/1">庆余年</a>', /^\/book\//, '庆余年').length, 1);
  const slots = T.slots('<select><option value="/tingshu/9/">第1 - 30集</option><option value="/tingshu/9/p2.html">第31 - 35集</option></select>', /^\/tingshu\//);
  const virtual = T.virtual(slots, [{ id: 'first', title: '开篇' }]);
  assert.equal(virtual.length, 35);
  assert.equal(virtual[0].title, '开篇');
  assert.equal(JSON.parse(virtual[34].id).offset, 4);
  assert.equal(T.chapters('<div id="playlist"><a href="/play/1">第一集</a><a href="/play/2">第二集</a></div><a href="/play/ad">推荐</a>', /^\/play\//).length, 2);
  assert.equal(T.items('<a href="/book/1"><img alt="真书名" src="/cover.jpg"><span>824万</span></a><a href="/book/1">真书名</a>', /^\/book\//)[0].title, '真书名');
  const lazy = T.items('<a href="/book/2"><img alt="延迟加载封面" src="/loading.gif" data-lazy-src="/covers/book2.jpg"></a>', /^\/book\//)[0];
  assert.equal(new URL(lazy.cover).pathname, '/covers/book2.jpg');
  const responsive = T.items('<a href="/book/3"><img alt="响应式封面" src="/blank.gif" srcset="/small.jpg 100w, /large.jpg 800w"></a>', /^\/book\//)[0];
  assert.equal(new URL(responsive.cover).pathname, '/large.jpg');
  assert.equal(T.items('<a href="/book/4"><img alt="只有占位图" src="/loading.gif"></a>', /^\/book\//)[0].cover, null);
  assert.throws(() => T.body({ status: 200, body: '<title>系统安全验证</title>' }), /NEED_WEBVIEW_VERIFY/);
  if (!live && name === '麒麟听书') {
    const calls = [];
    s.http = { get: async u => {
      calls.push(new URL(u).pathname);
      const pages = {
        '/tingshu/9/': '<div id="playlist"><a href="/tingshu/9/100.html">第一集</a></div><select><option value="/tingshu/9/">第1 - 30集</option><option value="/tingshu/9/p2.html">第31 - 31集</option></select>',
        '/tingshu/9/p2.html': '<div id="playlist"><a href="/tingshu/9/200.html">第三十一集</a></div>',
        '/tingshu/9/200.html': '<iframe src="/player/9/media.html"></iframe>',
        '/player/9/media.html': "var url123='';var player={mp3:'https://fixture.test/episode31.mp3'};",
      };
      assert.ok(pages[new URL(u).pathname], u);
      return { status: 200, body: pages[new URL(u).pathname] };
    } };
    const c = await s.chapters({ id: '/tingshu/9/' });
    assert.equal(c.length, 31);
    assert.equal(calls.length, 1, 'catalogue must not download every chapter page');
    const audio = await s.content({ id: '/tingshu/9/', chapterId: c[30].id });
    assert.equal(audio.url, 'https://fixture.test/episode31.mp3');
    assert.ok(calls.includes('/tingshu/9/p2.html'));
  }
  if (!live && name === '听书吧') {
    s.http = { get: async u => ({ status: 200, body: u.includes('/mp3/') ? '<div class="info-li"><a href="/play/9-0-0.html">第一集</a><a href="/play/9-1-0.html">第一集</a></div>' : 'var now="https://fixture.test/audio.m4a";' }) };
    const c = await s.chapters({ id: '/mp3/9.html' });
    assert.equal(c.length, 2); assert.equal(c[1].line, '线路2');
    const a = await s.content({ id: '/mp3/9.html', chapterId: c[0].id });
    assert.equal(a.kind, 'audio'); assert.ok(a.headers.Referer.endsWith('/play/9-0-0.html'));
  }
  if (!live && name === '13听书网') {
    const alphabet = 'PXhw7U1B0a9kQDKZsTjIASmOeNzxYG4CHo1JyRfg2b8FLpEvr3FtVnlqMidu6c';
    const token = 'abc012';
    const signature = s.signature(token);
    assert.equal(signature.length, token.length * 3);
    assert.equal([...token].map((_, i) => alphabet[(alphabet.indexOf(token[i]) + 3) % 62]).join(''), [...signature].filter((_, i) => i % 3 === 1).join(''));
    s.web = { render: async o => { assert.ok(o.steps[0].selector.includes('audio')); return { result: 'https://fixture.test/verified.mp3' }; } };
    const a = await s.content({ id: '/youshengxiaoshuo/9/', chapterId: '/play/9_1_2.html' });
    assert.equal(a.url, 'https://fixture.test/verified.mp3');
  }
  if (!live) { console.log(name + ': offline OK'); continue; }
  const request = async (url, options = {}, body) => {
    const headers = { ...options.headers };
    if (cookie && url.includes('ting13.cc')) headers.Cookie = cookie;
    const r = await fetch(url, { headers, method: body == null ? 'GET' : 'POST', body, signal: AbortSignal.timeout(15000) });
    if (process.argv.includes('--trace')) console.log(r.status, new URL(url).pathname);
    return { status: r.status, body: await r.text() };
  };
  s.http = { get: request, post: (u, b, o) => request(u, o, b) };
  try {
    const cats = await s.categories(); assert.ok(cats.length);
    const home = await s.home(); assert.ok(home[0].items.length);
    const listing = await s.list({ page: 1 }); assert.ok(listing.items.length);
    const knownItems = { '麒麟听书': '/tingshu/18271/', '13听书网': '/youshengxiaoshuo/39941/', '听书吧': '/mp3/5249.html', '悦听吧': '/book/detail/3a233ba8-7391-4116-55db-7e06a5de6864/0' };
    const item = { ...listing.items[0], id: knownItems[name] };
    const detail = await s.detail({ id: item.id }); assert.ok(detail.title);
    const chapters = await s.chapters({ id: item.id }); assert.ok(chapters.length);
    const first = await s.content({ id: item.id, chapterId: chapters[0].id });
    assert.equal(first.kind, 'audio');
    const media = await fetch(first.url, { headers: { ...first.headers, Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(15000) });
    assert.ok([200, 206].includes(media.status), 'media HTTP ' + media.status);
    const reader = media.body.getReader(); const chunk = await reader.read(); await reader.cancel();
    assert.ok(chunk.value?.length && !String.fromCharCode(...chunk.value.slice(0, 20)).includes('<html'), 'not audio');
    const key = ({ '麒麟听书': '绝世狂徒', '13听书网': '众仙俯首', '听书吧': '首席医官', '悦听吧': '庆余年' })[name];
    const search = await s.list({ keyword: key, page: 1 }); assert.ok(search.items.length, 'search returned no matches for ' + key);
    console.log(JSON.stringify({ name, categories: cats.length, home: home[0].items.length, list: listing.items.length, title: detail.title, chapters: chapters.length, search: search.items.length, audioStatus: media.status, audioType: media.headers.get('content-type') }));
  } catch (e) { process.exitCode = 1; console.error(name + ': ' + e.message + (e.cause ? ' (' + e.cause.message + ')' : '')); }
}
