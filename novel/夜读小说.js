// LumeSource: {"id":"xnovel_novel","name":"夜读小说","version":"1.0.0","category":"novel"}

// 站点：https://x-novel.com（Tailwind 站；服务端渲染，桌面/移动同一套标记）
//
// ## 抓取口径（每条都对着**实时页面**核过，快照见 snapshots/xnovel_*.html）
//
//   分类  GET /  首页的标签宫格：`<a href="/tag/{slug}" class="home-tag-pill">中文名</a>`
//         （wife 人妻女友 / student 学生校园 / family 家庭乱伦 / … / audio 有声）。
//         slug 是英文（ASCII），中文只在展示名里。
//   列表  GET /novels/{N}          「最新收录」整站列表，24 条/页（第 1 页是 /novels）
//         GET /tag/{slug}/{N}      某个标签，24 条/页
//         GET /search?q={kw}&page={N}   搜索，24 条/页
//   条目  `a.list-card[href=/novel/{key}]`：key 是 10 位随机串（作品 id）；
//         标题在 `div.list-card-title`（锚点自己的 title 属性也是它）；
//         封面 `img[src=/assets/cover/{hash}.webp]`；作者/系列在 `list-card-author`
//         / `list-card-series`，字数在 `list-card-chapter-pill`（形如 8章）。
//   分页  传统分页器：`<a href="…">下一页</a>`；末页只有「上一页」，没有「下一页」。
//   详情  GET /novel/{key}
//         标题 `<h1 class="tk-h1">`；封面 `<img id="novel-cover-img" src=…>`；
//         简介在 `<h2 …>作品简介</h2>` 之后紧跟的 `<p class="tk-body …">` 里；
//         作者锚点 `a[href=/author/{名}]`；元信息（章节数 / 字数 / 完读）在
//         `div.flex.flex-col.gap-4.tk-meta` 的几行里（形如「章节：8 章」「字数：6.9万字」）。
//   目录  就在详情页里（单页、旧→新，跳过没有章节的条目）：
//         `a[href=/novel/{key}/{N}]`，条目里两个 span：左边「第 N 章」、右边标题。
//         {N} 从 1 开始（第 1 章可能是「前篇」这类无编号标题），按站点顺序不重排。
//   正文  GET /novel/{key}/{N}
//         正文在 `<article id="read-article">` 里，`<p>` 段落是正文；
//         段落之间还混着两类**非正文块**，必须剔掉：
//           · `div.extra_c_2`：广告锚点（内嵌 <img>，图床是另一个域名）；
//           · 文章开头那条「阅读提示」div（不在 <p> 里，天然不会进正文）。
//         站点自己的阅读器还有字号 / 主题两套 localStorage 状态，与抓取无关。
//
// ## 实测出来的两条
//
// 1. **`/novels?page=2` 与第 1 页同内容**（站点只认路径段）。分页一律拼
//    `/novels/{N}`、`/tag/{slug}/{N}`，搜索走 `?q=&page=`（实测搜索页是查询串）。
// 2. **正文里的 `<p>` 可能带 `&nbsp;` 与全角空格**：清洗时保留段落结构
//    （`\n\n` 分段），只做实体与首尾空白处理，不把整篇揉成一行。
//
// 站点 200 直连、没有 Cloudflare 挑战（快照与实时页都没有 __cf_chl 痕迹）；
// 被拦时的标记路径照留（见 __get）。

var BASE_URL = 'https://x-novel.com';

var PAGE_SIZE = 24;        // 列表/搜索每页条数（快照实测）
var PAGER_WINDOW = 5000;   // 分页器窗口（只看尾部这段）
var ITEM_WINDOW = 2600;    // 单条往后看的窗口（封面 + 作者 + 字数都在这段里）
var MAX_ITEMS = 200;       // 单次列表最多产出
var MAX_BOARDS = 3;        // 首页最多几块
var MAX_CHAPTERS = 4000;   // 目录最多解析多少章
var HOME_PICKS = ['wife', 'student'];  // 首页除「最新收录」外再挑两个标签
var HOME_BUDGET_MS = 6000;  // 首页软截止（沙箱单次调用预算是 3–10s，见 home()）
var ARTICLE_WINDOW = 2000000;  // 正文块窗口上限（实测单章 ≈30KB）

