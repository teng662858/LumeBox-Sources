// LumeSource: {"id":"po18vip_novel","name":"PO18","version":"1.0.0","category":"novel","mirrors":["https://wap.po18vip.com"]}

// 站点：PO18 脸红心跳（wap.po18vip.com，成人向）。utf-8。
//
// ## 抓取口径（对着快照 novel_po18vip_*.html 核过）
//
//   分类   书库列表的筛选矩阵：`/shuku/<a>/<类型>/<b>/<字数>/<时间>/<e>/<排序>/<页>.html`
//          （a/b/e 固定 0）。类型 0 全部 / 1 玄幻奇幻 / 2 武侠仙侠 / 3 都市言情 /
//          4 历史穿越 / 5 网游竞技 / 6 科幻灵异 / 7 恐怖惊悚 / 8 其他类型；
//          排序固定用 lastupdate（更新时间），要换排序得改这段 URL。
//          另有 /top/rank.html 排行榜单（单页 30 条，没有分页）。
//   列表   `#sitebox > dl` 一条：`dt > a[href=/book/<书号>.html] > img.lazyload`
//          ——封面是**懒加载**：`_src` 与 `src` 同值，但按 `_src` 取更稳（脚本关了
//          才把 src 填上）；`dd h3` 是书名（前面的 `span.uptime` 是热度值，剔掉）、
//          `dd.book_other` 是作者 + 状态、`dd.book_des` 是简介。
//          20 条/页，分页 `a.pg-next`（下一页）+ 一个列全部页的 select。
//   详情   GET /book/<书号>.html：`.bookimg img` 封面、`.xq_bookne .one em` 书名、
//          作者/类别/状态/字数 在 `.xq_bookne` 的 div 里、`div#bookintro` 简介。
//   目录   GET /index/<书号>/asc/<页>.html（升序，20 章/页）：
//          `div#readerlist ul li > a[href=/book/<书号>/<章节号>.html]`，
//          锚点文本形如「12.功法 - 10-03」（序号.章节名 - 日期）。
//   正文   GET /book/<书号>/<章节号>.html：`div#YiJianZhan`，段落用 `<br />` 分行。
//          上一/下一章在页内 JS 的 `ReadParams`（url_previous / url_next /
//          url_index）里——阅读器的翻页由 App 按目录顺序走，脚本不需要它。
//
// ## 付费 / 登录
// PO18 有 VIP 章节：正文抓不到时**如实点名**（不把「请登录」的提示页当成正文
// 返回，那样用户会以为章节是空的）。判据是 `#YiJianZhan` 不存在或清洗后为空。

var DEFAULT_BASE = 'https://wap.po18vip.com';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

var MAX_ITEMS = 200;         // 单次列表最多产出
var ITEM_WINDOW = 2600;      // 单条往后看的窗口（封面 + 书名 + 作者 + 简介）
var MAX_CHAPTERS = 3000;     // 目录最多解析多少章
var MAX_INDEX_PAGES = 40;    // 目录最多翻多少页
var INDEX_BATCH = 3;         // 目录每批并发几页
var INDEX_BUDGET_MS = 5000;  // 目录抓取软截止（沙箱单次调用预算 10s）

