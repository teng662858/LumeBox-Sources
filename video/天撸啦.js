// LumeSource: {"id":"tianlula_video","name":"天撸啦","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://ttbd067.top:51000"],"network":"direct"}
// LumeRuntime: javascript
//
// 站点：天撸啦（https://ttbd067.top:51000，tianlula.tv）—— 综合站，本源只做**视频**（精品视频 37 + 电影频道 1）。
// 图集与小说另开两个源，对应各自板块：photo/tianlula.js（美图）、comic/tianlula-novel.js（小说）。
//
// 站点接口（全部走 /res?s=Api-xxx，返回体里的 list / data 是 **AES-128-CBC 密文**）：
//   key = bfd7257d9bee742c（ASCII 16 字节）   iv = 506ecf5490eeb552
//   密文 base64 → AES-128-CBC(PKCS7) → JSON。沙箱没有 crypto / atob，
//   所以本源内联了一份纯 JS 的 AES-128-CBC 解密（FIPS-197 向量 + 站点真实密文双向核对过）。
//   · Api-list_all                      分类树（顶层 4 类，子分类在 children 里）
//   · Api-vod_list&cid&limit&page       视频列表（无 cid 时 total = 284,145）
//   · Api-vod_search&wd&limit&page      视频搜索（例：探花 → 7,718 条）
//   · Api-vod_detail&id                 视频详情，vod_url 就是 m3u8（如 m2.kdamao.com/hls/…/index.m3u8）
// 18+

// 纯 JS AES-128-CBC 解密（沙箱没有 crypto / atob，必须自己实现）
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

function aesCbcDecrypt(base64Cipher, keyText, ivText) {
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
// ---------------------------------------------------------------- 站点接口（密文）

var BASE = 'https://ttbd067.top:51000';
var KEY_TEXT = 'bfd7257d9bee742c';
var IV_TEXT = '506ecf5490eeb552';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PAGE_SIZE = 20;
var NAV_TTL_MS = 6 * 3600 * 1000;
var DETAIL_TTL_MS = 10 * 60 * 1000;

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return (domain || BASE).replace(/\/+$/, '');
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

// /res?s=Api-xxx：返回体里的 list / data 是 AES-128-CBC 密文，解出来才是 JSON
async function api(action, params) {
  var query = 'Api-' + action + (params ? '&' + params : '');
  var reply = await LumeSource.http.get(base() + '/res?s=' + query, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: base() + '/home',
    },
  });
  var status = reply ? reply.status : 0;
  if (status !== 200) throw new Error('接口打不开：HTTP ' + status + '（' + query + '）');
  var json = null;
  try {
    json = JSON.parse(reply.body ? String(reply.body) : '');
  } catch (error) {
    throw new Error('接口返回不是 JSON：' + query);
  }
  if (json.code !== 1) throw new Error('接口返回 code=' + json.code + '（' + query + '）');
  var raw = typeof json.list === 'string' ? json.list : (typeof json.data === 'string' ? json.data : '');
  var data = null;
  if (raw) {
    try {
      data = JSON.parse(aesCbcDecrypt(raw, KEY_TEXT, IV_TEXT));
    } catch (error) {
      throw new Error('密文解不开（站点换 key 了？）：' + query);
    }
  } else if (json.data && typeof json.data === 'object') {
    data = json.data;
  }
  return { meta: json, data: data };
}

// 顶层 4 类（精品视频 37 / 电影频道 1 / 小说专区 2 / 成人图片 3），子分类在 children 里
async function categoryTree() {
  var cached = await readJson('nav.json');
  if (cached && Array.isArray(cached.rows) && cached.rows.length && Date.now() - Number(cached.at) < NAV_TTL_MS) {
    return cached.rows;
  }
  var result = await api('list_all');
  var rows = Array.isArray(result.data) ? result.data : [];
  if (rows.length) await writeJson('nav.json', { at: Date.now(), rows: rows });
  return rows;
}

function subCategories(rows, topId) {
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].list_id) !== String(topId)) continue;
    var children = Array.isArray(rows[i].children) ? rows[i].children : [];
    for (var j = 0; j < children.length; j++) {
      out.push({
        id: String(children[j].list_id),
        title: String(children[j].list_name || ('分类 ' + children[j].list_id)),
      });
    }
  }
  return out;
}

