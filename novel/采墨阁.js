// LumeSource: {"id":"caimoge8_novel","name":"采墨阁","version":"1.0.0","category":"novel","mirrors":["https://www.caimoge8.net"]}

// 站点：https://www.caimoge8.net（自建皮；utf-8；阅读免登录）
//
// **明文 http 站**：站点自己的链接全写成 http://www.caimoge8.net/…，
// 宿主网络层会把非 IP 主机的明文 http 自动升级成 https，脚本里统一按 https 拼地址、
// 并把页面里带回来的 http 绝对地址也升成 https（iOS 禁明文；测试的地址表也按 https 记）。
//
// ## 抓取口径（每条都对着**实时页面**核过，快照见 snapshots/novel_caimoge8_*.html）
//
//   分类  GET /shuku/<cat>/<page>.html（页 1 就是 /shuku/<cat>/1.html）
//         穿越 chuanyue / 言情 yanqing / 现代 dushi / 武侠 wuxia /
//         玄幻 xuanhuan / 科幻 kehuan / 网游 wangyou
//         另有 GET /sort/ 书库、GET /rank/allvisit/ 热门、GET /quanben/sort/ 全本
//         （这三个页面 recon 没有抓到快照，因此**只支持第 1 页**：翻页一律返回空，
//           不去猜一个可能 404 的分页地址）。
//   列表  `/shuku/<cat>/<N>.html` 的**分页列表**是 `div.l > ul > li`（每页 24 条）：
//         `span.s1` 分类 / `span.s2 > a[title][href=/txt/<id>.html]` 书名 /
//         `span.s3` 最新章节 / `span.s4` 作者 / `span.s5` 更新时间。
//         **这个列表没有封面**（站点只在「热门推荐」块给封面），所以列表条目 cover 为空。
//         同页 `div.l.rank`（热门推荐）是另一套 `div.item` 标记（有封面、有简介），
//         首页版块用它。
//   列表封面（只在 div.item 里）`img.lazy[src=/static/caimoge8/nocover.jpg]
//         [data-original=真图]` → **必须读 data-original**；src 是占位图，
//         按 src 取会得到一张灰底 nocover。
//   详情  GET /txt/<id>.html
//         封面 `div#fmimg > img.lazy[data-original]`（**也可能就是占位图**，那就返回空）；
//         书名 `div#info > h1`；作者 `div#info > p > a`；
//         点击/字数/状态/最新章节/最后更新在 `div#info > p` 各行里；
//         简介优先 og:description（同文但没有站点自己加的那句「…精心创作的…小说。」），
//         取不到才用 `div#intro`。
//   目录  **详情页的 dl 只是「最新章节」那 108 条**，末尾有 `点击查看全部章节目录`
//         指到 `/indexlist/<bookid>/`——全量目录在那个页面。
//         因此 chapters() 先抓 /indexlist/，抓不到（或页面上没有全量目录入口）才退回
//         详情页 dl。两处标记都是 `<a href="/read/<bookid>/<chapid>.html" rel="chapter">
//         <dd>章节名</dd></a>`（a 包 dd），且**默认最新在前**：
//         统一按章节 id 数值升序排（id 随章节顺序自增，实测第 92 章 31203451 < 第 93 章 31215139），
//         这样两个来源都直接得到阅读顺序。
//   正文  GET /read/<bookid>/<chapid>.html
//         正文 `div#content > div#booktxt > p`；**可能多页**：
//         `h1.bookname` 自带页码（形如「第1974章 澜沧市（1/2）」），
//         第 2 页起是 `/read/<bookid>/<chapid>_2.html`（导航 `<a rel="next">` 也指它）。
//         → 用 (1/2) 里的总页数循环拼接（比只看 rel=next 更稳：rel=next 在单页章节里
//           指的是下一章，会把两章粘成一章）。
//
// 站点直连 200、没有 Cloudflare 挑战；被拦时的标记路径照留（见 __get）。

var DEFAULT_BASE = 'https://www.caimoge8.net';

