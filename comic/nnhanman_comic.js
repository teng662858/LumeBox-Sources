// LumeSource: {"id":"nnhanman_comic","name":"NN韩漫","version":"1.0.0","category":"comic"}

// 站点：https://nnhanman.net （韩漫站，Cloudflare 前置）
//
// ⚠️ 写这份脚本时**本机网络到不了这个站**（TLS 握手被阻断，代理/快照站同样不通），
//    因此它是**按站点通用结构写的容错版**，不是照着某一版页面写死的选择器：
//
//   · 列表：先试首页（`/`），再试分类页；翻页按 `?page=N` / `/page/N` 两种写法各试一次，
//     哪个能出条目就用哪个；
//   · 条目：按「详情页链接」的形状反查（href 里带数字 id 的作品页），
//     封面在锚点附近的 `img` 上取 `data-original` / `data-src` / `src`；
//   · 详情/章节：标题优先 `og:title` → `h1` → `<title>`（去掉站点后缀）；
//     章节按链接形状（chapter/read/view/ep + 数字，或文案里的「第 N 话」）反查，
//     标题带编号时**按编号升序重排**（这类站点习惯把最新一话钉在目录首位）；
//   · 正文：`img` 的懒加载属性 + 内联的图片数组（`"images":[…]` / `chapter_images`）
//     两种都认，并排掉 logo / 广告 / 占位图。
//
//    **命中哪一套会写进运行日志**（`[nnhanman] …`），真机第一次跑如果解析不到，
//    把日志发回来就能按站点真实结构收敛（和 92 漫画那次一样的收敛路径）。
//
// 被 Cloudflare 拦下时抛固定标记：App 会拉起网页视图过一次校验、存下 Cookie 与 UA，
// 再自动重试这次调用（见 core/net/waf_auto_verify.dart）。

var BASE_URL = 'https://nnhanman.net';
var PAGE_SIZE = 30;
var MAX_CHAPTER_PAGES = 20;

