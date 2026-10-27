// LumeSource: {"id":"xfdxv_video","name":"41看片 18+","version":"1.1.0","category":"video","mirrors":["https://xfdxv.414459.lifestyle:8283","https://hljhv.412426.lifestyle:8283"],"icon":"https://img.zuoyebang.cc/zyb_513dc6dd137ee8262d370d80d9ad763e.jpg"}
//
// 站点：https://xfdxv.414459.lifestyle:8283/ （2026-10-25 逐接口实测）
//   壳域名：https://www.543786.com:8283/ 与 https://542372.com/ 只做 atob 跳转，本身没有内容/接口，
//   所以 mirrors 只放最终站；它们不参与拼接接口。
//   同站镜像（2026-10-25 实测）：https://hljhv.412426.lifestyle:8283/home?channel=fb-41
//     —— 解它的 window.CONFIG（同一把 Fernet key）得到
//        site_name="41看片"、api_url="sm-api.wieuc.com"、site_id=6、channel_name="fb-41"
//     与主域完全一致，只是换了个分发域名/通道号，所以并进 mirrors。
//
// ── 站点内核：React SPA（create-react-app + antd-mobile）
//   · 首页 <body></body> 是空的，18KB HTML 里只有：
//       cnzz 三套统计 + plausible 埋点（event-channel="9-41看片源"）
//       window.CONFIG = 'gAAAAA…'      ← Fernet 加密的站点配置（16.8KB token）
//       window.CDN_URL = "//hm-static.wieuc.com"
//       <script src="//hm-static.wieuc.com/static/js/K2AOEHb4.js">
//   · K2AOEHb4.js 是 obfuscator.io 混淆的 loader（字符串表 + RC4 + 变量名替换），
//     它按需插入 28 个 bundle：vendor.* + 5137/7859/6237/6442 + main~*.js。
//     **Fernet key 不在 loader 里，也不在首页**——在 main~31743c5a.890db582.js：
//       const i="NyGRG56A8i5J2JMqh7da83r2MMfgbM7Ppw1aCF8YnAY="   ← 解 CONFIG / 解接口响应都用它
//       const a="MCGqhW3pJuIffwzTJr2mj-URSanm7XydmUbpZYpenP0="   ← 另一套（本次未用到，解 CONFIG 直接 bad decrypt）
//       （模块 59263 导出 decrypt/encrypt；模块 92903 是标准 Fernet 实现：
//         signingKey = key[:16]、encryptionKey = key[16:]，HMAC-SHA256 校验 + AES-128-CBC）
//
// ── window.CONFIG 解出来是什么（本脚本第一版就是这么拿到 apiBase 的）
//   {"video_play_url_list":[{"name":"线路1","url":["hm-vip.hdstfb.com","hm-img.hdstfb.com"],"sort":1},
//                           {"name":"线路2",…},{"name":"海外专线","url":["hm-img.aa66cc.live"],"sort":4},
//                           {"name":"VIP线路","url":["hm-vip.hdstfb.com",…],"sort":1000,"is_vip":true}],
//    "video_img_url":"hm-img.hdstfb.com",
//    "video_download_url":["cdn-fj.aa66cc.live",…],
//    "site_id":6, "channel_id":9, "site_name":"41看片", "channel_name":"41看片源",
//    "api_url":"sm-api.wieuc.com", "public_url":"hm-static.wieuc.com",
//    "ai_faker":{…}, "vip_combo":[…], "point_combo":[…], "splash_ads":[], "events":[…]}
//   ⇒ apiBase = https://sm-api.wieuc.com，播放/封面域名 = hm-vip/hm-img.hdstfb.com（海外专线 hm-img.aa66cc.live）
//
// ── 接口清单（全部 GET，响应统一 {"x-data":"gAAAAA…"} —— 又是一层 Fernet，同一个 key）
//   GET /api/vod/video?page&per_page[&tag=<tagId>][&orderby=hits|likes|score]
//        → data.items[]（id/name/pic/play_url/preview_play_url/duration/tag[]/is_paid/price/hits…）
//          data.page / pages / total（实测 per_page=20 时 total=113484、pages=5675）
//   GET /api/vod/video/<id>        → 单条详情（多 hits_day/week/month、tag[]、down_url、source…）
//                                    不存在的 id 回 200 + data.id=null（不是 404）
//   GET /search/vod/?search=<词>&page&per_page   → 站内搜索（参数名是 search，不是 keyword/q/wd）
//        keyword=车震 → total 779；麻豆 → 2365
//   GET /api/vod/tag?site_id&per_page → 标签表（6139 条）
//   GET /api/vod/tag_group?site_id&per_page → 标签分组（63 组，带 purpose/tag_type）
//   （/api/vod/type/、/api/vod/series/ 实测 404；type_id / cate_id / category_id 一律被忽略）
//   site_id=6 & channel_id=9 是站点号；channel_id 对 /api/vod/* 无影响，site_id 影响列表内容，
//   所以脚本固定带 site_id=6（用户换镜像域时不用改）。
//
// ── 播放地址来源（重要）
//   play_url 是**相对路径**：/videos3/<yyyymm>/<dd>/<sid>/index.m3u8（付费条目是 /videos/<…>/index.m3u8），
//   自己拼 "https://" + video_play_url_list.*.url + play_url。实测三条线路都 200（application/vnd.apple.mpegurl）。
//   HLS 内部：AES-128（#EXT-X-KEY:METHOD=AES-128,URI="enc.key"）+ 全站统一 IV=0，
//   分片是 abc%03d.png，enc.key 与分片都能直接取（200），播放器会自己处理解密。
//   down_url（index.mp4）在 hm-vip / hm-img 上 206 video/mp4，海外专线对该 mp4 403，故 mp4 只做兜底线路。
//
// ── VIP / 登录 / 付费：实测结论（2026-10-25）
//   1) 列表/详情/搜索/播放**全部不需要登录**：不带任何 Cookie / Authorization 就能拿到完整 JSON，
//      没有游客号、没有 token、没有签名参数。
//   2) is_paid=1（price 3~5 元）的条目确实存在（第 300 页起每页 10 来条），但
//      · 详情照样返回 play_url；
//      · 把 play_url 拼成 m3u8 请求 → 200，且播放总时长与接口 duration 一致
//        （154047：API 1369s / 播放列表 1369.5s；152743：6335s / 6335.8s），
//        即 **CDN 不做付费校验，全片可播**。is_paid 只是前端「购买」按钮的展示标记。
//   3) CONFIG 里的 "VIP线路"（is_vip:true）与「线路1/2」指向同一批域名，实测返回同一份播放列表 ——
//      没有 VIP 专属加密或 token。站点真正收费的是 AI 换脸/脱衣、金币充值那套（ai_faker / point_combo）。
//   4) 全站没有 x-data 以外的加密层，也没有 cookie 下发（Set-Cookie 为空）。
//
// ── 已知限制
//   · 首页是 SPA，路由路径（/vod/<id> 等）全部回落同一份 HTML，没法用详情页兜底；
//     详情只走 JSON 接口。
//   · 站点每 30 分钟换一次 window.CONFIG（iat 时间戳），api_url 若轮换，本源会用 CONFIG 现解一次并缓存；
//     硬编码的 sm-api.wieuc.com 是第一顺位。
//   · 沙箱里没有 crypto/Buffer，Fernet 与 AES 全部是纯 JS（SBOX 现算 + 位运算），
//     12KB 响应实测解密 ~6ms、55KB ~12ms，远低于单次调用预算。
//   · 站点标签里有一组明确以未成年为卖点的分类（purpose=10 组：小马/小学/初中/高中/禁区），
//     本源**不把它接进分类，也不在 filters() 里下发**（见 __bannedGroup），列表接口本身不受影响。
//
// 2026-10-25 实测环境：本机直连（站点自签证书已换成正签，curl 不带 -k 也 200；Node fetch 同样 200）。

