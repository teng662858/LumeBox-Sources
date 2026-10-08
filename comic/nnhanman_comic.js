// LumeSource: {"id":"nnhanman_comic","name":"NN韩漫","version":"1.2.0","category":"comic"}

// 站点：https://nnhanman.net （韩漫站，qTcms 手机模板，Cloudflare 前置）
//
// ## v1.2.0：站点已可达，解析改成对齐**真实标记**（快照见 snapshots/nnhanman_*.html）
//
// v1.1.0 之前本机到不了这个站（TLS 被阻断），脚本是按「通用形状」猜的：作品页链接
// 必须带 2 位以上数字才算条目、分类必须命中 /list|/genre|/category、详情页读 og:title…
// 实测这些假设**全错**：作品 slug 是拼音（yu-zhai，大多没有数字），分类是中文名直接
// 写在路径里（/comics/正妹/…），页面里没有 og: 标签，分页是路径式 /page/2。
// 旧版于是首页 45 条只认出 2 条、翻页翻不动。这一版按快照逐条对齐：
//
//   1. **列表**：条目 = `<a class="ImgA" href="/comic/<slug>.html" title="…">` +
//      `class="txtA"` 标题 + `span class="info"` 副标题，封面是同一 `<li>` 里
//      `<picture>` 内的 `<img src>`（旁边 webp 的 `<source srcset>` 不用）。
//      /update、/update/newbook、/update/recommend、/ranking 是另一套
//      `.itemBox/.itemImg/.itemTxt`（两套都认）。
//   2. **分页**：`/comics/<分类>/ob/time/st/all`，第 N 页 `/page/N`（快照实测 18 条/页、
//      末页 15 条）。`?page=N` 站点不认（实测 `…/all?page=2` 与第 1 页逐条相同），
//      所以只走路径式。有没有下一页由 `.pagination-wrap` 里的 `/page/<n>` 决定：
//      末页（第 147 页）快照里最大只到 146（当前页是 `<li class="active"><a href="#">`），
//      所以「有比当前页更大的页码」才算有下一页。
//      /update、/ranking 这类**整表页没有分页器**，就是没有下一页（不去猜一个 404 地址）。
//   3. **分类**：/comics 的 `<li class="am-thumbnail"><a href='/comics/正妹/ob/time/st/all'>`
//      ——中文题材名就在路径里，id 直接用题材名；站点自己的「全部」写成 /comics/all/…，
//      id 统一成 all。搜索：站点的表单是 GET `/catalog.php?key=<kw>`，它渲染的就是
//      `/search/<kw>` 这一页（两者实测逐条相同）；而站点自己的分页链接写的是
//      `/search/<kw>/page/N`，所以脚本直接请求 `/search/<kw>`（与分页链接同形）。
//   4. **详情**：标题在 `<h1>《慾債》</h1>`（去书名号），封面固定在 `id="Cover"` 里
//      ——站标 /images/logo.png 与 yandex 统计像素排在它前面，「第一张图」抓不得；
//      简介在 `p.txtDesc`，作者/题材在 `p.txtItme` 行里，状态在 `span.date`。
//   5. **正文**：图片只有 `data-src`（`src` 是懒加载占位），211 张全部内联在
//      `#m_r_imgbox_0` 里（其中 2 张是站点自己重复引用的，去重后 209 张）；
//      这一页**没有下一页**（`next` 在正文页出现 0 次），所以只请求一次，不拼 `?page=`。
//   6. **目录**：`<ul class="Drama autoHeight" id="mh-chapter-list-ol-0">` 里
//      `<li><a href="/comic/<slug>/chapter-<全局id>.html"><span>第28話-…</span></a></li>`，
//      单页给全（最新一话在前），重排成升序交给 App。
//
// ## 这一版踩到的三个坑（都在快照上回归了，别再犯）
//
// 1. **列表地址必须是绝对地址**。`__listUrl` 产出的是站点相对路径（/comics/…），
//    而宿主的 fetch 把字符串**原样**交给网络层（core/js/lume_js_engine.dart 的
//    http.fetch），不认相对路径——旧写法真机上第一次翻分类就是「拉取失败：HTTP 404
//    /comics/…」。现在统一在 `__get` 里过一遍 `__absolute`，脚本内部随便用相对路径。
// 2. **章节 id 必须真的有数字**。作品页「热门推荐」板块的最新一话是空占位
//    `<span class="info"><a href="/comic/<slug>/chapter-.html"></a></span>`，
//    只判「非空」会白捡 6 条「章节 N」（实测）。数字判据见 `__chapterUrl`。
// 3. **目录只在 `mh-chapter-list` 容器里扫，并跳过「开始阅读」按钮**
//    （`id="Subscribe_bak"`，href 指向第 1 话，且排在目录之前）：不跳过得话
//    第 1 话会被它按「先到先得」占位，标题变成「开始阅读」、编号解析不出、被排到末尾。
//
// ## v1.1.0 的教训仍然照办（别再犯）
//
// 1. **不用嵌套量词正则**。v1.0.0 那条 `([a-z0-9_-]*\/?)*?` 匹配失败时要穷举「多少个
//    路径段算一次重复」，实测 V8 跑 81 个字符要 85 秒（指数级回溯），真机表现是
//    「超出指令计数上限」。本版解析**全程 indexOf 单遍扫描 + 固定窗口**，
//    一条带嵌套量词的正则都没有，也就没有回溯空间。
// 2. **`/g` 正则不许跨字符串复用**。旧版 `__match` 把 `/g` 的 IMAGE_ATTR 拿去 exec，
//    lastIndex 没重置，于是第二条起的封面全是空。本版不再有 `__match`：
//    连 `第N話` 这种小文本都用字符扫描（见 `__chapterNumber`）。
//    现在剩下的正则**全是平铺的**（没有嵌套量词、没有 exec），带 `/g` 的只出现在
//    `String.replace` 里（replace 自己管 lastIndex）：SKIP_IMAGE、CF 挑战页判据、
//    `__plain` 的去标签与实体替换、`__categoryPath` 的两个去尾斜杠。
// 3. **一次扫描、窗口有限、处处封顶**：扫过的锚数（MAX_ANCHORS）、单次产出的条目数
//    （MAX_ITEMS）、每条往后看的窗口（ITEM_WINDOW / ITEM_BOX_WINDOW / BOARD_WINDOW）、
//    正文页扫描长度（MAX_INLINE_SCAN）、目录容器认不出时的整页上限（CHAPTER_SCAN）、
//    图片与话数上限都有cap。
// 4. **解析失败说清地址**：报错文案带上当前地址，真机日志能直接定位。
//
// 还有一条「站点标记优先」的排面：先按站点真实类名解析，一条都没认出来才退回
// 「通用锚点扫描」（`__itemsByAnchorScan`）——那条兜底只为「站点改版也不至于全空」，
// 它仍然只认页面里真实存在的链接，不编地址。
//
// 被 Cloudflare 拦下时抛固定标记：App 会拉起网页视图过一次校验、存下 Cookie 与 UA，
// 再自动重试这次调用（见 core/net/waf_auto_verify.dart）。

