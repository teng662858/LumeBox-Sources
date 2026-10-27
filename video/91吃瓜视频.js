// LumeSource: {"id":"cg1_video","name":"91吃瓜视频","version":"1.1.0","category":"video","contentCategory":"adult","mirrors":["https://www.91cg1.com","https://91cg8.com","https://91cgb21.com"],"icon":"https://www.91cg1.com/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：91吃瓜网（https://www.91cg1.com，Typecho + Mirages）。同一套页面既发图集也发短片，
// 本源只取视频（图集见 sources/photo/91cg1.js）。
//
// 播放地址在帖子页内嵌的 DPlayer 配置里（不是 iframe）：
//   "video":{"url":"https://op.udhhzr.cn/videos5/{hash}/{hash}.m3u8?auth_key=…&v=3&time=0&project_id=tj015&pv=1","type":"hls"}
// JSON 里 `\/` 要还原成 `/`。实测：清单 200 + #EXTM3U；清单内的 AES key 与 .ts 分片都由服务端逐条签好
// （分别在 as.ucjosl.cn 上），不需要 Referer，直接用播放器放即可。
// 注意：站点旧的一套 CDN（hls.ffxddn.cn / op.vkjyoi.cn）已经死了，本源只认页面里当下给的那条。
//
// 列表/搜索/分类路径与图集源一致：`/`、`/page/N/`、`/category/{slug}/N/`、`/search/{词}/N/`。
// 没有视频的帖子（少数纯图集）交给 App 的网页播放器打开原帖。

var BASE_URL = 'https://www.91cg1.com';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PAGE_SIZE = 20;
var CATEGORY_FILE = 'categories-v2.json';
var POST_TTL_MS = 10 * 60 * 1000;
var CATEGORY_TTL_MS = 6 * 3600 * 1000;

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return (domain || BASE_URL).replace(/\/+$/, '');
}

function absolute(url) {
  var text = String(url == null ? '' : url).trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.indexOf('//') === 0) return 'https:' + text;
  if (text.charAt(0) === '/') return base() + text;
  return base() + '/' + text;
}

// Public reader: zzz.js decryptImage uses AES-CBC with PKCS7 padding.
function imageHeaders() {
  return {
    Referer: base() + '/',
    'X-Lume-Image-Encoding': 'aes-cbc-pkcs7',
    'X-Lume-Image-Key': 'f5d965df75336270',
    'X-Lume-Image-IV': '97b60394abc2fbe1',
  };
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

async function fetchHtml(path) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var reply = await LumeSource.http.get(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: base() + '/',
    },
  });
  var status = reply ? reply.status : 0;
  if (status === 403 || status === 503) {
    throw new Error('NEED_WEBVIEW_VERIFY：91吃瓜触发了 Cloudflare 人机校验（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('页面打不开：HTTP ' + status + ' ' + path);
  return reply.body ? String(reply.body) : '';
}

function clean(text) {
  return String(text == null ? '' : text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCards(html) {
  var items = [];
  var seen = {};
  var text = String(html || '');
  // 卡片链接两种写法都有：站内相对 "/archives/{pid}/" 与搜索页的绝对 URL
  var re = /<a\s+href="(?:https?:\/\/[^"\/]*)?\/archives\/(\d+)\/"/g;
  var marks = [];
  var matched;
  while ((matched = re.exec(text)) !== null) marks.push({ at: matched.index, pid: matched[1] });
  for (var i = 0; i < marks.length; i++) {
    var pid = marks[i].pid;
    if (seen[pid]) continue;
    var end = i + 1 < marks.length ? marks[i + 1].at : Math.min(text.length, marks[i].at + 6000);
    var block = text.slice(marks[i].at, end);
    var titleMatch = /<h2[^>]*class="post-card-title"[^>]*>([\s\S]*?)<\/h2>/.exec(block);
    var title = titleMatch ? titleMatch[1].replace(/<div class="wrap">[\s\S]*$/, '') : '';
    title = clean(title);
    if (!title) continue;
    var coverMatch = /loadBannerDirect\('([^']+)'/.exec(block);
    var dateMatch = /datePublished"\s+content="([^"]+)"/.exec(block);
    var catsMatch = /<span>([^<]*,[^<]*)<\/span>/.exec(block);
    seen[pid] = true;
    items.push({
      id: pid,
      title: title,
      cover: absolute(coverMatch ? coverMatch[1] : ''),
      coverHeaders: imageHeaders(),
      subtitle: [catsMatch ? clean(catsMatch[1]) : '', dateMatch ? String(dateMatch[1]).slice(0, 10) : '']
        .filter(Boolean)
        .join(' · '),
    });
  }
  return items;
}

function pidOf(value) {
  var text = String(value == null ? '' : value).trim();
  var matched = /\/archives\/(\d+)/.exec(text) || /^(\d+)$/.exec(text);
  return matched ? matched[1] : '';
}

async function postData(pid) {
  var cacheFile = 'p-v2-' + pid + '.json';
  var cached = await readJson(cacheFile);
  if (cached && cached.at && Date.now() - Number(cached.at) < POST_TTL_MS) return cached;

  var html = await fetchHtml('/archives/' + pid + '/');
  var h1 = /<h1[^>]*>([\s\S]{0,240}?)<\/h1>/.exec(html);
  var desc = /<meta\s+name="description"\s+content="([^"]*)"/.exec(html);
  var kw = /<meta\s+name="keywords"\s+content="([^"]*)"/.exec(html);
  var images = [];
  var imgRe = /data-xkrkllgl="([^"]+)"/g;
  var matched;
  while ((matched = imgRe.exec(html)) !== null) {
    var url = absolute(matched[1]);
    if (url) images.push(url);
  }
  var video = '';
  var vMatch = /"video":\{"url":"([^"]+)"/.exec(html);
  if (vMatch) video = String(vMatch[1]).replace(/\\\//g, '/').replace(/\\u0026/g, '&');

  var data = {
    at: Date.now(),
    id: pid,
    title: clean(h1 ? h1[1] : ''),
    cover: images.length ? images[0] : '',
    description: clean(desc ? desc[1] : ''),
    tags: clean(kw ? kw[1] : ''),
    imageCount: images.length,
    video: video,
  };
  await writeJson(cacheFile, data);
  return data;
}

