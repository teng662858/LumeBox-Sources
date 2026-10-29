// LumeSource: {"id":"aiboaibo_video","name":"爱播爱播","version":"2.0.0","category":"video","contentCategory":"adult","settingsApiVersion":2,"requiresSettings":["settingsActions"],"mirrors":["https://www.994555.xyz","https://www.455333.xyz","https://www.466333.xyz","https://www.477333.xyz","https://www.488333.xyz","https://www.4545.eu.org","https://4599.pages.dev","https://55511.pages.dev"],"network":"direct","icon":"https://www.994555.xyz/favicon.svg","settings":[{"key":"publishPage","type":"action","action":"openWebsite","title":"打开发布页","url":"https://didizhi.pages.dev/","description":"官方发布页（永不失联）：列出 pages.dev 镜像与 455333/466333/477333/488333 等主域，换域名时先看这里"},{"key":"note","type":"info","title":"站点说明","description":"爱播爱播（SvelteKit SSR + /category/__data.json）。首页与搜索页的 SSR 数据里每条自带 m3u8；分类页走 __data.json（devalue 扁平格式），分类 = 来源 11/12 的栏目。分类里每页 20–50 条，分页真实生效；播放为 HLS 直链，不需要 Referer。"}]}
// LumeRuntime: javascript
//
// 站点：爱播爱播（https://www.994555.xyz）—— SvelteKit SSR 的成人视频搜索/播放站。
// 发布页：https://didizhi.pages.dev/（r1..r5 → go.html，XOR 解出 pages.dev 镜像与主域），
//   主域 www.994555.xyz / 455333 / 466333 / 477333 / 488333 / 4545.eu.org，镜像 4599.pages.dev…
//
// 一、两种数据源
//   1) 首页 / 搜索页：HTML 里内嵌 SSR 数据（不是接口，直接读字面量）
//      {id:134310,name:"…",pic:"…",blurb:"…",m3u8:"https://…/index.m3u8",…}
//      卡片链接是 `/<sourceKey>-<id>`（例 /14-134310），sourceKey 决定详情路径，必须一起带上。
//   2) 分类页：`/category/__data.json?source=<来源>&tid=<栏目>&page=<页码>`
//      SvelteKit 的 devalue 扁平格式（nodes[].data，数组/对象里的整数是指向下标），
//      解出来是 {sourceKey, classes:[{id,name}], vods:[{id,name,pic,m3u8,remarks,type,year,sourceKey}], totalPages}。
//      实测：source 11 有 20 个栏目（麻豆视频/91制片厂/天美传媒…，1346 页），
//            source 12 有 30 个栏目（国产自拍/欧美极品/日韩无码…，11597 页）；tid/page 都真实生效。
//   3) 详情：`/<sourceKey>-<id>/__data.json` → {vod:{id,name,pic,m3u8,year,type,remarks,…}}。
//
// 二、播放
//   vods/SSR 里直接带 m3u8（`https://t27.cdn2020.com/video/m3u8/…/index.m3u8`），
//   实测 200 + application/vnd.apple.mpegurl，加不加 Referer 都能播。
//
// 三、分类
//   取来源 11 + 12 的栏目实时拼：id 形如 `s11:3`（来源 11 的第 3 个栏目），标题用栏目名；
//   同名的栏目只保留第一次出现的（各来源栏目大量重名，全展开会有上百项）。
//   另加「最新」= s11:0（来源 11 全部）。
// 18+