var DEFAULT_BASE = 'https://xfdxv.414459.lifestyle:8283';
var API_FALLBACK = 'https://sm-api.wieuc.com';
var IMG_FALLBACK = 'hm-img.hdstfb.com';
var LINE_FALLBACK = ['hm-vip.hdstfb.com', 'hm-img.hdstfb.com', 'hm-img.aa66cc.live'];
var SITE_ID = 6;
var PER_PAGE = 20;
var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
// 站点 config 的 Fernet key（来自 main~31743c5a.890db582.js 模块 59263 的常量 i）
var FERNET_KEY = 'NyGRG56A8i5J2JMqh7da83r2MMfgbM7Ppw1aCF8YnAY=';

/* ========================== base64url（纯 JS，不依赖 atob/Buffer） ========================== */
var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var B64_INDEX = {};
(function () {
  for (var i = 0; i < B64_CHARS.length; i++) B64_INDEX[B64_CHARS.charAt(i)] = i;
  B64_INDEX['-'] = 62;
  B64_INDEX['_'] = 63;
})();

function base64UrlToBytes(text) {
  var out = [];
  var source = String(text == null ? '' : text).replace(/[^A-Za-z0-9_\-+/=]/g, '').replace(/=+$/, '');
  var buffer = 0;
  var bits = 0;
  for (var i = 0; i < source.length; i++) {
    var value = B64_INDEX[source.charAt(i)];
    if (value === undefined) continue;
    buffer = (buffer << 6) | value;
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
    var first = bytes[i++];
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
    for (var step = 0; step < extra; step++) code = (code << 6) | (bytes[i + step] & 0x3f);
    i += extra;
    if (code > 0xffff) {
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

/* ========================== AES-128-CBC 解密（纯 JS） ========================== */
var AES_EXP = new Array(256);
var AES_LOG = new Array(256);
(function () {
  var x = 1;
  for (var i = 0; i < 255; i++) {
    AES_EXP[i] = x;
    AES_LOG[x] = i;
    x = x ^ (((x << 1) ^ ((x >> 7) * 0x11b)) & 0xff);
  }
  AES_EXP[255] = AES_EXP[0];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return AES_EXP[(AES_LOG[a] + AES_LOG[b]) % 255];
}

var AES_SBOX = new Array(256);
var AES_INV_SBOX = new Array(256);
(function () {
  for (var i = 0; i < 256; i++) {
    var inverse = i === 0 ? 0 : AES_EXP[(255 - AES_LOG[i]) % 255];
    var rotated = inverse;
    var value = inverse;
    for (var step = 0; step < 4; step++) {
      rotated = ((rotated << 1) | (rotated >> 7)) & 0xff;
      value ^= rotated;
    }
    value ^= 0x63;
    AES_SBOX[i] = value;
    AES_INV_SBOX[value] = i;
  }
})();

function aesExpandKey(key) {
  var nk = key.length / 4;
  var rounds = nk + 6;
  var words = 4 * (rounds + 1);
  var schedule = new Array(words * 4);
  var index;
  for (index = 0; index < key.length; index++) schedule[index] = key[index];
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
      rcon = gfMul(rcon, 2);
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
  for (var i = 0; i < 16; i++) state[i] ^= key[round * 16 + i];
}

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

function aesInvMixColumns(state) {
  for (var col = 0; col < 4; col++) {
    var o = 4 * col;
    var a0 = state[o];
    var a1 = state[o + 1];
    var a2 = state[o + 2];
    var a3 = state[o + 3];
    state[o] = gfMul(a0, 14) ^ gfMul(a1, 11) ^ gfMul(a2, 13) ^ gfMul(a3, 9);
    state[o + 1] = gfMul(a0, 9) ^ gfMul(a1, 14) ^ gfMul(a2, 11) ^ gfMul(a3, 13);
    state[o + 2] = gfMul(a0, 13) ^ gfMul(a1, 9) ^ gfMul(a2, 14) ^ gfMul(a3, 11);
    state[o + 3] = gfMul(a0, 11) ^ gfMul(a1, 13) ^ gfMul(a2, 9) ^ gfMul(a3, 14);
  }
}

function aesDecryptBlock(block, expanded) {
  var state = new Array(16);
  var i;
  for (i = 0; i < 16; i++) state[i] = block[i];
  aesAddRoundKey(state, expanded.schedule, expanded.rounds);
  for (var round = expanded.rounds - 1; round >= 1; round--) {
    aesInvShiftRows(state);
    for (i = 0; i < 16; i++) state[i] = AES_INV_SBOX[state[i]];
    aesAddRoundKey(state, expanded.schedule, round);
    aesInvMixColumns(state);
  }
  aesInvShiftRows(state);
  for (i = 0; i < 16; i++) state[i] = AES_INV_SBOX[state[i]];
  aesAddRoundKey(state, expanded.schedule, 0);
  return state;
}

var FERNET_KEY_BYTES = base64UrlToBytes(FERNET_KEY);
var AES_KEY_BYTES = FERNET_KEY_BYTES.slice(16, 32); // Fernet：前 16 字节签名、后 16 字节加密
var AES_EXPANDED = aesExpandKey(AES_KEY_BYTES);

/// Fernet token（base64url）→ 明文（不做 HMAC 校验：key 错了 JSON.parse 会先炸，省掉 SHA256 实现）
function fernetDecrypt(token) {
  var raw = base64UrlToBytes(token);
  if (raw.length < 57) throw new Error('Fernet token 长度不足（' + raw.length + '）');
  if (raw[0] !== 0x80) throw new Error('不支持的 Fernet 版本（0x' + raw[0].toString(16) + '）');
  var iv = raw.slice(9, 25);
  var cipher = raw.slice(25, raw.length - 32);
  var plain = [];
  var previous = iv;
  for (var offset = 0; offset + 16 <= cipher.length; offset += 16) {
    var block = cipher.slice(offset, offset + 16);
    var decoded = aesDecryptBlock(block, AES_EXPANDED);
    for (var i = 0; i < 16; i++) plain.push(decoded[i] ^ previous[i]);
    previous = block;
  }
  var pad = plain.length ? plain[plain.length - 1] : 0;
  if (pad > 0 && pad <= 16 && pad <= plain.length) plain = plain.slice(0, plain.length - pad);
  return utf8Decode(plain);
}

/* ========================== 站点地址 / 请求层 ========================== */
function base() {
  var domain = '';
  try {
    domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  } catch (error) {
    domain = '';
  }
  return (domain || DEFAULT_BASE).replace(/\/+$/, '');
}

function origin() {
  var b = base();
  return b;
}

function pageHeaders() {
  return {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Origin: origin(),
    Referer: origin() + '/'
  };
}

function mediaHeaders() {
  return { 'User-Agent': UA, Referer: origin() + '/' };
}

/// 缓存里读出来的站点配置（api_url / 图片域 / 线路域）；没有就返回 null
async function savedConfig() {
  try {
    var text = await LumeSource.fs.readText('site-config.json');
    if (!text) return null;
    var parsed = JSON.parse(text);
    return parsed && parsed.apiUrl ? parsed : null;
  } catch (error) {
    return null;
  }
}

async function saveConfig(config) {
  try {
    await LumeSource.fs.writeText('site-config.json', JSON.stringify(config));
  } catch (error) {
    /* fs 不可用就每次现解，不影响功能 */
  }
}

/// 现场解 window.CONFIG（首页 HTML 内联的 Fernet 串），拿 api_url / 图片域 / 线路域
async function refreshConfig() {
  var response = await LumeSource.http.get(origin() + '/', { headers: pageHeaders() });
  var status = response ? response.status : 0;
  if (status !== 200) throw new Error('首页打不开：HTTP ' + status);
  var html = String((response && response.body) || '');
  var matched = /window\.CONFIG\s*=\s*'([^']+)'/.exec(html);
  if (!matched) throw new Error('首页没有 window.CONFIG（站点改版）');
  var config = JSON.parse(fernetDecrypt(matched[1]));
  var lines = [];
  var groups = config.video_play_url_list || [];
  for (var i = 0; i < groups.length; i++) {
    var hosts = (groups[i] && groups[i].url) || [];
    for (var h = 0; h < hosts.length; h++) {
      if (hosts[h] && lines.indexOf(hosts[h]) < 0) lines.push(String(hosts[h]));
    }
  }
  var packed = {
    apiUrl: config.api_url ? 'https://' + config.api_url : API_FALLBACK,
    imgHost: config.video_img_url ? String(config.video_img_url) : IMG_FALLBACK,
    lines: lines.length ? lines : LINE_FALLBACK.slice(0),
    siteId: Number(config.site_id) || SITE_ID,
    savedAt: Date.now()
  };
  await saveConfig(packed);
  return packed;
}

async function currentConfig() {
  var saved = await savedConfig();
  if (saved) return saved;
  return {
    apiUrl: API_FALLBACK,
    imgHost: IMG_FALLBACK,
    lines: LINE_FALLBACK.slice(0),
    siteId: SITE_ID
  };
}

/// 解一层 {"x-data": "gAAAAA…"}，回 data 本体（站点所有接口都是这个形状）
function unwrap(body, path) {
  var text = String(body == null ? '' : body).trim();
  if (!text) throw new Error('接口回了空响应：' + path);
  var wrapped;
  try {
    wrapped = JSON.parse(text);
  } catch (error) {
    throw new Error('接口响应不是 JSON：' + path + ' → ' + text.slice(0, 80));
  }
  var payload = wrapped;
  if (wrapped && typeof wrapped['x-data'] === 'string') {
    var plain;
    try {
      plain = fernetDecrypt(wrapped['x-data']);
    } catch (error) {
      throw new Error('响应解不开（Fernet key 可能换了）：' + path);
    }
    try {
      payload = JSON.parse(plain);
    } catch (error) {
      throw new Error('解出来的不是 JSON：' + path + ' → ' + plain.slice(0, 80));
    }
  }
  if (payload && payload.code !== undefined && Number(payload.code) !== 0) {
    throw new Error('接口报错：code ' + payload.code + ' ' + (payload.message || '') + '（' + path + '）');
  }
  return payload ? payload.data : null;
}

/// GET 一个接口路径（自动带 site_id、解密、必要时用 CONFIG 里的新 api_url 重试一次）
async function apiGet(path, withSite) {
  var config = await currentConfig();
  var url = config.apiUrl + path + (withSite === false ? '' : (path.indexOf('?') >= 0 ? '&' : '?') + 'site_id=' + config.siteId);
  var response;
  try {
    response = await LumeSource.http.get(url, { headers: pageHeaders() });
  } catch (error) {
    // 网络层直接抛（DNS/连接失败）：用 CONFIG 现解一遍 api_url 再试一次
    var fresh = await refreshConfig();
    url = fresh.apiUrl + path + (withSite === false ? '' : (path.indexOf('?') >= 0 ? '&' : '?') + 'site_id=' + fresh.siteId);
    response = await LumeSource.http.get(url, { headers: pageHeaders() });
  }
  var status = response ? response.status : 0;
  if (status === 403 || status === 503) {
    throw new Error('NEED_WEBVIEW_VERIFY：41看片触发了人机校验（HTTP ' + status + '）');
  }
  if (status === 404) throw new Error('接口不存在（HTTP 404）：' + path);
  if (status !== 200) throw new Error('接口打不开：HTTP ' + status + ' ' + path);
  return unwrap(response.body, path);
}

/* ========================== 数据整形 ========================== */
function pad2(value) {
  return value < 10 ? '0' + value : String(value);
}

function durationText(seconds) {
  var total = Math.max(0, Math.round(Number(seconds) || 0));
  if (!total) return '';
  var minutes = Math.floor(total / 60);
  var rest = total % 60;
  if (minutes < 60) return pad2(minutes) + ':' + pad2(rest);
  return Math.floor(minutes / 60) + ':' + pad2(minutes % 60) + ':' + pad2(rest);
}

function absoluteImg(path, imgHost) {
  var text = String(path == null ? '' : path).trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.indexOf('//') === 0) return 'https:' + text;
  return 'https://' + (imgHost || IMG_FALLBACK) + (text.charAt(0) === '/' ? text : '/' + text);
}

function absoluteMedia(path, host) {
  var text = String(path == null ? '' : path).trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.indexOf('//') === 0) return 'https:' + text;
  return 'https://' + host + (text.charAt(0) === '/' ? text : '/' + text);
}

