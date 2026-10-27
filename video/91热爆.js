// LumeSource: {"id":"resao_video","name":"91热爆","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://www.resao.com"],"network":"proxy"}
// LumeRuntime: javascript
//
// 站点：91热爆（https://www.resao.com）—— KVS（Kernel Video Sharing）站，**有 VIP 专享内容**。
//
// 一、VIP 挡在哪一层（2026-10-27 实测）
//   · 页面层：`/private/` 是「VIP专享」，卡片带 `<span class="ico-private">VIP</span>`；
//     游客还有观看次数上限（KVS guest limit），超限后连普通视频页都变成
//     `<div class="no-player" id="limitplayer">` + 「游客试看已达上限，登入会员以解锁精彩内容！」
//     —— 页面里 **没有 video_url / flashvars / m3u8**。
//   · CDN 层：**裸奔**。视频文件的路径是可预测的，签名参数只是装饰：
//       播放列表  https://delivery.douyinpaly.com/hls/contents/videos/{dir}/{id}/{id}.mp4/index.m3u8
//       720p      …/{id}_720p.mp4/index.m3u8
//       整片 mp4  https://delivery.douyinpaly.com/contents/videos/{dir}/{id}/{id}.mp4
//     其中 dir = floor(id / 1000) * 1000。**把 ?k=…&t=… 整个去掉照样 200 + #EXTM3U**，
//     分片也 200 + video/MP2T；整片 mp4 实测单个 140 MB 也能直接下。
//     → 所以 VIP 视频只需要知道 id，不需要登录、不需要会员、也不需要任何签名。
//     实测覆盖 /private/ 的 4 条 VIP 片：4/4 全部可直连（默认清晰度 + 720p）。
//
// 二、因此本源的做法
//   · 列表/详情走 HTML（KVS 模板，`/latest-updates/`、`/most-popular/`、`/private/`、
//     `/categories/{slug}/`，翻页 `{path}{N}/`），VIP 与普通片一起列；
//   · **播放地址完全由 id 现拼 CDN 路径**（content() 不读页面），所以
//     ① 游客限流对播放没影响；② VIP 片照样能放；③ 少一次请求。
//   · 封面：`/contents/videos_screenshots/{dir}/{id}/320x180/{n}.jpg`（页面里的 data-original）。
//
// 三、注意
//   · 这份 CDN 域是站点当前在下发的（delivery.douyinpaly.com），它换域时改 CDN_HOSTS 即可；
//   · 1080p 变体普遍 404（站点只保留默认 + 720p），脚本按「默认 → 720p」顺序探测；
//   · 全站 18+。

var BASE_URL = 'https://www.resao.com';
var CDN_HOSTS = ['https://delivery.douyinpaly.com'];
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PAGE_SIZE = 20;
var NAV_TTL_MS = 6 * 3600 * 1000;
var DETAIL_TTL_MS = 10 * 60 * 1000;

