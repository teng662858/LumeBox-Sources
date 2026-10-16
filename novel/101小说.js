// LumeSource: {"id":"101minc_novel","name":"101小说","version":"1.0.0","category":"novel","mirrors":["https://www.101minc.com","https://sg.101minc.com","https://tw.101minc.com"]}

// 站点：https://www.101minc.com（杰奇定制皮；utf-8；阅读免登录；无 CF）
// 镜像：站内语言子域 sg / tw / hk（同一套路径），镜像表里放 www / sg / tw 三个。
//
// ## 抓取口径（每条都对着**实时页面**核过，快照见 snapshots/novel_101minc_*.html）
//
//   分类  GET /novelsort_<catid>_<page>.html（页 2 = /novelsort_1_2.html）
//         1 玄幻 2 仙侠 3 都市 4 军事 5 网游 6 科幻 7 悬疑 8 女生 9 其他
//         榜单 排行 /noveltop_allvisit_1.html、最新 /noveltop_lastupdate_1.html、
//              热门 /noveltop_allvote_1.html、完本 /novelfull_1.html、全部 /gengxin.html
//   列表  条目在 `ul#article_list_content` 里（**必须限定这个容器**：同页侧栏
//         「小说推荐」用的是同一个 a.imgbox 形状，整页扫会多出 12 条），每页 60 条：
//         `a.imgbox[href=/<urlencoded书名>-<数字id>/]` 是作品地址（id 就取它，带编码）；
//         书名 `div.newnav h3 > a`；作者/分类/状态在 `div.labelbox > label`；
//         简介 `ol.ellipsis_2`（前面有若干全角空格）。
//   封面  **列表页是 lazysizes**：`img[src=/images/nopic.jpg][srcset=1px 占位 gif]
//         [data-imgurl=真图][data-srcset=真图 200w,…]`——
//         按 src 取会拿到 nopic 灰图（「很多源没封面」的典型原因）；
//         这个站 **data-imgurl 也可能就是 /images/nopic.jpg**（约 1/6 的书确实没封面），
//         所以顺序是 data-imgurl → data-srcset 第一项 → src，一路都是占位就返回空串。
//   详情  GET /<作品路径>（`/<urlencoded名>-<id>/`）
//         封面 `div.bookimg2 > img[src]`（绝对地址）；书名 `div.booknav2 > h1`；
//         作者/分类/状态/字数/更新在 `div.booknav2 > p` 各行；
//         简介 `div#tab_info div.navtxt > p`（后面还跟着站点自己的推荐语，只取第一个 p）；
//         `div.addbtn a[href=<n>.html]`「开始阅读」= 首章的**文件号**（如 75.html）。
//   目录  **站点没有 SSR 全量目录**：详情页只给「最新 15 章」（`div#tab_chapters ul.qustime`，
//         倒序、且 span 里带着更新时间）。但章节页导航里有一个目录链接
//         `/<作品路径>index.html`——全量目录在那里（recon 没抓到它的快照，
//         所以解析用结构无关的宽松规则）。
//         chapters() 的顺序：先抓 index.html；抓不到就退回「从首章顺文件号 +1 走一段」
//         +「详情页最新 15 章」，**并设上限、打日志说明只取到多少章**（沙箱单次调用
//         只有 ~10 秒 / 256 次宿主调用，长书不可能全抓）。
//   正文  GET /<作品路径><n>.html，单页：`div#article > p`。
//         **注意页面里有两个 #next_url**：一个是广告劫持的外链（`data-cid="b"`，
//         指向别的站），一个是真实相对链（`data-cid="a"`，还带着 style="display:none"）；
//         本脚本只读正文、不跟这两个链接，所以不受影响——但**别**顺手用 #next_url
//         当下一章，那会跳到广告站。
//
// 站点直连 200、没有 Cloudflare 挑战；被拦时的标记路径照留（见 __get）。

var DEFAULT_BASE = 'https://www.101minc.com';