var LumeSource = {
  id: 'xnovel_novel',
  name: '夜读小说',
  version: '1.0.0',
  category: 'novel',

  // ---------------------------------------------------------------- 契约方法

  /// 分类：首页标签宫格（实时抓，不写死）。第一个永远补「全部」（站点自己的 /novels）。
  async categories() {
    var html = await this.__get('/');
    var pattern = /<a href="\/tag\/([^"]+)"[^>]*class="[^"]*home-tag-pill[^"]*"[^>]*>([\s\S]{0,60}?)<\/a>/g;
    var seen = {};
    var result = [{ id: 'all', title: '全部' }];
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var slug = match[1];
      if (!slug || seen[slug]) continue;
      seen[slug] = true;
      var title = this.__clean(match[2]) || slug;
      result.push({ id: slug, title: title });
    }
    // 补宫格之外的标签：`audio`（有声小说）只在顶部工具条与区块标题里出现，
    // class 不是 home-tag-pill，只按药丸抓会漏掉它（实测分类少一个）。
    // 只补 __tagTitle 认得（有中文名）的 slug，不往分类里塞没见过的标签。
    var extra = /<a[^>]+href="\/tag\/([a-z0-9-]+)"/g;
    var more;
    while ((more = extra.exec(html)) !== null) {
      var other = more[1];
      if (!other || seen[other]) continue;
      var known = this.__tagTitle(other);
      if (known === other) continue;
      seen[other] = true;
      result.push({ id: other, title: known });
    }
    return result;
  },

  /// 首页：最新收录 + 两个标签的首屏（每块 12 条）。
  ///
  /// **逐块 try/catch + 软截止**：沙箱给单次调用的墙钟预算是 3–10 秒（默认 10），
  /// 三块串行（每块 ≈80KB）在慢网络下会顶到上限、整个 home 以「调用超时」收场。
  /// 到点就把已经拿到的板块先返回——首页有几块是几块，好过整页空白。
  async home() {
    var started = new Date().getTime();
    var boards = [];
    try {
      var latest = await this.list({ categoryId: 'all', page: 1 });
      if (latest && latest.items && latest.items.length) {
        boards.push({
          title: '最新收录',
          moreUrl: 'all',
          items: latest.items.slice(0, 12)
        });
      }
    } catch (error) {
      console.warn('[xnovel] 首页「最新收录」失败：' + error);
    }
    for (var i = 0; i < HOME_PICKS.length && boards.length < MAX_BOARDS; i++) {
      if (new Date().getTime() - started > HOME_BUDGET_MS) {
        console.warn('[xnovel] 首页到软截止（' + HOME_BUDGET_MS + 'ms），先返回已有的 '
          + boards.length + ' 块');
        break;
      }
      try {
        var payload = await this.list({ categoryId: HOME_PICKS[i], page: 1 });
        var items = payload && payload.items ? payload.items : [];
        if (!items.length) continue;
        boards.push({
          title: this.__tagTitle(HOME_PICKS[i]),
          moreUrl: HOME_PICKS[i],
          items: items.slice(0, 12)
        });
      } catch (error) {
        console.warn('[xnovel] 首页「' + HOME_PICKS[i] + '」失败：' + error);
      }
    }
    return boards;
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!(page > 0)) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';

    var url;
    if (keyword) {
      url = '/search?q=' + encodeURIComponent(keyword) + '&page=' + page;
    } else if (!category || category === 'all') {
      url = '/novels' + (page > 1 ? '/' + page : '');
    } else {
      url = '/tag/' + encodeURIComponent(category) + (page > 1 ? '/' + page : '');
    }
    var html = await this.__get(url);
    var items = this.__listItems(html);
    return { items: items, hasMore: this.__hasNextPage(html) };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/novel/' + encodeURIComponent(id));
    var title = this.__title(html);
    if (!title) {
      console.warn('[xnovel] 详情页没认出标题：' + id + '（' + html.length + ' 字符）');
      return null;
    }
    var info = this.__detailInfo(html);
    return {
      id: id,
      title: title,
      cover: info.cover,
      subtitle: info.meta,
      description: info.description,
      tags: info.tags,
      extra: { author: info.author, meta: info.meta }
    };
  },

  async chapters(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/novel/' + encodeURIComponent(id));
    var chapters = this.__chapters(html, id);
    if (!chapters.length) {
      throw new Error('夜读小说：详情页没认出章节目录（id=' + id + '）——把运行日志发回来收敛解析规则');
    }
    return chapters;
  },

  async content(argument) {
    var id = this.__id(argument);
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    if (!chapterId) throw new Error('夜读小说：缺少章节号（请重新进一次目录再打开）');
    var html = await this.__get('/novel/' + encodeURIComponent(id) + '/' + encodeURIComponent(chapterId));
    var text = this.__articleText(html);
    if (!text) {
      throw new Error('夜读小说：正文页没认出正文（' + id + '/' + chapterId + '，'
        + html.length + ' 字符）——站点可能改版，把运行日志发回来');
    }
    return { kind: 'text', text: text };
  },

  // ---------------------------------------------------------------- 内部工具

  __id(argument) {
    var id = '';
    if (argument && argument.id != null) id = String(argument.id).trim();
    if (!id) throw new Error('夜读小说：缺少作品 ID');
    return id;
  },

  __tagTitle(slug) {
    var map = {
      wife: '人妻女友', student: '学生校园', anime: '动漫游戏', celebrities: '名人明星',
      fantasy: '古典玄幻', family: '家庭乱伦', group: '多人群交', exposure: '露出暴露',
      bdsm: '强暴性虐', lgbt: '同性主题', ntr: '绿帽主题', boys: '耽美小说',
      comic: '漫画小说', audio: '有声'
    };
    return map[slug] || slug;
  },

  /// 列表 / 搜索页的条目：`a.list-card[href=/novel/{key}]`。
  __listItems(html) {
    var items = [];
    var seen = {};
    var pattern = /<a href="\/novel\/([A-Za-z0-9_-]+)" class="list-card"/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var id = match[1];
      if (seen[id]) continue;
      seen[id] = true;
      var block = html.slice(match.index, match.index + ITEM_WINDOW);
      var titleMatch = /class="list-card-title"[^>]*>([^<]*)</.exec(block)
        || /title="([^"]*)"/.exec(block);
      var coverMatch = /<img[^>]+src="([^"]+)"/.exec(block);
      var authorMatch = /class="list-card-author"[^>]*>([^<]*)</.exec(block);
      var seriesMatch = /class="list-card-series"[^>]*>([^<]*)</.exec(block);
      var pillMatch = /class="list-card-chapter-pill"[^>]*>([\s\S]{0,40}?)<\/span>/.exec(block);
      var subtitle = this.__clean(authorMatch ? authorMatch[1] : '');
      var series = this.__clean(seriesMatch ? seriesMatch[1] : '');
      var pill = this.__clean(pillMatch ? pillMatch[1] : '');
      var extras = [];
      if (series) extras.push('系列：' + series);
      if (pill) extras.push(pill);
      if (extras.length) subtitle = subtitle ? subtitle + ' · ' + extras.join(' · ') : extras.join(' · ');
      items.push({
        id: id,
        title: this.__clean(titleMatch ? titleMatch[1] : id),
        cover: coverMatch ? this.__absolute(coverMatch[1]) : '',
        subtitle: subtitle
      });
    }
    return items;
  },

  __title(html) {
    var match = /<h1 class="tk-h1">([\s\S]{0,300}?)<\/h1>/.exec(html);
    if (match && this.__clean(match[1])) return this.__clean(match[1]);
    match = /property="og:title" content="([^"]*)"/.exec(html);
    return match ? this.__clean(match[1]).replace(/\s*-\s*成人小说阅读\s*\|\s*夜读小说\s*$/, '') : '';
  },

  __detailInfo(html) {
    var coverMatch = /id="novel-cover-img"[^>]*src="([^"]+)"/.exec(html)
      || /<img[^>]+id="novel-cover-img"[^>]*>/.exec(html);
    var cover = '';
    if (coverMatch && coverMatch[1]) cover = coverMatch[1];
    if (!cover) {
      var ogImage = /property="og:image" content="([^"]+)"/.exec(html);
      if (ogImage) cover = ogImage[1];
    }
    var authorMatch = /href="\/author\/([^"]+)"/.exec(html);
    var descMatch = /作品简介<\/h2>\s*<p[^>]*>([\s\S]{0,4000}?)<\/p>/.exec(html);
    var chaptersMatch = /章节：<\/span>\s*<span[^>]*>([^<]*)</.exec(html);
    var wordsMatch = /字数：<\/span>\s*<span[^>]*>([^<]*)</.exec(html);
    var tags = [];
    // 本作的标签是**尾部的药丸行**（`class="inline-flex items-center px-2.5…rounded-full"`）；
    // 详情页上半部分还有一整套「按标签逛」的宫格导航（class 是 `px-3 py-2 rounded-[…]`），
    // 拿它当标签会把全站 13 个分类全贴到每一部作品上（实测踩过）。
    var tagPattern = /<a\s+href="\/tag\/([^"\/]+)"\s+class="inline-flex items-center px-2\.5[^"]*"/g;
    var item;
    while ((item = tagPattern.exec(html)) !== null) {
      var slug = item[1];
      if (slug === 'audio') continue;
      var name = this.__tagTitle(slug);
      if (name && tags.indexOf(name) < 0 && tags.length < 8) tags.push(name);
    }
    var metaParts = [];
    var chaptersText = this.__clean(chaptersMatch ? chaptersMatch[1] : '');
    var wordsText = this.__clean(wordsMatch ? wordsMatch[1] : '');
    if (chaptersText) metaParts.push(chaptersText);
    if (wordsText) metaParts.push('字数：' + wordsText);
    return {
      cover: this.__absolute(cover),
      author: this.__clean(this.__decodeAttr(authorMatch ? authorMatch[1] : '')),
      description: this.__clean(descMatch ? descMatch[1] : ''),
      meta: metaParts.join(' · '),
      tags: tags
    };
  },

  /// 目录：`a[href=/novel/{key}/{N}]`，条目标题取锚点里**最后一个** span 的文本
  /// （第一个 span 是「第 N 章」的编号标签，末一个是站点自己的章节名）。
  ///
  /// 三个实测坑（都会把第 1 章标题污染成工具条文案）：
  ///   · 底部工具条有一条 `a[href=/novel/{key}/1]`，里面是…图标 + 「阅读」两个 span；
  ///   · 页面中部还有一条「开始阅读」按钮，同样指向第 1 章；
  ///   · 它们都排在**目录之前**，按出现顺序盲取会先撞上。
  /// 因此：工具条条目（内含 `mobile-bar`）直接跳过；「强条目」= 内含「第 N 章」编号
  /// span 的目录行，先来的弱条目遇到后来的强条目时被就地升级。
  __chapters(html, id) {
    var pattern = new RegExp('<a href="/novel/' + id + '/(\\d+)"[^>]*>([\\s\\S]{0,400}?)</a>', 'g');
    var chapters = [];
    var index = {};
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (chapters.length >= MAX_CHAPTERS) break;
      var number = match[1];
      var inner = match[2];
      if (/mobile-bar/.test(inner)) continue;
      var spans = inner.match(/<span[^>]*>([\s\S]*?)<\/span>/g) || [];
      var title = '';
      var strong = /第\s*\d+\s*章/.test(inner);
      if (spans.length) {
        title = this.__clean(spans[spans.length - 1]);
      } else {
        title = this.__clean(inner);
      }
      if (strong && /开始阅读|继续阅读/.test(title)) {
        // 「开始阅读」按钮指向第 1 章，但它不是章节名——不当标题用。
        title = '';
        strong = false;
      }
      var existing = index[number];
      if (existing != null) {
        if (strong && !chapters[existing].strong && title) {
          chapters[existing].title = title;
          chapters[existing].strong = true;
        }
        continue;
      }
      index[number] = chapters.length;
      chapters.push({ id: number, title: title, strong: strong });
    }
    var result = [];
    for (var i = 0; i < chapters.length; i++) {
      result.push({
        id: chapters[i].id,
        title: chapters[i].title || ('第 ' + chapters[i].id + ' 章')
      });
    }
    return result;
  },

  /// 正文：`<article id="read-article">` 里的 `<p>` 段落，剔掉广告块（div.extra_c_2）。
  __articleText(html) {
    var start = html.indexOf('id="read-article"');
    if (start < 0) return '';
    var end = html.indexOf('</article>', start);
    if (end < 0) end = Math.min(html.length, start + ARTICLE_WINDOW);
    var article = html.slice(start, end);
    article = article.replace(/<div class="extra_c_2"[\s\S]*?<\/div>/g, '\n');
    var paragraphs = [];
    var pattern = /<p[^>]*>([\s\S]*?)<\/p>/g;
    var match;
    while ((match = pattern.exec(article)) !== null) {
      var text = this.__cleanBlock(match[1]);
      if (text) paragraphs.push(text);
    }
    return paragraphs.join('\n\n');
  },

  /// 「还有下一页」：传统分页器的「下一页」锚点。
  ///
  /// 窗口必须够大：分页器在**页面尾部但不贴底**（实测详情推荐区把它挤到距末尾
  /// ≈13.7KB 处，只看最后 5KB 会把 100 页的列表误判成最后一页）。
  /// 直接整页找这个锚点形状——`下一页` 三个字只出现在分页器里，够特异。
  __hasNextPage(html) {
    return /<a\s+href="[^"]*"[^>]*>\s*下一页\s*<\/a>/.test(html);
  },

  __decodeAttr(value) {
    var text = String(value || '');
    if (text.indexOf('%') < 0) return text;
    try {
      return decodeURIComponent(text);
    } catch (error) {
      return text;
    }
  },

  __absolute(url) {
    var value = String(url || '').trim();
    if (!value) return '';
    if (value.indexOf('http') === 0) return value;
    if (value.indexOf('//') === 0) return 'https:' + value;
    return BASE_URL + (value.charAt(0) === '/' ? '' : '/') + value;
  },

  /// 单段正文的清洗：**只做实体与首尾空白**，段落内的空格原样保留
  /// （中文正文里偶尔夹着有意为之的空格，揉平了会改变阅读观感）。
  __cleanBlock(text) {
    return String(text || '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&hellip;/g, '…')
      .replace(/&mdash;/g, '—')
      .replace(/[ \t\r\f]+/g, ' ')
      .replace(/\s*\n\s*/g, '')
      .trim();
  },

  /// 短文本（标题 / 元信息）的清洗：连空白一起揉平。
  __clean(text) {
    return this.__cleanBlock(text).replace(/\s+/g, ' ').trim();
  },

  /// 所有请求的唯一出口：补全地址、发请求、被 WAF 拦下时抛固定标记。
  async __get(path) {
    var url = path.indexOf('http') === 0 ? path : BASE_URL + path;
    var response = await LumeSource.http.get(url, {
      headers: { 'Referer': BASE_URL + '/' }
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
    // 只认**挑战页**的特征串。**不能**用 `challenge-platform` 做判据：本站正常页面
    // 里也内联着 Cloudflare 的 JS 检测信标（/cdn-cgi/challenge-platform/scripts/jsd/
    // main.js），拿它当「被拦」会把每一页都误判成校验页（实测整站全部误报）。
    if (/just a moment|checking your browser|attention required|__cf_chl|cf-chl-/.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
        + status + ' ' + url + '）');
    }
    // 另一类「200 但没内容」：域名在某些网络下被套上了运营商 / 反诈拦截页
    // （实测：国内直连返回 200 + 国家反诈中心提示页，3KB）。这时解析出来是空列表，
    // 用户看到的是「暂无内容」——如实说明是被拦截页顶了，别让人以为源坏了。
    // 加长度上限（正常页 78–101KB，拦截页 3KB）是防误伤：正文本事提到这几个词
    // 不该被当成拦截页。
    if (body.length < 20000 && /国家反诈中心|涉诈举报|诈骗风险提示/.test(body)) {
      throw new Error('该域名被当前网络的反诈/拦截页顶了（HTTP ' + status
        + '，页面是「国家反诈中心」提示）：' + url
        + '。请换一个能正常访问该站的网络，或在图源网络设置里配一个代理。');
    }
    return body;
  }
};
