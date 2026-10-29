// LumeSource: {"id":"twitthub_video","name":"TwittHub","version":"1.0.1","category":"video","contentCategory":"adult","mirrors":["https://www.twitthub.com"],"network":"proxy","icon":"https://www.twitthub.com/icon.png"}
// LumeRuntime: javascript
//
// 站点：TwittHub（https://www.twitthub.com）—— X（Twitter）公开视频聚合，5052 条、211 页。
//
// 一、Vercel 安全校验
//   纯 HTTP 请求一律 429 + 「Vercel Security Checkpoint」（连 favicon / robots.txt 都拦）。
//   和 Cloudflare 一样只能靠浏览器过校验：源里首次点一次「网页视图」，
//   App 会把校验后的会话 Cookie 存进站点会话池，之后 LumeSource.http 自动带上。
//   （命令行 harness 没有会话，会看到 429 —— 预期行为。）
//
// 二、结构（用真实浏览器 DOM 核对过）
//   列表   /?page={N}        24 条/页；?page=211 是最后一页
//   详情   /v/{id}
//   卡片   <article …><a href="/v/2114345956816859553" aria-label="观看@xxx 分享的视频">
//            <img src="https://xfxkakxliqyajlyjhaub.supabase.co/storage/v1/object/public/images/…/thumbnail/….webp">
//            …时长 6:48…作者 @xxx
//   播放   详情页的 <video> 没有内联 src（JS 现取），所以 content() 用 webplayer 交给内嵌浏览器播放。
//   缩略图在 Supabase 公共桶里，直连可取；视频文件在 z6v2p9a8.bkcdn.net。
// 18+

var BASE_URL = 'https://www.twitthub.com';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PAGE_SIZE = 24;
var MAX_PAGE = 211;

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return (domain || BASE_URL).replace(/\/+$/, '');
}

function readJson(file) {
  return LumeSource.fs.readText(file).then(function (raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (error) { return null; }
  }).catch(function () { return null; });
}

function writeJson(file, value) {
  return LumeSource.fs.writeText(file, JSON.stringify(value)).catch(function () { return null; });
}

function clean(text) {
  return String(text == null ? '' : text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/// Vercel 的校验页有时不立刻回 429，而是把连接吊着 —— App 侧只会看到「执行超时」，
/// 用户拿不到任何可操作的信息。这里给单次请求加 6 秒上限，到点就按校验页报错。
/// 沙箱没有 setTimeout 时（部分宿主/离线检查器）自动跳过这层，退回原样等待。
function raceTimeout(promise, ms, message) {
  if (typeof setTimeout !== 'function') return promise;
  var timer = null;
  var guard = new Promise(function (resolve, reject) {
    timer = setTimeout(function () {
      reject(new Error(message));
    }, ms);
  });
  return Promise.race([promise, guard]).then(
    function (value) {
      if (timer) clearTimeout(timer);
      return value;
    },
    function (error) {
      if (timer) clearTimeout(timer);
      throw error;
    }
  );
}

function checkpointError(path) {
  return new Error(
    '站点要过 Vercel 安全校验：先在源里点一次「网页视图」完成校验，再回来重试（' + path + '）'
  );
}

function get(path) {
  var request = LumeSource.http.get(base() + path, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: base() + '/',
    },
  });
  return raceTimeout(request, 6000, '站点要过 Vercel 安全校验：请求 6 秒没有响应，先在源里点一次「网页视图」再回来重试（' + path + '）')
    .then(function (reply) {
      var status = reply ? reply.status : 0;
      if (status === 429 || status === 403) throw checkpointError(path);
      if (status !== 200) throw new Error('页面打不开：HTTP ' + status + '（' + path + '）');
      return reply.body ? String(reply.body) : '';
    });
}

function parseCards(html) {
  var text = String(html || '');
  var items = [];
  var seen = {};
  var re = /<article[^>]*>([\s\S]*?)<\/article>/g;
  var matched;
  while ((matched = re.exec(text)) !== null) {
    var block = matched[1];
    var href = (/href="\/v\/(\d+)"/.exec(block) || [])[1];
    if (!href || seen[href]) continue;
    var thumb = (/<img[^>]+src="(https:\/\/[^"]+\.(?:webp|jpg|jpeg|png))"/.exec(block) || [])[1] || '';
    var author = (/@[A-Za-z0-9_]{2,20}/.exec(block) || [])[0] || '';
    var duration = (/<span[^>]*>(\d{1,2}:\d{2}(?::\d{2})?)<\/span>/.exec(block) || [])[1] || '';
    // 卡片里没有单独标题，用「作者 · 时长」当标题，正文里再给日期/播放量
    var meta = clean(block.replace(/<[^>]+>/g, ' '));
    var dateMatch = /(\d{1,2}月\d{1,2}日)/.exec(meta);
    var date = dateMatch ? dateMatch[1] : '';
    seen[href] = true;
    items.push({
      id: href,
      title: (author || 'X 视频') + (duration ? ' · ' + duration : '') + (date ? ' · ' + date : ''),
      cover: thumb,
      subtitle: [duration, date].filter(Boolean).join(' · '),
    });
  }
  return items;
}

function remember(items) {
  if (!items.length) return Promise.resolve(null);
  return readJson('items.json').then(function (cached) {
    var map = (cached && cached.map) ? cached.map : {};
    for (var i = 0; i < items.length; i++) map[items[i].id] = { title: items[i].title, cover: items[i].cover, subtitle: items[i].subtitle };
    return writeJson('items.json', { at: Date.now(), map: map });
  });
}

var LumeSource = {
  id: 'twitthub_video',
  name: 'TwittHub',
  version: '1.0.1',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://www.twitthub.com'],

  async categories() {
    return [{ id: 'latest', title: '最新' }];
  },

  async home() {
    var items = await this.list({ page: 1 });
    if (!items.items.length) return [];
    return [{ title: '最新视频', moreUrl: 'latest', items: items.items.slice(0, 12) }];
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    if (page > MAX_PAGE) page = MAX_PAGE;
    var html = await get(page <= 1 ? '/' : '/?page=' + page);
    var items = parseCards(html);
    await remember(items);
    return { items: items, hasMore: page < MAX_PAGE && items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return null;
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    return {
      id: id,
      title: row && row.title ? row.title : ('视频 ' + id),
      cover: row && row.cover ? row.cover : '',
      subtitle: row && row.subtitle ? row.subtitle : '',
      description: '源站：' + base() + '/v/' + id + '\n来自 X 的公开视频；播放交给 App 内嵌浏览器（站点有 Vercel 校验，首次点一次网页视图即可）。',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'web:' + id, title: '网页播放' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少视频 ID');
    return { kind: 'webplayer', url: base() + '/v/' + id };
  },
};
