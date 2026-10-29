// LumeSource: {"id":"familyporn_video","name":"Familyporn","version":"1.0.1","category":"video","network":"proxy","mirrors":["https://familyporn.tv"]}
//
// 站点：Familyporn.tv（https://familyporn.tv，英文 taboo/step- 题材免费 tube，全站 18+）
// 网络：本机实测 **直连超时、走代理 200**，所以标了 `network: proxy`（源设置里会提示要代理）。
//       封面也在同一台机器上（familyporn.tv/contents/videos_screenshots/…），代理是必须的。
//   KVS 内核，同族站点入口：18-virgin-sex / puremature / pervmom / milfaf …
//
// 结构（2026-10-25 实测，KVS）：
//   · 最新      GET /latest-updates/[page/]
//   · 站点列表  GET /sites/{slug}/[page/]       （/sites/18-virgin-sex/ 等，首页导航里就有）
//   · 分类索引  GET /categories/
//   · 卡片      <li class="item"><div class="thumb-horizontal">
//                 <a class="link" href="https://familyporn.tv/videos/{slug}/" title="{标题}">
//                   <div class="img-wrap"><img class="img" src="{封面}" data-preview="…preview.mp4/">
//                   <div class="duration">
//   · 详情      GET /videos/{slug}/           标题 <title>、flashvars 里的 video_url
//   · 播放      flashvars: video_url = `https://familyporn.tv/get_file/3/{hash}/…/{id}.mp4/?v-acctoken=…`
//               **注意：这里的 token 是必须的** —— 实测带 token → 206 video/mp4；
//               去掉 `?v-acctoken` → **403**（和云老婆正好相反，那边要去 token，这边不能去）。
//               所以本源保留原样，只做 `&amp;` 还原，并且每次播放都重新拉详情页拿新 token。
var BASE_URL = 'https://familyporn.tv';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return (domain || BASE_URL).replace(/\/+$/, '');
}

function absolute(url) {
  var text = String(url == null ? '' : url).trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.indexOf('//') === 0) return 'https:' + text;
  if (text.charAt(0) === '/') return base() + text;
  return base() + '/' + text;
}

function decode(text) {
  return String(text == null ? '' : text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headers(extra) {
  var result = {
    'User-Agent': UA,
    Accept: 'text/html,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: base() + '/'
  };
  for (var key in extra || {}) result[key] = extra[key];
  return result;
}

async function getText(target) {
  var url = /^https?:\/\//i.test(target) ? target : base() + (String(target).charAt(0) === '/' ? target : '/' + target);
  var response = await LumeSource.http.get(url, { headers: headers() });
  var status = response ? response.status : 0;
  if (status !== 200) throw new Error('Familyporn：请求失败 HTTP ' + status + ' ' + url);
  return String((response && response.body) || '');
}

function parseItems(html) {
  var items = [];
  var seen = {};
  var blocks = html.split('<li class="item"');
  for (var i = 1; i < blocks.length; i++) {
    var block = blocks[i].slice(0, 2000);
    var hrefMatch = /href="(https?:\/\/[^"]*\/videos\/[^"]+\/)"/.exec(block) || /href="(\/videos\/[^"]+\/)"/.exec(block);
    if (!hrefMatch) continue;
    var href = hrefMatch[1];
    if (seen[href]) continue;
    var titleMatch = /title="([^"]{2,200})"/.exec(block);
    var title = decode(titleMatch ? titleMatch[1] : '');
    if (!title) continue;
    var coverMatch = /class="img"[^>]+src="([^"]+)"/.exec(block) ||
      /<img[^>]+class="[^"]*img[^"]*"[^>]+data-webp="([^"]+)"/.exec(block) ||
      /<img[^>]+data-src="([^"]+)"/.exec(block) ||
      /<img[^>]+src="([^"]+)"/.exec(block);
    var cover = coverMatch ? absolute(String(coverMatch[1]).replace(/&amp;/g, '&')) : '';
    // 懒加载占位（data:/1x1 gif/空路径）不算封面，宁可留空让 App 画占位图
    if (!/^https?:\/\//i.test(cover) || /\/static\/images\//i.test(cover)) cover = '';
    var durMatch = /class="duration"[^>]*>([\s\S]{0,20}?)</.exec(block);
    seen[href] = true;
    items.push({
      id: absolute(href),
      title: title,
      cover: cover,
      subtitle: durMatch ? decode(durMatch[1]) : ''
    });
  }
  return items;
}

