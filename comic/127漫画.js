// LumeSource: {"id":"manhua127_comic","name":"127漫画","version":"1.2.0","category":"comic","mirrors":["https://www.127manhua.com"],"icon":"https://www.127manhua.com/template/wap/default/img/favicon.ico"}

// v1.2.0（2026-10-29）修：封面被 http/裸 IP 拖死、VIP 分类空、章节图 http 混用
//
// 站点：https://www.127manhua.com（127漫画网 · McCMS v10 定制 wap 主题）
// 模板目录 /template/wap/default/，前端逻辑在 /packs/mccms/base_wap.js（jQuery）
// 与 /template/wap/default/js/core.js（comic.search / comic.category）。
//
// 和 96漫画网（https://www.96manhua.com）是**同一套模板**，解析代码逐字相同，
// 差别只有两处，都收在下面的常量里 ——
//   · 详情前缀：127 是 /mh/{id}.html，96 是 /dongman/{id}.html；
//   · 章节地址形状：127 是 /chapter/{章节id}（6 位数字），
//     96 是 /chapter/{作品id}_{章节id}.html。
//     章节地址一律**从详情页解析**，不自己拼。
//
// ## 抓取口径（全部对着实时页面 + 站点自己的 JS 核过，2026-10 实测）
//
//   首页    GET /
//           `div.floor` / `div.floor dj` 板块：`h2.title > a[href]` 是「更多」（顺带带
//           第一个 span 当板块名），板块内 `ul > li.comic-item > a[href=DETAIL_PREFIX…]`，
//           封面只在 `img[data-src]`（`src` 是 base64 占位图，读了就是一张灰图），
//           标题 `p.comic-name`、副标题 `p.comic-tip`（首页放「最新话」）。
//           顶部轮播 `div.banner > div.swiper-slide > a > img[data-src][alt]` 也算一块
//           （标题只在 img 的 alt 里，它没有 comic-name 节点）。
//   分类    GET /custom/category —— 站点自己的四个页签（题材/进度/受众/属性），
//           每个条目是 `li.catalog-item > a[href]`，地址形状固定：
//             /category/tags/{n}    题材（80 个：热血 6、冒险 7 … 国漫 108）
//             /category/finish/{n}  进度（1 连载 / 2 完结）
//             /category/list/{n}    受众（1 少年 / 2 少女 / 3 青年 / 4 少儿）
//             /category/pay/{n}     属性（1 免费 / 2 付费 / 3 VIP）
//           分类 id 就直接用这四个路径（list() 原样认），不编 id。
//   列表    **走站点自己的 JSON 接口**，HTML 分类页只有首屏 10 条（后面全靠滚动 AJAX）：
//             GET /index.php/api/data/comic?type[tags|finish|list|pay]={n}&page={N}
//             GET /index.php/api/data/comic?key={关键词}&page={N}          ← 搜索
//           返回 {"code":1,"msg":"漫画列表","data":[{id,name,pic,url,chapter_url,
//           chapter_name,content,serialize,author,tags,hits,addtime,…}]}，**10 条/页**，
//           没有总数字段 → hasMore 只能按「满 10 条」判断。
//           ⚠ 这个接口**必须带 Referer**：实测裸请求（无 Referer）直接回
//           {"msg":"非法请求","code":-1}，带上 Referer 就 200（连 X-Requested-With
//           都可以不要，可见拦的是 Referer）。脚本两样都带，跟浏览器 XHR 一致。
//   搜索    站内搜索框是 `<form action="/search"><input name="key">`，但 /search 的
//           HTML 永远是空壳（结果由 core.js 的 comic.search() 用上面的接口灌进去），
//           所以 list({keyword}) 直接打接口，不去解析空壳页。
//   详情    GET /mh/{id}.html
//           `<h1 class="comic-name">` 标题（页头还有一个同名的 span，不能只看 class）；
//           封面 `meta[property=og:image]`（近处还有一份
//           `div.box-back[style=background-image:url(…)]`，不依赖）；
//           简介 `span.comic-intro`（后面还粘着站点塞的推广句，截断即可）；
//           作者 `作者：xxx`、状态 `og:novel:status`、分类 `p.comic-tags`。
//   目录    就在详情页里（单页、完整、旧→新，站点没有单独的目录地址）：
//           `li.chapter-item.id-{章节id} > a[href=/chapter/…]`。
//           大长篇实测同一个页面里 2200+ 条链接（最长那部 2261 话），不翻页。
//   正文    GET /chapter/{章节id}
//           `ul.comic-list > li.comic-page > img[src]` 就是整话（下拉式、不翻页）。
//           只认 li.comic-page 里的图：页面里还混着 /js/chapter1.js 之类的广告脚本块，
//           整页抓裸 <img> 会把广告收进来。
//
// ## 实测出来的几个坑
//
// 1. **别把列表交给 HTML 分类页**：/category/finish/1 首屏只渲染 10 条，第 2 页起
//    只有 `comic.category()` 的 AJAX（index.php/api/data/comic?type=…&page=2），
//    所以 list() 一开始就打接口。HTML 只留作接口挂掉时的第 1 页兜底。
// 2. **封面只在 data-src**，`src` 是 `data:image/gif;base64,…` 占位图。
// 3. 96 与 127 的作品进度并不总一致（同一部作品两边的章节名/话数可能不同），
//    所以作品与章节都按各自的详情页解析，不跨站复用地址。
// 4. **图片不需要 Referer**：正片图在 server3.ypzps.com / img.kkgogo.com /
//    2p178.ypzps.com 上，curl 直接 GET（无 Referer、无 Cookie）就是 200 image/jpeg；
//    content() 仍然把 Referer 带上，跟浏览行为一致，也防以后收紧。
// 5. 站点有 Cloudflare DNS 前置，但普通 GET 没有挑战页；被拦时（403/503/429 或
//    出现 __cf_chl / challenge-platform）抛 NEED_WEBVIEW_VERIFY，App 会拉起网页视图。


