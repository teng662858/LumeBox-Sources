// LumeSource: {"id":"theavporn_video","name":"TheAVPorn","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://theavporn.com"],"network":"proxy"}
// LumeRuntime: javascript
//
// 站点：TheAVPorn（https://theavporn.com）—— KVS（Kernel Video Sharing）站。
//   列表：/latest-updates/{N}/、/top-rated/、/most-popular/（24 条/页；注意 /new/2/ 是 404，
//         翻页只能走 /latest-updates/{N}/，实测第 2 页 200 + 24 条）
//   卡片：<div class="item thumb "> → <a class="th" href="https://theavporn.com/video/{id}/{slug}/"
//         title="标题" data-rt="…"> + <img data-original="…/contents/videos_screenshots/{dir}/{id}/385x234/1.jpg">
//         + <div class="sticky_time">4:19</div>
//   详情：/video/{id}/{slug}/ → 游客会看到 "no-player（您的观看次数已受限,请登录后继续）"，
//         但这不影响我们取流（见下）。
//
// 取流（2026-10-28 用真实登录态抓包确认，属 resao 同款「CDN 不校验签名」）：
//   浏览器里播放时请求的是
//     https://bytt.jb-aiwei.cc/contents/videos/{dir}/{id}/index.m3u8?ttl=1729503406&dsc=b9cb2233…
//   实测把整个查询串去掉仍然 200 + #EXTM3U（分片 0001.ts 也是不带签名 200），
//   且另一个视频 id 78259 用同样规则也能取到清单 → **路径可推导、签名是装饰**：
//     dir = floor(id / 1000) * 1000
//   所以 content() 只用 id 拼 CDN，不需要登录、不需要页面里的 token。
//
// 18+

var BASE_URL = 'https://theavporn.com';
var CDN_HOSTS = ['https://bytt.jb-aiwei.cc'];
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PAGE_SIZE = 24;
var DETAIL_TTL_MS = 20 * 60 * 1000;

var SECTIONS = [
  // 第一页在 /new/，第 2 页起走 /latest-updates/{N}/（/new/2/ 与 /latest-updates/ 都是 404，实测）
  { id: 'latest', title: '最新', path: '/latest-updates/', first: '/new/' },
  { id: 'top', title: '最高评分', path: '/top-rated/', first: '/top-rated/' },
  { id: 'popular', title: '最热', path: '/most-popular/', first: '/most-popular/' },
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

async function fetchHtml(path) {
  var target = String(path || '');
  if (!/^https?:\/\//i.test(target) && target.charAt(0) !== '/') target = '/' + target;
  var reply = await LumeSource.http.get(base() + target, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: base() + '/',
    },
  });
  var status = reply ? reply.status : 0;
  if (status !== 200) throw new Error('页面打不开：HTTP ' + status + '（' + target + '）');
  return reply.body ? String(reply.body) : '';
}

function parseCards(html) {
  var text = String(html || '');
  var items = [];
  var seen = {};
  var blocks = text.split('class="item thumb');
  for (var i = 1; i < blocks.length; i++) {
    var block = blocks[i];
    var hrefMatch = /href="(?:https?:\/\/[^"]*)?\/video\/(\d+)\//.exec(block);
    if (!hrefMatch) continue;
    var id = hrefMatch[1];
    if (seen[id]) continue;
    var titleMatch = /title="([^"]{1,300})"/.exec(block);
    var coverMatch = /data-original="([^"]+)"/.exec(block) || /data-webp="([^"]+)"/.exec(block);
    var durMatch = /class="sticky_time">([^<]{1,12})</.exec(block);
    if (!titleMatch) continue;
    seen[id] = true;
    items.push({
      id: id,
      title: clean(titleMatch[1]),
      cover: coverMatch ? String(coverMatch[1]) : shotCover(id),
      subtitle: durMatch ? clean(durMatch[1]) : '',
    });
  }
  return items;
}

function shotCover(id) {
  var dir = Math.floor(Number(id) / 1000) * 1000;
  return base() + '/contents/videos_screenshots/' + dir + '/' + id + '/385x234/1.jpg';
}

function listPath(categoryId, page) {
  var section = SECTIONS[0];
  for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === categoryId) section = SECTIONS[i];
  var n = Number(page) || 1;
  if (n <= 1) return section.first || section.path;
  return section.path + n + '/';
}

