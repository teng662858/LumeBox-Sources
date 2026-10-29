// LumeSource: {"id":"jiuxse_video","name":"9sex 18+","version":"1.0.1","category":"video","mirrors":["https://9sex.com"]}
//
// 站点：9sex（https://9sex.com，ThinkPHP 站，2026-10-25 逐页实测）
//
// ⚠ 网络：本站**直连不可用**（curl 直连返回 000/连接被重置），实测只有走代理才 200。
//   请在「源设置 → 网络」里给本源配代理（如 http://127.0.0.1:7890）。
//   拿不到响应时本源抛的是「连不上站点…请配代理」的可读错误，不会静默返回空列表。
//
// ── 接口（全部实测）
//   最新   GET  /index/index/index.html?page={N}
//   热门   GET  /index/index/popular.html?page={N}
//   榜单   GET  /index/ranking/index.html
//   分类表 GET  /index/categories/index.html
//          → <a href="/index/categories/movies/id/{id}.html" title="{名}">
//   分类   GET  /index/categories/movies.html?id={id}&page={N}
//   搜索   GET  /index/index/search.html?keyword={词}&page={N}
//   播放页 GET  /index/movie/play/id/{id}.html   （标题、标签、is_vip 都在这里）
//   播放址 GET  /index/movie/info.html?id={id}   （JSON：{code,msg,data:[{name,alias,type,url}]}）
//
// ── ⚠ info 接口的三个必需请求头（少一个就出错，实测）
//   Accept: application/json, text/javascript, */*; q=0.01
//   Accept-Language: zh-CN,zh;q=0.9          ← 少了它站点直接 500「系统发生错误」
//   X-Requested-With: XMLHttpRequest          ← 少了它返回整页 HTML 而不是 JSON
//   （三个都在 __api() 里写死了，改脚本时别删）
//
// ── 列表卡片
//   <a class="item pointer" [target] href="/index/movie/play/id/{id}.html" title="{标题}">
//     <img data-src="{封面}"> <div class="icon-free">VIP</div>   ← 付费片才有这个角标
//
// ── 封面（重要，不是偷懒）
//   站点的封面地址形如 https://img.jqotrwkiebik.com/aes/movies/…/<hash>.webp.txt，
//   实测那个 .txt 是 **AES-128-CBC 密文**（key=625222f9149e961d，iv=5efdtf6060e2o330，
//   见站点 /static/index/js/header.js 的 SEXCRYPTO.decrypt），解出来是一个
//   非标准的 `data:png;base64,…`（少了 `image/` 前缀）内联图片。
//   本源把加密地址写成 `lume-enc://aes-cbc/<key>/<iv>/<原地址>`，由 App 图片管线
//   用原生 AES 解；App 的 data URI 解码同时兼容 `data:png;base64` 这种短写法。
//   列表层不跑纯 JS 解密，不会撞沙箱预算。
//
// ── VIP / 登录：服务端硬门禁（实测）
//   · 播放页里 `var is_vip = '1';` 的片子，info 接口匿名访问返回
//     {"code":0,"msg":"请先登录"}，**不返回任何地址**；
//   · 免费片子（is_vip = ''）匿名直接拿到 m3u8，实测 200 + 真分段。
//   · 所以：免费片本源照播；VIP 片本源**如实抛错**「该视频的播放地址只对登录用户下发」，
//     不伪造已解锁、不拿别的片顶替。判据是 info 的 code/msg 本身。
//
// ── 已知限制
//   1) 「最新」页里刚上传的片子（实测 id ≥ 约 53600，2026-10-20 之后）info 会给地址，
//      但 CDN 上文件还是 404（站点侧没转码完 / 归档未同步）。这类片子进播放器会失败，
//      本源不做兜底（换清晰度也同在 404 的那个目录里）。
//   2) 分类/标签里出现未成年指向的品类（如「可爱萝莉」id=18）**不接进 categories，
//      也不出现在 filters()**，见下方 BANNED 列表。
//   3) 站点有滑动验证/登录弹窗，但公开列表页与 info 接口不需要它。
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
var DEFAULT_BASE = 'https://9sex.com';

// 未成年指向的品类/标签：分类表与筛选里一律过滤，绝不接进 categories。
var BANNED = /(萝莉|幼齿|幼女|未成年|少女|正太|学生|初中|高中|小学|儿童|童颜|女童|童|祼童|loli|lolita|teen|child|underage|schoolgirl|jk)/i;

function base() {
  var conf = typeof LumeSource !== 'undefined' && LumeSource.config ? LumeSource.config : null;
  return String((conf && conf.domain) || DEFAULT_BASE).replace(/\/+$/, '');
}

