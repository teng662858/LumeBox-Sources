// LumeSource: {"id":"xtube_video","name":"XTUBE","version":"1.0.1","category":"video","mirrors":["https://zh.xtube.com"]}

// 站点：https://zh.xtube.com （2026-10-25 逐页实测；本机直连被封，全部走本机代理出口）
//
// 先说清一件事：现在的 zh.xtube.com 已经不是老 Xtube 点播站，而是 StripChat/Chapturist
// 白标**男主播直播**站（og:site_name=Xtube，静态资源在 assets.chapturist.com，CDN 是
// doppiocdn）。所以本源的“条目”＝在线主播，content 给的是直播 HLS master，
// 不是 VOD 整片 —— 站点本身没有公开的视频点播库。
//
// 实测到的结构：
//   首页/列表  GET /api/front/v2/models?primaryTag=men&limit=20&offset=0
//              （apiPrefix=/api/front 是页面里内联配置写死的；不带 primaryTag → 400
//                {"description":"invalid 'primaryTag' value"}，合法值实测只有
//                men / girls / couples / trans，male / female / gay 全部 400）
//              返回 { blocks:[{url,id,sortBy,models:[…]}], totalCount, hasRecommendedModels }
//              —— 是**版块聚合**（men/popular、men/new… 共 8 块），不是行式分页：
//              offset=0 / 100 / 5000 拿到的块集合一样、只是块内顺序和凑数不同，
//              limit 上限 48（limit=100 → 400），所以 limit=48 + 去重后一页约 80~90 个主播。
//              本源的 hasMore 按“还有下一页且本页满”给，翻页靠 offset 递增，能翻但顺序会有抖动。
//   主播页     GET /{username}   200（og:title="<username>直播表演"）
//              /profile/{u}、/men/{u}、/men/profile/{u} 全 404；**/men/cam/{u} 也是另一套落地页**，
//              真正的主播页就是根路径 /{username}。
//   播放       GET https://edge-hls.doppiocdn.org/hls/{streamName}/master/{streamName}_auto.m3u8
//              实测 200 + application/vnd.apple.mpegurl，正文以 #EXTM3U 开头，内含
//              source(480x640)/480p/240p 三档 EXT-X-STREAM-INF，子列表在 media-hls.doppiocdn.org。
//              模板来自页面内联配置：hlsStreamUrlTemplate="https://edge-hls.{cdnHost}/hls/{streamName}/master/{streamName}{suffix}.m3u8"，
//              cdnHost 默认 doppiocdn.org（doppiocdn1.net/.media/.live 同构，实测 .com/.org 都 200）。
//              **streamName 恒等于主播数字 id**（47 个样本全对：id=260706887 → streamName="260706887"）。
//   取 streamName：列表 JSON 里每条都带 id/streamName；但 detail/content 只拿到 URL，
//              而单个主播的接口 /api/front/v2/models/{u}、/models/username/{u}、/users/{u}
//              全是 404，主播页 SSRF 出来的 playerConfig 里 "model":null、"modelToken":""、
//              没有 streamName（那是客户端再请求后才填的）。
//              所以本源用「列表缓存 + 回退按 4 个 primaryTag 扫一遍」拿 streamName，实测一次命中。
//   搜索      没有搜索接口（/api/front/v2/models/search、/v3/models/search、/v2/search 全 404，
//              ?search= 参数被忽略）。keyword 只能在已取回的块里本地匹配 username，注释里写明。
//   封面      `previewUrlThumbSmall` 在接口里是相对路径（`/previews/a/2/4/…-thumb-small`），
//              但**图床不是 img.doppiocdn.org**：主播页内联 JSON 里同一个字段已经是绝对值
//              `https://static-proxy.strpst.com/previews/…`（1.0.1 实测 200 image/webp 3.6KB）。
//              旧版拼成 `https://img.doppiocdn.org{path}/{snapshotTimestamp}/{modelId}`，
//              实测三站图片域全是 404 → 封面整片空白。
//              现在的规则：接口给了绝对地址就直接用；只给相对路径就补 `static-proxy.strpst.com`；
//              连 preview 都没有才退回 avatarUrl（同样是 static-proxy）。
//              不要拿 404 当被拦信号（缺直播快照的主播本来就没有 preview）。
//
// 头：zh.xtube.com 对 iPhone UA 直接 **406**（实测 Version/17.0 Mobile 拿到 406、
// 桌面 Chrome 140 + Accept-Language 才 200），所以 UA 固定桌面 Chrome 140，
// 且必须带 Accept / Accept-Language，否则 406。
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
var DEFAULT_BASE = 'https://zh.xtube.com';
var IMAGE_HOST = 'https://static-proxy.strpst.com';
var TAGS = ['men', 'girls', 'couples', 'trans'];
var TAG_TITLES = { men: '男主播', girls: '女主播', couples: '情侣', trans: '跨性别' };
var BLOCK_TITLES = {
  mostPopularModels: '最热门',
  newModels: '新主播',
  recommended: '推荐',
  topRatedModels: '高分',
  tagModels: '标签精选',
  featuredModels: '精选'
};
// 主播缓存：username -> { streamName, presets, cover, live }
var CACHE = {};

