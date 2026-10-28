// LumeSource: {"id":"yueting_video","name":"悦听","version":"1.0.0","category":"audiobook","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://www.yuetingba.cn"]},"network":"proxy","icon":"https://www.yuetingba.cn/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：悦听（https://www.yuetingba.cn）—— 有声书 SSR 站。
//   首页 /             → 149KB，书籍链接 /book/{id}/{页}
//   书籍 /book/{id}/1  → 章节列表（同页），音频在 <audio src> 或播放器中
//   搜索 /search?keyword=

var HOST = 'https://www.yuetingba.cn';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
var PAGE_SIZE = 24;

function base() { var d = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : ''; return (d || HOST).replace(/\/+$/, ''); }
function readJson(f) { return LumeSource.fs.readText(f).then(function (r) { if (!r) return null; try { return JSON.parse(r); } catch (e) { return null; } }).catch(function () { return null; }); }
function writeJson(f, v) { return LumeSource.fs.writeText(f, JSON.stringify(v)).catch(function () { return null; }); }
function clean(t) { return String(t == null ? '' : t).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function img(u) { var s = String(u || '').trim(); if (!s) return ''; if (/^\/\//.test(s)) return 'https:' + s; if (/^http:\/\//i.test(s)) return s.replace(/^http:/i, 'https:'); if (/^\//.test(s)) return base() + s; return s; }
function get(url) {
  return LumeSource.http.get(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*', Referer: base() + '/' } }).then(function (r) {
    var s = r ? r.status : 0;
    if (!s) throw new Error('连不上');
    if (s !== 200) throw new Error('HTTP ' + s);
    return r.body ? String(r.body) : '';
  });
}

function parseCards(html) {
  var text = String(html || ''), items = [], seen = {};
  var re = /<a[^>]+href="(\/book\/(\d+)\/\d+)"[^>]*>([\s\S]{0,300}?)<\/a>/g, m;
  while ((m = re.exec(text)) !== null) {
    var id = m[2];
    if (seen[id]) continue;
    var inner = m[3] || '';
    var title = (/title="([^"]{1,80})"/.exec(inner) || [])[1] || (/alt="([^"]{1,80})"/.exec(inner) || [])[1] || clean(inner);
    var cover = (/<img[^>]+(?:data-original|data-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i.exec(inner) || [])[1] || '';
    if (!title) continue;
    seen[id] = 1;
    items.push({ id: id, title: clean(title).slice(0, 60), cover: img(cover), subtitle: '' });
  }
  return items;
}

function parseBook(html) {
  var text = String(html || '');
  var title = clean((/<h1[^>]*>([\s\S]{1,120}?)<\/h1>/i.exec(text) || [])[1] || (/<title>([^<]*)</.exec(text) || [])[1] || '');
  var cover = img((/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(text) || [])[1] || '');
  var eps = [], seen = {}, re = /href="(\/book\/\d+\/\d+)"[^>]*>([^<]{1,40})</g, m;
  while ((m = re.exec(text)) !== null) {
    if (seen[m[1]]) continue;
    seen[m[1]] = 1;
    eps.push({ path: m[1], name: clean(m[2]) || ('第' + (eps.length + 1) + '集') });
  }
  return { title: title, cover: cover, eps: eps };
}

var LumeSource = {
  id: 'yueting_video', name: '悦听', version: '1.0.0', category: 'audiobook',
  settingsApiVersion: 2, requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://www.yuetingba.cn'] },
  commonSettings: [{ key: 'pageSize', default: 24, min: 1, max: 50 }, { key: 'playbackMode', default: 'auto' }],
  settings: [{ key: 'note', type: 'info', title: '站点说明', description: '悦听：有声书 SSR 站，书籍页即章节页，音频直取。' }],

  async categories() {
    return [{ id: 'home', title: '推荐' }];
  },

  async home() {
    var items = parseCards(await get(base() + '/'));
    if (!items.length) return [];
    var cached = (await readJson('items.json')) || { map: {} };
    var map = cached.map || {};
    for (var i = 0; i < items.length; i++) map[items[i].id] = { title: items[i].title, cover: items[i].cover };
    await writeJson('items.json', { at: Date.now(), map: map });
    return [{ title: '推荐', moreUrl: 'home', items: items.slice(0, 12) }];
  },

  async list(argument) {
    var a = argument || {}, page = Number(a.page || 1) || 1;
    var kw = String(a.keyword || '').trim();
    var url = kw ? base() + '/search?keyword=' + encodeURIComponent(kw) : base() + '/';
    var items = parseCards(await get(url));
    var cached = (await readJson('items.json')) || { map: {} };
    var map = cached.map || {};
    for (var i = 0; i < items.length; i++) map[items[i].id] = { title: items[i].title, cover: items[i].cover };
    await writeJson('items.json', { at: Date.now(), map: map });
    return { items: items, hasMore: false };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    var info = { title: '', cover: '' };
    try { info = parseBook(await get(base() + '/book/' + id + '/1')); } catch (e) { /* 缓存 */ }
    return {
      id: id,
      title: info.title || (row && row.title) || ('有声书 ' + id),
      cover: info.cover || (row && row.cover) || '',
      subtitle: '有声书',
      description: '悦听（www.yuetingba.cn）',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return [];
    var info = { eps: [] };
    try { info = parseBook(await get(base() + '/book/' + id + '/1')); } catch (e) { /* 忽略 */ }
    if (!info.eps.length) return [{ id: 'web:/book/' + id + '/1', title: '网页播放' }];
    return info.eps.map(function (e, i) { return { id: 'p:' + e.path, title: e.name }; });
  },

  async content(argument) {
    var a = argument || {}, raw = String(a.chapterId || '');
    var path = raw.indexOf('p:') === 0 ? raw.slice(2) : raw;
    if (!path || path.indexOf('web:') === 0) {
      var vid = String(a.id || '').replace(/\D/g, '');
      return { kind: 'webplayer', url: base() + '/book/' + vid + '/1' };
    }
    var url = /^https?:/.test(path) ? path : base() + path;
    var html = await get(url);
    var audio = (/<audio[^>]+src="([^"]+)"/i.exec(html) || [])[1]
      || (/<source[^>]+src="([^"]+\.(?:mp3|m4a|aac|m3u8)[^"]*)"/i.exec(html) || [])[1]
      || (/"([^"]+\.(?:mp3|m4a|aac))"/.exec(html) || [])[1] || '';
    if (audio) return { kind: 'video', url: /^https?:/.test(audio) ? audio : base() + audio, headers: { 'User-Agent': UA, Referer: base() + '/' } };
    return { kind: 'webplayer', url: url };
  },
};
