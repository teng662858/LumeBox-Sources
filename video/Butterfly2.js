// LumeSource: {"id":"cf3_video","name":"Butterfly 2 18+","version":"1.0.2","category":"video","mirrors":["https://d17rhkrwip15vt.cloudfront.net","https://32sdhsudan.com","https://d32wxxub5gb7wa.cloudfront.net"]}
//
// ════════════════════════════════════════════════════════════════════════════
// 一、d17rhkrwip15vt / d1q6v0m0fmxvl0 / d1nu1x3tadacmt —— 同一个 SDK，三个运营方
// ════════════════════════════════════════════════════════════════════════════
// 三站都是同一份「Butterfly」App 壳 + 同一套 web-sdk（web-sdk-v1.1.8.js），接口路径、
// 信封形态、播放代理端点完全一致，只有运营方常量不同：
//
//   ┌────────────────┬──────────────────────────────┬──────────────────────────────┬──────────────────────────────┐
//   │                │ hstv（d1nu1x3tadacmt…）      │ cf2（d1q6v0m0fmxvl0…）       │ cf3（d17rhkrwip15vt…）       │
//   ├────────────────┼──────────────────────────────┼──────────────────────────────┼──────────────────────────────┤
//   │ interfaceKey   │ 65dc07d1b7915c6b2937432b091837a7 │ 0a958fb9ac062420af6ba5f4caad779f │ vEukA&w15z4VAD3kAY#fkL#rBnU!WDhN │
//   │ parameterKey   │ 无（hstv 发明文 JSON）        │ BxJand%xf5h3sycH            │ BxJand%xf5h3sycH（同）        │
//   │ imgKey         │ —                            │ 2019ysapp7527               │ 2019ysapp7527（同）           │
//   │ 响应解密       │ SHA256(interfaceKey‖nonce) 派生 AES-256-CBC（faDecrypt）        │ 同（cryptoDecrypt 逐行一致）  │
//   │ API 主机       │ d30zcqlpvg6j0s… 3 台         │ d2m0k739byzwun… 3 台          │ 32sdhsudan.com / d32wxxub5gb7wa… / d1x0nwh6cfbmjp… │
//   │ 列表端点       │ /search/hotVid/list          │ /vid/list（hotVid 空）        │ /search/hotVid/list（/vid/list 404）│
//   │ 播放代理       │ /vid/h5/m3u8/<src>?token=JWT │ 同                            │ 同（实测 200 + #EXTM3U）      │
//   └────────────────┴──────────────────────────────┴──────────────────────────────┴──────────────────────────────┘
//
//   ⇒ 结论：**同一 SDK 的三个部署**，但 interfaceKey 各不相同 ⇒ 三份源码不能合成一个源的 mirrors
//      （hstv.js 的 key 解不开 cf2/cf3 的响应，cf2 与 cf3 也互不相通）。
//      三者代码骨架 100% 相同：本源 = cf2.js 换三个常量 + 换列表端点 + 搜索退化，逻辑一字不改。
//
//   ▍cf3 的 API base 是运行时拿到的（页面域 /api/app/* 是 CloudFront 静态托管，POST 回 405）
//      主 bundle 里 VITE_BASE_URL 写死候选表：
//        ["https://32sdhsudan.com","https://d32wxxub5gb7wa.cloudfront.net","https://d1x0nwh6cfbmjp.cloudfront.net"]
//      三台实测 GET /api/app/ping/check 全 200，且响应能用 vEukA… 这把 interfaceKey 解成
//      {"response":"pong"} —— 这就是「API 域不是页面域」的落地证据。
//
// ════════════════════════════════════════════════════════════════════════════
// 二、接口（前缀 /api/app，全部实测）
// ════════════════════════════════════════════════════════════════════════════
//   GET  /ping/check                              探活（密文 → {"response":"pong"}）
//   GET  /ping/domain/h5                          站点配置（广告位、VID 线路…）
//   POST /mine/login/h5 {devID,sysType,cutInfos,isAppStore}  **匿名设备登录 → JWT**
//        · 不要账号、不要验证码；cutInfos 必须是空串（传 [] 会 4001 parameters error）
//        · User-Agent 必须是 App 形态：BuildID=com.abc.Butterfly;SysType=ios;DevID=<32hex>;
//          Ver=1.0.0;DevType=iPhone;Terminal=2;IsH5=1（浏览器 UA 打登录一律 4001）
//        · 请求体是信封 { data: base64(AES-128-CBC(payload, "BxJand%xf5h3sycH")) }
//   GET  /search/hotVid/list?pageNumber&pageSize   热门流（本源主列表，带 token）
//   GET  /tag/conf/list                            标签表（分类来源）
//   GET  /vid/info?videoID=<24位hex>               详情（sourceURL / coins / resolution / tags…）
//   GET  /vid/h5/m3u8/<sourceURL>?token=<JWT>      **播放列表代理**（密钥 URI 重写成 /api/app/vid/sec）
//   POST /search/list {pageNumber,pageSize,keyWords,realm,sortType}  搜索（本站实测 4008 network bad，
//        本源自动退化为「热门流前 3 页本地过滤」，不把报错甩给用户）
//
// ════════════════════════════════════════════════════════════════════════════
// 三、播放与 VIP 结论
// ════════════════════════════════════════════════════════════════════════════
//   · 热门流条目 coins=0（免费），/vid/info 直接给 sourceURL；走站内代理端点即回 #EXTM3U，
//     分片是 sjljsla.lkkwip.cn 上带 md= 签名的绝对地址，密钥端点 /api/app/vid/sec 回 16 字节。
//   · 直连 CDN 的播放列表里密钥 URI 是占位串 http://domain/enc.key（取不到 key），
//     所以本源只用站内代理地址，不给直连。
//   · VIP：公开内容不锁；收银台（/vip/product、/mine/topay）仍在。没看到试看截断，
//     分片总量与 /vid/info 的时长/体积相符。
//   · 封面：cf230705/image/… 相对路径，拼 https://zzzznnn.lkkwip.cn/ 回 200，
//     但**字节是混淆过的**：站点前端 AppApi.imgDecypt 把图片前 100 字节与 Key.imgKey
//     （2019ysapp7527）循环 XOR 再交给浏览器（main bundle 里 imgEncrypt 原文）——
//     所以直接当图片交给 App 只会得到一张坏图（表现就是列表一片占位图）。
//     源里用 coverHeaders 声明 `x-lume-image-encoding: xor-prefix` + key，App 侧按同样规则还原。
//
// ════════════════════════════════════════════════════════════════════════════
// 四、分类与内容过滤
// ════════════════════════════════════════════════════════════════════════════
//   分类 = `/modules/list` 的 homePage 栏目（新片/18岁/热播🔥/制服/国产/伦理/厂牌/AV/海外/…），
//   每个栏目用 `GET /vid/module/<栏目id>?pageNumber&pageSize` 取内容 → 实测不同栏目首条不同。
//   `/tag/conf/list` 的 325 个标签**不是分类**：`/search/hotVid/list?tag=<id>`（以及 tagId/tagIds/
//   labelId/realm/tags/tagName 六种写法）返回的首条 id 与不带参数时完全一致 —— 服务端把标签参数
//   丢了，所以拿它当分类等于「切了不换内容」。1.0.1 起分类换成栏目，标签不再进分类/筛选表。
//   搜索：`/search/list` 只收 POST 且本部署回 parameters error，`/search/vid/list` 404，
//   故退化为「热门流第一页本地过滤」，不把报错甩给用户。
//   ⚠ 不做涉未成年内容：标签与标题命中 萝莉/幼齿/学生/loli/未成年 的一律剔除。
//
var DEFAULT_BASES = [
  // 顺序有讲究：32sdhsudan.com 是主站，但从国内直连偶发 fetch failed 且慢到 8–12s，
  // 两台 CloudFront 同源同库更快更稳，所以排前面（失败时 api() 会换台重试）
  'https://d32wxxub5gb7wa.cloudfront.net',
  'https://d1x0nwh6cfbmjp.cloudfront.net',
  'https://32sdhsudan.com'
];
// 页面域（CloudFront 静态托管）：**不是接口主机** —— 往它 POST /api/app/* 一律 405。
// 用户「换网址」/ 镜像下标 0 可能把它写进 config.customDomain，那样连登录都发不出去，
// 所以候选表里要把这类主机剔掉（曾经的报错：`接口打不开：HTTP 405 /mine/login/h5`）。
var PAGE_HOSTS = [
  'https://d17rhkrwip15vt.cloudfront.net'
];
var INTERFACE_KEY = 'vEukA&w15z4VAD3kAY#fkL#rBnU!WDhN';
var PARAM_KEY = 'BxJand%xf5h3sycH';
var IMAGE_HOST = 'https://zzzznnn.lkkwip.cn';
// 站点把每张图的前 100 字节和 imgKey 循环 XOR 了（main bundle: imgEncrypt），
// App 图片管线按这个声明还原；明文图（万一以后不再混淆）会被自动跳过。
var IMG_KEY = '2019ysapp7527';
var COVER_HEADERS = {
  'x-lume-image-encoding': 'xor-prefix',
  'x-lume-image-key': IMG_KEY
};
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
    coverHeaders: COVER_HEADERS,
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
  // cf3 这台只开 /search/hotVid/list（/vid/list、/vid/recommend/list 都 404）
  var data = await api('/search/hotVid/list' + query);
  var rows = (data && data.list) || [];
  return { rows: rows, hasMore: !!(data && data.hasNext) };
}

