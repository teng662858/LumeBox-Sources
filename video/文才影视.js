// LumeSource: {"id":"wencai_video","name":"文才影视","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://www.jiabaide.cn"]},"network":"proxy","icon":"https://www.jiabaide.cn/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：文才影视（https://www.jiabaide.cn）—— App 协议接口站，全部 GET + 签名头。
//   签名（照它前端/spider 的算法）：t=Date.now()，raw = 参数按发送顺序拼 k=v 再拼 key、t
//     key = cb808529bae6b6be45ecfab29a4889bc
//     sign = sha1( md5(raw) )，请求头带 sign / t / deviceid
//   分类  /api/mw-movie/anonymous/get/filer/type                    → data[].{typeId,typeName}
//   首页  /api/mw-movie/anonymous/v1/home/all/list                  → data.homeNewMoviePageData.list[]
//   列表  /api/mw-movie/anonymous/v1/get/filer/list?page&pageSize&typeId
//   搜索  /api/mw-movie/anonymous/video/searchByWord?keyword&pageNum&pageSize&sourceCode=1 → data.result
//   详情  /api/mw-movie/anonymous/video/detail?id={vodId}           → data.episodeList[].{name,nid}
//   播放  /api/mw-movie/anonymous/v2/video/episode/url?clientType=1&id={vodId}&nid={nid}
//         → data.list[].{url,resolutionName}（优先 4K/1080/蓝光）

var HOST = 'https://www.jiabaide.cn';
var KEY = 'cb808529bae6b6be45ecfab29a4889bc';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.61 Safari/537.36';
var PAGE_SIZE = 12;

