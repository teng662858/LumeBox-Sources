// LumeSource: {"id":"tangtoutiao_video","name":"汤头条 18+","version":"1.0.1","category":"video","mirrors":["https://p1.wgbqoiqv.com","https://p2.wgbqoiqv.com","https://p3.wgbqoiqv.com"]}
//
// 站点：汤头条（<title> 就是「汤头条」）——Nuxt 3 PWA（SSR 关掉：`<script id="__NUXT_DATA__">` 里
// `serverRendered:false`，页面 HTML 只有一个 loading 骨架），数据全走自己的接口。2026-10-25 实测。
//
// ── 一、线路（镜像）与「站点域 / 接口域」是两套
//    · 站点：https://p{N}.wgbqoiqv.com/ 实测 p1..p5 全部 200、首页同字节（/_nuxt/ 资源同名）
//      ⇒ 同一套站的多条线路。裸域 wgbqoiqv.com 连不上（000），所以只写 p{N} 前缀。
//    · 接口：**不在站点域上**，是 build 里写死的 `https://api4.z3h4q3fjy.cc/pwa.php`
//      （entry.js 里 `cfg0.api = {baseURL:"https://api4.z3h4q3fjy.cc/pwa.php", version:"9.7.1"}`；
//        api1..api5 同形都能应答，本源按 build 里的 api4 走）。
//      ⇒ 换线路（mirrors）只影响网页视图地址，接口地址不跟着变；本源照 build 的 api4。
//
// ── 二、接口协议：POST 表单 + AES-256-CFB(NoPadding) + hex + 双哈希签名
//    entry.js 里的 `reqConfig` / `resConfig` / `Encrypt` / `Decrypt` / `getSign` 实测复刻：
//      常量（前端把字符码点写成 "55_50_48…" 再拼接，这里直接给出拼好的结果）
//        key = appkey = "7205a6c3883caf95b52db5b534e12ec3"（32 字节 → AES-256）
//        iv           = "81d7beac44a86f43"（16 字节）
//      请求体（application/x-www-form-urlencoded）
//        data = AES-256-CFB(JSON 明文) 的十六进制大写
//        ts   = 秒级时间戳
//        sign = MD5( hex( SHA256( "client=pwa&data=<data>&timestamp=<ts>" + appkey ) ) )
//        body = client=pwa&sign=<sign>&timestamp=<ts>&data=<data>
//      明文 = 固定鉴权字段 + 业务参数（前端 auth_data 全量带上，缺了会被判「用户已过期」）：
//        system_version=9.7.1, system_token="", system_oauth_new_id="", system_oauth_type=pwa,
//        system_oauth_id=<19 位随机字母数字（前端 generate() 生成）>, system_app_type="",
//        system_build="", system_build_id="", trace_id="", aff_x_code="", support_webp=1
//      回包 = {errcode:0, timestamp, sign, data:"<hex>"} → AES-256-CFB 解密 → {status, data, msg,
//             isVip, daily_view}；status!==200 视为业务错误（msg 原样抛出）。
//      签名不对时服务端回一个**固定的**密文（解出来是「签名失败」），所以本源不能省这一步。
//    AES 与 CFB 都在本文件里用纯 JS 实现（沙箱的 tools.aes 只给 CBC/ECB，没有 CFB），
//    MD5/SHA256 用宿主的 LumeSource.tools.digest（App 与离线跑测工具都实现了）。
//
// ── 三、接口一览（实测 200 + 可解）
//    分类    POST /api/tab/listv1                        → [{id,name,type,api,params}, …]
//    列表    POST /api/MvList/featured      {tabId,page} → {list:[…]}（**每页 10 条**）
//            POST /api/MvList/featuredzpc  {page}       → {list:[…]}（制片厂，每页 30 条）
//    详情    POST /api/MvDetail/detail      {id}         → {detail, recommend, comment, …}
//    搜索    POST /api/MvSearch/search      {keyword,type:"long",page} → {list, total, lastId}
//            （实测每页 20 条，翻到 page=25 仍有货；`total` 恒为 20，不能当总页数用，
//              所以 hasMore 按「本页是否拿满 20 条」判断）
//    关注/主题/推荐不做：/api/MvList/follow 要登录；/api/element/list_element 与
//    /api/MvList/recommend 返回的是**模块/挂件**（widget 里还有一条 `luoli/seventeen` 的广告链接），
//    不是视频列表 —— 本源既不接这类挂件，也不接任何涉未成年的入口。
//
// ── 四、播放地址（列表行里就带着，详情行里也有）
//    source_origin / source_240 / source_480 / source_720 / source_1080 → m3u8 或 mp4（带 auth_key，
//    实测 m3u8 200 + `#EXTM3U`，分片是 CDN 上的 `.ts`，key 走 `#EXT-X-KEY` 的 crypt.key）。
//    实测：免费条目 source_240 的播放列表 39 段 / 195 秒，与 duration=194 秒对得上 ⇒ 整片。
//
// ── 五、VIP / 付费（实测结论，不粉饰）
//    1) 列表/详情里 `isfree`（1=免费，0=付费）+ `coins`（解锁要几个汤币）+ `preview_tip`
//       （「开通VIP解锁完整版」「5汤币解锁完整版>」）标出付费条目；接口另带 `daily_view: 3`
//       （非会员每天 3 次）。站点是真有付费墙，不是摆设。
//    2) 付费条目的 `source_*` 是**统一占位地址**：多条不同的付费视频 source_240 都指向同一个
//       `/play/e7b72da296acb31bbaa0869dc1eaae5a/e7b72….m3u8`，实测该播放列表只有 **1 段 / 2 秒**。
//       ⇒ 付费条目的 source_* 是**假的**，不能当正片播。
//    3) 匿名能拿到的真实可播地址只有 `preview_video`：实测 25 段 / 126 秒，
//       而该条标称 duration=675 秒 ⇒ 就是**约 2 分钟试看**，不是整片。
//    4) 所以本源的办法是（不伪造）：
//       · isfree=1 → 用 source_1080/720/480/240/origin 里第一个非空地址，播放器里是整片；
//       · isfree=0 → 只返回 preview_video，清晰度标签写「试看 2 分钟」，详情说明里如实写
//         「该条为付费内容，服务端只发试看片段」；
//       · 两条都没有 → 抛可读错误，不编造地址。
//       本源不做登录、不伪造会员身份（真要整片得自己在站点里付费解锁，那是站点的事）。
//
// ── 六、封面
//    thumb_cover 是一段 JSON 字符串：{"ori":"…","360":"…","720":"…"}，本源取 720 → ori → 360，
//    实测 https://new2.drleao.cn/…!720x0.jpeg.webp 200 + image/jpeg，可直接显示。
//
// ── 七、标签过滤：不接涉未成年的内容
//    条目级过滤（BANNED_WORDS 命中 tags 或 title 就整条丢弃），分类只用站点自己的视频 tab。
//
// ── 八、自测（开发期，Node 侧直连即可，不需要代理）
//      node tools/lume-source-check.mjs sources/video/tangtoutiao.js --keyword 国产
//      2026-10-25 结果：[PASS]，categories 8 个 / list 10 条 hasMore=true / detail 有标题封面 /
//      chapters 1 集 / content 给出 m3u8、playable probe 200 + #EXTM3U。
//
// ── 九、已知限制（实测，照实说）
//    1) 接口慢且回包大：一条 list 请求 ~237KB、detail ~165KB、search ~148KB、制片厂 tab ~415KB，
//       单请求实测 1.3~6 秒（抖动大）。所以 home() 只取两个 tab 并发，categories 只取一次 tab 表。
//    2) 回包要先 AES-CFB 解密：App 侧走 `tools.aes`（原生 ECB 批量算密钥流，实测 32ms/52KB，
//       比纯 JS 快 13 倍）；离线跑测工具里 tools.aes 是 harnessUnsupported，会自动回落纯 JS
//       （415ms/52KB）——两条路输出逐字节一致，且下面用「能否 JSON.parse」做最终校验。
//    3) 制片厂 tab 一次回 30 条（不是 10），hasMore 按「本页是否满 10 条」判断，对它恒为 true
//       （page=2 实测仍有 30 条，可正常翻）。
//    4) 付费条目的整片拿不到（见第五节），本源只给试看；这不是脚本能绕的，也没去绕。
//    5) 接口域 api4.z3h4q3fjy.cc 与站点域 wgbqoiqv.com 分离：换线路只换站点域，
//       接口地址照 build 里写死的走；若接口域被封，需要改脚本里的 API_BASE。

