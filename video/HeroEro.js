// LumeSource: {"id":"heroero_video","name":"HeroEro","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://heroero.com","https://www.heroero.com"],"network":"proxy","icon":"https://heroero.com/favicon.ico","settings":[{"key":"note","type":"info","title":"站点说明","description":"HeroEro（heroero.com）：明星/电影性爱片段合集，KVS 内核。列表 /latest-updates/、/most-popular/、/categories/<slug>/，搜索 /search/<词>/。详情页 flashvars 直给 mp4（/get_file/… 带 v-acctoken），实测 206 可播；视频地址与 slug 无关，/videos/<id>/x/ 也能取。国内直连超时，需要代理。"}]}
// LumeRuntime: javascript
//
// 站点：HeroEro（https://heroero.com）—— KVS 内核的「明星裸露/电影性爱片段」站。
//
// 结构（2026-10-30 实测，走本机代理）：
//   列表   /latest-updates/<N>/、/most-popular/<N>/、/categories/<slug>/<N>/
//   搜索   /search/<词>/<N>/
//   详情   /videos/<id>/<slug>/（slug 不校验，/videos/<id>/x/ 也回 200；缺末尾斜杠会 404）
//   播放   详情页内联 flashvars：video_url: 'https://heroero.com/get_file/1/<hash>/…/<id>.mp4/?v-acctoken=…'
//          实测 Range 206 + video/mp4；整片 100MB+，所以给播放头加 Range: bytes=0-1023（与 av18/horrorporn 同做法）
//   卡片   `<div class="item " data-dir='slug'>` + `<a class="excpop" href="…/videos/<id>/<slug>/" title="标题">`
//          + `<img … data-original="https://media.heroero.com/…/300x255/5.jpg">`
//   分类   /categories/ 里 `<a class="item" href="…/categories/<slug>/" title="名字">`
//
// 网络：国内直连超时（000），需要代理；封面在 media.heroero.com（同站出口）。

var DEFAULT_DOMAIN = 'https://heroero.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var FALLBACK_CATS = [
  ['celebrity-sex-scenes', 'CELEBRITY SEX SCENES'],
  ['explicit-sex-scenes', 'EXPLICIT SEX SCENES'],
  ['nude-movie-scenes', 'NUDE MOVIE SCENES'],
  ['celebrity-blowjob-scenes', 'CELEBRITY BLOWJOB SCENES'],
  ['retro-sex-scenes', 'CLASSIC SEX SCENES'],
  ['lesbian-scenes', 'LESBIAN SCENES'],
  ['group-sex-scenes', 'GROUP SEX SCENES'],
  ['masturbation-scenes', 'MASTURBATION SCENES'],
  ['full-frontal-nudity', 'FULL FRONTAL NUDITY'],
  ['nude-tv-shows', 'TV SHOW SCENES'],
  ['hot-sexy-scenes', 'HOT SEXY SCENES'],
  ['bdsm-videos', 'BDSM'],
  ['big-boobs', 'BIG BOOBS'],
  ['porn-music-videos-new', 'PORN MUSIC VIDEOS'],
  ['mainstream-sex-videos', 'MAINSTREAM SEX VIDEOS'],
  ['hentai-xxx-sartoons', 'HENTAI'],
  ['shower-scenes', 'SHOWER SCENES'],
  ['strip-scenes', 'STRIP SCENES'],
  ['sexy-banned-comercial', 'BANNED COMMERCIAL'],
  ['naked-nude-model-on-stage', 'NUDES ON STAGE'],
  ['asian', 'ASIAN']
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
  if (!status) throw new Error('HeroEro：连不上（' + url + '）');
  if (status === 403 || status === 503 || status === 521) {
    throw new Error('NEED_WEBVIEW_VERIFY：HeroEro 要求网页验证（HTTP ' + status + '）');
  }
  if (status !== 200) throw new Error('HeroEro：请求失败（HTTP ' + status + ' ' + path + '）');
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
  var parts = String(html || '').split('data-dir=');
  var out = [];
  var seen = {};
  for (var i = 1; i < parts.length; i++) {
    var block = parts[i].slice(0, 2500);
    var hit = /\/videos\/(\d+)\/([^"'\/]+)/.exec(block);
    if (!hit || seen[hit[1]]) continue;
    seen[hit[1]] = 1;
    var title = (/title="([^"]*)"/.exec(block) || [])[1] || (/alt="([^"]*)"/.exec(block) || [])[1] || '';
    var cover = (/data-original="([^"]+)"/.exec(block) || [])[1] || '';
    out.push({ id: hit[1], title: clean(title) || ('视频 ' + hit[1]), cover: absolute(cover) || null, subtitle: '' });
  }
  return out;
}

function hasNext(html, page) {
  var text = String(html || '');
  return new RegExp('href="[^"]*\\/' + (page + 1) + '\\/"').test(text);
}