/// 主站地址：App 可能注入解析后的域名（自定义域名 > 选中镜像 > 第一个镜像），
/// 没有 config 时回落到脚本自己的默认地址。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var PAGE_SIZE = 60;        // 列表每页条数（快照实测 ul#article_list_content 里 60 条）
var MAX_ITEMS = 120;       // 单次列表最多产出
var WALK_CAP = 40;         // 从首章顺文件号最多试抓多少章
var WALK_BATCH = 4;        // 每批并发几章（宿主按域名限流，批 4 不轰炸站点）
var WALK_BUDGET_MS = 4500; // 顺抓的软截止
var MAX_CHAPTERS = 3000;   // 目录最多产出多少章
var MAX_TAIL = 40;         // 详情页「最新 N 章」最多取多少条
var CONTENT_WINDOW = 400000;

var LumeSource = {
  id: '101minc_novel',
  name: '101小说',
  version: '1.0.0',
  category: 'novel',
  mirrors: ['https://www.101minc.com', 'https://sg.101minc.com', 'https://tw.101minc.com'],

  // ---------------------------------------------------------------- 契约方法

  /// 分类：9 个题材 + 5 个榜单入口（站点页脚与首页导航里就这几个）。
  async categories() {
    return [
      { id: 'novelsort/1', title: '玄幻' },
      { id: 'novelsort/2', title: '仙侠' },
      { id: 'novelsort/3', title: '都市' },
      { id: 'novelsort/4', title: '军事' },
      { id: 'novelsort/5', title: '网游' },
      { id: 'novelsort/6', title: '科幻' },
      { id: 'novelsort/7', title: '悬疑' },
      { id: 'novelsort/8', title: '女生' },
      { id: 'novelsort/9', title: '其他' },
      { id: 'noveltop/allvisit', title: '排行榜' },
      { id: 'noveltop/lastupdate', title: '最新更新' },
      { id: 'noveltop/allvote', title: '热门书' },
      { id: 'novelfull', title: '完本小说' },
      { id: 'gengxin', title: '全部小说' }
    ];
  },

  /// 首页：热门榜单（首页 newnovels2 块，带真封面）+ 玄幻列表首屏。
  async home() {
    var started = new Date().getTime();
    var boards = [];
    var html;
    try {
      html = await this.__get('/');
    } catch (error) {
      console.warn('[101minc] 首页失败：' + error);
      return boards;
    }
    var hot = this.__homeItems(html);
    if (hot.length) boards.push({ title: '热门榜单', moreUrl: 'noveltop/allvisit', items: hot.slice(0, 12) });
    if (new Date().getTime() - started > 6000) {
      console.warn('[101minc] 首页到软截止，先返回 ' + boards.length + ' 块');
      return boards;
    }
    try {
      var payload = await this.list({ categoryId: 'novelsort/1', page: 1 });
      var items = (payload && payload.items ? payload.items : []).slice(0, 12);
      if (items.length) boards.push({ title: '玄幻', moreUrl: 'novelsort/1', items: items });
    } catch (error) {
      console.warn('[101minc] 首页「玄幻」失败：' + error);
    }
    return boards;
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!(page > 0)) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';

    if (keyword) {
      // 站点的搜索表单是 GET /modules/article/search.php?searchkey=<kw>&searchtype=all。
      var searchHtml = await this.__get('/modules/article/search.php?searchtype=all&searchkey='
        + encodeURIComponent(keyword));
      var found = this.__listItems(searchHtml);
      return { items: found, hasMore: false };
    }

    var path;
    if (/^novelsort\/[0-9]+$/.test(category)) {
      path = '/novelsort_' + category.slice(10) + '_' + page + '.html';
    } else if (/^noveltop\/[a-z]+$/.test(category)) {
      path = '/noveltop_' + category.slice(9) + '_' + page + '.html';
    } else if (category === 'novelfull') {
      path = '/novelfull_' + page + '.html';
    } else if (category === 'gengxin') {
      // 全部小说是一张整表（recon 没核实它的分页形状）：只认第 1 页。
      if (page > 1) {
        console.warn('[101minc] gengxin 只支持第 1 页（分页形状未核实）');
        return { items: [], hasMore: false };
      }
      path = '/gengxin.html';
    } else {
      path = '/novelsort_1_' + page + '.html';
    }
    var html = await this.__get(path);
    var items = this.__listItems(html);
    var hasMore = this.__hasNextPage(html, path);
    if (!hasMore && items.length >= PAGE_SIZE) hasMore = true;
    return { items: items, hasMore: hasMore };
  },

  async detail(argument) {
    var path = this.__bookPath(argument);
    var html = await this.__get(path);
    var title = this.__title(html);
    if (!title) {
      console.warn('[101minc] 详情页没认出书名：' + path + '（' + html.length + ' 字符）');
      return null;
    }
    var info = this.__detailInfo(html);
    var subtitle = info.author ? ('作者：' + info.author) : '';
    if (info.meta) subtitle = subtitle ? subtitle + ' · ' + info.meta : info.meta;
    return {
      id: path,
      title: title,
      cover: info.cover,
      subtitle: subtitle,
      description: info.description,
      extra: { author: info.author, meta: info.meta }
    };
  },

  /// 目录：优先站点自己的全量目录页（`/<作品路径>index.html`），
  /// 抓不到才退回「首章顺抓 + 详情页最新 15 章」，并如实说明取到多少章。
  async chapters(argument) {
    var path = this.__bookPath(argument);
    var full = await this.__indexRows(path);
    if (full.length) {
      console.log('[101minc] 目录取自 ' + path + 'index.html：' + full.length + ' 章');
      return full;
    }
    var html = await this.__get(path);
    var rows = this.__latestChapters(html);
    var first = this.__firstChapterNo(html);
    var walked = first ? await this.__walkChapters(path, first) : [];
    var merged = this.__mergeChapters(walked.concat(rows));
    if (!merged.length) {
      throw new Error('101小说：没认出章节目录（' + path + '）——站点可能改版，把运行日志发回来');
    }
    console.warn('[101minc] 站点没给全量目录，本次只取到 ' + merged.length
      + ' 章（顺抓 ' + walked.length + ' 章 + 详情页最新 ' + rows.length + ' 章）');
    return merged;
  },

  /// 正文：`div#article > p`（单页）。不跟页面里的 #next_url——那两个链接一个是广告外链。
  async content(argument) {
    var path = this.__bookPath(argument);
    var chapterId = argument && argument.chapterId != null ? String(argument.chapterId).trim() : '';
    if (!chapterId) throw new Error('101小说：缺少章节号（请重新进一次目录再打开）');
    var number = /(\d+)/.exec(chapterId);
    if (!number) throw new Error('101小说：章节号认不出（' + chapterId + '）');
    var url = path + number[1] + '.html';
    var html = await this.__get(url);
    var paragraphs = this.__articleText(html);
    if (!paragraphs.length) {
      throw new Error('101小说：正文页没认出正文（' + url + '，' + html.length
        + ' 字符）——站点可能改版，把运行日志发回来');
    }
    return { kind: 'text', text: paragraphs.join('\n\n') };
  },

  // ---------------------------------------------------------------- 内部工具

  /// 作品路径：`/<urlencoded书名>-<数字id>/`。
  /// 列表条目的 id 就是这个路径（保留百分号编码，站点按编码匹配）；
  /// 万一条目 id 里被塞了整条 URL，就剥掉 host——请求一律 base() + 路径，才跟得上镜像切换。
  __bookPath(argument) {
    var raw = '';
    if (argument && argument.id != null) raw = String(argument.id).trim();
    if (!raw) throw new Error('101小说：缺少作品地址');
    var match = /^https?:\/\/[^\/]+(\/.*)$/.exec(raw);
    if (match) raw = match[1];
    if (raw.charAt(0) !== '/') raw = '/' + raw;
    if (raw.charAt(raw.length - 1) !== '/') raw += '/';
    if (!/-[0-9]+\/$/.test(raw)) {
      throw new Error('101小说：作品地址认不出（' + raw + '，站点形状是 /<书名>-<数字id>/）');
    }
    return raw;
  },

  /// 列表条目：限定 `ul#article_list_content` 容器，60 条/页。
  /// **不能**整页扫（侧栏「小说推荐」的 a.imgbox 是 div.imgbox 那种形状，会混进来 12 条）：
  /// 这里要求锚点自己带 class="imgbox"（列表独有），并限定在容器里。
  __listItems(html) {
    var start = html.indexOf('id="article_list_content"');
    if (start < 0) return [];
    var end = html.indexOf('</ul>', start);
    var segment = html.slice(start, end > 0 ? end : start + 400000);
    var items = [];
    var seen = {};
    var pattern = /<a target="_blank" href="(\/[^"]*-[0-9]+\/)" class="imgbox">([\s\S]{0,600}?)<\/a>/g;
    var match;
    while ((match = pattern.exec(segment)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var path = match[1];
      if (seen[path]) continue;
      seen[path] = true;
      var img = /<img[^>]*>/i.exec(match[2]);
      // 书名/标签/简介在锚点**后面**的 div.newnav 里，往后看一小段（一条 ≈1.3KB）。
      var window = segment.slice(match.index, match.index + 2600);
      var title = /<div class="newnav"><h3><a[^>]*>([\s\S]{0,120}?)<\/a>/.exec(window)
        || /<h3><a[^>]*>([\s\S]{0,120}?)<\/a>/.exec(window);
      var labels = window.match(/<label>([^<]{0,40})<\/label>/g) || [];
      var cleaned = [];
      for (var i = 0; i < labels.length; i++) {
        var text = this.__clean(labels[i].replace(/<\/?label>/g, ''));
        if (text) cleaned.push(text);
      }
      var intro = /<ol class="ellipsis_2">([\s\S]{0,200}?)<\/ol>/.exec(window);
      var description = this.__clean(intro ? intro[1] : '');
      var subtitle = cleaned.join(' · ');
      if (description) subtitle = subtitle ? subtitle + ' · ' + description : description;
      items.push({
        id: path,
        title: this.__clean(title ? title[1] : '') ||
          this.__clean(img ? this.__attr(img[0], 'alt') : '') || path,
        cover: this.__cover(img ? img[0] : ''),
        subtitle: subtitle
      });
    }
    return items;
  },

  __title(html) {
    var match = /<div class="booknav2">[\s\S]{0,200}?<h1>([\s\S]{0,200}?)<\/h1>/.exec(html);
    if (match && this.__clean(match[1])) return this.__clean(match[1]);
    match = /property="og:novel:book_name" content="([^"]*)"/.exec(html);
    return match ? this.__clean(match[1]) : '';
  },

  __detailInfo(html) {
    var img = /<div class="bookimg2">[\s\S]{0,400}?<img[^>]*src="([^"]+)"/.exec(html);
    var author = /<div class="booknav2">[\s\S]{0,600}?<p>作者：\s*([^<]{0,40})<\/p>/.exec(html);
    var kind = /<p>分类：<a[^>]*>([^<]{0,40})<\/a>/.exec(html);
    var status = /<p>状态：\s*([^<]{0,40})<\/p>/.exec(html);
    var words = /<p>字数：\s*([^<]{0,40})<\/p>/.exec(html);
    var intro = /<div id="tab_info"[\s\S]{0,300}?<div class="navtxt">[\s\S]{0,200}?<p[^>]*>([\s\S]{0,4000}?)<\/p>/.exec(html);
    var meta = [];
    var k = this.__clean(kind ? kind[1] : '');
    var w = this.__clean(words ? words[1] : '');
    var s = this.__clean(status ? status[1] : '');
    if (k) meta.push(k);
    if (w) meta.push(w);
    if (s) meta.push(s);
    return {
      cover: this.__cover2(img ? img[1] : ''),
      author: this.__clean(author ? author[1] : ''),
      meta: meta.join(' · '),
      description: this.__clean(intro ? intro[1] : '')
    };
  },

  /// 首章的**文件号**：详情页「开始阅读」是相对链接 `<n>.html`（如 75.html），
  /// 不是「第 1 章」——站点的章节文件号与章节号并不一致（第1245章 = 2419.html），
  /// 所以只能从站点给的这一条起步，顺 +1 走。
  __firstChapterNo(html) {
    var match = /<div class="addbtn">[\s\S]{0,600}?href="(\d+)\.html"/.exec(html);
    if (!match) return 0;
    var number = parseInt(match[1], 10);
    return number > 0 ? number : 0;
  },

  /// 详情页「最新 N 章」（`div#tab_chapters ul.qustime`，倒序）；
  /// span 里是「第5763章 就凭你… 2026-10-16 23:18:16」——尾巴那个时间要剥掉。
  __latestChapters(html) {
    var start = html.indexOf('id="tab_chapters"');
    if (start < 0) return [];
    var end = html.indexOf('</ul>', start);
    var segment = html.slice(start, end > 0 ? end : start + 40000);
    var rows = [];
    var pattern = /href="([^"]*\/(\d+)\.html)"[^>]*class="infoad"><span>([^<]{0,120})<\/span>/g;
    var match;
    while ((match = pattern.exec(segment)) !== null && rows.length < MAX_TAIL) {
      var title = this.__clean(match[3]).replace(/\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*$/, '');
      rows.push({ number: Number(match[2]), title: title || ('第 ' + match[2] + ' 章') });
    }
    return rows;
  },

  /// 全量目录页（`/<作品路径>index.html`）：形状没抓到快照，用结构无关的宽松规则——
  /// 抓所有 `/<作品路径><n>.html` 的锚点与文本。
  async __indexRows(path) {
    var html;
    try {
      html = await this.__get(path + 'index.html');
    } catch (error) {
      console.warn('[101minc] ' + path + 'index.html 失败：' + error);
      return [];
    }
    var pattern = new RegExp(
      'href="' + this.__escapeRegExp(path) + '(\\d+)\\.html"[^>]*>([\\s\\S]{0,200}?)<\\/a>',
      'g'
    );
    var rows = [];
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (rows.length >= MAX_CHAPTERS) break;
      var title = this.__clean(match[2]);
      rows.push({
        number: Number(match[1]),
        title: title.replace(/^\s*\d+\.\s*/, '') || ('第 ' + match[1] + ' 章')
      });
    }
    if (!rows.length) return [];
    return this.__mergeChapters(rows);
  },

  /// 从首章文件号顺 +1 抓：每批 4 章并发，遇到空页/失败立即停（说明编号不连续）。
  async __walkChapters(path, first) {
    var rows = [];
    var started = new Date().getTime();
    var stopped = '';
    for (var from = first; from < first + WALK_CAP && rows.length < WALK_CAP; from += WALK_BATCH) {
      var batch = [];
      var numbers = [];
      for (var i = from; i < from + WALK_BATCH && i < first + WALK_CAP; i++) {
        batch.push(this.__walkPage(path, i));
        numbers.push(i);
      }
      var results = await Promise.all(batch);
      for (var b = 0; b < results.length; b++) {
        if (!results[b]) {
          stopped = '第 ' + numbers[b] + ' 章起抓不到（编号中断）';
          break;
        }
        rows.push(results[b]);
      }
      if (stopped) break;
      if (new Date().getTime() - started > WALK_BUDGET_MS) {
        stopped = '到时间预算 ' + WALK_BUDGET_MS + 'ms';
        break;
      }
    }
    if (stopped) console.warn('[101minc] 顺抓章节停下：' + stopped + '（已抓 ' + rows.length + ' 章）');
    return rows;
  },

  async __walkPage(path, number) {
    try {
      var html = await this.__get(path + number + '.html');
      var match = /<div class="txtnav">[\s\S]{0,200}?<h1>([\s\S]{0,200}?)<\/h1>/.exec(html)
        || /<title>([\s\S]{0,200}?)<\/title>/.exec(html);
      if (!match) return null;
      var title = this.__clean(match[1]);
      if (!title) return null;
      return { number: number, title: title };
    } catch (error) {
      return null;
    }
  },

  /// 合并去重（按文件号）并升序：站点的文件号随章节顺序自增，排序即阅读顺序。
  __mergeChapters(rows) {
    var seen = {};
    var unique = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || seen[row.number]) continue;
      seen[row.number] = true;
      unique.push(row);
    }
    unique.sort(function (left, right) {
      return left.number - right.number;
    });
    var result = [];
    for (var j = 0; j < unique.length; j++) {
      result.push({
        id: String(unique[j].number),
        title: unique[j].title || ('第 ' + unique[j].number + ' 章')
      });
    }
    return result;
  },

  /// 首页热门榜单：`<a href="<路径>"><div class="imgbox"><img …/></div>
  /// <h3 class="ellipsis_1">书名</h3><h4>作者</h4></a>`。
  __homeItems(html) {
    var start = html.indexOf('newnovels2');
    if (start < 0) return [];
    var end = html.indexOf('</ul>', start);
    var segment = html.slice(start, end > 0 ? end : start + 40000);
    var items = [];
    var seen = {};
    var pattern = /<a target="_blank" href="(\/[^"]*-[0-9]+\/)">([\s\S]{0,900}?)<\/a>/g;
    var match;
    while ((match = pattern.exec(segment)) !== null) {
      var path = match[1];
      if (seen[path]) continue;
      seen[path] = true;
      var block = match[2];
      var img = /<img[^>]*>/i.exec(block);
      var title = /<h3 class="ellipsis_1">([\s\S]{0,120}?)<\/h3>/.exec(block);
      var author = /<h4>([\s\S]{0,40}?)<\/h4>/.exec(block);
      items.push({
        id: path,
        title: this.__clean(title ? title[1] : '') ||
          this.__clean(img ? this.__attr(img[0], 'alt') : '') || path,
        cover: this.__cover(img ? img[0] : ''),
        subtitle: this.__clean(author ? author[1] : '')
      });
    }
    return items;
  },

  /// 正文：`div#article` 里的 <p>。
  __articleText(html) {
    var start = html.indexOf('id="article"');
    if (start < 0) return [];
    var end = html.indexOf('</div>', start);
    var segment = html.slice(start, end > start ? end : start + CONTENT_WINDOW);
    var paragraphs = [];
    var pattern = /<p[^>]*>([\s\S]*?)<\/p>/g;
    var match;
    while ((match = pattern.exec(segment)) !== null) {
      var text = this.__cleanBlock(match[1]);
      if (text) paragraphs.push(text);
    }
    return paragraphs;
  },

  /// 还有下一页：站点在 <head> 里给了 `<link rel="next" href="…">`。
  /// 但该站的 rel=last 是**错的**（指向第 1 页），所以只信 rel=next，
  /// 并且要求它不等于当前页（避免末页把自己当下一页）。
  __hasNextPage(html, path) {
    var match = /<link rel="next" href="([^"]+)"/.exec(html);
    if (!match) return false;
    var next = match[1].replace(/^https?:\/\/[^\/]+/, '');
    return next !== path;
  },

  /// 封面：data-imgurl → data-srcset 第一项 → src；一路占位（nopic / 1px gif）就空串。
  __cover(tag) {
    var value = this.__attr(tag, 'data-imgurl') || this.__attr(tag, 'data-srcset') ||
      this.__attr(tag, 'src');
    if (value) {
      var first = String(value).split(',')[0].replace(/\s+\d+[wx]$/, '').trim();
      if (first) value = first;
    }
    return this.__cover2(value);
  },

  /// 详情页封面是干净的绝对地址；两处共用同一套占位过滤。
  __cover2(value) {
    var url = String(value || '').trim();
    if (!url) return '';
    if (/nopic|nocover|default_no_thumbnail|blank|loading/i.test(url)) return '';
    if (url.indexOf('data:image') === 0) return '';
    return this.__absolute(url);
  },

  __absolute(url) {
    var value = String(url || '').trim();
    if (!value) return '';
    if (value.indexOf('//') === 0) return 'https:' + value;
    if (/^https?:/i.test(value)) return value.replace(/^http:/i, 'https:');
    return base() + (value.charAt(0) === '/' ? '' : '/') + value;
  },

  __attr(tag, name) {
    var pattern = new RegExp(name + '="([^"]*)"');
    var match = pattern.exec(String(tag || ''));
    return match ? match[1] : '';
  },

  __escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
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
