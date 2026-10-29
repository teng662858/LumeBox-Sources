// LumeSource: {"id":"s618_video","name":"618影院","version":"1.0.1","category":"video","contentCategory":"adult","mirrors":["https://618208.xyz","https://6181029.xyz","https://618600.xyz"],"network":"direct","icon":"https://618208.xyz/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：618 影院（`618<码>.xyz` 全域；入口 https://618208.xyz）
//
// 一、首页是什么（按用户截图核对）
//   打开 618208.xyz 只有一个 2×5 的表格：一区 二区 三区 四区 五区 / 六区 七区 八区 九区 漫画。
//   它是**地址轮换表**：页面加载时跑一段脚本，用 crypto.getRandomValues()%30 在每个区的 95 个域名码里
//   随机挑一个，拼成
//     https://618<码>.xyz/index.php/{vod|art}/type/id/{X}.html
//   所以每格点进去都是"另一个域名上的某个 CMS 分类页"，不是同一个站的不同页面。
//   去重后共 847 个域名（码表在 donk666.duokkq.com/center_upload/2026/1012/2fadb9de….js 里）。
//
// 二、文字是 XOR 0x80 混淆（"抓下来和网页显示不一样"的直接原因）
//   页面把导航/标题包在 class="km-script" 里，再跑 `String.fromCharCode(128 ^ charCodeAt(i))` 还原：
//     `凨遨襆頑` → `全部视频`，`ゐ摦輹睭勧ゑ菒酎祘镻忕` → `【擦边短剧】荒野秘闻录`
//   （我用真实浏览器对比过：浏览器里正常，纯 HTTP 抓下来是乱码 —— 差的就是这一步 XOR。）
//
// 三、列表页直接带播放地址（一区/五区 实测）
//   <a class="vodbox" href="/html/….html?v=<m3u8>&b=<封面>"><p class="km-script">标题</p></a>
//   二区/三区是 `?m=<id>` 形式（播放器由站内 xgplayer+hls 现拼）→ 本源按 webplayer 交付。
//
// 四、十个区在当前域名（618208.xyz）的实测状态（2026-10-28）
//   一区 vod/13   20 条 · 全部 ?v= 直连 m3u8（200 + #EXTM3U）
//   二区 vod/1    20 条 · 全部 ?m= → webplayer
//   三区 vod/1    同上
//   四区 art/5    图集列表（/index.php/art/detail/id/…），但详情页 500 → 暂不出条目
//   五区 vod/2    20 条 · 全部 ?v= 直连 m3u8
//   六/七/八 vod/43、40、66  纯分类导航（无条目）；九区 vod/35 → 500；漫画 art/27 同四区
//   → 本源对空区会**再展开一层子分类**尝试拿内容，仍为空就返回空列表（不报假数据）。
// 18+

var SEED_HOSTS = ['https://618208.xyz'];
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var BASE_TTL_MS = 30 * 60 * 1000;
var ITEM_TTL_MS = 6 * 3600 * 1000;

var ZONES = [
  { id: 'z1', title: '一区', kind: 'vod', type: '13' },
  { id: 'z2', title: '二区', kind: 'vod', type: '1' },
  { id: 'z3', title: '三区', kind: 'vod', type: '1' },
  { id: 'z4', title: '四区', kind: 'art', type: '5' },
  { id: 'z5', title: '五区', kind: 'vod', type: '2' },
  { id: 'z6', title: '六区', kind: 'vod', type: '43' },
  { id: 'z7', title: '七区', kind: 'vod', type: '40' },
  { id: 'z8', title: '八区', kind: 'vod', type: '66' },
  { id: 'z9', title: '九区', kind: 'vod', type: '35' },
  { id: 'z10', title: '漫画', kind: 'art', type: '27' },
];

function zoneOf(id) {
  for (var i = 0; i < ZONES.length; i++) if (ZONES[i].id === id) return ZONES[i];
  return ZONES[0];
}

function xor80(text) {
  var out = '';
  var s = String(text == null ? '' : text);
  for (var i = 0; i < s.length; i++) out += String.fromCharCode(s.charCodeAt(i) ^ 128);
  return out;
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

function configuredBase() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return domain ? domain.replace(/\/+$/, '') : '';
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

async function httpGet(url, referer) {
  try {
    var reply = await LumeSource.http.get(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Referer: referer || 'https://618208.xyz/',
      },
    });
    var status = reply ? reply.status : 0;
    if (status !== 200) return '';
    return reply.body ? String(reply.body) : '';
  } catch (error) {
    return '';
  }
}

