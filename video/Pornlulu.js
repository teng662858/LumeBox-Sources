// LumeSource: {"id":"pornlulu_video","name":"Pornlulu","version":"1.0.0","category":"video","contentCategory":"adult","settingsApiVersion":2,"mirrors":["https://www.pornlulu.net","https://www.pornlulu.com"],"network":"proxy","icon":"https://www.pornlulu.net/logo.png","settings":[{"key":"note","type":"info","title":"站点说明","description":"Pornlulu（撸撸，pornlulu.net；主域 pornlulu.com 是同一套数据的正體版）。服务端渲染 HTML：栏目 /cat/<id>（66 个）、排序 /?sort=hits|score|likes、搜索 /?q=<词>、详情 /v/<短id>，播放是 <source> 里的 HLS 直链（tm/lajiao CDN，不校验 Referer）。站点在 CDNLah WAF 后面：国内直连会 302 到封锁页（需代理），并且每几次请求会弹一次「工作量验证」PoW——源里自带 SHA-256 解算（sha256(seed+16位hex) 前 difficulty 个十六进制 0），解完用验证 POST 的 302 跟到目标页，App 侧还会把 WAF Cookie 记进站点会话，后续请求不再弹。"}]}
// LumeRuntime: javascript
//
// 站点：Pornlulu（撸撸）—— https://www.pornlulu.net（简体）/ https://www.pornlulu.com（正體，同库）
//
// 一、可达性（2026-10-29 实测）
//   国内直连 → 302 https://www.goto2.cc/block/default/switch（CDNLah 封锁页）→ network:"proxy"。
//   IP 被受理后再连会被塞「安全防御 - 工作量验证」页（HTTP 492 + __cdnlah_pow_config）。
//   播放 CDN（2609.lajiao2026.com 等）直连 200，m3u8 是 master（1500kb / 1280x720 → hls/index.m3u8）。
//
// 二、WAF：PoW 怎么过
//   挑战页内嵌 {"seed","difficulty","verify_path","challenge_cookie","metadata_field","metadata_token"}。
//   找 16 位十六进制 nonce，使 sha256hex(seed+nonce) 以 difficulty 个 '0' 开头；
//   然后把 seed/nonce/redirect/challenge_cookie/<metadata_field> 表单 POST 到 verify_path。
//   校验通过会 302 到 redirect —— 把 redirect 设成当前要取的路径，跟随后的 200 就是目标页本身，
//   所以**不需要自己拿 Cookie**：App 的站点会话池会顺手记下 Set-Cookie，复验工具则靠这次跟随拿内容。
//   SHA-256 是源内纯 JS 实现（沙箱没有 crypto），difficulty=4 时平均 ~6.5 万次哈希，实测 V8 约 120ms。
//
// 三、结构
//   首页/栏目  /、/cat/<id>，分页 ?page=<N>，排序 ?sort=id|hits|score|likes
//   搜索       /?q=<词>（表单 name=q），分页 ?page=<N>（搜索不吃 sort）
//   详情       /v/<4~8位短id>；下架/不存在 404
//   播放       <video><source src="https://…/index.m3u8" type="application/x-mpegURL">
//   卡片       `class='col-lg-3 … item p-0 pr-1'` 里 `href="/v/<id>"` + `<img src>` + `.two-lines` 标题

var DEFAULT_BASE = 'https://www.pornlulu.net';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
var CATS_TTL_MS = 30 * 60 * 1000;

// 排序入口（站点首页的 tab，实测 cat 页也吃 sort；sort=likes 与 sort=hits 结果相同，故不单列）
var SORT_TABS = [
  { id: 'latest', title: '最新', sort: '' },
  { id: 'hits', title: '最热', sort: 'hits' },
  { id: 'score', title: '评分', sort: 'score' }
];

