// LumeSource: {"id":"aido8_video","name":"爱豆 18+","version":"1.0.1","category":"video","mirrors":["https://ww15.aido8.icu","https://ww1.aido8.icu","https://ww5.aido8.icu"]}
//
// 站点：爱豆（页面 <title> 就是「爱豆」）——苹果CMS 风格模板 + jQuery + Element，2026-10-25 实测。
//
// ── 一、线路（镜像）：多条同站线路，全部直连 200，HTML 字节数与内容一致
//    实测 https://ww1..ww20.aido8.icu/ 全部 200、首页同字节（10.4KB），是同一套站的多条线路。
//    裸域 https://aido8.icu/ 与 https://www.aido8.icu/ 都连不上（000），所以只写 ww{N} 前缀。
//    mirrors 只能写 3 个：ww15（开发时实测的一台）/ ww1 / ww5。站点换线路时用户可在
//    「源设置 → 换网址」里切到任意一台 ww{N}.aido8.icu —— 线路之间内容完全一致。
//    站点自己首页搜索框的占位符写着「永久网址 w1.aido1.cc | w2.aido1.cc | w*.aido1.cc」，
//    那是**另一族**永久域（与 ww*.aido8.icu 同一套 CMS/接口形状），需要时手填即可。
//
// ── 二、页面全是 JS 渲染（SSR 只有空壳）——真正的数据在 /awsapi/*.php
//    首页 / 分类页 / 搜索页的 HTML 里卡片是空的：分类页里那段
//      `function initVods(page,count){ var params={"type":"1","by":"vod_time",...};
//         Boot.searchVod(params, ...) }`
//    才是数据入口。Boot.searchVod 定义在 https://ps1.lianliestation.xin/static/js/all.min.js 里：
//      Boot.searchVod = function(p, cb){ AwsApi.post('/vod/search.php', p, {success:...}) }
//      Boot.getVod    = function(p, cb){ AwsApi.post('/vod/info.php',   p, {success:...}) }
//      AwsApi.post(url, data) → POST  apiBase + url + '?md5=' + token，body 为 `data=<密文>`
//    也就是本源用的两个接口（都是 POST 表单，返回 AES 加密的 JSON）：
//      列表/搜索  POST {BASE}/awsapi/vod/search.php?md5=<16进制时间戳扰动>
//                 body: {type, by, order, page, size, tag, keyword, count, extypes}
//                 → {rows:[…], page, size, total(总页数), count(总条数)}
//      详情      POST {BASE}/awsapi/vod/info.php?md5=…
//                 body: {id} → {vodId, vodName, vodTag, vodTime, vodHits, vodPlayUrl,
//                               vodPic, vodPlayServer, vodPlayFrom, lineNum, token}
//
// ── 三、加解密（站点前端 AwsApi.encode/decode，用纯 JS 复刻，不依赖 tools.aes/atob）
//      t    = Date.now()（毫秒）
//      key  = iv = reverse(String(t*299) + '1')   ← all.min.js 里 String.prototype.rand = 反转字符串
//                   （t*299 是 15 位数字，加个 '1' 再反转 ⇒ 16 字节 ⇒ AES-128）
//      md5  = parseInt(reverse(String(t*177)+'1')).toString(16)   ← 只是 cache buster
//      请求：CryptoJS.AES.encrypt(JSON.stringify(params), key, {iv:key, mode:CBC}) → 默认 PKCS7 →
//            base64 密文，放进表单字段 data
//      响应：{code:200, data:"<base64>"} → AES-CBC 解密（同一个 key）→ JSON.parse
//      实测与站点一致（Node 侧用 crypto 对照过：列表 20 条 / 详情 / 搜索都能解出明文）。
//
// ── 四、播放地址（vodPlayUrl 是站内相对路径）
//      info.vodPlayUrl = "/api/m3u8/<32位hash>.m3u8"，拼 {BASE} 就是播放列表。
//      实测（m3u8 直接取，200 + #EXTM3U）：
//        · 66 段 / 累计 519 秒，`#EXT-X-KEY:METHOD=AES-128,URI="/api/m3u8/md5/<hash>.php"`
//        · 分片是 CDN 上的 `.pdf`（实为加密切片，807KB/片，content-type application/pdf）
//        · key 接口匿名就返回 16 字节（实测 c7719993…），播放器自己解，本源不碰
//      ⇒ 整片，不需要登录。
//
// ── 五、⚠ UA 白名单：本站只认桌面 UA（这条最容易踩）
//      iPhone / iPad / Android / 无 UA 打 /awsapi/*.php 与 /api/m3u8/* 都是 **nginx 404**；
//      Chrome 桌面 UA 同一条地址 200。所以本源所有请求都显式带桌面 UA，并且把桌面 UA + Referer
//      放进 content() 的 headers —— 播放器取播放列表与 AES key 时也得带同样的头。
//      CDN 分片（ps1.*.icu/…pdf）不挑 UA。
//
// ── 六、VIP / 登录（实测结论，不粉饰）
//      · 卡片模板按 typeId 分红标：`{{if vo.typeId == 6}}免费{{else}}VIP{{/if}}`；
//        导航里的「免费」就是 type=6，其余（国产/传媒/日韩/欧美/动漫）都标 VIP。
//      · 但那只是**角标**：匿名请求 search.php 拿到的每一条都直接带 vodPlayUrl，
//        实测 VIP 分类（typeId=1）的 66 段 / 519 秒播放列表匿名就能取到、能播整片；
//        免登录、无试看片段（info 里也没有 preview 字段这类东西）。
//      · 所以本源不写任何登录逻辑、不伪造会员身份：拿到 id 就能出整片。
//        真正要登录才有的是收藏/浏览记录/求片（/user/*.php），本源不碰。
//      · 万一某条 info 里 vodPlayUrl 为空，抛可读错误，不编造地址。
//
// ── 七、封面是**字节反转的 JPEG**，本源只能如实返回原地址
//      vodPic 形如 https://ps1.livoart.icu/.../<hash>.ttf，取回来头 4 字节是 d9ff0149、尾 4 字节是
//      ffd8ffe0 —— 整张 JPEG 被逐字节反转了（站点前端 Boot.getCover 就是 fetch 后
//      `new Uint8Array(buf).reverse()` 再 createObjectURL）。脚本没有「反转图片字节」的能力，
//      所以封面在 App 里会显示成占位图：这是站点侧的限制，不是解析错了。
//
// ── 八、分类/标签过滤：不接涉未成年的内容
//      本站 tag 里确实有「萝莉 / 萝莉少女 / 学生」这类，本源在**条目级**过滤掉
//      （见 BANNED_WORDS，命中 vodTag 或 vodName 即丢弃），分类里也不会出现这类入口。
//
// ── 九、自测（开发期，Node 侧直连即可，不需要代理）
//      node tools/lume-source-check.mjs sources/video/aido8.js --keyword 国产
//      2026-10-25 结果：[PASS]，categories 9 个 / list 20 条 hasMore=true / detail 有标题 /
//      chapters 1 集 / content 给出 m3u8、playable probe 200 + #EXTM3U。
//
// ── 十、已知限制（实测，照实说）
//    1) 封面：站点把 JPEG 逐字节反转了（第 7 节），脚本没有字节级图像处理能力，封面在 App 里
//       会是占位图；列表/详情的**标题、时长、播放量、标签都正常**。想修只能在宿主图片管线里做。
//    2) UA：/awsapi/*.php 与 /api/m3u8/*（含 `.../md5/<hash>.php` 那把 AES key）只认桌面 UA。
//       本源把桌面 UA 放进了 content().headers；如果播放器**不透传**逐请求头，播放列表或 key
//       会被 nginx 判 404 —— 这是本源的已知边界，不是解析失败。
//    3) 列表/详情要 300~700ms、home 约 1 秒（已经并发取四块），在 App 预算内。
//    4) 页面里的「线路1/线路2」是站点给 VIP 线路切换用的 UI（写 cookie `line`），接口只发一条
//       m3u8，本源不伪造多线路。