var BASE_URL = 'https://www.994555.xyz';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var CACHE_TTL_MS = 10 * 60 * 1000;
var NAV_TTL_MS = 30 * 60 * 1000;
// 分类取自 2026-10-29 实测的来源 11/12 栏目（同名只留第一次出现）。站点加栏目后需要更新这段；
// id 形如 `s11:3` = 来源 11 的第 3 个栏目，s11:0 = 来源 11 全部（最新）。
var CATEGORIES = [
  { id: 's11:0', title: '最新' },
  { id: 's11:1', title: '麻豆视频' },
  { id: 's11:2', title: '91制片厂' },
  { id: 's11:3', title: '天美传媒' },
  { id: 's11:4', title: '蜜桃传媒' },
  { id: 's11:5', title: '皇家华人' },
  { id: 's11:6', title: '星空传媒' },
  { id: 's11:7', title: '精东影业' },
  { id: 's11:8', title: '乐播传媒' },
  { id: 's11:9', title: '成人头条' },
  { id: 's11:10', title: '乌鸦传媒' },
  { id: 's11:20', title: '兔子先生' },
  { id: 's11:21', title: '杏吧原创' },
  { id: 's11:22', title: '玩偶姐姐' },
  { id: 's11:23', title: 'mini传媒' },
  { id: 's11:24', title: '大象传媒' },
  { id: 's11:25', title: '开心鬼传媒' },
  { id: 's11:26', title: 'PsychoPorn' },
  { id: 's11:27', title: '糖心Vlog' },
  { id: 's11:29', title: '萝莉社' },
  { id: 's11:30', title: '性视界' },
  { id: 's12:1', title: '国产自拍' },
  { id: 's12:2', title: '欧美极品' },
  { id: 's12:3', title: '日韩无码' },
  { id: 's12:4', title: 'AV明星' },
  { id: 's12:20', title: '中文字幕' },
  { id: 's12:21', title: '动漫精品' },
  { id: 's12:22', title: '极骚萝莉' },
  { id: 's12:23', title: '人妖视频' },
  { id: 's12:24', title: '重咸口味' },
  { id: 's12:25', title: '三级自慰' },
  { id: 's12:26', title: '强奸乱伦' },
  { id: 's12:27', title: '独家擂台格斗' },
  { id: 's12:28', title: '辣椒GIGA' },
  { id: 's12:31', title: 'HEYZO' },
  { id: 's12:32', title: '独家DMM' },
  { id: 's12:33', title: 'HEY诱惑' },
  { id: 's12:34', title: '童颜巨乳' },
  { id: 's12:35', title: '高潮喷吹' },
  { id: 's12:36', title: '激情口交' },
  { id: 's12:37', title: '绝美少女' },
  { id: 's12:38', title: '首次亮相' },
  { id: 's12:39', title: '柚木TINA' },
  { id: 's12:40', title: '原纱央莉' },
  { id: 's12:41', title: '大桥未久' },
  { id: 's12:42', title: 'AV明星1' },
  { id: 's12:43', title: '仁科百华' },
  { id: 's12:44', title: '天海翼' },
  { id: 's12:45', title: '小川阿佐美' },
  { id: 's12:46', title: '三上悠亚' },
  { id: 's12:47', title: '长泽梓' },
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
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fetchText(path) {
  return LumeSource.http.get(base() + path, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/json,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: base() + '/',
    },
  }).then(function (reply) {
    var status = reply ? reply.status : 0;
    if (status !== 200) throw new Error('页面打不开：HTTP ' + status + '（' + path + '）');
    return reply.body ? String(reply.body) : '';
  });
}

function fetchJson(path) {
  return fetchText(path).then(function (text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error('接口返回不是 JSON：' + path);
    }
  });
}

// SvelteKit 的 devalue 扁平数据：nodes[].data 里数组/对象的值都是「下标」，
// 下标指向的字符串/数字才是真正的值；只对对象/数组递归，数字不再当引用。
function devalue(payload) {
  var nodes = payload && payload.nodes ? payload.nodes : [];
  var data = null;
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i] && nodes[i].type === 'data') {
      data = nodes[i].data;
      break;
    }
  }
  if (!data || !data.length) return null;
  function walk(value) {
    if (typeof value === 'number' && value >= 0 && value < data.length) {
      var entry = data[value];
      if (entry && typeof entry === 'object') return walkAny(entry);
      return entry;
    }
    return value;
  }
  function walkAny(value) {
    if (Array.isArray(value)) {
      var list = [];
      for (var i = 0; i < value.length; i++) list.push(walk(value[i]));
      return list;
    }
    var out = {};
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = walk(value[key]);
    }
    return out;
  }
  return walkAny(data[0]);
}

