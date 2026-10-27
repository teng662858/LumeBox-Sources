// LumeSource: {"id":"huavod","name":"华视影院","version":"1.0.1","category":"video","mirrors":["https://huavod.com"],"icon":"https://huavod.com/static/favicon/favicon-96x96.png"}
//
// 站点：华视影院（https://huavod.com，海外华人影视站，模板 ds3）
// 结构：苹果 CMS（MacCMS v10）定制模板。**vod JSON 接口 404**，只能抓 HTML：
//   · 分类页  /vodtype/{类型ID}.html        （整类一次性铺完，无分页——一页 280 部）
//   · 详情    /voddetail/{影片ID}.html
//   · 播放    /vodplay/{影片ID}-{线路}-{集数}.html → 内嵌 var player_aaaa
//   · 搜索    /vodsearch.html?wd=关键词
//   · 直播    /liveshow/{ID}.html（本脚本不处理，直播不是点播资源）
//
// 播放地址在播放页的 `var player_aaaa={…}`：encrypt=0 明文 m3u8；1 = unescape；2 = base64+unescape。
// 沙箱没有 atob/unescape，下面自带解码。
var BASE_URL = 'https://huavod.com';
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
    throw new Error('NEED_WEBVIEW_VERIFY：华视影院触发了 Cloudflare 人机校验（HTTP ' + status + '），请在源设置里走网页视图完成校验，或给本源配置代理');
  }
  if (status !== 200) throw new Error('华视影院页面打不开：HTTP ' + status + ' ' + path);
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
  var matched = /\/voddetail\/(\d+)\.html/.exec(text) || /^(\d+)$/.exec(text);
  return matched ? matched[1] : '';
}

function parseItems(html) {
  var items = [];
  var seen = {};
  var pattern = /<a[^>]*class="public-list-exp"[^>]*href="\/voddetail\/(\d+)\.html"[^>]*title="([^"]*)"/g;
  var matched;
  while ((matched = pattern.exec(html)) !== null) {
    var vid = matched[1];
    if (seen[vid]) continue;
    var title = clean(matched[2]);
    if (!title) continue;
    seen[vid] = true;
    var tail = html.slice(matched.index, matched.index + 900);
    var cover = /(?:data-original|data-src|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/.exec(tail);
    var score = /<i class="ft4">([\s\S]{0,8}?)<\/i>/.exec(tail);
    var remarks = /class="time-title[^"]*"[^>]*>([\s\S]{0,24}?)</.exec(tail);
    var subtitleParts = [];
    if (score && clean(score[1]) && clean(score[1]) !== '0') subtitleParts.push('评分 ' + clean(score[1]));
    if (remarks && clean(remarks[1])) subtitleParts.push(clean(remarks[1]));
    items.push({
      id: base() + '/voddetail/' + vid + '.html',
      title: title,
      cover: absolute(cover ? cover[1] : ''),
      subtitle: subtitleParts.join(' · ')
    });
  }
  return items;
}

var LumeSource = {
  id: 'huavod',
  name: '华视影院',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://huavod.com'],

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
    var pattern = /href="\/vodtype\/(\d+)\.html"[^>]*title="([^"]{1,20})"/g;
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
    var html = await fetchHtml('/');
    var items = parseItems(html);
    return items.length ? [{ title: '最新推荐', items: items.slice(0, 18) }] : [];
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!page || page < 1) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).replace(/[^\d]/g, '') : '1';
    if (!category) category = '1';
    var path;
    if (keyword) path = '/vodsearch.html?wd=' + encodeURIComponent(keyword);
    else path = '/vodtype/' + category + '.html';
    var html = await fetchHtml(path);
    var items = parseItems(html);
    if (keyword && !items.length) {
      // 站内搜索页是 JS 渲染的；但它自己的联想接口是 JSON，直接用它兜住搜索。
      var raw = await fetchHtml('/index.php/ajax/suggest?mid=1&wd=' + encodeURIComponent(keyword) + '&limit=20');
      var data = null;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        data = null;
      }
      var rows = data && Array.isArray(data.list) ? data.list : [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row || !row.id || !row.name) continue;
        items.push({
          id: base() + '/voddetail/' + row.id + '.html',
          title: String(row.name),
          cover: absolute(row.pic || '')
        });
      }
    }
    // 本站分类页一次铺完，没有下一页。
    return { items: items, hasMore: false };
  },

  async detail(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    var vid = vodIdOf(id);
    if (!vid) return null;
    var html = await fetchHtml('/voddetail/' + vid + '.html');
    var titleMatch = /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/.exec(html) ||
      /<title>([\s\S]{0,160}?)<\/title>/.exec(html);
    var title = clean(titleMatch ? titleMatch[1] : '');
    if (!title) return null;
    title = title.split(' - ')[0].split('_')[0].split('在线观看')[0].trim();
    var coverMatch = /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/.exec(html) ||
      /<img[^>]+src="(https?:\/\/[^"]*piccdn[^"]*)"/.exec(html);
    var descMatch = /<meta[^>]+property="og:description"[^>]+content="([^"]*)"/.exec(html) ||
      /<meta name="description" content="([^"]*)"/.exec(html);
    return {
      id: base() + '/voddetail/' + vid + '.html',
      title: title,
      cover: absolute(coverMatch ? coverMatch[1] : ''),
      description: clean(descMatch ? descMatch[1] : '')
    };
  },

  async chapters(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    var vid = vodIdOf(id);
    if (!vid) return [];
    var html = await fetchHtml('/voddetail/' + vid + '.html');
    // 线路名：<div class="anthology-tab ..."><a class="swiper-slide"><i class="fa ds-dianying"></i>&nbsp;高性能</a>
    var routes = [];
    var tabBlock = /class="anthology-tab[\s\S]*?<\/div><\/div>/.exec(html);
    if (tabBlock) {
      var tabPattern = /<a[^>]*>([\s\S]{0,60}?)<\/a>/g;
      var matchedTab;
      while ((matchedTab = tabPattern.exec(tabBlock[0])) !== null) {
        var name = clean(matchedTab[1]);
        if (name) routes.push(name);
      }
    }
    var chapters = [];
    var seen = {};
    var boxes = html.split('anthology-list-play');
    for (var index = 1; index < boxes.length; index++) {
      var route = routes[index - 1] || (boxes.length > 2 ? '线路' + index : '');
      var block = boxes[index].slice(0, 60000);
      var pattern = /<a[^>]*href="(\/vodplay\/\d+-\d+-\d+\.html)"[^>]*>([\s\S]{0,30}?)<\/a>/g;
      var matched;
      while ((matched = pattern.exec(block)) !== null) {
        var link = matched[1];
        if (seen[link]) continue;
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
    return chapters;
  },

  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    var id = argument && argument.id ? String(argument.id) : '';
    var target = chapterId;
    if (!target) {
      var vid = vodIdOf(id);
      if (!vid) throw new Error('缺少播放页地址');
      target = base() + '/vodplay/' + vid + '-1-1.html';
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
    // 本站播放器在 iframe 里（/Player/ec?episode={影片}-{线路}-{集数}），
    // 直链是 P2P 频道 key（要它们的 meshplay SDK 才能换到分片，直接请求 403），
    // 所以交给 App 的网页播放器（webplayer）在 WebView 里跑它们自己的播放器。
    var episode = /\/vodplay\/(\d+-\d+-\d+)\.html/.exec(target);
    var playerPage = episode ? base() + '/Player/ec?episode=' + episode[1] : absolute(target);
    return { kind: 'webplayer', pageUrl: playerPage, headers: { Referer: base() + '/', 'User-Agent': UA } };
  }
};
