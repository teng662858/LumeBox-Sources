// LumeSource: {"id":"51eshu_novel","name":"无忧小说网","version":"1.0.0","category":"novel","mirrors":["https://m.51eshu.com","https://www.51eshu.com"]}

// 站点：无忧小说网（m.51eshu.com 手机站；页脚「电脑版」指向 www.51eshu.com，
// 两个域名内容一致，都进 mirrors）。utf-8，layui 模板。
//
// ## 抓取口径（对着快照 novel_51eshu_*.html 核过）
//
//   分类   /XuanHuan/ 玄幻 /QiHuan/ 奇幻 /WuXia/ 武侠 /DuShi/ 都市 /LiShi/ 历史
//          /JunShi/ 军事 /XuanYi/ 悬疑 /YouXi/ 游戏 /KeHuan/ 科幻 /TiYu/ 体育
//          /GuYan/ 古言 /XianYan/ 现言 /HuanYan/ 幻言 /XianXia/ 仙侠
//          /QinɡChun/ 青春 /NuShenɡ/ 女生 /ChuanYue/ 穿越 /QiTa/ 其他。
//          **最后两个目录用的是脚本 g（U+0261），不是拉丁 g**——照抄站点自己的
//          导航链接（/sort.html 里就是这么写的），改成普通 g 会 404。
//          分页 `/<栏目>/` 第 1 页、`/<栏目>/<N>.html` 第 N 页（如 /LiShi/2.html）。
//   列表   `ul.list > li`：`<a href="/xs/<书号>.html"><img src=…>`（CDN 原图）、
//          `p.bookname > a`（标题，指向目录 /shu/<书号>/）、`p.data`（作者 + 状态）、
//          `p.intro` 简介。20 条/页；分页 `div.pagelist`。
//   详情   GET /xs/<书号>.html：`.detail > img` 封面、`.name strong` 书名、
//          `.author a` 作者、`.detail p.new a` 最新章节、`最后更新：` 时间；
//          简介在 `.intro` 的**第一个 `<p>`**（后面两段是站点自动生成的水文）。
//   目录   GET /shu/<书号>/ 第 1 页、/shu/<书号>_<N>/ 第 N 页，50 章/页；
//          页内 `<select>` 的 option 列出全部页（这是唯一可靠的总页数来源）；
//          条目 `ul.read > li > a[href=/shu/<书号>/<章节号>.html]`。
//   正文   GET /shu/<书号>/<章节号>.html：`div.content > p`；**一章可能多页**：
//          第 1 页是 `<章节号>.html`，第 2 页起是 `<章节号>_2.html`、
//          `<章节号>_3.html`（分页器里的「下一页」）；末页的「下一页」指向的是
//          **下一章**（"下一章"），所以只跟 `_<n>` 形状的链接，跟错会把整本书
//          当一章拼进来。content() 把同一章的多页按顺序拼起来。
//
// ## 两条纪律
// 1. 目录可能上百页：串行抓会顶穿沙箱墙钟（10s），这里 3 页一批并发 + 5s 软截止。
// 2. 搜索未接入：站点的搜索表单是 POST /search.html（searchkey），实测裸 POST
//    返回「错误提示」页（还缺站点自己的校验字段），没有快照可依 —— 如实抛错，
//    不返回空列表假装成功。

var DEFAULT_BASE = 'https://m.51eshu.com';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

var MAX_ITEMS = 200;         // 单次列表最多产出
var ITEM_WINDOW = 2600;      // 单条往后看的窗口（封面 + 标题 + 作者 + 简介）
var MAX_CHAPTERS = 4000;     // 目录最多解析多少章
var MAX_INDEX_PAGES = 40;    // 目录最多翻多少页（≈2000 章）
var INDEX_BATCH = 3;         // 目录每批并发几页
var INDEX_BUDGET_MS = 5000;  // 目录抓取软截止（沙箱单次调用预算 10s）
var MAX_CHAPTER_PAGES = 20;  // 单章最多拼多少页（防站点给错链接时死循环）

