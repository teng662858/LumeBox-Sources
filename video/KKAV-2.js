// LumeSource: {"id":"kkav_video","name":"KKAV","version":"1.0.0","category":"video","contentCategory":"adult","mirrors":["https://www.73tfhk.com"],"network":"proxy","icon":"https://www.73tfhk.com/static/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：KKAV（https://www.73tfhk.com，原 37tmrj 的换域名目标；成人视频站，全站 18+）
//
// 一、域名沿革
//   www.37tmrj.com / www.24nbfp.com / ttss66.com（"永久官网"）现在都只是一张「换域名」页，
//   页内 url2 名单里只剩一个域名：73tfhk.com → 于是本站主站 = https://www.73tfhk.com，
//   暂时没有别的镜像（跳板页名单就这一条，等它再出镜像时补进 mirrors 即可）。
//
// 二、接口全部是 XOR2 加密（这就是旧源"渲染后没认出卡片"的原因）
//   响应形如 {"enc":3,"alg":"XOR2","n":"<11 位随机>","d":"<base64url 密文>"}，
//   解密算法抄自站点主包（已用真实响应验证）：
//     key   = mgrEncryptKey（/api/config/ini 里给出，默认 "Mumu2026#"）
//     seed  = FNV-1a(`${key}|${n}`)                     ← 32 位
//     每 4 字节推进一次 xorshift32（t^=t<<13; t^=t>>>17; t^=t<<5），
//     该 4 字节依次取 (seed>>>0)&255、(seed>>>8)&255、(seed>>>16)&255、(seed>>>24)&255 与密文异或。
//
// 三、接口（实测）
//   GET /api/config/ini                     配置（图片/CDN 域、站点名、mgrEncryptKey…）
//   GET /api/movie/tags                     分类 → 子标签（tagid）
//   GET /api/movie/home_sections?pageSize=40 首页分区
//   GET /api/movie/list?page=1&pageSize=20[&tagid=][&tagCateChildId=][&keyword=]
//        → {code:0, data:[{movieid, Topic, smallpic, h264mp4url, formatted_timesize, …}], total}
//   列表项**自带 h264mp4url**，其中 down.baidu.com 这个域名在本机被 RST，
//   换配置里的 down 域 down.mm7878.com 同一路径 → 206 video/mp4（源里自动改写）。
// 18+

