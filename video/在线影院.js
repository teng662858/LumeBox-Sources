// LumeSource: {"id":"f016_video","name":"在线影院","version":"1.0.1","category":"video","contentCategory":"adult","mirrors":["https://bb.f016video.com","https://ss.99utv.com"],"network":"direct","icon":"https://bb.f016video.com/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：在线影院（bb.f016video.com）与 91吃瓜（ss.99utv.com）—— 同一站群，但**是包含关系**：
//   · A(ss.99utv) 首页 20 条拿到 B 上取 → 16/20 命中；B 首页 20 条拿到 A 上取 → 0/20（A 只有 348 字节 404 页）；
//   · 同一路径 /bqgiw/eo/eopgnrriz.html 两边标题一致、m3u8 逐字一致（2609.lajiao2026.com/…）；
//   · 两站同一个 GA（G-TS1J3HQT8G）、同一详情模板（video-js + 「来源切换样式」）、分类 31 个里 24 个重合。
// 所以本源以 **B 为主域**（超集，首页标注「已收录 209 万+ 视频」）、A 放镜像，且**详情 404 自动回落到 B**
// （切到 A 时若某条只在 B 上，靠这一步兜住，不会出现空条目）。
//
// 结构（SSR，PHP 模板 + hash slug，没有数字 id）：
//   · 首页/分页   /            /page/2/ … /page/100/
//   · 分类        /{slug}/     /{slug}/page/2/ …
//   · 详情        /{slug}/{2字母}/{10字母}.html   ← 整条路径就是 id
//   · 卡片        <div class="entry-card"> → <a class="entry-thumb" href> + <img src|data-src> + <h2 class="entry-title">
//   · 翻页标记    <div class="ct-pagination"> 里的 <a class="page-numbers" href="/page/3/">
//   · 详情字段    <title>标题 - 在线影院</title>、<video poster="封面">、页面内直给 m3u8
//
// 搜索走站点自己的 Meilisearch（/search/?q= 是前端渲染，真正接口是 POST）：
//   POST /search/indexes/indexes/articles/search
//   headers: Authorization: Bearer <search-config.js 里的 apiKey>
//   body: {"q":"关键词","limit":40,"offset":N,"filter":"(source = \"sem\" OR source = \"siw\" OR …)"}
//   → {hits:[{id,title,url,category,thumb,…}], estimatedTotalHits}
// apiKey 与 source 白名单每次从 /search-config.js 现取并缓存 6 小时（站点会换 key）。
//
// 全站 18+；A/B 两站内容重复，只做一个源。

var MIRRORS = ['https://bb.f016video.com', 'https://ss.99utv.com'];
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PAGE_SIZE = 40;
var NAV_TTL_MS = 6 * 3600 * 1000;
var DETAIL_TTL_MS = 10 * 60 * 1000;
var SEARCH_TTL_MS = 6 * 3600 * 1000;

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return (domain || MIRRORS[0]).replace(/\/+$/, '');
}

function hostOf(url) {
  return String(url || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
}

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

// 404 判定：A 站返回 348 字节的裸 404 页，B 站返回 2159 字节模板 404，都靠标题判
function looksMissing(status, html) {
  if (status === 404) return true;
  var title = (/<title>([^<]*)<\/title>/.exec(html) || [])[1] || '';
  return /404|not\s*found/i.test(title);
}

// 取页面：当前域名优先，404 或连不上就换另一个镜像（这就是 A ⊂ B 的兜底）
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
      var body = reply && reply.body ? String(reply.body) : '';
      if (status === 200 && body && !looksMissing(status, body)) {
        return { base: bases[i], html: body };
      }
      if (status === 403 || status === 503) {
        lastError = new Error('NEED_WEBVIEW_VERIFY：' + hostOf(bases[i]) + ' 被 Cloudflare 挡下（HTTP ' + status + '）');
        continue;
      }
      lastError = new Error('页面取不到：HTTP ' + status + ' ' + path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('两个镜像都取不到：' + path);
}

// ---------------------------------------------------------------- 列表解析

function parseCards(html) {
  var text = String(html || '');
  var items = [];
  var seen = {};
  var chunks = text.split('class="entry-card"');
  for (var i = 1; i < chunks.length; i++) {
    var chunk = chunks[i];
    var hrefMatch = /href="(\/[^"]+\.html)"/.exec(chunk);
    if (!hrefMatch) continue;
    var path = hrefMatch[1];
    if (seen[path]) continue;
    var imgMatch = /<img[^>]+(?:data-src|src)="([^"]+)"/.exec(chunk);
    var altMatch = /<img[^>]+alt="([^"]*)"/.exec(chunk);
    var titleMatch = /class="entry-title"[^>]*>[\s\S]{0,80}?<a[^>]*>([\s\S]{0,200}?)<\/a>/.exec(chunk);
    var catMatch = /class="card-category"[^>]*>([^<]{1,30})</.exec(chunk);
    var title = clean(titleMatch ? titleMatch[1] : altMatch ? altMatch[1] : '');
    if (!title) continue;
    seen[path] = true;
    items.push({
      id: path,
      title: title,
      cover: imgMatch ? String(imgMatch[1]) : '',
      subtitle: catMatch ? clean(catMatch[1]) : '',
    });
  }
  return items;
}

