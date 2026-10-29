// LumeSource: {"id":"sex8_video","name":"杏吧","version":"1.0.1","category":"video","mirrors":["https://www.sex8.cc"]}
//
// 站点：杏吧 / 性吧（https://www.sex8.cc，华语成人社区 Discuz 论坛，全站 18+）
//   自述「杏吧性吧论坛-视频点播·图片分享·原创内容社区」，板块以**创作者专版**为主：
//   原创乱倫大神 / 玩偶姐姐 / 刘玥 / 米菲兔 / 熊猫探花 / 樱花小猫 / 伍貳柒捌 / 粉墨人生 / 原子兔兔 /
//   Siganjue / 丝丝心动 / 爱鸟萝莉 / 璐灵丝阁 / 杏吧网红版 …
//
// 结构（2026-10-25 实测，Discuz，**游客可读帖、能直接拿到 m3u8**）：
//   · 板块索引    GET /forum.html                 → `<a href="forum-{id}-1.html">板块名</a>`
//   · 板块帖表    GET /forum-{id}-{page}.html     → 帖子 `<a href="thread-{tid}-1-1.html">标题</a>`
//   · 帖子详情    GET /thread-{tid}-1-1.html      标题、正文、图片
//   · 播放        **帖子正文里就嵌着 m3u8**，实测两条都 200：
//                   https://media-server.ehgyz.com/Resource/Video/{hash}/master.m3u8   （1080p 多码率）
//                   https://www.weiixedbi.life/yzm_video/{日期}/{hash}/index.m3u8      （480p 起）
//                 要过滤站内广告视频（`adv.tuah5.net/adv/*.mp4` 之类），别当正片。
//   · 注意        帖子正文里大量出现「VIP / 金币 / 回复可见」字样，那是版规和引导文案，
//                 **不影响 m3u8 在 HTML 里明文可读**（实测游客直接能取）。
var BASE_URL = 'https://www.sex8.cc';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
// 杏吧图床在 WebP/JPEG 前塞 16 字节随机头；App 图片管线按这个声明跳过。
var COVER_HEADERS = { 'x-lume-image-encoding': 'strip-prefix-16' };

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return (domain || BASE_URL).replace(/\/+$/, '');
}

function absolute(url) {
  var text = String(url == null ? '' : url).trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.indexOf('//') === 0) return 'https:' + text;
  if (text.charAt(0) === '/') return base() + text;
  return base() + '/' + text;
}

