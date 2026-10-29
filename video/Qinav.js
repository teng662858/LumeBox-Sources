// LumeSource: {"id":"qinav_video","name":"Qinav","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://www.qinav.com"],"network":"proxy","icon":"https://www.qinav.com/static/icon.png","settings":[{"key":"note","type":"info","title":"站点说明","description":"Qinav（qinav.com）：16 个分类（亚洲情色/国产主播/无码专区…），列表 /site/5/<N>.html，第 2 页起 /site/5/<N>-<P>.html（最多几百页）；搜索 /search.html?wd=。详情 /video/<id>.html，播放页内嵌 /embed/<id>.html，里面 `const url` 直给 HLS（2609.lajiao2026.com 等）。国内直连不稳定，建议配代理；播放 CDN 直连可播。"}]}
// LumeRuntime: javascript
//
// 站点：Qinav（https://www.qinav.com）—— 自研 CMS（`/site/5/<分类>.html` + `/video/<id>.html`）。
//
// 结构（2026-10-30 实测，走本机代理）：
//   分类   /site/5/<N>.html（导航里 16 个：1 亚洲情色、2 国产主播…33 福利姬）
//   分页   /site/5/<N>-<P>.html（P 从 2 开始；实测 1-723 也回 200）
//   搜索   /search.html?wd=<词>
//   详情   /video/<id>.html → <h1>、og:title、og:image
//   播放   /video/<id>.html 里是 `<iframe src="/embed/<id>.html">`；
//          embed 页 2.6KB，直接给 `const url = 'https://…/index.m3u8'`（也包了一层 155jx 播放器）
//   卡片   `<a href="/video/<id>.html"><li class="image"><img class="lazy" img="封面">…<span class="note">时长</span></li>
//          <li class="title">标题</li></a>`
//
// 网络：国内直连时通时断（实测同一域名先 200 后超时），声明 proxy；播放 CDN 直连 200。

var DEFAULT_DOMAIN = 'https://www.qinav.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_CATS = [
  ['1', '亚洲情色'], ['2', '国产主播'], ['3', '国产自拍'], ['4', '无码专区'], ['5', '欧美性爱'],
  ['6', '熟女人妻'], ['7', '强奸乱伦'], ['8', '巨乳美乳'], ['9', '中文字幕'], ['10', '制服诱惑'],
  ['11', '女同性恋'], ['12', '卡通动画'], ['13', '视频伦理'], ['14', '少女萝莉'], ['15', '重口色情'],
  ['33', '福利姬']
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

async function get(path, referer) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var reply = await LumeSource.http.get(url, { headers: headers(referer) });
  var status = Number((reply && reply.status) || 0);
  var body = String((reply && reply.body) || '');
  if (!status) throw new Error('Qinav：连不上（' + url + '）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：Qinav 要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('Qinav：请求失败（HTTP ' + status + ' ' + path + '）');
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

function parseCards(html) {
  var parts = String(html || '').split('href="/video/');
  var out = [];
  var seen = {};
  for (var i = 1; i < parts.length; i++) {
    var block = parts[i].slice(0, 1200);
    var idm = /^(\d+)\.html"/.exec(block);
    if (!idm || seen[idm[1]]) continue;
    seen[idm[1]] = 1;
    var title = (/<li class="title">([\s\S]{0,300}?)<\/li>/.exec(block) || [])[1] || (/title="([^"]*)"/.exec(block) || [])[1] || '';
    var cover = (/\bimg="([^"]+)"/.exec(block) || [])[1] || (/<img[^>]+src="([^"]+)"/.exec(block) || [])[1] || '';
    var note = (/<span class="note">([^<]{1,20})<\/span>/.exec(block) || [])[1] || '';
    out.push({ id: idm[1], title: clean(title) || ('视频 ' + idm[1]), cover: absolute(cover) || null, subtitle: clean(note) });
  }
  return out;
}

function maxPage(html, categoryId) {
  var best = 1;
  var re = new RegExp('\\/site\\/5\\/' + categoryId + '-(\\d+)\\.html', 'g');
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    var n = Number(m[1]) || 0;
    if (n > best) best = n;
  }
  return best;
}

async function loadCategories() {
  var cached = await readJson('cats.json');
  if (cached && cached.at && cached.rows && cached.rows.length && Date.now() - Number(cached.at) < 30 * 60 * 1000) {
    return cached.rows;
  }
  var rows = [];
  try {
    var html = await get('/');
    var re = /<a href="\/site\/5\/(\d+)\.html">[\s\S]{0,120}?<\/i>\s*([^<]{1,16}?)<\/a>/g;
    var m;
    var seen = {};
    while ((m = re.exec(html)) !== null) {
      var title = clean(m[2]);
      if (!title || seen[m[1]]) continue;
      seen[m[1]] = 1;
      rows.push({ id: m[1], title: title });
    }
  } catch (error) {
    console.warn('[qinav] 分类抓取失败，用内置清单：' + error);
  }
  if (rows.length < 5) {
    rows = [];
    for (var i = 0; i < FALLBACK_CATS.length; i++) rows.push({ id: FALLBACK_CATS[i][0], title: FALLBACK_CATS[i][1] });
  }
  if (rows.length) await writeJson('cats.json', { at: Date.now(), rows: rows });
  return rows;
}