/// 主站地址：App 可能注入解析后的域名（自定义域名 > 选中镜像 > 第一个镜像），
/// 没有 config 时回落到脚本自己的默认地址。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var PAGE_SIZE = 24;        // 分类列表每页条数（快照实测）
var MAX_ITEMS = 120;       // 单次列表最多产出
var MAX_CHAPTERS = 2000;   // 目录最多产出多少章
var MAX_CONTENT_PAGES = 8; // 单章最多拼接几页
var CONTENT_WINDOW = 400000;

// 只有 /shuku/<cat>/ 这套带分页；书库 / 热门 / 全本三个入口 recon 没抓到快照，
// 只支持第 1 页（站点那三页的分页形状没核实，宁可不猜也不打 404 风暴）。
var CATEGORIES = [
  { id: 'shuku/chuanyue', title: '穿越' },
  { id: 'shuku/yanqing', title: '言情' },
  { id: 'shuku/dushi', title: '现代' },
  { id: 'shuku/wuxia', title: '武侠' },
  { id: 'shuku/xuanhuan', title: '玄幻' },
  { id: 'shuku/kehuan', title: '科幻' },
  { id: 'shuku/wangyou', title: '网游' },
  { id: 'sort', title: '书库' },
  { id: 'rank/allvisit', title: '热门榜' },
  { id: 'quanben/sort', title: '全本' }
];

