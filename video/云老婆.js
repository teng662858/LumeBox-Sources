// LumeSource: {"id":"yunlaopo_video","name":"云老婆","version":"1.0.1","category":"video","mirrors":["https://yunlaopo.com"]}
//
// 站点：云老婆（https://yunlaopo.com，"全球华人成人短视频平台"，成人短视频站，全站 18+）
// 来历：`https://xinhuanews.dyhs.us/` 是**地址发布页**（列一堆随机跳板域）：
//   · `b9pgbf.jav.re` / `94s1xm.jav.re` / `cb79du.jav.re` → 现在回 **Cloudflare 530**（挂了）
//   · `zfb3vy.thaispa-amazing.com` → **302 到 https://yunlaopo.com/**（本源就是这个站）
//   · `60lkly.scenicembrace.com` → 另一个站「嗨碰」（暂未做）
//   我把发布页里 14 个跳板域逐个试过，能稳定落到内容站的就是 thaispa-amazing 这一族 → 云老婆。
//
// 结构（2026-10-25 实测，KVS 内核）：
//   · 首页/最新   GET /latest-updates/[page/]             24 条/页
//   · 分类索引    GET /categories/                        `<a class="item" href="…/categories/{slug}/" title="{名}">`
//   · 分类列表    GET /categories/{slug}/[page/]
//   · 搜索        GET /search/{关键词}/[page/]            36 条/页
//   · 卡片        <div class="item"><a href="https://yunlaopo.com/video/{id}/{hash}/" title="标题">
//                   <div class="img"><img class="thumb lazy-load" data-original="{封面}">
//                 封面是懒加载：只认 data-original（src 是 1px gif）。
//   · 详情        GET /video/{id}/{hash}/                标题 h1、`video_url` 在页内 flashvars 里
//   · 播放        flashvars: video_url / video_alt_url(720) / video_alt_url2(1080) / video_url_fhd
//                 → 实测 mp4 直链带 `?v-acctoken=…`（一次性签名），带 Referer 回 206 video/mp4
//                 **签名每次播放都要现取**，所以 content() 每次都重新拉详情页。
var BASE_URL = 'https://yunlaopo.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

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

