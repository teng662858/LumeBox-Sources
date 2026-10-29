// LumeSource: {"id":"p91pinse_video","name":"91PinSe","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://91pinse.com"],"network":"proxy","icon":"https://91pinse.com/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"91PinSe（91pinse.com）：91 风格自拍短视频，Django 后端 + Plyr/hls.js。列表 /v/?page=<n>、/v/hot/?page=<n>，搜索 /v/search?keyword=<词>。详情 /v/<id>；播放地址要 POST /api/videos/<id>/playback，且必须带 Origin: https://91pinse.com（缺了返回 403）。国内直连不通，需要代理。"}]}
// LumeRuntime: javascript
//
// 站点：91PinSe（https://91pinse.com，Django）
//
// 结构（2026-10-30 实测，走本机代理）：
//   列表   /v/?page=<n>（最新）、/v/hot/?page=<n>（热门）
//   搜索   /v/search?keyword=<词>
//   详情   /v/<id>
//   播放   页内 var playbackApiUrl = '/api/videos/<id>/playback'
//          POST 该路径，Header 必须带 Origin: https://91pinse.com（缺 Origin 一律 403）→ JSON.url 是 m3u8
//   卡片   <a href="/v/<id>" aria-label="标题"><img src="https://cdn-image.fplayer.cc/images/<vid>.webp">
//
// 国内直连 000，需要代理。

var DEFAULT_DOMAIN = 'https://91pinse.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_CATS = [
  ['latest', '最新'], ['hot', '热门'],
  ['kw:熟女', '熟女'], ['kw:巨乳', '巨乳'], ['kw:内射', '内射'],
  ['kw:高颜值', '高颜值'], ['kw:少妇', '少妇'], ['kw:阿姨', '阿姨']
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

// 站点个别视频的详情页会 500（视频已删/无标题），这类要按「详情不可用」处理，不能整源报错
async function getSoft(path) {
  try {
    return await get(path);
  } catch (error) {
    console.warn('[91pinse] 详情页不可用：' + error);
    return '';
  }
}

async function get(path) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var reply = await LumeSource.http.get(url, { headers: headers() });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (!status) throw new Error('91PinSe：连不上（' + url + '，国内需代理）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('91PinSe：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

function parseCards(html) {
  var re = /<a href="\/v\/(\d+)"[^>]*aria-label="([^"]*)"[\s\S]{0,600}?<img src="(https:\/\/cdn-image\.fplayer\.cc\/images\/[^"]+)"/g;
  var out = [];
  var seen = {};
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    if (seen[m[1]]) continue;
    seen[m[1]] = 1;
    out.push({ id: m[1], title: clean(m[2]) || ('视频 ' + m[1]), cover: absolute(m[3]) || null, subtitle: '' });
  }
  return out;
}

var LumeSource = {
  id: 'p91pinse_video',
  name: '91PinSe',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://91pinse.com'],

  async home() {
    var plan = [['/v/', '最新'], ['/v/hot/', '热门']];
    var sections = [];
    for (var i = 0; i < plan.length; i++) {
      try {
        var items = parseCards(await get(plan[i][0]));
        if (items.length) sections.push({ title: plan[i][1], items: items.slice(0, 20) });
      } catch (error) {
        console.warn('[91pinse] 首页抓取失败 ' + plan[i][1] + '：' + error);
      }
    }
    if (!sections.length) throw new Error('91PinSe：首页没有条目（需要代理或站点改版）');
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
    if (categoryId.indexOf('kw:') === 0) keyword = categoryId.slice(3);

    var path;
    if (keyword) {
      path = '/v/search?keyword=' + encodeURIComponent(keyword);
    } else if (categoryId === 'hot') {
      path = '/v/hot/' + (page > 1 ? '?page=' + page : '');
    } else {
      path = '/v/' + (page > 1 ? '?page=' + page : '');
    }
    var items = parseCards(await get(path));
    if (!items.length) console.warn('[91pinse] 列表没解析出条目：' + path);
    return { items: items, hasMore: items.length >= 15 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = await getSoft('/v/' + id);
    var title = clean((/property="og:title"[^>]+content="([^"]+)"/i.exec(html) || [])[1]);
    if (!title) title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    title = title.replace(/\s*[-–|]\s*91PinSe.*$/i, '').trim();
    var cover = (/(?:property|name)=["']og:image["'][^>]{0,200}?content=["']([^"']+)/i.exec(html) || [])[1] || '';
    var desc = clean((/name="description"[^>]+content="([^"]*)"/.exec(html) || [])[1]);
    var author = clean((/"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/.exec(html) || [])[1]);
    return {
      id: id,
      title: title || ('视频 ' + id),
      cover: absolute(cover) || null,
      subtitle: author ? '@' + author : '',
      description: (desc ? desc + '\n' : '') + '源站：' + base() + '/v/' + id
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
    if (!id) throw new Error('91PinSe：缺少视频 id');
    var pageUrl = base() + '/v/' + id;
    var html = await getSoft('/v/' + id);
    var apiPath = (/var playbackApiUrl = '([^']+)'/.exec(html) || [])[1] || ('/api/videos/' + id + '/playback');
    var reply = await LumeSource.http.post(base() + apiPath, '', {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json,text/plain,*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: base(),
        Referer: pageUrl
      }
    });
    var status = Number((reply && reply.status) || 0);
    var body = String((reply && reply.body) || '');
    if (status !== 200) {
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
      headers: { 'User-Agent': UA, Referer: pageUrl, Range: 'bytes=0-1023' }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