async function loadCategories() {
  var cached = await readJson('cats.json');
  if (cached && cached.at && cached.rows && cached.rows.length && Date.now() - Number(cached.at) < 30 * 60 * 1000) {
    return cached.rows;
  }
  var rows = [];
  try {
    var html = await get('/categories/');
    var re = /href="https?:\/\/[^"]*\/categories\/([a-z0-9-]+)\/"[^>]*title="([^"]{1,60})"/g;
    var m;
    var seen = {};
    while ((m = re.exec(html)) !== null) {
      if (seen[m[1]]) continue;
      seen[m[1]] = 1;
      rows.push({ id: m[1], title: entity(m[2]) });
    }
  } catch (error) {
    console.warn('[heroero] 分类抓取失败，用内置清单：' + error);
  }
  if (rows.length < 5) {
    rows = [];
    for (var i = 0; i < FALLBACK_CATS.length; i++) rows.push({ id: FALLBACK_CATS[i][0], title: FALLBACK_CATS[i][1] });
  }
  if (rows.length) await writeJson('cats.json', { at: Date.now(), rows: rows });
  return rows;
}

function flashField(html, name) {
  var m = new RegExp(name + "\\s*:\\s*'([^']*)'").exec(html) || new RegExp(name + '\\s*:\\s*"([^"]*)"').exec(html);
  return m ? m[1] : '';
}

var LumeSource = {
  id: 'heroero_video',
  name: 'HeroEro',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://heroero.com', 'https://www.heroero.com'],

  async home() {
    var both = await Promise.all([
      get('/latest-updates/').catch(function (error) {
        console.warn('[heroero] 最新 抓取失败：' + error);
        return '';
      }),
      get('/most-popular/').catch(function (error) {
        console.warn('[heroero] 最多观看 抓取失败：' + error);
        return '';
      })
    ]);
    var sections = [];
    var latest = parseCards(both[0]);
    if (latest.length) sections.push({ title: '最新', moreUrl: 'latest', items: latest.slice(0, 24) });
    var popular = parseCards(both[1]);
    if (popular.length) sections.push({ title: '最多观看', moreUrl: 'popular', items: popular.slice(0, 24) });
    if (!sections.length) throw new Error('HeroEro：首页没有条目（站点可能改版）');
    return sections;
  },

  async categories() {
    var rows = await loadCategories();
    var out = [{ id: 'latest', title: '最新' }, { id: 'popular', title: '最多观看' }];
    for (var i = 0; i < rows.length; i++) out.push({ id: rows[i].id, title: rows[i].title });
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
      path = '/search/' + encodeURIComponent(keyword) + '/' + (page > 1 ? page + '/' : '');
    } else if (!categoryId || categoryId === 'latest') {
      path = '/latest-updates/' + (page > 1 ? page + '/' : '');
    } else if (categoryId === 'popular') {
      path = '/most-popular/' + (page > 1 ? page + '/' : '');
    } else if (/^[a-z0-9-]+$/i.test(categoryId)) {
      path = '/categories/' + categoryId + '/' + (page > 1 ? page + '/' : '');
    } else {
      throw new Error('HeroEro：认不出这个分类（' + categoryId + '）');
    }
    var html = await get(path);
    var items = parseCards(html);
    if (!items.length) console.warn('[heroero] 列表没解析出条目：' + path);
    return { items: items, hasMore: hasNext(html, page) };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var html = await get('/videos/' + id + '/x/');
    var title = clean((/<h1[^>]*>([\s\S]{0,300}?)<\/h1>/.exec(html) || [])[1]);
    if (!title) title = clean(flashField(html, 'video_title'));
    if (!title) title = clean((/<title[^>]*>([\s\S]*?)<\/title>/.exec(html) || [])[1]).replace(/\s*(Video\s*)?».*$/, '');
    var cover = '';
    var og = /property="og:image"[^>]+content="([^"]+)"/i.exec(html);
    if (og) cover = entity(og[1]);
    if (!cover) {
      var img = /data-original="([^"]+)"/.exec(html);
      if (img) cover = entity(img[1]);
    }
    var cats = clean(flashField(html, 'video_categories'));
    var models = clean(flashField(html, 'video_models'));
    var bits = [];
    if (cats) bits.push(cats.split(',').slice(0, 2).join(' / '));
    var desc = [];
    if (cats) desc.push('分类：' + cats);
    if (models) desc.push('演员：' + models);
    desc.push('源站：' + base() + '/videos/' + id + '/');
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
    if (!id) throw new Error('HeroEro：缺少视频 id');
    var pageUrl = base() + '/videos/' + id + '/x/';
    var html = await get('/videos/' + id + '/x/');
    var url = flashField(html, 'video_url');
    var hd = flashField(html, 'video_alt_url');
    var hdLabel = clean(flashField(html, 'video_alt_url_text')) || 'HD';
    if (hd && /^https?:\/\//i.test(hd)) {
      return {
        kind: 'video',
        url: hd,
        headers: { 'User-Agent': UA, Referer: pageUrl, Range: 'bytes=0-1023' },
        qualities: [{ label: hdLabel, url: hd }, { label: '默认', url: url || hd }]
      };
    }
    if (!url || !/^https?:\/\//i.test(url)) {
      return { kind: 'webplayer', pageUrl: pageUrl, headers: headers(pageUrl) };
    }
    return {
      kind: 'video',
      url: url,
      headers: { 'User-Agent': UA, Referer: pageUrl, Range: 'bytes=0-1023' }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
