// LumeSource: {"id":"aiboaibo_video","name":"爱播爱播","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://www.994555.xyz"]}
// LumeRuntime: javascript
//
// 站点：爱播爱播（https://www.994555.xyz）—— SvelteKit SSR 的成人视频搜索/播放站。
//   首页 HTML 里内嵌了 SSR 数据（不是接口，直接读这段 JS 对象字面量）：
//     data:{type:"data",data:{list:[{id,name,pic,blurb,m3u8,playUrl,year,type,remarks,sourceKey,sourceName,typeName},…]}}
//   每条自带 **m3u8 直链**（例：https://sryndbsfvd.com/20261027/5Lxq68MZ/index.m3u8），所以播放不用再请求详情页。
//   分页：`/?page=N`、`/2`、`/page/2` 都返回同一批（12 条，服务端忽略分页参数）；
//         `/__data.json` 同样是同一批 12 条。
//   搜索：`/search?q=关键词` 有效（实测「被征服」→ 4 条，页面同样是 SSR 内嵌数据）。
//   因此本源提供「首页 12 条 + 搜索」，并把 m3u8 直接落到 content（kind: video）。
//
// 18+

var BASE_URL = 'https://www.994555.xyz';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var CACHE_TTL_MS = 10 * 60 * 1000;

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
    .replace(/\\"/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchHtml(path) {
  var reply = await LumeSource.http.get(base() + path, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: base() + '/',
    },
  });
  var status = reply ? reply.status : 0;
  if (status !== 200) throw new Error('页面打不开：HTTP ' + status + '（' + path + '）');
  return reply.body ? String(reply.body) : '';
}

// 解析 SSR 内嵌的 list:[{id:…,name:"…",m3u8:"…"}]
function parseItems(html) {
  var text = String(html || '');
  var items = [];
  var seen = {};
  var re = /\{id:(\d+),name:"((?:[^"\\]|\\.)*)",pic:"((?:[^"\\]|\\.)*)",blurb:"((?:[^"\\]|\\.)*)",m3u8:"((?:[^"\\]|\\.)*)"/g;
  var matched;
  while ((matched = re.exec(text)) !== null) {
    var id = matched[1];
    if (seen[id]) continue;
    seen[id] = true;
    items.push({
      id: id,
      title: clean(matched[2]),
      cover: String(matched[3] || '').replace(/\\\//g, '/'),
      m3u8: String(matched[5] || '').replace(/\\\//g, '/'),
    });
  }
  return items;
}

async function cachedItems(path) {
  var key = 'l-' + String(path).replace(/[^a-z0-9]/gi, '_').slice(0, 40) + '.json';
  var cached = await readJson(key);
  if (cached && cached.at && Date.now() - Number(cached.at) < CACHE_TTL_MS) return cached.items;
  var items = parseItems(await fetchHtml(path));
  if (items.length) await writeJson(key, { at: Date.now(), items: items });
  return items;
}

async function findItem(id) {
  var lists = ['/', '/?page=1'];
  for (var i = 0; i < lists.length; i++) {
    var items = await cachedItems(lists[i]);
    for (var j = 0; j < items.length; j++) if (items[j].id === String(id)) return items[j];
  }
  return null;
}

var LumeSource = {
  id: 'aiboaibo_video',
  name: '爱播爱播',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://www.994555.xyz'],

  async categories() {
    return [{ id: 'all', title: '最新' }];
  },

  async home() {
    var items = await cachedItems('/');
    var boards = [];
    if (items.length) {
      boards.push({
        title: '最新',
        moreUrl: 'all',
        items: items.slice(0, 12).map(function (row) {
          return { id: row.id, title: row.title, cover: row.cover, subtitle: '' };
        }),
      });
    }
    return boards;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    var path = keyword ? '/search?q=' + encodeURIComponent(keyword) : '/';
    var items = await cachedItems(path);
    return {
      items: items.map(function (row) {
        return { id: row.id, title: row.title, cover: row.cover, subtitle: '' };
      }),
      hasMore: false,
    };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var row = await findItem(id);
    if (!row) return null;
    return {
      id: id,
      title: row.title,
      cover: row.cover,
      subtitle: row.m3u8 ? 'HLS 直连' : '无播放地址',
      description: '源站：' + base() + '/（SSR 内嵌数据，编号 ' + id + '）',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'video:' + id, title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少视频 ID');
    var row = await findItem(id);
    if (!row || !row.m3u8) throw new Error('这条没有播放地址（首页只给最新 12 条，旧条目需搜索命中）');
    return { kind: 'video', url: row.m3u8, headers: { Referer: base() + '/', 'User-Agent': UA } };
  },
};
