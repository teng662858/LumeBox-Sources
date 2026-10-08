// LumeSource: {"id":"jm18_comic","name":"18禁漫","version":"1.0.0","category":"comic"}

// 站点：https://18jm18.com（MacCMS v10 + conch 主题；类名前缀 hl- / conch-）
// 桌面版与移动版是**同一套标记**（站点没有移动子域），脚本不挑 UA。
//
// ## 抓取口径（每一条都对着**实时页面**核过，快照见 snapshots/jm18_*.html）
//
//   列表  GET /comic-lists/{题材|all}/ob/{time|hits}/st/{all|serialized|completed}[/page/N]
//         24 条/页。条目在 `ul.hl-vod-list > li.hl-list-item` 里：
//           <a class="hl-item-thumb hl-lazy" href="/read-comics/{数字id}.html"
//              title="标题" data-original="封面">
//         **封面只在 data-original 里**（既没有 src 也没有占位图，别去读 src）；
//         副标题是紧跟的 `div.hl-item-sub`：首页板块放「最新话」、列表/搜索页放日期，
//         两种都当纯文本副标题用。分页器写 `/page/{N}`（第 N 页是路径段，不是查询串）。
//   搜索  GET /cata.php?key={UTF-8 百分号编码}[&page=N] —— 站点搜索表单自己的 action。
//         分页器里给的是 /comics-find/{关键词}/page/N（**路径里是裸中文**），
//         实测两者同内容；脚本一律走 cata.php 的查询串：编码可控，不赌服务端
//         对裸中文路径的解码。
//   详情  GET /read-comics/{数字id}.html
//         标题 `<h1 class="hl-dc-title …">秘密教学</h2>`——站点把它写坏成了 </h2> 收尾，
//         所以**只匹配开始标签**，读到下一个 '<' 为止（照 </h1> 收尾会一条都解析不出）；
//         封面 `.hl-dc-pic > span.hl-item-thumb[data-original]`（近处还有一份
//         `span.hl-topbg-pic[style=background-image:url(…)]`，不依赖它）；
//         作者 / 状态 / 更新 / 分类都是 `li.hl-col-xs-12 > em` 行，简介在 `li.blurb`。
//   目录  就在详情页里（单页、完整、**旧→新**，站点没有单独的目录地址）：
//         `ul.hl-plays-list > li > a[href=/read-comics/{id}/{hash}.html]`。
//         {hash} 是 20/22 位随机 token，**同一部作品里两种长度混着出现**
//         （长目录那部 327 话里 20 位 101 条、22 位 226 条），按固定长度写死会少一半，
//         所以只认「/read-comics/{数字}/{token}.html」这个形状。
//   正文  GET /read-comics/{id}/{hash}.html：图片是 `img.lazy.hl-lazy[data-original]`，
//         一章一页、**没有章内翻页**（不拼 ?page=）。页面上还混着 yandex 统计像素
//         （只有 src）和 JuicyAds 的 <ins> 广告块，所以**只认 data-original**
//         （兜底也只从 img.hl-lazy 这套标记里取），绝不整页抓裸 <img>。
//
// ## 三条实测出来的坑（写错了整页抓不到 / 少一半）
//
// 1. **题材路径必须自己百分号编码**。站点自己的链接是裸中文（/comic-lists/韩漫/…），
//    而把中文原样塞进请求路径实测会撞上服务端的字符集判定：回 0 条、标题乱码
//    （共 0 个结果）；同一地址写成 %E9%9F%A9%E6%BC%AB 就是 24 条（共 1433 条）。
//    因此这里统一走 __encodePath（只编码非 ASCII 字符，'/' 与已编码的 % 原样保留）。
// 2. **章节 id 用完整章节地址**。{hash} 只能从详情页解析出来，存成完整地址后
//    content() 拿到就能直接取（不再拼一次、也不再依赖作品 id）。
// 3. **目录顺序**。站点是旧→新（不像色友漫画那样把最新一话钉在首位），但实测有一处
//    局部倒挂：第250話 排在第251話 之后。这里按话数**重排成升序**，但只把带编号的
//    条目排进「它们原来占的那些位置」——停刊/休刊公告这类没有编号的条目**留在原地**
//    （站点就是把它夹在停更的那一话后面，挪到末尾反而把上下文弄丢了）。
//    编号一旦出现重复（多半是第二季/重制版，说明话数不是全序）就整体退回站点顺序。
//
// 图片域名（p3p/p4p/p5/p6.18rouman.vip）实测**不需要 Referer**；站点有 Cloudflare 前置
// 但普通 GET 没有挑战页（快照与实时页都没有 __cf_chl / challenge-platform 痕迹），
// 被拦时的标记路径照留（见 __get）——真拦了就抛 NEED_WEBVIEW_VERIFY 让 App 拉起网页视图。
//
// 「首页」用站点自己的 5 个板块（热门/最近更新/新上架/站长推荐/已完结，各 12 条），
// 板块的「更多」原样透传给 list()；/hot-comics、/newupdate-comics、
// /newupdate-comics/newupdate-comics 是**整表页**（实测 96/88/88 条、没有分页器），
// 只有第 1 页，不去猜一个不存在的 /page/2。

var BASE_URL = 'https://18jm18.com';

