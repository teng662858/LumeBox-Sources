// LumeSource: {"id":"reddxxx_video","name":"ReddXXX","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://reddxxx.com"]}
// LumeRuntime: javascript
//
// 站点：ReddXXX（https://reddxxx.com）—— Reddit 成人视频聚合站，全站被 Cloudflare Turnstile 保护：
//   首页 /rss/ /api/* 一律 403 + 挑战页（纯 HTTP 拿不到列表）。
//   但 **sitemap 没被挑战**，而且是完整的视频索引（2026-10-28 实测）：
//     /sitemap.xml                 → sitemapindex，含 4214 个 /sitemap-videos/{N} 分片（N=0 最新 → 4213 最旧）
//     /sitemap-videos/{N}          → 每个 <url> 带 <loc>、<lastmod>、<video:thumbnail_loc>、<video:title>
//   所以本源用 sitemap 当列表（一页 = 一个分片，约 33–44 条），封面走 cdn{4..7}.reddxxx.com（实测 200 开放）。
//
// 播放：详情页也是挑战页，且真实媒体是站内代理流；因此 content() 返回 **webplayer**（帖子页地址），
//   交给 App 的内嵌浏览器 —— 浏览器能过 Turnstile 并播放。
// 18+

var BASE_URL = 'https://reddxxx.com';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var CACHE_TTL_MS = 30 * 60 * 1000;
var MAX_SHARP = 4213;

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
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchText(path) {
  var reply = await LumeSource.http.get(base() + path, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/xml,text/xml,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: base() + '/',
    },
  });
  var status = reply ? reply.status : 0;
  if (status !== 200) throw new Error('页面打不开：HTTP ' + status + '（' + path + '）');
  var body = reply.body ? String(reply.body) : '';
  if (/Just a moment|正在进行安全验证/.test(body)) throw new Error('触发 Cloudflare 挑战：' + path);
  return body;
}

// sitemap 分片 → 条目
function parseShard(xml) {
  var text = String(xml || '');
  var items = [];
  var re = /<url>([\s\S]{0,1500}?)<\/url>/g;
  var matched;
  while ((matched = re.exec(text)) !== null) {
    var block = matched[1];
    var loc = (/<loc>([^<]+)<\/loc>/.exec(block) || [])[1] || '';
    if (!loc) continue;
    var thumb = (/<video:thumbnail_loc>([^<]+)</.exec(block) || [])[1] || '';
    var title = (/<video:title>([\s\S]{0,300}?)<\/video:title>/.exec(block) || [])[1] || '';
    var lastmod = (/<lastmod>([^<]+)</.exec(block) || [])[1] || '';
    var path = loc.replace(/^https?:\/\/[^\/]+/i, '');
    items.push({
      id: path,
      title: clean(title) || path.split('/').filter(Boolean).pop() || path,
      cover: thumb,
      subtitle: lastmod.slice(0, 10),
    });
  }
  return items;
}

async function shardItems(page) {
  var index = Math.max(0, (Number(page) || 1) - 1);
  if (index > MAX_SHARP) return [];
  var key = 'shard-' + index + '.json';
  var cached = await readJson(key);
  if (cached && Array.isArray(cached.items) && Date.now() - Number(cached.at) < CACHE_TTL_MS) return cached.items;
  var items = parseShard(await fetchText('/sitemap-videos/' + index));
  if (items.length) await writeJson(key, { at: Date.now(), items: items });
  return items;
}

var LumeSource = {
  id: 'reddxxx_video',
  name: 'ReddXXX',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://reddxxx.com'],

  async categories() {
    return [{ id: 'newest', title: '最新' }];
  },

  async home() {
    try {
      var items = await shardItems(1);
      if (!items.length) return [];
      return [{ title: '最新', moreUrl: 'newest', items: items.slice(0, 12) }];
    } catch (error) {
      return [];
    }
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var items = await shardItems(page);
    return { items: items, hasMore: page <= MAX_SHARP && items.length > 0 };
  },

  async detail(argument) {
    var path = String((argument && argument.id) || '').trim();
    if (!/^\/r\//.test(path)) return null;
    var slug = path.split('/').filter(Boolean).pop() || path;
    var cover = '';
    var items = [];
    try {
      items = await shardItems(1);
    } catch (error) {
      items = [];
    }
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === path) {
        cover = items[i].cover;
        break;
      }
    }
    return {
      id: path,
      title: slug.replace(/_/g, ' '),
      cover: cover,
      subtitle: '内嵌浏览器播放（站点有 Turnstile）',
      description: '源站：' + base() + path + '\n列表来自 sitemap（视频索引），播放交给 App 内嵌浏览器过 Turnstile。',
    };
  },

  async chapters(argument) {
    var path = String((argument && argument.id) || '').trim();
    if (!/^\/r\//.test(path)) return [];
    return [{ id: 'web:0', title: '网页播放' }];
  },

  async content(argument) {
    var args = argument || {};
    var path = String(args.id || '').trim();
    if (!/^\/r\//.test(path)) throw new Error('缺少帖子路径');
    return { kind: 'webplayer', url: base() + path };
  },
};
