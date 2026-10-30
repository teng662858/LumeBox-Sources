// LumeSource: {"id":"ho5ho_comic","name":"ho5ho","version":"1.0.0","category":"comic","contentCategory":"adult","settingsApiVersion":2,"mirrors":["https://www.ho5ho.com"],"network":"proxy","icon":"https://www.ho5ho.com/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"ho5ho（www.ho5ho.com）：中文全彩 H 漫/A 漫，Madara（WordPress）主题。列表 /page/<n>/，排序 ?m_orderby=latest|rating|views，30 个分类 /h漫分類/<分类>/（翻页 ?page=n），搜索 /?s=<词>。详情页给「Server 1 - 全集」单话，章节页必须带 ?style=list 才会列出全部内页图（不带只有 4 张），图片在 hhmg2.b-cdn.net。国内直连不通，需要代理。"}]}
// LumeRuntime: javascript
//
// 站点：ho5ho（https://www.ho5ho.com）—— 中文全彩 H 漫，Madara 主题
//
// 结构（2026-10-30 实测，走本机代理）：
//   列表   /page/<n>/（第 1 页是 /）；排序 ?m_orderby=latest|rating|comments|views
//   分类   /h漫分類/<slug>/，翻页 ?page=<n>（/page/2/ 形式对分类无效）
//   搜索   /?s=<词>&paged=<n>（也兼容 /page/<n>/?s=）
//   详情   /中字h漫/<slug>/，章节列表 <li class="wp-manga-chapter"><a href="…/server-1/">Server 1 - 全集</a>
//   章节   /中字h漫/<slug>/server-1/?style=list ← 必须带 ?style=list，否则只出 4 张
//   内页   data-ho5ho-dimension-url="https://hhmg2.b-cdn.net//<hash>/<n>.jpg"（60 张/话，实测 200 image/jpeg）
//   卡片   <article class="ho5ho-v2-card" data-post-id="3271">
//          <a class="ho5ho-v2-card-cover" href="…" aria-label="标题"><img src="…212x300.jpg">
//          <h3 class="ho5ho-v2-card-title"><a href="…">标题</a></h3>
//
// 国内直连 000，需要代理；图片在 hhmg2.b-cdn.net（Bunny CDN）。

var DEFAULT_DOMAIN = 'https://www.ho5ho.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_CATS = [
  ['全彩', '全彩'], ['巨乳', '巨乳'], ['痴女', '痴女'], ['熟女', '熟女'],
  ['變態', '變態'], ['多p', '多P'], ['母狗', '母狗'], ['接吻', '接吻'],
  ['肉感', '肉感'], ['幻想', '幻想'], ['m女', 'M女'], ['可愛', '可愛'],
  ['學生', '學生'], ['深喉', '深喉'], ['強姦', '強姦'], ['亂倫', '亂倫'],
  ['ntr', 'NTR'], ['肛交', '肛交'], ['正太', '正太'], ['母子', '母子'],
  ['m男', 'M男'], ['催眠', '催眠'], ['懷孕', '懷孕'], ['姐姐', '姐姐'],
  ['貧乳', '貧乳'], ['女性向', '女性向'], ['同人', '同人'], ['聖水', '聖水'],
  ['女同', '女同'], ['韓漫', '韓漫']
];

var SORTS = [
  ['latest', '最新'], ['rating', '最高評分'], ['comments', '最多評論'], ['views', '最多觀看']
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_DOMAIN).replace(/\/+$/, '');
}

function headers(referer) {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.6',
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
  if (value.charAt(0) === '/' && value.charAt(1) === '/') return 'https:' + value;
  if (value.charAt(0) === '/') return base() + value;
  return base() + '/' + value;
}

async function get(path) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var reply = await LumeSource.http.get(url, { headers: headers() });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (!status) throw new Error('ho5ho：连不上（' + url + '，国内需代理）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：站点要求网页验证（HTTP ' + status + '）');
  }
  if (status === 404) throw new Error('ho5ho：页面不存在（' + path + '）');
  if (status !== 200) throw new Error('ho5ho：请求失败（HTTP ' + status + ' ' + path + '）');
  return body;
}

function parseCards(html) {
  var text = String(html || '');
  var out = [];
  var seen = {};
  var re = /<article class="ho5ho-v2-card"[^>]*data-post-id="(\d+)"[\s\S]{0,900}?href="([^"]+)"[^>]*aria-label="([^"]*)"[\s\S]{0,500}?<img[^>]+src="([^"]+)"/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var path = String(m[2]).replace(/^https?:\/\/[^/]+/, '');
    if (seen[path]) continue;
    seen[path] = 1;
    out.push({
      id: path,
      title: clean(m[3]) || ('漫畫 ' + m[1]),
      cover: absolute(m[4]) || null,
      subtitle: ''
    });
  }
  return out;
}

