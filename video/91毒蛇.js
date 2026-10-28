// LumeSource: {"id":"duse91_video","name":"91毒蛇","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://www.duse2.com"]},"network":"proxy","icon":"https://www.duse2.com/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：91 毒蛇（https://www.duse2.com）—— 全站 cdndefend JS 挑战（SHA1 工作量证明）。
//   挑战页（HTTP 850）里内联一段 SHA1 实现 + 如下逻辑：
//     c  = 'B4A546B27A1CA2583D64241DB70B87738260BF93'
//     n1 = parseInt(c[0], 16)                      // = 11
//     找 i 使 sha1(c + i) 的第 n1 字节 == 0xb0 且第 n1+1 字节 == 0x0b
//     成功后写 cookie： cdndefend_js_cookie = c + i
//   本源内置纯 JS SHA1，在本地算（约几万次迭代，毫秒级），把 cookie 带在后续请求上。
//   列表 /channel/{1电影,2连续剧,3动漫,4综艺纪录,6短剧}.html；详情 /detail/{id}.html；
//   播放 /play/{id}-{源}-{集}.html（页面内带签名 m3u8）。

var HOST = 'https://www.duse2.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
var SALT = 'B4A546B27A1CA2583D64241DB70B87738260BF93';
var CATS = [
  { id: '1', title: '电影' },
  { id: '2', title: '连续剧' },
  { id: '3', title: '动漫' },
  { id: '4', title: '综艺纪录' },
  { id: '6', title: '短剧' },
];
var PAGE_SIZE = 24;

function base() { var d = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : ''; return (d || HOST).replace(/\/+$/, ''); }
function readJson(f) { return LumeSource.fs.readText(f).then(function (r) { if (!r) return null; try { return JSON.parse(r); } catch (e) { return null; } }).catch(function () { return null; }); }
function writeJson(f, v) { return LumeSource.fs.writeText(f, JSON.stringify(v)).catch(function () { return null; }); }
function clean(t) { return String(t == null ? '' : t).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function img(u) { var s = String(u || '').trim(); if (!s) return ''; if (/^\/\//.test(s)) return 'https:' + s; if (/^http:\/\//i.test(s)) return s.replace(/^http:/i, 'https:'); if (/^\//.test(s)) return base() + s; return s; }

// ---- 纯 JS SHA1（输出字节数组）----
function sha1Bytes(msg) {
  var bytes = [];
  for (var i = 0; i < msg.length; i++) {
    var c = msg.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
    else { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
  }
  var bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  bytes.push(0, 0, 0, 0, (bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);
  var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  var rol = function (n, s) { return ((n << s) | (n >>> (32 - s))) >>> 0; };
  for (var off = 0; off < bytes.length; off += 64) {
    var w = new Array(80);
    for (var j = 0; j < 16; j++) w[j] = ((bytes[off + j * 4] << 24) | (bytes[off + j * 4 + 1] << 16) | (bytes[off + j * 4 + 2] << 8) | bytes[off + j * 4 + 3]) >>> 0;
    for (j = 16; j < 80; j++) w[j] = rol((w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16]) >>> 0, 1);
    var a = h0, b = h1, c2 = h2, d = h3, e = h4;
    for (j = 0; j < 80; j++) {
      var f, k;
      if (j < 20) { f = (b & c2) | (~b & d); k = 0x5a827999; }
      else if (j < 40) { f = b ^ c2 ^ d; k = 0x6ed9eba1; }
      else if (j < 60) { f = (b & c2) | (b & d) | (c2 & d); k = 0x8f1bbcdc; }
      else { f = b ^ c2 ^ d; k = 0xca62c1d6; }
      var t = (rol(a, 5) + (f >>> 0) + e + k + w[j]) >>> 0;
      e = d; d = c2; c2 = rol(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c2) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  var out = [];
  [h0, h1, h2, h3, h4].forEach(function (h) { out.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255); });
  return out;
}

// 解挑战：找 i 使 sha1(SALT + i)[n1] === 0xb0 && [n1+1] === 0x0b
function solveChallenge(salt) {
  var s = String(salt || SALT);
  var n1 = parseInt(s.charAt(0), 16);
  for (var i = 0; i < 5000000; i++) {
    var d = sha1Bytes(s + i);
    if (d[n1] === 0xb0 && d[n1 + 1] === 0x0b) return s + i;
  }
  return '';
}

async function cookieValue() {
  var cached = await readJson('cookie.json');
  if (cached && cached.value && Date.now() - Number(cached.at) < 30 * 60 * 1000) return cached.value;
  var v = solveChallenge(SALT);
  if (v) await writeJson('cookie.json', { at: Date.now(), value: v });
  return v;
}

function get(url, cookie) {
  var headers = { 'User-Agent': UA, Accept: 'text/html,*/*', Referer: base() + '/', 'Accept-Language': 'zh-CN,zh;q=0.9' };
  if (cookie) headers.Cookie = 'cdndefend_js_cookie=' + cookie;
  return LumeSource.http.get(url, { headers: headers }).then(function (r) {
    var s = r ? r.status : 0;
    if (!s) throw new Error('连不上');
    if (s === 850 || s === 403) throw new Error('站点挑战未通过（可能在换 salt，需要网页视图）');
    if (s !== 200) throw new Error('HTTP ' + s);
    return r.body ? String(r.body) : '';
  });
}

// 带挑战重试：先算 cookie 再请求；被 850 挡回则重算一次
async function fetchPage(url) {
  var cookie = await cookieValue();
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      var html = await get(url, cookie);
      if (!/cdndefend|verifying your browser/i.test(html)) return html;
    } catch (e) {
      if (attempt === 1) throw e;
    }
    await writeJson('cookie.json', { at: 0, value: '' });
    cookie = await cookieValue();
  }
  throw new Error('毒蛇挑战反复不过，请用网页视图打开一次站点');
}

function parseCards(html) {
  var text = String(html || ''), items = [], seen = {};
  var re = /<a[^>]+href="(\/detail\/(\d+)\.html)"[^>]*>/g, m;
  while ((m = re.exec(text)) !== null) {
    if (seen[m[2]]) continue;
    var win = text.slice(m.index, m.index + 1400);
    var title = (/class="[^"]*v-item-title[^"]*"[^>]*>([^<]{1,80})</i.exec(win) || [])[1]
      || (/title="([^"]{1,80})"/.exec(win) || [])[1]
      || (/alt="([^"]{1,80})"/.exec(win) || [])[1] || '';
    title = clean(title).replace(/可可影视|kekys|水印/gi, '').replace(/[A-Za-z0-9.-]*\.(?:com|cn|net|tv|cc|xyz|vip|top|club)/gi, '').replace(/^[-·\s]+|[-·\s]+$/g, '').trim();
    var cover = '';
    var tags = win.match(/<img[^>]*>/gi) || [];
    for (var ti = 0; ti < tags.length; ti++) {
      var v = (/(?:data-original|data-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i.exec(tags[ti]) || [])[1] || '';
      if (v && !/placeholder|logo_|lazy/i.test(v)) { cover = v; break; }
    }
    if (!title) title = (/<img[^>]+alt="([^"]{1,80})"/i.exec(win) || [])[1] || ('作品 ' + m[2]);
    title = String(title).trim() || ('作品 ' + m[2]);
    seen[m[2]] = 1;
    items.push({ id: m[2], title: title.slice(0, 60), cover: img(cover), subtitle: '' });
  }
  return items;
}

function parseDetail(html) {
  var text = String(html || '');
  var title = clean((/<h1[^>]*>([\s\S]{1,120}?)<\/h1>/i.exec(text) || [])[1] || '');
  var cover = img((/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(text) || [])[1] || '');
  var plays = [], seen = {}, re = /href="(\/play\/[^"]+)"/g, m;
  while ((m = re.exec(text)) !== null) { if (!seen[m[1]]) { seen[m[1]] = 1; plays.push(m[1]); } }
  return { title: title, cover: cover, plays: plays };
}

