// LumeSource: {"id":"shandian_video","name":"闪电4K","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://woggpan.888484.xyz"]},"network":"proxy","icon":"https://woggpan.888484.xyz/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：闪电4K（https://woggpan.888484.xyz）—— 苹果CMS v10（maccms）HTML 模板站。
// 闪电·4K（woggpan）苹果CMS 模板站；列表 /vodtype/{id}.html，详情 /voddetail/{id}.html，播放 /vodplay/… + player_data。
//
//   分类   /vodtype/{分类id}.html（第 1 页）→ /vodtype/{分类id}-{页}.html 翻页
//   列表   .module-item / dl 卡片：a[href=/voddetail/{id}.html] + img[data-original|src]
//   详情   /voddetail/{id}.html：标题、封面、简介、a[href=/vodplay/{id}-{源}-{集}.html]
//   播放   /vodplay/… 页里 `var player_data = {"encrypt":0|1|2,"url":"…"}`：
//            encrypt 0 → 明文；1 → atob；2 → decodeURIComponent(atob)（maccms 标准三档）
//          解出来是 m3u8/mp4 就直接播，否则退回网页播放。
//   搜索   /vodsearch/{关键词}----------{页}---.html

var HOST = "https://woggpan.888484.xyz";
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var CATS = [
  {
    "id": "1",
    "title": "电影"
  },
  {
    "id": "2",
    "title": "剧集"
  },
  {
    "id": "3",
    "title": "动漫"
  },
  {
    "id": "44",
    "title": "臻彩"
  },
  {
    "id": "6",
    "title": "短剧"
  },
  {
    "id": "4",
    "title": "综艺"
  },
  {
    "id": "46",
    "title": "纪录片"
  },
  {
    "id": "5",
    "title": "音乐"
  }
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
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
function get(url, headers) {
  return LumeSource.http.get(url, { headers: Object.assign({ 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9', Referer: base() + '/' }, headers || {}) }).then(function (r) {
    var s = r ? r.status : 0;
    if (s !== 200) throw new Error('页面打不开：HTTP ' + s);
    return r.body ? String(r.body) : '';
  });
}
function abs(u) {
  var s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:/i.test(s)) return s;
  return base() + (s.charAt(0) === '/' ? '' : '/') + s;
}
function img(u) { return String(u || '').replace(/^http:\/\//i, 'https://'); }

function parseList(html) {
  var items = [];
  var seen = {};
  // myui 模板：<a class="myui-vodlist__thumb lazyload" href="/voddetail/{id}.html" title="标题" data-original="封面">
  var reA = /<a[^>]+href="[^"]*\/voddetail\/(\d+)\.html"[^>]*title="([^"]*)"[^>]*data-original="([^"]+)"/g;
  var m = null;
  while ((m = reA.exec(String(html || ''))) !== null) {
    if (seen[m[1]]) continue;
    seen[m[1]] = true;
    items.push({ id: m[1], title: clean(m[2]), cover: img(m[3]), subtitle: '' });
  }
  // 属性顺序不同时：先抓 href+title，再在附近找 data-original
  if (!items.length) {
    var reB = /<a[^>]+href="[^"]*\/voddetail\/(\d+)\.html"[^>]*title="([^"]*)"/g;
    while ((m = reB.exec(String(html || ''))) !== null) {
      if (seen[m[1]]) continue;
      seen[m[1]] = true;
      var tail = String(html).slice(m.index, m.index + 900);
      var cov = (/data-original="([^"]+)"/.exec(tail) || [])[1] || (/<img[^>]+src="([^"]+)"/.exec(tail) || [])[1] || '';
      var remark = (/pic-text[^"]*"[^>]*>([^<]{1,20})</.exec(tail) || [])[1] || '';
      items.push({ id: m[1], title: clean(m[2]), cover: img(cov), subtitle: clean(remark) });
    }
  }
  var re = /<a[^>]+href="([^"]*\/voddetail\/(\d+)\.html)"[^>]*(?:title="([^"]*)")?[^>]*>[\s\S]{0,600}?<img[^>]+(?:data-original|data-src|src)="([^"]+)"/g;
  while ((m = re.exec(String(html || ''))) !== null) {
    var vid = m[2];
    if (seen[vid]) continue;
    seen[vid] = true;
    items.push({ id: vid, title: clean(m[3]) || '', cover: img(m[4]), subtitle: '' });
  }
  // 兜底：没有 img 的同构卡片（部分模板懒加载标记不同）
  if (!items.length) {
    var re2 = /<a[^>]+href="[^"]*\/voddetail\/(\d+)\.html"[^>]*title="([^"]+)"/g;
    while ((m = re2.exec(String(html || ''))) !== null) {
      if (seen[m[1]]) continue;
      seen[m[1]] = true;
      items.push({ id: m[1], title: clean(m[2]), cover: '', subtitle: '' });
    }
  }
  return items;
}

function parseDetail(html) {
  var text = String(html || '');
  var title = clean((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text) || [])[1] || '');
  var cover = img((/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(text) || [])[1]
    || (/<a[^>]+class="[^"]*(?:thumb|pic)[^"]*"[^>]+data-original="([^"]+)"/i.exec(text) || [])[1]
    || (/<img[^>]+(?:data-original|data-src)="([^"]+)"/i.exec(text) || [])[1] || '');
  var desc = clean((/<div[^>]+class="[^"]*(?:content|desc|detail-content|vod_content)[^"]*"[^>]*>([\s\S]{0,2000}?)<\/div>/i.exec(text) || [])[1] || '');
  // 简介有的在 <p> 里带「剧情介绍」
  if (!desc) {
    var i = text.indexOf('剧情介绍');
    if (i > 0) desc = clean(text.slice(i, i + 800)).slice(0, 300);
  }
  var plays = [];
  var re = /href="(\/vodplay\/\d+-\d+-\d+\.html)"/g;
  var m;
  var seen = {};
  while ((m = re.exec(text)) !== null) { if (!seen[m[1]]) { seen[m[1]] = 1; plays.push(m[1]); } }
  // 线路名（源名）：<span class="module-tab-item"> / <a class="…">线路</a>，取不到就用编号
  var lines = [...new Set([...text.matchAll(/<a[^>]+data-toggle="tab"[^>]*>([^<]{1,10})<\/a>/g)].map((x) => clean(x[1])))];
  return { title: title, cover: cover, desc: desc, plays: plays, lines: lines };
}

function decodePlayer(html) {
  var text = String(html || '');
  var m = /player_aaaa\s*=\s*(\{[\s\S]{10,2000}?\})\s*<\/script>/.exec(text) || /player_data\s*=\s*(\{[\s\S]{10,2000}?\})\s*;?\s*<\/script>/.exec(text);
  if (!m) return { encrypt: -1, url: '' };
  var data;
  try { data = JSON.parse(m[1]); } catch (e) { return { encrypt: -1, url: '' }; }
  var url = String(data.url || '');
  var enc = Number(data.encrypt);
  if (enc === 1) { try { url = atobLike(url); } catch (e) {} }
  else if (enc === 2) { try { url = decodeURIComponent(atobLike(url)); } catch (e) {} }
  return { encrypt: enc, url: url };
}

function atobLike(s) {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var clean2 = String(s || '').replace(/[^A-Za-z0-9+/=]/g, '');
  var out = '';
  var buf = 0, bits = 0;
  for (var i = 0; i < clean2.length; i++) {
    var ch = clean2.charAt(i);
    if (ch === '=') break;
    var v = alphabet.indexOf(ch);
    if (v < 0) continue;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 0xff); }
  }
  try { return decodeURIComponent(escape(out)); } catch (e) { return out; }
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
  id: "shandian_video",
  name: "闪电4K",
  version: '1.0.0',
  category: 'video',
  settingsApiVersion: 2,
  requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ["https://woggpan.888484.xyz"] },
  commonSettings: [
    { key: 'pageSize', default: 24, min: 1, max: 50 },
    { key: 'playbackMode', default: 'auto' }
  ],
  settings: [
    { key: 'note', type: 'info', title: '站点说明', description: "闪电·4K（woggpan）苹果CMS 模板站；列表 /vodtype/{id}.html，详情 /voddetail/{id}.html，播放 /vodplay/… + player_data。" }
  ],

  async categories() { return CATS; },

  async home() {
    var boards = [];
    for (var i = 0; i < CATS.length && boards.length < 4; i++) {
      try {
        var html = await get(base() + '/vodtype/' + CATS[i].id + '.html');
        var items = parseList(html);
        if (items.length) {
          await remember(items);
          boards.push({ title: CATS[i].title, moreUrl: CATS[i].id, items: items.slice(0, 12) });
        }
      } catch (e) {}
    }
    return boards;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var kw = String(args.keyword == null ? '' : args.keyword).trim();
    var cat = String(args.categoryId == null ? '' : args.categoryId).trim();
    if (kw) {
      var surl = base() + '/vodsearch/' + encodeURIComponent(kw) + '----------' + page + '---.html';
      var shtml = await get(surl);
      var sitems = parseList(shtml);
      await remember(sitems);
      return { items: sitems, hasMore: sitems.length >= PAGE_SIZE };
    }
    if (!/^\d+$/.test(cat)) cat = CATS.length ? String(CATS[0].id) : '1';
    var url = base() + '/vodtype/' + cat + (page > 1 ? '-' + page : '') + '.html';
    var html = await get(url);
    var items = parseList(html);
    await remember(items);
    var hasNext = new RegExp('/vodtype/' + cat + '-' + (page + 1) + '\.html').test(html) || items.length >= PAGE_SIZE;
    return { items: items, hasMore: hasNext };
  },

  async detail(argument) {
    var vid = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!vid) return null;
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[vid] : null;
    var info = { title: '', cover: '', desc: '' };
    try { info = parseDetail(await get(base() + '/voddetail/' + vid + '.html')); } catch (e) {}
    return {
      id: vid,
      title: info.title || (row && row.title) || ('作品 ' + vid),
      cover: info.cover || (row && row.cover) || '',
      subtitle: '',
      description: info.desc || ''
    };
  },

  async chapters(argument) {
    var vid = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!vid) return [];
    var info = { plays: [], lines: [] };
    try { info = parseDetail(await get(base() + '/voddetail/' + vid + '.html')); } catch (e) {}
    if (!info.plays.length) return [{ id: 'web:' + vid + '-1-1', title: '网页播放' }];
    return info.plays.map(function (p, i) {
      var m = /\/vodplay\/(\d+)-(\d+)-(\d+)\.html/.exec(p) || [];
      var line = info.lines.length ? (info.lines[Number(m[2] || 1) - 1] || '') : '';
      var name = line ? (line + ' 第' + (m[3] || 1) + '集') : ('线路' + (m[2] || 1) + ' 第' + (m[3] || 1) + '集');
      return { id: 'p:' + p, title: name };
    });
  },

  async content(argument) {
    var args = argument || {};
    var raw = String(args.chapterId || '');
    if (String(args.chapterId || '').indexOf('web:') === 0) {
      var vid0 = String(args.id || '').replace(/\D/g, '');
      return { kind: 'webplayer', url: base() + '/voddetail/' + vid0 + '.html' };
    }
    var path = raw.indexOf('p:') === 0 ? raw.slice(2) : raw;
    var playUrl = base() + (/^\//.test(path) ? path : '/' + path);
    var html = await get(playUrl, { Referer: base() + '/' });
    var dec = decodePlayer(html);
    if (dec.url && /\.(?:m3u8|mp4|flv|mkv|ts)(?:[?#]|$)/i.test(dec.url)) {
      return { kind: 'video', url: dec.url, headers: { 'User-Agent': UA, Referer: base() + '/' } };
    }
    if (dec.url && /^https?:/i.test(dec.url)) return { kind: 'webplayer', url: dec.url };
    return { kind: 'webplayer', url: playUrl };
  },
};
