// LumeSource: {"id":"rebo_video","name":"热播·极速","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["http://v.rbotv.cn"]},"network":"proxy","icon":"http://v.rbotv.cn/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：热播·极速（http://v.rbotv.cn）—— App 协议接口，POST multipart + md5 签名。
//   签名：timestamp = 秒级时间戳；sign = md5(KEY + timestamp)；KEY = 7gp0bnd2sr85ydii2j32pcypscoc4w6c7g5spl
//   分类 /v3/type/top_type                 → list[].{type_id,type_name}
//   首页 /v3/type/tj_vod                    → {cai:[], loop:[]}
//   列表 /v3/home/type_search {type_id,limit,page} → {list[]}
//   搜索 /v3/home/search {limit,page,keyword}      → {list[]}
//   详情 /v3/home/vod_details {vod_id}      → vod_play_list[].{flag, urls[].url, parse_urls, referer, ua}
//   条目字段：vod_id / vod_name / vod_pic / vod_remarks
// 播放：urls[].url 是真实地址（m3u8/mp4 直接播；否则交给内嵌浏览器）

var HOST = 'http://v.rbotv.cn';
var KEY = '7gp0bnd2sr85ydii2j32pcypscoc4w6c7g5spl';
var UA = 'okhttp-okgo/jeasonlzy';
var PAGE_SIZE = 12;

