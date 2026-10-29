// LumeSource: {"id":"hstream_video","name":"hstream","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://hstream.moe"],"network":"proxy","icon":"https://hstream.moe/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"hstream.moe：英文字幕/无修正里番流媒体（Laravel + Livewire）。列表 /search?page=<n>&order=recently-uploaded，标签 /search?tags[]=<tag>&page=<n>，搜索 /search?search=<词>&page=<n>。播放是 POST /player/api（要带页面里的 data-csrf 和会话 cookie，缺一返回 419），返回 stream_domains[]+stream_url，拼成 {域}/{路径}/x264.720p.mp4。国内直连 TLS 被重置，必须代理。"}]}
// LumeRuntime: javascript
//
// 站点：hstream.moe（Laravel 11 + Livewire 3）
//
// 结构（2026-10-30 实测，走本机代理）：
//   列表   /search?page=<n>（+ order=recently-released|recently-uploaded|view-count）
//   标签   /search?tags[]=<tag>&page=<n>（67 个标签）；片商 ?studios=<slug>
//   搜索   /search?search=<词>&page=<n>（POST /search 也能，但 GET 带 search= 直接可用）
//   详情   /hentai/<slug>（slug 已含集号，如 imaria-2）
//   播放   POST https://hstream.moe/player/api
//          Header: Content-Type: application/json、X-CSRF-TOKEN: 页面 data-csrf、X-Requested-With: XMLHttpRequest
//          Body: {"episode_id":"<页面 input#e_id 的 value>"}
//          返回 JSON：stream_domains[] + stream_url → {域}/{stream_url}/x264.720p.mp4（实测 206）
//   卡片   <a href="https://hstream.moe/hentai/<slug>" …><img src="/images/…webp" alt="标题">
//
// 国内直连 TLS 被 reset，必须代理。

var DEFAULT_DOMAIN = 'https://hstream.moe';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_TAGS = [
  ['ahegao', 'Ahegao'], ['anal', 'Anal'], ['bdsm', 'BDSM'], ['bestiality', 'Bestiality'],
  ['bondage', 'Bondage'], ['creampie', 'Creampie'], ['futanari', 'Futanari'], ['harem', 'Harem'],
  ['incest', 'Incest'], ['milf', 'Milf'], ['mind-break', 'Mind break'], ['mind-control', 'Mind control'],
  ['ntr', 'NTR'], ['pov', 'POV'], ['tentacle', 'Tentacle'], ['uncensored', 'Uncensored'], ['yuri', 'Yuri']
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

async function get(path) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var reply = await LumeSource.http.get(url, { headers: headers() });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (!status) throw new Error('hstream：连不上（' + url + '，国内需代理）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('hstream：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

function parseCards(html) {
  var re = /href="(https:\/\/hstream\.moe\/hentai\/[^"]+)"[\s\S]{0,600}?<img\s+src="([^"]+)"\s+alt="([^"]*)"/g;
  var out = [];
  var seen = {};
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    var slug = m[1].split('/hentai/')[1].replace(/\/+$/, '');
    if (!slug || seen[slug]) continue;
    seen[slug] = 1;
    out.push({ id: slug, title: clean(m[3]) || slug, cover: absolute(m[2]) || null, subtitle: '' });
  }
  return out;
}

var LumeSource = {
  id: 'hstream_video',
  name: 'hstream',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://hstream.moe'],

  async home() {
    var plan = [
      ['/search?order=recently-uploaded', '最近上传'],
      ['/search?order=view-count', '最多观看'],
      ['/search?tags[]=uncensored', '无修正']
    ];
    var sections = [];
    for (var i = 0; i < plan.length; i++) {
      try {
        var items = parseCards(await get(plan[i][0]));
        if (items.length) sections.push({ title: plan[i][1], items: items.slice(0, 20) });
      } catch (error) {
        console.warn('[hstream] 首页抓取失败 ' + plan[i][1] + '：' + error);
      }
    }
    if (!sections.length) throw new Error('hstream：首页没有条目（需要代理或站点改版）');
    return sections;
  },

  async categories() {
    var out = [{ id: 'latest', title: '最近上传' }, { id: 'popular', title: '最多观看' }];
    for (var i = 0; i < FALLBACK_TAGS.length; i++) out.push({ id: 'tag:' + FALLBACK_TAGS[i][0], title: FALLBACK_TAGS[i][1] });
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
      path = '/search?search=' + encodeURIComponent(keyword) + '&page=' + page;
    } else if (categoryId.indexOf('tag:') === 0) {
      path = '/search?tags%5B%5D=' + encodeURIComponent(categoryId.slice(4)) + '&page=' + page;
    } else if (categoryId === 'popular') {
      path = '/search?order=view-count&page=' + page;
    } else {
      path = '/search?order=recently-uploaded&page=' + page;
    }
    var items = parseCards(await get(path));
    if (!items.length) console.warn('[hstream] 列表没解析出条目：' + path);
    return { items: items, hasMore: items.length >= 15 };
  },

  async detail(argument) {
    var slug = String((argument && argument.id) || '').replace(/[^a-z0-9-]/gi, '');
    if (!slug) return null;
    var html = await get('/hentai/' + slug);
    var title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    if (!title) title = clean((/property="og:title"[^>]+content="([^"]+)"/i.exec(html) || [])[1]);
    title = title.replace(/\s*[-|]\s*hstream\.moe.*$/i, '').trim();
    var cover = (/(?:property|name)=["']og:image["'][^>]{0,200}?content=["']([^"']+)/i.exec(html) || [])[1] || '';
    var desc = clean((/name="description"[^>]+content="([^"]*)"/.exec(html) || [])[1]);
    return {
      id: slug,
      title: title || slug,
      cover: absolute(cover) || null,
      subtitle: '',
      description: (desc ? desc + '\n' : '') + '源站：' + base() + '/hentai/' + slug
    };
  },

  async chapters(argument) {
    var slug = String((argument && argument.id) || '').replace(/[^a-z0-9-]/gi, '');
    if (!slug) return [];
    return [{ id: 'play', title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    var slug = String(args.id || args.itemId || '').replace(/[^a-z0-9-]/gi, '');
    if (!slug) throw new Error('hstream：缺少剧集标识');
    var pageUrl = base() + '/hentai/' + slug;
    var html = await get('/hentai/' + slug);
    var episode = (/id="e_id"[^>]*value="(\d+)"/.exec(html) || /value="(\d+)"[^>]*id="e_id"/.exec(html) || [])[1] || '';
    var csrf = (/data-csrf="([^"]+)"/.exec(html) || [])[1] || '';
    if (!episode || !csrf) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    var reply = await LumeSource.http.post(base() + '/player/api', JSON.stringify({ episode_id: episode }), {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json,text/plain,*/*',
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        Referer: pageUrl,
        Origin: base()
      }
    });
    var status = Number((reply && reply.status) || 0);
    var body = String((reply && reply.body) || '');
    if (status !== 200) {
      if (status === 419) throw new Error('hstream：会话/CSRF 失效（HTTP 419），请重试');
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    var data = null;
    try {
      data = JSON.parse(body);
    } catch (error) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    var streamUrl = String(data.stream_url || '');
    var domains = Array.isArray(data.stream_domains) ? data.stream_domains : [];
    if (!streamUrl || !domains.length) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    var host = String(domains[0]).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    var url = 'https://' + host + '/' + streamUrl.replace(/^\/+/, '') + '/x264.720p.mp4';
    return {
      kind: 'video',
      url: url,
      headers: { 'User-Agent': UA, Referer: pageUrl, Range: 'bytes=0-1023' }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
