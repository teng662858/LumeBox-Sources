// LumeSource: {"id":"flixflop","name":"飞流视频","version":"1.0.1","category":"video","mirrors":["https://www.flixflop.com"],"icon":"https://www.flixflop.com/favicon.png"}
//
// 站点：飞流视频（https://www.flixflop.com）
// 技术栈：Next.js（App Router）。页面里没有「播放器脚本」，但**服务端把播放串直出在
// RSC flight 数据里**，形如：
//   {"source_id":"2048…","name":"大陆","url":"第01集$https://…/index.m3u8#第02集$https://…"}
// 这条 url 与苹果 CMS 的 vod_play_url 是同一种写法（# 分集、$ 分集名与地址），
// 所以章节 id 直接就是 m3u8 直链，点开即播、不再发请求。
// 路由：/explore/{分类ID}?page=N（分类列表）、/streams/{视频ID}/detail（详情）、
//       /streams/{视频ID}/sources/{线路ID}/{集名}（单集页）。
//
// ⚠️ 已知限制：该站的播放 CDN（v.lzcdn28.com 等）对境外/本机出口返回 404，
//    「能列出、能点开、能出地址，但地址本身在本网络不可播」——这是源站的地域限制，
//    不是解析问题。换到能访问该 CDN 的网络（或源站自己的代理）即可播。
//    站内搜索是 Next.js Server Action（POST），没有可脚本化的 GET 路由，故不支持搜索。
var BASE_URL = 'https://www.flixflop.com';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

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