var BASE_URL = 'https://www.73tfhk.com';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PAGE_SIZE = 20;
var DEFAULT_KEY = 'Mumu2026#';
var DOWN_HOST = 'https://down.mm7878.com';
// smallpic 的 sq.2277ww.com 已经连不上；同路径换到配置里的图片域（实测 200 image/jpeg）
var COVER_HOST = 'https://fengmian.gszy12348.com/data/';
var NAV_TTL_MS = 6 * 3600 * 1000;

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
  return String(text == null ? '' : text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- XOR2

var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64ToBytes(text) {
  var s = String(text || '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
  var out = [];
  var buffer = 0;
  var bits = 0;
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (ch === '=') break;
    var v = B64.indexOf(ch);
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

function utf8Decode(bytes) {
  var out = '';
  var i = 0;
  while (i < bytes.length) {
    var c = bytes[i++];
    if (c < 0x80) out += String.fromCharCode(c);
    else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (c < 0xf0) out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    else {
      var cp = (((c & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f)) - 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

function utf8Encode(text) {
  var s = String(text == null ? '' : text);
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0xd800 || c >= 0xe000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else {
      i++;
      var cp = 0x10000 + (((c & 0x3ff) << 10) | (s.charCodeAt(i) & 0x3ff));
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
  }
  return out;
}

function fnv1a(text) {
  var bytes = utf8Encode(text);
  var h = 2166136261;
  for (var i = 0; i < bytes.length; i++) {
    h = (h ^ bytes[i]) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function xorshift32(seed) {
  var t = seed >>> 0;
  t = (t ^ ((t << 13) >>> 0)) >>> 0;
  t = (t ^ (t >>> 17)) >>> 0;
  t = (t ^ ((t << 5) >>> 0)) >>> 0;
  return t >>> 0;
}

function xor2Decrypt(payload, keyText) {
  var bytes = b64ToBytes(payload.d);
  var seed = fnv1a(String(keyText || DEFAULT_KEY) + '|' + String(payload.n || '')) || 2166136261;
  var out = [];
  var r = 0;
  for (var i = 0; i < bytes.length; i++) {
    if ((3 & i) === 0) {
      seed = xorshift32(seed);
      r = seed;
    }
    out.push(bytes[i] ^ ((r >>> (8 * (3 & i))) & 0xff));
  }
  return utf8Decode(out);
}

// ---------------------------------------------------------------- 接口

var _apiKey = null;

async function apiKey() {
  if (_apiKey) return _apiKey;
  var cached = await readJson('key.json');
  if (cached && cached.key && Date.now() - Number(cached.at) < 12 * 3600 * 1000) {
    _apiKey = cached.key;
    return _apiKey;
  }
  _apiKey = DEFAULT_KEY;
  try {
    var reply = await LumeSource.http.get(base() + '/api/config/ini', {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (reply && reply.status === 200) {
      var raw = JSON.parse(reply.body ? String(reply.body) : '{}');
      var text = typeof raw.d === 'string' ? xor2Decrypt(raw, DEFAULT_KEY) : (reply.body || '');
      var obj = JSON.parse(text);
      var key = obj && obj.data && obj.data.system ? obj.data.system.mgrEncryptKey : '';
      if (key) _apiKey = String(key);
    }
  } catch (error) {
    _apiKey = DEFAULT_KEY;
  }
  await writeJson('key.json', { at: Date.now(), key: _apiKey });
  return _apiKey;
}

async function call(path) {
  var key = await apiKey();
  var reply = await LumeSource.http.get(base() + '/api' + path, {
    headers: { 'User-Agent': UA, Accept: 'application/json', Referer: base() + '/' },
  });
  if (!reply || reply.status !== 200) throw new Error('接口打不开：HTTP ' + (reply ? reply.status : 0) + '（' + path + '）');
  var text = reply.body ? String(reply.body) : '';
  var raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error('接口返回不是 JSON：' + path);
  }
  if (raw && typeof raw.d === 'string') {
    var plain = xor2Decrypt(raw, key);
    try {
      return JSON.parse(plain);
    } catch (error) {
      throw new Error('XOR2 解不开（站点换口令了？）：' + path);
    }
  }
  return raw;
}

function playUrl(item) {
  var url = String((item && (item.h264mp4url || item.mp4url || item.m3u8url)) || '');
  if (!url) return '';
  // down.baidu.com 这个域名在本机被 RST，换同路径的 down 域
  return url.replace(/^https?:\/\/down\.baidu\.com\//i, DOWN_HOST + '/');
}

function coverUrl(item) {
  var raw = String(item.smallpic || item.pic || '');
  if (!raw) return '';
  var path = raw.replace(/^https?:\/\/[^\/]+\//i, '');
  if (/^cover\//.test(path)) return COVER_HOST + path;
  return raw;
}

function mapItem(item) {
  return {
    id: String(item.movieid || item.id || ''),
    title: clean(item.Topic || item.title || ''),
    cover: coverUrl(item),
    subtitle: String(item.formatted_timesize || ''),
  };
}

async function remember(items) {
  if (!items.length) return;
  var cached = (await readJson('items.json')) || { map: {} };
  var map = cached.map || {};
  for (var i = 0; i < items.length; i++) {
    map[items[i].id] = { title: items[i].title, cover: items[i].cover, subtitle: items[i].subtitle, play: items[i].play || '' };
  }
  await writeJson('items.json', { at: Date.now(), map: map });
}

async function navTags() {
  var cached = await readJson('tags.json');
  if (cached && Array.isArray(cached.list) && cached.list.length && Date.now() - Number(cached.at) < NAV_TTL_MS) {
    return cached.list;
  }
  var data = await call('/movie/tags');
  var rows = data && Array.isArray(data.data) ? data.data : [];
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    var group = clean(rows[i].category || rows[i].categoryShow || '');
    var tags = Array.isArray(rows[i].tags) ? rows[i].tags : [];
    for (var j = 0; j < tags.length; j++) {
      var tag = tags[j];
      if (!tag || tag.id == null) continue;
      list.push({
        id: String(tag.id),
        title: (group ? group + '·' : '') + clean(tag.name || tag.nameShort || ('标签 ' + tag.id)),
      });
    }
  }
  if (!list.length) list.push({ id: '', title: '全部' });
  await writeJson('tags.json', { at: Date.now(), list: list });
  return list;
}

var LumeSource = {
  id: 'kkav_video',
  name: 'KKAV',
  version: '1.0.0',
  category: 'video',
  contentCategory: 'adult',
  mirrors: ['https://www.73tfhk.com'],

  async categories() {
    var list = [{ id: 'all', title: '全部' }];
    try {
      var tags = await navTags();
      for (var i = 0; i < tags.length; i++) list.push({ id: 'tag:' + tags[i].id, title: tags[i].title });
    } catch (error) {
      /* 分类拿不到时至少还能看全部 */
    }
    return list;
  },

  async home() {
    var boards = [];
    try {
      var data = await call('/movie/home_sections?pageSize=40');
      var sections = data && Array.isArray(data.data) ? data.data : [];
      for (var i = 0; i < sections.length && boards.length < 4; i++) {
        var movies = Array.isArray(sections[i].movies) ? sections[i].movies : [];
        if (!movies.length) continue;
        var items = movies.slice(0, 12).map(mapItem);
        for (var k = 0; k < movies.length && k < 12; k++) items[k].play = playUrl(movies[k]);
        await remember(items);
        boards.push({ title: clean(sections[i].tagname || '推荐') || '推荐', moreUrl: sections[i].tagid ? ('tag:' + sections[i].tagid) : 'all', items: items });
      }
    } catch (error) {
      /* 首页分区失败就退回列表第一页 */
    }
    if (!boards.length) {
      try {
        var page = await this.list({ page: 1 });
        if (page.items.length) boards.push({ title: '最新', moreUrl: 'all', items: page.items.slice(0, 12) });
      } catch (error) {
        throw error;
      }
    }
    return boards;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    var filters = args.filters || {};
    if (filters.tag) categoryId = 'tag:' + String(filters.tag).replace(/^tag:/, '');
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    var path = '/movie/list?page=' + page + '&pageSize=' + PAGE_SIZE;
    if (keyword) path += '&keyword=' + encodeURIComponent(keyword);
    else if (/^tag:/.test(categoryId)) path += '&tagid=' + encodeURIComponent(categoryId.slice(4));

    var data = await call(path);
    var rows = data && Array.isArray(data.data) ? data.data : [];
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var mapped = mapItem(rows[i]);
      if (!mapped.id) continue;
      mapped.play = playUrl(rows[i]);
      items.push(mapped);
    }
    await remember(items);
    var total = Number(data && data.total) || 0;
    var hasMore = total ? page * PAGE_SIZE < total : items.length >= PAGE_SIZE;
    return {
      items: items.map(function (row) {
        return { id: row.id, title: row.title, cover: row.cover, subtitle: row.subtitle };
      }),
      hasMore: hasMore,
    };
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
      description: '源站：' + base() + '\n接口为 XOR2 加密（源内解密）；播放走列表自带 mp4（down 域已改写）。',
    };
  },

  async chapters(argument) {
    var id = String((argument && argument.id) || '').replace(/[^0-9]/g, '');
    if (!id) return [];
    return [{ id: 'video:' + id, title: '正片' }];
  },

  async content(argument) {
    var args = argument || {};
    var id = String(args.id || '').replace(/[^0-9]/g, '');
    if (!id) throw new Error('缺少视频 ID');
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    var url = row && row.play ? String(row.play) : '';
    if (!url) throw new Error('这条没带播放地址（列表缓存过期了，回列表刷新一次）');
    return { kind: 'video', url: url, headers: { 'User-Agent': UA, Referer: base() + '/' } };
  },
};
