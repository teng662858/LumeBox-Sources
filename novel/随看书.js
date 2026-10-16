// LumeSource: {"id":"suixkan_novel","name":"随看书","version":"1.0.0","category":"novel","mirrors":["https://m.suixkan.com"]}

// 站点：随看书（m.suixkan.com，阅友模板）。utf-8。
//
// ## 抓取口径（对着快照 novel_suixkan_*.html 核过）
//
//   分类   三个频道共 24 个分类号：男频 1100 都市人生 /1101 玄幻奇幻 /1102 武侠仙侠
//          /1103 军事历史 /1104 科幻末世 /1105 游戏体育 /1107 悬疑灵异 /1108 脑洞大开；
//          女频 2100 现代言情 /2101 古代言情 /2102 幻想言情 /2104 穿越时空 /2105 宫闱争斗
//          /2106 豪门总裁 /2107 婚恋爱情 /2108 经商种田；短篇 4100 现实情感 /4101 世俗百态
//          /4102 家庭婚姻 /4103 热血青春 /4104 治愈成长 /4105 奇闻怪谈 /4106 悬疑脑洞
//          /4107 古风言情。
//   列表   ① **JSON 接口（首选）**：GET /api/book/classify?classify_id=<分类号>&page=<N>
//             → {code:0,data:{count,list:[{wapBookId,bookName,authorName,bookPic,
//             classifyName,classifySecondName,words,isFee,maxFreeCount,intro,…}]}}
//             （站点自己的列表页就是这个接口翻页的，`count` 是该分类总数、
//             每页 5 条；`count` 为 0 表示到底）。
//          ② 失败时回退 HTML：GET /l/f/<分类号>/<页>.html 的
//             `div.v-list-item[onclick="gotoPage('/b/<书号>.html')"]`
//             ——**导航全是 JS**（onclick 里带 gotoPage，几乎没有 <a href>），
//             所以书号只能从 onclick 文本里取，别指望锚点。
//   详情   GET /b/<书号>.html：`.face-cover-img` 封面、`.face-info-title` 书名、
//          `.v-words span` 行（作者 / 分类 / 字数）、`#intro` 简介、
//          `.sumchapter` 的「共 N 章」。
//   目录   GET /c/<书号>.html：**整本目录在一个 HTML 里**（3182 章 ≈ 500KB，
//          页内用 `<div id="N">` 分块做锚点跳转，不是分页），
//          `ul.catalog_ls > li > a[href=/r/<书号>/<章节号>.html]`，旧→新。
//   正文   GET /r/<书号>/<章节号>.html：**一整章也在这一个 HTML 里**，由多个
//          `div.section`（`<h2>第N章 标题 (1/5)</h2>` + `div.con > p`）组成；
//          把所有 `.section .con` 按顺序拼起来就是全章（**没有下一页地址**，
//          别去找）。
//
// ## 两件事如实说
// - 搜索未接入：站点的搜索按钮也是 JS（`gotoPage('/s/1.html')`），输入与接口
//   都没有可核对的快照 —— 抛可读错误，不返回空列表。
// - 付费书（`isFee`）：正文可能只有前几节免费（`maxFreeCount` 就是免费节数），
//   抓不到正文时点名「可能是付费章节」，不假装成成功。

var DEFAULT_BASE = 'https://m.suixkan.com';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

var MAX_ITEMS = 100;        // 单次列表最多产出（JSON 每页 5 条，够用）
var ITEM_WINDOW = 1600;     // 单条往后看的窗口（封面 + 标题 + 作者 + 字数）
var MAX_CHAPTERS = 5000;    // 目录最多解析多少章（本站单页给全，上限只是护栏）