// /category 静态兜底（站点 2026-10-29 的 66 个分类）
var FALLBACK_CATS = [
  ['48', '中文字幕'], ['13', '强奸乱伦'], ['270', '日本无码'], ['269', '日本有码'], ['92', '制服诱惑'],
  ['401', 'AV明星'], ['259', '日韩无码'], ['254', '无码专区'], ['86', '动漫精品'], ['438', '女优明星'],
  ['93', '巨乳美乳'], ['274', '成人动漫'], ['22', '亚洲情色'], ['105', '亚洲有码'], ['367', '伦理三级'],
  ['260', '欧美精品'], ['392', 'AV解说'], ['130', '卡通动漫'], ['452', 'SWAG'], ['52', '欧美性爱'],
  ['453', '激情动漫'], ['125', '童颜巨乳'], ['115', '女同性恋'], ['275', '日韩精品'], ['111', '美乳巨乳'],
  ['265', '欧美情色'], ['266', '欧美极品'], ['425', '性感人妻'], ['23', '人妻熟女'], ['658', '欧美-高清无码'],
  ['454', '黑丝诱惑'], ['84', '三级伦理'], ['273', '邻家人妻'], ['101', '人妻系列'], ['99', '巨乳系列'],
  ['109', '绝美少女'], ['416', '麻豆传媒'], ['403', '日本片商'], ['267', '熟女人妻'], ['129', '多人群交'],
  ['5', '空姐模特'], ['424', '丝袜OL'], ['134', '激情口交'], ['106', 'SM重味'], ['149', '动漫卡通'],
  ['110', '口交视频'], ['451', 'VR视角'], ['357', 'AI换脸'], ['131', '欧美系列'], ['64', '亚洲无码'],
  ['132', '女同性爱'], ['467', '日本精品'], ['657', '日本-中文字幕'], ['96', '高潮喷吹'], ['643', '禁漫'],
  ['653', '韩国-主播'], ['432', '日本女优'], ['666', '日本-高清有码'], ['644', '伦理片'], ['120', '伦理影片'],
  ['54', '韩国明星学生'], ['516', '换脸明星'], ['717', '日本-素人'], ['44', '韩国伦理'], ['246', '欧美无码'],
  ['124', 'HEYZO']
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_BASE).replace(/\/+$/, '');
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

function absolute(url) {
  var value = entity(String(url == null ? '' : url)).trim();
  if (!value) return '';
  if (/^data:/i.test(value)) return '';
  if (value.indexOf('//') === 0) return 'https:' + value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.charAt(0) === '/') return base() + value;
  return base() + '/' + value;
}

// ------------------------------------------------------------ 纯 JS SHA-256（PoW 用）
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

// ------------------------------------------------------------ 网络（含 WAF 校验）
var POW_CONFIG_RE = /<script id="__cdnlah_pow_config" type="application\/json">([\s\S]*?)<\/script>/;

function formEncode(value) {
  return encodeURIComponent(String(value == null ? '' : value));
}

/// 遇到「工作量验证」：解 PoW → 表单 POST verify_path（redirect 设成目标路径）。
/// 校验通过的 302 会带上 `_chg_waf_pow`，宿主（App 的 SiteSessionPool / 检查工具的 jar）会记住它，
/// 所以这里先看跟随后的正文，还是校验页就再用 Cookie 重取一次。
async function solveAndFetch(path, challengeHtml) {
  var html = String(challengeHtml || '');
  if (!POW_CONFIG_RE.test(html)) {
    var probe = await LumeSource.http.get(base() + path, { headers: headers() });
    html = String((probe && probe.body) || '');
  }
  var matched = POW_CONFIG_RE.exec(html);
  if (!matched) throw new Error('Pornlulu：拿到了校验页但没找到 PoW 配置');
  var cfg = null;
  try {
    cfg = JSON.parse(matched[1]);
  } catch (error) {
    throw new Error('Pornlulu：PoW 配置不是合法 JSON');
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
      Referer: base() + path
    }
  });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (status === 200 && !POW_CONFIG_RE.test(body)) return { status: 200, body: body };
  // 跟随的那一步可能又踩到校验（POST 带 body 跟过去），用刚写入会话的 WAF Cookie 再取一次
  var retry = await LumeSource.http.get(base() + path, { headers: headers() });
  var retryStatus = Number((retry && retry.status) || 0);
  var retryBody = String((retry && retry.body) || '');
  if (retryStatus === 200 && !POW_CONFIG_RE.test(retryBody)) return { status: 200, body: retryBody };
  throw new Error('Pornlulu：人机校验没通过（validate=' + status + '，retry=' + retryStatus + '）——稍后重试，或在源设置里换镜像');
}

