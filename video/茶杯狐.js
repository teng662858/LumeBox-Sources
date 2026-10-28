// LumeSource: {"id":"citapa_video","name":"茶杯狐","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://citapa.com"]},"network":"proxy","icon":"https://citapa.com/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：茶杯狐（https://citapa.com）—— 服务端渲染（SSR）站，HTML 里就有完整列表与详情，不需要过 JS 挑战。
//   分类   /frim/index{1..4}.html   （1 电影 / 2 电视剧 / 3 综艺 / 4 动漫）
//   翻页   /frim/index{n}_{页}.html
//   列表   a[href=/movie/index{id}.html] → 标题文本 / i.icon-hot 之后的名字；封面在块内 img
//   详情   /movie/index{id}.html  <h1>标题</h1>
//   播放   /play/{id}-{线路}-{集}.html  → 页面里直接带 m3u8（super.ffzy-online6.com / vip.ffzy-play9.com 等）
//   搜索   /search/{关键词}----------{页}---.html（同 maccms 形状，实测可用则用之）
//
// 实测：列表 49KB、详情 48KB、播放页 47KB 里直接有 .m3u8（200）

var HOST = 'https://citapa.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
var CATS = [
  { id: '1', title: '电影' },
  { id: '2', title: '电视剧' },
  { id: '3', title: '综艺' },
  { id: '4', title: '动漫' },
];
var PAGE_SIZE = 24;

function base() {
  var d = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (d || HOST).replace(/\/+$/, '');
}
function readJson(f) {
  return LumeSource.fs.readText(f).then(function (r) { if (!r) return null; try { return JSON.parse(r); } catch (e) { return null; } }).catch(function () { return null; });
}
function writeJson(f, v) { return LumeSource.fs.writeText(f, JSON.stringify(v)).catch(function () { return null; }); }
function clean(t) {
  return String(t == null ? '' : t)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}
