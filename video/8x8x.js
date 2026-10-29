// LumeSource: {"id":"x8x8_video","name":"8x8x","version":"3.0.0","category":"video","contentCategory":"adult","mirrors":["https://1azm0i.qcsw2b5yf.com","https://qnzu16v.u85772.com"],"network":"proxy"}
// LumeRuntime: javascript
//
// 站点：8x8x（成人综合站，全站 18+）—— 2026-10-29 复测（改版后：跳板域 + SPA 外壳 + 服务端渲染内容页）
//
// 一、域名与页面结构
//   跳板域 1azm0i.qcsw2b5yf.com 302 到当前真实域（本次 113452.85hcp2.com）；本源每次跟随重定向取
//   **当前 origin**（缓存 30 分钟），域名再换也能自己跟过去。
//   真实域根路径只有 347 字节外壳：`<script src=/assets/app.xxx.js data-body-url=/4rov3/>`
//   真正的内容页都在 `/<bodyRoot>/...`（bodyRoot 每次改版会变，动态取），路径：
//     首页     /<bodyRoot>/
//     分类     /<bodyRoot>/category/<1..5>/            分页 /<bodyRoot>/category/<id>/page/N/
//     标签     /<bodyRoot>/tags/<标签>/                 分页同上 /page/N/
//     详情     /<bodyRoot>/vd/<id>/
//   **站点根路径 /category/1/ 会被 SPA 兜底 302 到首页**，必须带 bodyRoot。
//
// 二、分类 / 筛选 / 排序（本次补齐）
//   分类   导航里的 5 个频道（大陆 / 日韩 / 欧美 / 动漫 / 三级）实时抓；另有「推荐」=
//          首页推荐流 `/json/recommend/rmd_{1..50}`。
//   筛选   导航里的 12 个标签组（年龄 / 职业 / 剧情 / 吃瓜 / 身材 / 多人 / 姿势 / 反应 / 服装 /
//          足控 / 场景 / 特殊）实时抓。**站点只认单标签**（A+B、逗号、重复路径段都 302），
//          组内多选时只取第一个；标签页是全站的，不与频道叠加（站点没有 category+tag 组合 URL）。
//   排序   站点**没有排序控件**（无 select/按钮；?sort= / ?order= / /hot/ 都被忽略或 302）。
//          能拿到的两种真实顺序只有「最新（频道/标签页的站点顺序）」和「推荐（首页推荐流）」，
//          所以排序组只给这两项；选「推荐」时走推荐流（全局，不区分频道/标签）。
//
// 三、推荐流是加密 JSON
//   浏览器里由 /js/nal.js 解密：key = base64(_q) 逐字节异或 _s → AES-256-GCM；
//   密文 base64url = 12 字节 iv + 密文 + 16 字节 tag；明文 {"list":[{id,title,litpic}]}。
//   App 沙箱没有 crypto，本源内置纯 JS AES-256-GCM（SBOX + GHASH），已用真实数据校验。
//
// 四、封面
//   `window.picUrl` 把 litpic 拼到图片域（每页写在 HTML 里，动态取、缓存 6 小时）；
//   分类/标签/详情页的封面是绝对地址，直接用。
//
// 五、详情与播放（本次从 webplayer 升级为原生 HLS）
//   详情页 SSR 给出 `#player-wrap`：
//     data-m3u8=<hash>/m3u8/index.m3u8（有的没有 /m3u8/ 段，按原样拼）
//     data-route1..3=https://host:port/v/   ← 三条媒体线路，播放串 = route + m3u8
//   实测三条线路都 200 + application/vnd.apple.mpegurl（master 内 500kb/300kb 两个码率）。
//   content() 按线路探活，失败换下一条，全挂再退回 webplayer。
// 18+

var SEEDS = ['https://1azm0i.qcsw2b5yf.com', 'https://qnzu16v.u85772.com'];
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var BASE_TTL_MS = 30 * 60 * 1000;
var PIC_TTL_MS = 6 * 3600 * 1000;
var KEY_B64 = 'VzykaRDU6BDMtduly8ERIbtBlEJejL9xs7RhqmQ6Ycs=';
var KEY_SALT = 'vjs-hls-abr-4';
var MAX_PAGE = 50;                 // 推荐流 rmd_1..rmd_50
var BODY_TTL_MS = 6 * 3600 * 1000; // data-body-url 前缀
var NAV_TTL_MS = 30 * 60 * 1000;   // 频道 + 标签组
var DETAIL_TTL_MS = 10 * 60 * 1000; // 详情页的 m3u8 / 媒体线路

