// LumeSource: {"id":"huajuan_video","name":"花卷4K","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://www.zhizhen8.click","https://zhizhen8.click"]},"network":"proxy","icon":"https://www.zhizhen8.click/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：花卷 4K（www.zhizhen8.click）—— 苹果CMS v10 规范路由：
//   列表 /index.php/vod/type/id/{分类}.html，翻页 …/page/{页}.html
//   详情 /index.php/vod/detail/id/{id}.html
//   播放 /index.php/vod/play/id/{id}/sid/{源}/nid/{集}.html，页内 player_data/player_aaaa（encrypt 0/1/2）
// 首页 637KB、720 条卡片实测可解析。

var HOST = 'https://www.zhizhen8.click';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
var CATS = [{ id: '1', title: '电影' }, { id: '2', title: '连续剧' }, { id: '3', title: '综艺' }, { id: '22', title: '动漫' }, { id: '23', title: '短剧' }];
var PAGE_SIZE = 24;

function base() { var d = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : ''; return (d || HOST).replace(/\/+$/, ''); }
function readJson(f) { return LumeSource.fs.readText(f).then(function (r) { if (!r) return null; try { return JSON.parse(r); } catch (e) { return null; } }).catch(function () { return null; }); }
function writeJson(f, v) { return LumeSource.fs.writeText(f, JSON.stringify(v)).catch(function () { return null; }); }
function clean(t) { return String(t == null ? '' : t).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function get(url) {
  return LumeSource.http.get(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*', Referer: base() + '/' } }).then(function (r) {
    var s = r ? r.status : 0;
    if (!s) throw new Error('连不上');
    if (s === 403 || s === 429 || s === 503) throw new Error('要过站点校验：先在源里点一次网页视图');
    if (s !== 200) throw new Error('HTTP ' + s);
    return r.body ? String(r.body) : '';
  });
}
function img(u) { var s = String(u || '').trim(); if (!s) return ''; if (/^\/\//.test(s)) return 'https:' + s; if (/^http:\/\//i.test(s)) return s.replace(/^http:/i, 'https:'); if (/^\//.test(s)) return base() + s; return s; }
function atobSafe(s) { var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; var src = String(s || '').replace(/[^A-Za-z0-9+/=]/g, ''); var out = '', buf = 0, bits = 0; for (var i = 0; i < src.length; i++) { var c = src.charAt(i); if (c === '=') break; var v = A.indexOf(c); if (v < 0) continue; buf = (buf << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 0xff); } } try { return decodeURIComponent(escape(out)); } catch (e) { return out; } }

function parseCards(html) {
  var text = String(html || ''), items = [], seen = {};
  var re = /\/index\.php\/vod\/detail\/id\/(\d+)\.html/g, m;
  while ((m = re.exec(text)) !== null) {
    var vid = m[1];
    if (seen[vid]) continue;
    var win = text.slice(Math.max(0, m.index - 700), m.index + 700);
    var title = (/title="([^"]{2,80})"/.exec(win) || [])[1] || (/alt="([^"]{2,80})"/.exec(win) || [])[1] || '';
    if (!title || /查看全部|更多|全部影片/.test(title)) continue;
    var cover = '';
    var tags = win.match(/<img[^>]*>/gi) || [];
    for (var ci = 0; ci < tags.length; ci++) {
      var val = (/(?:data-original|data-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i.exec(tags[ci]) || [])[1] || '';
      if (val && !/loading\.|placeholder|nopic|lazy/i.test(val)) { cover = val; break; }
    }
    if (!title && !cover) continue;
    seen[vid] = 1;
    items.push({ id: vid, title: (clean(title) || ('作品 ' + vid)).slice(0, 60), cover: img(cover), subtitle: '' });
  }
  return items;
}

var LumeSource = {
  id: 'huajuan_video', name: '花卷4K', version: '1.0.0', category: 'video',
  settingsApiVersion: 2, requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://www.zhizhen8.click', 'https://zhizhen8.click'] },
  commonSettings: [{ key: 'pageSize', default: 24, min: 1, max: 50 }, { key: 'playbackMode', default: 'auto' }],
  settings: [{ key: 'note', type: 'info', title: '站点说明', description: '花卷4K：苹果CMS 规范路由，播放按 player_data encrypt 0/1/2 解密。' }],

  async categories() { return CATS; },

  async home() {
    var boards = [];
    for (var i = 0; i < CATS.length && boards.length < 4; i++) {
      try {
        var items = parseCards(await get(base() + '/index.php/vod/type/id/' + CATS[i].id + '.html'));
        if (items.length) { await writeJson('items.json', { at: Date.now(), map: {} }); boards.push({ title: CATS[i].title, moreUrl: CATS[i].id, items: items.slice(0, 12) }); }
      } catch (e) {}
    }
    return boards;
  },

  async list(argument) {
    var a = argument || {}, page = Number(a.page || 1) || 1;
    var cat = /^\d+$/.test(String(a.categoryId || '')) ? String(a.categoryId) : '1';
    var kw = String(a.keyword || '').trim();
    var url = kw
      ? base() + '/index.php/vod/search.html?wd=' + encodeURIComponent(kw) + '&page=' + page
      : base() + '/index.php/vod/type/id/' + cat + (page > 1 ? '/page/' + page : '') + '.html';
    var items = parseCards(await get(url));
    return { items: items, hasMore: items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var html = await get(base() + '/index.php/vod/detail/id/' + id + '.html');
    var title = clean((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html) || [])[1] || '');
    var cover = img((/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html) || [])[1] || '');
    var desc = clean((/<div[^>]+class="[^"]*(?:content|desc|intro)[^"]*"[^>]*>([\s\S]{0,1200}?)<\/div>/.exec(html) || [])[1] || '');
    return { id: id, title: title || ('作品 ' + id), cover: cover, subtitle: '', description: desc };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return [];
    var html = await get(base() + '/index.php/vod/detail/id/' + id + '.html');
    var plays = [], seen = {}, re = /href="([^"]*\/index\.php\/vod\/play\/id\/\d+\/sid\/\d+\/nid\/\d+\.html)"/g, m;
    while ((m = re.exec(html)) !== null) { if (!seen[m[1]]) { seen[m[1]] = 1; plays.push(m[1]); } }
    if (!plays.length) return [{ id: 'web:' + id, title: '网页播放' }];
    return plays.map(function (p, i) { return { id: 'p:' + p, title: '线路 ' + (i + 1) }; });
  },

  async content(argument) {
    var a = argument || {}, raw = String(a.chapterId || '');
    if (raw.indexOf('web:') === 0) return { kind: 'webplayer', url: base() + '/index.php/vod/detail/id/' + String(a.id || '').replace(/\D/g, '') + '.html' };
    var path = raw.indexOf('p:') === 0 ? raw.slice(2) : raw;
    var url = /^https?:/.test(path) ? path : base() + path;
    var html = await get(url);
    var direct = (/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/.exec(html) || [])[1] || '';
    if (direct) return { kind: 'video', url: direct, headers: { 'User-Agent': UA, Referer: base() + '/' } };
    var pd = /(?:player_aaaa|player_data)\s*=\s*(\{[\s\S]{10,1200}?\})/.exec(html);
    if (pd) {
      try {
        var d = JSON.parse(pd[1]), u = String(d.url || '');
        if (Number(d.encrypt) === 1 || Number(d.encrypt) === 2) u = atobSafe(u);
        if (/\.m3u8|\.mp4/i.test(u)) return { kind: 'video', url: u, headers: { 'User-Agent': UA, Referer: base() + '/' } };
      } catch (e) {}
    }
    return { kind: 'webplayer', url: url };
  }
};