/// 分类＝站点排序页那 18 个栏目（id 就是站点的路径段，含脚本 g 的两个）。
var CATEGORIES = [
  { id: 'XuanHuan', title: '玄幻' },
  { id: 'QiHuan', title: '奇幻' },
  { id: 'WuXia', title: '武侠' },
  { id: 'DuShi', title: '都市' },
  { id: 'LiShi', title: '历史' },
  { id: 'JunShi', title: '军事' },
  { id: 'XuanYi', title: '悬疑' },
  { id: 'YouXi', title: '游戏' },
  { id: 'KeHuan', title: '科幻' },
  { id: 'TiYu', title: '体育' },
  { id: 'GuYan', title: '古言' },
  { id: 'XianYan', title: '现言' },
  { id: 'HuanYan', title: '幻言' },
  { id: 'XianXia', title: '仙侠' },
  // \u0261 是**脚本 g**（U+0261）——站点这两个目录名就长这样，不是拉丁 g。
  { id: 'Qin\u0261Chun', title: '青春' },
  { id: 'NuShen\u0261', title: '女生' },
  { id: 'ChuanYue', title: '穿越' },
  { id: 'QiTa', title: '其他' }
];

/// 栏目 id 白名单：宿主还没选分类 / 存着旧分类值时退回第一个书库，
/// 别拿一个不存在的目录名去拼地址（那只会 404）。
function knownCategory(value) {
  var id = String(value == null ? '' : value).trim();
  for (var i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].id === id) return id;
  }
  return 'XuanHuan';
}

