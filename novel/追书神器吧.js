// LumeSource: {"id":"zssq8_novel","name":"追书神器吧","version":"1.0.0","category":"novel","mirrors":["https://www.zssq8.cc"]}

// 站点：https://www.zssq8.cc（Bootstrap 模板，服务端渲染，PC / 移动同一套标记）
//
// ## 抓取口径（每条都对着快照 novel_zssq8_*.html 核过）
//
//   分类   /list1/ … /list8/ ＝ 玄幻 武侠 都市 历史 网游 科幻 言情 其他；
//          第 N 页是 /listN/<N>.html（站点自己的分页链接就长这样）。列表项与
//          首页、排行、完本共用一套 dl 标记，所以 list() 只有「拼地址」不同。
//   排行   /top/ 第 1 页、/top/all_0_<N>.html 第 N 页（**不是 /top/<N>.html**）。
//   完本   /full/ 第 1 页、/full/0_<N>.html 第 N 页（**不是 /full/<N>.html**）。
//          这三套分页形状是实测差异，混用会 404。
//   搜索   GET /search.php?q=<kw>&p=<N>（站点表单就是 q + p）。
//   条目   `dl > dt > a[href=/book/<id>/] > img[src=/images/<a>/<id>/<id>s.jpg]`
//          （onerror 兜 /images/nocover.jpg —— 那个占位图不许当封面用）；
//          `dd > h3 > a` 是标题，`dd.book_other` 行里分别是「作者：X」「状态：Y」
//          「更新时间：Z」「最新章节：…」。
//   分页   `<div class="pages">` 里第一条 `<a class="page-link">当前/总数</a>`；
//          末页同形状（第 1 页是 1/855）。hasMore 用它判定，不猜「下一页」锚点
//          ——站点把 `>` 那条注释掉了，靠它判会把每页都当成末页。
//   详情   GET /book/<id>/：`h1` 是书名、`.book_info` 里第一张 img 是封面、
//          `#intro_pc` 是简介、「作者 / 状态 / 最新章节」在 `.options` 的 li 里。
//   目录   **详情页 /book/<id>/ 与 /book/<id>/index_1.html 返回的是同一份页面**
//          （实测：两次抓下来的字节完全相同），都是「第 1–100 章」那一页；
//          所以目录从 index_1 抓起，按分页 1/9 往后补 index_2…index_9。
//          约 100 章/页、旧→新、不分栏。
//   正文   GET /book/<id>/<chapid>.html：`<article class="font_max">` 一块，
//          段落之间是 `<br><br>` + `&nbsp;` 缩进，单页不分章。
//
// ## 两条纪律
// 1. `base()` 优先用宿主注入的域名（用户换镜像 / 手填域名要立刻生效），
//    相对地址（封面 `/images/…`）一律按 base() 补全，别写死主站。
// 2. 目录多页串行会在慢网络下顶穿沙箱墙钟（10s）：按 3 页一批并发 + 5s 软截止，
//    到点带着已抓到的章节先返回——宁可不全，也不能整次调用超时。

var DEFAULT_BASE = 'https://www.zssq8.cc';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

var MAX_ITEMS = 200;          // 单次列表最多产出（防解析失控）
var ITEM_WINDOW = 1200;       // 单条往后看的窗口（标题 / 作者都在这段里）
var MAX_CHAPTERS = 3000;      // 目录最多解析多少章
var INDEX_BATCH = 3;          // 目录每批并发几页
var INDEX_BUDGET_MS = 5000;   // 目录抓取软截止（沙箱单次调用预算 10s）
var INDEX_MAX_PAGES = 40;     // 目录最多翻多少页（≈4000 章）