function tagNames(row) {
  var tags = (row && row.tag) || [];
  var names = [];
  for (var i = 0; i < tags.length && i < 6; i++) {
    if (tags[i] && tags[i].name && String(tags[i].is_ad) !== '1') names.push(String(tags[i].name));
  }
  return names;
}

function itemOf(row, imgHost) {
  if (!row || row.id == null) return null;
  var bits = [];
  var duration = durationText(row.duration);
  if (duration) bits.push(duration);
  var tags = tagNames(row);
  if (tags.length) bits.push(tags.slice(0, 2).join('/'));
  if (Number(row.is_paid) === 1) bits.push('需购买 ' + (row.price || ''));
  return {
    id: String(row.id),
    title: String(row.name || row.id),
    cover: absoluteImg(row.pic, imgHost),
    coverHeaders: imageHeaders(),
    subtitle: bits.join(' · ')
  };
}

function imageHeaders() {
  return { 'X-Lume-Image-Encoding': 'fernet', 'X-Lume-Image-Key': FERNET_KEY };
}

/// 站点有一组 purpose=10 的「小马/小学/初中/高中/禁区」分类，本脚本不接（见文件头）
var BANNED_GROUP_PURPOSE = 10;
var BANNED_WORDS = /小马|小学|初中|高中|萝莉|正太|幼齿|禁区|未成年/;

