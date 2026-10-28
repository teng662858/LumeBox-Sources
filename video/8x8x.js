// LumeSource: {"id":"x8x8_video","name":"8x8x","version":"2.0.0","category":"video","contentCategory":"adult","mirrors":["https://1azm0i.qcsw2b5yf.com","https://qnzu16v.u85772.com"],"network":"proxy"}
// LumeRuntime: javascript
//
// 站点：8x8x（成人综合站，全站 18+）—— 2026-10-28 改版：跳板域 + SPA + **AES-256-GCM 加密列表**。
//
// 一、域名：旧镜像（1azm0i.qcsw2b5yf.com 等）只是跳板，302 到当前真实域
//     https://1azm0i.qcsw2b5yf.com/  →  302  →  https://362647.6uk93488.com/
//   所以本源每次都从跳板域跟随重定向取**当前 origin**（缓存 30 分钟），域名再换也能自己跟过去。
//
// 二、列表是加密 JSON（这就是「渲染后没认出卡片」的原因）
//   首页 HTML 只有骨架：`<script src=/assets/app.xxx.js data-body-url=/8oaluw1/>`，
//   卡片由 `/json/recommend/rmd_{1..50}`（随机取一个）渲染，内容是密文，
//   浏览器里由 `/js/nal.js` 的 `window.decJSON` 解密：
//     var _q = 'VzykaRDU6BDMtduly8ERIbtBlEJejL9xs7RhqmQ6Ycs=';   // base64
//     var _s = 'vjs-hls-abr-4';
//     key = base64(_q) 逐字节异或 _s 循环  → 32 字节 → AES-256 密钥
//     密文 = base64url → 前 12 字节 iv + 中间密文 + 末 16 字节 GCM tag
//   明文形如 {"list":[{"id":66888,"title":"…","litpic":"p2/…/cover.webp"}]}。
//   App 的沙箱没有 crypto，所以本源内置了一份纯 JS 的 AES-256-GCM（SBOX 常量表 + GHASH），
//   已用真实站点数据校验通过。
//
// 三、封面：`window.picUrl` 把 litpic 拼到图片域（每页写在 HTML 里，这里动态取，缓存）。
//
// 四、播放：详情页 `/vd/{id}/` 仍是 SPA，播放地址由站内 player.js 现拼 →
//   content() 返回 webplayer（`{origin}/vd/{id}/`），交给 App 内嵌浏览器播放。
// 18+

var SEEDS = ['https://1azm0i.qcsw2b5yf.com', 'https://qnzu16v.u85772.com'];
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var BASE_TTL_MS = 30 * 60 * 1000;
var PIC_TTL_MS = 6 * 3600 * 1000;
var KEY_B64 = 'VzykaRDU6BDMtduly8ERIbtBlEJejL9xs7RhqmQ6Ycs=';
var KEY_SALT = 'vjs-hls-abr-4';
var MAX_PAGE = 50;

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
          if (!reply) return '';
          var finalUrl = reply.url || '';
          var match = /^(https?:\/\/[^\/]+)/.exec(finalUrl);
          return match ? match[1] : '';
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

function remember(items) {
  if (!items.length) return Promise.resolve(null);
  return readJson('items.json').then(function (cached) {
    var map = (cached && cached.map) ? cached.map : {};
    for (var i = 0; i < items.length; i++) map[items[i].id] = { title: items[i].title, cover: items[i].cover };
    return writeJson('items.json', { at: Date.now(), map: map });
  });
}

var LumeSource = {
  id: 'x8x8_video',
  name: '8x8x',
  version: '2.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://1azm0i.qcsw2b5yf.com', 'https://qnzu16v.u85772.com'],

  async categories() {
    return [{ id: 'rec', title: '推荐' }];
  },

  async home() {
    var boards = [];
    try {
      var base = await resolveBase();
      if (!base) return [];
      var items = await pageItems(base, 1);
      if (items.length) {
        await remember(items);
        boards.push({ title: '推荐', moreUrl: 'rec', items: items.slice(0, 12) });
      }
    } catch (error) {
      /* 首页失败交给 App 显示错误 */
      throw error;
    }
    return boards;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var base = await resolveBase();
    if (!base) throw new Error('跳板域都打不开了（站点可能又换域名）');
    var items = await pageItems(base, page);
    await remember(items);
    return { items: items, hasMore: page < MAX_PAGE && items.length > 0 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var base = await resolveBase();
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    return {
      id: id,
      title: row && row.title ? row.title : ('视频 ' + id),
      cover: row && row.cover ? row.cover : '',
      subtitle: '内嵌浏览器播放',
      description: '源站：' + base + '/vd/' + id + '/\n列表为 AES-256-GCM 加密 JSON（本源内置解密），播放交给 App 内嵌浏览器。',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'web:' + id, title: '网页播放' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少视频 ID');
    var base = await resolveBase();
    if (!base) throw new Error('跳板域都打不开了');
    return { kind: 'webplayer', url: base + '/vd/' + id + '/' };
  },
};
