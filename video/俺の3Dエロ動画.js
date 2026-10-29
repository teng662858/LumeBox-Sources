// LumeSource: {"id":"oreno3d_video","name":"俺の3Dエロ動画","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://oreno3d.com"],"network":"direct","icon":"https://oreno3d.com/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"俺の3Dエロ動画（oreno3d.com）：3D/MMD 成人动画索引站，本站不托管视频，条目都指向 iwara.tv。列表 /?page=<n>&sort=hot|latest，标签 /tags/<id>?page=<n>，搜索 /search?keyword=<词>。播放靠 iwara 公开接口两级解析（api.iwara.tv → fileUrl → src.view），匿名只有 360p/预览档。直连可访问。"}]}
// LumeRuntime: javascript
//
// 站点：俺の3Dエロ動画（https://oreno3d.com，Laravel + CF）
//
// 结构（2026-10-30 实测）：
//   列表   /?page=<n>（+ sort=hot|favorites|latest|popularity）
//   标签   /tags/<id>?page=<n>（只有 6 个）；角色 /characters/<id>；作者 /authors/<id>
//   搜索   /search?keyword=<词>（注意是 keyword，不是 q）
//   详情   /movies/<id>，不托管视频：<a href="https://www.iwara.tv/video/<iwaraId>">
//   播放   GET https://api.iwara.tv/video/<iwaraId> → .fileUrl
//          GET <fileUrl> → 数组，元素 .src.view（协议相对，补 https:）
//          实测 206 video/mp4；匿名只有 preview 与 360 两档，取最高
//   卡片   <article><a href="https://oreno3d.com/movies/<id>" …><img src="/storage/thumbnails_small/<hash>" class="main-thumbnail"><h2 class="box-h2">标题</h2>

var DEFAULT_DOMAIN = 'https://oreno3d.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_CATS = [
  ['latest', '最新'], ['hot', '热门'], ['favorites', '收藏'],
  ['tag:2', '性行為有り'], ['tag:5', 'ボイス有り'], ['tag:48', '催眠・洗脳'], ['tag:185', '紳士ハンド']
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_DOMAIN).replace(/\/+$/, '');
}

function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'ja,en;q=0.8',
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
  if (!status) throw new Error('oreno3d：连不上（' + url + '）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('oreno3d：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

function parseCards(html) {
  var re = /<article>\s*<a href="https:\/\/oreno3d\.com\/movies\/(\d+)"[^>]*>[\s\S]{0,2000}?<img[^>]*\bsrc="([^"]+)"[^>]*class="main-thumbnail">[\s\S]{0,800}?<h2 class="box-h2">([^<]+)<\/h2>/g;
  var out = [];
  var seen = {};
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    if (seen[m[1]]) continue;
    seen[m[1]] = 1;
    out.push({ id: m[1], title: clean(m[3]) || ('作品 ' + m[1]), cover: absolute(m[2]) || null, subtitle: '' });
  }
  return out;
}

// iwara：先拿 fileUrl，再拿各档 src.view
async function iwaraSources(iwaraId) {
  var api = 'https://api.iwara.tv/video/' + encodeURIComponent(iwaraId);
  // iwara 的 WAF 会间歇返回 CF 挑战（同一请求重试就过），所以重试 4 次；
  // 另外它拦 Accept: application/json，只带 UA + Referer。
  var reply = null;
  for (var attempt = 1; attempt <= 4; attempt++) {
    reply = await LumeSource.http.get(api, { headers: { 'User-Agent': UA, Referer: 'https://www.iwara.tv/' } });
    if (Number((reply && reply.status) || 0) === 200) break;
    if (attempt < 4) await new Promise(function (resolve) { setTimeout(resolve, attempt * 800); });
  }
  if (Number((reply && reply.status) || 0) !== 200) throw new Error('iwara：视频信息取不到（HTTP ' + (reply && reply.status) + '，稍后重试）');
  var info = null;
  try {
    info = JSON.parse(String(reply.body || ''));
  } catch (error) {
    throw new Error('iwara：视频信息不是 JSON');
  }
  if (!info || !info.fileUrl) throw new Error('iwara：没有 fileUrl（可能需要登录或视频已删）');
  var files = await LumeSource.http.get(info.fileUrl, { headers: { 'User-Agent': UA, Referer: 'https://www.iwara.tv/' } });
  if (Number((files && files.status) || 0) !== 200) throw new Error('iwara：文件列表取不到（HTTP ' + (files && files.status) + '）');
  var rows = null;
  try {
    rows = JSON.parse(String(files.body || ''));
  } catch (error) {
    throw new Error('iwara：文件列表不是 JSON');
  }
  var out = [];
  if (Array.isArray(rows)) {
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      var src = (row.src && row.src.view) || '';
      if (!src) continue;
      if (src.indexOf('//') === 0) src = 'https:' + src;
      out.push({ label: clean(row.name || row.resolution || '') || ('档 ' + (i + 1)), url: src, size: Number(row.size || 0) });
    }
  }
  if (!out.length) throw new Error('iwara：没有可播的文件档');
  return out;
}

