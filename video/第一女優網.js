// LumeSource: {"id":"pornbest_video","name":"第一女優網","version":"1.0.0","category":"video","contentCategory":"adult","settingsApiVersion":2,"mirrors":["https://www.pornbest.org","https://www.av01.org"],"network":"proxy","icon":"https://www.pornbest.org/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"第一女優網（PornBest）日本 AV 在线看：主站 www.pornbest.org，镜像 www.av01.org（实测同一套视频/同一播放地址）。站点对中国大陆 IP 会 302 到封锁页，必须在「源设置 → 站点网络」里配代理才能打开；封面和 HLS 播放地址在 CDN 上，不需要 Referer。分类 /c/<id> 每页约 40 条，搜索走 /q/<关键词>，分页都真实生效。"}]}
// LumeRuntime: javascript
//
// 站点：第一女優網（PornBest，https://www.pornbest.org；镜像 https://www.av01.org）
// 形态：Yii2 服务端渲染 HTML，Bootstrap 卡片列表 + video.js。
//
// 结构（2026-10-29 逐页实测，本机直连 302 → goto2.cc/block 封锁页，验证走本机代理出口）：
//   列表     GET /?page=<N>（最新）、/?sort=hits&page=<N>（热播）
//   分类     GET /c/<分类id>?page=<N>[&sort=hits]；分类清单在 /category/index（49 个）
//   搜索     GET /q/<词>?page=<N>（/node/search?title=<词> 会跳到这里，直接用它更省一次请求）
//   卡片     `<div class="col-xl-2 … item p-0 pr-1">` → `href="/<id>"` + `<img src="…/poster2.jpg">`
//            + `<div class="lines lines3"><a>/<id</a>标题</a>` + `badge`（分类名）
//   详情     GET /<id>（不是 /video/<id>）：<h1 class="title">、og:image、页内 ld+json
//            {name,description,thumbnailUrl,duration:"PT4725S",interactionCount,contentUrl}
//   播放     `<source src="https://voddadaizi5.com:…/index.m3u8" type="application/x-mpegURL">`，
//            与 ld+json 的 contentUrl 同一条；实测 200 + application/vnd.apple.mpegurl，无需 Referer。
//   分页判据 分页块里 `class="page-item next"`；最后一页带 `disabled`。
//
// 网络：首页/详情对大陆出口 302 到 goto2.cc 封锁页，所以声明 network:"proxy"；
//   封面图与播放 CDN（daimgnai.imgdanaizi12-aaa.com、voddadaizi5.com 等）直连可用。

var DEFAULT_DOMAIN = 'https://www.pornbest.org';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var CATS_TTL_MS = 30 * 60 * 1000;

// /category/index 静态兜底（实测清单；站点改分类后由线上解析覆盖）
var FALLBACK_CATS = [
  { id: '23', title: '日本無碼' }, { id: '9', title: '中文字幕' }, { id: '25', title: '歐美精品' },
  { id: '82', title: '日韓無碼' }, { id: '78', title: 'AV明星' }, { id: '31', title: '制服誘惑' },
  { id: '113', title: '無碼專區' }, { id: '87', title: '動漫精品' }, { id: '201', title: '歐美-高清無碼' },
  { id: '134', title: '亞洲情色' }, { id: '64', title: '巨乳美乳' }, { id: '148', title: '倫理三級' },
  { id: '55', title: '成人動漫' }, { id: '271', title: '日韓精品' }, { id: '133', title: '歐美性愛' },
  { id: '66', title: '亞洲有碼' }, { id: '116', title: '卡通動漫' }, { id: '100', title: 'SWAG' },
  { id: '32', title: 'AV解說' }, { id: '136', title: '歐美情色' }, { id: '81', title: '童顏巨乳' },
  { id: '110', title: '女優明星' }, { id: '109', title: '麻豆傳媒' }, { id: '86', title: '歐美極品' },
  { id: '309', title: '歐美' }, { id: '68', title: '亞洲無碼' }, { id: '24', title: '日本有碼' },
  { id: '8', title: '高清無碼' }, { id: '7', title: '3D動漫' }, { id: '448', title: '動漫精選' },
  { id: '336', title: '日本精品' }, { id: '308', title: '華語AV' }, { id: '71', title: '歐美激情' },
  { id: '101', title: '三級倫理' }, { id: '92', title: '激情動漫' }, { id: '112', title: '歐美系列' },
  { id: '176', title: '動漫卡通' }, { id: '440', title: '無碼流出' }, { id: '217', title: '日本-高清有碼' },
  { id: '122', title: '麻豆視頻' }, { id: '433', title: '歐美勁爆' }, { id: '90', title: '日本片商' },
  { id: '203', title: '日本-一本道' }, { id: '22', title: '同人動漫' }, { id: '402', title: '日本動漫' },
  { id: '358', title: '日本-素人' }, { id: '443', title: '高清有碼' }, { id: '199', title: '動漫-里番中字' },
  { id: '238', title: '日本素人' }
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_DOMAIN).replace(/\/+$/, '');
}

