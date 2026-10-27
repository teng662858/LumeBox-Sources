// LumeSource: {"id":"olehdtv","name":"欧乐影院","version":"1.0.1","category":"video","mirrors":["https://www.olehdtv.com"],"icon":"https://www.olehdtv.com/favicon.ico"}
//
// 站点：欧乐影院（https://www.olehdtv.com，面向海外华人的影视站，模板 conch）
// 结构：苹果 CMS（MacCMS v10）。**/api.php/provide/vod/ 接口被关掉（返回 closed）**，只能抓 HTML：
//   · 分类页  /index.php/vod/type/id/{类型ID}.html
//   · 列表页  /index.php/vod/show/id/{类型ID}.html  → 第 2 页起 /index.php/vod/show/id/{id}/page/{N}.html
//   · 详情    /index.php/vod/detail/id/{影片ID}.html
//   · 播放    /index.php/vod/play/id/{影片ID}/sid/{线路}/nid/{集数}.html → 内嵌 var player_aaaa
//
// 播放地址在播放页的 `var player_aaaa={…}`：encrypt=0 明文 m3u8（本站实测都是 0）；
// 1 = unescape；2 = base64 + unescape —— 沙箱没有 atob/unescape，下面自带解码。
// 403 时抛 NEED_WEBVIEW_VERIFY：本站挂了 Cloudflare，直连常被拦，走代理或网页视图过校验后可用。
var BASE_URL = 'https://www.olehdtv.com';
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

async function fetchHtml(path) {
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
    throw new Error('NEED_WEBVIEW_VERIFY：欧乐影院触发了 Cloudflare 人机校验（HTTP ' + status + '），请在源设置里走网页视图完成校验，或给本源配置代理');
  }
  if (status !== 200) throw new Error('欧乐影院页面打不开：HTTP ' + status + ' ' + path);
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

