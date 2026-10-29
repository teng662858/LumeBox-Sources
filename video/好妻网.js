// LumeSource: {"id":"haoqi7_video","name":"好妻网 18+","version":"1.0.1","category":"video","mirrors":["https://haoqi7.com","https://hao77.work","https://hao77.pro"]}
//
// 站点：https://haoqi7.com （标题「首映好片 - 高清视频频道 - 好妻网」）
// 2026-10-25 逐页实测；**本站直连不通（curl / Node fetch 都 000），必须走本机代理**
// ── 请在这份源自己的「源设置 → 网络」里配代理（App 里代理由用户填，脚本不硬编码任何代理地址）。
//    脚本在连不上时抛可读错误「连不上站点…请给本源配代理」，在 403/503 时抛 NEED_WEBVIEW_VERIFY。
//
// ── 镜像（实测）
//    haoqi7.com 与 hao77.work **同站双活**：同样的首页字节数、同样的 /_serverFn 分类回包、
//    同样的 /play 详情页（各自的 m3u8 媒体域不同，但都能播）。
//    另外站点安装提示里写的「易记域名 hao77.pro、haoqi77.com」实测 302 到随机子域
//    （如 265fc946.74mn9.vip / 579bf466.2dr9i.vip）后仍是同一站点，留一个 hao77.pro 作应急镜像。
//
// ── 站点内核（先说清楚，省后面误解）
//    不是 PHP 站，是 **TanStack Start（Vinxi/Nitro）SSR 应用**：Vue 风格无关，页面由
//    react + `$R[n]=…` 形式的序列化 store 内联，资源是 `/assets/main-xXS-ugzf.js`（1.1MB）。
//    静态资源同样要经代理。
//
// ── 一、导航与板块
//    首页 `/`、`/appcenter`、`/videosPage`（视频频道）、`/aiTools`、`/comics`、`/novel`、`/snapshot`。
//    本源**只做视频板块**（`/videosPage` 与 `/play`），漫画/小说/美图不做。
//
// ── 二、分类（实时抓）
//    分类来自站点自己的 server function：
//      GET  /_serverFn/1354834ad42c8644691fcd33e28d91fbdbe39517f95959fe5811245de0ef4148
//      → [{id:"<24位 ObjectId>", name:"首映好片", type:"basic", bHide:false}, …]（实测 14 个）
//    **免 token**（游客即可）。这是导航里「首映好片 / 淫乱人妻 / 国产自拍 / 二次元 …」那一排。
//    首页 SSR 里也内联了同一份（initialCateId + topCategories），本源以接口为准。
//
// ── 三、列表页形态与分页（关键）
//    列表**没有可翻页的 URL**：`/videosPage/<cateId>`（例 `/videosPage/68f85b1c6afab4e11c8320f4`）
//    的 SSR HTML 里只有分类名，卡片是浏览器 hydrate 之后才拉的；`?page=2` 对 SSR 无影响。
//    真正的内容接口是同一套 server function（POST，body 为 seroval 序列化）：
//      POST /_serverFn/edb02c42c935ccf0aa4b61c9363d57fd40f78f6cce9a66e6fbb435ba70c148b4
//           {data:{cateId, page, pageSize, hasTop:false, hasGuide:false, compositeSort:4}}
//      → {guideCategories:[…], childCategories:[{id,name,type,videos:[{id,title,coverUrl,
//         duration,playCount,likeCount,payType,price,…}]}], videoCnt, bHide}
//    一个分类固定 10–12 个「模块」，每个模块 6 条左右的视频，拼起来约 **60–72 条**；
//    接口的 page 参数只对「模块列表」本身翻页（实测 page=2 返回 0 个模块，说明分类就只有这一层）。
//    所以本源的做法：一次取回整个分类的全部卡片，再按 20 条/页在本地切片（hasMore 按剩余条数算）。
//    实测 list page=1 与 page=2 返回不同的 20 条，均可正常出详情/播放。
//    真正的「更深」分页在模块维度，见下条。
//
//    每个模块自己的分页接口（本源暂未用于 list，留作说明）：
//      POST /_serverFn/6d4191fca5a23542039eeafb259a9f0ea96eaf2b359172d058c8af729f347693
//           {id:<模块 id>, page, pageSize, timeType:2, compositeSort:4}
//      → {list:[…], page, pageSize, hasMore}（实测 page=1 pageSize=15 → 15 条，hasMore=true；
//        **注意不要带 userRelationContent / range 字段**，带了会返回空 list）
//
// ── 四、搜索
//    GET /search/<URL 编码的关键词>?page=N   ← 关键词在**路径**里，分页走 query（?page=2 实测换了一批 id）
//    SSR HTML 内联 `initialSearch:$R[..]={keyword,type:1,page,pageSize:16,totalCount,hasMore,
//    list:[{id,kind:"video",title,coverUrl,summary,playCount,duration,likedCount,
//    collectedCount,releaseDateLabel,uid}]}`，本源正则抠这一段（页内 16 条/页）。
//    `?keyword=` 形式的 `/search?keyword=…` 是空壳（不返回结果），别用。
//
// ── 五、详情 / 播放地址在哪
//    详情页 GET /play/<id>（**不是** /video/<id>），SSR 内联：
//      initialDetail={id,title,coverUrl,duration,playCount,
//        m3u8Url:"https://<随机媒体域>/api/v1/videos/m3u8/<id>/<id>/f.m3u8?s=<签名>&h=…",
//        previewM3u8Url:"…/m3u8pre/…/f.m3u8?s=…&p=20…",
//        isFree, isVipFree, publisherName, publisherAvatar, tags:[{id,name}],
//        files:[{id,title,name,url,order}]   ← 前端播放器实际用的是 files[0].url（＝试看地址）
//        payType, price, likeCount, collectCount, commentCount}
//    外加 JSON-LD `VideoObject`（name / thumbnailUrl / duration / contentUrl / interactionStatistic）。
//    媒体域名每次请求都会换（实测 hao77.work / afd1b424.oas7c.vip / 43bb7698.k39dz.vip /
//    8313c926.rxzwn.vip），签名也在 URL 里 —— **每次播放都要现取详情页**，不能缓存地址。
//
// ── 六、VIP / 登录（实测结论，不粉饰）
//    1) 站点确实有会员体系：详情页有「试看2分钟，开通至尊会员解锁完整版」浮层，卡片上 payType:3、
//       price/会员相关字段，`/member-zone` 是会员专区；游客（未登录）能看列表、能进详情页。
//    2) **免登录拿到完整片源**：详情页 SSR 把 `m3u8Url`（完整版，不是 previewM3u8Url）直接发给
//       匿名请求；本源用的就是它。实测 4 条样本 playlist 全部 200 且是整片：
//         · 网上约的大学生…  duration 716 秒 → m3u8 239 段 / 累计 717 秒
//         · 吃瓜精选…        duration 1032.6 秒 → m3u8 345 段 / 累计 1033 秒
//         · 重金定制…        duration 786.7 秒 → m3u8 262 段 / 累计 785 秒
//         · 陕西清纯女大…    duration 266.5 秒 → m3u8 89 段 / 累计 267 秒
//       分段数与时长和 `duration` 对得上 ⇒ 不是 2 分钟试看片段（previewM3u8Url 只有 1.2KB、几十段）。
//       m3u8 首行是 `#EXTM3U`，带 `#EXT-X-KEY:METHOD=AES-128,URI="https://<媒体域>/encrypt.key"`
//       —— 播放器自己取 key 解分片，本源不碰。
//    3) 也就是说：**VIP 锁只存在于前端**（前端挑 files[0].url=试看地址 + 弹窗卖会员），服务端对
//       完整 m3u8 不做登录/VIP 校验。所以本源不伪造结论、也不写任何登录逻辑：直取 m3u8Url 即可。
//    4) 拿不到的：真正登录才有的东西（收藏、关注、评论、观看历史、会员去水印之类）本源一概不碰；
//       如果某条视频的 m3u8Url 为空，就退回 previewM3u8Url（试看），再不行交回 App 的网页播放器。
//
// ── 七、封面（务必知道）
//    封面是 `*.ceb` / `*.geb`：**AES-ECB 加密过的 `data:image/...` 文本**，站点自己的 JS 里
//    fetch 后解密再 `URL.createObjectURL` 成 blob: 才显示（`main-*.js` 里的 `ree()`）。
//    CDN 的 content-type 假装 image/jpeg，但字节里没有任何 JPEG/PNG/WEBP magic（实测头部
//    a867626d…），换 .jpg/.png/.webp 后缀一律 404。App 的图片管线拿到的是密文 ⇒ 会显示占位图。
//    这是站点侧限制（脚本没有跑客户端 JS 的能力），本源如实返回加密地址，不假造图片。
//
// ── 八、本源的实现要点
//    · server function 的请求体是 **seroval 序列化**：`{"t":<node>,"f":63,"m":[]}`，
//      节点形如 {t:10,i:<id>,p:{k:[键…],v:[值…]},o:0}（对象）/ {t:9,i,a:[…],o:0}（数组）/
//      {t:1,s:"str"}（字符串）/ {t:0,s:123}（数字）/ {t:2,s:2|3}（布尔，2=true 3=false）。
//      响应也是同一套编码（根节点就地是 `{"t":10,…}`）。下面自带 encoder/decoder，实测与站点一致。
//    · 免 token：所有请求只带 `t: 2`、`k: 2` 两个头（站点自己的弱校验）。不需要游客 signin
//      （`POST /api/v1/users/signin` 的 data 是 AES-256-ECB + gzip 的密文，能不碰就不碰）。
//    · 列表里的 title 是 JS 字符串字面量，可能带 \" 与 \uXXXX —— 抠出来要反转义。
//    · 失败一律抛可读错误，不静默返回空数组。
//
// ── 九、自测（开发期，Node 侧；直连 000，必须让 Node 也走代理）
//    PowerShell:
//      $env:NODE_USE_ENV_PROXY=1; $env:HTTPS_PROXY="http://127.0.0.1:7890"
//      node tools/lume-source-check.mjs sources/video/haoqi7.js --keyword 学妹
//    2026-10-25 结果：[PASS]，categories 14 个 / list 20 条 hasMore=true / detail 有标题封面 /
//    chapters 1 集 / content 给出整片 m3u8、playable probe 200 + #EXTM3U（46KB、page=2 亦 PASS）。
//    不配代理时：抛「好妻网连不上（fetch failed）——本站需要代理…」（见上，可读、不静默）。

