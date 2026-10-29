// LumeSource: {"id":"porn9188_video","name":"9188色情网","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://www.9188porn.com"],"network":"proxy","icon":"https://www.9188porn.com/template/9188porn/html/style/images/logo.png","settings":[{"key":"note","type":"info","title":"站点说明","description":"9188色情网（9188porn.com）：macCMS 模板，18 个厂牌栏目（麻豆/SWAG/91制片厂/天美/糖心…）+ 搜索 /vod/search.html?wd=。列表直接链到 /vod/play/id/<id>.html，播放页内嵌 player_aaaa（from=slm3u8，encrypt=0）直给 HLS。国内直连打不开，需代理；播放 CDN（2609.senlin2026.com 等）直连可播。"}]}
// LumeRuntime: javascript
//
// 站点：9188色情网（https://www.9188porn.com）—— macCMS / "video-card" 模板。
//
// 结构（2026-10-30 实测）：
//   首页     /                        → 32 张卡（单页最新）
//   栏目     /vod/type/id/<N>.html     → 分页 /vod/type/id/<N>/page/<P>.html
//   搜索     /vod/search.html?wd=<词>
//   条目     /vod/play/id/<id>.html    （列表直接链播放页，没有 detail 路由：/vod/detail/... 回 500）
//   播放     `<script>var player_aaaa={"flag":"play","encrypt":0,...,"url":"https://…/index.m3u8",...}</script>`
//            实测 200 + application/vnd.apple.mpegURL，CDN 直连不用 Referer。
//   卡片     `<div class="video-card">` → `<a class="play-icon" href="/vod/play/id/<id>.html" title="标题">`
//            + `<img … data-original="封面">` + `<div class="time">时长</div>`
//
// 网络：国内直连超时，需代理；播放与封面 CDN 直连可用。

var DEFAULT_DOMAIN = 'https://www.9188porn.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 栏目兜底（站点首页导航，2026-10-30）
var FALLBACK_CATS = [
  ['8', '麻豆传媒'], ['27', 'SWAG'], ['9', '91制片厂'], ['10', '天美传媒'], ['11', 'jvid 外流'],
  ['12', '精东影业'], ['13', '皇家华人'], ['14', '兔子先生'], ['15', '糖心Vlog'], ['17', '萝莉社'],
  ['18', '杏吧原创'], ['19', '蜜桃影像'], ['20', '星空传媒'], ['21', '抖阴视频'], ['22', 'SA国际传媒'],
  ['23', '扣扣传媒'], ['25', '葫芦影业'], ['26', '起点传媒'], ['31', '国产视频']
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_DOMAIN).replace(/\/+$/, '');
}

