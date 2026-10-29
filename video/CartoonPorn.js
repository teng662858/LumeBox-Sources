// LumeSource: {"id":"cartoonporn_video","name":"CartoonPorn","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://cartoonporn.pro"],"network":"proxy","icon":"https://cartoonporn.pro/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"CartoonPorn.PRO（cartoonporn.pro）：欧美成人动画/同人短片，KVS 内核。列表 /latest-updates/<n>/、/categories/<slug>/<n>/，搜索 /search/<词>/<n>/。详情页 flashvars 单档 720p mp4（/get_file/ 会 302 到 CDN，需跟随跳转）。国内直连不通，需要代理。"}]}
// LumeRuntime: javascript
//
// 站点：CartoonPorn.PRO（https://cartoonporn.pro）—— KVS 内核的成人动画站。
//
// 结构（2026-10-30 实测，走本机代理）：
//   列表   /latest-updates/<N>/、/categories/<slug>/<N>/
//   搜索   /search/<词>/<N>/
//   详情   /vids/<id>/<slug>/（slug 不校验，/vids/<id>/x/ 会 301 到规范地址）
//   播放   详情页 flashvars：video_url: 'https://cartoonporn.pro/get_file/1/<hash>/…_720p.mp4/?v-acctoken=…'
//          该地址 302 到 m20videos.cartoonporn.pro/remote_control.php…，实测跟随跳转后 206 video/mp4
//   卡片   <a href="…/vids/<id>/<slug>/" title="标题"><img … data-original="https://…/410x240/6.jpg">

var DEFAULT_DOMAIN = 'https://cartoonporn.pro';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_CATS = [
  ['anime', 'Anime'], ['3d', '3D'], ['futanari', 'Futanari'], ['hentai', 'Hentai'],
  ['anal', 'Anal'], ['big-tits', 'Big tits'], ['big-ass', 'Big ass'], ['blowjob', 'Blowjob'],
  ['creampie', 'Creampie'], ['cumshot', 'Cumshot'], ['deepthroat', 'Deepthroat'],
  ['doggystyle', 'Doggystyle'], ['femdom', 'Femdom'], ['furry', 'Furry'],
  ['gangbang', 'Gangbang'], ['harem', 'Harem'], ['incest', 'Incest'], ['interracial', 'Interracial'],
  ['lesbian', 'Lesbian'], ['milf', 'Milf'], ['mom', 'Mom'], ['monster', 'Monster'],
  ['orgasm', 'Orgasm'], ['pov', 'POV'], ['pregnant', 'Pregnant'], ['schoolgirl', 'Schoolgirl'],
  ['teen', 'Teen'], ['uncensored', 'Uncensored'], ['yuri', 'Yuri'], ['bdsm', 'BDSM']
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
  if (!status) throw new Error('CartoonPorn：连不上（' + url + '，国内需代理）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('CartoonPorn：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

function parseCards(html) {
  var text = String(html || '');
  var parts = text.split('/vids/');
  var out = [];
  var seen = {};
  for (var i = 1; i < parts.length; i++) {
    var block = parts[i].slice(0, 1200);
    var idm = /^(\d+)\//.exec(block);
    if (!idm || seen[idm[1]]) continue;
    seen[idm[1]] = 1;
    // 卡片：/vids/<id>/<slug>/" title="标题" … <img data-original="封面">
    var title = (/^\d+\/[^"']*\/"[^>]{0,200}?title="([^"]*)"/.exec(block) || [])[1] || '';
    if (!title) title = (/<strong class="title">\s*([^<]+)/.exec(block) || [])[1] || '';
    var cover = (/data-original="([^"]+)"/.exec(block) || [])[1] || '';
    out.push({ id: idm[1], title: clean(title) || ('视频 ' + idm[1]), cover: absolute(cover) || null, subtitle: '' });
  }
  return out;
}

function flashField(html, name) {
  var m = new RegExp(name + "\\s*:\\s*'([^']*)'").exec(html) || new RegExp(name + '\\s*:\\s*"([^"]*)"').exec(html);
  return m ? m[1] : '';
}

var LumeSource = {
  id: 'cartoonporn_video',
  name: 'CartoonPorn',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://cartoonporn.pro'],

  async home() {
    var plan = [['/latest-updates/', '最新'], ['/categories/anime/', 'Anime'], ['/categories/3d/', '3D']];
    var sections = [];
    for (var i = 0; i < plan.length; i++) {
      try {
        var html = await get(plan[i][0]);
        var items = parseCards(html);
        if (items.length) sections.push({ title: plan[i][1], items: items.slice(0, 20) });
      } catch (error) {
        console.warn('[cartoonporn] 首页抓取失败 ' + plan[i][1] + '：' + error);
      }
    }
    if (!sections.length) throw new Error('CartoonPorn：首页没有条目（站点可能改版或需要代理）');
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
    var suffix = page > 1 ? page + '/' : '';

    var path;
    if (keyword) {
      path = '/search/' + encodeURIComponent(keyword) + '/' + suffix;
    } else if (!categoryId || categoryId === 'latest') {
      path = '/latest-updates/' + suffix;
    } else if (/^[a-z0-9-]+$/.test(categoryId)) {
      path = '/categories/' + categoryId + '/' + suffix;
    } else {
      throw new Error('CartoonPorn：认不出这个分类（' + categoryId + '）');
    }
    var html = await get(path);
    var items = parseCards(html);
    if (!items.length) console.warn('[cartoonporn] 列表没解析出条目：' + path);
    return { items: items, hasMore: new RegExp('/' + (page + 1) + '/').test(html) && items.length > 0 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = await get('/vids/' + id + '/x/');
    var title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    if (!title) title = clean(flashField(html, 'video_title'));
    if (!title) title = clean((/property="og:title"[^>]+content="([^"]+)"/i.exec(html) || [])[1]);
    var cover = (/(?:property|name)=["']og:image["'][^>]{0,200}?content=["']([^"']+)/i.exec(html) || [])[1] || '';
    if (!cover) cover = (/data-original="([^"]+)"/.exec(html) || [])[1] || '';
    var cats = clean(flashField(html, 'video_categories'));
    var models = clean(flashField(html, 'video_models'));
    return {
      id: id,
      title: title || ('视频 ' + id),
      cover: absolute(cover) || null,
      subtitle: cats ? cats.split(',').slice(0, 2).join(' / ') : '',
      description: (cats ? '分类：' + cats + '\n' : '') + (models ? '模特：' + models + '\n' : '') + '源站：' + base() + '/vids/' + id + '/'
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
    if (!id) throw new Error('CartoonPorn：缺少视频 id');
    var pageUrl = base() + '/vids/' + id + '/';
    var html = await get('/vids/' + id + '/x/');
    var url = flashField(html, 'video_url');
    if (!url || !/^https?:\/\//i.test(url)) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    var urlHd = flashField(html, 'video_alt_url');
    var qualities = [];
    if (urlHd && /^https?:\/\//i.test(urlHd)) {
      qualities.push({ label: clean(flashField(html, 'video_alt_url_text')) || 'HD', url: urlHd });
      qualities.push({ label: clean(flashField(html, 'video_url_text')) || '默认', url: url });
    }
    return {
      kind: 'video',
      url: url,
      headers: { 'User-Agent': UA, Referer: pageUrl, Range: 'bytes=0-1023' },
      qualities: qualities.length ? qualities : undefined
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
