// LumeSource: {"id":"jisu_video","name":"追剧","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://jisuzhuiju.com"]},"network":"proxy","icon":"https://jisuzhuiju.com/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：追剧（https://jisuzhuiju.com）—— 列表是 JSON-LD（schema.org ItemList），播放地址由服务端 /api/play-url 解析。
//   分类   /type/{dianshiju|dianying|zongyi|dongman}.html
//   列表   页面里的 <script type="application/ld+json"> → ItemList.itemListElement[].{name,url:/detail/{id}.html}
//   详情   /detail/{id}.html：h1 标题、og:image 封面、正文简介、/vodplay/{id}-{线路}-{集}.html 选集
//   播放   GET /api/play-url?vodId={id}&playFrom={线路}&index={集}  → JSON（url 字段）
//          （这是它自己 play-router.js 里的调用方式，实测必带 vodId/playFrom/index 三个参数）

var HOST = 'https://jisuzhuiju.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
var CATS = [
  { id: 'dianshiju', title: '电视剧' },
  { id: 'dianying', title: '电影' },
  { id: 'zongyi', title: '综艺' },
  { id: 'dongman', title: '动漫' },
];
var PAGE_SIZE = 24;

function base() { var d = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : ''; return (d || HOST).replace(/\/+$/, ''); }
function readJson(f) { return LumeSource.fs.readText(f).then(function (r) { if (!r) return null; try { return JSON.parse(r); } catch (e) { return null; } }).catch(function () { return null; }); }
function writeJson(f, v) { return LumeSource.fs.writeText(f, JSON.stringify(v)).catch(function () { return null; }); }
function clean(t) { return String(t == null ? '' : t).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function get(url) {
  return LumeSource.http.get(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json,*/*', Referer: base() + '/' } }).then(function (r) {
    var s = r ? r.status : 0;
    if (!s) throw new Error('连不上');
    if (s !== 200) throw new Error('HTTP ' + s);
    return r.body ? String(r.body) : '';
  });
}
function img(u) { var s = String(u || '').trim(); if (!s) return ''; if (/^\/\//.test(s)) return 'https:' + s; if (/^http:\/\//i.test(s)) return s.replace(/^http:/i, 'https:'); if (/^\//.test(s)) return base() + s; return s; }

// 列表：从 JSON-LD 里取 ItemList
function parseJsonLd(html) {
  var text = String(html || '');
  var out = [];
  var seen = {};
  var re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var data;
    try { data = JSON.parse(m[1]); } catch (e) { continue; }
    var nodes = Array.isArray(data) ? data : (data['@graph'] || [data]);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node || node['@type'] !== 'ItemList') continue;
      var list = node.itemListElement || [];
      for (var j = 0; j < list.length; j++) {
        var it = list[j] && list[j].item ? list[j].item : list[j];
        if (!it || !it.url) continue;
        var idm = /\/detail\/(\d+)\.html/.exec(String(it.url));
        if (!idm || seen[idm[1]]) continue;
        seen[idm[1]] = 1;
        out.push({ id: idm[1], title: clean(it.name || ''), cover: img(it.image || ''), subtitle: '' });
      }
    }
  }
  return out;
}

function parseDetail(html) {
  var text = String(html || '');
  var title = clean((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(text) || [])[1] || '');
  var cover = img((/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(text) || [])[1] || '');
  var desc = clean((/<meta[^>]+name="description"[^>]+content="([^"]+)"/i.exec(text) || [])[1] || '');
  var plays = [];
  var seen = {};
  var re = /href="(\/vodplay\/(\d+)-([a-z0-9_]+)-(\d+)\.html)"/gi;
  var m;
  while ((m = re.exec(text)) !== null) {
    var key = m[1];
    if (seen[key]) continue;
    seen[key] = 1;
    plays.push({ path: key, vodId: m[2], playFrom: m[3], index: m[4] });
  }
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
  id: 'jisu_video', name: '追剧', version: '1.0.0', category: 'video',
  settingsApiVersion: 2, requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://jisuzhuiju.com'] },
  commonSettings: [{ key: 'pageSize', default: 24, min: 1, max: 50 }, { key: 'playbackMode', default: 'auto' }],
  settings: [{ key: 'note', type: 'info', title: '站点说明', description: '追剧：列表读 JSON-LD，播放走站点自己的 /api/play-url（vodId+playFrom+index）。' }],

  async categories() { return CATS; },

  async home() {
    var boards = [];
    for (var i = 0; i < CATS.length && boards.length < 3; i++) {
      try {
        var items = parseJsonLd(await get(base() + '/type/' + CATS[i].id + '.html'));
        if (items.length) { await remember(items); boards.push({ title: CATS[i].title, moreUrl: CATS[i].id, items: items.slice(0, 12) }); }
      } catch (e) { /* 跳过 */ }
    }
    return boards;
  },

  async list(argument) {
    var a = argument || {}, page = Number(a.page || 1) || 1;
    var cat = String(a.categoryId || '').trim();
    if (!/^[a-z]+$/.test(cat)) cat = 'dianshiju';
    var kw = String(a.keyword || '').trim();
    var url = kw
      ? base() + '/search?wd=' + encodeURIComponent(kw) + '&page=' + page
      : base() + '/type/' + cat + '.html' + (page > 1 ? '?page=' + page : '');
    var html = await get(url);
    var items = parseJsonLd(html);
    await remember(items);
    return { items: items, hasMore: items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    var info = { title: '', cover: '', desc: '' };
    try { info = parseDetail(await get(base() + '/detail/' + id + '.html')); } catch (e) { /* 缓存 */ }
    return {
      id: id,
      title: info.title || (row && row.title) || ('作品 ' + id),
      cover: info.cover || (row && row.cover) || '',
      subtitle: '',
      description: info.desc || '追剧（jisuzhuiju.com）',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return [];
    var plays = [];
    try { plays = parseDetail(await get(base() + '/detail/' + id + '.html')).plays; } catch (e) { /* 忽略 */ }
    if (!plays.length) return [{ id: 'web:' + id, title: '网页播放' }];
    var out = [];
    for (var i = 0; i < plays.length; i++) {
      out.push({ id: 'p:' + plays[i].vodId + ':' + plays[i].playFrom + ':' + plays[i].index, title: plays[i].playFrom + ' 第' + plays[i].index + '集' });
    }
    return out;
  },

  async content(argument) {
    var a = argument || {};
    var raw = String(a.chapterId || '');
    if (raw.indexOf('web:') === 0) return { kind: 'webplayer', url: base() + '/detail/' + String(a.id || '').replace(/\D/g, '') + '.html' };
    var parts = raw.replace(/^p:/, '').split(':');
    var vodId = parts[0] || '', playFrom = parts[1] || '', index = parts[2] || '1';
    var api = base() + '/api/play-url?vodId=' + encodeURIComponent(vodId) + '&playFrom=' + encodeURIComponent(playFrom) + '&index=' + encodeURIComponent(index);
    try {
      var body = await get(api);
      var data = JSON.parse(body);
      var url = String(data.url || (data.data && data.data.url) || '');
      if (/^https?:/i.test(url)) {
        if (/\.(?:m3u8|mp4|flv)/i.test(url)) return { kind: 'video', url: url, headers: { 'User-Agent': UA, Referer: base() + '/' } };
        return { kind: 'webplayer', url: url };
      }
    } catch (e) { /* 退回网页 */ }
    return { kind: 'webplayer', url: base() + '/vodplay/' + vodId + '-' + playFrom + '-' + index + '.html' };
  },
};