var DEFAULT_BASE = 'https://ww15.aido8.icu';
var PAGE_SIZE = 20;
var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 条目级黑名单：命中标签或标题就整条丢弃（不接涉未成年内容）
var BANNED_WORDS = ['萝莉', '幼齿', '幼女', '未成年', '小学生', '中学生', '高中生', '学生', '校服', '童颜', '女童'];

// 封面：站点把 JPEG 逐字节反转后当 `.ttf` 发（前 4 字节是 JPEG 尾）。
// App 图片管线支持 `reverse` 解码，这里把编码方式随封面一起交给它。
var COVER_HEADERS = { 'x-lume-image-encoding': 'reverse' };

/* ========================= 纯 JS AES-128-CBC（加/解密 + base64） ========================= */
// 站点前端用 CryptoJS；本沙箱不保证有 tools.aes / atob，所以这里自带一份最小实现。
var AES_EXP = new Array(256);
var AES_LOG = new Array(256);
(function buildLogTables() {
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

/// 密钥扩展：keyBytes 长度 16/24/32 → AES-128/192/256
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

function aesAddRoundKey(state, key, round) {
  for (var index = 0; index < 16; index++) state[index] ^= key[round * 16 + index];
}

// state 布局：index = row + 4*col（FIPS 的 in[r + 4c]）
// ShiftRows：第 r 行左移 r 位 → 旧列 j 落到新列 (j - r + 4) % 4
function aesShiftRows(state) {
  for (var row = 1; row < 4; row++) {
    var a = state[row];
    var b = state[row + 4];
    var c = state[row + 8];
    var d = state[row + 12];
    state[row + 4 * ((0 - row + 4) % 4)] = a;
    state[row + 4 * ((1 - row + 4) % 4)] = b;
    state[row + 4 * ((2 - row + 4) % 4)] = c;
    state[row + 4 * ((3 - row + 4) % 4)] = d;
  }
}

// InvShiftRows：第 r 行右移 r 位 → 旧列 j 落到新列 (j + r) % 4
function aesInvShiftRows(state) {
  for (var row = 1; row < 4; row++) {
    var a = state[row];
    var b = state[row + 4];
    var c = state[row + 8];
    var d = state[row + 12];
    state[row + 4 * ((0 + row) % 4)] = a;
    state[row + 4 * ((1 + row) % 4)] = b;
    state[row + 4 * ((2 + row) % 4)] = c;
    state[row + 4 * ((3 + row) % 4)] = d;
  }
}

function aesMixColumns(state) {
  for (var col = 0; col < 4; col++) {
    var base = 4 * col;
    var a0 = state[base];
    var a1 = state[base + 1];
    var a2 = state[base + 2];
    var a3 = state[base + 3];
    state[base] = aesMul(a0, 2) ^ aesMul(a1, 3) ^ a2 ^ a3;
    state[base + 1] = a0 ^ aesMul(a1, 2) ^ aesMul(a2, 3) ^ a3;
    state[base + 2] = a0 ^ a1 ^ aesMul(a2, 2) ^ aesMul(a3, 3);
    state[base + 3] = aesMul(a0, 3) ^ a1 ^ a2 ^ aesMul(a3, 2);
  }
}

function aesInvMixColumns(state) {
  for (var col = 0; col < 4; col++) {
    var base = 4 * col;
    var a0 = state[base];
    var a1 = state[base + 1];
    var a2 = state[base + 2];
    var a3 = state[base + 3];
    state[base] = aesMul(a0, 14) ^ aesMul(a1, 11) ^ aesMul(a2, 13) ^ aesMul(a3, 9);
    state[base + 1] = aesMul(a0, 9) ^ aesMul(a1, 14) ^ aesMul(a2, 11) ^ aesMul(a3, 13);
    state[base + 2] = aesMul(a0, 13) ^ aesMul(a1, 9) ^ aesMul(a2, 14) ^ aesMul(a3, 11);
    state[base + 3] = aesMul(a0, 11) ^ aesMul(a1, 13) ^ aesMul(a2, 9) ^ aesMul(a3, 14);
  }
}

function aesEncryptBlock(block, expanded) {
  var state = new Array(16);
  var index;
  for (index = 0; index < 16; index++) state[index] = block[index];
  aesAddRoundKey(state, expanded.schedule, 0);
  for (var round = 1; round <= expanded.rounds; round++) {
    for (index = 0; index < 16; index++) state[index] = AES_SBOX[state[index]];
    aesShiftRows(state);
    if (round !== expanded.rounds) aesMixColumns(state);
    aesAddRoundKey(state, expanded.schedule, round);
  }
  return state;
}

function aesDecryptBlock(block, expanded) {
  var state = new Array(16);
  var index;
  for (index = 0; index < 16; index++) state[index] = block[index];
  aesAddRoundKey(state, expanded.schedule, expanded.rounds);
  for (var round = expanded.rounds - 1; round >= 1; round--) {
    aesInvShiftRows(state);
    for (index = 0; index < 16; index++) state[index] = AES_INV_SBOX[state[index]];
    aesAddRoundKey(state, expanded.schedule, round);
    aesInvMixColumns(state);
  }
  aesInvShiftRows(state);
  for (index = 0; index < 16; index++) state[index] = AES_INV_SBOX[state[index]];
  aesAddRoundKey(state, expanded.schedule, 0);
  return state;
}

var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64Encode(bytes) {
  var out = '';
  var index = 0;
  while (index < bytes.length) {
    var b0 = bytes[index++];
    var b1 = index < bytes.length ? bytes[index++] : -1;
    var b2 = index < bytes.length ? bytes[index++] : -1;
    out += B64_CHARS.charAt(b0 >> 2);
    out += B64_CHARS.charAt(((b0 & 3) << 4) | (b1 < 0 ? 0 : b1 >> 4));
    out += b1 < 0 ? '=' : B64_CHARS.charAt(((b1 & 15) << 2) | (b2 < 0 ? 0 : b2 >> 6));
    out += b2 < 0 ? '=' : B64_CHARS.charAt(b2 & 63);
  }
  return out;
}

function b64Decode(text) {
  var source = String(text == null ? '' : text).replace(/[^A-Za-z0-9+/]/g, '');
  var out = [];
  var buffer = 0;
  var bits = 0;
  for (var index = 0; index < source.length; index++) {
    buffer = (buffer << 6) | B64_CHARS.indexOf(source.charAt(index));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

function utf8Encode(text) {
  var out = [];
  for (var index = 0; index < text.length; index++) {
    var code = text.charCodeAt(index);
    if (code < 0x80) out.push(code);
    else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      var next = text.charCodeAt(index + 1);
      var pair = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
      index++;
      out.push(0xf0 | (pair >> 18), 0x80 | ((pair >> 12) & 63), 0x80 | ((pair >> 6) & 63), 0x80 | (pair & 63));
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
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
    } else {
      code = first & 0x07;
      extra = 3;
    }
    for (var step = 0; step < extra; step++) code = (code << 6) | (bytes[index + step] & 0x3f);
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

/// AES-CBC 加密 + PKCS7 + base64（站点 AwsApi.encode）
function aesCbcEncryptBase64(plain, keyText) {
  var key = utf8Encode(keyText);
  var expanded = aesExpandKey(key);
  var data = utf8Encode(plain);
  var pad = 16 - (data.length % 16);
  for (var p = 0; p < pad; p++) data.push(pad);
  var previous = key.slice(0, 16);
  var out = [];
  for (var offset = 0; offset < data.length; offset += 16) {
    var block = [];
    for (var i = 0; i < 16; i++) block.push(data[offset + i] ^ previous[i]);
    var encrypted = aesEncryptBlock(block, expanded);
    for (var k = 0; k < 16; k++) out.push(encrypted[k]);
    previous = encrypted;
  }
  return b64Encode(out);
}

/// base64 + AES-CBC 解密 + 去 PKCS7（站点 AwsApi.decode）
function aesCbcDecryptBase64(cipherText, keyText) {
  var key = utf8Encode(keyText);
  var expanded = aesExpandKey(key);
  var data = b64Decode(cipherText);
  var previous = key.slice(0, 16);
  var plain = [];
  for (var offset = 0; offset + 16 <= data.length; offset += 16) {
    var block = data.slice(offset, offset + 16);
    var decoded = aesDecryptBlock(block, expanded);
    for (var i = 0; i < 16; i++) plain.push(decoded[i] ^ previous[i]);
    previous = block;
  }
  var pad = plain.length ? plain[plain.length - 1] : 0;
  if (pad > 0 && pad <= 16) plain = plain.slice(0, plain.length - pad);
  return utf8Decode(plain);
}

/* ============================== 站点工具 ============================== */

function base() {
  var config = typeof LumeSource !== 'undefined' && LumeSource.config ? LumeSource.config : null;
  var domain = config && config.domain ? String(config.domain) : '';
  return (domain || DEFAULT_BASE).replace(/\/+$/, '');
}

/// all.min.js: String.prototype.rand = 反转字符串
function reverse(text) {
  return String(text).split('').reverse().join('');
}

/// AwsApi.getRsaKey(t) = reverse((t*299) + '1') → 16 字节，key 与 iv 都是它
function cryptoKey(timestamp) {
  return reverse(String(timestamp * 299) + '1');
}

function entity(text) {
  return String(text == null ? '' : text).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (all, code) {
    var map = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
    if (map[code] !== undefined) return map[code];
    if (code.charAt(0) === '#') {
      var n = code.charAt(1) === 'x' || code.charAt(1) === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (isFinite(n) && n > 0 && n < 0x110000) return String.fromCharCode(n);
    }
    return all;
  });
}

function clean(text) {
  var out = String(text == null ? '' : text)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return entity(out).replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  var value = entity(String(url == null ? '' : url)).trim();
  if (!value) return '';
  if (value.indexOf('//') === 0) return 'https:' + value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.charAt(0) === '/') return base() + value;
  return base() + '/' + value;
}

function seconds(value) {
  var n = Number(value);
  if (!isFinite(n) || n <= 0) return '';
  var total = Math.round(n);
  var minute = Math.floor(total / 60);
  var second = total % 60;
  return minute + ':' + (second < 10 ? '0' + second : String(second));
}

function hitsText(value) {
  var n = Number(value);
  if (!isFinite(n) || n <= 0) return '';
  if (n >= 10000) {
    var w = n / 10000;
    return (w >= 100 ? w.toFixed(0) : w.toFixed(1)) + '万播放';
  }
  return n + ' 播放';
}

/// 桌面 UA 是硬门槛：iPhone/Android UA 打 /awsapi/* 与 /api/m3u8/* 都是 nginx 404
function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    Referer: referer || base() + '/',
    Origin: base()
  };
}

function mediaHeaders(referer) {
  return { 'User-Agent': UA, Referer: referer || base() + '/', Accept: '*/*' };
}

async function getText(path, referer) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var response;
  try {
    response = await LumeSource.http.get(url, { headers: headers(referer) });
  } catch (error) {
    throw new Error(
      '爱豆连不上（' + String((error && error.message) || error).slice(0, 80) + '）——可在「源设置 → 换网址」里换一条 ww{N}.aido8.icu 线路'
    );
  }
  var status = Number((response && response.status) || 0);
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：爱豆要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('爱豆：请求失败（HTTP ' + status + '）' + String(path).slice(0, 80));
  return String((response && response.body) || '');
}

