// LumeSource: {"id":"czbooks_novel","name":"小說狂人","version":"1.0.0","category":"novel","mirrors":["https://czbooks.net"]}

// 站点：https://czbooks.net（繁體站；utf-8；阅读免登录）
//
// ## 抓取口径（每条都对着**实时页面**核过，快照见 snapshots/novel_czbooks_*.html）
//
//   分类  GET /c/<slug>（页 N = /c/<slug>/<N>，每页 42 条）
//         玄幻奇幻 xuanhuan / 言情 yanqing / 武俠仙俠 xianxia / 軍事歷史 lishi /
//         科幻未來 wangyou / 靈異玄幻 lingyi / 女生同人 tongren / 原創同人 erciyuan /
//         耽美 danmei / 百合 baihe / 日系 japan / 奇幻冒險 fanatsy（**站点的 slug 就是
//         这个拼写错误**，照抄才对得上）/ 電視劇 drama / 情色工口 herotic /
//         耽美工口 blerotic / 經典文學 classicbook / 推理 suspense / 女性向 girl / 短篇 short
//         榜单 精選排行 normal / 人氣榜 all / 收藏榜 favorite / 完本榜 finish / 工口榜 hot
//   列表  条目 `li.novel-item-wrapper`：
//         链接 `a[href=//czbooks.net/n/<bookkey>]`（**协议相对地址**，要补成 https）、
//         书名 `div.novel-item-title`、状态 `div.novel-item-state`（可能没有）、
//         作者 `div.novel-item-author > a`、最新章节 `div.novel-item-newest-chapter`、
//         封面 `div.novel-item-thumbnail > img[src]`——
//         **列表页有大半条目本来就是 default_no_thumbnail.jpg 占位图**，
//         返回空串让 App 用占位图，别返回这张灰图。
//   分页  `ul.nav.paginate`：当前页是 `li.active > a`，后面跟着 `2 / 3 / 4 / 5~`
//         （尾部那个 `5~` 表示还有更多页）。**精選排行 /c/normal 的分页链接指向
//         /c/normal/day/<N>**（站点自己的写法，日榜）；照它拼就对了。
//   详情  GET /n/<bookkey>（注意：**没有 www**，镜像表里只放 czbooks.net）
//         封面 `div.thumbnail > img[src]`（可能是占位图）、书名 `div.info span.title`
//         （**带《》书名号，要去掉**）、作者 `div.info span.author > a`、
//         简介 `div.description`（`<br />` 分行）、
//         状态表 `div.state > table`（連載狀態 / 收藏數 / 觀看數 / 更新時間 / 分類），
//         分类链接是 `a#novel-category`（href 指向 /c/<slug>）。
//   目录  `ul.nav.chapter-list#chapter-list`：`li.volume` 是卷名（无锚点，跳过），
//         章节 `a[href=//czbooks.net/n/<bookkey>/<chapkey>?chapterNumber=N]`。
//         **chapterNumber 就是阅读顺序**（站点自己给的下标），按它升序排；
//         章节 id 必须**带上 ?chapterNumber=**（导航链接不带它，靠它定章）。
//   正文  GET /n/<bookkey>/<chapkey>?chapterNumber=N，单页：
//         `div.content` 里用 `<br />` 分行的整块文本，导航在 `ul.chapter-nav`。
//
// ## 实测出来的两条
//
// 1. 页面里到处是 `/cdn-cgi/`（rocket-loader、email-protection）——那是 Cloudflare 的
//    前端注入，**不是人机校验**：拿 `/cdn-cgi/` 当「被拦」会把每一页都误判成校验页。
//    __get 只认挑战页的特征串。
// 2. 列表页的封面是**站点侧普遍缺图**（快照里 42 条只有 11 条有真图）：
//    这是站点数据，不是脚本问题；脚本要做的是别把占位图当真图。

var DEFAULT_BASE = 'https://czbooks.net';

/// 主站地址：App 可能注入解析后的域名（自定义域名 > 选中镜像 > 第一个镜像），
/// 没有 config 时回落到脚本自己的默认地址。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var PAGE_SIZE = 42;      // 列表每页条数（快照实测）
var MAX_ITEMS = 60;      // 单次列表最多产出
var MAX_CHAPTERS = 5000; // 目录最多产出多少章
var CONTENT_WINDOW = 600000;

