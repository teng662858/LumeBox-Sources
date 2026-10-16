// LumeSource: {"id":"wanben2_novel","name":"完本神站","version":"1.0.0","category":"novel","mirrors":["https://www.xwbsz.com","https://www.xwbbook.com","https://m.xwbbook.com"]}

// 站点：完本神站（黑冰模板，服务端渲染）。主站 www.wanben2.com 现在 301 到
// www.xwbsz.com；站点自宣的友情链接还有 www.xwbbook.com 与 m.xwbbook.com，
// 三个域名内容一致 —— 都进 mirrors，用户换域名时不用等脚本更新。
//
// ## 抓取口径（对着快照 novel_wanben2_*.html 核过）
//
//   分类   /fenlei/<栏目号>/<页>/  栏目号 1–24（玄幻 奇幻 武侠 仙侠 都市 军事
//          历史 游戏 竞技 科幻 悬疑 灵异 其他 古代 仙侠 现代 浪漫 玄幻 悬疑
//          科幻 游戏 BL GL 二次）。**站点自己的导航里 5 个标签重名**（仙侠 /
//          玄幻 / 悬疑 / 科幻 / 游戏 各出现两次，是男女频的两套栏目）——它们是
//          5 个不同栏目号、内容不同，所以这里如实各给一条，不按标签去重
//          （去重会让「女频 · 仙侠」这类栏目永远打不开）。
//          另有 /fenlei/ 全部小说（第 N 页 /fenlei/<N>/）与 /rank/ 排行榜单。
//   列表   `#hotcontent .item`（**本页前 6 条**，带封面与简介）+ `#newscontent`
//          左栏的 `<li>` 行（本页全部条目，35 条/页，纯文本：`[分类] 书名
//          最新章节 作者 日期`）。两者顺序一致、前 6 条互相对应，所以口径是
//          **以 li 行为条目，按作品 id 把 .item 的封面并进去**——只用 .item
//          会把每页 35 条砍成 6 条；只用 li 行则一条封面都没有。
//          /rank/ 没有 li 行，此时退回只用 .item。
//   分页   `<div class="pager">` 里的 select（option 的 value 就是下一页地址）
//          与「下一页」锚点；末页没有「下一页」。
//   详情   GET /<书号>/：`#info h1` 书名、`#fmimg img` 封面（注意站点把 img 的
//          alt 写错成别的书名，只能读 src）、`#info p` 里是作者/类别/最后更新/
//          最新章节、`#intro` 简介。
//   目录   **就在详情页 `#list dl dd` 里**：完整、旧→新、不分页。
//          站点数据里相邻章节会复用同一个章节地址（1054 条只有 844 个唯一
//          地址），这里**不按地址去重**——去重会凭空丢掉 200 多个章节标题；
//          重复地址的两条本来就指向同一页正文，点哪条都一样。
//   正文   GET /<书号>/<章节号>.html：`div#content` 里的 `<p>`，单页。
//
// 注意封面：站点把封面写死成 **明文 http://www.xwbsz.com/images/…**，iOS 禁明文，
// 所以脚本统一把 http 升级到 https（同主机，实测可用）；nocover.jpg 是站点自己的
// 占位图（很多新书都是它），直接当没有封面。

var DEFAULT_BASE = 'https://www.xwbsz.com';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

var MAX_ITEMS = 200;        // 单次列表最多产出
var CARD_WINDOW = 2500;     // 单张卡片往后看的窗口（封面 + 书名 + 作者）
var MAX_CHAPTERS = 4000;    // 目录最多解析多少章

/// 分类＝站点导航那 26 个入口（24 个栏目 + 全部小说 + 排行榜单）。
var CATEGORIES = [
  { id: '1', title: '玄幻' },
  { id: '2', title: '奇幻' },
  { id: '3', title: '武侠' },
  { id: '4', title: '仙侠' },
  { id: '5', title: '都市' },
  { id: '6', title: '军事' },
  { id: '7', title: '历史' },
  { id: '8', title: '游戏' },
  { id: '9', title: '竞技' },
  { id: '10', title: '科幻' },
  { id: '11', title: '悬疑' },
  { id: '12', title: '灵异' },
  { id: '13', title: '其他' },
  { id: '14', title: '古代' },
  { id: '15', title: '仙侠' },
  { id: '16', title: '现代' },
  { id: '17', title: '浪漫' },
  { id: '18', title: '玄幻' },
  { id: '19', title: '悬疑' },
  { id: '20', title: '科幻' },
  { id: '21', title: '游戏' },
  { id: '22', title: 'BL' },
  { id: '23', title: 'GL' },
  { id: '24', title: '二次' },
  { id: 'all', title: '全部小说' },
  { id: 'rank', title: '排行榜单' }
];