var LumeSource = {
  id: 'caimoge8_novel',
  name: '采墨阁',
  version: '1.0.0',
  category: 'novel',
  mirrors: ['https://www.caimoge8.net'],

  // ---------------------------------------------------------------- 契约方法

  /// 分类：站点导航自己的 7 个题材 + 书库 / 热门 / 全本。
  async categories() {
    return CATEGORIES.slice(0);
  },

  /// 首页：热门推荐（div.item，带真封面）+ 人气小说榜（div.r 的 ul）+ 一个题材列表。
  async home() {
    var started = new Date().getTime();
    var boards = [];
    var html;
    try {
      html = await this.__get('/');
    } catch (error) {
      console.warn('[caimoge8] 首页失败：' + error);
      return boards;
    }
    var hot = this.__hotItems(html);
    if (hot.length) boards.push({ title: '热门推荐', moreUrl: '', items: hot.slice(0, 12) });
    var rank = this.__rankItems(html);
    if (rank.length) boards.push({ title: '人气小说榜', moreUrl: 'rank/allvisit', items: rank.slice(0, 12) });
    if (new Date().getTime() - started > 6000) {
      console.warn('[caimoge8] 首页到软截止，先返回 ' + boards.length + ' 块');
      return boards;
    }
    try {
      var payload = await this.list({ categoryId: 'shuku/chuanyue', page: 1 });
      var items = (payload && payload.items ? payload.items : []).slice(0, 12);
      if (items.length) boards.push({ title: '穿越', moreUrl: 'shuku/chuanyue', items: items });
    } catch (error) {
      console.warn('[caimoge8] 首页「穿越」失败：' + error);
    }
    return boards;
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!(page > 0)) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';

    if (keyword) {
      // 站点搜索：GET /search8a.html?searchkey=<kw>（首页表单 action 就是它）。
      var searchHtml = await this.__get('/search8a.html?searchkey=' + encodeURIComponent(keyword));
      var found = this.__listItems(searchHtml);
      return { items: found, hasMore: false };
    }

    var path;
    if (/^shuku\/[a-z0-9]+$/.test(category)) {
      path = '/' + category + '/' + page + '.html';
    } else if (category.indexOf('sort') === 0 || category.indexOf('rank/') === 0 ||
               category.indexOf('quanben/') === 0) {
      if (page > 1) {
        // 三张榜/书库页没有核实过分页形状：翻页返回空，而不是去猜一个可能 404 的地址。
        console.warn('[caimoge8] ' + category + ' 只支持第 1 页（分页形状未核实）');
        return { items: [], hasMore: false };
      }
      path = '/' + category + '/';
    } else {
      path = '/shuku/chuanyue/' + page + '.html';
    }
    var html = await this.__get(path);
    var items = this.__listItems(html);
    var hasMore = false;
    if (items.length) hasMore = this.__hasNextPage(html, page) || items.length >= PAGE_SIZE;
    return { items: items, hasMore: hasMore };
  },

  async detail(argument) {
    var id = this.__bookId(argument);
    var html = await this.__get('/txt/' + encodeURIComponent(id) + '.html');
    var title = this.__title(html);
    if (!title) {
      console.warn('[caimoge8] 详情页没认出书名：' + id + '（' + html.length + ' 字符）');
      return null;
    }
    var info = this.__detailInfo(html);
    var subtitle = info.author ? ('作者：' + info.author) : '';
    if (info.meta) subtitle = subtitle ? subtitle + ' · ' + info.meta : info.meta;
    return {
      id: id,
      title: title,
      cover: info.cover,
      subtitle: subtitle,
      description: info.description,
      extra: { author: info.author, meta: info.meta }
    };
  },

  /// 目录：全量在 /indexlist/<bookid>/（详情页自己给入口），抓不到再退回详情页 dl。
  async chapters(argument) {
    var id = this.__bookId(argument);
    var fromIndex = await this.__indexRows(id);
    if (fromIndex.length) {
      console.log('[caimoge8] 目录取自 /indexlist/' + id + '/：' + fromIndex.length + ' 章');
      return fromIndex;
    }
    var html = await this.__get('/txt/' + encodeURIComponent(id) + '.html');
    var rows = this.__detailRows(html);
    if (!rows.length) {
      throw new Error('采墨阁：详情页没认出章节目录（id=' + id + '）——站点可能改版，把运行日志发回来');
    }
    if (this.__fullIndexLink(html)) {
      console.warn('[caimoge8] /indexlist/' + id + '/ 没取到全量目录，退回详情页的 '
        + rows.length + ' 章（站点只列了最新章节）');
    }
    return rows;
  },

  /// 正文：div#content>div#booktxt 的段落；多页章节按书名的 (P/T) 拼接。
  async content(argument) {
    var id = this.__bookId(argument);
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    if (!chapterId) throw new Error('采墨阁：缺少章节号（请重新进一次目录再打开）');
    var path = '/read/' + encodeURIComponent(id) + '/' + encodeURIComponent(chapterId) + '.html';
    var html = await this.__get(path);
    var paragraphs = this.__articleText(html);
    if (!paragraphs.length) {
      throw new Error('采墨阁：正文页没认出正文（' + path + '，' + html.length
        + ' 字符）——站点可能改版，把运行日志发回来');
    }
    var text = paragraphs.join('\n\n');
    var total = this.__pageTotal(html);
    for (var page = 2; page <= total && page <= MAX_CONTENT_PAGES; page++) {
      var nextPath = '/read/' + encodeURIComponent(id) + '/' + encodeURIComponent(chapterId)
        + '_' + page + '.html';
      try {
        var more = this.__articleText(await this.__get(nextPath));
        if (!more.length) break;
        text += '\n\n' + more.join('\n\n');
      } catch (error) {
        // 后续页失败不该吞掉已抓到的正文：把失败如实写进正文里。
        text += '\n\n（第 ' + page + ' 页抓取失败：' + error + '）';
        console.warn('[caimoge8] 多页正文第 ' + page + ' 页失败：' + error);
        break;
      }
    }
    return { kind: 'text', text: text };
  },

  // ---------------------------------------------------------------- 内部工具

  __bookId(argument) {
    var id = '';
    if (argument && argument.id != null) id = String(argument.id).trim();
    var match = /\/txt\/(\d+)\.html/.exec(id);
    if (match) return match[1];
    if (!id) throw new Error('采墨阁：缺少作品 ID');
    return id;
  },

  /// 分页列表：`div.l > ul > li`，每条 5 个 span。
  ///
  /// **必须限定到分页的那一块**：分类页上还有一块「最新入库」（`#newscontent div.r > ul > li`）
  /// 用的是同一套 span.s1/s2/s3/s4/s5 标记，整页扫会把它也算进列表（实测多出 26 条）。
  /// 分页列表的定位锚是分页器 `#pagelink`：取它前面最近的 `<div class="l">` 到分页器之间。
  /// 认不出这块（榜单/书库页没快照）才回退整页扫。
  __listItems(html) {
    var pager = html.indexOf('id="pagelink"');
    var segment = html;
    if (pager > 0) {
      var start = html.lastIndexOf('<div class="l">', pager);
      if (start >= 0 && start < pager) segment = html.slice(start, pager);
    }
    var items = this.__spanRows(segment);
    if (items.length) return items;
    return this.__spanRows(html);
  },

  __spanRows(segment) {
    var items = [];
    var seen = {};
    var pattern = /<li>([\s\S]{0,1200}?)<\/li>/g;
    var match;
    while ((match = pattern.exec(segment)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var block = match[1];
      var link = /class="s2"><a href="[^"]*\/txt\/(\d+)\.html"[^>]*title="([^"]*)"/.exec(block)
        || /class="s2"><a href="[^"]*\/txt\/(\d+)\.html"[^>]*>([\s\S]{0,120}?)<\/a>/.exec(block);
      if (!link) continue;
      var id = link[1];
      if (seen[id]) continue;
      seen[id] = true;
      var author = /class="s4">([^<]{0,60})</.exec(block);
      var updated = /class="s5">([^<]{0,60})</.exec(block);
      var subtitle = this.__clean(author ? author[1] : '');
      var time = this.__clean(updated ? updated[1] : '');
      if (time) subtitle = subtitle ? subtitle + ' · ' + time : time;
      items.push({
        id: id,
        title: this.__clean(link[2]) || id,
        // 分页列表本身没有封面（封面只在热门推荐块里）：返回空串，让 App 显示占位图。
        cover: '',
        subtitle: subtitle
      });
    }
    return items;
  },

  /// 热门推荐块（首页与分类页都有）：`div.item > div.image > a > img.lazy[data-original]`
  /// + `dl > dt > span`（作者）+ `dl > dt > a`（书名）+ `dd`（简介）。
  __hotItems(html) {
    var items = [];
    var seen = {};
    var pattern = /<div class="item">([\s\S]{0,1400}?)<div class="clear">/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var block = match[1];
      var link = /<a href="[^"]*\/txt\/(\d+)\.html"[^>]*title="([^"]*)"/.exec(block);
      if (!link) continue;
      var id = link[1];
      if (seen[id]) continue;
      seen[id] = true;
      var img = /<img[^>]*>/i.exec(block);
      var author = /<dt><span>([\s\S]{0,40}?)<\/span>/.exec(block);
      var intro = /<dd>([\s\S]{0,200}?)<\/dd>/.exec(block);
      items.push({
        id: id,
        title: this.__clean(link[2]) || id,
        cover: this.__cover(img ? this.__attr(img[0], 'data-original') || this.__attr(img[0], 'src') : ''),
        subtitle: this.__clean(author ? author[1] : '') || this.__clean(intro ? intro[1] : '')
      });
    }
    return items;
  },

  /// 榜单块：`div.r > ul > li`（span.s1 分类 / span.s2 书名 / span.s5 作者）。
  __rankItems(html) {
    var items = [];
    var seen = {};
    var pattern = /<li>([\s\S]{0,900}?)<\/li>/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var block = match[1];
      var link = /class="s2"><a href="[^"]*\/txt\/(\d+)\.html"[^>]*title="([^"]*)"/.exec(block);
      if (!link) continue;
      var id = link[1];
      if (seen[id]) continue;
      seen[id] = true;
      var author = /class="s5">([^<]{0,60})</.exec(block);
      items.push({
        id: id,
        title: this.__clean(link[2]) || id,
        cover: '',
        subtitle: this.__clean(author ? author[1] : '')
      });
    }
    return items;
  },

  __title(html) {
    var match = /<div id="info">[\s\S]{0,200}?<h1>([\s\S]{0,200}?)<\/h1>/.exec(html);
    if (match && this.__clean(match[1])) return this.__clean(match[1]);
    match = /property="og:title" content="([^"]*)"/.exec(html);
    return match ? this.__clean(match[1]) : '';
  },

  __detailInfo(html) {
    var img = /<div id="fmimg">[\s\S]{0,300}?<img[^>]*>/i.exec(html);
    var cover = '';
    if (img) {
      cover = this.__attr(img[0], 'data-original') || this.__attr(img[0], 'src');
    }
    var author = /<div id="info">[\s\S]{0,300}?作者：\s*<a[^>]*>([\s\S]{0,60}?)<\/a>/.exec(html);
    var intro = /property="og:description" content="([^"]*)"/.exec(html)
      || /<div id="intro">([\s\S]{0,4000}?)<\/div>/.exec(html);
    // `p.hidden-xs` 的整行是「2122307人读过 | 989章节 | 1658 万字 | 连载」，
    // 拆出来更像元信息，而不是把整行塞进副标题。
    var metaLine = /<div id="info">[\s\S]{0,600}?<p class="hidden-xs">([^<]{0,120})<\/p>/.exec(html);
    var meta = '';
    if (metaLine) meta = metaLine[1].trim();
    else {
      var words = /字数：\s*([^<]{0,30})</.exec(html);
      var status = /状态：\s*([^<]{0,20})</.exec(html);
      meta = [this.__clean(words ? words[1] : ''), this.__clean(status ? status[1] : '')].join(' · ');
    }
    return {
      cover: this.__cover(cover),
      author: this.__clean(author ? author[1] : ''),
      meta: meta.replace(/\s*\|\s*/g, ' · '),
      description: this.__clean(intro ? intro[1] : '')
    };
  },

  /// 全量目录 `/indexlist/<bookid>/`：形状没抓到快照（详情页只给了入口），
  /// 用结构无关的宽松规则：抓所有 `/read/<bookid>/<chapid>.html` 的锚点及其文本。
  async __indexRows(id) {
    var html;
    try {
      html = await this.__get('/indexlist/' + encodeURIComponent(id) + '/');
    } catch (error) {
      console.warn('[caimoge8] /indexlist/' + id + '/ 失败：' + error);
      return [];
    }
    var pattern = new RegExp('href="/read/' + this.__escapeRegExp(id)
      + '/(\\d+)\\.html"[^>]*>([\\s\\S]{0,300}?)<\\/a>', 'g');
    var rows = [];
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (rows.length >= MAX_CHAPTERS) break;
      rows.push({ id: match[1], title: this.__clean(match[2]) || ('第 ' + match[1] + ' 章') });
    }
    return this.__ordered(rows);
  },

  /// 详情页 dl 里「最新章节」那一截（默认最新在前）。
  __detailRows(html) {
    var rows = [];
    var seen = {};
    var pattern = /<a href="\/read\/\d+\/(\d+)\.html"[^>]*rel="chapter"><dd>([\s\S]{0,200}?)<\/dd><\/a>/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (rows.length >= MAX_CHAPTERS) break;
      var id = match[1];
      if (seen[id]) continue;
      seen[id] = true;
      rows.push({ id: id, title: this.__clean(match[2]) || ('第 ' + id + ' 章') });
    }
    return this.__ordered(rows);
  },

  __fullIndexLink(html) {
    return /href="\/indexlist\/\d+\/"[^>]*rel="chapter"/.test(html);
  },

  /// 章节 id 是站点自增的，数值顺序 = 阅读顺序（实测：第 92 章 31203451 < 第 93 章 31215139）。
  /// 详情页给的是倒序，/indexlist/ 的顺序未知——统一按 id 数值升序，两个来源都对。
  __ordered(rows) {
    var seen = {};
    var unique = [];
    for (var i = 0; i < rows.length; i++) {
      if (seen[rows[i].id]) continue;
      seen[rows[i].id] = true;
      unique.push(rows[i]);
    }
    unique.sort(function (left, right) {
      return Number(left.id) - Number(right.id);
    });
    return unique;
  },

  /// 正文：`div#content > div#booktxt` 的 <p>；站点没有分页时 p 就是段落。
  __articleText(html) {
    var box = /<div id="booktxt">([\s\S]{0,300000}?)<\/div>/.exec(html);
    if (!box) return [];
    var paragraphs = [];
    var pattern = /<p[^>]*>([\s\S]*?)<\/p>/g;
    var match;
    while ((match = pattern.exec(box[1])) !== null) {
      var text = this.__cleanBlock(match[1]);
      if (text) paragraphs.push(text);
    }
    if (!paragraphs.length) {
      // 少数页面没有 <p>，正文整块是 <br/> 分行：按行切。
      var lines = this.__stripTags(box[1].replace(/<br\s*\/?>/gi, '\n')).split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = this.__cleanBlock(lines[i]);
        if (line) paragraphs.push(line);
      }
    }
    return paragraphs;
  },

  /// 多页章节的总页数：`<h1 class="bookname">第1974章 沧澜市（1/2）</h1>`。
  __pageTotal(html) {
    var match = /<h1 class="bookname">([\s\S]{0,200}?)<\/h1>/.exec(html);
    if (!match) return 1;
    var page = /[（(]\s*\d+\s*\/\s*(\d+)\s*[）)]/.exec(match[1]);
    if (!page) return 1;
    var total = parseInt(page[1], 10);
    return total > 0 && total <= 50 ? total : 1;
  },

  /// 还有下一页：分页器里有指向本分类 page+1 的链接。
  /// **不能**只看「有没有分页器」——末页的分页器也在（列着前面几页与尾页），
  /// 那样每页都会报「还有下一页」。
  __hasNextPage(html, page) {
    var segment = html.indexOf('id="pagelink"');
    if (segment < 0) return false;
    var wanted = '/' + (page + 1) + '.html"';
    return html.slice(segment).indexOf(wanted) >= 0;
  },

  __attr(tag, name) {
    var pattern = new RegExp(name + '="([^"]*)"');
    var match = pattern.exec(String(tag || ''));
    return match ? match[1] : '';
  },

  /// 动态拼正则前先转义：id 正常是数字，但 __bookId 也接受整条地址，
  /// 不转义时地址里的 `(` `.` 会把正则拼成语法错误（抛出的错还看不出原因）。
  __escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  },

  /// 封面：`nocover.jpg` 是站点的占位图（列表页 img.lazy 的 src 就是它），
  /// 真图在 data-original；data-original 也是占位时返回空串。
  __cover(value) {
    var url = String(value || '').trim();
    if (!url) return '';
    if (/nocover|nopic|default_no_thumbnail|blank|loading/i.test(url)) return '';
    return this.__absolute(url);
  },

  /// 站点是明文 http：绝对地址一律升成 https（宿主也会升级，脚本里统一口径）。
  __absolute(url) {
    var value = String(url || '').trim();
    if (!value) return '';
    if (value.indexOf('//') === 0) return 'https:' + value;
    if (/^https?:/i.test(value)) return value.replace(/^http:/i, 'https:');
    return base() + (value.charAt(0) === '/' ? '' : '/') + value;
  },

  __stripTags(text) {
    return String(text || '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&hellip;/g, '…')
      .replace(/&mdash;/g, '—');
  },

  __cleanBlock(text) {
    return this.__stripTags(text).replace(/[ \t\r\f]+/g, ' ').trim();
  },

  __clean(text) {
    return this.__stripTags(text).replace(/\s+/g, ' ').trim();
  },

  /// 所有请求的唯一出口：补全地址、发请求、被 WAF 拦下时抛固定标记。
  async __get(path) {
    var url = /^https?:/i.test(path) ? path : base() + path;
    var response = await LumeSource.http.get(url, {
      headers: { 'Referer': base() + '/' }
    });
    var status = response ? Number(response.status) : 0;
    var body = response && response.body ? String(response.body) : '';
    if (status !== 200) {
      if (status === 403 || status === 503 || status === 429) {
        throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
          + status + ' ' + url + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    if (/just a moment|checking your browser|__cf_chl|cf-chl-/.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
        + status + ' ' + url + '）');
    }
    return body;
  }
};