/// 解析后的站点地址：自定义域名 > 用户选中的镜像 > 脚本声明的第一个镜像。
/// 老版本 App 没有 config（或字段缺失）时回落到本源自己的默认域名。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var LumeSource = {
  id: 'zssq8_novel',
  name: '追书神器吧',
  version: '1.0.0',
  category: 'novel',

  // ---------------------------------------------------------------- 契约方法

  /// 分类＝站点导航那 10 个入口（8 个书库 + 排行 + 完本），按站点自己的顺序。
  async categories() {
    return [
      { id: 'list1', title: '玄幻' },
      { id: 'list2', title: '武侠' },
      { id: 'list3', title: '都市' },
      { id: 'list4', title: '历史' },
      { id: 'list5', title: '网游' },
      { id: 'list6', title: '科幻' },
      { id: 'list7', title: '言情' },
      { id: 'list8', title: '其他' },
      { id: 'top', title: '排行' },
      { id: 'full', title: '完本' }
    ];
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = this.__clean(args.keyword || '');
    var url;
    if (keyword) {
      // 站点搜索是 GET 表单（q + p），结果页与列表页共用 dl 标记。
      url = '/search.php?q=' + encodeURIComponent(keyword) + '&p=' + page;
    } else {
      url = this.__listPath(String(args.categoryId == null ? '' : args.categoryId), page);
    }
    var html = await this.__get(url);
    return {
      items: this.__items(html),
      hasMore: this.__hasMore(html, page)
    };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/book/' + id + '/');
    var title = this.__title(html);
    if (!title) {
      console.warn('[zssq8] 详情页没认出书名：' + id + '（' + html.length + ' 字符）');
      return null;
    }
    var info = this.__detailInfo(html);
    return {
      id: id,
      title: title,
      cover: info.cover,
      subtitle: info.subtitle,
      description: info.description
    };
  },

  /// 目录：index_1（＝详情页）先抓，再按页内的「1/9」把 index_2…index_9 补齐。
  async chapters(argument) {
    var id = this.__id(argument);
    var first = await this.__get('/book/' + id + '/index_1.html');
    var rows = this.__chapters(first, id);
    if (!rows.length) {
      throw new Error('追书神器吧：目录页没认出章节（id=' + id
        + '）——把运行日志发回来收敛解析规则');
    }
    var pages = this.__indexPages(first);
    if (pages > INDEX_MAX_PAGES) pages = INDEX_MAX_PAGES;
    if (pages > 1) {
      var seen = {};
      for (var k = 0; k < rows.length; k++) seen[rows[k].id] = true;
      var started = new Date().getTime();
      for (var page = 2; page <= pages; page += INDEX_BATCH) {
        if (new Date().getTime() - started > INDEX_BUDGET_MS) {
          console.warn('[zssq8] 目录到软截止（' + INDEX_BUDGET_MS + 'ms），先返回已抓到的 '
            + rows.length + ' 章');
          break;
        }
        var batch = [];
        for (var i = page; i < page + INDEX_BATCH && i <= pages; i++) {
          batch.push(this.__indexPage(id, i));
        }
        var results = await Promise.all(batch);
        var fresh = 0;
        for (var b = 0; b < results.length; b++) {
          var found = results[b];
          for (var f = 0; f < found.length; f++) {
            if (seen[found[f].id]) continue;
            seen[found[f].id] = true;
            rows.push(found[f]);
            fresh++;
          }
        }
        // 一整批都是见过的：站点给的页数偏大（或目录就这么多），收工。
        if (!fresh) break;
      }
    }
    if (rows.length > MAX_CHAPTERS) rows = rows.slice(0, MAX_CHAPTERS);
    return rows;
  },

  async content(argument) {
    var id = this.__id(argument);
    var chapterId = this.__token(argument && argument.chapterId);
    if (!chapterId) throw new Error('追书神器吧：缺少章节号（请重新进一次目录再打开）');
    var url = '/book/' + id + '/' + chapterId + '.html';
    var html = await this.__get(url);
    var text = this.__articleText(html);
    if (!text) {
      throw new Error('追书神器吧：正文页没认出正文（' + url + '，' + html.length
        + ' 字符）——站点可能改版，把运行日志发回来');
    }
    return { kind: 'text', text: text };
  },

  // ---------------------------------------------------------------- 内部工具

  __id(argument) {
    var id = '';
    if (argument && argument.id != null) id = String(argument.id).trim();
    // id 既可能是纯数字（列表里给的），也可能是 /book/135245/ 这种整条地址。
    var m = /(\d+)/.exec(id);
    if (!m) throw new Error('追书神器吧：缺少作品 ID');
    return m[1];
  },

  __token(value) {
    var text = String(value == null ? '' : value).trim();
    var m = /(\d+)/.exec(text);
    return m ? m[1] : '';
  },

  /// 分类 id → 列表地址。三套分页形状是实测差异（见文件头）：
  ///   listN → /listN/、/listN/<N>.html
  ///   top   → /top/、/top/all_0_<N>.html
  ///   full  → /full/、/full/0_<N>.html
  /// 没有分类（宿主还没选）时退回第 1 个书库，别抛「无效分类」把整页变成报错。
  __listPath(category, page) {
    var id = category || 'list1';
    var suffix = page > 1 ? page : 1;
    if (/^list\d+$/.test(id)) return '/' + id + '/' + (page > 1 ? suffix + '.html' : '');
    if (id === 'top') return page > 1 ? '/top/all_0_' + suffix + '.html' : '/top/';
    if (id === 'full') return page > 1 ? '/full/0_' + suffix + '.html' : '/full/';
    // 认不出的 id（老版本 App 存下的旧分类值）也按书库试一次，别 404。
    return '/list1/' + (page > 1 ? suffix + '.html' : '');
  },

  /// 列表 / 搜索页条目：每条一个 `<dl>`，先拿 dt 里的作品 id + 封面，
  /// 再在一条的窗口里找标题（dd>h3>a）与「作者：」。
  __items(html) {
    var items = [];
    var seen = {};
    var pattern = /<dt><a href="\/book\/(\d+)\/"[^>]*>[\s\S]{0,400}?<img[^>]+src="([^"]+)"/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var id = match[1];
      if (seen[id]) continue;
      seen[id] = true;
      var block = html.slice(match.index, match.index + ITEM_WINDOW);
      var titleMatch = /<h3>[\s\S]{0,80}?<a[^>]*>([\s\S]{0,120}?)<\/a>/.exec(block);
      var authorMatch = /作者：[\s\S]{0,40}?<a[^>]*>([^<]*)<\/a>/.exec(block);
      var statusMatch = /状态：([^<]{1,8})/.exec(block);
      var bits = [];
      var author = this.__clean(authorMatch ? authorMatch[1] : '');
      var status = this.__clean(statusMatch ? statusMatch[1] : '');
      if (author) bits.push('作者：' + author);
      if (status) bits.push(status);
      items.push({
        id: id,
        title: this.__clean(titleMatch ? titleMatch[1] : '') || ('作品 ' + id),
        cover: this.__cover(match[2]),
        subtitle: bits.length ? bits.join(' · ') : null
      });
    }
    return items;
  },

  /// 还有下一页吗：分页器第一条是「当前/总数」，两者相等就是末页。
  /// 认不出这条（改版）时退回「有没有 aria-label=Next 的箭头」。
  __hasMore(html, page) {
    var pager = /<a class="page-link">\s*(\d+)\s*\/\s*(\d+)\s*<\/a>/.exec(html);
    if (pager) return Number(pager[1]) < Number(pager[2]);
    return /href="[^"]*"[^>]*aria-label="Next"/.test(html);
  },

  /// 目录页总页数：同一个分页器（「1/9」）的右半边就是总页数。
  __indexPages(html) {
    var pager = /<a class="page-link">\s*(\d+)\s*\/\s*(\d+)\s*<\/a>/.exec(html);
    if (!pager) return 1;
    var total = Number(pager[2]);
    return total > 0 ? total : 1;
  },

  /// 目录条目：只认 `<div class="book_list book_list2">` 那一块（页面上另有
  /// 「最新章节」「最新12章节」两块也指向 /book/<id>/N.html，混进来会重号 + 乱序）。
  __chapters(html, id) {
    var start = html.indexOf('book_list2');
    if (start < 0) return [];
    var end = html.indexOf('</ul>', start);
    if (end < 0) end = Math.min(html.length, start + 200000);
    var block = html.slice(start, end);
    var pattern = new RegExp('<a href="/book/' + id + '/(\\d+)\\.html"[^>]*>\\s*([\\s\\S]{0,120}?)\\s*</a>', 'g');
    var rows = [];
    var seen = {};
    var match;
    while ((match = pattern.exec(block)) !== null) {
      if (rows.length >= MAX_CHAPTERS) break;
      var chapterId = match[1];
      if (seen[chapterId]) continue;
      seen[chapterId] = true;
      rows.push({
        id: chapterId,
        title: this.__clean(match[2]) || ('第 ' + chapterId + ' 章')
      });
    }
    return rows;
  },

  /// 目录的一页：单页失败只当空页（别让一处 502 把整本目录废掉）。
  __indexPage(id, page) {
    var self = this;
    return this.__get('/book/' + id + '/index_' + page + '.html').then(function (html) {
      return self.__chapters(html, id);
    }, function () {
      return [];
    });
  },

  /// 详情页信息。
  __detailInfo(html) {
    var coverMatch = /class="row book_info"[\s\S]{0,600}?<img[^>]+src="([^"]+)"/.exec(html)
      || /og:image" content="([^"]+)"/.exec(html);
    var authorMatch = /作者：[^\n]{0,80}?<a[^>]*>([^<]*)<\/a>/.exec(html);
    var statusMatch = /状态：([^<]{1,8})/.exec(html);
    var latestMatch = /最新章节：[\s\S]{0,80}?<a[^>]*>([^<]*)<\/a>/.exec(html);
    // 窗口要够宽：`#intro_pc` 到「简介：」之间还夹着一个字号切换的 <a>（约 200 字符）。
    var descMatch = /id="intro_pc"[\s\S]{0,500}?<strong>简介：<\/strong>([\s\S]{0,4000}?)<br>您要是觉得/.exec(html)
      || /id="intro_pc"[\s\S]{0,500}?<strong>简介：<\/strong>([\s\S]{0,4000}?)<\/div>/.exec(html);
    var bits = [];
    var author = this.__clean(authorMatch ? authorMatch[1] : '');
    var status = this.__clean(statusMatch ? statusMatch[1] : '');
    var latest = this.__clean(latestMatch ? latestMatch[1] : '');
    if (author) bits.push('作者：' + author);
    if (status) bits.push(status);
    if (latest) bits.push('最新：' + latest);
    return {
      cover: this.__cover(coverMatch ? coverMatch[1] : ''),
      subtitle: bits.length ? bits.join(' · ') : null,
      description: this.__clean(descMatch ? descMatch[1] : '')
    };
  },

  __title(html) {
    var match = /<div class="col-9[^"]*info"[^>]*>\s*<h1>([\s\S]{0,200}?)<\/h1>/.exec(html)
      || /<h1>([\s\S]{0,200}?)<\/h1>/.exec(html);
    if (match && this.__clean(match[1])) return this.__clean(match[1]);
    var og = /og:novel:book_name" content="([^"]*)"/.exec(html);
    return og ? this.__clean(og[1]) : '';
  },

  /// 正文：`<article class="font_max">` 里的段落（`<br>` 分段、`&nbsp;` 缩进）。
  __articleText(html) {
    var start = html.indexOf('<article class="font_max"');
    if (start < 0) start = html.indexOf('font_max');
    if (start < 0) return '';
    var end = html.indexOf('</article>', start);
    if (end < 0) end = Math.min(html.length, start + 2000000);
    var block = html.slice(start, end);
    var parts = block.split(/<br\s*\/?>/i);
    var lines = [];
    for (var i = 0; i < parts.length; i++) {
      var text = this.__cleanBlock(parts[i]);
      if (text) lines.push(text);
    }
    return lines.join('\n');
  },

  /// 封面：跳过站点自己的占位图（nocover.jpg 那种），相对地址按 base() 补全。
  __cover(url) {
    var value = this.__entity(String(url || '')).trim();
    if (!value) return '';
    if (/nocover|nopic|default_no_thumbnail|loading|blank/i.test(value)) return '';
    return this.__abs(value);
  },

  __abs(url) {
    var value = String(url || '').trim();
    if (!value) return '';
    if (value.indexOf('http') === 0) return value;
    if (value.indexOf('//') === 0) return 'https:' + value;
    return base() + (value.charAt(0) === '/' ? '' : '/') + value;
  },

  /// 单段文本清洗：只做实体与首尾空白，段落内的空格原样保留。
  __cleanBlock(text) {
    return this.__entity(String(text || '').replace(/<[^>]*>/g, ''))
      .replace(/[\u00a0\u3000]/g, ' ')
      .replace(/[ \t\r\f]+/g, ' ')
      .trim();
  },

  __clean(text) {
    return this.__cleanBlock(text).replace(/\s+/g, ' ').trim();
  },

  __entity(text) {
    return String(text || '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&ldquo;/g, '“')
      .replace(/&rdquo;/g, '”')
      .replace(/&hellip;/g, '…')
      .replace(/&mdash;/g, '—');
  },

  /// 所有请求的唯一出口：补全地址、发请求、被 WAF 拦下时抛固定标记。
  async __get(path) {
    var url = path.indexOf('http') === 0 ? path : base() + path;
    var response = await LumeSource.http.get(url, {
      headers: { 'User-Agent': UA, 'Referer': base() + '/' }
    });
    var status = response ? Number(response.status) : 0;
    var body = response && response.body ? String(response.body) : '';
    if (status !== 200) {
      if (status === 403 || status === 503 || status === 429) {
        throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
          + status + ' ' + url + '）');
      }
      throw new Error('追书神器吧：拉取失败（HTTP ' + status + ' ' + url + '）');
    }
    if (/just a moment|checking your browser|__cf_chl|cf-chl-/.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
        + status + ' ' + url + '）');
    }
    return body;
  }
};
