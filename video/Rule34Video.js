// LumeSource: {"id":"rule34video_video","name":"Rule34Video","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://rule34video.com"],"network":"proxy","icon":"https://rule34video.com/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"Rule34video（rule34video.com）：同人角色 3D/2D 短片（KVS 内核，DDoS-Guard 防护）。列表 /latest-updates/<n>/、/top-rated/、/categories/<slug>/<n>/，搜索 /search/<词>/<n>/。详情页 flashvars 给 360p/480p/720p/1080p 多档 mp4。DDoS-Guard 偶尔直接断连（000），脚本会自动重试；国内需代理。"}]}
// LumeRuntime: javascript
//
// 站点：Rule34video（https://rule34video.com）—— 同人角色短片，KVS + 定制主题
//
// 结构（2026-10-30 实测，走本机代理）：
//   列表   /latest-updates/<N>/、/top-rated/、/categories/<slug>/<N>/
//   搜索   /search/<词>/<N>/
//   详情   /video/<id>/<slug>/（slug 不校验，/video/<id>/x/ 会 301 到规范地址）
//   播放   flashvars：video_url(360p) / video_alt_url(480p) / video_alt_url2(720p) / video_alt_url3(1080p)
//          实测 206 video/mp4；播放器带 VAST 前置广告（不影响直链）
//   卡片   <div class="item thumb" data-video-card-id="4701268">
//          <a class="th" href="…/video/<id>/<slug>/" title="标题"><img class="thumb" src="…/336x189/1.jpg">
//
// 注意：DDoS-Guard 会间歇性直接断连（curl 返回 000），这里做了 3 次重试。

var DEFAULT_DOMAIN = 'https://rule34video.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_CATS = [
  ['ben-10', 'Ben 10'], ['danny-phantom', 'Danny Phantom'], ['doraemon', 'Doraemon'],
  ['final-fantasy-xi', 'Final Fantasy XI'], ['for-honor', 'For Honor'], ['made-in-abyss', 'Made in Abyss'],
  ['max-the-elf', 'Max the Elf'], ['overwatch', 'Overwatch'], ['genshin-impact', 'Genshin Impact'],
  ['resident-evil', 'Resident Evil'], ['nier-automata', 'NieR:Automata'], ['league-of-legends', 'League of Legends']
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

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

// DDoS-Guard 会间歇断连，重试 3 次（1s / 2s 退避）
async function get(path) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var lastError = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      var reply = await LumeSource.http.get(url, { headers: headers() });
      var status = Number((reply && reply.status) || 0);
      var body = String((reply && reply.body) || '');
      if (!status) throw new Error('连不上');
      if (status === 200) return body;
      if (status === 403 || status === 503 || status === 521) {
        throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
      }
      if (status === 404) throw new Error('Rule34Video：页面不存在（' + path + '）');
      throw new Error('HTTP ' + status);
    } catch (error) {
      lastError = error;
      if (String(error && error.message || '').indexOf('NEED_WEBVIEW_VERIFY') === 0) throw error;
      if (attempt < 3) await sleep(attempt * 1000);
    }
  }
  throw new Error('Rule34Video：请求失败（' + (lastError && lastError.message || '未知') + ' ' + path + '，站点有 DDoS-Guard 防护，可稍后重试或换镜像）');
}

function parseCards(html) {
  var re = /data-video-card-id="(\d+)"[\s\S]{0,900}?class="th[^"]*"\s+href="https?:\/\/[^"]*\/video\/(\d+)\/[^"]*"\s+title="([^"]*)"[\s\S]{0,1500}?<img[^>]+src="([^"]+)"/g;
  var out = [];
  var seen = {};
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    var id = m[2] || m[1];
    if (seen[id]) continue;
    seen[id] = 1;
    out.push({ id: id, title: clean(m[3]) || ('视频 ' + id), cover: absolute(m[4]) || null, subtitle: '' });
  }
  return out;
}

function flashField(html, name) {
  var m = new RegExp(name + "\\s*:\\s*'([^']*)'").exec(html) || new RegExp(name + '\\s*:\\s*"([^"]*)"').exec(html);
  return m ? m[1] : '';
}

var LumeSource = {
  id: 'rule34video_video',
  name: 'Rule34Video',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://rule34video.com'],

  async home() {
    var plan = [['/latest-updates/', '最新'], ['/top-rated/', '最高评分'], ['/categories/overwatch/', 'Overwatch']];
    var sections = [];
    for (var i = 0; i < plan.length; i++) {
      try {
        var items = parseCards(await get(plan[i][0]));
        if (items.length) sections.push({ title: plan[i][1], items: items.slice(0, 20) });
      } catch (error) {
        console.warn('[rule34video] 首页抓取失败 ' + plan[i][1] + '：' + error);
      }
    }
    if (!sections.length) throw new Error('Rule34Video：首页没有条目（DDoS-Guard 拦住了，稍后重试或换代理）');
    return sections;
  },

  async categories() {
    var out = [{ id: 'latest', title: '最新' }, { id: 'top', title: '最高评分' }];
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
    } else if (categoryId === 'top') {
      path = '/top-rated/' + suffix;
    } else if (!categoryId || categoryId === 'latest') {
      path = '/latest-updates/' + suffix;
    } else if (/^[a-z0-9-]+$/.test(categoryId)) {
      path = '/categories/' + categoryId + '/' + suffix;
    } else {
      throw new Error('Rule34Video：认不出这个分类（' + categoryId + '）');
    }
    var html = await get(path);
    var items = parseCards(html);
    if (!items.length) console.warn('[rule34video] 列表没解析出条目：' + path);
    return { items: items, hasMore: items.length >= 12 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = await get('/video/' + id + '/x/');
    var title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    if (!title) title = clean(flashField(html, 'video_title'));
    if (!title) title = clean((/property="og:title"[^>]+content="([^"]+)"/i.exec(html) || [])[1]);
    var cover = (/(?:property|name)=["']og:image["'][^>]{0,200}?content=["']([^"']+)/i.exec(html) || [])[1] || '';
    var cats = clean(flashField(html, 'video_categories'));
    var models = clean(flashField(html, 'video_models'));
    return {
      id: id,
      title: title || ('视频 ' + id),
      cover: absolute(cover) || null,
      subtitle: cats ? cats.split(',').slice(0, 2).join(' / ') : '',
      description: (cats ? '分类：' + cats + '\n' : '') + (models ? '角色：' + models + '\n' : '') + '源站：' + base() + '/video/' + id + '/'
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
    if (!id) throw new Error('Rule34Video：缺少视频 id');
    var pageUrl = base() + '/video/' + id + '/';
    var html = await get('/video/' + id + '/x/');
    var qualities = [];
    var pairs = [
      ['video_url', 'video_url_text'],
      ['video_alt_url', 'video_alt_url_text'],
      ['video_alt_url2', 'video_alt_url2_text'],
      ['video_alt_url3', 'video_alt_url3_text']
    ];
    for (var i = 0; i < pairs.length; i++) {
      var link = flashField(html, pairs[i][0]);
      if (!link || !/^https?:\/\//i.test(link)) continue;
      var label = clean(flashField(html, pairs[i][1])) || ('档 ' + (i + 1));
      qualities.push({ label: label, url: link });
    }
    if (!qualities.length) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    // 默认给最高档
    var best = qualities[qualities.length - 1];
    return {
      kind: 'video',
      url: best.url,
      headers: { 'User-Agent': UA, Referer: pageUrl, Range: 'bytes=0-1023' },
      qualities: qualities
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
