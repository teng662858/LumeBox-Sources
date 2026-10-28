// LumeSource: {"id":"xin6v_video","name":"磁力6V","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://www.xb6v.com","https://xb6v.com"]},"network":"proxy","icon":"https://www.xb6v.com/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：磁力 6V（https://www.xb6v.com）—— 综合片库，列表/详情是纯 HTML，播放走「播放页 → iframe → m3u8」。
//   导航   /{xijupian|dongzuopian|aiqingpian|kehuanpian|kongbupian|juqingpian|zhanzhengpian|jilupian|donghuapian|dianshiju}/index.html
//   翻页   /{分类}/index_{N}.html（第 1 页是 index.html）
//   列表   ul#post_container > li.post → a.zoom[href][title] + img[src]
//   详情   /{分类}/{id}.html：字段在 #post_content 的「◎字段」文本里
//   播放   a.lBtn href="/e/DownSys/play/?classid=..&id=..&pathid1=0&bf=0"
//          播放页里是 <iframe src="https://hn.bfvvs.com/play/{hash}">，
//          iframe 页里 `const vid = 'https://hn.bfvvs.com/play/{hash}/index.m3u8'`（实测 200）
//   搜索   POST /e/search/so.php（302 到 /e/search/result/?searchid=…），结果页同 #post_container
//
// 全站 200、无需登录；站内没有 VIP 门槛，只有磁力/网盘线路与在线线路并存，本源只取在线线路。

var HOST = 'https://www.xb6v.com';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var CATS = [
  { id: 'xijupian', title: '喜剧片' },
  { id: 'dongzuopian', title: '动作片' },
  { id: 'aiqingpian', title: '爱情片' },
  { id: 'kehuanpian', title: '科幻片' },
  { id: 'kongbupian', title: '恐怖片' },
  { id: 'juqingpian', title: '剧情片' },
  { id: 'zhanzhengpian', title: '战争片' },
  { id: 'jilupian', title: '纪录片' },
  { id: 'donghuapian', title: '动画片' },
  { id: 'dianshiju', title: '电视剧' },
];
var PAGE_SIZE = 20;

function base() {
  var d = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (d || HOST).replace(/\/+$/, '');
}

function readJson(f) {
  return LumeSource.fs.readText(f).then(function (raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }).catch(function () { return null; });
}
function writeJson(f, v) {
  return LumeSource.fs.writeText(f, JSON.stringify(v)).catch(function () { return null; });
}

