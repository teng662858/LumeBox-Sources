// LumeSource: {"id": "zhilian-duanju", "name": "栀莲短剧", "version": "1.0.1", "category": "video", "contentCategory": "adult", "mirrors": ["https://yklyo880.lldj1.xyz"], "icon": "https://yklyo880.lldj1.xyz/assets/image/favicon.png"}
// LumeRuntime: javascript
// 通过站点游客会话获取当前账号获准播放的地址；锁定集交回源站处理。
var BASE_URL = 'https://yklyo880.lldj1.xyz';
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PLATFORM = 'huangguo-h5';

var SESSION_FILE = 'guest.json';
var CATEGORY_FILE = 'categories.json';
var SESSION_TTL_MS = 6 * 24 * 3600 * 1000;   // JWT 实际 7 天，留一天余量主动换票
var CATEGORY_TTL_MS = 6 * 3600 * 1000;

function base() {
  var domain = LumeSource.config && LumeSource.config.domain ? LumeSource.config.domain : '';
  return (domain || BASE_URL).replace(/\/+$/, '');
}

function absolute(url) {
  var text = String(url == null ? '' : url).trim();
  if (!text || (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text))) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.indexOf('//') === 0) return 'https:' + text;
  if (text.charAt(0) === '/') return base() + text;
  return base() + '/' + text;
}

// ----------------------------------------------------------------- 自带编解码

var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Encode(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i] & 0xff;
    var b1 = i + 1 < bytes.length ? bytes[i + 1] & 0xff : -1;
    var b2 = i + 2 < bytes.length ? bytes[i + 2] & 0xff : -1;
    out += B64_CHARS.charAt(b0 >> 2);
    out += B64_CHARS.charAt(((b0 & 3) << 4) | (b1 < 0 ? 0 : b1 >> 4));
    if (b1 < 0) {
      out += '==';
      break;
    }
    out += B64_CHARS.charAt(((b1 & 15) << 2) | (b2 < 0 ? 0 : b2 >> 6));
    if (b2 < 0) {
      out += '=';
      break;
    }
    out += B64_CHARS.charAt(b2 & 63);
  }
  return out;
}

// base64url：只用来做 requestKey，末尾的 '=' 去掉正好是 43 字符（站点就认这个长度与末位字符）
function base64UrlEncode(bytes) {
  return base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 解码成「每个字节一个字符」的串，够读 JWT 里的 ASCII 字段（exp / uid）
function base64Decode(input) {
  var text = String(input == null ? '' : input).replace(/-/g, '+').replace(/_/g, '/');
  var out = '';
  var buffer = 0;
  var bits = 0;
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if (ch === '=') break;
    var value = B64_CHARS.indexOf(ch);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return out;
}

function randomBytes(count) {
  var bytes = [];
  for (var i = 0; i < count; i++) bytes.push(Math.floor(Math.random() * 256) & 0xff);
  return bytes;
}

function hexOf(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var part = (bytes[i] & 0xff).toString(16);
    out += part.length < 2 ? '0' + part : part;
  }
  return out;
}

// ------------------------------------------------------------ fs 上的小工具

