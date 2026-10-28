// LumeSource: {"id":"lu320_video","name":"320lu小视频","version":"1.0.0","category":"video","mirrors":["http://yd.kmuan.com:66","http://111.62.156.183:66"],"network":"direct"}
//
// 站点：320lu 小视频（移动线 http://yd.kmuan.com:66 ，备用 http://111.62.156.183:66 ，
// title「320lu小视频官网，记录幸福生活，记录你」；成人短视频站，全站 18+）
//
// 来历：`www.320.gg` / `rzvoj.com/?u=…` / `www.fabu22.cc` 都是**发布页**（域名导航），
// 真正的站是这里的移动线。实测（2026-10-25，本机代理）：
//   · 首页           GET /                              列表在 `div#listcontent > div.citem.film-box`
//   · 分类列表       GET /vod-type-id-{分类id}-pg-{页码}.html   （分类：1=自拍、2=刺激；第 1 页 7701 页量级）
//   · 详情           GET /vod-detail-id-{id}.html         标题 h1、简介 meta[name=description]、
//                    播放参数在页内脚本：`var id/typeid/from/urlpath`（urlpath 是一个数字 id）
//   · 播放           GET /kan.php?id={id}&typeid={typeid}&from={from}&url={urlpath}
//                    → 页面里就是一条 mp4 直链（实测 206 + video/mp4）：
//                    `https://7-7.2026down.cc/{urlpath}/{urlpath}.mp4?{时间戳}`
//                    注意这条 mp4 是**一次性签名**（query 是时间戳），所以每次播放都要重新走一遍 kan.php。
//   · 搜索           站点没有可用搜索（/index.php?m=vod-search、/vod-search-wd-… 都只回 1.1KB 错误页，
//                    `/?s=` 直接回首页），所以 `list({keyword})` 老老实实返回空列表。
//   · 卡片           `<div class="citem film-box">` 里 `<a href="/vod-detail-id-{id}.html"><img …></a>`
//                    + `<a class="citemtitle" title="标题">` + `span.yy-time`（时长）
//   · 封面           图床 `img-N.ekgyh.com:8801`，不带 Referer 也能取。
//
// ## 域名口径（发布页 → 真站，2026-10-25 实测）
//   · 主站 http://yd.kmuan.com:66（移动线，内容站本体）
//   · 镜像 http://111.62.156.183:66（同一套页面，实测 47031B / 同标题；源设置里可切换）
//   · https://www.fabu22.cc/ 也是同一个 320lu（HTTPS 必须 -k 才能取，证书 CN 不匹配；
//     App 的 Dart 会校验证书 → 不作为镜像，只记录）
//   · http://www.fabu22.cc/ 只有 421B 跳转桩；rzvoj.com/?u=http://www.320.gg/&p=/ 实测 502；
//     www.320.gg 本身是发布页，不含内容 → 这几个都不进 mirrors
//   · 站点只服务 http（https://yd.kmuan.com:66 直接 TLS 失败），镜像别写 https
var DEFAULT_BASE = 'http://yd.kmuan.com:66';
var UA = 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

var CATEGORIES = [
  { id: '1', title: '自拍' },
  { id: '2', title: '刺激' }
];

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return (domain || DEFAULT_BASE).replace(/\/+$/, '');
}

function absolute(url) {
  var text = String(url == null ? '' : url).trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.indexOf('//') === 0) return 'http:' + text;
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
  if (status !== 200) throw new Error('320lu：请求失败 HTTP ' + status + ' ' + url);
  return String((response && response.body) || '');
}

// 条目解析：用「详情链接 + 紧跟的封面图」做锚点（首页与分类页的列表容器 class 有细微差别，
// 按容器切块在首页会漏，故改成锚点式）。标题取紧随其后的 `.citemtitle[title]`，没有就用 img[alt]。
function parseItems(html) {
  var items = [];
  var seen = {};
  var pattern = /href="\/vod-detail-id-(\d+)\.html"[^>]*>\s*<img[^>]*src="([^"]+)"/g;
  var matched;
  while ((matched = pattern.exec(html)) !== null) {
    var id = matched[1];
    if (seen[id]) continue;
    var window_ = html.slice(matched.index, matched.index + 900);
    var titleMatch = /class="citemtitle"[^>]*title="([^"]*)"/.exec(window_) ||
      /<img[^>]+alt="([^"]*)"/.exec(window_);
    var title = decode(titleMatch ? titleMatch[1] : '');
    if (!title) continue;
    var timeMatch = /class="yy-time"[^>]*>([^<]*)</.exec(window_);
    seen[id] = true;
    items.push({
      id: id,
      title: title,
      cover: absolute(matched[2]),
      subtitle: timeMatch ? decode(timeMatch[1]).replace(/^时长[:：]\s*/, '') : ''
    });
  }
  return items;
}
function hasMore(html) {
  return /vod-type-id-\d+-pg-\d+\.html/.test(html) && /下一页|下页/.test(html);
}

