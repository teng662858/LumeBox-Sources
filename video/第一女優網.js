// LumeSource: {"id":"pornbest_video","name":"第一女優網","version":"1.0.2","category":"video","contentCategory":"adult","settingsApiVersion":2,"mirrors":["https://www.pornbest.org","https://www.av01.org"],"network":"proxy","icon":"https://www.pornbest.org/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"第一女優網（PornBest）日本 AV 在线看：主站 www.pornbest.org，镜像 www.av01.org（实测同一套视频/同一播放地址）。站点对中国大陆 IP 会 302 到封锁页，必须在「源设置 → 站点网络」里配代理才能打开；封面和 HLS 播放地址在 CDN 上，不需要 Referer。分类 /c/<id> 每页约 40 条，搜索走 /q/<关键词>，分页都真实生效。"}]}
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

// ------------------------------------------------------------ 纯 JS SHA-256（CDNLah WAF 的 PoW 用）
var SHA_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function asciiBytes(text) {
  var out = [];
  for (var i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0xff);
  return out;
}

function sha256(bytes) {
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var msg = bytes.slice();
  var bitLen = bytes.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  for (var b = 7; b >= 0; b--) msg.push(Math.floor(bitLen / Math.pow(2, b * 8)) & 255);
  var w = new Array(64);
  for (var off = 0; off < msg.length; off += 64) {
    var i;
    for (i = 0; i < 16; i++) {
      w[i] = ((msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3]) | 0;
    }
    for (i = 16; i < 64; i++) {
      var s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      var s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (i = 0; i < 64; i++) {
      var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      var ch = (e & f) ^ (~e & g);
      var t1 = (h + S1 + ch + SHA_K[i] + w[i]) | 0;
      var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      var maj = (a & bb) ^ (a & c) ^ (bb & c);
      var t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  var out = [];
  for (var k = 0; k < 8; k++) out.push((H[k] >>> 24) & 255, (H[k] >>> 16) & 255, (H[k] >>> 8) & 255, H[k] & 255);
  return out;
}

/// difficulty 是「十六进制 0 的个数」：4 = 前两个字节为 0。
function hasDifficulty(digest, difficulty) {
  var full = difficulty >> 1;
  for (var i = 0; i < full; i++) if (digest[i] !== 0) return false;
  if (difficulty & 1) return (digest[full] >> 4) === 0;
  return true;
}

function solveNonce(seed, difficulty) {
  if (!seed || !difficulty) throw new Error('PoW 参数缺失');
  var seedBytes = asciiBytes(seed);
  for (var n = 0; n < 20000000; n++) {
    var hex = n.toString(16);
    while (hex.length < 16) hex = '0' + hex;
    if (hasDifficulty(sha256(seedBytes.concat(asciiBytes(hex))), difficulty)) return hex;
  }
  throw new Error('PoW 找不到 nonce（difficulty=' + difficulty + '）');
}

// CDNLah 的「安全防御 - 工作量验证」页（pornbest / pornlulu 同一套 WAF）
var POW_CONFIG_RE = /<script id="__cdnlah_pow_config" type="application\/json">([\s\S]*?)<\/script>/;

function formEncode(value) {
  return encodeURIComponent(String(value == null ? '' : value));
}

async function solveAndFetch(path, challengeHtml) {
  var url = base() + path;
  var html = String(challengeHtml || '');
  if (!POW_CONFIG_RE.test(html)) {
    var probe = await LumeSource.http.get(url, { headers: headers() });
    html = String((probe && probe.body) || '');
  }
  var matched = POW_CONFIG_RE.exec(html);
  if (!matched) throw new Error('第一女優網：拿到了校验页但没找到 PoW 配置');
  var cfg = null;
  try {
    cfg = JSON.parse(matched[1]);
  } catch (error) {
    throw new Error('第一女優網：PoW 配置不是合法 JSON');
  }
  var nonce = solveNonce(String(cfg.seed || ''), Number(cfg.difficulty) || 0);
  var field = String(cfg.metadata_field || 'challenge_metadata');
  var form = [
    'seed=' + formEncode(cfg.seed),
    'nonce=' + formEncode(nonce),
    'redirect=' + formEncode(cfg.redirect || path),
    'challenge_cookie=' + formEncode(cfg.challenge_cookie || ''),
    formEncode(field) + '=' + formEncode(cfg.metadata_token || '')
  ].join('&');
  var reply = await LumeSource.http.post(base() + String(cfg.verify_path), form, {
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      Referer: url
    }
  });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (status === 200 && !POW_CONFIG_RE.test(body)) return { status: 200, body: body, url: url };
  // 跟随那一步可能又踩到校验，用刚写进站点会话的 WAF Cookie 再取一次
  var retry = await LumeSource.http.get(url, { headers: headers() });
  var retryStatus = Number((retry && retry.status) || 0);
  var retryBody = String((retry && retry.body) || '');
  if (retryStatus === 200 && !POW_CONFIG_RE.test(retryBody)) {
    return { status: 200, body: retryBody, url: url };
  }
  throw new Error('第一女優網：人机校验没通过（validate=' + status + '，retry=' + retryStatus + '）'
    + '——稍后重试，或在源设置里换镜像');
}

async function request(path) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var reply = await LumeSource.http.get(url, { headers: headers() });
  var status = Number((reply && reply.status) || 0);
  if (!status) throw new Error('第一女優網：连不上（' + url + '）');
  var body = String((reply && reply.body) || '');
  if (status === 492 || POW_CONFIG_RE.test(body)) {
    console.warn('[pornbest] 触发人机校验，解 PoW 后重取：' + path);
    return solveAndFetch(path, body);
  }
  return { status: status, body: body, url: url };
}

/// 站点对受限制的出口会把整站跳到 goto2.cc 的「换域」封锁页（包里是一段 packed JS，
/// 明文里没有域名，靠 packer 特征 + 缺少站点骨架认），这里点名成代理问题。
function assertOpen(body) {
  var text = String(body || '');
  if (/goto2\.cc\/block|site\/block|block\/default\/switch/.test(text)) {
    throw new Error('第一女優網：站点把当前网络跳到了封锁页（中国大陆出口会这样）——'
      + '请在「源设置 → 站点网络」配代理后重试');
  }
  if (/eval\(function\(h,u,n,t,e,r\)/i.test(text) && !/class="main-header"/.test(text)) {
    throw new Error('第一女優網：拿到的不是站点页面而是跳转封锁页（中国大陆出口会这样）——'
      + '请在「源设置 → 站点网络」配代理后重试');
  }
}

function verify(reply) {
  var status = reply.status;
  // 封锁页会以 200/201 落地（HTTP 桥跟随 302），所以先按内容判一次
  assertOpen(reply.body);
  if (status === 200) return reply.body;
  if (status === 201) {
    throw new Error('第一女優網：站点返回了跳转页（HTTP 201）——'
      + '中国大陆出口会被跳到封锁页，请在「源设置 → 站点网络」配代理后重试');
  }
  if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
    throw new Error('第一女優網：站点把请求跳到了封锁页（HTTP ' + status + '）——'
      + '请在「源设置 → 站点网络」配代理后重试');
  }
  if (status === 403 || status === 503 || status === 521 || status === 1020) {
    throw new Error('NEED_WEBVIEW_VERIFY：第一女優網 要求网页验证（HTTP ' + status + '）');
  }
  if (status === 492) {
    throw new Error('第一女優網：站点弹了人机校验（HTTP 492）且本次没解开——稍后重试，或在源设置里换镜像');
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
  version: '1.0.2',
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