// 从入口页拿地址表脚本，解析出 618<码> 域名（最多 24 个候选）
async function harvestingHosts() {
  var hosts = [];
  var seen = {};
  for (var i = 0; i < SEED_HOSTS.length; i++) {
    var seed = SEED_HOSTS[i];
    if (!seen[seed]) {
      seen[seed] = true;
      hosts.push(seed);
    }
    var html = await httpGet(seed + '/');
    if (!html) continue;
    var scriptMatch = /<script[^>]+src="([^"]+\.js)"/.exec(html);
    if (!scriptMatch) continue;
    var js = await httpGet(scriptMatch[1], seed + '/');
    if (!js) continue;
    var arr = /zuArr\s*=\s*\[([\s\S]*?)\]\s*;/.exec(js);
    if (!arr) continue;
    var codes = arr[1].replace(/[\[\]']/g, ' ').split(/[,\s]+/);
    for (var k = 0; k < codes.length && hosts.length < 24; k++) {
      var code = codes[k];
      if (!/^\d{2,5}$/.test(code)) continue;
      var host = 'https://618' + code + '.xyz';
      if (seen[host]) continue;
      seen[host] = true;
      hosts.push(host);
    }
  }
  return hosts;
}

async function resolveBase() {
  var forced = configuredBase();
  if (forced) return forced;
  var cached = await readJson('base.json');
  if (cached && cached.base && Date.now() - Number(cached.at) < BASE_TTL_MS) return cached.base;

  var hosts = await harvestingHosts();
  for (var i = 0; i < hosts.length; i++) {
    var probe = await httpGet(hosts[i] + '/index.php/vod/type/id/13.html', hosts[i] + '/');
    if (probe && probe.indexOf('vodbox') >= 0) {
      await writeJson('base.json', { at: Date.now(), base: hosts[i] });
      return hosts[i];
    }
  }
  return hosts[0] || SEED_HOSTS[0];
}

// ---------------------------------------------------------------- 解析

function parseCards(html) {
  var text = String(html || '');
  var items = [];
  var blocks = text.split('class="vodbox"');
  for (var i = 1; i < blocks.length; i++) {
    var block = blocks[i];
    var hrefMatch = /href="([^"]+)"/.exec(block);
    if (!hrefMatch) continue;
    var href = hrefMatch[1].replace(/&amp;/g, '&');
    if (!/[?&](v|m)=/.test(href)) continue;
    var playUrl = '';
    var vMatch = /[?&]v=([^&"]+)/.exec(href);
    if (vMatch) {
      try {
        playUrl = decodeURIComponent(vMatch[1]);
      } catch (error) {
        playUrl = vMatch[1];
      }
    }
    var coverMatch = /data-original="([^"]+)"/.exec(block);
    var titleMatch = /<p[^>]*class="[^"]*km-script[^"]*"[^>]*>([\s\S]{1,200}?)<\/p>/.exec(block);
    var title = titleMatch ? clean(xor80(titleMatch[1])) : '';
    if (!title) {
      var alt = /alt="([^"]{1,120})"/.exec(block);
      title = alt ? clean(xor80(alt[1])) : '未命名';
    }
    items.push({
      id: href,
      title: title,
      cover: coverMatch ? String(coverMatch[1]) : '',
      subtitle: playUrl ? 'HLS 直连' : '网页播放',
      playUrl: playUrl,
    });
  }
  return items;
}

function subTypeIds(html) {
  var ids = [];
  var seen = {};
  var re = /href="\/index\.php\/vod\/type\/id\/(\d+)\.html"/g;
  var matched;
  while ((matched = re.exec(String(html || ''))) !== null) {
    var id = matched[1];
    if (seen[id]) continue;
    seen[id] = true;
    ids.push(id);
  }
  return ids;
}

// 子分类名同样是 XOR 0x80（`餙藉簾呁` → `香蕉精品`）。
// 只收 vod 分类链接；art（图集）分类在详情页 500，不进筛选。
function parseSubTypes(html) {
  var out = [];
  var seen = {};
  var re = /<a[^>]+href="\/index\.php\/vod\/type\/id\/(\d+)\.html"[^>]*>([\s\S]{1,200}?)<\/a>/g;
  var matched;
  while ((matched = re.exec(String(html || ''))) !== null) {
    var id = matched[1];
    if (seen[id]) continue;
    var title = clean(xor80(matched[2]));
    if (!title || /^全部/.test(title)) continue;
    seen[id] = true;
    out.push({ id: id, title: title });
  }
  return out;
}

function pagePath(zone, page, type) {
  var n = Number(page) || 1;
  var t = type || zone.type;
  var base = '/index.php/' + zone.kind + '/type/id/' + t + '.html';
  return n <= 1 ? base : '/index.php/' + zone.kind + '/type/id/' + t + '/page/' + n + '.html';
}

async function remember(items) {
  if (!items.length) return;
  var cached = (await readJson('items.json')) || { at: 0, map: {} };
  var map = cached.map || {};
  for (var i = 0; i < items.length; i++) {
    map[items[i].id] = { title: items[i].title, cover: items[i].cover, playUrl: items[i].playUrl || '' };
  }
  await writeJson('items.json', { at: Date.now(), map: map });
}

