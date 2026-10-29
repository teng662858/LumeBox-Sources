// LumeSource: {"id":"uncams_video","name":"UN Cams","version":"1.0.1","category":"video","mirrors":["https://uncams.com"]}
//
// 站点：UN Cams（uncams.com，Chaturbate / highwebmedia 白标直播站，18+）
// 快照：.tmp_probe/cf/uncams.html（90KB，apex 首页 SSR）
//
// ── 域名/入口实测（2026-10-25，本机 127.0.0.1:7890 代理）────────────────────────
//   · apex `https://uncams.com`     curl / 浏览器 **200**，SSR 里直接有 66 张
//     `<a href="/{username}" class="model-card …">` 卡片，封面在
//     `https://thumb.live.mmcdn.com/ri/{username}.jpg`（= Chaturbate 的 CDN）。
//     但 **Node/undici 的 TLS 指纹被 Cloudflare 判成机器人**：同一条 URL 直连一律 403
//     （5483 字节 "Attention Required!" 拦截页），换 UA、补 sec-ch-ua / sec-fetch 全套
//     浏览器头都没用；curl（HTTP/2）依旧 200。→ 直连 HTML 这条路在检查器里必然 403。
//   · `/api/v3/cam/details?id={username}`、`/api/category?slug=` 也同样被 node 403。
//   · `https://www.uncams.com`（同一品牌、Chaturbate 线路）**node 直连 200**，而且有
//     公开 JSON 接口：
//        GET /api/ts/roomlist/room-list/?enable_recommendations=false&limit=60&offset=N&genders=f|m|c|t
//        → { rooms:[{username, img, num_users, display_age, location, gender, tags,
//                    current_show, is_new, private_price, …}], total_count }
//     · 搜索：**只有 `&keywords=` 真的过滤**（实测 keywords=bella → bellamur_ / itsbellaaa /
//       bellalima）；`&search=` 和 `&username=` 被服务端忽略，回的是同一批随机房间。
//     实测 limit 上限 60（120 → rooms 为空），offset 可翻；genders=f 4266 / m 1052 /
//     c 320 / t 673 在播。**同一批 username 与 apex 页面里的完全一致**（lindseysweeney、
//     emma_lu1、mayabaee1 …），所以本源优先走这个 JSON，拿到的就是同一份目录。
//
// ── 播放（为什么是 webplayer）──────────────────────────────────────────────────
//   · 房间页 /{username}（apex 与 www 都是根路径）SSR 里 **没有 <video> / m3u8 / 流字段**。
//   · 官方嵌入页 `https://www.uncams.com/embed/{username}/`（126KB）里确实有
//     `"hls_source": "https://edge16-sin.live.mmcdn.com/v1/edge/streams/origin.{user}.{uid}/llhls.m3u8?token=…"`
//     ——但实测把这个 token 原样拿出来请求（带/不带同一批 __cf_bm + sbr + csrftoken cookie、
//     带 Referer/Origin）一律 **403 `w3: claims_denied`**：token 绑定的是播放器实例而不是
//     HTTP 会话，脚本侧拿不到可播的直链。
//   · 所以 content() 返回 webplayer，pageUrl 指向**官方嵌入播放器页**（为 iframe 设计，
//     比把用户丢进整站房间页更干净），App 的网页播放器直接就能播。
var DEFAULT_BASE = 'https://uncams.com';
var WWW_BASE = 'https://www.uncams.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
var PAGE_SIZE = 60;
var THUMB_FALLBACK = 'https://thumb.live.mmcdn.com/ri/';

// genders: f=女 c=情侣 m=男 t=跨性别（接口里 t 返回的 gender 字段是 's'）
var CATEGORIES = [
  { id: 'f', title: '女主播' },
  { id: 'c', title: '情侣直播' },
  { id: 'm', title: '男主播' },
  { id: 't', title: '跨性别' }
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : '';
  return (domain || DEFAULT_BASE).replace(/\/+$/, '');
}

function absolute(url) {
  var text = String(url == null ? '' : url).trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.indexOf('//') === 0) return 'https:' + text;
  if (text.charAt(0) === '/') return WWW_BASE + text;
  return WWW_BASE + '/' + text;
}