function listPath(cat, page) {
  var n = Number(page) || 1;
  if (String(cat || '') === 'all') cat = '';
  var prefix = cat && cat !== 'home' ? '/' + cat : '';
  if (n <= 1) return prefix ? prefix + '/' : '/';
  return prefix + '/page/' + n + '/';
}

// 导航分类：/{slug}/ > 名称（跟着当前域名走，A/B 的 7 个独有分类不会互相指错）
async function navCategories() {
  var key = 'nav-' + hostOf(base()) + '.json';
  var cached = await readJson(key);
  if (cached && Array.isArray(cached.list) && cached.list.length && Date.now() - Number(cached.at) < NAV_TTL_MS) {
    return cached.list;
  }
  var page = await fetchPage('/');
  var list = [];
  var seen = {};
  var re = /href="\/([a-z0-9]{3,8})\/"[^>]*>([\s\S]{0,60}?)<\/a>/g;
  var matched;
  while ((matched = re.exec(page.html)) !== null) {
    var slug = matched[1];
    var name = clean(matched[2]);
    if (!slug || !name || seen[slug] || slug === 'page') continue;
    if (/^(search|all)$/.test(slug) && slug !== 'all') continue;
    // 「更多分类」「全部」这类伪分类点进去还是首页，别放进分类列表
    if (/更多|全部|更多分类/.test(name)) continue;
    seen[slug] = true;
    list.push({ id: 'cat:' + slug, title: name });
  }
  if (list.length) await writeJson(key, { at: Date.now(), list: list });
  return list;
}

// ---------------------------------------------------------------- 搜索（Meilisearch）

