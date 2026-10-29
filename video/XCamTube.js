// LumeSource: {"id":"xcamtube_video","name":"XCamTube","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://xcamtube.com"],"network":"direct","icon":"https://xcamtube.com/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"XCamTube（xcamtube.com）：网黄直播录播归档（cam 站存档）。列表 /recent?page=<n>、/new、/top，分类 /female /male /couple /trans，搜索 /search?q=<词>。**正片在 Premium 登录墙后**：详情页 data-unlocked=0，接口 /api/video/<id>/media 未登录返回 401。已登录用户可在「源设置 → 网络 → Cookie」填站点 Cookie，脚本会用你的登录态直连播放；没填就一直打开网页播放。"}]}
// LumeRuntime: javascript
//
// 站点：XCamTube（https://xcamtube.com，nginx + FastAPI 风格自研后端）
//
// 结构（2026-10-30 实测）：
//   列表   /recent?page=<n>、/new、/top；分类 /female /male /couple /trans；搜索 /search?q=<词>
//   详情   /video/<id>-<slug>
//   播放   详情页 <article class="video-page" data-id="373645" data-unlocked="0" data-media-api="/api/video/373645/media">
//          前端 POST 该接口（FormData kind=play）取 {url}；未登录 401 {"error":"login"}
//          所以：填了 Cookie（Premium）→ 直连；没填 → webplayer 打开网页
//   卡片   <article class="card" data-id="373681"><a href="/video/<id>-<slug>" class="thumb"
//          data-base="/media/thumb/bonga/132856/"><img src="/media/thumb/…/cover.jpg" alt="标题">
//
// 站点直连可访问（国内 200），媒体在自有 CDN。

var DEFAULT_DOMAIN = 'https://xcamtube.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_CATS = [
  ['recent', '最近'], ['new', '最新'], ['top', '排行'],
  ['female', 'Female'], ['male', 'Male'], ['couple', 'Couple'], ['trans', 'Trans']
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_DOMAIN).replace(/\/+$/, '');
}

function userCookie() {
  var cfg = LumeSource.config || {};
  return String(cfg.cookie || '').trim();
}

function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
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
  if (!status) throw new Error('XCamTube：连不上（' + url + '）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('XCamTube：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

function parseCards(html) {
  var re = /<article class="card" data-id="(\d+)"[\s\S]{0,400}?<a href="\/video\/(\d+)-([^"]+)" class="thumb"[^>]*data-base="([^"]*)"[\s\S]{0,600}?<img src="([^"]+)" alt="([^"]*)"/g;
  var out = [];
  var seen = {};
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    var id = m[2] + '-' + m[3];
    if (seen[id]) continue;
    seen[id] = 1;
    out.push({ id: id, title: clean(m[6]) || ('视频 ' + m[2]), cover: absolute(m[5]) || null, subtitle: '' });
  }
  return out;
}

var LumeSource = {
  id: 'xcamtube_video',
  name: 'XCamTube',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://xcamtube.com'],

  async home() {
    var plan = [['/recent', '最近'], ['/top', '排行'], ['/new', '最新']];
    var sections = [];
    for (var i = 0; i < plan.length; i++) {
      try {
        var items = parseCards(await get(plan[i][0]));
        if (items.length) sections.push({ title: plan[i][1], items: items.slice(0, 20) });
      } catch (error) {
        console.warn('[xcamtube] 首页抓取失败 ' + plan[i][1] + '：' + error);
      }
    }
    if (!sections.length) throw new Error('XCamTube：首页没有条目（站点可能改版）');
    return sections;
  },

  async categories() {
    var out = [];
    for (var i = 0; i < FALLBACK_CATS.length; i++) out.push({ id: FALLBACK_CATS[i][0], title: FALLBACK_CATS[i][1] });
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
      path = '/search?q=' + encodeURIComponent(keyword);
    } else if (categoryId === 'new' || categoryId === 'top') {
      path = '/' + categoryId;
    } else if (categoryId === 'recent' || categoryId === 'female' || categoryId === 'male' || categoryId === 'couple' || categoryId === 'trans') {
      path = '/' + categoryId + (page > 1 ? '?page=' + page : '');
    } else {
      path = '/recent' + (page > 1 ? '?page=' + page : '');
    }
    var items = parseCards(await get(path));
    if (!items.length) console.warn('[xcamtube] 列表没解析出条目：' + path);
    return { items: items, hasMore: items.length >= 20 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9a-z-]/gi, '');
    if (!id) return null;
    var html = await get('/video/' + id);
    var title = clean((/property="og:title"[^>]+content="([^"]+)"/i.exec(html) || [])[1]);
    if (!title) title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    var cover = (/(?:property|name)=["']og:image["'][^>]{0,200}?content=["']([^"']+)/i.exec(html) || [])[1] || '';
    var unlocked = /data-unlocked="1"/.test(html);
    var bits = [unlocked ? '可直连' : '需 Premium 登录'];
    return {
      id: id,
      title: title || ('视频 ' + id),
      cover: absolute(cover) || null,
      subtitle: bits.join(' · '),
      description: '正片在 Premium 登录墙后：在「源设置 → 网络 → Cookie」填入站点 Cookie 后可直接播放，否则会打开网页。\n源站：' + base() + '/video/' + id
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9a-z-]/gi, '');
    if (!id) return [];
    return [{ id: 'play', title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || args.itemId || '').replace(/[^0-9a-z-]/gi, '');
    if (!id) throw new Error('XCamTube：缺少视频 id');
    var numeric = (String(id).match(/^(\d+)/) || [])[1] || '';
    var pageUrl = base() + '/video/' + id;
    var cookie = userCookie();
    if (!cookie || !numeric) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    var form = 'kind=play';
    var reply = await LumeSource.http.post(base() + '/api/video/' + numeric + '/media', form, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json,text/plain,*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: cookie,
        Origin: base(),
        Referer: pageUrl
      }
    });
    var status = Number((reply && reply.status) || 0);
    var body = String((reply && reply.body) || '');
    if (status !== 200) {
      if (status === 401) {
        throw new Error('XCamTube：Cookie 无效或未登录 Premium（HTTP 401）——请在源设置里更新 Cookie');
      }
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    var url = (/"url"\s*:\s*"([^"]+)"/.exec(body) || [])[1] || '';
    if (!url) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    url = entity(url).replace(/\\\//g, '/');
    return {
      kind: 'video',
      url: url,
      headers: { 'User-Agent': UA, Referer: pageUrl, Cookie: cookie, Range: 'bytes=0-1023' }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
