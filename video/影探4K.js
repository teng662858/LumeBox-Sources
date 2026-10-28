// LumeSource: {"id":"yentan4k_video","name":"影探4K","version":"1.0.0","category":"video","mirrors":["http://cms.lyyytv.cn"],"network":"proxy","icon":"http://cms.lyyytv.cn/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：影探4K（lyyytv.cn 这一族）—— 苹果CMS app 接口站。
//   数据：http://cms.lyyytv.cn/api.php/app/{nav,index_video,video,video_detail,search}
//   解析：http://fys.lyyytv.cn/api/index?parsesId=3&appid=10001&videoUrl=<原始地址>
//   主站 www.lyyytv.cn 对浏览器 UA 回 403，但接口域 cms. 完全可用（实测 200）。
//
// 播放地址的坑（抄自 yt4k.js / 影探4K 的 TVBox 脚本）：
//   · 详情里 vod_url_with_player[].url 是「名称$地址#名称$地址」的播放串
//   · 地址可能是直接 mp4（例如 ym4kjx.lyyytv.cn/d/file/…mp4）
//   · 也可能被加密：`lvdou+<base64>` → AES-128-CBC，key = CMS_KEY 前 16 位、iv = 后 16 位
//     （CMS_KEY = wP5bvxoc3yv7FoBQENFZuAF0EUYr4LTy）
//   · 老格式 `ldmax.cooom` 前缀 → key = 路径前 16 位倒序，AES-CBC(iv=key)
//   · 解出来的地址若还不是媒体地址，就丢给上面的解析接口，回包 JSON 里取 url/playUrl/link
// 18+

