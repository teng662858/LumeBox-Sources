// LumeSource: {"id":"a123tv","name":"A123TV","version":"1.0.1","category":"video","mirrors":["https://a123tv.com"],"icon":"https://a123tv.com/s2/icon/favicon-180.png"}
//
// 站点：A123TV（https://a123tv.com，繁体镜像 tw.a123tv.com）
// 结构：服务端渲染的 HTML（模板 w4-*），**没有 JSON 接口**。路由：
//   · 首页            /                       → 各分组（电影 / 连续剧 / 综艺 / 动漫 / 福利）与推荐位
//   · 分类列表        /t/{类型ID}.html        → 翻页 /t/{类型ID}/p{页码}.html
//   · 详情 + 首集播放 /v/{slug}.html          → 播放器直接内嵌 data-src（m3u8 直链）
//   · 指定线路/剧集   /v/{slug}/{token}.html  → 同样内嵌 data-src
//   · 搜索            /s/{关键词}.html        → 结果与列表同款条目结构
//
// 播放地址就在播放页的 `<div class="w4-player" data-src="https://…/index.m3u8">` 里，
// 不用解任何编码（这是本站相对其它苹果 CMS 站最省事的地方）。
// 章节 id 用播放页地址：点开某一集时再去取那一页（一次请求，~80KB）。
var BASE_URL = 'https://a123tv.com';
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

async function page(path) {
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
    throw new Error('NEED_WEBVIEW_VERIFY：A123TV 触发了 Cloudflare 人机校验（HTTP ' + status + '），请在源设置里走网页视图完成校验或配置代理');
  }
  if (status !== 200) {
    throw new Error('A123TV 页面打不开：HTTP ' + status + ' ' + path);
  }
  return { html: response.body || '', url: url };
}

function decode(text) {
  return String(text == null ? '' : text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// 列表页条目：<div class="w4-item-wrap"><a class="w4-item" href="/v/x.html">
//   <figure…><img data-src="…" alt="标题"><div class="r">1080p</div></figure>
//   <div class="w4-item-info"><div class="t">标题</div><div class="i">剧情片 / 2026年</div></div>
function parseItems(html) {
  var items = [];
  var seen = {};
  var pattern = /<a[^>]*class="w4-item"[^>]*href="([^"]+)"[\s\S]{0,700}?<\/a>/g;
  var matched;
  while ((matched = pattern.exec(html)) !== null) {
    var block = matched[0];
    var href = matched[1];
    if (!href || seen[href]) continue;
    var titleMatch = /<div class="t"[^>]*>([\s\S]*?)<\/div>/.exec(block) ||
      /<img[^>]*alt="([^"]*)"/.exec(block);
    var title = decode(titleMatch ? titleMatch[1] : '');
    if (!title) continue;
    var coverMatch = /<img[^>]*(?:data-src|data-original|src)="([^"]+)"/.exec(block);
    var infoMatch = /<div class="i">([\s\S]*?)<\/div>/.exec(block);
    var qualityMatch = /<div class="r">([\s\S]*?)<\/div>/.exec(block);
    var subtitleParts = [];
    if (infoMatch) subtitleParts.push(decode(infoMatch[1]));
    if (qualityMatch && decode(qualityMatch[1])) subtitleParts.push(decode(qualityMatch[1]));
    seen[href] = true;
    items.push({
      id: absolute(href),
      title: title,
      cover: absolute(coverMatch ? coverMatch[1] : ''),
      subtitle: subtitleParts.join(' · ')
    });
  }
  return items;
}

function hasNextPage(html) {
  return /<li class="next"[^>]*>\s*<a/i.test(html) || /aria-label="转到下一页"/.test(html);
}

// 详情页里的播放器直链（线路相关，页面内嵌 data-src）。
function playerUrl(html) {
  var match = /class="w4-player"[^>]*data-src="([^"]+)"/.exec(html) ||
    /data-src="(https?:\/\/[^"]+\.(?:m3u8|mp4)[^"]*)"/.exec(html) ||
    /data-src="([^"]*\.m3u8[^"]*)"/.exec(html);
  return match ? absolute(decode(match[1])) : '';
}

// 详情页当前的线路名（播放器 data-title 形如「片名 - 正片 - 线路147」）。
function currentLine(html) {
  var match = /data-title="([^"]*)"/.exec(html);
  if (!match) return '';
  var title = decode(match[1]);
  var parts = title.split(' - ');
  return parts.length >= 2 ? parts[parts.length - 1].trim() : '';
}

function episodeBlock(html) {
  var start = html.indexOf('w4-episode-list');
  if (start < 0) return '';
  var end = html.indexOf('w4-meta2', start);
  if (end < 0) end = html.indexOf('w4-line', start);
  if (end < 0) end = html.length;
  return html.slice(start, end);
}

function lineBlock(html) {
  var start = html.indexOf('class="w4-line');
  if (start < 0) return '';
  return html.slice(start, Math.min(html.length, start + 60000));
}