var BASE_URL = 'https://nnhanman.net';
// 站点列表页每页 18 条（快照实测；末页 15 条）。
var PAGE_SIZE = 18;
// 分页器缺失时的兜底：条目数到「满页减一」就当还有下一页（站点偶尔少给一条）。
var MIN_PAGE_ITEMS = PAGE_SIZE - 1;
// 一次列表解析最多看多少个锚/条目标记 / 最多产出多少条目（防大页面把预算烧光）。
var MAX_ANCHORS = 1200;
var MAX_ITEMS = 120;
// 单条往后看多少字符：列表条目、/update 那种大卡片、首页板块。
var ITEM_WINDOW = 900;
var ITEM_BOX_WINDOW = 2000;
var BOARD_WINDOW = 9000;
// 分页器块最多看多少字符（`.pagination-wrap` 之后）。
var PAGER_WINDOW = 5000;
// 正文页最多扫描多少字符 / 最多收多少张图 / 目录最多解析多少话。
var MAX_INLINE_SCAN = 200000;
var MAX_IMAGES = 400;
var MAX_IMAGE_ATTRS = 4000;
var MAX_CHAPTERS = 3000;
// 目录容器认不出时，整页最多扫多少字符（防大页面把预算烧光）。
var CHAPTER_SCAN = 120000;
// 详情页题材最多收几个。
var TAG_LIMIT = 8;

// 「这不是封面/正文图」：站标、统计像素、图标、分割线（平铺正则、无 /g，可安全 test）。
var SKIP_IMAGE = /logo|avatar|banner|advert|placeholder|blank|loading|icon|sprite|qrcode|share|yandex|head_line|spacer/i;
// 「这是章节页」的廉价判据（字符串包含，不是正则）——通用兜底扫描才用。
var CHAPTER_HINTS = ['chapter', 'capter', '/read', '/view', 'episode'];
// 明显不是作品页的路径片段。
var SKIP_HINTS = ['login', 'register', 'user/', '/user', 'search', 'tag', 'genre',
  'category', 'list/', '/list', 'rank', 'sort', 'page/', 'about', 'help', 'privacy'];
// 图片属性的候选顺序（真实站点用过的懒加载属性名；站点现用 src / data-src）。
var IMAGE_ATTRS = ['src', 'data-src', 'data-original', 'data-echo', 'data-lazy-src', 'data-url'];

