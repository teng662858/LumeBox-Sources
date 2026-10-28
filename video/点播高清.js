// LumeSource: {"id":"hqvod_video","name":"点播 - 高清","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://hqvod.com"]},"network":"direct","mirrors":["https://hqvod.com"]}
// LumeRuntime: javascript
//
// 站点：高清点播（hqvod.com），苹果CMS v10 站，13.4 万条。
// 形态：
//   · 列表——站点把 `api.php/provide/vod/` 关掉了（返回 closed），但**内置 ajax 数据接口是开的**：
//     `/index.php/ajax/data?mid=1&tid=<分类>&page=<页>` → JSON（每页固定 10 条，字段齐全）。
//   · 详情——`/xiangqing/<id>.html`，里面有 `/bofang/<id>-<线路>-<集>.html` 的选集链接。
//   · 播放——**播放页挂滑块人机校验**（`/huadong_*.js`），脚本请求一律 403，
//     所以 `content()` 只能把播放页交给 App 的网页播放器（用户在网页视图里过一次滑块即可）。
//   · 反爬：连续请求会短时封 IP（本机实测：连抓 5 页后整个站 403，几分钟后恢复），
//     因此本源**只做最小请求**（一次调用一个请求），不做预抓/预载。
//
// 说明：这是「能浏览 + 网页播放」的源，不是直连 m3u8 源。

