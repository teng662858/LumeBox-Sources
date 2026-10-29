// LumeSource: {"id":"xxxfollow_video","name":"XXXfollow","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://www.xxxfollow.com"],"network":"direct","icon":"https://www.xxxfollow.com/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"XXX follow（xxxfollow.com，原 Xfollow）：TikTok/推特风成人短片。列表 /?page=<n>、/videos?page=<n>、标签 /tag/<slug>?page=<n>，搜索 /search/<词>?page=<n>。页面 HTML 里没有卡片，数据在 window.__PRELOAD_STATE__ 的 JSON 里（media[].url 是 mp4 直链）。详情用 /starlike/<postid>（会跳到 /<用户名>/<id>-<slug>）。直连可用。"}]}
// LumeRuntime: javascript
//
// 站点：XXX follow（https://www.xxxfollow.com，Laravel + React SSR）
//
// 结构（2026-10-30 实测）：
//   列表   /?page=<n>（首页）、/videos?page=<n>、/tag/<slug>?page=<n>
//   搜索   /search/<词>?page=<n>
//   详情   /starlike/<post_id>（301 到 /<用户名>/<id>-<slug>）
//   播放   没有 player：SSR 状态里 media[].url 就是 mp4 直链（另有 fhd_url / sd_url）
//   数据   window.__PRELOAD_STATE__ = {json}，卡片不在 HTML 里，必须解析这个 JSON
//
// 直连可访问。

var DEFAULT_DOMAIN = 'https://www.xxxfollow.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_TAGS = [
  ['amateur', 'Amateur'], ['latina', 'Latina'], ['anal', 'Anal'], ['blowjob', 'Blowjob'],
  ['camgirl', 'Camgirl'], ['bigass', 'Big ass'], ['submissive', 'Submissive'], ['cum', 'Cum']
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_DOMAIN).replace(/\/+$/, '');
}

function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
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

function absolute(url) {
  var value = entity(String(url == null ? '' : url)).trim();
  if (!value || /^data:/i.test(value)) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.charAt(0) === '/') return base() + value;
  return base() + '/' + value;
}

async function get(path) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var reply = await LumeSource.http.get(url, { headers: headers() });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (!status) throw new Error('XXXfollow：连不上（' + url + '）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('XXXfollow：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

// 页面把数据放在 window.__PRELOAD_STATE__ = {...}；解析失败就返回 null
function preloadState(html) {
  var m = /__PRELOAD_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/.exec(String(html || ''));
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (error) {
    return null;
  }
}

function mediaOf(node) {
  if (!node || typeof node !== 'object') return null;
  var media = node.media;
  if (!Array.isArray(media) || !media.length) return null;
  var best = null;
  for (var i = 0; i < media.length; i++) {
    var item = media[i];
    if (!item || !item.url) continue;
    if (!/\.(mp4|m3u8)(\?|$)/i.test(String(item.url))) continue;
    if (!best || (item.fhd_url && !best.fhd_url)) best = item;
  }
  return best;
}

// 递归找出所有「带 media 的 post 对象」
function collectPosts(root) {
  var out = [];
  var seen = {};
  var stack = [root];
  var guard = 0;
  while (stack.length && guard < 20000) {
    guard++;
    var node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    var media = mediaOf(node);
    if (media) {
      var id = String(node.id || node.post_id || '');
      if (!id) {
        id = String(media.id || '');
      }
      if (id && !seen[id]) {
        seen[id] = 1;
        out.push({
          id: id,
          title: clean(node.text || node.title || node.slug || '') || ('视频 ' + id),
          cover: absolute(media.start_url || media.thumb_url || media.blur_url || '') || null,
          subtitle: clean(node.slug || '')
        });
      }
    }
    for (var key in node) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
      var child = node[key];
      if (child && typeof child === 'object') stack.push(child);
    }
  }
  return out;
}