/// POST /awsapi/<path>?md5=<rand>，body 为加密后的 data 字段
async function awsApi(path, payload) {
  var timestamp = Date.now();
  var cipher = aesCbcEncryptBase64(JSON.stringify(payload || {}), cryptoKey(timestamp));
  var md5Token = parseInt(reverse(String(timestamp * 177) + '1'), 10).toString(16);
  var url = base() + '/awsapi' + path + '?md5=' + md5Token;
  var body = 'data=' + encodeURIComponent(cipher);
  var response;
  try {
    response = await LumeSource.http.post(url, body, { headers: headers(base() + '/vod/type/1.html') });
  } catch (error) {
    throw new Error(
      '爱豆连不上（' + String((error && error.message) || error).slice(0, 80) + '）——可在「源设置 → 换网址」里换一条 ww{N}.aido8.icu 线路'
    );
  }
  var status = Number((response && response.status) || 0);
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：爱豆接口要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('爱豆：接口失败（HTTP ' + status + '）' + path);
  var text = String((response && response.body) || '');
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('爱豆：接口返回的不是 JSON（可能被拦截或改版）' + path);
  }
  if (Number(parsed.code) !== 200) {
    throw new Error('爱豆：接口报错（code ' + parsed.code + ' ' + String(parsed.message || '') + '）' + path);
  }
  var plain;
  try {
    plain = aesCbcDecryptBase64(String(parsed.data || ''), cryptoKey(timestamp));
  } catch (error) {
    throw new Error('爱豆：回包解不开（加解密常量可能变了）' + path);
  }
  try {
    return JSON.parse(plain);
  } catch (error) {
    throw new Error('爱豆：回包解密后不是 JSON：' + plain.slice(0, 80));
  }
}

