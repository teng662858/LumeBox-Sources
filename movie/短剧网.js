// LumeSource: {"id":"duanju2","name":"短剧网","version":"1.0.1","category":"video","mirrors":["https://www.duanju2.com"],"icon":"https://www.duanju2.com/template/djw/ripro_static/favicon.ico"}
//
// 站点：短剧网（https://www.duanju2.com，主打爽文短剧）
// 结构：苹果 CMS（MacCMS v10）+ 杂志风模板。**vod JSON 接口被关**（返回 closed），走 HTML：
//   · 分类列表  /show/{类型ID}---{分类名}--------.html        （第 2 页起：-----N---）
//   · 详情      /vod/{影片ID}.html
//   · 播放      /play/{影片ID}-{线路}-{集数}.html             → 内嵌 var player_aaaa
//   · 搜索      /index.php/ajax/suggest?mid=1&wd=关键词        （站内搜索是 JS 渲染的，
//                但这个联想接口是 JSON，返回 id/name/pic，拼 /vod/{id}.html 即可）
//
// 播放地址在播放页的 `var player_aaaa={…}` 里：encrypt=0 明文 m3u8；1 = unescape；2 = base64+unescape。
// 沙箱没有 atob/unescape，下面自带解码。
var BASE_URL = 'https://www.duanju2.com';
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
    throw new Error('NEED_WEBVIEW_VERIFY：短剧网触发了 Cloudflare 人机校验（HTTP ' + status + '），请在源设置里走网页视图完成校验或配置代理');
  }
  if (status !== 200) throw new Error('短剧网页面打不开：HTTP ' + status + ' ' + path);
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
  var matched = /\/vod\/(\d+)\.html/.exec(text) || /^(\d+)$/.exec(text);
  return matched ? matched[1] : '';
}

function parseItems(html) {
  var items = [];
  var seen = {};
  var pattern = /<a[^>]*href="\/vod\/(\d+)\.html"[^>]*title="([^"]*)"[^>]*>[\s\S]{0,400}?data-src="([^"]*)"/g;
  var matched;
  while ((matched = pattern.exec(html)) !== null) {
    var id = matched[1];
    if (seen[id]) continue;
    var title = clean(matched[2]);
    if (!title) continue;
    seen[id] = true;
    var tail = html.slice(matched.index, matched.index + 900);
    var year = /class="meta-post-type1"[^>]*>([\s\S]{0,12}?)</.exec(tail);
    var remark = /class="meta-post-type2"[^>]*>([\s\S]{0,16}?)</.exec(tail);
    var subtitleParts = [];
    if (year && clean(year[1])) subtitleParts.push(clean(year[1]));
    if (remark && clean(remark[1])) subtitleParts.push(clean(remark[1]));
    items.push({
      id: base() + '/vod/' + id + '.html',
      title: title,
      cover: absolute(matched[3]),
      subtitle: subtitleParts.join(' · ')
    });
  }
  return items;
}

var LumeSource = {
  id: 'duanju2',
  name: '短剧网',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://www.duanju2.com'],

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
    var pattern = /href="(\/show\/\d+---[^"]*?--------\.html)"[^>]*title="([^"]*)"/g;
    var matched;
    while ((matched = pattern.exec(html)) !== null) {
      var path = matched[1];
      if (seen[path]) continue;
      var title = clean(matched[2]);
      if (!title) continue;
      seen[path] = true;
      list.push({ id: path, title: title });
    }
    if (list.length) await LumeSource.fs.writeText('classes.json', JSON.stringify(list));
    return list;
  },

  async home() {
    var html = await fetchHtml('/');
    var items = parseItems(html);
    return items.length ? [{ title: '最新短剧', items: items.slice(0, 18) }] : [];
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!page || page < 1) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';

    if (keyword) {
      var raw = await fetchHtml('/index.php/ajax/suggest?mid=1&wd=' + encodeURIComponent(keyword) + '&limit=20');
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
        if (!row || !row.id || !row.name) continue;
        hits.push({
          id: base() + '/vod/' + row.id + '.html',
          title: String(row.name),
          cover: absolute(row.pic || '')
        });
      }
      return { items: hits, hasMore: false };
    }

    var path;
    if (category) {
      var parts = /\/show\/(\d+)---([^/]*?)-----*\d*---\.html/.exec(category) || /\/show\/(\d+)---([^/]+)/.exec(category);
      if (parts && page > 1) {
        path = '/show/' + parts[1] + '---' + parts[2] + '-----' + page + '---.html';
      } else {
        path = category;
      }
    } else {
      path = '/';
    }
    var html = await fetchHtml(path);
    var next = new RegExp('-----' + (page + 1) + '---');
    return { items: parseItems(html), hasMore: next.test(html) };
  },

  async detail(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    var vodId = vodIdOf(id);
    if (!vodId) return null;
    var html = await fetchHtml('/vod/' + vodId + '.html');
    var titleMatch = /<h1[^>]*>([\s\S]{0,120}?)<\/h1>/.exec(html) ||
      /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/.exec(html);
    var title = clean(titleMatch ? titleMatch[1] : '');
    if (!title) return null;
    title = title.replace(/[_｜|].*$/, '').trim();
    var coverMatch = /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/.exec(html) ||
      /<img[^>]*data-src="(https?:\/\/[^"]*\.(?:jpg|jpeg|png|webp))"/.exec(html);
    var descMatch = /<meta[^>]+property="og:description"[^>]+content="([^"]*)"/.exec(html) ||
      /<meta[^>]+name="description"[^>]+content="([^"]*)"/.exec(html);
    var classMatch = /分类[：:]\s*<[^>]*>([^<]{1,40})/.exec(html);
    return {
      id: base() + '/vod/' + vodId + '.html',
      title: title,
      cover: absolute(coverMatch ? coverMatch[1] : ''),
      subtitle: classMatch ? clean(classMatch[1]) : '',
      description: clean(descMatch ? descMatch[1] : '')
    };
  },

  async chapters(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    var vodId = vodIdOf(id);
    if (!vodId) return [];
    // 选集列表在播放页里（<div class="accordion sort-list"><li id="线路"><a title="集名" href="/play/…">）
    var html = await fetchHtml('/play/' + vodId + '-1-1.html');
    var chapters = [];
    var seen = {};
    var routeNames = {};
    var routePattern = /<li id="(\d+)">\s*<a[^>]*title="([^"]*)"[^>]*href="([^"]+)"/g;
    var matched;
    while ((matched = routePattern.exec(html)) !== null) {
      if (matched[1] && matched[2]) routeNames[matched[1]] = clean(matched[2]);
    }
    var pattern = /<a[^>]*title="([^"]*)"[^>]*href="(\/play\/[^"]+\.html)"[^>]*>/g;
    while ((matched = pattern.exec(html)) !== null) {
      var link = matched[2];
      if (seen[link]) continue;
      seen[link] = true;
      var name = clean(matched[1]) || '正片';
      chapters.push({ id: absolute(link), title: name });
      if (chapters.length >= 240) break;
    }
    if (!chapters.length) chapters.push({ id: base() + '/play/' + vodId + '-1-1.html', title: '正片' });
    return chapters;
  },

  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    var id = argument && argument.id ? String(argument.id) : '';
    var target = chapterId;
    if (!target) {
      var vodId = vodIdOf(id);
      if (!vodId) throw new Error('缺少播放页地址');
      target = base() + '/play/' + vodId + '-1-1.html';
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
