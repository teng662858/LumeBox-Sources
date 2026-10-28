// LumeSource: {"id":"hongguo_video","name":"红果短剧","version":"1.0.0","category":"video","mirrors":["https://hongguoduanju.com"],"network":"proxy","icon":"https://hongguoduanju.com/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：红果免费短剧（https://hongguoduanju.com）—— 字节短剧，H5 + SSR。
//   搜索   GET /api/search/result?aid=8662&query=<关键词>&page=N   （必须先访问一次首页拿 ttwid Cookie）
//   列表   GET /category?page=N（分类：/category/real-drama、comic-drama、ai-drama、comic）
//   详情   GET /detail?series_id=<sid>   → seriesDetail{series_name,series_cover,series_intro,episode_cnt}
//                                         + "vid_list":["<vid>",…]（每集一个 vid）
//   播放   https://hongguoduanju.com/video/public/<vid>/360p.mp4   ← 直接 mp4（实测 200 video/mp4）
//   兜底   拿不到 vid 时用 webplayer 打开 /player/<sid>
// 18+

var SITE = 'https://hongguoduanju.com';
var UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
var PAGE_SIZE = 24;
var TTL_MS = 30 * 60 * 1000;

var DEFAULT_CATS = [
  { id: 'all', title: '全部' },
  { id: 'real-drama', title: '真人短剧' },
  { id: 'comic-drama', title: '漫剧' },
  { id: 'ai-drama', title: 'AI短剧' },
  { id: 'comic', title: '漫画' },
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return (domain || SITE).replace(/\/+$/, '');
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
    .replace(/\\u002F/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function unescapeJson(text) {
  return String(text == null ? '' : text)
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\u([0-9a-fA-F]{4})/g, function (m, hex) { return String.fromCharCode(parseInt(hex, 16)); });
}

// ttwid 是搜索接口的前置条件：先打一次首页，把 Cookie 存下来复用
async function cookie() {
  var cached = await readJson('cookie.json');
  if (cached && cached.cookie && Date.now() - Number(cached.at) < 6 * 3600 * 1000) return cached.cookie;
  var cookieText = '';
  try {
    var reply = await LumeSource.http.get(base() + '/', { headers: { 'User-Agent': UA, Accept: 'text/html' } });
    var pairs = [];
    var arr = (reply && reply.setCookie) || [];
    for (var i = 0; i < arr.length; i++) {
      var first = String(arr[i]).split(';')[0];
      if (first.indexOf('=') > 0) pairs.push(first.trim());
    }
    var header = reply && reply.headers ? (reply.headers['set-cookie'] || reply.headers['Set-Cookie'] || '') : '';
    if (!pairs.length && header) {
      var parts = String(header).split(',');
      for (var k = 0; k < parts.length; k++) {
        var one = parts[k].split(';')[0].trim();
        if (one.indexOf('=') > 0) pairs.push(one);
      }
    }
    cookieText = pairs.join('; ');
  } catch (error) {
    cookieText = '';
  }
  if (cookieText) await writeJson('cookie.json', { at: Date.now(), cookie: cookieText });
  return cookieText;
}

async function fetchPage(path) {
  var ck = await cookie();
  var headers = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', Referer: base() + '/' };
  if (ck) headers.Cookie = ck;
  var reply = await LumeSource.http.get(base() + path, { headers: headers });
  var status = reply ? reply.status : 0;
  if (status !== 200) throw new Error('页面打不开：HTTP ' + status + '（' + path + '）');
  return reply.body ? String(reply.body) : '';
}

async function fetchJson(path) {
  var ck = await cookie();
  var headers = { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Referer: base() + '/' };
  if (ck) headers.Cookie = ck;
  var reply = await LumeSource.http.get(base() + path, { headers: headers });
  var status = reply ? reply.status : 0;
  if (status !== 200) throw new Error('接口打不开：HTTP ' + status + '（' + path + '）');
  try {
    return JSON.parse(reply.body ? String(reply.body) : '{}');
  } catch (error) {
    throw new Error('接口返回不是 JSON：' + path);
  }
}

function parseCards(html) {
  var text = String(html || '');
  var items = [];
  var seen = {};
  var re = /<a[^>]+href="\/detail\?series_id=(\d+)"[\s\S]{0,1200}?<img[^>]+src="([^"]+)"[^>]*alt="([^"]{0,120})"/g;
  var matched;
  while ((matched = re.exec(text)) !== null) {
    var id = matched[1];
    if (seen[id]) continue;
    seen[id] = true;
    var cover = unescapeJson(matched[2]);
    // 集数 / 标题：卡片尾部还有 <p class="…title…">标题</p> 与「全86集」
    var tail = text.slice(matched.index, matched.index + 1600);
    var ep = /全\s*(\d+)\s*集/.exec(tail);
    var titleTag = /<p[^>]+title[^>]*>([^<]{2,80})<\/p>/i.exec(tail);
    var title = clean(unescapeJson(matched[3])) || (titleTag ? clean(unescapeJson(titleTag[1])) : '') || ('短剧 ' + id);
    items.push({ id: id, title: title, cover: cover, subtitle: ep ? ('全' + ep[1] + '集') : '' });
  }
  return items;
}

function remember(items) {
  if (!items.length) return Promise.resolve(null);
  return readJson('items.json').then(function (cached) {
    var map = (cached && cached.map) ? cached.map : {};
    for (var i = 0; i < items.length; i++) map[items[i].id] = { title: items[i].title, cover: items[i].cover, subtitle: items[i].subtitle };
    return writeJson('items.json', { at: Date.now(), map: map });
  });
}

function seriesDetail(html) {
  var text = String(html || '');
  var name = /"series_name":"([^"]{0,120})"/.exec(text);
  var cover = /"series_cover":"([^"]{0,300})"/.exec(text);
  var intro = /"series_intro":"([^"]{0,600})"/.exec(text);
  var cnt = /"episode_cnt":(\d+)/.exec(text);
  var vidList = /"vid_list":\[([^\]]{0,4000})\]/.exec(text);
  var vids = [];
  if (vidList) {
    var parts = vidList[1].split(',');
    for (var i = 0; i < parts.length; i++) {
      var m = /(\d{15,25})/.exec(parts[i]);
      if (m) vids.push(m[1]);
    }
  }
  return {
    title: name ? clean(unescapeJson(name[1])) : '',
    cover: cover ? unescapeJson(cover[1]) : '',
    intro: intro ? clean(unescapeJson(intro[1])) : '',
    count: cnt ? Number(cnt[1]) : 0,
    vids: vids,
  };
}

