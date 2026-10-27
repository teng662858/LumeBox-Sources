// LumeSource: {"id":"hstv_video","name":"好色TV","version":"1.0.0","category":"video","mirrors":["https://hstv.fun","https://hstv.pro"]}
// 站点：https://hstv.fun（好色TV；Angular SPA，**内容全靠一个加密 JSON 接口**）
//
// ## 为什么这个源比别的源长：接口响应是加密的
//
// 页面本身是 6KB 的 SPA 空壳（无 SSR、无 sitemap），数据来自
//   POST https://<v2 集群域名>/js
//   body: {url:<逻辑路由>, app:<站点 host>, version:"260901", auth:"Bearer ",
//          deviceInfo:{...}, isStandalone:false, theLink:"novaluenull", uuid:"U<时间戳><随机>"}
// 响应是 CryptoJS 的 AES 密文：{"r":"U2FsdGVkX1…"}（OpenSSL 派生：base64("Salted__"+salt+ct)，
// 口令是前端代码里的字面量 "xxx"，AES-256-CBC）。所以本源自带纯 JS 的 MD5 + AES-256-CBC 解密
// （沙箱里没有 crypto / atob / TextDecoder），实测 22KB 密文解密 6ms。
//
// ## 逻辑路由（对着前端 chunk 逐个核过，不是猜的）
//
//   列表  /sevenVideos?page=<N>&type=<分类>       → JSON 数组（24 条/页，无总数字段）
//   搜索  /searchSevenVideos  {page,keywords,filterCategory,filterTimeInDays,
//                              filterViews,filterDurationInMins,sortBy,keywordLogic}
//         这些 filter 参数是**顶层字段**，和 url 并列塞在同一个 body 里。
//   详情  /sevenVideos/<id>                     → 单个对象（含 m3u8 / m3u8s[]）
//   播放  detail.m3u8s[0]（HLS）
//
// ## 分类
//
// 站点导航给的 type 值**逐个抄自首页快照**（最近更新 / 各传媒专题 / 重口系列 / 站长推荐 /
// 欧美 / 女同…），一个不落；SSR 层不认 type，但接口认。
//
// ## 反滥用（必须知道）
//
// 接口对**高频/批量**请求会直接回 403，并且前端会向 /banned 上报——这是按出口 IP 的封禁，
// 不是 Cloudflare 人机校验（所以这里**不抛 NEED_WEBVIEW_VERIFY**，弹网页也没用）。
// 遇到 403 时本源如实报错，并说明稍后重试 / 换网络。
//
// ## 纪律
// 1. base() 优先用宿主注入的域名（换镜像 / 手填域名立刻生效），app 字段跟着 base 走
//    （站点按 host 判断租户）。
// 2. 接口集群有 8 个域名（v2.cdn199.com …），按顺序试；连不上就换下一个，
//    403 不重试（封禁状态下换域名也没用，只会加深封禁）。

var DEFAULT_BASE = 'https://hstv.fun';

var API_HOSTS = [
  'https://v2.cdn199.com',
  'https://v2.kekecdn.net',
  'https://v2.luchu.org',
  'https://v2.madou.ws',
  'https://v2.papapa.biz',
  'https://v2.tianmtv.com',
  'https://v2.xiaoshuo.info',
  'https://v2.xiaoshuo.la'
];

var API_VERSION = '260901';
var AES_PASS = 'xxx';        // 前端代码里的字面量（见 decrypt(){Jg.AES.decrypt(l.r,"xxx")}）
var PAGE_SIZE = 24;          // 接口每页条数（实测）
var MAX_ITEMS = 120;

/// 站点地址：自定义域名 > 用户选中的镜像 > 脚本声明的第一个镜像。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

// ====================================================================== 加密

var __SBOX = null, __INV = null, __RCON = null, __M9 = null, __M11 = null, __M13 = null, __M14 = null;

