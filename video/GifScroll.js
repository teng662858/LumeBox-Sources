// LumeSource: {"id":"gifscroll_video","name":"GifScroll","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://gifscroll.com"],"network":"proxy","icon":"https://gifscroll.com/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"GifScroll（gifscroll.com）：Reddit 成人 GIF/短视频聚合，列表由 /backend.php 返回 HTML 片段（首页 HTML 是空壳）。榜单 /newest /hottest /best/day|week|month，标签 /search/<tag>，子版块 /r/<sub>；搜索只有标签路径，没有自由文本。媒体 100% 来自 v.redd.it 的 HLS；站点和 reddit CDN 在国内都要代理。"}]}
// LumeRuntime: javascript
//
// 站点：GifScroll（https://gifscroll.com）
//
// 结构（2026-10-30 实测，直连 200）：
//   列表   GET /backend.php?p=<n>&device=mobile&r=&sort=main&period=&content=all&sourced=0&windowHeight=800
//          返回卡片 HTML 片段（首页/newest 的 HTML 里没有卡片）
//   榜单   /newest、/hottest、/best/day|week|month|allTime（这些页面只是壳，数据仍走 backend.php，
//          sort=best 时带 period=day|week|month|allTime）
//   标签   /search/<tag>；子版块 /r/<sub>
//   详情   /v/<id>（og:image 是图卡直链；视频的 m3u8 在 embedPlayer.php 里）
//   播放   /embedPlayer.php?post_id=<id>&muted=1&play=1 里的 JSON 字符串（斜杠被转义）
//   卡片   <h6 class="card-title"><a href="/v/<id>">标题</a></h6>
//          data-videos="[{&quot;url&quot;:&quot;https://v.redd.it/…/HLSPlaylist.m3u8&quot;,&quot;format&quot;:&quot;hls_url&quot;}]"
//          + <img … data-src="…" data-post-id="<id>"（少数是图卡）

var DEFAULT_DOMAIN = 'https://gifscroll.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_CATS = [
  ['newest', '最新'], ['hottest', '最热'], ['best:day', '今日最佳'], ['best:week', '本周最佳'],
  ['tag:Amateur', 'Amateur'], ['tag:Big Tits', 'Big Tits'], ['tag:Ass', 'Ass'],
  ['tag:POV', 'POV'], ['tag:MILF', 'MILF'], ['tag:Pawg', 'Pawg']
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

async function get(url) {
  var full = /^https?:\/\//i.test(url) ? url : base() + url;
  var reply = await LumeSource.http.get(full, { headers: headers() });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (!status) throw new Error('GifScroll：连不上（' + full + '）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('GifScroll：请求失败（HTTP ' + status + ' ' + full + '）');
  return body;
}

function feedUrl(page, sort, period, sub) {
  return '/backend.php?p=' + page + '&device=mobile&r=' + encodeURIComponent(sub || '') +
    '&sort=' + encodeURIComponent(sort || 'main') + '&period=' + encodeURIComponent(period || '') +
    '&content=all&sourced=0&windowHeight=800';
}

function parseCards(html) {
  var text = String(html || '');
  var out = [];
  var seen = {};
  // 视频卡：<h6 class="card-title" ><a href="/v/<id>" …>标题</a></h6>，后面跟 data-videos / data-screenshots
  var re = /<h6 class="card-title"[^>]*>\s*<a href="\/v\/(\d+)"[^>]*>([\s\S]{0,300}?)<\/a>/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    if (seen[m[1]]) continue;
    var chunk = text.slice(m.index, m.index + 9000);
    if (chunk.indexOf('data-videos') < 0) continue; // 侧栏/推荐位，不是内容卡
    seen[m[1]] = 1;
    var shot = /data-screenshots="\[&quot;([^"&]+)/.exec(chunk);
    var cover = shot ? shot[1].split('\\/').join('/') : '';
    out.push({ id: m[1], title: clean(m[2]) || ('GIF ' + m[1]), cover: cover ? absolute(cover) : null, subtitle: '' });
  }
  // 图卡：<img … data-src="/resize_image.php?width=640&image=<url>" … data-post-id="<id>"
  var re2 = /<img[^>]*data-src="([^"]*resize_image\.php[^"]*image=([^"&]+)[^"]*)"[^>]*data-post-id="(\d+)"/g;
  while ((m = re2.exec(text)) !== null) {
    if (seen[m[3]]) continue;
    seen[m[3]] = 1;
    out.push({ id: m[3], title: 'GIF ' + m[3], cover: decodeURIComponent(m[2]), subtitle: '图片' });
  }
  return out;
}

