// LumeSource: {"id":"huangguo_duanju","name":"黄果 - 短剧","version":"1.0.1","category":"video","contentCategory":"adult","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://huangguoai.com"]},"network":"proxy","icon":"https://huangguoai.com/static/web/images/logo-huangguo.png","mirrors":["https://huangguoai.com"]}
// LumeRuntime: javascript
//
// 站点：黄果短剧（huangguoai.com）AI 短剧站，18+ 内容占多数。
// 形态：服务端渲染 HTML。列表卡片是 .hg-drama-card（data-track-item-id + data-src 封面）。
//       详情/播放页 /video/<id>/ 是第 1 集，后续集 /video/<id>/ep-N/；
//       播放页里直接带签好名的 m3u8（yd-hls.hzjvlo.cn，auth_key 有时效）。
// 网络：直连超时，需代理（network=proxy）。
// 搜索：站点自带 /search/video/<关键词>/。

var HOST = 'https://huangguoai.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
var CATS = [
  { id: 'ai-duanju', title: 'AI 短剧', path: '/ai-duanju/' },
  { id: 'ai-manju', title: 'AI 漫剧', path: '/ai-manju/' },
  { id: 'ai-mogai', title: 'AI 魔改', path: '/ai-mogai/' },
  { id: 'ai-huanlian', title: 'AI 换脸', path: '/ai-huanlian/' },
  { id: 'hot', title: '热榜', path: '/ranks/hot/' },
  { id: 'chigua', title: '吃瓜', path: '/chigua/' }
];
var PAGE_SIZE = 30;
// 封面在 pic.drleao.cn 上是 AES-128-CBC/NoPadding 密文（与汤头条同一套 key/iv，
// 站点 JS 解密后再 createObjectURL）。把参数交给 App 图片管线原生解。
var COVER_HEADERS = {
  'x-lume-image-encoding': 'aes-cbc-nopadding',
  'x-lume-image-key': 'f5d965df75336270',
  'x-lume-image-iv': '97b60394abc2fbe1'
};
function coverHeadersOf(url) {
  return /drleao\.cn/i.test(String(url || '')) ? COVER_HEADERS : {};
}

function base() {
  var d = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (d || HOST).replace(/\/+$/, '');
}
function readJson(f) {
  return LumeSource.fs.readText(f).then(function (r) {
    if (!r) return null;
    try { return JSON.parse(r); } catch (e) { return null; }
  }).catch(function () { return null; });
}
function writeJson(f, v) { return LumeSource.fs.writeText(f, JSON.stringify(v)).catch(function () { return null; }); }
function unesc(s) {
  return String(s == null ? '' : s)
    .replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/\\"/g, '"');
}
function clean(t) {
  return String(t == null ? '' : t)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
function get(path) {
  var url = /^https?:/i.test(path) ? path : base() + path;
  return LumeSource.http.get(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: base() + '/'
    }
  }).then(function (r) {
    var s = r ? r.status : 0;
    if (!s) throw new Error('连不上（该站需要代理）：' + url);
    if (s === 403 || s === 429 || s === 503) throw new Error('NEED_WEBVIEW_VERIFY：站点触发了人机校验（HTTP ' + s + '）');
    if (s !== 200) throw new Error('HTTP ' + s);
    return r.body ? String(r.body) : '';
  });
}
function abs(u) {
  var s = unesc(u).trim();
  if (!s) return '';
  if (/^\/\//.test(s)) return 'https:' + s;
  if (/^\/[^/]/.test(s)) return base() + s;
  return s;
}

function parseCards(html) {
  var text = String(html || '');
  var items = [];
  var seen = {};
  var re = /<div class="hg-drama-card"[\s\S]{0,1200}?data-track-item-id="(\d+)"[\s\S]{0,1600}?<\/div>\s*<\/div>/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var blk = m[0];
    var id = m[1];
    if (!id || seen[id]) continue;
    var cover = (/(?:data-src|data-original)="([^"]+)"/.exec(blk) || [])[1] || '';
    var title = (/(?:alt|data-track-item-name)="([^"]*)"/.exec(blk) || [])[1] || '';
    var score = (/hg-drama-card__score">([^<]*)</.exec(blk) || [])[1] || '';
    var eps = (/共?\s*(\d+)\s*集/.exec(blk) || [])[1] || '';
    if (!cover && !title) continue;
    seen[id] = true;
    items.push({
      id: id,
      title: clean(title) || ('作品 ' + id),
      cover: abs(cover),
      coverHeaders: coverHeadersOf(cover),
      subtitle: [score ? score.trim() : '', eps ? ('共' + eps + '集') : ''].filter(Boolean).join(' · ')
    });
  }
  if (!items.length) {
    var re2 = /<a[^>]+href="\/video\/(\d+)\/"[^>]*>([\s\S]{0,400}?)<\/a>/g;
    while ((m = re2.exec(text)) !== null) {
      var id2 = m[1];
      if (seen[id2]) continue;
      var blk2 = m[2] || '';
      var cov2 = (/(?:data-src|src)="([^"]+)"/.exec(blk2) || [])[1] || '';
      var ti2 = clean((/alt="([^"]*)"/.exec(blk2) || [])[1] || blk2);
      if (!ti2 || /^https?:/.test(ti2)) continue;
      seen[id2] = true;
      items.push({ id: id2, title: ti2.slice(0, 60), cover: abs(cov2), coverHeaders: coverHeadersOf(cov2), subtitle: '' });
    }
  }
  return items;
}

