// LumeSource: {"id":"juzhi_app","name":"橘汁 - 影视","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://juziapp.hzhcbkj.cn"]},"network":"direct","mirrors":["https://juziapp.hzhcbkj.cn"]}
// LumeRuntime: javascript
//
// 站点：橘汁 APP 官方接口（juziapp.hzhcbkj.cn，从橘汁_v3.0.7.0.apk 里挖出来的后端域名）
// 形态：Spring Boot JSON API（OpenAPI 在 /v3/api-docs）
//   · 分类  GET /api/v3/drama/treeCategory
//   · 列表  GET /api/v3/debug/drama/list?page=&pagesize=&typeId=
//   · 取流  GET /api/ex/v3/videoParse/test/videoUsableUrl?vodPlayFrom=<source>&playUrl=<path>
// 已知限制（照实写在源说明里）：
//   · APP 正式接口（/api/proto/v5/*、/api/ex/v3/security/*）要「公共参数」签名头，
//     无签名时返回 500；本源走的是同一后端的开放 JSON 端点（debug/list + videoParse/test）。
//   · 这些端点只给每部作品的**第 1 集**（videos 数组长度 1），后续集要签名头才能取，
//     所以本源通常是「整部片 / 第 1 集」可播，长剧只能看首集。
//   · 列表端点没有关键词参数，搜索用本地索引（浏览时累积）过滤。

var HOST = 'https://juziapp.hzhcbkj.cn';
var UA = 'okhttp/3.12.1';
var CATS = [
  { id: '20', title: '电影' },
  { id: '21', title: '剧集' },
  { id: '22', title: '综艺' },
  { id: '23', title: '动漫' },
  { id: '24', title: '短剧' }
];
var PAGE_SIZE = 24;