/// 站点的真分类：首页标签页（`/modules/list` 的 homePage）。
/// 返回值是**模块 id → 标题**，`list()` 用 `/vid/module/<模块id>` 取这一栏的内容。
async function fetchModules() {
  var data = await api('/modules/list');
  var rows = (data && data.homePage) || [];
  var out = [];
  for (var index = 0; index < rows.length; index++) {
    var row = rows[index] || {};
    var name = String(row.moduleName || '').trim();
    var id = String(row.id || '').trim();
    // type 1 = 视频栏目；acg 那几栏是漫画/小说/有声，视频板块不要
    if (!id || !name || Number(row.type) !== 1) continue;
    if (BLOCKED_TAGS.test(name) || BLOCKED_WORDS.test(name)) continue;
    out.push({ id: id, title: name });
  }
  return out;
}

/// 模块内容：`/vid/module/<id>?pageNumber&pageSize` → allVideoInfo[] + hasNext
async function fetchModule(page, moduleId) {
  var query = '?pageNumber=' + Math.max(1, Number(page) || 1) + '&pageSize=' + PAGE_SIZE;
  var data = await api('/vid/module/' + encodeURIComponent(String(moduleId)) + query);
  var rows = (data && data.allVideoInfo) || [];
  return { rows: rows, hasMore: !!(data && data.hasNext) };
}