function hasMoreOf(meta, page) {
  var total = Number(meta && meta.total ? meta.total : 0);
  var limit = Number(meta && meta.limit ? meta.limit : PAGE_SIZE);
  if (!total) return false;
  return page * limit < total;
}

function clean(text) {
  return String(text == null ? '' : text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mapVod(row) {
  return {
    id: String(row.vod_id || ''),
    title: String(row.vod_name || ''),
    cover: String(row.vod_pic || ''),
    subtitle: '',
  };
}

async function detailData(id) {
  var key = 'c-' + id + '.json';
  var cached = await readJson(key);
  if (cached && cached.at && Date.now() - Number(cached.at) < DETAIL_TTL_MS) return cached;
  var result = await api('vod_detail', 'id=' + id);
  var row = result.data || {};
  var data = {
    at: Date.now(),
    title: String(row.vod_name || ''),
    cover: String(row.vod_pic || ''),
    url: String(row.vod_url || ''),
    gold: String(row.vod_gold || ''),
    hits: String(row.vod_hits || ''),
    playFrom: String(row.vod_play || ''),
  };
  if (data.title) await writeJson(key, data);
  return data;
}

var LumeSource = {
  id: 'tianlula_video',
  name: '天撸啦',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://ttbd067.top:51000'],
  async categories() {
    var list = [{ id: 'all', title: '最新' }];
    try {
      var rows = await categoryTree();
      var subs = subCategories(rows, '37').concat(subCategories(rows, '1'));
      for (var i = 0; i < subs.length; i++) list.push({ id: 'cid:' + subs[i].id, title: subs[i].title });
    } catch (error) {
      /* 分类拿不到时只留最新 */
    }
    return list;
  },

  async home() {
    var boards = [];
    try {
      var latest = await api('vod_list', 'limit=12&page=1');
      if (latest.data && latest.data.length) boards.push({ title: '最新', moreUrl: 'all', items: latest.data.map(mapVod) });
    } catch (error) {
      /* 忽略 */
    }
    try {
      var rows = await categoryTree();
      var subs = subCategories(rows, '37').slice(0, 3);
      for (var i = 0; i < subs.length; i++) {
        var block = await api('vod_list', 'cid=' + subs[i].id + '&limit=12&page=1');
        if (block.data && block.data.length) boards.push({ title: subs[i].title, moreUrl: 'cid:' + subs[i].id, items: block.data.map(mapVod) });
      }
    } catch (error) {
      /* 忽略 */
    }
    return boards;
  },

  async filters() {
    var options = [];
    try {
      var rows = await categoryTree();
      var subs = subCategories(rows, '37').concat(subCategories(rows, '1'));
      for (var i = 0; i < subs.length; i++) options.push({ id: subs[i].id, title: subs[i].title });
    } catch (error) {
      /* 空筛选即可 */
    }
    return { groups: [{ id: 'category', title: '分类', options: options }] };
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    if (filters.category) categoryId = 'cid:' + String(filters.category).trim();

    var result;
    if (keyword) result = await api('vod_search', 'wd=' + encodeURIComponent(keyword) + '&limit=' + PAGE_SIZE + '&page=' + page);
    else if (/^cid:/.test(categoryId)) result = await api('vod_list', 'cid=' + categoryId.slice(4) + '&limit=' + PAGE_SIZE + '&page=' + page);
    else result = await api('vod_list', 'limit=' + PAGE_SIZE + '&page=' + page);

    var rows = Array.isArray(result.data) ? result.data : [];
    return { items: rows.map(mapVod), hasMore: hasMoreOf(result.meta, page) };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var data = await detailData(id);
    if (!data || !data.title) return null;
    var bits = [];
    if (data.gold) bits.push('金豆 ' + data.gold);
    if (data.hits) bits.push(data.hits + ' 次播放');
    bits.push(data.url ? 'HLS 直连' : '无播放地址');
    return {
      id: id,
      title: data.title,
      cover: data.cover,
      subtitle: bits.join(' · '),
      description: '源站：' + base() + '/res?s=Api-vod_detail&id=' + id + (data.url ? '\n播放地址：' + data.url : ''),
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'video:' + id, title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少视频 ID');
    var data = await detailData(id);
    if (!data || !data.url) throw new Error('这条没有播放地址（源站可能已下架）');
    return { kind: 'video', url: data.url, headers: { Referer: base() + '/', 'User-Agent': UA } };
  },
};