/// 解析后的站点地址：自定义域名 > 用户选中的镜像 > 脚本声明的第一个镜像。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var LumeSource = {
  id: '51eshu_novel',
  name: '无忧小说网',
  version: '1.0.0',
  category: 'novel',

  // ---------------------------------------------------------------- 契约方法

  /// 分类＝站点排序页那 18 个栏目（id 就是站点的路径段，含脚本 g 的两个）。
  async categories() {
    return CATEGORIES.slice();
  },


  async list(argument) {
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = this.__clean(args.keyword || '');
    if (keyword) {
      throw new Error('无忧小说网：本源未接入搜索（站点搜索是 POST /search.html，'
        + '实测裸 POST 返回「错误提示」页，缺站点自己的校验字段）；关键词：' + keyword);
    }
    var category = knownCategory(args.categoryId);
    var html = await this.__get(this.__listPath(category, page));
    return {
      items: this.__items(html),
      hasMore: this.__hasMore(html, category, page)
    };
  },

  async detail(argument) {
    var id = this.__bookId(argument && argument.id);
    if (!id) throw new Error('无忧小说网：缺少作品 ID（列表里给的是 /xs/<书号>.html）');
    var html = await this.__get('/xs/' + id + '.html');
    var title = this.__title(html);
    if (!title) {
      console.warn('[51eshu] 详情页没认出书名：' + id + '（' + html.length + ' 字符）');
      return null;
    }
    var info = this.__detailInfo(html);
    return {
      id: '/xs/' + id + '.html',
      title: title,
      cover: info.cover,
      subtitle: info.subtitle,
      description: info.description
    };
  },

  /// 目录：/shu/<书号>/ 起始，按页内 select 的总页数把 _2、_3… 补齐（50 章/页）。
  async chapters(argument) {
    var id = this.__bookId(argument && argument.id);
    if (!id) throw new Error('无忧小说网：缺少作品 ID');
    var first = await this.__get('/shu/' + id + '/');
    var rows = this.__chapters(first, id);
    if (!rows.length) {
      throw new Error('无忧小说网：目录页没认出章节（/shu/' + id
        + '/）——把运行日志发回来收敛解析规则');
    }
    var pages = this.__indexPages(first, id);
    if (pages > MAX_INDEX_PAGES) pages = MAX_INDEX_PAGES;
    if (pages > 1) {
      var seen = {};
      for (var k = 0; k < rows.length; k++) seen[rows[k].id] = true;
      var started = new Date().getTime();
      for (var page = 2; page <= pages; page += INDEX_BATCH) {
        if (new Date().getTime() - started > INDEX_BUDGET_MS) {
          console.warn('[51eshu] 目录到软截止（' + INDEX_BUDGET_MS + 'ms），先返回已抓到的 '
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

  /// 正文：同一章的多页（`_2`、`_3`…）按顺序拼起来。
  async content(argument) {
    var path = this.__chapterPath(argument);
    if (!path) throw new Error('无忧小说网：缺少章节地址（请重新进一次目录再打开）');
    var parts = this.__chapterPages(path);
    var html = await this.__get(path);
    var lines = this.__articleText(html);
    var seen = {};
    seen[path] = true;
    var page = 1;
    while (parts && parts.bookId && page < MAX_CHAPTER_PAGES) {
      var next = this.__nextPage(html, parts.bookId, parts.chapterId, page);
      if (!next || seen[next]) break;
      seen[next] = true;
      page++;
      html = await this.__get(next);
      var more = this.__articleText(html);
      if (more) lines = lines ? lines + '\n' + more : more;
    }
    if (!lines) {
      throw new Error('无忧小说网：正文页没认出正文（' + path + '，' + html.length
        + ' 字符）——站点可能改版，把运行日志发回来');
    }
    return { kind: 'text', text: lines };
  },

  // ---------------------------------------------------------------- 内部工具

  /// 书号：/xs/29175.html、/shu/29175/、/shu/29175/154548834.html 都取第一段数字。
  __bookId(value) {
    var m = /(\d+)/.exec(String(value == null ? '' : value));
    return m ? m[1] : '';
  },

  /// 章节地址：优先用列表给的章节路径；只给了书号 + 章节号时自己拼。
  __chapterPath(argument) {
    var chapterId = String((argument && argument.chapterId) || '').trim();
    if (chapterId.indexOf('/shu/') === 0) {
      return chapterId.replace(/^https?:\/\/[^/]+/i, '');
    }
    var bookId = this.__bookId(argument && argument.id);
    var token = /(\d+)/.exec(chapterId);
    if (!bookId || !token) return '';
    return '/shu/' + bookId + '/' + token[1] + '.html';
  },

  /// 从章节路径里拆出 /shu/<书号>/<章节号> 两段。
  __chapterPages(path) {
    var m = /^\/shu\/(\d+)\/(\d+)\.html$/.exec(path);
    return m ? { bookId: m[1], chapterId: m[2] } : null;
  },

  /// 本章的下一页：只认 `div.pager` 里形如 `/shu/<书号>/<章节号>_<n>.html` 且
  /// n 大于当前页的锚点（末页的「下一页」指向下一章，形状不同，天然被排除）。
  __nextPage(html, bookId, chapterId, page) {
    var start = html.indexOf('class="pager"');
    var block = start < 0 ? html : html.slice(start, start + 2000);
    var pattern = new RegExp('/shu/' + bookId + '/' + chapterId + '_(\\d+)\\.html', 'g');
    var best = 0;
    var match;
    while ((match = pattern.exec(block)) !== null) {
      var n = Number(match[1]);
      if (n > page && (best === 0 || n < best)) best = n;
    }
    return best ? '/shu/' + bookId + '/' + chapterId + '_' + best + '.html' : '';
  },

  __listPath(category, page) {
    return '/' + category + '/' + (page > 1 ? page + '.html' : '');
  },

  /// 列表条目：`ul.list > li`（站内相对地址 `/xs/<书号>.html` + CDN 原图）。
  __items(html) {
    var items = [];
    var seen = {};
    var pattern = /<li><a href="\/xs\/(\d+)\.html"[^>]*>[\s\S]{0,300}?<img[^>]+src="([^"]+)"/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var id = match[1];
      if (seen[id]) continue;
      seen[id] = true;
      var block = html.slice(match.index, match.index + ITEM_WINDOW);
      var titleMatch = /class="bookname"[\s\S]{0,80}?<a[^>]*>([\s\S]{0,160}?)<\/a>/.exec(block);
      var dataMatch = /class="data"[^>]*>([\s\S]{0,300}?)<\/p>/.exec(block);
      var bits = [];
      var author = this.__clean(dataMatch ? dataMatch[1].replace(/<[^>]*>/g, '') : '');
      if (author) bits.push('作者：' + author.replace(/^作者[:：]?\s*/, ''));
      var cover = this.__cover(match[2]);
      items.push({
        id: '/xs/' + id + '.html',
        title: this.__clean(titleMatch ? titleMatch[1] : '') || ('作品 ' + id),
        cover: cover,
        coverHeaders: cover ? this.__coverHeaders() : null,
        subtitle: bits.length ? bits.join(' · ') : null
      });
    }
    return items;
  },

  /// 还有下一页吗：分页器 `div.pagelist` 里有「下一页」（末页没有）。
  __hasMore(html, category, page) {
    var start = html.indexOf('class="pagelist"');
    var block = start < 0 ? '' : html.slice(start, start + 3000);
    if (!block) return false;
    if (/下一页/.test(block)) return true;
    // 认不出「下一页」时退回「有没有更大的页码链接」。
    var pattern = new RegExp('/' + category + '/(\\d+)\\.html', 'g');
    var match;
    while ((match = pattern.exec(block)) !== null) {
      if (Number(match[1]) > page) return true;
    }
    return false;
  },

  __detailInfo(html) {
    var coverMatch = /<div class="detail">[\s\S]{0,200}?<img[^>]+src="([^"]+)"/.exec(html)
      || /og:image" content="([^"]+)"/.exec(html);
    var authorMatch = /class="author"[^>]*>[\s\S]{0,60}?<a[^>]*>([^<]*)<\/a>/.exec(html)
      || /og:novel:author" content="([^"]*)"/.exec(html);
    // 状态：站点用 layui-btn-normal / layui-btn-danger 标「连载中 / 完结」；
    // 只用 `layui-btn-radius">` 会先撞上那个「分类」锚点（它也是 radius 结尾），
    // 把分类当成状态（实测踩过）。
    var statusMatch = /layui-btn-radius\s+layui-btn-(?:normal|danger)"[^>]*>([^<]{1,8})<\/span>/.exec(html);
    var categoryMatch = /class="layui-btn layui-btn-xs layui-btn-radius"[^>]*>([^<]{1,8})<\/a>/.exec(html);
    var latestMatch = /class="new"[^>]*>[\s\S]{0,40}?<a[^>]*>([^<]*)<\/a>/.exec(html)
      || /og:novel:latest_chapter_name" content="([^"]*)"/.exec(html);
    var updatedMatch = /最后更新[:：]\s*([0-9: \-]{6,30})/.exec(html);
    var intro = this.__slice(html, 'class="intro"', '</div>');
    var introMatch = /<p[^>]*>([\s\S]*?)<\/p\s*>/.exec(intro || '');
    var bits = [];
    var author = this.__clean(authorMatch ? authorMatch[1] : '');
    var category = this.__clean(categoryMatch ? categoryMatch[1] : '');
    var status = this.__clean(statusMatch ? statusMatch[1] : '');
    var latest = this.__clean(latestMatch ? latestMatch[1] : '');
    var updated = this.__clean(updatedMatch ? updatedMatch[1] : '');
    if (author) bits.push('作者：' + author);
    if (category) bits.push(category);
    if (status) bits.push(status);
    if (latest) bits.push('最新：' + latest);
    if (updated) bits.push('更新：' + updated);
    return {
      cover: this.__cover(coverMatch ? coverMatch[1] : ''),
      subtitle: bits.length ? bits.join(' · ') : null,
      description: this.__clean(introMatch ? introMatch[1] : '')
    };
  },

  __title(html) {
    var match = /class="name"><strong>([\s\S]{0,200}?)<\/strong>/.exec(html);
    if (match && this.__clean(match[1])) return this.__clean(match[1]);
    var og = /og:novel:book_name" content="([^"]*)"/.exec(html);
    if (og && this.__clean(og[1])) return this.__clean(og[1]);
    var header = /<h1>([\s\S]{0,120}?)<\/h1>/.exec(html);
    return header ? this.__clean(header[1]) : '';
  },

  /// 目录页总页数：页内 `<select>` 的 option（`/shu/<书号>_<N>/`）最大值；
  /// 没有 select（只有一页）时按 1 页。
  __indexPages(html, id) {
    var pages = 1;
    var pattern = new RegExp('/shu/' + id + '_(\\d+)/', 'g');
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var n = Number(match[1]);
      if (n > pages) pages = n;
    }
    return pages;
  },

  /// 一页目录：`ul.read > li > a[href=/shu/<书号>/<章节号>.html]`。
  __chapters(html, id) {
    var start = html.indexOf('class="read"');
    if (start < 0) return [];
    var end = html.indexOf('</ul>', start);
    if (end < 0) end = Math.min(html.length, start + 500000);
    var block = html.slice(start, end);
    var pattern = new RegExp('<a href="/shu/' + id + '/(\\d+)\\.html"[^>]*>([\\s\\S]{0,120}?)</a>', 'g');
    var rows = [];
    var match;
    while ((match = pattern.exec(block)) !== null) {
      if (rows.length >= MAX_CHAPTERS) break;
      rows.push({
        id: '/shu/' + id + '/' + match[1] + '.html',
        title: this.__clean(match[2]) || ('第 ' + match[1] + ' 章')
      });
    }
    return rows;
  },

  /// 目录的一页：单页失败只当空页（别让一处 502 把整本目录废掉）。
  __indexPage(id, page) {
    var self = this;
    return this.__get('/shu/' + id + '_' + page + '/').then(function (html) {
      return self.__chapters(html, id);
    }, function () {
      return [];
    });
  },

  /// 正文：`div.content` 里的 `<p>`（段落以全角空格缩进）。
  __articleText(html) {
    var block = this.__slice(html, 'class="content"', '</div>');
    if (!block) return '';
    var paragraphs = [];
    var pattern = /<p[^>]*>([\s\S]*?)<\/p\s*>/g;
    var match;
    while ((match = pattern.exec(block)) !== null) {
      var text = this.__cleanBlock(match[1]);
      if (text) paragraphs.push(text);
    }
    if (paragraphs.length) return paragraphs.join('\n');
    return this.__clean(block);
  },

  __slice(html, anchor, endMarker) {
    var start = html.indexOf(anchor);
    if (start < 0) return '';
    var end = html.indexOf(endMarker, start);
    if (end < 0) end = Math.min(html.length, start + 400000);
    return html.slice(start, end);
  },

  /// 封面：CDN 绝对地址（https://img.51eshu.com/…）；跳过占位图。
  /// 图床是独立域名，带上 Referer 更稳（宿主图片管线支持时透传）。
  __cover(url) {
    var value = this.__entity(String(url || '')).trim();
    if (!value) return '';
    if (/nocover|nopic|default_no_thumbnail|loading|blank/i.test(value)) return '';
    if (value.indexOf('//') === 0) return 'https:' + value;
    if (/^https?:\/\//i.test(value)) return value.replace(/^http:\/\//i, 'https://');
    return base() + (value.charAt(0) === '/' ? '' : '/') + value;
  },

  /// 封面在独立图床（img.51eshu.com），带上 Referer + UA（契约里图片级请求头，
  /// 宿主图片管线会透传）。
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
      headers: { 'User-Agent': UA, 'Referer': base() + '/' }
    });
    var status = response ? Number(response.status) : 0;
    var body = response && response.body ? String(response.body) : '';
    if (status !== 200) {
      if (status === 403 || status === 503 || status === 429) {
        throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
          + status + ' ' + url + '）');
      }
      throw new Error('无忧小说网：拉取失败（HTTP ' + status + ' ' + url + '）');
    }
    if (/just a moment|checking your browser|__cf_chl|cf-chl-/.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
        + status + ' ' + url + '）');
    }
    return body;
  }
};