function groupAllowed(group) {
  if (!group) return false;
  if (Number(group.purpose) === BANNED_GROUP_PURPOSE) return false;
  if (BANNED_WORDS.test(String(group.name || ''))) return false;
  var tags = group.tag || [];
  for (var i = 0; i < tags.length; i++) {
    if (tags[i] && BANNED_WORDS.test(String(tags[i].name || ''))) return false;
  }
  return true;
}

/* ========================== 图源契约 ========================== */
var LumeSource = {
  id: 'xfdxv_video',
  name: '41看片 18+',
  version: '1.1.0',
  icon: 'https://img.zuoyebang.cc/zyb_513dc6dd137ee8262d370d80d9ad763e.jpg',
  category: 'video',
  mirrors: ['https://xfdxv.414459.lifestyle:8283'],

  /// 分类和筛选共用完整标签表，保留排序入口；相同标签只显示一次。
  async categories() {
    var categories = [
      { id: 'latest', title: '最新更新' },
      { id: 'hot', title: '最多观看' },
      { id: 'likes', title: '最多点赞' },
      { id: 'score', title: '高分' }
    ];
    var groups = (await this.filters()).groups;
    var seen = {};
    for (var i = 0; i < groups.length; i++) {
      for (var t = 0; t < groups[i].options.length; t++) {
        var option = groups[i].options[t];
        if (seen[option.id]) continue;
        seen[option.id] = true;
        categories.push({ id: 'tag:' + option.id, title: option.title });
      }
    }
    return categories;
  },

  /// 筛选：实时读 /api/vod/tag_group（带 fs 缓存），跳过 purpose=10 那组未成年分类。
  /// 抓不到就回空组，页面显示「本源不支持筛选」，不影响浏览。
  async filters() {
    try {
      var cached = null;
      try {
        var text = await LumeSource.fs.readText('tag-groups-v2.json');
        var saved = text ? JSON.parse(text) : null;
        if (saved && Array.isArray(saved.groups) && Date.now() - saved.at < 3600000) cached = saved.groups;
      } catch (error) {
        cached = null;
      }
      if (!cached) {
        var data = await apiGet('/api/vod/tag_group?per_page=200');
        var rows = (data && data.items) || [];
        var groups = [];
        for (var i = 0; i < rows.length; i++) {
          var group = rows[i];
          if (!groupAllowed(group)) continue;
          var tags = group.tag || [];
          var options = [];
          var seen = {};
          for (var t = 0; t < tags.length; t++) {
            if (!tags[t] || tags[t].id == null || String(tags[t].is_ad) === '1') continue;
            if (BANNED_WORDS.test(String(tags[t].name || ''))) continue;
            // 「随机数据」是首页的随机位占位标签，不是真分类
            if (/随机数据/.test(String(tags[t].name || ''))) continue;
            if (seen[tags[t].id]) continue;
            seen[tags[t].id] = true;
            options.push({ id: String(tags[t].id), title: String(tags[t].name) });
          }
          if (!options.length) continue;
          groups.push({ id: 'tag:' + group.id, title: String(group.name || ('分组 ' + group.id)), options: options });
        }
        cached = groups;
        try {
          await LumeSource.fs.writeText('tag-groups-v2.json', JSON.stringify({ at: Date.now(), groups: cached }));
        } catch (error) {
          /* 缓存失败无所谓 */
        }
      }
      return { groups: cached || [] };
    } catch (error) {
      console.warn('[xfdxv] 筛选标签抓取失败：' + error);
      return { groups: [] };
    }
  },

  async home() {
    var boards = [];
    // 两块并发抓：单个列表接口本机 100~1200ms，串行会顶到沙箱预算
    var pairs = await Promise.all([
      this.list({ categoryId: 'latest', page: 1 }),
      this.list({ categoryId: 'hot', page: 1 }).catch(function () {
        return { items: [] };
      })
    ]);
    if (pairs[0].items.length) boards.push({ title: '最新更新', moreUrl: 'latest', items: pairs[0].items.slice(0, 20) });
    if (pairs[1].items.length) boards.push({ title: '最多观看', moreUrl: 'hot', items: pairs[1].items.slice(0, 20) });
    if (!boards.length) throw new Error('41看片：首页列表是空的（接口可能改版）');
    return boards;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1);
    if (!page || page < 1) page = 1;
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var config = await currentConfig();

    var path;
    if (keyword) {
      // 搜索参数名是 search（keyword/q/wd 都被忽略，实测）
      path =
        '/search/vod/?search=' +
        encodeURIComponent(keyword) +
        '&page=' +
        page +
        '&per_page=' +
        PER_PAGE +
        '&site_id=' +
        config.siteId;
    } else {
      var order = '';
      var tagIds = [];
      if (/^tag:\d+$/.test(categoryId)) tagIds.push(categoryId.slice(4));
      else if (categoryId === 'hot') order = 'hits';
      else if (categoryId === 'likes') order = 'likes';
      else if (categoryId === 'score') order = 'score';
      var filters = args.filters || {};
      var keys = Object.keys(filters);
      for (var k = 0; k < keys.length; k++) {
        if (!/^tag:\d+$/.test(keys[k])) continue;
        var selected = String(filters[keys[k]] || '').split(',');
        for (var t = 0; t < selected.length; t++) {
          if (/^\d+$/.test(selected[t]) && tagIds.indexOf(selected[t]) < 0) tagIds.push(selected[t]);
        }
      }
      path = '/api/vod/video?page=' + page + '&per_page=' + PER_PAGE + '&site_id=' + config.siteId;
      if (order) path += '&orderby=' + order;
      if (tagIds.length) path += '&tag=' + encodeURIComponent(tagIds.join(','));
    }

    var data = (await apiGet(path, false)) || {};
    var rows = data.items || [];
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var item = itemOf(rows[i], config.imgHost);
      if (item) items.push(item);
    }
    if (!items.length && keyword) console.warn('[xfdxv] 搜索没结果：' + keyword);
    var pages = Number(data.pages) || 0;
    return { items: items, hasMore: pages ? page < pages : rows.length >= PER_PAGE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id || !/^\d+$/.test(id)) return null;
    var config = await currentConfig();
    var data;
    try {
      data = await apiGet('/api/vod/video/' + id, false);
    } catch (error) {
      if (/404|不存在|已下架|已删除/.test(String(error && error.message))) return null;
      throw error;
    }
    if (!data || data.id == null) return null;

    var bits = [];
    var duration = durationText(data.duration);
    if (duration) bits.push(duration);
    var tags = tagNames(data);
    if (tags.length) bits.push(tags.join('/'));
    if (data.hits != null) bits.push('观看 ' + data.hits);
    if (data.pubdate) bits.push(String(data.pubdate).slice(0, 10));

    var description = [];
    description.push(String(data.name || id));
    if (data.description) description.push(String(data.description));
    if (tags.length) description.push('标签：' + tags.join('、'));
    if (data.hits != null) description.push('播放 ' + data.hits + ' · 点赞 ' + (data.likes_count != null ? data.likes_count : '-'));
    if (Number(data.is_paid) === 1) {
      // 实测：付费标记不影响播放地址可用性（见文件头）
      description.push('源站标记：需购买（' + (data.price || '') + '）—— 接口仍给出完整播放地址');
    }
    return {
      id: id,
      title: String(data.name || id),
      cover: absoluteImg(data.pic, config.imgHost),
      coverHeaders: imageHeaders(),
      subtitle: bits.join(' · '),
      description: description.join('\n')
    };
  },

  /// 一条视频只有一条 m3u8，但站点给了多条线路域名：一线路 = 一章，播放失败可在 App 里换线路。
  async chapters(argument) {
    var config = await currentConfig();
    var rows = [];
    for (var i = 0; i < config.lines.length; i++) {
      rows.push({ id: 'line:' + config.lines[i], title: '线路' + (i + 1) + '（' + config.lines[i] + '）' });
    }
    if (!rows.length) rows.push({ id: 'line:auto', title: '播放' });
    return rows;
  },

  async content(argument) {
    var settings = argument || {};
    var id = String(settings.id || '').trim();
    if (!id || !/^\d+$/.test(id)) throw new Error('41看片：缺少视频 id（应来自 list() 的条目）');
    var chapterId = String(settings.chapterId || '').trim();
    var config = await currentConfig();
    var data = await apiGet('/api/vod/video/' + id, false);
    if (!data || data.id == null) throw new Error('41看片：源站没有这条视频（id ' + id + '）');

    var playPath = String(data.play_url || '').trim();
    if (!playPath) throw new Error('41看片：源站没给播放地址（play_url 为空，id ' + id + '）');

    var hosts = config.lines.slice(0);
    if (chapterId.indexOf('line:') === 0) {
      var picked = chapterId.slice(5);
      if (picked && picked !== 'auto' && hosts.indexOf(picked) < 0) hosts.unshift(picked);
      else if (picked && picked !== 'auto') {
        hosts = [picked];
        for (var j = 0; j < config.lines.length; j++) if (config.lines[j] !== picked) hosts.push(config.lines[j]);
      }
    }
    if (!hosts.length) hosts = LINE_FALLBACK.slice(0);

    var qualities = [];
    for (var i = 0; i < hosts.length; i++) {
      qualities.push({ label: '线路' + (i + 1), url: absoluteMedia(playPath, hosts[i]) });
    }
    var primary = qualities[0].url;

    // 兜底：站点另外给了 down_url（index.mp4）。海外专线那条对 mp4 会 403，只在前两条线路上挂。
    var downPath = String(data.down_url || '').trim();
    if (downPath) {
      var mp4Host = hosts[0];
      qualities.push({ label: '直连 MP4', url: absoluteMedia(downPath, mp4Host) });
    }

    return { kind: 'video', url: primary, headers: mediaHeaders(), qualities: qualities };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