var DEFAULT_BASE = 'https://haoqi7.com';
var DEFAULT_CATE = '68f85b1c6afab4e11c8320f4'; // 首映好片（分类接口的第一项也是它）
var PAGE_SIZE = 20;
var MODULE_PAGE_SIZE = 20; // 一次取回整个分类的卡片（实测约 60~72 条）
var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 站点 server function 的固定 hash（TanStack Start 的 /_serverFn/<hash>）
var SF_CATEGORIES = '1354834ad42c8644691fcd33e28d91fbdbe39517f95959fe5811245de0ef4148'; // GET  分类
var SF_MODULES = 'edb02c42c935ccf0aa4b61c9363d57fd40f78f6cce9a66e6fbb435ba70c148b4'; // POST 分类下的模块+卡片
var SF_MODULE_PAGE = '6d4191fca5a23542039eeafb259a9f0ea96eaf2b359172d058c8af729f347693'; // POST 单个模块的分页

/* ============================ 基础工具 ============================ */

function base() {
  var config = typeof LumeSource !== 'undefined' && LumeSource.config ? LumeSource.config : null;
  var domain = config && config.domain ? String(config.domain) : '';
  return (domain || DEFAULT_BASE).replace(/\/+$/, '');
}

/// HTML / JS 字面量实体与转义还原
function unescapeJs(text) {
  return String(text == null ? '' : text)
    .replace(/\\u([0-9a-fA-F]{4})/g, function (_all, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/\\x([0-9a-fA-F]{2})/g, function (_all, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/\\(["'\\\/])/g, '$1');
}

function entity(text) {
  return String(text == null ? '' : text).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (all, code) {
    var map = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', '#39': "'", '#34': '"' };
    if (map[code] !== undefined) return map[code];
    if (code.charAt(0) === '#') {
      var n =
        code.charAt(1) === 'x' || code.charAt(1) === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
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
  return entity(unescapeJs(out))
    .replace(/\s+/g, ' ')
    .trim();
}

/// 相对地址补绝对（站点的封面/头像本来就是绝对地址，这里兜住相对的）
/* ════════ 封面：*.ceb / *.geb 是 AES-256-ECB 加密过的 `data:image/...` 文本 ════════
 * 站点前端 ree() 的做法是 fetch 二进制 → base64 → AES-256-ECB/Pkcs7 → 得到一个 data URI。
 * 这活儿交给 App 的图片管线更合适：这里只声明「怎么解」，不用在 JS 沙箱里跑纯 JS AES
 * （实测 275KB 纯 JS 要 2.7s，原生 AES ~20ms）。
 * 约定：cover 写成 `lume-enc://aes-ecb/<base64url(key)>/<原始地址>`。
 * key = "82758dd12749c777ef579f1839ceea6a"（32 个 ASCII 字符 ⇒ AES-256）。
 */
var CEB_KEY_URL = 'ODI3NThkZDEyNzQ5Yzc3N2VmNTc5ZjE4MzljZWVhNmE';

/// 封面地址 → 管线能直接吃的地址（加密封面声明成 lume-enc URI）
function coverOf(url) {
  var text = String(url || '');
  if (!/\.(ceb|geb)(\?|$)/i.test(text)) return text;
  return 'lume-enc://aes-ecb/' + CEB_KEY_URL + '/' + text;
}

function absolute(url) {
  var value = entity(unescapeJs(String(url == null ? '' : url))).trim();
  if (!value) return '';
  if (value.indexOf('//') === 0) return 'https:' + value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.charAt(0) === '/') return base() + value;
  return base() + '/' + value;
}

function seconds(text) {
  var n = Number(text);
  if (!isFinite(n) || n <= 0) return '';
  var total = Math.round(n);
  var minute = Math.floor(total / 60);
  var second = total % 60;
  return minute + ':' + (second < 10 ? '0' + second : String(second));
}

function views(count) {
  var n = Number(count);
  if (!isFinite(n) || n <= 0) return '';
  if (n >= 10000) {
    var w = n / 10000;
    return (w >= 100 ? w.toFixed(0) : w.toFixed(1)) + '万播放';
  }
  return n + '播放';
}

/* ====================== seroval 编码 / 解码 ====================== */

/// 常量：t:2 的 s 值（seroval 的 constant 表）—— 0=null 1=undefined 2=true 3=false
/// 实测坑：s:1（undefined）如果按「真值」返回 1，会把后端「没有这个字段」误判成「报错」，已在下面按值精确判断。

function encodeValue(value, state) {
  if (value === undefined) return { t: 2, s: 1 };
  if (value === null) return { t: 2, s: 0 };
  var type = typeof value;
  if (type === 'boolean') return { t: 2, s: value ? 2 : 3 };
  if (type === 'number') return { t: 0, s: value };
  if (type === 'string') return { t: 1, s: value };
  if (Array.isArray(value)) {
    var id = state.next++;
    var items = [];
    for (var index = 0; index < value.length; index++) items.push(encodeValue(value[index], state));
    return { t: 9, i: id, a: items, o: 0 };
  }
  var keys = Object.keys(value);
  var objectId = state.next++;
  var values = [];
  for (var k = 0; k < keys.length; k++) values.push(encodeValue(value[keys[k]], state));
  return { t: 10, i: objectId, p: { k: keys, v: values }, o: 0 };
}

/// {data: {...}} → seroval 请求体
function encodeRequest(data) {
  var state = { next: 0 };
  var node = encodeValue({ data: data }, state);
  return JSON.stringify({ t: node, f: 63, m: [] });
}

function decodeValue(node, refs) {
  if (node === null || typeof node !== 'object') return node;
  if (typeof node.t !== 'number') return node;
  var id = node.i;
  var index;
  switch (node.t) {
    case 0:
    case 1:
      return node.s;
    case 2:
      // 0=null 1=undefined 2=true 3=false，其它值原样返回
      if (node.s === 0) return null;
      if (node.s === 1) return undefined;
      if (node.s === 2) return true;
      if (node.s === 3) return false;
      return node.s;
    case 9: {
      var list = [];
      if (id != null) refs[id] = list;
      var items = node.a || [];
      for (index = 0; index < items.length; index++) list.push(decodeValue(items[index], refs));
      return list;
    }
    case 10:
    case 11: {
      if (id != null && refs[id]) return refs[id];
      var object = {};
      if (id != null) refs[id] = object;
      var keys = (node.p && node.p.k) || [];
      var values = (node.p && node.p.v) || [];
      for (index = 0; index < keys.length; index++) object[keys[index]] = decodeValue(values[index], refs);
      return object;
    }
    case 25:
      // 序列化的错误对象
      return { __error: true, message: (node.s && node.s.message && node.s.message.s) || '服务端返回错误' };
    default:
      return node.s !== undefined ? node.s : node;
  }
}

function decodeResponse(text) {
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('接口返回的不是 JSON：' + String(text).slice(0, 80));
  }
  var root = parsed && typeof parsed === 'object' && typeof parsed.t === 'number' ? parsed : parsed && parsed.t;
  var decoded = decodeValue(root == null ? parsed : root, {});
  if (decoded && decoded.__error) throw new Error('接口报错：' + decoded.message);
  return decoded;
}

/* ============================ 网络层 ============================ */

function pageHeaders(referer) {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: referer || base() + '/'
  };
}

function apiHeaders(referer) {
  return {
    'User-Agent': UA,
    Accept: 'application/x-ndjson, application/json',
    'Content-Type': 'application/json',
    'x-tsr-serverFn': 'true',
    t: '2',
    k: '2',
    Referer: referer || base() + '/',
    Origin: base()
  };
}

function mediaHeaders() {
  return { 'User-Agent': UA, Referer: base() + '/' };
}

function statusError(status, what) {
  if (status === 403 || status === 503 || status === 521) {
    return new Error('NEED_WEBVIEW_VERIFY：好妻网要求网页验证（HTTP ' + status + '，' + what + '）');
  }
  if (status === 404) return new Error('好妻网：页面不存在（HTTP 404，' + what + '）');
  if (status === 429) return new Error('好妻网：请求太频繁被限流（HTTP 429，' + what + '），稍后再试');
  return new Error('好妻网：请求失败（HTTP ' + status + '，' + what + '）');
}

/// 统一包一层：连不上时给「去配代理」这句能行动的话（站点直连不通是常态，不是脚本写错）
async function request(options) {
  var response;
  try {
    response = await LumeSource.http.request(options);
  } catch (error) {
    throw new Error(
      '好妻网连不上（' +
        String((error && error.message) || error).slice(0, 80) +
        '）——本站需要代理：请到「源设置 → 网络」给本源配一个可用代理'
    );
  }
  var status = Number((response && response.status) || 0);
  if (status !== 200) throw statusError(status, String(options.url).slice(0, 90));
  return String((response && response.body) || '');
}

async function getHtml(url, referer) {
  return request({ url: url, method: 'GET', headers: pageHeaders(referer) });
}

/// server function 的回包是 RPC 信封 {result, error, context}：拆掉信封，错误在这里点名
function unwrap(reply, what) {
  if (reply && typeof reply === 'object' && !Array.isArray(reply)) {
    if ('result' in reply || 'error' in reply) {
      if (reply.error) {
        var message = (reply.error && reply.error.message) || '未知错误';
        throw new Error('好妻网接口报错（' + what + '）：' + String(message).slice(0, 120));
      }
      return reply.result;
    }
  }
  return reply;
}

async function serverFn(hash, data, what) {
  var url = base() + '/_serverFn/' + hash;
  var reply;
  if (data === undefined) {
    reply = decodeResponse(await request({ url: url, method: 'GET', headers: apiHeaders() }));
  } else {
    reply = decodeResponse(
      await request({
        url: url,
        method: 'POST',
        headers: apiHeaders(),
        body: encodeRequest(data)
      })
    );
  }
  return unwrap(reply, what || hash.slice(0, 8));
}

/* ============================ 站点解析 ============================ */

/// 分类：GET /_serverFn/<分类 hash> → [{id,name,type,bHide}]
async function topCategories() {
  var rows = await serverFn(SF_CATEGORIES, undefined, 'topCategories');
  if (!Array.isArray(rows) || !rows.length) throw new Error('好妻网：分类接口没返回任何分类（站点可能改版）');
  var out = [];
  for (var index = 0; index < rows.length; index++) {
    var row = rows[index] || {};
    if (!row.id || !row.name) continue;
    if (row.bHide === true) continue;
    out.push({ id: String(row.id), title: clean(row.name) });
  }
  return out;
}

/// 分类下的模块 + 卡片（一次给整个分类的卡片，约 60~72 条）
async function moduleRows(cateId) {
  var result = await serverFn(
    SF_MODULES,
    {
      cateId: cateId,
      page: 1,
      pageSize: MODULE_PAGE_SIZE,
      hasTop: false,
      hasGuide: false,
      compositeSort: 4
    },
    'moduleList'
  );
  var rows = [];
  var children = (result && result.childCategories) || [];
  for (var index = 0; index < children.length; index++) {
    var module = children[index] || {};
    var videos = module.videos || [];
    for (var v = 0; v < videos.length; v++) {
      var video = videos[v];
      if (!video || !video.id) continue;
      video.__module = clean(module.name || '');
      rows.push(video);
    }
  }
  return rows;
}

function itemOfVideo(row) {
  var parts = [];
  if (row.__module) parts.push(row.__module);
  var dur = seconds(row.duration);
  if (dur) parts.push(dur);
  var play = views(row.playCount);
  if (play) parts.push(play);
  return {
    id: String(row.id),
    title: clean(row.title || '') || String(row.id),
    cover: coverOf(absolute(row.coverUrl || '')),
    subtitle: parts.join(' · ')
  };
}

/// 搜索页：GET /search/<词>?page=N，从 SSR 的 initialSearch 里抠 list
function parseSearch(html) {
  var start = html.indexOf('initialSearch:');
  if (start < 0) return { items: [], total: 0, hasMore: false };
  var tail = html.slice(start);
  var stop = tail.indexOf('initialTopAds:');
  var segment = stop > 0 ? tail.slice(0, stop) : tail.slice(0, 60000);
  var items = [];
  var seen = {};
  var pattern = /\{id:"([0-9a-f]{24})",kind:"[a-z]*",title:"((?:[^"\\]|\\.)*)",coverUrl:"((?:[^"\\]|\\.)*)"/g;
  var matched;
  while ((matched = pattern.exec(segment)) !== null) {
    var id = matched[1];
    if (seen[id]) continue;
    seen[id] = 1;
    // 紧跟这条的统计字段，从命中位置往后 400 字内取
    var after = segment.slice(matched.index, matched.index + 600);
    var playCount = /playCount:([0-9.]+)/.exec(after);
    var duration = /duration:([0-9.]+)/.exec(after);
    var label = /releaseDateLabel:"([^"]*)"/.exec(after);
    var bits = [];
    if (clean(matched[3])) bits.push(views(playCount ? playCount[1] : 0));
    if (duration && seconds(duration[1])) bits.push(seconds(duration[1]));
    if (label && clean(label[1])) bits.push(clean(label[1]));
    items.push({
      id: id,
      title: clean(matched[2]) || id,
      cover: coverOf(absolute(matched[3])),
      subtitle: bits.filter(Boolean).join(' · ')
    });
  }
  var totalMatch = /totalCount:([0-9]+)/.exec(segment);
  var moreMatch = /hasMore:(!0|!1|true|false)/.exec(segment);
  return {
    items: items,
    total: totalMatch ? Number(totalMatch[1]) : items.length,
    hasMore: moreMatch ? moreMatch[1] === '!0' || moreMatch[1] === 'true' : items.length > 0
  };
}

/// 详情页：/play/<id> 的 initialDetail 段（到 initialRecommend 为止，避免抓到推荐位的同名字段）
function detailSegment(html) {
  var start = html.indexOf('initialDetail:$R[');
  if (start < 0) start = html.indexOf('initialDetail:');
  if (start < 0) return '';
  var tail = html.slice(start);
  var stop = tail.indexOf(',initialRecommend:');
  return stop > 0 ? tail.slice(0, stop) : tail.slice(0, 12000);
}

function fieldOf(segment, name) {
  var escaped = new RegExp(name + ':"((?:[^"\\\\]|\\\\.)*)"').exec(segment);
  if (escaped) return unescapeJs(escaped[1]);
  var plain = new RegExp(name + ':([0-9.]+)').exec(segment);
  return plain ? plain[1] : '';
}

function flagOf(segment, name) {
  if (new RegExp(name + ':!0').test(segment)) return true;
  if (new RegExp(name + ':!1').test(segment)) return false;
  if (new RegExp(name + ':true').test(segment)) return true;
  if (new RegExp(name + ':false').test(segment)) return false;
  return null;
}

function parseDetail(html, id) {
  var segment = detailSegment(html);
  var title = fieldOf(segment, 'title');
  var cover = fieldOf(segment, 'coverUrl');
  var m3u8 = fieldOf(segment, 'm3u8Url');
  var preview = fieldOf(segment, 'previewM3u8Url');
  var publisher = fieldOf(segment, 'publisherName');
  var duration = fieldOf(segment, 'duration');
  var playCount = fieldOf(segment, 'playCount');
  var likeCount = fieldOf(segment, 'likeCount');
  var collectCount = fieldOf(segment, 'collectCount');

  // 兜底：initialDetail 段没认出来时，退回 JSON-LD / og 标签（媒体地址仍在页面里）
  if (!title) {
    var ld = /"@type":"VideoObject"[\s\S]{0,1200}?"name":"((?:[^"\\]|\\.)*)"/.exec(html);
    if (ld) title = unescapeJs(ld[1]);
    var og = /property="og:title"[^>]+content="([^"]*)"/i.exec(html);
    if (!title && og) title = clean(og[1]);
  }
  if (!cover) {
    var ldCover = /"thumbnailUrl":"((?:[^"\\]|\\.)*)"/.exec(html);
    if (ldCover) cover = unescapeJs(ldCover[1]);
  }
  if (!m3u8) {
    var contentUrl = /"contentUrl":"((?:[^"\\]|\\.)*\.m3u8[^"]*)"/.exec(html);
    if (contentUrl) m3u8 = unescapeJs(contentUrl[1]);
  }
  if (!preview) {
    var pre = /(https?:\/\/[^"'\s\\]+\/m3u8pre\/[^"'\s\\]+)/.exec(html);
    if (pre) preview = pre[1];
  }
  var tagNames = [];
  var tagPattern = /tags:\$R\[\d+\]=\[([\s\S]{0,1200}?)\]/g;
  var tagHit = tagPattern.exec(segment);
  if (tagHit) {
    var namePattern = /name:"((?:[^"\\]|\\.)*)"/g;
    var nameHit;
    while ((nameHit = namePattern.exec(tagHit[1])) !== null) {
      var name = clean(nameHit[1]);
      if (name) tagNames.push(name);
    }
  }
  return {
    id: id,
    title: clean(title) || id,
    cover: coverOf(absolute(cover)),
    m3u8: String(m3u8 || '').trim(),
    preview: String(preview || '').trim(),
    publisher: clean(publisher),
    duration: duration,
    playCount: playCount,
    likeCount: likeCount,
    collectCount: collectCount,
    isFree: flagOf(segment, 'isFree'),
    isVipFree: flagOf(segment, 'isVipFree'),
    payType: fieldOf(segment, 'payType'),
    tags: tagNames
  };
}