var LumeSource = {
  id: 'qinav_video',
  name: 'Qinav',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://www.qinav.com'],

  async home() {
    var both = await Promise.all([
      get('/new.html').catch(function (error) {
        console.warn('[qinav] 最新 抓取失败：' + error);
        return '';
      }),
      get('/hot.html').catch(function (error) {
        console.warn('[qinav] 最热 抓取失败：' + error);
        return '';
      })
    ]);
    var sections = [];
    var latest = parseCards(both[0]);
    if (latest.length) sections.push({ title: '最新', moreUrl: 'new', items: latest.slice(0, 24) });
    var hot = parseCards(both[1]);
    if (hot.length) sections.push({ title: '最热', moreUrl: 'hot', items: hot.slice(0, 24) });
    if (!sections.length) {
      var first = parseCards(await get('/site/5/1.html'));
      if (first.length) sections.push({ title: '亚洲情色', moreUrl: '1', items: first.slice(0, 24) });
    }
    if (!sections.length) throw new Error('Qinav：首页没有条目（站点可能改版）');
    return sections;
  },

  async categories() {
    var rows = await loadCategories();
    var out = [{ id: 'new', title: '最新' }, { id: 'hot', title: '最热' }];
    for (var i = 0; i < rows.length; i++) out.push({ id: rows[i].id, title: rows[i].title });
    return out;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = clean(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();

    var html;
    var hasMore = false;
    if (keyword) {
      html = await get('/search.html?wd=' + encodeURIComponent(keyword) + (page > 1 ? '&page=' + page : ''));
      hasMore = page < maxPage(html, '1') || false;
    } else if (categoryId === 'new' || categoryId === 'hot') {
      html = await get(categoryId === 'new' ? '/new.html' : '/hot.html');
    } else {
      // 没给分类时回落到「最新」
      var digits = categoryId.replace(/[^0-9]/g, '');
      if (!digits) {
        html = await get('/new.html');
        return { items: parseCards(html), hasMore: false };
      }
      var path = page > 1 ? '/site/5/' + digits + '-' + page + '.html' : '/site/5/' + digits + '.html';
      html = await get(path);
      hasMore = page < maxPage(html, digits);
    }
    var items = parseCards(html);
    if (!items.length) console.warn('[qinav] 列表没解析出条目');
    return { items: items, hasMore: hasMore };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = await get('/video/' + id + '.html');
    var title = clean((/<h1[^>]*>([\s\S]{0,300}?)<\/h1>/.exec(html) || [])[1]);
    if (!title) {
      var og = /property="og:title"[^>]+content="([^"]+)"/i.exec(html);
      if (og) title = clean(og[1]);
    }
    var cover = '';
    var ogi = /property="og:image"[^>]+content="([^"]+)"/i.exec(html);
    if (ogi) cover = entity(ogi[1]);
    if (!cover) {
      var img = /<img[^>]+\bimg="([^"]+)"/.exec(html);
      if (img) cover = entity(img[1]);
    }
    var bits = [];
    var dur = /<span class="note">([^<]{1,20})<\/span>/.exec(html);
    if (dur) bits.push(clean(dur[1]));
    var tags = [...html.matchAll(/href="\/tags\/(\d+)\.html"[^>]*>([^<]{1,16})</g)].map(function (m) { return clean(m[2]); });
    if (tags.length) bits.push(tags.slice(0, 2).join(' / '));
    var desc = [];
    if (tags.length) desc.push('标签：' + tags.join(', '));
    desc.push('源站：' + base() + '/video/' + id + '.html');
    return {
      id: id,
      title: title || ('视频 ' + id),
      cover: absolute(cover) || null,
      subtitle: bits.join(' · '),
      description: desc.join('\n')
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
    if (!id) throw new Error('Qinav：缺少视频 id');
    var pageUrl = base() + '/video/' + id + '.html';
    var html = await get('/embed/' + id + '.html', pageUrl);
    var url = '';
    var m = /const\s+url\s*=\s*'([^']+)'/.exec(html) || /url=https?:\/\/[^"']*?\/?([^"']+)/.exec(html);
    if (m && /^https?:\/\//i.test(m[1])) url = entity(m[1]);
    if (!url) {
      var iframe = /<iframe[^>]+src="([^"]+)"/i.exec(html);
      if (iframe) {
        var q = /[?&]url=(https?:\/\/[^&"']+)/.exec(iframe[1]);
        if (q) url = decodeURIComponent(q[1]);
      }
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
