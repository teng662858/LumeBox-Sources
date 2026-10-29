// LumeSource: {"id":"mfc_video","name":"MyFreeCams","version":"1.0.1","category":"video","mirrors":["https://www.myfreecams.com"]}
//
// 站点：MyFreeCams（https://www.myfreecams.com，成人直播站，全站 18+）
//
// 在线目录（1.0.1 换源，**不再需要网页渲染**）：
//   · 列表 = `GET https://profiles.myfreecams.com/online` —— 服务端渲染的 200 个
//     `<div class="model_container">`：用户名 `<div class="name"><a href="/{用户名}">`、
//     封面 `img.mfcimg.com/photos2/<组>/<uid>/avatar.90x90.jpg`、
//     大图 `profile_preview.256x192.jpg`（在 `data-mfc-profile-preview` 里，取它当封面）。
//     实测 200 / 140KB，无分页（`?page=2`、`/new`、`/popular` 都是同一批 200 个）。
//   · 详情 = 服务端渲染的 `https://profiles.myfreecams.com/{用户名}`（curl 可直取，200，32KB）。
//   · 播放 = **webplayer**。直播流地址要 WebSocket 会话里的 respkey 去换（/php/FcwExtResp.php 那条链），
//     脚本侧没有 WS，所以交给 App 的网页播放器打开主播页；在 App 的网页视图里登录过一次之后，播放器里是能直接看的。
//   · 分类 = 「在线主播」+ 热门标签。标签走 `api-edge.myfreecams.com/tags/models`
//     （499 个标签 + 每个标签的主播数），单个标签的**主播 id 列表**在 `tags/models/<标签>`
//     （`result.users`，含离线主播），所以标签分类 = 标签 id 集合 ∩ 在线目录，交集为空如实返回空。
//
// 旧版为什么废掉：首页 HTML 只有 31 个 `mfcTmpl-*` 模板（`%username_div%` 占位符），真正的在线格子
// 由 WebSocket 帧填进 DOM，所以旧版用 `LumeSource.web.render` 等渲染后再解析 `id="model_box_*"`。
// 真机上渲染回来的是**没被 WS 填过的空壳**，于是首页报「渲染后的首页没认出在线主播卡片」。
//
// 实测记录（2026-10-29，本机代理出口）：
//   · `profiles.myfreecams.com/online` → 200，200 个 model_container，`data-mfc-profile-preview` 200 image/jpeg。
//   · `api-edge.myfreecams.com/tags/models/asian` → `{"result":{"users":[8172564,…]}}`（21 个，其中 2 个在播）。
//   · `api-edge.myfreecams.com/models`、`/models/online`、`/online` 全 404（没有「按标签列主播」的 HTTP 接口）。
//   · `https://www.myfreecams.com/{用户名}` 是 404，主播主页在 **profiles.** 子域。
var BASE_URL = 'https://www.myfreecams.com';
var PROFILE_HOST = 'https://profiles.myfreecams.com';
var API_HOST = 'https://api-edge.myfreecams.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

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
    Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: base() + '/'
  };
  for (var key in extra || {}) result[key] = extra[key];
  return result;
}

async function getText(url, accept) {
  var response = await LumeSource.http.get(url, {
    headers: headers(accept ? { Accept: accept } : null)
  });
  var status = response ? response.status : 0;
  if (status !== 200) throw new Error('MyFreeCams 请求失败：HTTP ' + status + ' ' + url);
  return String((response && response.body) || '');
}

// 在线目录：**纯 HTTP 就有一份服务端渲染的**，不必渲染首页。
//   GET https://profiles.myfreecams.com/online → 200 / 140KB，200 个
//   `<div class="model_container">`：用户名在 `<div class="name"><a href="/{用户名}">`，
//   封面分别是 `img.mfcimg.com/photos2/<组>/<uid>/avatar.90x90.jpg` 与
//   更大的 `profile_preview.256x192.jpg`（data-mfc-profile-preview 属性里，免 Referer）。
//   旧版用 LumeSource.web.render 等 WebSocket 把首页格子填出来，真机上渲染回来的是**空壳**
//   → 报「渲染后的首页没认出在线主播卡片」。这条路彻底去掉了。
async function fetchOnline() {
  var html = await getText(PROFILE_HOST + '/online');
  var items = parseModels(html);
  if (!items.length) throw new Error('MyFreeCams：在线目录里没认出主播卡片（站点可能改版）');
  return items;
}

function parseModels(html) {
  var items = [];
  var seen = {};
  var blocks = String(html || '').split('class="model_container"');
  for (var i = 1; i < blocks.length; i++) {
    var block = blocks[i].slice(0, 2600);
    var nameMatch = /class="name"><a[^>]*href="\/([^"\/]+)"/.exec(block) ||
      /href="\/([A-Za-z0-9_\-]+)"[^>]*data-mfc-profile-preview/.exec(block);
    if (!nameMatch) continue;
    var username = decode(nameMatch[1]);
    if (!username || seen[username.toLowerCase()]) continue;
    var preview = /data-mfc-profile-preview="(https:\/\/[^"]+)"/.exec(block);
    var avatar = /class="avatar[^"]*"[^>]*src="(https:\/\/[^"]+)"/.exec(block) ||
      /src="(https:\/\/img\.mfcimg\.com\/[^"]+)"/.exec(block);
    // uid 只在头像路径里（/photos2/393/39327422/…），标签过滤要靠它对上号
    var uidMatch = /photos2\/\d+\/(\d+)\//.exec(avatar ? avatar[1] : block);
    seen[username.toLowerCase()] = true;
    items.push({
      id: username,
      title: username,
      cover: preview ? absolute(preview[1]) : (avatar ? absolute(avatar[1]) : ''),
      subtitle: '',
      uid: uidMatch ? String(uidMatch[1]) : ''
    });
  }
  return items;
}

