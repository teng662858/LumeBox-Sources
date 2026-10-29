// LumeSource: {"id":"avbebe_video","name":"Avbebe","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://avbebe.com","https://avbebe.love","https://avbebe.org"],"network":"proxy","icon":"https://avbebe.com/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"Avbebe（avbebe.com）：里番/3D 動畫/中字 AV 资源站，WordPress + JNews 主题 + FV Flowplayer。列表 /archives/category/<分类>/page/N，搜索 /?s=<词>。详情页 data-item 里按集给出 52cute.com 的 m3u8，播放必须带 Referer: https://avbebe.com/（否则 403）。国内直连不通，需要代理；备用域名 avbebe.love / avbebe.org。"}]}
// LumeRuntime: javascript
//
// 站点：Avbebe（https://avbebe.com）
//
// 结构（2026-10-30 实测）：
//   列表   /archives/category/<分类>（第1页）、/archives/category/<分类>/page/<n>（n≥2，末尾不带斜杠）
//   搜索   /?s=<词>&paged=<n>
//   详情   /archives/<id>
//   播放   <div id="wpfp_…" data-item="{&quot;sources&quot;:[{&quot;src&quot;:&quot;https://52cute.com/acg/<id>/01/video.m3u8&quot;…
//          HTML 实体编码，unescape 后是 JSON；一条片子可能有多集（01…08）
//          播放需 Referer: https://avbebe.com/，否则 403
//   卡片   <article class="jeg_post …"><h3 class="jeg_post_title"><a href="https://avbebe.com/archives/<id>">标题</a>
//          <img … data-src="https://avbebe.com/wp-content/uploads/…jpg">

var DEFAULT_DOMAIN = 'https://avbebe.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// [slug（已 urlencode 前的原文）, 显示名]
var FALLBACK_CATS = [
  ['h動畫影片', '動畫卡通'],
  ['3d動畫', '3D動畫'],
  ['泡麵番', '泡麵番'],
  ['成年h漫畫', '綜合漫畫'],
  ['高清中字', '高清中字'],
  ['高清素人', '高清素人'],
  ['高清素人/絕美逸品', '絕美逸品'],
  ['馬賽克破解', '馬賽克破解'],
  ['華語AV', '華語AV'],
  ['綜合AV', '綜合AV'],
  ['new', '新番']
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_DOMAIN).replace(/\/+$/, '');
}

function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.6',
    Referer: referer || base() + '/'
  };
}

function entity(text) {
  return String(text == null ? '' : text).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (all, code) {
    var map = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
    if (map[code] !== undefined) return map[code];
    if (code.charAt(0) === '#') {
      var n = code.charAt(1) === 'x' || code.charAt(1) === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (isFinite(n) && n > 0 && n < 0x110000) return String.fromCharCode(n);
    }
    return all;
  });
}

function clean(text) {
  return entity(String(text == null ? '' : text).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  var value = entity(String(url == null ? '' : url)).trim();
  if (!value || /^data:/i.test(value)) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.charAt(0) === '/') return base() + value;
  return base() + '/' + value;
}

async function get(path) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var reply = await LumeSource.http.get(url, { headers: headers() });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (!status) throw new Error('Avbebe：连不上（' + url + '，国内需代理）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('Avbebe：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

// data-item 是 HTML 实体编码的 JSON；按顺序取出每集的 src（一条片子多集）
function playSources(html) {
  var text = entity(String(html || '')).replace(/\\\//g, '/');
  var out = [];
  var re = /"src"\s*:\s*"(https?:\/\/[^"]+)"/g;
  var hit;
  while ((hit = re.exec(text)) !== null) {
    if (out.indexOf(hit[1]) < 0) out.push(hit[1]);
  }
  return out;
}

