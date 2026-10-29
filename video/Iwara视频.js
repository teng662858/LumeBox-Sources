// LumeSource: {"id":"iwara_video","name":"Iwara","version":"1.0.2","category":"video","mirrors":["https://www.iwara.tv"]}
// 站点：https://www.iwara.tv（Iwara；前端 React SPA，**数据全在公开 JSON API 上**）
//
// ## 为什么这个源几乎不解析 HTML
//
// 页面本身是 2KB 的空壳（`<div id="root">`），所有列表/详情/播放都走
// `https://api.iwara.tv` 的公开接口（匿名可读，实测）。所以本源直接打 API：
//
//   列表   GET /videos?sort=<date|trending|likes|views>&rating=all&page=<N>&limit=32
//          返回 {count, limit, page, results:[video…]}；**page 从 0 开始**，32 条/页。
//          注意 `count` 不可靠（同一批请求里会给出 4/11/33 这种变来变去的数），
//          翻页判据用「本页是否满 32 条」。
//   标签   GET /videos?tags=<标签id>&sort=date&rating=all&page=<N>&limit=32（实测可用、可翻页）
//          GET /tags?limit=<N>  → {results:[{id, type, sensitive}]}，id 就是可读的标签名
//          （1080p / cosplay …），拿它做分类。
//   详情   GET /video/<id>
//          → {id, title, body, rating, thumbnail, numViews, numLikes, user:{name,username},
//             tags:[{id}], file:{id, type, path, name, mime, size, width, height, duration}, …}
//   播放   **两步**：详情里的 `fileUrl` 不是视频地址，而是一个**接口地址**；
//          GET <fileUrl> → [{name:"360", type:"video/mp4", src:{view:"//acheron.iwara.tv/view?hash=…"}}, …]
//          即「清晰度变体列表」。取其中最高的一档（跳过 preview 预览片），
//          `src.view` 是协议相对地址，补 `https:` 就能播。
//          匿名只给 360p（带浏览器头也一样，实测）——更高清要登录/会员，本源如实按最高档取。
//   缩略图 不需要接口给：`https://i.iwara.tv/image/thumbnail/<file.id>/thumbnail-<帧号>.jpg`
//          （这个地址实测 200 image/jpeg）。**帧号要夹到「已生成的最后 6 帧」**，见 __cover。
//
// ## 已验证 / 已知边界
//
// - **没有关键词搜索**：`/videos?query=` / `?search=` / `?q=` 实测都被忽略（用无意义词
//   返回的也是同一批），`/search` 直接 500。所以关键词搜索如实报错，不给假结果。
// - 排序里只有 date / trending / likes / views 是真的；popular / top / best 实测被忽略
//   （返回与 date 相同），没有放进分类。
// - 图片类投稿（file.type != video）在视频板块没法播，列表里直接跳过。
// - 视频直链带 `expires` 时效，所以每次播放都重新取详情 + 变体列表，不缓存。
//
// ## 纪律
// 1. `LumeSource.config` 注入的域名只影响站点地址（镜像/自定义域名），API 固定在 api.iwara.tv。
// 2. 所有请求都带 `Accept: application/json`，并检查 HTTP 与 content-type，避免把 HTML 当 JSON 解析。

var DEFAULT_BASE = 'https://www.iwara.tv';
var API_URL = 'https://api.iwara.tv';
var IMG_URL = 'https://i.iwara.tv';

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

var PAGE_SIZE = 32;
var MAX_ITEMS = 128;
var MAX_TAGS = 40;

function base() {
  var c = (typeof LumeSource !== 'undefined' && LumeSource.config) || null;
  var d = c && String(c.domain || '').replace(/\/+$/, '');
  return d || DEFAULT_BASE;
}