function decode(text) {
  return String(text == null ? '' : text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headers(extra) {
  var result = {
    'User-Agent': UA,
    Accept: 'text/html,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: base() + '/'
  };
  for (var key in extra || {}) result[key] = extra[key];
  return result;
}

async function getText(target) {
  var url = /^https?:\/\//i.test(target) ? target : base() + (String(target).charAt(0) === '/' ? target : '/' + target);
  var response = await LumeSource.http.get(url, { headers: headers() });
  var status = response ? response.status : 0;
  if (status !== 200) throw new Error('杏吧：请求失败 HTTP ' + status + ' ' + url);
  return String((response && response.body) || '');
}

// 版块筛选：站务/广告/签到/活动/聊天室这类不是内容
var JUNK_BOARD = /公告|勋章|悔过|彩票|合作|招募|投诉|申请|签到|活动|任务|广告|聊天室|站务|建议|答疑|水区|兑换|新手|培训|版主|举报|意见|法庭|监督|银行|道具|竞猜|直播|电台|有声|小说|漫画|图片|图吧|性息|楼凤/;
function isJunkBoard(title) {
  return JUNK_BOARD.test(String(title || ''));
}
// 内容版块优先：专版 > 原创/网红/探店 > 其它
function boardScore(title) {
  var text = String(title || '');
  var score = 0;
  if (/专版/.test(text)) score += 40;
  if (/原创|大神|网红|探花|探店/.test(text)) score += 30;
  if (/影吧|视频|自拍|偷拍|乱伦|三级|国产/.test(text)) score += 25;
  if (/玩偶姐姐|刘玥|米菲兔|熊猫|樱花|粉墨|原子兔兔|丝丝|璐灵|爱鸟|伍貳柒捌|Siganjue/i.test(text)) score += 20;
  return score;
}
// 板块索引：forum-{id}-1.html + 板块名
function parseBoards(html) {
  var boards = [];
  var seen = {};
  var pattern = /<a[^>]+href="forum-(\d+)-1\.html"[^>]*>([^<]{2,24})<\/a>/g;
  var matched;
  while ((matched = pattern.exec(html)) !== null) {
    var id = matched[1];
    var title = decode(matched[2]);
    if (!title || seen[id]) continue;
    seen[id] = true;
    boards.push({ id: id, title: title });
  }
  return boards;
}

// 帖表：thread-{tid}-1-1.html + 标题
function parseThreads(html) {
  var items = [];
  var seen = {};
  var pattern = /<a[^>]+href="(thread-\d+-1-1\.html)"[^>]*id="thread_\d+[^"]*"[^>]*>([\s\S]{0,200}?)<\/a>|href="(thread-\d+-1-1\.html)"[^>]*class="s xst"[^>]*>([\s\S]{0,200}?)<\/a>/g;
  var matched;
  while ((matched = pattern.exec(html)) !== null) {
    var href = matched[1] || matched[3];
    var title = decode(matched[2] || matched[4] || '');
    if (!href || !title || seen[href]) continue;
    seen[href] = true;
    items.push({ id: absolute(href), title: title, cover: '', coverHeaders: COVER_HEADERS, subtitle: '' });
  }
  if (!items.length) {
    // 兜底：任何 thread-…-1-1.html 链接 + 其后的文本
    var simple = /href="(thread-\d+-1-1\.html)"[^>]*>([\s\S]{0,120}?)<\/a>/g;
    var m2;
    while ((m2 = simple.exec(html)) !== null) {
      var h2 = m2[1];
      var t2 = decode(m2[2]);
      if (!t2 || t2.length < 4 || seen[h2]) continue;
      seen[h2] = true;
      items.push({ id: absolute(h2), title: t2, cover: '', coverHeaders: COVER_HEADERS, subtitle: '' });
    }
  }
  return items;
}

// 正文里的正片 m3u8（剔除站内广告）
function mediaOf(html) {
  var found = [];
  var pattern = /(https?:\/\/[^"'\s<>\]\[]+\.m3u8[^"'\s<>\]\[]*)/gi;
  var matched;
  while ((matched = pattern.exec(html)) !== null) {
    var url = matched[1].replace(/&amp;/g, '&');
    if (/adv\.|advert|\/adv\//i.test(url)) continue;
    var dup = false;
    for (var i = 0; i < found.length; i++) if (found[i] === url) dup = true;
    if (!dup) found.push(url);
  }
  return found;
}

/* ───────────────────────── 封面（列表层带图） ─────────────────────────
 * Discuz 的版块帖表没有缩略图，只有帖子页正文里才有第一张内容图。
 * 帖子页的 `zoomfile` 常带 `?w=200&h=200`（小图），正好当封面。
 * 这里按帖子页取一次并缓存到 fs：同一帖不重复抓，列表分页/回退都复用。
 * 单次 list 最多补 12 张，避免一页 46 帖把 App 的 3–5 秒预算打穿。
 */
var COVER_CACHE = null;
var COVER_LIMIT = 12;

function threadIdOf(url) {
  var matched = /thread-(\d+)-/.exec(String(url || ''));
  return matched ? matched[1] : '';
}

function junkImage(url) {
  return /smiley|static\/image|ad_|advert|\/adv\/|logo|avatar|noavatar|icon|hrline|digest_|hot_|filetype|reply-|space\/share|imageloading|-\d{2,3}-\d{2,3}\.(?:jpe?g|png|webp)/i.test(String(url || ''));
}

// `zoomfile` 常带 `?w=200&h=200`，但图床对带尺寸参数的请求回 406；原图本身可用。
function stripSizing(url) {
  return String(url || '').replace(/\?(?:w=\d+&h=\d+|h=\d+&w=\d+)$/i, '');
}

function coverFromThread(html) {
  var text = String(html || '');
  // 只认帖内附件的 `zoomfile` / `data-imgurl` / `data-oldfile`：
  // 版头广告和头像都是普通 <img src>，不认附件属性就能避开。
  var candidates = [];
  var re = /(?:zoomfile|data-imgurl|data-oldfile)="\s*(https?:\/\/[^"\s]+)\s*"/gi;
  var matched;
  while ((matched = re.exec(text)) !== null) candidates.push(matched[1].replace(/&amp;/g, '&'));
  for (var i = 0; i < candidates.length; i++) {
    var url = stripSizing(absolute(candidates[i]));
    if (!/^https?:\/\//i.test(url) || junkImage(url)) continue;
    return url;
  }
  return '';
}

async function loadCoverCache() {
  if (COVER_CACHE) return COVER_CACHE;
  COVER_CACHE = {};
  try {
    var raw = await LumeSource.fs.readText('covers.json');
    var parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') COVER_CACHE = parsed;
  } catch (error) {
    /* 没缓存 */
  }
  return COVER_CACHE;
}

async function saveCoverCache() {
  try {
    await LumeSource.fs.writeText('covers.json', JSON.stringify(COVER_CACHE || {}));
  } catch (error) {
    /* 缓存写不进不影响本次 */
  }
}

/// 给列表条目补封面：只抓「缓存里没有」的前 limit 条，4 并发。
async function enrichCovers(items, limit) {
  var max = Number(limit == null ? COVER_LIMIT : limit);
  if (!items || !items.length || !(max > 0)) return;
  var cache = await loadCoverCache();
  var pending = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var tid = threadIdOf(item.id);
    if (!tid) continue;
    if (cache[tid]) {
      if (!item.cover) item.cover = cache[tid];
      continue;
    }
    if (!item.cover) pending.push(item);
    if (pending.length >= max) break;
  }
  if (!pending.length) return;
  var next = 0;
  var changed = false;
  async function worker() {
    while (next < pending.length) {
      var row = pending[next++];
      var tid = threadIdOf(row.id);
      try {
        var html = await getText(row.id);
        var cover = coverFromThread(html);
        if (cover) {
          row.cover = cover;
          cache[tid] = cover;
          changed = true;
        }
      } catch (error) {
        /* 单帖失败不影响列表 */
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  if (changed) await saveCoverCache();
}

var LumeSource = {
  id: 'sex8_video',
  name: '杏吧',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://www.sex8.cc'],

  async categories() {
    var list = [];
    try {
      var html = await getText('/forum.html');
      var boards = parseBoards(html);
      for (var i = 0; i < boards.length; i++) {
        var title = boards[i].title;
        if (isJunkBoard(title)) continue;
        list.push({ id: boards[i].id, title: title });
      }
      // 内容版块（专版/原创/网红/探店）排前面
      list.sort(function (a, b) {
        return boardScore(b.title) - boardScore(a.title);
      });
    } catch (error) {
      /* 索引页打不开就留空，App 会退回首页 */
    }
    return list;
  },

  async home() {
    var html = await getText('/forum.html');
    var boards = parseBoards(html);
    var boardsOut = [];
    var contentBoards = [];
    for (var b = 0; b < boards.length; b++) {
      if (isJunkBoard(boards[b].title)) continue;
      contentBoards.push(boards[b]);
    }
    contentBoards.sort(function (a, b2) { return boardScore(b2.title) - boardScore(a.title); });
    for (var i = 0; i < contentBoards.length && boardsOut.length < 3; i++) {
      boards[i] = contentBoards[i];
      try {
        var page = await getText('/forum-' + boards[i].id + '-1.html');
        var items = parseThreads(page);
        if (items.length) {
          await enrichCovers(items, 3);
          boardsOut.push({ title: boards[i].title, moreUrl: boards[i].id, items: items.slice(0, 12) });
        }
      } catch (error) {
        /* 单个板块失败不影响其它 */
      }
    }
    if (!boardsOut.length) throw new Error('杏吧：首页没认出板块帖子（站点可能改版或需要验证）');
    return boardsOut;
  },

  async list(argument) {
    var settings = argument || {};
    var pageNo = Number(settings.page || 1);
    if (!pageNo || pageNo < 1) pageNo = 1;
    var board = settings.categoryId && /^\d+$/.test(String(settings.categoryId)) ? String(settings.categoryId) : '';
    var keyword = settings.keyword ? String(settings.keyword).trim().toLowerCase() : '';
    if (!board) {
      // 没指定板块时用第一个内容板块
      var index = await getText('/forum.html');
      var boards = parseBoards(index);
      var best = null;
      var bestScore = -1;
      for (var i = 0; i < boards.length; i++) {
        if (isJunkBoard(boards[i].title)) continue;
        var score = boardScore(boards[i].title);
        if (score > bestScore) { bestScore = score; best = boards[i]; }
      }
      if (best) board = best.id;
    }
    if (!board) throw new Error('杏吧：拿不到板块 id');
    var html = await getText('/forum-' + board + '-' + pageNo + '.html');
    var items = parseThreads(html);
    if (keyword) {
      items = items.filter(function (item) {
        return String(item.title).toLowerCase().indexOf(keyword) >= 0;
      });
    }
    await enrichCovers(items, COVER_LIMIT);
    return { items: items, hasMore: items.length >= 15 };
  },

  async detail(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return null;
    var html = await getText(id);
    var titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(html) ||
      /<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html);
    var title = decode(titleMatch ? titleMatch[1] : '').split('-杏吧')[0].trim();
    if (!title) return null;
    var cover = coverFromThread(html);
    if (cover) {
      var tid = threadIdOf(id);
      if (tid) {
        var cache = await loadCoverCache();
        cache[tid] = cover;
        saveCoverCache();
      }
    }
    var media = mediaOf(html);
    return {
      id: absolute(id),
      title: title,
      cover: cover ? absolute(cover) : '',
      coverHeaders: COVER_HEADERS,
      subtitle: media.length ? '可直接播放' : '需进入帖子',
      description: ''
    };
  },

  async chapters(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return [];
    return [{ id: absolute(id), title: '正片' }];
  },

  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    var id = argument && argument.id ? String(argument.id).trim() : '';
    var pageUrl = absolute(chapterId || id);
    if (!pageUrl) throw new Error('杏吧：缺少帖子地址');
    var html = await getText(pageUrl);
    var media = mediaOf(html);
    if (media.length) {
      return {
        kind: 'video',
        url: media[0],
        headers: { Referer: base() + '/', 'User-Agent': UA, Accept: '*/*' }
      };
    }
    return { kind: 'webplayer', pageUrl: pageUrl, headers: headers() };
  }
};
