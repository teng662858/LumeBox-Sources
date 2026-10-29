// LumeSource: {"id":"ogfap_video","name":"OGFAP","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://ogfap.com"],"network":"proxy","icon":"https://ogfap.com/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"OGFAP（ogfap.com）：TikTok 风成人短片，独立 API 域 apin.ogfap.com（CORS 全开、无需鉴权）。列表 /v2/post/feed-by-key?key=BF&limit=24&cursor=<上页末条 id>，标签 /v2/post/by-tag?tag=<tag>&cursor=…，搜索 /v2/search?q=<词>&skip=<偏移>。播放是 MP4（porncomx.com CDN 的 preview.mp4）；API 没有单条接口，详情/播放靠列表阶段写进本机缓存的 uid 映射。国内需代理。"}]}
// LumeRuntime: javascript
//
// 站点：OGFAP（https://ogfap.com，Astro SSR + Express API）
//
// 结构（2026-10-30 实测，走本机代理）：
//   列表   GET https://apin.ogfap.com/v2/post/feed-by-key?key=BF&limit=24&cursor=<上页最后一条 id>
//          （没有 page 参数，只能用 cursor 顺序翻）
//   标签   GET /v2/post/by-tag?tag=<tag>&limit=24&cursor=<id>
//   搜索   GET /v2/search?q=<词>&limit=24&skip=<偏移>（q= 不能写成 query=，后者 500）
//   详情   https://ogfap.com/@<作者>/video/<uid>，里面有 meta[itemprop=contentUrl]
//   API 没有「按 uid 取单条」的接口，所以列表阶段把 uid→作者/标题/封面/播放地址 写进 fs 缓存
//   播放   实测 porncomx.com/cdn/production/media/0312/<uid>/preview.mp4（206 video/mp4）
//
// 国内需要代理。

var API = 'https://apin.ogfap.com';
var DEFAULT_DOMAIN = 'https://ogfap.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
var CACHE = 'posts.json';
var PAGE_SIZE = 24;

var FALLBACK_CATS = [
  ['hot', '热门'], ['top', 'Top'], ['new', '最新'],
  ['tag:amateur', 'Amateur'], ['tag:asian', 'Asian'], ['tag:ass', 'Ass'],
  ['tag:big-ass', 'Big ass'], ['tag:creampie', 'Creampie'], ['tag:cute', 'Cute']
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_DOMAIN).replace(/\/+$/, '');
}

function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: referer || base() + '/'
  };
}

function entity(text) {
  return String(text == null ? '' : text).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (all, code) {
    var map = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
    if (map[code] !== undefined) return map[code];
    if (code.charAt(0) === '#') {
      var n = code.charAt(1) === 'x' || code.charAt(1) === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (isFinite(n) && n > 0 && n < 0x110000) return String.fromCharCode(n);
    }
    return all;
  });
}