var LumeSource = {
  id: 'gifscroll_video',
  name: 'GifScroll',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://gifscroll.com'],

  async home() {
    var plan = [[feedUrl(1, 'main', '', ''), '最新'], [feedUrl(1, 'best', 'day', ''), '今日最佳']];
    var sections = [];
    for (var i = 0; i < plan.length; i++) {
      try {
        var items = parseCards(await get(plan[i][0])).slice(0, 24);
        if (items.length) sections.push({ title: plan[i][1], items: items });
      } catch (error) {
        console.warn('[gifscroll] 首页抓取失败 ' + plan[i][1] + '：' + error);
      }
    }
    if (!sections.length) throw new Error('GifScroll：首页没有条目（站点可能改版）');
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

    var sort = 'main';
    var period = '';
    var sub = '';
    if (categoryId === 'hottest') sort = 'default';
    else if (categoryId.indexOf('best:') === 0) {
      sort = 'best';
      period = categoryId.slice(5);
    } else if (categoryId.indexOf('tag:') === 0) sub = categoryId.slice(4);
    if (keyword) sub = keyword; // 站点只有标签路径，关键词按 tag 处理

    var items = parseCards(await get(feedUrl(page, sort, period, sub)));
    if (!items.length) console.warn('[gifscroll] 列表没解析出条目：page=' + page + ' sort=' + sort + ' sub=' + sub);
    return { items: items, hasMore: items.length >= 20 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = await get('/v/' + id);
    var title = clean((/property="og:title"[^>]+content="([^"]+)"/i.exec(html) || [])[1]);
    if (!title) title = clean((/<title[^>]*>([\s\S]*?)<\/title>/.exec(html) || [])[1]).replace(/\s*[-|]\s*GifScroll.*$/i, '');
    var cover = (/(?:property|name)=["']og:image["'][^>]{0,200}?content=["']([^"']+)/i.exec(html) || [])[1] || '';
    var desc = clean((/name="description"[^>]+content="([^"]*)"/.exec(html) || [])[1]);
    return {
      id: id,
      title: title || ('GIF ' + id),
      cover: absolute(cover) || null,
      subtitle: '',
      description: (desc ? desc + '\n' : '') + '源站：' + base() + '/v/' + id
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'play', title: '播放' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || args.itemId || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('GifScroll：缺少 id');
    var pageUrl = base() + '/v/' + id;
    var html = await get('/v/' + id);
    var embed = (/\/embedPlayer\.php\?post_id=\d+[^"']*/.exec(html) || [])[0] || '';
    if (!embed) {
      // 图卡：og:image 就是原图
      var img = (/(?:property|name)=["']og:image["'][^>]{0,200}?content=["']([^"']+)/i.exec(html) || [])[1] || '';
      if (img) return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl), poster: absolute(img) };
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    var embedHtml = await get(embed);
    // embed 页里斜杠被转义成 \/，先还原再找 m3u8
    var flat = String(embedHtml).split(String.fromCharCode(92)).join('');
    var m = /(https?:\/\/v\.redd\.it\/[^"'\s]+\.m3u8[^"'\s]*)/.exec(flat);
    if (!m) {
      return { kind: 'webplayer', pageUrl: base() + embed, headers: headers(pageUrl) };
    }
    var url = m[1].replace(/\\\//g, '/');
    return {
      kind: 'video',
      url: url,
      headers: { 'User-Agent': UA, Referer: pageUrl, Range: 'bytes=0-1023' }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
