// LumeSource: {"id":"cf2_video","name":"Butterfly 18+","version":"1.0.1","category":"video","mirrors":["https://d1q6v0m0fmxvl0.cloudfront.net","https://d2m0k739byzwun.cloudfront.net","https://d1w3p997s8acw6.cloudfront.net"]}
//
// ════════════════════════════════════════════════════════════════════════════
// 一、先回答「d1q6v0m0fmxvl0.cloudfront.net 是不是就是 hstv.js 那套」
// ════════════════════════════════════════════════════════════════════════════
// **同一个前端代码库（同一份 App 壳），但不是同一个部署**，所以 mirrors 合并不成立。
// 逐项比对（2026-10-25 实测，两条结论性证据在最后两行）：
//
//   ┌──────────────┬──────────────────────────┬──────────────────────────────┐
//   │              │ hstv.js（d1nu1x3tadacmt…）│ 本源（d1q6v0m0fmxvl0…）        │
//   ├──────────────┼──────────────────────────┼──────────────────────────────┤
//   │ 前端         │ Vue3 + Vite /js/main-…   │ 同（main-b390b52c.…js）       │
//   │ 应用壳       │ BuildID=com.abc.Butterfly│ 同（User-Agent 里自报）        │
//   │ 响应加密     │ interfaceKey → SHA256 拼 │ 同算法（faDecrypt 逐行一致）   │
//   │              │ AES-256-CBC + {"hash":1} │                              │
//   │ interfaceKey │ 65dc07d1b7915c6b2937432b091837a7 │ **0a958fb9ac062420af6ba5f4caad779f** │
//   │ 请求加密     │ 明文 JSON，无信封         │ **POST/GET 都要 {data: AES-128-CBC(…)}** │
//   │              │                          │ parameterKey/IV = BxJand%xf5h3sycH │
//   │ 接口主机     │ d30zcqlpvg6j0s / d3ea5bf3mxqaxz / haoasd.rlkfus.cn │ **d2m0k739byzwun / d1w3p997s8acw6 / lidhgjxsh3kc** │
//   │ 内容接口     │ /vid/recommend/list、/search/hotVid/list、/video/play │ **/vid/list、/tag/conf/list、/search/list**（recommend 与 hotVid 在这台上一律空）│
//   │ imgKey       │ （hstv 用不到）          │ 2019ysapp7527                 │
//   └──────────────┴──────────────────────────┴──────────────────────────────┘
//
//   ⇒ 决定性证据 ①：对 d1q6v0m0fmxvl0 的 GET /api/app/ping/check 回的密文，
//      用 hstv 的 interfaceKey（65dc07d1…）解 → `bad decrypt`（必失败）；
//      用 0a958fb9… 解 → 明文 {"response":"pong"}。两把 key 互不通用。
//   ⇒ 决定性证据 ②：这台部署的 POST 必须带 {data: base64(AES-128-CBC(payload, "BxJand%xf5h3sycH"))}
//      信封；hstv 那套发的是明文 JSON —— hstv.js 的代码路径到这台机器上直接 4001。
//   另外：登录接口强制校验 User-Agent 里的 `BuildID=com.abc.Butterfly;SysType=…;DevID=…;
//   Ver=…;DevType=…;Terminal=2;IsH5=1`，用浏览器 UA 打 /mine/login/h5 一律 4001 parameters error。
//   所以本源是**独立脚本**，不是 hstv 的 mirror。
//
// ════════════════════════════════════════════════════════════════════════════
// 二、接口（前缀 /api/app；全部实测 200）
// ════════════════════════════════════════════════════════════════════════════
//   GET  /ping/check                                探活（响应加密，解出 {"response":"pong"}）
//   GET  /ping/domain/h5                            站点配置：VID 线路（视频 CDN）等
//   POST /mine/login/h5   {devID,sysType,cutInfos,isAppStore}   **匿名设备登录 → JWT**
//        · 不需要注册、不需要手机号；cutInfos 必须是**空串**（传 [] 会 4001）
//        · devID 是 32 位十六进制，换一个等于换一个游客号
//        · token 用法：Authorization: <JWT>（原样，不加 Bearer）
//   GET  /vid/list?pageNumber&pageSize[&tag=<tagId>]  内容列表（pageNumber 从 1 起，回 hasNext）
//   GET  /tag/conf/list                            标签表（50 个，本源拿来做分类）
//   POST /search/list {pageNumber,pageSize,keyWords:[词],realm:"SP",sortType:7}   站内搜索
//   GET  /vid/info?videoID=<24位hex>               详情（sourceURL/coins/freeTime/resolution…）
//   GET  /vid/h5/m3u8/<sourceURL>?token=<JWT>      **播放列表代理**（见第三节）
//   GET  /vid/sec                                  播放列表里的 AES-128 密钥端点（不带 token 也 200，16 字节）
//
// ════════════════════════════════════════════════════════════════════════════
// 三、播放地址（这台部署比 hstv 简单：内容基本是免费的）
// ════════════════════════════════════════════════════════════════════════════
//   ① /vid/list 与 /vid/info 直接给 `sourceURL`（如 bktadminup/sp/35/6e/0a/jk/xxxx.m3u8），
//      以及 coins（金币价）/ freeTime（试看秒数）。实测第一页条目 coins=0、freeTime=0 —— 免费整片。
//   ② 直连 CDN（https://mp4.pjrwfe.cn/<sourceURL>）虽然 200，但播放列表里的密钥 URI 是
//      占位串 `http://domain/enc.key`，播放器取不到 key，解不出分片 ⇒ 不能直接用。
//      （https://sjljsla.lkkwip.cn/<sourceURL> 与 rs2sts 直连一律 403，要签名。）
//   ③ 唯一正确路径是站内代理：`<base>/api/app/vid/h5/m3u8/<sourceURL>?token=<JWT>`
//      → 200 + #EXTM3U，且把密钥 URI 重写成站内的 `/api/app/vid/sec`（该端点回 16 字节密钥），
//      分片是**带签名**（md=时间戳-hash，约 10 分钟有效）的绝对地址，实测 .ts 200 / 1.7MB。
//      所以每次播放前重新取一次 sourceURL + 现取 token 即可。
//   ④ 匿名登录是唯一的门槛（拿 token 才 200，不带 token 是 {"code":5005,"msg":"no token"}），
//      而匿名登录不要账号不要验证码 —— 这就是「无账号可用」的实质。
//
// ════════════════════════════════════════════════════════════════════════════
// 四、VIP / 付费结论
// ════════════════════════════════════════════════════════════════════════════
//   · 列表页 20 条里 coins 字段实测为 0 的占多数（第一条 79 次播放、0 金币、freeTime=0），
//     这类条目匿名身份直接拿整条播放列表，不需要金币、不需要 VIP。
//   · 站点的收银台（/vip/product、/mine/topay、/product/buy）仍在，但公开内容不锁。
//   · 有没有「试看片段截断」？抽了 /vid/list 首页若干条：sourceURL 直接给整片列表，
//     播放列表分片数与 /vid/info 的 playTime/size 相符（未出现 30 秒截断）。
//     若以后出现 coins>0 的条目，本源会照常返回地址并把它在详情里标成「金币 N / 试看 N 秒」，
//     不伪造「已解锁」。
//
// ════════════════════════════════════════════════════════════════════════════
// 五、分类与内容过滤
// ════════════════════════════════════════════════════════════════════════════
//   分类 = /tag/conf/list 的标签表（50 个），list() 用 `tag=<tagId>` 过滤（实测有效：
//   换 tag 返回的 id 集合不同；注意参数名是 `tag`，不是 tagId）。
//   ⚠ 不做涉未成年内容：标签里的「萝莉少女」等已剔除，并对标题命中
//     萝莉/幼齿/学生/loli/未成年 等词的条目做过滤（见 __blocked）。
//
var DEFAULT_BASES = [
  'https://d2m0k739byzwun.cloudfront.net',
  'https://d1w3p997s8acw6.cloudfront.net'
];
// 页面域（CloudFront 静态托管）：**不是接口主机** —— 往它 POST /api/app/* 一律 405。
// 用户「换网址」/ 镜像下标 0 可能把它写进 config.customDomain，那样连登录都发不出去，
// 所以候选表里要把这类主机剔掉（曾经的报错：`接口打不开：HTTP 405 /mine/login/h5`）。
var PAGE_HOSTS = ['https://d1q6v0m0fmxvl0.cloudfront.net'];
var INTERFACE_KEY = '0a958fb9ac062420af6ba5f4caad779f';
var PARAM_KEY = 'BxJand%xf5h3sycH';
var IMAGE_HOST = 'https://zzzznnn.lkkwip.cn';
var PAGE_SIZE = 15;
var DEVICE_ID = 'a1b2c3d4e5f64a1b9c8d7e6f5a4b3c2d';
var APP_UA =
  'BuildID=com.abc.Butterfly;SysType=ios;DevID=' + DEVICE_ID + ';Ver=1.0.0;DevType=iPhone;Terminal=2;IsH5=1';