var LumeSource = {
  id: 'hongguo_video',
  name: '红果短剧',
  version: '1.0.0',
  category: 'video',
  mirrors: ['https://hongguoduanju.com'],

  async categories() {
    return DEFAULT_CATS;
  },

  async home() {
    var boards = [];
    try {
      var html = await fetchPage('/category');
      var items = parseCards(html);
      if (items.length) {
        await remember(items);
        boards.push({ title: '最新短剧', moreUrl: 'all', items: items.slice(0, 12) });
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
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();

    if (keyword) {
      var data = await fetchJson('/api/search/result?aid=8662&query=' + encodeURIComponent(keyword) + '&page=' + page);
      var rows = (data && data.searchList) || [];
      var items = [];
      for (var i = 0; i < rows.length; i++) {
        var vd = (rows[i] && rows[i].video_data) || {};
        if (!vd.series_id) continue;
        items.push({
          id: String(vd.series_id),
          title: clean(unescapeJson(vd.series_title || rows[i].name || '')),
          cover: unescapeJson(vd.series_cover || ''),
          subtitle: vd.episode_cnt ? ('全' + vd.episode_cnt + '集') : '',
        });
      }
      await remember(items);
      var totalPages = Number(data && data.totalPages) || 1;
      return { items: items, hasMore: page < totalPages };
    }

    var path = categoryId && categoryId !== 'all' ? '/category/' + encodeURIComponent(categoryId) : '/category';
    if (page > 1) path += '?page=' + page;
    var html = await fetchPage(path);
    var pageItems = parseCards(html);
    await remember(pageItems);
    return { items: pageItems, hasMore: pageItems.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = await fetchPage('/detail?series_id=' + id);
    var info = seriesDetail(html);
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    return {
      id: id,
      title: info.title || (row && row.title) || ('短剧 ' + id),
      cover: info.cover || (row && row.cover) || '',
      subtitle: info.count ? ('全' + info.count + '集') : ((row && row.subtitle) || ''),
      description: info.intro || '红果短剧（hongguoduanju.com）',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    var html = await fetchPage('/detail?series_id=' + id);
    var info = seriesDetail(html);
    var out = [];
    for (var i = 0; i < info.vids.length; i++) out.push({ id: 'v:' + info.vids[i], title: '第' + (i + 1) + '集' });
    if (!out.length) out.push({ id: 'web:' + id, title: '网页播放' });
    return out;
  },

  async content(argument) {
    var args = argument || {};
    var chapterId = String(args.chapterId || '');
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少短剧 ID');
    var vid = '';
    if (chapterId.indexOf('v:') === 0) vid = chapterId.slice(2).replace(/[^0-9]/g, '');
    if (!vid) {
      var html = await fetchPage('/detail?series_id=' + id);
      var info = seriesDetail(html);
      if (info.vids.length) vid = info.vids[0];
    }
    if (vid) {
      return {
        kind: 'video',
        url: base() + '/video/public/' + vid + '/360p.mp4',
        headers: { 'User-Agent': UA, Referer: base() + '/' },
      };
    }
    return { kind: 'webplayer', url: base() + '/player/' + id };
  },
};
