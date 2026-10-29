// LumeSource: {"id":"porn91plus_video","name":"91PornPlus","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://www.91pornplus.com"],"network":"direct","icon":"https://www.91pornplus.com/assets/videos2/favicon_x.jpeg","settings":[{"key":"note","type":"info","title":"站点说明","description":"91PornPlus（91pornplus.com，站群模板：xchina/91zpc/porntube 等同源）。本源直接走它自己的 POST /js 接口（v2.tianmtv.com 等 8 个 API 域名，实测国内可直连），响应是 crypto-js AES(passphrase=xxx) 密文，源里内联纯 JS MD5+AES-256-CBC 解密。列表 12 个栏目、搜索 /searchSevenVideos（按时间/播放排序）、详情页直接给 m3u8；匿名即可播，不需要登录。注意：网页本体（www.91pornplus.com）在国内被 RST，只有接口和播放 CDN 可用，所以「打开站点」可能打不开，不影响本源的列表与播放。"}]}
// LumeRuntime: javascript
//
// 站点：91PornPlus（https://www.91pornplus.com）—— Angular/Ionic 的「站群模板」
//   （xchina.tube / 91zpc.* / porntube.* / chineseselfie.* 等同一套代码，app 字段区分租户）。
//
// 一、可达性（2026-10-29 实测）
//   网页 www.91pornplus.com：国内直连 RST，经代理 200（SPA 外壳，无数据）。
//   API  https://v2.<域名>/js：8 个域名（tianmtv / cdn199 / papapa / kekecdn / luchu /
//       madou / xiaoshuo.info / xiaoshuo.la）国内直连全部 200，几百毫秒 → network:"direct"。
//   播放 tm.pppsuccess.com、封面 tp.pppsuccess.com：直连 200，不要 Referer。
//
// 二、协议（不是 REST，是「单入口 + 加密响应」）
//   POST <apiHost>/js  JSON：
//     { app:"91pornplus.com", isStandalone:false, theLink:"…", uuid:"U" + 年月日时分秒 + 4 位,
//       url:"<路径>", version:"260901", deviceInfo:{…}, ...额外字段 }
//   **必须带 Origin 或 Referer**（都缺 → 403 {"blocked":true}）；theLink 非空、uuid 必须
//   形如 U202610292109444095（实测只校验格式，任意时间都收）。
//   响应 {"r":"U2FsdGVkX1…"} = crypto-js AES.decrypt(r, "xxx")：OpenSSL「Salted__」格式，
//   key/iv 由 EVP_BytesToKey(MD5) 派生，AES-256-CBC + PKCS7 → JSON。
//   已在 Node 侧用同一份密文逐字节比对过纯 JS 实现（见 setCrypto 注释）。
//
// 三、接口
//   栏目   /sevenVideos?page=<N>&type=<栏目>   返回数组（每页 8/12/24 条，翻到底返回 []）
//   搜索   /searchSevenVideos  {page, keywords, sortBy:"time"|"views"}
//   详情   /sevenVideos/<id>   {url_search:"?server=default1"} → 含 m3u8s[0]
//          不存在的 id 返回 410 {"message":"不存在"}；播放页是 /video/<id>
//
// 四、播放
//   详情里的 m3u8s[0]（示例 `https://tm.pppsuccess.com/<token>,<ts>/<_id>/index.m3u8`）匿名可取，
//   实测直连 200 + #EXTM3U（Content-Type 是 application/octet-stream，不影响探活）。
//   令牌带时间戳，所以每次播放都现取详情页，不缓存 m3u8。

var API_HOSTS = [
  'https://v2.tianmtv.com',
  'https://v2.cdn199.com',
  'https://v2.papapa.biz',
  'https://v2.kekecdn.net',
  'https://v2.luchu.org',
  'https://v2.madou.ws',
  'https://v2.xiaoshuo.info',
  'https://v2.xiaoshuo.la'
];
var SITE = 'https://www.91pornplus.com';
var APP = '91pornplus.com';
var PASS = 'xxx';
var VERSION = '260901';
var THE_LINK = 'https://rs.pppsuccess.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 栏目：type 取自站点首页/分类页的栏目 id（2026-10-29 实测每个都出内容）
var CATS = [
  { id: 'home_recent', title: '最新' },
  { id: 'home_hot', title: '热播' },
  { id: 'home_91_8', title: '91精选' },
  { id: 'home_hot_8', title: '国产自拍' },
  { id: 'home_vip_8', title: '国产视频（VIP）' },
  { id: 'home_japan_8', title: '日本AV' },
  { id: 'home_west_8', title: '欧美风尚' },
  { id: 'home_pissvids_8', title: '欧美（VIP）' },
  { id: 'home_swag_8', title: '台湾SWAG全集' },
  { id: 'home_banana_8', title: '汝工作室' },
  { id: 'home_torture_8', title: '重口系列' },
  { id: 'home_high_8', title: '站长推荐' }
];