/// 解析后的站点地址：自定义域名 > 用户选中的镜像 > 脚本声明的第一个镜像。
function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var LumeSource = {
  id: 'wanben2_novel',
  name: '完本神站',
  version: '1.0.0',
  category: 'novel',

  // ---------------------------------------------------------------- 契约方法

  async categories() {
    return CATEGORIES.slice();
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = this.__clean(args.keyword || '');
    // 站点搜索是它自家的第三方搜索（表单 action 指向 sososhu.com），脚本不替用户
    // 跳到别站——搜不了就如实说，不返回一个假装成功的空列表。
    if (keyword) {
      throw new Error('完本神站：本站没有自己的搜索接口（表单指向站外搜索），'
        + '请用分类浏览；关键词：' + keyword);
    }
    var html = await this.__get(this.__listPath(String(args.categoryId == null ? '' : args.categoryId), page));
    return {
      items: this.__items(html),
      hasMore: this.__hasMore(html, page)
    };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/' + id + '/');
    var title = this.__title(html);
    if (!title) {
      console.warn('[wanben2] 详情页没认出书名：' + id + '（' + html.length + ' 字符）');
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

  /// 目录：就在详情页 `#list dl dd` 里，一页给全。
  async chapters(argument) {
    var id = this.__id(argument);
    var html = await this.__get('/' + id + '/');
    var rows = this.__chapters(html, id);
    if (!rows.length) {
      throw new Error('完本神站：详情页没认出目录（id=' + id
        + '）——把运行日志发回来收敛解析规则');
    }
    return rows;
  },

  async content(argument) {
    var id = this.__id(argument);
    var chapterId = this.__token(argument && argument.chapterId);
    if (!chapterId) throw new Error('完本神站：缺少章节号（请重新进一次目录再打开）');
    var url = '/' + id + '/' + chapterId + '.html';
    var html = await this.__get(url);
    var text = this.__articleText(html);
    if (!text) {
      throw new Error('完本神站：正文页没认出正文（' + url + '，' + html.length
        + ' 字符）——站点可能改版，把运行日志发回来');
    }
    return { kind: 'text', text: text };
  },

  // ---------------------------------------------------------------- 内部工具

  __id(argument) {
    var id = '';
    if (argument && argument.id != null) id = String(argument.id).trim();
    // id 可能是纯数字，也可能是 /95449931/ 或整条 URL。
    var m = /(\d+)/.exec(id);
    if (!m) throw new Error('完本神站：缺少作品 ID');
    return m[1];
  },

  __token(value) {
    var m = /(\d+)/.exec(String(value == null ? '' : value));
    return m ? m[1] : '';
  },

  /// 分类 id → 列表地址：
  ///   数字（1–24）→ /fenlei/<id>/<页>/（第 1 页也是 /fenlei/<id>/1/）
  ///   all        → /fenlei/<页>/
  ///   rank       → /rank/（单页，没有分页）
  __listPath(category, page) {
    var id = category || '1';
    if (id === 'rank') return '/rank/';
    if (id === 'all') return '/fenlei/' + page + '/';
    if (/^\d+$/.test(id)) return '/fenlei/' + id + '/' + page + '/';
    return '/fenlei/1/' + page + '/';
  },

  /// 列表条目：以 `#newscontent` 左栏的 li 行做条目（35 条/页），
  /// 按作品 id 把 `#hotcontent .item` 的封面并进去；没有 li 行（如 /rank/）
  /// 就只用卡片。
  __items(html) {
    var covers = {};
    var cards = this.__cards(html, covers);
    var rows = this.__rows(html, covers);
    return rows.length ? rows : cards;
  },

  /// 卡片（div.item）：封面 + 书名 + 作者。顺带把「id → 封面」填进 covers。
  __cards(html, covers) {
    var items = [];
    var seen = {};
    var pattern = /<div class="item">/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var block = html.slice(match.index, match.index + CARD_WINDOW);
      var link = /<a href="\/(\d+)\/">/.exec(block);
      if (!link) continue;
      var id = link[1];
      var coverMatch = /<img[^>]+src="([^"]+)"/.exec(block);
      var cover = coverMatch ? this.__cover(coverMatch[1]) : '';
      var titleMatch = /<dt>[\s\S]{0,120}?<a href="\/\d+\/">([^<]*)<\/a>/.exec(block);
      var authorMatch = /<dt>[\s\S]{0,60}?<span>([^<]*)<\/span>/.exec(block);
      if (covers[id] == null) covers[id] = cover;
      if (seen[id]) continue;
      seen[id] = true;
      items.push({
        id: id,
        title: this.__clean(titleMatch ? titleMatch[1] : '') || ('作品 ' + id),
        cover: cover,
        subtitle: this.__clean(authorMatch ? authorMatch[1] : '') || null
      });
    }
    return items;
  },

  /// 最近更新行（`#newscontent` 左栏的 li）：本页全部条目。
  /// 只认**同时有**「书名锚点 + 最新章节锚点 + 作者」的行——右栏「好看的玄幻」
  /// 那组 li 也带 s1/s2/s5，但没有 s3/s4，靠这个把它们挡在外面。
  __rows(html, covers) {
    var start = html.indexOf('id="newscontent"');
    if (start < 0) return [];
    var end = html.indexOf('<div class="r">', start);
    if (end < 0) end = Math.min(html.length, start + 300000);
    var block = html.slice(start, end);
    var pattern = /<li>([\s\S]{0,900}?)<\/li>/g;
    var items = [];
    var seen = {};
    var match;
    while ((match = pattern.exec(block)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var row = match[1];
      var book = /class="s2"[\s\S]{0,40}?<a href="\/(\d+)\/">([^<]*)<\/a>/.exec(row);
      if (!book) continue;
      var chapter = /class="s3"[\s\S]{0,60}?<a href="\/\d+\/\d+\.html"[^>]*>([^<]*)<\/a>/.exec(row);
      var author = /class="s4">([^<]*)</.exec(row);
      var id = book[1];
      if (seen[id]) continue;
      seen[id] = true;
      items.push({
        id: id,
        title: this.__clean(book[2]) || ('作品 ' + id),
        cover: covers[id] || '',
        subtitle: this.__subtitle(author ? author[1] : '', chapter ? chapter[1] : '')
      });
    }
    return items;
  },

  __subtitle(author, chapter) {
    var bits = [];
    var name = this.__clean(author);
    var latest = this.__clean(chapter);
    if (name) bits.push('作者：' + name);
    if (latest) bits.push('最新：' + latest);
    return bits.length ? bits.join(' · ') : null;
  },

  /// 还有下一页吗：分页器里的「下一页」锚点（末页没有）。
  __hasMore(html) {
    var start = html.indexOf('class="pager"');
    var block = start < 0 ? html : html.slice(start, start + 3000);
    return /<a[^>]*href="[^"]+"[^>]*>\s*下一页\s*<\/a>/.test(block);
  },

  /// 目录：`#list dl dd a[href=/<书号>/<章节号>.html]`（锚点文本＝章节名，
  /// title 属性＝「书名 + 章节名」，用锚点文本更干净）。
  __chapters(html, id) {
    var start = html.indexOf('id="list"');
    if (start < 0) return [];
    var end = html.indexOf('</dl>', start);
    if (end < 0) end = Math.min(html.length, start + 2000000);
    var block = html.slice(start, end);
    var pattern = new RegExp('<a href="/' + id + '/(\\d+)\\.html"[^>]*>([\\s\\S]{0,120}?)</a>', 'g');
    var rows = [];
    var match;
    while ((match = pattern.exec(block)) !== null) {
      if (rows.length >= MAX_CHAPTERS) break;
      rows.push({
        id: match[1],
        title: this.__clean(match[2]) || ('第 ' + match[1] + ' 章')
      });
    }
    return rows;
  },

  __detailInfo(html) {
    var coverMatch = /id="fmimg"[\s\S]{0,200}?<img[^>]+src="([^"]+)"/.exec(html)
      || /og:image" content="([^"]+)"/.exec(html);
    // `#info` 的每行都写成「作&nbsp;&nbsp;&nbsp;&nbsp;者:观棋」——标签之间是
    // nbsp 对齐，所以先把标签换成空格、解完实体、再把空白揉平，才能用
    // 「作者[:：]」这种自然写法匹配（直接匹配「作者」永远匹配不上）。
    var info = this.__clean(this.__slice(html, 'id="info"', '</div>').replace(/<[^>]*>/g, ' '));
    var author = /作\s*者\s*[:：]\s*([^\s]{1,40})/.exec(info);
    var category = /类\s*别\s*[:：]\s*([^\s]{1,20})/.exec(info);
    var update = /最后更新\s*[:：]\s*([0-9: \-]{6,30})/.exec(info);
    var latest = /最\s*新\s*[:：]\s*([^\s]{1,80})/.exec(info);
    var status = /og:novel:status" content="([^"]*)"/.exec(html);
    var bits = [];
    var authorName = this.__clean(author ? author[1] : '');
    var categoryName = this.__clean(category ? category[1] : '');
    var updatedAt = this.__clean(update ? update[1] : '');
    var latestName = this.__clean(latest ? latest[1] : '');
    var statusName = this.__clean(status ? status[1] : '');
    if (authorName) bits.push('作者：' + authorName);
    if (categoryName) bits.push(categoryName);
    if (statusName) bits.push(statusName);
    if (updatedAt) bits.push('更新：' + updatedAt);
    if (latestName) bits.push('最新：' + latestName);
    var intro = this.__slice(html, 'id="intro"', '</div>');
    var desc = '';
    if (intro) {
      var paragraphs = [];
      var pattern = /<p[^>]*>([\s\S]*?)<\/p\s*>/g;
      var match;
      while ((match = pattern.exec(intro)) !== null) {
        var text = this.__clean(match[1]);
        // 站点自己的那句「本站提示：…推荐哦！」不是简介。
        if (!text || /本站提示|请不要忘记|推荐哦/.test(text)) continue;
        paragraphs.push(text);
      }
      desc = paragraphs.join(' ');
    }
    if (!desc) {
      // `#intro` 是空的（这一本就没有简介）时退回站点的 meta description
      // ——那是站点自己写的作品简介文案，比留空有用；不是脚本编的。
      var meta = /name="description" content="([^"]*)"/.exec(html);
      if (meta) desc = this.__clean(meta[1]);
    }
    return {
      cover: this.__cover(coverMatch ? coverMatch[1] : ''),
      subtitle: bits.length ? bits.join(' · ') : null,
      description: desc
    };
  },

  __title(html) {
    var info = this.__slice(html, 'id="info"', '</div>');
    var match = /<h1>([\s\S]{0,120}?)<\/h1>/.exec(info || html);
    if (match && this.__clean(match[1])) return this.__clean(match[1]);
    var og = /og:novel:book_name" content="([^"]*)"/.exec(html);
    return og ? this.__clean(og[1]) : '';
  },

  /// 正文：`div#content` 里的 `<p>`（站点每段都带前后空格）。
  __articleText(html) {
    var block = this.__slice(html, 'id="content"', '</div>');
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

  /// 取一段：从 anchor 起到 endMarker（不含）为止；找不到 anchor 返回 ''。
  __slice(html, anchor, endMarker) {
    var start = html.indexOf(anchor);
    if (start < 0) return '';
    var end = html.indexOf(endMarker, start);
    if (end < 0) end = Math.min(html.length, start + 400000);
    return html.slice(start, end);
  },

  /// 封面：跳过占位图、把明文 http 升级成 https（iOS 禁明文）。
  __cover(url) {
    var value = this.__entity(String(url || '')).trim();
    if (!value) return '';
    if (/nocover|nopic|default_no_thumbnail|loading|blank/i.test(value)) return '';
    if (value.indexOf('//') === 0) return 'https:' + value;
    if (/^http:\/\//i.test(value)) return value.replace(/^http:/i, 'https:');
    if (value.indexOf('http') === 0) return value;
    return base() + (value.charAt(0) === '/' ? '' : '/') + value;
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
      throw new Error('完本神站：拉取失败（HTTP ' + status + ' ' + url + '）');
    }
    if (/just a moment|checking your browser|__cf_chl|cf-chl-/.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
        + status + ' ' + url + '）');
    }
    return body;
  }
};
