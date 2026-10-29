// LumeSource: {"id":"niacg_photo","name":"逆ACG","version":"1.1.0","category":"photo","contentCategory":"adult","settingsApiVersion":2,"requiresSettings":["settingsActions"],"mirrors":["https://www.acgbay.com","https://www.acg.al","https://www.acg.bz","https://www.xpicvid.net"],"network":"direct","icon":"https://www.acgbay.com/skin/img/logo_a7.png","settings":[{"key":"publishPage","type":"action","action":"openWebsite","title":"打开发布页","url":"https://02.uno/","description":"站点换域名时先看这里：02.uno 是官方发布页，列出当前可用地址"},{"key":"note","type":"info","title":"站点说明","description":"逆ACG / Xpicvid 二次元图集站。acg.al、acgbay.com 直连 200；acg.bz、xpicvid.net 有 Cloudflare 人机校验，必要时在源设置里点「打开当前站点」过一次校验。图集详情由页面 JS 渲染，因此在 App 内嵌浏览器里看整组图。"}]}
// LumeRuntime: javascript
//
// 站点：逆ACG（标题「Xpicvid图片视频在线资源平台」）—— 二次元 COS / 图集站。
//
// 一、域名（2026-10-29 换站，旧 www.niacg.com 已解析不到）
//   官方发布页：https://02.uno/（Cloudflare 人机页，用浏览器能打开），列出当前地址：
//     · www.acgbay.com  → 实测直连 200（Node/curl 都通，**主站**）
//     · www.acg.al      「优化地址 快」→ curl 200；Node 会被 CF 挑战（同内容：同 id、同标题）
//     · www.acg.bz / www.xpicvid.net → Cloudflare 人机校验（App 网页视图可过）
//     · m.acg.gdn 是 Basic 认证（用户名 acg / 密码 9990），bbsbay.com 是论坛，freeacg3/freeacg4 已 error
//   页面结构没变：/listinfo-{分类id}-{页码从0开始}.html、/moehome-1-{id}.html。
//   主站与 acgbay 不需要校验；只有 acg.bz / xpicvid.net 需要「网页视图」过一次 CF，
//   App 会把 cf_clearance / __cf_bm 存进站点会话池（lib/core/net/site_session_pool.dart），
//   之后 LumeSource.http 的请求自动带上。
//
// 二、结构（用真实浏览器 DOM 核对过）
//   分类   /listinfo-{分类id}-{页码从0开始}.html        里番 19、日漫 14、韩漫 15、福利资源 10 …
//   条目   /moehome-1-{id}.html                        图集详情
//   卡片   <a href="/moehome-1-157949.html"> … <img src="https://boom.xunge.cyou/slthh/…/0_xxx.webp" title="标题">
//          + <span class="video-title">标题</span> + 点赞数
//   详情页里的图集是 JS 拉取的（owl-carousel），拿不到完整图片清单 →
//   content() 返回 webplayer（详情页），交给 App 内嵌浏览器渲染整组图。
// 18+

var BASE_URL = 'https://www.acgbay.com';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var NAV_TTL_MS = 6 * 3600 * 1000;
var PAGE_SIZE = 24;

// 只有这几个分类是图集（/moehome-{类型}-{id}）：9 最新 / 1 COS / 2 CG / 3 本子 / 4 套图。
// 里番 19、日漫 14、韩漫 15、3D 20、同人 21 现在是漫画阅读页，福利 10 / 游戏 5 是别的栏目，不做。
var GALLERY_CATS = ['9', '1', '2', '3', '4'];
var FALLBACK_CATS = [
  { id: '9', title: '最新' },
  { id: '1', title: 'COS' },
  { id: '2', title: 'CG' },
  { id: '3', title: '本子' },
  { id: '4', title: '套图' },
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return (domain || BASE_URL).replace(/\/+$/, '');
}

function readJson(file) {
  return LumeSource.fs.readText(file).then(function (raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (error) { return null; }
  }).catch(function () { return null; });
}

function writeJson(file, value) {
  return LumeSource.fs.writeText(file, JSON.stringify(value)).catch(function () { return null; });
}

function clean(text) {
  return String(text == null ? '' : text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function get(path) {
  return LumeSource.http.get(base() + path, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: base() + '/',
    },
  }).then(function (reply) {
    var status = reply ? reply.status : 0;
    if (status === 403 || status === 503) {
      throw new Error('NEED_WEBVIEW_VERIFY：这个线路要过 Cloudflare 人机校验（换 acgbay.com 主站也能用）：在源设置里点一次「打开当前站点」过校验，再回来重试');
    }
    if (status !== 200) throw new Error('页面打不开：HTTP ' + status + '（' + path + '）');
    return reply.body ? String(reply.body) : '';
  });
}

function parseCards(html) {
  var text = String(html || '');
  var items = [];
  var seen = {};
  // 详情路径是 /moehome-{类型}-{id}.html（1 COS / 2 CG / 3 本子 / 4 套图）；
  // 类型 1 的 id 保持纯数字（兼容老收藏），其余用「类型-id」。
  var re = /<a href="\/moehome-(\d+)-(\d+)\.html"([^>]*)>([\s\S]{0,900}?)<\/a>/g;
  var matched;
  while ((matched = re.exec(text)) !== null) {
    var type = matched[1];
    var rawId = matched[2];
    var itemId = type === '1' ? rawId : type + '-' + rawId;
    if (seen[itemId]) continue;
    var inner = matched[4];
    var img = /<img[^>]*?(?:data-)?src="(https:\/\/[^"]+)"/.exec(inner);
    if (!img) continue;
    var title = /title="([^"]{1,120})"/.exec(matched[3]) || /title="([^"]{1,120})"/.exec(inner);
    seen[itemId] = true;
    items.push({
      id: itemId,
      title: clean(title ? title[1] : '') || ('图集 ' + rawId),
      cover: img[1],
      coverHeaders: { Referer: base() + '/', 'User-Agent': UA },
      subtitle: '',
    });
  }
  return items;
}

