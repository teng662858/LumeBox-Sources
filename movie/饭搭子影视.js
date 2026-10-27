// LumeSource: {"id":"fdzys","name":"饭搭子影视","version":"1.0.1","category":"video","mirrors":["https://fdzys.com"],"icon":"https://fdzys.com/template/mizhiady/statics/images/favicon.ico"}
//
// 站点：饭搭子影视（https://fdzys.com）
// 结构：苹果 CMS（MacCMS v10）的定制模板 mizhiady —— **vod JSON 接口是关的**，走 HTML：
//   · 分区入口   /movie  /tv  /dongman  /zongyi  /tiyu  /duanju
//   · 分类列表   /{分区}/all?page=N            （另有 /latest /hot /score 三种排序）
//   · 详情/播放  /{分区}/{slug}                → 电影单集直接内嵌播放器
//                /{分区}/{slug}/{nid}?sid=N    → 电视剧的第 nid 集、第 N 条线路
//   · 搜索       /vod/search?wd=关键词
//
// 播放地址在页面内嵌的 `var player_aaaa={…}` 里（MacCMS 标准结构）：
//   encrypt=0 明文直链；encrypt=1 是 unescape；encrypt=2 是 base64 + unescape。
// 沙箱里没有 atob/unescape，所以下面**自带 base64 解码与百分号解码**。
// 注意：这个站的单集页面很大（约 450 KB），一次调用只抓一页，别在同一调用里翻多页。
var BASE_URL = 'https://fdzys.com';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

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

async function fetchPage(path) {
  var url = /^https?:\/\//i.test(path) ? path : base() + path;
  var response = await LumeSource.http.get(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Referer: base() + '/'
    }
  });
  var status = response ? response.status : 0;
  if (status === 403 || status === 503) {
    throw new Error('NEED_WEBVIEW_VERIFY：饭搭子影视触发了 Cloudflare 人机校验（HTTP ' + status + '），请在源设置里走网页视图完成校验或配置代理');
  }
  if (status !== 200) throw new Error('饭搭子影视页面打不开：HTTP ' + status + ' ' + path);
  return response.body || '';
}

function clean(text) {
  return String(text == null ? '' : text)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// base64 解码（沙箱没有 atob）。
var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64Decode(input) {
  var text = String(input || '').replace(/[^A-Za-z0-9+/=]/g, '');
  var output = '';
  var buffer = 0;
  var bits = 0;
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if (ch === '=') break;
    var value = B64.indexOf(ch);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

// MacCMS 的 unescape（把 %uXXXX / %XX 还原成字符）。
function percentDecode(input) {
  var text = String(input || '');
  var out = '';
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if (ch !== '%') {
      out += ch;
      continue;
    }
    var hex = text.substr(i + 1, 2);
    if (text.charAt(i + 1) === 'u' || text.charAt(i + 1) === 'U') {
      hex = text.substr(i + 2, 4);
      var code = parseInt(hex, 16);
      if (!isNaN(code)) {
        out += String.fromCharCode(code);
        i += 5;
        continue;
      }
    }
    var byte = parseInt(hex, 16);
    if (!isNaN(byte)) {
      out += String.fromCharCode(byte);
      i += 2;
      continue;
    }
    out += ch;
  }
  return out;
}

function mediaUrl(raw, encrypt) {
  var url = String(raw == null ? '' : raw).trim();
  if (!url) return '';
  var mode = Number(encrypt || 0);
  if (mode === 1) url = percentDecode(url);
  else if (mode === 2) url = percentDecode(base64Decode(url));
  url = url.trim();
  if (/^https?%3A/i.test(url)) {
    try {
      url = decodeURIComponent(url);
    } catch (error) {
      /* 保持原样 */
    }
  }
  return url;
}

function parseItems(html) {
  var items = [];
  var seen = {};
  var chunks = String(html).split('myui-vodbox-content');
  for (var index = 1; index < chunks.length; index++) {
    var chunk = chunks[index].slice(0, 1400);
    var hrefMatch = /<a[^>]*href="([^"]+)"/.exec(chunk);
    if (!hrefMatch) continue;
    var href = hrefMatch[1];
    if (!/^https?:\/\//i.test(href) || seen[href]) continue;
    var altMatch = /alt="([^"]*)"/.exec(chunk);
    var coverMatch = /data-src="([^"]+)"/.exec(chunk);
    var title = clean(altMatch ? altMatch[1] : '');
    if (!title) continue;
    seen[href] = true;
    items.push({
      id: href,
      title: title,
      cover: absolute(coverMatch ? coverMatch[1] : '')
    });
  }
  return items;
}