function entity(text) {
  return String(text == null ? '' : text).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (all, code) {
    var map = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', '#39': "'", '#34': '"' };
    if (map[code] !== undefined) return map[code];
    if (code.charAt(0) === '#') {
      var n = code.charAt(1) === 'x' || code.charAt(1) === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (isFinite(n) && n > 0 && n < 0x110000) return String.fromCharCode(n);
    }
    return all;
  });
}

function clean(text) {
  var body = String(text == null ? '' : text)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return entity(body).replace(/\s+/g, ' ').trim();
}

function abs(url) {
  var text = entity(String(url == null ? '' : url)).trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.indexOf('//') === 0) return 'https:' + text;
  if (text.charAt(0) === '/') return base() + text;
  return base() + '/' + text;
}

function headersFor(referer, json) {
  var out = {
    'User-Agent': UA,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: referer || base() + '/'
  };
  if (json) {
    out.Accept = 'application/json, text/javascript, */*; q=0.01';
    out['X-Requested-With'] = 'XMLHttpRequest';
  } else {
    out.Accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  }
  return out;
}

/// 站点只有走代理才通；失败重试一次（本机代理偶发抖动）。
async function rawGet(url, headers) {
  var lastError = null;
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      return await LumeSource.http.get(url, { headers: headers });
    } catch (error) {
      lastError = error;
      await new Promise(function (resolve) {
        setTimeout(resolve, 250);
      });
    }
  }
  var hint = lastError && lastError.message ? String(lastError.message) : '网络错误';
  throw new Error(
    '9sex：连不上站点（' +
      hint +
      '）。本站直连不通，请在「源设置 → 网络」里给本源配置代理（如 http://127.0.0.1:7890）后重试'
  );
}

async function getHtml(path, referer) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var response = await rawGet(url, headersFor(referer));
  var status = Number(response && response.status);
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：9sex 触发了人机校验（HTTP ' + status + '），请在网页视图里过一下校验，或给本源配置代理');
  }
  if (status === 404) throw new Error('9sex：页面不存在（404）' + path);
  if (status !== 200) throw new Error('9sex：请求失败（HTTP ' + status + '）' + path);
  return String((response && response.body) || '');
}

/// 播放地址接口。三个头必须齐全，否则站点 500 或回整页 HTML。
async function getInfo(videoId) {
  var page = base() + '/index/movie/play/id/' + videoId + '.html';
  var response = await rawGet(base() + '/index/movie/info.html?id=' + encodeURIComponent(videoId), headersFor(page, true));
  var status = Number(response && response.status);
  if (status === 403 || status === 503) {
    throw new Error('NEED_WEBVIEW_VERIFY：9sex 触发了人机校验（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('9sex：播放地址接口返回 HTTP ' + status);
  var body = String((response && response.body) || '').trim();
  if (body.charAt(0) !== '{') {
    throw new Error('9sex：播放地址接口返回的不是 JSON（站点可能改版；本源需要带 Accept/Accept-Language/X-Requested-With）');
  }
  var payload = null;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new Error('9sex：播放地址接口 JSON 解析失败');
  }
  return payload || {};
}

/// 封面：站点封面是 `*.webp.txt`，内容是 **AES-128-CBC 密文**（key=625222f9149e961d，iv=5efdtf6060e2o330），
/// 站点自己的 SEXCRYPTO.decrypt 解出来是 `data:png;base64,...` 的内联图。
/// 在 JS 沙箱里解一张要一次请求 + 一次 AES，列表 20 条会撞穿预算 ⇒ 交给 App 图片管线：
/// 写成 `lume-enc://aes-cbc/<base64url(key)>/<base64url(iv)>/<原地址>`，由原生 AES 解。
var S9_KEY = 'NjI1MjIyZjkxNDllOTYxZA==';
var S9_IV = 'NWVmZHRmNjA2MGUybzMzMA==';
function coverOf(url) {
  var value = String(url || '');
  if (!/\.txt(\?|$)/i.test(value)) return value;
  return 'lume-enc://aes-cbc/' + S9_KEY + '/' + S9_IV + '/' + value;
}

/// 列表卡片解析：VIP 角标 → 排在后面并打标签（免费片优先，匿名就能播）。
/// 标题命中 BANNED 的条目（未成年指向）**在列表层就剔除**，不靠分类来挡——
/// 这些片子也会混进热门/最新流里，只过滤分类是不够的。
function parseItems(html) {
  var items = [];
  var seen = {};
  var pattern = /<a\b[^>]*href="\/index\/movie\/play\/id\/(\d+)\.html"[^>]*title="([^"]*)"/gi;
  var matched;
  while ((matched = pattern.exec(html)) !== null) {
    var id = matched[1];
    var title = clean(matched[2]);
    if (!id || !title || seen[id]) continue;
    if (BANNED.test(title)) continue;
    seen[id] = 1;
    var block = html.slice(matched.index, matched.index + 1200);
    var vip = /class="icon-free"[^>]*>\s*VIP/i.test(block) || /class="vip-icon"/i.test(block);
    var img = /<img[^>]+(?:data-src|data-original|src)="([^"]+)"/i.exec(block);
    var cover = img ? coverOf(abs(img[1])) : '';
    items.push({ id: id, title: title, cover: cover, vip: vip, subtitle: vip ? 'VIP（需登录）' : '' });
  }
  // 免费优先：VIP 片匿名拿不到地址，排在后面，用户先点到的都是能直接播的。
  var free = [];
  var locked = [];
  for (var i = 0; i < items.length; i++) (items[i].vip ? locked : free).push(items[i]);
  return free.concat(locked);
}