async function readJson(file) {
  try {
    var raw = await LumeSource.fs.readText(file);
    if (!raw) return null;
    return JSON.parse(raw);
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

function entity(text) {
  return String(text == null ? '' : text).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (all, code) {
    var map = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', '#39': "'", '#34': '"' };
    if (map[code] !== undefined) return map[code];
    if (code.charAt(0) === '#') {
      var n = code.charAt(1) === 'x' || code.charAt(1) === 'X'
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      if (isFinite(n) && n > 0 && n < 0x110000) return String.fromCharCode(n);
    }
    return all;
  });
}

function clean(text) {
  var value = String(text == null ? '' : text)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return entity(value).replace(/\s+/g, ' ').trim();
}

/// 封面地址补全：站点大多给绝对地址，个别图床给 `/upload/…`；`data:` 占位图直接丢掉。
function absolute(url) {
  var value = entity(String(url == null ? '' : url)).trim();
  if (!value) return '';
  if (/^data:/i.test(value)) return '';
  if (value.indexOf('//') === 0) return 'https:' + value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.charAt(0) === '/') return base() + value;
  return base() + '/' + value;
}

function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    Referer: referer || base() + '/'
  };
}

async function request(path) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var reply = await LumeSource.http.get(url, { headers: headers() });
  var status = Number((reply && reply.status) || 0);
  if (!status) throw new Error('第一女優網：连不上（' + url + '）');
  return { status: status, body: String((reply && reply.body) || ''), url: url };
}

/// 站点对受限制的出口会把整站跳到 goto2.cc 的「换域」封锁页，这里点名成代理问题。
function assertOpen(body) {
  if (/goto2\.cc\/block|site\/block|block\/default\/switch/.test(String(body))) {
    throw new Error('第一女優網：站点把当前网络跳到了封锁页（中国大陆出口会这样）——'
      + '请在「源设置 → 站点网络」配代理后重试');
  }
}

function verify(reply) {
  var status = reply.status;
  if (status === 200) {
    assertOpen(reply.body);
    return reply.body;
  }
  if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
    throw new Error('第一女優網：站点把请求跳到了封锁页（HTTP ' + status + '）——'
      + '请在「源设置 → 站点网络」配代理后重试');
  }
  if (status === 403 || status === 503 || status === 521 || status === 1020) {
    throw new Error('NEED_WEBVIEW_VERIFY：第一女優網 要求网页验证（HTTP ' + status + '）');
  }
  throw new Error('第一女優網：请求失败（HTTP ' + status + ' ' + reply.url + '）');
}