var LumeSource = {
  id: 'oreno3d_video',
  name: '俺の3Dエロ動画',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://oreno3d.com'],

  async home() {
    var plan = [['/?sort=hot', '热门'], ['/?sort=latest', '最新']];
    var sections = [];
    for (var i = 0; i < plan.length; i++) {
      try {
        var items = parseCards(await get(plan[i][0]));
        if (items.length) sections.push({ title: plan[i][1], items: items.slice(0, 20) });
      } catch (error) {
        console.warn('[oreno3d] 首页抓取失败 ' + plan[i][1] + '：' + error);
      }
    }
    if (!sections.length) throw new Error('oreno3d：首页没有条目（站点可能改版）');
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
    var pageQuery = page > 1 ? '&page=' + page : '';

    var path;
    if (keyword) {
      path = '/search?keyword=' + encodeURIComponent(keyword) + pageQuery;
    } else if (categoryId.indexOf('tag:') === 0) {
      path = '/tags/' + categoryId.slice(4).replace(/[^0-9]/g, '') + (page > 1 ? '?page=' + page : '');
    } else if (categoryId === 'latest') {
      path = '/?sort=latest' + pageQuery;
    } else if (categoryId === 'favorites') {
      path = '/?sort=favorites' + pageQuery;
    } else {
      path = '/?sort=hot' + pageQuery;
    }
    var items = parseCards(await get(path));
    if (!items.length) console.warn('[oreno3d] 列表没解析出条目：' + path);
    return { items: items, hasMore: items.length >= 20 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = await get('/movies/' + id);
    var title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    if (!title) title = clean((/property="og:title"[^>]+content="([^"]+)"/i.exec(html) || [])[1]);
    var cover = (/(?:property|name)=["']og:image["'][^>]{0,200}?content=["']([^"']+)/i.exec(html) || [])[1] || '';
    var iwara = (/https:\/\/www\.iwara\.tv\/video\/([A-Za-z0-9]+)/.exec(html) || [])[1] || '';
    var author = clean((/class="[^"]*author[^"]*"[\s\S]{0,200}?<a[^>]*>([^<]{1,40})</.exec(html) || [])[1]);
    return {
      id: id,
      title: title || ('作品 ' + id),
      cover: absolute(cover) || null,
      subtitle: author ? author : (iwara ? 'iwara ' + iwara : ''),
      description: (iwara ? 'iwara 源：https://www.iwara.tv/video/' + iwara + '\n' : '') + '源站：' + base() + '/movies/' + id
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
    if (!id) throw new Error('oreno3d：缺少作品 id');
    var pageUrl = base() + '/movies/' + id;
    var html = await get('/movies/' + id);
    var iwara = (/https:\/\/www\.iwara\.tv\/video\/([A-Za-z0-9]+)/.exec(html) || [])[1] || '';
    if (!iwara) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    var sources = await iwaraSources(iwara);
    // 优先非 preview 的最高档
    var best = sources[0];
    for (var i = 0; i < sources.length; i++) {
      var label = String(sources[i].label || '').toLowerCase();
      if (label.indexOf('preview') >= 0) continue;
      if (!best || String(best.label || '').toLowerCase().indexOf('preview') >= 0) best = sources[i];
    }
    var qualities = [];
    for (var k = 0; k < sources.length; k++) qualities.push({ label: sources[k].label, url: sources[k].url });
    return {
      kind: 'video',
      url: best.url,
      headers: { 'User-Agent': UA, Referer: 'https://www.iwara.tv/', Range: 'bytes=0-1023' },
      qualities: qualities.length > 1 ? qualities : undefined
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