async function fetchHtml(path) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var response = await LumeSource.http.get(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Referer: base() + '/'
    }
  });
  var status = response ? response.status : 0;
  if (status === 403 || status === 503) {
    throw new Error('NEED_WEBVIEW_VERIFY：飞流视频触发了 Cloudflare 人机校验（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('飞流视频页面打不开：HTTP ' + status + ' ' + path);
  return response.body || '';
}

function clean(text) {
  return String(text == null ? '' : text)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// flight 数据里的字符串是 JSON 转义过的，借用 JSON.parse 还原（沙箱里没有 unescape）。
function unescapeJson(raw) {
  try {
    return JSON.parse('"' + String(raw).replace(/"/g, '\\"') + '"');
  } catch (error) {
    return String(raw).replace(/\\\//g, '/').replace(/\\u([0-9a-fA-F]{4})/g, function (_m, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    });
  }
}

function parseItems(html) {
  var items = [];
  var seen = {};
  var pattern = /<a[^>]*class="xeerELw"[^>]*href="\/streams\/(\d+)\/detail"[^>]*>\s*<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"/g;
  var matched;
  while ((matched = pattern.exec(html)) !== null) {
    var id = matched[1];
    if (seen[id]) continue;
    var title = clean(matched[2]);
    if (!title) continue;
    seen[id] = true;
    // 紧跟其后的「备注 / 年份」角标（已完结、2026…）拿来做副标题。
    var tail = html.slice(matched.index, matched.index + 1600);
    var remark = /class="xLSs05H"[^>]*>([\s\S]{0,30}?)</.exec(tail);
    var year = /class="xH2UQqh"[^>]*>([\s\S]{0,10}?)</.exec(tail);
    var subtitleParts = [];
    if (year) subtitleParts.push(clean(year[1]));
    if (remark) subtitleParts.push(clean(remark[1]));
    items.push({
      id: base() + '/streams/' + id + '/detail',
      title: title,
      cover: absolute(matched[3]),
      subtitle: subtitleParts.join(' · ')
    });
  }
  return items;
}

// 播放串：第01集$m3u8#第02集$m3u8
function chaptersOf(html) {
  var chapters = [];
  var seen = {};
  var pattern = /"source_id":"(\d+)","name":"((?:[^"\\]|\\.)*)","url":"((?:[^"\\]|\\.)*)"/g;
  var matched;
  var routes = [];
  while ((matched = pattern.exec(html)) !== null) {
    routes.push({ id: matched[1], name: unescapeJson(matched[2]), url: unescapeJson(matched[3]) });
    if (routes.length >= 12) break;
  }
  for (var index = 0; index < routes.length; index++) {
    var route = routes[index];
    var episodes = String(route.url || '').split('#');
    for (var e = 0; e < episodes.length; e++) {
      var entry = episodes[e];
      if (!entry) continue;
      var at = entry.indexOf('$');
      var name = at >= 0 ? entry.slice(0, at) : '第' + (e + 1) + '集';
      var link = (at >= 0 ? entry.slice(at + 1) : entry).trim();
      if (!/^https?:\/\//i.test(link) || seen[link]) continue;
      seen[link] = true;
      chapters.push({
        id: link,
        title: (routes.length > 1 ? route.name + ' · ' : '') + (name || '第' + (e + 1) + '集')
      });
    }
  }
  return chapters;
}

var LumeSource = {
  id: 'flixflop',
  name: '飞流视频',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://www.flixflop.com'],

  async categories() {
    var cached = await LumeSource.fs.readText('classes.json');
    if (cached) {
      try {
        var hit = JSON.parse(cached);
        if (hit && hit.length) return hit;
      } catch (error) {
        /* 缓存坏了就重抓 */
      }
    }
    var html = await fetchHtml('/');
    var list = [];
    var seen = {};
    var pattern = /href="\/explore\/(\d+)\?page=1"[^>]*>([^<]{1,20})</g;
    var matched;
    while ((matched = pattern.exec(html)) !== null) {
      var id = matched[1];
      var title = clean(matched[2]);
      if (!title || seen[id]) continue;
      seen[id] = true;
      list.push({ id: id, title: title });
    }
    if (list.length) await LumeSource.fs.writeText('classes.json', JSON.stringify(list));
    return list;
  },

  async home() {
    var html = await fetchHtml('/');
    var items = parseItems(html);
    return items.length ? [{ title: '最新推荐', items: items.slice(0, 18) }] : [];
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!page || page < 1) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';
    if (keyword) {
      // 站内搜索是 Server Action（POST），脚本化不了；如实返回空而不是乱猜地址。
      return { items: [], hasMore: false };
    }
    // The homepage is the actual unfiltered catalogue. /explore/ without a
    // category is a 404; do not make all default-list thumbnails disappear.
    if (!category) {
      if (page > 1) return { items: [], hasMore: false };
      return { items: parseItems(await fetchHtml('/')), hasMore: false };
    }
    var html = await fetchHtml('/explore/' + encodeURIComponent(category) + '?page=' + page);
    var next = new RegExp('page=' + (page + 1) + '(?!\\d)');
    return { items: parseItems(html), hasMore: next.test(html) };
  },

  async detail(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return null;
    var html = await fetchHtml(id);
    var titleMatch = /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/.exec(html) ||
      /<title[^>]*>([\s\S]{0,140}?)<\/title>/.exec(html);
    var title = clean(titleMatch ? titleMatch[1] : '');
    if (!title) return null;
    title = title.split(/\s*[-–—]\s*/)[0].trim();
    var coverMatch = /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/.exec(html) ||
      /<img[^>]+src="(https?:\/\/[^"]*dytt[^"]*\.(?:jpg|jpeg|png|webp))"/.exec(html);
    var descMatch = /<meta[^>]+property="og:description"[^>]+content="([^"]*)"/.exec(html) ||
      /<meta[^>]+name="description"[^>]+content="([^"]*)"/.exec(html);
    return {
      id: id,
      title: title,
      cover: absolute(coverMatch ? coverMatch[1] : ''),
      description: clean(descMatch ? descMatch[1] : '')
    };
  },

  async chapters(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return [];
    var html = await fetchHtml(id);
    var chapters = chaptersOf(html);
    if (!chapters.length) {
      // 兜底：用页面上的单集链接（点开时再去那一页找地址）。
      var pattern = /<a[^>]*title="([^"]{1,20})"[^>]*href="(\/streams\/\d+\/sources\/[^"]+)"/g;
      var matched;
      var seen = {};
      while ((matched = pattern.exec(html)) !== null) {
        var link = matched[2];
        if (seen[link]) continue;
        seen[link] = true;
        chapters.push({ id: absolute(link), title: clean(matched[1]) });
        if (chapters.length >= 240) break;
      }
    }
    return chapters;
  },

  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    var target = chapterId || (argument && argument.id ? String(argument.id) : '');
    if (!target) throw new Error('缺少播放地址');
    if (/\.(m3u8|mp4|flv|mpd)(\?|#|$)/i.test(target)) {
      return { kind: 'video', url: absolute(target), headers: { Referer: base() + '/', 'User-Agent': UA } };
    }
    var html = await fetchHtml(target);
    var chapters = chaptersOf(html);
    if (chapters.length) {
      return { kind: 'video', url: chapters[0].id, headers: { Referer: target, 'User-Agent': UA } };
    }
    return { kind: 'webplayer', pageUrl: target, headers: { Referer: base() + '/', 'User-Agent': UA } };
  }
};
