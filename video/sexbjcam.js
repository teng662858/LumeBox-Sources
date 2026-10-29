// LumeSource: {"id":"sexbjcam_video","name":"sexbjcam","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://sexbjcam.com"],"network":"proxy","icon":"https://sexbjcam.com/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"sexbjcam（sexbjcam.com）：韩国/中国网黄直播录播，WordPress + RetroTube 主题。列表 /page/<n>/、/category/<slug>/page/<n>/，搜索 /?s=<词>（每页 30）。详情页只有第三方 iframe（video.playerrecord.cfd/e/<code>），播放地址要再请求 embedorigin.cc/app/v1/play/<code> 取 hls（纯 m3u8，无 mp4）。国内直连不通，需要代理。"}]}
// LumeRuntime: javascript
//
// 站点：sexbjcam（https://sexbjcam.com）
//
// 结构（2026-10-30 实测，走本机代理）：
//   列表   /page/<n>/；分类 /category/<slug>/page/<n>/（只有 korean-bj / chinese-gril 两个）
//   搜索   /?s=<词>（每页 30）
//   详情   /<Y>/<m>/<d>/<slug>/；用 /?p=<post_id> 会 301 到规范地址
//   播放   详情页 <meta itemprop="embedUrl" content="https://video.playerrecord.cfd/e/<code>">
//          → GET https://embedorigin.cc/app/v1/play/<code>?embed=1 的 JSON "hls"（纯 HLS，mp4 恒为空）
//   卡片   <article data-post-id="385368" data-main-thumb="…jpg" …
//          <a href="https://sexbjcam.com/2026/10/29/<slug>/" title="标题">

var DEFAULT_DOMAIN = 'https://sexbjcam.com';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var EMBED_ORIGIN = 'https://embedorigin.cc';

var FALLBACK_CATS = [
  ['korean-bj', 'KOREAN BJ'],
  ['chinese-gril', 'CHINESE GIRL']
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_DOMAIN).replace(/\/+$/, '');
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

async function get(path, referer) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var reply = await LumeSource.http.get(url, { headers: headers(referer) });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (!status) throw new Error('sexbjcam：连不上（' + url + '，国内需代理）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('sexbjcam：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

// 详情页只有 iframe：取播放器 code，再向 embed 接口要 hls
function embedCode(html) {
  var m = /itemprop="embedUrl"\s+content="([^"]+)"/.exec(html) || /iframe[^>]+src="(https?:\/\/[^"]+\/e\/[a-z0-9]+)"/.exec(html);
  if (!m) return '';
  var code = /\/e\/([a-z0-9]+)/.exec(m[1]);
  return code ? code[1] : '';
}

async function resolveHls(code) {
  var url = EMBED_ORIGIN + '/app/v1/play/' + code + '?embed=1';
  var reply = await LumeSource.http.get(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json,text/plain,*/*',
      Referer: base() + '/'
    }
  });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (status !== 200) throw new Error('sexbjcam：取播放地址失败（HTTP ' + status + '）');
  var m = /"hls"\s*:\s*"([^"]+)"/.exec(body);
  return m ? m[1].replace(/\\\//g, '/') : '';
}

function parseCards(html) {
  var re = /<article[^>]*data-post-id="(\d+)"[^>]*data-main-thumb="([^"]*)"[\s\S]{0,900}?<a href="https?:\/\/[^"]*\/20\d\d\/\d\d\/\d\d\/[^"]*"[^>]*title="([^"]*)"/g;
  var out = [];
  var seen = {};
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    if (seen[m[1]]) continue;
    seen[m[1]] = 1;
    out.push({ id: m[1], title: clean(m[3]) || ('视频 ' + m[1]), cover: absolute(m[2]) || null, subtitle: '' });
  }
  return out;
}

var LumeSource = {
  id: 'sexbjcam_video',
  name: 'sexbjcam',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://sexbjcam.com'],

  async home() {
    var plan = [['/', '最新'], ['/category/korean-bj/', 'KOREAN BJ'], ['/category/chinese-gril/', 'CHINESE GIRL']];
    var sections = [];
    for (var i = 0; i < plan.length; i++) {
      try {
        var html = await get(plan[i][0]);
        var items = parseCards(html);
        if (items.length) sections.push({ title: plan[i][1], items: items.slice(0, 20) });
      } catch (error) {
        console.warn('[sexbjcam] 首页抓取失败 ' + plan[i][1] + '：' + error);
      }
    }
    if (!sections.length) throw new Error('sexbjcam：首页没有条目（站点可能改版或需要代理）');
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
      path = '/?s=' + encodeURIComponent(keyword) + (page > 1 ? '&paged=' + page : '');
    } else {
      var slug = categoryId || FALLBACK_CATS[0][0];
      if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('sexbjcam：认不出这个分类（' + categoryId + '）');
      path = '/category/' + slug + '/' + (page > 1 ? 'page/' + page + '/' : '');
    }
    var html = await get(path);
    var items = parseCards(html);
    if (!items.length) console.warn('[sexbjcam] 列表没解析出条目：' + path);
    return { items: items, hasMore: items.length >= 20 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = await get('/?p=' + id);
    var title = clean((/property="og:title"[^>]+content="([^"]+)"/i.exec(html) || [])[1]);
    if (!title) title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    title = title.replace(/\s*[-–|]\s*sexbjcam.*$/i, '').trim();
    var cover = (/(?:property|name)=["']og:image["'][^>]{0,200}?content=["']([^"']+)/i.exec(html) || [])[1] || '';
    if (!cover) cover = (/data-main-thumb="([^"]+)"/.exec(html) || [])[1] || '';
    var cats = clean((/class="[^"]*cat-links[^"]*"[\s\S]{0,400}?<\/div>/.exec(html) || [])[0] || '');
    var desc = clean((/name="description"[^>]+content="([^"]*)"/.exec(html) || [])[1]);
    return {
      id: id,
      title: title || ('视频 ' + id),
      cover: absolute(cover) || null,
      subtitle: cats,
      description: (desc ? desc + '\n' : '') + '源站：' + base() + '/?p=' + id
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
    if (!id) throw new Error('sexbjcam：缺少视频 id');
    var pageUrl = base() + '/?p=' + id;
    var html = await get('/?p=' + id);
    var code = embedCode(html);
    if (!code) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    var hls = await resolveHls(code);
    if (!hls) {
      return { kind: 'webplayer', pageUrl: 'https://video.playerrecord.cfd/e/' + code, headers: headers(pageUrl) };
    }
    return {
      kind: 'video',
      url: hls,
      headers: { 'User-Agent': UA, Referer: 'https://video.playerrecord.cfd/', Range: 'bytes=0-1023' }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