/* ============================== 解析 ============================== */

function banned(row) {
  var text = String(row.vodTag || '') + ' ' + String(row.vodName || '');
  for (var index = 0; index < BANNED_WORDS.length; index++) {
    if (text.indexOf(BANNED_WORDS[index]) >= 0) return true;
  }
  return false;
}

function itemOf(row) {
  if (!row || row.vodId == null) return null;
  if (banned(row)) return null;
  var bits = [];
  var hits = hitsText(row.vodHits);
  if (hits) bits.push(hits);
  var tag = String(row.vodTag || '').split(',')[0].trim();
  if (tag) bits.push(tag);
  return {
    id: String(row.vodId),
    title: clean(row.vodName) || String(row.vodId),
    // 站点的封面是字节反转的 JPEG（见文件头第 7 节），交给图片管线解码
    cover: absolute(row.vodPic),
    coverHeaders: COVER_HEADERS,
    subtitle: bits.join(' · ')
  };
}

function itemsOf(rows) {
  var items = [];
  for (var index = 0; index < (rows || []).length; index++) {
    var item = itemOf(rows[index]);
    if (item) items.push(item);
  }
  return items;
}

/// 首页导航 → 分类（实时抓；抓不到用兜底）
async function navCategories() {
  var html = await getText('/');
  var block = /<ul class="publicNavList">([\s\S]*?)<\/ul>/i.exec(html);
  if (!block) return [];
  var rows = [];
  var seen = {};
  var re = /<a\s+href="([^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/gi;
  var matched;
  while ((matched = re.exec(block[1])) !== null) {
    var href = matched[1];
    var name = clean(matched[2]);
    if (!name) continue;
    var id = '';
    var typeHit = /\/vod\/type\/(\d+)\.html/i.exec(href);
    var labelHit = /\/vod\/label\/([a-z0-9_-]+)\.html/i.exec(href);
    var byHit = /\/vod\/by\/([a-z0-9_-]+)\.html/i.exec(href);
    if (typeHit) id = 'type/' + typeHit[1];
    else if (labelHit) id = 'label/' + labelHit[1];
    else if (byHit) id = 'by/' + byHit[1];
    if (!id || seen[id]) continue;
    seen[id] = 1;
    rows.push({ id: id, title: name });
  }
  return rows;
}