var BASE_URL = 'https://www.127manhua.com';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var DETAIL_PREFIX = '/mh/';                   // 96 那份是 '/dongman/'
var API_PATH = '/index.php/api/data/comic';   // 站点自己的列表/搜索接口
var API_PAGE_SIZE = 10;                       // 接口每页条数（实测恒为 10）
var MAX_ITEMS = 40;                           // 单次列表最多产出
var MAX_BOARDS = 8;                           // 首页最多几块
var BOARD_ITEMS = 24;                         // 单块最多几条
var ITEM_WINDOW = 1500;                       // 一条条目往后看的窗口
var MAX_CHAPTERS = 3000;                      // 目录最多解析多少话
var MAX_IMAGES = 400;                         // 正文最多收多少张图
var MAX_CHROME_SCAN = 200000;                 // 详情/正文页扫描上限（正文页 ≈20–40KB）

// 「这不是封面 / 正文图」：站标、占位图、统计像素、广告位（128×? 的底图）。
var SKIP_IMAGE = /logo|avatar|banner|advert|placeholder|blank|loading|icon|sprite|qrcode|share|empty|favicon/i;

var LumeSource = {
  id: 'manhua127_comic',
  name: '127漫画',
  version: '1.1.0',
  icon: 'https://www.127manhua.com/template/wap/default/img/favicon.ico',
  category: 'comic',

  // ---------------------------------------------------------------- 契约方法

  /// 分类：读站点自己的「分类」页（/custom/category）里那四排页签，
  /// id 就是站点链接的路径（/category/tags/6 这种），title 用锚内文字。
  /// 认不出来只给「连载 / 完结」两条——这两个地址是全站最稳的，不编分类。
  async categories() {
    var html = await this.__get(BASE_URL + '/custom/category');
    var found = this.__categories(html);
    if (!found.length) {
      console.warn('[127] 分类页没认出条目（' + html.length + ' 字符），只给连载/完结');
      return [
        { id: '/category/finish/1', title: '连载' },
        { id: '/category/finish/2', title: '完结' }
      ];
    }
    console.warn('[127] 分类 ' + found.length + ' 个（站点四个页签合起来）');
    return found;
  },

  async filters() {
    var categories = await this.categories();
    var labels = { tags: '题材', finish: '进度', list: '受众', pay: '属性' };
    var groups = [];
    var keys = Object.keys(labels);
    for (var k = 0; k < keys.length; k++) {
      var options = [];
      for (var i = 0; i < categories.length; i++) {
        var facet = this.__categoryFacet(categories[i].id);
        if (facet && facet.key === keys[k]) options.push({ id: facet.value, title: categories[i].title });
      }
      if (options.length) groups.push({ id: keys[k], title: labels[keys[k]], options: options });
    }
    groups.push({ id: 'order', title: '排序', options: [
      { id: 'hits', title: '人气' }, { id: 'addtime', title: '最新' }
    ] });
    return { groups: groups };
  },

  /// 首页：顶部轮播一块 + 站点自己的 div.floor 板块，各 12 条左右。
  /// 板块「更多」只在它是真分类地址时才透传给 list()（/custom/* 那些是整表页，
  /// 交给 list() 只会得到默认列表，所以宁可不给）。
  async home() {
    var html = await this.__get(BASE_URL + '/');
    var boards = [];

    var banner = this.__htmlItemsBy(html, 'class="swiper-slide"', 12);
    if (banner.length) boards.push({ title: '热门推荐', items: banner });

    var floors = this.__floors(html);
    for (var i = 0; i < floors.length && boards.length < MAX_BOARDS; i++) {
      if (floors[i].items.length) boards.push(floors[i]);
    }

    if (boards.length) {
      console.warn('[127] 首页板块 ' + boards.length + ' 块');
      return boards;
    }
    // 兜底：首页结构改了就退回列表接口的默认榜（不让首页空着）。
    var latest = await this.list({ page: 1 });
    if (latest && latest.items && latest.items.length) {
      console.warn('[127] 首页没认出板块（' + html.length + ' 字符），退回列表接口一块');
      return [{ title: '最近更新', items: latest.items.slice(0, 12) }];
    }
    return [];
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!(page > 0)) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';

    var url = BASE_URL + API_PATH + '?' + this.__apiQuery(keyword, category, page, argument && argument.filters);
    try {
      var body = await this.__get(url, true);
      var payload = this.__json(body);
      if (!payload || Number(payload.code) !== 1) {
        throw new Error('接口回了 code=' + (payload ? payload.code : '?') + ' msg=' + (payload ? payload.msg : ''));
      }
      var items = this.__apiItems(payload);
      console.warn('[127] 列表 ' + (keyword ? '搜索「' + keyword + '」' : (category || '全部')) +
        ' 第 ' + page + ' 页：' + items.length + ' 条');
      return { items: items, hasMore: items.length >= API_PAGE_SIZE };
    } catch (error) {
      console.warn('[127] 列表接口失败：' + (error && error.message) + ' ' + url);
    }

    // 兜底：分类页首屏（站点只渲染首屏 10 条，没有 HTML 分页，所以 hasMore=false）。
    if (!keyword && page === 1 && category.charAt(0) === '/') {
      var pageHtml = await this.__get(BASE_URL + category);
      var htmlItems = this.__htmlItemsBy(pageHtml, 'class="comic-item"', MAX_ITEMS);
      console.warn('[127] 回退到分类页首屏：' + htmlItems.length + ' 条');
      return { items: htmlItems, hasMore: false };
    }
    // 搜索没有 HTML 兜底（/search 是空壳，结果全靠接口）→ 老实回空。
    if (keyword) console.warn('[127] 搜索接口不可用，返回空列表（/search 页面本身不含结果）');
    return { items: [], hasMore: false };
  },

  async detail(argument) {
    var url = this.__detailUrl(this.__idOf(argument));
    if (!url) throw new Error('127漫画：认不出的作品地址（id 应当来自 list()/home()）');
    var html = await this.__get(url);
    var info = this.__detailInfo(html);
    if (!info.title) {
      throw new Error('127漫画：详情页没认出标题（' + url + '，' + html.length + ' 字符）');
    }
    console.warn('[127] 详情：' + info.title + '（' + url + '）');
    return {
      id: url,
      title: info.title,
      cover: info.cover,
      coverHeaders: { 'Referer': BASE_URL + '/' },
      subtitle: info.subtitle,
      description: info.description,
      tags: info.tags,
      extra: { author: info.author, status: info.status, updated: info.updated, url: url }
    };
  },

  /// 目录：详情页里的 `li.chapter-item.id-{章节id} > a`，单页完整、旧→新。
  /// 章节 id 存**完整章节地址**（127 的形状 /chapter/{章节id} 只有详情页知道），
  /// content() 拿到就能直接取，不再拼一次。
  /// 站点自己也会挂出「待浏览/待更新」的空目录（详情页有 catalog-box 但 ul 是空的，
  /// 接口里 chapter_nums=0），这种作品返回空数组，不当成解析失败。
  async chapters(argument) {
    var url = this.__detailUrl(this.__idOf(argument));
    if (!url) throw new Error('127漫画：认不出的作品地址（id 应当来自 list()/detail()）');
    var html = await this.__get(url);
    var chapters = this.__chapterItems(html);
    if (!chapters.length) {
      if (this.__hasEmptyCatalog(html)) {
        console.warn('[127] 这部作品站点还没有章节（目录为空）：' + url);
        return [];
      }
      throw new Error('127漫画：目录没认出章节链接（' + url + '）——把运行日志发回来收敛解析规则');
    }
    console.warn('[127] 目录 ' + chapters.length + ' 话：' + url);
    return chapters;
  },

  /// 正文：章节页 `li.comic-page > img[src]`，一整话一页铺完（下拉式，无章内翻页）。
  /// 真没有图（公告话/被锁）时退成文字，交给 App 显示，不硬抛错。
  async content(argument) {
    var chapterUrl = this.__chapterUrl(argument && argument.chapterId ? argument.chapterId : '');
    if (!chapterUrl) throw new Error('127漫画：缺少章节地址（chapterId 应当来自 chapters()）');
    var html = await this.__get(chapterUrl);
    var images = this.__images(html);
    if (images.length) {
      console.warn('[127] 正文 ' + images.length + ' 张图：' + chapterUrl);
      return { kind: 'images', images: images, headers: { 'Referer': BASE_URL + '/' } };
    }
    var text = this.__pageText(html);
    if (!text || /VIP|付费|购买|登录|解锁|会员|金币/.test(String(text).slice(0, 400))) {
      console.warn('[127] 这一话要 VIP/登录，改走网页播放：' + chapterUrl);
      return { kind: 'webplayer', url: chapterUrl, headers: { 'Referer': BASE_URL + '/' } };
    }
    if (text) {
      console.warn('[127] 这一话没有图片，按文字返回（' + chapterUrl + '）');
      return { kind: 'text', text: text };
    }
    throw new Error('127漫画：这一话既没有图也没有文字（' + chapterUrl + '）——把运行日志发回来收敛解析规则');
  },

  // ---------------------------------------------------------------- 地址策略

  /// 接口查询串：分类走站点自己的 type[…]，搜索走 key（都是站点 JS 里那套参数）。
  /// 站点首页 JS 还会追加 type[order]=hits / type[list]=0 / type[pay]=0 之类的默认值，
  /// 实测可省（省掉还能避免「list / pay 页签」被 0 覆盖）。
  __apiQuery(keyword, category, page, filters) {
    var parts = [];
    var facets = {};
    if (keyword) {
      parts.push('key=' + this.__encode(keyword));
    } else {
      var facet = this.__categoryFacet(category);
      if (facet) facets[facet.key] = facet.value;
    }
    filters = filters || {};
    var keys = ['tags', 'finish', 'list', 'pay'];
    for (var i = 0; i < keys.length; i++) {
      var selected = String(filters[keys[i]] || '');
      if (/^\d{1,6}$/.test(selected)) facets[keys[i]] = selected;
    }
    keys = Object.keys(facets);
    for (var i = 0; i < keys.length; i++) parts.push('type%5B' + keys[i] + '%5D=' + facets[keys[i]]);
    // Match the site's popularity listing; its bare API defaults to uploaded
    // test entries whose IP-hosted covers are no longer reachable.
    parts.push('type%5Border%5D=' + (filters.order === 'addtime' ? 'addtime' : 'hits'));
    parts.push('page=' + page);
    return parts.join('&');
  },

  /// 分类路径 → 接口的 type 键名（/category/tags/6 → {key:'tags', value:'6'}）。
  __categoryFacet(category) {
    var text = String(category == null ? '' : category).trim();
    if (!text) return null;
    if (text.indexOf('http') === 0) {
      if (text.indexOf(BASE_URL) !== 0) return null;
      text = text.slice(BASE_URL.length);
    }
    var match = /^\/category\/(tags|finish|list|pay)\/(\d{1,6})$/.exec(text);
    if (!match) return null;
    return { key: match[1], value: match[2] };
  },

  __idOf(argument) {
    var id = '';
    if (argument && argument.id != null) id = String(argument.id);
    else if (argument && argument.comicId != null) id = String(argument.comicId);
    else if (argument && argument.bookId != null) id = String(argument.bookId);
    if (!id) throw new Error('127漫画：缺少作品 ID');
    return id;
  },

  /// 作品地址：完整地址 / 站内路径都认，统一成 BASE_URL + 站内路径。
  __detailUrl(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return '';
    if (text.indexOf('//') === 0) text = 'https:' + text;
    if (text.indexOf('http') === 0) text = this.__pathOf(text);
    if (!text) return '';
    if (text.charAt(0) !== '/') text = '/' + text;
    if (text.indexOf(DETAIL_PREFIX) !== 0) return '';
    return BASE_URL + text;
  },

  /// 章节地址：只认站点自己的 /chapter/{章节id} 形状（96 那份多一段作品 id）。
  __chapterUrl(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return '';
    if (text.indexOf('//') === 0) text = 'https:' + text;
    if (text.indexOf('http') === 0) text = this.__pathOf(text);
    if (!text) return '';
    if (text.charAt(0) !== '/') return '';
    if (text.indexOf('/chapter/') !== 0) return '';
    return BASE_URL + text;
  },

  /// 完整地址 → 站内路径（别的主机也只取路径，镜像域名换起来不影响）。
  __pathOf(url) {
    var text = String(url || '').trim();
    if (!text) return '';
    if (text.indexOf(BASE_URL) === 0) return text.slice(BASE_URL.length);
    var start = text.indexOf('//');
    if (start < 0) return text;
    var slash = text.indexOf('/', start + 2);
    return slash >= 0 ? text.slice(slash) : '/';
  },

  __absolute(url) {
    var text = String(url || '').trim();
    if (!text) return '';
    if (text.indexOf('data:') === 0) return '';
    if (text.indexOf('//') === 0) return 'https:' + text;
    if (text.indexOf('http') === 0) return text;
    if (text.charAt(0) === '/') return BASE_URL + text;
    return BASE_URL + '/' + text;
  },

  /// 封面 / 章节图必须是 https：iOS 的 ATS 会拦掉 http 资源（整页占位图就是这个原因）。
  /// 裸 IP 主机没有 TLS 也连不上，统一判为不可用，交给 __fillCovers 去详情页补。
  __httpsUrl(value) {
    var text = this.__absolute(value);
    if (!text) return '';
    var m = /^http:\/\/([^/]+)([\s\S]*)$/i.exec(text);
    if (!m) return text;
    var host = m[1];
    if (/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(host)) return '';
    return 'https://' + host + m[2];
  },

  // ---------------------------------------------------------------- 分类 / 首页

  /// `li.catalog-item > a[href]`，一组四个页签共 89 条（题材 80 / 进度 2 / 受众 4 / 属性 3）。
  /// 只认 /category/{tags|finish|list|pay}/{n} 这四种形状，同一地址去重。
  __categories(html) {
    var found = [];
    var seen = {};
    var at = html.indexOf('class="catalog-item');
    var scanned = 0;
    while (at >= 0 && scanned < 200) {
      scanned++;
      var end = html.indexOf('</li>', at);
      var block = html.slice(at, end > at ? end : Math.min(html.length, at + 600));
      var anchorAt = block.indexOf('<a ');
      if (anchorAt >= 0) {
        var anchorEnd = block.indexOf('>', anchorAt);
        var id = this.__categoryId(this.__attr(block.slice(anchorAt, anchorEnd + 1), 'href'));
        if (id && !seen[id]) {
          var close = block.indexOf('</a>', anchorEnd);
          var title = this.__plain(block.slice(anchorEnd + 1, close > anchorEnd ? close : anchorEnd + 120));
          if (!title) {
            var imgAt = block.indexOf('<img', anchorEnd);
            var imgEnd = imgAt < 0 ? -1 : block.indexOf('>', imgAt);
            if (imgEnd > imgAt) title = this.__plain(this.__attr(block.slice(imgAt, imgEnd + 1), 'alt'));
          }
          if (title) {
            seen[id] = true;
            found.push({ id: id, title: this.__cut(title, 16) });
          }
        }
      }
      at = html.indexOf('class="catalog-item', end > at ? end : at + 18);
    }
    return found;
  },

  __categoryId(href) {
    var text = String(href || '').trim();
    if (!text) return '';
    if (text.indexOf('http') === 0) {
      if (text.indexOf(BASE_URL) !== 0) return '';
      text = text.slice(BASE_URL.length);
    }
    if (text.charAt(0) !== '/') text = '/' + text;
    return /^\/category\/(tags|finish|list|pay)\/\d{1,6}$/.test(text) ? text : '';
  },

  /// 首页板块：`div.floor` / `div.floor dj` → 块内第一个 `<h2>` 里取板块名（第一个 span）
  /// 与「更多」地址，条目就是块里的 `li.comic-item`。
  /// 注意 `class="floor-view"` 是**板块内部**的容器，不能当成板块起点（会切碎窗口），
  /// 所以只认 `class="floor` 后面紧跟引号或空格的位置。
  __floors(html) {
    var boards = [];
    var starts = this.__floorStarts(html);
    for (var i = 0; i < starts.length && boards.length < MAX_BOARDS; i++) {
      var block = html.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : Math.min(html.length, starts[i] + 60000));
      var head = this.__floorHead(block);
      var items = this.__htmlItemsBy(block, 'class="comic-item"', BOARD_ITEMS);
      if (!items.length) continue;
      boards.push({
        title: head.title || '推荐',
        moreUrl: this.__categoryId(head.moreUrl),
        items: items
      });
    }
    return boards;
  },

  __floorStarts(html) {
    var out = [];
    var needle = 'class="floor';
    var at = html.indexOf(needle);
    while (at >= 0 && out.length < 60) {
      var ch = html.charAt(at + needle.length);
      if (ch === '"' || ch === ' ') out.push(at);
      at = html.indexOf(needle, at + needle.length);
    }
    return out;
  },

  __floorHead(block) {
    var out = { title: '', moreUrl: '' };
    var h2 = block.indexOf('<h2');
    if (h2 < 0) return out;
    var close = block.indexOf('</h2>', h2);
    var head = block.slice(h2, close > h2 ? close : Math.min(block.length, h2 + 800));

    var anchorAt = head.indexOf('<a ');
    if (anchorAt >= 0) {
      var anchorEnd = head.indexOf('>', anchorAt);
      if (anchorEnd > anchorAt) out.moreUrl = this.__attr(head.slice(anchorAt, anchorEnd + 1), 'href');
    }
    // 板块名在第一个 <span> 里（`<i class="icon …"></i><span>最新连载</span>`）。
    var spanAt = head.indexOf('<span');
    if (spanAt >= 0) {
      var spanEnd = head.indexOf('>', spanAt);
      var spanClose = head.indexOf('</span>', spanEnd);
      if (spanEnd > spanAt) {
        out.title = this.__plain(head.slice(spanEnd + 1, spanClose > spanEnd ? spanClose : spanEnd + 120));
      }
    }
    if (!out.title) out.title = this.__plain(this.__readText(head, head.indexOf('>', h2) + 1, 120));
    return out;
  },

  // ---------------------------------------------------------------- 解析

  /// 接口返回 → 契约条目。id 用**绝对地址**（detail()/chapters() 原样认）。
  /// 接口里封面是裸 IP（http://206.237.5.163/…）的条目，图床已经废了；
  /// 详情页里通常还是好的 https 图，补一次（限量、并发无关，失败就留空）。
  async __fillCovers(items) {
    var limit = 8;
    var done = 0;
    for (var i = 0; i < items.length && done < limit; i++) {
      if (items[i].cover) continue;
      done++;
      try {
        var html = await this.__get(items[i].id);
        var info = this.__detailInfo(html);
        var cover = this.__httpsUrl(info && info.cover);
        if (cover) {
          items[i].cover = cover;
          items[i].coverHeaders = { 'Referer': BASE_URL + '/' };
        }
      } catch (error) {
        /* 补不到就留空 */
      }
    }
    return items;
  },

  __apiItems(payload) {
    var rows = payload && payload.data && payload.data.length ? payload.data : [];
    var items = [];
    for (var i = 0; i < rows.length && items.length < MAX_ITEMS; i++) {
      var row = rows[i] || {};
      var url = this.__detailUrl(row.url);
      var title = this.__plain(row.name);
      if (!url || !title) continue;
      items.push({
        id: url,
        title: this.__cut(title, 80),
        cover: this.__httpsUrl(this.__absolute(row.pic)),
        coverHeaders: { 'Referer': BASE_URL + '/' },
        subtitle: this.__cut(this.__plain(row.chapter_name || row.author || row.serialize || ''), 40)
      });
    }
    return items;
  },

  /// 站点 HTML 条目（首页板块 / 分类页首屏 / 轮播）。marker 是区分条目的那一段 class。
  __htmlItemsBy(html, marker, limit) {
    var items = [];
    var seen = {};
    var at = html.indexOf(marker);
    var scanned = 0;
    while (at >= 0 && items.length < limit && scanned < 400) {
      scanned++;
      var next = html.indexOf(marker, at + marker.length);
      var block = html.slice(at, next > at ? next : Math.min(html.length, at + ITEM_WINDOW));
      var item = this.__itemFromBlock(block);
      if (item && !seen[item.id]) {
        seen[item.id] = true;
        items.push(item);
      }
      at = next;
    }
    return items;
  },

  __itemFromBlock(block) {
    var anchorAt = block.indexOf('<a ');
    if (anchorAt < 0) return null;
    var anchorEnd = block.indexOf('>', anchorAt);
    if (anchorEnd < 0) return null;
    var id = this.__detailUrl(this.__attr(block.slice(anchorAt, anchorEnd + 1), 'href'));
    if (!id) return null;

    var imgAt = block.indexOf('<img', anchorEnd);
    var imgTag = imgAt >= 0 ? block.slice(imgAt, block.indexOf('>', imgAt) + 1) : '';
    var cover = '';
    if (imgTag) {
      cover = this.__absolute(this.__attr(imgTag, 'data-src') || this.__attr(imgTag, 'data-original') ||
        this.__attr(imgTag, 'src'));
    }

    var title = this.__textOfClass(block, 'comic-name') || this.__plain(this.__attr(imgTag, 'alt'));
    if (!title) return null;
    return {
      id: id,
      title: this.__cut(title, 80),
      cover: cover,
      coverHeaders: { 'Referer': BASE_URL + '/' },
      subtitle: this.__cut(this.__textOfClass(block, 'comic-tip'), 40)
    };
  },

  /// 详情页信息：标题 / 封面 / 简介 / 作者 / 状态 / 分类。
  /// 标题必须从 `<h1 …comic-name…>` 里取：页头还有一个 `<span class="comic-name">`
  /// （同一部作品名），只认 class 会把两个名字拼成「死神 死神」。
  __detailInfo(html) {
    var area = html.slice(0, Math.min(html.length, MAX_CHROME_SCAN));
    var title = this.__headingTitle(area);
    if (!title) title = this.__plain(this.__meta(area, 'og:novel:book_name'));
    if (!title) title = this.__plain(this.__titleTag(area)).split('_')[0];

    var cover = this.__absolute(this.__meta(area, 'og:image'));
    if (!cover) {
      var back = area.indexOf('class="box-back"');
      if (back >= 0) {
        var tagEnd = area.indexOf('>', back);
        cover = this.__absolute(this.__backgroundUrl(area.slice(back, tagEnd + 1)));
      }
    }

    var description = '';
    var intro = area.indexOf('class="comic-intro"');
    if (intro >= 0) {
      var introEnd = area.indexOf('</span>', intro);
      description = this.__plain(area.slice(area.indexOf('>', intro) + 1,
        introEnd > intro ? introEnd : intro + 2000));
    }
    if (!description) description = this.__plain(this.__meta(area, 'og:description'));

    var author = this.__textOfClass(area, 'au-name').replace(/^作者[:：]\s*/, '');
    var status = this.__plain(this.__meta(area, 'og:novel:status'));
    var tags = this.__tagList(area);
    var updated = '';
    var updateAt = area.indexOf('class="comic-update-info"');
    if (updateAt >= 0) {
      var updateClose = area.indexOf('</p>', updateAt);
      updated = this.__plain(area.slice(area.indexOf('>', updateAt) + 1,
        updateClose > updateAt ? updateClose : updateAt + 300));
    }

    var bits = [];
    if (author) bits.push('作者：' + author);
    if (status) bits.push(status);
    if (tags.length) bits.push(tags.slice(0, 3).join('/'));

    return {
      title: this.__cut(title, 80),
      cover: cover,
      description: this.__cut(description, 400),
      subtitle: this.__cut(bits.join(' · '), 60),
      author: author,
      status: status,
      updated: updated,
      tags: tags
    };
  },

  /// `<h1 …comic-name…>标题</h1>`（页头的同名 span 不算）。站点个别详情页把收尾标签
  /// 写坏成别的，所以只匹配开始标签，读到下一个 `</h1>` 为止。
  __headingTitle(area) {
    var at = area.indexOf('<h1');
    var scanned = 0;
    while (at >= 0 && scanned < 6) {
      scanned++;
      var open = area.indexOf('>', at);
      if (open < 0) break;
      if (area.slice(at, open + 1).indexOf('comic-name') >= 0) {
        var close = area.indexOf('</h1>', open);
        if (close > open) return this.__plain(area.slice(open + 1, close));
      }
      at = area.indexOf('<h1', open);
    }
    return '';
  },

  /// `p.comic-tags` 里混着热度（「73.4 万」）与分类：纯数字与「万/亿/次」尾巴都剔掉，
  /// 剩下才是分类名。
  __tagList(area) {
    var text = this.__textOfClass(area, 'comic-tags');
    if (!text) return [];
    var parts = text.split(/[\/·,，\s]+/);
    var tags = [];
    for (var i = 0; i < parts.length && tags.length < 8; i++) {
      var token = parts[i];
      if (!token) continue;
      if (/^[\d.,]+$/.test(token)) continue;
      if (/[万亿次]$/.test(token)) continue;
      if (tags.indexOf(token) < 0) tags.push(token);
    }
    return tags;
  },

  /// 详情页有 `catalog-box`（章节容器）但目录 ul 是空的 —— 站点自己就没排章节。
  __hasEmptyCatalog(html) {
    if (html.indexOf('catalog-box') < 0) return false;
    return /class="catalog-list"[\s\S]{0,400}?<ul[^>]*>\s*<\/ul>/.test(html);
  },

  /// 目录：`li.chapter-item … <a href="/chapter/…">标题</a>`，旧→新，保持站点顺序
  /// （站点自己就是升序；「休刊公告」这类没编号的条目也在原位，不重排）。
  __chapterItems(html) {
    var chapters = [];
    var seen = {};
    var at = html.indexOf('class="chapter-item');
    var scanned = 0;
    while (at >= 0 && chapters.length < MAX_CHAPTERS) {
      if (++scanned > MAX_CHAPTERS + 400) break;
      var anchorAt = html.indexOf('<a ', at);
      if (anchorAt < 0) break;
      var anchorEnd = html.indexOf('>', anchorAt);
      if (anchorEnd < 0) break;
      var url = this.__chapterUrl(this.__attr(html.slice(anchorAt, anchorEnd + 1), 'href'));
      var close = html.indexOf('</a>', anchorEnd);
      var title = this.__plain(html.slice(anchorEnd + 1, close > anchorEnd ? close : anchorEnd + 200));
      if (url && title && !seen[url]) {
        seen[url] = true;
        chapters.push({ id: url, title: this.__cut(title, 60) });
      }
      at = html.indexOf('class="chapter-item', anchorEnd);
    }
    return chapters;
  },

  /// 正文图：只认 `li.comic-page` 里那张 `<img>`（窗口 = 本条 li 到下一个 li）。
  /// 一份都收不到时，才退到 `id="mainView"` 容器里找带图片后缀的 <img>，
  /// 并把它当作「站点换了懒加载标记」的兜底。
  __images(html) {
    var images = [];
    var seen = {};
    var at = html.indexOf('class="comic-page');
    var scanned = 0;
    while (at >= 0 && images.length < MAX_IMAGES) {
      if (++scanned > MAX_IMAGES * 4) break;
      var next = html.indexOf('class="comic-page', at + 18);
      var block = html.slice(at, next > at ? next : Math.min(html.length, at + 900));
      var imgAt = block.indexOf('<img');
      if (imgAt >= 0) {
        var imgEnd = block.indexOf('>', imgAt);
        var tag = block.slice(imgAt, imgEnd > imgAt ? imgEnd + 1 : imgAt + 300);
        var url = this.__absolute(this.__attr(tag, 'data-original') || this.__attr(tag, 'data-src') ||
          this.__attr(tag, 'src'));
        if (url && this.__isImage(url) && !seen[url]) {
          seen[url] = true;
          images.push(this.__httpsUrl(url));
        }
      }
      at = next;
    }
    if (!images.length) this.__looseImages(html, images, seen);
    return images;
  },

  __looseImages(html, images, seen) {
    var start = html.indexOf('id="mainView"');
    if (start < 0) start = 0;
    var end = html.indexOf('</main>', start);
    if (end < 0) end = Math.min(html.length, start + MAX_CHROME_SCAN * 4);
    var area = html.slice(start, end);
    var at = area.indexOf('<img');
    var scanned = 0;
    while (at >= 0 && images.length < MAX_IMAGES) {
      if (++scanned > MAX_IMAGES * 6) break;
      var imgEnd = area.indexOf('>', at);
      if (imgEnd < 0) break;
      var tag = area.slice(at, imgEnd + 1);
      var url = this.__absolute(this.__attr(tag, 'data-original') || this.__attr(tag, 'data-src') ||
        this.__attr(tag, 'src'));
      if (url && this.__isImage(url) && !seen[url]) {
        seen[url] = true;
        images.push(this.__httpsUrl(url));
      }
      at = area.indexOf('<img', imgEnd);
    }
  },

  __isImage(url) {
    var text = String(url || '').trim();
    if (!text || text.length > 400) return false;
    if (text.indexOf('data:') === 0) return false;
    if (SKIP_IMAGE.test(text)) return false;
    var path = text.toLowerCase();
    var query = path.indexOf('?');
    if (query >= 0) path = path.slice(0, query);
    return this.__endsWith(path, '.jpg') || this.__endsWith(path, '.jpeg') ||
      this.__endsWith(path, '.png') || this.__endsWith(path, '.webp') ||
      this.__endsWith(path, '.gif') || this.__endsWith(path, '.avif');
  },

  /// 无图时（公告话/被锁）把页面正文捞成文字，别让 App 只看到一句报错。
  __pageText(html) {
    var start = html.indexOf('id="mainView"');
    if (start < 0) start = html.indexOf('<body');
    if (start < 0) return '';
    var end = html.indexOf('</main>', start);
    if (end < 0) end = Math.min(html.length, start + 4000);
    var text = this.__plain(html.slice(start, end));
    text = text.replace(/点击加载更多|上一话|下一话|目录|收藏|举报/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length >= 40 ? this.__cut(text, 2000) : '';
  },

  // ---------------------------------------------------------------- 基础工具

  /// 统一取页：必须带 Referer（列表接口靠它放行，见文件头）；被 Cloudflare 拦时抛
  /// NEED_WEBVIEW_VERIFY 让 App 拉起网页视图过一次人机校验。
  async __get(url, isApi) {
    var headers = {
      'User-Agent': UA,
      'Referer': BASE_URL + '/',
      'Accept': isApi ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    };
    if (isApi) headers['X-Requested-With'] = 'XMLHttpRequest';
    var response = await LumeSource.http.get(url, { headers: headers });
    var status = response ? response.status : 0;
    var body = response && response.body ? String(response.body) : '';
    if (status !== 200) {
      if (status === 403 || status === 503 || status === 429 ||
        /just a moment|__cf_chl|cf-chl|challenge-platform|cf-mitigated|checking your browser/i.test(body)) {
        throw new Error('NEED_WEBVIEW_VERIFY：127漫画 需要网页视图过一次 Cloudflare 校验（HTTP ' + status + ' ' + url + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    if (!isApi && /<title>\s*Just a moment/i.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：127漫画 需要网页视图过一次 Cloudflare 校验（' + url + '）');
    }
    return body;
  },

  __json(text) {
    try {
      return JSON.parse(String(text || ''));
    } catch (error) {
      return null;
    }
  },

  /// 标签属性。只认带引号的写法；`data-src` 与 `src` 靠「属性名前一个字符是空白」区分。
  __attr(tag, name) {
    var needle = name + '=';
    var at = String(tag || '').indexOf(needle);
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

  /// 从 from 起读一小段可读文本：紧挨着是子标签时先看它的 title 属性，再取内部文本。
  __readText(text, from, limit) {
    var end = Math.min(text.length, from + limit);
    var i = from;
    while (i < end && this.__isSpace(text.charCodeAt(i))) i++;
    if (i >= end) return '';
    if (text.charAt(i) === '<') {
      var tagEnd = text.indexOf('>', i);
      if (tagEnd < 0 || tagEnd > end) return '';
      var title = this.__plain(this.__attr(text.slice(i, tagEnd + 1), 'title'));
      if (title) return title;
      var textEnd = text.indexOf('<', tagEnd + 1);
      if (textEnd < 0 || textEnd > end) return '';
      return this.__plain(text.slice(tagEnd + 1, textEnd));
    }
    var stop = text.indexOf('<', i);
    if (stop < 0 || stop > end) stop = end;
    return this.__plain(text.slice(i, stop));
  },

  /// 取 `class="<name>"` 容器里的可读文本（容器里有子标签也能读到第一段）。
  __textOfClass(window, name) {
    var text = String(window || '');
    var at = text.indexOf('class="' + name);
    if (at < 0) return '';
    var open = text.indexOf('>', at);
    if (open < 0) return '';
    return this.__plain(this.__readText(text, open + 1, 240));
  },

  /// `<meta property="og:xxx" content="…">`（站点的 og 信息比页面文字干净）。
  __meta(html, property) {
    var at = html.indexOf('property="' + property + '"');
    if (at < 0) return '';
    var tagStart = html.lastIndexOf('<meta', at);
    var tagEnd = html.indexOf('>', at);
    if (tagStart < 0 || tagEnd < 0) return '';
    return this.__attr(html.slice(tagStart, tagEnd + 1), 'content');
  },

  __backgroundUrl(text) {
    var value = String(text || '');
    var at = value.indexOf('url(');
    if (at < 0) return '';
    var start = at + 4;
    var quote = value.charAt(start);
    if (quote === '"' || quote === "'") start++;
    var end = value.indexOf(quote === '"' || quote === "'" ? quote : ')', start);
    return end > start ? value.slice(start, end).trim() : '';
  },

  __titleTag(html) {
    var at = String(html || '').indexOf('<title>');
    if (at < 0) return '';
    var end = html.indexOf('</title>', at);
    return end > at ? this.__plain(html.slice(at + 7, end)) : '';
  },

  /// 查询串用的 UTF-8 百分号编码（和站点自己 encodeURIComponent 的行为一致）。
  __encode(text) {
    try {
      return encodeURIComponent(String(text == null ? '' : text));
    } catch (error) {
      return '';
    }
  },

  __endsWith(text, suffix) {
    var value = String(text == null ? '' : text);
    return value.length >= suffix.length && value.slice(value.length - suffix.length) === suffix;
  },

  __isSpace(code) {
    return code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
  },

  __cut(text, limit) {
    var value = String(text == null ? '' : text);
    return value.length > limit ? value.slice(0, limit) : value;
  },

  /// 去标签 + 解实体 + 压空白（只给展示用的少量文本调用）。
  /// 站点个别标题里塞的是数字实体（`&#40C107&#41Raikou`），一起解掉。
  __plain(text) {
    var value = String(text == null ? '' : text);
    if (value.indexOf('<') >= 0) value = value.replace(/<[^>]*>/g, ' ');
    value = value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&hellip;/g, '…').replace(/&mdash;/g, '—').replace(/&ldquo;/g, '“')
      .replace(/&rdquo;/g, '”').replace(/&middot;/g, '·')
      .replace(/&#[xX]([0-9a-fA-F]{1,6});?/g, function (all, hex) {
        var code = parseInt(hex, 16);
        return code > 0 && code < 1114112 ? String.fromCharCode(code) : all;
      })
      // 站点有把实体写残的（`&#40C107&#41`，没有分号），按浏览器的读法解到数字为止。
      .replace(/&#(\d{1,6});?/g, function (all, dec) {
        var code = Number(dec);
        return code > 0 && code < 1114112 ? String.fromCharCode(code) : all;
      });
    return value.replace(/\s+/g, ' ').trim();
  }
};
