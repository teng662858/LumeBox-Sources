// LumeSource: {"id":"forcedcinema_video","name":"ForcedCinema","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://forcedcinema.net"],"network":"direct","icon":"https://forcedcinema.net/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"ForcedCinema（forcedcinema.net）：影视剧「胁迫/虐待场景」剪辑站，WordPress + RetroTube 主题 + FV Flowplayer。分类 /category/<slug>/，翻页 /page/N/，搜索 /search/<词>。详情页 data-item 里给 vod.forcedcinema.net 的 mp4，实测 206 可播；直连可用。"}]}
// LumeRuntime: javascript
//
// 站点：ForcedCinema（https://forcedcinema.net）
//
// 结构（2026-10-30 实测，直连 200）：
//   列表   /category/<slug>/、/category/<slug>/page/<n>/；全站 /page/<n>/
//   搜索   /search/<词，空格用 +>
//   详情   /video/<slug>/
//   播放   <div id="wpfp_…" data-item="{&quot;sources&quot;:[{&quot;src&quot;:&quot;https://vod.forcedcinema.net/<slug>.mp4&quot;…
//          注意 HTML 实体编码，要 unescape 后当 JSON 解析
//   卡片   <article data-post-id="11492" …><a href="https://forcedcinema.net/video/<slug>/" title="标题">
//          <img data-src="https://forcedcinema.net/wp-content/uploads/…jpg">

var DEFAULT_DOMAIN = 'https://forcedcinema.net';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_CATS = [
  ['mainstream', '主流影视'],
  ['explicit', '露骨场景'],
  ['bdsm', 'BDSM'],
  ['incest', '乱伦'],
  ['reverse-rape', '反向胁迫'],
  ['lesbian', '女同'],
  ['gay', '男同'],
  ['hentai', '里番'],
  ['uncategorized', '未分类']
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
  if (!status) throw new Error('ForcedCinema：连不上（' + url + '）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('ForcedCinema：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

// data-item 是 HTML 实体编码的 JSON；解出来拿 sources[].src
function playSources(html) {
  var text = entity(String(html || '')).replace(/\\\//g, '/');
  var m = /"sources"\s*:\s*\[([\s\S]*?)\]/.exec(text);
  if (!m) return [];
  var out = [];
  var re = /"src"\s*:\s*"([^"]+)"/g;
  var hit;
  while ((hit = re.exec(m[1])) !== null) out.push(hit[1]);
  return out;
}

function parseCards(html) {
  var re = /<article[^>]*data-post-id="(\d+)"[\s\S]{0,600}?<a href="https?:\/\/[^"]*\/video\/([^"\/]+)\/"[^>]*title="([^"]*)"[\s\S]{0,400}?<img[^>]+data-src="([^"]+)"/g;
  var out = [];
  var seen = {};
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    if (seen[m[2]]) continue;
    seen[m[2]] = 1;
    out.push({ id: m[2], title: clean(m[3]) || m[2], cover: absolute(m[4]) || null, subtitle: '' });
  }
  return out;
}

var LumeSource = {
  id: 'forcedcinema_video',
  name: 'ForcedCinema',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://forcedcinema.net'],

  async home() {
    var sections = [];
    var plan = [['/', '最新'], ['/category/mainstream/', '主流影视'], ['/category/explicit/', '露骨场景']];
    for (var i = 0; i < plan.length; i++) {
      try {
        var html = await get(plan[i][0]);
        var items = parseCards(html);
        if (items.length) sections.push({ title: plan[i][1], items: items.slice(0, 20) });
      } catch (error) {
        console.warn('[forcedcinema] 首页抓取失败 ' + plan[i][1] + '：' + error);
      }
    }
    if (!sections.length) throw new Error('ForcedCinema：首页没有条目（站点可能改版）');
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
      path = '/search/' + keyword.split(/\s+/).join('+') + (page > 1 ? '/page/' + page + '/' : '/');
    } else {
      var slug = categoryId || FALLBACK_CATS[0][0];
      if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('ForcedCinema：认不出这个分类（' + categoryId + '）');
      path = '/category/' + slug + '/' + (page > 1 ? 'page/' + page + '/' : '');
    }
    var html = await get(path);
    var items = parseCards(html);
    if (!items.length) console.warn('[forcedcinema] 列表没解析出条目：' + path);
    return { items: items, hasMore: items.length >= 10 && new RegExp('/page/' + (page + 1) + '/').test(html) };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^a-z0-9-]/gi, '');
    if (!id) return null;
    var html = await get('/video/' + id + '/');
    var title = clean((/property="og:title"[^>]+content="([^"]+)"/i.exec(html) || [])[1]);
    if (!title) title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    title = title.replace(/\s*[-–|]\s*ForcedCinema\s*$/i, '').trim();
    var cover = (/(?:property|name)=["']og:image["'][^>]{0,200}?content=["']([^"']+)/i.exec(html) || [])[1] || '';
    if (!cover) cover = (/"splash"\s*:\s*"([^"]+)"/.exec(entity(html)) || [])[1] || '';
    var cats = clean((/class="[^"]*cat-links[^"]*"[\s\S]{0,300}?<\/div>/.exec(html) || [])[0] || '');
    var desc = clean((/name="description"[^>]+content="([^"]*)"/.exec(html) || [])[1]);
    return {
      id: id,
      title: title || id,
      cover: absolute(cover) || null,
      subtitle: cats,
      description: (desc ? desc + '\n' : '') + '源站：' + base() + '/video/' + id + '/'
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^a-z0-9-]/gi, '');
    if (!id) return [];
    return [{ id: 'play', title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || args.itemId || '').replace(/[^a-z0-9-]/gi, '');
    if (!id) throw new Error('ForcedCinema：缺少视频标识');
    var pageUrl = base() + '/video/' + id + '/';
    var html = await get('/video/' + id + '/');
    var sources = playSources(html);
    if (!sources.length) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    return {
      kind: 'video',
      url: sources[0],
      headers: { 'User-Agent': UA, Referer: pageUrl, Range: 'bytes=0-1023' }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
