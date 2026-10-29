// LumeSource: {"id":"niacg_video","name":"逆次元ACG","version":"1.0.1","category":"video","mirrors":["https://www.niacg.com","https://xpicvid.org","https://freeacg3.org","https://acg.al"]}
//
// 站点：逆次元ACG（发布页 https://02.uno/，内容站 www.niacg.com，里番 / 3D / 同人 / 会员视频
// 与图集画廊，全站 18+）
//
// 为什么从 02.uno 起：02.uno 本身不是内容站，是**永久发布页**——页面上那串
// <a href="https://xpicvid.org"> 就是当天可用入口（实测 xpicvid.org / xpicvid.net /
// freeacg3.org / freeacg.org / acg.al 全部 301 到 https://www.niacg.com/）。所以本源：
//   ① 源设置里手填的域名 → ② 本地缓存的可用入口（6 小时）→ ③ 现场解析 02.uno → ④ 内置镜像表。
// 02.uno 挂在 Cloudflare 托管挑战后面（Cf-Mitigated: challenge），第三步是**尽力而为**；
// 拿不到就用内置镜像，不影响浏览。
//
// 内容站结构（帝国CMS 改的前端 + DPlayer，2026-10-25 逐页实测）：
//   · 列表    /listinfo-{classid}-{p}.html    **p 从 0 开始**，60 条/页；越界不是 404，
//             而是 200 + <title>信息提示</title>（约 1.2KB）——这就是「到底了」的信号。
//   · 详情    /showinfo-{cid}-{id}-0.html（视频）/ /moehome-{cid}-{id}.html（图集、漫画，
//             搜索结果是这个形态；两种形态都能开同一个条目）
//   · 卡片    <a href="/showinfo-19-17345-0.html" title="标题">
//               <img src="…imgloading2v.gif" data-src="https://gamezy.xunge.cyou/…jpg" title="标题"></a>
//             封面是懒加载，真地址在 data-src。
//   · 播放    DPlayer 的 quality 表：{ name: '1080p', url: 'https://file.xunge.cyou/1080/…mp4' }
//             （会员视频 23 类是 fun.zhen.si 的 playlist.m3u8，type: customHls）。每个清晰度算一「集」。
//   · 图集    · 会员画廊 22：<script>var urls = ["https://wen.zhen.si//good/…png", …]</script>
//               （"继续看图"只是前端分批渲染，图全在这个数组里）
//             · 本子/CG/套图/COS 3/2/4/1：详情页只有预览，真图在阅读器
//               /moeupup-{cid}-{id}.html，逐页 <img class="comic_img" data-src=… data-page=…>
//   · 搜索    POST /e/search/index.php（keyboard=…&classid=…&show=title,text,keyboard,ftitle&tempid=1）
//             → 302 到 /e/search/result/?searchid=…，分页 /e/search/result/index.php?page={0基}&searchid=…
//   · 关键坑  **媒体全在 CDN 白名单后面**：*.xunge.cyou / *.zhen.si 的 mp4、封面、图集
//             不带 Referer 一律 403（3 字节），带本站 Referer 就 206。所以本源所有媒体请求
//             统一带 Referer: https://www.niacg.com/。HTML 页反而只看 UA（curl 默认 UA 会吃
//             Cloudflare 挑战页），所以 UA 固定成 iPhone Safari。
//   · App 侧的额外一层：同一台机器上 curl / Chrome 直连 HTML 是 200，但 App 用的 Dart
//             HTTP 栈（dart:io HttpClient，tools/site_reachability.dart 实测）拿到的是
//             Cloudflare 403 挑战页 —— 这是 TLS/指纹判的，不是 Cookie 问题。所以 html()
//             先走直连，一旦识别出挑战页就改用宿主的网页渲染 LumeSource.web.render（受限
//             WebKit，过 JS 挑战），并把「本源走渲染」记 1 小时，省掉反复 403；渲染也过不去
//             才抛 NEED_WEBVIEW_VERIFY 让用户在网页视图里完成校验。
var PUBLISH_PAGE = 'https://02.uno/';
var DEFAULT_BASE = 'https://www.niacg.com';
var MEDIA_REFERER = 'https://www.niacg.com/';
var MIRRORS = [
  'https://www.niacg.com',
  'https://xpicvid.org',
  'https://freeacg3.org',
  'https://freeacg.org',
  'https://acg.al'
];
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// 封面在 *.xunge.cyou / *.zhen.si 上必须带本站 Referer，否则 403（3 字节）。
// 图片管线默认把 Referer 设成图床自己，所以逐条把站点 Referer 交过去。
var COVER_HEADERS = { Referer: MEDIA_REFERER, 'User-Agent': UA };
var MIRROR_TTL_MS = 6 * 3600 * 1000;
var resolvedBase = '';