// ------------------------------------------------------------------ 纯 JS 加密件
// 沙箱没有 atob / Buffer / crypto，这里自带 Base64、MD5、AES-256-CBC。
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
  var m = { mul2: [], mul9: [], mul11: [], mul13: [], mul14: [] };
  for (var i = 0; i < 256; i++) {
    var x = i;
    var x2 = ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;
    var x4 = ((x2 << 1) ^ (x2 & 0x80 ? 0x1b : 0)) & 0xff;
    var x8 = ((x4 << 1) ^ (x4 & 0x80 ? 0x1b : 0)) & 0xff;
    m.mul2[i] = x2;
    m.mul9[i] = (x8 ^ x) & 0xff;
    m.mul11[i] = (x8 ^ x2 ^ x) & 0xff;
    m.mul13[i] = (x8 ^ x4 ^ x) & 0xff;
    m.mul14[i] = (x8 ^ x4 ^ x2) & 0xff;
  }
  return m;
})();

function expandKey(keyBytes) {
  var nk = keyBytes.length / 4;
  var nr = nk + 6;
  var w = [];
  var i;
  for (i = 0; i < nk; i++) w.push(keyBytes.slice(4 * i, 4 * i + 4));
  var rcon = 1;
  for (var j = nk; j < 4 * (nr + 1); j++) {
    var t = w[j - 1].slice();
    if (j % nk === 0) {
      t = [SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]];
      rcon = MUL.mul2[rcon];
    } else if (nk > 6 && j % nk === 4) {
      t = [SBOX[t[0]], SBOX[t[1]], SBOX[t[2]], SBOX[t[3]]];
    }
    w.push([w[j - nk][0] ^ t[0], w[j - nk][1] ^ t[1], w[j - nk][2] ^ t[2], w[j - nk][3] ^ t[3]]);
  }
  return { w: w, nr: nr };
}

function addRoundKey(state, ks, round) {
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) state[4 * c + r] ^= ks.w[round * 4 + c][r];
}

function invSubBytes(state) {
  for (var i = 0; i < 16; i++) state[i] = INV_SBOX[state[i]];
}

function invShiftRows(state) {
  var t = state.slice();
  for (var r = 1; r < 4; r++) for (var c = 0; c < 4; c++) state[4 * c + r] = t[4 * ((c - r + 4) % 4) + r];
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

var MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
var MD5_K = (function () {
  var k = [];
  for (var i = 0; i < 64; i++) k.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
  return k;
})();

function md5Bytes(bytes) {
  var msg = [];
  for (var m = 0; m < bytes.length; m++) msg.push(bytes[m] & 0xff);
  var bitLen = bytes.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  for (var i = 0; i < 8; i++) msg.push(Math.floor(bitLen / Math.pow(2, 8 * i)) & 0xff);
  var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  var M = new Array(16);
  for (var off = 0; off < msg.length; off += 64) {
    for (var j = 0; j < 16; j++) {
      M[j] = (msg[off + 4 * j] | (msg[off + 4 * j + 1] << 8) | (msg[off + 4 * j + 2] << 16) | (msg[off + 4 * j + 3] << 24)) >>> 0;
    }
    var A = a0, B = b0, C = c0, D = d0;
    for (var n = 0; n < 64; n++) {
      var F, g;
      if (n < 16) { F = (B & C) | (~B & D); g = n; }
      else if (n < 32) { F = (D & B) | (~D & C); g = (5 * n + 1) % 16; }
      else if (n < 48) { F = B ^ C ^ D; g = (3 * n + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * n) % 16; }
      var tmp = D;
      D = C;
      C = B;
      var sum = (A + F + MD5_K[n] + M[g]) >>> 0;
      var sh = MD5_S[n];
      B = (B + (((sum << sh) | (sum >>> (32 - sh))) >>> 0)) >>> 0;
      A = tmp;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  var out = [];
  [a0, b0, c0, d0].forEach(function (v) {
    for (var k = 0; k < 4; k++) out.push((v >>> (8 * k)) & 0xff);
  });
  return out;
}

var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(text) {
  var clean = String(text == null ? '' : text).replace(/[^A-Za-z0-9+/=]/g, '');
  var out = [];
  var buffer = 0, bits = 0;
  for (var i = 0; i < clean.length; i++) {
    var ch = clean.charAt(i);
    if (ch === '=') break;
    var val = B64.indexOf(ch);
    if (val < 0) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buffer >> bits) & 0xff); }
  }
  return out;
}

