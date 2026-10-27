// LumeSource: {"id":"haijiaoqing_video","name":"海角情","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://www.haijiaolove.xyz"],"network":"proxy"}
// LumeRuntime: javascript
//
// 站点：海角情（https://www.haijiaolove.xyz）—— WordPress 站，帖子就是资源条目。
//   实测（2026-10-28）：wp-json 可用，X-WP-Total = 1156 篇；分类路由 /hjmz /hjjd /hjfn /hjsz /hjwf /origin /hjsets /zjgx。
//   列表：GET /wp-json/wp/v2/posts?per_page=20&page=N        ← page 从 1 起，响应头带 X-WP-Total / X-WP-TotalPages
//   详情：GET /wp-json/wp/v2/posts/{id}                      ← content.rendered 里是 Elementor 生成的正文
//   播放：正文里嵌 **iframe**，形如
//         <iframe src="https://player.abyssplayer.com/{code}?autoplay=false&loop=false&muted=false&preload=false">
//         一个帖子通常有 1–3 个（多线路/多片段）。播放器页面本身是 JS 渲染（HTML 里没有 m3u8），
//         所以本源按 kind: webplayer 交给 App 的网页播放器，取第一个 iframe。
//   封面：正文里的 <img>（多为 gif 预览图），没有就用 WordPress 特色图。
//
// 18+

var BASE_URL = 'https://www.haijiaolove.xyz';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PAGE_SIZE = 20;
var CATS_TTL_MS = 6 * 3600 * 1000;
var DETAIL_TTL_MS = 30 * 60 * 1000;

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
    .replace(/&#8217;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getJson(path) {
  var reply = await LumeSource.http.get(base() + path, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: base() + '/',
    },
  });
  var status = reply ? reply.status : 0;
  if (status !== 200) throw new Error('接口打不开：HTTP ' + status + '（' + path + '）');
  try {
    return JSON.parse(reply.body ? String(reply.body) : '');
  } catch (error) {
    throw new Error('接口返回不是 JSON：' + path);
  }
}

function firstImage(html) {
  var m = /<img[^>]+src="([^"]+)"/i.exec(String(html || ''));
  return m ? String(m[1]) : '';
}

function iframesOf(html) {
  var out = [];
  var re = /<iframe[^>]+src="([^"]+)"/gi;
  var matched;
  while ((matched = re.exec(String(html || ''))) !== null) {
    var url = matched[1].replace(/&amp;/g, '&');
    if (url && out.indexOf(url) < 0) out.push(url);
  }
  return out;
}

async function detailData(id) {
  var key = 'c-' + id + '.json';
  var cached = await readJson(key);
  if (cached && cached.at && Date.now() - Number(cached.at) < DETAIL_TTL_MS) return cached;

  var post = await getJson('/wp-json/wp/v2/posts/' + id + '?context=view');
  var content = (post && post.content && post.content.rendered) || '';
  var frames = iframesOf(content);
  var data = {
    at: Date.now(),
    id: String(id),
    title: clean((post && post.title && post.title.rendered) || ''),
    cover: firstImage(content),
    date: String((post && post.date) || ''),
    frames: frames,
  };
  if (data.title) await writeJson(key, data);
  return data;
}

var LumeSource = {
  id: 'haijiaoqing_video',
  name: '海角情',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://www.haijiaolove.xyz'],

  async categories() {
    var cached = await readJson('cats.json');
    if (cached && Array.isArray(cached.list) && cached.list.length && Date.now() - Number(cached.at) < CATS_TTL_MS) {
      return cached.list;
    }
    var list = [{ id: 'all', title: '全部' }];
    try {
      var reply = await LumeSource.http.get(base() + '/wp-json/wp/v2/categories?per_page=100&orderby=count&order=desc', {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (reply && reply.status === 200) {
        var rows = JSON.parse(reply.body ? String(reply.body) : '[]');
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if (!row || !row.id) continue;
          var count = Number(row.count) || 0;
          if (count <= 0) continue;
          list.push({ id: String(row.id), title: (row.name || ('分类 ' + row.id)) + '（' + count + '）' });
        }
      }
    } catch (error) {
      /* 拿不到就只留「全部」 */
    }
    await writeJson('cats.json', { at: Date.now(), list: list });
    return list;
  },

  async home() {
    var boards = [];
    try {
      var latest = await this.list({ page: 1 });
      if (latest.items.length) boards.push({ title: '最新', moreUrl: 'all', items: latest.items.slice(0, 12) });
    } catch (error) {
      /* 忽略 */
    }
    return boards;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    if (filters.category) categoryId = String(filters.category).trim();
    var path = '/wp-json/wp/v2/posts?per_page=' + PAGE_SIZE + '&page=' + page + '&orderby=date&order=desc';
    if (/^\d+$/.test(categoryId) && categoryId !== 'all') path += '&categories=' + categoryId;
    if (keyword) path += '&search=' + encodeURIComponent(keyword);
    var rows = await getJson(path);
    if (!Array.isArray(rows)) throw new Error('列表返回异常');
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var content = (row.content && row.content.rendered) || '';
      items.push({
        id: String(row.id),
        title: clean((row.title && row.title.rendered) || ''),
        cover: firstImage(content),
        subtitle: String((row.date || '')).slice(0, 10),
      });
    }
    return { items: items, hasMore: rows.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var data = null;
    try {
      data = await detailData(id);
    } catch (error) {
      return null;
    }
    if (!data || !data.title) return null;
    return {
      id: id,
      title: data.title,
      cover: data.cover,
      subtitle: data.frames.length + ' 个播放源 · ' + data.date.slice(0, 10),
      description: '源站：' + base() + '/?p=' + id + '\n播放：正文内嵌 player.abyssplayer.com（网页播放器）',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    var data = await detailData(id);
    var list = [];
    for (var i = 0; i < data.frames.length; i++) {
      list.push({ id: 'web:' + i, title: '播放源 ' + (i + 1) });
    }
    if (!list.length) list.push({ id: 'web:0', title: '网页播放' });
    return list;
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少帖子 ID');
    var data = await detailData(id);
    var index = 0;
    var matched = /^web:(\d+)$/.exec(String(args.chapterId || ''));
    if (matched) index = Number(matched[1]) || 0;
    var frame = data.frames[index] || data.frames[0] || '';
    if (!frame) throw new Error('这篇没有可用的播放器（可能是图文帖）');
    return { kind: 'webplayer', url: frame };
  },
};
