// LumeSource: {"id":"nivod_video","name":"泥视频","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://www.nivod.cc"]},"network":"proxy","icon":"https://www.nivod.cc/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：泥视频（https://www.nivod.cc）—— SSR + Vue 客户端播放（SSR 直出列表/详情，播放地址由前端异步取）。
//   首页   /           → 144 个 /voddetail/{id} 卡片（img /imgs/small/{id}.jpg）
//   详情   /voddetail/{id}（注意：没有 .html 后缀）
//   选集   /vodplay/{id}/ep{n}
//   播放   播放页里没有明文 m3u8（Vue 客户端播），源先扫页面里的 m3u8/mp4 与 JSON url 字段，
//          都没有就交给内嵌浏览器播（webplayer）。
//   搜索   /search?k={关键词}

var HOST = 'https://www.nivod.cc';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
var CATS = [{ id: 'home', title: '首页推荐' }, { id: 'search', title: '搜索' }];
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
  var re = /<a[^>]+href="\/voddetail\/(\d+)"[\s\S]{0,400}?<\/a>/g, m;
  while ((m = re.exec(text)) !== null) {
    var id = m[1];
    if (seen[id]) continue;
    var block = m[0];
    var title = (/title="([^"]{1,80})"/.exec(block) || [])[1] || (/alt="([^"]{1,80})"/.exec(block) || [])[1] || '';
    var cover = (/<img[^>]+(?:data-original|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i.exec(block) || [])[1] || ('/imgs/small/' + id + '.jpg');
    if (!title) continue;
    seen[id] = 1;
    items.push({ id: id, title: clean(title).slice(0, 60), cover: img(cover), subtitle: '' });
  }
  return items;
}

function parseDetail(html) {
  var text = String(html || '');
  var title = (/<h1[^>]*>([\s\S]{1,120}?)<\/h1>/i.exec(text) || [])[1] || (/<title>([^<]*)</.exec(text) || [])[1] || '';
  var cover = (/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(text) || [])[1] || '';
  var eps = [], seen = {};
  var re = /href="(\/vodplay\/\d+\/ep\d+)"/g, m;
  while ((m = re.exec(text)) !== null) { if (!seen[m[1]]) { seen[m[1]] = 1; eps.push(m[1]); } }
  return { title: clean(title), cover: img(cover), eps: eps };
}

var LumeSource = {
  id: 'nivod_video', name: '泥视频', version: '1.0.0', category: 'video',
  settingsApiVersion: 2, requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://www.nivod.cc'] },
  commonSettings: [{ key: 'pageSize', default: 24, min: 1, max: 50 }, { key: 'playbackMode', default: 'auto' }],
  settings: [{ key: 'note', type: 'info', title: '站点说明', description: '泥视频：列表/详情直出可解析；播放地址由前端异步取，取不到时用内嵌浏览器播放。' }],

  async categories() { return CATS; },

  async home() {
    var items = parseCards(await get(base() + '/'));
    if (!items.length) return [];
    await writeJson('items.json', { at: Date.now(), map: {} });
    return [{ title: '首页推荐', moreUrl: 'home', items: items.slice(0, 12) }];
  },

  async list(argument) {
    var a = argument || {}, page = Number(a.page || 1) || 1;
    var kw = String(a.keyword || '').trim();
    var url = kw ? base() + '/search?k=' + encodeURIComponent(kw) + '&page=' + page : base() + '/';
    var items = parseCards(await get(url));
    var cached = (await readJson('items.json')) || { map: {} };
    var map = cached.map || {};
    for (var i = 0; i < items.length; i++) map[items[i].id] = { title: items[i].title, cover: items[i].cover };
    await writeJson('items.json', { at: Date.now(), map: map });
    return { items: items, hasMore: !kw && items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    var info = { title: '', cover: '' };
    try { info = parseDetail(await get(base() + '/voddetail/' + id)); } catch (e) { /* 缓存 */ }
    return {
      id: id,
      title: info.title || (row && row.title) || ('作品 ' + id),
      cover: info.cover || (row && row.cover) || img('/imgs/small/' + id + '.jpg'),
      subtitle: '',
      description: '泥视频（www.nivod.cc）',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return [];
    var info = { eps: [] };
    try { info = parseDetail(await get(base() + '/voddetail/' + id)); } catch (e) { /* 忽略 */ }
    if (!info.eps.length) return [{ id: 'web:/voddetail/' + id, title: '网页播放' }];
    return info.eps.map(function (p, i) { return { id: 'p:' + p, title: '第' + (i + 1) + '集' }; });
  },

  async content(argument) {
    var a = argument || {}, raw = String(a.chapterId || '');
    var path = raw.indexOf('p:') === 0 ? raw.slice(2) : raw;
    if (!path || path.indexOf('web:') === 0) {
      var vid = String(a.id || '').replace(/\D/g, '');
      return { kind: 'webplayer', url: base() + '/voddetail/' + vid };
    }
    var url = /^https?:/.test(path) ? path : base() + path;
    var html = await get(url);
    var media = (/["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/.exec(html) || [])[1]
      || (/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/.exec(html) || [])[1] || '';
    if (media) return { kind: 'video', url: media, headers: { 'User-Agent': UA, Referer: base() + '/' } };
    return { kind: 'webplayer', url: url };
  },
};
