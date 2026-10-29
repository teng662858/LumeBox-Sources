// LumeSource: {"id":"xiaohuangniao_video","name":"小黄鸟","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://xiaohuangniao.me"],"network":"proxy","icon":"https://xiaohuangniao.me/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"小黄鸟（xiaohuangniao.me）：推特/抖音成人短视频聚合，媒体直连 video.twimg.com。列表接口 /api/tweet?page=<n>&limit=16，搜索 /api/search/tweets?q=<词>&page=<n>；单条用 /api/tweet?tweetId=<推文id> 精确取。没有单条详情页。国内需代理（站点与推特 CDN 都要）。"}]}
// LumeRuntime: javascript
//
// 站点：小黄鸟（https://xiaohuangniao.me，Next.js App Router）
//
// 结构（2026-10-30 实测）：
//   列表   GET /api/tweet?page=<n>&limit=16（JSON：data.tweets[]，含 id/tweetId/text/mediaUrls/extendedEntities）
//   搜索   GET /api/search/tweets?q=<词>&page=<n>&limit=16
//   单条   GET /api/tweet?tweetId=<推文id>（返回 1 条）
//   播放   媒体是推特直链：mediaUrls[].url（mp4）；extendedEntities.media[].video_info.variants 里有 m3u8 与多档 mp4
//   注意   没有 /tweet/<id> 这类详情页，详情只能用接口按 tweetId 取
//
// 国内需要代理。

var DEFAULT_DOMAIN = 'https://xiaohuangniao.me';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_CATS = [
  ['', '最新'], ['抖音风', '抖音风'], ['萝莉', '萝莉'], ['女大', '女大'],
  ['露出', '露出'], ['cos', 'cos']
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_DOMAIN).replace(/\/+$/, '');
}

function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'application/json,text/plain,*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
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

async function apiJson(path) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var reply = await LumeSource.http.get(url, { headers: headers() });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (!status) throw new Error('小黄鸟：连不上（' + url + '，国内需代理）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('小黄鸟：请求失败（HTTP ' + status + ' ' + path + '）');
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error('小黄鸟：接口返回的不是 JSON');
  }
}

// 站点没有「按 tweetId 取单条」的可用接口（带 id 参数会返回置顶那条），
// 所以列表阶段把 id → 播放地址 缓存到 fs，content() 先查缓存，查不到再翻列表。
var MEDIA_CACHE = 'media.json';