var LumeSource = {
  id: 'xxxfollow_video',
  name: 'XXXfollow',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://www.xxxfollow.com'],

  async home() {
    var sections = [];
    var plan = [['/?page=1', '最新'], ['/videos?page=1', '推荐']];
    for (var i = 0; i < plan.length; i++) {
      try {
        var state = preloadState(await get(plan[i][0]));
        var items = state ? collectPosts(state).slice(0, 24) : [];
        if (items.length) sections.push({ title: plan[i][1], items: items });
      } catch (error) {
        console.warn('[xxxfollow] 首页抓取失败 ' + plan[i][1] + '：' + error);
      }
    }
    if (!sections.length) throw new Error('XXXfollow：首页没有条目（站点可能改版）');
    return sections;
  },

  async categories() {
    var out = [{ id: 'latest', title: '最新' }, { id: 'videos', title: '推荐' }];
    for (var i = 0; i < FALLBACK_TAGS.length; i++) out.push({ id: 'tag:' + FALLBACK_TAGS[i][0], title: FALLBACK_TAGS[i][1] });
    return out;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = clean(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();

    var path;
    if (keyword) {
      path = '/search/' + encodeURIComponent(keyword) + '?page=' + page;
    } else if (categoryId.indexOf('tag:') === 0) {
      path = '/tag/' + encodeURIComponent(categoryId.slice(4)) + '?page=' + page;
    } else if (categoryId === 'videos') {
      path = '/videos?page=' + page;
    } else {
      path = '/?page=' + page;
    }
    var state = preloadState(await get(path));
    var items = state ? collectPosts(state) : [];
    if (!items.length) console.warn('[xxxfollow] 列表没解析出条目：' + path);
    return { items: items, hasMore: items.length >= 12 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = await get('/starlike/' + id);
    var title = clean((/<title[^>]*>([\s\S]*?)<\/title>/.exec(html) || [])[1]).replace(/\s*-\s*XXX follow.*$/i, '');
    var state = preloadState(html);
    var posts = state ? collectPosts(state) : [];
    var found = null;
    for (var i = 0; i < posts.length; i++) if (posts[i].id === id) found = posts[i];
    if (!found && posts.length) found = posts[0];
    var cover = found && found.cover ? found.cover : '';
    return {
      id: id,
      title: (found && found.title) || title || ('视频 ' + id),
      cover: cover || null,
      subtitle: (found && found.subtitle) || '',
      description: '源站：' + base() + '/starlike/' + id
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'play', title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || args.itemId || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('XXXfollow：缺少 post id');
    var pageUrl = base() + '/starlike/' + id;
    var state = preloadState(await get('/starlike/' + id));
    var posts = state ? collectPosts(state) : [];
    var media = null;
    for (var i = 0; i < posts.length; i++) {
      if (posts[i].id === id) {
        // collectPosts 只留了展示字段，这里重新在状态树里找原始 media
        break;
      }
    }
    // 直接在状态树里找属于这个 post 的 media 对象
    var stack = state ? [state] : [];
    var guard = 0;
    while (stack.length && guard < 20000 && !media) {
      guard++;
      var node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      var m = mediaOf(node);
      if (m && String(node.id || '') === id) media = m;
      for (var key in node) {
        if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
        var child = node[key];
        if (child && typeof child === 'object') stack.push(child);
      }
    }
    if (!media) {
      var first = null;
      var stack2 = state ? [state] : [];
      while (stack2.length && !first) {
        var node2 = stack2.pop();
        if (!node2 || typeof node2 !== 'object') continue;
        var m2 = mediaOf(node2);
        if (m2) first = m2;
        for (var key2 in node2) {
          if (!Object.prototype.hasOwnProperty.call(node2, key2)) continue;
          var child2 = node2[key2];
          if (child2 && typeof child2 === 'object') stack2.push(child2);
        }
      }
      media = first;
    }
    if (!media) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    var qualities = [];
    if (media.fhd_url) qualities.push({ label: 'FHD', url: entity(media.fhd_url) });
    if (media.sd_url) qualities.push({ label: 'SD', url: entity(media.sd_url) });
    var url = entity(media.url).replace(/\\\//g, '/');
    return {
      kind: 'video',
      url: url,
      headers: { 'User-Agent': UA, Referer: pageUrl, Range: 'bytes=0-1023' },
      qualities: qualities.length ? qualities : undefined
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
