// LumeSource: {"id":"nnhanman_comic","name":"NN韩漫","version":"1.1.0","category":"comic"}

// 站点：https://nnhanman.net （韩漫站，Cloudflare 前置）
//
// ⚠️ 写这份脚本时**本机网络到不了这个站**（TLS 握手被阻断，代理/快照站同样不通），
//    因此它是**按站点通用结构写的容错版**：列表/详情/章节/正文都用「形状识别」，
//    命中哪一套写进运行日志（`[nnhanman] …`），真机第一跑就能按日志收敛。
//
// ## v1.1.0：把「指令预算超限」修掉（真机反馈：首页直接报超出指令计数上限）
//
// 原因是 v1.0.0 里那条识别作品页的正则：
//     /^(?:https?:\/\/[^\/]+)?\/(?!…)([a-z0-9_-]*\/?)*?[a-z_-]*(\d{2,})…/
//    `([a-z0-9_-]*\/?)*?` 是**嵌套量词**：匹配失败时要穷举「多少个路径段算一次重复」的
//    每一种切分。实测（V8）：**81 个字符的链接要跑 85 秒**（30 段 19 秒、每多一段翻倍），
//    也就是指数级回溯——沙箱里就是「指令计数一路烧到上限、被原生中断回收」。
//    QuickJS 的引擎对这类串未必同样爆炸，但**这种写法本来就不该出现在图源里**。
//    修法（也是给所有源的通用做法）：
//
//   1. **不用嵌套量词正则**：链接分类改成「字符串扫描 + 数字连跑长度」，
//      单次遍历 O(n)、无回溯（见 `__isDetailHref` / `__digitRun`）；
//   2. **一次扫描、窗口有限**：列表只扫一遍锚标签，每条只看往后 `ITEM_WINDOW`
//      个字符（不再对整页反复遍历、不再做二次拼接）；
//   3. **处处封顶**：扫过的锚数量、内联图片数组长度、章节页最多翻几页都有上限；
//   4. **解析失败说清地址**：报错文案带上当前地址，真机日志能直接定位。
//
// 被 Cloudflare 拦下时抛固定标记：App 会拉起网页视图过一次校验、存下 Cookie 与 UA，
// 再自动重试这次调用（见 core/net/waf_auto_verify.dart）。

var BASE_URL = 'https://nnhanman.net';
var PAGE_SIZE = 30;
var MAX_CHAPTER_PAGES = 10;
// 一次列表解析最多看多少个锚标签 / 每条往后看多少字符（防大页面把预算烧光）。
var MAX_ANCHORS = 1200;
var ITEM_WINDOW = 700;
// 内联图片数组的最大扫描长度（章节页 HTML 可能几百 KB，只扫前面这段）。
var MAX_INLINE_SCAN = 200000;

// 「这是章节页 / 不是作品页」的廉价判据（字符串包含，不是正则）。
var CHAPTER_HINTS = ['chapter', 'capter', 'read/', '/read', '/view', '/ep', 'episode'];
// 明显不是作品页的路径片段。
var SKIP_HINTS = ['login', 'register', 'user/', '/user', 'search', 'tag', 'genre',
  'category', 'list/', '/list', 'rank', 'sort', 'page/', 'about', 'help', 'privacy'];