function decode(text) {
  return String(text == null ? '' : text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headers(extra) {
  var result = {
    'User-Agent': UA,
    Accept: 'text/html,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: base() + '/'
  };
  for (var key in extra || {}) result[key] = extra[key];
  return result;
}

// 云老婆偶尔对 Dart HTTP 的 TLS 指纹回 403（浏览器/curl 正常）。遇到 403/503 时
// 改用宿主受限 WebKit 渲染，并把「本源走渲染」记 1 小时，后面的详情/播放页省掉 403 往返。
var RENDER_TTL_MS = 3600 * 1000;

async function renderMode() {
  try {
    var raw = await LumeSource.fs.readText('mode.json');
    if (!raw) return false;
    var saved = JSON.parse(raw);
    return !!(saved && saved.render && saved.at && Date.now() - saved.at < RENDER_TTL_MS);
  } catch (error) {
    return false;
  }
}

async function markRenderMode() {
  try {
    await LumeSource.fs.writeText('mode.json', JSON.stringify({ render: true, at: Date.now() }));
  } catch (error) {
    /* 缓存写不进去不影响本次 */
  }
}

async function renderPage(url) {
  var result = await LumeSource.web.render({
    url: url,
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Referer: base() + '/'
    },
    timeoutMs: 6000
  });
  var body = result && result.html ? String(result.html) : '';
  if (!body || /just a moment|checking your browser|attention required|__cf_chl|cf-chl-/i.test(body)) {
    throw new Error('NEED_WEBVIEW_VERIFY：云老婆需要网页视图过 Cloudflare 校验，请在源设置里点「网页视图」打开本站并完成验证后重试');
  }
  return body;
}

async function getText(target) {
  var url = /^https?:\/\//i.test(target) ? target : base() + (String(target).charAt(0) === '/' ? target : '/' + target);
  if (await renderMode()) return renderPage(url);
  var response = await LumeSource.http.get(url, { headers: headers() });
  var status = response ? response.status : 0;
  var body = String((response && response.body) || '');
  if (status === 403 || status === 503 || /just a moment|__cf_chl|challenge-platform/i.test(body)) {
    try {
      var rendered = await renderPage(url);
      await markRenderMode();
      return rendered;
    } catch (error) {
      throw new Error('NEED_WEBVIEW_VERIFY：云老婆被 Cloudflare 拦住（HTTP ' + status + '），请在源设置里走网页视图完成校验后重试');
    }
  }
  if (status !== 200) throw new Error('云老婆：请求失败 HTTP ' + status + ' ' + url);
  return body;
}

// 卡片：<div class="item"><a href="…/video/{id}/{hash}/" title="标题"> … data-original="封面"
function parseItems(html) {
  var items = [];
  var seen = {};
  var blocks = html.split('<div class="item');
  for (var i = 1; i < blocks.length; i++) {
    var block = blocks[i].slice(0, 1400);
    var hrefMatch = /href="(https?:\/\/[^"]*\/video\/\d+\/[^"]*\/)"/.exec(block) || /href="(\/video\/\d+\/[^"]*\/)"/.exec(block);
    if (!hrefMatch) continue;
    var id = hrefMatch[1];
    if (seen[id]) continue;
    var titleMatch = /title="([^"]{2,200})"/.exec(block);
    var title = decode(titleMatch ? titleMatch[1] : '');
    if (!title) continue;
    var coverMatch = /data-original="([^"]+)"/.exec(block) || /data-webp="([^"]+)"/.exec(block);
    var durMatch = /class="duration"[^>]*>([^<]{0,10})</.exec(block);
    seen[id] = true;
    items.push({
      id: id,
      title: title,
      cover: coverMatch ? absolute(coverMatch[1]) : '',
      subtitle: durMatch ? decode(durMatch[1]) : ''
    });
  }
  return items;
}

function hasNextPage(html) {
  return /class="[^"]*next[^"]*"|>\s*下一页\s*</.test(html) || /\/page\/\d+\//.test(html);
}

