// LumeSource: {"id":"tanhua_video","name":"探花视频","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://xn--91-mu9cv53j.com","https://xn--dzu640eo1e2qq.com"],"network":"direct"}
// LumeRuntime: javascript
//
// 站点：探花视频（探花视频.com）与 91大神（91大神.com）—— **同一套内容库的两个入口**，实测：
//   · 同一 id 在两个站取到的是同一条内容，m3u8 逐字相同（1266994 / 1271208 / 1087880 / 543110 / 368381 各验一遍）；
//   · 探花首页 15 个 id 拿去 91大神 取 → 15/15 命中；反向 15/15；同 id 的 m3u8 10/10 完全一致；
//   · 两站共用同一个广告注入脚本 b0u61g2m.load-faster.com/quote.js、同一个跳转域
//     23sg11.a3tc2k6bm1kiloxvpcjz79okw1.com（只换 ?tanhua / ?91dashen）、同一个 TG 客服 t.me/xadmanagebot；
//   · 模板同源（同名 s.css，版本戳 210917 / 240110），同一套 DPlayer 1.26 + hls.js 1.0.0-alpha.5。
// 差别只在皮肤和导航：探花按题材分（极品/00后/双飞/制服…），91大神按大神名分（仓本c仔/夯先生/秦先生…），
// 所以本源把「分类」做成**跟着当前域名实时解析**：换网址后分类自动变成那个站的导航，不会指错。
//
// 页面结构（SSR，无接口）：
//   · 首页            /index.html            第 N 页 /index-0-N.html
//   · 分类            /index-{cat}.html      第 N 页 /index-{cat}-{N}.html（末页链接 index-{cat}-1391.html 这种）
//   · 详情            /content-{id}.html     → <h1>标题</h1> + DPlayer 配置 url:'…index.m3u8' pic:'…jpg'
//   · 搜索：没有（search.php / so.html 直接 403，?wd= / index.php?m=vod-search 都只是回普通列表）→ 本源不做搜索
//
// 媒体：m3u8 由服务端直给（不同批次落在不同历史 CDN：2609.sysl2026.com、voddadaizi2.com:52866、
// vostrely.com、play2.laoyacdn.com…），实测清单 200 + #EXTM3U，无 AES key、不需要 Referer；
// 封面是 listing 里的 background-image CDN 直链（un.shayu260522.top、lb260817.top 等）。
//
// 域名：两个都是 Cloudflare + 泛域名证书，**IDN 要用 punycode**（xn--91-mu9cv53j.com = 91大神.com，
// xn--dzu640eo1e2qq.com = 探花视频.com）。本机实测 91大神 可直连、探花 的 DNS 被污染到 127.0.1.1，
// 所以默认域名放 91大神，探花放镜像；脚本里还带一次跨镜像兜底（主域连不上自动换另一个）。
// 全站 18+。

var MIRRORS = ['https://xn--91-mu9cv53j.com', 'https://xn--dzu640eo1e2qq.com'];
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PAGE_SIZE = 30;
var NAV_TTL_MS = 6 * 3600 * 1000;
var DETAIL_TTL_MS = 10 * 60 * 1000;

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return (domain || MIRRORS[0]).replace(/\/+$/, '');
}