// 图片属性与过滤（这两条正则是**平铺**的，没有嵌套量词，安全）。
var IMAGE_ATTR = /(?:data-original|data-src|data-echo|data-lazy-src|data-url|src)=["']([^"']+\.(?:jpe?g|png|webp|avif)(?:\?[^"']*)?)["']/gi;
var SKIP_IMAGE = /logo|avatar|banner|advert|placeholder|blank|loading|icon|sprite|qrcode|share/i;
// 章节号：`chapter-12` / `/read/12/` / `ep12`（字面量交替 + 可选分隔符 + 数字，无嵌套量词）。
var CHAPTER_KEY = /(?:chapter|capter|read|view|episode|ep)[-_\/]?(\d{1,5})/i;
// 「第 N 话」这类文案。
var CHAPTER_TEXT = /第\s*([0-9零一二三四五六七八九十百千]{1,6})\s*[话話章回集]/;

var LumeSource = {
  id: 'nnhanman_comic',
  name: 'NN韩漫',
  version: '1.1.0',
  category: 'comic',

  // ---------------------------------------------------------------- 契约方法

  async categories() {
    try {
      var html = await this.__get(BASE_URL + '/');
      var found = this.__navCategories(html);
      if (found.length) {
        // 只留一行日志（真机诊断用），不做多余计算。
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
    var description = this.__clean(this.__match(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]{0,600}?)["']/i));
    if (!description) {
      description = this.__clean(this.__match(html, /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]{0,600}?)["']/i));
    }
    var author = this.__clean(this.__match(html, /(?:作者|作家|作画)[：:]\s*<[^>]*>([^<]{1,40})</));
    if (!author) author = this.__clean(this.__match(html, /(?:作者|作家|作画)[：:]\s*([^<\n]{1,40})/));
    var tags = this.__tags(html);
    return {
      id: id,
      title: title,
      cover: this.__absolute(cover),
      subtitle: author ? '作者：' + author : '',
      description: description,
      tags: tags,
      extra: { author: author }
    };
  },

  async chapters(argument) {
    var id = this.__id(argument);
    var html = await this.__get(this.__url(id));
    var chapters = this.__chapters(html);
    if (!chapters.length) {
      // 目录常在单独一页：按常见路径再试一次（最多 3 个候选，够用且不费预算）。
      var extras = ['catalog/', 'chapters/', 'list/'];
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
      if (!found.length || !this.__hasNextChapterPage(html)) break;
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
    if (keyword) {
      urls.push(BASE_URL + '/search?keyword=' + this.__encode(keyword) + (page > 1 ? '&page=' + page : ''));
      urls.push(BASE_URL + '/search/' + this.__encode(keyword) + (page > 1 ? '?page=' + page : ''));
      return urls;
    }
    if (!category || category === 'update') {
      urls.push(BASE_URL + '/' + (page > 1 ? '?page=' + page : ''));
      if (page > 1) urls.push(BASE_URL + '/page/' + page);
      return urls;
    }
    var base = category.indexOf('http') === 0 ? category : this.__absolute(category);
    urls.push(base + (page > 1 ? (base.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page : ''));
    if (page > 1) urls.push(base.replace(/\/$/, '') + '/page/' + page);
    return urls;
  },

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

  /// 分类：首页导航里「像分类页」的链接（路径含 list/category/genre/…），
  /// 文案 2–8 个字。**只扫前 MAX_ANCHORS 个锚**。
  __navCategories(html) {
    var found = [];
    var seen = {};
    var pattern = /<a\b[^>]*href=["']([^"']{1,300})["'][^>]*>([\s\S]{0,40}?)<\/a>/gi;
    var match;
    var scanned = 0;
    while ((match = pattern.exec(html)) !== null) {
      if (++scanned > MAX_ANCHORS) break;
      var href = match[1];
      if (!this.__hasAny(href, ['/list', '/category', '/genre', '/sort', '/theme', '/manhua', '/manga', '/sort/'])) continue;
      var text = this.__plain(match[2]);
      if (!text || text.length > 8) continue;
      var id = this.__absolute(href);
      if (!id || seen[id]) continue;
      seen[id] = true;
      found.push({ id: id, title: text });
      if (found.length >= 12) break;
    }
    return found;
  },

  /// 列表条目：**一次扫描**锚标签，作品页链接按「路径里有 2 位以上数字 + 不是章节页」
  /// 判定；每条只看往后 ITEM_WINDOW 个字符找标题与封面。
  __listItems(html) {
    var items = [];
    var seen = {};
    var pattern = /<a\b[^>]*href=["']([^"']{1,300})["'][^>]*>([\s\S]{0,220}?)<\/a>/gi;
    var match;
    var scanned = 0;
    while ((match = pattern.exec(html)) !== null) {
      if (++scanned > MAX_ANCHORS) break;
      if (items.length >= PAGE_SIZE * 2) break;
      var href = match[1];
      if (!this.__isDetailHref(href)) continue;
      var id = this.__absolute(href);
      if (!id || seen[id]) continue;
      var inner = match[2];
      var title = this.__plain(this.__match(inner, /title=["']([^"']{1,80})["']/i));
      if (!title) title = this.__plain(this.__match(inner, /alt=["']([^"']{1,80})["']/i));
      if (!title) title = this.__plain(inner);
      if (!title) continue;
      seen[id] = true;
      var window = html.substr(match.index, ITEM_WINDOW);
      items.push({
        id: id,
        title: title,
        cover: this.__absolute(this.__match(window, IMAGE_ATTR)),
        subtitle: this.__itemSubtitle(window)
      });
    }
    return items;
  },

  __itemSubtitle(window) {
    var update = this.__plain(this.__match(window, /(更新[^<]{0,18})</));
    if (update) return update;
    var latest = this.__plain(this.__match(window, /(第\s*[0-9]{1,5}\s*[话話章][^<]{0,10})/));
    if (latest) return latest;
    return '';
  },

  /// 作品页链接判定：**纯字符串 + 数字连跑**，无回溯。
  __isDetailHref(href) {
    var text = String(href || '');
    if (!text || text.length > 300) return false;
    if (text.charAt(0) === '#') return false;
    if (this.__hasAny(text, ['javascript:', 'mailto:'])) return false;
    if (this.__hasAny(text, CHAPTER_HINTS)) return false;
    if (this.__hasAny(text, SKIP_HINTS)) return false;
    // 末段里要有 2 位以上的数字（作品编号），或整条链接里有 3 位以上数字。
    return this.__digitRun(this.__lastSegment(text)) >= 2 || this.__digitRun(text) >= 3;
  },

  __lastSegment(text) {
    var value = text;
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

  __hasAny(text, needles) {
    for (var i = 0; i < needles.length; i++) {
      if (text.indexOf(needles[i]) >= 0) return true;
    }
    return false;
  },

  __title(html) {
    var title = this.__plain(this.__match(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,120})["']/i));
    if (!title) title = this.__plain(this.__match(html, /<h1[^>]*>([\s\S]{0,120}?)<\/h1>/i));
    if (!title) title = this.__plain(this.__match(html, /<title>([\s\S]{0,120}?)<\/title>/i));
    if (!title) return '';
    var cut = title.indexOf(' - ');
    if (cut < 0) cut = title.indexOf('_');
    if (cut < 0) cut = title.indexOf('|');
    if (cut > 0) title = title.slice(0, cut).replace(/\s+$/, '');
    return title;
  },

  __tags(html) {
    var tags = [];
    var seen = {};
    var pattern = /<a\b[^>]*href=["']([^"']{0,200})["'][^>]*>([\s\S]{0,20}?)<\/a>/gi;
    var match;
    var scanned = 0;
    while ((match = pattern.exec(html)) !== null) {
      if (++scanned > MAX_ANCHORS) break;
      if (!this.__hasAny(match[1], ['/genre/', '/tag/', '/theme/', '/sort/', '/category/'])) continue;
      var text = this.__plain(match[2]);
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
    var pattern = /<a\b[^>]*href=["']([^"']{1,300})["'][^>]*>([\s\S]{0,60}?)<\/a>/gi;
    var match;
    var scanned = 0;
    while ((match = pattern.exec(html)) !== null) {
      if (++scanned > MAX_ANCHORS) break;
      var href = match[1];
      var text = this.__plain(match[2]);
      var number = this.__chapterNumber(href, text);
      if (number === null) continue;
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

  __chapterNumber(href, text) {
    var key = CHAPTER_KEY.exec(String(href || ''));
    if (key) return Number(key[1]);
    var cn = CHAPTER_TEXT.exec(String(text || ''));
    if (cn) {
      var value = this.__cnNumber(cn[1]);
      if (value >= 0) return value;
    }
    return null;
  },

  __images(html) {
    var images = [];
    var seen = {};
    var match;
    IMAGE_ATTR.lastIndex = 0;
    while ((match = IMAGE_ATTR.exec(html)) !== null) {
      this.__pushImage(images, seen, match[1]);
      if (images.length >= 400) break;
    }
    // 内联图片数组：只扫前 MAX_INLINE_SCAN 个字符（章节页可能几百 KB）。
    var head = html.length > MAX_INLINE_SCAN ? html.slice(0, MAX_INLINE_SCAN) : html;
    var arrays = [
      /"images"\s*:\s*\[([\s\S]{0,20000}?)\]/gi,
      /(?:chapter_images|chapterImages|page_images|images|imgs)\s*[:=]\s*\[([\s\S]{0,20000}?)\]/gi
    ];
    for (var a = 0; a < arrays.length; a++) {
      var arrayMatch;
      while ((arrayMatch = arrays[a].exec(head)) !== null) {
        var itemPattern = /["']([^"']{5,300}\.(?:jpe?g|png|webp|avif)(?:\?[^"']{0,80})?)["']/gi;
        var item;
        while ((item = itemPattern.exec(arrayMatch[1])) !== null) {
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

  __hasNextPage(html, page, count) {
    var current = page > 0 ? page : 1;
    if (/(?:rel=["']next["']|下一页|下页|尾页|»)/i.test(html)) return true;
    var pattern = /[?&]page=(\d{1,4})/gi;
    var match;
    var scanned = 0;
    while ((match = pattern.exec(html)) !== null) {
      if (++scanned > 200) break;
      if (Number(match[1]) > current) return true;
    }
    return count >= PAGE_SIZE;
  },

  __hasNextChapterPage(html) {
    return /(?:下一页|下页|下一[页章]|rel=["']next["']|next)/i.test(html);
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

  /// 去掉标签与实体并压缩空白（**只为展示用的少量文本调用**）。
  __plain(text) {
    var value = String(text == null ? '' : text);
    if (value.indexOf('<') >= 0) value = value.replace(/<[^>]*>/g, ' ');
    value = value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    value = value.replace(/\s+/g, ' ').trim();
    return value;
  },

  /// 旧名保留（detail 里的简介仍走它）。
  __clean(text) {
    return this.__plain(text);
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
        out += safe ? ch : '%' + code.toString(16).toUpperCase();
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
