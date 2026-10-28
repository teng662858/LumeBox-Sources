// LumeSource: {"id":"zhenpin_video","name":"臻品","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://www.zpcxb.com"]},"network":"proxy","icon":"https://www.zpcxb.com/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：臻品（https://www.zpcxb.com）—— 苹果CMS v10 + Cloudflare。
//   列表/搜索：GET /index.php/ajax/data?mid=1&tid={分类}&page={页}   ← 现在就能用（实测 79068 条总库，10 条/页）
//              GET /index.php/ajax/data?mid=1&wd={关键词}            ← 搜索
//   详情/播放：站点详情页被 Cloudflare 托管挑战保护（我这边直接请求 404/挑战页）。
//              **首次使用请在源里点一次「网页视图」**，App 会把 cf_clearance 存进站点会话池，
//              之后 LumeSource.http 的请求自动带上，详情页与 player_data 就能取到。
//   播放解析：详情页 /vodplay/{id}-{源}-{集}.html 里的 player_data（encrypt 0/1/2）。

var HOST = 'https://www.zpcxb.com';
var UA = 'Mozilla/5.0 (Linux; Android 12; NOH-AN01) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Mobile Safari/537.36';
var CATS = [
  { id: '1', title: '电影' },
  { id: '2', title: '电视剧' },
  { id: '3', title: '综艺' },
  { id: '4', title: '动漫' },
  { id: '5', title: '纪录片' },
];
var PAGE_SIZE = 10;

