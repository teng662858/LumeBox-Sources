// LumeSource: {"id":"niacg_photo","name":"逆ACG","version":"1.0.0","category":"photo","contentCategory":"adult","mirrors":["https://www.niacg.com"],"network":"proxy","icon":"https://www.niacg.com/skin/img/logo_a7.png"}
// LumeRuntime: javascript
//
// 站点：逆ACG（https://www.niacg.com，标题「Xpicvid图片视频在线资源平台」）—— 二次元 COS / 图集站。
//
// 一、站点有 Cloudflare 人机校验（纯 HTTP 一律 403「Just a moment…」，只有静态图片能直取）
//   实测：/ 与 /listinfo-*、/moehome-* 全部 403；/skin/img/logo_a7.png 200。
//   所以本源**必须靠 App 的网页视图过校验**：首次打开源时点一次「网页视图」，
//   App 会把 cf_clearance / __cf_bm 存进站点会话池（lib/core/net/site_session_pool.dart），
//   之后 LumeSource.http 的请求会自动带上，列表就能正常取。
//   （harness 没有校验 Cookie，所以命令行跑会看到 403 —— 这属于预期，不是源写错了。）
//
// 二、结构（用真实浏览器 DOM 核对过）
//   分类   /listinfo-{分类id}-{页码从0开始}.html        里番 19、日漫 14、韩漫 15、福利资源 10 …
//   条目   /moehome-1-{id}.html                        图集详情
//   卡片   <a href="/moehome-1-157949.html"> … <img src="https://boom.xunge.cyou/slthh/…/0_xxx.webp" title="标题">
//          + <span class="video-title">标题</span> + 点赞数
//   详情页里的图集是 JS 拉取的（owl-carousel），拿不到完整图片清单 →
//   content() 返回 webplayer（详情页），交给 App 内嵌浏览器渲染整组图。
// 18+

var BASE_URL = 'https://www.niacg.com';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var NAV_TTL_MS = 6 * 3600 * 1000;
var PAGE_SIZE = 24;

var FALLBACK_CATS = [
  { id: '19', title: '里番' },
  { id: '14', title: '日漫' },
  { id: '15', title: '韩漫' },
  { id: '10', title: '福利资源' },
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
      throw new Error('站点要过 Cloudflare 人机校验：先在源里点一次「网页视图」，再回来重试');
    }
    if (status !== 200) throw new Error('页面打不开：HTTP ' + status + '（' + path + '）');
    return reply.body ? String(reply.body) : '';
  });
}

function parseCards(html) {
  var text = String(html || '');
  var items = [];
  var seen = {};
  var re = /<a href="\/moehome-1-(\d+)\.html"[\s\S]{0,800}?<img[^>]*src="(https:\/\/[^"]+)"[^>]*title="([^"]{0,120})"/g;
  var matched;
  while ((matched = re.exec(text)) !== null) {
    var id = matched[1];
    if (seen[id]) continue;
    seen[id] = true;
    items.push({
      id: id,
      title: clean(matched[3]) || ('图集 ' + id),
      cover: matched[2],
      coverHeaders: { Referer: base() + '/', 'User-Agent': UA },
      subtitle: '',
    });
  }
  return items;
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
  version: '1.0.0',
  category: 'photo',
  contentCategory: 'adult',
  mirrors: ['https://www.niacg.com'],

  async categories() {
    var cached = await readJson('cats.json');
    if (cached && Array.isArray(cached.list) && cached.list.length && Date.now() - Number(cached.at) < NAV_TTL_MS) {
      return cached.list;
    }
    try {
      var html = await get('/');
      var cats = parseCats(html);
      if (cats.length) {
        await writeJson('cats.json', { at: Date.now(), list: cats });
        return cats;
      }
    } catch (error) {
      /* 过不了校验时先给固定分类 */
    }
    return FALLBACK_CATS;
  },

  async home() {
    var boards = [];
    try {
      var html = await get('/');
      var items = parseCards(html);
      if (items.length) {
        await remember(items);
        boards.push({ title: '最新 COS', moreUrl: '19', items: items.slice(0, 12) });
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
    if (!/^\d+$/.test(categoryId)) categoryId = '19';
    var html = await get(listPath(categoryId, page));
    var items = parseCards(html);
    await remember(items);
    return { items: items, hasMore: items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    return {
      id: id,
      title: row && row.title ? row.title : ('图集 ' + id),
      cover: row && row.cover ? row.cover : '',
      subtitle: '图集 · 内嵌浏览器查看',
      description: '源站：' + base() + '/moehome-1-' + id + '.html\n云端有人机校验，首次需要在源里点一次「网页视图」过校验，之后就能正常翻页。',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'web:' + id, title: '整组图集' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少图集 ID');
    return { kind: 'webplayer', url: base() + '/moehome-1-' + id + '.html' };
  },
};