function base() { var d = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : ''; return (d || HOST).replace(/\/+$/, ''); }
function readJson(f) { return LumeSource.fs.readText(f).then(function (r) { if (!r) return null; try { return JSON.parse(r); } catch (e) { return null; } }).catch(function () { return null; }); }
function writeJson(f, v) { return LumeSource.fs.writeText(f, JSON.stringify(v)).catch(function () { return null; }); }
function clean(t) { return String(t == null ? '' : t).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function img(u) { var s = String(u || '').trim(); if (!s) return ''; if (/^\/\//.test(s)) return 'https:' + s; if (/^http:\/\//i.test(s)) return s; if (/^\//.test(s)) return base() + s; return s; }

function cards(items) {
  var out = [];
  for (var i = 0; i < (items || []).length; i++) {
    var x = items[i];
    if (!x || !x.vod_id || String(x.vod_id) === '0') continue;
    out.push({
      id: String(x.vod_id),
      title: clean(x.vod_name || ''),
      cover: img(x.vod_pic || x.vod_pic_thumb || ''),
      subtitle: clean(x.tag || x.vod_remarks || ''),
    });
  }
  return out;
}

async function post(path, fields) {
  var ts = String(Math.floor(Date.now() / 1000));
  var sign = String((await LumeSource.tools.digest('md5', KEY + ts)) || '');
  var boundary = '----rebo' + ts + Math.floor(Math.random() * 1e9).toString(16);
  var body = '';
  var data = {};
  var keys = Object.keys(fields || {});
  for (var i = 0; i < keys.length; i++) data[keys[i]] = String(fields[keys[i]]);
  data.sign = sign;
  data.timestamp = ts;
  var dk = Object.keys(data);
  for (var j = 0; j < dk.length; j++) {
    body += '--' + boundary + '\r\nContent-Disposition: form-data; name="' + dk[j] + '"\r\n\r\n' + data[dk[j]] + '\r\n';
  }
  body += '--' + boundary + '--\r\n';
  var reply = await LumeSource.http.post(base() + path, body, {
    headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'multipart/form-data; boundary=' + boundary },
  });
  var status = reply ? reply.status : 0;
  if (!status) throw new Error('连不上：' + base());
  if (status !== 200) throw new Error('接口 HTTP ' + status);
  var parsed;
  try { parsed = JSON.parse(String(reply.body || '{}')); } catch (e) { throw new Error('接口返回不是 JSON'); }
  if (parsed && parsed.code !== undefined && Number(parsed.code) !== 1) throw new Error('接口 code=' + parsed.code + ' ' + (parsed.msg || ''));
  return (parsed && parsed.data) || {};
}

function remember(items) {
  if (!items.length) return Promise.resolve(null);
  return readJson('items.json').then(function (c) {
    var map = (c && c.map) ? c.map : {};
    for (var i = 0; i < items.length; i++) map[items[i].id] = { title: items[i].title, cover: items[i].cover };
    return writeJson('items.json', { at: Date.now(), map: map });
  });
}

var LumeSource = {
  id: 'rebo_video', name: '热播·极速', version: '1.0.0', category: 'video',
  settingsApiVersion: 2, requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['http://v.rbotv.cn'] },
  commonSettings: [{ key: 'pageSize', default: 12, min: 1, max: 30 }, { key: 'playbackMode', default: 'auto' }],
  settings: [{ key: 'note', type: 'info', title: '站点说明', description: '热播·极速：App 协议接口，POST multipart + md5(KEY+timestamp) 签名，源内自动计算。' }],

  async categories() {
    var d = await post('/v3/type/top_type', {});
    var rows = (d && d.list) || [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].type_id != null) out.push({ id: String(rows[i].type_id), title: clean(rows[i].type_name || ('分类' + rows[i].type_id)) });
    }
    return out;
  },

  async home() {
    var d = await post('/v3/type/tj_vod', {});
    var items = cards([].concat((d && d.cai) || [], (d && d.loop) || []));
    if (!items.length) return [];
    await remember(items);
    return [{ title: '推荐', moreUrl: '1', items: items.slice(0, 12) }];
  },

  async list(argument) {
    var a = argument || {}, page = Number(a.page || 1) || 1;
    var cat = /^\d+$/.test(String(a.categoryId || '')) ? String(a.categoryId) : '1';
    var kw = String(a.keyword || '').trim();
    var d, items;
    if (kw) {
      d = await post('/v3/home/search', { limit: String(PAGE_SIZE), page: String(page), keyword: kw });
      items = cards((d && d.list) || []);
      await remember(items);
      return { items: items, hasMore: items.length >= PAGE_SIZE };
    }
    d = await post('/v3/home/type_search', { type_id: cat, limit: String(PAGE_SIZE), page: String(page) });
    items = cards((d && d.list) || []);
    await remember(items);
    return { items: items, hasMore: items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    var v = {};
    try { v = await post('/v3/home/vod_details', { vod_id: id }); } catch (e) { v = {}; }
    return {
      id: id,
      title: clean(v.vod_name || (row && row.title) || ('作品 ' + id)),
      cover: img(v.vod_pic || v.vod_pic_thumb || (row && row.cover) || ''),
      subtitle: clean([v.vod_year, v.vod_area, v.vod_remarks].filter(Boolean).join(' · ')),
      description: clean(v.vod_content || '热播·极速（v.rbotv.cn）'),
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return [];
    var v = {};
    try { v = await post('/v3/home/vod_details', { vod_id: id }); } catch (e) { v = {}; }
    var lines = (v && v.vod_play_list) || [];
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var eps = (lines[i] && lines[i].urls) || [];
      for (var j = 0; j < eps.length; j++) {
        if (!eps[j] || !eps[j].url) continue;
        out.push({
          id: 'p:' + i + ':' + j,
          title: '线路' + (i + 1) + ' ' + clean(eps[j].name || ('第' + (j + 1) + '集')),
        });
      }
    }
    if (!out.length) return [{ id: 'web:' + id, title: '网页播放' }];
    return out;
  },

  async content(argument) {
    var a = argument || {}, raw = String(a.chapterId || '');
    var id = String(a.id || '').replace(/\D/g, '');
    if (raw.indexOf('web:') === 0) return { kind: 'webplayer', url: base() + '/' };
    var parts = raw.replace(/^p:/, '').split(':');
    var li = Number(parts[0]) || 0, ei = Number(parts[1]) || 0;
    var v = await post('/v3/home/vod_details', { vod_id: id });
    var line = ((v && v.vod_play_list) || [])[li] || {};
    var ep = (((line || {}).urls) || [])[ei] || {};
    var url = String(ep.url || '');
    if (!url) throw new Error('这一集没有地址');
    if (/\.(?:m3u8|mp4|flv)(?:[?#]|$)/i.test(url)) {
      var headers = { 'User-Agent': (line && line.ua) || UA, Referer: (line && line.referer) || base() + '/' };
      return { kind: 'video', url: url, headers: headers };
    }
    return { kind: 'webplayer', url: url };
  },
};