/// 解析后的站点地址：自定义域名 > 用户选中的镜像 > 脚本声明的第一个镜像。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var LumeSource = {
  id: 'po18vip_novel',
  name: 'PO18',
  version: '1.0.0',
  category: 'novel',

  // ---------------------------------------------------------------- 契约方法

  /// 分类＝书库的类型筛选（0 全部 + 1–8）+ 排行榜单。
  async categories() {
    return [
      { id: '0', title: '全部' },
      { id: '1', title: '玄幻奇幻' },
      { id: '2', title: '武侠仙侠' },
      { id: '3', title: '都市言情' },
      { id: '4', title: '历史穿越' },
      { id: '5', title: '网游竞技' },
      { id: '6', title: '科幻灵异' },
      { id: '7', title: '恐怖惊悚' },
      { id: '8', title: '其他类型' },
      { id: 'rank', title: '排行榜单' }
    ];
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = this.__clean(args.keyword || '');
    if (keyword) {
      // 站点的搜索是个弹窗（search_win），接口没有快照可依 —— 如实报「未接入」。
      throw new Error('PO18：本源未接入搜索（站点的搜索是弹窗 + 未核对的接口）；关键词：'
        + keyword);
    }
    var category = String(args.categoryId == null ? '' : args.categoryId).trim();
    if (category === 'rank') {
      var rank = await this.__get('/top/rank.html');
      return { items: this.__items(rank), hasMore: false };
    }
    if (!/^\d+$/.test(category)) category = '0';
    var html = await this.__get(this.__listPath(category, page));
    return {
      items: this.__items(html),
      hasMore: this.__hasMore(html)
    };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/book/' + id + '.html');
    var title = this.__title(html);
    if (!title) {
      console.warn('[po18] 详情页没认出书名：' + id + '（' + html.length + ' 字符）');
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

  /// 目录：/index/<书号>/asc/<页>.html，20 章/页，升序；按页内 select 的总页数补齐。
  async chapters(argument) {
    var id = this.__id(argument);
    var first = await this.__get('/index/' + id + '/asc/1.html');
    var rows = this.__chapters(first, id);
    if (!rows.length) {
      throw new Error('PO18：目录页没认出章节（/index/' + id
        + '/asc/1.html）——把运行日志发回来收敛解析规则');
    }
    var pages = this.__indexPages(first, id);
    if (pages > MAX_INDEX_PAGES) pages = MAX_INDEX_PAGES;
    if (pages > 1) {
      var seen = {};
      for (var k = 0; k < rows.length; k++) seen[rows[k].id] = true;
      var started = new Date().getTime();
      for (var page = 2; page <= pages; page += INDEX_BATCH) {
        if (new Date().getTime() - started > INDEX_BUDGET_MS) {
          console.warn('[po18] 目录到软截止（' + INDEX_BUDGET_MS + 'ms），先返回已抓到的 '
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
        if (!fresh) break;
      }
    }
    if (rows.length > MAX_CHAPTERS) rows = rows.slice(0, MAX_CHAPTERS);
    return rows;
  },

  /// 正文：`div#YiJianZhan`，`<br/>` 分行。抓不到就点名「需要登录 / 是 VIP 章节」。
  async content(argument) {
    var bookId = this.__id(argument);
    var chapterId = this.__token(argument && argument.chapterId);
    if (!chapterId) throw new Error('PO18：缺少章节号（请重新进一次目录再打开）');
    var url = '/book/' + bookId + '/' + chapterId + '.html';
    var html = await this.__get(url);
    var start = html.indexOf('id="YiJianZhan"');
    if (start < 0) {
      throw new Error('PO18：这一章没有公开正文（' + url
        + '）——PO18 的部分章节是 VIP / 需要登录，请先在浏览器里确认该章是否可免费阅读');
    }
    var end = html.indexOf('</div>', start);
    if (end < 0) end = Math.min(html.length, start + 400000);
    var block = html.slice(start, end);
    var lines = [];
    var parts = block.split(/<br\s*\/?>/i);
    for (var i = 0; i < parts.length; i++) {
      var text = this.__cleanBlock(parts[i]);
      if (text) lines.push(text);
    }
    if (!lines.length) {
      throw new Error('PO18：这一章的正文是空的（' + url
        + '）——多半是 VIP / 需要登录才能看的章节，本源不会假装它有内容');
    }
    return { kind: 'text', text: lines.join('\n') };
  },

  // ---------------------------------------------------------------- 内部工具

  __id(argument) {
    var m = /(\d+)/.exec(String((argument && argument.id) || ''));
    if (!m) throw new Error('PO18：缺少作品 ID');
    return m[1];
  },

  __token(value) {
    var m = /(\d+)/.exec(String(value == null ? '' : value));
    return m ? m[1] : '';
  },

  /// 书库列表地址：类型在**第 2 段**（实测 /shuku/0/1/0/0/0/0/lastupdate/1.html
  /// 就是「玄幻奇幻」，其余段固定 0）。
  __listPath(category, page) {
    return '/shuku/0/' + category + '/0/0/0/0/lastupdate/' + page + '.html';
  },

  /// 列表条目：`#sitebox > dl`。封面按 `_src` 取（懒加载），并升级到 https。
  __items(html) {
    var start = html.indexOf('id="sitebox"');
    if (start < 0) return [];
    var end = html.indexOf('</div>', html.indexOf('class="pagelist"', start) >= 0
      ? html.indexOf('class="pagelist"', start) : start);
    var block = end > start ? html.slice(start, end) : html.slice(start);
    var items = [];
    var seen = {};
    var pattern = /<dl>([\s\S]{0,3000}?)<\/dl>/g;
    var match;
    while ((match = pattern.exec(block)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var row = match[1];
      var link = /<a href="[^"]*\/book\/(\d+)\.html"/.exec(row);
      if (!link) continue;
      var id = link[1];
      if (seen[id]) continue;
      seen[id] = true;
      var coverMatch = /<img[^>]*_src="([^"]+)"/.exec(row) || /<img[^>]*src="([^"]+)"/.exec(row);
      var titleMatch = /<h3>([\s\S]{0,200}?)<\/h3>/.exec(row);
      var otherMatch = /class="book_other"[^>]*>([\s\S]{0,120}?)<\/dd>/.exec(row);
      var bits = [];
      var other = this.__clean(otherMatch ? otherMatch[1] : '');
      if (other) bits.push('作者：' + other.replace(/\s+/g, ' · '));
      var cover = this.__cover(coverMatch ? coverMatch[1] : '');
      items.push({
        id: id,
        title: this.__titleFromBlock(titleMatch ? titleMatch[1] : '') || ('作品 ' + id),
        cover: cover,
        coverHeaders: cover ? this.__coverHeaders() : null,
        subtitle: bits.length ? bits.join(' · ') : null
      });
    }
    return items;
  },

  /// `<span class="uptime">2270</span><a …>书名</a>` → 书名（热度值不是标题）。
  __titleFromBlock(text) {
    var match = /<a[^>]*>([\s\S]*?)<\/a>/.exec(String(text || ''));
    if (match) return this.__clean(match[1]);
    return this.__clean(String(text || '').replace(/<[^>]*>/g, ''));
  },

  /// 还有下一页吗：分页器的 `a.pg-next`（末页没有）。
  __hasMore(html) {
    return /<a class="pg-next"[^>]*>/.test(html);
  },

  __detailInfo(html) {
    var coverMatch = /class="bookimg"[\s\S]{0,300}?<img[^>]*?(?:_src|src)="([^"]+)"/.exec(html)
      || /og:image" content="([^"]+)"/.exec(html);
    // 注意：`.xq_bookne` 里第一层 `</div>` 只是「书名」那一格，用 slice(…, '</div>')
    // 会把作者/类别/状态全切掉（实测）。这里取一段窗口。
    var info = this.__window(html, 'class="xq_bookne"', 1600);
    var infoText = this.__entity((info || '').replace(/<[^>]*>/g, '\n'));
    var author = /作者[:：]\s*([^\n<]{1,40})/.exec(infoText);
    var category = /类别[:：]\s*([^\n<]{1,20})/.exec(infoText);
    var status = /状态[:：]\s*([^\n<]{1,12})/.exec(infoText);
    var words = /字数[:：]\s*([^\n<]{1,20})/.exec(infoText);
    var bits = [];
    if (author) bits.push('作者：' + this.__clean(author[1]));
    if (category) bits.push(this.__clean(category[1]));
    if (status) bits.push(this.__clean(status[1]));
    if (words) bits.push('字数：' + this.__clean(words[1]));
    var intro = this.__slice(html, 'id="bookintro"', '</div>');
    return {
      cover: this.__cover(coverMatch ? coverMatch[1] : ''),
      subtitle: bits.length ? bits.join(' · ') : null,
      // 简介里站点会塞「www.po1..」这种自己截断的尾巴，顺带剔掉。
      description: this.__clean(intro ? intro.replace(/<[^>]*>/g, '') : '')
        .replace(/www\.po1[^\s]*/i, '').trim()
    };
  },

  __title(html) {
    var match = /class="one"[\s\S]{0,60}?<em>([\s\S]{0,160}?)<\/em>/.exec(html);
    if (match && this.__clean(match[1])) return this.__clean(match[1]);
    var og = /og:novel:book_name" content="([^"]*)"/.exec(html);
    if (og && this.__clean(og[1])) return this.__clean(og[1]);
    var title = /<title>([^<]*)<\/title>/.exec(html);
    return title ? this.__clean(String(title[1]).split(/[_,]/)[0]) : '';
  },

  /// 目录页总页数：页内 `<select>` 的 option（`/index/<书号>/asc/<N>.html`）最大值。
  __indexPages(html, id) {
    var pages = 1;
    var pattern = new RegExp('/index/' + id + '/asc/(\\d+)\\.html', 'g');
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var n = Number(match[1]);
      if (n > pages) pages = n;
    }
    return pages;
  },

  /// 一页目录：`div#readerlist ul li > a[href=/book/<书号>/<章节号>.html]`，
  /// 锚点文本「12.功法 - 10-03」——日期不是标题的一部分，剔掉。
  __chapters(html, id) {
    var start = html.indexOf('id="readerlist"');
    if (start < 0) return [];
    var end = html.indexOf('</ul>', start);
    if (end < 0) end = Math.min(html.length, start + 400000);
    var block = html.slice(start, end);
    var pattern = new RegExp('<a href="[^"]*?/book/' + id + '/(\\d+)\\.html"[^>]*>([\\s\\S]{0,120}?)</a>', 'g');
    var rows = [];
    var seen = {};
    var match;
    while ((match = pattern.exec(block)) !== null) {
      if (rows.length >= MAX_CHAPTERS) break;
      var chapterId = match[1];
      if (seen[chapterId]) continue;
      seen[chapterId] = true;
      rows.push({
        id: chapterId,
        title: this.__clean(match[2]).replace(/\s*-\s*\d{2}-\d{2}\s*$/, '') || ('第 ' + chapterId + ' 章')
      });
    }
    return rows;
  },

  /// 目录的一页：单页失败只当空页（别让一处 502 把整本目录废掉）。
  __indexPage(id, page) {
    var self = this;
    return this.__get('/index/' + id + '/asc/' + page + '.html').then(function (html) {
      return self.__chapters(html, id);
    }, function () {
      return [];
    });
  },

  /// 从 anchor 起取 n 个字符（不需要知道结束标记时用）。
  __window(html, anchor, n) {
    var start = html.indexOf(anchor);
    if (start < 0) return '';
    return html.slice(start, start + n);
  },

  __slice(html, anchor, endMarker) {
    var start = html.indexOf(anchor);
    if (start < 0) return '';
    var end = html.indexOf(endMarker, start);
    if (end < 0) end = Math.min(html.length, start + 200000);
    return html.slice(start, end);
  },

  /// 封面：图床是独立域名（img.po18vip.com），站点写的是明文 http —— 升级到
  /// https（实测可用，iOS 禁明文）；nocover 之类的占位直接当没有封面。
  __cover(url) {
    var value = this.__entity(String(url || '')).trim();
    if (!value) return '';
    if (/nocover|nopic|default_no_thumbnail|loading|blank/i.test(value)) return '';
    if (value.indexOf('//') === 0) return 'https:' + value;
    if (/^http:\/\//i.test(value)) return value.replace(/^http:\/\//i, 'https://');
    if (/^https?:/i.test(value)) return value;
    return base() + (value.charAt(0) === '/' ? '' : '/') + value;
  },

  /// 封面在独立图床（img.po18vip.com），带上 Referer + UA。
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
      throw new Error('PO18：拉取失败（HTTP ' + status + ' ' + url + '）');
    }
    if (/just a moment|checking your browser|__cf_chl|cf-chl-/.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
        + status + ' ' + url + '）');
    }
    return body;
  }
};