/// 解析后的站点地址：自定义域名 > 用户选中的镜像 > 脚本声明的第一个镜像。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var LumeSource = {
  id: 'suixkan_novel',
  name: '随看书',
  version: '1.0.0',
  category: 'novel',

  // ---------------------------------------------------------------- 契约方法

  /// 分类＝站点三个频道下的 24 个分类号（id 就是站点的 classify_id）。
  async categories() {
    return [
      { id: '1100', title: '都市人生' },
      { id: '1101', title: '玄幻奇幻' },
      { id: '1102', title: '武侠仙侠' },
      { id: '1103', title: '军事历史' },
      { id: '1104', title: '科幻末世' },
      { id: '1105', title: '游戏体育' },
      { id: '1107', title: '悬疑灵异' },
      { id: '1108', title: '脑洞大开' },
      { id: '2100', title: '现代言情' },
      { id: '2101', title: '古代言情' },
      { id: '2102', title: '幻想言情' },
      { id: '2104', title: '穿越时空' },
      { id: '2105', title: '宫闱争斗' },
      { id: '2106', title: '豪门总裁' },
      { id: '2107', title: '婚恋爱情' },
      { id: '2108', title: '经商种田' },
      { id: '4100', title: '现实情感' },
      { id: '4101', title: '世俗百态' },
      { id: '4102', title: '家庭婚姻' },
      { id: '4103', title: '热血青春' },
      { id: '4104', title: '治愈成长' },
      { id: '4105', title: '奇闻怪谈' },
      { id: '4106', title: '悬疑脑洞' },
      { id: '4107', title: '古风言情' }
    ];
  },

  /// 列表：先走 JSON 接口（快、稳、字段全），失败再回退 HTML。
  async list(argument) {
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = this.__clean(args.keyword || '');
    if (keyword) {
      throw new Error('随看书：本源未接入搜索（站点的搜索是 JS 跳转 /s/1.html，'
        + '没有可核对的接口快照）；关键词：' + keyword);
    }
    var category = String(args.categoryId == null ? '' : args.categoryId).trim();
    if (!/^\d+$/.test(category)) category = '1100';
    try {
      var payload = await this.__json('/api/book/classify?classify_id=' + category
        + '&page=' + page);
      if (payload && payload.code === 0 && payload.data && payload.data.list) {
        return this.__jsonList(payload.data, page);
      }
      console.warn('[suixkan] JSON 接口返回了意外结构，回退 HTML 列表');
    } catch (error) {
      console.warn('[suixkan] JSON 接口失败（' + error + '），回退 HTML 列表');
    }
    var html = await this.__get('/l/f/' + category + '/' + page + '.html');
    return { items: this.__htmlItems(html), hasMore: this.__htmlHasMore(html, page) };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/b/' + id + '.html');
    var title = this.__title(html);
    if (!title) {
      console.warn('[suixkan] 详情页没认出书名：' + id + '（' + html.length + ' 字符）');
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

  /// 目录：整本在一个 HTML 里（`ul.catalog_ls`），旧→新，不需要翻页。
  async chapters(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/c/' + id + '.html');
    var rows = this.__chapters(html, id);
    if (!rows.length) {
      throw new Error('随看书：目录页没认出章节（/c/' + id
        + '.html）——把运行日志发回来收敛解析规则');
    }
    return rows;
  },

  /// 正文：把所有 `.section .con` 顺序拼起来（一章拆成多节是站点自己的排版）。
  async content(argument) {
    var path = this.__chapterPath(argument);
    if (!path) throw new Error('随看书：缺少章节地址（请重新进一次目录再打开）');
    var html = await this.__get(path);
    var text = this.__sections(html);
    if (!text) {
      throw new Error('随看书：这一章没取到正文（' + path + '，' + html.length
        + ' 字符）——可能是付费章节（isFee），或站点结构已变化');
    }
    return { kind: 'text', text: text };
  },

  // ---------------------------------------------------------------- 内部工具

  __id(argument) {
    var m = /(\d+)/.exec(String((argument && argument.id) || ''));
    if (!m) throw new Error('随看书：缺少作品 ID');
    return m[1];
  },

  /// 章节地址：列表给的是 `/r/<书号>/<章节号>.html` 整条路径；只给了两个数字
  /// 时自己拼。
  __chapterPath(argument) {
    var chapterId = String((argument && argument.chapterId) || '').trim();
    if (chapterId.indexOf('/r/') === 0) return chapterId.replace(/^https?:\/\/[^/]+/i, '');
    var bookId = this.__id(argument || {});
    var token = /(\d+)/.exec(chapterId);
    if (!token) return '';
    return '/r/' + bookId + '/' + token[1] + '.html';
  },

  /// JSON 列表：`data.count` 是分类总数、每页 5 条 —— 用 count 判「还有没有」。
  __jsonList(data, page) {
    var rows = data.list || [];
    var items = [];
    for (var i = 0; i < rows.length && items.length < MAX_ITEMS; i++) {
      var book = rows[i] || {};
      var bookId = book.wapBookId != null ? String(book.wapBookId) : '';
      if (!bookId) continue;
      var bits = [];
      var author = this.__clean(book.authorName || '');
      if (author) bits.push('作者：' + author);
      if (book.words) bits.push(this.__words(book.words));
      var tag = this.__clean(book.classifySecondName || book.classifyName || '');
      if (tag) bits.push(tag);
      if (Number(book.isFee) === 1) bits.push('付费');
      var cover = this.__cover(book.bookPic || '');
      items.push({
        id: '/b/' + bookId + '.html',
        title: this.__clean(book.bookName || '') || ('作品 ' + bookId),
        cover: cover,
        coverHeaders: cover ? this.__coverHeaders() : null,
        subtitle: bits.length ? bits.join(' · ') : null
      });
    }
    var total = Number(data.count);
    var hasMore = items.length > 0;
    if (hasMore && total > 0) hasMore = page * items.length < total;
    return { items: items, hasMore: hasMore };
  },

  __words(value) {
    var count = Number(value);
    if (!isFinite(count) || count <= 0) return '';
    return count >= 10000 ? (Math.round(count / 100) / 100) + ' 万字' : count + ' 字';
  },

  /// HTML 列表条目：`div.v-list-item`，书号只在 onclick 的 gotoPage(...) 里。
  __htmlItems(html) {
    var items = [];
    var seen = {};
    var pattern = /<div class="v-list-item[^"]*"[^>]*onclick="gotoPage\('([^']+)'\)"/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var id = this.__id({ id: match[1] });
      if (!id || seen[id]) continue;
      seen[id] = true;
      var block = html.slice(match.index, match.index + ITEM_WINDOW);
      var coverMatch = /class="v-cover-img"[^>]*src="([^"]+)"/.exec(block);
      var titleMatch = /class="v-title"[^>]*>([\s\S]{0,160}?)<\/div>/.exec(block);
      var authorMatch = /class="v-author"[^>]*>([\s\S]{0,120}?)<\/div>/.exec(block);
      var wordsMatch = /class="v-words[^"]*"[^>]*>([\s\S]{0,60}?)<\/div>/.exec(block);
      var bits = [];
      var author = this.__clean(authorMatch ? authorMatch[1] : '');
      var words = this.__clean(wordsMatch ? wordsMatch[1] : '');
      if (author) bits.push('作者：' + author);
      if (words) bits.push(words);
      var cover = this.__cover(coverMatch ? coverMatch[1] : '');
      items.push({
        id: '/b/' + id + '.html',
        title: this.__clean(titleMatch ? titleMatch[1] : '') || ('作品 ' + id),
        cover: cover,
        coverHeaders: cover ? this.__coverHeaders() : null,
        subtitle: bits.length ? bits.join(' · ') : null
      });
    }
    return items;
  },

  /// HTML 回退路径的「还有下一页吗」：服务端渲染的条目数满一屏就认为还有
  /// （站点把剩余条目交给 JS 接口追加，HTML 里没有页码链接）。
  __htmlHasMore(html, page) {
    var rendered = this.__htmlItems(html);
    if (!rendered.length) return false;
    // 只有第 1 页会被当作「还能翻」：没有页码信息时宁可少报一页，
    // 交给用户下拉（App 会带 page+1 再来一次，接口路径才是主力）。
    return page === 1 && rendered.length >= 5;
  },

  __detailInfo(html) {
    var coverMatch = /class="face-cover-img"[^>]*src="([^"]+)"/.exec(html)
      || /og:image" content="([^"]+)"/.exec(html);
    var bits = [];
    var pattern = /class="v-words[^"]*"[^>]*>[\s\S]{0,40}?<span>([\s\S]{0,60}?)<\/span>/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var text = this.__clean(match[1]);
      if (text && bits.indexOf(text) < 0 && bits.length < 4) bits.push(text);
    }
    var summary = /共\s*(\d+)\s*章/.exec(html);
    if (summary) bits.push('共 ' + summary[1] + ' 章');
    var intro = this.__slice(html, 'id="intro"', '</div>');
    return {
      cover: this.__cover(coverMatch ? coverMatch[1] : ''),
      subtitle: bits.length ? bits.join(' · ') : null,
      description: this.__clean(intro ? intro.replace(/<[^>]*>/g, '') : '')
    };
  },

  __title(html) {
    var match = /class="face-info-title"[^>]*>([\s\S]{0,160}?)<\/p>/.exec(html);
    if (match && this.__clean(match[1])) return this.__clean(match[1]);
    var og = /property="og:novel:book_name" content="([^"]*)"/.exec(html);
    if (og && this.__clean(og[1])) return this.__clean(og[1]);
    var title = /<title>([^<]*)<\/title>/.exec(html);
    return title ? this.__clean(title[1]) : '';
  },

  /// 目录条目：`ul.catalog_ls > li > a[href=/r/<书号>/<章节号>.html]`。
  /// 整页给全，按出现顺序（旧→新）收；重号只留第一条。
  __chapters(html, id) {
    var pattern = new RegExp('<a href="(/r/' + id + '/\\d+\\.html)">([\\s\\S]{0,120}?)</a>', 'g');
    var rows = [];
    var seen = {};
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (rows.length >= MAX_CHAPTERS) break;
      var path = match[1];
      if (seen[path]) continue;
      seen[path] = true;
      rows.push({
        id: path,
        title: this.__clean(match[2]) || ('第 ' + rows.length + 1 + ' 章')
      });
    }
    return rows;
  },

  /// 正文：多个 `div.section`（**只有第一节没有 `none`，其余是 `section none`**，
  /// 站点自己的阅读器靠 JS 一节一节翻）里的 `div.con`。
  ///
  /// 两个必须按站点实情处理的细节：
  /// - 每节末尾都插一句「（本章未完，请翻页）」——那不是正文，剔掉；
  /// - **节与节之间是一句话被切开**（上节以「他不是破天仙」结尾、下节从
  ///   「帝，而是一个普通人。」开头），所以跨节要**直接续写**，不能插换行；
  ///   节内段落之间才换行。
  __sections(html) {
    var parts = [];
    var pattern = /<div[^>]*class="section[^"]*"[^>]*>[\s\S]*?<div[^>]*class="con"[^>]*>([\s\S]*?)<\/div>/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var paragraphs = [];
      var inner = /<p[^>]*>([\s\S]*?)<\/p\s*>/g;
      var para;
      while ((para = inner.exec(match[1])) !== null) {
        var text = this.__cleanBlock(para[1]);
        if (!text) continue;
        // 「（本章未完，请翻页）」是站点分节的提示，不是正文（末尾那句
        // 「（本章完）」是真正的章节结束语，保留）。
        if (/^[（(]本章未完[\s\S]{0,20}[）)]$/.test(text)) continue;
        paragraphs.push(text);
      }
      if (!paragraphs.length) {
        var plain = this.__clean(match[1]);
        if (plain) paragraphs.push(plain);
      }
      if (paragraphs.length) parts.push(paragraphs);
    }
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      for (var j = 0; j < parts[i].length; j++) {
        if (!out) {
          out = parts[i][j];
        } else {
          out += (j === 0 ? '' : '\n') + parts[i][j];
        }
      }
    }
    return out;
  },

  __slice(html, anchor, endMarker) {
    var start = html.indexOf(anchor);
    if (start < 0) return '';
    var end = html.indexOf(endMarker, start);
    if (end < 0) end = Math.min(html.length, start + 200000);
    return html.slice(start, end);
  },

  /// 封面：CDN 绝对地址（https://cdn.p.yueyouxs.com/…），带 Referer 更稳。
  __cover(url) {
    var value = this.__entity(String(url || '')).trim();
    if (!value) return '';
    if (/nocover|nopic|default_no_thumbnail|loading|blank/i.test(value)) return '';
    if (value.indexOf('//') === 0) return 'https:' + value;
    if (/^https?:\/\//i.test(value)) return value.replace(/^http:\/\//i, 'https://');
    return base() + (value.charAt(0) === '/' ? '' : '/') + value;
  },

  /// 封面在独立 CDN（cdn.p.yueyouxs.com），带上 Referer + UA。
  __coverHeaders() {
    return { 'Referer': base() + '/', 'User-Agent': UA };
  },

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
      headers: {
        'User-Agent': UA,
        'Referer': base() + '/',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    var status = response ? Number(response.status) : 0;
    var body = response && response.body ? String(response.body) : '';
    if (status !== 200) {
      if (status === 403 || status === 503 || status === 429) {
        throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
          + status + ' ' + url + '）');
      }
      throw new Error('随看书：拉取失败（HTTP ' + status + ' ' + url + '）');
    }
    if (/just a moment|checking your browser|__cf_chl|cf-chl-/.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
        + status + ' ' + url + '）');
    }
    return body;
  },

  /// JSON 接口：解析失败就抛（调用方回退 HTML 路径）。
  async __json(path) {
    var body = await this.__get(path);
    try {
      return JSON.parse(body || 'null');
    } catch (error) {
      throw new Error('随看书：JSON 接口返回的不是 JSON（' + path + '）');
    }
  }
};