// 作品页：href 里带数字编号，且不是章节 / 读者 / 分类页。
var DETAIL_HREF = /^(?:https?:\/\/[^\/]+)?\/(?!chapter|capter|read|view|ep|episode|watch|user|login|search|tag|genre|list|category|page|rank|sort)([a-z0-9_-]*\/?)*?[a-z_-]*(\d{2,})(?:\/|\.html?|$)/i;
// 章节页：chapter / read / view / ep / 第 N 话。
var CHAPTER_HREF = /(?:chapter|capter|read|view|episode|(?:^|[\/_-])ep[\/_-]?)(?:[\/_-]?)(\d+)/i;
var CHAPTER_TEXT = /第\s*([0-9〇零一二三四五六七八九十百千]+)\s*[话話章回集]/;
var IMAGE_ATTR = /(?:data-original|data-src|data-echo|data-lazy-src|data-url|src)=["']([^"']+\.(?:jpe?g|png|webp|avif)(?:\?[^"']*)?)["']/gi;
var SKIP_IMAGE = /logo|avatar|banner|advert|placeholder|blank|loading|icon|sprite|qrcode|share/i;

var LumeSource = {
  id: 'nnhanman_comic',
  name: 'NN韩漫',
  version: '1.0.0',
  category: 'comic',

  // ---------------------------------------------------------------- 契约方法

  async categories() {
    // 从首页导航里读分类（形状识别，不依赖具体 class）；读不到就给通用两项。
    try {
      var html = await this.__get(BASE_URL + '/');
      var found = this.__navCategories(html);
      if (found.length) {
        console.warn('[nnhanman] 分类从首页导航读到 ' + found.length + ' 项');
        return [{ id: '', title: '全部' }].concat(found);
      }
      console.warn('[nnhanman] 首页导航里没认出分类，用通用分类');
    } catch (error) {
      console.warn('[nnhanman] 读首页失败（' + error + '），用通用分类');
    }
    return [
      { id: '', title: '全部' },
      { id: 'update', title: '最近更新' }
    ];
  },

  async home() {
    var boards = [];
    var latest = await this.list({ categoryId: '', page: 1 });
    if (latest && latest.items && latest.items.length) {
      boards.push({ title: '最近更新', moreUrl: '', items: latest.items.slice(0, 12) });
    }
    return boards;
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!(page > 0)) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId) : '';

    var urls = this.__listUrls(category, keyword, page);
    var lastError = null;
    for (var i = 0; i < urls.length; i++) {
      try {
        var html = await this.__get(urls[i]);
        var items = this.__listItems(html);
        if (items.length) {
          console.warn('[nnhanman] 列表命中：' + urls[i] + '（' + items.length + ' 条）');
          return { items: items, hasMore: this.__hasNextPage(html, page, items.length) };
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    console.warn('[nnhanman] 这些地址都没解析出条目：' + urls.join(' , '));
    return { items: [], hasMore: false };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var url = this.__url(id);
    var html = await this.__get(url);
    var title = this.__title(html);
    if (!title) return null;
    var cover = this.__match(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (!cover) cover = this.__match(html, /<img[^>]+(?:data-original|data-src|src)=["']([^"']+)["']/i);
    var description = this.__clean(this.__match(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["']/i));
    if (!description) {
      description = this.__clean(this.__match(html, /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i));
    }
    if (!description) {
      description = this.__clean(
        this.__match(html, /<div[^>]+class=["'][^"']*(?:desc|summary|intro|abstract|comic-info)[^"']*["'][^>]*>([\s\S]{0,800}?)<\/div>/i)
      );
    }
    var author = this.__clean(this.__match(html, /(?:作者|作家|作画)[：:]\s*<[^>]*>([^<]{1,40})</));
    if (!author) author = this.__clean(this.__match(html, /(?:作者|作家|作画)[：:]\s*([^<\n]{1,40})/));
    var status = this.__clean(this.__match(html, /(?:状态|連載|连载)[：:]\s*<[^>]*>([^<]{1,20})</));
    if (!status) status = this.__clean(this.__match(html, /(?:状态|連載|连载)[：:]\s*([^<\n]{1,20})/));
    var tags = this.__tags(html);
    return {
      id: id,
      title: title,
      cover: this.__absolute(cover),
      subtitle: author ? '作者：' + author : '',
      description: description,
      tags: tags,
      extra: { author: author, status: status }
    };
  },

  async chapters(argument) {
    var id = this.__id(argument);
    var html = await this.__get(this.__url(id));
    var chapters = this.__chapters(html);
    if (!chapters.length) {
      // 目录常在单独一页：按常见路径再试一次。
      var extras = ['catalog/', 'chapters/', 'chapter/', 'list/', 'episodes/'];
      for (var i = 0; i < extras.length && !chapters.length; i++) {
        try {
          var more = await this.__get(this.__url(id, extras[i]));
          chapters = this.__chapters(more);
        } catch (error) { /* 该路径不存在就算了 */ }
      }
    }
    if (!chapters.length) {
      throw new Error('NN韩漫：目录页没认出章节链接（' + this.__url(id) + '）——把运行日志发回来收敛解析规则');
    }
    console.warn('[nnhanman] 章节 ' + chapters.length + ' 话（已按编号升序）');
    return chapters;
  },

  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId) : '';
    if (!chapterId) throw new Error('NN韩漫：缺少章节 ID（请先选择一话）');
    var path = this.__url(chapterId);
    var images = [];
    var seen = {};
    for (var page = 1; page <= MAX_CHAPTER_PAGES; page++) {
      var url = path + (page > 1 ? (path.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page : '');
      var html = await this.__get(url);
      var found = this.__images(html);
      for (var i = 0; i < found.length; i++) {
        if (!seen[found[i]]) { seen[found[i]] = true; images.push(found[i]); }
      }
      if (!found.length || !this.__hasNextChapterPage(html, page)) break;
    }
    if (!images.length) {
      throw new Error('NN韩漫：这一话没解析出图片（' + path + '）——把运行日志发回来收敛解析规则');
    }
    return { kind: 'images', images: images };
  },

  // ---------------------------------------------------------------- 地址策略

  /// 列表页候选地址：按可能性从高到低排（命中的那一个会写进日志）。
  __listUrls(category, keyword, page) {
    var urls = [];
    var suffix = page > 1 ? '?page=' + page : '';
    if (keyword) {
      urls.push(BASE_URL + '/search?keyword=' + this.__encode(keyword) + (page > 1 ? '&page=' + page : ''));
      urls.push(BASE_URL + '/search/' + this.__encode(keyword) + (page > 1 ? '?page=' + page : ''));
      urls.push(BASE_URL + '/?s=' + this.__encode(keyword) + (page > 1 ? '&paged=' + page : ''));
      return urls;
    }
    if (!category || category === 'update') {
      // 首页就是「最近更新」，翻页试两种写法。
      urls.push(BASE_URL + '/' + (page > 1 ? '?page=' + page : ''));
      if (page > 1) {
        urls.push(BASE_URL + '/page/' + page);
        urls.push(BASE_URL + '/index.php/page/' + page);
      }
      return urls;
    }
    var base = category.indexOf('http') === 0 ? category : this.__absolute(category);
    urls.push(base + suffix);
    if (page > 1) urls.push(base.replace(/\/$/, '') + '/page/' + page);
    return urls;
  },

  /// 作品 id 可能是路径（`/comic/12345/`）或纯数字；统一成绝对地址。
  __url(id, extra) {
    var value = String(id || '').trim();
    if (!value) throw new Error('NN韩漫：缺少作品 ID');
    var url = value.indexOf('http') === 0 ? value : this.__absolute(value);
    if (extra) {
      url = url.indexOf('/' + extra) >= 0 ? url : url.replace(/\/?$/, '/') + extra;
    }
    return url;
  },

  __id(argument) {
    var id = '';
    if (argument && argument.id != null) id = String(argument.id);
    else if (argument && argument.comicId != null) id = String(argument.comicId);
    else if (argument && argument.bookId != null) id = String(argument.bookId);
    if (!id) throw new Error('NN韩漫：缺少作品 ID');
    return id;
  },

  // ---------------------------------------------------------------- 解析

  /// 分类：首页导航里「像分类页」的链接（`/list/…`、`/category/…`、`/genre/…`、
  /// `/manhua/…` 这类），文案 2–8 个字、不含数字页脚。
  __navCategories(html) {
    var found = [];
    var seen = {};
    var pattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,40}?)<\/a>/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var href = match[1];
      var text = this.__clean(match[2]);
      if (!text || text.length > 8) continue;
      if (!/\/(?:list|category|genre|sort|theme|manhua|manga|comic|book)s?\//i.test(href)) continue;
      if (DETAIL_HREF.test(href) && !/\/(?:list|category|genre|sort|theme)s?\//i.test(href)) continue;
      var id = this.__absolute(href);
      if (!id || seen[id]) continue;
      seen[id] = true;
      found.push({ id: id, title: text });
      if (found.length >= 12) break;
    }
    return found;
  },

  /// 列表条目：先按「作品页链接」找锚点，再在锚点附近找封面与标题。
  __listItems(html) {
    var items = [];
    var seen = {};
    var pattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var href = match[1];
      var inner = match[2];
      if (!DETAIL_HREF.test(href) || CHAPTER_HREF.test(href)) continue;
      var id = this.__absolute(href);
      if (!id || seen[id]) continue;
      var title = this.__clean(this.__match(inner, /title=["']([^"']+)["']/i));
      if (!title) title = this.__clean(this.__match(inner, /alt=["']([^"']+)["']/i));
      if (!title) title = this.__clean(inner);
      if (!title) continue;
      // 封面：锚点内先找，找不到就往后看一小段（很多模板把 img 放在链接外面）。
      var window = inner + html.slice(match.index + match[0].length, match.index + match[0].length + 600);
      var image = this.__match(window, IMAGE_ATTR);
      seen[id] = true;
      items.push({
        id: id,
        title: title,
        cover: this.__absolute(image),
        subtitle: this.__itemSubtitle(window)
      });
      if (items.length >= PAGE_SIZE * 2) break;
    }
    return items;
  },

  __itemSubtitle(window) {
    var update = this.__clean(this.__match(window, /(更新[^<]{0,18})</));
    if (update) return update;
    var latest = this.__clean(this.__match(window, /(第\s*[0-9]+\s*[话話章][^<]{0,10})/));
    if (latest) return latest;
    return this.__clean(this.__match(window, /<[^>]+class=["'][^"']*(?:state|status|tag)[^"']*["'][^>]*>([^<]{1,12})</i));
  },

  /// 标题：og:title → h1 → `<title>`（去掉站点后缀）。
  __title(html) {
    var title = this.__clean(this.__match(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([\s\S]*?)["']/i));
    if (!title) title = this.__clean(this.__match(html, /<h1[^>]*>([\s\S]{0,120}?)<\/h1>/i));
    if (!title) title = this.__clean(this.__match(html, /<title>([\s\S]{0,120}?)<\/title>/i));
    if (!title) return '';
    var parts = title.split(/\s*[-_|·]\s*/);
    if (parts.length > 1) title = this.__clean(parts[0]);
    return title;
  },

  __tags(html) {
    var tags = [];
    var seen = {};
    var pattern = /<a[^>]+href=["'][^"']*\/(?:genre|tag|theme|sort|category)\/[^"']*["'][^>]*>([\s\S]{0,20}?)<\/a>/gi;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var text = this.__clean(match[1]);
      if (!text || text.length > 10 || seen[text]) continue;
      seen[text] = true;
      tags.push(text);
      if (tags.length >= 6) break;
    }
    return tags;
  },

  /// 章节列表：按链接形状或「第 N 话」文案找，最后**按编号升序**排。
  __chapters(html) {
    var chapters = [];
    var seen = {};
    var pattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,60}?)<\/a>/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var href = match[1];
      var text = this.__clean(match[2]);
      var number = null;
      var hrefMatch = CHAPTER_HREF.exec(href);
      if (hrefMatch) number = Number(hrefMatch[1]);
      if (number === null) {
        var textMatch = CHAPTER_TEXT.exec(text);
        if (textMatch) number = this.__cnNumber(textMatch[1]);
      }
      if (number === null || !(number >= 0)) continue;
      var id = this.__absolute(href);
      if (!id || seen[id]) continue;
      seen[id] = true;
      chapters.push({
        id: id,
        title: text && text.length <= 40 ? text : '第 ' + number + ' 话',
        number: number
      });
    }
    chapters.sort(function (a, b) { return a.number - b.number; });
    return chapters;
  },

  __images(html) {
    var images = [];
    var seen = {};
    var match;
    IMAGE_ATTR.lastIndex = 0;
    while ((match = IMAGE_ATTR.exec(html)) !== null) {
      this.__pushImage(images, seen, match[1]);
    }
    // 内联数组：`"images":[…]` / `chapter_images = […]` / `var imgs = […]`
    var arrays = [
      /"images"\s*:\s*\[([\s\S]{0,8000}?)\]/gi,
      /(?:chapter_images|chapterImages|page_images|images|imgs)\s*[:=]\s*\[([\s\S]{0,8000}?)\]/gi
    ];
    for (var a = 0; a < arrays.length; a++) {
      var arrayMatch;
      while ((arrayMatch = arrays[a].exec(html)) !== null) {
        var inside = arrayMatch[1];
        var itemPattern = /["']([^"']+\.(?:jpe?g|png|webp|avif)(?:\?[^"']*)?)["']/gi;
        var item;
        while ((item = itemPattern.exec(inside)) !== null) {
          this.__pushImage(images, seen, item[1]);
        }
      }
    }
    return images;
  },

  __pushImage(images, seen, raw) {
    var url = this.__absolute(String(raw || '').replace(/\\\//g, '/'));
    if (!url || seen[url] || SKIP_IMAGE.test(url)) return;
    if (url.indexOf('data:') === 0) return;
    seen[url] = true;
    images.push(url);
  },

  /// 还有没有下一页（列表与章节共用一套判断）。
  __hasNextPage(html, page, count) {
    var current = page > 0 ? page : 1;
    var pattern = /[?&]page=(\d+)/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (Number(match[1]) > current) return true;
    }
    if (/(?:rel=["']next["']|下一页|下页|尾页|»|›)/i.test(html)) return true;
    return count >= PAGE_SIZE;
  },

  __hasNextChapterPage(html, page) {
    if (/(?:下一页|下页|下一[页章]|next)/i.test(html) || /rel=["']next["']/i.test(html)) return true;
    return false;
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
      // 整站在 Cloudflare 后面：被拦时抛固定标记，App 自动过校验并重试同一调用。
      if (status === 403 || status === 503 || status === 429 ||
          /just a moment|__cf_chl|cf-chl|challenge-platform|cf-mitigated|checking your browser/i.test(body)) {
        throw new Error('NEED_WEBVIEW_VERIFY：NN韩漫 需要网页视图过一次 Cloudflare 校验（HTTP ' + status + ' ' + url + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    if (/<title>\s*Just a moment/i.test(body) || /challenge-platform/.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：NN韩漫 需要网页视图过一次 Cloudflare 校验（' + url + '）');
    }
    return body;
  },

  /// 相对地址补全（协议跟随站点）。
  __absolute(url) {
    var text = String(url || '').trim();
    if (!text) return '';
    if (text.indexOf('//') === 0) return 'https:' + text;
    if (text.indexOf('http') === 0) return text;
    if (text.charAt(0) === '/') return BASE_URL + text;
    return BASE_URL + '/' + text;
  },

  __match(text, pattern) {
    var match = pattern.exec(String(text || ''));
    return match && match.length > 1 ? match[1] : '';
  },

  __clean(text) {
    var value = String(text == null ? '' : text);
    value = value.replace(/<[^>]*>/g, ' ');
    value = value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    value = value.replace(/\s+/g, ' ').trim();
    return value;
  },

  /// 关键词按 UTF-8 百分号编码（沙箱里没有 encodeURIComponent 也能用）。
  __encode(text) {
    var str = String(text);
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 0x80) {
        out += /[A-Za-z0-9\-_.~]/.test(str.charAt(i)) ? str.charAt(i) : '%' + code.toString(16).toUpperCase();
      } else if (code < 0x800) {
        out += '%' + ((code >> 6) | 0xC0).toString(16).toUpperCase();
        out += '%' + ((code & 0x3F) | 0x80).toString(16).toUpperCase();
      } else {
        out += '%' + ((code >> 12) | 0xE0).toString(16).toUpperCase();
        out += '%' + (((code >> 6) & 0x3F) | 0x80).toString(16).toUpperCase();
        out += '%' + ((code & 0x3F) | 0x80).toString(16).toUpperCase();
      }
    }
    return out;
  },

  /// 「一百二十三」这类中文数字 → 123（章节标题里常见）。
  __cnNumber(text) {
    var value = String(text == null ? '' : text).trim();
    if (/^\d+$/.test(value)) return Number(value);
    var digits = { '〇': 0, '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    var units = { '十': 10, '百': 100, '千': 1000 };
    var total = 0;
    var current = 0;
    for (var i = 0; i < value.length; i++) {
      var ch = value.charAt(i);
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
