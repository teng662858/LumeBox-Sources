// LumeSource: {"id":"jizeyy_video","name":"AV仓库","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://www.jizeyy.com"],"network":"direct"}
// LumeRuntime: javascript
//
// 站点：AV仓库（https://www.jizeyy.com）—— Typecho + 主题 yingshierhao（`/usr/themes/yingshierhao/`）。
//   分类：/gccm/ 国产传媒、/rhzh/ 日韩综合、/zwzm/ 中文字幕、/snsw/ 熟女丝袜、/jrll/ 巨乳乱伦、
//         /tjzp/ 调教自拍、/llmt/ 萝莉模特、/mxhl/ 明星换脸；每页 21 条，翻页 `/mxhl/2/`、`/mxhl/3/`…
//   条目：/video/{id}.html（标题在 <h1>，封面在 .media-content 的 background-image）。
//
// 取流（关键，2026-10-28 实测）：
//   详情页里只有一个「高清」按钮，指向 **/video/{id}.html?action=get&p=1**；
//   该页里嵌着一个解析器地址：
//     https://www.jizeyy.com/usr/themes/yingshierhao/jx.php?url=<真实 m3u8>&zimu=
//   把 `url=` 后面的部分 URL 解码就是真·播放地址（例：https://play4.laoyacdn.com/20240205/udYIYzmR/index.m3u8）。
//   注意：p=2..5 没有地址（站点只配了一条线路）；play4.laoyacdn.com 在本机出口被 RST，
//   但地址本身是源站给的，换网络可播；jx.php 是网页解析器（可当兜底线路）。
//
// 18+

var BASE_URL = 'https://www.jizeyy.com';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PAGE_SIZE = 21;
var DETAIL_TTL_MS = 20 * 60 * 1000;

var CATEGORIES = [
  { id: 'mxhl', title: '明星换脸' },
  { id: 'gccm', title: '国产传媒' },
  { id: 'rhzh', title: '日韩综合' },
  { id: 'zwzm', title: '中文字幕' },
  { id: 'snsw', title: '熟女丝袜' },
  { id: 'jrll', title: '巨乳乱伦' },
  { id: 'tjzp', title: '调教自拍' },
  { id: 'llmt', title: '萝莉模特' },
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

async function fetchHtml(path, refererPath) {
  var reply = await LumeSource.http.get(base() + path, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: base() + (refererPath || '/'),
    },
  });
  var status = reply ? reply.status : 0;
  if (status !== 200) throw new Error('页面打不开：HTTP ' + status + '（' + path + '）');
  return reply.body ? String(reply.body) : '';
}

function listPath(categoryId, page) {
  var cat = CATEGORIES.some(function (row) { return row.id === categoryId; }) ? categoryId : 'mxhl';
  var n = Number(page) || 1;
  return n <= 1 ? '/' + cat + '/' : '/' + cat + '/' + n + '/';
}

function parseCards(html) {
  var text = String(html || '');
  var blocks = text.split('class="video-post"');
  var items = [];
  var seen = {};
  for (var i = 1; i < blocks.length; i++) {
    var block = blocks[i];
    var idMatch = /video\/(\d+)\.html/.exec(block);
    if (!idMatch) continue;
    var id = idMatch[1];
    if (seen[id]) continue;
    var end = block.indexOf('</a>');
    var scope = end > 0 ? block.slice(0, end) : block.slice(0, 400);
    var titleMatch = /title="([^"]{1,200})"/.exec(scope)
      || /<h[2-5][^>]*>([\s\S]{0,160}?)<\/h[2-5]>/.exec(scope)
      || /alt="([^"]{1,200})"/.exec(scope);
    if (!titleMatch) continue;
    seen[id] = true;
    items.push({ id: id, title: clean(titleMatch[1]) });
  }
  return items;
}

function coverOf(html, id) {
  var text = String(html || '');
  var near = text.indexOf('/video/' + id + '.html');
  if (near < 0) return '';
  var window = text.slice(Math.max(0, near - 1200), near + 1200);
  var xurl = /data-xurl="([^"]+)"/.exec(window);
  if (xurl) return String(xurl[1]);
  var m = /background-image:\s*url\((?:&quot;|["'])?([^"')\s&]+)/.exec(window);
  if (m) return String(m[1]).replace(/&quot;/g, '');
  var img = /<img[^>]+(?:data-src|src)="([^"]+)"/.exec(window);
  return img ? String(img[1]) : '';
}