var API_BASE = 'https://api4.z3h4q3fjy.cc/pwa.php';
var DEFAULT_SITE = 'https://p1.wgbqoiqv.com';
var APP_VERSION = '9.7.1';
var CFB_KEY = '7205a6c3883caf95b52db5b534e12ec3';
var CFB_IV = '81d7beac44a86f43';
var APP_KEY = CFB_KEY;
var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
var PAGE_SIZE = 10; // /api/MvList/featured 实测每页 10 条
var SEARCH_PAGE_SIZE = 20;
var BANNED_WORDS = ['萝莉', '幼齿', '幼女', '未成年', '小学生', '中学生', '高中生', '学生', '校服', '童颜', '女童'];
// 封面在 CDN 上是 AES-128-CBC/NoPadding 密文（站点 cropto-worker 用这对
// key/iv 解成 WebP/JPEG 再 createObjectURL）。把参数放进 coverHeaders，
// 由 App 图片管线用原生 AES 解，列表层不逐张跑纯 JS 解密。
var COVER_HEADERS = {
  'x-lume-image-encoding': 'aes-cbc-nopadding',
  'x-lume-image-key': 'f5d965df75336270',
  'x-lume-image-iv': '97b60394abc2fbe1'
};
// 付费条目的 source_* 统一指向这个占位路径（实测只有 1 段 / 2 秒），不能当正片
var LOCKED_MARK = 'e7b72da296acb31bbaa0869dc1eaae5a';