// 站点导航自己给的分类（19 个题材 + 5 张榜），顺序照站点。
var CATEGORIES = [
  { id: 'xuanhuan', title: '玄幻奇幻' },
  { id: 'yanqing', title: '言情' },
  { id: 'xianxia', title: '武俠仙俠' },
  { id: 'lishi', title: '軍事歷史' },
  { id: 'wangyou', title: '科幻未來' },
  { id: 'lingyi', title: '靈異玄幻' },
  { id: 'tongren', title: '女生同人' },
  { id: 'erciyuan', title: '原創同人' },
  { id: 'danmei', title: '耽美' },
  { id: 'baihe', title: '百合' },
  { id: 'japan', title: '日系' },
  { id: 'fanatsy', title: '奇幻冒險' },
  { id: 'drama', title: '電視劇' },
  { id: 'herotic', title: '情色工口' },
  { id: 'blerotic', title: '耽美工口' },
  { id: 'classicbook', title: '經典文學' },
  { id: 'suspense', title: '推理' },
  { id: 'girl', title: '女性向' },
  { id: 'short', title: '短篇' },
  { id: 'normal', title: '精選排行' },
  { id: 'all', title: '人氣榜' },
  { id: 'favorite', title: '收藏榜' },
  { id: 'finish', title: '完本榜' },
  { id: 'hot', title: '工口榜' }
];