var LumeSource = {
  id: 'ho5ho_comic',
  name: 'ho5ho',
  version: '1.0.0',
  category: 'comic',
  contentCategory: 'adult',
  mirrors: ['https://www.ho5ho.com'],

  async home() {
    var sections = [];
    try {
      var latest = parseCards(await get('/page/1/'));
      if (latest.length) sections.push({ title: '最新', moreUrl: 'latest', items: latest.slice(0, 12) });
    } catch (error) {
      console.warn('[ho5ho] 最新抓取失败：' + error);
    }
    try {
      var hot = parseCards(await get('/page/1/?m_orderby=views'));
      if (hot.length) sections.push({ title: '最多觀看', moreUrl: 'views', items: hot.slice(0, 12) });
    } catch (error) {
      console.warn('[ho5ho] 最多觀看抓取失败：' + error);
    }
    if (!sections.length) throw new Error('ho5ho：首页没有条目（需要代理或站点改版）');
    return sections;
  },

  async categories() {
    var out = [];
    for (var i = 0; i < SORTS.length; i++) out.push({ id: 'sort:' + SORTS[i][0], title: SORTS[i][1] });
    for (var k = 0; k < FALLBACK_CATS.length; k++) out.push({ id: 'cat:' + FALLBACK_CATS[k][0], title: FALLBACK_CATS[k][1] });
    return out;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = clean(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var suffix = page > 1 ? '?page=' + page : '';

    var path;
    if (keyword) {
      path = '/?s=' + encodeURIComponent(keyword) + (page > 1 ? '&paged=' + page : '');
    } else if (categoryId.indexOf('cat:') === 0) {
      var slug = categoryId.slice(4);
      if (!slug) throw new Error('ho5ho：分类为空');
      path = '/' + encodeURIComponent('h漫分類') + '/' + encodeURIComponent(slug) + '/' + suffix;
    } else {
      var sort = categoryId.indexOf('sort:') === 0 ? categoryId.slice(5) : 'latest';
      var known = false;
      for (var i = 0; i < SORTS.length; i++) if (SORTS[i][0] === sort) known = true;
      if (!known) sort = 'latest';
      path = (page > 1 ? '/page/' + page + '/' : '/') + '?m_orderby=' + sort;
    }
    var html = await get(path);
    var items = parseCards(html);
    if (!items.length) console.warn('[ho5ho] 列表没解析出条目：' + path);
    return { items: items, hasMore: items.length >= 12 };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '');
    if (!id) return null;
    if (!/^\//.test(id)) id = '/' + id;
    var html = await get(id);
    var title = clean((/property="og:title"[^>]+content="([^"]+)"/i.exec(html) || [])[1]);
    if (!title) title = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1]);
    var cover = (/(?:property|name)=["']og:image["'][^>]{0,200}?content=["']([^"']+)/i.exec(html) || [])[1] || '';
    var desc = clean((/name="description"[^>]+content="([^"]*)"/.exec(html) || [])[1]);
    var tags = [];
    var re = /\/h漫(?:標籤|分類)\/[^"]*"[^>]*>([^<]{1,20})</g;
    var m;
    while ((m = re.exec(html)) !== null && tags.length < 8) {
      var name = clean(m[1]);
      if (name && tags.indexOf(name) < 0) tags.push(name);
    }
    return {
      id: id,
      title: title || id,
      cover: absolute(cover) || null,
      subtitle: tags.slice(0, 3).join(' · '),
      description: (tags.length ? '標籤：' + tags.join(', ') + '\n' : '') + (desc ? desc + '\n' : '') + '源站：' + base() + id
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '');
    if (!id) return [];
    if (!/^\//.test(id)) id = '/' + id;
    var html = await get(id);
    var re = /<li class="wp-manga-chapter[^"]*">\s*<a href="([^"]+)"[^>]*>([\s\S]{0,120}?)<\/a>/g;
    var out = [];
    var seen = {};
    var m;
    while ((m = re.exec(html)) !== null) {
      var path = String(m[1]).replace(/^https?:\/\/[^/]+/, '');
      if (seen[path]) continue;
      seen[path] = 1;
      out.push({ id: path, title: clean(m[2]) || '全集' });
    }
    if (!out.length) throw new Error('ho5ho：详情页没有章节（站点可能改版）');
    return out;
  },

  async content(argument) {
    var args = argument || {};
    var chapterId = String(args.chapterId || args.id || '');
    if (!chapterId) throw new Error('ho5ho：缺少章节');
    if (!/^\//.test(chapterId)) chapterId = '/' + chapterId;
    // 章节页必须带 style=list，否则只返回前 4 张
    var path = chapterId + (chapterId.indexOf('?') < 0 ? '?style=list' : '&style=list');
    var html = await get(path);
    var urls = [];
    var seen = {};
    var re = /data-ho5ho-dimension-url="([^"]+)"/g;
    var m;
    while ((m = re.exec(html)) !== null) {
      var url = absolute(entity(m[1]).trim());
      if (!url || seen[url]) continue;
      // 只要图片，跳过封面/图标
      if (!/\.(jpe?g|png|webp)(\?|$)/i.test(url)) continue;
      seen[url] = 1;
      urls.push(url);
    }
    if (!urls.length) {
      // 兜底：有的章节没有 dimension 属性，退回 wp-manga-chapter-img 的 src/data-src
      var re2 = /<img[^>]*class="wp-manga-chapter-img"[^>]*>/g;
      var tag;
      while ((tag = re2.exec(html)) !== null) {
        var src = (/data-src="\s*([^"]+)"/.exec(tag[0]) || /src="([^"]+)"/.exec(tag[0]) || [])[1] || '';
        var abs = absolute(src.trim());
        if (abs && !seen[abs]) {
          seen[abs] = 1;
          urls.push(abs);
        }
      }
    }
    if (!urls.length) throw new Error('ho5ho：本章没有取到图片（可能需要登录或章节为空）');
    var imageHeaders = {};
    for (var i = 0; i < urls.length; i++) imageHeaders[urls[i]] = { 'User-Agent': UA, Referer: base() + '/' };
    return { kind: 'images', images: urls, imageHeaders: imageHeaders };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