function get(url, headers) {
  return LumeSource.http.get(url, {
    headers: Object.assign({ 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9', Referer: base() + '/' }, headers || {}),
  }).then(function (r) {
    var s = r ? r.status : 0;
    if (s !== 200) throw new Error('页面打不开：HTTP ' + s);
    return r.body ? String(r.body) : '';
  });
}
function img(u) {
  var s = String(u || '').trim();
  if (!s) return '';
  if (/^\/\//.test(s)) return 'https:' + s;
  if (/^http:\/\//i.test(s)) return s.replace(/^http:/i, 'https:');
  if (/^\//.test(s)) return base() + s;
  return s;
}

// 列表：一个 a[href=/movie/index{id}.html] 块，标题是它自己的文本/i.icon-hot 之后的文字，封面看块里的 img
function parseList(html) {
  var text = String(html || '');
  var items = [];
  var seen = {};
  var re = /<a[^>]+href="\/movie\/index(\d+)\.html"[^>]*>([\s\S]{0,700}?)<\/a>/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var id = m[1];
    if (seen[id]) continue;
    var block = m[2];
    var cover = (/<img[^>]+(?:data-original|data-src|src)="([^"]+)"/i.exec(block) || [])[1] || '';
    var title = clean(block);
    if (!cover) {
      // 有的卡片把 img 放在 a 外面：向前后各看一段
      var win = text.slice(Math.max(0, m.index - 600), m.index + 1200);
      cover = (/<img[^>]+(?:data-original|data-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i.exec(win) || [])[1]
        || (/background-image:\s*url\(['"]?([^'")]+)['"]?\)/i.exec(win) || [])[1] || '';
    }
    if (!title && !cover) continue;
    seen[id] = true;
    items.push({ id: id, title: title.slice(0, 60) || ('作品 ' + id), cover: img(cover), subtitle: '' });
  }
  return items;
}

function parseDetail(html) {
  var text = String(html || '');
  var title = clean((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text) || [])[1] || '');
  var cover = img((/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(text) || [])[1]
    || (/<img[^>]+(?:data-original|data-src|src)="([^"]+)"/i.exec(text) || [])[1] || '');
  var desc = clean((/<div[^>]+class="[^"]*(?:desc|intro|content|synopsis)[^"]*"[^>]*>([\s\S]{0,1500}?)<\/div>/i.exec(text) || [])[1] || '');
  var plays = [];
  var seen = {};
  var re = /href="(\/play\/\d+-\d+-\d+\.html)"/g;
  var m;
  while ((m = re.exec(text)) !== null) { if (!seen[m[1]]) { seen[m[1]] = 1; plays.push(m[1]); } }
  return { title: title, cover: cover, desc: desc, plays: plays };
}

async function resolvePlay(path) {
  var url = base() + path;
  var html = await get(url, { Referer: base() + '/' });
  var m3u8 = (/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/.exec(html) || [])[1]
    || (/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/.exec(html) || [])[1] || '';
  if (m3u8) return m3u8;
  var pd = /(?:player_aaaa|player_data)\s*=\s*(\{[\s\S]{10,800}?\})/.exec(html);
  if (pd) {
    try {
      var data = JSON.parse(pd[1]);
      var u = String(data.url || '');
      if (Number(data.encrypt) === 2) u = decodeURIComponent(atob(btoaSafe(u)));
      if (/\.m3u8|\.mp4/i.test(u)) return u;
    } catch (e) { /* 忽略 */ }
  }
  return '';
}
function btoaSafe(s) {
  var str = String(s || '');
  var out = '';
  for (var i = 0; i < str.length; i++) out += String.fromCharCode(str.charCodeAt(i) & 0xff);
  return Buffer.from(out, 'binary').toString('base64');
}

function remember(items) {
  if (!items.length) return Promise.resolve(null);
  return readJson('items.json').then(function (c) {
    var map = (c && c.map) ? c.map : {};
    for (var i = 0; i < items.length; i++) map[items[i].id] = { title: items[i].title, cover: items[i].cover };
    return writeJson('items.json', { at: Date.now(), map: map });
  });
}

var LumeSource = {
  id: 'citapa_video',
  name: '茶杯狐',
  version: '1.0.0',
  category: 'video',
  settingsApiVersion: 2,
  requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://citapa.com'] },
  commonSettings: [
    { key: 'pageSize', default: 24, min: 1, max: 50 },
    { key: 'playbackMode', default: 'auto' },
  ],
  settings: [
    { key: 'note', type: 'info', title: '站点说明', description: '茶杯狐是 SSR 站，列表/详情直接解析 HTML；播放页里直接带 m3u8。' },
  ],

  async categories() { return CATS; },

  async home() {
    var boards = [];
    for (var i = 0; i < CATS.length && boards.length < 4; i++) {
      try {
        var html = await get(base() + '/frim/index' + CATS[i].id + '.html');
        var items = parseList(html);
        if (items.length) {
          await remember(items);
          boards.push({ title: CATS[i].title, moreUrl: CATS[i].id, items: items.slice(0, 12) });
        }
      } catch (e) { /* 跳过 */ }
    }
    return boards;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var kw = String(args.keyword == null ? '' : args.keyword).trim();
    var cat = String(args.categoryId == null ? '' : args.categoryId).trim();
    if (!/^\d+$/.test(cat)) cat = '1';
    if (kw) {
      var surl = base() + '/search/' + encodeURIComponent(kw) + '----------' + page + '---.html';
      var shtml = await get(surl);
      var sitems = parseList(shtml);
      await remember(sitems);
      return { items: sitems, hasMore: sitems.length >= PAGE_SIZE };
    }
    var path = '/frim/index' + cat + (page > 1 ? '_' + page : '') + '.html';
    var html;
    try {
      html = await get(base() + path);
    } catch (e) {
      if (page > 1) return { items: [], hasMore: false };
      throw e;
    }
    var items = parseList(html);
    await remember(items);
    var hasNext = new RegExp('/frim/index' + cat + '_' + (page + 1) + '\\.html').test(html) || items.length >= PAGE_SIZE;
    return { items: items, hasMore: hasNext };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    var info = { title: '', cover: '', desc: '' };
    try { info = parseDetail(await get(base() + '/movie/index' + id + '.html')); } catch (e) { /* 用缓存 */ }
    return {
      id: id,
      title: info.title || (row && row.title) || ('作品 ' + id),
      cover: info.cover || (row && row.cover) || '',
      subtitle: '',
      description: info.desc || '茶杯狐（citapa.com）',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return [];
    var info = { plays: [] };
    try { info = parseDetail(await get(base() + '/movie/index' + id + '.html')); } catch (e) { /* 忽略 */ }
    if (!info.plays.length) return [{ id: 'p:/play/' + id + '-0-0.html', title: '网页播放' }];
    return info.plays.map(function (p, i) {
      var m = /\/play\/(\d+)-(\d+)-(\d+)\.html/.exec(p) || [];
      return { id: 'p:' + p, title: '线路' + (Number(m[2] || 0) + 1) + ' 第' + (Number(m[3] || 0) + 1) + '集' };
    });
  },

  async content(argument) {
    var args = argument || {};
    var raw = String(args.chapterId || '');
    var path = raw.indexOf('p:') === 0 ? raw.slice(2) : raw;
    try {
      var media = await resolvePlay(path);
      if (media) return { kind: 'video', url: media, headers: { 'User-Agent': UA, Referer: base() + '/' } };
    } catch (e) { /* 退回网页 */ }
    return { kind: 'webplayer', url: base() + path };
  },
};