// 分类表（只列真有条目的；5/10 是广告空壳、7/8/13/16/17 是信息提示页，都不列）
var CLASSES = [
  { id: '19', title: '里番' },
  { id: '18', title: '视频' },
  { id: '20', title: '3D' },
  { id: '21', title: '同人' },
  { id: '23', title: '会员视频' },
  { id: '22', title: '会员画廊' }
];

var CLASS_NAMES = {
  '1': 'COS', '2': 'CG', '3': '本子', '4': '套图', '9': 'A漫', '12': '漫画',
  '14': '日漫', '15': '韩漫', '18': '视频', '19': '里番', '20': '3D',
  '21': '同人', '22': '会员画廊', '23': '会员视频', '6': '社区'
};

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  if (domain) return String(domain).replace(/\/+$/, '');
  return (resolvedBase || DEFAULT_BASE).replace(/\/+$/, '');
}

function absolute(url) {
  var text = String(url == null ? '' : url).trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.indexOf('//') === 0) return 'https:' + text;
  if (text.charAt(0) === '/') return base() + text;
  return base() + '/' + text;
}

// 图集 CDN 里偶发 "wen.zhen.si//good/…" 的双斜杠，归一化一下再交出去。
function tidyImage(url) {
  return String(url || '').replace(/([^:])\/\/+/g, '$1/').replace(/^(https?:)\//, '$1//');
}

function decode(text) {
  return String(text == null ? '' : text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, function (all, code) {
      return String.fromCharCode(Number(code));
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headers(extra) {
  var result = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: MEDIA_REFERER
  };
  for (var key in extra || {}) result[key] = extra[key];
  return result;
}

function looksBlocked(status, body) {
  return status === 403 || status === 503 || status === 521 ||
    /cf-chl-|Just a moment|challenge-platform|请稍候/i.test(String(body || ''));
}

function isEmptyPage(body) {
  return /<title>\s*信息提示\s*<\/title>/.test(body) || body.indexOf('您来自的链接不存在') >= 0;
}

async function request(method, url, body, extra) {
  var target = /^https?:\/\//i.test(url) ? url : base() + (String(url).charAt(0) === '/' ? url : '/' + url);
  return LumeSource.http.request({
    url: target,
    method: method,
    headers: headers(extra),
    body: body == null ? undefined : body
  });
}

// 直接 HTTP 被 Cloudflare 挡住时，退到宿主的网页渲染（App 里的受限 WebKit，能过 JS 挑战）。
// 实测：同一台机器 curl / Chrome 直连是 200，App 的 Dart HTTP 栈是 403 挑战页，所以这一路
// 不是兜底而是主路径之一；渲染结果按 1 小时缓存「下次直接走渲染」的标记，省掉每次的 403 往返。
var RENDER_TTL_MS = 3600 * 1000;

async function renderMode() {
  var cached = await LumeSource.fs.readText('mode.json');
  if (!cached) return false;
  try {
    var saved = JSON.parse(cached);
    return !!(saved && saved.render && saved.at && Date.now() - saved.at < RENDER_TTL_MS);
  } catch (error) {
    return false;
  }
}

async function markRenderMode() {
  await LumeSource.fs.writeText('mode.json', JSON.stringify({ render: true, at: Date.now() }));
}

async function renderPage(target) {
  var url = absolute(target);
  var result = await LumeSource.web.render({
    url: url,
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9' },
    timeoutMs: 6000
  });
  var body = result && result.html ? String(result.html) : '';
  if (!body || looksBlocked(200, body)) {
    throw new Error('NEED_WEBVIEW_VERIFY：逆次元ACG 需要网页视图过 Cloudflare 校验，请在源设置里点「网页视图」打开本站并完成验证后重试');
  }
  return body;
}

async function html(target) {
  var useRender = await renderMode();
  if (useRender) return renderPage(target);
  var response = await request('GET', target);
  var status = response ? response.status : 0;
  var text = String((response && response.body) || '');
  if (looksBlocked(status, text)) {
    // 先记下「本源要走网页渲染」，再试一次渲染；渲染也失败就把原因抛给 UI。
    try {
      var rendered = await renderPage(target);
      await markRenderMode();
      return rendered;
    } catch (error) {
      throw new Error('NEED_WEBVIEW_VERIFY：逆次元ACG 被 Cloudflare 拦住（HTTP ' + status + '），请在源设置里走网页视图完成校验、或给本源配代理');
    }
  }
  if (status !== 200) throw new Error('逆次元ACG 页面打不开：HTTP ' + status + ' ' + absolute(target));
  return text;
}

// ---------------------------------------------------------------- 入口域名解析
async function alive(testBase) {
  try {
    var response = await LumeSource.http.get(testBase.replace(/\/+$/, '') + '/listinfo-19-0.html', { headers: headers() });
    return !!(response && response.status === 200 && !looksBlocked(response.status, response.body) && !isEmptyPage(String(response.body || '')));
  } catch (error) {
    return false;
  }
}

async function mirrorsFromPublishPage() {
  try {
    var response = await LumeSource.http.get(PUBLISH_PAGE, { headers: headers({ Accept: 'text/html,*/*' }) });
    var body = String((response && response.body) || '');
    if (!response || response.status !== 200 || looksBlocked(response.status, body)) return [];
    var found = [];
    var seen = {};
    var pattern = /<div class="enter-link[^"]*">\s*<a[^>]+href="(https?:\/\/[^"\/]+)[^"]*"/gi;
    var matched;
    while ((matched = pattern.exec(body)) !== null) {
      var host = matched[1].replace(/\/+$/, '');
      if (!host || seen[host] || host.indexOf('02.uno') >= 0) continue;
      seen[host] = true;
      found.push(host);
    }
    return found;
  } catch (error) {
    return [];
  }
}

async function resolveBase() {
  var configured = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  if (configured) {
    resolvedBase = configured.replace(/\/+$/, '');
    return resolvedBase;
  }
  var cached = await LumeSource.fs.readText('mirror.json');
  if (cached) {
    try {
      var saved = JSON.parse(cached);
      if (saved && saved.base && saved.at && Date.now() - saved.at < MIRROR_TTL_MS && (await alive(saved.base))) {
        resolvedBase = saved.base;
        return resolvedBase;
      }
    } catch (error) {
      /* 缓存坏了就重探 */
    }
  }
  var candidates = (await mirrorsFromPublishPage()).concat(MIRRORS);
  for (var i = 0; i < candidates.length; i++) {
    if (await alive(candidates[i])) {
      resolvedBase = candidates[i].replace(/\/+$/, '');
      await LumeSource.fs.writeText('mirror.json', JSON.stringify({ base: resolvedBase, at: Date.now() }));
      return resolvedBase;
    }
  }
  resolvedBase = DEFAULT_BASE;
  return resolvedBase;
}

async function ready() {
  if (!resolvedBase) await resolveBase();
  return base();
}

// ---------------------------------------------------------------- 列表
function listPath(classId, pageNo) {
  return '/listinfo-' + classId + '-' + (pageNo - 1) + '.html';
}

// 卡片：<a href="/showinfo-19-17345-0.html" title="…"><img … data-src="封面" title="…"></a>
// 兼容 /moehome-{cid}-{id}.html（搜索结果里视频条目就是这个形态）。
function parseItems(pageHtml) {
  var items = [];
  var seen = {};
  var pattern = /<a\b([^>]*)>([\s\S]{0,700}?)<\/a>/g;
  var matched;
  while ((matched = pattern.exec(pageHtml)) !== null) {
    var attrs = matched[1];
    var hrefMatch = /href="(\/(?:showinfo|moehome|moeupup)-[^"]+)"/i.exec(attrs);
    if (!hrefMatch) continue;
    var href = hrefMatch[1];
    if (seen[href]) continue;
    var body = matched[2];
    if (body.indexOf('<img') < 0) continue;
    var coverMatch = /<img[^>]*data-src="([^"]+)"/i.exec(body) || /<img[^>]*data-original="([^"]+)"/i.exec(body);
    var cover = coverMatch ? decode(coverMatch[1]) : '';
    if (!cover || /imgloading|blank\.jpg|defaultuserpic/i.test(cover)) cover = '';
    var titleMatch = /title="([^"]*)"/i.exec(attrs) || /<img[^>]*title="([^"]*)"/i.exec(body) || /<img[^>]*alt="([^"]*)"/i.exec(body);
    var title = decode(titleMatch ? titleMatch[1] : '');
    if (!title || /搜索|登录|注册/.test(title)) continue;
    seen[href] = true;
    var classMatch = /^\/(?:showinfo|moehome|moeupup)-(\d+)-/.exec(href);
    items.push({
      id: absolute(href),
      title: title,
      cover: absolute(cover),
      coverHeaders: COVER_HEADERS,
      subtitle: classMatch && CLASS_NAMES[classMatch[1]] ? CLASS_NAMES[classMatch[1]] : ''
    });
  }
  return items;
}