var BLOCKED_WORDS = /萝莉|蘿莉|幼齿|幼齒|学生|學生|校园|校服|loli|shota|未成年|正太|小学|初中|高中/i;
var BLOCKED_TAGS = /萝莉|蘿莉|幼齿|幼齒|学生|學生|校园|校服|loli|未成年|正太/i;

/* ══════════════════════════ 纯 JS 基础工具（沙箱无 crypto / atob / Buffer） ══════════════════════════ */

var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64ToBytes(text) {
  var source = String(text == null ? '' : text).replace(/[^A-Za-z0-9+/=]/g, '');
  var out = [];
  var buffer = 0;
  var bits = 0;
  for (var index = 0; index < source.length; index++) {
    var ch = source.charAt(index);
    if (ch === '=') break;
    var value = B64_CHARS.indexOf(ch);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

function bytesToB64(bytes) {
  var out = '';
  var index = 0;
  while (index < bytes.length) {
    var b0 = bytes[index++] & 0xff;
    var b1 = index < bytes.length ? bytes[index++] & 0xff : -1;
    var b2 = index < bytes.length ? bytes[index++] & 0xff : -1;
    out += B64_CHARS.charAt(b0 >> 2);
    out += B64_CHARS.charAt(((b0 & 0x03) << 4) | (b1 < 0 ? 0 : b1 >> 4));
    out += b1 < 0 ? '=' : B64_CHARS.charAt(((b1 & 0x0f) << 2) | (b2 < 0 ? 0 : b2 >> 6));
    out += b2 < 0 ? '=' : B64_CHARS.charAt(b2 & 0x3f);
  }
  return out;
}

function utf8Bytes(text) {
  var out = [];
  var source = String(text == null ? '' : text);
  for (var index = 0; index < source.length; index++) {
    var code = source.charCodeAt(index);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < source.length) {
      var low = source.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        index++;
        var point = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        out.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 0x3f), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
        continue;
      }
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return out;
}

function utf8Decode(bytes) {
  var out = '';
  var index = 0;
  while (index < bytes.length) {
    var first = bytes[index++];
    if (first < 0x80) {
      out += String.fromCharCode(first);
      continue;
    }
    var extra = 0;
    var code = 0;
    if (first >= 0xc0 && first < 0xe0) {
      code = first & 0x1f;
      extra = 1;
    } else if (first >= 0xe0 && first < 0xf0) {
      code = first & 0x0f;
      extra = 2;
    } else if (first >= 0xf0) {
      code = first & 0x07;
      extra = 3;
    } else {
      out += String.fromCharCode(first);
      continue;
    }
    for (var step = 0; step < extra; step++) code = (code << 6) | ((bytes[index + step] || 0) & 0x3f);
    index += extra;
    if (code > 0xffff) {
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

/* ───────────────────────── SHA-256（响应解密要用） ───────────────────────── */
var SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function rotr32(value, bits) {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function sha256Bytes(bytes) {
  var data = bytes.slice();
  var bitLength = data.length * 8;
  data.push(0x80);
  while (data.length % 64 !== 56) data.push(0);
  data.push(0, 0, 0, 0, (bitLength >>> 24) & 0xff, (bitLength >>> 16) & 0xff, (bitLength >>> 8) & 0xff, bitLength & 0xff);

  var h0 = 0x6a09e667;
  var h1 = 0xbb67ae85;
  var h2 = 0x3c6ef372;
  var h3 = 0xa54ff53a;
  var h4 = 0x510e527f;
  var h5 = 0x9b05688c;
  var h6 = 0x1f83d9ab;
  var h7 = 0x5be0cd19;

  var w = new Array(64);
  for (var offset = 0; offset < data.length; offset += 64) {
    var t;
    for (t = 0; t < 16; t++) {
      var base = offset + t * 4;
      w[t] = ((data[base] << 24) | (data[base + 1] << 16) | (data[base + 2] << 8) | data[base + 3]) >>> 0;
    }
    for (t = 16; t < 64; t++) {
      var s0 = (rotr32(w[t - 15], 7) ^ rotr32(w[t - 15], 18) ^ (w[t - 15] >>> 3)) >>> 0;
      var s1 = (rotr32(w[t - 2], 17) ^ rotr32(w[t - 2], 19) ^ (w[t - 2] >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    var a = h0;
    var b = h1;
    var c = h2;
    var d = h3;
    var e = h4;
    var f = h5;
    var g = h6;
    var h = h7;
    for (t = 0; t < 64; t++) {
      var S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      var ch = ((e & f) ^ (~e & g)) >>> 0;
      var temp1 = (h + S1 + ch + SHA256_K[t] + w[t]) >>> 0;
      var S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      var temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  var digest = [];
  var state = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (var s = 0; s < 8; s++) {
    digest.push((state[s] >>> 24) & 0xff, (state[s] >>> 16) & 0xff, (state[s] >>> 8) & 0xff, state[s] & 0xff);
  }
  return digest;
}

/* ───────────────────────── AES（解密 + 加密，纯 JS） ───────────────────────── */
var AES_EXP = new Array(256);
var AES_LOG = new Array(256);
(function buildTables() {
  var x = 1;
  for (var index = 0; index < 255; index++) {
    AES_EXP[index] = x;
    AES_LOG[x] = index;
    x = x ^ (((x << 1) ^ ((x >> 7) * 0x11b)) & 0xff);
  }
  AES_EXP[255] = AES_EXP[0];
})();

function aesMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return AES_EXP[(AES_LOG[a] + AES_LOG[b]) % 255];
}

var AES_SBOX = new Array(256);
var AES_INV_SBOX = new Array(256);
(function buildSbox() {
  for (var index = 0; index < 256; index++) {
    var inverse = index === 0 ? 0 : AES_EXP[(255 - AES_LOG[index]) % 255];
    var rotated = inverse;
    var value = inverse;
    for (var step = 0; step < 4; step++) {
      rotated = ((rotated << 1) | (rotated >> 7)) & 0xff;
      value ^= rotated;
    }
    value ^= 0x63;
    AES_SBOX[index] = value;
    AES_INV_SBOX[value] = index;
  }
})();

var AES_MUL2 = new Array(256);
var AES_MUL3 = new Array(256);
var AES_MUL9 = new Array(256);
var AES_MUL11 = new Array(256);
var AES_MUL13 = new Array(256);
var AES_MUL14 = new Array(256);
(function buildMulTables() {
  for (var index = 0; index < 256; index++) {
    AES_MUL2[index] = aesMul(index, 2);
    AES_MUL3[index] = aesMul(index, 3);
    AES_MUL9[index] = aesMul(index, 9);
    AES_MUL11[index] = aesMul(index, 11);
    AES_MUL13[index] = aesMul(index, 13);
    AES_MUL14[index] = aesMul(index, 14);
  }
})();

function aesExpandKey(keyBytes) {
  var nk = keyBytes.length / 4;
  var rounds = nk + 6;
  var words = 4 * (rounds + 1);
  var schedule = new Array(words * 4);
  var index;
  for (index = 0; index < keyBytes.length; index++) schedule[index] = keyBytes[index];
  var rcon = 1;
  for (index = nk; index < words; index++) {
    var t0 = schedule[(index - 1) * 4];
    var t1 = schedule[(index - 1) * 4 + 1];
    var t2 = schedule[(index - 1) * 4 + 2];
    var t3 = schedule[(index - 1) * 4 + 3];
    if (index % nk === 0) {
      var swap = t0;
      t0 = AES_SBOX[t1] ^ rcon;
      t1 = AES_SBOX[t2];
      t2 = AES_SBOX[t3];
      t3 = AES_SBOX[swap];
      rcon = aesMul(rcon, 2);
    } else if (nk > 6 && index % nk === 4) {
      t0 = AES_SBOX[t0];
      t1 = AES_SBOX[t1];
      t2 = AES_SBOX[t2];
      t3 = AES_SBOX[t3];
    }
    schedule[index * 4] = schedule[(index - nk) * 4] ^ t0;
    schedule[index * 4 + 1] = schedule[(index - nk) * 4 + 1] ^ t1;
    schedule[index * 4 + 2] = schedule[(index - nk) * 4 + 2] ^ t2;
    schedule[index * 4 + 3] = schedule[(index - nk) * 4 + 3] ^ t3;
  }
  return { schedule: schedule, rounds: rounds };
}

function aesEncryptBlock(block, expanded) {
  var state = block.slice();
  var index;
  var round;
  for (index = 0; index < 16; index++) state[index] ^= expanded.schedule[index];
  for (round = 1; round <= expanded.rounds; round++) {
    for (index = 0; index < 16; index++) state[index] = AES_SBOX[state[index]];
    var shifted = new Array(16);
    for (var col = 0; col < 4; col++) {
      for (var row = 0; row < 4; row++) shifted[row + 4 * col] = state[row + 4 * ((col + row) % 4)];
    }
    state = shifted;
    if (round !== expanded.rounds) {
      for (var c = 0; c < 4; c++) {
        var base = 4 * c;
        var a0 = state[base];
        var a1 = state[base + 1];
        var a2 = state[base + 2];
        var a3 = state[base + 3];
        state[base] = AES_MUL2[a0] ^ AES_MUL3[a1] ^ a2 ^ a3;
        state[base + 1] = a0 ^ AES_MUL2[a1] ^ AES_MUL3[a2] ^ a3;
        state[base + 2] = a0 ^ a1 ^ AES_MUL2[a2] ^ AES_MUL3[a3];
        state[base + 3] = AES_MUL3[a0] ^ a1 ^ a2 ^ AES_MUL2[a3];
      }
    }
    for (index = 0; index < 16; index++) state[index] ^= expanded.schedule[round * 16 + index];
  }
  return state;
}

function aesInvShiftRows(state) {
  for (var row = 1; row < 4; row++) {
    var tmp = [state[row], state[row + 4], state[row + 8], state[row + 12]];
    for (var col = 0; col < 4; col++) state[row + 4 * ((col + row) % 4)] = tmp[col];
  }
}

function aesInvMixColumns(state) {
  for (var col = 0; col < 4; col++) {
    var base = 4 * col;
    var a0 = state[base];
    var a1 = state[base + 1];
    var a2 = state[base + 2];
    var a3 = state[base + 3];
    state[base] = AES_MUL14[a0] ^ AES_MUL11[a1] ^ AES_MUL13[a2] ^ AES_MUL9[a3];
    state[base + 1] = AES_MUL9[a0] ^ AES_MUL14[a1] ^ AES_MUL11[a2] ^ AES_MUL13[a3];
    state[base + 2] = AES_MUL13[a0] ^ AES_MUL9[a1] ^ AES_MUL14[a2] ^ AES_MUL11[a3];
    state[base + 3] = AES_MUL11[a0] ^ AES_MUL13[a1] ^ AES_MUL9[a2] ^ AES_MUL14[a3];
  }
}

function aesDecryptBlock(block, expanded) {
  var state = block.slice();
  var index;
  for (index = 0; index < 16; index++) state[index] ^= expanded.schedule[expanded.rounds * 16 + index];
  for (var round = expanded.rounds - 1; round >= 1; round--) {
    aesInvShiftRows(state);
    for (index = 0; index < 16; index++) state[index] = AES_INV_SBOX[state[index]];
    for (index = 0; index < 16; index++) state[index] ^= expanded.schedule[round * 16 + index];
    aesInvMixColumns(state);
  }
  aesInvShiftRows(state);
  for (index = 0; index < 16; index++) state[index] = AES_INV_SBOX[state[index]];
  for (index = 0; index < 16; index++) state[index] ^= expanded.schedule[index];
  return state;
}

function aesCbcDecrypt(data, keyBytes, ivBytes) {
  var expanded = aesExpandKey(keyBytes);
  var previous = ivBytes.slice(0, 16);
  var plain = [];
  for (var offset = 0; offset + 16 <= data.length; offset += 16) {
    var block = data.slice(offset, offset + 16);
    var decoded = aesDecryptBlock(block, expanded);
    for (var index = 0; index < 16; index++) plain.push(decoded[index] ^ previous[index]);
    previous = block;
  }
  var pad = plain.length ? plain[plain.length - 1] : 0;
  if (pad > 0 && pad <= 16 && pad <= plain.length) plain = plain.slice(0, plain.length - pad);
  return plain;
}

function aesCbcEncrypt(plainBytes, keyBytes, ivBytes) {
  var expanded = aesExpandKey(keyBytes);
  var previous = ivBytes.slice(0, 16);
  var data = plainBytes.slice();
  var pad = 16 - (data.length % 16);
  for (var p = 0; p < pad; p++) data.push(pad);
  var out = [];
  for (var offset = 0; offset < data.length; offset += 16) {
    var block = data.slice(offset, offset + 16);
    for (var index = 0; index < 16; index++) block[index] ^= previous[index];
    var encoded = aesEncryptBlock(block, expanded);
    for (var k = 0; k < 16; k++) out.push(encoded[k]);
    previous = encoded;
  }
  return out;
}

/* ───────────── 站点响应解密：前端 `t.data = function(e){…}` 的逐行复刻 ───────────── */
//   raw = base64decode(data) ; nonce = raw[0:12]
//   i = Utf8(interfaceKey) || nonce ; o = len(i)/2
//   r = SHA256(i)[8:24] ; s = r || i[0:o] ; c = i[o:] || r
//   d = SHA256(s) ; f = SHA256(c)
//   key = d[0:8] || f[8:24] || d[24:]      (32B → AES-256)
//   iv  = f[0:4] || d[12:20] || f[28:]     (16B)
//   plain = AES-256-CBC-decrypt(raw[12:])
function faDecrypt(payloadB64) {
  var keyBytes = utf8Bytes(INTERFACE_KEY);
  var raw = b64ToBytes(payloadB64);
  var nonce = raw.slice(0, 12);
  var i = keyBytes.concat(nonce);
  var half = i.length >> 1;
  var r = sha256Bytes(i).slice(8, 24);
  var s = r.concat(i.slice(0, half));
  var c = i.slice(half).concat(r);
  var d = sha256Bytes(s);
  var f = sha256Bytes(c);
  var aesKey = d.slice(0, 8).concat(f.slice(8, 24)).concat(d.slice(24));
  var aesIv = f.slice(0, 4).concat(d.slice(12, 20)).concat(f.slice(28));
  var plain = aesCbcDecrypt(raw.slice(12), aesKey, aesIv);
  var text = utf8Decode(plain);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('响应解开了但不是 JSON：' + text.slice(0, 80));
  }
}

// 请求信封：POST body / GET params 都是 { data: base64(AES-128-CBC(JSON(payload), parameterKey)) }
function paramEncrypt(payload) {
  var keyBytes = utf8Bytes(PARAM_KEY);
  var out = aesCbcEncrypt(utf8Bytes(JSON.stringify(payload || {})), keyBytes, keyBytes);
  return bytesToB64(out);
}

/* ══════════════════════════ 站点请求层 ══════════════════════════ */

var baseCache = '';
var token = '';
var loginPromise = null;

function customBase() {
  var config = LumeSource.config || {};
  return String(config.customDomain || '').trim().replace(/\/+$/, '');
}

function headers(extra, withToken) {
  var result = {
    'User-Agent': APP_UA,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*'
  };
  if (withToken !== false && token) result.Authorization = token;
  for (var key in extra || {}) result[key] = extra[key];
  return result;
}

async function call(base, path, options) {
  var settings = options || {};
  var url = base + '/api/app' + path;
  var response;
  try {
    if (settings.body) {
      response = await LumeSource.http.post(url, JSON.stringify({ data: paramEncrypt(settings.body) }), {
        headers: headers({}, settings.auth)
      });
    } else {
      response = await LumeSource.http.get(url, { headers: headers({}, settings.auth) });
    }
  } catch (error) {
    throw new Error('连不上接口（' + base + '）：' + ((error && error.message) || '网络错误'));
  }
  var status = response ? response.status : 0;
  if (status === 403 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：接口主机 ' + base + ' 返回 HTTP ' + status);
  }
  if (status !== 200) throw new Error('接口打不开：HTTP ' + status + ' ' + path);
  var parsed;
  try {
    parsed = JSON.parse(String((response && response.body) || ''));
  } catch (error) {
    throw new Error('接口返回的不是 JSON：' + path);
  }
  var code = parsed && parsed.code != null ? Number(parsed.code) : -1;
  var data = parsed ? parsed.data : null;
  if (parsed && parsed.hash && typeof data === 'string') {
    try {
      data = faDecrypt(data);
    } catch (error) {
      throw new Error('响应解不开（interfaceKey 可能换了）：' + path + '：' + ((error && error.message) || ''));
    }
  }
  return { code: code, msg: String((parsed && parsed.msg) || ''), data: data };
}

async function pingOne(base) {
  var reply = await call(base, '/ping/check', { auth: false });
  return reply.code === 200 && !!reply.data && String(reply.data.response || '') === 'pong';
}

function isPageHost(value) {
  var text = String(value || '').replace(/\/+$/, '').toLowerCase();
  if (!text) return false;
  for (var index = 0; index < PAGE_HOSTS.length; index++) {
    if (text === PAGE_HOSTS[index].toLowerCase()) return true;
  }
  return false;
}

async function pickBase(force, avoid) {
  var custom = customBase();
  var candidates = custom ? [custom].concat(DEFAULT_BASES.filter(function (item) { return item !== custom; })) : DEFAULT_BASES.slice();
  // 页面域进候选表只会换来 405：直接剔掉（用户真的只能选它时，下面 ping 也会跳过）
  candidates = candidates.filter(function (item) { return !isPageHost(item); });
  if (avoid) candidates = candidates.filter(function (item) { return item !== avoid; }).concat([avoid]);
  if (!candidates.length) candidates = DEFAULT_BASES.slice();
  if (!force) {
    if (baseCache) return baseCache;
    // 省一次往返：上次选中的主机直接信，没缓存就赌主站；真失败由 api() 走 force 分支逐台 ping
    try {
      var cached = await LumeSource.fs.readText('base.txt');
      var saved = cached ? String(cached).trim() : '';
      if (saved && saved.indexOf('http') === 0 && !isPageHost(saved)) {
        candidates = [saved].concat(candidates.filter(function (item) { return item !== saved; }));
      }
    } catch (error) {
      /* 没缓存 */
    }
    baseCache = candidates[0];
    return baseCache;
  }
  var lastError = '';
  for (var index = 0; index < candidates.length; index++) {
    try {
      if (await pingOne(candidates[index])) {
        baseCache = candidates[index];
        try {
          await LumeSource.fs.writeText('base.txt', baseCache);
        } catch (error) {
          /* 缓存写不进不影响本次 */
        }
        return baseCache;
      }
      lastError = 'ping 没有回 pong';
    } catch (error) {
      lastError = (error && error.message) || '未知错误';
    }
  }
  throw new Error('两条接口线路都打不通（' + lastError + '）');
}

// 匿名设备登录：站点自己的游客入口，不注册、不要验证码
async function ensureToken(base, force) {
  if (!force) {
    if (token) return token;
    try {
      var cached = await LumeSource.fs.readText('token.txt');
      if (cached && String(cached).length > 40) {
        token = String(cached).trim();
        return token;
      }
    } catch (error) {
      /* 没缓存就登录 */
    }
    if (loginPromise) return loginPromise;
  }
  loginPromise = (async function () {
    var reply = await call(base, '/mine/login/h5', {
      auth: false,
      body: { devID: DEVICE_ID, sysType: 'ios', cutInfos: '', isAppStore: false }
    });
    if (reply.code !== 200 || !reply.data || !reply.data.token) {
      throw new Error('匿名设备登录失败：' + (reply.msg || 'code ' + reply.code));
    }
    token = String(reply.data.token);
    try {
      await LumeSource.fs.writeText('token.txt', token);
    } catch (error) {
      /* 内存里有就够了 */
    }
    return token;
  })();
  try {
    return await loginPromise;
  } finally {
    loginPromise = null;
  }
}

/// 这台主机是否「根本不能当接口用」：405（页面域）、404、连不上 —— 值得换台重试。
/// 业务报错（code 4001 / 内容不存在）不算，别为它多跑一轮。
function baseFailure(error) {
  var text = String((error && error.message) || '');
  return /接口打不开：HTTP (403|404|405|5\d\d)|连不上接口|ping/.test(text);
}

/// 在「一台可用接口主机」上跑 task：挂了就换台再来一次。
/// 登录（/mine/login/h5）也走这里 —— 以前它绕过了换台逻辑，一台页面域就能把首页打成
/// `接口打不开：HTTP 405 /mine/login/h5`。
async function withBase(task) {
  var base = await pickBase(false);
  try {
    return await task(base);
  } catch (error) {
    if (!baseFailure(error)) throw error;
    var next;
    try {
      next = await pickBase(true, base);
    } catch (switchError) {
      throw error;
    }
    if (!next || next === base) throw error;
    return await task(next);
  }
}

async function api(path, options) {
  return await withBase(async function (base) {
    await ensureToken(base, false);
    var reply = await call(base, path, options);
    if (reply.code === 5009) {
      await ensureToken(base, true);
      reply = await call(base, path, options);
    }
    if (reply.code !== 200) {
      throw new Error('接口报错：' + (reply.msg || 'code ' + reply.code) + '（' + path + '）');
    }
    return reply.data;
  });
}

/* ══════════════════════════ 数据整形 ══════════════════════════ */

function absoluteImage(path) {
  var text = String(path || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return IMAGE_HOST + '/' + text.replace(/^\/+/, '');
}

function blocked(row) {
  if (!row) return true;
  if (BLOCKED_WORDS.test(String(row.title || row.name || ''))) return true;
  var tags = row.tags || [];
  for (var index = 0; index < tags.length; index++) {
    if (tags[index] && BLOCKED_TAGS.test(String(tags[index].name || ''))) return true;
  }
  return false;
}

function itemOf(row) {
  if (!row || !row.id) return null;
  if (blocked(row)) return null;
  var parts = [];
  var tags = [];
  for (var index = 0; index < (row.tags || []).length && index < 4; index++) {
    if (row.tags[index] && row.tags[index].name) tags.push(String(row.tags[index].name));
  }
  if (tags.length) parts.push(tags.join('·'));
  var coins = Number(row.coins || 0);
  parts.push(coins > 0 ? coins + ' 金币' : '免费');
  if (row.resolution) parts.push(String(row.resolution).replace('*', '×'));
  if (row.playCount) parts.push('播放 ' + String(row.playCount));
  return {
    id: String(row.id),
    title: String(row.title || row.id),
    cover: absoluteImage(row.cover || row.coverThumb || ''),
    subtitle: parts.join(' · ')
  };
}

function itemsOf(rows) {
  var out = [];
  for (var index = 0; index < (rows || []).length; index++) {
    var item = itemOf(rows[index]);
    if (item) out.push(item);
  }
  return out;
}

async function fetchList(page, tagId) {
  var query = '?pageNumber=' + Math.max(1, Number(page) || 1) + '&pageSize=' + PAGE_SIZE;
  if (tagId) query += '&tag=' + encodeURIComponent(String(tagId));
  var data = await api('/vid/list' + query);
  var rows = (data && data.list) || [];
  return { rows: rows, hasMore: !!(data && data.hasNext) };
}

async function fetchTags() {
  var data = await api('/tag/conf/list');
  var rows = (data && data.tags) || [];
  var out = [];
  for (var index = 0; index < rows.length; index++) {
    var name = String((rows[index] && rows[index].tagName) || '').trim();
    if (!name || BLOCKED_TAGS.test(name) || BLOCKED_WORDS.test(name)) continue;
    out.push({ id: String(rows[index].id), title: name });
  }
  return out;
}

/* ══════════════════════════ 图源契约 ══════════════════════════ */

var LumeSource = {
  id: 'cf2_video',
  name: 'Butterfly 18+',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://d1q6v0m0fmxvl0.cloudfront.net', 'https://d2m0k739byzwun.cloudfront.net', 'https://d1w3p997s8acw6.cloudfront.net'],

  async categories() {
    var tags = [];
    try {
      tags = await LumeSource.fs.readText('tags.json');
    } catch (error) {
      tags = null;
    }
    if (tags) {
      try {
        var cached = JSON.parse(tags);
        if (cached && cached.length) return cached;
      } catch (error) {
        /* 缓存坏了就重抓 */
      }
    }
    var live = await fetchTags();
    try {
      await LumeSource.fs.writeText('tags.json', JSON.stringify(live));
      if (live.length) {
        await LumeSource.fs.writeText('homeTag.txt', live[0].id);
        await LumeSource.fs.writeText('homeTagTitle.txt', live[0].title);
      }
    } catch (error) {
      /* 无所谓 */
    }
    return [{ id: '', title: '最新' }].concat(live);
  },

  async filters() {
    var tags = await fetchTags();
    return {
      groups: [
        {
          id: 'tag',
          title: '标签',
          options: tags
        }
      ]
    };
  },

  async home() {
    // 首屏预算 3–5 秒：这里只用 Promise.all 并发两个请求，标签表缓存过才多挂一个板块
    // （标签 id 存在 fs 里，由 categories()/filters() 首次调用时写入）
    var tag = '';
    try {
      tag = (await LumeSource.fs.readText('homeTag.txt')) || '';
    } catch (error) {
      tag = '';
    }
    var tasks = tag ? [fetchList(1), fetchList(1, tag)] : [fetchList(1)];
    var results = await Promise.all(tasks);
    var boards = [];
    var freshItems = itemsOf(results[0].rows);
    if (freshItems.length) boards.push({ title: '最新', moreUrl: '', items: freshItems.slice(0, 12) });
    if (results[1]) {
      var boardItems = itemsOf(results[1].rows);
      var title = '热门标签';
      try {
        title = (await LumeSource.fs.readText('homeTagTitle.txt')) || title;
      } catch (error) {
        /* 用默认标题 */
      }
      if (boardItems.length) boards.push({ title: title, moreUrl: tag, items: boardItems.slice(0, 12) });
    }
    if (!boards.length) throw new Error('首页：列表取不到条目（站点可能改版）');
    return boards;
  },

  async list(argument) {
    var settings = argument || {};
    var page = Number(settings.page || 1);
    if (!page || page < 1) page = 1;
    var keyword = settings.keyword ? String(settings.keyword).trim() : '';
    if (keyword) {
      var found = await api('/search/list', {
        body: { pageNumber: page, pageSize: PAGE_SIZE, keyWords: [keyword], realm: 'SP', sortType: 7 }
      });
      var rows = (found && found.list) || [];
      return { items: itemsOf(rows), hasMore: !!(found && found.hasNext) };
    }
    var filters = settings.filters || {};
    var tagId = filters.tag || settings.categoryId || '';
    if (String(tagId).indexOf(',') >= 0) tagId = String(tagId).split(',')[0];
    var feed = await fetchList(page, tagId);
    return { items: itemsOf(feed.rows), hasMore: feed.hasMore };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id) return null;
    var data;
    try {
      data = await api('/vid/info?videoID=' + encodeURIComponent(id));
    } catch (error) {
      if (/不存在|已删除|参数错误|code 4001/i.test(String(error && error.message))) return null;
      throw error;
    }
    if (!data || !data.id) return null;
    var tags = [];
    for (var index = 0; index < (data.tags || []).length; index++) {
      if (data.tags[index] && data.tags[index].name) tags.push(String(data.tags[index].name));
    }
    var coins = Number(data.coins || 0);
    var lines = [];
    lines.push('标题：' + String(data.title || id));
    if (tags.length) lines.push('标签：' + tags.join(' / '));
    lines.push('价格：' + (coins > 0 ? coins + ' 金币' : '免费（匿名身份直接整片）'));
    if (data.freeTime) lines.push('试看：' + data.freeTime + ' 秒');
    if (data.resolution) lines.push('分辨率：' + String(data.resolution).replace('*', '×') + (data.size ? ' · ' + (Number(data.size) / 1048576).toFixed(1) + 'MB' : ''));
    if (data.createdAt) lines.push('发布：' + String(data.createdAt).slice(0, 10));
    lines.push('数据：播放 ' + String(data.playCount || 0) + ' · 点赞 ' + String(data.likeCount || 0) + ' · 收藏 ' + String(data.collectCount || 0) + ' · 评论 ' + String(data.commentCount || 0));
    if (data.isOriginal) lines.push('标记：原创');
    if (data.reason) lines.push('状态说明：' + String(data.reason));
    if (String(data.content || '').trim()) lines.push('简介：' + String(data.content).slice(0, 300));
    return {
      id: String(data.id),
      title: String(data.title || id),
      cover: absoluteImage(data.cover || data.coverThumb || ''),
      subtitle: [tags.slice(0, 2).join('·'), coins > 0 ? coins + ' 金币' : '免费', data.resolution ? String(data.resolution).replace('*', '×') : '']
        .filter(Boolean)
        .join(' · '),
      description: lines.join('\n')
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id) return [];
    return [{ id: id, title: '播放' }];
  },

  async content(argument) {
    var settings = argument || {};
    var id = String(settings.chapterId || settings.id || '').trim();
    if (!id) throw new Error('缺少视频 id');
    var ticket = await withBase(async function (base) {
      return { base: base, jwt: await ensureToken(base, false) };
    });
    var base = ticket.base;
    var jwt = ticket.jwt;

    var source = '';
    try {
      var info = await api('/vid/info?videoID=' + encodeURIComponent(id));
      source = String((info && info.sourceURL) || '').trim();
    } catch (error) {
      source = '';
    }
    if (!source) {
      // 列表里也带 sourceURL，兜底再取一次列表页（成本高，只在详情缺字段时走）
      var feed = await fetchList(1);
      for (var index = 0; index < feed.rows.length; index++) {
        if (String(feed.rows[index].id) === id && feed.rows[index].sourceURL) {
          source = String(feed.rows[index].sourceURL);
          break;
        }
      }
    }
    if (!source) throw new Error('这条没有给播放路径（可能是待审核/已下架）');
    source = source.replace(/^\/+/, '');
    // 走站内代理：直连 CDN 的播放列表里密钥 URI 是占位串，取不到 key
    var url = base + '/api/app/vid/h5/m3u8/' + source + '?token=' + encodeURIComponent(jwt);
    return {
      kind: 'video',
      url: url,
      headers: { 'User-Agent': APP_UA, Referer: (LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : base) + '/' }
    };
  }
};