// flashvars 里的清晰度：video_url 是主档，alt/alt2/fhd 依次更高
function qualitiesOf(html) {
  var list = [];
  var keys = [
    { key: 'video_url_fhd', label: 'FHD' },
    { key: 'video_alt_url2', label: '1080p' },
    { key: 'video_alt_url', label: '720p' },
    { key: 'video_url', label: '480p' }
  ];
  for (var i = 0; i < keys.length; i++) {
    var pattern = new RegExp(keys[i].key + ":\\s*'([^']+)'");
    var matched = pattern.exec(html);
    if (!matched) continue;
    var url = decode(matched[1]);
    // 实测播放串形如 `…/xxx.mp4/?v-acctoken=…`，而且：
    //   · 带 `?v-acctoken=…` 直接请求会回 **404**；
    //   · 去掉 query、**保留末尾斜杠**（`…/xxx.mp4/`）才回 **206 video/mp4**。
    if (!/\.(?:mp4|m3u8)(?:[/?#]|$)/i.test(url)) continue;
    url = url.split('?')[0];
    if (url.charAt(url.length - 1) !== '/') url = url + '/';
    list.push({ title: keys[i].label, url: url });
  }
  return list;
}

var LumeSource = {
  id: 'yunlaopo_video',
  name: '云老婆',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://yunlaopo.com'],

  async categories() {
    var list = [{ id: 'latest', title: '最新视频' }];
    try {
      var html = await getText('/categories/');
      var pattern = /<a class="item" href="(https?:\/\/[^"]*\/categories\/([^"\/]+)\/)" title="([^"]*)"/g;
      var matched;
      while ((matched = pattern.exec(html)) !== null) {
        var slug = matched[2];
        var title = decode(matched[3]);
        if (!slug || !title) continue;
        var exists = false;
        for (var i = 0; i < list.length; i++) if (list[i].id === slug) exists = true;
        if (!exists) list.push({ id: slug, title: title });
      }
    } catch (error) {
      /* 分类页打不开就只留「最新视频」 */
    }
    return list;
  },

  async home() {
    var html = await getText('/latest-updates/');
    var items = parseItems(html);
    if (!items.length) throw new Error('云老婆：首页没认出条目（站点可能改版）');
    return [{ title: '最新视频', moreUrl: 'latest', items: items.slice(0, 24) }];
  },

  async list(argument) {
    var settings = argument || {};
    var pageNo = Number(settings.page || 1);
    if (!pageNo || pageNo < 1) pageNo = 1;
    var category = settings.categoryId ? String(settings.categoryId).trim() : '';
    var keyword = settings.keyword ? String(settings.keyword).trim() : '';
    var path;
    if (keyword) {
      path = '/search/' + encodeURIComponent(keyword) + '/' + (pageNo > 1 ? pageNo + '/' : '');
    } else if (category && category !== 'latest') {
      path = '/categories/' + encodeURIComponent(category) + '/' + (pageNo > 1 ? pageNo + '/' : '');
    } else {
      path = '/latest-updates/' + (pageNo > 1 ? pageNo + '/' : '');
    }
    var html = await getText(path);
    var items = parseItems(html);
    return { items: items, hasMore: items.length > 0 && hasNextPage(html) };
  },

  async detail(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return null;
    var html = await getText(id);
    var titleMatch = /<h1[^>]*>([\s\S]{0,240}?)<\/h1>/.exec(html) || /<title>([\s\S]*?)<\/title>/.exec(html);
    var title = decode(titleMatch ? titleMatch[1] : '');
    if (!title) return null;
    // 封面只认 flashvars 里的 preview_url（页面里第一个 data-original 往往是别的推荐位）
    var coverMatch = /preview_url:\s*'([^']+)'/.exec(html) || /(?:data-original|poster)="([^"]+)"/.exec(html);
    var descMatch = /<meta[^>]+name="description"[^>]+content="([^"]*)"/.exec(html);
    var qualities = qualitiesOf(html);
    return {
      id: absolute(id),
      title: title,
      cover: coverMatch ? absolute(coverMatch[1]) : '',
      subtitle: qualities.length ? qualities.length + ' 档清晰度' : '视频',
      description: decode(descMatch ? descMatch[1] : '')
    };
  },

  async chapters(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return [];
    var html = await getText(id);
    var qualities = qualitiesOf(html);
    if (qualities.length) {
      var chapters = [];
      for (var i = 0; i < qualities.length; i++) chapters.push({ id: qualities[i].url, title: qualities[i].title });
      return chapters;
    }
    return [{ id: absolute(id), title: '正片' }];
  },

  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    var id = argument && argument.id ? String(argument.id).trim() : '';
    if (chapterId && /\.(mp4|m3u8)(\?|#|$)/i.test(chapterId)) {
      // 章节 id 已经是播放串；但签名可能过期，优先重新取一次详情页
      try {
        var fresh = await getText(id || chapterId);
        var list = qualitiesOf(fresh);
        if (list.length) {
          var hit = '';
          for (var i = 0; i < list.length; i++) {
            if (list[i].url.split('?')[0] === chapterId.split('?')[0]) hit = list[i].url;
          }
          return {
            kind: 'video',
            url: hit || list[0].url,
            headers: { Referer: absolute(id || '/'), 'User-Agent': UA, Accept: '*/*' }
          };
        }
      } catch (error) {
        /* 详情页取不到就用传进来的地址 */
      }
      return { kind: 'video', url: chapterId, headers: { Referer: base() + '/', 'User-Agent': UA, Accept: '*/*' } };
    }
    if (!id) throw new Error('云老婆：缺少视频地址');
    var html = await getText(id);
    var qualities = qualitiesOf(html);
    if (qualities.length) {
      return {
        kind: 'video',
        url: qualities[0].url,
        headers: { Referer: absolute(id), 'User-Agent': UA, Accept: '*/*' }
      };
    }
    return { kind: 'webplayer', pageUrl: absolute(id), headers: headers() };
  }
};