/// 分类总表（未成年相关品类在这里被过滤掉）。
async function loadCategories() {
  var html = await getHtml('/index/categories/index.html');
  var rows = [];
  var seen = {};
  var pattern = /href="\/index\/categories\/movies\/id\/(\d+)\.html"[^>]*title="([^"]*)"/gi;
  var matched;
  while ((matched = pattern.exec(html)) !== null) {
    var id = matched[1];
    var title = clean(matched[2]);
    if (!id || !title || seen[id]) continue;
    if (BANNED.test(title)) continue; // 未成年指向的品类：不接入、不展示
    seen[id] = 1;
    rows.push({ id: id, title: title });
  }
  return rows;
}

var CATEGORY_CACHE = null;

function pageUrl(kind, page, categoryId, keyword) {
  var suffix = page > 1 ? '?page=' + page : '';
  if (keyword) return '/index/index/search.html?keyword=' + encodeURIComponent(keyword) + (page > 1 ? '&page=' + page : '');
  if (kind === 'popular') return '/index/index/popular.html' + suffix;
  if (kind === 'ranking') return '/index/ranking/index.html' + suffix;
  if (kind === 'latest' || !kind) return '/index/index/index.html' + suffix;
  return '/index/categories/movies.html?id=' + encodeURIComponent(kind) + (page > 1 ? '&page=' + page : '');
}