/* ══════════════════════════ 图源契约 ══════════════════════════ */

var LumeSource = {
  id: 'cf3_video',
  name: 'Butterfly 2 18+',
  version: '1.0.2',
  category: 'video',
  mirrors: ['https://d17rhkrwip15vt.cloudfront.net', 'https://32sdhsudan.com', 'https://d32wxxub5gb7wa.cloudfront.net'],

  async categories() {
    // 分类 = 站点首页那排真栏目（`/modules/list` 的 homePage：新片/热播/制服/国产/伦理…）。
    // 以前给的是 `/tag/conf/list` 的 325 个标签，**切了不换内容**（`&tag=` 被服务端忽略，
    // 实测首条 id 一模一样）——按源约定第 3 条，这种伪分类不能留。
    var cached = null;
    try {
      var raw = await LumeSource.fs.readText('modules.json');
      if (raw) cached = JSON.parse(raw);
    } catch (error) {
      cached = null;
    }
    if (cached && cached.list && cached.list.length) {
      return [{ id: '', title: '最新' }].concat(cached.list);
    }
    var live = await fetchModules();
    if (live.length) {
      try {
        await LumeSource.fs.writeText('modules.json', JSON.stringify({ at: Date.now(), list: live }));
      } catch (error) {
        /* 缓存写不进不影响本次 */
      }
    }
    return [{ id: '', title: '最新' }].concat(live);
  },

  async home() {
    // 首屏预算 3–5 秒：三个请求并发（最新 + 前两个栏目），栏目表走 categories() 的同一份缓存
    var modules = [];
    try {
      var list = await this.categories();
      modules = list.filter(function (item) { return !!item.id; });
    } catch (error) {
      modules = [];
    }
    var picks = modules.slice(0, 2);
    var tasks = [fetchList(1)].concat(picks.map(function (item) {
      return fetchModule(1, item.id).catch(function () { return { rows: [], hasMore: false }; });
    }));
    var results = await Promise.all(tasks);
    var boards = [];
    var freshItems = itemsOf(results[0].rows);
    if (freshItems.length) boards.push({ title: '最新', moreUrl: '', items: freshItems.slice(0, 12) });
    for (var index = 0; index < picks.length; index++) {
      var boardItems = itemsOf((results[index + 1] && results[index + 1].rows) || []);
      if (boardItems.length) {
        boards.push({ title: picks[index].title, moreUrl: picks[index].id, items: boardItems.slice(0, 12) });
      }
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
      // 站点搜索接口在本部署上回 4008 / parameters error，退化为「热门流第一页本地过滤」
      var needle = keyword.toLowerCase();
      var hits = [];
      var feedRows = await fetchList(1);
      for (var index = 0; index < feedRows.rows.length; index++) {
        var row = feedRows.rows[index];
        if (String(row.title || '').toLowerCase().indexOf(needle) >= 0) hits.push(row);
      }
      return { items: itemsOf(hits), hasMore: false };
    }
    // 栏目 id 走 `/vid/module/<id>`；其余（含老版本缓存下来的标签 id）退回热门流
    var want = String(settings.categoryId == null ? '' : settings.categoryId).trim();
    if (want.indexOf(',') >= 0) want = want.split(',')[0].trim();
    if (want && /^[a-f0-9]{24}$/i.test(want)) {
      var modules = [];
      try {
        var cached = await LumeSource.fs.readText('modules.json');
        modules = cached ? (JSON.parse(cached).list || []) : [];
      } catch (error) {
        modules = [];
      }
      var known = false;
      for (var cursor = 0; cursor < modules.length; cursor++) {
        if (modules[cursor].id === want) { known = true; break; }
      }
      if (known) {
        var module = await fetchModule(page, want);
        return { items: itemsOf(module.rows), hasMore: module.hasMore };
      }
    }
    var feed = await fetchList(page);
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
      coverHeaders: COVER_HEADERS,
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
    var base = await pickBase(false);
    var jwt = await ensureToken(base, false);

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