function base() {
  var c = typeof LumeSource !== 'undefined' && LumeSource.config ? LumeSource.config : null;
  return String((c && c.domain) || DEFAULT_BASE).replace(/\/+$/, '');
}

function abs(url) {
  var t = String(url == null ? '' : url).trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (t.indexOf('//') === 0) return 'https:' + t;
  return base() + (t.charAt(0) === '/' ? t : '/' + t);
}

function text(value) {
  return String(value == null ? '' : value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headers(json) {
  var h = {
    'User-Agent': UA,
    'Accept': json ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': base() + '/'
  };
  return h;
}

function status(r) {
  if (!r) throw new Error('XTUBE：没有网络响应');
  var s = Number(r.status);
  if (s === 403 || s === 503 || s === 521) throw new Error('NEED_WEBVIEW_VERIFY：XTUBE 要求网页验证（HTTP ' + s + '）');
  if (s === 404) throw new Error('XTUBE：主播不存在或已下线（HTTP 404）');
  if (s !== 200) throw new Error('XTUBE：请求失败（HTTP ' + s + '）');
  return String(r.body || '');
}

async function getJson(path) {
  var r = await LumeSource.http.get(/^https?:\/\//i.test(path) ? path : base() + path, { headers: headers(true) });
  var body = status(r);
  try {
    return JSON.parse(body);
  } catch (e) {
    throw new Error('XTUBE：接口返回不是 JSON（' + body.slice(0, 120) + '）');
  }
}

async function getPage(path) {
  var r = await LumeSource.http.get(/^https?:\/\//i.test(path) ? path : base() + path, { headers: headers(false) });
  return status(r);
}

/// 封面：接口里的 previewUrlThumbSmall（绝对值直接用，相对路径补 static-proxy 图床），
/// 没有预览快照才退回头像。两者都缺 → null（交给 App 的占位图）。
function coverOf(model) {
  var row = model || {};
  var candidates = [row.previewUrlThumbSmall, row.previewUrlThumbBig, row.previewUrl, row.avatarUrlThumb, row.avatarUrl];
  for (var index = 0; index < candidates.length; index++) {
    var path = String(candidates[index] || '').trim();
    if (!path) continue;
    if (/^https?:\/\//i.test(path)) return path;
    if (path.indexOf('//') === 0) return 'https:' + path;
    return IMAGE_HOST + (path.charAt(0) === '/' ? path : '/' + path);
  }
  return null;
}

function remember(model) {
  var name = String(model && model.username ? model.username : '');
  if (!name) return;
  CACHE[name.toLowerCase()] = {
    streamName: String(model.streamName || model.id || ''),
    presets: Array.isArray(model.presets) ? model.presets : [],
    cover: coverOf(model),
    live: model.isOnline === true || model.isLive === true
  };
}

/// 一次接口请求 → 去重后的主播数组
async function fetchModels(tag, limit, offset) {
  var key = TAGS.indexOf(tag) >= 0 ? tag : 'men';
  var json = await getJson('/api/front/v2/models?primaryTag=' + key + '&limit=' + limit + '&offset=' + offset);
  var blocks = Array.isArray(json.blocks) ? json.blocks : [];
  var out = [], seen = {};
  for (var i = 0; i < blocks.length; i++) {
    var models = Array.isArray(blocks[i].models) ? blocks[i].models : [];
    for (var j = 0; j < models.length; j++) {
      var m = models[j];
      var name = String(m && m.username ? m.username : '');
      if (!name || seen[name]) continue;
      seen[name] = 1;
      remember(m);
      out.push(m);
    }
  }
  return { models: out, blocks: blocks, total: Number(json.totalCount) || 0 };
}

function toItem(model) {
  var name = String(model.username || '');
  var bits = [];
  if (Number(model.viewersCount)) bits.push(Number(model.viewersCount) + ' 观众');
  if (model.isOnline === false) bits.push('离线');
  var presets = Array.isArray(model.presets) ? model.presets.filter(function (p) { return String(p).indexOf('blurred') < 0; }) : [];
  if (presets.length) bits.push('最高 ' + presets[0]);
  return {
    id: abs('/' + name),
    title: name,
    cover: coverOf(model),
    subtitle: bits.join(' · ')
  };
}

var LumeSource = {
  id: 'xtube_video',
  name: 'XTUBE',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://zh.xtube.com'],

  async home() {
    var men = await fetchModels('men', 12, 0);
    var boards = [];
    for (var i = 0; i < men.blocks.length; i++) {
      var block = men.blocks[i];
      var list = Array.isArray(block.models) ? block.models : [];
      if (!list.length) continue;
      var title = BLOCK_TITLES[String(block.id)] || String(block.url || block.id || '男主播');
      boards.push({
        title: '男主播 · ' + title,
        items: list.map(toItem)
      });
    }
    if (!boards.length) throw new Error('XTUBE：首页没认出主播（接口结构可能改版）');
    return boards.slice(0, 6);
  },

  async categories() {
    return TAGS.map(function (tag) {
      return { id: tag, title: TAG_TITLES[tag] || tag };
    });
  },

  async list(argument) {
    var args = argument || {};
    var page = Math.max(1, Number(args.page) || 1);
    var keyword = text(args.keyword || '').trim().toLowerCase();
    var tag = String(args.categoryId == null ? '' : args.categoryId).trim();
    if (!keyword) {
      // 无关键词：走接口版块，一页 8 块 × 48 上限
      var page1 = await fetchModels(tag, 48, (page - 1) * 48);
      return {
        items: page1.models.map(toItem),
        hasMore: page1.models.length >= 20 && page < 20
      };
    }
    // 站点没有搜索接口（实测全 404），keyword 在四个标签的块里本地匹配 username
    var hits = [], seen = {};
    for (var t = 0; t < TAGS.length; t++) {
      var part = await fetchModels(TAGS[t], 48, 0);
      for (var i = 0; i < part.models.length; i++) {
        var name = String(part.models[i].username || '');
        if (!name || seen[name]) continue;
        if (name.toLowerCase().indexOf(keyword) < 0) continue;
        seen[name] = 1;
        hits.push(toItem(part.models[i]));
      }
    }
    return { items: hits, hasMore: false };
  },

  async detail(argument) {
    var id = String(argument && argument.id ? argument.id : '').trim();
    var m = /^https?:\/\/[^/]+\/([^/?#]+)\/?$/.exec(id) || /^\/([^/?#]+)\/?$/.exec(id);
    var name = m ? decodeURIComponent(m[1]) : '';
    if (!name) return null;
    var cached = CACHE[name.toLowerCase()] || null;
    var html = '';
    try {
      html = await getPage('/' + encodeURIComponent(name));
    } catch (e) {
      if (!cached) throw e;
    }
    var ogTitle = (/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i.exec(html) || [])[1] || '';
    var desc = (/<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(html) || [])[1] || '';
    var bits = [];
    if (cached && cached.presets.length) {
      bits.push(cached.presets.filter(function (p) { return String(p).indexOf('blurred') < 0; }).join('/'));
    }
    if (cached && cached.live) bits.push('直播中');
    return {
      id: abs('/' + name),
      title: text(ogTitle) || name,
      cover: (cached && cached.cover) || null,
      subtitle: bits.join(' · ') || '直播',
      description: text(desc)
    };
  },

  /// 直播源就是一条主列表（master m3u8 里已经带 source/480p/240p 三档），给一集。
  async chapters(argument) {
    var id = String(argument && argument.id ? argument.id : '').trim();
    if (!id) return [];
    return [{ id: 'live', title: '正片（直播）' }];
  },

  async content(argument) {
    var id = String(argument && argument.id ? argument.id : '').trim();
    var m = /^https?:\/\/[^/]+\/([^/?#]+)\/?$/.exec(id) || /^\/([^/?#]+)\/?$/.exec(id);
    var name = m ? decodeURIComponent(m[1]) : '';
    if (!name) throw new Error('XTUBE：认不出主播地址（' + id + '）—— id 应来自 list()');
    var stream = '';
    var cached = CACHE[name.toLowerCase()] || null;
    if (cached && cached.streamName) stream = cached.streamName;
    if (!stream) {
      // 回退：四个标签各扫一遍找这位主播（单个主播接口不存在，实测 404）
      for (var t = 0; t < TAGS.length && !stream; t++) {
        var part = await fetchModels(TAGS[t], 48, 0);
        for (var i = 0; i < part.models.length; i++) {
          if (String(part.models[i].username || '').toLowerCase() === name.toLowerCase()) {
            stream = String(part.models[i].streamName || part.models[i].id || '');
            break;
          }
        }
      }
    }
    if (!stream) throw new Error('XTUBE：没拿到 ' + name + ' 的 streamName（主播可能已下线）');
    var url = 'https://edge-hls.doppiocdn.org/hls/' + stream + '/master/' + stream + '_auto.m3u8';
    return {
      kind: 'video',
      url: url,
      headers: {
        'Referer': base() + '/',
        'User-Agent': UA,
        'Origin': base()
      }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LumeSource;