function utf8ToBytes(text) {
  var out = [];
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      var cp = 0x10000 + ((c - 0xd800) << 10) + (text.charCodeAt(++i) - 0xdc00);
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
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
    } else {
      i++;
    }
  }
  return out;
}

/// crypto-js AES.decrypt(base64, "xxx") 的等价实现：
///   "Salted__" + 8 字节 salt + 密文；key/iv 由 EVP_BytesToKey(MD5) 派生，AES-256-CBC + PKCS7。
/// 已用同一份线上密文与 Node crypto 的结果逐字节比对（2026-10-29）。
function decryptPayload(cipherBase64, passphrase) {
  var data = base64ToBytes(cipherBase64);
  if (data.length < 32) throw new Error('密文过短');
  var head = '';
  for (var i = 0; i < 8; i++) head += String.fromCharCode(data[i]);
  if (head !== 'Salted__') throw new Error('密文头不是 Salted__');
  var salt = data.slice(8, 16);
  var body = data.slice(16);
  var pass = utf8ToBytes(passphrase);
  var derived = [];
  var prev = [];
  while (derived.length < 48) {
    prev = md5Bytes(prev.concat(pass, salt));
    derived = derived.concat(prev);
  }
  var ks = expandKey(derived.slice(0, 32));
  var iv = derived.slice(32, 48);
  var out = [];
  var prevBlock = iv;
  for (var off = 0; off + 16 <= body.length; off += 16) {
    var block = body.slice(off, off + 16);
    var plain = decryptBlock(block, ks);
    for (var k = 0; k < 16; k++) out.push(plain[k] ^ prevBlock[k]);
    prevBlock = block;
  }
  var pad = out.length ? out[out.length - 1] : 0;
  if (pad > 0 && pad <= 16 && pad <= out.length) out = out.slice(0, out.length - pad);
  return bytesToText(out);
}

// ------------------------------------------------------------------ 接口层
function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/// 站点的设备号：U + YYYYMMDD + HHMMSS + 4 位随机；接口只校验这个形状。
function deviceUuid() {
  var d = new Date();
  var tail = ('0000' + Math.floor(Math.random() * 10000)).slice(-4);
  return 'U' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
    + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) + tail;
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

async function hostOrder() {
  var cached = await readJson('api.json');
  var first = cached && cached.host ? String(cached.host) : API_HOSTS[0];
  var out = [first];
  for (var i = 0; i < API_HOSTS.length; i++) {
    if (API_HOSTS[i] !== first) out.push(API_HOSTS[i]);
  }
  return out;
}

function headers() {
  return {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Content-Type': 'application/json',
    // 二者缺一都会 403 {"blocked":true}；只发一个也够，这里都带上
    Origin: SITE,
    Referer: SITE + '/'
  };
}

async function postJs(host, path, extra) {
  var body = {
    deviceInfo: { model: 'Windows NT 10.0', platform: 'web', operatingSystem: 'windows', isVirtual: false },
    app: APP,
    isStandalone: false,
    theLink: THE_LINK,
    uuid: deviceUuid(),
    url: path,
    version: VERSION
  };
  if (extra) for (var k in extra) body[k] = extra[k];
  var reply = await LumeSource.http.post(host + '/js', JSON.stringify(body), { headers: headers() });
  var status = Number((reply && reply.status) || 0);
  if (!status) throw new Error('连不上 ' + host);
  var text = String((reply && reply.body) || '');
  if (status !== 200) throw new Error('接口 HTTP ' + status + '：' + text.slice(0, 120));
  var json = null;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error('接口返回不是 JSON：' + text.slice(0, 120));
  }
  if (json && json.blocked) throw new Error('站点拒绝了请求（blocked）——可能被限流，稍后再试');
  if (!json || !json.r) throw new Error('接口没有返回密文字段 r');
  var plain = null;
  try {
    plain = decryptPayload(json.r, PASS);
  } catch (error) {
    throw new Error('密文解不开（站点换口令了？）：' + error);
  }
  try {
    return JSON.parse(plain);
  } catch (error) {
    throw new Error('解出来的不是 JSON：' + plain.slice(0, 120));
  }
}