function percentDecode(input) {
  var text = String(input || '');
  var out = '';
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if (ch !== '%') {
      out += ch;
      continue;
    }
    if (text.charAt(i + 1) === 'u' || text.charAt(i + 1) === 'U') {
      var code = parseInt(text.substr(i + 2, 4), 16);
      if (!isNaN(code)) {
        out += String.fromCharCode(code);
        i += 5;
        continue;
      }
    }
    var byte = parseInt(text.substr(i + 1, 2), 16);
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
  return url.trim();
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

function vodIdOf(id) {
  var text = String(id == null ? '' : id).trim();
  var matched = /\/id\/(\d+)\.html/.exec(text) || /^(\d+)$/.exec(text);
  return matched ? matched[1] : '';
}

function parseItems(html) {
  var items = [];
  var seen = {};
  var pattern = /<a[^>]*href="(\/index\.php\/vod\/detail\/id\/(\d+)\.html)"[^>]*title="([^"]*)"[^>]*data-original="([^"]*)"/g;
  var matched;
  while ((matched = pattern.exec(html)) !== null) {
    var vid = matched[2];
    if (seen[vid]) continue;
    var title = clean(matched[3]);
    if (!title) continue;
    seen[vid] = true;
    var tail = html.slice(matched.index, matched.index + 1500);
    var remark = /<em[^>]*class=['"][^'"]*voddate[^'"]*['"][^>]*>([\s\S]{0,20}?)<\/em>/.exec(tail);
    items.push({
      id: base() + '/index.php/vod/detail/id/' + vid + '.html',
      title: title,
      cover: absolute(matched[4]),
      subtitle: remark ? clean(remark[1]) : ''
    });
  }
  return items;
}

var LumeSource = {
  id: 'olehdtv',
  name: '欧乐影院',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://www.olehdtv.com'],

  async categories() {
    var cached = await LumeSource.fs.readText('classes.json');
    if (cached) {
      try {
        var hit = JSON.parse(cached);
        if (hit && hit.length) return hit;
      } catch (error) {
        /* 缓存坏了就重抓 */
      }
    }
    var html = await fetchHtml('/');
    var list = [];
    var seen = {};
    var pattern = /href="\/index\.php\/vod\/type\/id\/(\d+)\.html"[^>]*>([\s\S]{0,40}?)<\/a>/g;
    var matched;
    while ((matched = pattern.exec(html)) !== null) {
      var id = matched[1];
      var title = clean(matched[2]);
      if (!title || seen[id]) continue;
      seen[id] = true;
      list.push({ id: id, title: title });
    }
    if (list.length) await LumeSource.fs.writeText('classes.json', JSON.stringify(list));
    return list;
  },

  async home() {
    var html = await fetchHtml('/index.php/vod/show/id/1.html');
    var items = parseItems(html);
    return items.length ? [{ title: '电影 · 最新', moreUrl: '1', items: items.slice(0, 18) }] : [];
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!page || page < 1) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).replace(/[^\d]/g, '') : '1';
    if (!category) category = '1';
    var path;
    if (keyword) {
      path = '/index.php/vod/search.html?wd=' + encodeURIComponent(keyword);
    } else if (page <= 1) {
      path = '/index.php/vod/show/id/' + category + '.html';
    } else {
      path = '/index.php/vod/show/id/' + category + '/page/' + page + '.html';
    }
    var html = await fetchHtml(path);
    var next = new RegExp('/page/' + (page + 1) + '\\.html');
    return { items: parseItems(html), hasMore: !keyword && next.test(html) };
  },

  async detail(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    var vid = vodIdOf(id);
    if (!vid) return null;
    var html = await fetchHtml('/index.php/vod/detail/id/' + vid + '.html');
    var titleMatch = /<title>([\s\S]{0,160}?)<\/title>/.exec(html);
    var title = clean(titleMatch ? titleMatch[1] : '').split('_')[0].split(' - ')[0].trim();
    if (!title) return null;
    var coverMatch = /data-original="(https?:\/\/[^"]*olelive[^"]*)"/.exec(html) ||
      /data-original="(https?:\/\/[^"]+)"/.exec(html);
    var descMatch = /<div class="content_desc[^"]*">\s*<span>([\s\S]*?)<\/span>/.exec(html) ||
      /<meta name="description" content="([^"]*)"/.exec(html);
    var desc = clean(descMatch ? descMatch[1] : '');
    desc = desc.replace(/^[^ ]{1,30}\s*剧情[:：]\s*/, '');
    return {
      id: base() + '/index.php/vod/detail/id/' + vid + '.html',
      title: title,
      cover: absolute(coverMatch ? coverMatch[1] : ''),
      description: desc
    };
  },

  async chapters(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    var vid = vodIdOf(id);
    if (!vid) return [];
    var html = await fetchHtml('/index.php/vod/detail/id/' + vid + '.html');
    // 线路名：<a class="active" alt="欧乐官方播放器">…
    var routes = [];
    var tabPattern = /<a[^>]*alt="([^"]{1,20})"[^>]*>/g;
    var matched;
    while ((matched = tabPattern.exec(html)) !== null) {
      var name = clean(matched[1]);
      if (name && routes.indexOf(name) < 0) routes.push(name);
    }
    var chapters = [];
    var seen = {};
    var pattern = /<a[^>]*href="(\/index\.php\/vod\/play\/id\/\d+\/sid\/(\d+)\/nid\/(\d+)\.html)"[^>]*>([\s\S]{0,30}?)<\/a>/g;
    while ((matched = pattern.exec(html)) !== null) {
      var link = matched[1];
      if (seen[link]) continue;
      seen[link] = true;
      var sid = Number(matched[2]);
      var name = clean(matched[4]) || '第' + matched[3] + '集';
      var route = routes[sid - 1] || (routes.length > 1 ? '线路' + sid : '');
      chapters.push({
        id: absolute(link),
        title: (route ? route + ' · ' : '') + name
      });
      if (chapters.length >= 240) break;
    }
    return chapters;
  },

  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    var id = argument && argument.id ? String(argument.id) : '';
    var target = chapterId;
    if (!target) {
      var vid = vodIdOf(id);
      if (!vid) throw new Error('缺少播放页地址');
      target = base() + '/index.php/vod/play/id/' + vid + '/sid/1/nid/1.html';
    }
    if (/\.(m3u8|mp4|flv|mpd)(\?|#|$)/i.test(target)) {
      return { kind: 'video', url: absolute(target), headers: { Referer: base() + '/' } };
    }
    var html = await fetchHtml(target);
    var player = parsePlayer(html);
    var media = player ? mediaUrl(player.url, player.encrypt) : '';
    if (media && /\.(m3u8|mp4|flv|mpd)(\?|#|$)/i.test(media)) {
      return { kind: 'video', url: media, headers: { Referer: target, 'User-Agent': UA } };
    }
    return { kind: 'webplayer', pageUrl: absolute(target), headers: { Referer: base() + '/', 'User-Agent': UA } };
  }
};