async function detailData(id, refererPath) {
  var key = 'c-' + id + '.json';
  var cached = await readJson(key);
  if (cached && cached.at && Date.now() - Number(cached.at) < DETAIL_TTL_MS) return cached;

  var html = await fetchHtml('/video/' + id + '.html', refererPath);
  var h1 = clean((/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || [])[1] || '');
  var cover = coverOf(html, id);
  var data = { at: Date.now(), id: String(id), title: h1, cover: cover };
  if (h1) await writeJson(key, data);
  return data;
}

async function playUrl(id) {
  var html = await fetchHtml('/video/' + id + '.html?action=get&p=1', '/video/' + id + '.html');
  var m = /jx\.php\?url=([^"'&\s]+)/.exec(html);
  if (!m) return { direct: '', proxy: '' };
  var direct = '';
  try {
    direct = decodeURIComponent(m[1]);
  } catch (error) {
    direct = m[1];
  }
  return { direct: direct, proxy: base() + '/usr/themes/yingshierhao/jx.php?url=' + m[1] + '&zimu=' };
}

var LumeSource = {
  id: 'jizeyy_video',
  name: 'AV仓库',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://www.jizeyy.com'],

  async categories() {
    var list = [];
    for (var i = 0; i < CATEGORIES.length; i++) list.push({ id: CATEGORIES[i].id, title: CATEGORIES[i].title });
    return list;
  },

  async home() {
    var boards = [];
    var first = CATEGORIES.slice(0, 3);
    for (var i = 0; i < first.length; i++) {
      try {
        var path = listPath(first[i].id, 1);
        var html = await fetchHtml(path);
        var items = parseCards(html).slice(0, 12);
        if (items.length) {
          boards.push({
            title: first[i].title,
            moreUrl: first[i].id,
            items: items.map(function (row) {
              return { id: row.id, title: row.title, cover: coverOf(html, row.id), subtitle: '' };
            }),
          });
        }
      } catch (error) {
        /* 单个分类失败不影响首页 */
      }
    }
    return boards;
  },

  async filters() {
    var options = [];
    for (var i = 0; i < CATEGORIES.length; i++) options.push({ id: CATEGORIES[i].id, title: CATEGORIES[i].title });
    return { groups: [{ id: 'category', title: '分类', options: options }] };
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    if (filters.category) categoryId = String(filters.category).trim();
    var path = listPath(categoryId, page);
    var html = await fetchHtml(path);
    var items = parseCards(html);
    var out = [];
    for (var i = 0; i < items.length; i++) {
      out.push({ id: items[i].id, title: items[i].title, cover: coverOf(html, items[i].id), subtitle: '' });
    }
    var cat = CATEGORIES.some(function (row) { return row.id === categoryId; }) ? categoryId : 'mxhl';
    var next = '/' + cat + '/' + (page + 1) + '/';
    var hasMore = html.indexOf(next + '"') >= 0 || html.indexOf('href="' + next) >= 0 || items.length >= PAGE_SIZE;
    return { items: out, hasMore: hasMore };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var data = null;
    try {
      data = await detailData(id, '/' + 'mxhl' + '/');
    } catch (error) {
      return null;
    }
    if (!data || !data.title) return null;
    return {
      id: id,
      title: data.title,
      cover: data.cover,
      subtitle: '高清线路',
      description: '源站：' + base() + '/video/' + id + '.html\n取流：?action=get&p=1 里的 jx.php?url=<m3u8>',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'video:' + id, title: '高清' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少视频 ID');
    var played = await playUrl(id);
    if (!played.direct) throw new Error('这条没有播放地址（站点可能只对部分条目配了线路）');
    return {
      kind: 'video',
      url: played.direct,
      headers: { Referer: base() + '/', 'User-Agent': UA },
      qualities: played.proxy ? [{ label: '直连', url: played.direct }, { label: '网页解析', url: played.proxy }] : undefined,
    };
  },
};