var LumeSource = {
  id: 'jiuxse_video',
  name: '9sex 18+',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://9sex.com'],

  /// 分类：前三个是站点自己的三个信息流，后面接分类总表（已过滤未成年品类）。
  async categories() {
    var feed = [
      { id: 'popular', title: '热门' },
      { id: 'latest', title: '最新' },
      { id: 'ranking', title: '榜单' }
    ];
    if (!CATEGORY_CACHE) {
      try {
        CATEGORY_CACHE = await loadCategories();
      } catch (error) {
        CATEGORY_CACHE = []; // 分类表挂了不影响三个信息流
      }
    }
    return feed.concat(CATEGORY_CACHE);
  },

  /// 首页三块：热门 / 最新 / 榜单
  async home() {
    var boards = [];
    var groups = [
      { title: '热门', kind: 'popular', more: 'popular' },
      { title: '最新上传', kind: 'latest', more: 'latest' },
      { title: '榜单', kind: 'ranking', more: 'ranking' }
    ];
    for (var i = 0; i < groups.length; i++) {
      try {
        var items = parseItems(await getHtml(pageUrl(groups[i].kind, 1)));
        if (items.length) boards.push({ title: groups[i].title, moreUrl: groups[i].more, items: items.slice(0, 18) });
      } catch (error) {
        /* 某一块挂了不影响其它块 */
      }
    }
    if (!boards.length) throw new Error('9sex：首页三块都没解析出条目（站点可能改版，或没配代理）');
    return boards;
  },

  /// 筛选页：把分类总表原样当分组给出去（已过滤未成年品类）。
  async filters() {
    var rows = await loadCategories();
    if (!rows.length) return { groups: [] };
    return { groups: [{ id: 'category', title: '分类', options: rows }] };
  },

  async list(argument) {
    var arg = argument || {};
    var page = Number(arg.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = arg.keyword ? String(arg.keyword).trim() : '';
    var categoryId = arg.categoryId ? String(arg.categoryId) : 'popular';
    // 用户从筛选里传来的分类（filters 的 id 就是 site 的分类 id）
    var picks = arg.filters && arg.filters.category ? String(arg.filters.category).split(',') : [];
    if (picks.length && /^\d+$/.test(picks[0])) categoryId = picks[0];
    if (/^\d+$/.test(categoryId)) {
      // 数字分类 id 一定要过一遍分类表：被过滤掉的未成年品类不能靠 id 直连进来。
      if (!CATEGORY_CACHE) CATEGORY_CACHE = await loadCategories();
      var named = CATEGORY_CACHE.filter(function (row) {
        return row.id === categoryId;
      })[0];
      if (!named) throw new Error('9sex：本源不提供该分类（未接入未成年相关品类，或站点已下架该分类）');
    }
    var html = await getHtml(pageUrl(categoryId, page, categoryId, keyword));
    var items = parseItems(html);
    return { items: items, hasMore: items.length >= 12 };
  },

  /// 详情：播放页里的标题/标签/是否 VIP
  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^\d]/g, '');
    if (!id) return null;
    var html;
    try {
      html = await getHtml('/index/movie/play/id/' + id + '.html');
    } catch (error) {
      if (/404/.test(String(error && error.message))) return null;
      throw error;
    }
    var titleMatch = /<h2[^>]*id="video-title"[^>]*>([\s\S]{0,200}?)<\/h2>/i.exec(html) || /<title>([\s\S]{0,200}?)<\/title>/i.exec(html);
    var title = clean(titleMatch ? titleMatch[1] : '');
    if (!title) return null;
    if (BANNED.test(title)) return null; // 未成年指向的标题：连详情层也不给
    var keywords = /<meta[^>]+name="keywords"[^>]+content="([^"]*)"/i.exec(html);
    var tags = keywords
      ? entity(keywords[1])
          .split(',')
          .map(function (part) {
            return part.trim();
          })
          .filter(function (part) {
            return part && part !== title && !BANNED.test(part);
          })
          .slice(0, 8)
      : [];
    var vip = /var\s+is_vip\s*=\s*'1'/i.test(html);
    var lines = [];
    if (tags.length) lines.push('标签：' + tags.join(' / '));
    lines.push(vip ? '播放权限：VIP（服务端定位为登录可见，匿名拿不到地址）' : '播放权限：免费（匿名可直接取地址）');
    lines.push('页面：' + base() + '/index/movie/play/id/' + id + '.html');
    return {
      id: id,
      title: title,
      cover: '',
      subtitle: (vip ? 'VIP' : '免费') + (tags.length ? ' · ' + tags.slice(0, 3).join(' / ') : ''),
      description: lines.join('\n')
    };
  },

  /// 「章节」= 清晰度线路。真正的线路名只有 info 接口知道，所以这里探一次；
  /// 探失败（VIP / 站点抖动）也给一个占位章，让用户点进去看到可读原因。
  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^\d]/g, '');
    if (!id) return [];
    try {
      var info = await getInfo(id);
      if (Number(info.code) === 1 && Array.isArray(info.data) && info.data.length) {
        var rows = [];
        for (var i = 0; i < info.data.length; i++) {
          var line = info.data[i] || {};
          rows.push({ id: String(line.name || i), title: String(line.alias || line.name || '线路 ' + (i + 1)) });
        }
        return rows;
      }
      return [{ id: 'main', title: '播放（' + (info.msg || '接口未授权') + '）' }];
    } catch (error) {
      return [{ id: 'main', title: '播放' }];
    }
  },

  /// 播放：拿 info 的 m3u8 直链（带 Referer 防盗链）。
  async content(argument) {
    var arg = argument || {};
    var id = String(arg.id || '').replace(/[^\d]/g, '');
    if (!id) throw new Error('9sex：缺少视频 id');
    var wants = String(arg.chapterId || '').trim();
    var info = await getInfo(id);
    var code = Number(info.code);
    if (code !== 1) {
      var message = String(info.msg || '');
      if (/登录/.test(message)) {
        throw new Error('9sex：该视频的播放地址只对登录用户下发（接口返回「' + message + '」）。本源不做伪解锁——匿名能播的片照常播，这一条需要站点账号');
      }
      if (/不存在/.test(message)) throw new Error('9sex：视频不存在或已下架（id ' + id + '）');
      throw new Error('9sex：取播放地址失败（接口返回：' + (message || '未知错误') + '）');
    }
    var lines = Array.isArray(info.data) ? info.data : [];
    var played = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i] || {};
      var url = entity(line.url || '').trim();
      if (!/^https?:\/\//i.test(url)) continue;
      var label = String(line.alias || line.name || '线路 ' + (i + 1));
      played.push({ label: label, url: url, name: String(line.name || '') });
    }
    if (!played.length) throw new Error('9sex：播放地址接口没有给出可用的 m3u8（id ' + id + '）');
    var picked = played[0];
    for (var k = 0; k < played.length; k++) {
      if (played[k].name === wants || played[k].label === wants) picked = played[k];
    }
    var headers = { Referer: base() + '/', 'User-Agent': UA };
    var qualities = [];
    for (var q = 0; q < played.length; q++) qualities.push({ label: played[q].label, url: played[q].url });
    qualities.sort(function (a, b) {
      return (parseInt(String(b.label), 10) || 0) - (parseInt(String(a.label), 10) || 0);
    });
    return {
      kind: 'video',
      url: picked.url,
      headers: headers,
      qualities: qualities.length > 1 ? qualities : undefined
    };
  }
};