var FALLBACK_CATEGORIES = [
  { id: 'label/new', title: '最近更新' },
  { id: 'label/hot', title: '热门事件' },
  { id: 'label/good', title: '视频精选' },
  { id: 'type/1', title: '国产' },
  { id: 'type/5', title: '传媒' },
  { id: 'type/2', title: '日韩' },
  { id: 'type/3', title: '欧美' },
  { id: 'type/4', title: '动漫' },
  { id: 'type/6', title: '免费' }
];

var SORT_BY = {
  'label/new': 'vod_time',
  'by/time': 'vod_time',
  'label/hot': 'vod_hits',
  'by/hits': 'vod_hits',
  'label/good': 'vod_down',
  'by/score': 'vod_score'
};

/// 把 categoryId 翻译成 search.php 的参数
function queryOf(categoryId) {
  var id = String(categoryId || '').trim();
  if (!id) id = 'label/new';
  if (SORT_BY[id]) {
    return { type: '', by: SORT_BY[id], order: 'desc', tag: '', keyword: '', count: '', extypes: '6' };
  }
  var typeHit = /^type\/(\d+)$/.exec(id);
  if (typeHit) {
    var typeId = typeHit[1];
    // typeId==6 是「免费」，页面里 extypes 只在非免费时才拼 6（见 initVods）
    return { type: typeId, by: 'vod_time', order: 'desc', tag: '', keyword: '', count: '', extypes: typeId === '6' ? '' : '6' };
  }
  return { type: '', by: 'vod_time', order: 'desc', tag: '', keyword: '', count: '', extypes: '6' };
}