function base() { var d = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : ''; return (d || HOST).replace(/\/+$/, ''); }
function readJson(f) { return LumeSource.fs.readText(f).then(function (r) { if (!r) return null; try { return JSON.parse(r); } catch (e) { return null; } }).catch(function () { return null; }); }
function writeJson(f, v) { return LumeSource.fs.writeText(f, JSON.stringify(v)).catch(function () { return null; }); }
function clean(t) { return String(t == null ? '' : t).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function img(u) { var s = String(u || '').trim(); if (!s) return ''; if (/^\/\//.test(s)) return 'https:' + s; if (/^http:\/\//i.test(s)) return s.replace(/^http:/i, 'https:'); if (/^\//.test(s)) return base() + s; return s; }

// 签名头：参数顺序必须与发送顺序一致
async function signedHeaders(params) {
  var keys = Object.keys(params);
  var t = String(Date.now());
  var parts = [];
  for (var i = 0; i < keys.length; i++) parts.push(keys[i] + '=' + String(params[keys[i]] == null ? '' : params[keys[i]]));
  parts.push('key=' + KEY);
  parts.push('t=' + t);
  var md5 = String((await LumeSource.tools.digest('md5', parts.join('&'))) || '');
  var sha1 = String((await LumeSource.tools.digest('sha1', md5)) || '');
  return { sign: sha1, t: t, 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Origin: base(), Referer: base() + '/' };
}

async function api(path, params) {
  var p = params || {};
  var keys = Object.keys(p);
  var qs = [];
  for (var i = 0; i < keys.length; i++) qs.push(keys[i] + '=' + encodeURIComponent(String(p[keys[i]])));
  var url = base() + path + (qs.length ? '?' + qs.join('&') : '');
  var headers = await signedHeaders(p);
  var reply = await LumeSource.http.get(url, { headers: headers });
  var status = reply ? reply.status : 0;
  if (!status) throw new Error('连不上：' + base());
  if (status !== 200) throw new Error('接口 HTTP ' + status);
  var data;
  try { data = JSON.parse(String(reply.body || '{}')); } catch (e) { throw new Error('接口返回不是 JSON'); }
  if (Number(data.code) !== 200) throw new Error('接口 code=' + data.code + ' ' + (data.msg || ''));
  return data.data;
}

function mapItem(row) {
  return {
    id: String(row.vodId || row.id || ''),
    title: clean(row.vodName || row.name || row.title || ''),
    cover: img(row.vodPic || row.pic || row.cover || ''),
    subtitle: clean(row.vodRemarks || row.vodSerial || row.year || ''),
    typeId: String(row.typeId || ''),
  };
}

function findLists(node, out, depth) {
  if (!node || depth > 4) return out;
  if (Array.isArray(node)) {
    if (node.length && node[0] && (node[0].vodId || node[0].vodName)) out.push(node);
    else for (var i = 0; i < node.length; i++) findLists(node[i], out, depth + 1);
    return out;
  }
  if (typeof node === 'object') {
    var ks = Object.keys(node);
    for (var j = 0; j < ks.length; j++) findLists(node[ks[j]], out, depth + 1);
  }
  return out;
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
  id: 'wencai_video', name: '文才影视', version: '1.0.0', category: 'video',
  settingsApiVersion: 2, requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://www.jiabaide.cn'] },
  commonSettings: [{ key: 'pageSize', default: 12, min: 1, max: 30 }, { key: 'playbackMode', default: 'auto' }],
  settings: [{ key: 'note', type: 'info', title: '站点说明', description: '文才影视：App 协议接口，全部请求带 md5+sha1 签名头（源内自动计算）。' }],

  async categories() {
    var data = await api('/api/mw-movie/anonymous/get/filer/type', {});
    var rows = Array.isArray(data) ? data : [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].typeId != null) out.push({ id: String(rows[i].typeId), title: clean(rows[i].typeName || ('分类' + rows[i].typeId)) });
    }
    return out;
  },

  async home() {
    var data = await api('/api/mw-movie/anonymous/v1/home/all/list', {});
    var boards = [];
    var lists = findLists(data, [], 0);
    for (var i = 0; i < lists.length && boards.length < 4; i++) {
      var items = lists[i].map(mapItem).filter(function (x) { return x.id && x.title; });
      if (items.length) {
        await remember(items);
        boards.push({ title: '推荐 ' + (boards.length + 1), items: items.slice(0, 12) });
      }
    }
    return boards;
  },

  async list(argument) {
    var a = argument || {}, page = Number(a.page || 1) || 1;
    var cat = String(a.categoryId || '').trim();
    var kw = String(a.keyword || '').trim();

    if (kw) {
      var sdata = await api('/api/mw-movie/anonymous/video/searchByWord', { keyword: kw, pageNum: page, pageSize: 8, sourceCode: '1' });
      var sr = (sdata && (sdata.result || sdata.list)) || findLists(sdata, [], 0)[0] || [];
      var sitems = sr.map(mapItem).filter(function (x) { return x.id && x.title; });
      await remember(sitems);
      return { items: sitems, hasMore: sitems.length >= 8 };
    }

    // 首页聚合接口实测可用：合并各板块 → 按 typeId 过滤 → 本地分页
    var data = await api('/api/mw-movie/anonymous/v1/home/all/list', {});
    var lists = findLists(data, [], 0);
    var all = [], seen = {};
    for (var i = 0; i < lists.length; i++) {
      var part = lists[i].map(mapItem);
      for (var j = 0; j < part.length; j++) {
        var it = part[j];
        if (!it.id || !it.title || seen[it.id]) continue;
        seen[it.id] = 1;
        all.push(it);
      }
    }
    await remember(all);
    var filtered = all;
    if (/^\d+$/.test(cat)) {
      var only = all.filter(function (x) { return x.typeId === cat; });
      if (only.length) filtered = only;
    }
    var from = (page - 1) * PAGE_SIZE;
    var slice = filtered.slice(from, from + PAGE_SIZE);
    return { items: slice, hasMore: from + PAGE_SIZE < filtered.length };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    var data = null;
    try { data = await api('/api/mw-movie/anonymous/video/detail', { id: id }); } catch (e) { data = null; }
    var d = data || {};
    return {
      id: id,
      title: clean(d.vodName || (row && row.title) || ('作品 ' + id)),
      cover: img(d.vodPic || (row && row.cover) || ''),
      subtitle: clean([d.vodArea, d.vodRemarks].filter(Boolean).join(' · ')),
      description: clean(d.vodBlurb || d.vodContent || '文才影视（www.jiabaide.cn）'),
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return [];
    var data = null;
    try { data = await api('/api/mw-movie/anonymous/video/detail', { id: id }); } catch (e) { data = null; }
    var eps = (data && (data.episodeList || data.episodelist)) || [];
    var out = [];
    for (var i = 0; i < eps.length; i++) {
      var nid = eps[i].nid != null ? eps[i].nid : (eps[i].nId != null ? eps[i].nId : eps[i].id);
      if (nid == null) continue;
      out.push({ id: 'p:' + id + ':' + String(nid), title: clean(eps[i].name || ('第' + (i + 1) + '集')) });
    }
    if (!out.length) out.push({ id: 'web:' + id, title: '网页播放' });
    return out;
  },

  async content(argument) {
    var a = argument || {}, raw = String(a.chapterId || '');
    if (raw.indexOf('web:') === 0) return { kind: 'webplayer', url: base() + '/' };
    var parts = raw.replace(/^p:/, '').split(':');
    var id = parts[0] || '', nid = parts[1] || '';
    if (!id || !nid) throw new Error('缺少选集参数');
    var data = await api('/api/mw-movie/anonymous/v2/video/episode/url', { clientType: '1', id: id, nid: nid });
    var list = (data && data.list) || [];
    var best = null;
    for (var i = 0; i < list.length; i++) {
      if (!/^https?:\/\//i.test(String(list[i].url || ''))) continue;
      if (!best) best = list[i];
      if (/4k|1080|高清|蓝光/i.test(String(list[i].resolutionName || ''))) { best = list[i]; break; }
    }
    if (best) return { kind: 'video', url: best.url, headers: { 'User-Agent': UA, Origin: base(), Referer: base() + '/' } };
    throw new Error('这一集没有可播地址');
  },
};
