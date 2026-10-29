// LumeSource: {"id":"laosiji_video","name":"老司机在线","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://laosiji.online"],"network":"direct","icon":"https://laosiji.online/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"老司机在线（laosiji.online）：国产/自拍类短视频，Astro 服务端渲染，15 个分类。列表分类页路径式分页 /category/<id>/<n>/（?page= 无效），搜索 /search?q=&page=N。详情页 <video data-src> 直给 m3u8（播放域 NNNN.xbv2608.com，逐条不同，不可拼）。直连可访问。"}]}
// LumeRuntime: javascript
//
// 站点：老司机在线（https://laosiji.online）
//
// 结构（2026-10-30 实测）：
//   首页   15 个 <section class="mb-10">，每块 h2 标题 + 12/20 个卡片
//   列表   /category/<id>/（第1页）、/category/<id>/<n>/（n≥2）；?page= 无效
//   搜索   /search?q=<词>&page=<n>（搜索这里用 ?page=）
//   详情   /video/<id>/
//   播放   <video id="video-player" ... data-src="https://2608.xbv2608.com/…/index.m3u8">
//          域名/日期目录逐条不同，只能从页面取；m3u8 无 Referer 也能播（206）
//   卡片   <a href="/video/(\d+)/" class="block group no-underline"> … <img src="…" alt="标题"

var DEFAULT_DOMAIN = 'https://laosiji.online';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_CATS = [
  [54, '无码流出'], [55, '国产精品'], [63, '人妻系列'], [66, '福利姬'],
  [70, '巨乳系列'], [71, '颜射系列'], [72, '口交视频'], [73, '自慰系列'],
  [74, '教师学生'], [80, '黑料网曝'], [81, '精品探花'], [82, '抖音网红'],
  [83, '反差婊'], [85, '熟女少妇'], [89, '国产传媒']
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_DOMAIN).replace(/\/+$/, '');
}

function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
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
  if (!status) throw new Error('老司机：连不上（' + url + '）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('老司机：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

function parseCards(html) {
  var re = /<a href="\/video\/(\d+)\/"[^>]*>[\s\S]{0,400}?<img src="([^"]+)" alt="([^"]*)"/g;
  var out = [];
  var seen = {};
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    if (seen[m[1]]) continue;
    seen[m[1]] = 1;
    out.push({
      id: m[1],
      title: clean(m[3]) || ('视频 ' + m[1]),
      cover: absolute(m[2]) || null,
      subtitle: ''
    });
  }
  return out;
}

function hasNext(html, page) {
  return new RegExp('href="[^"]*\\/' + (page + 1) + '\\/"').test(String(html || ''));
}

function categoryRows() {
  var rows = [];
  for (var i = 0; i < FALLBACK_CATS.length; i++) rows.push({ id: String(FALLBACK_CATS[i][0]), title: FALLBACK_CATS[i][1] });
  return rows;
}

var LumeSource = {
  id: 'laosiji_video',
  name: '老司机在线',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://laosiji.online'],

  async home() {
    var html = await get('/');
    var sections = [];
    var blocks = String(html).split('<section class="mb-10">');
    for (var i = 1; i < blocks.length; i++) {
      var block = blocks[i];
      var title = clean((/<h2[^>]*>([\s\S]{0,80}?)<\/h2>/.exec(block) || [])[1]);
      if (!title) continue;
      var items = parseCards(block).slice(0, 12);
      if (!items.length) continue;
      sections.push({ title: title, items: items });
      if (sections.length >= 8) break;
    }
    if (!sections.length) throw new Error('老司机：首页没有条目（站点可能改版）');
    return sections;
  },

  async categories() {
    return categoryRows();
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = clean(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();

    var path;
    if (keyword) {
      path = '/search?q=' + encodeURIComponent(keyword) + (page > 1 ? '&page=' + page : '');
    } else {
      var id = categoryId.replace(/[^0-9]/g, '') || String(FALLBACK_CATS[0][0]);
      path = '/category/' + id + '/' + (page > 1 ? page + '/' : '');
    }
    var html = await get(path);
    var items = parseCards(html);
    if (!items.length) console.warn('[laosiji] 列表没解析出条目：' + path);
    return { items: items, hasMore: hasNext(html, page) };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = await get('/video/' + id + '/');
    var title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    if (!title) title = clean((/property="og:title"[^>]+content="([^"]+)"/i.exec(html) || [])[1]);
    if (!title) title = clean((/<title[^>]*>([\s\S]*?)<\/title>/.exec(html) || [])[1]).replace(/\s*-\s*老司机.*$/, '');
    var cover = ([/property="og:image"[^>]+content="([^"]+)"/i.exec(html) || []])[1] || '';
    if (!cover) cover = (/<video[^>]+poster="([^"]+)"/.exec(html) || [])[1] || '';
    var desc = clean((/name="description"[^>]+content="([^"]*)"/.exec(html) || [])[1]);
    return {
      id: id,
      title: title || ('视频 ' + id),
      cover: absolute(cover) || null,
      subtitle: '',
      description: desc ? desc + '\n源站：' + base() + '/video/' + id + '/' : '源站：' + base() + '/video/' + id + '/'
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'play', title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || args.itemId || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('老司机：缺少视频 id');
    var pageUrl = base() + '/video/' + id + '/';
    var html = await get('/video/' + id + '/');
    var url = (/<video[^>]+data-src="(https?:\/\/[^"]+\.m3u8[^"]*)"/.exec(html) || [])[1] || '';
    if (!url) url = (/"contentUrl"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/.exec(html) || [])[1] || '';
    if (!url) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    url = entity(url).replace(/\\\//g, '/');
    return {
      kind: 'video',
      url: url,
      headers: { 'User-Agent': UA, Referer: pageUrl, Range: 'bytes=0-1023' }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