var LumeSource = {
  id: 'duse91_video', name: '91毒蛇', version: '1.0.0', category: 'video',
  settingsApiVersion: 2, requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://www.duse2.com'] },
  commonSettings: [{ key: 'pageSize', default: 24, min: 1, max: 50 }, { key: 'playbackMode', default: 'auto' }],
  settings: [{ key: 'note', type: 'info', title: '站点说明', description: '91毒蛇：整站 cdndefend SHA1 挑战，源内已实现自动求解（约几万次迭代）。' }],

  async categories() { return CATS; },

  async home() {
    var boards = [];
    for (var i = 0; i < CATS.length && boards.length < 3; i++) {
      try {
        var items = parseCards(await fetchPage(base() + '/channel/' + CATS[i].id + '.html'));
        if (items.length) boards.push({ title: CATS[i].title, moreUrl: CATS[i].id, items: items.slice(0, 12) });
      } catch (e) { /* 跳过 */ }
    }
    return boards;
  },

  async list(argument) {
    var a = argument || {};
    var cat = /^\d+$/.test(String(a.categoryId || '')) ? String(a.categoryId) : '1';
    var kw = String(a.keyword || '').trim();
    var url = kw ? base() + '/search?k=' + encodeURIComponent(kw) : base() + '/channel/' + cat + '.html';
    var items = parseCards(await fetchPage(url));
    return { items: items, hasMore: items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var info = { title: '', cover: '' };
    try { info = parseDetail(await fetchPage(base() + '/detail/' + id + '.html')); } catch (e) { /* 忽略 */ }
    return { id: id, title: info.title || ('作品 ' + id), cover: info.cover, subtitle: '', description: '91毒蛇（www.duse2.com）' };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return [];
    var plays = [];
    try { plays = parseDetail(await fetchPage(base() + '/detail/' + id + '.html')).plays; } catch (e) { /* 忽略 */ }
    if (!plays.length) return [{ id: 'web:/detail/' + id + '.html', title: '网页播放' }];
    return plays.map(function (p, i) { return { id: 'p:' + p, title: '线路 ' + (i + 1) }; });
  },

  async content(argument) {
    var a = argument || {}, raw = String(a.chapterId || '');
    var path = raw.indexOf('p:') === 0 ? raw.slice(2) : raw;
    if (!path || path.indexOf('web:') === 0) return { kind: 'webplayer', url: base() + '/detail/' + String(a.id || '').replace(/\D/g, '') + '.html' };
    var url = /^https?:/.test(path) ? path : base() + path;
    var html = await fetchPage(url);
    var media = (/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/.exec(html) || [])[1] || (/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/.exec(html) || [])[1] || '';
    if (media) return { kind: 'video', url: media, headers: { 'User-Agent': UA, Referer: base() + '/' } };
    return { kind: 'webplayer', url: url };
  },
};