var LumeSource = {
  id: 'nnhanman_comic',
  name: 'NN韩漫',
  version: '1.2.0',
  category: 'comic',

  // ---------------------------------------------------------------- 契约方法

  /// 题材：从 /comics 的 `li.am-thumbnail` 读（中文题材名就是路径段）。
  async categories() {
    var html = await this.__get(BASE_URL + '/comics');
    var found = this.__navCategories(html);
    if (!found.length) {
      // 认不出题材也不编分类：站点自己的「全部」总是真的（/comics/all/ob/time/st/all）。
      console.warn('[nnhanman] /comics 没认出题材（' + html.length + ' 字符），只给「全部」');
      return [{ id: 'all', title: '全部' }];
    }
    console.warn('[nnhanman] 分类从 /comics 读到 ' + found.length + ' 项');
    return found;
  },

  /// 首页：`Sub_H2` 板块（标题 + 更多 + col_3_1 条目），认不出就退回列表页一块。
  async home() {
    var html = await this.__get(BASE_URL + '/');
    var boards = this.__boards(html);
    if (boards.length) {
      console.warn('[nnhanman] 首页板块 ' + boards.length + ' 块');
      return boards;
    }
    var latest = await this.list({ categoryId: 'all', page: 1 });
    if (latest && latest.items && latest.items.length) {
      console.warn('[nnhanman] 首页没认出板块（' + html.length + ' 字符），退回列表页一块');
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
      // 整表页（/update、/ranking…）站点只有第 1 页：第 2 页不该去请求（会 404）。
      console.warn('[nnhanman] 「' + category + '」只有第 1 页，第 ' + page + ' 页返回空');
      return { items: [], hasMore: false };
    }
    var html = await this.__get(url);
    var items = this.__listItems(html);
    if (!items.length) {
      console.warn('[nnhanman] 列表没解析出条目：' + url + '（' + html.length + ' 字符）');
      return { items: [], hasMore: false };
    }
    console.warn('[nnhanman] 列表命中：' + url + '（' + items.length + ' 条）');
    return { items: items, hasMore: this.__hasNextPage(html, page, items.length) };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var url = this.__url(id);
    var html = await this.__get(url);
    var title = this.__detailTitle(html);
    if (!title) {
      console.warn('[nnhanman] 详情页没认出标题：' + url + '（' + html.length + ' 字符）');
      return null;
    }
    var info = this.__detailInfo(html);
    return {
      id: url,
      title: title,
      cover: this.__detailCover(html),
      subtitle: info.author ? '作者：' + info.author : info.status,
      description: this.__description(html),
      tags: info.tags,
      extra: { author: info.author, status: info.status }
    };
  },

  /// 目录就在作品页里（单页，最新一话在前）→ 重排成升序给 App。
  async chapters(argument) {
    var id = this.__id(argument);
    var url = this.__url(id);
    var html = await this.__get(url);
    var chapters = this.__chapters(html);
    if (!chapters.length) {
      throw new Error('NN韩漫：目录页没认出章节链接（' + url + '）——把运行日志发回来收敛解析规则');
    }
    console.warn('[nnhanman] 章节 ' + chapters.length + ' 话（已按编号升序）：' + url);
    return chapters;
  },

  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    if (!chapterId) throw new Error('NN韩漫：缺少章节 ID（请先选择一话）');
    var url = this.__chapterUrl(chapterId);
    if (!url) {
      // 只给了纯章节号时，用作品地址拼出来（/comic/<slug>/chapter-<id>.html，站点自己的形状）。
      var number = this.__digitsOnly(chapterId);
      var item = this.__id(argument);
      url = number && item ? this.__url(item).replace(/\/?$/, '/') + 'chapter-' + number + '.html'
                           : this.__url(chapterId);
    }
    var html = await this.__get(url);
    var images = this.__images(html);
    if (!images.length) {
      throw new Error('NN韩漫：这一话没解析出图片（' + url + '）——把运行日志发回来收敛解析规则');
    }
    console.warn('[nnhanman] 正文 ' + images.length + ' 张图（单页，不翻页）：' + url);
    return { kind: 'images', images: images };
  },

  // ---------------------------------------------------------------- 地址策略

  /// 列表地址。分类 id 认这几态（全部来自站点自己的链接，没有编的）：
  ///   '' / 'all'      → /comics/all/ob/time/st/all（全站，会分页）
  ///   'completed'     → /comics/all/ob/time/st/completed（已完结，会分页）
  ///   'update' / 'newbook' / 'recommend' / 'ranking' → 站点整表页（只有第 1 页）
  ///   其它（题材名，如「正妹」）→ /comics/正妹/ob/time/st/all
  ///   以 '/' 或 http 开头 → 原样用（首页「更多」透传整条路径时走这里）
  /// 搜索走 `/search/<关键词>`，分页同样是路径式（`?page=` 站点不认，实测回第 1 页）。
  __listUrl(category, keyword, page) {
    if (keyword) {
      var search = '/search/' + this.__encode(keyword);
      return page > 1 ? search + '/page/' + page : search;
    }
    var path = this.__categoryPath(category);
    if (this.__isSinglePagePath(path)) return page > 1 ? '' : path;
    return page > 1 ? path.replace(/\/$/, '') + '/page/' + page : path;
  },

  __categoryPath(category) {
    var id = String(category == null ? '' : category).trim();
    if (!id || id === 'all') return '/comics/all/ob/time/st/all';
    if (id === 'completed') return '/comics/all/ob/time/st/completed';
    if (id === 'update') return '/update';
    if (id === 'newbook') return '/update/newbook';
    if (id === 'recommend') return '/update/recommend';
    if (id === 'ranking') return '/ranking';
    if (id.indexOf('http') === 0 || id.charAt(0) === '/') return id;
    // 题材名要**百分号转义**再进路径：站点自己生成的分页链接就是这个形状
    // （/comics/%E6%AD%A3%E5%A6%B9/…/page/2）。直接塞原始中文时，只要宿主把
    // 字符串原样发出去（原始 UTF-8 字节），站点回的是一张乱码空页（实测 0 条）。
    return '/comics/' + this.__encode(id) + '/ob/time/st/all';
  },

  /// 整表页：站点没给分页器，只有第 1 页（实测 /update/page/2 是 404）。
  __isSinglePagePath(path) {
    return path === '/update' || path === '/update/newbook' ||
      path === '/update/recommend' || path === '/ranking';
  },

  /// 作品地址：`/comic/<slug>.html`（**slug 里通常没有数字**，别拿数字当判据）。
  __url(id) {
    var value = String(id || '').trim();
    if (!value) throw new Error('NN韩漫：缺少作品 ID');
    return value.indexOf('http') === 0 ? value : this.__absolute(value);
  },

  __id(argument) {
    var id = '';
    if (argument && argument.id != null) id = String(argument.id);
    else if (argument && argument.comicId != null) id = String(argument.comicId);
    else if (argument && argument.bookId != null) id = String(argument.bookId);
    if (!id) throw new Error('NN韩漫：缺少作品 ID');
    return id;
  },

  /// 章节地址判定（线性）：必须是本站 `/comic/<slug>/chapter-<数字>.html`。
  /// 编号**必须真的有数字**：作品页「热门推荐」板块里的最新一话是空占位
  /// （`<span class="info"><a href="/comic/<slug>/chapter-.html"></a></span>`），
  /// 只判「非空」会把它当成一话，真机上表现为目录里多出几条「章节 N」。
  __chapterUrl(href) {
    var text = String(href || '').trim();
    if (!text) return '';
    var url = this.__absolute(text);
    var prefix = BASE_URL + '/comic/';
    if (url.indexOf(prefix) !== 0) return '';
    var rest = url.slice(prefix.length);
    var slash = rest.indexOf('/');
    if (slash <= 0) return '';
    var tail = rest.slice(slash + 1);
    if (!this.__startsWith(tail, 'chapter-')) return '';
    var number = tail.slice(8);
    if (!this.__endsWith(number, '.html')) return '';
    if (!this.__digitsOnly(number.slice(0, number.length - 5))) return '';
    return url;
  },

  /// 作品页地址判定：`/comic/<slug>.html`，slug 里不能再有 '/'（那是章节页）。
  __detailUrl(href) {
    var text = String(href || '').trim();
    if (!text) return '';
    if (this.__hasAny(text, ['javascript:', 'mailto:', '#'])) return false;
    var url = this.__absolute(text);
    var prefix = BASE_URL + '/comic/';
    if (url.indexOf(prefix) !== 0) return '';
    var rest = url.slice(prefix.length);
    if (!rest || rest.indexOf('/') >= 0) return '';
    if (!this.__endsWith(rest, '.html') || rest.length < 7) return '';
    return url;
  },

  // ---------------------------------------------------------------- 分类 / 首页

  /// 题材：`<li class="am-thumbnail"><a href='/comics/正妹/ob/time/st/all'>正妹</a></li>`
  /// （href 用的是**单引号**）。id 取题材名本身，「全部」统一成 all。
  __navCategories(html) {
    var found = [];
    var seen = {};
    var scanned = 0;
    var at = html.indexOf('class="am-thumbnail');
    while (at >= 0) {
      if (++scanned > MAX_ANCHORS || found.length >= 40) break;
      var anchor = this.__firstAnchor(html.substr(at, 240));
      if (anchor) {
        var id = this.__genreId(this.__attr(anchor.tag, 'href'));
        if (id && !seen[id] && anchor.text) {
          seen[id] = true;
          found.push({ id: id, title: anchor.text });
        }
      }
      at = html.indexOf('class="am-thumbnail', at + 18);
    }
    return found;
  },

  __genreId(path) {
    var text = String(path || '').trim();
    if (text.indexOf('/comics/') !== 0) return '';
    var rest = text.slice(8);
    var slash = rest.indexOf('/');
    var genre = slash > 0 ? rest.slice(0, slash) : rest;
    while (genre.length && genre.charAt(genre.length - 1) === '/') {
      genre = genre.slice(0, genre.length - 1);
    }
    if (!genre) return '';
    return genre === 'all' ? 'all' : genre;
  },

  /// 首页板块：`<div class="Sub_H2">` 里的 Title + `onClick="window.location='…'"`
  /// ，紧跟一个 `<ul class="col_3_1">` 装着这一块的条目（每块 9 条）。
  __boards(html) {
    var boards = [];
    var scanned = 0;
    var at = html.indexOf('class="Sub_H2"');
    while (at >= 0 && boards.length < 8) {
      if (++scanned > 40) break;
      var next = html.indexOf('class="Sub_H2"', at + 14);
      var end = next > 0 ? next : Math.min(html.length, at + BOARD_WINDOW);
      var window = html.slice(at, end);
      var title = this.__classText(window, 'Title');
      var items = this.__itemsByImgA(window);
      if (title && items.length) {
        boards.push({
          title: title,
          moreUrl: this.__moreId(this.__onClickTarget(window)),
          items: items.slice(0, 12)
        });
      }
      at = next;
    }
    return boards;
  },

  __onClickTarget(window) {
    var needle = "window.location='";
    var at = window.indexOf(needle);
    if (at < 0) return '';
    var end = window.indexOf("'", at + needle.length);
    if (end < 0) return '';
    return window.slice(at + needle.length, end).trim();
  },

  /// 板块「更多」→ list() 认得的分类 id。只映射站点自己写出来的地址，
  /// 认不出的退回 all（宁可多给一页全部，也不去猜一个不存在的地址）。
  __moreId(path) {
    var text = String(path || '').trim();
    if (text === '/update') return 'update';
    if (text === '/update/newbook') return 'newbook';
    if (text === '/update/recommend') return 'recommend';
    if (text === '/ranking') return 'ranking';
    // 首页「已完结」板块的更多是 /comics/all/ob/time/st/completed：
    // 它就是「已完结 + 时间排序」的列表，自己也带 `/page/N` 分页（实测到 105 页），
    // 所以不要退化成 all（那会把「已完结」这个筛选弄丢）。
    if (text.indexOf('/ob/time/st/completed') > 0) return 'completed';
    if (text.indexOf('/comics/') === 0) {
      var genre = this.__genreId(text + (/\/$/.test(text) ? '' : '/'));
      return genre || 'all';
    }
    return 'all';
  },

  // ---------------------------------------------------------------- 列表解析

  /// 列表条目：先按站点真实类名解析，一条都认不出才退回通用锚点扫描。
  __listItems(html) {
    var items = this.__itemsByImgA(html);
    if (!items.length) items = this.__itemsByItemBox(html);
    if (!items.length) {
      console.warn('[nnhanman] 站点的 ImgA / itemBox 标记都没命中，退回通用锚点扫描');
      items = this.__itemsByAnchorScan(html);
    }
    return items;
  },

  /// 形态 A（首页板块 / 分类页 / 搜索页）：
  /// <li><a class="ImgA" href="/comic/x.html" title="T">…<img src=封面 alt="T">…
  ///     <a class="txtA" …>T</a><span class="info">日期或最新一话</span></li>
  __itemsByImgA(html) {
    var items = [];
    var seen = {};
    var scanned = 0;
    var at = html.indexOf('class="ImgA"');
    while (at >= 0) {
      if (++scanned > MAX_ANCHORS || items.length >= MAX_ITEMS) break;
      var tag = this.__tagAt(html, at);
      var id = this.__detailUrl(this.__attr(tag, 'href'));
      if (id && !seen[id]) {
        var window = html.substr(at, ITEM_WINDOW);
        var title = this.__plain(this.__attr(tag, 'title')) ||
          this.__plain(this.__attr(window, 'alt')) || this.__classText(window, 'txtA');
        if (title) {
          seen[id] = true;
          items.push({
            id: id,
            title: this.__cut(title, 80),
            cover: this.__coverIn(window),
            subtitle: this.__itemSubtitle(window)
          });
        }
      }
      at = html.indexOf('class="ImgA"', at + 10);
    }
    return items;
  },

  /// 形态 B（/update、/update/newbook、/update/recommend、/ranking）：
  /// <div class="itemBox"><div class="itemImg"><a href=作品 title=标题><img src=封面>
  ///   <div class="itemTxt"><a class="title">…</a><p class="txtItme">…最新话…</p>
  ///     <p class="txtItme"><span class="date">更新日期：…</span></p></div></div>
  __itemsByItemBox(html) {
    var items = [];
    var seen = {};
    var scanned = 0;
    var at = html.indexOf('class="itemBox"');
    while (at >= 0) {
      if (++scanned > MAX_ANCHORS || items.length >= MAX_ITEMS) break;
      var window = html.substr(at, ITEM_BOX_WINDOW);
      var anchor = this.__firstAnchor(window);
      if (anchor) {
        var id = this.__detailUrl(this.__attr(anchor.tag, 'href'));
        if (id && !seen[id]) {
          var title = this.__plain(this.__attr(anchor.tag, 'title')) || anchor.text ||
            this.__classText(window, 'title');
          if (title) {
            seen[id] = true;
            items.push({
              id: id,
              title: this.__cut(title, 80),
              cover: this.__coverIn(window),
              subtitle: this.__itemSubtitle(window)
            });
          }
        }
      }
      at = html.indexOf('class="itemBox"', at + 12);
    }
    return items;
  },

  /// 通用兜底：站点改版/陌生页时按「锚点形状」认作品页链接。
  /// 仍然是**单遍扫描 + 数字连跑**（没有回溯），只认页面上真实存在的链接。
  __itemsByAnchorScan(html) {
    var items = [];
    var seen = {};
    var scanned = 0;
    var at = html.indexOf('<a ');
    while (at >= 0) {
      if (++scanned > MAX_ANCHORS || items.length >= MAX_ITEMS) break;
      var tag = this.__tagAt(html, at);
      var href = this.__attr(tag, 'href');
      if (this.__isDetailHref(href)) {
        var id = this.__absolute(href);
        if (id && !seen[id]) {
          var window = html.substr(at, ITEM_WINDOW);
          var title = this.__plain(this.__attr(tag, 'title')) ||
            this.__plain(this.__attr(window, 'alt')) || this.__readText(html, this.__tagEnd(html, at) + 1, 80);
          if (title) {
            seen[id] = true;
            items.push({
              id: id,
              title: this.__cut(title, 80),
              cover: this.__coverIn(window),
              subtitle: this.__itemSubtitle(window)
            });
          }
        }
      }
      at = html.indexOf('<a ', at + 3);
    }
    return items;
  },

  /// 通用判据：链接里有「2 位以上数字连跑」（作品编号）且不像章节页/导航。
  __isDetailHref(href) {
    var text = String(href || '');
    if (!text || text.length > 300) return false;
    if (this.__hasAny(text, ['javascript:', 'mailto:'])) return false;
    if (this.__hasAny(text, CHAPTER_HINTS)) return false;
    if (this.__hasAny(text, SKIP_HINTS)) return false;
    return this.__digitRun(this.__lastSegment(text)) >= 2 || this.__digitRun(text) >= 3;
  },

  __lastSegment(text) {
    var value = String(text || '');
    var query = value.indexOf('?');
    if (query >= 0) value = value.slice(0, query);
    var slash = value.lastIndexOf('/');
    if (slash >= 0 && slash < value.length - 1) value = value.slice(slash + 1);
    return value;
  },

  /// 最长连续数字的长度（单遍 O(n)）。
  __digitRun(text) {
    var best = 0;
    var run = 0;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code >= 48 && code <= 57) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    return best;
  },

  /// 副标题：分类页是日期（span.info），首页是「最新一话」（span.info 里包的锚），
  /// /update 那套是 span.date（'更新日期：2026-10-08'）——都是站点自己的文案。
  __itemSubtitle(window) {
    var text = this.__classText(window, 'info') || this.__classText(window, 'date');
    var colon = text.indexOf('：');
    if (colon >= 0 && colon <= 6) text = text.slice(colon + 1).trim();
    return this.__cut(text, 40);
  },

  /// 条目窗口里的第一张图 = 封面（`<img src>`；旁的 webp `<source srcset>` 不用）。
  __coverIn(window) {
    var at = window.indexOf('<img');
    var scanned = 0;
    while (at >= 0 && scanned < 4) {
      scanned++;
      var tag = this.__tagAt(window, at);
      for (var i = 0; i < IMAGE_ATTRS.length; i++) {
        var url = this.__attr(tag, IMAGE_ATTRS[i]);
        if (this.__isImage(url)) return this.__absolute(url);
      }
      at = window.indexOf('<img', at + 4);
    }
    return '';
  },

  /// 还有没有下一页：站点把分页器放在 `.pagination-wrap` 里，链接是路径式
  /// `/comics/…/page/N`。**整表页（/update、/ranking）没有这个容器 → 没有下一页**；
  /// 尾页快照里最大只到 146（当前页 147）→ 也没有；分页器空着（搜索结果不足一页）
  /// 就退回按条数判断。
  __hasNextPage(html, page, count) {
    var current = page > 0 ? page : 1;
    var pager = html.indexOf('pagination-wrap');
    if (pager < 0) return false;
    var max = this.__maxPageIn(html.substr(pager, PAGER_WINDOW));
    if (max > current) return true;
    if (max > 0) return false;
    return count >= MIN_PAGE_ITEMS;
  },

  __maxPageIn(text) {
    var needle = '/page/';
    var at = text.indexOf(needle);
    var best = 0;
    var scanned = 0;
    while (at >= 0) {
      if (++scanned > 400) break;
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

  // ---------------------------------------------------------------- 详情

  __detailTitle(html) {
    var at = html.indexOf('<h1');
    if (at >= 0) {
      var open = html.indexOf('>', at);
      var close = open >= 0 ? html.indexOf('</h1', open + 1) : -1;
      if (open >= 0 && close > open) {
        var text = this.__plain(html.slice(open + 1, close));
        if (text) return this.__stripBrackets(text);
      }
    }
    // 兜底：<title>（站点写成「慾債 - 鸟鸟韩漫」这类，去掉后缀）。
    var raw = this.__titleTag(html);
    var cut = raw.indexOf(' - ');
    if (cut < 0) cut = raw.indexOf('_');
    if (cut < 0) cut = raw.indexOf('|');
    if (cut > 0) raw = raw.slice(0, cut);
    return this.__plain(raw);
  },

  /// 封面固定挂在 `id="Cover"` 里：站标 logo.png 与 yandex 统计像素都排在它前面，
  /// 所以「页面第一张图」是错的做法（旧版就是这么错的）。
  __detailCover(html) {
    var at = html.indexOf('id="Cover"');
    if (at >= 0) {
      var cover = this.__coverIn(html.substr(at, 1200));
      if (cover) return cover;
    }
    return this.__coverIn(html.substr(0, 20000));
  },

  /// 作者 / 题材 / 状态：都在 `Introduct_Sub` 那几条 `p.txtItme` 与 `span.date` 里。
  ///   <p class="txtItme"><span class="icon icon02"></span>Appeal&雄鷹</p>            ← 作者
  ///   <p class="txtItme"><span class="icon icon02"></span><a href="/comics/正妹">…  ← 题材
  ///   <span class="date">连载中 45 分钟之前</span>                                   ← 状态
  __detailInfo(html) {
    var result = { author: '', status: '', tags: [] };
    var start = html.indexOf('id="Cover"');
    var region = start >= 0 ? html.substr(start, 8000) : html.substr(0, 20000);
    var scanned = 0;
    var at = region.indexOf('class="txtItme"');
    while (at >= 0) {
      if (++scanned > 12) break;
      var open = region.indexOf('>', at);
      var close = open >= 0 ? region.indexOf('</p>', open + 1) : -1;
      if (open < 0 || close < 0) break;
      var block = region.slice(open + 1, close);
      if (block.indexOf('/comics/') >= 0) this.__pushTags(result.tags, block);
      else if (block.indexOf('<h1') < 0) {
        var text = this.__plain(block);
        if (text && !result.author && text.length <= 40) result.author = text;
      }
      at = region.indexOf('class="txtItme"', close);
    }
    result.status = this.__cut(this.__classText(region, 'date'), 40);
    return result;
  },

  __pushTags(tags, block) {
    var at = block.indexOf('/comics/');
    var scanned = 0;
    while (at >= 0 && tags.length < TAG_LIMIT && scanned < 24) {
      scanned++;
      var open = block.indexOf('>', at);
      var close = open >= 0 ? block.indexOf('<', open + 1) : -1;
      if (open < 0 || close < 0) break;
      var text = this.__plain(block.slice(open + 1, close));
      if (text && text.length <= 10 && !this.__hasText(tags, text)) tags.push(text);
      at = block.indexOf('/comics/', close);
    }
  },

  __description(html) {
    var at = html.indexOf('class="txtDesc');
    if (at < 0) return '';
    var open = html.indexOf('>', at);
    var close = open >= 0 ? html.indexOf('</p>', open + 1) : -1;
    if (open < 0 || close < 0) return '';
    var text = this.__plain(html.slice(open + 1, close));
    // 站点在这段前面缀了「介绍:」/「簡介:」，去掉（书名在标题里已经有了）。
    var colon = text.indexOf('：');
    var half = text.indexOf(':');
    if (colon < 0 || (half >= 0 && half < colon)) colon = half;
    if (colon >= 0 && colon <= 4) text = text.slice(colon + 1);
    return this.__cut(text.trim(), 600);
  },

  // ---------------------------------------------------------------- 目录

  /// 目录：`<ul class="Drama autoHeight"><li><a href="/comic/<slug>/chapter-<全局id>.html">
  /// <span>第28話-想要就快點求我</span></a></li>…`（**最新一话在前**）
  ///
  /// 两点必须说清：
  ///   - 地址里的数字是**全局章节 id**，不是话数（86184 对应第 28 話）；
  ///     话数只能从 `第N話` 文案里取（`__chapterNumber`，含中文数字）。
  ///   - App 期望**升序**（「下一章」按顺序走），所以这里要重排；
  ///     实在解析不出编号的条目（「休刊公告」这类）放末尾，用全局 id 兜底排序。
  __chapters(html) {
    // 目录固定在 `<ul class="Drama autoHeight" id="mh-chapter-list-ol-0">` 里，
    // 只在这块里扫：作品页别处也有 `/chapter-` 链接（「热门推荐」板块的最
    // 新一话、正文页式的上一/下一章按钮），全页扫描会把别家作品的章节混进来。
    // 容器认不出来时退回整页（仍然只认站点的真实形状）。
    var area = html;
    var start = html.indexOf('mh-chapter-list');
    if (start >= 0) {
      var close = html.indexOf('</ul>', start);
      area = html.slice(start, close > start ? close : Math.min(html.length, start + CHAPTER_SCAN));
    }
    var chapters = [];
    var seen = {};
    var scanned = 0;
    var order = 0;
    var at = area.indexOf('/chapter-');
    while (at >= 0) {
      if (++scanned > MAX_CHAPTERS || chapters.length >= MAX_CHAPTERS) break;
      var open = area.lastIndexOf('<a', at);
      var end = area.indexOf('>', at);
      if (open >= 0 && open < at && end > at) {
        var tag = area.slice(open, end + 1);
        var id = this.__chapterUrl(this.__attr(tag, 'href'));
        if (id && !seen[id]) {
          var text = this.__readText(area, end + 1, 120);
          // 排除「不是一话」的章节链接：
          //   - 正文页的「上一章/下一章」；
          //   - 作品页的「开始阅读」按钮（`id="Subscribe_bak"`，href 指向**第 1 话**）。
          //     它排在目录之前，若不去掉，第 1 话会被它按「先到先得」占位，
          //     于是第 1 话的标题变成「开始阅读」、编号解析不出、被排到末尾。
          if (!this.__isChapterNav(tag, text)) {
            seen[id] = true;
            var number = this.__chapterNumber(text);
            chapters.push({
              id: id,
              title: this.__cut(text, 40) || (number >= 0 ? '第 ' + number + ' 话' : ''),
              number: number,
              gid: this.__chapterGid(id),
              order: order++
            });
          }
        }
      }
      at = area.indexOf('/chapter-', at + 9);
    }
    chapters.sort(function (a, b) {
      var an = a.number;
      var bn = b.number;
      if (an >= 0 && bn >= 0) return an === bn ? a.order - b.order : an - bn;
      if (an >= 0) return -1;
      if (bn >= 0) return 1;
      return a.gid === b.gid ? a.order - b.order : a.gid - b.gid;
    });
    var result = [];
    for (var i = 0; i < chapters.length; i++) {
      var chapter = chapters[i];
      var title = chapter.title;
      if (!title) {
        // 连文案都没有（极少数）：站点地址里的全局 id 至少能当个标识，但**不编话数**。
        title = '章节 ' + (chapter.gid || i + 1);
      }
      result.push({ id: chapter.id, title: title, number: chapter.number });
    }
    return result;
  },

  /// 「不是一话」的章节链接：章节导航按钮（上一章/下一章）与作品页的
  /// 「开始阅读」按钮（`class="Btn"` / `id="Subscribe_bak"`，href 就是第 1 话）。
  __isChapterNav(tag, text) {
    if (tag.indexOf('Subscribe_bak') >= 0) return true;
    if (tag.indexOf('class="Btn') >= 0) return true;
    return text.indexOf('上一') === 0 || text.indexOf('下一') === 0;
  },

  /// 「第28話」→ 28。单遍字符扫描：找「第」，往后读数字或中文数字，紧跟 话/話/章/回/集 才算。
  /// （不用正则——旧版在同类文本上用 `/g` 的 exec，lastIndex 没重置过。）
  __chapterNumber(text) {
    var value = String(text || '');
    var at = value.indexOf('第');
    while (at >= 0) {
      var i = at + 1;
      var start = i;
      while (i < value.length && this.__isChapterDigit(value.charAt(i))) i++;
      if (i > start && i < value.length && this.__isChapterUnit(value.charAt(i))) {
        var number = this.__cnNumber(value.slice(start, i));
        if (number >= 0) return number;
      }
      at = value.indexOf('第', at + 1);
    }
    return -1;
  },

  __isChapterDigit(ch) {
    if (ch >= '0' && ch <= '9') return true;
    return '〇零一二三四五六七八九十百千两'.indexOf(ch) >= 0;
  },

  __isChapterUnit(ch) {
    return '话話章回集'.indexOf(ch) >= 0;
  },

  /// 地址里的全局章节 id（`chapter-86184.html` → 86184）。
  __chapterGid(url) {
    var at = String(url || '').indexOf('chapter-');
    if (at < 0) return 0;
    var i = at + 8;
    var value = 0;
    var digits = 0;
    while (i < url.length && digits < 9) {
      var code = url.charCodeAt(i);
      if (code < 48 || code > 57) break;
      value = value * 10 + (code - 48);
      i++;
      digits++;
    }
    return digits ? value : 0;
  },

  // ---------------------------------------------------------------- 正文

  /// 正文图：全部内联在 `<div class="view-imgBox" id="m_r_imgbox_0">` 里，每张只有
  /// `data-src`（`src` 是懒加载占位）；站标与统计像素在这块**之前**，从这块往后扫
  /// 天然避开它们。扫不到再退到全页的 `data-src` → `src`。
  /// 这一页没有下一页（`next` 出现 0 次），所以只请求一次。
  __images(html) {
    var images = [];
    var seen = {};
    var start = html.indexOf('view-imgBox');
    var area = start >= 0
      ? html.slice(start, Math.min(html.length, start + MAX_INLINE_SCAN))
      : html.slice(0, MAX_INLINE_SCAN);
    this.__collectImages(area, 'data-src', images, seen);
    if (!images.length) this.__collectImages(area, 'src', images, seen);
    if (!images.length && start >= 0) this.__collectImages(html.slice(0, MAX_INLINE_SCAN), 'data-src', images, seen);
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

  // ---------------------------------------------------------------- 基础工具

  async __get(url) {
    // 列表地址在脚本内部是**站点相对路径**（/comics/…），这里必须补成绝对地址：
    // 宿主的 fetch 只把字符串原样交给网络层，不认相对路径（实测会直接 404/抛错）。
    var target = this.__absolute(url);
    var response = await LumeSource.http.get(target, {
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
        throw new Error('NEED_WEBVIEW_VERIFY：NN韩漫 需要网页视图过一次 Cloudflare 校验（HTTP ' + status + ' ' + target + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + target);
    }
    if (/<title>\s*Just a moment/i.test(body) || /challenge-platform/.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：NN韩漫 需要网页视图过一次 Cloudflare 校验（' + target + '）');
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

  /// 标签文本：`<a …>` 这一整段（从最近的 '<' 到这个 '>'，长度封顶）。
  __tagAt(html, at) {
    var start = html.lastIndexOf('<', at);
    if (start < 0) start = at;
    var end = html.indexOf('>', at);
    if (end < 0) end = Math.min(html.length, at + 400);
    if (start > end) start = at;
    return html.slice(start, end + 1);
  },

  __tagEnd(html, at) {
    var end = html.indexOf('>', at);
    return end < 0 ? at : end;
  },

  /// 取 block 里第一个 `<a …>`：`{tag, text}`（text 是锚内可读文本）。
  __firstAnchor(block) {
    var at = block.indexOf('<a ');
    if (at < 0) at = block.indexOf('<a>');
    if (at < 0) return null;
    var end = block.indexOf('>', at);
    if (end < 0) return null;
    var textEnd = block.indexOf('<', end + 1);
    if (textEnd < 0) textEnd = Math.min(block.length, end + 80);
    return { tag: block.slice(at, end + 1), text: this.__plain(block.slice(end + 1, textEnd)) };
  },

  /// 取标签属性。只认带引号的写法；`data-src` 这类前缀不同的属性靠
  /// 「属性名前一个字符必须是空白」区分，免得把 data-href 当成 href。
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

  /// 读 `name="value"` / `name='value'` 里的值（站点两种引号都用了）。
  __attrValue(text, from) {
    var quote = text.charAt(from);
    if (quote !== '"' && quote !== "'") return '';
    var end = text.indexOf(quote, from + 1);
    if (end < 0) return '';
    return text.slice(from + 1, end);
  },

  /// 从 from 起读一小段可读文本：紧挨着是子标签（`<a …>`）时优先取它的 title 属性，
  /// 其次取子标签内的文本，最后才是直接文本——站点的「最新一话」包在 <a> 里、
  /// 日期直接写成文本，两种都出现在 span.info / span.date 上。
  __readText(html, from, limit) {
    var end = Math.min(html.length, from + limit);
    var i = from;
    while (i < end && this.__isSpace(html.charCodeAt(i))) i++;
    if (i >= end) return '';
    if (html.charAt(i) === '<') {
      var tagEnd = html.indexOf('>', i);
      if (tagEnd < 0 || tagEnd > end) return '';
      var tag = html.slice(i, tagEnd + 1);
      var title = this.__plain(this.__attr(tag, 'title'));
      if (title) return title;
      var textEnd = html.indexOf('<', tagEnd + 1);
      if (textEnd < 0 || textEnd > end) return '';
      return this.__plain(html.slice(tagEnd + 1, textEnd));
    }
    var stop = html.indexOf('<', i);
    if (stop < 0 || stop > end) stop = end;
    return this.__plain(html.slice(i, stop));
  },

  /// 取 `class="<name>"` 容器里的可读文本（容器里可能直接是文本，也可能先嵌一个锚）。
  __classText(window, name) {
    var at = window.indexOf('class="' + name + '"');
    if (at < 0) return '';
    var open = window.indexOf('>', at);
    if (open < 0) return '';
    return this.__readText(window, open + 1, 300);
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

  __hasAny(text, needles) {
    for (var i = 0; i < needles.length; i++) {
      if (text.indexOf(needles[i]) >= 0) return true;
    }
    return false;
  },

  __hasText(list, text) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === text) return true;
    }
    return false;
  },

  __startsWith(text, prefix) {
    return text.length >= prefix.length && text.slice(0, prefix.length) === prefix;
  },

  __endsWith(text, suffix) {
    return text.length >= suffix.length && text.slice(text.length - suffix.length) === suffix;
  },

  __isSpace(code) {
    return code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
  },

  __cut(text, limit) {
    var value = String(text == null ? '' : text);
    return value.length > limit ? value.slice(0, limit) : value;
  },

  /// 只由数字组成时返回这串数字，否则空串。
  __digitsOnly(text) {
    var value = String(text == null ? '' : text).trim();
    if (!value || value.length > 12) return '';
    for (var i = 0; i < value.length; i++) {
      var code = value.charCodeAt(i);
      if (code < 48 || code > 57) return '';
    }
    return value;
  },

  /// 去掉标签与实体并压缩空白（**只为展示用的少量文本调用**）。
  /// 这里的 `/<[^>]*>/g` 只喂给 String.replace（它自己管 lastIndex），不做 exec。
  __plain(text) {
    var value = String(text == null ? '' : text);
    if (value.indexOf('<') >= 0) value = value.replace(/<[^>]*>/g, ' ');
    value = value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&hellip;/g, '…');
    value = value.replace(/\s+/g, ' ').trim();
    return value;
  },

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
      } else if (code < 0x800) {
        out += '%' + this.__hex((code >> 6) | 0xC0);
        out += '%' + this.__hex((code & 0x3F) | 0x80);
      } else {
        out += '%' + this.__hex((code >> 12) | 0xE0);
        out += '%' + this.__hex(((code >> 6) & 0x3F) | 0x80);
        out += '%' + this.__hex((code & 0x3F) | 0x80);
      }
    }
    return out;
  },

  /// 两位十六进制（旧版没补零，`%A` 这种非法转义就是漏了这一步）。
  __hex(value) {
    var text = value.toString(16).toUpperCase();
    return text.length < 2 ? '0' + text : text;
  },

  __cnNumber(text) {
    var value = String(text == null ? '' : text).trim();
    if (!value) return -1;
    var onlyDigits = true;
    for (var i = 0; i < value.length; i++) {
      var code = value.charCodeAt(i);
      if (code < 48 || code > 57) { onlyDigits = false; break; }
    }
    if (onlyDigits) return Number(value);
    var digits = { '〇': 0, '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    var units = { '十': 10, '百': 100, '千': 1000 };
    var total = 0;
    var current = 0;
    for (var j = 0; j < value.length; j++) {
      var ch = value.charAt(j);
      if (digits[ch] != null) current = digits[ch];
      else if (units[ch] != null) {
        total += (current || 1) * units[ch];
        current = 0;
      } else return -1;
    }
    total += current;
    return total > 0 ? total : -1;
  }
};