async function fetchDetail(id) {
  var videoId = /([0-9a-f]{24})/i.exec(String(id || ''));
  if (!videoId) throw new Error('好妻网：认不出视频 id（' + String(id) + '）——id 应来自 list()/search');
  var pageUrl = base() + '/play/' + videoId[1];
  var html = await getHtml(pageUrl, base() + '/videosPage');
  var parsed = parseDetail(html, videoId[1]);
  parsed.pageUrl = pageUrl;
  return parsed;
}

/* ============================ 图源契约 ============================ */

var LumeSource = {
  id: 'haoqi7_video',
  name: '好妻网 18+',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://haoqi7.com'],

  /// 首页：用「首映好片」这个分类的卡片（站点首页自己也是这么排的：顶部分类 + 每类卡片流）
  async home() {
    var boards = [];
    var categories = [];
    try {
      categories = await topCategories();
    } catch (error) {
      categories = [];
    }
    var target = null;
    for (var index = 0; index < categories.length; index++) {
      if (categories[index].title === '首映好片') {
        target = categories[index];
        break;
      }
    }
    if (!target) target = categories[0] || { id: DEFAULT_CATE, title: '首映好片' };
    var page = await this.list({ categoryId: target.id, page: 1 });
    if (page.items.length) boards.push({ title: target.title, moreUrl: target.id, items: page.items });
    if (!boards.length) throw new Error('好妻网：首页没拿到卡片（站点可能改版或未配代理）');
    return boards;
  },

  /// 分类＝导航里那 14 个（实时抓，不写死）
  async categories() {
    return await topCategories();
  },

  /// 列表：
  ///   · 有关键词 → /search/<词>?page=N（SSR 里的 initialSearch，16 条/页）
  ///   · 无关键词 → 分类的模块卡片一次取回（60~72 条）后按 20 条/页本地切片
  async list(argument) {
    var args = argument || {};
    var page = Math.max(1, Number(args.page) || 1);
    var keyword = clean(args.keyword || '').trim();
    if (keyword) {
      var searchUrl =
        base() + '/search/' + encodeURIComponent(keyword) + (page > 1 ? '?page=' + page : '');
      var html = await getHtml(searchUrl, base() + '/');
      var parsed = parseSearch(html);
      if (!parsed.items.length && page === 1) {
        // 搜不到是正常结果（站点就是 0 条），明确告知而不是假装有数据
        console.warn('[haoqi7] 搜索「' + keyword + '」没有结果');
      }
      return { items: parsed.items, hasMore: parsed.hasMore === true };
    }
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    if (!/^[0-9a-f]{24}$/i.test(categoryId)) categoryId = DEFAULT_CATE;
    var rows = await moduleRows(categoryId);
    if (!rows.length) throw new Error('好妻网：分类 ' + categoryId + ' 没取到卡片（站点可能改版）');
    var seen = {};
    var items = [];
    for (var index = 0; index < rows.length; index++) {
      var row = rows[index];
      if (seen[row.id]) continue;
      seen[row.id] = 1;
      items.push(itemOfVideo(row));
    }
    var offset = (page - 1) * PAGE_SIZE;
    var slice = items.slice(offset, offset + PAGE_SIZE);
    return { items: slice, hasMore: offset + PAGE_SIZE < items.length };
  },

  /// 详情：标题 / 封面 / 标签 / 时长 / 播放量（播放地址在 content 里现取，签名会变）
  async detail(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id) return null;
    var info;
    try {
      info = await fetchDetail(id);
    } catch (error) {
      var message = String((error && error.message) || error);
      if (/HTTP 404|页面不存在/.test(message)) return null;
      throw error;
    }
    if (!info.title && !info.m3u8 && !info.preview) return null;
    var bits = [];
    if (info.publisher) bits.push(info.publisher);
    if (seconds(info.duration)) bits.push(seconds(info.duration));
    if (views(info.playCount)) bits.push(views(info.playCount));
    if (info.tags.length) bits.push(info.tags.slice(0, 3).join('/'));
    var description = [];
    if (info.publisher) description.push('发布者：' + info.publisher);
    description.push('时长：' + (seconds(info.duration) || '-') + ' · 播放：' + (views(info.playCount) || '-'));
    description.push(
      '点赞 ' + (info.likeCount || '0') + ' · 收藏 ' + (info.collectCount || '0')
    );
    if (info.tags.length) description.push('标签：' + info.tags.join('、'));
    description.push('片源：整片 m3u8（免登录，见本源头部注释「VIP/登录」一节）');
    return {
      id: info.id,
      title: info.title,
      cover: info.cover,
      subtitle: bits.join(' · '),
      description: description.join('\n')
    };
  },

  /// 一条视频就是一个整片（站点没有分 P / 多线路）
  async chapters(argument) {
    var id = String((argument && argument.id) || '').trim();
    if (!id) return [];
    return [{ id: 'full', title: '正片' }];
  },

  /// 播放：现取详情页的 m3u8Url（整片、签名地址、媒体域每次都变）
  /// 拿不到整片就退 previewM3u8Url（站点标记的 2 分钟试看），再不行交回网页播放器。
  async content(argument) {
    var args = argument || {};
    var id = String(args.id || args.chapterId || '').trim();
    if (!id) throw new Error('好妻网：缺少视频 id');
    var info = await fetchDetail(id);
    var url = info.m3u8 || info.preview;
    if (!url) {
      if (info.pageUrl) return { kind: 'webplayer', pageUrl: info.pageUrl, headers: mediaHeaders() };
      throw new Error('好妻网：这条视频没有播放地址（' + id + '）');
    }
    var qualities = [];
    if (info.m3u8) qualities.push({ label: '完整', url: info.m3u8 });
    if (info.preview && info.preview !== info.m3u8) qualities.push({ label: '试看', url: info.preview });
    return {
      kind: 'video',
      url: url,
      headers: mediaHeaders(),
      qualities: qualities.length > 1 ? qualities : undefined
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
