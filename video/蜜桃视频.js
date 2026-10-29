// LumeSource: {"id":"mtav_video","name":"蜜桃视频","version":"1.0.1","category":"video","contentCategory":"adult","mirrors":["https://mtav.art"],"network":"proxy","icon":"https://mtav.art/template/pc/images/logo.png","settings":[{"key":"note","type":"info","title":"站点说明","description":"蜜桃视频 / 麻豆视频在线（mtav.art，TKTube 模板，macCMS 内核）：只开放「视频一区/二区/三区」三个列表（/vod/show/id/<N>/），每页 48 条，分页 /page/<P>/；搜索 /vod/search.html?wd=。详情 /vod/detail/id/<id>/，播放页 /vod/play/id/<id>/sid/1/nid/1/ 里 `var uul` 直给 HLS（2609.v155p.com 等）。国内直连超时，需要代理；播放 CDN 直连可播。"}]}
// LumeRuntime: javascript
//
// 站点：蜜桃视频（https://mtav.art）—— macCMS "TKTube/myui" 模板。
// 注：导航里的 tmav.art 是「天美AV」，标题和列表都不是本站（实测 24 条不同片），故不作镜像。
//
// 结构（2026-10-30 实测，走本机代理）：
//   列表   /vod/show/id/<1|2|3>/         → 视频一区/二区/三区，分页 /vod/show/id/<N>/page/<P>/
//          /vod/show/page/<P>/            → 全部
//   搜索   /vod/search.html?wd=<词>
//   详情   /vod/detail/id/<id>/           （首页第 1 页用这种链接；第 2 页起列表直接给播放链接）
//   播放   /vod/play/id/<id>/sid/1/nid/1/ → `var uul = 'https://…/index.m3u8'+'m3u8文件';`
//          实测 m3u8 200 + application/vnd.apple.mpegURL，CDN 直连不用 Referer。
//   卡片   `<a class="myui-vodlist__thumb lazyload" href="/vod/detail/id/<id>/" title="标题"
//            data-original="封面">`；第 2 页起 href 换成 `/vod/play/id/<id>/sid/1/nid/1/`，两种都认。

var DEFAULT_DOMAIN = 'https://mtav.art';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 站点只开三个分区（导航里就这三项）+ 全部
var CATS = [
  { id: 'all', title: '全部' },
  { id: '1', title: '视频一区' },
  { id: '2', title: '视频二区' },
  { id: '3', title: '视频三区' }
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_DOMAIN).replace(/\/+$/, '');
}

