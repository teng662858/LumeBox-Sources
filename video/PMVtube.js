// LumeSource: {"id":"pmvtube_video","name":"PMVtube","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://pmvtube.com"],"network":"proxy","icon":"https://pmvtube.com/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"PMVtube（pmvtube.com）：PMV/HMV 音乐剪辑向成人视频，WordPress + vtube 主题。列表 /page/<n>/、标签 /tag/<id>-<slug>/page/<n>/，搜索 /?s=<词>。详情页 <video> 直给 nosofiles CDN 的签名 mp4（verify 参数会过期，每次播放都要重新取详情页）。国内直连不通，需要代理。"}]}
// LumeRuntime: javascript
//
// 站点：PMVtube（https://pmvtube.com）
//
// 结构（2026-10-30 实测，走本机代理）：
//   列表   /page/<n>/；标签 /tag/<id>-<slug>/page/<n>/
//   搜索   /?s=<词>
//   详情   /<id>-<slug>/（/<id>/ 会 301 到规范地址）
//   播放   详情页 <video id="video-placeholder" … src="https://xcdn1.nosofiles.com/…_high.mp4?verify=…">
//          另有 <source type="video/mp4" title="high|low">；HTML 里的 &amp; 要反转义
//          签名会间歇 403，所以 content() 每次都重新拉详情页
//   卡片   <div class="video-block" data-post-id="56927"><a class="thumb" href="…/56927-slug/" aria-label="标题">
//          <img class="video-img" data-src="https://pmvtube.com/storage/…jpg">

var DEFAULT_DOMAIN = 'https://pmvtube.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 标签用 <id>-<slug> 形式（站点 /tag/<id>-<slug>/）
var FALLBACK_CATS = [
  ['32-pmv', 'PMV'],
  ['2883-hmv', 'HMV'],
  ['22-compilation', 'Compilation'],
  ['37-music', 'Music'],
  ['1845-hentai', 'Hentai'],
  ['27-blowjob', 'Blowjob'],
  ['77-big-tits', 'Big tits'],
  ['39-big-ass', 'Big ass'],
  ['266-asian', 'Asian']
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
  if (!status) throw new Error('PMVtube：连不上（' + url + '，国内需代理）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('PMVtube：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

function parseCards(html) {
  var re = /data-post-id="(\d+)"[\s\S]{0,600}?<a class="thumb"[^>]{0,300}?aria-label="([^"]*)"[\s\S]{0,900}?data-src="([^"]+)"/g;
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
  id: 'pmvtube_video',
  name: 'PMVtube',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://pmvtube.com'],

  async home() {
    var plan = [['/', '最新'], ['/tag/32-pmv/', 'PMV'], ['/tag/2883-hmv/', 'HMV']];
    var sections = [];
    for (var i = 0; i < plan.length; i++) {
      try {
        var html = await get(plan[i][0]);
        var items = parseCards(html);
        if (items.length) sections.push({ title: plan[i][1], items: items.slice(0, 20) });
      } catch (error) {
        console.warn('[pmvtube] 首页抓取失败 ' + plan[i][1] + '：' + error);
      }
    }
    if (!sections.length) throw new Error('PMVtube：首页没有条目（站点可能改版或需要代理）');
    return sections;
  },

  async categories() {
    var out = [{ id: 'latest', title: '最新' }];
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
    } else if (!categoryId || categoryId === 'latest') {
      path = page > 1 ? '/page/' + page + '/' : '/';
    } else if (/^[0-9]+-[a-z0-9-]+$/.test(categoryId)) {
      path = '/tag/' + categoryId + '/' + (page > 1 ? 'page/' + page + '/' : '');
    } else {
      throw new Error('PMVtube：认不出这个分类（' + categoryId + '）');
    }
    var html = await get(path);
    var items = parseCards(html);
    if (!items.length) console.warn('[pmvtube] 列表没解析出条目：' + path);
    return { items: items, hasMore: items.length >= 20 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = await get('/' + id + '/');
    var title = clean((/property="og:title"[^>]+content="([^"]+)"/i.exec(html) || [])[1]);
    if (!title) title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    title = title.replace(/\s*[-–|]\s*PMVtube.*$/i, '').trim();
    var cover = (/(?:property|name)=["']og:image["'][^>]{0,200}?content=["']([^"']+)/i.exec(html) || [])[1] || '';
    var tags = [];
    var re = /\/tag\/[0-9]+-[a-z0-9-]+\/"[^>]*>([^<]{1,40})</g;
    var m;
    while ((m = re.exec(html)) !== null && tags.length < 6) {
      var name = clean(m[1]);
      if (name && tags.indexOf(name) < 0) tags.push(name);
    }
    var desc = clean((/name="description"[^>]+content="([^"]*)"/.exec(html) || [])[1]);
    return {
      id: id,
      title: title || ('视频 ' + id),
      cover: absolute(cover) || null,
      subtitle: tags.slice(0, 3).join(' / '),
      description: (tags.length ? '标签：' + tags.join(', ') + '\n' : '') + (desc ? desc + '\n' : '') + '源站：' + base() + '/' + id + '/'
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
    if (!id) throw new Error('PMVtube：缺少视频 id');
    var pageUrl = base() + '/' + id + '/';
    var html = await get('/' + id + '/');
    var text = entity(html);
    var url = (/<video id="video-placeholder"[^>]*\bsrc="([^"]+)"/.exec(text) || [])[1] || '';
    var qualities = [];
    var re = /<source[^>]*src="([^"]+)"[^>]*title="(high|low)"/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      qualities.push({ label: m[2] === 'high' ? '高清' : '标清', url: entity(m[1]) });
    }
    if (!url && qualities.length) url = qualities[0].url;
    if (!url) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    url = entity(url).replace(/\\\//g, '/');
    return {
      kind: 'video',
      url: url,
      // CDN 开了防盗链：带 Referer 反而 403，必须不带
      headers: { 'User-Agent': UA, Range: 'bytes=0-1023' },
      qualities: qualities.length ? qualities : undefined
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