var CMS = 'http://cms.lyyytv.cn';
var PARSE_API = 'http://fys.lyyytv.cn/api/index?parsesId=3&appid=10001&videoUrl=';
var CMS_KEY = 'wP5bvxoc3yv7FoBQENFZuAF0EUYr4LTy';
var UA = 'okhttp/4.12.0';
var PAGE_SIZE = 20;
var CACHE_TTL_MS = 6 * 3600 * 1000;

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return (domain || CMS).replace(/\/+$/, '');
}

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
  return String(text == null ? '' : text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

var SBOX_HEX = '637c777bf26b6fc53001672bfed7ab76ca82c97dfa5947f0add4a2af9ca472c0b7fd9326363ff7cc34a5e5f171d8311504c723c31896059a071280e2eb27b27509832c1a1b6e5aa0523bd6b329e32f8453d100ed20fcb15b6acbbe394a4c58cfd0efaafb434d338545f9027f503c9fa851a3408f929d38f5bcb6da2110fff3d2cd0c13ec5f974417c4a77e3d645d197360814fdc222a908846eeb814de5e0bdbe0323a0a4906245cc2d3ac629195e479e7c8376d8dd54ea96c56f4ea657aae08ba78252e1ca6b4c6e8dd741f4bbd8b8a703eb5664803f60e613557b986c11d9ee1f8981169d98e949b1e87e9ce5528df8ca1890dbfe6426841992d0fb054bb16';
var INV_SBOX_HEX = '52096ad53036a538bf40a39e81f3d7fb7ce339829b2fff87348e4344c4dee9cb547b9432a6c2233dee4c950b42fac34e082ea16628d924b2765ba2496d8bd12572f8f66486689816d4a45ccc5d65b6926c704850fdedb9da5e154657a78d9d8490d8ab008cbcd30af7e45805b8b34506d02c1e8fca3f0f02c1afbd0301138a6b3a9111414f67dcea97f2cfcef0b4e67396ac7422e7ad3585e2f937e81c75df6e47f11a711d29c5896fb7620eaa18be1bfc563e4bc6d279209adbc0fe78cd5af41fdda8338807c731b11210592780ec5f60517fa919b54a0d2de57a9f93c99cefa0e03b4dae2af5b0c8ebbb3c83539961172b047eba77d626e169146355210c7d';

function hexToBytes(hex) {
  var out = [];
  for (var i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

var SBOX = hexToBytes(SBOX_HEX);
var INV_SBOX = hexToBytes(INV_SBOX_HEX);

var MUL = (function () {
  var m = {};
  ['mul2', 'mul3', 'mul9', 'mul11', 'mul13', 'mul14'].forEach(function (k) { m[k] = new Array(256); });
  for (var i = 0; i < 256; i++) {
    var x = i;
    var x2 = ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;
    var x4 = ((x2 << 1) ^ (x2 & 0x80 ? 0x1b : 0)) & 0xff;
    var x8 = ((x4 << 1) ^ (x4 & 0x80 ? 0x1b : 0)) & 0xff;
    m.mul2[i] = x2;
    m.mul3[i] = (x2 ^ x) & 0xff;
    m.mul9[i] = (x8 ^ x) & 0xff;
    m.mul11[i] = (x8 ^ x2 ^ x) & 0xff;
    m.mul13[i] = (x8 ^ x4 ^ x) & 0xff;
    m.mul14[i] = (x8 ^ x4 ^ x2) & 0xff;
  }
  return m;
})();

function expandKey128(keyBytes) {
  var nk = 4;
  var nr = 10;
  var w = [];
  for (var i = 0; i < nk; i++) w.push(keyBytes.slice(4 * i, 4 * i + 4));
  var rcon = 1;
  for (var j = nk; j < 4 * (nr + 1); j++) {
    var t = w[j - 1].slice();
    if (j % nk === 0) {
      t = [SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]];
      rcon = MUL.mul2[rcon];
    }
    w.push([w[j - nk][0] ^ t[0], w[j - nk][1] ^ t[1], w[j - nk][2] ^ t[2], w[j - nk][3] ^ t[3]]);
  }
  return { w: w, nr: nr };
}

function addRoundKey(state, ks, round) {
  for (var c = 0; c < 4; c++) {
    for (var r = 0; r < 4; r++) state[4 * c + r] ^= ks.w[round * 4 + c][r];
  }
}

function invSubBytes(state) {
  for (var i = 0; i < 16; i++) state[i] = INV_SBOX[state[i]];
}

function invShiftRows(state) {
  var t = state.slice();
  for (var r = 1; r < 4; r++) {
    for (var c = 0; c < 4; c++) {
      // 行 r 循环右移 r：s'[c][r] = s[(c - r + 4) % 4][r]
      state[4 * c + r] = t[4 * ((c - r + 4) % 4) + r];
    }
  }
}

function invMixColumns(state) {
  for (var c = 0; c < 4; c++) {
    var a0 = state[4 * c], a1 = state[4 * c + 1], a2 = state[4 * c + 2], a3 = state[4 * c + 3];
    state[4 * c] = MUL.mul14[a0] ^ MUL.mul11[a1] ^ MUL.mul13[a2] ^ MUL.mul9[a3];
    state[4 * c + 1] = MUL.mul9[a0] ^ MUL.mul14[a1] ^ MUL.mul11[a2] ^ MUL.mul13[a3];
    state[4 * c + 2] = MUL.mul13[a0] ^ MUL.mul9[a1] ^ MUL.mul14[a2] ^ MUL.mul11[a3];
    state[4 * c + 3] = MUL.mul11[a0] ^ MUL.mul13[a1] ^ MUL.mul9[a2] ^ MUL.mul14[a3];
  }
}

function decryptBlock(block, ks) {
  var state = block.slice();
  addRoundKey(state, ks, ks.nr);
  for (var round = ks.nr - 1; round >= 1; round--) {
    invShiftRows(state);
    invSubBytes(state);
    addRoundKey(state, ks, round);
    invMixColumns(state);
  }
  invShiftRows(state);
  invSubBytes(state);
  addRoundKey(state, ks, 0);
  return state;
}

function base64ToBytes(text) {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var clean = String(text == null ? '' : text).replace(/[^A-Za-z0-9+/=]/g, '');
  var out = [];
  var buffer = 0;
  var bits = 0;
  for (var i = 0; i < clean.length; i++) {
    var ch = clean.charAt(i);
    if (ch === '=') break;
    var val = alphabet.indexOf(ch);
    if (val < 0) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

function bytesToText(bytes) {
  var out = '';
  var i = 0;
  while (i < bytes.length) {
    var b = bytes[i];
    if (b < 0x80) { out += String.fromCharCode(b); i++; }
    else if (b >= 0xc0 && b < 0xe0 && i + 1 < bytes.length) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b >= 0xe0 && b < 0xf0 && i + 2 < bytes.length) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else if (b >= 0xf0 && i + 3 < bytes.length) {
      var cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      i += 4;
    } else { i++; }
  }
  return out;
}

function pureAesCbcDecrypt(base64Cipher, keyText, ivText) {
  var key = [];
  for (var i = 0; i < keyText.length; i++) key.push(keyText.charCodeAt(i) & 0xff);
  var prev = [];
  for (var j = 0; j < ivText.length; j++) prev.push(ivText.charCodeAt(j) & 0xff);
  var ks = expandKey128(key);
  var data = base64ToBytes(base64Cipher);
  var out = [];
  for (var offset = 0; offset + 16 <= data.length; offset += 16) {
    var block = data.slice(offset, offset + 16);
    var plain = decryptBlock(block, ks);
    for (var k = 0; k < 16; k++) out.push(plain[k] ^ prev[k]);
    prev = block;
  }
  var pad = out.length ? out[out.length - 1] : 0;
  if (pad > 0 && pad <= 16 && pad <= out.length) out = out.slice(0, out.length - pad);
  return bytesToText(out);
}

// 把上面这套纯 JS AES 包成 array 版本（源里 key/iv/data 都是 byte 数组）
function aesCbcDecryptBytes(keyBytes, ivBytes, dataBytes) {
  var keyText = '';
  for (var i = 0; i < keyBytes.length; i++) keyText += String.fromCharCode(keyBytes[i]);
  var ivText = '';
  for (var j = 0; j < ivBytes.length; j++) ivText += String.fromCharCode(ivBytes[j]);
  var cipherB64 = bytesToB64(dataBytes);
  var plainText = pureAesCbcDecrypt(cipherB64, keyText, ivText);
  var out = [];
  for (var k = 0; k < plainText.length; k++) out.push(plainText.charCodeAt(k) & 0xff);
  return out;
}

function b64ToBytes(text) {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var s = String(text || '').replace(/[^A-Za-z0-9+/=]/g, '');
  var out = [];
  var buffer = 0;
  var bits = 0;
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (ch === '=') break;
    var v = alphabet.indexOf(ch);
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

function bytesToB64(bytes) {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var out = '';
  for (var i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i] & 0xff;
    var b1 = i + 1 < bytes.length ? bytes[i + 1] & 0xff : -1;
    var b2 = i + 2 < bytes.length ? bytes[i + 2] & 0xff : -1;
    out += alphabet.charAt(b0 >> 2);
    out += alphabet.charAt(((b0 & 3) << 4) | (b1 < 0 ? 0 : b1 >> 4));
    out += b1 < 0 ? '=' : alphabet.charAt(((b1 & 15) << 2) | (b2 < 0 ? 0 : b2 >> 6));
    out += b2 < 0 ? '=' : alphabet.charAt(b2 & 63);
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

function asciiBytes(text) {
  var out = [];
  var s = String(text == null ? '' : text);
  for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
  return out;
}

// AES-128-CBC 解密（交给 App 原生 tools.aes：key/iv/data 都传 base64）
async function aesCbcDecrypt(keyBytes, ivBytes, dataBytes) {
  // 纯 JS 实现（不依赖 tools.aes：harness 没实现它，且 App 端也没必要多一次桥调用）
  return aesCbcDecryptBytes(keyBytes, ivBytes, dataBytes);
}

async function decryptLvdou(value) {
  var text = String(value || '');
  if (text.indexOf('lvdou+') !== 0) return text;
  try {
    var key = asciiBytes(CMS_KEY.slice(0, 16));
    var iv = asciiBytes(CMS_KEY.length >= 32 ? CMS_KEY.slice(16, 32) : CMS_KEY.slice(0, 16));
    var plain = await aesCbcDecrypt(key, iv, b64ToBytes(text.slice(6)));
    var out = utf8Decode(plain).trim();
    return /^https?:\/\//.test(out) ? out : text;
  } catch (error) {
    return text;
  }
}

async function decryptLdmax(value, depth) {
  var url = String(value || '');
  if ((depth || 0) > 5) return '';
  var m = /^https?:\/\/ldmax\.cooom\/(.+)$/i.exec(url);
  if (!m) return url;
  var path = m[1];
  if (path.length <= 16) return '';
  var keyText = path.slice(0, 16).split('').reverse().join('');
  var key = asciiBytes(keyText);
  var plain = await aesCbcDecrypt(key, key, b64ToBytes(path.slice(16)));
  var out = utf8Decode(plain).replace(/\0+$/, '').trim();
  if (/^https?:\/\/ldmax\.cooom\//i.test(out)) return await decryptLdmax(out, (depth || 0) + 1);
  return out;
}

function apiGet(path, params) {
  var query = [];
  var source = params || {};
  for (var k in source) {
    if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
    if (source[k] === '' || source[k] == null) continue;
    query.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(source[k])));
  }
  var url = base() + '/api.php/app/' + path + '?' + query.join('&');
  return LumeSource.http.get(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Encoding': 'identity' },
  }).then(function (reply) {
    var status = reply ? reply.status : 0;
    if (status !== 200) throw new Error('接口打不开：HTTP ' + status + '（' + path + '）');
    var data = null;
    try { data = JSON.parse(reply.body ? String(reply.body) : '{}'); } catch (error) { throw new Error('接口返回不是 JSON：' + path); }
    var code = data && data.code;
    if (code != null && Number(code) !== 1 && Number(code) !== 200) throw new Error('接口返回 code=' + code + '（' + path + '）');
    return data;
  });
}

function mapItem(row) {
  return {
    id: String(row.vod_id || row.vid || ''),
    title: clean(row.vod_name || row.name || ''),
    cover: String(row.vod_pic || row.pic || ''),
    subtitle: clean(row.vod_remarks || row.vod_score || ''),
  };
}

function remember(items) {
  if (!items.length) return Promise.resolve(null);
  return readJson('items.json').then(function (cached) {
    var map = (cached && cached.map) ? cached.map : {};
    for (var i = 0; i < items.length; i++) map[items[i].id] = { title: items[i].title, cover: items[i].cover };
    return writeJson('items.json', { at: Date.now(), map: map });
  });
}

// 解析接口返回的地址是 `https://baidu.con/<16位key><base64密文>`：
// key = 前 16 个字符（ASCII），iv = 同一个 key，AES-128-CBC/PKCS7
async function decryptBaiduCon(url) {
  var text = String(url || '');
  var prefix = 'https://baidu.con/';
  if (text.indexOf(prefix) !== 0) return text;
  var body = text.slice(prefix.length);
  if (body.length <= 16) return text;
  var key = asciiBytes(body.slice(0, 16));
  try {
    var plain = await aesCbcDecrypt(key, key, b64ToBytes(body.slice(16)));
    var out = utf8Decode(plain).trim();
    return /^https?:\/\//.test(out) ? out : text;
  } catch (error) {
    return text;
  }
}

// 从解析接口回包里抠真实地址
function pickUrlFromParse(body) {
  var text = String(body || '').trim();
  if (/^https?:\/\//.test(text)) return text;
  var m = /"url"\s*:\s*"([^"]+)"/.exec(text) || /"playUrl"\s*:\s*"([^"]+)"/.exec(text) || /"link"\s*:\s*"([^"]+)"/.exec(text);
  if (m) return m[1].replace(/\\\//g, '/');
  return '';
}

async function resolveMedia(rawUrl) {
  var url = String(rawUrl || '');
  if (!url) return '';
  // 站点自己的播放器也是「无条件走解析接口」，直接 mp4 有很多已失效（实测 404）
  var target = PARSE_API + encodeURIComponent(url);
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var reply = await LumeSource.http.get(target, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'identity' } });
      if (reply && reply.status === 200 && reply.body) {
        var found = await decryptBaiduCon(pickUrlFromParse(reply.body));
        if (/^https?:\/\//.test(found)) return found;
      }
    } catch (error) {
      /* 重试 */
    }
  }
  return '';
}