function clean(text) {
  return entity(String(text == null ? '' : text).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function fetchText(url) {
  var reply = await LumeSource.http.get(url, { headers: headers() });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (!status) throw new Error('OGFAP：连不上（' + url + '，国内需代理）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  return { status: status, body: body };
}

async function api(path) {
  var reply = await fetchText(API + path);
  if (reply.status !== 200) throw new Error('OGFAP：接口失败（HTTP ' + reply.status + ' ' + path + '）');
  try {
    return JSON.parse(reply.body);
  } catch (error) {
    throw new Error('OGFAP：接口返回的不是 JSON');
  }
}

async function readCache() {
  try {
    var raw = await LumeSource.fs.readText(CACHE);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

async function writeCache(map) {
  try {
    await LumeSource.fs.writeText(CACHE, JSON.stringify(map));
  } catch (error) {
    /* 缓存失败不影响主流程 */
  }
}

function mediaUrl(post) {
  if (!post || !post.uid) return '';
  return 'https://porncomx.com/cdn/production/media/0312/' + post.uid + '/preview.mp4';
}

function coverUrl(post) {
  if (!post || !post.uid) return '';
  return 'https://porncomx.com/cdn/production/media/0312/' + post.uid + '/thumbnail.webp';
}

function toItem(post) {
  var title = clean(post && post.description || '');
  return {
    id: String(post.uid || post.uuid || ''),
    title: title.slice(0, 60) || ('视频 ' + String(post.uid || '')),
    cover: coverUrl(post) || null,
    subtitle: post.author && post.author.name ? '@' + post.author.name : ''
  };
}

async function remember(posts) {
  if (!Array.isArray(posts) || !posts.length) return;
  var map = await readCache();
  var before = Object.keys(map).length;
  for (var i = 0; i < posts.length; i++) {
    var post = posts[i];
    if (!post || !post.uid) continue;
    map[post.uid] = {
      title: clean(post.description || '').slice(0, 60),
      author: post.author && post.author.name ? String(post.author.name) : '',
      media: mediaUrl(post),
      cover: coverUrl(post)
    };
  }
  var keys = Object.keys(map);
  if (keys.length > 800) {
    for (var k = 0; k < keys.length - 800; k++) delete map[keys[k]];
  }
  if (Object.keys(map).length !== before) await writeCache(map);
}

// feed-by-key 没有 page 参数，按 cursor 顺序走到目标页
async function feedPage(page, key) {
  var cursor = '';
  var last = [];
  for (var i = 1; i <= Math.min(page, 20); i++) {
    var path = '/v2/post/feed-by-key?key=' + encodeURIComponent(key || 'BF') + '&limit=' + PAGE_SIZE + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    var payload = await api(path);
    last = Array.isArray(payload.posts) ? payload.posts : [];
    if (!last.length) break;
    if (i === page) break;
    cursor = String(last[last.length - 1].id || '');
    if (!cursor) break;
  }
  return last;
}

async function tagPage(page, tag) {
  var cursor = '';
  var last = [];
  for (var i = 1; i <= Math.min(page, 20); i++) {
    var path = '/v2/post/by-tag?tag=' + encodeURIComponent(tag) + '&limit=' + PAGE_SIZE + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    var payload = await api(path);
    last = Array.isArray(payload.posts) ? payload.posts : [];
    if (!last.length) break;
    if (i === page) break;
    cursor = String(last[last.length - 1].id || '');
    if (!cursor) break;
  }
  return last;
}

var LumeSource = {
  id: 'ogfap_video',
  name: 'OGFAP',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://ogfap.com'],

  async home() {
    var sections = [];
    var plan = [['hot', '热门'], ['top', 'Top'], ['new', '最新']];
    for (var i = 0; i < plan.length; i++) {
      try {
        var path = plan[i][0] === 'hot'
          ? '/v2/post/feed-by-key?key=BF&limit=' + PAGE_SIZE
          : '/v2/post/' + plan[i][0] + '?limit=' + PAGE_SIZE;
        var payload = await api(path);
        var posts = Array.isArray(payload.posts) ? payload.posts : [];
        await remember(posts);
        var items = posts.map(toItem).filter(function (row) { return row.id; });
        if (items.length) sections.push({ title: plan[i][1], items: items.slice(0, PAGE_SIZE) });
      } catch (error) {
        console.warn('[ogfap] 首页抓取失败 ' + plan[i][1] + '：' + error);
      }
    }
    if (!sections.length) throw new Error('OGFAP：首页没有条目（需要代理或站点改版）');
    return sections;
  },

  async categories() {
    var out = [];
    for (var i = 0; i < FALLBACK_CATS.length; i++) out.push({ id: FALLBACK_CATS[i][0], title: FALLBACK_CATS[i][1] });
    return out;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = clean(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();

    var posts;
    if (keyword) {
      var payload = await api('/v2/search?q=' + encodeURIComponent(keyword) + '&limit=' + PAGE_SIZE + '&skip=' + ((page - 1) * PAGE_SIZE));
      posts = Array.isArray(payload.posts) ? payload.posts : [];
    } else if (categoryId.indexOf('tag:') === 0) {
      posts = await tagPage(page, categoryId.slice(4));
    } else if (categoryId === 'top' || categoryId === 'new') {
      var payload2 = await api('/v2/post/' + categoryId + '?limit=' + PAGE_SIZE);
      posts = Array.isArray(payload2.posts) ? payload2.posts : [];
      if (page > 1) posts = [];
    } else {
      posts = await feedPage(page, 'BF');
    }
    await remember(posts);
    var items = posts.map(toItem).filter(function (row) { return row.id; });
    if (!items.length) console.warn('[ogfap] 列表为空：page=' + page + ' cat=' + categoryId);
    return { items: items, hasMore: items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var uid = String((argument && argument.id) || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!uid) return null;
    var map = await readCache();
    var row = map[uid];
    var pageUrl = base() + '/';
    if (row && row.author) pageUrl = base() + '/@' + encodeURIComponent(row.author) + '/video/' + uid;
    var cover = row && row.cover ? row.cover : '';
    if (!cover && row && row.author) {
      try {
        var reply = await fetchText(pageUrl);
        cover = (/"thumbnailUrl"\s*:\s*"([^"]+)"/.exec(reply.body) || [])[1] || '';
      } catch (error) {
        console.warn('[ogfap] 详情页抓取失败：' + error);
      }
    }
    return {
      id: uid,
      title: (row && row.title) || ('视频 ' + uid),
      cover: cover || null,
      subtitle: row && row.author ? '@' + row.author : '',
      description: '源站：' + pageUrl
    };
  },

  async chapters(argument) {
    var uid = String((argument && argument.id) || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!uid) return [];
    return [{ id: 'play', title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    var uid = String(args.id || args.itemId || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!uid) throw new Error('OGFAP：缺少 uid');
    var map = await readCache();
    var row = map[uid];
    var url = (row && row.media) || mediaUrl({ uid: uid });
    if (row && row.author) {
      try {
        var reply = await fetchText(base() + '/@' + encodeURIComponent(row.author) + '/video/' + uid);
        var real = (/"contentUrl"\s*:\s*"([^"]+)"/.exec(reply.body) || [])[1] || (/itemprop="contentUrl"\s+content="([^"]+)"/.exec(reply.body) || [])[1];
        if (real) url = real;
      } catch (error) {
        console.warn('[ogfap] 详情页取播放地址失败，用缓存：' + error);
      }
    }
    return {
      kind: 'video',
      url: url,
      headers: { 'User-Agent': UA, Range: 'bytes=0-1023' }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