// 详情页里的线路名：<li class="swiper-slide player_name" data-sid="2"><a …>无印云<span …
function routeNames(html) {
  var names = {};
  var pattern = /data-sid="(\d+)"[^>]*>\s*<a[^>]*>([\s\S]{0,80}?)<span/g;
  var matched;
  while ((matched = pattern.exec(html)) !== null) {
    var name = clean(matched[2]);
    if (name && !names[matched[1]]) names[matched[1]] = name;
  }
  return names;
}

function parsePlayer(html) {
  var at = html.indexOf('player_aaaa=');
  if (at < 0) return null;
  var end = html.indexOf('</script>', at);
  if (end < 0) end = html.length;
  var raw = html.slice(at + 'player_aaaa='.length, end).trim();
  if (raw.charAt(raw.length - 1) === ';') raw = raw.slice(0, -1);
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

var LumeSource = {
  id: 'fdzys',
  name: '饭搭子影视',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://fdzys.com'],

  async categories() {
    var sections = {
      movie: '电影',
      tv: '电视剧',
      dongman: '动漫',
      zongyi: '综艺',
      tiyu: '体育',
      duanju: '短剧'
    };
    var list = [];
    try {
      var home = await fetchPage('/');
      var pattern = /<a[^>]*href="https?:\/\/[^"]*\/(movie|tv|dongman|zongyi|tiyu|duanju)"[^>]*>([\s\S]{0,200}?)<\/a>/g;
      var matched;
      var seen = {};
      while ((matched = pattern.exec(home)) !== null) {
        var key = matched[1];
        if (seen[key]) continue;
        var title = clean(matched[2]) || sections[key] || key;
        // 首页导航里的文字偶尔带角标数字，取第一段中文。
        var chinese = /[\u4e00-\u9fa5]{1,6}/.exec(title);
        seen[key] = true;
        list.push({ id: key, title: chinese ? chinese[0] : title });
      }
    } catch (error) {
      list = [];
    }
    if (list.length < 3) {
      list = [
        { id: 'movie', title: '电影' },
        { id: 'tv', title: '电视剧' },
        { id: 'dongman', title: '动漫' },
        { id: 'zongyi', title: '综艺' },
        { id: 'tiyu', title: '体育' },
        { id: 'duanju', title: '短剧' }
      ];
    }
    return list;
  },

  async home() {
    var html = await fetchPage('/movie/all');
    var items = parseItems(html);
    return items.length ? [{ title: '最新电影', moreUrl: 'movie', items: items.slice(0, 18) }] : [];
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!page || page < 1) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';
    if (keyword) {
      // 站内搜索是 JS 渲染的（结果不在 HTML 里），但它自己的联想接口是 JSON：
      // /index.php/ajax/suggest?mid=1&wd=… → {list:[{id,name,en,pic}]}
      // slug（en）与分区无关，/movie/{slug} 即可打开对应详情页。
      var raw = await fetchPage('/index.php/ajax/suggest?mid=1&wd=' + encodeURIComponent(keyword) + '&limit=20');
      var data = null;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        data = null;
      }
      var rows = data && Array.isArray(data.list) ? data.list : [];
      var hits = [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row || !row.en || !row.name) continue;
        hits.push({
          id: base() + '/movie/' + row.en,
          title: String(row.name),
          cover: absolute(row.pic || '')
        });
      }
      return { items: hits, hasMore: false };
    }
    var section = category || 'movie';
    var path = '/' + section + '/all' + (page > 1 ? '?page=' + page : '');
    var html = await fetchPage(path);
    var next = new RegExp('page=' + (page + 1) + '(?!\\d)');
    return { items: parseItems(html), hasMore: next.test(html) };
  },

  async detail(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return null;
    var html = await fetchPage(id);
    var titleMatch = /<h1[^>]*>([\s\S]{0,120}?)<\/h1>/.exec(html) ||
      /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/.exec(html);
    var title = clean(titleMatch ? titleMatch[1] : '');
    if (!title) return null;
    title = title.replace(/[_｜|].*$/, '').replace(/(免费在线观看|高清完整版).*$/, '').trim();
    var coverMatch = /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/.exec(html);
    var descMatch = /<meta[^>]+property="og:description"[^>]+content="([^"]*)"/.exec(html);
    var description = clean(descMatch ? descMatch[1] : '').split('｜')[0].trim();
    var player = parsePlayer(html);
    var note = player && player.vod_data && player.vod_data.vod_class ? String(player.vod_data.vod_class) : '';
    return {
      id: id,
      title: title,
      cover: absolute(coverMatch ? coverMatch[1] : ''),
      subtitle: note,
      description: description
    };
  },

  async chapters(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return [];
    var html = await fetchPage(id);
    var names = routeNames(html);
    var chapters = [];
    var seen = {};
    var panes = String(html).split('class="tab-pane');
    for (var index = 1; index < panes.length; index++) {
      var pane = panes[index];
      var sidMatch = /data-sid="(\d+)"/.exec(pane.slice(0, 200));
      var sid = sidMatch ? sidMatch[1] : '';
      var route = names[sid] || (sid ? '线路' + sid : '');
      var block = pane.slice(0, 200000);
      var pattern = /<div class="listitem[^"]*">\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]{0,40}?)<\/a>/g;
      var matched;
      while ((matched = pattern.exec(block)) !== null) {
        var link = matched[1];
        if (!link || link.indexOf('javascript') === 0 || seen[link]) continue;
        seen[link] = true;
        var name = clean(matched[2]) || '正片';
        chapters.push({
          id: absolute(link),
          title: (route ? route + ' · ' : '') + name
        });
        if (chapters.length >= 240) break;
      }
      if (chapters.length >= 240) break;
    }
    if (!chapters.length) {
      // 电影这类没有选集列表的页面：当前页就是第一集/正片。
      var player = parsePlayer(html);
      chapters.push({ id: id, title: currentRoute(html) || '正片' });
      if (player && player.url) chapters[0].subtitle = mediaUrl(player.url, player.encrypt);
    }
    return chapters;
  },

  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    var target = chapterId || (argument && argument.id ? String(argument.id) : '');
    if (!target) throw new Error('缺少播放页地址');
    if (/\.(m3u8|mp4|flv|mpd)(\?|#|$)/i.test(target)) {
      return { kind: 'video', url: absolute(target), headers: { Referer: base() + '/' } };
    }
    var html = await fetchPage(target);
    var player = parsePlayer(html);
    var media = player ? mediaUrl(player.url, player.encrypt) : '';
    if (media && /\.(m3u8|mp4|flv|mpd)(\?|#|$)/i.test(media)) {
      return { kind: 'video', url: media, headers: { Referer: target, 'User-Agent': UA } };
    }
    if (media && /^https?:\/\//i.test(media) && /(vip|dytt|share)/i.test(media)) {
      // 这类是站外的「分享/解析」页，直链不在里面，交给 App 的网页解析。
      return { kind: 'webplayer', pageUrl: media, headers: { Referer: target, 'User-Agent': UA } };
    }
    return { kind: 'webplayer', pageUrl: target, headers: { Referer: base() + '/', 'User-Agent': UA } };
  }
};

function currentRoute(html) {
  var matched = /data-sid="(\d+)"/.exec(html);
  return matched ? '线路' + matched[1] : '';
}