function parseCards(html) {
  var text = String(html || '');
  var out = [];
  var seen = {};
  var blocks = text.split(/<div class="[^"]*\bitem\b[^"]*"/);
  var i, block, hit, img, title;
  for (i = 1; i < blocks.length; i++) {
    block = blocks[i].slice(0, 3000);
    hit = /href="\/(\d{2,9})"/.exec(block);
    if (!hit) continue;
    if (seen[hit[1]]) continue;
    seen[hit[1]] = 1;
    img = /<img[^>]*\bsrc="([^"]+)"/.exec(block) || /<img[^>]*\bdata-src="([^"]+)"/.exec(block);
    var cover = img ? absolute(img[1]) : '';
    if (/^data:/i.test(cover)) cover = '';
    var alt = (/alt="([^"]*)"/.exec(block) || [])[1] || '';
    var t = /<div class=['"]lines lines3['"]>[\s\S]{0,400}?<a[^>]*>([\s\S]{0,300}?)<\/a>/.exec(block);
    title = clean(t ? t[1] : alt);
    if (!title) title = clean(alt);
    if (!title) title = '视频 ' + hit[1];
    var badge = (/<span class="badge[^"]*">([^<]*)<\/span>/.exec(block) || [])[1] || '';
    out.push({ id: hit[1], title: title, cover: cover || null, subtitle: clean(badge) });
  }
  if (!out.length) {
    // 兜底：卡片外层 class 变了也能按「详情锚点 + 封面图」抽出来
    var re = /<a class="visited" href="\/(\d{2,9})"><img[^>]*\bsrc="([^"]+)"[^>]*alt="([^"]*)"/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (seen[m[1]]) continue;
      seen[m[1]] = 1;
      out.push({ id: m[1], title: clean(m[3]) || ('视频 ' + m[1]), cover: absolute(m[2]) || null, subtitle: '' });
    }
  }
  return out;
}

function hasNext(html) {
  var text = String(html || '');
  if (!/class="pagination"/.test(text)) return false;
  if (/class="page-item next disabled"/.test(text)) return false;
  return /class="page-item next"/.test(text);
}

function readLd(html) {
  var m = /<script[^>]*type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/i.exec(String(html || ''));
  if (!m) return {};
  try {
    var data = JSON.parse(m[1].trim());
    return data && typeof data === 'object' ? data : {};
  } catch (error) {
    return {};
  }
}