async function get(path) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var reply = await LumeSource.http.get(url, { headers: headers() });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (status === 492 || POW_CONFIG_RE.test(body)) {
    console.warn('[pornlulu] 触发人机校验，解 PoW 后重取：' + path);
    return solveAndFetch(path, body);
  }
  if (!status) throw new Error('Pornlulu：连不上（' + url + '）');
  if (status === 404) return { status: 404, body: body };
  if (status === 403 || status === 503 || status === 521 || status === 1020) {
    throw new Error('NEED_WEBVIEW_VERIFY：Pornlulu 要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) {
    if (/goto2\.cc\/block|site\/block/.test(body)) {
      throw new Error('Pornlulu：站点把请求跳到了封锁页——请在「源设置 → 站点网络」配代理');
    }
    throw new Error('Pornlulu：请求失败（HTTP ' + status + '）');
  }
  return { status: 200, body: body };
}

// ------------------------------------------------------------ 解析
function parseCards(html) {
  var text = String(html || '');
  var out = [];
  var seen = {};
  var parts = text.split(/class=['"]col-lg-3/);
  if (parts.length < 2) parts = text.split(/class=['"][^'"]*\bitem\b[^'"]*['"]/);
  for (var i = 1; i < parts.length; i++) {
    var block = parts[i].slice(0, 2500);
    var hit = /href="\/v\/([A-Za-z0-9]{3,})"/.exec(block);
    if (!hit || seen[hit[1]]) continue;
    seen[hit[1]] = 1;
    var img = /<img[^>]*\bsrc="([^"]+)"/.exec(block);
    var alt = (/alt="([^"]*)"/.exec(block) || [])[1] || '';
    var two = /<div class="two-lines">[\s\S]{0,300}?<a[^>]*>([\s\S]{0,300}?)<\/a>/.exec(block);
    var title = clean(two ? two[1] : alt);
    if (!title) title = clean(alt);
    if (!title) title = '视频 ' + hit[1];
    out.push({ id: hit[1], title: title, cover: img ? absolute(img[1]) : null, subtitle: '' });
  }
  return out;
}

function hasNext(html) {
  var text = String(html || '');
  if (!/class="pagination"/.test(text)) return false;
  if (/class="page-item next disabled"/.test(text)) return false;
  return /class="page-item next"/.test(text);
}

function categoryName(html) {
  var m = /name="keywords"[^>]+content="([^"]*)"/i.exec(String(html || ''));
  if (!m) return '';
  var parts = String(entity(m[1])).split(/\s*,\s*/);
  // keywords 形如「标题, 分类, 站点名」
  if (parts.length >= 3) return String(parts[parts.length - 2] || '').trim();
  return parts.length === 2 ? String(parts[1] || '').trim() : '';
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

async function loadCategories() {
  var cached = await readJson('cats.json');
  if (cached && cached.at && cached.rows && cached.rows.length && Date.now() - Number(cached.at) < CATS_TTL_MS) {
    return cached.rows;
  }
  var rows = [];
  try {
    var reply = await get('/category');
    var re = /href="\/cat\/(\d+)"[^>]*>([\s\S]{0,80}?)<\/a>/g;
    var seen = {};
    var m;
    while ((m = re.exec(reply.body)) !== null) {
      var id = m[1];
      var title = clean(m[2]);
      if (!title || seen[id]) continue;
      seen[id] = 1;
      rows.push({ id: id, title: title });
    }
  } catch (error) {
    console.warn('[pornlulu] 分类清单抓取失败，用内置清单：' + error);
  }
  if (!rows.length) {
    for (var i = 0; i < FALLBACK_CATS.length; i++) {
      rows.push({ id: FALLBACK_CATS[i][0], title: FALLBACK_CATS[i][1] });
    }
  }
  if (rows.length) await writeJson('cats.json', { at: Date.now(), rows: rows });
  return rows;
}

function pageQuery(page, sort) {
  var query = [];
  if (page > 1) query.push('page=' + page);
  if (sort) query.push('sort=' + sort);
  return query.length ? '?' + query.join('&') : '';
}