var LumeSource = {
  id: 'lu320_video',
  name: '320lu小视频',
  version: '1.0.0',
  category: 'video',
  mirrors: ['http://yd.kmuan.com:66', 'http://111.62.156.183:66'],

  async categories() {
    var list = [];
    for (var i = 0; i < CATEGORIES.length; i++) list.push({ id: CATEGORIES[i].id, title: CATEGORIES[i].title });
    return list;
  },

  async home() {
    var html = await getText('/');
    var items = parseItems(html);
    if (!items.length) throw new Error('320lu：首页没认出条目（站点可能改版或换了移动线）');
    return [{ title: '最新更新', moreUrl: '1', items: items.slice(0, 24) }];
  },

  async list(argument) {
    var settings = argument || {};
    var pageNo = Number(settings.page || 1);
    if (!pageNo || pageNo < 1) pageNo = 1;
    var keyword = settings.keyword ? String(settings.keyword).trim() : '';
    if (keyword) {
      // 站点没有可用搜索：返回空列表，不拼假地址。
      return { items: [], hasMore: false };
    }
    var category = settings.categoryId && /^\d+$/.test(String(settings.categoryId)) ? String(settings.categoryId) : '1';
    var html = await getText('/vod-type-id-' + category + '-pg-' + pageNo + '.html');
    var items = parseItems(html);
    return { items: items, hasMore: items.length > 0 && hasMore(html) };
  },

  async detail(argument) {
    var id = argument && argument.id ? String(argument.id).replace(/[^\d]/g, '') : '';
    if (!id) return null;
    var html = await getText('/vod-detail-id-' + id + '.html');
    var titleMatch = /<h1[^>]*>([\s\S]{0,200}?)<\/h1>/.exec(html) || /<title>([\s\S]*?)<\/title>/.exec(html);
    var title = decode(titleMatch ? titleMatch[1] : '').replace(/\s*在线观看.*$/, '').trim();
    if (!title) return null;
    var descMatch = /<meta[^>]+name="description"[^>]+content="([^"]*)"/.exec(html);
    // 详情页里最早出现的几张图是站点自己的广告 GIF，真正的封面是图床 img-*.ekgyh.com 上那张
    var coverMatch = /(https?:\/\/img-[^"\s]+\.(?:jpg|jpeg|png|webp))/i.exec(html);
    var timeMatch = /class="yy-time"[^>]*>([^<]*)</.exec(html);
    return {
      id: id,
      title: title,
      cover: coverMatch ? absolute(coverMatch[1]) : '',
      subtitle: timeMatch ? decode(timeMatch[1]).replace(/^时长[:：]\s*/, '') : '',
      description: decode(descMatch ? descMatch[1] : '')
    };
  },

  async chapters(argument) {
    var id = argument && argument.id ? String(argument.id).replace(/[^\d]/g, '') : '';
    if (!id) return [];
    // 单条短视频：一集「正片」，content() 现取现解播放串。
    return [{ id: id, title: '正片' }];
  },

  async content(argument) {
    var id = argument && argument.chapterId ? String(argument.chapterId).replace(/[^\d]/g, '') : '';
    if (!id) id = argument && argument.id ? String(argument.id).replace(/[^\d]/g, '') : '';
    if (!id) throw new Error('320lu：缺少视频 id');
    var detailHtml = await getText('/vod-detail-id-' + id + '.html');
    var typeMatch = /var\s+typeid\s*=\s*"([^"]*)"/.exec(detailHtml);
    var fromMatch = /var\s+from\s*=\s*"([^"]*)"/.exec(detailHtml);
    var urlMatch = /var\s+urlpath\s*=\s*"([^"]*)"/.exec(detailHtml);
    var kan = '/kan.php?id=' + encodeURIComponent(id) +
      '&typeid=' + encodeURIComponent(typeMatch ? typeMatch[1] : '1') +
      '&from=' + encodeURIComponent(fromMatch ? fromMatch[1] : '') +
      '&url=' + encodeURIComponent(urlMatch ? urlMatch[1] : id);
    var kanHtml = await getText(kan);
    var mp4 = /(https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)/i.exec(kanHtml);
    if (!mp4) {
      // 拿不到直链就交给网页播放器（带着站点 Referer）
      return {
        kind: 'webplayer',
        pageUrl: base() + '/vod-detail-id-' + id + '.html',
        headers: headers()
      };
    }
    return {
      kind: 'video',
      url: mp4[1].replace(/&amp;/g, '&'),
      headers: { Referer: base() + '/', 'User-Agent': UA, Accept: '*/*' }
    };
  }
};