async function readCache() {
  try {
    var raw = await LumeSource.fs.readText(MEDIA_CACHE);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

async function writeCache(map) {
  try {
    await LumeSource.fs.writeText(MEDIA_CACHE, JSON.stringify(map));
  } catch (error) {
    /* 缓存失败不影响主流程 */
  }
}

function mediaOf(tweet) {
  var out = [];
  var urls = Array.isArray(tweet && tweet.mediaUrls) ? tweet.mediaUrls : [];
  for (var i = 0; i < urls.length; i++) {
    var item = urls[i];
    var url = typeof item === 'string' ? item : item && item.url;
    if (!url) continue;
    var isVideo = typeof item === 'string' ? /\.mp4|m3u8/i.test(item) : item.type === 'video';
    if (!isVideo) continue;
    out.push(url);
  }
  var media = tweet && tweet.extendedEntities && tweet.extendedEntities.media;
  if (Array.isArray(media)) {
    for (var k = 0; k < media.length; k++) {
      var info = media[k] && media[k].video_info;
      if (!info || !Array.isArray(info.variants)) continue;
      for (var j = 0; j < info.variants.length; j++) {
        var v = info.variants[j];
        if (v && v.url && /\.mp4|mpegURL|m3u8/i.test(String(v.url) + ' ' + String(v.content_type || ''))) out.push(v.url);
      }
    }
  }
  return out;
}

async function remember(tweets) {
  if (!Array.isArray(tweets) || !tweets.length) return;
  var map = await readCache();
  var keys = Object.keys(map);
  for (var i = 0; i < tweets.length; i++) {
    var id = String(tweets[i] && (tweets[i].tweetId || tweets[i].id) || '');
    if (!id) continue;
    var urls = mediaOf(tweets[i]);
    if (urls.length) map[id] = urls;
  }
  var next = Object.keys(map);
  if (next.length > 600) {
    // 只保留最近写入的若干条，避免缓存无限增长
    for (var k = 0; k < next.length - 600; k++) delete map[next[k]];
  }
  if (next.length !== keys.length) await writeCache(map);
}

function rowsOf(payload) {
  if (!payload) return [];
  var data = payload.data;
  if (Array.isArray(data)) return data;
  if (!data) return [];
  if (Array.isArray(data.tweets)) return data.tweets;
  return [];
}

function thumbOf(tweet) {
  var media = tweet && tweet.extendedEntities && tweet.extendedEntities.media;
  if (Array.isArray(media) && media.length) return media[0].media_url_https || media[0].media_url || '';
  if (Array.isArray(tweet.mediaUrls) && tweet.mediaUrls.length) {
    var item = tweet.mediaUrls[0];
    if (item && typeof item === 'object') return item.preview_image_url || item.thumb || '';
  }
  return '';
}

function hasVideo(tweet) {
  if (!tweet) return false;
  var urls = Array.isArray(tweet.mediaUrls) ? tweet.mediaUrls : [];
  for (var i = 0; i < urls.length; i++) {
    var item = urls[i];
    if (typeof item === 'string') {
      if (/\.mp4|m3u8/i.test(item)) return true;
      continue;
    }
    if (item && (item.type === 'video' || /\.mp4|m3u8/i.test(String(item.url || '')))) return true;
  }
  var media = tweet.extendedEntities && tweet.extendedEntities.media;
  if (Array.isArray(media)) {
    for (var k = 0; k < media.length; k++) {
      var info = media[k] && media[k].video_info;
      if (info && Array.isArray(info.variants) && info.variants.length) return true;
    }
  }
  return false;
}

function toItem(tweet) {
  var id = String(tweet.tweetId || tweet.id || '');
  var text = clean(tweet.text || '').split(String.fromCharCode(10))[0].slice(0, 60);
  return {
    id: id,
    title: text || ('推文 ' + id),
    cover: thumbOf(tweet) || null,
    subtitle: tweet.author && tweet.author.userName ? '@' + tweet.author.userName : ''
  };
}

var LumeSource = {
  id: 'xiaohuangniao_video',
  name: '小黄鸟',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://xiaohuangniao.me'],

  async home() {
    var sections = [];
    try {
      var payload = await apiJson('/api/tweet?page=1&limit=16&minViewCount=10000');
      var items = rowsOf(payload).filter(hasVideo).map(toItem).filter(function (row) { return row.id; });
      if (items.length) sections.push({ title: '热门', moreUrl: '', items: items.slice(0, 16) });
    } catch (error) {
      console.warn('[xiaohuangniao] 热门抓取失败：' + error);
    }
    try {
      var tiktok = await apiJson('/api/tweet?page=1&limit=16&minDuration=15000');
      var rows = rowsOf(tiktok).filter(hasVideo).map(toItem).filter(function (row) { return row.id; });
      if (rows.length) sections.push({ title: '抖推', items: rows.slice(0, 16) });
    } catch (error) {
      console.warn('[xiaohuangniao] 抖推抓取失败：' + error);
    }
    if (!sections.length) throw new Error('小黄鸟：首页没有条目（需要代理或站点改版）');
    return sections;
  },

  async categories() {
    var out = [];
    for (var i = 0; i < FALLBACK_CATS.length; i++) out.push({ id: 'q:' + FALLBACK_CATS[i][0], title: FALLBACK_CATS[i][1] });
    return out;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = clean(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    if (categoryId.indexOf('q:') === 0) keyword = categoryId.slice(2);

    var path;
    if (keyword) {
      path = '/api/search/tweets?q=' + encodeURIComponent(keyword) + '&page=' + page + '&limit=16';
    } else {
      path = '/api/tweet?page=' + page + '&limit=16';
    }
    var payload = await apiJson(path);
    var rawRows = rowsOf(payload).filter(hasVideo);
    await remember(rawRows);
    var items = rawRows.map(toItem).filter(function (row) { return row.id; });
    if (!items.length) console.warn('[xiaohuangniao] 列表为空：' + path);
    return { items: items, hasMore: items.length >= 16 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var payload = await apiJson('/api/tweet?id=' + id);
    var rows = rowsOf(payload);
    if (!rows.length) return null;
    var item = toItem(rows[0]);
    var author = rows[0].author || {};
    var bits = [];
    if (author.name) bits.push(author.name);
    if (rows[0].viewCount) bits.push(String(rows[0].viewCount) + ' 次观看');
    return {
      id: item.id,
      title: item.title,
      cover: item.cover,
      subtitle: bits.join(' · '),
      description: (rows[0].text ? clean(rows[0].text).slice(0, 400) + '\n' : '') + '源站：' + base() + '/tweets'
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'play', title: '视频' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || args.itemId || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('小黄鸟：缺少推文 id');
    var map = await readCache();
    var urls = map[id];
    if (!urls || !urls.length) {
      // 缓存没命中：翻前几页列表找一次
      for (var page = 1; page <= 3 && (!urls || !urls.length); page++) {
        var payload = await apiJson('/api/tweet?page=' + page + '&limit=16');
        var rows = rowsOf(payload);
        await remember(rows);
        var hit = rows.filter(function (row) { return String(row.tweetId || row.id) === id; })[0];
        if (hit) urls = mediaOf(hit);
      }
      map = await readCache();
      if (!urls || !urls.length) urls = map[id] || [];
    }
    if (!urls || !urls.length) {
      return { kind: 'webplayer', pageUrl: base() + '/tweets', headers: headers() };
    }
    var qualities = [];
    for (var i = 0; i < urls.length; i++) qualities.push({ label: 'mp4', url: urls[i] });
    return {
      kind: 'video',
      url: urls[0],
      headers: { 'User-Agent': UA, Referer: 'https://x.com/', Range: 'bytes=0-1023' },
      qualities: qualities.length > 1 ? qualities : undefined
    };
  }

};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