function parseCards(html) {
  var re = /<h3 class="jeg_post_title">\s*<a href="https?:\/\/[^"]*\/archives\/(\d+)"[^>]*>([\s\S]{0,200}?)<\/a>/g;
  var out = [];
  var seen = {};
  var m;
  var text = String(html || '');
  while ((m = re.exec(text)) !== null) {
    if (seen[m[1]]) continue;
    seen[m[1]] = 1;
    // 封面在同一篇文章块里，往回找最近的一个 data-src
    var start = Math.max(0, m.index - 1200);
    var chunk = text.slice(start, m.index);
    var covers = chunk.match(/data-src="(https:\/\/avbebe\.com\/wp-content\/uploads\/[^"]+)"/g) || [];
    var cover = covers.length ? covers[covers.length - 1].replace(/^data-src="/, '').replace(/"$/, '') : '';
    out.push({ id: m[1], title: clean(m[2]) || ('影片 ' + m[1]), cover: absolute(cover) || null, subtitle: '' });
  }
  return out;
}

var LumeSource = {
  id: 'avbebe_video',
  name: 'Avbebe',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://avbebe.com', 'https://avbebe.love', 'https://avbebe.org'],

  async home() {
    var plan = [['/archives/category/new', '新番'], ['/archives/category/h動畫影片', '動畫卡通'], ['/archives/category/高清中字', '高清中字']];
    var sections = [];
    for (var i = 0; i < plan.length; i++) {
      try {
        var html = await get(encodeURI(plan[i][0]));
        var items = parseCards(html);
        if (items.length) sections.push({ title: plan[i][1], items: items.slice(0, 20) });
      } catch (error) {
        console.warn('[avbebe] 首页抓取失败 ' + plan[i][1] + '：' + error);
      }
    }
    if (!sections.length) throw new Error('Avbebe：首页没有条目（站点可能改版或需要代理）');
    return sections;
  },

  async categories() {
    var out = [];
    for (var i = 0; i < FALLBACK_CATS.length; i++) out.push({ id: String(i), title: FALLBACK_CATS[i][1] });
    return out;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = clean(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();

    var path;
    if (keyword) {
      path = '/?s=' + encodeURIComponent(keyword) + (page > 1 ? '&paged=' + page : '');
    } else {
      var index = parseInt(categoryId, 10);
      if (!(index >= 0 && index < FALLBACK_CATS.length)) index = 0;
      path = encodeURI('/archives/category/' + FALLBACK_CATS[index][0]) + (page > 1 ? '/page/' + page : '');
    }
    var html = await get(path);
    var items = parseCards(html);
    if (!items.length) console.warn('[avbebe] 列表没解析出条目：' + path);
    return { items: items, hasMore: items.length >= 12 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = await get('/archives/' + id);
    var title = clean((/property="og:title"[^>]+content="([^"]+)"/i.exec(html) || [])[1]);
    if (!title) title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    title = title.replace(/\s*[-–|]\s*Avbebe.*$/i, '').trim();
    var cover = (/(?:property|name)=["']og:image["'][^>]{0,200}?content=["']([^"']+)/i.exec(html) || [])[1] || '';
    var cats = clean((/class="[^"]*cat-links[^"]*"[\s\S]{0,400}?<\/div>/.exec(html) || [])[0] || '');
    var desc = clean((/name="description"[^>]+content="([^"]*)"/.exec(html) || [])[1]);
    var eps = playSources(html);
    return {
      id: id,
      title: title || ('影片 ' + id),
      cover: absolute(cover) || null,
      subtitle: eps.length > 1 ? '共 ' + eps.length + ' 集' : cats,
      description: (desc ? desc + '\n' : '') + '源站：' + base() + '/archives/' + id
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    var html = await get('/archives/' + id);
    var eps = playSources(html);
    if (eps.length <= 1) return [{ id: '0', title: '正片' }];
    var out = [];
    for (var i = 0; i < eps.length; i++) out.push({ id: String(i), title: '第 ' + (i + 1) + ' 集' });
    return out;
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || args.itemId || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('Avbebe：缺少影片 id');
    var pageUrl = base() + '/archives/' + id;
    var html = await get('/archives/' + id);
    var eps = playSources(html);
    if (!eps.length) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    var index = Number(args.chapterId);
    if (!(index >= 0 && index < eps.length)) index = 0;
    return {
      kind: 'video',
      url: eps[index],
      headers: { 'User-Agent': UA, Referer: 'https://avbebe.com/', Range: 'bytes=0-1023' }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
