// LumeSource: {"id":"hsex_video","name":"好色TV","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://hsex.men"]}
// LumeRuntime: javascript
//
// 站点：好色™ Tv（https://hsex.men）—— 经典 PHP tube 模板（list-N.htm / video-{id}.htm）。
//
// 目录（2026-10-28 实测，列表页可直连，无需挑战）：
//   最新   list-{N}.htm          （48 条/页）
//   周榜   top7_list-{N}.htm
//   月榜   top_list-{N}.htm
//   5分钟+ 5min_list-{N}.htm
//   10分钟+ long_list-{N}.htm
//   搜索   search.htm?search=关键词&sort=new   （40 条）
//   卡片   <a href="video-{id}.htm"> + <div class="image" style="background-image:url('https://i.hdcdn.store/thumb/{id}.webp')">
//          + <var class="duration">06:29</var> + <h5><a …>标题</a></h5>
//
// 播放（关键限制，如实写）：
//   详情页 video-{id}.htm 对纯 HTTP 客户端一律返回 Cloudflare 挑战页（403 + "Just a moment…"），
//   而真实播放地址是 CDN 的**逐条签名**路径：
//     https://cdn.hdcdn.store/{过期时间戳}/{随机令牌}/hls/{id}/index.m3u8
//   令牌不可推导（实测 /hls/{id}/index.m3u8 → 403）。所以本源这样处理：
//     · 列表/封面/时长走 HTTP（都能取到，封面 CDN i.hdcdn.store 也开放）；
//     · content() 返回 **webplayer**（详情页地址），交给 App 的内嵌浏览器 —— 浏览器能过 CF、
//       能拿到签名地址并播放。这就是「打开浏览器」的那一步。
// 18+

var BASE_URL = 'https://hsex.men';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PAGE_SIZE = 48;
var CACHE_TTL_MS = 15 * 60 * 1000;

var SECTIONS = [
  { id: 'new', title: '最新', path: 'list-' },
  { id: 'week', title: '周榜', path: 'top7_list-' },
  { id: 'month', title: '月榜', path: 'top_list-' },
  { id: 'min5', title: '5分钟+', path: '5min_list-' },
  { id: 'long', title: '10分钟+', path: 'long_list-' },
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
  var body = reply.body ? String(reply.body) : '';
  if (/Just a moment|正在进行安全验证/.test(body)) {
    throw new Error('该页触发了 Cloudflare 挑战（列表页一般不受影响）：' + target);
  }
  return body;
}

function parseCards(html) {
  var text = String(html || '');
  var items = [];
  var seen = {};
  var blocks = text.split('class="thumbnail"');
  for (var i = 1; i < blocks.length; i++) {
    var block = blocks[i];
    var idMatch = /video-(\d+)\.htm/.exec(block);
    if (!idMatch) continue;
    var id = idMatch[1];
    if (seen[id]) continue;
    var titleMatch = /<h5[^>]*>[\s\S]{0,120}?>([\s\S]{0,160}?)<\/a>/.exec(block)
      || /title\s*=\s*"([^"]{1,200})"/.exec(block);
    var coverMatch = /background-image:\s*url\('([^']+)'\)/.exec(block);
    var durMatch = /class="duration">\s*([0-9:]{3,8})\s*</.exec(block);
    if (!titleMatch) continue;
    seen[id] = true;
    items.push({
      id: id,
      title: clean(titleMatch[1]),
      cover: coverMatch ? String(coverMatch[1]) : base() + '/static/img/logo.png',
      subtitle: durMatch ? durMatch[1] : '',
    });
  }
  return items;
}

function sectionPath(categoryId, page) {
  var section = SECTIONS[0];
  for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === categoryId) section = SECTIONS[i];
  var n = Number(page) || 1;
  return section.path + n + '.htm';
}

var LumeSource = {
  id: 'hsex_video',
  name: '好色TV',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://hsex.men'],

  async categories() {
    var list = [];
    for (var i = 0; i < SECTIONS.length; i++) list.push({ id: SECTIONS[i].id, title: SECTIONS[i].title });
    return list;
  },

  async home() {
    var boards = [];
    for (var i = 0; i < 3; i++) {
      try {
        var html = await fetchHtml(sectionPath(SECTIONS[i].id, 1));
        var items = parseCards(html).slice(0, 12);
        if (items.length) boards.push({ title: SECTIONS[i].title, moreUrl: SECTIONS[i].id, items: items });
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
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    if (filters.category) categoryId = String(filters.category).trim();

    var path;
    if (keyword) path = 'search.htm?search=' + encodeURIComponent(keyword) + '&sort=new';
    else path = sectionPath(categoryId, page);

    var html = await fetchHtml(path);
    var items = parseCards(html);
    var key = 'l-' + path.replace(/[^a-z0-9]/gi, '_').slice(0, 40) + '.json';
    if (items.length) await writeJson(key, { at: Date.now(), items: items });
    var hasMore = !keyword && (items.length >= PAGE_SIZE || html.indexOf(sectionPath(categoryId, page + 1)) >= 0);
    return { items: items, hasMore: hasMore };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var row = await findItem(id);
    if (!row) return null;
    return {
      id: id,
      title: row.title,
      cover: row.cover,
      subtitle: (row.subtitle ? row.subtitle + ' · ' : '') + '内嵌浏览器播放',
      description: '源站：' + base() + '/video-' + id + '.htm\n详情页有 Cloudflare 挑战，播放交给 App 内嵌浏览器（能过 CF 并拿到签名 CDN 地址）。',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'web:' + id, title: '网页播放' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少视频 ID');
    return { kind: 'webplayer', url: base() + '/video-' + id + '.htm' };
  },
};

async function findItem(id) {
  var keys = [];
  for (var i = 0; i < SECTIONS.length; i++) {
    keys.push('l-' + sectionPath(SECTIONS[i].id, 1).replace(/[^a-z0-9]/gi, '_').slice(0, 40) + '.json');
  }
  for (var k = 0; k < keys.length; k++) {
    var cached = await readJson(keys[k]);
    if (!cached || !Array.isArray(cached.items)) continue;
    for (var j = 0; j < cached.items.length; j++) {
      if (String(cached.items[j].id) === String(id)) return cached.items[j];
    }
  }
  return null;
}