// 导航抓不到时的兜底频道（正常路径永远实时抓）
var FALLBACK_CATS = [
  { id: '1', title: '大陆' },
  { id: '2', title: '日韩' },
  { id: '3', title: '欧美' },
  { id: '4', title: '动漫' },
  { id: '5', title: '三级' },
];

// ---------------------------------------------------------------- 通用工具

function readJson(file) {
  return LumeSource.fs.readText(file).then(function (raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (error) { return null; }
  }).catch(function () { return null; });
}

function writeJson(file, value) {
  return LumeSource.fs.writeText(file, JSON.stringify(value)).catch(function () { return null; });
}

function clean(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

function httpText(url, referer) {
  return LumeSource.http.get(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/json,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: referer || url,
    },
  }).then(function (reply) {
    if (!reply || reply.status !== 200) return '';
    return reply.body ? String(reply.body) : '';
  }).catch(function () { return ''; });
}

// ---------------------------------------------------------------- base64 / utf8

var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64ToBytes(text) {
  var s = String(text || '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
  var out = [];
  var buffer = 0;
  var bits = 0;
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (ch === '=') break;
    var v = B64.indexOf(ch);
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

function utf8Decode(bytes) {
  var out = '';
  var i = 0;
  while (i < bytes.length) {
    var c = bytes[i++];
    if (c < 0x80) out += String.fromCharCode(c);
    else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (c < 0xf0) out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else {
      var cp = (((c & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f)) - 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

// ---------------------------------------------------------------- 纯 JS AES-256-GCM

var SBOX = [
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
];

function xtime(a) { return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff; }

function expandKey(key) {
  var nk = key.length / 4;
  var nr = nk + 6;
  var w = [];
  for (var i = 0; i < key.length; i++) w[i] = key[i];
  var rcon = 1;
  for (var i2 = nk; i2 < 4 * (nr + 1); i2++) {
    var t = [w[(i2 - 1) * 4], w[(i2 - 1) * 4 + 1], w[(i2 - 1) * 4 + 2], w[(i2 - 1) * 4 + 3]];
    if (i2 % nk === 0) {
      t = [SBOX[t[1]], SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]];
      t[0] ^= rcon;
      rcon = xtime(rcon);
    } else if (nk > 6 && i2 % nk === 4) {
      t = [SBOX[t[0]], SBOX[t[1]], SBOX[t[2]], SBOX[t[3]]];
    }
    for (var j = 0; j < 4; j++) w[i2 * 4 + j] = w[(i2 - nk) * 4 + j] ^ t[j];
  }
  return { w: w, nr: nr };
}

function encryptBlock(k, block) {
  var w = k.w;
  var nr = k.nr;
  var s = [];
  for (var i = 0; i < 16; i++) s[i] = block[i] ^ w[i];
  for (var round = 1; round <= nr; round++) {
    for (var a = 0; a < 16; a++) s[a] = SBOX[s[a]];
    var t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
    t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[3]; s[3] = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = t;
    if (round !== nr) {
      for (var c = 0; c < 4; c++) {
        var a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
        var all = a0 ^ a1 ^ a2 ^ a3;
        s[c * 4] = a0 ^ all ^ xtime(a0 ^ a1);
        s[c * 4 + 1] = a1 ^ all ^ xtime(a1 ^ a2);
        s[c * 4 + 2] = a2 ^ all ^ xtime(a2 ^ a3);
        s[c * 4 + 3] = a3 ^ all ^ xtime(a3 ^ a0);
      }
    }
    for (var b = 0; b < 16; b++) s[b] ^= w[round * 16 + b];
  }
  return s;
}

function gfMul(x, y) {
  var z = [];
  for (var i = 0; i < 16; i++) z[i] = 0;
  var v = [];
  for (var j = 0; j < 16; j++) v[j] = y[j];
  for (var b = 0; b < 128; b++) {
    if ((x[b >> 3] >> (7 - (b & 7))) & 1) for (var m = 0; m < 16; m++) z[m] ^= v[m];
    var lsb = v[15] & 1;
    for (var n = 15; n > 0; n--) v[n] = (v[n] >> 1) | ((v[n - 1] & 1) << 7);
    v[0] >>= 1;
    if (lsb) v[0] ^= 0xe1;
  }
  return z;
}

function ghash(h, ct) {
  var y = [];
  for (var i = 0; i < 16; i++) y[i] = 0;
  for (var off = 0; off < ct.length; off += 16) {
    for (var j = 0; j < 16; j++) y[j] ^= ct[off + j] || 0;
    y = gfMul(y, h);
  }
  var bits = ct.length * 8;
  y[12] ^= (bits >>> 24) & 0xff;
  y[13] ^= (bits >>> 16) & 0xff;
  y[14] ^= (bits >>> 8) & 0xff;
  y[15] ^= bits & 0xff;
  return gfMul(y, h);
}

function aesGcmDecrypt(key, iv, ct, tag) {
  var k = expandKey(key);
  var zero = [];
  for (var i = 0; i < 16; i++) zero[i] = 0;
  var h = encryptBlock(k, zero);
  var out = [];
  var counter = [];
  for (var c = 0; c < 12; c++) counter[c] = iv[c];
  counter[12] = 0; counter[13] = 0; counter[14] = 0; counter[15] = 2;
  for (var off = 0; off < ct.length; off += 16) {
    var ks = encryptBlock(k, counter);
    for (var n = 0; n < 16 && off + n < ct.length; n++) out[off + n] = ct[off + n] ^ ks[n];
    for (var p = 15; p >= 12; p--) {
      counter[p] = (counter[p] + 1) & 0xff;
      if (counter[p]) break;
    }
  }
  var s = ghash(h, ct);
  var j0 = [];
  for (var q = 0; q < 12; q++) j0[q] = iv[q];
  j0[12] = 0; j0[13] = 0; j0[14] = 0; j0[15] = 1;
  var ek = encryptBlock(k, j0);
  var ok = true;
  for (var r = 0; r < 16; r++) if ((s[r] ^ ek[r]) !== tag[r]) ok = false;
  return { ok: ok, plain: out };
}

// ---------------------------------------------------------------- 站点解析

function keyBytes() {
  var raw = b64ToBytes(KEY_B64);
  var salt = KEY_SALT;
  var out = [];
  for (var i = 0; i < raw.length; i++) out.push(raw[i] ^ salt.charCodeAt(i % salt.length));
  return out;
}

function decryptPayload(text) {
  var bytes = b64ToBytes(String(text || '').trim());
  if (bytes.length < 12 + 16) throw new Error('密文长度不足');
  var iv = bytes.slice(0, 12);
  var tag = bytes.slice(bytes.length - 16);
  var body = bytes.slice(12, bytes.length - 16);
  var result = aesGcmDecrypt(keyBytes(), iv, body, tag);
  if (!result.ok) throw new Error('GCM 校验失败（站点可能又换 key）');
  return JSON.parse(utf8Decode(result.plain));
}

function resolveBase() {
  var forced = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain).replace(/\/+$/, '') : '';
  if (forced) return Promise.resolve(forced);
  return readJson('base.json').then(function (cached) {
    if (cached && cached.base && Date.now() - Number(cached.at) < BASE_TTL_MS) return cached.base;
    var chain = Promise.resolve('');
    SEEDS.forEach(function (seed) {
      chain = chain.then(function (found) {
        if (found) return found;
        return LumeSource.http.get(seed + '/', { headers: { 'User-Agent': UA } }).then(function (reply) {
          if (!reply || (reply.status && reply.status >= 400)) return '';
          var match = /^(https?:\/\/[^\/]+)/.exec(reply.url || '');
          // 跳板域 302 到真实域：桥接层回报了最终地址就用它，没回报（App 的 http 只有 status/headers/body）
          // 就用种子自身——后续请求照样会被 302 带到真实域，不能因为读不到 url 就判整站打不开。
          return match ? match[1] : seed;
        }).catch(function () { return ''; });
      });
    });
    return chain.then(function (base) {
      if (base) writeJson('base.json', { at: Date.now(), base: base });
      return base;
    });
  });
}

function picHost(html) {
  var m = /var t="(https?:\/\/[^"]+)"/.exec(String(html || ''));
  return m ? m[1] : '';
}

function picBase(base) {
  return readJson('pic.json').then(function (cached) {
    if (cached && cached.host && cached.base === base && Date.now() - Number(cached.at) < PIC_TTL_MS) return cached.host;
    // 首页只是空壳，图片域写在 data-body-url 指向的内容页里
    return httpText(base + '/', base + '/').then(function (shell) {
      var bodyUrl = (/data-body-url=["']?([\w\-\/.]+)/.exec(shell) || [])[1] || '/';
      return httpText(base + bodyUrl, base + '/');
    }).then(function (html) {
      var host = picHost(html);
      if (!host) return '';
      writeJson('pic.json', { at: Date.now(), base: base, host: host });
      return host;
    });
  });
}

function coverUrl(host, litpic) {
  var p = String(litpic || '').replace(/^(https?:)?\/\/[^\/]+/, '').replace(/^\/+/, '');
  if (!p) return '';
  return host ? host.replace(/\/+$/, '') + '/' + p : '';
}

function pageItems(base, page) {
  var n = Number(page) || 1;
  if (n < 1) n = 1;
  if (n > MAX_PAGE) n = ((n - 1) % MAX_PAGE) + 1;
  return picBase(base).then(function (host) {
    return httpText(base + '/json/recommend/rmd_' + n, base + '/').then(function (text) {
      if (!text) throw new Error('推荐数据取不到（第 ' + n + ' 页）');
      var data = decryptPayload(text);
      var rows = data && data.list ? data.list : [];
      var items = [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row || !row.id) continue;
        items.push({
          id: String(row.id),
          title: clean(row.title) || ('视频 ' + row.id),
          cover: coverUrl(host, row.litpic),
          subtitle: '',
        });
      }
      return items;
    });
  });
}

/* ---------------------------------------------------------------- 服务端渲染页 */

function absolute(url, base) {
  var text = String(url == null ? '' : url).trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.indexOf('//') === 0) return 'https:' + text;
  var origin = String(base || '').replace(/\/+$/, '');
  if (text.charAt(0) === '/') return origin + text;
  return origin + '/' + text;
}

function decodeEntities(text) {
  return String(text == null ? '' : text)
    .replace(/&#(\d+);?/g, function (m, code) {
      var n = Number(code);
      return n > 0 && n < 0x10ffff ? String.fromCharCode(n) : m;
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// 内容页前缀：外壳里的 `data-body-url=/4rov3/`，每次改版会换，按 base 缓存 6 小时
function bodyRoot(base) {
  return readJson('body.json').then(function (cached) {
    if (cached && cached.base === base && cached.root && Date.now() - Number(cached.at || 0) < BODY_TTL_MS) {
      return cached.root;
    }
    return httpText(base + '/', base + '/').then(function (shell) {
      var matched = /data-body-url=["']?([\w\-\/.]+)/.exec(shell || '');
      var root = matched ? matched[1] : '';
      if (!root) return '';
      if (root.charAt(0) !== '/') root = '/' + root;
      if (root.charAt(root.length - 1) !== '/') root += '/';
      return writeJson('body.json', { at: Date.now(), base: base, root: root }).then(function () { return root; });
    });
  });
}

async function ssrText(base, path) {
  var root = await bodyRoot(base);
  if (!root) return '';
  return httpText(base + root.replace(/\/+$/, '') + path, base + '/');
}

function parsePagination(html) {
  var matched = /第\s*(\d+)\s*\/\s*(\d+)\s*页/.exec(String(html || ''));
  if (!matched) return null;
  return { page: Number(matched[1]) || 1, total: Number(matched[2]) || 0 };
}

// 卡片：`<a href=/vd/123/ class="card group">` + `data-src=<封面>` + `<div class=card-title>标题</div>`
function parseCards(html, base) {
  var text = String(html || '');
  var hits = [];
  var re = /href=["']?\/vd\/(\d+)\//g;
  var matched;
  while ((matched = re.exec(text)) !== null) hits.push({ id: matched[1], at: matched.index });
  var out = [];
  var seen = {};
  for (var i = 0; i < hits.length; i++) {
    var hit = hits[i];
    if (seen[hit.id]) continue;
    var stop = i + 1 < hits.length ? hits[i + 1].at : Math.min(text.length, hit.at + 1200);
    var seg = text.slice(hit.at, stop);
    var title = /<div class=(["']?)card-title\1[^>]*>([\s\S]{0,300}?)<\/div>/.exec(seg);
    if (!title) continue;
    var cover = /data-src=(["']?)([^"'\s>]+)\1/.exec(seg);
    seen[hit.id] = true;
    out.push({
      id: hit.id,
      title: clean(decodeEntities(title[2])) || ('视频 ' + hit.id),
      cover: cover ? absolute(cover[2], base) : '',
      subtitle: '',
    });
  }
  return out;
}

// 导航：5 个频道 + 12 个标签组（组里的标签就是站点的「筛选」）
function parseNav(html) {
  var text = String(html || '');
  var cats = [];
  var seen = {};
  var catRe = /<a\s+href=["']?\/category\/(\d+)\/["']?([^>]*)>([^<]{1,24})<\/a>/g;
  var matched;
  while ((matched = catRe.exec(text)) !== null) {
    if (String(matched[2]).indexOf('menu-item') < 0) continue;
    var id = matched[1];
    if (seen[id]) continue;
    var title = clean(decodeEntities(matched[3]));
    if (!title) continue;
    seen[id] = true;
    cats.push({ id: id, title: title });
  }

  var groups = [];
  var groupRe = /<div class=(["']?)tag-group\1 data-group-id=(["']?)(\d+)\2[^>]*>/g;
  while ((matched = groupRe.exec(text)) !== null) {
    var start = matched.index + matched[0].length;
    var end = text.indexOf('</div>', start);
    if (end < 0) end = Math.min(text.length, start + 6000);
    var block = text.slice(start, end);
    var label = /<span class=(["']?)tag-group-label\1[^>]*>([^<]{1,12})<\/span>/.exec(block);
    if (!label) continue;
    var tags = [];
    var tagSeen = {};
    var tagRe = /<a\s+href=["']?\/tags\/([^\/"'\s>]+)\/?["']?[^>]*>([^<]{1,24})<\/a>/g;
    var tag;
    while ((tag = tagRe.exec(block)) !== null) {
      var name = '';
      try { name = decodeURIComponent(tag[1]); } catch (error) { name = tag[1]; }
      name = clean(name);
      if (!name || tagSeen[name]) continue;
      tagSeen[name] = true;
      tags.push({ id: name, title: clean(decodeEntities(tag[2])) || name });
    }
    if (!tags.length) continue;
    groups.push({ id: 'tag' + matched[3], title: clean(decodeEntities(label[2])), tags: tags });
  }
  return { cats: cats, groups: groups };
}

async function navData(base) {
  var cached = await readJson('nav.json');
  if (cached && cached.base === base && cached.cats && cached.cats.length &&
      Date.now() - Number(cached.at || 0) < NAV_TTL_MS) {
    return cached;
  }
  var html = await ssrText(base, '/');
  var nav = parseNav(html);
  if (!nav.cats.length) return cached && cached.base === base ? cached : { cats: [], groups: [] };
  var value = { at: Date.now(), base: base, cats: nav.cats, groups: nav.groups };
  await writeJson('nav.json', value);
  return value;
}

async function ssrList(base, prefix, page, subtitle) {
  var path = page > 1 ? prefix + 'page/' + page + '/' : prefix;
  var html = await ssrText(base, path);
  if (!html) throw new Error('页面打不开：' + path);
  var items = parseCards(html, base);
  for (var i = 0; i < items.length; i++) items[i].subtitle = subtitle || '';
  var info = parsePagination(html);
  var hasMore = info ? page < info.total : items.length > 0;
  await remember(items);
  return { items: items, hasMore: hasMore };
}

async function searchList(base, keyword, page) {
  var host = await picBase(base);
  var url = base + '/api/search/video?keyword=' + encodeURIComponent(keyword) + '&page=' + page;
  var text = await httpText(url, base + '/');
  if (!text) throw new Error('搜索接口没有返回（' + keyword + '）');
  var data = null;
  try { data = JSON.parse(text); } catch (error) { data = null; }
  if (!data || data.code !== 0 || !data.data) {
    throw new Error('搜索失败：' + ((data && data.message) || '接口返回异常'));
  }
  var rows = data.data.list || [];
  var items = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row || !row.id) continue;
    var tags = Array.isArray(row.tags) ? row.tags.filter(Boolean) : [];
    items.push({
      id: String(row.id),
      title: clean(row.title) || ('视频 ' + row.id),
      cover: coverUrl(host, row.litpic),
      subtitle: [row.typename].concat(tags).filter(Boolean).slice(0, 3).join(' · '),
    });
  }
  await remember(items);
  var totalPages = Number(data.data.total_pages) || 0;
  return { items: items, hasMore: totalPages ? page < totalPages : rows.length > 0 };
}

function parseDetail(html, base) {
  var text = String(html || '');
  var titleTag = /<title>([\s\S]{0,200}?)<\/title>/.exec(text);
  var title = titleTag ? clean(decodeEntities(titleTag[1])).replace(/\s*-\s*8x8x\s*$/i, '') : '';
  var poster = /data-poster=(["']?)([^"'\s>]+)\1/.exec(text);
  var desc = /<meta\s+name=(["']?)description\1\s+content=(["']?)([^"']{0,300}?)\2[^>]*>/.exec(text);
  var media = /data-m3u8=(["']?)([^"'\s>]+)\1/.exec(text);
  var routes = [];
  var routeRe = /data-route(\d)=(["']?)([^"'\s>]+)\2/g;
  var matched;
  while ((matched = routeRe.exec(text)) !== null) {
    var route = absolute(matched[3], base);
    if (route) routes.push(route.replace(/\/+$/, '') + '/');
  }
  var tags = [];
  var tagRe = /class=(["']?)tag-badge\1[^>]*>([^<]{1,24})<\//g;
  while ((matched = tagRe.exec(text)) !== null) {
    var tag = clean(decodeEntities(matched[2]));
    if (tag && tags.indexOf(tag) < 0) tags.push(tag);
  }
  return {
    title: title,
    cover: poster ? absolute(poster[2], base) : '',
    tags: tags,
    description: desc ? clean(decodeEntities(desc[3])) : '',
    m3u8: media ? media[2].replace(/^\/+/, '') : '',
    routes: routes,
  };
}

async function detailPlay(base, id) {
  var file = 'play-' + id + '.json';
  var cached = await readJson(file);
  if (cached && cached.base === base && cached.m3u8 && Date.now() - Number(cached.at || 0) < DETAIL_TTL_MS) {
    return cached;
  }
  var html = await ssrText(base, '/vd/' + id + '/');
  if (!html) throw new Error('详情页打不开（视频可能已下架）');
  var info = parseDetail(html, base);
  info.at = Date.now();
  info.base = base;
  info.id = id;
  await writeJson(file, info);
  return info;
}

// 筛选组里除 sort 之外的第一个值（站点只认单标签，多选取第一个）
function firstTag(filters) {
  var keys = Object.keys(filters || {});
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] === 'sort') continue;
    var value = String(filters[keys[i]] == null ? '' : filters[keys[i]]).trim();
    if (!value) continue;
    var first = value.split(',')[0].trim();
    if (first) return first;
  }
  return '';
}

function remember(items) {
  if (!items.length) return Promise.resolve(null);
  return readJson('items.json').then(function (cached) {
    var map = (cached && cached.map) ? cached.map : {};
    for (var i = 0; i < items.length; i++) {
      map[items[i].id] = {
        title: items[i].title,
        cover: items[i].cover,
        subtitle: items[i].subtitle || '',
      };
    }
    return writeJson('items.json', { at: Date.now(), map: map });
  });
}

var LumeSource = {
  id: 'x8x8_video',
  name: '8x8x',
  version: '3.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://1azm0i.qcsw2b5yf.com', 'https://qnzu16v.u85772.com'],

  async categories() {
    var base = await resolveBase();
    var out = [{ id: 'rec', title: '推荐' }];
    if (!base) return out.concat(FALLBACK_CATS);
    var nav = await navData(base).catch(function () { return { cats: [] }; });
    var cats = nav.cats && nav.cats.length ? nav.cats : FALLBACK_CATS;
    for (var i = 0; i < cats.length; i++) out.push({ id: cats[i].id, title: cats[i].title });
    return out;
  },

  async filters() {
    var groups = [{
      id: 'sort',
      title: '排序',
      options: [
        { id: 'new', title: '最新' },
        { id: 'rec', title: '推荐' },
      ],
    }];
    var base = await resolveBase();
    if (base) {
      var nav = await navData(base).catch(function () { return { groups: [] }; });
      var tagGroups = nav.groups || [];
      for (var i = 0; i < tagGroups.length; i++) {
        groups.push({
          id: tagGroups[i].id,
          title: tagGroups[i].title || '标签',
          options: tagGroups[i].tags.map(function (tag) {
            return { id: tag.id, title: tag.title };
          }),
        });
      }
    }
    return { groups: groups };
  },

  async home() {
    var base = await resolveBase();
    if (!base) return [];
    var boards = [];
    var failure = null;
    try {
      var items = await pageItems(base, 1);
      if (items.length) {
        await remember(items);
        boards.push({ title: '推荐', moreUrl: 'rec', items: items.slice(0, 12) });
      }
    } catch (error) {
      failure = error;
    }
    try {
      var latest = await ssrList(base, '/category/1/', 1, '最新');
      if (latest.items.length) {
        boards.push({ title: '最新 · 大陆', moreUrl: '1', items: latest.items.slice(0, 12) });
      }
    } catch (error) {
      failure = failure || error;
    }
    if (!boards.length && failure) throw failure;
    return boards;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = clean(String(args.keyword == null ? '' : args.keyword));
    var filters = args.filters || {};
    var sort = String(filters.sort == null ? '' : filters.sort).trim();
    var category = String(args.categoryId == null ? '' : args.categoryId).trim();

    var base = await resolveBase();
    if (!base) throw new Error('跳板域都打不开了（站点可能又换域名）');

    if (keyword) return await searchList(base, keyword, page);

    var tag = firstTag(filters);
    if (sort === 'rec' && !tag) {
      var items = await pageItems(base, page);
      await remember(items);
      return { items: items, hasMore: page < MAX_PAGE && items.length > 0 };
    }
    // 站点只有「全站标签页」，没有 category+tag 组合 URL：选了标签就按标签走
    if (tag) return await ssrList(base, '/tags/' + encodeURIComponent(tag) + '/', page, '标签 · ' + tag);
    if (category === 'rec') {
      var recItems = await pageItems(base, page);
      await remember(recItems);
      return { items: recItems, hasMore: page < MAX_PAGE && recItems.length > 0 };
    }
    var id = /^\d+$/.test(category) ? category : '1';
    return await ssrList(base, '/category/' + id + '/', page, '');
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    var base = await resolveBase();
    var info = null;
    if (base) {
      try {
        info = await detailPlay(base, id);
      } catch (error) {
        if (!row) throw error;
      }
    }
    var tags = info && info.tags ? info.tags.slice(0) : [];
    var lines = [];
    if (info && info.description) lines.push(info.description);
    if (tags.length) lines.push('分类：' + tags.join(' / '));
    if (base) lines.push('源站：' + base + '/vd/' + id + '/');
    lines.push('列表来自站点服务端渲染页与加密推荐流（本源内置解密），播放为三条媒体线路的 HLS。');
    return {
      id: id,
      title: (info && info.title) || (row && row.title) || ('视频 ' + id),
      cover: (info && info.cover) || (row && row.cover) || '',
      subtitle: tags.join(' · ') || (row && row.subtitle) || '',
      description: lines.join('\n'),
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    var base = await resolveBase();
    if (!base) throw new Error('跳板域都打不开了（站点可能又换域名）');
    var info = await detailPlay(base, id);
    if (info.routes && info.routes.length) {
      var out = [];
      for (var i = 0; i < info.routes.length; i++) out.push({ id: String(i + 1), title: '线路' + (i + 1) });
      return out;
    }
    return [{ id: 'web', title: '网页播放' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少视频 ID');
    var base = await resolveBase();
    if (!base) throw new Error('跳板域都打不开了');
    var info = await detailPlay(base, id);
    var headers = { 'User-Agent': UA, Referer: base + '/' };

    if (info.m3u8 && info.routes && info.routes.length) {
      var chapterId = String(args.chapterId == null ? '' : args.chapterId);
      var wanted = Number(chapterId.replace(/[^0-9]/g, '')) - 1;
      if (!(wanted >= 0 && wanted < info.routes.length)) wanted = 0;
      for (var i = 0; i < info.routes.length; i++) {
        var index = (wanted + i) % info.routes.length;
        var url = info.routes[index] + info.m3u8;
        var ok = false;
        try {
          var probe = await LumeSource.http.get(url, { headers: headers });
          var body = probe && probe.body ? String(probe.body) : '';
          ok = probe && probe.status === 200 && body.indexOf('#EXTM3U') >= 0;
        } catch (error) {
          ok = false;
        }
        if (ok) return { kind: 'video', url: url, headers: headers };
      }
    }
    return { kind: 'webplayer', url: base + '/vd/' + id + '/' };
  },
};