var LumeSource = {
  id: 'a123tv',
  name: 'A123TV',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://a123tv.com'],

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
    var home = await page('/');
    var list = [];
    var seen = {};
    var blocks = home.html.split('<div class="w4-meta">');
    for (var index = 1; index < blocks.length; index++) {
      var block = blocks[index];
      var groupMatch = /<h3>([\s\S]*?)<\/h3>/.exec(block);
      var group = groupMatch ? decode(groupMatch[1]) : '';
      var links = block.match(/<a[^>]*href="\/t\/(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/g) || [];
      for (var i = 0; i < links.length; i++) {
        var idMatch = /href="\/t\/(\d+)\.html"/.exec(links[i]);
        var titleMatch = />([\s\S]*?)<\/a>/.exec(links[i]);
        if (!idMatch) continue;
        var id = idMatch[1];
        var title = decode(titleMatch ? titleMatch[1] : id);
        if (!title || seen[id]) continue;
        seen[id] = true;
        // 「全部电影」这类入口用分组名当标题，细分类型前面挂分组名。
        if (/^全部/.test(title)) title = title.replace(/^全部/, '');
        else if (group) title = group + ' · ' + title;
        list.push({ id: id, title: title });
      }
    }
    if (list.length) await LumeSource.fs.writeText('classes.json', JSON.stringify(list));
    return list;
  },

  async home() {
    var home = await page('/');
    var items = parseItems(home.html);
    var boards = [];
    if (items.length) boards.push({ title: '最新推荐', items: items.slice(0, 18) });
    return boards;
  },

  async list(argument) {
    var pageNo = argument && argument.page ? Number(argument.page) : 1;
    if (!pageNo || pageNo < 1) pageNo = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).replace(/^\/?v\//, '') : '';
    var path;
    if (keyword) {
      path = '/s/' + encodeURIComponent(keyword) + '.html';
    } else if (category) {
      path = pageNo <= 1 ? '/t/' + category + '.html' : '/t/' + category + '/p' + pageNo + '.html';
    } else {
      path = pageNo <= 1 ? '/t/10.html' : '/t/10/p' + pageNo + '.html';
    }
    var result = await page(path);
    return { items: parseItems(result.html), hasMore: hasNextPage(result.html) && !keyword };
  },

  async detail(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return null;
    var result = await page(id);
    var html = result.html;
    var titleMatch = /<li class="on">\s*<h1>([\s\S]*?)<\/h1>/.exec(html) ||
      /<div class="t"[^>]*>([\s\S]*?)<\/div>/.exec(html) ||
      /<title>([\s\S]*?)<\/title>/.exec(html);
    var title = decode(titleMatch ? titleMatch[1] : '');
    if (!title) return null;
    title = title.replace(/\s*[-|｜].*$/, '').trim();
    var coverMatch = /data-poster="([^"]+)"/.exec(html) ||
      /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html);
    var descMatch = /<meta[^>]+property="og:description"[^>]+content="([^"]*)"/.exec(html) ||
      /<meta[^>]+name="description"[^>]+content="([^"]*)"/.exec(html);
    var infoMatch = /<div class="i">([\s\S]*?)<\/div>/.exec(html);
    return {
      id: id,
      title: title,
      cover: absolute(coverMatch ? coverMatch[1] : ''),
      subtitle: infoMatch ? decode(infoMatch[1]) : currentLine(html),
      description: decode(descMatch ? descMatch[1] : '')
    };
  },

  async chapters(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return [];
    var result = await page(id);
    var html = result.html;
    var line = currentLine(html);
    var chapters = [];
    var seen = {};

    // ① 当前线路的选集（详情页已经把这一条的播放器渲染出来了）。
    var episodes = episodeBlock(html);
    var pattern = /<a[^>]*href="(\/v\/[^"]+)"[^>]*title="([^"]*)"/g;
    var matched;
    while ((matched = pattern.exec(episodes)) !== null) {
      var href = matched[1];
      if (seen[href]) continue;
      seen[href] = true;
      var name = decode(matched[2]) || '正片';
      chapters.push({ id: absolute(href), title: (line ? line + ' · ' : '') + name });
    }
    if (!chapters.length) {
      // 没解析到选集也不要空手：当前页本身就是一集。
      var direct = playerUrl(html);
      chapters.push({ id: result.url, title: line || '正片' });
      if (direct) chapters[0].subtitle = direct;
    }

    // ② 其它线路：给每条线路留一个入口（点进去就是那条线的第一集）。
    var lines = lineBlock(html);
    var linePattern = /<a[^>]*class="w4-line-item[^"]*"[^>]*href="([^"]+)"[^>]*title="([^"]*)"/g;
    var added = 0;
    while ((matched = linePattern.exec(lines)) !== null && added < 15) {
      var link = matched[1];
      if (seen[link]) continue;
      seen[link] = true;
      added += 1;
      chapters.push({ id: absolute(link), title: decode(matched[2]) + '（切换线路）' });
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
    var result = await page(target);
    var media = playerUrl(result.html);
    if (media && /\.(m3u8|mp4|flv|mpd)(\?|#|$)/i.test(media)) {
      return { kind: 'video', url: media, headers: { Referer: result.url, 'User-Agent': UA } };
    }
    return { kind: 'webplayer', pageUrl: result.url, headers: { Referer: base() + '/', 'User-Agent': UA } };
  }
};