var LumeSource = {
  id: 'yentan4k_video',
  name: '影探4K',
  version: '1.0.0',
  category: 'video',
  mirrors: ['http://cms.lyyytv.cn'],

  async categories() {
    var cached = await readJson('nav.json');
    if (cached && Array.isArray(cached.list) && cached.list.length && Date.now() - Number(cached.at) < CACHE_TTL_MS) return cached.list;
    var data = await apiGet('nav', { token: '' });
    var list = [];
    var rows = (data && data.list) || [];
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i] || rows[i].type_id == null) continue;
      list.push({ id: String(rows[i].type_id), title: clean(rows[i].type_name || ('分类 ' + rows[i].type_id)) });
    }
    if (list.length) await writeJson('nav.json', { at: Date.now(), list: list });
    return list;
  },

  async home() {
    var data = await apiGet('index_video', { token: '' });
    var boards = [];
    var rows = (data && data.list) || [];
    for (var i = 0; i < rows.length && boards.length < 4; i++) {
      var block = rows[i];
      var items = (block && block.vlist) || [];
      if (!items.length) continue;
      var mapped = items.slice(0, 12).map(mapItem);
      await remember(mapped);
      boards.push({ title: clean(block.type_name || '推荐'), moreUrl: String(block.type_id || ''), items: mapped });
    }
    return boards;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    if (filters.class && /^\d+$/.test(String(filters.class))) categoryId = String(filters.class);
    if (!/^\d+$/.test(categoryId)) {
      var cats = await this.categories();
      categoryId = cats.length ? String(cats[0].id) : '1';
    }
    var params = { tid: categoryId, pg: String(page), limit: String(PAGE_SIZE) };
    ['class', 'area', 'lang', 'year', 'letter', 'by', 'sort'].forEach(function (key) {
      var v = filters[key];
      if (v && String(v) !== 'all') params[key] = String(v);
    });
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    var data;
    if (keyword) {
      data = await apiGet('search', { text: keyword, pg: String(page) });
    } else {
      data = await apiGet('video', params);
    }
    var rows = (data && data.list) || [];
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var mapped = mapItem(rows[i]);
      if (mapped.id) items.push(mapped);
    }
    await remember(items);
    var pagecount = Number(data && data.pagecount) || 0;
    return { items: items, hasMore: pagecount ? page < pagecount : items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var data = await apiGet('video_detail', { id: id });
    var row = (data && data.data) || {};
    return {
      id: id,
      title: clean(row.vod_name || ''),
      cover: String(row.vod_pic || ''),
      subtitle: clean([row.vod_year, row.vod_area, row.vod_remarks].filter(Boolean).join(' · ')),
      description: clean(row.vod_blurb || row.vod_content || ''),
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    var data = await apiGet('video_detail', { id: id });
    var row = (data && data.data) || {};
    var players = Array.isArray(row.vod_url_with_player) ? row.vod_url_with_player : [];
    var out = [];
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (!p || !p.url) continue;
      out.push({ id: 'p:' + i, title: clean(p.name || p.code || ('线路 ' + (i + 1))) });
    }
    if (!out.length) out.push({ id: 'p:0', title: '正片' });
    return out;
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少影片 ID');
    var data = await apiGet('video_detail', { id: id });
    var row = (data && data.data) || {};
    var players = Array.isArray(row.vod_url_with_player) ? row.vod_url_with_player : [];
    var chapterId = String(args.chapterId || 'p:0');
    var index = Number(chapterId.replace(/^p:/, '')) || 0;
    if (!players.length) throw new Error('这条没有播放线路');
    // 先试用户选的那条，再按顺序试其它线路（云盘线路经常单条失效）
    var ordered = [];
    if (players[index]) ordered.push(players[index]);
    for (var pi = 0; pi < players.length; pi++) if (pi !== index && players[pi]) ordered.push(players[pi]);
    var candidates = [];
    for (var oi = 0; oi < ordered.length; oi++) {
      var entries = String(ordered[oi].url || '').split('#');
      for (var i = 0; i < entries.length; i++) {
        var sep = entries[i].indexOf(String.fromCharCode(36));
        var raw = sep > 0 ? entries[i].slice(sep + 1) : entries[i];
        if (raw) candidates.push(raw);
      }
    }
    for (var k = 0; k < candidates.length; k++) {
      var url = await decryptLvdou(candidates[k]);
      if (/^https?:\/\/ldmax\.cooom\//i.test(url)) url = await decryptLdmax(url, 0);
      var resolved = await resolveMedia(url);
      if (resolved) return { kind: 'video', url: resolved, headers: { 'User-Agent': UA, 'Accept-Encoding': 'identity' } };
    }
    throw new Error('线路解不出播放地址（可能需要换个线路）');
  },
};