function hostOf(url) {
  return String(url || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
}

// 当前域名优先，失败后试另一个镜像（只兜底一次，不做无限重试）
function candidateBases() {
  var primary = base();
  var out = [primary];
  for (var i = 0; i < MIRRORS.length; i++) {
    if (hostOf(MIRRORS[i]) !== hostOf(primary)) out.push(MIRRORS[i].replace(/\/+$/, ''));
  }
  return out;
}

async function readJson(file) {
  try {
    var raw = await LumeSource.fs.readText(file);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function writeJson(file, value) {
  try {
    await LumeSource.fs.writeText(file, JSON.stringify(value));
  } catch (error) {
    /* 缓存失败不影响主流程 */
  }
}

async function fetchPage(path) {
  var bases = candidateBases();
  var lastError = null;
  for (var i = 0; i < bases.length; i++) {
    try {
      var reply = await LumeSource.http.get(bases[i] + path, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: bases[i] + '/',
        },
      });
      var status = reply ? reply.status : 0;
      if (status === 200) return reply.body ? String(reply.body) : '';
      if (status === 403 || status === 503) {
        lastError = new Error('NEED_WEBVIEW_VERIFY：' + hostOf(bases[i]) + ' 被 Cloudflare 挡下（HTTP ' + status + '）');
        continue;
      }
      lastError = new Error('页面打不开：HTTP ' + status + ' ' + path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('两个镜像都连不上：' + path);
}

function clean(text) {
  return String(text == null ? '' : text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 列表卡片：<a href="content-{id}.html" title="{标题}"> + 下一段里的 background-image:url('封面')
function parseCards(html) {
  var text = String(html || '');
  var items = [];
  var seen = {};
  var chunks = text.split('href="content-');
  for (var i = 1; i < chunks.length; i++) {
    var chunk = chunks[i];
    var idMatch = /^(\d+)\.html/.exec(chunk);
    if (!idMatch) continue;
    var id = idMatch[1];
    if (seen[id]) continue;
    var titleMatch = /title="([^"]{1,200})"/.exec(chunk);
    if (!titleMatch) continue;
    var title = clean(titleMatch[1]);
    if (!title) continue;
    var coverMatch = /background-image:url\('([^']+)'\)/.exec(chunk);
    seen[id] = true;
    items.push({
      id: id,
      title: title,
      cover: coverMatch ? String(coverMatch[1]) : '',
      subtitle: '',
    });
  }
  return items;
}

function listPath(cat, page) {
  var n = Number(cat) || 0;
  var p = Number(page) || 1;
  if (p <= 1) return n === 0 ? '/index.html' : '/index-' + n + '.html';
  return '/index-' + n + '-' + p + '.html';
}

// 导航分类（跟着当前域名走）：index-{n}.html > 名称
async function navCategories() {
  var key = 'nav-' + hostOf(base()) + '.json';
  var cached = await readJson(key);
  if (cached && Array.isArray(cached.list) && cached.list.length && Date.now() - Number(cached.at) < NAV_TTL_MS) {
    return cached.list;
  }
  var html = await fetchPage('/');
  var list = [];
  var seen = {};
  var re = /href="index-(\d+)\.html"[^>]*>([^<]{1,20})</g;
  var matched;
  while ((matched = re.exec(html)) !== null) {
    var n = Number(matched[1]);
    var name = clean(matched[2]);
    if (!n || !name || seen[n]) continue;
    seen[n] = true;
    list.push({ id: 'cat:' + n, title: name });
  }
  if (list.length) await writeJson(key, { at: Date.now(), list: list });
  return list;
}

async function detailData(id) {
  var key = 'c-' + id + '.json';
  var cached = await readJson(key);
  if (cached && cached.at && Date.now() - Number(cached.at) < DETAIL_TTL_MS) return cached;

  var html = await fetchPage('/content-' + id + '.html');
  var h1 = /<h1[^>]*>([\s\S]{0,300}?)<\/h1>/.exec(html);
  var title = clean(h1 ? h1[1] : '');
  var urlMatch = /url:\s*'([^']+)'/.exec(html);
  var picMatch = /pic:\s*'([^']+)'/.exec(html);
  var data = {
    at: Date.now(),
    id: String(id),
    title: title,
    cover: picMatch ? String(picMatch[1]) : '',
    url: urlMatch ? String(urlMatch[1]) : '',
    pageUrl: base() + '/content-' + id + '.html',
  };
  await writeJson(key, data);
  return data;
}

var LumeSource = {
  id: 'tanhua_video',
  name: '探花视频',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: MIRRORS,

  async categories() {
    var list = [{ id: 'home', title: '最新' }];
    try {
      var nav = await navCategories();
      for (var i = 0; i < nav.length; i++) list.push(nav[i]);
    } catch (error) {
      /* 导航抓不到时至少还能看最新 */
    }
    return list;
  },

  async home() {
    var boards = [];
    var latest = parseCards(await fetchPage('/index.html'));
    if (latest.length) boards.push({ title: '最新', moreUrl: 'home', items: latest.slice(0, 12) });
    var nav = [];
    try {
      nav = await navCategories();
    } catch (error) {
      nav = [];
    }
    for (var i = 0; i < nav.length && i < 3; i++) {
      try {
        var cards = parseCards(await fetchPage(listPath(String(nav[i].id).replace('cat:', ''), 1))).slice(0, 12);
        if (cards.length) boards.push({ title: nav[i].title, moreUrl: nav[i].id, items: cards });
      } catch (error) {
        /* 单个分类失败不影响首页 */
      }
    }
    return boards;
  },

  async filters() {
    var options = [];
    try {
      var nav = await navCategories();
      for (var i = 0; i < nav.length; i++) options.push({ id: String(nav[i].id).replace('cat:', ''), title: nav[i].title });
    } catch (error) {
      /* 空筛选即可 */
    }
    return { groups: [{ id: 'category', title: '分类', options: options }] };
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1);
    if (!page || page < 1) page = 1;
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    if (keyword) throw new Error('这个站没有搜索接口（search.php / so.html 都返回 403），请用分类浏览');

    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    var cat = 0;
    if (/^cat:/.test(categoryId)) cat = Number(categoryId.slice(4)) || 0;
    else if (filters.category) cat = Number(filters.category) || 0;

    var html = await fetchPage(listPath(cat, page));
    var items = parseCards(html);
    var nextLink = 'index-' + cat + '-' + (page + 1) + '.html';
    return { items: items, hasMore: html.indexOf(nextLink) >= 0 || items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var data = null;
    try {
      data = await detailData(id);
    } catch (error) {
      return null;
    }
    if (!data || !data.title) return null;
    return {
      id: id,
      title: data.title,
      cover: data.cover,
      subtitle: data.url ? '正片 · HLS' : '无播放地址',
      description: '源站：' + (data.pageUrl || '') + '\n探花视频.com 与 91大神.com 是同一套内容库的两个入口，可在「源设置 → 换网址」切换。',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'video:' + id, title: '正片（HLS）' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少视频 ID');
    var data = await detailData(id);
    if (!data || !data.url) throw new Error('这条没有播放地址（源站可能已下架或无权限）');
    return {
      kind: 'video',
      url: data.url,
      headers: { Referer: base() + '/', 'User-Agent': UA },
    };
  },
};
