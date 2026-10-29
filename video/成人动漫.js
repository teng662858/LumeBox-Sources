// LumeSource: {"id":"xanimu_video","name":"成人动漫","version":"1.0.2","category":"video"}

// 站点：https://xanimu.one/zh-CN/（WordPress + kolortube 主题；中文站前缀 /zh-CN/）
//
// ## 域名（多镜域，脚本按顺序试并记住可用的那个）
//
//   · xanimu.art —— **首选**。实测本机直连可用（用户网络下 .one 连接被重置）；
//   · xanimu.one —— 用户给的地址；本机直连被重置，需要代理；
//   · xanimu.com —— 备选。
//   三个域名是**同一个 WordPress 站点**（同主题、同 /zh-CN/ 路径、同 ?p={id} 跳转、
//   播放地址与封面都在同一个 CDN 上）。因此脚本只在「当前用哪个域」上有差别：
//   解析规则与资源地址完全共用。可用域存在沙盒存储里，下次直接用；被拒时换下一个。
//
// ## 抓取口径（每条都对着**实时页面**核过，快照见 snapshots/xanimu_*.html）
//
//   列表  首页/分类同一套分页：`/zh-CN/`、`/zh-CN/page/{N}/`；
//         分类页 `/zh-CN/{分类路径}/`、`/zh-CN/{分类路径}/page/{N}/`；
//         站点自己的排序开关是查询串 `?filter=latest|most-viewed|longest`
//         （不带=受欢迎），分类页与首页都吃这个参数（实测）。
//   条卡  `<div class="video-block …" data-post-id="{数字id}" …>`：
//           · 标题 `<span class="title">中文标题</span>`；
//           · 封面 `<img class="video-img …">`——**首张是 src、其余是懒加载 data-src**，
//             两种都要认（只认一种会少 46/47 张封面）；
//           · 时长/观看/好评在 `<div class="video-datas">` 里（52 min / 963.1K / 78%）；
//           · 同一张卡里还有个 `img.vid-tag-info-tag-ico`（分类角标），**不是封面**，
//             所以只认 `img.video-img`。
//   分页  器里有 `a.next.page-link` 才有下一页（**末页那条整个不出现**，快照
//         xanimu_cat_last.html 实测）。
//   搜索  `/zh-CN/?s={关键词}`；翻页 `/zh-CN/page/{N}/?s={关键词}`（实测第 2 页可用）。
//         中文关键词命中率差（实测「触手」只有 1 条、「3d」有 500 条）——这是站点
//         自己的搜索行为，脚本如实透传，不替它编结果。
//   详情  `/zh-CN/?p={数字id}`（301 跳到正式地址，实测可用；因此**id 就存数字**，
//         不必解析中文 slug）。标题 `<h1>`；简介 `div.video-description`；
//         分类 `a.label-cat-video[title]`、标签 `a.label-tag-video[title]`。
//   播放  `<video …><source src="…_high.mp4?verify=…" title="high">
//         <source src="…_low.mp4?verify=…" title="low">`——两条 mp4 直链（nosofiles CDN），
//         带站点生成的 `verify` 令牌。**令牌是页面现取的**（每次 detail/content 都会
//         重新取一份新令牌），实测不带 Referer 也能播（206）。
//         页内播放器 JS 还有一条 `var toFetch="…"`（极少数视频才有）：为真时它会去
//         拉一份 JSON 拿 `videoHLS`。本脚本照这个形状兜底（未在本轮样本里出现，
//         样本内 toFetch 全是 false）。
//
// ## 站点的现实
//
//   · 整站是成人向动漫视频站，**域名在国内常被连接重置**（本机直连 .one 即如此）：
//     脚本会按域名链自动换域；全都连不上时抛网络错误（不伪造任何数据）。
//     若所有域都被挡，请在「图源 → 网络配置」里给这条源配代理。
//   · 一条视频 = 一个条目（站点没有分集），因此 chapters() 给一条「正片」，
//     清晰度（high/low 两条 mp4）走 content 的 `qualities`。

var LOCALE = '/zh-CN';