/// 查表只建一次：S-box / 逆 S-box / 9·11·13·14 乘法表（逐字节 mul 循环太慢）。
function __initAes() {
  if (__SBOX) return;
  var sbox = [], inv = [];
  function xtime(b) { return ((b << 1) ^ ((b & 0x80) ? 0x1B : 0)) & 0xFF; }
  function mul(a, b) { var r = 0; while (b) { if (b & 1) r ^= a; a = xtime(a); b >>= 1; } return r & 0xFF; }
  for (var x = 0; x < 256; x++) {
    var invx = 0;
    if (x !== 0) { for (var y = 1; y < 256; y++) { if (mul(x, y) === 1) { invx = y; break; } } }
    var b = invx, s = b ^ 0x63;
    for (var r = 1; r <= 4; r++) s ^= ((b << r) | (b >>> (8 - r))) & 0xFF;
    sbox[x] = s & 0xFF; inv[s & 0xFF] = x;
  }
  __SBOX = sbox; __INV = inv;
  __M9 = []; __M11 = []; __M13 = []; __M14 = [];
  for (var i = 0; i < 256; i++) {
    __M9[i] = mul(i, 9); __M11[i] = mul(i, 11); __M13[i] = mul(i, 13); __M14[i] = mul(i, 14);
  }
  __RCON = []; var rc = 1;
  for (var k = 0; k < 15; k++) { __RCON[k] = rc; rc = xtime(rc); }
}

function __md5(bytes) {
  function add(x, y) {
    var l = (x & 0xFFFF) + (y & 0xFFFF);
    return (((x >>> 16) + (y >>> 16) + (l >>> 16)) << 16) | (l & 0xFFFF);
  }
  function rol(n, c) { return ((n << c) | (n >>> (32 - c))) | 0; }
  var msg = bytes.slice(0), bitLen = msg.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  for (var i = 0; i < 8; i++) msg.push((bitLen / Math.pow(2, 8 * i)) & 255);
  var a0 = 0x67452301, b0 = 0xEFCDAB89, c0 = 0x98BADCFE, d0 = 0x10325476;
  var S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
           5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
           4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
           6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  var K = __md5.K;
  if (!K) {
    K = __md5.K = [];
    for (var kk = 0; kk < 64; kk++) K[kk] = Math.floor(Math.abs(Math.sin(kk + 1)) * 4294967296) | 0;
  }
  for (var off = 0; off < msg.length; off += 64) {
    var M = [];
    for (var j = 0; j < 16; j++) {
      M[j] = msg[off + j*4] | (msg[off + j*4+1] << 8) | (msg[off + j*4+2] << 16) | (msg[off + j*4+3] << 24);
    }
    var A = a0, B = b0, C = c0, D = d0;
    for (var i2 = 0; i2 < 64; i2++) {
      var F, g;
      if (i2 < 16) { F = (B & C) | (~B & D); g = i2; }
      else if (i2 < 32) { F = (D & B) | (~D & C); g = (5*i2 + 1) & 15; }
      else if (i2 < 48) { F = B ^ C ^ D; g = (3*i2 + 5) & 15; }
      else { F = C ^ (B | ~D); g = (7*i2) & 15; }
      var tmp = D; D = C; C = B;
      B = add(B, rol(add(add(A, F), add(K[i2], M[g])), S[i2]));
      A = tmp;
    }
    a0 = add(a0, A); b0 = add(b0, B); c0 = add(c0, C); d0 = add(d0, D);
  }
  var out = [];
  var words = [a0, b0, c0, d0];
  for (var w = 0; w < 4; w++) {
    for (var i3 = 0; i3 < 4; i3++) out.push((words[w] >>> (8 * i3)) & 255);
  }
  return out;
}

function __b64ToBytes(s) {
  var T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var out = [], bits = 0, buf = 0;
  s = String(s).replace(/[^A-Za-z0-9+\/=]/g, '');
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (c === '=') break;
    var v = T.indexOf(c);
    if (v < 0) continue;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >>> bits) & 255); }
  }
  return out;
}

function __strToBytes(s) {
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 128) out.push(c);
    else if (c < 2048) { out.push(192 | (c >> 6), 128 | (c & 63)); }
    else { out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); }
  }
  return out;
}

function __bytesToStr(b) {
  var s = '', i = 0;
  while (i < b.length) {
    var c = b[i++];
    if (c < 128) s += String.fromCharCode(c);
    else if (c < 224) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63));
    else if (c < 240) {
      var b2 = b[i++], b3 = b[i++];
      s += String.fromCharCode(((c & 15) << 12) | ((b2 & 63) << 6) | (b3 & 63));
    } else { i += 2; s += String.fromCharCode(0xFFFD); }
  }
  return s;
}