async function readJson(file) {
  try {
    var raw = await LumeSource.fs.readText(file);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function writeJson(file, value) {
  try {
    await LumeSource.fs.writeText(file, JSON.stringify(value));
  } catch (error) {
    /* 缓存写不进去不影响主流程 */
  }
}

function tokenExpiry(token) {
  var parts = String(token || '').split('.');
  if (parts.length < 2) return 0;
  var payload = base64Decode(parts[1]);
  var matched = /"exp"\s*:\s*(\d+)/.exec(payload);
  return matched ? Number(matched[1]) * 1000 : 0;
}

// ------------------------------------------------------------------ 游客身份

async function readSession() {
  return await readJson(SESSION_FILE);
}

async function mintSession() {
  var cached = await readSession();
  if (cached && cached.base !== base()) cached = null;
  var device = cached && cached.device ? String(cached.device) : '';
  var key = cached && cached.key ? String(cached.key) : '';
  if (!device) device = hexOf(randomBytes(16));
  if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(key)) key = base64UrlEncode(randomBytes(32));

  var response = await LumeSource.http.post(
    base() + '/api/v1/auth/guest',
    JSON.stringify({ requestKey: key, automatic: true, guestDeviceKey: device }),
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Client-Platform': PLATFORM,
        'X-Device-Id': device,
        Referer: base() + '/',
      },
    }
  );
  var status = response ? response.status : 0;
  if (status === 403 || status === 503) {
    throw new Error('NEED_WEBVIEW_VERIFY：栀莲短剧触发了 Cloudflare 人机校验（HTTP ' + status + '），请在源设置里走网页视图完成校验或配置代理');
  }
  var body = null;
  try {
    body = response && response.body ? JSON.parse(response.body) : null;
  } catch (error) {
    body = null;
  }
  if (body && body.data) body = body.data;
  var token = body && body.token ? String(body.token) : '';
  if (status < 200 || status >= 300 || !token) {
    var reason = body && (body.message || body.msg) ? String(body.message || body.msg) : 'HTTP ' + status;
    throw new Error('游客登录失败：' + reason + '（站点接口可能改版了）');
  }
  var session = {
    device: device,
    key: key,
    token: token,
    exp: tokenExpiry(token) || Date.now() + SESSION_TTL_MS,
    at: Date.now(),
    base: base(),
  };
  await writeJson(SESSION_FILE, session);
  return session;
}

var sessionPending = null;
async function ensureSession(force) {
  if (sessionPending) return await sessionPending;
  sessionPending = (async function() {
    var cached = await readSession();
    if (!force && cached && cached.token && cached.device && cached.base === base()) {
      var exp = Number(cached.exp || 0);
      if (exp > Date.now() + 120000 && Date.now() - Number(cached.at || 0) < SESSION_TTL_MS) return cached;
    }
    return await mintSession();
  })();
  try { return await sessionPending; } finally { sessionPending = null; }
}

// ------------------------------------------------------------------ 接口请求

async function api(path, options) {
  var opts = options || {};
  var session = await ensureSession(false);
  var refreshed = false;
  for (var round = 0; round < 3; round++) {
    var headers = { Accept: 'application/json', 'X-Client-Platform': PLATFORM };
    if (session.device) headers['X-Device-Id'] = session.device;
    if (session.token) headers.Authorization = 'Bearer ' + session.token;
    if (opts.headers) {
      for (var name in opts.headers) headers[name] = opts.headers[name];
    }
    var url = /^https?:\/\//i.test(path) ? path : base() + path;
    var response = await LumeSource.http.request({
      url: url,
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body,
    });
    var status = response ? response.status : 0;
    if (status === 401 && !refreshed) {
      refreshed = true;
      session = await ensureSession(true);
      continue;
    }
    if (status === 403 || status === 503) {
      throw new Error('NEED_WEBVIEW_VERIFY：栀莲短剧触发了 Cloudflare 人机校验（HTTP ' + status + '），请在源设置里走网页视图完成校验或配置代理');
    }
    var text = response && response.body ? String(response.body) : '';
    var json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (error) {
      json = null;
    }
    if (!json) throw new Error('接口返回的不是 JSON（HTTP ' + status + '）：' + text.slice(0, 120));
    if (typeof json.code === 'number' && json.code !== 0) {
      throw new Error('接口报错：' + String(json.message || json.msg || json.code));
    }
    if (status < 200 || status >= 300) throw new Error('接口返回 HTTP ' + status);
    return json.data !== undefined ? json.data : json;
  }
  throw new Error('接口重试后仍未通过：' + path);
}

// ------------------------------------------------------------------ 数据映射

