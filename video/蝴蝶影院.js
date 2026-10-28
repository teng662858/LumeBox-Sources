// LumeSource: {"id":"ptt_drama","name":"蝴蝶影院","version":"1.0.1","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://ptt01.com","https://ptt02.cc","https://ptt03.com","https://ptt02.nl","https://ptt2.my"]},"network":"direct","icon":"https://ptt01.com/logo.png","mirrors":["https://ptt01.com","https://ptt02.cc","https://ptt03.com","https://ptt02.nl","https://ptt2.my"]}
// LumeRuntime: javascript
//
// 站点：蝴蝶影院（ptt01.com / ptt02.cc / ptt03.com / ptt02.nl / ptt2.my）
// 形态：服务端渲染 HTML；系列页 /v/<id> 给分集，单集页 /<id>/<集数> 内嵌整集 m3u8。
// 门禁：首页有一层「继续访问」（只写 x-index-auth=authed Cookie），本源每个请求自带该 Cookie。
// 搜索：站点 /node/search 对脚本环境返回 503，这里用本地索引（列表/详情时累积）过滤，
//      索引为空时先用第 1 页现抓一次。

var HOST = 'https://ptt01.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
var CATS = [
  { id: 'dalu', title: '大陆剧', path: '/?category_id=19' },
  { id: 'hk', title: '港剧', path: '/?category_id=20' },
  { id: 'tw', title: '台剧', path: '/?category_id=81' },
  { id: 'jp', title: '日剧', path: '/?category_id=83' },
  { id: 'kr', title: '韩剧', path: '/?category_id=82' },
  { id: 'us', title: '欧美剧', path: '/?category_id=22' },
  { id: 'th', title: '泰剧', path: '/?category_id=92' },
  { id: 'other', title: '其他', path: '/?category_id=23' }
];
var PAGE_SIZE = 30;
var INDEX_CAP = 4000;

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
      Referer: base() + '/',
      Cookie: 'x-index-auth=authed'
    }
  }).then(function (r) {
    var s = r ? r.status : 0;
    if (!s) throw new Error('连不上：' + url);
    if (s === 403 || s === 429 || s === 503) throw new Error('NEED_WEBVIEW_VERIFY：站点触发了人机校验（HTTP ' + s + '）');
    if (s !== 200) throw new Error('HTTP ' + s);
    return r.body ? String(r.body) : '';
  });
}
function abs(u) {
  var s = String(u || '').trim();
  if (!s) return '';
  if (/^\/\//.test(s)) return 'https:' + s;
  if (/^\/[^/]/.test(s)) return base() + s;
  return s;
}

function parseCards(html) {
  var text = String(html || '');
  var items = [];
  var seen = {};
  var re = /<a[^>]+class="visited"[^>]+href="\/(\d{3,})"[^>]*>\s*<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var id = m[1];
    if (seen[id]) continue;
    seen[id] = true;
    var tail = text.slice(m.index, m.index + 1400);
    var eps = (/共\s*(\d+)\s*集/.exec(tail) || [])[1] || '';
    var year = (/(\d{4})年/.exec(tail) || [])[1] || '';
    items.push({
      id: id,
      title: clean(m[3]) || ('作品 ' + id),
      cover: abs(m[2]),
      subtitle: [year, eps ? ('共' + eps + '集') : ''].filter(Boolean).join(' · ')
    });
  }
  if (!items.length) {
    var re2 = /<a[^>]+href="\/(\d{3,})"[^>]*>([\s\S]{0,300}?)<\/a>/g;
    while ((m = re2.exec(text)) !== null) {
      var id2 = m[1];
      if (seen[id2]) continue;
      var blk = m[2] || '';
      var cov = (/<img[^>]+src="([^"]+)"/.exec(blk) || [])[1] || '';
      var au = (/alt="([^"]*)"/.exec(blk) || [])[1] || '';
      var ti = clean(au || blk);
      if (!cov && !ti) continue;
      seen[id2] = true;
      items.push({ id: id2, title: ti.slice(0, 60) || ('作品 ' + id2), cover: abs(cov), subtitle: '' });
    }
  }
  return items;
}

function parseSeries(html) {
  var text = String(html || '');
  var rawTitle = clean((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text) || [])[1]
    || (/<title>([^<]*)<\/title>/i.exec(text) || [])[1] || '');
  var title = rawTitle.replace(/\s*[-－]\s*(电视剧|电影|综艺|动漫|线上看)[\s\S]*$/, '').trim();
  var cover = abs((/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(text) || [])[1] || '');
  var desc = clean((/<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(text) || [])[1] || '');
  var eps = [];
  var seen = {};
  var re = /<a[^>]+class="seq[^"]*"[^>]+href="\/(\d{3,})\/(\d+)"/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var key = m[2];
    if (seen[key]) continue;
    seen[key] = true;
    eps.push({ id: m[1] + '/' + m[2], title: '第 ' + m[2] + ' 集', num: Number(m[2]) });
  }
  eps.sort(function (a, b) { return a.num - b.num; });
  return { title: title, cover: cover, desc: desc, eps: eps };
}