var LumeSource = {
  id: 'iwara_video',
  name: 'Iwara',
  version: '1.0.2',
  category: 'video',
  mirrors: ['https://www.iwara.tv'],

  async home() {
    var page = await this.__list({ sort: 'date', page: 0 });
    if (!page.items.length) throw new Error('Iwara：列表接口没返回视频（站点可能改版）');
    return [{ title: '最新', items: page.items.slice(0, 18) }];
  },

  /// 分类＝四个有效排序 + 站点的热门标签（/tags 前 40 个）。
  async categories() {
    var list = [
      { id: 'sort:date', title: '最新' },
      { id: 'sort:trending', title: '趋势' },
      { id: 'sort:likes', title: '最多点赞' },
      { id: 'sort:views', title: '最多播放' }
    ];
    try {
      var data = await this.__api('/tags?limit=' + MAX_TAGS);
      var rows = (data && data.results) || [];
      var seen = {};
      for (var i = 0; i < rows.length && list.length <= MAX_TAGS + 8; i++) {
        var tag = String(rows[i] && rows[i].id || '').trim();
        if (!tag || seen[tag]) continue;
        seen[tag] = true;
        list.push({ id: 'tag:' + tag, title: '#' + tag });
      }
    } catch (error) {
      console.warn('[iwara] 标签没取到：' + error);
    }
    return list;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page) || 1;
    if (page < 1) page = 1;
    var keyword = this.__clean(args.keyword || '');
    if (keyword) {
      // 实测 query/search/q 都被忽略、/search 500：站点搜索要登录态，本源不假装能搜。
      throw new Error('Iwara：本站接口不支持匿名搜索（query/search 参数被忽略），请用排行或标签浏览');
    }
    var category = String(args.categoryId == null ? '' : args.categoryId) || 'sort:date';
    var sort = 'date';
    var tags = '';
    if (category.indexOf('tag:') === 0) {
      tags = category.slice(4);
    } else if (category.indexOf('sort:') === 0) {
      sort = category.slice(5);
    }
    var result = await this.__list({ sort: sort, tags: tags, page: page - 1 });
    return { items: result.items, hasMore: result.hasMore };
  },

  async detail(argument) {
    var id = this.__id(argument);
    var data = await this.__api('/video/' + encodeURIComponent(id));
    if (!data || !data.id) throw new Error('Iwara：详情接口没返回视频（' + id + '）');
    return {
      id: String(data.id),
      title: this.__clean(data.title || id),
      cover: this.__cover(data),
      coverHeaders: { 'Referer': base() + '/' },
      subtitle: this.__subtitle(data),
      description: this.__description(data)
    };
  },

  async chapters(argument) {
    this.__id(argument);
    return [{ id: 'play', title: '播放' }];
  },

  async content(argument) {
    var id = this.__id(argument);
    var data = await this.__api('/video/' + encodeURIComponent(id));
    var fileUrl = data && data.fileUrl ? String(data.fileUrl) : '';
    if (!fileUrl) {
      throw new Error('Iwara：这条没有可播放文件（' + id + '）——可能已删除或需要登录');
    }
    var variants = await this.__api(fileUrl);
    if (!Array.isArray(variants) || !variants.length) {
      throw new Error('Iwara：没有拿到清晰度列表（' + id + '）');
    }
    var best = this.__pickVariant(variants);
    var url = best && best.src && best.src.view ? String(best.src.view) : '';
    if (!url) throw new Error('Iwara：清晰度列表里没有可播放地址（' + id + '）');
    if (url.indexOf('//') === 0) url = 'https:' + url;
    return {
      kind: 'video',
      url: url,
      headers: { 'Referer': base() + '/', 'User-Agent': UA }
    };
  },

  // ---------------------------------------------------------------- 数据

  async __list(query) {
    var path = '/videos?sort=' + encodeURIComponent(query.sort || 'date')
      + '&rating=all&page=' + (query.page || 0) + '&limit=' + PAGE_SIZE;
    if (query.tags) path += '&tags=' + encodeURIComponent(query.tags);
    var data = await this.__api(path);
    var rows = (data && data.results) || [];
    var items = [];
    for (var i = 0; i < rows.length && items.length < MAX_ITEMS; i++) {
      var item = this.__item(rows[i]);
      if (item) items.push(item);
    }
    return { items: items, hasMore: rows.length >= PAGE_SIZE };
  },

  async __api(path) {
    var url = /^https?:/i.test(path) ? path : API_URL + path;
    var response = await LumeSource.http.get(url, {
      headers: {
        'Accept': 'application/json',
        'Referer': base() + '/',
        'User-Agent': UA
      }
    });
    var status = response ? Number(response.status) : 0;
    var body = response && response.body ? String(response.body) : '';
    // Cloudflare 挑战：**必须走 App 的网页验证**——用户过完校验后，App 会把
    // cf_clearance 注入本源后续请求（WafSessions），而纯 HTTP 客户端永远过不去
    // （实测同一地址：Python urllib 200、Node fetch 403 + cf-mitigated: challenge）。
    if (status === 403 && /just a moment|cf-mitigated|cf-chl|__cf_chl|challenge-platform/i.test(body)) {
      throw new Error('NEED_WEBVIEW_VERIFY：Iwara 的接口需要过一次 Cloudflare 校验（' + url + '）');
    }
    if (status !== 200) {
      if (status === 403 || status === 429 || status === 503) {
        throw new Error('Iwara：接口限流或拒绝访问（HTTP ' + status + ' ' + url + '）');
      }
      throw new Error('拉取失败：HTTP ' + status + ' ' + url);
    }
    try {
      return JSON.parse(body);
    } catch (error) {
      throw new Error('Iwara：接口返回的不是 JSON（' + url + '）');
    }
  },

  /// 挑最高档清晰度：preview 是几十秒的预览片，跳过；source 视为原片最高。
  __pickVariant(variants) {
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < variants.length; i++) {
      var v = variants[i] || {};
      var name = String(v.name || '').toLowerCase();
      if (name === 'preview') continue;
      var view = v.src && v.src.view ? String(v.src.view) : '';
      if (!view) continue;
      var score = name === 'source' ? 100000 : (parseInt(name, 10) || 0);
      if (score > bestScore) { bestScore = score; best = v; }
    }
    return best || variants[0];
  },

  __item(raw) {
    if (!raw || !raw.id) return null;
    var file = raw.file || {};
    if (file.type && file.type !== 'video') return null;   // 图片投稿在视频板块跳过
    var title = this.__clean(raw.title || '');
    if (!title) return null;
    return {
      id: String(raw.id),
      title: title,
      cover: this.__cover(raw),
      coverHeaders: { 'Referer': base() + '/' },
      subtitle: this.__subtitle(raw),
      duration: this.__duration(file.duration)
    };
  },

  /// 封面：`/image/thumbnail/<file.id>/thumbnail-<帧号>.jpg`。
  ///
  /// ⚠ 帧号不能直接用接口的 `thumbnail` 字段：Iwara 只生成**最后 6 帧**（实测
  /// numThumbnails=16 的视频，只有 10..15 是真实画面，0..9 一律回一张 4.8KB 的
  /// 站点占位图 —— 黑底 + 白色船形 logo，和 iwara 自己的 favicon 一个样）。
  /// 而接口给的 `thumbnail` 是 0..15 随机，于是大量条目在 App 里显示成那张占位图。
  /// 规则：落在已生成区间就用它，否则退回最后一帧（`numThumbnails-1`，一定存在）。
  __cover(raw) {
    if (raw.customThumbnail) {
      var custom = raw.customThumbnail;
      var id = typeof custom === 'object' ? (custom.id || custom.name || '') : String(custom);
      if (id) return IMG_URL + '/image/thumbnail/' + encodeURIComponent(id)
        + '/' + encodeURIComponent(typeof custom === 'object' ? (custom.name || id + '.jpg') : id + '.jpg');
    }
    var file = raw.file || {};
    if (!file.id) return '';
    var total = Number(file.numThumbnails) || 0;
    var last = total > 0 ? total - 1 : 15;
    var lowest = Math.max(0, last - 5);
    var frame = Number(raw.thumbnail);
    if (!isFinite(frame) || frame < lowest || frame > last) frame = last;
    return IMG_URL + '/image/thumbnail/' + encodeURIComponent(file.id)
      + '/thumbnail-' + frame + '.jpg';
  },

  __subtitle(raw) {
    var parts = [];
    var user = raw.user || {};
    var name = this.__clean(user.name || user.username || '');
    if (name) parts.push(name);
    var views = Number(raw.numViews);
    if (views > 0) parts.push(views >= 10000 ? (views / 10000).toFixed(1) + '万播放' : views + '次播放');
    var created = String(raw.createdAt || '');
    if (created.length >= 10) parts.push(created.slice(0, 10));
    return parts.join(' · ');
  },

  __description(raw) {
    var text = this.__clean(raw.body || '');
    var tags = raw.tags || [];
    var names = [];
    for (var i = 0; i < tags.length && names.length < 12; i++) {
      var id = String(tags[i] && tags[i].id || '').trim();
      if (id) names.push('#' + id);
    }
    if (names.length) text = text ? text + '\n' + names.join(' ') : names.join(' ');
    return text.slice(0, 600);
  },

  __duration(seconds) {
    var s = Number(seconds);
    if (!(s > 0)) return '';
    var m = Math.floor(s / 60);
    var rest = s % 60;
    var h = Math.floor(m / 60);
    m = m % 60;
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    return h > 0 ? h + ':' + pad(m) + ':' + pad(rest) : m + ':' + pad(rest);
  },

  __clean(text) {
    return String(text == null ? '' : text)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li)>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[ \t\r\f]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .trim();
  },

  __id(argument) {
    var raw = '';
    var keys = ['id', 'itemId', 'url'];
    for (var i = 0; argument && i < keys.length && !raw; i++) {
      if (argument[keys[i]] != null) raw = String(argument[keys[i]]).trim();
    }
    var m = /\/video\/([^\/\s"'?#]+)/.exec(raw);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw;
    throw new Error('Iwara：缺少视频 ID');
  }
};