var SECTIONS = [
  { id: 'latest', title: '最新上传', path: '/latest-updates/' },
  { id: 'popular', title: '最多播放', path: '/most-popular/' },
  { id: 'private', title: 'VIP专享', path: '/private/' },
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return (domain || BASE_URL).replace(/\/+$/, '');
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

async function fetchPage(path) {
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
    throw new Error('NEED_WEBVIEW_VERIFY：91热爆被 Cloudflare 挡住（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('页面打不开：HTTP ' + status + ' ' + path);
  return reply.body ? String(reply.body) : '';
}

// ---------------------------------------------------------------- 列表

function parseCards(html) {
  var text = String(html || '');
  var items = [];
  var seen = {};
  // 卡片锚点：<a href="https://www.resao.com/videos/{id}/{slug}/" title="标题" data-rt="…">
  // 注意：KVS 的详情页必须带 slug（/videos/{id}/ 会 404），所以 id 直接用整条路径，
  // 数字 id 在 content() 里再抽出来拼 CDN。
  var re = /<a href="((?:https?:\/\/[^"]*)?\/videos\/(\d+)\/[^"]*)"\s+title="([^"]{1,300})"/g;
  var marks = [];
  var matched;
  while ((matched = re.exec(text)) !== null) {
    var fullPath = matched[1];
    var numericId = matched[2];
    if (/^https?:\/\//i.test(fullPath)) fullPath = fullPath.replace(/^https?:\/\/[^\/]+/i, '');
    marks.push({ at: matched.index, id: fullPath, num: numericId, title: matched[3] });
  }
  for (var i = 0; i < marks.length; i++) {
    var id = marks[i].id;
    if (seen[id]) continue;
    var end = i + 1 < marks.length ? marks[i + 1].at : Math.min(text.length, marks[i].at + 2500);
    var block = text.slice(marks[i].at, end);
    var coverMatch = /data-original="([^"]+)"/.exec(block) || /data-webp="([^"]+)"/.exec(block);
    var durMatch = /class="time"[^>]*>[\s\S]{0,160}?([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)/.exec(block);
    var viewsMatch = /class="views"[^>]*>[\s\S]{0,160}?<\/i>\s*([0-9.]+[KkMm万]?)/.exec(block);
    var isVip = /ico-private|line-private/.test(block);
    var title = clean(marks[i].title);
    if (!title) continue;
    seen[id] = true;
    var bits = [];
    if (isVip) bits.push('VIP');
    if (durMatch) bits.push(durMatch[1]);
    if (viewsMatch) bits.push(viewsMatch[1] + ' 播放');
    items.push({
      id: id,
      title: title,
      cover: coverMatch ? String(coverMatch[1]) : '',
      subtitle: bits.join(' · '),
    });
  }
  return items;
}

async function navCategories() {
  var cached = await readJson('nav.json');
  if (cached && Array.isArray(cached.list) && cached.list.length && Date.now() - Number(cached.at) < NAV_TTL_MS) {
    return cached.list;
  }
  var html = await fetchPage('/categories/');
  var list = [];
  var seen = {};
  var re = /href="(?:\/categories\/([a-z0-9\-]+)\/)"/g;
  var matched;
  while ((matched = re.exec(html)) !== null) {
    var slug = matched[1];
    if (!slug || seen[slug]) continue;
    // 名称取同一链接里的文字
    var tail = html.slice(matched.index, matched.index + 200);
    var nameMatch = />([^<>]{1,20})</.exec(tail);
    var name = clean(nameMatch ? nameMatch[1] : '');
    if (!name) continue;
    seen[slug] = true;
    list.push({ id: 'cat:' + slug, title: name });
  }
  if (list.length) await writeJson('nav.json', { at: Date.now(), list: list });
  return list;
}

function sectionPath(categoryId, page) {
  var n = Number(page) || 1;
  var path = '/latest-updates/';
  if (categoryId === 'popular') path = '/most-popular/';
  else if (categoryId === 'private') path = '/private/';
  else if (/^cat:/.test(categoryId)) path = '/categories/' + categoryId.slice(4) + '/';
  return n > 1 ? path + n + '/' : path;
}

// ---------------------------------------------------------------- 详情 + 播放

async function detailData(path) {
  var numeric = String(path).replace(/[^0-9]/g, '').slice(0, 9);
  var key = 'c-' + numeric + '.json';
  var cached = await readJson(key);
  if (cached && cached.at && Date.now() - Number(cached.at) < DETAIL_TTL_MS) return cached;

  var target = /^\/videos\//.test(path) ? path : '/videos/' + numeric + '/';
  var html = await fetchPage(target);
  var id = numeric;
  var h1 = clean((/<h1[^>]*class="title"[^>]*>([\s\S]{0,300}?)<\/h1>/.exec(html) || [])[1] || '');
  var ogImage = (html.match(/property="og:image"\s+content="([^"]+)"/) || [])[1] || '';
  var dir = Math.floor(Number(id) / 1000) * 1000;
  var shot = (html.match(/data-original="([^"]*videos_screenshots[^"]+)"/) || [])[1] || '';
  var cats = [];
  var cre = /href="\/categories\/([a-z0-9\-]+)\/"[^>]*>([^<]{1,20})</g;
  var cm;
  while ((cm = cre.exec(html)) !== null) {
    var name = clean(cm[2]);
    if (name && cats.indexOf(name) < 0) cats.push(name);
  }
  var isVip = /ico-private|line-private/.test(html);

  var data = {
    at: Date.now(),
    id: path,
    numeric: numeric,
    title: h1 || ('视频 ' + numeric),
    cover: ogImage || shot || base() + '/contents/videos_screenshots/' + dir + '/' + numeric + '/320x180/1.jpg',
    categories: cats,
    vip: isVip,
  };
  await writeJson(key, data);
  return data;
}

// 从「/videos/{id}/{slug}/」里取数字 id；也兼容直接给纯数字
function numericIdOf(value) {
  var text = String(value == null ? '' : value).trim();
  var m = /\/videos\/(\d+)\//.exec(text);
  if (m) return m[1];
  var m2 = /^(\d+)$/.exec(text);
  return m2 ? m2[1] : '';
}

// VIP 破解核心：路径可预测 + 签名不校验（去掉 ?k=…&t=… 照样 200）
function cdnCandidates(id) {
  var dir = Math.floor(Number(id) / 1000) * 1000;
  var out = [];
  for (var h = 0; h < CDN_HOSTS.length; h++) {
    var host = CDN_HOSTS[h].replace(/\/+$/, '');
    out.push(host + '/hls/contents/videos/' + dir + '/' + id + '/' + id + '.mp4/index.m3u8');
    out.push(host + '/hls/contents/videos/' + dir + '/' + id + '/' + id + '_720p.mp4/index.m3u8');
  }
  return out;
}

async function resolvePlayable(id) {
  var candidates = cdnCandidates(id);
  for (var i = 0; i < candidates.length; i++) {
    try {
      var reply = await LumeSource.http.get(candidates[i], { headers: { 'User-Agent': UA, Referer: base() + '/' } });
      if (reply && reply.status === 200) {
        var body = reply.body ? String(reply.body) : '';
        if (body.indexOf('#EXTM3U') === 0 || body.indexOf('#EXTM3U') > 0) return candidates[i];
      }
    } catch (error) {
      /* 换下一个候选 */
    }
  }
  return '';
}

var LumeSource = {
  id: 'resao_video',
  name: '91热爆',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://www.resao.com'],

  async categories() {
    var list = [];
    for (var i = 0; i < SECTIONS.length; i++) list.push({ id: SECTIONS[i].id, title: SECTIONS[i].title });
    try {
      var nav = await navCategories();
      for (var j = 0; j < nav.length; j++) list.push(nav[j]);
    } catch (error) {
      /* 分类抓不到时至少还有三个入口 */
    }
    return list;
  },

  async home() {
    var boards = [];
    var latest = parseCards(await fetchPage('/latest-updates/'));
    if (latest.length) boards.push({ title: '最新上传', moreUrl: 'latest', items: latest.slice(0, 12) });
    var popular = parseCards(await fetchPage('/most-popular/'));
    if (popular.length) boards.push({ title: '最多播放', moreUrl: 'popular', items: popular.slice(0, 12) });
    var vip = [];
    try {
      vip = parseCards(await fetchPage('/private/'));
    } catch (error) {
      vip = [];
    }
    if (vip.length) boards.push({ title: 'VIP专享（本源可直接播）', moreUrl: 'private', items: vip.slice(0, 12) });
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
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    if (filters.category) categoryId = 'cat:' + String(filters.category).trim();

    var path;
    if (keyword) {
      path = '/search/?q=' + encodeURIComponent(keyword);
    } else {
      path = sectionPath(categoryId || 'latest', page);
    }
    var html = await fetchPage(path);
    var items = parseCards(html);
    var hasMore;
    if (keyword) {
      hasMore = false; // 站内搜索是一页 20 条，没有可靠的分页标记
    } else {
      var next = sectionPath(categoryId || 'latest', page + 1);
      hasMore = html.indexOf('href="' + next + '"') >= 0 || items.length >= PAGE_SIZE;
    }
    return { items: items, hasMore: hasMore };
  },

  async detail(argument) {
    var raw = String((argument && argument.id) || '').trim();
    var id = numericIdOf(raw);
    if (!id) return null;
    var data = null;
    try {
      data = await detailData(raw || id);
    } catch (error) {
      return null;
    }
    if (!data || !data.title) return null;
    var bits = [];
    if (data.vip) bits.push('VIP');
    if (data.categories.length) bits.push(data.categories.slice(0, 3).join(' / '));
    bits.push('CDN 直连可播');
    return {
      id: id,
      title: data.title,
      cover: data.cover,
      subtitle: bits.join(' · '),
      description:
        '源站：' + base() + '/videos/' + id + '/\n' +
        'VIP 片也能播：播放地址由 id 现拼 CDN 路径（' + (cdnCandidates(id)[0] || '') + '），' +
        '去掉 CDN 的 ?k=&t= 签名校验后直接可用，不需要登录。',
    };
  },

  async chapters(argument) {
    var raw = String((argument && argument.id) || '').trim();
    if (!raw) return [];
    return [{ id: 'video:' + raw, title: '正片（HLS）' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = numericIdOf(args.id);
    if (!id) throw new Error('缺少视频 ID');
    var url = await resolvePlayable(id);
    if (!url) throw new Error('这条在 CDN 上没有可用的播放列表（可能已下架或换了 CDN 域）');
    return {
      kind: 'video',
      url: url,
      headers: { Referer: base() + '/', 'User-Agent': UA },
    };
  },
};