var PAGE_SIZE = 24;        // 列表/搜索每页条数（快照实测）
var MIN_PAGE_ITEMS = PAGE_SIZE - 4;  // 「还有下一页」的条数兜底（满页 24 条，少几条也算）
var MAX_ITEMS = 150;       // 单次列表最多产出（整表页实测 96 条，留余量）
var MAX_ANCHORS = 1200;    // 单次解析最多看多少个 li.hl-list-item
var MAX_BOARDS = 8;        // 首页最多几块
var ITEM_WINDOW = 900;     // 单条往后看的窗口（副标题、封面都在这段里）
var BOARD_WINDOW = 20000;  // 首页板块窗口上限（实测一块 ≈10.5KB）
var PAGER_WINDOW = 6000;   // 分页器块往后看的窗口
var MAX_PAGE_LINKS = 400;  // 分页器里最多认多少条 /page/N
var MAX_CATALOG_SCAN = 300000;  // 目录块最多扫多少字符（327 话 ≈49KB，留足余量）
var MAX_CHAPTERS = 3000;   // 目录最多解析多少话
var MAX_INLINE_SCAN = 200000;   // 正文页最多扫多少字符（实测一页 ≈22KB）
var MAX_IMAGES = 400;      // 正文最多收多少张图（实测一章 55–119 张）
var MAX_IMAGE_ATTRS = 4000;
var TAG_LIMIT = 8;         // 详情页题材最多收几个

// 「这不是封面/正文图」：站标、统计像素、广告、占位图（平铺 /i、无 /g，可安全 test）。
var SKIP_IMAGE = /logo|avatar|banner|advert|placeholder|blank|loading|icon|sprite|qrcode|share|yandex|jads|spacer/i;

// 整表页：站点自己的「更多」指向这些地址，实测都只有第 1 页（没有分页器）。
var SINGLE_PAGE_PATHS = ['/hot-comics', '/newupdate-comics', '/newupdate-comics/newupdate-comics'];

// 作品/章节地址的前缀（站点只有这一套；长度写死过 13/14 的教训见 __itemPath）。
var READ_COMICS_PREFIX = '/read-comics/';