// 候选域（顺序即重试顺序）：.art 首选，见文件头。
var HOSTS = ['https://xanimu.art', 'https://xanimu.one', 'https://xanimu.com'];
var HOST_KEY = 'xanimu/host';

var PAGE_SIZE = 48;        // 列表/搜索每页条数（快照实测）
var ITEM_WINDOW = 2200;    // 单张卡往后看的窗口
var MAX_ITEMS = 200;       // 单次列表最多产出
var MAX_CHAPTERS = 1;      // 站点没有分集（留个上限，防页面异常时无限解析）
var MAX_TAGS = 12;         // 详情页标签最多收几个
var HOME_BUDGET_MS = 6000; // 首页软截止（沙箱单次调用预算是 3–10s，见 home()）
var lastHost = '';

// 站点自己的排序开关（首页与分类页共用的 ?filter=）。
var SORTS = [
  { id: 'popular', title: '受欢迎', param: '' },
  { id: 'latest', title: '最新', param: 'latest' },
  { id: 'most-viewed', title: '浏览最多', param: 'most-viewed' },
  { id: 'longest', title: '最长', param: 'longest' }
];

var LumeSource = {
  id: 'xanimu_video',
  name: '成人动漫',
  version: '1.0.2',
  category: 'video',

  // ---------------------------------------------------------------- 契约方法

  /// 分类：站点导航里的分类宫格（`a.cat-name-mobile`，实时抓，不写死）。
  /// id 存 `/zh-CN/` 之后的那段路径（含子分类，如 `9479-disney-无尽/84904阿拉丁`），
  /// 标题优先用站点的**中文展示名**（`div.menu-mobile-text-img`），没有才用英文 title。
  async categories() {
    var html = await this.__get(LOCALE + '/');
    var pattern = /<a class="cat-name-mobile" href="([^"]+)">\s*<img[^>]*title="([^"]*)"[\s\S]{0,150}?<div class="menu-mobile-text-img">([^<]*)<\/div>/g;
    var seen = {};
    var result = [{ id: 'all', title: '全部' }];
    seen['all'] = true;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var id = this.__categoryId(match[1]);
      if (!id || seen[id]) continue;
      seen[id] = true;
      var title = this.__clean(match[3]) || this.__clean(match[2]) || id;
      result.push({ id: id, title: title });
    }
    return result;
  },

  /// 筛选标签：站点自己的四个排序开关（首页顶部那排 tab，分类页同样吃这个参数）。
  async filters() {
    var options = [];
    for (var i = 0; i < SORTS.length; i++) {
      options.push({ id: SORTS[i].id, title: SORTS[i].title });
    }
    return { groups: [{ id: 'sort', title: '排序', options: options }] };
  },

  /// 首页：站点自己的两个视角（默认「受欢迎」与「最新」），各 12 条。
  ///
  /// **逐块 try/catch + 软截止**：沙箱单次调用预算是 3–10 秒，两块串行（各 ≈150KB）
  /// 在慢网络下会顶到上限、整个 home 以「调用超时」收场；到点就把已拿到的先返回。
  async home() {
    var started = new Date().getTime();
    var boards = [
      { title: '热门视频', category: 'all', sort: 'popular' },
      { title: '最新更新', category: 'sort:latest', sort: 'popular' }
    ];
    var result = [];
    for (var i = 0; i < boards.length; i++) {
      if (i > 0 && new Date().getTime() - started > HOME_BUDGET_MS) {
        console.warn('[xanimu] 首页到软截止（' + HOME_BUDGET_MS + 'ms），先返回已有的 '
          + result.length + ' 块');
        break;
      }
      try {
        var payload = await this.list({
          categoryId: boards[i].category,
          filters: { sort: boards[i].sort },
          page: 1
        });
        var items = payload && payload.items ? payload.items : [];
        if (!items.length) continue;
        result.push({
          title: boards[i].title,
          moreUrl: boards[i].category,
          items: items.slice(0, 12)
        });
      } catch (error) {
        console.warn('[xanimu] 首页「' + boards[i].title + '」失败：' + error);
      }
    }
    return result;
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!(page > 0)) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId).trim() : '';
    var sort = this.__sortParam(argument && argument.filters ? argument.filters : {});

    var url;
    if (keyword) {
      // 搜索：`/zh-CN/?s=词`，翻页是 `/zh-CN/page/{N}/?s=词`。
      url = LOCALE + (page > 1 ? '/page/' + page : '') + '/?s=' + encodeURIComponent(keyword);
      if (sort) url += '&filter=' + sort;
    } else {
      var path = '';
      if (category && category !== 'all') {
        // `sort:latest` 这类是「整站按某排序」，不是分类。
        if (category.indexOf('sort:') === 0) {
          if (!sort) sort = category.slice('sort:'.length);
        } else {
          path = '/' + this.__encPath(category);
        }
      }
      url = LOCALE + path + (page > 1 ? '/page/' + page : '') + '/';
      if (sort) url += '?filter=' + sort;
    }

    var html = await this.__get(url);
    var items = this.__items(html);
    return { items: items, hasMore: this.__hasNextPage(html) };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var html = await this.__get(this.__permLink(id));
    var info = this.__detailInfo(html);
    if (!info.title) {
      console.warn('[xanimu] 详情页没认出标题：' + id + '（' + html.length + ' 字符）');
      return null;
    }
    return {
      id: id,
      title: info.title,
      cover: info.cover,
      subtitle: info.subtitle,
      description: info.description,
      tags: info.tags,
      extra: {
        categories: info.categories.join('、'),
        duration: info.duration,
        uploadDate: info.uploadDate
      }
    };
  },

  /// 站点没有分集：一条视频就是一条。给一条「正片」当目录，
  /// 清晰度（high/low）走 content 的 qualities，不在目录里编多集。
  /// 这里**不再多发一次请求**：条目不存在时 content() 会给出可读的失败。
  async chapters(argument) {
    this.__id(argument);
    var chapters = [{ id: '1', title: '正片' }];
    return chapters.slice(0, MAX_CHAPTERS);
  },

  async content(argument) {
    var id = this.__id(argument);
    var html = await this.__get(this.__permLink(id));
    var sources = this.__sources(html);
    if (!sources.length) {
      // 页内播放器 JS 的兜底分支：`var toFetch="…"` 为真时，它会去拉一份 JSON
      // 拿 `videoHLS`。样本内都是 false（未实测到真例），因此只在**没有 mp4 直链**时
      // 才走这条路，且严格照它自己的字段名读。
      var toFetch = /var\s+toFetch\s*=\s*"([^"]+)"/.exec(html);
      if (toFetch) {
        var data = await this.__getJson(toFetch[1]);
        var hls = data && (data.videoHLS || data.videoHls || data.hls);
        if (hls) sources.push({ label: 'HLS', url: String(hls) });
      }
    }
    if (!sources.length) {
      throw new Error('XAnimu：这一条没有可播放地址（站点没给 mp4/HLS 源）——'
        + '把这条的地址发回来收敛解析规则');
    }
    return {
      kind: 'video',
      url: sources[0].url,
      // 站点的播放直链实测不带 Referer 也能取（206）；带上站点 Referer 顺手兜底。
      headers: { 'Referer': (await this.__host()) + '/' },
      qualities: sources
    };
  },

  // ---------------------------------------------------------------- 内部工具

  __id(argument) {
    var id = '';
    if (argument && argument.id != null) id = String(argument.id).trim();
    if (!id) throw new Error('XAnimu：缺少视频 ID');
    return id;
  },

  /// 条目的正式地址：WordPress 的 `?p={id}` 会 301 到 `/zh-CN/{id}-{slug}/`，
  /// 因此只需要数字 id（中文 slug 不用解析、也不用存）。
  __permLink(id) {
    return LOCALE + '/?p=' + encodeURIComponent(id);
  },

  /// 分类链接 → 分类 id（`/zh-CN/` 之后的那一段，含子分类层级）。
  __categoryId(href) {
    var text = this.__decodeAttr(href);
    var marker = text.indexOf(LOCALE + '/');
    if (marker < 0) return '';
    var rest = text.slice(marker + LOCALE.length + 1).replace(/^\/+|\/+$/g, '');
    if (!rest) return '';
    try {
      return decodeURIComponent(rest);
    } catch (error) {
      return rest;
    }
  },

  /// 排序筛选：`filters.sort` → 站点的 `?filter=` 参数值（受欢迎 = 不带参数）。
  __sortParam(filters) {
    var id = String(filters.sort || '').trim();
    for (var i = 0; i < SORTS.length; i++) {
      if (SORTS[i].id === id) return SORTS[i].param;
    }
    return '';
  },

  /// 列表/搜索页的条目。
  __items(html) {
    var items = [];
    var seen = {};
    var pattern = /<div class="video-block[^"]*"[^>]*data-post-id="(\d+)"/g;
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (items.length >= MAX_ITEMS) break;
      var id = match[1];
      if (seen[id]) continue;
      seen[id] = true;
      var block = html.slice(match.index, match.index + ITEM_WINDOW);
      var titleMatch = /<span class="title">([\s\S]{0,200}?)<\/span>/.exec(block);
      var coverMatch = /<img class="video-img[^"]*"[^>]*\ssrc="([^"]+)"/.exec(block)
        || /<img class="video-img[^"]*"[^>]*\sdata-src="([^"]+)"/.exec(block);
      var viewsMatch = /<span class="views-number[^"]*">[\s\S]{0,60}?<\/i>\s*([^<]{0,20})</.exec(block);
      var ratingMatch = /class="[^"]*rating[^"]*">[\s\S]{0,60}?<\/i>\s*([^<]{0,20})</.exec(block);
      var durationMatch = /class="[^"]*duration[^"]*">([^<]{0,20})</.exec(block);
      var parts = [];
      var duration = this.__clean(durationMatch ? durationMatch[1] : '');
      var views = this.__clean(viewsMatch ? viewsMatch[1] : '');
      var rating = this.__clean(ratingMatch ? ratingMatch[1] : '');
      if (duration) parts.push(duration);
      if (views) parts.push('观看 ' + views);
      if (rating) parts.push('好评 ' + rating);
      items.push({
        id: id,
        title: this.__clean(titleMatch ? titleMatch[1] : id),
        cover: this.__cover(coverMatch ? coverMatch[1] : ''),
        subtitle: parts.join(' · ')
      });
    }
    return items;
  },

  __detailInfo(html) {
    var titleMatch = /<div class="top-h1">\s*<h1[^>]*>([\s\S]{0,300}?)<\/h1>/.exec(html)
      || /<h1[^>]*>([\s\S]{0,300}?)<\/h1>/.exec(html);
    var title = this.__clean(titleMatch ? titleMatch[1] : '');
    var coverMatch = /<video[^>]+poster="([^"]+)"/.exec(html)
      || /"thumbnailUrl":\["([^"]+)"/.exec(html)
      || /<img class="video-img[^"]*"[^>]*\ssrc="([^"]+)"/.exec(html);
    var descMatch = /<div class="video-description">([\s\S]{0,4000}?)<\/div>/.exec(html);
    var description = this.__clean(descMatch ? descMatch[1] : '');
    if (!description) {
      // JSON-LD 的 description 是同一份文案（页面没渲染简介时用它）。
      var ld = /"@type":"VideoObject"[\s\S]{0,2000}?"description":"([^"]*)"/.exec(html);
      if (ld) description = this.__jsonText(ld[1]);
    }
    var durationMatch = /"duration":"([^"]*)"/.exec(html);
    var uploadedMatch = /"uploadDate":"([^"]*)"/.exec(html);
    var duration = this.__isoDuration(this.__jsonText(durationMatch ? durationMatch[1] : ''));
    var uploadDate = this.__jsonText(uploadedMatch ? uploadedMatch[1] : '');
    var parts = [];
    if (duration) parts.push(duration);
    var uploaded = this.__dateOnly(uploadDate);
    if (uploaded) parts.push(uploaded);
    var categories = this.__labels(html, 'label-cat-video');
    var tags = this.__labels(html, 'label-tag-video');
    return {
      title: title,
      cover: this.__cover(coverMatch ? this.__jsonText(coverMatch[1]) : ''),
      subtitle: parts.join(' · '),
      description: description,
      duration: duration,
      uploadDate: uploadDate,
      categories: categories,
      tags: tags.slice(0, MAX_TAGS)
    };
  },

  /// 详情页的分类 / 标签：`<a class="… {cls} …" href="…" title="名字"> 名字</a>`。
  __labels(html, className) {
    var pattern = new RegExp('<a[^>]+class="[^"]*' + className + '[^"]*"[^>]*title="([^"]*)"', 'g');
    var result = [];
    var match;
    while ((match = pattern.exec(html)) !== null) {
      if (result.length >= MAX_TAGS) break;
      var text = this.__clean(match[1]);
      if (text && result.indexOf(text) < 0) result.push(text);
    }
    if (!result.length) {
      // 没有 title 属性时退回锚点文本（同一套 class）。
      var textPattern = new RegExp('<a[^>]+class="[^"]*' + className + '[^"]*"[^>]*>\\s*([^<]{1,30}?)\\s*<', 'g');
      while ((match = textPattern.exec(html)) !== null) {
        if (result.length >= MAX_TAGS) break;
        var label = this.__clean(match[1]);
        if (label && result.indexOf(label) < 0) result.push(label);
      }
    }
    return result;
  },

  /// 播放源：`<source src="…" title="high|low">`（外加 `<video src>` 兜底）。
  __sources(html) {
    var sources = [];
    var seen = {};
    var tagPattern = /<source[^>]*>/g;
    var tag;
    while ((tag = tagPattern.exec(html)) !== null) {
      var srcMatch = /\ssrc="([^"]+)"/.exec(tag[0]);
      if (!srcMatch) continue;
      var url = this.__htmlDecode(srcMatch[1]);
      if (!url || seen[url]) continue;
      seen[url] = true;
      var titleMatch = /\stitle="([^"]*)"/.exec(tag[0]);
      var name = this.__clean(titleMatch ? titleMatch[1] : '');
      sources.push({ label: this.__qualityLabel(name, sources.length), url: url });
    }
    if (!sources.length) {
      var video = /<video[^>]+src="([^"]+)"/.exec(html);
      if (video) {
        sources.push({ label: '高清', url: this.__htmlDecode(video[1]) });
      }
    }
    // 站点自己的顺序是 high → low；保持原顺序（默认线路取第一条）。
    return sources;
  },

  /// 站点给的源名是 high / low；换成中文标签（站点自己的语言口径）。
  __qualityLabel(name, index) {
    var key = String(name || '').toLowerCase();
    if (key.indexOf('high') >= 0 || key.indexOf('hd') >= 0) return '高清';
    if (key.indexOf('low') >= 0 || key.indexOf('sd') >= 0) return '标清';
    if (name) return name;
    return index === 0 ? '高清' : '线路 ' + (index + 1);
  },

  /// 「还有下一页」：分页器里的 `a.next.page-link`（末页那条不出现，实测）。
  __hasNextPage(html) {
    return /<a[^>]+class="[^"]*\bnext\b[^"]*"/.test(html);
  },

  // ---------------------------------------------------------------- 网络

  /// 所有请求的唯一出口：选可用域 → 发请求 → 失败换下一个。
  async __get(path) {
    var hosts = await this.__hostList();
    var lastFailure = '';
    for (var i = 0; i < hosts.length; i++) {
      var url = hosts[i] + path;
      var response = null;
      try {
        response = await LumeSource.http.get(url, { headers: { 'Referer': hosts[i] + '/' } });
      } catch (error) {
        // 连不上（域名被重置 / DNS 失败）：换下一个域，别把这类失败当成站点错误。
        lastFailure = String(error);
        await this.__forgetHost(hosts[i]);
        continue;
      }
      var status = response ? Number(response.status) : 0;
      var body = response && response.body ? String(response.body) : '';
      if (status === 200) {
        lastHost = hosts[i];
        await this.__rememberHost(hosts[i]);
        if (/just a moment|checking your browser|attention required|__cf_chl|cf-chl-/.test(body)) {
          throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP '
            + status + ' ' + url + '）');
        }
        return body;
      }
      if (status === 403 || status === 429 || status === 503) {
        lastFailure = 'HTTP ' + status + ' ' + url;
        await this.__forgetHost(hosts[i]);
        continue;
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    if (lastFailure.indexOf('HTTP ') === 0) {
      throw new Error('NEED_WEBVIEW_VERIFY：XAnimu 的候选域都被站点防护拦下（'
        + lastFailure + '）——可在网页视图里过一次校验再重试');
    }
    throw new Error('连接不上 XAnimu（候选域：' + hosts.join('、') + '；最后一次失败：'
      + lastFailure + '）。该站域名在国内常被连接重置——可在图源网络配置里填代理。');
  },

  /// 取 JSON（播放器兜底分支用）。
  async __getJson(url) {
    var text = await this.__get(url.indexOf('http') === 0 ? url : '/' + url);
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error('XAnimu：播放信息不是合法 JSON（' + url + '）');
    }
  },

  async __hostList() {
    var hosts = [];
    try {
      var saved = await LumeSource.fs.readText(HOST_KEY);
      if (saved && saved.indexOf('http') === 0) hosts.push(saved);
    } catch (error) { /* 读不到就按默认顺序 */ }
    for (var i = 0; i < HOSTS.length; i++) {
      if (hosts.indexOf(HOSTS[i]) < 0) hosts.push(HOSTS[i]);
    }
    return hosts;
  },

  async __host() {
    var list = await this.__hostList();
    return list[0];
  },

  async __rememberHost(host) {
    try {
      var saved = await LumeSource.fs.readText(HOST_KEY);
      if (saved !== host) await LumeSource.fs.writeText(HOST_KEY, host);
    } catch (error) { /* 存不下也能用 */ }
  },

  async __forgetHost(host) {
    try {
      var saved = await LumeSource.fs.readText(HOST_KEY);
      if (saved === host) await LumeSource.fs.remove(HOST_KEY);
    } catch (error) { /* 删不掉也不影响本次 */ }
  },

  // ---------------------------------------------------------------- 文本

  /// 站点页面里的封面仍指向旧图床 `*.7132p.net/storage/...`（实测 404）；
  /// 同一路径在当前内容域（xanimu.art/.one/.com）是 200。只重写这一类地址，
  /// 其它 CDN/相对地址原样保留。
  __cover(url) {
    var value = this.__absolute(url);
    var match = /^https?:\/\/([^\/]+)(\/storage\/.*)$/i.exec(value);
    if (match && /7132p\.net$/i.test(match[1])) {
      var host = lastHost || HOSTS[0];
      return host.replace(/\/+$/, '') + match[2];
    }
    return value;
  },

  __absolute(url) {
    var value = this.__jsonText(String(url || '').trim());
    if (!value) return '';
    if (value.indexOf('http') === 0) return value;
    if (value.indexOf('//') === 0) return 'https:' + value;
    return value;
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

  __encPath(path) {
    var parts = String(path || '').split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      out.push(parts[i] ? encodeURIComponent(parts[i]) : parts[i]);
    }
    return out.join('/');
  },

  __htmlDecode(text) {
    return String(text || '')
      .replace(/&amp;/g, '&')
      .replace(/&#038;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  },

  /// JSON 字符串里的转义（`\/` 之类）还原成可读文本。
  __jsonText(text) {
    return this.__htmlDecode(String(text || '').replace(/\\\//g, '/'));
  },

  __clean(text) {
    return this.__htmlDecode(String(text || '').replace(/<[^>]*>/g, ' '))
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /// ISO8601 时长（PT0H52M28S）→「52 分 28 秒」；认不出就原样返回。
  __isoDuration(text) {
    var value = String(text || '').trim();
    var match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(value);
    if (!match) return value;
    var days = Number(match[1] || 0);
    var hours = Number(match[2] || 0) + days * 24;
    var minutes = Number(match[3] || 0);
    var seconds = Number(match[4] || 0);
    var parts = [];
    if (hours) parts.push(hours + ' 小时');
    if (minutes) parts.push(minutes + ' 分');
    if (seconds && !hours) parts.push(seconds + ' 秒');
    return parts.join(' ');
  },

  /// ISO8601 时间戳（2019-06-05T22:18:36+00:00）→ 只留日期。
  __dateOnly(text) {
    var match = /^(\d{4}-\d{2}-\d{2})/.exec(String(text || ''));
    return match ? match[1] : '';
  }
};