/// 标签 → 在播主播 id 列表（`api-edge.myfreecams.com/tags/models/<tag>` → result.users）。
/// 这个接口给的是**全站**带标签的主播（含离线），所以要和在线目录取交集。
async function fetchTagUids(tag) {
  var raw = await getText(API_HOST + '/tags/models/' + encodeURIComponent(tag), 'application/json');
  var data = JSON.parse(raw);
  var users = (data && data.result && data.result.users) || [];
  var out = {};
  for (var i = 0; i < users.length; i++) out[String(users[i])] = true;
  return out;
}

var LumeSource = {
  id: 'mfc_video',
  name: 'MyFreeCams',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://www.myfreecams.com'],

  async categories() {
    var list = [{ id: 'online', title: '在线主播' }];
    // 标签表 40KB：缓存 12 小时，首屏不为它单跑一趟
    var cached = null;
    try {
      var raw = await LumeSource.fs.readText('tags.json');
      cached = raw ? JSON.parse(raw) : null;
    } catch (error) {
      cached = null;
    }
    if (cached && cached.list && cached.list.length && Date.now() - Number(cached.at || 0) < 12 * 3600 * 1000) {
      return list.concat(cached.list);
    }
    try {
      var body = await getText(API_HOST + '/tags/models', 'application/json');
      var data = JSON.parse(body);
      var tags = (data && data.result && data.result.tags) || [];
      tags.sort(function (a, b) {
        return Number(b.tag_count || 0) - Number(a.tag_count || 0);
      });
      var picked = [];
      for (var i = 0; i < tags.length && picked.length < 12; i++) {
        var tag = tags[i] && tags[i].tag ? String(tags[i].tag) : '';
        if (!tag) continue;
        picked.push({ id: 'tag:' + tag, title: '标签 · ' + tag });
      }
      if (picked.length) {
        try {
          await LumeSource.fs.writeText('tags.json', JSON.stringify({ at: Date.now(), list: picked }));
        } catch (error) {
          /* 缓存写不进不影响本次 */
        }
      }
      list = list.concat(picked);
    } catch (error) {
      // 标签接口挂了就只留「在线主播」，不影响浏览
    }
    return list;
  },

  async home() {
    var items = await fetchOnline();
    return [{ title: '在线主播', moreUrl: 'online', items: items.slice(0, 24) }];
  },

  async list(argument) {
    var settings = argument || {};
    var keyword = settings.keyword ? String(settings.keyword).trim().toLowerCase() : '';
    var category = settings.categoryId ? String(settings.categoryId).trim() : '';
    var items = await fetchOnline();
    if (keyword) {
      items = items.filter(function (item) {
        return String(item.title).toLowerCase().indexOf(keyword) >= 0;
      });
    } else if (category.indexOf('tag:') === 0) {
      // 标签 → 全站带该标签的主播 id → 与本机这份「在播目录」取交集。
      // 交集为空是真实情况（标签库是离线主播也算的），不拿别的分类顶替。
      var uids = await fetchTagUids(category.slice(4));
      items = items.filter(function (item) {
        return !!item.uid && uids[item.uid] === true;
      });
    }
    for (var index = 0; index < items.length; index++) delete items[index].uid;
    return { items: items, hasMore: false };
  },

  async detail(argument) {
    var username = argument && argument.id ? String(argument.id).trim() : '';
    if (!username) return null;
    var html = await getText(PROFILE_HOST + '/' + encodeURIComponent(username));
    var titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(html);
    var title = decode(titleMatch ? titleMatch[1] : '').replace(/'s Homepage on MyFreeCams\.com.*$/i, '').trim();
    if (!title) title = username;
    var coverMatch = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html) ||
      /<img[^>]+class="[^"]*avatar[^"]*"[^>]+src="([^"]+)"/i.exec(html) ||
      // 主播页没有 og:image / avatar 标签，但主题把主页大图写在 CSS 里：
      // background-image:url('https://img.mfcimg.com/photos2/393/39327422/875-240-….jpg?mfca=…')
      /background-image:url\('(https:\/\/img\.mfcimg\.com\/photos2\/[^')]+)'\)/i.exec(html);
    var descMatch = /<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]*)"/i.exec(html);
    return {
      id: username,
      title: title,
      cover: coverMatch ? absolute(coverMatch[1]) : '',
      subtitle: '直播',
      description: decode(descMatch ? descMatch[1] : '')
    };
  },

  async chapters(argument) {
    var username = argument && argument.id ? String(argument.id).trim() : '';
    if (!username) return [];
    // 直播站没有分集：给一集「进入直播间」，content() 交给网页播放器。
    return [{ id: PROFILE_HOST + '/' + encodeURIComponent(username), title: '进入直播间' }];
  },

  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    var username = argument && argument.id ? String(argument.id).trim() : '';
    var pageUrl = chapterId && chapterId.indexOf('http') === 0
      ? chapterId
      : PROFILE_HOST + '/' + encodeURIComponent(username || chapterId);
    // 直播流地址要 WebSocket 会话里的 respkey 去换（/php/FcwExtResp.php 那条链），脚本侧拿不到，
    // 所以老实交给网页播放器：App 的网页视图里登录过一次之后，这里能直接看。
    return {
      kind: 'webplayer',
      pageUrl: pageUrl,
      headers: { Referer: base() + '/', 'User-Agent': UA }
    };
  }
};