function cdnCandidates(id) {
  var dir = Math.floor(Number(id) / 1000) * 1000;
  var out = [];
  for (var i = 0; i < CDN_HOSTS.length; i++) {
    var host = CDN_HOSTS[i].replace(/\/+$/, '');
    out.push(host + '/contents/videos/' + dir + '/' + id + '/index.m3u8');
  }
  return out;
}

async function pickPlayable(id) {
  var candidates = cdnCandidates(id);
  for (var i = 0; i < candidates.length; i++) {
    try {
      var reply = await LumeSource.http.get(candidates[i], { headers: { 'User-Agent': UA, Referer: base() + '/' } });
      if (reply && reply.status === 200) {
        var body = reply.body ? String(reply.body) : '';
        if (body.indexOf('#EXTM3U') >= 0) return candidates[i];
      }
    } catch (error) {
      /* 换下一个候选 */
    }
  }
  return '';
}

async function detailData(id) {
  var key = 'c-' + id + '.json';
  var cached = await readJson(key);
  if (cached && cached.at && Date.now() - Number(cached.at) < DETAIL_TTL_MS) return cached;

  // 详情页对游客是 no-player，但标题/封面仍可读；取不到就退回列表缓存
  var data = { at: Date.now(), id: String(id), title: '', cover: shotCover(id) };
  try {
    var html = await fetchHtml('/video/' + id + '/');
    var titleTag = clean((/<title>([^<]*)<\/title>/.exec(html) || [])[1] || '');
    var h1 = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1] || '');
    var pic = (html.match(/property="og:image"\s+content="([^"]+)"/) || [])[1] || '';
    data.title = h1 || titleTag;
    if (pic) data.cover = pic;
  } catch (error) {
    /* 页面失败时用列表缓存兜底 */
  }
  if (!data.title) {
    var row = await findItem(id);
    if (row) {
      data.title = row.title;
      data.cover = row.cover || data.cover;
    }
  }
  if (data.title) await writeJson(key, data);
  return data;
}

async function findItem(id) {
  for (var i = 0; i < SECTIONS.length; i++) {
    var path = listPath(SECTIONS[i].id, 1);
    var key = 'l-' + path.replace(/[^a-z0-9]/gi, '_') + '.json';
    var cached = await readJson(key);
    if (!cached || !Array.isArray(cached.items)) continue;
    for (var j = 0; j < cached.items.length; j++) {
      if (String(cached.items[j].id) === String(id)) return cached.items[j];
    }
  }
  return null;
}

var LumeSource = {
  id: 'theavporn_video',
  name: 'TheAVPorn',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://theavporn.com'],

  async categories() {
    var list = [];
    for (var i = 0; i < SECTIONS.length; i++) list.push({ id: SECTIONS[i].id, title: SECTIONS[i].title });
    return list;
  },

  async home() {
    var boards = [];
    for (var i = 0; i < SECTIONS.length; i++) {
      try {
        var path = listPath(SECTIONS[i].id, 1);
        var html = await fetchHtml(path);
        var items = parseCards(html);
        if (!items.length) continue;
        await writeJson('l-' + path.replace(/[^a-z0-9]/gi, '_') + '.json', { at: Date.now(), items: items });
        boards.push({ title: SECTIONS[i].title, moreUrl: SECTIONS[i].id, items: items.slice(0, 12) });
      } catch (error) {
        /* 单个栏目失败不影响首页 */
      }
    }
    return boards;
  },

  async filters() {
    var options = [];
    for (var i = 0; i < SECTIONS.length; i++) options.push({ id: SECTIONS[i].id, title: SECTIONS[i].title });
    return { groups: [{ id: 'category', title: '栏目', options: options }] };
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    if (filters.category) categoryId = String(filters.category).trim();
    var path = listPath(categoryId || 'latest', page);
    var html = await fetchHtml(path);
    var items = parseCards(html);
    if (items.length) await writeJson('l-' + path.replace(/[^a-z0-9]/gi, '_') + '.json', { at: Date.now(), items: items });
    return { items: items, hasMore: items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var data = await detailData(id);
    if (!data || !data.title) return null;
    return {
      id: id,
      title: data.title,
      cover: data.cover,
      subtitle: 'CDN 直连（免登录）',
      description: '源站：' + base() + '/video/' + id + '/\n播放地址由 id 推导：' + (cdnCandidates(id)[0] || ''),
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'video:' + id, title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少视频 ID');
    var url = await pickPlayable(id);
    if (!url) throw new Error('这条在 CDN 上没有可用的播放列表（可能已下架或换了分发域）');
    return { kind: 'video', url: url, headers: { Referer: base() + '/', 'User-Agent': UA } };
  },
};