function listPath(categoryId, page) {
  var id = String(categoryId == null ? '' : categoryId).trim();
  for (var i = 0; i < SORT_TABS.length; i++) {
    if (id === SORT_TABS[i].id) return '/' + pageQuery(page, SORT_TABS[i].sort);
  }
  var digits = id.replace(/[^0-9]/g, '');
  if (!id) return '/' + pageQuery(page, '');
  if (digits) return '/cat/' + digits + pageQuery(page, '');
  throw new Error('Pornlulu：认不出这个分类（' + id + '）——请从分类列表里选');
}

var LumeSource = {
  id: 'pornlulu_video',
  name: 'Pornlulu',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://www.pornlulu.net', 'https://www.pornlulu.com'],

  async home() {
    var both = await Promise.all([
      get('/').catch(function (error) {
        console.warn('[pornlulu] 最新 抓取失败：' + error);
        return null;
      }),
      get('/?sort=hits').catch(function (error) {
        console.warn('[pornlulu] 最热 抓取失败：' + error);
        return null;
      })
    ]);
    var plan = [
      { title: '最新', moreUrl: 'latest', rows: both[0] },
      { title: '最热', moreUrl: 'hits', rows: both[1] }
    ];
    var sections = [];
    for (var s = 0; s < plan.length; s++) {
      if (!plan[s].rows) continue;
      var items = parseCards(plan[s].rows.body);
      if (items.length) sections.push({ title: plan[s].title, moreUrl: plan[s].moreUrl, items: items.slice(0, 24) });
    }
    if (!sections.length) throw new Error('Pornlulu：首页没有数据（站点可能改版或被 WAF 拦截）');
    return sections;
  },

  async categories() {
    var out = [];
    for (var i = 0; i < SORT_TABS.length; i++) out.push({ id: SORT_TABS[i].id, title: SORT_TABS[i].title });
    var rows = await loadCategories();
    for (var j = 0; j < rows.length; j++) out.push({ id: rows[j].id, title: rows[j].title });
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
      // 搜索不吃 sort（实测 ?q=…&sort=hits 与不加一样），所以只传关键词和页码
      path = '/?q=' + encodeURIComponent(keyword) + (page > 1 ? '&page=' + page : '');
    } else {
      path = listPath(categoryId, page);
    }
    var reply = await get(path);
    var items = parseCards(reply.body);
    if (!items.length) console.warn('[pornlulu] 列表没解析出条目：' + path);
    return { items: items, hasMore: hasNext(reply.body) };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!/^[A-Za-z0-9]{3,}$/.test(id)) return null;
    var reply = await get('/v/' + encodeURIComponent(id));
    if (reply.status === 404) return null;
    var html = reply.body;
    var title = clean((/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i.exec(html) || [])[1]);
    if (!title) title = clean((/<title[^>]*>([\s\S]*?)<\/title>/.exec(html) || [])[1]).replace(/\s*-\s*[^-]*$/, '');
    var cover = (/(?:og:image|itemprop="image")[^>]+content="([^"]*)"/i.exec(html) || [])[1] || '';
    var cat = categoryName(html);
    var bits = [];
    if (cat) bits.push(cat);
    var kw = /name="keywords"[^>]+content="([^"]*)"/i.exec(html);
    var desc = kw ? entity(kw[1]).split(/\s*,\s*/)[0] : '';
    return {
      id: id,
      title: title || ('视频 ' + id),
      cover: cover ? absolute(cover) : null,
      subtitle: bits.join(' · '),
      description: (desc ? desc + '\n' : '') + '源站：' + base() + '/v/' + id
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id) return [];
    return [{ id: 'play', title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    // itemId 是部分离线检查工具的叫法，App 传的是 id
    var id = String(args.id || args.itemId || '').trim();
    if (!id) throw new Error('Pornlulu：缺少视频 id');
    var reply = await get('/v/' + encodeURIComponent(id));
    if (reply.status === 404) throw new Error('Pornlulu：这条视频已下架（404）');
    var html = reply.body;
    var url = '';
    var source = /<source[^>]+src=["']([^"']+)["']/i.exec(html);
    if (source) url = entity(source[1]);
    if (!url) {
      var raw = /src:\s*["']([^"']+\.m3u8[^"']*)["']/i.exec(html);
      if (raw) url = entity(raw[1]);
    }
    if (!url) {
      return {
        kind: 'webplayer',
        pageUrl: base() + '/v/' + encodeURIComponent(id),
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