var HOST = 'https://hqvod.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
var CATS = [
  { id: '', title: '最新更新' },
  { id: '1', title: '电影' },
  { id: '2', title: '剧集' },
  { id: '3', title: '综艺' },
  { id: '4', title: '动漫' }
];
var PAGE_SIZE = 10;

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
    .replace(/\\\//g, '/')
    .replace(/\s+/g, ' ').trim();
}
function abs(u) {
  var s = String(u || '').trim();
  if (!s || s === '/') return '';
  if (/^\/\//.test(s)) return 'https:' + s;
  if (/^\/[^/]/.test(s)) return base() + s;
  return s;
}
function req(path, asJson) {
  var url = /^https?:/i.test(path) ? path : base() + path;
  return LumeSource.http.get(url, {
    headers: {
      'User-Agent': UA,
      Accept: asJson ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: base() + '/',
      'X-Requested-With': 'XMLHttpRequest'
    }
  }).then(function (r) {
    var s = r ? r.status : 0;
    if (!s) throw new Error('连不上：' + url);
    if (s === 403 || s === 429 || s === 503) throw new Error('站点限流/人机校验（HTTP ' + s + '）：歇几分钟再试，或点「网页视图」过校验');
    if (s !== 200) throw new Error('HTTP ' + s);
    var body = r.body ? String(r.body) : '';
    if (asJson) {
      var data = null;
      try { data = JSON.parse(body); } catch (e) { data = null; }
      if (!data || Number(data.code) !== 1) throw new Error('接口没返回数据（站点限流或改版）');
      return data;
    }
    return body;
  });
}
function toItem(row) {
  var sub = [];
  if (row.vod_year) sub.push(String(row.vod_year));
  if (row.vod_area) sub.push(String(row.vod_area));
  if (row.vod_remarks) sub.push(clean(row.vod_remarks));
  return {
    id: String(row.vod_id),
    title: clean(row.vod_name) || ('作品 ' + row.vod_id),
    cover: abs(row.vod_pic),
    subtitle: sub.join(' · ').slice(0, 40),
    intro: clean(row.vod_blurb || row.vod_content || '')
  };
}
function remember(items) {
  if (!items.length) return Promise.resolve(null);
  return readJson('items.json').then(function (c) {
    var map = (c && c.map) ? c.map : {};
    for (var i = 0; i < items.length; i++) {
      map[items[i].id] = { title: items[i].title, cover: items[i].cover, subtitle: items[i].subtitle, intro: items[i].intro };
    }
    var keys = Object.keys(map);
    if (keys.length > 2000) keys.slice(0, keys.length - 2000).forEach(function (k) { delete map[k]; });
    return writeJson('items.json', { at: Date.now(), map: map });
  });
}

var LumeSource = {
  id: 'hqvod_video',
  name: '点播 - 高清',
  version: '1.0.0',
  category: 'video',
  settingsApiVersion: 2,
  requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://hqvod.com'] },
  mirrors: ['https://hqvod.com'],
  commonSettings: [
    { key: 'pageSize', default: 10, min: 1, max: 30 },
    { key: 'playbackMode', default: 'webplayer' }
  ],
  settings: [
    { key: 'note', type: 'info', title: '站点说明', description: '高清点播（hqvod.com）：列表走站内 ajax 数据接口（每页 10 条），播放页有滑块人机校验、脚本拿不到 m3u8，所以播放交给 App 网页视图（过一次滑块即可）。站点反爬严格，连续请求会短时封 IP，本源每次调用只发一个请求。' }
  ],

  async categories() { return CATS.map(function (c) { return { id: c.id, title: c.title }; }); },

  async home() {
    var d = await req('/index.php/ajax/data?mid=1&page=1', true);
    var rows = d.list || [];
    var items = rows.map(toItem);
    await remember(items);
    if (!items.length) return [];
    return [{ title: '最新更新', moreUrl: 'latest', items: items.slice(0, 10) }];
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var catId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var kw = String(args.keyword == null ? '' : args.keyword).trim();

    if (kw) {
      // 站点没有可用的关键词接口（api.php 已关），用本地索引过滤
      var cache = (await readJson('items.json')) || { map: {} };
      var map = cache.map || {};
      var low = kw.toLowerCase();
      var hit = [];
      for (var id in map) {
        if (String(map[id].title).toLowerCase().indexOf(low) >= 0) {
          hit.push({ id: id, title: map[id].title, cover: map[id].cover, subtitle: map[id].subtitle || '' });
        }
      }
      return { items: hit.slice(0, PAGE_SIZE), hasMore: false };
    }

    var path = '/index.php/ajax/data?mid=1&page=' + page + (catId && catId !== 'latest' ? ('&tid=' + catId) : '');
    var d = await req(path, true);
    var items = (d.list || []).map(toItem);
    await remember(items);
    return { items: items, hasMore: Number(d.page) < Number(d.pagecount) };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var cache = (await readJson('items.json')) || { map: {} };
    var row = (cache.map || {})[id] || null;
    var info = { title: '', cover: '', desc: '', plays: [] };
    try {
      var html = await req('/xiangqing/' + id + '.html', false);
      var h1 = clean((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || '');
      var tt = clean((/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || '');
      var bk = (/《([^》]{1,60})》/.exec(tt) || [])[1] || '';
      info.title = h1 || bk || tt.replace(/[_|｜].*$/, '');
      info.cover = abs((/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html) || [])[1]
        || (/<img[^>]+src="([^"]+)"[^>]*class="[^"]*lazy/i.exec(html) || [])[1] || '');
      info.desc = clean((/<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(html) || [])[1] || '');
      var seen = {};
      var re = /\/bofang\/(\d+)-(\d+)-(\d+)\.html/g;
      var m;
      while ((m = re.exec(html)) !== null) {
        var key = m[1] + '-' + m[2] + '-' + m[3];
        if (seen[key]) continue;
        seen[key] = true;
        info.plays.push({ path: '/bofang/' + key + '.html', sid: m[2], nid: m[3] });
      }
    } catch (e) { /* 详情页被限流就用列表缓存兜底 */ }
    if (info.plays && info.plays.length) await writeJson('plays-' + id + '.json', { at: Date.now(), plays: info.plays });
    return {
      id: id,
      title: info.title || (row && row.title) || ('作品 ' + id),
      cover: info.cover || (row && row.cover) || '',
      subtitle: (row && row.subtitle) || '',
      description: info.desc || (row && row.intro) || ''
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return [];
    var cached = (await readJson('plays-' + id + '.json')) || null;
    var plays = (cached && cached.plays) || [];
    if (!plays.length) {
      try {
        var html = await req('/xiangqing/' + id + '.html', false);
        var seen = {};
        var re = /\/bofang\/(\d+)-(\d+)-(\d+)\.html/g;
        var m;
        while ((m = re.exec(html)) !== null) {
          var key = m[1] + '-' + m[2] + '-' + m[3];
          if (seen[key]) continue;
          seen[key] = true;
          plays.push({ path: '/bofang/' + key + '.html', sid: m[2], nid: m[3] });
        }
        if (plays.length) await writeJson('plays-' + id + '.json', { at: Date.now(), plays: plays });
      } catch (e) { /* 落到单集 */ }
    }
    if (!plays.length) return [{ id: '/bofang/' + id + '-1-1.html', title: '网页播放' }];
    return plays.map(function (p, i) {
      return { id: p.path, title: '线路 ' + p.sid + ' · 第 ' + p.nid + ' 集' };
    });
  },

  async content(argument) {
    var args = argument || {};
    var cid = String(args.chapterId || '');
    var id = String(args.id || '').replace(/\D/g, '');
    var path = /^\/bofang\/\d+-\d+-\d+\.html$/.test(cid) ? cid : ('/bofang/' + id + '-1-1.html');
    return { kind: 'webplayer', url: base() + path };
  }
};