function parseDetail(html, id) {
  var text = String(html || '');
  var title = clean((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text) || [])[1]);
  if (!title) title = clean((/<title>([^<]*)<\/title>/i.exec(text) || [])[1] || '').replace(/\s*-\s*短剧.*$/, '');
  var cover = abs((/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(text) || [])[1] || '');
  var desc = clean((/<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(text) || [])[1] || '');
  var total = Number((/data-track-total-episode="(\d+)"/.exec(text) || [])[1] || 0);
  var eps = [];
  var seen = {};
  var re = new RegExp('href="/video/' + id + '/(ep-(\\d+)/)?"', 'g');
  var m;
  while ((m = re.exec(text)) !== null) {
    var num = m[2] ? Number(m[2]) : 1;
    if (seen[num]) continue;
    seen[num] = true;
    eps.push({ num: num, path: '/video/' + id + '/' + (num > 1 ? ('ep-' + num + '/') : '') });
  }
  eps.sort(function (a, b) { return a.num - b.num; });
  if (!eps.length && total > 0) {
    for (var n = 1; n <= total; n++) {
      eps.push({ num: n, path: '/video/' + id + '/' + (n > 1 ? ('ep-' + n + '/') : '') });
    }
  }
  return { title: title, cover: cover, desc: desc, eps: eps, total: total };
}

function remember(items) {
  if (!items.length) return Promise.resolve(null);
  return readJson('items.json').then(function (c) {
    var map = (c && c.map) ? c.map : {};
    for (var i = 0; i < items.length; i++) map[items[i].id] = { title: items[i].title, cover: items[i].cover, subtitle: items[i].subtitle };
    var keys = Object.keys(map);
    if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach(function (k) { delete map[k]; });
    return writeJson('items.json', { at: Date.now(), map: map });
  });
}
function catPath(catId) {
  for (var i = 0; i < CATS.length; i++) if (CATS[i].id === catId) return CATS[i].path;
  return CATS[0].path;
}

var LumeSource = {
  id: 'huangguo_duanju',
  name: '黄果 - 短剧',
  version: '1.0.1',
  category: 'video',
  settingsApiVersion: 2,
  requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://huangguoai.com'] },
  mirrors: ['https://huangguoai.com'],
  commonSettings: [
    { key: 'pageSize', default: 30, min: 1, max: 50 },
    { key: 'playbackMode', default: 'auto' }
  ],
  settings: [
    { key: 'note', type: 'info', title: '站点说明', description: '黄果短剧（huangguoai.com）：AI 短剧/漫剧/魔改/换脸，18+ 内容较多。播放页直接给签好名的整集 m3u8（有时效，播放时现取）。该站直连不通，需代理。' }
  ],

  async categories() { return CATS.map(function (c) { return { id: c.id, title: c.title }; }); },

  async home() {
    var items = parseCards(await get(catPath('ai-duanju') + '?page=1'));
    await remember(items);
    if (!items.length) return [];
    return [{ title: 'AI 短剧 · 最新', moreUrl: 'ai-duanju', items: items.slice(0, 18) }];
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var kw = String(args.keyword == null ? '' : args.keyword).trim();
    var catId = String(args.categoryId == null ? '' : args.categoryId).trim();

    if (kw) {
      var html = await get('/search/video/' + encodeURIComponent(kw) + '/');
      var hits = parseCards(html);
      await remember(hits);
      return { items: hits.slice(0, PAGE_SIZE), hasMore: false };
    }
    var path = catPath(catId) + (page > 1 ? ('?page=' + page) : '');
    var items = parseCards(await get(path));
    await remember(items);
    return { items: items, hasMore: items.length >= 12 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var cache = (await readJson('items.json')) || { map: {} };
    var row = (cache.map || {})[id] || null;
    var info = { title: '', cover: '', desc: '', eps: [] };
    try { info = parseDetail(await get('/video/' + id + '/'), id); } catch (e) { /* 用缓存兜底 */ }
    if (info.eps && info.eps.length) await writeJson('eps-' + id + '.json', { at: Date.now(), eps: info.eps });
    return {
      id: id,
      title: info.title || (row && row.title) || ('作品 ' + id),
      cover: info.cover || (row && row.cover) || '',
      coverHeaders: coverHeadersOf(info.cover || (row && row.cover) || ''),
      subtitle: (row && row.subtitle) || '',
      description: info.desc || ''
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return [];
    var cached = (await readJson('eps-' + id + '.json')) || null;
    if (cached && cached.eps && cached.eps.length) {
      return cached.eps.map(function (e) { return { id: String(e.num), title: '第 ' + e.num + ' 集' }; });
    }
    var info = { eps: [] };
    try { info = parseDetail(await get('/video/' + id + '/'), id); } catch (e) { /* 单集兜底 */ }
    if (!info.eps.length) return [{ id: '1', title: '第 1 集' }];
    await writeJson('eps-' + id + '.json', { at: Date.now(), eps: info.eps });
    return info.eps.map(function (e) { return { id: String(e.num), title: '第 ' + e.num + ' 集' }; });
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/\D/g, '');
    var num = Number(String(args.chapterId || '1').replace(/\D/g, '') || 1) || 1;
    var path = '/video/' + id + '/' + (num > 1 ? ('ep-' + num + '/') : '');
    var html = '';
    try { html = await get(path); } catch (e) { html = ''; }
    var m = /(https?:[^"'\\\s]+?\.m3u8[^"'\\\s]*)/.exec(html);
    if (m) {
      return {
        kind: 'video',
        url: unesc(m[1]),
        headers: { 'User-Agent': UA, Referer: base() + '/', Origin: base() }
      };
    }
    return { kind: 'webplayer', url: base() + path };
  }
};