// 分类页数据：来源 + 栏目 + 页码（站点首次生成较慢，缓存 10 分钟）
async function categoryData(sourceKey, tid, page) {
  var file = 'cat-' + sourceKey + '-' + tid + '-' + page + '.json';
  var cached = await readJson(file);
  if (cached && cached.at && Date.now() - Number(cached.at) < CACHE_TTL_MS) return cached.data;
  var payload = await fetchJson(
    '/category/__data.json?source=' + sourceKey + '&tid=' + tid + '&page=' + page
  );
  var data = devalue(payload);
  if (!data) throw new Error('分类数据解不开（站点可能改版了）');
  await writeJson(file, { at: Date.now(), data: data });
  return data;
}

function vodItem(vod) {
  var rawId = String(vod && vod.id != null ? vod.id : '');
  if (!rawId) return null;
  var sourceKey = String(vod.sourceKey == null ? '' : vod.sourceKey);
  var id = sourceKey ? sourceKey + '-' + rawId : rawId;
  var bits = [clean(vod.remarks), clean(vod.type), clean(vod.year)];
  var subtitle = [];
  for (var i = 0; i < bits.length; i++) {
    if (bits[i] && bits[i] !== '0' && subtitle.indexOf(bits[i]) < 0) subtitle.push(bits[i]);
  }
  return {
    id: id,
    title: clean(vod.name) || ('视频 ' + rawId),
    cover: String(vod.pic == null ? '' : vod.pic),
    subtitle: subtitle.slice(0, 2).join(' · '),
  };
}

// 首页/搜索页的 SSR 数据（卡片链接带 sourceKey，例 /14-134310）
function parseItems(html) {
  var text = String(html || '');
  var prefixes = {};
  var hrefRe = /href="\/(\d+)-(\d+)"/g;
  var matched;
  while ((matched = hrefRe.exec(text)) !== null) prefixes[matched[2]] = matched[1];

  var items = [];
  var seen = {};
  // 字段顺序不一：首页带 blurb，搜索页没有；只固定前三个字段，m3u8 从尾巴里再取。
  var re = /\{id:(\d+),name:"((?:[^"\\]|\\.)*)",pic:"((?:[^"\\]|\\.)*)",([\s\S]{0,600}?)\}/g;
  while ((matched = re.exec(text)) !== null) {
    var rawId = matched[1];
    var id = prefixes[rawId] ? prefixes[rawId] + '-' + rawId : rawId;
    if (seen[id]) continue;
    var tail = matched[4] || '';
    var media = /m3u8:"((?:[^"\\]|\\.)*)"/.exec(tail);
    seen[id] = true;
    items.push({
      id: id,
      title: clean(matched[2]),
      cover: String(matched[3] || '').replace(/\\\//g, '/'),
      m3u8: media ? String(media[1] || '').replace(/\\\//g, '/') : '',
    });
  }
  return items;
}