function base() { var d = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : ''; return (d || HOST).replace(/\/+$/, ''); }
function readJson(f) { return LumeSource.fs.readText(f).then(function (r) { if (!r) return null; try { return JSON.parse(r); } catch (e) { return null; } }).catch(function () { return null; }); }
function writeJson(f, v) { return LumeSource.fs.writeText(f, JSON.stringify(v)).catch(function () { return null; }); }
function clean(t) { return String(t == null ? '' : t).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim(); }
function img(u) { var s = String(u || '').trim(); if (!s) return ''; if (/^\/\//.test(s)) return 'https:' + s; if (/^http:\/\//i.test(s)) return s.replace(/^http:/i, 'https:'); if (/^\//.test(s)) return base() + s; return s; }

function request(url) {
  return LumeSource.http.get(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json, text/html, */*', Referer: base() + '/', 'X-Requested-With': 'XMLHttpRequest' },
  }).then(function (r) {
    var s = r ? r.status : 0;
    if (!s) throw new Error('连不上：' + base());
    if (s === 403 || s === 429 || s === 503) throw new Error('需要过 Cloudflare：先在源里点一次「网页视图」');
    if (s !== 200) throw new Error('HTTP ' + s);
    return r.body ? String(r.body) : '';
  });
}

function atobSafe(s) {
  var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var src = String(s || '').replace(/[^A-Za-z0-9+/=]/g, ''), out = '', buf = 0, bits = 0;
  for (var i = 0; i < src.length; i++) { var c = src.charAt(i); if (c === '=') break; var v = A.indexOf(c); if (v < 0) continue; buf = (buf << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 0xff); } }
  try { return decodeURIComponent(escape(out)); } catch (e) { return out; }
}

function mapRow(row) {
  return {
    id: String(row.vod_id || ''),
    title: clean(row.vod_name || ''),
    cover: img(row.vod_pic || ''),
    subtitle: clean(row.vod_remarks || ''),
  };
}

function parseDetail(html) {
  var text = String(html || '');
  var title = clean((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text) || [])[1] || '');
  var cover = img((/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(text) || [])[1] || '');
  var desc = clean((/<div[^>]+class="[^"]*(?:content|desc|intro|detail)[^"]*"[^>]*>([\s\S]{0,1200}?)<\/div>/i.exec(text) || [])[1] || '');
  var plays = [], seen = {}, re = /href="([^"]*\/vodplay\/[^"]*)"/g, m;
  while ((m = re.exec(text)) !== null) { if (!seen[m[1]]) { seen[m[1]] = 1; plays.push(m[1]); } }
  return { title: title, cover: cover, desc: desc, plays: plays };
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
  id: 'zhenpin_video', name: '臻品', version: '1.0.0', category: 'video',
  settingsApiVersion: 2, requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://www.zpcxb.com'] },
  commonSettings: [{ key: 'pageSize', default: 10, min: 1, max: 30 }, { key: 'playbackMode', default: 'auto' }],
  settings: [
    { key: 'note', type: 'info', title: '站点说明', description: '臻品开着 Cloudflare 托管挑战：列表接口可用，详情/播放需先在源里点一次「网页视图」过校验。' },
  ],

  async categories() { return CATS; },

  async home() {
    var boards = [];
    for (var i = 0; i < CATS.length && boards.length < 3; i++) {
      try {
        var body = await request(base() + '/index.php/ajax/data?mid=1&tid=' + CATS[i].id + '&page=1');
        var data = JSON.parse(body);
        var rows = (data && data.list) || [];
        var items = rows.map(mapRow).filter(function (x) { return x.id; });
        if (items.length) { await remember(items); boards.push({ title: CATS[i].title, moreUrl: CATS[i].id, items: items.slice(0, 12) }); }
      } catch (e) { /* 跳过 */ }
    }
    return boards;
  },

  async list(argument) {
    var a = argument || {}, page = Number(a.page || 1) || 1;
    var cat = String(a.categoryId || '').trim();
    if (!/^\d+$/.test(cat)) cat = '1';
    var kw = String(a.keyword || '').trim();
    var url = kw
      ? base() + '/index.php/ajax/data?mid=1&wd=' + encodeURIComponent(kw) + '&page=' + page
      : base() + '/index.php/ajax/data?mid=1&tid=' + cat + '&page=' + page;
    var body = await request(url);
    var data;
    try { data = JSON.parse(body); } catch (e) { throw new Error('接口返回不是 JSON（可能要过 Cloudflare）'); }
    var rows = (data && data.list) || [];
    var items = rows.map(mapRow).filter(function (x) { return x.id; });
    await remember(items);
    var pagecount = Number(data && data.pagecount) || 0;
    return { items: items, hasMore: pagecount ? page < pagecount : items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    var info = { title: '', cover: '', desc: '' };
    try { info = parseDetail(await request(base() + '/index.php/vod/detail/id/' + id + '.html')); } catch (e) { /* 需过校验时用缓存 */ }
    return {
      id: id,
      title: info.title || (row && row.title) || ('作品 ' + id),
      cover: info.cover || (row && row.cover) || '',
      subtitle: '',
      description: info.desc || '臻品（www.zpcxb.com）· 详情页需网页视图过 Cloudflare 校验',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return [];
    var plays = [];
    try { plays = parseDetail(await request(base() + '/index.php/vod/detail/id/' + id + '.html')).plays; } catch (e) { /* 忽略 */ }
    if (!plays.length) return [{ id: 'web:' + id, title: '网页播放（首次先过校验）' }];
    return plays.map(function (p, i) { return { id: 'p:' + p, title: '线路 ' + (i + 1) }; });
  },

  async content(argument) {
    var a = argument || {}, raw = String(a.chapterId || '');
    if (raw.indexOf('web:') === 0) return { kind: 'webplayer', url: base() + '/index.php/vod/detail/id/' + String(a.id || '').replace(/\D/g, '') + '.html' };
    var path = raw.indexOf('p:') === 0 ? raw.slice(2) : raw;
    var url = /^https?:/.test(path) ? path : base() + path;
    var html = await request(url);
    var direct = (/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/.exec(html) || [])[1] || '';
    if (direct) return { kind: 'video', url: direct, headers: { 'User-Agent': UA, Referer: base() + '/' } };
    var pd = /(?:player_aaaa|player_data)\s*=\s*(\{[\s\S]{10,1200}?\})/.exec(html);
    if (pd) {
      try {
        var d = JSON.parse(pd[1]), u = String(d.url || '');
        if (Number(d.encrypt) === 1 || Number(d.encrypt) === 2) u = atobSafe(u);
        if (/\.m3u8|\.mp4/i.test(u)) return { kind: 'video', url: u, headers: { 'User-Agent': UA, Referer: base() + '/' } };
      } catch (e) { /* 忽略 */ }
    }
    return { kind: 'webplayer', url: url };
  },
};
