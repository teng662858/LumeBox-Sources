// LumeSource: {"id":"yuese_video","name":"月色视频 18+","version":"1.0.1","category":"video","mirrors":["https://ys.ph3ywdns.icu"]}
//
// 站点：https://ys.ph3ywdns.icu （<title>月色视频</title>）
// 2026-10-25 实测；**本站直连 200，不需要代理**（本机 7890 代理也能用，脚本不硬编码任何代理）。
// 失败时抛的是可读错误（见下面的 request() / apiGet()），不静默返回空数组。
//
// ── 一、站点内核（先说清楚，省后面误解）
//    Flutter Web（dart2js）单页应用：首页只有 flutter_bootstrap.js + main.dart.js（4.4MB 未压缩）。
//    接口不是 H5 页面，而是 **REST + AES 加密回包**，全部常量都明文字面量躺在 main.dart.js 里：
//      · 接口前缀：`A.Hw().gty(o) + "/api/"` —— `A.Hw()` 是 `Uri.base`，即**站点自身的 /api/**
//        （实测 https://ys.ph3ywdns.icu/api/… 直接可用；不需要 App 里的那 5 个 api.*.com 线路域，
//         它们对 /api/ 一律回 {"error":9527}）。
//      · 路径表（dart2js 里 `this.a.h7(0,"videos/index",…)` 这一串）：
//          videos/index            分页列表（page / size / sort / categories=分类id）
//          videos/list_bytags      按标签（page / size / tags=标签id / sort）
//          videos/search           搜索（keyword / page / size / sort）
//          videos/search_keywords  搜索热词
//          videos/classification   分类表（category_id / title / total_videos）
//          videos/tags             标签表（tag_id / tag / total_videos）
//          videos/index_byall      首页聚合（list_new + nav_list + notice + image_lines）
//          videos/detail           详情（id / 可选 line_idx）→ 含 video_url 签名直链
//          videos/switch_line      换线路（video_id / line_idx）→ 换一条 CDN 直链
//          videos/related          相关推荐（id / page / size）
//          videos/dvds             片单（DVD）列表；videos/list_bydvd（dvd_id / page / size / sort）
//          index/app_config        图片线路；index/info 需要 id（本源不用）
//          user/* / payment/* / forget/* / playlists/* / Members/*  登录、会员、支付、片单（本源一概不碰）
//      · 回包加密：`{"error":0,"content":{"encrypt":1,"encryptData":"<base64>"}}`，
//        encryptData = AES-128-CBC/PKCS7，**key 与 IV 都是 "LqzCOd16vnYhOHTz"**（dart2js 的 bNZ/bNY），
//        解开后是 UTF-8 的 JSON；部分接口（classification / tags / dvds）解开后还套一层 {error,message,content}。
//        沙箱里没有原生 AES（tools.aes 是 App 侧能力，离线校验器不保证有），本源自带一份纯 JS AES-128 解密，
//        实测 8.8KB 回包毫秒级解完，不会撞沙箱预算。
//      · 请求不需要任何 token / 签名 / Cookie：本源只用 GET + 明文 query。
//
// ── 二、播放地址的两种形态（关键，实测对比过）
//    1) `videos/detail?id=` 回包里的 `video_url`：形如
//         https://yuese.b-cdn.net/hls/contents/videos/171000/171326/,171326.mp4,171326_720p.mp4,.urlset/master.m3u8?k=…&t=…
//       是**标准 HLS**：master → list-f2-v1-a1.m3u8 → `#EXT-X-KEY:METHOD=AES-128,URI="…/vidensc.key"` → 分片。
//       实测 164 段、累计 1638.9 秒，与接口里的 duration=1639 完全对得上 ⇒ 是整片，不是试看。
//       签名 `t` 是**过期时间戳**（实测约 5 小时后过期），所以**每次播放都必须现取，不能缓存地址**。
//    2) `videos/switch_line?video_id=&line_idx=` 回包里同样是签名 master.m3u8，但**换了一个媒体域**：
//         line_idx=2 → 国内线路（playlist.163player.com / cdn.fdhxwp.com），seg_skip_bytes=0
//         line_idx=3 → 海外线路（static.you-hu.com），seg_skip_bytes=20
//       ⚠ 海外线路的分片是「前面塞 20 字节假 JPEG 头（ffd8ffe0…）再 AES」：实测跳过 20 字节后才是合法 TS
//         （0x47 同步字节），标准播放器不跳字节就解不出来 —— 所以本源**只用 line_idx=2**。
//
// ── 三、VIP / 游客配额（实测结论，不粉饰）
//    站点确实有会员体系（`vip_required` / `vip_expire` 字段、payment/plans、user/login、
//    「开通VIP会员即可观看此视频」「今日观看次数已用完」「游客每日观看配额已达限制」这些 UI 文案）。
//    实测到的事实：
//      · 详情接口 `videos/detail` 的 `video_url` 是**按 IP 发的游客配额**管的：
//        同一出口 IP 当天第一次取到签名直链后，后续请求全部回 `is_limit_over=1` 且 `video_url` 为空
//        （换 UA / 不带头 / 换视频都一样；给请求加 X-Forwarded-For 伪造 IP 才会重新拿到 URL ——
//         本源**不伪造 IP**，那既不诚实也不稳）。
//      · 但 `videos/switch_line` **不在这个配额里**：配额用尽（is_limit_over=1）之后，
//        24/24 条抽样视频仍然全部返回可播的 line_idx=2 签名直链（master 200 + #EXTM3U）。
//        所以本源优先走 switch_line，把 detail 的 video_url 只当兜底。
//      · 抽样 38 条视频（最新/热门两种排序的第 1/5/40/200 页 + 分类 1/15/16/22/66 的第 1 页，
//        以及搜索命中项）`vip_required` **全是 0**；本次没有遇到「VIP 专属」视频，
//        因此本源**不写任何登录/VIP 逻辑**；万一遇到 vip_required=1 且服务端不给匿名直链，
//        本源如实抛「这条视频需要 VIP」的可读错误，不伪造播放地址。
//
// ── 四、封面（务必知道）
//    封面/截图都是 `*.jpg.aes`：CDN 上就是 **AES 密文**（前 16 字节当 IV，key="yuese!niubia!666"，
//    正文 AES-128-CBC/PKCS7，解开才是 ffd8ffe0 的 JPEG）。
//    本源把「编码方式 + key + 文件头 IV」写进每条封面的 coverHeaders
//    （`x-lume-image-encoding: aes-cbc-pkcs7-ivprefix`），由 App 图片管线用原生 AES 逐张解；
//    列表层不跑纯 JS 解密，不会撞沙箱预算。
//
// ── 五、分类 / 标签（含涉未成年过滤）
//    分类 79 个、标签 422 个，全部实时抓（不写死）。**涉未成年的分类/标签直接过滤掉**（见 MINOR_BLOCKLIST）：
//    实测命中的有「学生空姐」「教师学生」「校园」等分类，以及「萝莉」「少女」「少年」「高中生」
//    「学生」「校园暴力」等标签。过滤在 categories() / filters() 里做，并同步屏蔽这些 id 进 list()。
//    这只是把「面向未成年的入口」摘掉；单条视频标题里带「学生」之类的措辞不在这里处理（脚本不做内容审核）。
//
// ── 六、自测（开发期，Node 侧）
//    node tools/lume-source-check.mjs sources/video/yuese.js --keyword 护士
//    2026-10-25 结果：[PASS]，categories 76（79 过滤掉 3）/ list 24 条 hasMore=true /
//    detail 有标题封面 / chapters 1 集 / content 给出 line_idx=2 的 master.m3u8、
//    playable probe 200 + #EXTM3U。
//    直连即可；若本机直连抖动，可给 Node 临时加代理（脚本本身不用改）：
//      $env:NODE_USE_ENV_PROXY='1'; $env:HTTPS_PROXY='http://127.0.0.1:7890'