async function categoryList() {
  var cached = await readJson(CATEGORY_FILE);
  if (cached && Array.isArray(cached.list) && cached.list.length && Date.now() - Number(cached.at) < CATEGORY_TTL_MS) {
    return cached.list;
  }
  var html = await fetchHtml('/');
  var list = [];
  var seen = {};
  var re = /<a\b[^>]*href=["'](?:https?:\/\/[^"'\/]+)?\/category\/([a-z0-9_-]+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi;
  var matched;
  while ((matched = re.exec(html)) !== null) {
    var slug = matched[1];
    var name = clean(matched[2]);
    if (!slug || !name || seen[slug]) continue;
    seen[slug] = true;
    list.push({ id: 'cat:' + slug, title: name });
  }
  if (list.length) await writeJson(CATEGORY_FILE, { at: Date.now(), list: list });
  return list;
}

function listPath(page, categoryId, keyword) {
  var suffix = page > 1 ? String(page) + '/' : '';
  if (keyword) return '/search/' + encodeURIComponent(keyword) + '/' + suffix;
  if (/^cat:/.test(categoryId)) return '/category/' + categoryId.slice(4) + '/' + suffix;
  return page > 1 ? '/page/' + page + '/' : '/';
}

var LumeSource = {
  id: 'cg1_video',
  name: '91吃瓜视频',
  version: '1.1.0',
  icon: 'https://www.91cg1.com/favicon.ico',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://www.91cg1.com', 'https://91cg8.com', 'https://91cgb21.com'],

  async categories() {
    var list = [{ id: 'latest', title: '最新' }];
    try {
      var cats = await categoryList();
      for (var i = 0; i < cats.length; i++) list.push(cats[i]);
    } catch (error) {
      /* 分类抓不到时至少还能看最新 */
    }
    return list;
  },

  async home() {
    var boards = [];
    var latest = parseCards(await fetchHtml('/'));
    if (latest.length) boards.push({ title: '最新', moreUrl: 'latest', items: latest.slice(0, 12) });
    var cats = [];
    try {
      cats = await categoryList();
    } catch (error) {
      cats = [];
    }
    for (var i = 0; i < cats.length && i < 3; i++) {
      try {
        var cards = parseCards(await fetchHtml(listPath(1, cats[i].id, ''))).slice(0, 12);
        if (cards.length) boards.push({ title: cats[i].title, moreUrl: cats[i].id, items: cards });
      } catch (error) {
        /* 单个分类失败不影响首页 */
      }
    }
    return boards;
  },

  async filters() {
    var options = [];
    try {
      var cats = await categoryList();
      for (var i = 0; i < cats.length; i++) options.push({ id: cats[i].id.slice(4), title: cats[i].title });
    } catch (error) {
      /* 空筛选即可 */
    }
    return {
      groups: [
        { id: 'category', title: '分类', options: options },

      ],
    };
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1);
    if (!page || page < 1) page = 1;
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    if (filters.category) categoryId = 'cat:' + String(filters.category).trim();
    if (filters.sort === 'hot') categoryId = 'cat:rsdg';

    var path = listPath(page, categoryId, keyword);
    var html = await fetchHtml(path);
    var items = parseCards(html);
    // 「下一页」链接就是 listPath(page+1)；末页没有它。首页只有 19 张卡（头图占位），所以不按条数卡死
    var nextPath = listPath(page + 1, categoryId, keyword);
    var hasMore = html.indexOf('href="' + nextPath + '"') >= 0 || items.length >= PAGE_SIZE;
    return { items: items, hasMore: hasMore };
  },

  async detail(argument) {
    var pid = pidOf(argument && argument.id);
    if (!pid) return null;
    var data = await postData(pid);
    if (!data || !data.title) return null;
    var bits = [];
    bits.push(data.video ? 'HLS 正片' : '无视频');
    if (data.imageCount) bits.push(data.imageCount + ' 张配图');
    var description = data.description;
    if (data.tags) description += (description ? '\n\n' : '') + '标签：' + data.tags;
    return {
      id: pid,
      title: data.title,
      cover: data.cover || '',
      coverHeaders: imageHeaders(),
      subtitle: bits.join(' · '),
      description: description,
    };
  },

  async chapters(argument) {
    var pid = pidOf(argument && argument.id);
    if (!pid) return [];
    var data = await postData(pid);
    if (!data) return [];
    return [{ id: 'video', title: data.video ? '正片（HLS）' : '正片（源站无视频）' }];
  },

  async content(argument) {
    var args = argument || {};
    var pid = pidOf(args.id);
    if (!pid) throw new Error('缺少帖子 ID');
    var data = await postData(pid);
    if (!data) throw new Error('帖子打不开：' + base() + '/archives/' + pid + '/');
    if (data.video) {
      return {
        kind: 'video',
        url: data.video,
        headers: { Referer: base() + '/', 'User-Agent': UA },
      };
    }
    return {
      kind: 'webplayer',
      pageUrl: base() + '/archives/' + pid + '/',
      headers: { Referer: base() + '/', 'User-Agent': UA },
    };
  },
};