// 条目 id → 详情路径（老的纯数字 id 按类型 1 处理）
function detailPath(itemId) {
  var text = String(itemId == null ? '' : itemId);
  var pair = /^(\d+)-(\d+)$/.exec(text);
  if (pair) return '/moehome-' + pair[1] + '-' + pair[2] + '.html';
  var num = text.replace(/[^0-9]/g, '');
  return num ? '/moehome-1-' + num + '.html' : '';
}

function parseCats(html) {
  var text = String(html || '');
  var out = [];
  var seen = {};
  var re = /href="\/listinfo-(\d+)-0\.html"[^>]*>([^<]{1,10})</g;
  var matched;
  while ((matched = re.exec(text)) !== null) {
    var id = matched[1];
    var name = clean(matched[2]);
    if (!name || /查看更多|更多/.test(name) || seen[id]) continue;
    seen[id] = true;
    out.push({ id: id, title: name });
  }
  return out;
}

function listPath(cat, page) {
  var n = Number(page) || 1;
  var index = Math.max(0, n - 1);
  return '/listinfo-' + (cat || '19') + '-' + index + '.html';
}

function remember(items) {
  if (!items.length) return Promise.resolve(null);
  return readJson('items.json').then(function (cached) {
    var map = (cached && cached.map) ? cached.map : {};
    for (var i = 0; i < items.length; i++) map[items[i].id] = { title: items[i].title, cover: items[i].cover };
    return writeJson('items.json', { at: Date.now(), map: map });
  });
}

var LumeSource = {
  id: 'niacg_photo',
  name: '逆ACG',
  version: '1.1.0',
  category: 'photo',
  contentCategory: 'adult',
  settingsApiVersion: 2,
  requiresSettings: ['settingsActions'],
  mirrors: ['https://www.acgbay.com', 'https://www.acg.al', 'https://www.acg.bz', 'https://www.xpicvid.net'],

  settings: [
    {
      key: 'publishPage',
      type: 'action',
      action: 'openWebsite',
      title: '打开发布页',
      url: 'https://02.uno/',
      description: '站点换域名时先看这里：02.uno 是官方发布页，列出当前可用地址',
    },
    {
      key: 'note',
      type: 'info',
      title: '站点说明',
      description: '逆ACG / Xpicvid 二次元图集站。acg.al、acgbay.com 直连 200；acg.bz、xpicvid.net 有 Cloudflare 人机校验，必要时在源设置里点「打开当前站点」过一次校验。图集详情由页面 JS 渲染，因此在 App 内嵌浏览器里看整组图。',
    },
  ],

  async categories() {
    var cached = await readJson('cats.json');
    if (cached && Array.isArray(cached.list) && cached.list.length && Date.now() - Number(cached.at) < NAV_TTL_MS) {
      return cached.list;
    }
    var titles = {};
    try {
      var cats = parseCats(await get('/'));
      for (var i = 0; i < cats.length; i++) titles[cats[i].id] = cats[i].title;
    } catch (error) {
      /* 过不了校验时只用固定标题 */
    }
    var list = [];
    for (var j = 0; j < GALLERY_CATS.length; j++) {
      var id = GALLERY_CATS[j];
      var title = titles[id] || '';
      for (var k = 0; k < FALLBACK_CATS.length && !title; k++) {
        if (FALLBACK_CATS[k].id === id) title = FALLBACK_CATS[k].title;
      }
      list.push({ id: id, title: title || ('分类 ' + id) });
    }
    await writeJson('cats.json', { at: Date.now(), list: list });
    return list;
  },

  async home() {
    var boards = [];
    try {
      var html = await get('/');
      var items = parseCards(html);
      if (items.length) {
        await remember(items);
        boards.push({ title: '最新 COS', moreUrl: '1', items: items.slice(0, 12) });
      }
    } catch (error) {
      throw error;
    }
    return boards;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    if (filters.category) categoryId = String(filters.category).trim();
    if (GALLERY_CATS.indexOf(categoryId) < 0) categoryId = '9';
    var html = await get(listPath(categoryId, page));
    var items = parseCards(html);
    await remember(items);
    return { items: items, hasMore: items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var key = String((argument && argument.id) || '');
    var path = detailPath(key);
    if (!path) return null;
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[key] : null;
    return {
      id: key,
      title: row && row.title ? row.title : ('图集 ' + key),
      cover: row && row.cover ? row.cover : '',
      subtitle: '图集 · 内嵌浏览器查看',
      description: '源站：' + base() + path + '\n详情页由站点 JS 渲染整组图，因此在 App 内嵌浏览器里查看；acgbay.com 直连可用，acg.bz / xpicvid.net 需要先过一次人机校验。',
    };
  },

  async chapters(argument) {
    var key = String((argument && argument.id) || '');
    if (!detailPath(key)) return [];
    return [{ id: 'web:' + key, title: '整组图集' }];
  },

  async content(argument) {
    var args = argument || {};
    var path = detailPath(String(args.id || ''));
    if (!path) throw new Error('缺少图集 ID');
    return { kind: 'webplayer', url: base() + path };
  },
};