async function searchConfig() {
  var key = 'searchcfg-' + hostOf(base()) + '.json';
  var cached = await readJson(key);
  if (cached && cached.apiKey && cached.filter && Date.now() - Number(cached.at) < SEARCH_TTL_MS) return cached;

  var page = await fetchPage('/search-config.js');
  // search-config.js 是 JS 对象字面量（key 没有引号），所以两边引号都允许
  var host = (/["']?host["']?\s*:\s*["']([^"']+)["']/.exec(page.html) || [])[1] || 'indexes';
  var index = (/["']?indexName["']?\s*:\s*["']([^"']+)["']/.exec(page.html) || [])[1] || 'articles';
  var apiKey = (/["']?apiKey["']?\s*:\s*["']([^"']+)["']/.exec(page.html) || [])[1] || '';
  var sourcesRaw = (/["']?filterSources["']?\s*:\s*\[([\s\S]*?)\]/.exec(page.html) || [])[1] || '';
  var sources = [];
  var re = /"([^"]+)"/g;
  var matched;
  while ((matched = re.exec(sourcesRaw)) !== null) {
    if (sources.indexOf(matched[1]) < 0) sources.push(matched[1]);
  }
  var filter = sources.length
    ? '(' + sources.map(function (s) { return 'source = "' + s + '"'; }).join(' OR ') + ')'
    : '';
  var cfg = { at: Date.now(), base: page.base, host: host, index: index, apiKey: apiKey, filter: filter };
  if (apiKey) await writeJson(key, cfg);
  return cfg;
}

async function searchItems(keyword, page, pageNo) {
  var cfg = await searchConfig();
  if (!cfg.apiKey) throw new Error('搜索配置取不到（站点可能换了 search-config.js）');
  var offset = Math.max(0, (pageNo - 1) * PAGE_SIZE);
  var body = { q: keyword, limit: PAGE_SIZE, offset: offset };
  if (cfg.filter) body.filter = cfg.filter;
  var reply = await LumeSource.http.request({
    // 实测路径：/search/indexes/indexes/articles/search（host 段出现两次，别自己拼少一段）
    url: cfg.base + '/search/' + cfg.host + '/' + cfg.host + '/' + cfg.index + '/search',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: 'Bearer ' + cfg.apiKey,
      Referer: cfg.base + '/search/?q=' + encodeURIComponent(keyword),
      'User-Agent': UA,
    },
    body: JSON.stringify(body),
  });
  var status = reply ? reply.status : 0;
  if (status < 200 || status >= 300) throw new Error('搜索接口失败：HTTP ' + status);
  var json = null;
  try {
    json = JSON.parse(reply.body ? String(reply.body) : '');
  } catch (error) {
    json = null;
  }
  var hits = json && Array.isArray(json.hits) ? json.hits : [];
  var items = [];
  for (var i = 0; i < hits.length; i++) {
    var hit = hits[i];
    if (!hit || !hit.url) continue;
    items.push({
      id: String(hit.url),
      title: String(hit.title || ''),
      cover: String(hit.thumb || ''),
      subtitle: String(hit.category || ''),
    });
  }
  var total = json && typeof json.estimatedTotalHits === 'number' ? json.estimatedTotalHits : 0;
  return { items: items, hasMore: offset + PAGE_SIZE < total, total: total };
}

// ---------------------------------------------------------------- 详情

async function detailData(path) {
  var key = 'c-' + String(path).replace(/[^a-z0-9]/gi, '_') + '.json';
  var cached = await readJson(key);
  if (cached && cached.at && Date.now() - Number(cached.at) < DETAIL_TTL_MS) return cached;

  var page = await fetchPage(path);
  var html = page.html;
  var titleTag = clean((/<title>([^<]*)<\/title>/.exec(html) || [])[1] || '');
  titleTag = titleTag.replace(/\s*-\s*在线影院\s*$/, '').trim();
  var h1 = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1] || '');
  var poster = (page.html.match(/<video[^>]+poster="([^"]+)"/) || [])[1] || '';
  var m3u8 = (html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/) || [])[0] || '';
  var cats = [];
  var cre = /class="card-category"[^>]*>([^<]{1,30})</g;
  var cm;
  while ((cm = cre.exec(html)) !== null) {
    var name = clean(cm[1]);
    if (name && cats.indexOf(name) < 0) cats.push(name);
  }

  var data = {
    at: Date.now(),
    path: path,
    base: page.base,
    title: h1 || titleTag || String(path),
    cover: poster,
    url: m3u8,
    categories: cats,
  };
  await writeJson(key, data);
  return data;
}

var LumeSource = {
  id: 'f016_video',
  name: '在线影院',
  version: '1.0.1',
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
    var latest = parseCards((await fetchPage('/')).html);
    if (latest.length) boards.push({ title: '最新', moreUrl: 'home', items: latest.slice(0, 12) });
    var nav = [];
    try {
      nav = await navCategories();
    } catch (error) {
      nav = [];
    }
    for (var i = 0; i < nav.length && i < 3; i++) {
      try {
        var slug = String(nav[i].id).replace('cat:', '');
        var cards = parseCards((await fetchPage(listPath(slug, 1))).html).slice(0, 12);
        if (cards.length) boards.push({ title: nav[i].title, moreUrl: nav[i].id, items: cards });
      } catch (error) {
        /* 单个分类失败不影响首页 */
      }
    }
    return boards;
  },

  async filters() {
    // categories() 已经是「最新 + 站点全部导航分类」；这里再返回一份同样的
    // 分类组，App 会渲染成第二排（截图里的「分类 / 全部 / 国产自拍…」重复行）。
    // 站点没有独立的地区/年份/标签筛选，所以这里保持空组。
    return { groups: [] };
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1);
    if (!page || page < 1) page = 1;
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    if (keyword) return await searchItems(keyword, null, page);

    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    var cat = 'home';
    if (/^cat:/.test(categoryId)) cat = categoryId.slice(4);
    else if (filters.category) cat = String(filters.category);

    var path = listPath(cat, page);
    var pageData = await fetchPage(path);
    var items = parseCards(pageData.html);
    var nextPath = listPath(cat, page + 1);
    var hasMore = pageData.html.indexOf('href="' + nextPath + '"') >= 0 || items.length >= PAGE_SIZE;
    return { items: items, hasMore: hasMore };
  },

  async detail(argument) {
    var path = String((argument && argument.id) || '').trim();
    if (!/^\//.test(path)) return null;
    var data = null;
    try {
      data = await detailData(path);
    } catch (error) {
      return null;
    }
    if (!data || !data.title) return null;
    var bits = [];
    if (data.categories.length) bits.push(data.categories.slice(0, 2).join(' / '));
    bits.push(data.url ? '正片 · HLS' : '无播放地址');
    return {
      id: path,
      title: data.title,
      cover: data.cover,
      subtitle: bits.join(' · '),
      description:
        '源站：' + data.base + path +
        '\n「在线影院」(bb.f016video.com) 与「91吃瓜」(ss.99utv.com) 是同一站群，前者内容更全；' +
        '本源在详情 404 时会自动回落到另一个域名。',
    };
  },

  async chapters(argument) {
    var path = String((argument && argument.id) || '').trim();
    if (!/^\//.test(path)) return [];
    return [{ id: 'video:' + path, title: '正片（HLS）' }];
  },

  async content(argument) {
    var args = argument || {};
    var path = String(args.id || '').trim();
    if (!/^\//.test(path)) throw new Error('缺少视频路径');
    var data = await detailData(path);
    if (!data || !data.url) throw new Error('这条没有播放地址（源站可能已下架）');
    return {
      kind: 'video',
      url: data.url,
      headers: { Referer: data.base + '/', 'User-Agent': UA },
    };
  },
};