// 取某个区的内容：先直取；空页则展开一层子分类
// type 非空时只取该子分类（筛选里选中的类型），不再跨子分类拼凑。
async function zoneItems(zone, page, type) {
  var base = await resolveBase();
  var picked = type || zone.type;
  var html = await httpGet(base + pagePath(zone, page, picked), base + '/');
  var items = parseCards(html);
  if (items.length) {
    await remember(items);
    return items;
  }
  if (Number(page) > 1 || type) return [];
  var subs = subTypeIds(html).filter(function (id) { return id !== zone.type; }).slice(0, 3);
  var merged = [];
  for (var i = 0; i < subs.length; i++) {
    var subHtml = await httpGet(base + pagePath(zone, 1, subs[i]), base + '/');
    var subItems = parseCards(subHtml);
    if (!subItems.length) continue;
    merged = merged.concat(subItems);
    if (merged.length >= 20) break;
  }
  if (merged.length) await remember(merged);
  return merged;
}

var LumeSource = {
  id: 's618_video',
  name: '618影院',
  version: '1.0.1',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://618208.xyz', 'https://6181029.xyz', 'https://618600.xyz'],

  async categories() {
    var list = [];
    for (var i = 0; i < ZONES.length; i++) list.push({ id: ZONES[i].id, title: ZONES[i].title });
    return list;
  },

  async home() {
    var boards = [];
    for (var i = 0; i < ZONES.length && boards.length < 3; i++) {
      try {
        var items = await zoneItems(ZONES[i], 1);
        if (!items.length) continue;
        boards.push({
          title: ZONES[i].title,
          moreUrl: ZONES[i].id,
          items: items.slice(0, 12).map(function (row) {
            return { id: row.id, title: row.title, cover: row.cover, subtitle: row.subtitle };
          }),
        });
      } catch (error) {
        /* 这个区在当前域名没内容，跳过 */
      }
    }
    return boards;
  },

  // 筛选：**不要**再把 10 个区当筛选组返回（那会和上面 categories 的第一行完全重复）。
  // 这里按当前选中的区实时抓它的子分类（`全部视频/女同专属/素人出演…`），
  // 选一个子分类后 list() 只取该类型；抓不到就返回空组，不影响分类行。
  async filters(argument) {
    var args = argument || {};
    var zone = zoneOf(String(args.categoryId == null ? '' : args.categoryId).trim());
    try {
      var base = await resolveBase();
      var html = await httpGet(base + pagePath(zone, 1), base + '/');
      var subs = parseSubTypes(html);
      if (!subs.length) return { groups: [] };
      var options = [];
      for (var i = 0; i < subs.length; i++) options.push({ id: subs[i].id, title: subs[i].title });
      return { groups: [{ id: 'sub', title: '子分类', options: options }] };
    } catch (error) {
      return { groups: [] };
    }
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    if (filters.category) categoryId = 'z' + String(filters.category).trim().replace(/^z/, '');
    var zone = zoneOf(categoryId);
    // 子分类 id 直接就是站点的 vod type id（纯数字）
    var sub = String(filters.sub == null ? '' : filters.sub).trim();
    var type = /^\d+$/.test(sub) ? sub : '';
    var items = await zoneItems(zone, page, type);
    return {
      items: items.map(function (row) {
        return { id: row.id, title: row.title, cover: row.cover, subtitle: row.subtitle };
      }),
      hasMore: items.length >= 20,
    };
  },

  async detail(argument) {
    var raw = String((argument && argument.id) || '').trim();
    if (!raw) return null;
    var base = await resolveBase();
    var id = /^https?:\/\//.test(raw) ? raw : base + raw;
    var cached = (await readJson('items.json')) || { map: {} };
    var map = cached.map || {};
    var row = map[raw] || map[id] || null;
    return {
      id: raw,
      title: row && row.title ? row.title : '视频',
      cover: row && row.cover ? row.cover : '',
      subtitle: row && row.playUrl ? 'HLS 直连' : '网页播放',
      description:
        '入口表：https://618208.xyz（每次刷新换域名）\n' +
        (row && row.playUrl ? '播放地址：' + row.playUrl : '这条是 ?m= 类型，播放交给 App 内嵌浏览器（站内 xgplayer+hls 现拼地址）。'),
    };
  },

  async chapters(argument) {
    var raw = String((argument && argument.id) || '').trim();
    if (!raw) return [];
    return [{ id: 'main:0', title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    var raw = String(args.id || '').trim();
    if (!raw) throw new Error('缺少视频地址');
    var base = await resolveBase();
    var id = /^https?:\/\//.test(raw) ? raw : base + raw;
    var cached = (await readJson('items.json')) || { map: {} };
    var map = cached.map || {};
    var row = map[raw] || map[id] || null;
    if (row && row.playUrl) {
      return { kind: 'video', url: row.playUrl, headers: { Referer: 'https://618208.xyz/', 'User-Agent': UA } };
    }
    return { kind: 'webplayer', url: id };
  },
};