/* ===================== 纯 JS AES-256（只有正向加密，CFB 两种方向都用它） ===================== */
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
  }
})();

/// 密钥扩展（16/24/32 字节 → AES-128/192/256）
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

// state 布局：index = row + 4*col；第 r 行左移 r 位
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

/* ===================== 编码工具：UTF-8 / hex / CFB ===================== */

function utf8Encode(text) {
  var out = [];
  for (var index = 0; index < text.length; index++) {
    var code = text.charCodeAt(index);
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      var next = text.charCodeAt(index + 1);
      var pair = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
      index++;
      out.push(0xf0 | (pair >> 18), 0x80 | ((pair >> 12) & 63), 0x80 | ((pair >> 6) & 63), 0x80 | (pair & 63));
    } else out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
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
    } else out += String.fromCharCode(code);
  }
  return out;
}

function hexEncode(bytes) {
  var out = '';
  for (var index = 0; index < bytes.length; index++) {
    var byte = bytes[index];
    out += (byte < 16 ? '0' : '') + byte.toString(16);
  }
  return out.toUpperCase();
}

function hexDecode(text) {
  var source = String(text == null ? '' : text).replace(/[^0-9a-fA-F]/g, '');
  var out = [];
  for (var index = 0; index + 2 <= source.length; index += 2) out.push(parseInt(source.slice(index, index + 2), 16));
  return out;
}

/// CFB-128 加密：反馈的是**密文**（输出块）
function cfbEncryptBytes(bytes) {
  var expanded = aesExpandKey(utf8Encode(CFB_KEY));
  var state = utf8Encode(CFB_IV).slice(0, 16);
  var out = [];
  for (var offset = 0; offset < bytes.length; offset += 16) {
    var stream = aesEncryptBlock(state, expanded);
    var chunk = [];
    for (var index = 0; index < 16 && offset + index < bytes.length; index++) {
      chunk.push(bytes[offset + index] ^ stream[index]);
      out.push(bytes[offset + index] ^ stream[index]);
    }
    state = chunk.slice(0, 16);
    while (state.length < 16) state.push(0);
  }
  return out;
}