function clean(t) {
  return String(t == null ? '' : t)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function get(url, headers) {
  return LumeSource.http.get(url, {
    headers: Object.assign({ 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9', Referer: base() + '/' }, headers || {}),
  }).then(function (r) {
    var status = r ? r.status : 0;
    if (status !== 200) throw new Error('页面打不开：HTTP ' + status);
    return r.body ? String(r.body) : '';
  });
}

function listPath(cat, page) {
  var n = Number(page) || 1;
  return '/' + cat + (n <= 1 ? '/index.html' : '/index_' + n + '.html');
}

function parseCards(html) {
  var items = [];
  var seen = {};
  var re = /<li class="post[^"]*"[\s\S]{0,1200}?<a href="([^"]+)"[^>]*class="zoom"[^>]*title="([^"]*)"[\s\S]{0,400}?<img src="([^"]+)"/g;
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    var href = m[1];
    if (seen[href]) continue;
    seen[href] = true;
    items.push({
      id: /^https?:/.test(href) ? href : base() + href,
      title: clean(m[2]),
      cover: m[3].replace(/^http:\/\//i, 'https://'),
      subtitle: '',
    });
  }
  return items;
}

function fields(html) {
  // 详情页是「◎片 名: xxx◎年 代: 2026…」这类整段文本
  var text = clean((/<div[^>]+id="post_content"[^>]*>([\s\S]*?)<\/div>/i.exec(String(html || '')) || [])[1] || '');
  var out = { text: text.slice(0, 600) };
  var pick = function (key) {
    var r = new RegExp('◎' + key + '\\s*[:：]\\s*([^◎]{1,80})').exec(text);
    return r ? clean(r[1]) : '';
  };
  out.name = pick('片\\s*名') || pick('剧\\s*名') || pick('标\\s*题');
  out.year = pick('年\\s*代');
  out.area = pick('产\\s*地');
  out.kind = pick('类\\s*别');
  return out;
}

function playLinks(html) {
  var out = [];
  var re = /<a[^>]+href\s*=\s*"([^"]*\/e\/DownSys\/play\/[^"]*)"[^>]*class="lBtn"[^>]*>([^<]*)</g;
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    var url = m[1];
    out.push({ id: 'web:' + url, title: clean(m[2]) || ('线路' + (out.length + 1)), url: url });
  }
  // 属性顺序不同的写法兜一下
  if (!out.length) {
    var re2 = /<a[^>]*class="lBtn"[^>]*href\s*=\s*"([^"]*\/e\/DownSys\/play\/[^"]*)"[^>]*>([^<]*)</g;
    while ((m = re2.exec(String(html || ''))) !== null) out.push({ id: 'web:' + m[1], title: clean(m[2]) || ('线路' + (out.length + 1)), url: m[1] });
  }
  return out;
}

function abs(u) {
  var s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:/i.test(s)) return s;
  return base() + (s.charAt(0) === '/' ? '' : '/') + s;
}

async function resolveMedia(playPageUrl) {
  var page = await get(playPageUrl, { Referer: base() + '/' });
  var iframe = (/<iframe[^>]+src=["']([^"']+)["']/i.exec(page) || [])[1] || '';
  var m3u8Inline = (/["']([^"']+\.m3u8[^"']*)["']/.exec(page) || [])[1] || '';
  if (m3u8Inline) return abs(m3u8Inline);
  if (!iframe) return '';
  var iframeUrl = /^https?:/i.test(iframe) ? iframe : abs(iframe);
  var inner = await get(iframeUrl, { Referer: playPageUrl });
  var vid = (/const\s+vid\s*=\s*['"]([^'"]+)['"]/.exec(inner) || [])[1] || '';
  if (vid) return /(?:\.m3u8)(?:\?|$)/i.test(vid) ? vid : vid.replace(/\/+$/, '') + '/index.m3u8';
  var m2 = (/["']([^"']+\.m3u8[^"']*)["']/.exec(inner) || [])[1] || '';
  return m2 ? (/^https?:/i.test(m2) ? m2 : new URL(m2, iframeUrl).href) : '';
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
  id: 'xin6v_video',
  name: '磁力6V',
  version: '1.0.0',
  category: 'video',
  settingsApiVersion: 2,
  requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://www.xb6v.com', 'https://xb6v.com'] },
  commonSettings: [
    { key: 'pageSize', default: 20, min: 1, max: 50 },
    { key: 'playbackMode', default: 'auto' },
  ],
  settings: [
    { key: 'note', type: 'info', title: '站点说明', description: '6V 是磁力+在线双线路站点，本源只用在线线路（m3u8）；磁力链接不解析。' },
  ],

  async categories() {
    return CATS;
  },

  async home() {
    var boards = [];
    for (var i = 0; i < CATS.length && boards.length < 4; i++) {
      try {
        var html = await get(base() + listPath(CATS[i].id, 1));
        var items = parseCards(html);
        if (items.length) {
          await remember(items);
          boards.push({ title: CATS[i].title, moreUrl: CATS[i].id, items: items.slice(0, 12) });
        }
      } catch (e) { /* 单个板块失败跳过 */ }
    }
    return boards;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    var cat = String(args.categoryId == null ? '' : args.categoryId).trim() || 'xijupian';
    if (!/^[a-z0-9_]+$/i.test(cat)) cat = 'xijupian';
    if (keyword) {
      // 站内搜索：POST /e/search/so.php → 结果页
      var post = await LumeSource.http.post(base() + '/e/search/so.php', 'keyboard=' + encodeURIComponent(keyword) + '&show=title&Submit=+', {
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Referer: base() + '/' },
      });
      var body = post && post.body ? String(post.body) : '';
      var items = parseCards(body);
      if (!items.length) return { items: [], hasMore: false };
      await remember(items);
      return { items: items, hasMore: false };
    }
    var html = await get(base() + listPath(cat, page));
    var pageItems = parseCards(html);
    await remember(pageItems);
    var hasNext = new RegExp('index_' + (page + 1) + '\\.html').test(html) || pageItems.length >= PAGE_SIZE;
    return { items: pageItems, hasMore: hasNext };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '');
    if (!id) return null;
    var url = /^https?:/.test(id) ? id : abs(id);
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    var info = { name: '', year: '', area: '', kind: '', text: '' };
    var cover = (row && row.cover) || '';
    try {
      var html = await get(url);
      info = fields(html);
      if (!cover) {
        var img = (/<div[^>]+id="post_content"[\s\S]{0,3000}?<img[^>]+src="([^"]+)"/i.exec(html) || [])[1]
          || (/<img[^>]+src="([^"]+)"[^>]*class="[^"]*(?:alignnone|wp-post-image)[^"]*"/i.exec(html) || [])[1] || '';
        if (img) cover = img.replace(/^http:\/\//i, 'https://');
      }
    } catch (e) { /* 用缓存 */ }
    return {
      id: id,
      title: info.name || (row && row.title) || ('作品 ' + id),
      cover: cover,
      subtitle: clean([info.year, info.area, info.kind].filter(Boolean).join(' · ')),
      description: info.text || '磁力6V（www.xb6v.com）',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '');
    if (!id) return [];
    var url = /^https?:/.test(id) ? id : abs(id);
    var html = await get(url);
    var links = playLinks(html);
    if (!links.length) return [{ id: 'web:' + url, title: '网页播放' }];
    return links.map(function (l) { return { id: l.id, title: l.title }; });
  },

  async content(argument) {
    var args = argument || {};
    var raw = String(args.chapterId || '');
    var playUrl = raw.indexOf('web:') === 0 ? raw.slice(4) : raw;
    if (!playUrl) throw new Error('缺少播放页地址');
    playUrl = abs(playUrl);
    var media = await resolveMedia(playUrl);
    if (media) return { kind: 'video', url: media, headers: { 'User-Agent': UA, Referer: playUrl } };
    return { kind: 'webplayer', url: playUrl };
  },
};