async function cachedItems(path) {
  var key = 'l-' + String(path).replace(/[^a-z0-9]/gi, '_').slice(0, 40) + '.json';
  var cached = await readJson(key);
  if (cached && cached.at && Date.now() - Number(cached.at) < CACHE_TTL_MS) return cached.items;
  var items = parseItems(await fetchText(path));
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

// 详情数据：/<sourceKey>-<id>/__data.json → {vod:{...}}
async function detailVod(sourceKey, rawId) {
  var payload = await fetchJson('/' + sourceKey + '-' + rawId + '/__data.json');
  var data = devalue(payload);
  return data && data.vod ? data.vod : null;
}

function parseItemId(text) {
  var matched = /^(\d+)-(\d+)$/.exec(String(text == null ? '' : text));
  if (matched) return { sourceKey: matched[1], id: matched[2], key: matched[1] + '-' + matched[2] };
  var num = String(text == null ? '' : text).replace(/[^0-9]/g, '');
  return num ? { sourceKey: '', id: num, key: num } : null;
}

var LumeSource = {
  id: 'aiboaibo_video',
  name: '爱播爱播',
  version: '2.0.0',
  category: 'video',
  contentCategory: 'adult',
  settingsApiVersion: 2,
  requiresSettings: ['settingsActions'],
  mirrors: [
    'https://www.994555.xyz',
    'https://www.455333.xyz',
    'https://www.466333.xyz',
    'https://www.477333.xyz',
    'https://www.488333.xyz',
    'https://www.4545.eu.org',
    'https://4599.pages.dev',
    'https://55511.pages.dev',
  ],
  settings: [
    {
      key: 'publishPage',
      type: 'action',
      action: 'openWebsite',
      title: '打开发布页',
      url: 'https://didizhi.pages.dev/',
      description: '官方发布页（永不失联）：列出 pages.dev 镜像与 455333/466333/477333/488333 等主域',
    },
    {
      key: 'note',
      type: 'info',
      title: '站点说明',
      description: '爱播爱播（SvelteKit SSR + /category/__data.json）。分类 = 来源 11/12 的栏目，分页真实生效；播放为 HLS 直链，不需要 Referer。',
    },
  ],

  async categories() {
    return CATEGORIES.slice(0);
  },

  async home() {
    var ssr = await cachedItems('/');
    if (!ssr.length) return [];
    return [
      {
        title: '首页推荐',
        moreUrl: 's11:0',
        items: ssr.slice(0, 12).map(function (row) {
          return { id: row.id, title: row.title, cover: row.cover, subtitle: '' };
        }),
      },
    ];
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page < 1) page = 1;
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();

    if (keyword) {
      var found = await cachedItems('/search?q=' + encodeURIComponent(keyword));
      return {
        items: found.map(function (row) {
          return { id: row.id, title: row.title, cover: row.cover, subtitle: '' };
        }),
        hasMore: false,
      };
    }

    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var matched = /^s(\d+):(\d+)$/.exec(categoryId);
    var sourceKey = matched ? Number(matched[1]) : 11;
    var tid = matched ? Number(matched[2]) : 0;

    var data = await categoryData(sourceKey, tid, page);
    var vods = data.vods || [];
    var items = [];
    for (var i = 0; i < vods.length; i++) {
      var item = vodItem(vods[i]);
      if (item) items.push(item);
    }
    var totalPages = Number(data.totalPages) || 0;
    return { items: items, hasMore: totalPages ? page < totalPages : items.length > 0 };
  },

  async detail(argument) {
    var parsed = parseItemId(argument && argument.id);
    if (!parsed) return null;
    var vod = null;
    if (parsed.sourceKey) {
      try {
        vod = await detailVod(parsed.sourceKey, parsed.id);
      } catch (error) {
        vod = null;
      }
    }
    var row = vod ? null : await findItem(parsed.key);
    if (!vod && !row) return null;
    var title = vod ? clean(vod.name) : row.title;
    var cover = vod ? String(vod.pic || '') : row.cover;
    var bits = vod ? [clean(vod.remarks), clean(vod.type), clean(vod.year)] : [];
    var subtitle = [];
    for (var i = 0; i < bits.length; i++) {
      if (bits[i] && bits[i] !== '0' && subtitle.indexOf(bits[i]) < 0) subtitle.push(bits[i]);
    }
    return {
      id: parsed.key,
      title: title || ('视频 ' + parsed.id),
      cover: cover,
      subtitle: subtitle.join(' · '),
      description: '源站：' + base() + '/' + (parsed.sourceKey || '11') + '-' + parsed.id + '\n'
        + (vod && clean(vod.blurb) ? clean(vod.blurb) + '\n' : '')
        + '列表/详情来自站点 SSR 与 __data.json，播放为 HLS 直链。',
    };
  },

  async chapters(argument) {
    var parsed = parseItemId(argument && argument.id);
    if (!parsed) return [];
    return [{ id: 'video:' + parsed.key, title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    var parsed = parseItemId(args.id);
    if (!parsed) throw new Error('缺少视频 ID');
    var vod = null;
    if (parsed.sourceKey) {
      try {
        vod = await detailVod(parsed.sourceKey, parsed.id);
      } catch (error) {
        vod = null;
      }
    }
    var url = vod ? String(vod.m3u8 || vod.playUrl || '') : '';
    if (!url) {
      var row = await findItem(parsed.key);
      url = row && row.m3u8 ? row.m3u8 : '';
    }
    if (!url) throw new Error('这条没有播放地址（站点可能已下架）');
    return { kind: 'video', url: url, headers: { Referer: base() + '/', 'User-Agent': UA } };
  },
};