function compact(number) {
  var value = Number(number) || 0;
  if (value >= 100000000) return (value / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  if (value >= 10000) return (value / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return String(value);
}

function coverOf(row) {
  if (!row) return '';
  var raw = row.cover || row.cover_url || row.poster || '';
  return absolute(raw);
}

function mapItem(row) {
  if (!row || row.id == null) return null;
  var bits = [];
  if (row.category) bits.push(String(row.category));
  if (row.episode_count) bits.push(Number(row.episode_count) + '集');
  if (row.play_count) bits.push(compact(row.play_count) + '播放');
  return {
    id: String(row.id),
    title: String(row.title == null ? '' : row.title),
    cover: coverOf(row),
    subtitle: bits.join(' · '),
  };
}

function mapItems(rows) {
  var out = [];
  if (!rows || !rows.length) return out;
  for (var i = 0; i < rows.length; i++) {
    var item = mapItem(rows[i]);
    if (item) out.push(item);
  }
  return out;
}

function accessLabel(row) {
  var type = String((row && row.access_type) || (row && row.locked ? 'vip' : 'free')).toLowerCase();
  if (type === 'paid') {
    var price = Number((row && row.coin_price) || 0);
    return price > 0 ? '付费' + price + '钻' : '付费';
  }
  if (type === 'vip') return 'VIP';
  return '锁定';
}

function episodeTitle(row) {
  var title = String((row && row.title) || ('第' + ((row && row.number) || '') + '集'));
  var type = String((row && row.access_type) || (row && row.locked ? 'vip' : 'free')).toLowerCase();
  var locked = !!(row && row.locked) || type !== 'free';
  if (!locked) return title;
  return title + '（' + accessLabel(row) + '）';
}

function dramaIdOf(value) {
  var text = String(value == null ? '' : value).trim();
  var matched = /\/drama\/(\d+)/.exec(text) || /^(\d+)$/.exec(text);
  return matched ? matched[1] : '';
}

function videoResult(url) {
  return {
    kind: 'video',
    url: url,
    headers: { Referer: base() + '/', 'User-Agent': UA },
  };
}

// -------------------------------------------------------------------- 五个入口

var LumeSource = {
  id: 'zhilian-duanju',
  name: '栀莲短剧',
  version: '1.0.1',
  category: 'video',
  mirrors: ['https://yklyo880.lldj1.xyz'],

  async categories() {
    var cached = await readJson(CATEGORY_FILE);
    if (cached && Array.isArray(cached.list) && cached.list.length && Date.now() - Number(cached.at || 0) < CATEGORY_TTL_MS) {
      return cached.list;
    }
    var list = [
      { id: 'hot', title: '热门推荐' },
      { id: 'new', title: '最新上架' },
      { id: 'likes', title: '最多喜欢' },
    ];
    var home = await api('/api/v1/home');
    var rows = home && Array.isArray(home.categories) ? home.categories : [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || row.id == null) continue;
      list.push({ id: 'cat:' + row.id, title: String(row.name || '分类' + row.id) });
    }
    await writeJson(CATEGORY_FILE, { at: Date.now(), list: list });
    return list;
  },

  async home() {
    var boards = [];
    var home = await api('/api/v1/home');
    var hotRows = [];
    try {
      var hot = await api('/api/v1/dramas?sort=hot&size=12&page=1');
      hotRows = hot && Array.isArray(hot.list) ? hot.list : [];
    } catch (error) {
      hotRows = [];
    }
    if (hotRows.length) boards.push({ title: '热门推荐', moreUrl: 'hot', items: mapItems(hotRows) });

    var latest = home && Array.isArray(home.latest) ? home.latest : [];
    if (latest.length) boards.push({ title: '最新上架', moreUrl: 'new', items: mapItems(latest) });

    var recommend = home && Array.isArray(home.recommend) ? home.recommend : [];
    if (recommend.length) boards.push({ title: '精选推荐', moreUrl: '', items: mapItems(recommend) });

    return boards;
  },

  async filters() {
    var groups = [
      {
        id: 'sort',
        title: '排序',
        options: [
          { id: 'hot', title: '热门推荐' },
          { id: 'new', title: '最新上架' },
          { id: 'likes', title: '最多喜欢' },
        ],
      },
    ];
    try {
      var home = await api('/api/v1/home');
      var rows = home && Array.isArray(home.categories) ? home.categories : [];
      var options = [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i] && rows[i].id != null) options.push({ id: String(rows[i].id), title: String(rows[i].name || '') });
      }
      if (options.length) groups.unshift({ id: 'category', title: '分类', options: options });
    } catch (error) {
      return { groups: groups };
    }
    return { groups: groups };
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1);
    if (!page || page < 1) page = 1;
    var size = 20;
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    var filters = args.filters || {};

    var sort = 'hot';
    var categoryId = '';
    var category = String(args.categoryId == null ? '' : args.categoryId).trim();
    if (/^cat:/.test(category)) categoryId = category.slice(4);
    else if (category === 'new' || category === 'likes' || category === 'hot') sort = category;

    if (filters.sort) sort = String(filters.sort).trim() || sort;
    if (filters.category) categoryId = String(filters.category).split(',')[0].trim();

    var query = [];
    if (keyword) query.push('keyword=' + encodeURIComponent(keyword));
    if (categoryId) query.push('category_id=' + encodeURIComponent(categoryId));
    query.push('sort=' + encodeURIComponent(sort));
    query.push('size=' + size);
    query.push('page=' + page);

    var data = await api('/api/v1/dramas?' + query.join('&'));
    var rows = data && Array.isArray(data.list) ? data.list : [];
    var total = data && typeof data.total === 'number' ? data.total : 0;
    return {
      items: mapItems(rows),
      hasMore: typeof data.total === 'number' ? total > page * size : rows.length >= size,
    };
  },

  async detail(argument) {
    var id = dramaIdOf(argument && argument.id);
    if (!id) return null;
    var payload = await api('/api/v1/dramas/' + id);
    // 带 X-Client-Platform 时是 {drama, episodes} 包裹；老版本 / 不带客户端头时是平铺对象
    var drama = payload && payload.drama ? payload.drama : payload;
    if (!drama || !drama.title) return null;

    var bits = [];
    if (drama.category) bits.push(String(drama.category));
    if (drama.episode_count) bits.push(Number(drama.episode_count) + '集');
    if (drama.play_count) bits.push(compact(drama.play_count) + '播放');
    if (drama.status) {
      var status = String(drama.status);
      bits.push(status === 'completed' ? '已完结' : status === 'ongoing' ? '更新中' : status);
    }

    var description = String(drama.description == null ? '' : drama.description).trim();
    var tags = Array.isArray(drama.tags) ? drama.tags.join(' ') : String(drama.tags || '');
    if (tags) description += (description ? '\n\n' : '') + '标签：' + tags;

    return {
      id: id,
      title: String(drama.title),
      cover: coverOf(drama),
      subtitle: bits.join(' · '),
      description: description,
    };
  },

  async chapters(argument) {
    var id = dramaIdOf(argument && argument.id);
    if (!id) return [];
    var data = await api('/api/v1/dramas/' + id + '/episodes');
    var rows = data && Array.isArray(data.list) ? data.list : Array.isArray(data) ? data : [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row) continue;
      var number = Number(row.number || 0);
      if (!number) continue;
      out.push({
        id: String(number) + (row.id == null ? '' : ':' + row.id),
        title: episodeTitle(row),
      });
    }
    return out;
  },

  async content(argument) {
    var args = argument || {};
    var dramaId = dramaIdOf(args.id);
    if (!dramaId) throw new Error('缺少剧集 ID');

    var ref = String(args.chapterId == null ? '' : args.chapterId).trim();
    var matched = /^(\d+)(?::(\d+))?$/.exec(ref) || /^ep:(\d+)(?::(\d+))?$/.exec(ref);
    var number = matched ? Number(matched[1]) : 0;
    if (!number || number < 1) throw new Error('缺少有效的选集编号，请重新打开选集');

    var data = await api('/api/v1/dramas/' + dramaId + '/episodes/' + number);
    var episode = data && data.episode ? data.episode : null;
    if (!episode) throw new Error('第' + number + '集取不到（剧集可能已下架）');

    var url = String(episode.video_url || '').trim();
    if (url) {
      url = absolute(url);
      if (!/^https?:\/\//i.test(url)) throw new Error('站点返回无效播放地址');
      return videoResult(url);
    }
    // No URL was granted to this session. Let the site display its login or purchase flow.
    return {
      kind: 'webplayer',
      pageUrl: base() + '/play/' + dramaId + '/' + number,
      headers: { Referer: base() + '/', 'User-Agent': UA },
    };
  },
};