var LumeSource = {
  id: 'jm18_comic',
  name: '18禁漫',
  version: '1.0.0',
  category: 'comic',

  // ---------------------------------------------------------------- 契约方法

  /// 分类：从列表页自己的筛选条（分类 / 进度 / 排序三组）实时读，
  /// id 用**站点自己的列表地址**（list() 原样认），title 用筛选条上的文字。
  /// 认不出来就只给「全部」——站点自己的 /comic-lists/all/ob/time/st/all 永远是真实的，
  /// 不编分类（站点改版也不至于给用户一堆假分类）。
  async categories() {
    var html = await this.__get(BASE_URL + '/comic-lists/all/ob/time/st/all');
    var found = this.__filterCategories(html);
    if (!found.length) {
      console.warn('[jm18] 列表页没认出筛选条（' + html.length + ' 字符），只给「全部」');
      return [{ id: '/comic-lists/all/ob/time/st/all', title: '全部' }];
    }
    console.warn('[jm18] 筛选条读到 ' + found.length + ' 项分类');
    return found;
  },

  /// 首页：站点自己的 5 个板块（每块 12 条），「更多」直接透传板块自己的地址。
  /// 认不出板块就退回列表页一块（不让首页空着）。
  async home() {
    var html = await this.__get(BASE_URL + '/');
    var boards = this.__boards(html);
    if (boards.length) {
      console.warn('[jm18] 首页板块 ' + boards.length + ' 块');
      return boards;
    }
    var latest = await this.list({ categoryId: 'all', page: 1 });
    if (latest && latest.items && latest.items.length) {
      console.warn('[jm18] 首页没认出板块（' + html.length + ' 字符），退回列表页一块');
      return [{ title: '最近更新', moreUrl: 'all', items: latest.items.slice(0, 12) }];
    }
    return [];
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!(page > 0)) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';

    var url = this.__listUrl(category, keyword, page);
    if (!url) {
      // 整表页（/hot-comics 那类）站点只有第 1 页：第 2 页不该去请求（会 404）。
      console.warn('[jm18] 「' + category + '」只有第 1 页，第 ' + page + ' 页返回空');
      return { items: [], hasMore: false };
    }
    var html = await this.__get(url);
    var items = this.__listItems(html);
    if (!items.length) {
      console.warn('[jm18] 列表没解析出条目：' + url + '（' + html.length + ' 字符）');
      return { items: [], hasMore: false };
    }
    console.warn('[jm18] 列表命中：' + url + '（' + items.length + ' 条）');
    return { items: items, hasMore: this.__hasNextPage(html, page, items.length) };
  },

  async detail(argument) {
    var path = this.__detailPath(this.__id(argument));
    var url = BASE_URL + this.__encodePath(path);
    var html = await this.__get(url);
    var title = this.__detailTitle(html);
    if (!title) {
      console.warn('[jm18] 详情页没认出标题：' + url + '（' + html.length + ' 字符）');
      return null;
    }
    var info = this.__detailInfo(html);
    return {
      id: path,
      title: title,
      cover: this.__detailCover(html),
      subtitle: this.__cut(info.author ? '作者：' + info.author : info.status, 60),
      description: info.description,
      tags: info.tags,
      extra: { author: info.author, status: info.status, updated: info.updated }
    };
  },

  /// 目录就在详情页里（单页、完整、旧→新）→ 按话数修成升序给 App（见文件头「坑 3」）。
  async chapters(argument) {
    var path = this.__detailPath(this.__id(argument));
    var url = BASE_URL + this.__encodePath(path);
    var html = await this.__get(url);
    var chapters = this.__catalog(html, path.replace(/\.html$/, '/'));
    if (!chapters.length) {
      throw new Error('18禁漫：目录没认出章节链接（' + url + '）——把运行日志发回来收敛解析规则');
    }
    console.warn('[jm18] 目录 ' + chapters.length + ' 话（已按话数升序）：' + url);
    return chapters;
  },

  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    if (!chapterId) throw new Error('18禁漫：缺少章节 ID（请先选择一话）');
    var itemId = argument && argument.id != null ? String(argument.id) : '';
    var url = this.__chapterUrl(chapterId, itemId);
    if (!url) {
      throw new Error('18禁漫：认不出章节地址（' + chapterId + '）——章节 id 应当来自 chapters()');
    }
    var html = await this.__get(url);
    var images = this.__images(html);
    if (!images.length) {
      throw new Error('18禁漫：这一话没解析出图片（' + url + '）——把运行日志发回来收敛解析规则');
    }
    console.warn('[jm18] 正文 ' + images.length + ' 张图（单页，不翻页）：' + url);
    return { kind: 'images', images: images };
  },

  // ---------------------------------------------------------------- 地址策略

  /// 列表地址。分类 id 认这三态（都来自站点自己的链接，没有编的）：
  ///   '' / 'all'         → /comic-lists/all/ob/time/st/all（全站，会分页）
  ///   以 '/' 开头        → 站点自己的路径（筛选条 / 首页「更多」都是这个形状）
  ///   其它（题材名）      → /comic-lists/{题材}/ob/time/st/all
  /// 搜索走 /cata.php?key=…（编码查询串；裸中文路径不赌）。
  __listUrl(category, keyword, page) {
    if (keyword) {
      var search = '/cata.php?key=' + this.__encode(keyword);
      if (page > 1) search += '&page=' + page;
      return BASE_URL + search;
    }
    var path = this.__categoryPath(category);
    if (this.__isSinglePagePath(path)) return page > 1 ? '' : BASE_URL + this.__encodePath(path);
    if (page > 1) path = path.replace(/\/$/, '') + '/page/' + page;
    return BASE_URL + this.__encodePath(path);
  },

  __categoryPath(category) {
    var id = String(category == null ? '' : category).trim();
    if (!id || id === 'all') return '/comic-lists/all/ob/time/st/all';
    if (id === 'completed') return '/comic-lists/all/ob/time/st/completed';
    if (id === 'serialized') return '/comic-lists/all/ob/time/st/serialized';
    if (id === 'hits') return '/comic-lists/all/ob/hits/st/all';
    if (id.charAt(0) === '/') return id;
    if (id.indexOf('comic-lists') === 0) return '/' + id;
    if (id.indexOf('http') === 0) {
      var rest = id.indexOf(BASE_URL) === 0 ? id.slice(BASE_URL.length) : '';
      if (rest) return rest;
      // 别的域名不猜：退回全站列表，宁可多给一页也不去请求陌生地址。
      console.warn('[jm18] 认不出的分类地址（不是本站）：' + id + '，退回全部');
      return '/comic-lists/all/ob/time/st/all';
    }
    return '/comic-lists/' + id + '/ob/time/st/all';
  },

  /// 整表页：站点没给分页器，只有第 1 页（实测 /hot-comics 96 条、
  /// /newupdate-comics 88 条、/newupdate-comics/newupdate-comics 88 条，都没有分页器）。
  __isSinglePagePath(path) {
    return this.__hasText(SINGLE_PAGE_PATHS, path);
  },

  __id(argument) {
    var id = '';
    if (argument && argument.id != null) id = String(argument.id);
    else if (argument && argument.comicId != null) id = String(argument.comicId);
    else if (argument && argument.bookId != null) id = String(argument.bookId);
    if (!id) throw new Error('18禁漫：缺少作品 ID');
    return id;
  },

  /// 作品地址：数字 id / 站点路径 / 完整地址都认，统一成站内路径 `/read-comics/{id}.html`。
  __detailPath(id) {
    var value = String(id || '').trim();
    if (!value) throw new Error('18禁漫：缺少作品 ID');
    if (value.indexOf('http') === 0) {
      if (value.indexOf(BASE_URL) !== 0) throw new Error('18禁漫：作品地址不在本站（' + value + '）');
      value = value.slice(BASE_URL.length);
    }
    if (this.__digitsOnly(value)) return '/read-comics/' + value + '.html';
    if (value.charAt(0) !== '/') value = '/' + value;
    if (value.indexOf('/read-comics/') !== 0) {
      throw new Error('18禁漫：认不出的作品地址（' + id + '）——id 应当来自 list()/detail()');
    }
    // /read-comics/{数字}.html —— 章节地址多一段 {hash}，不属于作品地址。
    var rest = value.slice(READ_COMICS_PREFIX.length);
    if (!this.__endsWith(rest, '.html')) throw new Error('18禁漫：认不出的作品地址（' + id + '）');
    var digits = rest.slice(0, rest.length - 5);
    if (!this.__digitsOnly(digits)) throw new Error('18禁漫：认不出的作品 ID（' + id + '）');
    return '/read-comics/' + digits + '.html';
  },

  /// 章节地址：完整地址 / 站内路径都认；只给了 {hash} 时用作品 id 拼站点自己的形状。
  __chapterUrl(chapterId, itemId) {
    var value = String(chapterId || '').trim();
    if (!value) return '';
    var path = '';
    if (value.indexOf('http') === 0) {
      if (value.indexOf(BASE_URL) !== 0) return '';
      path = value.slice(BASE_URL.length);
    } else if (value.charAt(0) === '/') {
      path = value;
    } else if (/^[A-Za-z0-9]{8,40}$/.test(value)) {
      // 只有 {hash}：用作品 id 拼出 /read-comics/{id}/{hash}.html（站点自己的形状）。
      var comic = '';
      try { comic = this.__detailPath(itemId); } catch (error) { comic = ''; }
      if (!comic) return '';
      path = comic.replace(/\.html$/, '/' + value + '.html');
    }
    if (!path || path.indexOf('/read-comics/') !== 0) return '';
    if (!this.__endsWith(path, '.html')) return '';
    return BASE_URL + this.__encodePath(path);
  },

  // ---------------------------------------------------------------- 分类 / 首页

  /// 筛选条：列表页里三组 `div.hl-filter-wrap`（分类 / 进度 / 排序），
  /// 每组是一串 `<li><a href="/comic-lists/…/ob/…/st/…" title="…">文字</a></li>`。
  /// id 直接用它的 href（站内路径），title 优先用锚内文字（比 title 属性的
  /// 「韩漫类漫画」短）。同一个地址在两组里都出现（「全部」在分类与进度里都是
  /// /comic-lists/all/ob/time/st/all）→ 按 id 去重。
  __filterCategories(html) {
    var found = [];
    var seen = {};
    var scanned = 0;
    var at = html.indexOf('hl-filter-wrap');
    while (at >= 0) {
      if (++scanned > 12) break;
      var next = html.indexOf('hl-filter-wrap', at + 16);
      var window = html.slice(at, next > at ? next : Math.min(html.length, at + 6000));
      var anchorAt = window.indexOf('<a ');
      var links = 0;
      while (anchorAt >= 0 && links < 40) {
        links++;
        var tagEnd = window.indexOf('>', anchorAt);
        if (tagEnd < 0) break;
        var tag = window.slice(anchorAt, tagEnd + 1);
        var id = this.__pathId(this.__attr(tag, 'href'));
        if (id && !seen[id]) {
          var title = this.__cut(this.__readText(window, tagEnd + 1, 40), 12) ||
            this.__genreTitle(this.__attr(tag, 'title'));
          if (title) {
            seen[id] = true;
            found.push({ id: id, title: title });
          }
        }
        anchorAt = window.indexOf('<a ', tagEnd);
      }
      at = next;
    }
    return found;
  },

  /// 站点链接 → 站内路径 id。只认列表页自己的形状（/comic-lists/…），别的原样丢掉。
  __pathId(href) {
    var text = String(href || '').trim();
    if (!text || text.indexOf('javascript:') === 0 || text.charAt(0) === '#') return '';
    if (text.indexOf('http') === 0) {
      if (text.indexOf(BASE_URL) !== 0) return '';
      text = text.slice(BASE_URL.length);
    }
    if (text.charAt(0) !== '/') text = '/' + text;
    if (text.indexOf('/comic-lists/') !== 0) return '';
    return text;
  },

  /// title 属性去尾巴（站点写成「韩漫类漫画」/「按时间排序」这种，锚内文字才是短名）。
  __genreTitle(text) {
    var value = String(text || '').trim();
    if (!this.__endsWith(value, '漫画')) return value;
    return value.slice(0, value.length - 2);
  },

  /// 首页板块：`<h2 class="hl-rb-title">…标题</h2>` +
  /// `<a class="hl-rb-more" href="…">更多</a>` + 一个 `ul.hl-vod-list`（12 条）。
  /// 窗口 = 本级标题到下一级标题（末尾一块到 BOARD_WINDOW 上限）。
  __boards(html) {
    var boards = [];
    var scanned = 0;
    var at = html.indexOf('class="hl-rb-title"');
    while (at >= 0 && boards.length < MAX_BOARDS) {
      if (++scanned > 24) break;
      var next = html.indexOf('class="hl-rb-title"', at + 18);
      var window = html.slice(at, next > at ? next : Math.min(html.length, at + BOARD_WINDOW));
      var title = this.__headingText(window, 'class="hl-rb-title"', '</h2', 20);
      var items = this.__listItems(window);
      if (title && items.length) {
        boards.push({
          title: title,
          moreUrl: this.__moreId(window),
          items: items.slice(0, 12)
        });
      }
      at = next;
    }
    return boards;
  },

  /// 板块「更多」→ list() 认得的分类 id（就是站点自己写的那个地址）。
  /// 只认本站列表页 / 整表页的形状，认不出的退回 all（不猜地址）。
  __moreId(window) {
    var at = window.indexOf('hl-rb-more');
    if (at < 0) return 'all';
    var start = window.lastIndexOf('<a', at);
    var end = window.indexOf('>', at);
    var href = start >= 0 && end > start ? this.__attr(window.slice(start, end + 1), 'href') : '';
    var path = this.__pathId(href);
    if (path) return path;
    var text = String(href || '').trim();
    if (text.indexOf('http') === 0 && text.indexOf(BASE_URL) === 0) text = text.slice(BASE_URL.length);
    if (text.charAt(0) !== '/') text = '/' + text;
    return this.__hasText(SINGLE_PAGE_PATHS, text) ? text : 'all';
  },

  // ---------------------------------------------------------------- 解析

  /// 列表条目：`li.hl-list-item` 里的第一个锚就是作品缩略图锚
  /// （href / title / data-original 都在它身上），副标题是紧随的 div.hl-item-sub。
  /// 同一窗口内按作品去重：**去重只在窗口内做**——首页同一部作品可以同时出现在
  /// 「热门」和「最近更新」两块里，那是站点自己的排法。
  __listItems(html) {
    var items = [];
    var seen = {};
    var scanned = 0;
    var at = html.indexOf('hl-list-item');
    while (at >= 0) {
      if (++scanned > MAX_ANCHORS || items.length >= MAX_ITEMS) break;
      var tagEnd = html.indexOf('>', at);
      if (tagEnd < 0) break;
      var anchorAt = html.indexOf('<a', tagEnd);
      if (anchorAt >= 0) {
        var anchorEnd = html.indexOf('>', anchorAt);
        var tag = html.slice(anchorAt, anchorEnd + 1);
        var id = this.__itemPath(this.__attr(tag, 'href'));
        if (id && !seen[id]) {
          var window = html.substr(tagEnd, ITEM_WINDOW);
          var title = this.__cut(this.__plain(this.__attr(tag, 'title')), 80) ||
            this.__cut(this.__classText(window, 'hl-item-title'), 80);
          if (title) {
            seen[id] = true;
            items.push({
              id: id,
              title: title,
              cover: this.__absolute(this.__attr(tag, 'data-original')),
              subtitle: this.__cut(this.__classText(window, 'hl-item-sub'), 40)
            });
          }
        }
      }
      at = html.indexOf('hl-list-item', at + 13);
    }
    return items;
  },

  /// 作品链接 → 站内路径 id（`/read-comics/{数字}.html`）。章节链接（多一段 hash）不算。
  __itemPath(href) {
    var text = String(href || '').trim();
    if (!text) return '';
    if (text.indexOf('http') === 0) {
      if (text.indexOf(BASE_URL) !== 0) return '';
      text = text.slice(BASE_URL.length);
    }
    if (text.charAt(0) !== '/') text = '/' + text;
    if (text.indexOf(READ_COMICS_PREFIX) !== 0) return '';
    var rest = text.slice(READ_COMICS_PREFIX.length);
    if (!this.__endsWith(rest, '.html')) return '';
    var digits = rest.slice(0, rest.length - 5);
    return this.__digitsOnly(digits) ? READ_COMICS_PREFIX + digits + '.html' : '';
  },

  /// 还有没有下一页：站点的分页器在 `ul.hl-page-wrap` 里，链接是 `/page/{N}`。
  /// **整表页没有这个容器 → 没有下一页**；分页器里最大页码不大于当前页 → 也没有；
  /// 分页器空着（结果不足一页）就退回按条数兜底。
  __hasNextPage(html, page, count) {
    var current = page > 0 ? page : 1;
    var pager = html.indexOf('hl-page-wrap');
    if (pager < 0) return false;
    var max = this.__maxPageIn(html.substr(pager, PAGER_WINDOW));
    if (max > current) return true;
    if (max > 0) return false;
    return count >= MIN_PAGE_ITEMS;
  },

  /// 窗口里最大的 `/page/{N}`（单遍字符扫描，无回溯）。
  __maxPageIn(text) {
    var needle = '/page/';
    var at = text.indexOf(needle);
    var best = 0;
    var scanned = 0;
    while (at >= 0) {
      if (++scanned > MAX_PAGE_LINKS) break;
      var i = at + needle.length;
      var value = 0;
      var digits = 0;
      while (i < text.length && digits < 5) {
        var code = text.charCodeAt(i);
        if (code < 48 || code > 57) break;
        value = value * 10 + (code - 48);
        i++;
        digits++;
      }
      if (digits && value > best) best = value;
      at = text.indexOf(needle, i);
    }
    return best;
  },

  /// 详情标题：`<h1 class="hl-dc-title …">秘密教学</h2>`（站点收尾标签写坏了，
  /// 只能匹配开始标签、读到下一个 '<'）。读不到再退 `<title>`（去掉站点后缀）。
  __detailTitle(html) {
    var at = html.indexOf('hl-dc-title');
    if (at >= 0) {
      var open = html.indexOf('>', at);
      if (open >= 0) {
        var text = this.__plain(this.__readText(html, open + 1, 120));
        if (text) return this.__stripBrackets(text);
      }
    }
    var raw = this.__titleTag(html);
    var cut = raw.indexOf(' - ');
    if (cut > 0) raw = raw.slice(0, cut);
    return this.__plain(this.__stripBrackets(raw));
  },

  /// 封面：`.hl-dc-pic` 里的 data-original（页面近处还有 hl-topbg-pic 那份背景图，
  /// 两者是同一张，不依赖它）。整页第一张图抓不得：导航里就有别的缩略图。
  __detailCover(html) {
    var at = html.indexOf('hl-dc-pic');
    if (at >= 0) {
      var cover = this.__coverIn(html.substr(at, 1200));
      if (cover) return cover;
    }
    var top = html.indexOf('hl-topbg-pic');
    if (top >= 0) {
      var url = this.__backgroundUrl(html.slice(top, top + 600));
      if (this.__isImage(url)) return this.__absolute(url);
    }
    return '';
  },

  /// 详情信息：作者 / 状态 / 更新 / 分类 / 简介 都是
  /// `<li class="hl-col-xs-12…"><em class="hl-text-muted">作者：</em>…</li>` 这一套行
  /// （每个标签在本站详情页只出现一次，实测）。按标签锚点读整行文本。
  __detailInfo(html) {
    var result = { author: '', status: '', updated: '', description: '', tags: [] };
    result.author = this.__cut(this.__rowText(html, '作者：'), 40);
    result.status = this.__cut(this.__rowText(html, '状态：'), 20);
    result.updated = this.__cut(this.__rowText(html, '更新：'), 20);
    result.description = this.__cut(this.__rowText(html, '简介：'), 600);
    result.tags = this.__detailTags(html);
    return result;
  },

  /// 读「标签：」所在的那个 li 行，返回去掉标签后的文本。
  __rowText(html, label) {
    var at = html.indexOf(label);
    if (at < 0) return '';
    var start = html.lastIndexOf('<li', at);
    if (start < 0) start = at;
    var end = html.indexOf('</li>', at);
    if (end < 0) end = Math.min(html.length, at + 800);
    var text = this.__plain(html.slice(start, end));
    var colon = text.indexOf(label);
    return colon >= 0 ? text.slice(colon + label.length).trim() : text;
  },

  /// 题材：`a.detail-tags-item` 的文字。站点把每个题材写了两遍
  /// （/comic-lists/韩漫 与 /comics-find/韩漫 各一条，文字相同）→ 按文字去重。
  __detailTags(html) {
    var tags = [];
    var seen = {};
    var at = html.indexOf('detail-tags-item');
    var scanned = 0;
    while (at >= 0) {
      if (++scanned > 40 || tags.length >= TAG_LIMIT) break;
      var open = html.indexOf('>', at);
      if (open < 0) break;
      var close = html.indexOf('<', open + 1);
      if (close < 0) break;
      var text = this.__plain(html.slice(open + 1, close));
      if (text && text.length <= 10 && !seen[text]) {
        seen[text] = true;
        tags.push(text);
      }
      at = html.indexOf('detail-tags-item', close);
    }
    return tags;
  },

  /// 目录：`ul#hl-plays-list > li > a[href=/read-comics/{id}/{hash}.html]`。
  /// id 用**完整章节地址**（hash 只能从这里解析出来，content() 拿它直接取）。
  ///
  /// 只看目录块本身（到它的 `</ul>` 为止），而且**只收本站这一部作品的章节地址**
  /// （`prefix` 是 `/read-comics/{id}/`）——详情页下面还有「相关推荐」轮播，
  /// 那些条目也链到**别的作品的第一话**，不设这两道闸会把它们当成本作章节
  /// （实测长目录那部会多出 18 话：327 → 345）。
  __catalog(html, prefix) {
    var start = html.indexOf('id="hl-plays-list"');
    var area = '';
    if (start >= 0) {
      var end = html.indexOf('</ul>', start);
      if (end < 0 || end - start > MAX_CATALOG_SCAN) end = Math.min(html.length, start + MAX_CATALOG_SCAN);
      area = html.slice(start, end);
    } else {
      area = html.slice(0, Math.min(html.length, MAX_CATALOG_SCAN));
    }
    var entries = [];
    var seen = {};
    var scanned = 0;
    var order = 0;
    var at = area.indexOf('/read-comics/');
    while (at >= 0) {
      if (++scanned > MAX_CHAPTERS) break;
      var next = area.indexOf('/read-comics/', at + 13);
      var open = area.lastIndexOf('<a', at);
      var tagEnd = area.indexOf('>', at);
      if (open >= 0 && open < at && tagEnd > at) {
        var tag = area.slice(open, tagEnd + 1);
        var href = this.__attr(tag, 'href');
        if (!prefix || href.indexOf(prefix) === 0) {
          var url = this.__chapterUrl(href, '');
          if (url && !seen[url]) {
            var title = this.__plain(this.__attr(tag, 'title')) ||
              this.__plain(this.__readText(area, tagEnd + 1, 120));
            if (title && title.indexOf('上一') !== 0 && title.indexOf('下一') !== 0) {
              seen[url] = true;
              entries.push({
                id: url,
                title: this.__cut(title, 60),
                number: this.__chapterNumber(title),
                order: order++
              });
            }
          }
        }
      }
      at = next;
    }
    return this.__orderCatalog(entries);
  },

  /// 按话数升序（见文件头「坑 3」）：
  ///   · 编号唯一的条目排进**它们原来占的那些位置**（公告类条目留在原地，
  ///     站点就是把「停刊公告」夹在停更的那一话后面的）；
  ///   · 编号有重复（第二季/重制版）就整体退回站点顺序——话数不是全序，重排只会更乱；
  ///   · 解析不出编号的条目（停刊/休刊公告）不参与排序，原地不动。
  __orderCatalog(entries) {
    var result = [];
    var i;
    var numbered = [];
    var slots = [];
    var counts = {};
    var duplicated = false;
    for (i = 0; i < entries.length; i++) {
      result.push({ id: entries[i].id, title: entries[i].title });
      if (entries[i].number >= 0) {
        if (counts[entries[i].number]) duplicated = true;
        counts[entries[i].number] = true;
        numbered.push(entries[i]);
        slots.push(i);
      }
    }
    if (duplicated || numbered.length < 2) return result;
    numbered.sort(function (a, b) {
      if (a.number === b.number) return a.order - b.order;
      return a.number - b.number;
    });
    for (i = 0; i < slots.length; i++) {
      result[slots[i]] = { id: numbered[i].id, title: numbered[i].title };
    }
    return result;
  },

  /// 「第28話」→ 28（站点用阿拉伯数字 + 话/話，实测 327 话里全是这个形状）。
  /// 单遍字符扫描，不用正则（`/g` 的 exec 跨字符串复用是这份脚本要避开的坑）。
  __chapterNumber(text) {
    var value = String(text || '');
    var at = value.indexOf('第');
    while (at >= 0) {
      var i = at + 1;
      var start = i;
      while (i < value.length && i - start < 5) {
        var code = value.charCodeAt(i);
        if (code < 48 || code > 57) break;
        i++;
      }
      if (i > start && i < value.length && this.__isChapterUnit(value.charAt(i))) {
        return Number(value.slice(start, i));
      }
      at = value.indexOf('第', at + 1);
    }
    return -1;
  },

  __isChapterUnit(ch) {
    return '话話章回集'.indexOf(ch) >= 0;
  },

  /// 正文图：一章一页，图片全是 `img.lazy.hl-lazy[data-original]`。
  /// 只认 data-original（页面里 yandex 统计像素与广告是裸 <img>/<ins>，
  /// 整页抓 <img> 会把它们收进来）；一份都收不到时，才退到 img.hl-lazy 这套标记里
  /// 找 data-src/src（站点若换了懒加载属性名，仍然只在这套标记内找）。
  __images(html) {
    var images = [];
    var seen = {};
    var area = html.slice(0, Math.min(html.length, MAX_INLINE_SCAN));
    this.__collectImages(area, 'data-original', images, seen);
    if (!images.length) this.__collectLazyImages(area, images, seen);
    return images;
  },

  __collectImages(text, attribute, images, seen) {
    var needle = attribute + '=';
    var at = text.indexOf(needle);
    var scanned = 0;
    while (at >= 0) {
      if (++scanned > MAX_IMAGE_ATTRS || images.length >= MAX_IMAGES) break;
      var url = this.__attrValue(text, at + needle.length);
      if (this.__isImage(url)) {
        var absolute = this.__absolute(url);
        if (absolute && !seen[absolute]) {
          seen[absolute] = true;
          images.push(absolute);
        }
      }
      at = text.indexOf(needle, at + needle.length);
    }
  },

  __collectLazyImages(text, images, seen) {
    var at = text.indexOf('<img');
    var scanned = 0;
    while (at >= 0) {
      if (++scanned > MAX_IMAGE_ATTRS || images.length >= MAX_IMAGES) break;
      var end = text.indexOf('>', at);
      if (end < 0) break;
      var tag = text.slice(at, end + 1);
      if (tag.indexOf('hl-lazy') >= 0 || tag.indexOf('lazy') >= 0) {
        var url = this.__attr(tag, 'data-src') || this.__attr(tag, 'src');
        if (this.__isImage(url)) {
          var absolute = this.__absolute(url);
          if (absolute && !seen[absolute]) {
            seen[absolute] = true;
            images.push(absolute);
          }
        }
      }
      at = text.indexOf('<img', end);
    }
  },

  __isImage(url) {
    var text = String(url || '').trim();
    if (!text || text.length > 400) return false;
    if (text.indexOf('data:') === 0) return false;
    if (SKIP_IMAGE.test(text)) return false;
    var path = text;
    var query = path.indexOf('?');
    if (query >= 0) path = path.slice(0, query);
    path = path.toLowerCase();
    return this.__endsWith(path, '.jpg') || this.__endsWith(path, '.jpeg') ||
      this.__endsWith(path, '.png') || this.__endsWith(path, '.webp') ||
      this.__endsWith(path, '.avif') || this.__endsWith(path, '.gif');
  },

  /// 条目窗口里的第一张图 = 封面（本站封面只在 data-original 里）。
  __coverIn(window) {
    var at = window.indexOf('data-original=');
    var scanned = 0;
    while (at >= 0 && scanned < 4) {
      scanned++;
      var url = this.__attrValue(window, at + 14);
      if (this.__isImage(url)) return this.__absolute(url);
      at = window.indexOf('data-original=', at + 14);
    }
    return '';
  },

  __backgroundUrl(text) {
    var at = String(text || '').indexOf('url(');
    if (at < 0) return '';
    var start = at + 4;
    var quote = text.charAt(start);
    if (quote === '"' || quote === "'") start++;
    var end = text.indexOf(quote === '"' || quote === "'" ? quote : ')', start);
    return end > start ? text.slice(start, end).trim() : '';
  },

  // ---------------------------------------------------------------- 基础工具

  async __get(url) {
    var response = await LumeSource.http.get(url, {
      headers: {
        'Referer': BASE_URL + '/',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    });
    var status = response ? response.status : 0;
    var body = response && response.body ? String(response.body) : '';
    if (status !== 200) {
      if (status === 403 || status === 503 || status === 429 ||
          /just a moment|__cf_chl|cf-chl|challenge-platform|cf-mitigated|checking your browser/i.test(body)) {
        throw new Error('NEED_WEBVIEW_VERIFY：18禁漫 需要网页视图过一次 Cloudflare 校验（HTTP ' + status + ' ' + url + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    if (/<title>\s*Just a moment/i.test(body) || /challenge-platform/.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：18禁漫 需要网页视图过一次 Cloudflare 校验（' + url + '）');
    }
    return body;
  },

  __absolute(url) {
    var text = String(url || '').trim();
    if (!text) return '';
    if (text.indexOf('//') === 0) return 'https:' + text;
    if (text.indexOf('http') === 0) return text;
    if (text.charAt(0) === '/') return BASE_URL + text;
    return BASE_URL + '/' + text;
  },

  /// 路径里的非 ASCII 字符（中文题材名）转成 UTF-8 百分号编码（见文件头「坑 1」）。
  /// '/' 与已编码的 '%' 原样保留——站点的 href 是裸中文，重复编码没有意义。
  __encodePath(path) {
    var str = String(path || '');
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      out += code < 0x80 ? str.charAt(i) : this.__utf8(code, str, i);
    }
    return out;
  },

  /// 查询串用的 UTF-8 百分号编码（字母数字与 -_.~ 原样，其余全编码）。
  __encode(text) {
    var str = String(text);
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 0x80) {
        var ch = str.charAt(i);
        var safe = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) ||
          (code >= 97 && code <= 122) || ch === '-' || ch === '_' || ch === '.' || ch === '~';
        out += safe ? ch : '%' + this.__hex(code);
      } else {
        out += this.__utf8(code, str, i);
      }
    }
    return out;
  },

  /// 把 str[i] 处的一个非 ASCII 字符编码成 %XX%XX…（代理对按 4 字节算）。
  __utf8(code, str, i) {
    var value = code;
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
      var low = str.charCodeAt(i + 1);
      if (low >= 0xDC00 && low <= 0xDFFF) {
        value = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
      }
    }
    if (value < 0x800) {
      return '%' + this.__hex(0xC0 | (value >> 6)) + '%' + this.__hex(0x80 | (value & 0x3F));
    }
    if (value < 0x10000) {
      return '%' + this.__hex(0xE0 | (value >> 12)) +
        '%' + this.__hex(0x80 | ((value >> 6) & 0x3F)) +
        '%' + this.__hex(0x80 | (value & 0x3F));
    }
    return '%' + this.__hex(0xF0 | (value >> 18)) +
      '%' + this.__hex(0x80 | ((value >> 12) & 0x3F)) +
      '%' + this.__hex(0x80 | ((value >> 6) & 0x3F)) +
      '%' + this.__hex(0x80 | (value & 0x3F));
  },

  __hex(value) {
    var text = value.toString(16).toUpperCase();
    return text.length < 2 ? '0' + text : text;
  },

  /// 标签属性。只认带引号的写法（站点两种引号都用过）；`data-original` 这类
  /// 前缀不同的属性靠「属性名前一个字符必须是空白」区分，免得把 data-href 当 href。
  __attr(tag, name) {
    var needle = name + '=';
    var at = tag.indexOf(needle);
    var scanned = 0;
    while (at >= 0 && scanned < 12) {
      scanned++;
      var before = at > 0 ? tag.charCodeAt(at - 1) : 32;
      if (this.__isSpace(before)) {
        var value = this.__attrValue(tag, at + needle.length);
        if (value) return value;
      }
      at = tag.indexOf(needle, at + needle.length);
    }
    return '';
  },

  __attrValue(text, from) {
    var quote = text.charAt(from);
    if (quote !== '"' && quote !== "'") return '';
    var end = text.indexOf(quote, from + 1);
    if (end < 0) return '';
    return text.slice(from + 1, end);
  },

  /// 从 from 起读一小段可读文本：紧挨着是子标签（`<div>`/`<a>`）时先看它的 title
  /// 属性、再取它内部的文本；直接文本就读到下一个 '<'。
  __readText(text, from, limit) {
    var end = Math.min(text.length, from + limit);
    var i = from;
    while (i < end && this.__isSpace(text.charCodeAt(i))) i++;
    if (i >= end) return '';
    if (text.charAt(i) === '<') {
      var tagEnd = text.indexOf('>', i);
      if (tagEnd < 0 || tagEnd > end) return '';
      var tag = text.slice(i, tagEnd + 1);
      var title = this.__plain(this.__attr(tag, 'title'));
      if (title) return title;
      var textEnd = text.indexOf('<', tagEnd + 1);
      if (textEnd < 0 || textEnd > end) return '';
      return this.__plain(text.slice(tagEnd + 1, textEnd));
    }
    var stop = text.indexOf('<', i);
    if (stop < 0 || stop > end) stop = end;
    return this.__plain(text.slice(i, stop));
  },

  /// 取 `class="<name>"` 容器里的可读文本。
  __classText(window, name) {
    var at = window.indexOf('class="' + name);
    if (at < 0) return '';
    var open = window.indexOf('>', at);
    if (open < 0) return '';
    return this.__plain(this.__readText(window, open + 1, 200));
  },

  /// 取 `marker`（某容器开始标签里的片段）到 `closeTag` 之间的可读文本。
  /// 给 h2 那种「标签里先塞一个图标再写标题」的容器用：
  /// `<h2 class="hl-rb-title"><i class="iconfont …"></i>热门漫画</h2>` → 热门漫画。
  __headingText(text, marker, closeTag, limit) {
    var at = text.indexOf(marker);
    if (at < 0) return '';
    var open = text.indexOf('>', at);
    if (open < 0) return '';
    var close = text.indexOf(closeTag, open);
    if (close < 0) close = Math.min(text.length, open + 120);
    return this.__cut(this.__plain(text.slice(open + 1, close)).trim(), limit);
  },

  __titleTag(html) {
    var at = html.indexOf('<title>');
    if (at < 0) return '';
    var end = html.indexOf('</title>', at);
    if (end < 0) return '';
    return this.__plain(html.slice(at + 7, end));
  },

  __stripBrackets(text) {
    var value = String(text || '').trim();
    if (value.length > 2 && value.charAt(0) === '《' && value.charAt(value.length - 1) === '》') {
      value = value.slice(1, value.length - 1);
    }
    return value.trim();
  },

  __hasText(list, text) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === text) return true;
    }
    return false;
  },

  __endsWith(text, suffix) {
    return text.length >= suffix.length && text.slice(text.length - suffix.length) === suffix;
  },

  __isSpace(code) {
    return code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
  },

  __digitsOnly(text) {
    var value = String(text == null ? '' : text).trim();
    if (!value || value.length > 12) return '';
    for (var i = 0; i < value.length; i++) {
      var code = value.charCodeAt(i);
      if (code < 48 || code > 57) return '';
    }
    return value;
  },

  __cut(text, limit) {
    var value = String(text == null ? '' : text);
    return value.length > limit ? value.slice(0, limit) : value;
  },

  /// 去掉标签与实体并压缩空白（**只为展示用的少量文本调用**）。
  /// 这里的 `/<[^>]*>/g` 只喂给 String.replace（它自己管 lastIndex），不做 exec。
  __plain(text) {
    var value = String(text == null ? '' : text);
    if (value.indexOf('<') >= 0) value = value.replace(/<[^>]*>/g, ' ');
    value = value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&hellip;/g, '…').replace(/&hearts;/g, '♥');
    value = value.replace(/\s+/g, ' ').trim();
    return value;
  }
};