/// AES-256-CBC 解密（密钥 32 字节、链式 IV，握手块取上一段密文）。
function __aesDecrypt(ct, key, iv) {
  __initAes();
  var SBOX = __SBOX, INV = __INV, M9 = __M9, M11 = __M11, M13 = __M13, M14 = __M14, RCON = __RCON;
  var Nk = key.length / 4, Nr = Nk + 6, total = 4 * (Nr + 1);
  var w = [];
  function subWord(x) {
    return (SBOX[(x >>> 24) & 255] << 24) | (SBOX[(x >>> 16) & 255] << 16)
      | (SBOX[(x >>> 8) & 255] << 8) | SBOX[x & 255];
  }
  function rotWord(x) { return ((x << 8) | (x >>> 24)) >>> 0; }
  for (var i = 0; i < Nk; i++) {
    w[i] = ((key[4*i] << 24) | (key[4*i+1] << 16) | (key[4*i+2] << 8) | key[4*i+3]) >>> 0;
  }
  for (var i2 = Nk; i2 < total; i2++) {
    var t = w[i2 - 1];
    if (i2 % Nk === 0) t = (subWord(rotWord(t)) ^ (RCON[i2 / Nk - 1] << 24)) >>> 0;
    else if (Nk > 6 && i2 % Nk === 4) t = subWord(t);
    w[i2] = (w[i2 - Nk] ^ t) >>> 0;
  }
  var out = [], s = [], prev = iv.slice(0);
  for (var off = 0; off < ct.length; off += 16) {
    for (var i3 = 0; i3 < 16; i3++) s[i3] = ct[off + i3];
    for (var c = 0; c < 4; c++) {
      var wd = w[Nr * 4 + c];
      s[4*c] ^= (wd >>> 24) & 255; s[4*c+1] ^= (wd >>> 16) & 255;
      s[4*c+2] ^= (wd >>> 8) & 255; s[4*c+3] ^= wd & 255;
    }
    for (var r = Nr - 1; r >= 1; r--) {
      var tmp = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = s[1]; s[1] = tmp;
      tmp = s[2]; s[2] = s[10]; s[10] = tmp;
      tmp = s[6]; s[6] = s[14]; s[14] = tmp;
      tmp = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = tmp;
      for (var i4 = 0; i4 < 16; i4++) s[i4] = INV[s[i4]];
      for (var c2 = 0; c2 < 4; c2++) {
        var wd2 = w[r * 4 + c2];
        s[4*c2] ^= (wd2 >>> 24) & 255; s[4*c2+1] ^= (wd2 >>> 16) & 255;
        s[4*c2+2] ^= (wd2 >>> 8) & 255; s[4*c2+3] ^= wd2 & 255;
      }
      for (var c3 = 0; c3 < 4; c3++) {
        var a0 = s[4*c3], a1 = s[4*c3+1], a2 = s[4*c3+2], a3 = s[4*c3+3];
        s[4*c3]   = M14[a0] ^ M11[a1] ^ M13[a2] ^ M9[a3];
        s[4*c3+1] = M9[a0]  ^ M14[a1] ^ M11[a2] ^ M13[a3];
        s[4*c3+2] = M13[a0] ^ M9[a1]  ^ M14[a2] ^ M11[a3];
        s[4*c3+3] = M11[a0] ^ M13[a1] ^ M9[a2]  ^ M14[a3];
      }
    }
    var tm = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = s[1]; s[1] = tm;
    tm = s[2]; s[2] = s[10]; s[10] = tm;
    tm = s[6]; s[6] = s[14]; s[14] = tm;
    tm = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = tm;
    for (var i5 = 0; i5 < 16; i5++) s[i5] = INV[s[i5]];
    for (var c4 = 0; c4 < 4; c4++) {
      var wd3 = w[c4];
      s[4*c4] ^= (wd3 >>> 24) & 255; s[4*c4+1] ^= (wd3 >>> 16) & 255;
      s[4*c4+2] ^= (wd3 >>> 8) & 255; s[4*c4+3] ^= wd3 & 255;
    }
    for (var k = 0; k < 16; k++) out[off + k] = s[k] ^ prev[k];
    for (var p = 0; p < 16; p++) prev[p] = ct[off + p];
  }
  return out;
}