function hasMore(pageHtml, pageNo) {
  if (isEmptyPage(pageHtml)) return false;
  if (/下一页|下页/.test(pageHtml)) return true;
  var max = -1;
  var pattern = /\/listinfo-\d+-(\d+)\.html/g;
  var matched;
  while ((matched = pattern.exec(pageHtml)) !== null) {
    var value = Number(matched[1]);
    if (value > max) max = value;
  }
  return max >= pageNo;
}

// ---------------------------------------------------------------- 详情 / 播放
// DPlayer：{ name: '1080p', url: 'https://file.xunge.cyou/1080/…mp4' }（23 类是 m3u8）
function qualitiesOf(pageHtml) {
  var list = [];
  var seen = {};
  var pattern = /name:\s*'([^']*)'\s*,\s*url:\s*'([^']+)'/g;
  var matched;
  while ((matched = pattern.exec(pageHtml)) !== null) {
    var url = decode(matched[2]);
    if (!/\.(mp4|m3u8|webm|flv)(\?|#|$)/i.test(url) || seen[url]) continue;
    seen[url] = true;
    list.push({ title: decode(matched[1]) || '第 ' + (list.length + 1) + ' 路', url: url });
  }
  if (!list.length) {
    var single = /url:\s*'([^']+\.(?:mp4|m3u8|webm|flv)[^']*)'/.exec(pageHtml);
    if (single) list.push({ title: '正片', url: decode(single[1]) });
  }
  return list;
}

// 会员画廊 22：var urls = ["https://wen.zhen.si//good/…png", …]
function galleryImages(pageHtml) {
  var images = [];
  var seen = {};
  var block = /var\s+urls\s*=\s*(\[[\s\S]*?\])\s*;/.exec(pageHtml);
  if (!block) return images;
  var pattern = /"(https?:\/\/[^"]+)"/g;
  var matched;
  while ((matched = pattern.exec(block[1])) !== null) {
    var url = tidyImage(matched[1]);
    if (seen[url]) continue;
    seen[url] = true;
    images.push(url);
  }
  return images;
}

// 阅读器（/moeupup-…）逐页：<img class="comic_img" data-src='…' data-page="0">
function readerImages(pageHtml) {
  var rows = [];
  var seen = {};
  var pattern = /<img[^>]*class=['"][^'"]*comic_img[^'"]*['"][^>]*>/gi;
  var matched;
  while ((matched = pattern.exec(pageHtml)) !== null) {
    var tag = matched[0];
    var srcMatch = /data-src=['"]([^'"]+)['"]/i.exec(tag) || /src=['"]([^'"]+)['"]/i.exec(tag);
    if (!srcMatch) continue;
    var url = decode(srcMatch[1]);
    if (!/^https?:/i.test(url) || seen[url]) continue;
    seen[url] = true;
    var pageMatch = /data-page=['"](\d+)['"]/i.exec(tag);
    rows.push({ url: tidyImage(url), page: pageMatch ? Number(pageMatch[1]) : rows.length });
  }
  rows.sort(function (left, right) {
    return left.page - right.page;
  });
  var images = [];
  for (var i = 0; i < rows.length; i++) images.push(rows[i].url);
  return images;
}

function readerLink(pageHtml) {
  var matched = /href="(\/(?:moeupup)-[0-9]+-[0-9]+\.html)"/i.exec(pageHtml);
  return matched ? matched[1] : '';
}

function titleOf(pageHtml) {
  var matched = /<h[34][^>]*big-title-truncate[^>]*>([\s\S]*?)<\/h[34]>/i.exec(pageHtml) ||
    /id="book-name"[^>]*>([\s\S]*?)</i.exec(pageHtml) ||
    /class="artwork-title"[^>]*>([\s\S]*?)</i.exec(pageHtml) ||
    /<title>([\s\S]*?)<\/title>/i.exec(pageHtml);
  if (!matched) return '';
  return decode(matched[1])
    .replace(/\s*[-|｜]\s*在线漫画\s*$/, '')
    .replace(/\s*[-|｜]\s*Xpicvid.*$/i, '')
    .replace(/\s*[-|｜]\s*逆次元.*$/, '')
    .trim();
}

function coverOf(pageHtml) {
  var matched = /pic:\s*'([^']+)'/.exec(pageHtml) ||
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(pageHtml) ||
    /<img[^>]*data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/i.exec(pageHtml);
  return matched ? absolute(decode(matched[1])) : '';
}

function descriptionOf(pageHtml) {
  var info = /<div class="col-md-4">[\s\S]{0,400}?<div class="m-t-5">([\s\S]*?)<\/div>/i.exec(pageHtml);
  if (info) return decode(info[1]);
  var artwork = /class="description"[^>]*>([\s\S]*?)<\/div>/i.exec(pageHtml);
  if (artwork) return decode(artwork[1]);
  var story = /敘述：([\s\S]{0,600}?)<\/div>/i.exec(pageHtml);
  if (story) return decode(story[1]);
  var meta = /<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(pageHtml);
  var text = meta ? decode(meta[1]) : '';
  return /Xpicvid图片视频在线资源平台/.test(text) ? '' : text;
}

function metaLine(pageHtml, label) {
  var pattern = new RegExp(label + '\\s*[:：]\\s*([A-Za-z0-9\\-]+)');
  var matched = pattern.exec(pageHtml);
  return matched ? matched[1] : '';
}

function mediaHeaders() {
  return { Referer: MEDIA_REFERER, 'User-Agent': UA, Accept: '*/*' };
}

function imageHeaders() {
  return { Referer: MEDIA_REFERER, 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' };
}

function idOf(argument) {
  return argument && argument.id ? String(argument.id).trim() : '';
}

var LumeSource = {
  id: 'niacg_video',
  name: '逆次元ACG',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://www.niacg.com', 'https://xpicvid.org', 'https://freeacg3.org', 'https://acg.al'],

  async categories() {
    var list = [];
    for (var i = 0; i < CLASSES.length; i++) list.push({ id: CLASSES[i].id, title: CLASSES[i].title });
    return list;
  },

  async home() {
    await ready();
    var boards = [];
    var order = ['19', '20', '21'];
    for (var i = 0; i < order.length; i++) {
      try {
        var pageHtml = await html(listPath(order[i], 1));
        var items = parseItems(pageHtml);
        if (items.length) boards.push({ title: CLASS_NAMES[order[i]] || '推荐', moreUrl: order[i], items: items.slice(0, 18) });
      } catch (error) {
        if (i === 0) throw error;
      }
    }
    if (!boards.length) throw new Error('逆次元ACG：首页没认出条目（站点可能改版，或入口域名都失效了）');
    return boards;
  },

  async list(argument) {
    await ready();
    var settings = argument || {};
    var pageNo = Number(settings.page || 1);
    if (!pageNo || pageNo < 1) pageNo = 1;
    var keyword = settings.keyword ? String(settings.keyword).trim() : '';
    var category = settings.categoryId ? String(settings.categoryId).trim() : '';

    if (keyword) {
      var body = 'keyboard=' + encodeURIComponent(keyword) +
        '&classid=' + (category && /^\d+$/.test(category) ? category : '') +
        '&show=title,text,keyboard,ftitle&tempid=1&Submit=' + encodeURIComponent('搜索');
      var response = await request('POST', '/e/search/index.php', body, {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: base() + '/'
      });
      var resultHtml = String((response && response.body) || '');
      if (looksBlocked(response ? response.status : 0, resultHtml)) {
        throw new Error('NEED_WEBVIEW_VERIFY：逆次元ACG 搜索被 Cloudflare 拦住，请配代理或走网页视图');
      }
      if (pageNo > 1) {
        var idMatch = /searchid=(\d+)/.exec(resultHtml);
        if (idMatch) resultHtml = await html('/e/search/result/index.php?page=' + (pageNo - 1) + '&searchid=' + idMatch[1]);
      }
      var hits = parseItems(resultHtml);
      return { items: hits, hasMore: hits.length >= 20 };
    }

    var classId = category && /^\d+$/.test(category) ? category : '19';
    var page = await html(listPath(classId, pageNo));
    if (isEmptyPage(page)) return { items: [], hasMore: false };
    return { items: parseItems(page), hasMore: hasMore(page, pageNo) };
  },

  async detail(argument) {
    await ready();
    var id = idOf(argument);
    if (!id) return null;
    var pageHtml = await html(id);
    var title = titleOf(pageHtml);
    if (!title) return null;
    var qualities = qualitiesOf(pageHtml);
    var parts = [];
    var classMatch = /\/(?:showinfo|moehome|moeupup)-(\d+)-/.exec(id);
    if (classMatch && CLASS_NAMES[classMatch[1]]) parts.push(CLASS_NAMES[classMatch[1]]);
    if (qualities.length) {
      parts.push(qualities.length + ' 路清晰度');
    } else {
      var pages = readerImages(pageHtml).length || galleryImages(pageHtml).length;
      parts.push(pages ? pages + ' 张图' : '图集');
    }
    var code = metaLine(pageHtml, '车号') || metaLine(pageHtml, '禁漫车');
    if (code) parts.push(code);
    return {
      id: absolute(id),
      title: title,
      cover: coverOf(pageHtml),
      coverHeaders: COVER_HEADERS,
      subtitle: parts.join(' · '),
      description: descriptionOf(pageHtml)
    };
  },

  async chapters(argument) {
    await ready();
    var id = idOf(argument);
    if (!id) return [];
    var pageHtml = await html(id);
    var qualities = qualitiesOf(pageHtml);
    if (qualities.length) {
      var chapters = [];
      for (var i = 0; i < qualities.length; i++) chapters.push({ id: qualities[i].url, title: qualities[i].title });
      return chapters;
    }
    // 图集：默认给一集「图集」；content() 会去阅读器/图片数组里取全部图。
    return [{ id: absolute(id), title: '图集' }];
  },

  async content(argument) {
    await ready();
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    var target = chapterId || idOf(argument);
    if (!target) throw new Error('缺少播放地址');
    if (/\.(?:mp4|m3u8|webm|flv)(\?|#|$)/i.test(target)) {
      return { kind: 'video', url: target, headers: mediaHeaders() };
    }
    var pageHtml = await html(target);
    var qualities = qualitiesOf(pageHtml);
    if (qualities.length) return { kind: 'video', url: qualities[0].url, headers: mediaHeaders() };

    var images = galleryImages(pageHtml);
    if (!images.length) images = readerImages(pageHtml);
    if (!images.length) {
      var reader = readerLink(pageHtml);
      if (reader) images = readerImages(await html(reader));
    }
    if (images.length) return { kind: 'images', images: images, headers: imageHeaders() };
    return { kind: 'webplayer', pageUrl: absolute(target), headers: headers() };
  }
};
