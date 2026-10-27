// LumeSource: {"id":"ysxq-boju","name":"播剧网（ysxq）","version":"1.0.1","category":"video","mirrors":["https://ysxq.cc"],"icon":"https://ysxq.cc/template/dsn2/static/img/ico.png"}
//
// 站点：ysxq.cc（页脚自报「播剧网」，同源主站 www.boju.cc）
// 数据源：苹果CMS（MacCMS v10）标准 vod 接口 —— /api.php/provide/vod/
//   · 分类 + 列表：?ac=list / ?ac=detail&pg=N&t=分类ID
//   · 搜索：      ?ac=detail&wd=关键词&pg=N
//   · 详情：      ?ac=detail&ids=影片ID
//   · 播放地址：详情里的 vod_play_url（多线路 $$$ 分隔，集间 # 分隔，集名与地址 $ 分隔），
//               实测为可直接播放的 m3u8（无需 Referer）。
//
// 契约：categories / list / detail / chapters / content（+ home）。
// 设计要点：章节 id 直接就是播放地址，所以点开即播、不用二次请求（沙箱单次预算 3–5 秒）。
var BASE_URL = 'https://ysxq.cc';
var API = '/api.php/provide/vod/';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

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

async function api(query) {
  var url = base() + API + query;
  var response = await LumeSource.http.get(url, { headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*' } });
  if (!response || response.status !== 200) {
    throw new Error('播剧网接口不可用：HTTP ' + (response ? response.status : 0) + ' ' + query);
  }
  var data;
  try {
    data = response.json();
  } catch (error) {
    throw new Error('播剧网接口返回的不是 JSON：' + query);
  }
  if (!data || (data.code != null && Number(data.code) !== 1)) {
    throw new Error('播剧网接口返回异常：' + (data && data.msg ? data.msg : '缺少数据'));
  }
  return data;
}

function picture(raw) {
  var url = absolute(raw);
  if (!url) return '';
  // 站内的 /img.php?url= 代理图在 App 里可能拿不到，能直连就直连。
  var proxied = /[?&]url=([^&]+)/.exec(url);
  if (/\/img\.php/i.test(url) && proxied) {
    try {
      return decodeURIComponent(proxied[1]);
    } catch (error) {
      return url;
    }
  }
  return url.replace(/^http:\/\//i, 'https://');
}

function subtitleOf(vod) {
  var parts = [];
  if (vod.vod_remarks) parts.push(String(vod.vod_remarks));
  if (vod.vod_year) parts.push(String(vod.vod_year));
  if (vod.vod_area) parts.push(String(vod.vod_area));
  return parts.join(' · ');
}

function itemsOf(rows) {
  var items = [];
  for (var i = 0; i < rows.length; i++) {
    var vod = rows[i];
    if (!vod || vod.vod_id == null) continue;
    items.push({
      id: String(vod.vod_id),
      title: String(vod.vod_name || '').trim(),
      cover: picture(vod.vod_pic || vod.vod_pic_thumb),
      subtitle: subtitleOf(vod)
    });
  }
  return items;
}

// 详情里的播放串 → [{id: 播放地址, title: 线路 · 集名}]
function chaptersOf(vod) {
  var froms = String(vod.vod_play_from || '').split('$$$');
  var groups = String(vod.vod_play_url || '').split('$$$');
  var chapters = [];
  var seen = {};
  for (var road = 0; road < groups.length; road++) {
    var roadName = (froms[road] || ('线路' + (road + 1))).trim();
    var episodes = groups[road].split('#');
    for (var index = 0; index < episodes.length; index++) {
      var entry = episodes[index];
      if (!entry) continue;
      var at = entry.indexOf('$');
      var name = at >= 0 ? entry.slice(0, at) : '第' + (index + 1) + '集';
      var link = at >= 0 ? entry.slice(at + 1) : entry;
      link = String(link || '').trim();
      if (!link || link.indexOf('://') < 0) continue;
      if (seen[link]) continue;
      seen[link] = true;
      chapters.push({
        id: link,
        title: (groups.length > 1 ? roadName + ' · ' : '') + (name.trim() || '第' + (index + 1) + '集')
      });
    }
  }
  return chapters;
}

function detailOf(vod) {
  var description = String(vod.vod_content || vod.vod_blurb || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  var actors = String(vod.vod_actor || '').trim();
  var directors = String(vod.vod_director || '').trim();
  var extra = [];
  if (directors) extra.push('导演：' + directors);
  if (actors) extra.push('主演：' + actors);
  if (extra.length) description = extra.join('／') + (description ? '\n' + description : '');
  return {
    id: String(vod.vod_id),
    title: String(vod.vod_name || '').trim(),
    cover: picture(vod.vod_pic || vod.vod_pic_thumb),
    subtitle: subtitleOf(vod),
    description: description
  };
}

async function detailVod(id) {
  var data = await api('?ac=detail&ids=' + encodeURIComponent(String(id == null ? '' : id)));
  var rows = Array.isArray(data.list) ? data.list : [];
  return rows.length ? rows[0] : null;
}

var LumeSource = {
  id: 'ysxq-boju',
  name: '播剧网（ysxq）',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://ysxq.cc'],

  async categories() {
    var cached = await LumeSource.fs.readText('classes.json');
    if (cached) {
      try {
        var hit = JSON.parse(cached);
        if (hit && hit.length) return hit;
      } catch (error) {
        /* 缓存坏了就重抓 */
      }
    }
    var data = await api('?ac=list&pg=1');
    var rows = Array.isArray(data.class) ? data.class : [];
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || row.type_id == null) continue;
      if (Number(row.type_pid || 0) !== 0) continue;
      list.push({ id: String(row.type_id), title: String(row.type_name || '') });
    }
    if (list.length) await LumeSource.fs.writeText('classes.json', JSON.stringify(list));
    return list;
  },

  async home() {
    var data = await api('?ac=detail&pg=1&limit=18');
    var rows = Array.isArray(data.list) ? data.list : [];
    var items = itemsOf(rows);
    return items.length ? [{ title: '最新更新', moreUrl: '1', items: items }] : [];
  },

  async list(argument) {
    var page = argument && argument.page ? Number(argument.page) : 1;
    if (!page || page < 1) page = 1;
    var keyword = argument && argument.keyword ? String(argument.keyword).trim() : '';
    var category = argument && argument.categoryId ? String(argument.categoryId) : '';
    var query;
    if (keyword) {
      query = '?ac=detail&wd=' + encodeURIComponent(keyword) + '&pg=' + page;
    } else {
      query = '?ac=detail&pg=' + page + (category ? '&t=' + encodeURIComponent(category) : '') + '&limit=24';
    }
    var data = await api(query);
    var rows = Array.isArray(data.list) ? data.list : [];
    var pagecount = Number(data.pagecount || 1);
    return { items: itemsOf(rows), hasMore: rows.length > 0 && page < pagecount };
  },

  async detail(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return null;
    var vod = await detailVod(id);
    return vod ? detailOf(vod) : null;
  },

  async chapters(argument) {
    var id = argument && argument.id ? String(argument.id) : '';
    if (!id) return [];
    var vod = await detailVod(id);
    return vod ? chaptersOf(vod) : [];
  },

  async content(argument) {
    var chapterId = argument && argument.chapterId ? String(argument.chapterId).trim() : '';
    var page = chapterId || (argument && argument.id ? String(argument.id) : '');
    if (!page) throw new Error('缺少播放地址（chapterId 为空）');
    if (/^https?:\/\//i.test(page) && /\.(m3u8|mp4|flv|mpd|ts)(\?|#|$)/i.test(page)) {
      return { kind: 'video', url: page };
    }
    if (/^https?:\/\//i.test(page)) {
      // 非直链（极少数线路给的是播放页）：交给 App 的网页解析。
      return { kind: 'webplayer', pageUrl: page, headers: { Referer: base() + '/', 'User-Agent': UA } };
    }
    // 兼容：chapterId 传的是「集名$地址」或裸地址片段。
    var at = page.indexOf('$');
    var link = at >= 0 ? page.slice(at + 1) : page;
    if (/^https?:\/\//i.test(link)) {
      return { kind: 'video', url: link };
    }
    throw new Error('无法识别的播放地址：' + page);
  }
};