/// CFB-128 解密：反馈的是**输入的密文块**（不是解出来的明文）
function cfbDecryptBytes(bytes) {
  var expanded = aesExpandKey(utf8Encode(CFB_KEY));
  var state = utf8Encode(CFB_IV).slice(0, 16);
  var out = [];
  for (var offset = 0; offset < bytes.length; offset += 16) {
    var stream = aesEncryptBlock(state, expanded);
    var chunk = [];
    for (var index = 0; index < 16 && offset + index < bytes.length; index++) {
      var cipherByte = bytes[offset + index];
      chunk.push(cipherByte);
      out.push(cipherByte ^ stream[index]);
    }
    state = chunk.slice(0, 16);
    while (state.length < 16) state.push(0);
  }
  return out;
}

function cfbEncryptHex(plain) {
  return hexEncode(cfbEncryptBytes(utf8Encode(plain)));
}

function cfbDecryptHex(cipherHex) {
  return utf8Decode(cfbDecryptBytes(hexDecode(cipherHex)));
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

/// CFB 解密：密钥流其实就是「AES(反馈块)」的一串单块输出。App 侧可以用 tools.aes 的 ECB 一次性
/// 把这批单块算出来（原生实现，比纯 JS 快一个数量级）；离线跑测工具里 tools.aes 是未实现的
/// （harnessUnsupported），这里就回落到纯 JS。两条路输出必须一致，所以下面用「解开后能不能
/// JSON.parse」做最终校验，任何一步不对就整条回落。
var NATIVE_BLOCK_LIMIT = 24000; // 超过约 375KB 的回包直接走纯 JS，别把原生缓冲区塞爆

async function nativeDecryptHex(cipherHex) {
  var tools = typeof LumeSource !== 'undefined' ? LumeSource.tools : null;
  if (!tools || typeof tools.aes !== 'function') return null;
  var bytes = hexDecode(cipherHex);
  if (!bytes.length) return null;
  var blocks = Math.ceil(bytes.length / 16);
  if (blocks > NATIVE_BLOCK_LIMIT) return null;
  var iv = utf8Encode(CFB_IV);
  var feedback = [];
  var index;
  for (index = 0; index < blocks; index++) {
    var from = index === 0 ? iv : bytes.slice((index - 1) * 16, (index - 1) * 16 + 16);
    for (var step = 0; step < 16; step++) feedback.push(from[step]);
  }
  var reply;
  try {
    reply = await tools.aes({
      mode: 'ECB',
      encrypt: true,
      padding: 'none',
      key: b64Encode(utf8Encode(CFB_KEY)),
      iv: '',
      data: b64Encode(feedback)
    });
  } catch (error) {
    return null; // 沙箱没有原生 AES → 回落纯 JS
  }
  var stream = b64Decode(String(reply == null ? '' : reply));
  if (stream.length < bytes.length) return null;
  var out = [];
  for (index = 0; index < bytes.length; index++) out.push(bytes[index] ^ stream[index]);
  return utf8Decode(out);
}

/// 回包解密：先试原生（快），再回落纯 JS（离线工具/无原生能力时）；解析不出 JSON 就换另一条路
async function decryptPayload(cipherHex) {
  var text = await nativeDecryptHex(cipherHex);
  if (text != null) {
    try {
      return JSON.parse(text);
    } catch (error) {
      /* 原生路径结果不对 → 走纯 JS */
    }
  }
  return JSON.parse(cfbDecryptHex(cipherHex));
}

/* ============================== 站点工具 ============================== */

function site() {
  var config = typeof LumeSource !== 'undefined' && LumeSource.config ? LumeSource.config : null;
  var domain = config && config.domain ? String(config.domain) : '';
  return (domain || DEFAULT_SITE).replace(/\/+$/, '');
}

function clean(text) {
  return String(text == null ? '' : text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function seconds(value) {
  var n = Number(value);
  if (!isFinite(n) || n <= 0) return '';
  var total = Math.round(n);
  var minute = Math.floor(total / 60);
  var second = total % 60;
  return minute + ':' + (second < 10 ? '0' + second : String(second));
}

/// 前端 generate()：19 位字母数字（本地设备 id，随便给一个稳定值即可）
function deviceId() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var out = '';
  for (var index = 0; index < 19; index++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

var OAUTH_ID = null;

/// 与前端 reqConfig 一致的鉴权字段（缺一个就可能被判「用户已过期」）
function authPayload(params) {
  if (!OAUTH_ID) OAUTH_ID = deviceId();
  var payload = {
    system_version: APP_VERSION,
    system_token: '',
    system_oauth_new_id: '',
    system_oauth_type: 'pwa',
    system_oauth_id: OAUTH_ID,
    system_app_type: '',
    system_build: '',
    system_build_id: '',
    trace_id: '',
    aff_x_code: '',
    support_webp: 1
  };
  for (var key in params || {}) payload[key] = params[key];
  return payload;
}

/// 签名：MD5(hex(SHA256("client=pwa&data=<hex>&timestamp=<ts>" + appkey)))
async function signOf(dataHex, timestamp) {
  var tools = LumeSource && LumeSource.tools;
  if (!tools || typeof tools.digest !== 'function') {
    throw new Error('汤头条：沙箱缺少 tools.digest（需要 md5/sha256 算签名）');
  }
  var sha = await tools.digest('sha256', 'client=pwa&data=' + dataHex + '&timestamp=' + timestamp + APP_KEY);
  return await tools.digest('md5', String(sha));
}

/// POST {API_BASE}/{apiPath}（表单：client/sign/timestamp/data），回包解出 {status,data,msg}
async function api(apiPath, params) {
  var timestamp = Math.floor(Date.now() / 1000);
  var dataHex = cfbEncryptHex(JSON.stringify(authPayload(params)));
  var sign = await signOf(dataHex, timestamp);
  var body =
    'client=pwa&sign=' +
    encodeURIComponent(sign) +
    '&timestamp=' +
    timestamp +
    '&data=' +
    encodeURIComponent(dataHex);
  var url = API_BASE + '/' + String(apiPath).replace(/^\/+/, '');
  var response;
  try {
    response = await LumeSource.http.post(url, body, {
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/plain, */*',
        Origin: site(),
        Referer: site() + '/',
        system_version: APP_VERSION,
        system_oauth_type: 'pwa'
      }
    });
  } catch (error) {
    throw new Error(
      '汤头条连不上接口（' + String((error && error.message) || error).slice(0, 80) + '）——接口域是 api4.z3h4q3fjy.cc，可能需要代理'
    );
  }
  var status = Number((response && response.status) || 0);
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：汤头条接口要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('汤头条：接口失败（HTTP ' + status + '）' + apiPath);
  var envelope;
  try {
    envelope = JSON.parse(String((response && response.body) || ''));
  } catch (error) {
    throw new Error('汤头条：接口返回的不是 JSON（可能被拦截）' + apiPath);
  }
  if (Number(envelope.errcode) !== 0) {
    throw new Error('汤头条：接口报错（errcode ' + envelope.errcode + '）' + apiPath);
  }
  var plain;
  try {
    plain = await decryptPayload(String(envelope.data || ''));
  } catch (error) {
    throw new Error('汤头条：回包解不开（常量可能变了/签名被拒）' + apiPath);
  }
  if (Number(plain.status) === 401) {
    throw new Error('汤头条：接口要求登录态（401 ' + String(plain.msg || '') + '）');
  }
  if (Number(plain.status) !== 200) {
    throw new Error('汤头条：接口业务错误（' + plain.status + ' ' + String(plain.msg || '') + '）' + apiPath);
  }
  return plain;
}

/* ============================== 解析 ============================== */

function coverOf(raw) {
  var text = String(raw == null ? '' : raw).trim();
  if (!text) return '';
  if (text.charAt(0) === '{') {
    try {
      var map = JSON.parse(text);
      return String(map['720'] || map.ori || map['360'] || '');
    } catch (error) {
      /* 不是 JSON 就按纯地址处理 */
    }
  }
  return text;
}

function banned(row) {
  var tags = row && row.tags;
  var pool = String(row && row.title ? row.title : '');
  if (tags && tags.length) pool += ' ' + tags.join(' ');
  for (var index = 0; index < BANNED_WORDS.length; index++) {
    if (pool.indexOf(BANNED_WORDS[index]) >= 0) return true;
  }
  return false;
}

function itemOf(row) {
  if (!row || row.id == null) return null;
  if (banned(row)) return null;
  var bits = [];
  if (row.duration_str) bits.push(String(row.duration_str));
  if (row.count_play_str) bits.push(clean(row.count_play_str));
  else if (row.views_count_str) bits.push(clean(row.views_count_str) + ' 播放');
  if (Number(row.isfree) !== 1) bits.push('付费·试看');
  var tags = row.tags || [];
  if (tags.length) bits.push(String(tags[0]));
  return {
    id: String(row.id),
    title: clean(row.title) || String(row.id),
    cover: coverOf(row.thumb_cover || row.thumb_cover_str),
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

var TAB_CACHE = null;

/// 分类：站点自己的视频 tab（type=featured 的可分页列表）；关注/主题/推荐不接（见文件头第三节）
async function loadTabs() {
  if (TAB_CACHE && TAB_CACHE.length) return TAB_CACHE;
  var plain = await api('api/tab/listv1', {});
  var rows = Array.isArray(plain.data) ? plain.data : [];
  var tabs = [];
  for (var index = 0; index < rows.length; index++) {
    var tab = rows[index] || {};
    if (String(tab.type) !== 'featured') continue;
    if (!tab.api || !tab.id) continue;
    var name = clean(String(tab.name || ''));
    if (!name) continue;
    tabs.push({ id: 'tab:' + tab.id, title: name, api: String(tab.api).replace(/^\/+/, ''), params: tab.params || {} });
  }
  // 「最新」放第一位（站点 tab 顺序里它在中间；用户第一眼看最新更合理）
  for (var moved = 0; moved < tabs.length; moved++) {
    if (tabs[moved].title === '最新') {
      var picked = tabs.splice(moved, 1)[0];
      tabs.unshift(picked);
      break;
    }
  }
  if (!tabs.length) throw new Error('汤头条：tab 接口没返回视频分类（站点可能改版）');
  TAB_CACHE = tabs;
  return tabs;
}

/// 找分类：找不到就退回第一个（tab 变了也不至于整条列表挂掉）
async function tabOf(categoryId) {
  var id = String(categoryId || '').trim();
  var tabs = await loadTabs();
  for (var index = 0; index < tabs.length; index++) {
    if (tabs[index].id === id) return tabs[index];
  }
  return tabs[0];
}

/* ============================== 图源契约 ============================== */

var LumeSource = {
  id: 'tangtoutiao_video',
  name: '汤头条 18+',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://p1.wgbqoiqv.com', 'https://p2.wgbqoiqv.com', 'https://p3.wgbqoiqv.com'],

  /// 分类＝站点 tab 里的视频频道（实时抓）
  async categories() {
    var tabs = await loadTabs();
    return tabs.map(function (tab) {
      return { id: tab.id, title: tab.title };
    });
  },

  /// 首页：前两个「普通 tab」各取首屏（并发；本站接口单个回包 100KB+、常要 2~4 秒，
  /// 只取两块，且跳过「制片厂」这种一次回 29 条的大包 tab）
  async home() {
    var tabs = await loadTabs();
    var picks = tabs
      .filter(function (tab) {
        return /\/featured$/i.test(tab.api);
      })
      .slice(0, 2);
    if (!picks.length) picks = tabs.slice(0, 2);
    var results = await Promise.all(
      picks.map(function (tab) {
        var params = { page: 1 };
        for (var key in tab.params) params[key] = tab.params[key];
        return api(tab.api, params).then(
          function (plain) {
            var list = plain.data && plain.data.list ? plain.data.list : [];
            return itemsOf(list);
          },
          function () {
            return [];
          }
        );
      })
    );
    var boards = [];
    for (var index = 0; index < picks.length; index++) {
      if (results[index] && results[index].length) {
        boards.push({ title: picks[index].title, moreUrl: picks[index].id, items: results[index] });
      }
    }
    if (!boards.length) throw new Error('汤头条：首页三个频道都没解析出条目（站点可能改版）');
    return boards;
  },

  /// 列表 / 搜索
  async list(argument) {
    var args = argument || {};
    var page = Math.max(1, Number(args.page) || 1);
    var keyword = clean(args.keyword || '');
    if (keyword) {
      var searched = await api('api/MvSearch/search', { keyword: keyword, type: 'long', page: page });
      var rows = (searched.data && searched.data.list) || [];
      return { items: itemsOf(rows), hasMore: rows.length >= SEARCH_PAGE_SIZE };
    }
    var tab = await tabOf(args.categoryId);
    var params = { page: page };
    for (var key in tab.params) params[key] = tab.params[key];
    var plain = await api(tab.api, params);
    var list = (plain.data && plain.data.list) || [];
    return { items: itemsOf(list), hasMore: list.length >= PAGE_SIZE };
  },

  /// 详情
  async detail(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id) return null;
    var plain = await api('api/MvDetail/detail', { id: Number(id) });
    var row = plain.data && plain.data.detail;
    if (!row || row.id == null) return null;
    var tags = row.tags || [];
    var bits = [];
    if (row.duration_str) bits.push(String(row.duration_str));
    if (row.count_play_str) bits.push(clean(row.count_play_str));
    if (row.member && row.member.nickname) bits.push(clean(row.member.nickname));
    var paid = Number(row.isfree) !== 1;
    if (paid) bits.push('付费·仅试看');
    var description = [];
    if (row.member && row.member.nickname) description.push('作者：' + clean(row.member.nickname));
    description.push('时长：' + (row.duration_str || seconds(row.duration) || '-'));
    if (row.count_play_str) description.push('播放：' + clean(row.count_play_str));
    if (tags.length) description.push('标签：' + tags.join('、'));
    if (paid) {
      description.push('付费内容：' + (clean(row.preview_tip) || row.coins + ' 汤币解锁'));
      description.push('本源只能匿名拿到约 2 分钟试看片段（服务端不发整片），如实返回、不伪造');
    } else {
      description.push('片源：免登录整片 m3u8');
    }
    return {
      id: String(row.id),
      title: clean(row.title) || String(row.id),
      cover: coverOf(row.thumb_cover || row.thumb_cover_str),
      coverHeaders: COVER_HEADERS,
      subtitle: bits.join(' · '),
      description: description.join('\n')
    };
  },

  /// 一条视频 = 一个整片
  async chapters(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id) return [];
    return [{ id: id, title: '正片' }];
  },

  /// 播放：
  ///   免费（isfree=1）→ source_1080/720/480/240/origin 里第一个非空；
  ///   付费（isfree=0）→ source_* 是统一占位（1 段/2 秒），只用 preview_video（约 2 分钟试看）。
  async content(argument) {
    var args = argument || {};
    var id = String(args.id || args.chapterId || '').trim();
    if (!/^\d+$/.test(id)) throw new Error('汤头条：缺少视频 id（应来自 list/detail）');
    var plain = await api('api/MvDetail/detail', { id: Number(id) });
    var row = plain.data && plain.data.detail;
    if (!row) throw new Error('汤头条：这条视频没有数据（' + id + '）');
    var paid = Number(row.isfree) !== 1;
    var headers = { 'User-Agent': UA, Referer: site() + '/', Accept: '*/*' };
    var qualities = [];

    function push(label, url) {
      var text = String(url || '').trim();
      if (!text || !/^https?:\/\//i.test(text)) return;
      if (text.indexOf(LOCKED_MARK) >= 0) return; // 付费占位地址，跳过
      for (var index = 0; index < qualities.length; index++) {
        if (qualities[index].url === text) return;
      }
      qualities.push({ label: label, url: text });
    }

    if (!paid) {
      push('1080P', row.source_1080);
      push('720P', row.source_720);
      push('480P', row.source_480);
      push('标清', row.source_240);
      push('原片', row.source_origin);
    }
    // 试看地址：付费条目唯一真实可播的那条（免费条目也有，作为兜底）
    var preview = String(row.preview_video || '').trim();
    if (preview && /^https?:\/\//i.test(preview) && qualities.length === 0) {
      push('试看 2 分钟', preview);
    }
    if (!qualities.length) {
      throw new Error(
        '汤头条：这条视频没有可播地址（' + id + (paid ? '，付费内容只发试看片段且试看地址为空' : '') + '）'
      );
    }
    return { kind: 'video', url: qualities[0].url, headers: headers, qualities: qualities.length > 1 ? qualities : undefined };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
