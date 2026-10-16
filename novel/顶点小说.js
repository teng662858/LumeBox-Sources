// LumeSource: {"id":"dingdian666_novel","name":"顶点小说","version":"1.0.0","category":"novel","mirrors":["https://m.dingdian666.com"]}

// 站点：https://m.dingdian666.com（杰奇 JIEQI 的 WAP 皮；utf-8；阅读免登录）
//
// ## 抓取口径（每条都对着**实时页面**核过，快照见 snapshots/novel_dingdian666_*.html）
//
//   分类  GET /sort/<catid>_<page>/（页 2 = /sort/1_2/）
//         1 玄幻魔法 2 仙侠修真 3 都市言情 4 网游动漫
//         5 科幻小说 6 恐怖灵异 7 历史军事 8 其他类型
//         另有 GET /top/ 排行、GET /full/ 全本（同一套 ul.sort 标记）。
//   列表  单页 50 条：`ul.sort > li.sort_one`（前 3 条：封面 + 书名 + 作者 + 简介）
//         与 `li.sort_two`（其余：只有书名 + 作者，**没有封面**）。
//         封面 `a.tu > img[src=/files/article/image/<a>/<b>/<id>s.jpg]`；
//         书名 `a.name[href=/ebooks/<数字id>/]`；作者 `a.zuo`；简介 `a.intro`。
//   详情  GET /ebooks/<id>/
//         封面 `a.p1 > img[src]`（**onerror 兜到 /files/article/image/000.jpg**）——
//         兜底图是 1x1 占位，直接当空封面；书名 `h1`；
//         `ul.p2 > li`：作者 / 类型 / 状态 / 更新（站点的 li 标签误写成 </dt>，别当结构）；
//         简介 `p.jianjie`（og:description 同文）。
//   目录  就在详情页里，但**分页**：`h2.mulu` 之后的 ul.sort，每页 15 章，
//         下一页 = `/ebooks/<id>_<page>/`（页 1 就是详情页自己）。
//         站点自己给了总页数（`(第1/282页)`），长书能到 282 页——
//         沙箱单次调用只有 ~10 秒 / 256 次宿主调用，**不可能全抓**：
//         这里按批次并发抓，到时间预算或页数上限就带已抓到的先返回（见 chapters()）。
//   正文  GET /zhangjie/<bookid>/<chapid>.html
//         **可能多页**：下一页 = `/zhangjie/<bookid>/<chapid>/<N>.html`；
//         正文在 `div#neirong` 里，与站点自己的阅读器部件（h1 / 字号按钮 / 报错浮层 /
//         上下页条）混在同一个容器中——必须先把这些部件剔掉再取 <br/> 分行的正文。
//
// ## 实测出来的三条
//
// 1. **详情页的 `<li>…</dt>` 是站点自己的标签错误**（MVC 模板漏改），
//    按 `<li>` 切分才对；按 DOM 合法性去解析会少一截作者/类型信息。
// 2. **列表页没有分页器**（整页只有 ul.sort）：只能按「一页满 50 条 ⇒ 可能还有下一页」
//    推断 hasMore。详情页的目录**有**分页器，两处不是一回事。
// 3. **目录里的章节名带序号前缀**（`1.第1章 八百年后`）：前缀是目录位置，不是标题的一部分，
//    展示时剥掉；`title` 属性与锚点文本同值，取其一即可。
//
// 站点直连 200、没有 Cloudflare 挑战；被拦时的标记路径照留（见 __get）。

var DEFAULT_BASE = 'https://m.dingdian666.com';

/// 主站地址：App 可能注入解析后的域名（自定义域名 > 选中镜像 > 第一个镜像），
/// 没有 config 时回落到脚本自己的默认地址。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var PAGE_SIZE = 50;        // 列表每页条数（快照实测：3 条带封面 + 47 条纯文字）
var MAX_ITEMS = 120;       // 单次列表最多产出
var MAX_INDEX_PAGES = 24;  // 目录最多抓多少页（每页 15 章 ⇒ 约 360 章）
var INDEX_BATCH = 4;       // 目录每批并发页数（宿主按域名限流，批 4 不轰炸站点）
var INDEX_BUDGET_MS = 4500;// 目录抓取的软截止
var MAX_CHAPTERS = 900;    // 目录最多产出多少章
var MAX_CONTENT_PAGES = 6; // 单章最多拼接几页（站点正文一般 1–3 页）
var CONTENT_WINDOW = 400000; // 正文块窗口上限