function remember(items) {
  if (!items.length) return Promise.resolve(null);
  return readJson('items.json').then(function (c) {
    var map = (c && c.map) ? c.map : {};
    for (var i = 0; i < items.length; i++) map[items[i].id] = { title: items[i].title, cover: items[i].cover, subtitle: items[i].subtitle };
    var keys = Object.keys(map);
    if (keys.length > INDEX_CAP) keys.slice(0, keys.length - INDEX_CAP).forEach(function (k) { delete map[k]; });
    return writeJson('items.json', { at: Date.now(), map: map });
  });
}

function catPathById(catId) {
  for (var i = 0; i < CATS.length; i++) if (CATS[i].id === catId) return CATS[i].path;
  return '/?';
}
function pageQuery(path, page) {
  var p = Number(page || 1) || 1;
  if (p <= 1) return path;
  return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'page=' + p;
}

var LumeSource = {
  id: 'ptt_drama',
  name: '蝴蝶影院',
  version: '1.0.1',
  category: 'video',
  settingsApiVersion: 2,
  requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://ptt01.com', 'https://ptt02.cc', 'https://ptt03.com', 'https://ptt02.nl', 'https://ptt2.my'] },
  mirrors: ['https://ptt01.com', 'https://ptt02.cc', 'https://ptt03.com', 'https://ptt02.nl', 'https://ptt2.my'],
  commonSettings: [
    { key: 'pageSize', default: 30, min: 1, max: 50 },
    { key: 'playbackMode', default: 'auto' }
  ],
  settings: [
    { key: 'note', type: 'info', title: '站点说明', description: '蝴蝶影院（ptt01.com 站群）线上看：系列页给分集，单集页直接内嵌整集 m3u8。首页的「继续访问」门已由本源自带 Cookie 通过。搜索用本地索引（浏览时累积）过滤，索引为空会先抓一页。' }
  ],

  async categories() { return CATS.map(function (c) { return { id: c.id, title: c.title }; }); },

  async home() {
    var items = parseCards(await get('/?page=1'));
    await remember(items);
    if (!items.length) return [];
    return [{ title: '最新更新', moreUrl: 'latest', items: items.slice(0, 18) }];
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var kw = String(args.keyword == null ? '' : args.keyword).trim();
    var catId = String(args.categoryId == null ? '' : args.categoryId).trim();

    if (kw) {
      var low = kw.toLowerCase();
      var cache = (await readJson('items.json')) || { map: {} };
      var map = cache.map || {};
      var hit = [];
      for (var id in map) {
        if (String(map[id].title).toLowerCase().indexOf(low) >= 0) {
          hit.push({ id: id, title: map[id].title, cover: map[id].cover, subtitle: map[id].subtitle || '' });
        }
      }
      if (!hit.length) {
        var fresh = parseCards(await get('/?page=1'));
        await remember(fresh);
        hit = fresh.filter(function (x) { return String(x.title).toLowerCase().indexOf(low) >= 0; });
      }
      return { items: hit.slice(0, PAGE_SIZE), hasMore: false };
    }

    var path = catId === 'latest' ? '/?' : catPathById(catId);
    var items = parseCards(await get(pageQuery(path, page)));
    await remember(items);
    return { items: items, hasMore: items.length >= 12 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var cache = (await readJson('items.json')) || { map: {} };
    var row = (cache.map || {})[id] || null;
    var info = { title: '', cover: '', desc: '', eps: [] };
    try { info = parseSeries(await get('/v/' + id)); } catch (e) { /* 用缓存兜底 */ }
    if (info.eps && info.eps.length) {
      await writeJson('eps-' + id + '.json', { at: Date.now(), eps: info.eps });
    }
    return {
      id: id,
      title: info.title || (row && row.title) || ('作品 ' + id),
      cover: info.cover || (row && row.cover) || '',
      subtitle: (row && row.subtitle) || '',
      description: info.desc || ''
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return [];
    var cached = (await readJson('eps-' + id + '.json')) || null;
    if (cached && cached.eps && cached.eps.length) {
      return cached.eps.map(function (e) { return { id: e.id, title: e.title }; });
    }
    var info = { eps: [] };
    try { info = parseSeries(await get('/v/' + id)); } catch (e) { /* 无分集 */ }
    if (!info.eps.length) return [{ id: id + '/1', title: '第 1 集' }];
    await writeJson('eps-' + id + '.json', { at: Date.now(), eps: info.eps });
    return info.eps.map(function (e) { return { id: e.id, title: e.title }; });
  },

  async content(argument) {
    var args = argument || {};
    var cid = String(args.chapterId || '');
    var id = String(args.id || '').replace(/\D/g, '');
    var path = /^\d+\/\d+$/.test(cid) ? ('/' + cid) : ('/' + id + '/1');
    var html;
    try { html = await get(path); } catch (e) { html = ''; }
    var direct = (/<source[^>]+src="(https?:\/\/[^"]+\.m3u8[^"]*)"/i.exec(html) || [])[1]
      || (/["'](https?:\/\/[^"']+?\.m3u8[^"']*)["']/.exec(html) || [])[1] || '';
    if (direct) {
      return {
        kind: 'video',
        url: String(direct).replace(/\\\//g, '/'),
        headers: { 'User-Agent': UA, Referer: base() + '/', Origin: base() }
      };
    }
    return { kind: 'webplayer', url: base() + path };
  }
};