function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
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
  if (!status) throw new Error('蜜桃视频：连不上（' + url + '）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：蜜桃视频 要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('蜜桃视频：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

async function readJson(file) {
  try {
    var raw = await LumeSource.fs.readText(file);
    return raw ? JSON.parse(raw) : null;
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

async function remember(items) {
  if (!items || !items.length) return;
  var cache = (await readJson('items.json')) || { map: {} };
  var map = cache.map || {};
  for (var i = 0; i < items.length; i++) {
    map[items[i].id] = { title: items[i].title, cover: items[i].cover || '' };
  }
  var ids = Object.keys(map);
  if (ids.length > 800) {
    var keep = {};
    for (var j = ids.length - 800; j < ids.length; j++) keep[ids[j]] = map[ids[j]];
    map = keep;
  }
  await writeJson('items.json', { map: map });
}

function parseCards(html) {
  var text = String(html || '');
  // 两种模板都认：新版 `class="item"` + `<strong class="title">`；旧版 `myui-vodlist__thumb` + title/data-original
  var parts = text.split(/class="item"|myui-vodlist__thumb/);
  var out = [];
  var seen = {};
  for (var i = 1; i < parts.length; i++) {
    var block = parts[i].slice(0, 1800);
    var hit = /\/vod\/(?:detail|play)\/id\/(\d+)/.exec(block);
    if (!hit || seen[hit[1]]) continue;
    seen[hit[1]] = 1;
    var strong = /<strong class="title">([\s\S]{0,200}?)<\/strong>/.exec(block);
    var title = strong ? strong[1] : ((/title="([^"]*)"/.exec(block) || [])[1] || (/alt="([^"]*)"/.exec(block) || [])[1] || '');
    var cover = (/data-original="([^"]+)"/.exec(block) || [])[1] || (/<img[^>]+src="([^"]+)"/.exec(block) || [])[1] || '';
    if (/^data:/i.test(cover)) cover = '';
    var date = (/<em>([^<]{4,20})<\/em>/.exec(block) || [])[1] || '';
    out.push({ id: hit[1], title: clean(title) || ('视频 ' + hit[1]), cover: absolute(cover) || null, subtitle: clean(date) });
  }
  return out;
}

function hasNext(html, page) {
  return new RegExp('page\\/' + (page + 1) + '\\/["\']').test(String(html || ''));
}

function showPath(categoryId, page) {
  var id = String(categoryId == null ? '' : categoryId).trim();
  if (!id || id === 'all') {
    return '/vod/show/' + (page > 1 ? 'page/' + page + '/' : '');
  }
  var digits = id.replace(/[^0-9]/g, '');
  if (!digits) throw new Error('蜜桃视频：认不出这个分区（' + id + '）');
  return '/vod/show/id/' + digits + '/' + (page > 1 ? 'page/' + page + '/' : '');
}

var LumeSource = {
  id: 'mtav_video',
  name: '蜜桃视频',
  version: '1.0.1',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://mtav.art'],

  async home() {
    var items = parseCards(await get('/vod/show/id/1/'));
    await remember(items);
    if (!items.length) throw new Error('蜜桃视频：首页没有条目（站点可能改版）');
    return [{ title: '视频一区', moreUrl: '1', items: items.slice(0, 24) }];
  },

  async categories() {
    return CATS.slice(0);
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = clean(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();

    var path;
    if (keyword) {
      path = '/vod/search.html?wd=' + encodeURIComponent(keyword) + (page > 1 ? '&page=' + page : '');
    } else {
      path = showPath(categoryId, page);
    }
    var html = await get(path);
    var items = parseCards(html);
    await remember(items);
    if (!items.length) console.warn('[mtav] 列表没解析出条目：' + path);
    return { items: items, hasMore: keyword ? items.length > 0 : hasNext(html, page) };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var cache = (await readJson('items.json')) || { map: {} };
    var row = (cache.map || {})[id] || null;
    var html = '';
    try {
      html = await get('/vod/detail/id/' + id + '/');
    } catch (error) {
      if (!row) throw error;
    }
    var title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    if (!title) {
      // 播放页 <title> 形如「Playing XXX-watch onlie … - 站点名」，只留 XXX
      var raw = clean((/<title[^>]*>([\s\S]*?)<\/title>/.exec(html) || [])[1]);
      raw = raw.replace(/^\s*Playing\s+/i, '').split(/-?watch\s|\s-\s|\|\s/)[0];
      title = clean(raw);
    }
    if (row && row.title) title = row.title;
    var cover = (/(?:og:image|data-original)="([^"]+)"/.exec(html) || [])[1] || '';
    if (!cover && row) cover = row.cover;
    var desc = clean((/<div class="[^"]*data[^"]*"[^>]*>([\s\S]{0,400}?)<\/div>/.exec(html) || [])[1]);
    return {
      id: id,
      title: title || ('视频 ' + id),
      cover: absolute(cover) || null,
      subtitle: '',
      description: (desc ? desc + '\n' : '') + '源站：' + base() + '/vod/play/id/' + id + '/sid/1/nid/1/'
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'play', title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    // itemId 是部分离线检查工具的叫法，App 传的是 id
    var id = String(args.id || args.itemId || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('蜜桃视频：缺少视频 id');
    var pageUrl = base() + '/vod/play/id/' + id + '/sid/1/nid/1/';
    var html = await get('/vod/play/id/' + id + '/sid/1/nid/1/');
    var url = '';
    // 播放页把地址拆成「地址 + 'm3u8文件'」再用 match 取回来
    var m = /var uul\s*=\s*'([^']+)'/.exec(html);
    if (m) url = entity(m[1]).replace(/m3u8文件\s*$/, '');
    if (!url) {
      var src = /<source[^>]+src=["']([^"']+)["']/i.exec(html);
      if (src) url = entity(src[1]);
    }
    if (!url || !/^https?:\/\//i.test(url)) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    return {
      kind: 'video',
      url: url,
      headers: { 'User-Agent': UA, Referer: pageUrl }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