function decode(text) {
  return String(text == null ? '' : text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, function (all, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/&#(\d+);/g, function (all, code) {
      return String.fromCharCode(Number(code));
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function headers(extra) {
  var result = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, text/html, */*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: WWW_BASE + '/'
  };
  for (var key in extra || {}) {
    if (Object.prototype.hasOwnProperty.call(extra, key)) result[key] = extra[key];
  }
  return result;
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function getText(url, accept) {
  var lastStatus = 0;
  // 房间目录接口按 IP 有分钟级配额，实测密集调用会 429（等一会儿又恢复）。
  // 429/503 时退避重试两轮（2s、5s）再放弃，总耗时仍远小于 App 的单次预算。
  var delays = [0, 2000, 5000];
  for (var attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await sleep(delays[attempt]);
    var response = await LumeSource.http.get(url, {
      headers: headers({ Accept: accept || 'text/html,application/xhtml+xml,*/*;q=0.8' })
    });
    lastStatus = response ? response.status : 0;
    var body = String((response && response.body) || '');
    if (lastStatus === 200) return body;
    if (lastStatus !== 429 && lastStatus !== 503) break;
  }
  throw new Error('UN Cams 打不开：HTTP ' + lastStatus + ' ' + url +
    (lastStatus === 429 ? '（接口限流，稍等几十秒再试）' : ''));
}

async function getRooms(gender, limit, offset, keyword) {
  var url = WWW_BASE + '/api/ts/roomlist/room-list/?enable_recommendations=false&limit=' + limit +
    '&offset=' + offset + (gender ? '&genders=' + encodeURIComponent(gender) : '') +
    (keyword ? '&keywords=' + encodeURIComponent(keyword) : '');
  var body = await getText(url, 'application/json, text/plain, */*');
  if (body.charAt(0) !== '{') {
    throw new Error('UN Cams 返回的不是 JSON：' + body.slice(0, 120));
  }
  var data = JSON.parse(body);
  var rooms = Array.isArray(data.rooms) ? data.rooms : [];
  // 按性别分的那一页空了，就退回「不分性别」再自己筛一遍：
  // 站点偶尔会对某个 genders 值回空数组（不是报错），真机上的表现是整页「直播间接口没返回数据」。
  if (!rooms.length && gender) {
    var plain = await getText(
      WWW_BASE + '/api/ts/roomlist/room-list/?enable_recommendations=false&limit=' + limit +
        '&offset=' + offset,
      'application/json, text/plain, */*'
    );
    if (plain.charAt(0) === '{') {
      var all = JSON.parse(plain);
      var pool = Array.isArray(all.rooms) ? all.rooms : [];
      rooms = pool.filter(function (room) {
        var g = String((room && room.gender) || (room && room.genders) || '').toLowerCase();
        if (!g) return true;
        return g.charAt(0) === String(gender).charAt(0);
      });
      if (rooms.length) return { rooms: rooms, total: Number(all.total_count || 0) };
    }
  }
  return { rooms: rooms, total: Number(data.total_count || 0) };
}