/// CryptoJS.AES.decrypt(ciphertext, passphrase) 的等价实现。
function __cryptoJsDecrypt(b64, pass) {
  var raw = __b64ToBytes(b64);
  if (__bytesToStr(raw.slice(0, 8)) !== 'Salted__') {
    throw new Error('好色TV：接口响应不是预期的加密格式');
  }
  var salt = raw.slice(8, 16), ct = raw.slice(16), pb = __strToBytes(pass);
  var d1 = __md5(pb.concat(salt));
  var d2 = __md5(d1.concat(pb).concat(salt));
  var d3 = __md5(d2.concat(pb).concat(salt));
  var pt = __aesDecrypt(ct, d1.concat(d2), d3);
  var pad = pt[pt.length - 1];
  if (pad >= 1 && pad <= 16) pt = pt.slice(0, pt.length - pad);
  return __bytesToStr(pt);
}

// ====================================================================== 源

var LumeSource = {
  id: 'hstv_video',
  name: '好色TV',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://hstv.fun', 'https://hstv.pro'],

  /// 分类＝站点自己的 type（抄自首页导航；SSR 不认 type，但接口认）。
  async categories() {
    return [
      { id: 'recent', title: '最近更新' },
      { id: 'hd', title: '高清视频' },
      { id: 'recent_hot', title: '最近加精' },
      { id: 'hot', title: '当前最热' },
      { id: '91original', title: '91原创' },
      { id: '10mins', title: '10分钟以上' },
      { id: '20mins', title: '20分钟以上' },
      { id: 'month_discuss', title: '本月讨论' },
      { id: 'month_favs', title: '本月收藏' },
      { id: 'favs', title: '收藏最多' },
      { id: 'month_hot', title: '本月最热' },
      { id: 'last_month_hot', title: '上月最热' },
      { id: 'c0', title: '国产自拍' },
      { id: 'c1', title: '麻豆视频' },
      { id: 'c2', title: '91制片厂' },
      { id: 'c3', title: '玩偶姐姐' },
      { id: 'c4', title: '小鸟酱专题' },
      { id: 'c5', title: '糖心Vlog' },
      { id: 'c6', title: '天美传媒' },
      { id: 'c7', title: '蜜桃传媒' },
      { id: 'c8', title: '皇家华人' },
      { id: 'c9', title: '星空传媒' },
      { id: 'ca', title: '精东影业' },
      { id: 'cb', title: '乐播传媒' },
      { id: 'cc', title: '成人头条' },
      { id: 'cd', title: '乌鸦传媒' },
      { id: 'ce', title: '兔子先生' },
      { id: 'cf', title: 'PsychoPorn' },
      { id: 'cg', title: '葫芦影业' },
      { id: 'ci', title: '杏吧原创' },
      { id: 'cj', title: 'mimi传媒' },
      { id: 'ck', title: '大象传媒' },
      { id: 'cl', title: '开心鬼传媒' },
      { id: 'cm', title: '鲸鱼传媒' },
      { id: 'swag', title: '台湾SWAG' },
      { id: 'banana', title: '汝工作室' },
      { id: 'west', title: '欧美推荐' },
      { id: 'pissvids', title: '欧美重口' },
      { id: 'kink', title: 'Kink精选' },
      { id: 'xart', title: 'X-art精选' },
      { id: 'lesbian', title: '女同' },
      { id: 'gcsm', title: '国产SM' },
      { id: 'torture_all', title: '重口系列' },
      { id: 'torture_asian', title: '重口·亚洲' },
      { id: 'torture_west', title: '重口·欧美' },
      { id: 'torture_comic', title: '重口·动漫' },
      { id: 'torture_other', title: '重口·其他' },
      { id: 't_high_gaoqing', title: '高清AV' },
      { id: 't_high_zhubo', title: '主播福利' },
      { id: 't_high_wuma', title: '无码流出' },
      { id: 't_high_zipai', title: '自拍偷拍' },
      { id: 't_high_tanhua', title: '探花精选' },
      { id: 't_high_yao', title: '人妖伪娘' },
      { id: 't_high_lifan', title: '里番' }
    ];
  },

  /// 首页：最近更新两屏（接口 24 条/页，取 18 条）。
  async home() {
    var list = await this.list({ categoryId: 'recent', page: 1 });
    return [{ title: '最近更新', items: list.items.slice(0, 18) }];
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = this.__clean(args.keyword || '');
    var category = String(args.categoryId == null ? '' : args.categoryId) || 'recent';
    var data;
    if (keyword) {
      data = await this.__request('/searchSevenVideos', {
        page: page,
        keywords: keyword,
        filterCategory: 'all',
        filterTimeInDays: 'all',
        filterViews: 'all',
        filterDurationInMins: 'all',
        sortBy: 'time',
        keywordLogic: 'or'
      });
    } else {
      data = await this.__request('/sevenVideos?page=' + page + '&type=' + encodeURIComponent(category), null);
    }
    var rows = Array.isArray(data) ? data : [];
    var items = [];
    for (var i = 0; i < rows.length && items.length < MAX_ITEMS; i++) {
      var item = this.__item(rows[i]);
      if (item) items.push(item);
    }
    if (!items.length) console.warn('[hstv] 列表为空：' + (keyword ? '搜索 ' + keyword : category) + ' 第 ' + page + ' 页');
    // 接口没有总数字段：整页就是「还有下一页」的唯一判据。
    return { items: items, hasMore: rows.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var data = await this.__video(id);
    return {
      id: id,
      title: String(data.title || id),
      cover: this.__cover(data),
      coverHeaders: { 'Referer': base() + '/' },
      subtitle: this.__subtitle(data),
      description: this.__description(data)
    };
  },

  /// 单视频没有分话：给一条「播放」入口。
  async chapters(argument) {
    this.__id(argument);
    return [{ id: 'play', title: '播放' }];
  },

  async content(argument) {
    var id = this.__id(argument);
    var data = await this.__video(id);
    var url = '';
    if (Array.isArray(data.m3u8s) && data.m3u8s.length) url = String(data.m3u8s[0] || '');
    if (!url) url = String(data.m3u8 || '');
    if (!url) {
      throw new Error('好色TV：该视频没有播放地址（VIP 专享或已下架）：' + id);
    }
    return {
      kind: 'video',
      url: url,
      headers: { 'Referer': base() + '/', 'User-Agent': this.__ua() }
    };
  },

  // ---------------------------------------------------------------- 接口

  /// 逻辑路由 → 解密后的 JSON。集群域名按顺序试，403 直接报「被封」不再试。
  async __request(logical, extra) {
    var lastError = null;
    for (var i = 0; i < API_HOSTS.length; i++) {
      var host = API_HOSTS[i];
      try {
        return await this.__requestOnce(host, logical, extra);
      } catch (error) {
        lastError = error;
        var text = String(error);
        if (text.indexOf('HTTP 403') >= 0) break;   // 封禁：换域名没用
        console.warn('[hstv] ' + host + ' 失败：' + text.slice(0, 80));
      }
    }
    throw lastError || new Error('好色TV：接口全部不可用');
  },

  async __requestOnce(host, logical, extra) {
    var body = {
      url: logical,
      app: this.__app(),
      version: API_VERSION,
      auth: 'Bearer ',
      deviceInfo: this.__deviceInfo(),
      isStandalone: false,
      theLink: 'novaluenull',
      uuid: await this.__uuid()
    };
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) body[key] = extra[key];
      }
    }
    var response = await LumeSource.http.post(host + '/js', JSON.stringify(body), {
      headers: {
        'Content-Type': 'application/json',
        'Origin': base(),
        'Referer': base() + '/',
        'User-Agent': this.__ua(),
        'Authorization': 'Bearer '
      }
    });
    var status = response ? Number(response.status) : 0;
    var text = response && response.body ? String(response.body) : '';
    if (status === 403) {
      throw new Error('好色TV：接口拒绝访问（HTTP 403）。站点对高频/批量请求按 IP 封禁，'
        + '请稍后重试或换网络；不是人机校验，弹网页也没用');
    }
    if (status !== 200) {
      throw new Error('好色TV：接口 ' + logical + ' 返回 HTTP ' + status);
    }
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error('好色TV：接口响应不是 JSON（' + logical + '）');
    }
    if (!parsed || typeof parsed.r !== 'string') {
      throw new Error('好色TV：接口响应缺少密文字段（' + logical + '）');
    }
    var plain = __cryptoJsDecrypt(parsed.r, AES_PASS);
    try {
      return JSON.parse(plain);
    } catch (error) {
      throw new Error('好色TV：解密后的内容不是 JSON（' + logical + '）');
    }
  },

  async __video(id) {
    var data = await this.__request('/sevenVideos/' + encodeURIComponent(id), null);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('好色TV：详情接口没给出视频对象（' + id + '）');
    }
    return data;
  },

  /// 设备标识：站点按 host 判租户、按 uuid 记设备。uuid 存在本源自己的 fs 里，
  /// 别每次换新的（会被当成新设备，也更容易触发风控）。
  async __uuid() {
    var fs = LumeSource.fs;
    try {
      var saved = fs && fs.readText ? await fs.readText('hstv.uuid') : '';
      if (saved && /^U\d{16,20}$/.test(saved)) return saved;
    } catch (error) {}
    var now = new Date();
    function pad(n, w) {
      var s = String(n);
      while (s.length < w) s = '0' + s;
      return s;
    }
    var id = 'U' + now.getFullYear() + pad(now.getMonth() + 1, 2) + pad(now.getDate(), 2)
      + pad(now.getHours(), 2) + pad(now.getMinutes(), 2) + pad(now.getSeconds(), 2)
      + pad(now.getMilliseconds(), 3) + pad(Math.floor(Math.random() * 10), 1);
    try {
      if (fs && fs.writeText) await fs.writeText('hstv.uuid', id);
    } catch (error) {}
    return id;
  },

  __app() {
    var m = /^https?:\/\/([^\/]+)/i.exec(base());
    return m ? m[1] : 'hstv.fun';
  },

  __ua() {
    return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
      + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  },

  __deviceInfo() {
    return {
      model: 'iPhone',
      platform: 'web',
      operatingSystem: 'ios',
      osVersion: '17.0',
      manufacturer: 'Apple',
      isVirtual: false,
      webViewVersion: '605.1.15'
    };
  },

  // ---------------------------------------------------------------- 解析

  __item(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = String(raw.id || raw.vId || '').trim();
    if (!id) return null;
    var title = this.__clean(raw.title || raw.title_en || '');
    if (!title) return null;
    return {
      id: id,
      title: title,
      cover: this.__cover(raw),
      coverHeaders: { 'Referer': base() + '/' },
      subtitle: this.__subtitle(raw),
      // App 的条目模型有 duration（search 结果里显示时长），字段名就叫 duration。
      duration: String(raw.durationStr || '')
    };
  },

  __cover(raw) {
    var list = raw.thumbnails || raw.thumbNails || [];
    for (var i = 0; i < list.length; i++) {
      var url = String(list[i] || '').trim();
      if (url && !/\.gif$/i.test(url)) return url.indexOf('//') === 0 ? 'https:' + url : url;
    }
    return '';
  },

  __subtitle(raw) {
    var parts = [];
    var user = this.__clean(raw.user || raw.user_en || '');
    if (user) parts.push(user);
    var views = Number(raw.views);
    if (views > 0) {
      parts.push(views >= 10000 ? (views / 10000).toFixed(1) + '万次播放' : views + '次播放');
    }
    if (raw.time) parts.push(String(raw.time));
    if (raw.vip) parts.push('VIP');
    return parts.join(' · ');
  },

  __description(raw) {
    var text = String(raw.keywords_gem || raw.tags || '').trim();
    if (!text) text = String(raw.title_en || '').trim();
    return text.slice(0, 300);
  },

  __clean(text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  },

  __id(argument) {
    var raw = '';
    var keys = ['id', 'itemId', 'url'];
    for (var i = 0; argument && i < keys.length && !raw; i++) {
      if (argument[keys[i]] != null) raw = String(argument[keys[i]]).trim();
    }
    var m = /\/video\/([^\/\s"'?#]+)/.exec(raw);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw;
    throw new Error('好色TV：缺少视频 ID');
  }
};