var LumeSource = {
  id: 'dingdian666_novel',
  name: '顶点小说',
  version: '1.0.0',
  category: 'novel',
  mirrors: ['https://m.dingdian666.com'],

  // ---------------------------------------------------------------- 契约方法

  /// 分类：8 个分类 + 排行 / 全本（站点导航里就这 4 个入口：首页 / 分类 / 排行 / 全本）。
  async categories() {
    return [
      { id: 'sort/1', title: '玄幻魔法' },
      { id: 'sort/2', title: '仙侠修真' },
      { id: 'sort/3', title: '都市言情' },
      { id: 'sort/4', title: '网游动漫' },
      { id: 'sort/5', title: '科幻小说' },
      { id: 'sort/6', title: '恐怖灵异' },
      { id: 'sort/7', title: '历史军事' },
      { id: 'sort/8', title: '其他类型' },
      { id: 'top', title: '排行榜' },
      { id: 'full', title: '全本小说' }
    ];
  },

  /// 首页：本站强推（首页自己的 ul.list6） + 首页上第一个分类版块（按站点自己的顺序挑）。
  ///
  /// 逐块 try/catch + 软截止：沙箱单次调用是 3–10 秒墙钟，首页串行抓多块很容易顶上限，
  /// 到点就把已拿到的先返回——有几块是几块，好过整页空白。
  async home() {
    var started = new Date().getTime();
    var boards = [];
    var html;
    try {
      html = await this.__get('/');
    } catch (error) {
      console.warn('[dingdian666] 首页失败：' + error);
      return boards;
    }
    var starred = this.__starred(html);
    if (starred.length) {
      boards.push({ title: '本站强推', moreUrl: 'sort/1', items: starred });
    }
    var category = this.__firstHomeCategory(html);
    if (!category) return boards;
    if (new Date().getTime() - started > 6000) {
      console.warn('[dingdian666] 首页到软截止，先返回 ' + boards.length + ' 块');
      return boards;
    }
    try {
      var payload = await this.list({ categoryId: category.id, page: 1 });
      var items = (payload && payload.items ? payload.items : []).slice(0, 12);
      if (items.length) {
        boards.push({ title: category.title, moreUrl: category.id, items: items });
      }
    } catch (error) {
      console.warn('[dingdian666] 首页「' + category.title + '」失败：' + error);
    }
    return boards;
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!(page > 0)) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';

    if (keyword) {
      // 站点自己的搜索是 POST /waps.php（表单字段 s）。**没有快照可核**（recon 没抓到搜索页），
      // 因此这里按表单原样 POST、结果页按同一套 ul.sort 解析；真跑不通时报错里带 URL。
      var body = 's=' + encodeURIComponent(keyword);
      var reply = await LumeSource.http.post(base() + '/waps.php', body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      var searchHtml = this.__body(reply);
      return { items: this.__listItems(searchHtml), hasMore: false };
    }

    var path = '/sort/1_1/';
    if (category === 'top') {
      path = '/top/';
    } else if (category === 'full') {
      path = '/full/';
    } else if (/^sort\/[0-9]+$/.test(category)) {
      var catid = category.slice(5);
      // 站点自己就用 /sort/<catid>_<page>/ 表达页码（页 1 是 _1 而不是省略）。
      path = '/sort/' + catid + '_' + page + '/';
    }
    var html = await this.__get(path);
    var items = this.__listItems(html);
    return { items: items, hasMore: items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = this.__bookId(argument);
    var html = await this.__get('/ebooks/' + encodeURIComponent(id) + '/');
    var title = this.__title(html);
    if (!title) {
      console.warn('[dingdian666] 详情页没认出书名：' + id + '（' + html.length + ' 字符）');
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

  /// 目录：详情页是第一页，后续页 `/ebooks/<id>_<N>/` 批量并发抓。
  ///
  /// 站点把目录切到 282 页（每页 15 章）也不新鲜，全抓必然超时；
  /// 到 INDEX_BUDGET_MS 或 MAX_INDEX_PAGES 就停，并把「只取到多少章」打进日志
  /// （用户在「设置 → 运行日志」能看到，比静默少一截要好）。
  async chapters(argument) {
    var id = this.__bookId(argument);
    var first = await this.__get('/ebooks/' + encodeURIComponent(id) + '/');
    var rows = this.__indexRows(first);
    var seen = {};
    for (var k = 0; k < rows.length; k++) seen[rows[k].id] = true;

    var pages = this.__indexPageCount(first);
    if (pages > MAX_INDEX_PAGES) pages = MAX_INDEX_PAGES;
    var started = new Date().getTime();
    var stopped = '';
    for (var page = 2; page <= pages; page += INDEX_BATCH) {
      var batch = [];
      var numbers = [];
      for (var i = page; i < page + INDEX_BATCH && i <= pages; i++) {
        batch.push(this.__indexPage(id, i));
        numbers.push(i);
      }
      var results = await Promise.all(batch);
      var fresh = 0;
      for (var b = 0; b < results.length; b++) {
        if (!results[b]) continue;  // 单页失败只当空页，不废掉整本目录
        for (var f = 0; f < results[b].length; f++) {
          var row = results[b][f];
          if (seen[row.id]) continue;
          seen[row.id] = true;
          rows.push(row);
          fresh++;
        }
      }
      if (!fresh) {
        stopped = '第 ' + numbers[0] + ' 页起没有新章节（目录到此为止）';
        break;
      }
      if (rows.length >= MAX_CHAPTERS) {
        stopped = '已到章节上限 ' + MAX_CHAPTERS;
        break;
      }
      if (new Date().getTime() - started > INDEX_BUDGET_MS) {
        stopped = '到时间预算 ' + INDEX_BUDGET_MS + 'ms';
        break;
      }
    }
    if (stopped) {
      console.warn('[dingdian666] 目录未取全（' + stopped + '）：本次只取到 ' + rows.length
        + ' 章（站点目录共 ' + this.__indexPageCount(first) + ' 页）');
    }
    if (!rows.length) {
      throw new Error('顶点小说：详情页没认出章节目录（id=' + id + '）——站点可能改版，把运行日志发回来');
    }
    return rows;
  },

  /// 正文：`#neirong` 里剔除阅读器部件后按 <br/> 分行的正文；多页章节顺「下一页」拼接。
  async content(argument) {
    var id = this.__bookId(argument);
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    if (!chapterId) throw new Error('顶点小说：缺少章节号（请重新进一次目录再打开）');

    var path = '/zhangjie/' + encodeURIComponent(id) + '/' + encodeURIComponent(chapterId) + '.html';
    var html = await this.__get(path);
    var paragraphs = this.__articleText(html);
    if (!paragraphs.length) {
      throw new Error('顶点小说：正文页没认出正文（' + path + '，' + html.length
        + ' 字符）——站点可能改版，把运行日志发回来');
    }
    var text = paragraphs.join('\n\n');
    var done = 1;
    var next = this.__nextPage(html);
    while (next && done < MAX_CONTENT_PAGES) {
      try {
        var more = await this.__get(next);
        var lines = this.__articleText(more);
        if (!lines.length) break;
        text += '\n\n' + lines.join('\n\n');
        next = this.__nextPage(more);
        done++;
      } catch (error) {
        // 后续页失败不该把整章内容吞掉：把失败如实写进正文，用户能看出来。
        text += '\n\n（第 ' + (done + 1) + ' 页抓取失败：' + error + '）';
        console.warn('[dingdian666] 多页正文第 ' + (done + 1) + ' 页失败：' + error);
        next = '';
      }
    }
    if (next) console.warn('[dingdian666] 章节超过 ' + MAX_CONTENT_PAGES + ' 页，只拼了前 ' + done + ' 页');
    return { kind: 'text', text: text };
  },

  // ---------------------------------------------------------------- 内部工具

  __bookId(argument) {
    var id = '';
    if (argument && argument.id != null) id = String(argument.id).trim();
    // 容忍传进来的整条地址（列表条目 id 是纯数字，但用户手填/旧数据可能是路径）。
    var match = /\/ebooks\/(\d+)/.exec(id);
    if (match) return match[1];
    if (!id) throw new Error('顶点小说：缺少作品 ID');
    return id;
  },

  /// 列表条目：按 li.sort_one / li.sort_two 整块切开再解析块内元素——
  /// 用「锚点 + 向后看 N 字符」的窗口法会把上一条的封面算到下一条头上。
  /// /top/ 与 /full/ 的标记没见过快照（recon 没抓），回退到「全页找 a.name」的宽松规则。
  __listItems(html) {
    var items = [];
    var seen = {};
    var pattern = /<li class="sort_(one|two)"[^>]*>([\s\S]{0,1500}?)<\/li>/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var item = this.__itemFromBlock(match[2]);
      if (!item || seen[item.id]) continue;
      seen[item.id] = true;
      items.push(item);
    }
    if (items.length) return items;
    var loose = /<a class="name" href="\/ebooks\/(\d+)\/"[^>]*>([\s\S]{0,200}?)<\/a>/g;
    while ((match = loose.exec(html)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var id = match[1];
      if (seen[id]) continue;
      seen[id] = true;
      // 封面可能在本条之前（a.tu 在 a.name 前面），窗口只往回看一小段避免串条。
      var from = match.index - 300;
      var before = html.slice(from > 0 ? from : 0, match.index);
      var cover = /<img[^>]*src="([^"]+)"/.exec(before.slice(before.lastIndexOf('<li')));
      items.push({
        id: id,
        title: this.__clean(match[2]) || id,
        cover: this.__cover(cover ? cover[1] : ''),
        subtitle: ''
      });
    }
    return items;
  },

  __itemFromBlock(block) {
    var link = /<a class="name" href="\/ebooks\/(\d+)\/"[^>]*>([\s\S]{0,200}?)<\/a>/.exec(block);
    if (!link) return null;
    var cover = /<img[^>]*src="([^"]+)"/.exec(block);
    var author = /<a class="zuo"[^>]*>([\s\S]{0,80}?)<\/a>/.exec(block);
    var intro = /<a class="intro"[^>]*>([\s\S]{0,300}?)<\/a>/.exec(block);
    var subtitle = this.__clean(author ? author[1] : '');
    var summary = this.__clean(intro ? intro[1] : '');
    if (summary && subtitle) subtitle += ' · ' + summary;
    return {
      id: link[1],
      title: this.__clean(link[2]) || link[1],
      cover: this.__cover(cover ? cover[1] : ''),
      subtitle: subtitle
    };
  },

  __title(html) {
    var match = /<h1>([\s\S]{0,200}?)<\/h1>/.exec(html);
    if (match && this.__clean(match[1])) return this.__clean(match[1]);
    match = /property="og:title" content="([^"]*)"/.exec(html);
    return match ? this.__clean(match[1]) : '';
  },

  __detailInfo(html) {
    var coverMatch = /<a class="p1"[^>]*>\s*<img[^>]*src="([^"]+)"/.exec(html);
    var author = /<li>\s*作者：([\s\S]{0,60}?)[<&]/.exec(html);
    var kind = /<li>\s*类型：([\s\S]{0,60}?)[<&]/.exec(html);
    var status = /<li>\s*状态：([\s\S]{0,60}?)[<&]/.exec(html);
    var update = /<li>\s*更新：([\s\S]{0,60}?)[<&]/.exec(html);
    var intro = /<p class="jianjie">([\s\S]{0,3000}?)<\/p>/.exec(html)
      || /property="og:description" content="([^"]*)"/.exec(html);
    var meta = [];
    var k = this.__clean(kind ? kind[1] : '');
    var s = this.__clean(status ? status[1] : '');
    var u = this.__clean(update ? update[1] : '');
    if (k) meta.push(k);
    if (s) meta.push(s);
    if (u) meta.push('更新 ' + u);
    return {
      cover: this.__cover(coverMatch ? coverMatch[1] : ''),
      author: this.__clean(author ? author[1] : ''),
      meta: meta.join(' · '),
      description: this.__clean(intro ? intro[1] : '')
    };
  },

  /// 目录块：`h2.mulu`（文章目录）之后的 ul.sort。**不能**直接全页扫 a.zhangjie——
  /// 「最新三章」版块用的是同一套 `ul.sort > li.sort_two > a.zhangjie` 标记，
  /// 先到先得会把最新 3 章当成第 1–3 章塞到目录开头。
  __indexRows(html) {
    var start = html.search(/<h2 class="mulu">/);
    var segment = start >= 0 ? html.slice(start) : html;
    var end = segment.indexOf('</ul>');
    if (end >= 0) segment = segment.slice(0, end);
    return this.__chapterRows(segment);
  },

  __chapterRows(segment) {
    var rows = [];
    var seen = {};
    var pattern = /<a class="zhangjie" href="\/zhangjie\/\d+\/(\d+)\.html"[^>]*>([\s\S]{0,200}?)<\/a>/g;
    var match;
    while ((match = pattern.exec(segment)) !== null) {
      if (rows.length >= MAX_CHAPTERS) break;
      var id = match[1];
      if (seen[id]) continue;
      seen[id] = true;
      var title = this.__clean(match[2]);
      // 目录里的 `1.第1章 …`：前缀是目录序号，剥掉更像书名号里的样子。
      var stripped = title.replace(/^\s*\d+\.\s*/, '');
      rows.push({ id: id, title: stripped || title || ('第 ' + id + ' 章') });
    }
    return rows;
  },

  /// 站点自己在详情页写了总页数（`(第1/282页)`）；认不出就按 1 页处理。
  __indexPageCount(html) {
    var match = /\(第\s*(\d+)\s*\/\s*(\d+)\s*页\)/.exec(html);
    if (!match) return 1;
    var total = parseInt(match[2], 10);
    return total > 0 ? total : 1;
  },

  async __indexPage(id, page) {
    try {
      var html = await this.__get('/ebooks/' + encodeURIComponent(id) + '_' + page + '/');
      return this.__indexRows(html);
    } catch (error) {
      console.warn('[dingdian666] 目录第 ' + page + ' 页失败：' + error);
      return null;
    }
  },

  /// 正文：`#neirong` 段（到 footer 为止，遇到报错浮层就截断），
  /// 先剔站点自己的部件（字号按钮 / 章名 / 报错链接 / 上下页条 / 脚本），
  /// 再把 <br/> 换成换行。**部件不剔就会混进正文**（实测：不剔会读成
  /// 「夜间模式：关 护眼：关 字号：中 1.第1章 八百年后 章节报错（免登陆）…」）。
  __articleText(html) {
    var start = html.indexOf('id="neirong"');
    if (start < 0) return [];
    var end = html.indexOf('<div class="footer"', start);
    if (end < 0) end = Math.min(html.length, start + CONTENT_WINDOW);
    var segment = html.slice(start, end);
    var modal = segment.indexOf('zhezhao');
    if (modal >= 0) segment = segment.slice(0, modal);
    segment = segment
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<div class="gongneng">[\s\S]*?<\/div>/g, '')
      .replace(/<h1[\s\S]*?<\/h1>/g, '')
      .replace(/<div class="baocuo">[\s\S]*?<\/div>/g, '')
      // 上下页条：`<div … class="fanye1"><ul>…</ul></div>`（没有嵌套 div，锚到 </ul> 就够）
      .replace(/<div[^>]*class="fanye1"[^>]*>[\s\S]*?<\/ul>\s*<\/div>/g, '')
      .replace(/<\/div>/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n');
    var lines = this.__stripTags(segment).split('\n');
    var paragraphs = [];
    for (var i = 0; i < lines.length; i++) {
      var text = this.__cleanBlock(lines[i]);
      if (!text) continue;
      // 站点在正文顶部插的推广行（也出现在章节页 <title> 里）。
      if (text.indexOf('dingdian666.com') >= 0) continue;
      paragraphs.push(text);
    }
    return paragraphs;
  },

  /// 下一节链接：`<a href='/zhangjie/<bookid>/<chapid>/<N>.html'>下一页</a>`
  /// （站点这里用的是单引号，双引号写法也认）。
  /// 只在分页条里认这个形状（正文里出现「下一页」三个字的概率极低，但仍要求 href 对形状）。
  __nextPage(html) {
    var match = /<a[^>]*href=["'](\/zhangjie\/\d+\/\d+\/\d+\.html)["'][^>]*>\s*下一页\s*<\/a>/.exec(html);
    return match ? match[1] : '';
  },

  /// 首页「本站强推」（ul.list6：封面 + <strong> 书名）。
  __starred(html) {
    var items = [];
    var seen = {};
    var start = html.indexOf('<ul class="list6">');
    if (start < 0) return items;
    var end = html.indexOf('</ul>', start);
    var segment = html.slice(start, end > 0 ? end : start + 4000);
    var pattern = /<li>[\s\S]{0,800}?<a href="\/ebooks\/(\d+)\/"[^>]*>([\s\S]{0,900}?)<\/li>/g;
    var match;
    while ((match = pattern.exec(segment)) !== null && items.length < 12) {
      var id = match[1];
      if (seen[id]) continue;
      seen[id] = true;
      var inner = match[2];
      var cover = /<img[^>]*src="([^"]+)"/.exec(inner);
      var title = /<strong>([\s\S]{0,80}?)<\/strong>/.exec(inner);
      items.push({
        id: id,
        title: this.__clean(title ? title[1] : '') || id,
        cover: this.__cover(cover ? cover[1] : ''),
        subtitle: ''
      });
    }
    return items;
  },

  /// 首页上第一个分类版块（`<h2>玄幻小说</h2><ul class="sort">`）→ 分类 id。
  __firstHomeCategory(html) {
    var pattern = /<h2>([^<]{1,20})<\/h2>\s*<ul class="sort">/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var name = this.__clean(match[1]);
      var id = this.__categoryIdOf(name);
      if (id) return { id: id, title: name };
    }
    return null;
  },

  __categoryIdOf(name) {
    var map = {
      '玄幻魔法小说': 'sort/1', '玄幻小说': 'sort/1', '仙侠修真': 'sort/2', '都市言情': 'sort/3',
      '网游动漫': 'sort/4', '科幻小说': 'sort/5', '灵异小说': 'sort/6', '恐怖灵异': 'sort/6',
      '历史军事': 'sort/7', '其他类型': 'sort/8'
    };
    return map[name] || '';
  },

  /// 封面：站点自己用 /files/article/image/000.jpg 兜 onerror，那是 1x1 占位；
  /// 没有真封面时返回空串，让 App 显示占位图（返回坏地址只会显示裂图）。
  __cover(value) {
    var url = String(value || '').trim();
    if (!url) return '';
    if (/\/files\/article\/image\/000\.jpg/i.test(url)) return '';
    if (/nopic|nocover|default_no_thumbnail|blank|loading/i.test(url)) return '';
    return this.__absolute(url);
  },

  /// 所有站内地址都相对主站补全；站点偶尔给 https 的绝对地址（og:image）原样用。
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
      .replace(/&ensp;/g, ' ')
      .replace(/&hellip;/g, '…')
      .replace(/&mdash;/g, '—');
  },

  /// 单段正文：只揉平空白，段落结构交给调用方（<br/> 已经变成换行）。
  __cleanBlock(text) {
    return this.__stripTags(text).replace(/[ \t\r\f]+/g, ' ').trim();
  },

  __clean(text) {
    return this.__stripTags(text).replace(/\s+/g, ' ').trim();
  },

  __body(response) {
    var status = response ? Number(response.status) : 0;
    var body = response && response.body ? String(response.body) : '';
    if (status !== 200) {
      if (status === 403 || status === 503 || status === 429) {
        throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP ' + status + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + '（' + base() + '/waps.php）');
    }
    return body;
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