// flashvars 的 video_url / video_alt_url（高清）
// 坑：KVS 里有些条目的 `video_url` 指向付费墙（如 join.milfaf.com/gallery/…），
// 而 `event_reporting2` 虽然长得像播放链（…/45563.mp4/?v-acctoken=…），实际回的是**统计像素 GIF**。
// 所以这里只负责"收集候选"，真正可用性由 content() 用 Range 请求验 content-type 来定。
function qualitiesOf(html) {
  var list = [];
  var keys = [
    { key: 'video_url_hd', label: 'HD' },
    { key: 'video_alt_url', label: '720p' },
    { key: 'video_url', label: 'SD' }
  ];
  for (var i = 0; i < keys.length; i++) {
    var pattern = new RegExp(keys[i].key + ":\\s*'([^']+)'");
    var matched = pattern.exec(html);
    if (!matched) continue;
    var url = decode(matched[1]).replace(/&amp;/g, '&');
    if (!/\.(?:mp4|m3u8)/i.test(url)) continue;      // 付费墙那种链接直接丢
    if (!/\/get_file\//i.test(url)) continue;        // 只认 KVS 的媒体路径
    list.push({ title: keys[i].label, url: url });
  }
  return list;
}

// 用 Range 探一下：真的媒体文件才是 video/* 或 mpegurl，统计像素会是 image/gif
async function probeMedia(url, referer) {
  try {
    var response = await LumeSource.http.get(url, {
      headers: {
        'User-Agent': UA,
        Referer: referer || (base() + '/'),
        Range: 'bytes=0-1023',
        Accept: '*/*'
      }
    });
    var status = response ? response.status : 0;
    var type = '';
    var h = response && response.headers ? response.headers : {};
    for (var key in h) {
      if (String(key).toLowerCase() === 'content-type') type = String(h[key]).toLowerCase();
    }
    if (status !== 200 && status !== 206) return false;
    if (type.indexOf('video/') === 0) return true;
    if (type.indexOf('mpegurl') >= 0 || type.indexOf('mp2t') >= 0) return true;
    return false;
  } catch (error) {
    return false;
  }
}

var LumeSource = {
  id: 'familyporn_video',
  name: 'Familyporn',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://familyporn.tv'],

  async categories() {
    var list = [{ id: 'latest', title: '最新更新' }];
    try {
      var html = await getText('/');
      var pattern = /href="https:\/\/familyporn\.tv\/sites\/([^"\/]+)\/"[^>]*>([^<]{2,30})</g;
      var matched;
      var seen = {};
      while ((matched = pattern.exec(html)) !== null) {
        var slug = matched[1];
        var title = decode(matched[2]);
        if (!slug || seen[slug]) continue;
        seen[slug] = true;
        list.push({ id: 'site:' + slug, title: title || slug });
      }
    } catch (error) {
      /* 只留「最新更新」 */
    }
    if (list.length === 1) {
      list.push({ id: 'site:18-virgin-sex', title: '18 Virgin Sex' });
      list.push({ id: 'site:puremature', title: 'Pure Mature' });
      list.push({ id: 'site:pervmom', title: 'Perv Mom' });
    }
    return list;
  },

  async home() {
    var html = await getText('/latest-updates/');
    var items = parseItems(html);
    if (!items.length) throw new Error('Familyporn：首页没认出条目（站点可能改版）');
    return [{ title: '最新更新', moreUrl: 'latest', items: items.slice(0, 24) }];
  },

  /// 筛选：排序。站点的三个真实列表页——`/latest-updates/`、`/most-popular/`、`/top-rated/`
  /// （2026-10-29 实测都是 200 + 24 张封面；`/most-viewed/` 是 404，没有它）。
  /// 站点分类已经是 13 个一级入口，这里不再重复分类，避免两条一样的行。
  async filters() {
    return {
      groups: [
        {
          id: 'sort',
          title: '排序',
          options: [
            { id: 'latest', title: '最新更新' },
            { id: 'popular', title: '最受欢迎' },
            { id: 'rated', title: '最高评分' }
          ]
        }
      ]
    };
  },

  async list(argument) {
    var settings = argument || {};
    var pageNo = Number(settings.page || 1);
    if (!pageNo || pageNo < 1) pageNo = 1;
    var category = settings.categoryId ? String(settings.categoryId).trim() : 'latest';
    var keyword = settings.keyword ? String(settings.keyword).trim().toLowerCase() : '';
    var filters = settings.filters || {};
    var sort = String(filters.sort || '').trim();
    var path;
    if (category.indexOf('site:') === 0) {
      path = '/sites/' + category.slice(5) + '/' + (pageNo > 1 ? pageNo + '/' : '');
    } else if (sort === 'popular') {
      path = '/most-popular/' + (pageNo > 1 ? pageNo + '/' : '');
    } else if (sort === 'rated') {
      path = '/top-rated/' + (pageNo > 1 ? pageNo + '/' : '');
    } else {
      path = '/latest-updates/' + (pageNo > 1 ? pageNo + '/' : '');
    }
    var html = await getText(path);
    var items = parseItems(html);
    if (keyword) {
      items = items.filter(function (item) {
        return String(item.title).toLowerCase().indexOf(keyword) >= 0;
      });
    }
    return { items: items, hasMore: items.length >= 12 };
  },

  async detail(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return null;
    var html = await getText(id);
    var titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(html) || /<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html);
    var title = decode(titleMatch ? titleMatch[1] : '').replace(/\s*[-|]\s*Familyporn.*$/i, '').trim();
    if (!title) return null;
    var cover = '';
    var shotMatch = /(https:\/\/familyporn\.tv\/contents\/videos_screenshots\/[^"'\s]+?\.jpg)/.exec(html);
    if (shotMatch) cover = shotMatch[1];
    if (!cover) {
      var posterMatch = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html) ||
        /<video[^>]+poster="([^"]+)"/.exec(html);
      // 站点有些封面是 JS 模板（含 $ 占位），取到也不能用，直接跳过
      if (posterMatch && String(posterMatch[1]).indexOf('$') < 0) cover = posterMatch[1];
    }
    var descMatch = /<meta[^>]+name="description"[^>]+content="([^"]*)"/.exec(html);
    return {
      id: absolute(id),
      title: title,
      cover: cover ? absolute(cover) : '',
      subtitle: '视频',
      description: decode(descMatch ? descMatch[1] : '').slice(0, 300)
    };
  },

  async chapters(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return [];
    var html = await getText(id);
    var qualities = qualitiesOf(html);
    var chapters = [];
    for (var i = 0; i < qualities.length; i++) {
      if (await probeMedia(qualities[i].url, absolute(id))) chapters.push({ id: qualities[i].url, title: qualities[i].title });
    }
    if (chapters.length) return chapters;
    return [{ id: absolute(id), title: '正片' }];
  },

  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    var id = argument && argument.id ? String(argument.id).trim() : '';
    if (chapterId && /\.(mp4|m3u8)/i.test(chapterId)) {
      // 章节 id 是上次取的链，可能过期/可能是付费墙，先验一下再用
      if (await probeMedia(chapterId, id ? absolute(id) : base() + '/')) {
        return {
          kind: 'video',
          url: chapterId.replace(/&amp;/g, '&'),
          headers: { Referer: base() + '/', 'User-Agent': UA, Accept: '*/*' }
        };
      }
    }
    if (!id) throw new Error('Familyporn：缺少视频地址');
    var html = await getText(id);
    var qualities = qualitiesOf(html);
    if (qualities.length) {
      return {
        kind: 'video',
        url: qualities[0].url,
        headers: { Referer: absolute(id), 'User-Agent': UA, Accept: '*/*' }
      };
    }
    return { kind: 'webplayer', pageUrl: absolute(id), headers: headers() };
  }
};