function durationText(value) {
  var m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(String(value == null ? '' : value).trim());
  if (!m) return '';
  var total = (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
  if (!total) return '';
  var minutes = Math.round(total / 60);
  if (minutes < 60) return minutes + ' 分钟';
  return Math.floor(minutes / 60) + ' 小时 ' + (minutes % 60) + ' 分钟';
}

function viewsText(value) {
  var n = Number(value);
  if (!isFinite(n) || n <= 0) return '';
  if (n >= 10000) return (Math.round(n / 1000) / 10) + ' 万播放';
  return n + ' 播放';
}

function categoryName(html) {
  var m = /<li class="breadcrumb-item"><a href="\/c\/\d+">([\s\S]{0,80}?)<\/a><\/li>/.exec(String(html || ''));
  return m ? clean(m[1]) : '';
}

async function loadCategories() {
  var cached = await readJson('cats.json');
  if (cached && cached.at && cached.rows && cached.rows.length && Date.now() - Number(cached.at) < CATS_TTL_MS) {
    return cached.rows;
  }
  var rows = [];
  try {
    var html = verify(await request('/category/index'));
    var re = /href="\/c\/(\d+)"[^>]*>([\s\S]{0,120}?)<\/a>/g;
    var seen = {};
    var m;
    while ((m = re.exec(html)) !== null) {
      var id = m[1];
      var title = clean(m[2]);
      if (!title || seen[id]) continue;
      seen[id] = 1;
      rows.push({ id: id, title: title });
    }
  } catch (error) {
    console.warn('[pornbest] 分类清单抓取失败，用内置清单：' + error);
  }
  if (!rows.length) rows = FALLBACK_CATS.slice(0);
  if (rows.length) await writeJson('cats.json', { at: Date.now(), rows: rows });
  return rows;
}

function pagePath(categoryId, page, sort) {
  var id = String(categoryId == null ? '' : categoryId).trim();
  if (id === 'hits') sort = 'hits';
  var query = [];
  if (page > 1) query.push('page=' + page);
  if (sort === 'hits') query.push('sort=hits');
  var search = query.join('&');
  if (!id || id === 'latest' || id === 'hits') return '/' + (search ? '?' + search : '');
  if (/^https?:\/\//i.test(id)) {
    if (!search) return id;
    return id + (id.indexOf('?') >= 0 ? '&' : '?') + search;
  }
  var digits = id.replace(/[^0-9]/g, '');
  if (digits) return '/c/' + digits + (search ? '?' + search : '');
  throw new Error('第一女優網：认不出这个分类（' + id + '）——请从分类列表里选');
}

var LumeSource = {
  id: 'pornbest_video',
  name: '第一女優網',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  settingsApiVersion: 2,
  mirrors: ['https://www.pornbest.org', 'https://www.av01.org'],

  async home() {
    var sections = [];
    var latest = parseCards(verify(await request('/')));
    if (latest.length) {
      sections.push({ title: '最新更新', moreUrl: 'latest', items: latest.slice(0, 24) });
    }
    try {
      var hot = parseCards(verify(await request('/?sort=hits')));
      if (hot.length) sections.push({ title: '熱播', moreUrl: 'hits', items: hot.slice(0, 24) });
    } catch (error) {
      console.warn('[pornbest] 熱播 抓取失败：' + error);
    }
    if (!sections.length) throw new Error('第一女優網：首页没认出条目（站点可能改版）');
    return sections;
  },

  async categories() {
    var rows = await loadCategories();
    var out = [{ id: 'latest', title: '最新' }, { id: 'hits', title: '熱播' }];
    for (var i = 0; i < rows.length; i++) out.push({ id: rows[i].id, title: rows[i].title });
    return out;
  },

  async filters() {
    return {
      groups: [{
        id: 'sort',
        title: '排序',
        options: [{ id: 'latest', title: '最新' }, { id: 'hits', title: '熱播' }]
      }]
    };
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = clean(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var sort = String((args.filters && args.filters.sort) || '').trim();
    if (sort === 'latest') sort = '';

    var path;
    if (keyword) {
      path = '/q/' + encodeURIComponent(keyword) + (page > 1 ? '?page=' + page : '');
    } else {
      path = pagePath(categoryId, page, sort);
    }
    var html = verify(await request(path));
    var items = parseCards(html);
    if (!items.length) console.warn('[pornbest] 列表没解析出条目：' + path);
    return { items: items, hasMore: hasNext(html) };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var reply = await request('/' + id);
    if (reply.status === 404) return null;
    var html = verify(reply);
    var ld = readLd(html);
    var title = clean((/<h1[^>]*>([\s\S]{0,400}?)<\/h1>/.exec(html) || [])[1]);
    if (!title) title = clean(ld.name);
    if (!title) {
      var og = /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i.exec(html);
      title = og ? clean(og[1]).replace(/\s*-\s*[^-]*$/, '') : '';
    }
    var cover = absolute(ld.thumbnailUrl || '');
    if (!cover) {
      var ogi = /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i.exec(html);
      cover = ogi ? absolute(ogi[1]) : '';
    }
    var bits = [];
    var dur = durationText(ld.duration);
    if (dur) bits.push(dur);
    var views = viewsText(ld.interactionCount);
    if (views) bits.push(views);
    var cat = categoryName(html);
    if (cat) bits.push(cat);
    var desc = clean(ld.description);
    return {
      id: id,
      title: title || ('视频 ' + id),
      cover: cover || null,
      subtitle: bits.join(' · '),
      description: (desc ? desc + '\n' : '') + '源站：' + base() + '/' + id
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
    if (!id) throw new Error('第一女優網：缺少视频 id');
    var pageUrl = base() + '/' + id;
    var html = verify(await request('/' + id));
    var url = '';
    var source = /<source[^>]+src=["']([^"']+)["']/i.exec(html);
    if (source) url = entity(source[1]);
    if (!url) {
      var ld = readLd(html);
      if (ld && ld.contentUrl) url = String(ld.contentUrl);
    }
    if (!url) {
      var raw = /"contentUrl"\s*:\s*"([^"]+)"/.exec(html);
      if (raw) url = raw[1].replace(/\\\//g, '/');
    }
    if (!url) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    return {
      kind: 'video',
      url: url,
      headers: { 'User-Agent': UA, Referer: pageUrl }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