function coverOf(room) {
  var img = String((room && room.img) || '').trim();
  if (img && /^https?:\/\//i.test(img)) return img;
  return THUMB_FALLBACK + encodeURIComponent(String((room && room.username) || '')) + '.jpg';
}

function itemOf(room) {
  var name = String((room && room.username) || '').trim();
  if (!name) return null;
  var parts = [];
  if (room.num_users) parts.push(Number(room.num_users) + ' 人观看');
  if (room.display_age) parts.push(room.display_age + ' 岁');
  if (room.location) parts.push(String(room.location));
  if (room.current_show && room.current_show !== 'public') parts.push(String(room.current_show));
  else if (room.private_price > 0) parts.push('私聊 ' + room.private_price + ' tokens');
  if (room.is_new) parts.push('NEW');
  if (room.tags && room.tags.length) parts.push('#' + room.tags.slice(0, 3).join(' #'));
  return {
    id: WWW_BASE + '/' + name + '/',
    title: name,
    cover: coverOf(room),
    subtitle: parts.join(' · ')
  };
}

function itemsOf(rooms) {
  var items = [];
  for (var index = 0; index < (rooms || []).length; index++) {
    var item = itemOf(rooms[index]);
    if (item) items.push(item);
  }
  return items;
}

function genderOf(category) {
  var value = String(category || '').trim();
  for (var index = 0; index < CATEGORIES.length; index++) {
    if (CATEGORIES[index].id === value) return value;
  }
  return 'f';
}

function idOf(argument) {
  return argument && argument.id ? String(argument.id).trim() : '';
}

function nameOf(value) {
  var text = String(value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) {
    var matched = /^https?:\/\/[^\/]+\/(?:embed\/)?([A-Za-z0-9_\-]+)\/?$/.exec(text);
    return matched ? matched[1] : '';
  }
  return text.replace(/^\/+|\/+$/g, '');
}

var LumeSource = {
  id: 'uncams_video',
  name: 'UN Cams',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://uncams.com'],

  async categories() {
    return CATEGORIES.slice();
  },

  async home() {
    var plans = [
      { gender: 'f', title: '女主播' },
      { gender: 'c', title: '情侣直播' },
      { gender: 'm', title: '男主播' }
    ];
    // 三类**串行**取：目录接口按 IP 有分钟级配额，三个并发一起打最容易一起 429/回空，
    // 真机上的表现就是首页直接「直播间接口没返回数据」。串行多花 1–2 秒但稳得多。
    var boards = [];
    var errors = [];
    for (var index = 0; index < plans.length; index++) {
      var plan = plans[index];
      try {
        var data = await getRooms(plan.gender, 24, 0);
        boards.push({ title: plan.title, moreUrl: plan.gender, items: itemsOf(data.rooms).slice(0, 24) });
      } catch (error) {
        errors.push(plan.title + '：' + ((error && error.message) || error));
        boards.push({ title: plan.title, moreUrl: plan.gender, items: [] });
      }
    }
    var kept = boards.filter(function (board) {
      return board.items.length > 0;
    });
    if (!kept.length) {
      // 三类都空：先把「是不是全网真的没人」问一遍（不带 genders 的目录），再决定报什么
      var fallback = null;
      try {
        fallback = await getRooms('', 24, 0);
      } catch (error) {
        fallback = null;
      }
      var filled = fallback ? itemsOf(fallback.rooms).slice(0, 24) : [];
      if (filled.length) return [{ title: '在线直播', moreUrl: 'f', items: filled }];
      throw new Error(
        'UN Cams：直播间接口没返回数据' +
          (errors.length ? '（' + errors.join('；') + '）' : '（三大类在播数都是 0，可能是当前出口 IP 被站点限流）')
      );
    }
    return kept;
  },

  async list(argument) {
    var settings = argument || {};
    var pageNo = Number(settings.page || 1);
    if (!pageNo || pageNo < 1) pageNo = 1;
    var keyword = settings.keyword ? String(settings.keyword).trim().toLowerCase() : '';
    var category = settings.categoryId ? String(settings.categoryId).trim() : '';

    if (keyword) {
      // 落 `keywords=` 参数（实测 `search=` / `username=` 都被忽略，只有 keywords 真的过滤：
      // keywords=bella → bellamur_ / itsbellaaa / bellalima）。
      var offsetHit = (pageNo - 1) * PAGE_SIZE;
      var found = await getRooms('', PAGE_SIZE, offsetHit, keyword);
      var all = itemsOf(found.rooms);
      // keywords 是**相关性**排序（结果里会混进不相关的房间），所以再按用户名包含关系收一遍；
      // 一个都不含（比如搜的是标签词）才退回站点自己的排序，不硬凑。
      var hits = [];
      for (var index = 0; index < all.length; index++) {
        if (String(all[index].title || '').toLowerCase().indexOf(keyword) >= 0) hits.push(all[index]);
      }
      if (!hits.length) hits = all;
      return {
        items: hits,
        hasMore: found.total ? offsetHit + all.length < found.total : all.length >= PAGE_SIZE
      };
    }

    var offset = (pageNo - 1) * PAGE_SIZE;
    var data = await getRooms(genderOf(category), PAGE_SIZE, offset);
    var items = itemsOf(data.rooms);
    var total = data.total || 0;
    return {
      items: items,
      hasMore: total ? offset + items.length < total : items.length >= PAGE_SIZE
    };
  },

  async detail(argument) {
    var name = nameOf(idOf(argument));
    if (!name) return null;
    var pageHtml = '';
    try {
      pageHtml = await getText(WWW_BASE + '/' + encodeURIComponent(name) + '/');
    } catch (error) {
      return { id: WWW_BASE + '/' + name + '/', title: name, cover: '', subtitle: '', description: '' };
    }
    var titleMatch = /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i.exec(pageHtml) ||
      /<title>([\s\S]*?)<\/title>/i.exec(pageHtml);
    var descMatch = /<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i.exec(pageHtml) ||
      /<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(pageHtml);
    var coverMatch = /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i.exec(pageHtml);
    var title = decode(titleMatch ? titleMatch[1] : '') || name;
    // og:title 形如 "Lindseysweeney camgirl — Live porn & free chat | Un Cams"，只留人名部分。
    title = title.split('—')[0].split('|')[0].split(' - ')[0].trim()
      .replace(/\s+camgirl$/i, '').trim() || name;
    return {
      id: WWW_BASE + '/' + name + '/',
      title: title,
      cover: coverMatch ? decode(coverMatch[1]) : '',
      subtitle: name + ' · 直播间',
      description: decode(descMatch ? descMatch[1] : '')
    };
  },

  async chapters(argument) {
    var name = nameOf(idOf(argument));
    if (!name) return [];
    return [{ id: name, title: '进入直播间' }];
  },

  async content(argument) {
    var name = nameOf((argument && (argument.chapterId || argument.id)) || '');
    if (!name) throw new Error('缺少主播用户名');
    // 直链不可得（token 绑播放器实例，见文件头），交给官方嵌入页的网页播放器。
    return {
      kind: 'webplayer',
      pageUrl: WWW_BASE + '/embed/' + encodeURIComponent(name) + '/',
      headers: { 'User-Agent': UA, Referer: WWW_BASE + '/' }
    };
  }
};