async function fetchList(params) {
  var payload = {
    type: params.type == null ? '' : String(params.type),
    by: params.by || 'vod_time',
    order: params.order || 'desc',
    page: params.page || 1,
    size: params.size || PAGE_SIZE,
    tag: params.tag == null ? '' : String(params.tag),
    keyword: params.keyword == null ? '' : String(params.keyword),
    count: params.count == null ? '' : String(params.count),
    extypes: params.extypes == null ? '' : String(params.extypes)
  };
  return awsApi('/vod/search.php', payload);
}

/* ============================== 图源契约 ============================== */

var CATEGORY_CACHE = null;

var LumeSource = {
  id: 'aido8_video',
  name: '爱豆 18+',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://ww15.aido8.icu', 'https://ww1.aido8.icu', 'https://ww5.aido8.icu'],

  /// 分类＝首页导航那一排（实时抓；站点改导航跟着变）
  async categories() {
    if (CATEGORY_CACHE && CATEGORY_CACHE.length) return CATEGORY_CACHE;
    var rows = [];
    try {
      rows = await navCategories();
    } catch (error) {
      rows = [];
    }
    if (!rows.length) rows = FALLBACK_CATEGORIES.slice(0);
    CATEGORY_CACHE = rows;
    return rows;
  },

  /// 首页：站点首页那几个模块（免费视频 / 重磅热推 / 今日上新 / 人气排行）
  /// 四块并发取（串行会吃掉 App 单次调用预算）
  async home() {
    var boards = [
      { title: '最近更新', moreUrl: 'label/new', params: queryOf('label/new') },
      { title: '视频精选', moreUrl: 'label/good', params: queryOf('label/good') },
      { title: '热门事件', moreUrl: 'label/hot', params: queryOf('label/hot') },
      { title: '免费视频', moreUrl: 'type/6', params: queryOf('type/6') }
    ];
    var results = await Promise.all(
      boards.map(function (board) {
        return fetchList({ page: 1, size: 18, type: board.params.type, by: board.params.by, extypes: board.params.extypes }).then(
          function (page) {
            return itemsOf(page.rows);
          },
          function () {
            return [];
          }
        );
      })
    );
    var out = [];
    for (var index = 0; index < boards.length; index++) {
      if (results[index] && results[index].length) {
        out.push({ title: boards[index].title, moreUrl: boards[index].moreUrl, items: results[index] });
      }
    }
    if (!out.length) throw new Error('爱豆：首页四个模块都没解析出条目（站点可能改版）');
    return out;
  },

  /// 列表 / 搜索：都走 /awsapi/vod/search.php
  async list(argument) {
    var args = argument || {};
    var page = Math.max(1, Number(args.page) || 1);
    var keyword = clean(args.keyword || '').trim();
    var params;
    if (keyword) {
      params = { type: '', by: 'vod_time', order: 'desc', tag: '', keyword: keyword, count: '', extypes: '6', page: page, size: PAGE_SIZE };
    } else {
      params = queryOf(args.categoryId);
      params.page = page;
      params.size = PAGE_SIZE;
    }
    var data = await fetchList(params);
    var rows = data.rows || [];
    var totalPages = Number(data.total || 0);
    return {
      items: itemsOf(rows),
      hasMore: totalPages > 0 ? page < totalPages : rows.length >= PAGE_SIZE
    };
  },

  /// 详情：/awsapi/vod/info.php
  async detail(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id || !/^\d+$/.test(id)) return null;
    var info;
    try {
      info = await awsApi('/vod/info.php', { id: id });
    } catch (error) {
      var message = String((error && error.message) || error);
      if (/404/.test(message)) return null;
      throw error;
    }
    if (!info || info.vodId == null) return null;
    var tags = String(info.vodTag || '').split(',').map(function (text) { return text.trim(); }).filter(Boolean);
    var bits = [];
    if (tags.length) bits.push(tags.slice(0, 3).join('/'));
    if (hitsText(info.vodHits)) bits.push(hitsText(info.vodHits));
    if (info.vodTime) bits.push(String(info.vodTime));
    var description = [];
    description.push('站点：' + base());
    if (info.vodTime) description.push('上架：' + info.vodTime);
    description.push('播放：' + (hitsText(info.vodHits) || '-'));
    if (tags.length) description.push('标签：' + tags.join('、'));
    if (info.vodPlayFrom) description.push('播放器：' + info.vodPlayFrom);
    description.push('片源：整片 m3u8（匿名可取，见本源头部「VIP / 登录」一节）');
    return {
      id: String(info.vodId),
      title: clean(info.vodName) || String(info.vodId),
      cover: absolute(info.vodPic),
      coverHeaders: COVER_HEADERS,
      subtitle: bits.join(' · '),
      description: description.join('\n')
    };
  },

  /// 一条视频就是一个整片，没有分 P
  async chapters(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id) return [];
    return [{ id: id, title: '正片' }];
  },

  /// 播放：info.vodPlayUrl 是站内相对路径 `/api/m3u8/<hash>.m3u8`，拼 BASE 即可
  /// 注意 headers 里必须带桌面 UA（播放列表与 AES key 都在 UA 白名单后面）
  async content(argument) {
    var args = argument || {};
    var id = String(args.id || args.chapterId || '').trim();
    if (!/^\d+$/.test(id)) throw new Error('爱豆：缺少视频 id（应来自 list/detail）');
    var info = await awsApi('/vod/info.php', { id: id });
    var playPath = String((info && info.vodPlayUrl) || '').trim();
    if (!playPath) throw new Error('爱豆：这条视频没有播放地址（' + id + '）');
    var url = /^https?:\/\//i.test(playPath) ? playPath : base() + (playPath.charAt(0) === '/' ? playPath : '/' + playPath);
    var pageUrl = base() + '/vod/play/' + id + '.html';
    return { kind: 'video', url: url, headers: mediaHeaders(pageUrl) };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