var DEFAULT_BASE = 'https://ys.ph3ywdns.icu';
var API_PREFIX = '/api/';
var PAGE_SIZE = 24; // 站点自己的列表页就是 24 条/页
var PREFER_LINE = 2; // 只认 2=国内线路：3=海外线路要跳过 20 字节假 JPEG 头，标准播放器播不了
var AES_KEY_TEXT = 'LqzCOd16vnYhOHTz'; // 接口回包 AES-128 的 key（同时当 IV 用）
var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 涉未成年的分类 / 标签一律不接（命中就过滤，见头部「五」）
var MINOR_BLOCKLIST = /萝莉|萝li|幼女|幼齿|幼交|未成年|正太|儿童|童颜|小学生|初中|高中|学生|校园|少女|少年|女童|男童/i;

// 封面是 `*.jpg.aes`：**前 16 字节是 IV**，正文 AES-128-CBC/PKCS7，
// key 固定（站点前端就是本地这么解的）。参数随 coverHeaders 交给 App 原生解密。
var COVER_KEY = 'yuese!niubia!666';
var COVER_HEADERS = {
  'x-lume-image-encoding': 'aes-cbc-pkcs7-ivprefix',
  'x-lume-image-key': COVER_KEY
};
function coverHeadersOf(url) {
  return /\.aes($|[?#])/i.test(String(url || '')) ? COVER_HEADERS : {};
}

var SORT_OPTIONS = [
  { id: 'post_date', title: '最新' },
  { id: 'video_viewed', title: '最热' },
  { id: 'duration', title: '最长' }
];
var SORT_IDS = { post_date: 1, video_viewed: 1, duration: 1 };

/* ============================ 基础工具 ============================ */

function base() {
  var config = typeof LumeSource !== 'undefined' && LumeSource.config ? LumeSource.config : null;
  var domain = config && config.domain ? String(config.domain) : '';
  return (domain || DEFAULT_BASE).replace(/\/+$/, '');
}

function apiUrl(path) {
  return base() + API_PREFIX + path;
}

function short(value) {
  return String(value == null ? '' : value).slice(0, 120);
}

function text(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

/// 秒 → 1:02:03 / 12:34
function durationText(value) {
  var total = Math.round(Number(value));
  if (!isFinite(total) || total <= 0) return '';
  var hour = Math.floor(total / 3600);
  var minute = Math.floor((total % 3600) / 60);
  var second = total % 60;
  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }
  if (hour > 0) return hour + ':' + pad(minute) + ':' + pad(second);
  return minute + ':' + pad(second);
}

function countText(value) {
  var n = Number(value);
  if (!isFinite(n) || n <= 0) return '';
  if (n >= 10000) {
    var w = n / 10000;
    return (w >= 100 ? w.toFixed(0) : w.toFixed(1)) + '万';
  }
  return String(n);
}

/// 相对地址补绝对（master.m3u8 里的清晰度地址可能是相对的）
function resolveUrl(baseUrl, reference) {
  var value = String(reference == null ? '' : reference).trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.indexOf('//') === 0) return 'https:' + value;
  var origin = /^https?:\/\/[^\/]+/i.exec(String(baseUrl || ''));
  if (!origin) return value;
  if (value.charAt(0) === '/') return origin[0] + value;
  var dir = String(baseUrl || '').replace(/[?#].*$/, '').replace(/\/[^\/]*$/, '/');
  return dir + value;
}

/// 只从 id 里掏出视频 id（chapterId 可能是 "171326:full" 这种）
function videoIdOf(value) {
  var raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  var matched = /(\d{1,9})/.exec(raw);
  return matched ? matched[1] : '';
}

/* ======================= AES-128-CBC（纯 JS 解密） ======================= */
/// 站点回包 encryptData 的解密：AES-128-CBC/PKCS7，key = IV = "LqzCOd16vnYhOHTz"。
/// 沙箱没有原生 AES 保证，这里自带实现；只做解密，够本源用。

var AES_SBOX = [
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
];

var AES_INV_SBOX = (function () {
  var table = new Array(256);
  for (var i = 0; i < 256; i++) table[AES_SBOX[i]] = i;
  return table;
})();

var AES_RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function aesExpandKey(key) {
  var w = new Array(176);
  var i;
  for (i = 0; i < 16; i++) w[i] = key[i] & 0xff;
  var rcon = 0;
  for (i = 16; i < 176; i += 4) {
    var t0 = w[i - 4];
    var t1 = w[i - 3];
    var t2 = w[i - 2];
    var t3 = w[i - 1];
    if (i % 16 === 0) {
      var first = t0;
      t0 = AES_SBOX[t1] ^ AES_RCON[rcon++];
      t1 = AES_SBOX[t2];
      t2 = AES_SBOX[t3];
      t3 = AES_SBOX[first];
    }
    w[i] = w[i - 16] ^ t0;
    w[i + 1] = w[i - 15] ^ t1;
    w[i + 2] = w[i - 14] ^ t2;
    w[i + 3] = w[i - 13] ^ t3;
  }
  return w;
}

/// InvMixColumns 用的乘法表（9 / 11 / 13 / 14）
var AES_TABLES = (function () {
  function xtime(a) {
    a <<= 1;
    if (a & 0x100) a ^= 0x11b;
    return a & 0xff;
  }
  function mul(a, b) {
    var product = 0;
    var x = a;
    var y = b;
    for (var i = 0; i < 8; i++) {
      if (y & 1) product ^= x;
      x = xtime(x);
      y >>= 1;
    }
    return product & 0xff;
  }
  function table(factor) {
    var out = new Array(256);
    for (var i = 0; i < 256; i++) out[i] = mul(i, factor);
    return out;
  }
  return { m9: table(9), m11: table(11), m13: table(13), m14: table(14) };
})();
var AES_M9 = AES_TABLES.m9;
var AES_M11 = AES_TABLES.m11;
var AES_M13 = AES_TABLES.m13;
var AES_M14 = AES_TABLES.m14;

function aesInvShiftRows(s) {
  // 第 row 行整体右移 row 位：new[4*((col+row)%4)+row] = old[4*col+row]
  for (var row = 1; row < 4; row++) {
    var a = s[row];
    var b = s[4 + row];
    var c = s[8 + row];
    var d = s[12 + row];
    var shifted = [a, b, c, d];
    for (var col = 0; col < 4; col++) s[4 * ((col + row) % 4) + row] = shifted[col];
  }
}

function aesInvSubBytes(s) {
  for (var i = 0; i < 16; i++) s[i] = AES_INV_SBOX[s[i]];
}

function aesAddRoundKey(s, roundKeys, round) {
  var offset = round * 16;
  for (var i = 0; i < 16; i++) s[i] = (s[i] ^ roundKeys[offset + i]) & 0xff;
}

function aesInvMixColumns(s) {
  for (var col = 0; col < 4; col++) {
    var o = col * 4;
    var a0 = s[o];
    var a1 = s[o + 1];
    var a2 = s[o + 2];
    var a3 = s[o + 3];
    s[o] = AES_M14[a0] ^ AES_M11[a1] ^ AES_M13[a2] ^ AES_M9[a3];
    s[o + 1] = AES_M9[a0] ^ AES_M14[a1] ^ AES_M11[a2] ^ AES_M13[a3];
    s[o + 2] = AES_M13[a0] ^ AES_M9[a1] ^ AES_M14[a2] ^ AES_M11[a3];
    s[o + 3] = AES_M11[a0] ^ AES_M13[a1] ^ AES_M9[a2] ^ AES_M14[a3];
  }
}

function aesDecryptBlock(state, roundKeys) {
  aesAddRoundKey(state, roundKeys, 10);
  for (var round = 9; round >= 1; round--) {
    aesInvShiftRows(state);
    aesInvSubBytes(state);
    aesAddRoundKey(state, roundKeys, round);
    aesInvMixColumns(state);
  }
  aesInvShiftRows(state);
  aesInvSubBytes(state);
  aesAddRoundKey(state, roundKeys, 0);
}

/// CBC 解密 + 去 PKCS7 填充；bytes/key/iv 都是 0-255 数组
function aesCbcDecrypt(bytes, key, ivBytes) {
  if (!bytes.length || bytes.length % 16 !== 0) {
    throw new Error('AES 密文长度异常（' + bytes.length + ' 字节，应为 16 的倍数）');
  }
  var roundKeys = aesExpandKey(key);
  var previous = ivBytes.slice(0, 16);
  var out = new Array(bytes.length);
  for (var offset = 0; offset < bytes.length; offset += 16) {
    var state = new Array(16);
    var i;
    for (i = 0; i < 16; i++) state[i] = bytes[offset + i];
    var cipherBlock = state.slice(0);
    aesDecryptBlock(state, roundKeys);
    for (i = 0; i < 16; i++) out[offset + i] = state[i] ^ previous[i];
    previous = cipherBlock;
  }
  var pad = out[out.length - 1];
  if (pad >= 1 && pad <= 16 && pad <= out.length) {
    var clean = true;
    for (var p = out.length - pad; p < out.length; p++) {
      if (out[p] !== pad) {
        clean = false;
        break;
      }
    }
    if (clean) out = out.slice(0, out.length - pad);
  }
  return out;
}

var B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(value) {
  var clean = String(value == null ? '' : value).replace(/[^A-Za-z0-9+\/=]/g, '');
  var out = [];
  var buffer = 0;
  var bits = 0;
  for (var i = 0; i < clean.length; i++) {
    var ch = clean.charAt(i);
    if (ch === '=') break;
    var digit = B64_ALPHABET.indexOf(ch);
    if (digit < 0) continue;
    buffer = ((buffer << 6) | digit) & 0xffffff;
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
    if (c < 0x80) {
      out += String.fromCharCode(c);
    } else if (c >= 0xc2 && c < 0xe0) {
      out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (c >= 0xe0 && c < 0xf0) {
      var b2 = bytes[i++];
      var b3 = bytes[i++];
      out += String.fromCharCode(((c & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
    } else {
      var c2 = bytes[i++];
      var c3 = bytes[i++];
      var c4 = bytes[i++];
      var point = (((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f)) - 0x10000;
      out += String.fromCharCode(0xd800 + (point >> 10), 0xdc00 + (point & 0x3ff));
    }
  }
  return out;
}

function asciiBytes(value) {
  var source = String(value == null ? '' : value);
  var out = new Array(source.length);
  for (var i = 0; i < source.length; i++) out[i] = source.charCodeAt(i) & 0xff;
  return out;
}

function decryptPayload(encryptData) {
  var key = asciiBytes(AES_KEY_TEXT);
  var plain = aesCbcDecrypt(base64ToBytes(encryptData), key, key);
  return utf8Decode(plain);
}

/* ============================ 网络层 ============================ */

function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: referer || base() + '/'
  };
}

function mediaHeaders() {
  return { 'User-Agent': UA, Referer: base() + '/' };
}

/// 统一发请求：连不上 / 非 200 / CF 校验都给可读错误（不静默返回空）
async function request(url) {
  var response;
  try {
    response = await LumeSource.http.get(url, { headers: headers() });
  } catch (error) {
    throw new Error(
      '月色视频连不上（' +
        short((error && error.message) || error) +
        '）——本站直连即通；若一直失败，请检查网络或在「源设置 → 网络」给本源配代理'
    );
  }
  var status = Number((response && response.status) || 0);
  if (status === 403 || status === 503) {
    throw new Error('NEED_WEBVIEW_VERIFY：月色视频要求网页验证（HTTP ' + status + '，' + short(url) + '）');
  }
  if (status !== 200) {
    throw new Error('月色视频：请求失败（HTTP ' + status + '，' + short(url) + '）');
  }
  return String((response && response.body) || '');
}

/// 接口回包可能是明文 JSON，也可能整个 content 是 AES 密文；有些接口解密后还套一层 {error,content}
function unwrapContent(content) {
  var value = content;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (Number(value.encrypt) === 1 && value.encryptData) {
      var plainText;
      try {
        plainText = decryptPayload(String(value.encryptData));
      } catch (error) {
        throw new Error('月色视频：回包解密失败（' + short((error && error.message) || error) + '）');
      }
      try {
        value = JSON.parse(plainText);
      } catch (error) {
        throw new Error('月色视频：解密后的内容不是 JSON：' + short(plainText));
      }
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.error === 'number' && 'content' in value) {
    if (value.error !== 0) {
      throw new Error('月色视频：接口报错：' + text(value.message || ('error ' + value.error)));
    }
    value = value.content;
  }
  return value;
}

function buildQuery(params) {
  if (!params) return '';
  var bits = [];
  for (var key in params) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
    var value = params[key];
    if (value === undefined || value === null || value === '') continue;
    bits.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }
  return bits.length ? '?' + bits.join('&') : '';
}

/// GET 一个接口并解开回包；接口层 error != 0 直接抛出站点自己的 message
async function apiGet(path, params) {
  var body = await request(apiUrl(path) + buildQuery(params));
  var parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error('月色视频：接口返回的不是 JSON（' + path + '）：' + short(body));
  }
  var error = Number(parsed && parsed.error);
  if (error !== 0) {
    var message = text((parsed && parsed.message) || '') || 'error ' + error;
    throw new Error('月色视频：接口报错（' + path + '）：' + message);
  }
  return unwrapContent(parsed ? parsed.content : null);
}

/// 纯文本资源（master.m3u8）
async function getMediaText(url) {
  var response = await LumeSource.http.get(url, { headers: mediaHeaders() });
  var status = Number((response && response.status) || 0);
  if (status !== 200) throw new Error('HTTP ' + status);
  return String((response && response.body) || '');
}

/* ============================ 站点解析 ============================ */

function normalizeSort(value) {
  var sort = String(value == null ? '' : value).trim();
  return SORT_IDS[sort] ? sort : 'post_date';
}

function normalizePage(value) {
  var page = Number(value);
  if (!isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

/// categoryId 的编码约定（home 的 moreUrl 与 list 共用）：
///   ''/'home'      → 全站最新
///   'c:<分类id>'   → 分类
///   't:<标签id>'   → 标签
///   'k:<排序key>'  → 全站按排序
///   'v:<视频id>'   → 相关推荐（详情页「更多」用）
function parseTarget(rawId) {
  var value = String(rawId == null ? '' : rawId).trim();
  if (!value || value === 'home') return { kind: 'all' };
  // categories() 给的是裸 id（'1'、'16'…），App 会把分类页原样回传 ⇒ 裸数字按分类处理
  if (/^\d+$/.test(value)) return { kind: 'category', id: value };
  var matched = /^([ctkv]):(.+)$/.exec(value);
  if (!matched) return { kind: 'all' };
  var kind = matched[1];
  var id = matched[2].trim();
  if (kind === 'c' && /^\d+$/.test(id)) return { kind: 'category', id: id };
  if (kind === 't' && /^\d+$/.test(id)) return { kind: 'tag', id: id };
  if (kind === 'k') return { kind: 'sort', sort: normalizeSort(id) };
  if (kind === 'v' && /^\d+$/.test(id)) return { kind: 'related', id: id };
  return { kind: 'all' };
}

function blockedTitle(title) {
  return MINOR_BLOCKLIST.test(String(title == null ? '' : title));
}

/// 组内多选的 '1,16' → '1'（只认第一个纯数字 id）
function firstNumericId(value) {
  var parts = String(value == null ? '' : value).split(',');
  for (var i = 0; i < parts.length; i++) {
    var candidate = text(parts[i]);
    if (/^\d+$/.test(candidate)) return candidate;
  }
  return '';
}

/// 列表行 → 标准 Item（封面是站点的 AES 密文 *.jpg.aes，见头部「四」）
function itemOf(row) {
  if (!row || row.video_id == null) return null;
  var bits = [];
  var duration = durationText(row.duration);
  if (duration) bits.push(duration);
  if (Number(row.is_hd) === 1) bits.push('HD');
  return {
    id: String(row.video_id),
    title: text(row.title) || String(row.video_id),
    cover: String(row.video_img || ''),
    coverHeaders: coverHeadersOf(row.video_img),
    subtitle: bits.join(' · ')
  };
}

/// 分页回包统一形状：{total, per_page, current_page, last_page, data:[…]}
function pageOf(content, mapper) {
  var rows = (content && content.data) || [];
  var items = [];
  for (var i = 0; i < rows.length; i++) {
    var item = mapper(rows[i]);
    if (item) items.push(item);
  }
  var current = Number(content && content.current_page);
  var last = Number(content && content.last_page);
  var hasMore = isFinite(current) && isFinite(last) ? current < last : items.length > 0;
  return { items: items, hasMore: hasMore };
}

/// 分类表（实时抓；涉未成年的过滤掉）
async function fetchCategories() {
  var rows = await apiGet('videos/classification');
  if (!Array.isArray(rows)) {
    throw new Error('月色视频：分类接口没返回分类表（站点可能改版）');
  }
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || {};
    if (row.category_id == null) continue;
    var title = text(row.title);
    if (!title || blockedTitle(title)) continue;
    var total = countText(row.total_videos);
    out.push({ id: String(row.category_id), title: title + (total ? '（' + total + '）' : '') });
  }
  return out;
}

/// 标签表（实时抓；同样过滤涉未成年标签，只留前 limit 个热门）
async function fetchTags(limit) {
  var rows = await apiGet('videos/tags');
  if (!Array.isArray(rows)) return [];
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || {};
    if (row.tag_id == null) continue;
    var name = text(row.tag);
    if (!name || blockedTitle(name)) continue;
    out.push({ id: String(row.tag_id), title: name });
    if (limit && out.length >= limit) break;
  }
  return out;
}

/* ============================ 图源契约 ============================ */

var LumeSource = {
  id: 'yuese_video',
  name: '月色视频 18+',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://ys.ph3ywdns.icu'],

  /// 首页：最新 + 最热两块（站点自己的首页也是「最新 / 热门」两栏；接口 videos/index_byall 的 list_new 同源）
  /// 两块并发拉，省掉一次串行 RTT（沙箱单次操作只有 3–5 秒）
  async home() {
    var boards = [];
    var pages = await Promise.all([
      this.list({ categoryId: 'k:post_date', page: 1 }).catch(function () {
        return { items: [] };
      }),
      this.list({ categoryId: 'k:video_viewed', page: 1 }).catch(function () {
        return { items: [] };
      })
    ]);
    if (pages[0].items.length) boards.push({ title: '最新上传', moreUrl: 'k:post_date', items: pages[0].items });
    if (pages[1].items.length) boards.push({ title: '最多播放', moreUrl: 'k:video_viewed', items: pages[1].items });
    if (!boards.length) throw new Error('月色视频：首页没拿到内容（站点可能改版）');
    return boards;
  },

  /// 分类：站点 videos/classification 的分类表（79 个，涉未成年的已过滤）
  async categories() {
    return await fetchCategories();
  },

  /// 筛选：分类 + 热门标签 + 排序（App 把选中项回传成 filters.type / filters.tag / filters.sort）
  /// 分类表和标签表并发拉，任一组失败只少一组，不影响其它组
  async filters() {
    var groups = [];
    var pair = await Promise.all([
      fetchCategories().catch(function () {
        return null;
      }),
      fetchTags(30).catch(function () {
        return null;
      })
    ]);
    if (pair[0] && pair[0].length) groups.push({ id: 'type', title: '分类', options: pair[0] });
    if (pair[1] && pair[1].length) groups.push({ id: 'tag', title: '标签', options: pair[1] });
    groups.push({ id: 'sort', title: '排序', options: SORT_OPTIONS });
    return { groups: groups };
  },

  /// 列表 / 搜索
  ///   有关键词 → videos/search（keyword/page/size/sort）
  ///   有标签   → videos/list_bytags（page/size/tags/sort）
  ///   有分类   → videos/index（page/size/sort/categories）
  ///   都没有   → videos/index（全站最新）
  /// 分类与标签同时选中时以标签为准（站点没有「分类+标签」的组合接口）
  async list(argument) {
    var args = argument || {};
    var page = normalizePage(args.page);
    var keyword = text(args.keyword);
    var filters = args.filters || {};
    var target = parseTarget(args.categoryId);
    var sort = normalizeSort(filters.sort || target.sort);
    // 组内多选时 App 会把 id 用英文逗号连起来（'1,16'）；站点接口一次只吃一个 id ⇒ 取第一个
    var typeId = firstNumericId(filters.type);
    var tagId = firstNumericId(filters.tag);
    if (!typeId) {
      typeId = target.kind === 'category' ? target.id : '';
    }
    if (!tagId) {
      tagId = target.kind === 'tag' ? target.id : '';
    }

    if (keyword) {
      var found = await apiGet('videos/search', { keyword: keyword, page: page, size: PAGE_SIZE, sort: sort });
      return pageOf(found, itemOf);
    }
    if (tagId) {
      var byTag = await apiGet('videos/list_bytags', { page: page, size: PAGE_SIZE, tags: tagId, sort: sort });
      return pageOf(byTag, itemOf);
    }
    if (target.kind === 'related') {
      var related = await apiGet('videos/related', { id: target.id, page: page, size: PAGE_SIZE });
      return pageOf(related, itemOf);
    }
    if (typeId) {
      var byCat = await apiGet('videos/index', { page: page, size: PAGE_SIZE, sort: sort, categories: typeId });
      return pageOf(byCat, itemOf);
    }
    var all = await apiGet('videos/index', { page: page, size: PAGE_SIZE, sort: sort });
    return pageOf(all, itemOf);
  },

  /// 详情：标题 / 封面 / 分类 / 标签 / 时长 / 游客配额状态（播放地址在 content 里现取，签名会过期）
  async detail(argument) {
    var id = videoIdOf(argument && argument.id);
    if (!id) return null;
    var info;
    try {
      info = await apiGet('videos/detail', { id: id });
    } catch (error) {
      var message = String((error && error.message) || error);
      if (/不存在|已删除|找不到/.test(message)) return null;
      throw error;
    }
    if (!info || info.video_id == null) return null;
    var title = text(info.title) || String(info.video_id);
    if (blockedTitle(title)) return null; // 涉未成年的条目直接不出详情

    var categoryNames = [];
    var categories = info.categories || [];
    for (var i = 0; i < categories.length; i++) {
      var name = text(categories[i] && categories[i].title);
      if (name) categoryNames.push(name);
    }
    var tagNames = [];
    var tags = info.tags || [];
    for (var t = 0; t < tags.length; t++) {
      var tagName = text(tags[t] && tags[t].tag);
      if (tagName) tagNames.push(tagName);
    }

    var bits = [];
    var duration = durationText(info.duration);
    if (duration) bits.push(duration);
    if (Number(info.is_hd) === 1) bits.push('HD');
    if (categoryNames.length) bits.push(categoryNames[0]);
    var dimensions = text(info.file_dimensions);
    if (dimensions) bits.push(dimensions);

    var lines = [];
    if (categoryNames.length) lines.push('分类：' + categoryNames.join('、'));
    if (tagNames.length) lines.push('标签：' + tagNames.join('、'));
    lines.push('时长：' + (duration || '-') + ' · 画质：' + (dimensions || '-'));
    if (Number(info.screen_amount) > 0) lines.push('截图：' + info.screen_amount + ' 张');
    lines.push('线路：国内线路 / 海外线路（本源只用国内线路，海外线路的分片带 20 字节多余头）');
    if (Number(info.vip_required) === 1) {
      lines.push('会员：站点标记此片为 VIP 内容，匿名直链可能不给（本源不伪造地址）');
    }
    if (Number(info.is_limit_over) === 1) {
      lines.push('提示：本机出口 IP 的游客每日直链配额已用完，本源会改用「换线路」接口取播放地址');
    }
    if (text(info.description)) lines.push('', text(info.description));

    return {
      id: String(info.video_id),
      title: title,
      cover: String(info.video_img || ''),
      coverHeaders: coverHeadersOf(info.video_img),
      subtitle: bits.join(' · '),
      description: lines.join('\n')
    };
  },

  /// 站点没有分 P / 多线路选集：一条视频就是一部整片
  async chapters(argument) {
    var id = videoIdOf(argument && argument.id);
    if (!id) return [];
    return [{ id: id + ':full', title: '正片' }];
  },

  /// 播放：现取签名 master.m3u8（签名约 5 小时过期，每次播放都要重新取）
  ///   1) videos/switch_line?line_idx=2  —— 不受游客每日配额限制，24/24 抽样可用（首选）
  ///   2) videos/detail 的 video_url      —— 配额未用完时的默认线路（兜底）
  /// 顺手解析 master 里的清晰度，给播放器「清晰度」菜单用。
  async content(argument) {
    var args = argument || {};
    var id = videoIdOf(args.id) || videoIdOf(args.chapterId);
    if (!id) throw new Error('月色视频：缺少视频 id');

    var resolved = await resolveMedia(id);
    var qualities = [];
    try {
      qualities = await readQualities(resolved.url);
    } catch (error) {
      qualities = [];
    }
    return {
      kind: 'video',
      url: resolved.url,
      headers: mediaHeaders(),
      qualities: qualities.length > 1 ? qualities : undefined
    };
  }
};

/* ============================ 播放地址 ============================ */

/// 取一条可播的签名 m3u8；两条路都不通时抛可读错误（说清楚是配额、VIP 还是接口报错）
async function resolveMedia(id) {
  var problems = [];

  try {
    var line = await apiGet('videos/switch_line', { video_id: id, line_idx: PREFER_LINE });
    var lineUrl = String((line && line.video_url) || '').trim();
    var skipBytes = Number(line && line.seg_skip_bytes);
    if (lineUrl && (!isFinite(skipBytes) || skipBytes === 0)) {
      return { url: lineUrl, from: 'switch_line' + PREFER_LINE };
    }
    if (lineUrl) {
      // 有 seg_skip_bytes 的线路 = 分片前面塞了垃圾头，标准播放器解不出来，宁可换路
      problems.push('换线路：该线路分片需跳过 ' + skipBytes + ' 字节，标准播放器播不了');
    } else {
      problems.push('换线路：没给地址');
    }
  } catch (error) {
    problems.push('换线路：' + String((error && error.message) || error).slice(0, 80));
  }

  var info = null;
  try {
    info = await apiGet('videos/detail', { id: id });
  } catch (error) {
    problems.push('详情：' + String((error && error.message) || error).slice(0, 80));
  }
  if (info) {
    var url = String(info.video_url || '').trim();
    if (url) return { url: url, from: 'detail' };
    if (Number(info.vip_required) === 1) {
      throw new Error('月色视频：这条视频是 VIP 内容，服务端没给匿名播放地址（本源不做登录、也不伪造地址）');
    }
    if (Number(info.is_limit_over) === 1) {
      throw new Error(
        '月色视频：游客每日观看配额已用完（服务端 is_limit_over=1，按出口 IP 计），' +
          '换线路接口这次也没给地址。换一个网络 / 稍后再试，或在站点登录后使用'
      );
    }
  }
  throw new Error('月色视频：没取到播放地址（' + id + '）：' + problems.join('；'));
}

/// 解析 master.m3u8 的清晰度（#EXT-X-STREAM-INF 的 RESOLUTION），供播放器「清晰度」菜单用
async function readQualities(masterUrl) {
  var master = await getMediaText(masterUrl);
  if (master.indexOf('#EXTM3U') < 0) return [];
  var rows = master.split(/\r?\n/);
  var out = [];
  var seen = {};
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].indexOf('#EXT-X-STREAM-INF') !== 0) continue;
    var next = '';
    for (var j = i + 1; j < rows.length; j++) {
      var candidate = text(rows[j]);
      if (candidate && candidate.charAt(0) !== '#') {
        next = candidate;
        break;
      }
    }
    if (!next) continue;
    var url = resolveUrl(masterUrl, next);
    if (!url || seen[url]) continue;
    seen[url] = 1;
    var resolution = /RESOLUTION=(\d+)x(\d+)/.exec(rows[i]);
    var label = resolution ? resolution[2] + 'P' : '线路 ' + (out.length + 1);
    out.push({ label: label, url: url });
  }
  out.sort(function (a, b) {
    return parseInt(b.label, 10) - parseInt(a.label, 10);
  });
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