function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
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
  if (!status) throw new Error('9188色情网：连不上（' + url + '）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：9188色情网 要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('9188色情网：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

async function readJson(file) {
  try {
    var raw = await LumeSource.fs.readText(file);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

async function writeJson(file, value) {
  try {
    await LumeSource.fs.writeText(file, JSON.stringify(value));
  } catch (error) {
    /* 缓存失败不影响主流程 */
  }
}

// 列表里带封面，播放页没有；按 id 记一份，详情页用来补封面
async function remember(items) {
  if (!items || !items.length) return;
  var cache = (await readJson('items.json')) || { map: {} };
  var map = cache.map || {};
  for (var i = 0; i < items.length; i++) {
    map[items[i].id] = { title: items[i].title, cover: items[i].cover || '' };
  }
  var ids = Object.keys(map);
  if (ids.length > 800) {
    var keep = {};
    for (var j = ids.length - 800; j < ids.length; j++) keep[ids[j]] = map[ids[j]];
    map = keep;
  }
  await writeJson('items.json', { map: map });
}

function parseCards(html) {
  var parts = String(html || '').split('class="video-card"');
  var out = [];
  var seen = {};
  for (var i = 1; i < parts.length; i++) {
    var block = parts[i].slice(0, 2000);
    var hit = /href="\/vod\/play\/id\/(\d+)\.html"/.exec(block);
    if (!hit || seen[hit[1]]) continue;
    seen[hit[1]] = 1;
    var title = (/title="([^"]*)"/.exec(block) || [])[1] || (/alt="([^"]*)"/.exec(block) || [])[1] || '';
    var cover = (/data-original="([^"]+)"/.exec(block) || [])[1] || '';
    var time = (/<div class="time">\s*([^<]{0,20}?)\s*<\/div>/.exec(block) || [])[1] || '';
    out.push({ id: hit[1], title: clean(title) || ('视频 ' + hit[1]), cover: absolute(cover) || null, subtitle: clean(time) });
  }
  return out;
}

function maxPage(html) {
  var best = 1;
  var re = /page\/(\d+)(?:\.html)?[\/"']/g;
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    var n = Number(m[1]) || 0;
    if (n > best) best = n;
  }
  return best;
}

async function loadCategories() {
  var cached = await readJson('cats.json');
  if (cached && cached.at && cached.rows && cached.rows.length && Date.now() - Number(cached.at) < 30 * 60 * 1000) {
    return cached.rows;
  }
  var rows = [];
  try {
    var html = await get('/');
    var re = /href="\/vod\/type\/id\/(\d+)\.html"[^>]*>([^<]{1,24})</g;
    var m;
    var seen = {};
    while ((m = re.exec(html)) !== null) {
      var title = clean(m[2]);
      if (!title || seen[m[1]]) continue;
      seen[m[1]] = 1;
      rows.push({ id: m[1], title: title });
    }
  } catch (error) {
    console.warn('[9188] 栏目抓取失败，用内置清单：' + error);
  }
  if (rows.length < 5) {
    rows = [];
    for (var i = 0; i < FALLBACK_CATS.length; i++) rows.push({ id: FALLBACK_CATS[i][0], title: FALLBACK_CATS[i][1] });
  }
  if (rows.length) await writeJson('cats.json', { at: Date.now(), rows: rows });
  return rows;
}

var LumeSource = {
  id: 'porn9188_video',
  name: '9188色情网',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://www.9188porn.com'],

  async home() {
    var items = parseCards(await get('/'));
    await remember(items);
    if (!items.length) throw new Error('9188色情网：首页没有条目（站点可能改版）');
    return [{ title: '最新', moreUrl: '', items: items.slice(0, 24) }];
  },

  async categories() {
    return loadCategories();
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = clean(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();

    var path;
    if (keyword) {
      path = '/vod/search.html?wd=' + encodeURIComponent(keyword) + (page > 1 ? '&page=' + page : '');
    } else {
      // 没给分类（或被传了空）时回落到第一个厂牌栏目
      var digits = categoryId.replace(/[^0-9]/g, '') || FALLBACK_CATS[0][0];
      path = '/vod/type/id/' + digits + (page > 1 ? '/page/' + page : '') + '.html';
    }
    var html = await get(path);
    var items = parseCards(html);
    await remember(items);
    if (!items.length) console.warn('[9188] 列表没解析出条目：' + path);
    return { items: items, hasMore: maxPage(html) > page };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = '';
    try {
      html = await get('/vod/play/id/' + id + '.html');
    } catch (error) {
      if (/HTTP 404|HTTP 410/.test(String(error))) return null;
      throw error;
    }
    var title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    if (!title) title = clean((/<title[^>]*>([\s\S]*?)<\/title>/.exec(html) || [])[1]).replace(/\s*-\s*[^-]*$/, '');
    var cache = (await readJson('items.json')) || { map: {} };
    var row = (cache.map || {})[id] || null;
    var tags = [];
    var tagBlock = /id="play_tags"[\s\S]{0,1200}?<\/div>/.exec(html);
    if (tagBlock) {
      var tre = /<span>([^<]{1,20})<\/span>/g;
      var tm;
      while ((tm = tre.exec(tagBlock[0])) !== null) tags.push(clean(tm[1]));
    }
    var bits = [];
    if (tags.length) bits.push(tags.slice(0, 3).join(' / '));
    var desc = [];
    if (tags.length) desc.push('标签：' + tags.join(', '));
    desc.push('源站：' + base() + '/vod/play/id/' + id + '.html');
    return {
      id: id,
      title: title || ('视频 ' + id),
      cover: (row && row.cover) || null,
      subtitle: bits.join(' · '),
      description: desc.join('\n')
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'play', title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    // itemId 是部分离线检查工具的叫法，App 传的是 id
    var id = String(args.id || args.itemId || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('9188色情网：缺少视频 id');
    var html = await get('/vod/play/id/' + id + '.html');
    var url = '';
    // 只认 player_aaaa 里的 url，避免误抓页面其它 JSON
    var player = /player_aaaa\s*=\s*(\{[\s\S]{0,1500}?\})\s*<\/script>/.exec(html);
    var m = player ? /"url"\s*:\s*"([^"]+)"/.exec(player[1]) : null;
    if (m) url = entity(m[1].replace(/\\\//g, '/'));
    if (!url) {
      var src = /<source[^>]+src=["']([^"']+)["']/i.exec(html);
      if (src) url = entity(src[1]);
    }
    if (!url || /\.(css|js|png|jpg)$/i.test(url)) {
      return {
        kind: 'webplayer',
        pageUrl: base() + '/vod/play/id/' + id + '.html',
        headers: headers()
      };
    }
    return {
      kind: 'video',
      url: url,
      headers: { 'User-Agent': UA, Referer: base() + '/' }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