/// 先试上次成功的域名，失败再换一个：站点八个 API 域名是同一套后端。
async function api(path, extra) {
  var hosts = await hostOrder();
  var lastError = null;
  for (var i = 0; i < hosts.length && i < 2; i++) {
    try {
      var data = await postJs(hosts[i], path, extra);
      await writeJson('api.json', { host: hosts[i] });
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('接口请求失败');
}

function itemOf(row) {
  if (!row || !row.id) return null;
  var cover = '';
  if (row.thumbnails && row.thumbnails.length) cover = String(row.thumbnails[0]);
  else if (row.thumbNails && row.thumbNails.length) cover = String(row.thumbNails[0]);
  var bits = [];
  if (row.durationStr) bits.push(String(row.durationStr));
  if (row.views) bits.push(Number(row.views) + ' 播放');
  if (row.user) bits.push(String(row.user));
  return {
    id: String(row.id),
    title: String(row.title || row.title_en || row.id),
    cover: cover || null,
    subtitle: bits.join(' · ')
  };
}

var LumeSource = {
  id: 'porn91plus_video',
  name: '91PornPlus',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://www.91pornplus.com'],

  async home() {
    // 两个板块并发取，省一半时间（单次调用预算 3–5 秒）
    var both = await Promise.all([
      api('/sevenVideos?page=1&type=home_recent').catch(function (error) {
        console.warn('[91pornplus] 最新 抓取失败：' + error);
        return null;
      }),
      api('/sevenVideos?page=1&type=home_91_8').catch(function (error) {
        console.warn('[91pornplus] 91精选 抓取失败：' + error);
        return null;
      })
    ]);
    var plan = [
      { title: '最新', moreUrl: 'home_recent', rows: both[0] },
      { title: '91精选', moreUrl: 'home_91_8', rows: both[1] }
    ];
    var sections = [];
    for (var s = 0; s < plan.length; s++) {
      var items = [];
      var rows = plan[s].rows || [];
      for (var i = 0; i < rows.length; i++) {
        var one = itemOf(rows[i]);
        if (one) items.push(one);
      }
      if (items.length) sections.push({ title: plan[s].title, moreUrl: plan[s].moreUrl, items: items.slice(0, 24) });
    }
    if (!sections.length) throw new Error('91PornPlus：首页没有数据（接口可能改版）');
    return sections;
  },

  async categories() {
    return CATS.slice(0);
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    // 站点只给搜索提供了排序（sortBy），栏目流没有排序参数，所以这里不声明 filters
    var sort = 'time';

    var rows;
    if (keyword) {
      rows = await api('/searchSevenVideos', { page: page, keywords: keyword, sortBy: sort });
    } else {
      var type = categoryId || 'home_91_8';
      if (!/^home_[a-z0-9_]+$/.test(type)) {
        throw new Error('91PornPlus：认不出这个栏目（' + type + '）——请从分类列表里选');
      }
      rows = await api('/sevenVideos?page=' + page + '&type=' + encodeURIComponent(type));
    }
    var list = Array.isArray(rows) ? rows : [];
    var items = [];
    for (var i = 0; i < list.length; i++) {
      var one = itemOf(list[i]);
      if (one) items.push(one);
    }
    if (!items.length) console.warn('[91pornplus] 这一页没有条目：' + (keyword || categoryId) + ' p' + page);
    return { items: items, hasMore: items.length > 0 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id) return null;
    var row = null;
    try {
      row = await api('/sevenVideos/' + encodeURIComponent(id), { url_search: '?server=default1' });
    } catch (error) {
      // 下架/不存在时站点回 410，把它当「找不到」而不是报错
      if (/HTTP 410/.test(String(error))) return null;
      throw error;
    }
    if (!row || !row.id) return null;
    var bits = [];
    if (row.durationStr) bits.push(String(row.durationStr));
    if (row.views) bits.push(Number(row.views) + ' 播放');
    if (row.user) bits.push(String(row.user));
    var lines = [];
    if (row.keywords_gem) lines.push('标签：' + String(row.keywords_gem));
    if (row.size) lines.push('大小：' + String(row.size));
    if (row.time) lines.push('发布：' + String(row.time));
    lines.push('源站：' + SITE + '/video/' + id);
    var cover = '';
    if (row.thumbnails && row.thumbnails.length) cover = String(row.thumbnails[0]);
    return {
      id: id,
      title: String(row.title || row.title_en || id),
      cover: cover || null,
      subtitle: bits.join(' · '),
      description: lines.join('\n')
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
    if (!id) throw new Error('91PornPlus：缺少视频 id');
    var row = await api('/sevenVideos/' + encodeURIComponent(id), { url_search: '?server=default1' });
    var url = '';
    if (row && row.m3u8s && row.m3u8s.length) url = String(row.m3u8s[0]);
    if (!url && row && row.m3u8) url = String(row.m3u8);
    if (!url) {
      return { kind: 'webplayer', pageUrl: SITE + '/video/' + id, headers: { 'User-Agent': UA, Referer: SITE + '/' } };
    }
    return {
      kind: 'video',
      url: url,
      headers: { 'User-Agent': UA, Referer: SITE + '/' }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