var LumeSource = {
  id: 'czbooks_novel',
  name: '小說狂人',
  version: '1.0.0',
  category: 'novel',
  mirrors: ['https://czbooks.net'],

  // ---------------------------------------------------------------- 契约方法

  /// 分类：站点导航自己的 19 个题材 + 5 张榜。
  async categories() {
    return CATEGORIES.slice(0);
  },

  /// 首页：站点首页的条目本来就分块（`ul.nav.novel-list` 多段），
  /// 只取「推薦 / 最新」这类标题下的第一段，其余用分类列表兜。
  async home() {
    var started = new Date().getTime();
    var boards = [];
    var html;
    try {
      html = await this.__get('/');
    } catch (error) {
      console.warn('[czbooks] 首页失败：' + error);
      return boards;
    }
    var picks = this.__homeSections(html);
    for (var i = 0; i < picks.length && boards.length < 3; i++) {
      if (new Date().getTime() - started > 6000) {
        console.warn('[czbooks] 首页到软截止，先返回 ' + boards.length + ' 块');
        break;
      }
      if (!picks[i].items.length) continue;
      boards.push({
        title: picks[i].title,
        moreUrl: picks[i].moreUrl,
        items: picks[i].items.slice(0, 12)
      });
    }
    return boards;
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!(page > 0)) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';

    if (keyword) {
      var searchHtml = await this.__get('/search?keyword=' + encodeURIComponent(keyword));
      return { items: this.__listItems(searchHtml), hasMore: false };
    }

    var slug = /^[a-z0-9]+$/.test(category) ? category : 'normal';
    var path;
    if (page <= 1) {
      path = '/c/' + slug;
    } else if (slug === 'normal') {
      // 精選排行自己的分页链接就是 /c/normal/day/<N>（站点写法，指到日榜），照它拼。
      path = '/c/normal/day/' + page;
    } else {
      path = '/c/' + slug + '/' + page;
    }
    var html = await this.__get(path);
    var items = this.__listItems(html);
    return { items: items, hasMore: this.__hasNextPage(html, page) };
  },

  async detail(argument) {
    var path = this.__bookPath(argument);
    var html = await this.__get(path);
    var title = this.__title(html);
    if (!title) {
      console.warn('[czbooks] 详情页没认出书名：' + path + '（' + html.length + ' 字符）');
      return null;
    }
    var info = this.__detailInfo(html);
    var subtitle = info.author ? ('作者：' + info.author) : '';
    if (info.state) subtitle = subtitle ? subtitle + ' · ' + info.state : info.state;
    if (info.category && info.category !== info.state) {
      subtitle = subtitle ? subtitle + ' · ' + info.category : info.category;
    }
    return {
      id: path,
      title: title,
      cover: info.cover,
      subtitle: subtitle,
      description: info.description,
      extra: { author: info.author, state: info.state, category: info.category }
    };
  },

  /// 目录：`ul.nav.chapter-list#chapter-list` 的章节锚点（带 ?chapterNumber=），
  /// 按 chapterNumber 升序（站点自己给的下标就是阅读顺序）。
  async chapters(argument) {
    var path = this.__bookPath(argument);
    var html = await this.__get(path);
    var key = this.__bookKey(path);
    if (!key) throw new Error('czbooks：作品地址认不出 bookkey（' + path + '）');
    var pattern = new RegExp(
      'href="(?:https?:)?\\/\\/czbooks\\.net/n/' + key + '/([A-Za-z0-9]+)\\?chapterNumber=(\\d+)"[^>]*>([\\s\\S]{0,200}?)<\\/a>',
      'g'
    );
    var rows = [];
    var seen = {};
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (rows.length >= MAX_CHAPTERS) break;
      var number = Number(match[2]);
      var id = '/n/' + key + '/' + match[1] + '?chapterNumber=' + match[2];
      if (seen[id]) continue;
      seen[id] = true;
      rows.push({ number: number, id: id, title: this.__clean(match[3]) });
    }
    if (!rows.length) {
      throw new Error('czbooks：详情页没认出章节目录（' + path + '）——站点可能改版，把运行日志发回来');
    }
    rows.sort(function (left, right) {
      return left.number - right.number;
    });
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      result.push({
        id: rows[i].id,
        title: rows[i].title || ('第 ' + (rows[i].number + 1) + ' 頁')
      });
    }
    return result;
  },

  /// 正文：`div.content` 的 <br /> 分行文本（单页，站内不分页）。
  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    if (!chapterId) throw new Error('czbooks：缺少章节地址（请重新进一次目录再打开）');
    var path = this.__chapterPath(chapterId);
    var html = await this.__get(path);
    var start = html.search(/<div class = "content">|<div class="content">/);
    if (start < 0) {
      throw new Error('czbooks：正文页没认出正文容器（' + path + '，' + html.length
        + ' 字符）——站点可能改版，把运行日志发回来');
    }
    var segment = html.slice(start, start + CONTENT_WINDOW);
    var end = segment.indexOf('</div>');
    if (end > 0) segment = segment.slice(0, end);
    var lines = this.__stripTags(segment.replace(/<br\s*\/?>/gi, '\n')).split('\n');
    var paragraphs = [];
    for (var i = 0; i < lines.length; i++) {
      var text = this.__cleanBlock(lines[i]);
      if (text) paragraphs.push(text);
    }
    if (!paragraphs.length) {
      throw new Error('czbooks：正文是空的（' + path + '）——可能需要登录，或站点改版');
    }
    return { kind: 'text', text: paragraphs.join('\n\n') };
  },

  // ---------------------------------------------------------------- 内部工具

  /// 作品地址：列表里给的是 `//czbooks.net/n/<key>`，统一成站内相对路径 `/n/<key>`。
  __bookPath(argument) {
    var raw = '';
    if (argument && argument.id != null) raw = String(argument.id).trim();
    if (!raw) throw new Error('czbooks：缺少作品地址');
    var match = /\/n\/([A-Za-z0-9]+)/.exec(raw);
    if (!match) throw new Error('czbooks：作品地址认不出 bookkey（' + raw + '）');
    return '/n/' + match[1];
  },

  __bookKey(path) {
    var match = /\/n\/([A-Za-z0-9]+)/.exec(String(path || ''));
    return match ? match[1] : '';
  },

  /// 章节地址：id 是 `/n/<key>/<chapkey>?chapterNumber=N`（可能被塞进整条 URL）。
  __chapterPath(chapterId) {
    var match = /\/n\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)(\?[^"'\s]*)?/.exec(chapterId);
    if (!match) throw new Error('czbooks：章节地址认不出（' + chapterId + '）');
    return '/n/' + match[1] + '/' + match[2] + (match[3] || '');
  },

  /// 列表条目：按 `li.novel-item-wrapper` 整块切开。
  __listItems(html) {
    var items = [];
    var seen = {};
    var parts = html.split('novel-item-wrapper');
    for (var i = 1; i < parts.length && items.length < MAX_ITEMS; i++) {
      var block = parts[i].slice(0, 2000);
      var link = /<a href = "(?:https?:)?\/\/czbooks\.net\/n\/([A-Za-z0-9]+)"/.exec(block);
      if (!link) continue;
      var key = link[1];
      if (seen[key]) continue;
      seen[key] = true;
      var title = /novel-item-title">\s*([\s\S]{0,120}?)\s*<\/div>/.exec(block);
      var state = /novel-item-state">([\s\S]{0,40}?)<\/div>/.exec(block);
      var author = /novel-item-author">\s*作者:\s*<a[^>]*>([\s\S]{0,40}?)<\/a>/.exec(block);
      var img = /<img[^>]*src="([^"]+)"/.exec(block);
      var subtitle = this.__clean(author ? author[1] : '');
      var status = this.__clean(state ? state[1] : '');
      if (status) subtitle = subtitle ? subtitle + ' · ' + status : status;
      items.push({
        id: '/n/' + key,
        title: this.__clean(title ? title[1] : '') || key,
        cover: this.__cover(img ? img[1] : ''),
        subtitle: subtitle
      });
    }
    return items;
  },

  __title(html) {
    var match = /<span class = "title">([\s\S]{0,200}?)<\/span>/.exec(html);
    if (match && this.__clean(match[1])) {
      // 站点把书名写成《书名》，去掉书名号（App 会自己加展示样式）。
      return this.__clean(match[1]).replace(/^《/, '').replace(/》$/, '');
    }
    match = /<div class = "name">《([\s\S]{0,120}?)》/.exec(html);
    return match ? this.__clean(match[1]) : '';
  },

  __detailInfo(html) {
    var img = /<div class = "thumbnail">[\s\S]{0,600}?<img[^>]*src="([^"]+)"/.exec(html);
    var author = /<span class = "author">\s*作者:\s*<a[^>]*>([\s\S]{0,40}?)<\/a>/.exec(html);
    var desc = /<div class = "description">([\s\S]{0,6000}?)<\/div>/.exec(html);
    var category = /id="novel-category"[^>]*>([\s\S]{0,40}?)<\/a>/.exec(html);
    var state = /<td>連載狀態<\/td>\s*<td>([\s\S]{0,40}?)<\/td>/.exec(html);
    var description = '';
    if (desc) {
      var lines = this.__stripTags(desc[1].replace(/<br\s*\/?>/gi, '\n')).split('\n');
      var kept = [];
      for (var i = 0; i < lines.length; i++) {
        var line = this.__cleanBlock(lines[i]);
        if (line) kept.push(line);
      }
      description = kept.join('\n');
    }
    return {
      cover: this.__cover(img ? img[1] : ''),
      author: this.__clean(author ? author[1] : ''),
      category: this.__clean(category ? category[1] : ''),
      state: this.__clean(state ? state[1] : ''),
      description: description
    };
  },

  /// 首页版块：首页用的是 `<li class = "novel-list-title">标题 <a class="more" …>(更多排行)</a></li>`
  /// （**没有 h2**，别按标题标签找），随后同一段 `ul.novel-list` 里就是该榜的条目。
  __homeSections(html) {
    var sections = [];
    var pattern = /<li class = "novel-list-title">([\s\S]{0,300}?)<\/li>/g;
    var match;
    while ((match = pattern.exec(html)) !== null && sections.length < 3) {
      var block = match[1];
      var more = /<a class="more" href[ ]*=[ ]*"(?:https?:)?\/\/czbooks\.net\/c\/([a-z0-9]+)"/.exec(block);
      var title = this.__clean(block.replace(/<a[\s\S]*?<\/a>/g, ''));
      var start = match.index + match[0].length;
      var rest = html.slice(start, start + 140000);
      // 切到**下一个版块的开头**为止。不能切到第一个 </ul>：条目内部自带
      // `<ul class="nav">`（收藏数 / 观看数），第一个 </ul> 是条目自己的，切早了只剩 1 条。
      var cut = rest.indexOf('<ul class = "novel-list');
      if (cut < 0) cut = rest.indexOf('novel-list-title');
      var segment = cut > 0 ? rest.slice(0, cut) : rest;
      var items = this.__listItems(segment);
      if (!items.length) continue;
      sections.push({ title: title, moreUrl: more ? more[1] : '', items: items });
    }
    return sections;
  },

  /// 还有下一页：分页器里有页码 = page+1 的链接，或有 `page~`（「还有更多」）。
  /// 末页的分页器仍然在（列着前面几页），所以不能只看「有没有分页器」。
  __hasNextPage(html, page) {
    var start = html.indexOf('nav paginate');
    if (start < 0) return false;
    var segment = html.slice(start, start + 20000);
    var next = new RegExp('>' + (page + 1) + '<');
    var more = new RegExp('>' + page + '~<');
    return next.test(segment) || more.test(segment);
  },

  /// 封面：`default_no_thumbnail.jpg`（列表页 img 的 onerror 兜底图）等占位一律空串——
  /// 返回它 App 会显示一张灰底假封面。
  __cover(value) {
    var url = String(value || '').trim();
    if (!url) return '';
    if (/default_no_thumbnail|images\/blank|nocover|nopic|loading/i.test(url)) return '';
    return this.__absolute(url);
  },

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
    // 只认**挑战页**特征：站点每页都内联着 /cdn-cgi/ 的 rocket-loader 与邮箱混淆，
    // 拿 /cdn-cgi/ 当判据会把每一页都误判成被拦（实测整站误报）。
    if (/just a moment|checking your browser|__cf_chl|cf-chl-/.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
        + status + ' ' + url + '）');
    }
    return body;
  }
};