function base() {
  var d = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (d || HOST).replace(/\/+$/, '');
}
function getJson(path) {
  var url = /^https?:/i.test(path) ? path : base() + path;
  return LumeSource.http.get(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      Referer: base() + '/'
    }
  }).then(function (r) {
    var s = r ? r.status : 0;
    if (!s) throw new Error('连不上：' + url);
    if (s === 403 || s === 429 || s === 503) throw new Error('NEED_WEBVIEW_VERIFY：站点触发了人机校验（HTTP ' + s + '）');
    var body = r.body ? String(r.body) : '';
    var data = null;
    try { data = JSON.parse(body); } catch (e) { data = null; }
    if (!data) throw new Error('接口返回的不是 JSON（HTTP ' + s + '）');
    if (data.code !== 200) throw new Error('接口报错：' + (data.msg || ('code ' + data.code)));
    return data;
  });
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
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
function abs(u) {
  var s = String(u || '').trim();
  if (!s) return '';
  if (/^\/\//.test(s)) return 'https:' + s;
  return s;
}
function itemOf(d) {
  var cover = (d.coverImage && (d.coverImage.path || d.coverImage.thumbnailPath)) || '';
  var eps = d.videos || [];
  var sub = [];
  if (d.year) sub.push(String(d.year));
  if (d.remark) sub.push(clean(d.remark));
  else if (d.isEnd) sub.push('已完结');
  if (eps.length > 1) sub.push(eps.length + ' 集');
  return {
    id: String(d.id),
    title: clean(d.name) || ('作品 ' + d.id),
    cover: abs(cover),
    subtitle: sub.join(' · '),
    videos: eps.map(function (v) {
      return {
        path: String(v.path || ''),
        source: String(v.source || ''),
        title: String(v.titleOld || v.title || '') || ('第 ' + (v.episode || 1) + ' 集')
      };
    }),
    intro: clean(d.intro || d.brief || '')
  };
}
function remember(items) {
  if (!items.length) return Promise.resolve(null);
  return readJson('items.json').then(function (c) {
    var map = (c && c.map) ? c.map : {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      map[it.id] = { title: it.title, cover: it.cover, subtitle: it.subtitle, videos: it.videos, intro: it.intro };
    }
    var keys = Object.keys(map);
    if (keys.length > 2000) keys.slice(0, keys.length - 2000).forEach(function (k) { delete map[k]; });
    return writeJson('items.json', { at: Date.now(), map: map });
  });
}

var LumeSource = {
  id: 'juzhi_app',
  name: '橘汁 - 影视',
  version: '1.0.0',
  category: 'video',
  settingsApiVersion: 2,
  requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://juziapp.hzhcbkj.cn'] },
  mirrors: ['https://juziapp.hzhcbkj.cn'],
  commonSettings: [
    { key: 'pageSize', default: 24, min: 1, max: 50 },
    { key: 'playbackMode', default: 'auto' }
  ],
  settings: [
    { key: 'note', type: 'info', title: '站点说明', description: '橘汁 APP 官方接口（juziapp.hzhcbkj.cn）。分类/列表/取流走开放 JSON 端点；APP 正式接口要签名头，未签名时本源只能拿到每部作品的第 1 集（长剧仅首集可播）。搜索为本地索引过滤。' }
  ],

  async categories() {
    try {
      var d = await getJson('/api/v3/drama/treeCategory');
      var list = (d.data || []).map(function (c) {
        return { id: String(c.typeId), title: String(c.typeName || ('分类 ' + c.typeId)) };
      });
      if (list.length) return list;
    } catch (e) { /* 落回内置分类 */ }
    return CATS.map(function (c) { return { id: c.id, title: c.title }; });
  },

  async home() {
    var boards = [];
    var seen = {};
    var ids = ['21', '20', '23'];
    for (var i = 0; i < ids.length && boards.length < 3; i++) {
      try {
        var d = await getJson('/api/v3/debug/drama/list?page=1&pagesize=12&typeId=' + ids[i]);
        var rows = (d.data && d.data.list) || [];
        var items = [];
        for (var j = 0; j < rows.length; j++) {
          var it = itemOf(rows[j]);
          if (seen[it.id]) continue;
          seen[it.id] = true;
          items.push(it);
        }
        if (items.length) {
          await remember(items);
          boards.push({ title: '橘汁 · ' + (cidTitle(ids[i])), moreUrl: ids[i], items: items.slice(0, 12) });
        }
      } catch (e) { /* 跳过 */ }
    }
    return boards;
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
      return { items: hit.slice(0, PAGE_SIZE), hasMore: false };
    }

    var typeId = catId && /^\d+$/.test(catId) ? catId : '21';
    var d = await getJson('/api/v3/debug/drama/list?page=' + page + '&pagesize=' + PAGE_SIZE + '&typeId=' + typeId);
    var rows = (d.data && d.data.list) || [];
    var items = rows.map(itemOf);
    await remember(items);
    return {
      items: items.map(function (x) { return { id: x.id, title: x.title, cover: x.cover, subtitle: x.subtitle }; }),
      hasMore: items.length >= Math.min(PAGE_SIZE, 10)
    };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var cache = (await readJson('items.json')) || { map: {} };
    var row = (cache.map || {})[id] || null;
    if (!row) {
      // 缓存里没有：扫一遍最新一页，命中就补上
      try {
        var d = await getJson('/api/v3/debug/drama/list?page=1&pagesize=48&typeId=21');
        var rows = ((d.data && d.data.list) || []).map(itemOf);
        await remember(rows);
        cache = (await readJson('items.json')) || { map: {} };
        row = (cache.map || {})[id] || null;
      } catch (e) { /* 保留 null */ }
    }
    if (!row) return null;
    return {
      id: id,
      title: row.title || ('作品 ' + id),
      cover: row.cover || '',
      subtitle: row.subtitle || '',
      description: row.intro || ''
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return [];
    var cache = (await readJson('items.json')) || { map: {} };
    var row = (cache.map || {})[id] || null;
    if (!row) return [];
    var videos = row.videos || [];
    if (!videos.length) return [{ id: '0', title: '正片' }];
    return videos.map(function (v, i) {
      return { id: String(i), title: v.title || ('第 ' + (i + 1) + ' 集') };
    });
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/\D/g, '');
    var idx = Number(String(args.chapterId == null ? '0' : args.chapterId).replace(/\D/g, '') || 0) || 0;
    var cache = (await readJson('items.json')) || { map: {} };
    var row = (cache.map || {})[id] || null;
    var videos = (row && row.videos) || [];
    var v = videos[idx] || videos[0];
    if (v && v.path) {
      try {
        var d = await getJson('/api/ex/v3/videoParse/test/videoUsableUrl?vodPlayFrom=' +
          encodeURIComponent(v.source || 'pylg') + '&playUrl=' + encodeURIComponent(v.path));
        var url = d && d.data && d.data.playUrl ? String(d.data.playUrl) : '';
        if (/^https?:\/\//i.test(url)) {
          return { kind: 'video', url: url, headers: { 'User-Agent': UA } };
        }
      } catch (e) { /* 落到网页兜底 */ }
    }
    return { kind: 'webplayer', url: base() + '/' };
  }
};

function cidTitle(id) {
  for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i].title;
  return '影视';
}
