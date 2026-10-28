// LumeSource: {"id":"xingya_video","name":"星芽短剧","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://app.whjzjx.cn"]},"network":"proxy","icon":"https://app.whjzjx.cn/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：星芽短剧（App 协议）
//   鉴权  POST https://u.shytkjgs.com/user/v1/account/login（表单：device/install_first_open/…）→ data.token
//         之后请求带 authorization: token，公共头 x-app-id:7 / platform:1 / app_version:3.3.1 / device_id / manufacturer
//   列表  GET https://app.whjzjx.cn/cloud/v2/theater/home_page?theater_class_id=&type=1&class2_ids=0&page_num=&page_size=24
//   详情  GET https://app.whjzjx.cn/v2/theater_parent/detail?theater_parent_id={id}
//          → {son_title|title, cover_url, theaters:[{num, son_video_url}]}
//   播放  son_video_url 直链（mp4/m3u8），头 UA=okhttp/4.10.0
// 分类：剧场/热播剧/会员专享/星选好剧/新剧/阳光剧场（1/2/8/7/3/5）

var HOST = 'https://app.whjzjx.cn';
var AUTH = 'https://u.shytkjgs.com';
var DEVICE = '24250683a3bdb3f118dff25ba4b1cba1a';
var UA = 'okhttp/4.10.0';
var CATS = [
  { id: '1', title: '剧场' }, { id: '2', title: '热播剧' }, { id: '8', title: '会员专享' },
  { id: '7', title: '星选好剧' }, { id: '3', title: '新剧' }, { id: '5', title: '阳光剧场' },
];
var PAGE_SIZE = 24;
var _token = '';
var _tokenAt = 0;

function readJson(f) { return LumeSource.fs.readText(f).then(function (r) { if (!r) return null; try { return JSON.parse(r); } catch (e) { return null; } }).catch(function () { return null; }); }
function writeJson(f, v) { return LumeSource.fs.writeText(f, JSON.stringify(v)).catch(function () { return null; }); }
function clean(t) { return String(t == null ? '' : t).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }

function baseHdr() {
  return {
    'User-Agent': UA, Accept: 'application/json', 'x-app-id': '7', platform: '1',
    manufacturer: 'realme', version_name: '3.3.1', device_id: DEVICE, app_version: '3.3.1',
    device_platform: 'android',
  };
}

async function ensureToken() {
  if (_token && Date.now() - _tokenAt < 3600000) return _token;
  var cached = await readJson('token.json');
  if (cached && cached.token && Date.now() - Number(cached.at) < 1800000) { _token = cached.token; _tokenAt = Number(cached.at); return _token; }
  var body = 'device=' + encodeURIComponent(DEVICE) + '&install_first_open=false&first_install_time=1723214205125&last_update_time=1723214205125&report_link_url=';
  var headers = baseHdr();
  headers['Content-Type'] = 'application/x-www-form-urlencoded';
  try {
    var r = await LumeSource.http.post(AUTH + '/user/v1/account/login', body, { headers: headers });
    var j = JSON.parse(String((r && r.body) || '{}'));
    var t = (j && j.data && (j.data.token || (j.data.data && j.data.data.token))) || '';
    if (t) { _token = t; _tokenAt = Date.now(); await writeJson('token.json', { at: _tokenAt, token: t }); }
  } catch (e) { /* 拿不到 token 也会试无鉴权请求 */ }
  return _token;
}

function api(url) {
  return ensureToken().then(function (token) {
    var headers = baseHdr();
    if (token) headers.authorization = token;
    return LumeSource.http.get(url, { headers: headers }).then(function (r) {
      var s = r ? r.status : 0;
      if (!s) throw new Error('连不上：' + url);
      if (s !== 200) throw new Error('接口 HTTP ' + s);
      var j;
      try { j = JSON.parse(String(r.body || '{}')); } catch (e) { throw new Error('接口返回不是 JSON'); }
      return (j && j.data) || {};
    });
  });
}

function mapRow(x) {
  var it = (x && x.theater) || x || {};
  return {
    id: String(it.id || it.theater_id || ''),
    title: clean(it.title || it.name || it.son_title || ''),
    cover: String(it.cover_url || it.cover || ''),
    subtitle: clean(it.sub_title || it.tags || ''),
  };
}

var LumeSource = {
  id: 'xingya_video', name: '星芽短剧', version: '1.0.0', category: 'video',
  settingsApiVersion: 2, requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://app.whjzjx.cn'] },
  commonSettings: [{ key: 'pageSize', default: 24, min: 1, max: 48 }, { key: 'playbackMode', default: 'auto' }],
  settings: [{ key: 'note', type: 'info', title: '站点说明', description: '星芽短剧：App 协议，需先向 u.shytkjgs.com 换 token（源内自动登录并缓存 30 分钟）。' }],

  async categories() { return CATS; },

  async home() {
    var boards = [];
    for (var i = 0; i < 2; i++) {
      try {
        var d = await api(HOST + '/cloud/v2/theater/home_page?theater_class_id=' + CATS[i].id + '&type=1&class2_ids=0&page_num=1&page_size=' + PAGE_SIZE);
        var rows = (d && (d.list || d.theaters || d.records)) || [];
        var items = rows.map(mapRow).filter(function (x) { return x.id && x.title; });
        if (items.length) boards.push({ title: CATS[i].title, moreUrl: CATS[i].id, items: items.slice(0, 12) });
      } catch (e) { /* 跳过 */ }
    }
    return boards;
  },

  async list(argument) {
    var a = argument || {}, page = Number(a.page || 1) || 1;
    var cat = /^\d+$/.test(String(a.categoryId || '')) ? String(a.categoryId) : '1';
    var d = await api(HOST + '/cloud/v2/theater/home_page?theater_class_id=' + cat + '&type=1&class2_ids=0&page_num=' + page + '&page_size=' + PAGE_SIZE);
    var rows = (d && (d.list || d.theaters || d.records)) || [];
    var items = rows.map(mapRow).filter(function (x) { return x.id && x.title; });
    return { items: items, hasMore: items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/[^\d]/g, '');
    if (!id) return null;
    var d = await api(HOST + '/v2/theater_parent/detail?theater_parent_id=' + id);
    return {
      id: id,
      title: clean(d.son_title || d.title || ('短剧 ' + id)),
      cover: String(d.cover_url || ''),
      subtitle: clean(d.tags || ''),
      description: clean(d.intro || d.desc || '星芽短剧'),
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^\d]/g, '');
    if (!id) return [];
    var d = await api(HOST + '/v2/theater_parent/detail?theater_parent_id=' + id);
    var eps = Array.isArray(d.theaters) ? d.theaters : [];
    var out = [];
    for (var i = 0; i < eps.length; i++) {
      var u = String(eps[i].son_video_url || '');
      if (!u) continue;
      out.push({ id: 'p:' + u, title: '第' + (eps[i].num || (i + 1)) + '集' });
    }
    if (!out.length) return [{ id: 'web:' + id, title: '网页播放' }];
    return out;
  },

  async content(argument) {
    var a = argument || {}, raw = String(a.chapterId || '');
    var url = raw.indexOf('p:') === 0 ? raw.slice(2) : raw;
    if (!url || url.indexOf('web:') === 0) throw new Error('缺少播放地址');
    return { kind: 'video', url: decodeURIComponent(url), headers: { 'User-Agent': UA } };
  },
};
