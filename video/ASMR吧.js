// LumeSource: {"id":"asmrba_video","name":"ASMR吧","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions"],"endpoints":{"site":["https://www.asmrba.com"]},"network":"proxy","icon":"https://www.asmrba.com/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：ASMR 吧（https://www.asmrba.com）—— WordPress，助眠音频/视频。
//   列表：首页 / 分类页里的 <a href="https://www.asmrba.com/post/{id}.html" title="标题">
//   详情：/post/{id}.html
//   播放：文章里 <video src> 或 iframe（bilibili）→ 有直链就播，没有交给内嵌浏览器
//   搜索：/?s={关键词}&paged={页}

var HOST = 'https://www.asmrba.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
var CATS = [{ id: 'latest', title: '最新' }, { id: 'cos', title: 'COS' }, { id: 'audio', title: '音声' }];
var PAGE_SIZE = 20;

function base() { var d = LumeSource.config && LumeSource.config.domain ? String(LumeSource.config.domain) : ''; return (d || HOST).replace(/\/+$/, ''); }
function clean(t) { return String(t == null ? '' : t).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function get(url) {
  return LumeSource.http.get(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*', Referer: base() + '/' } }).then(function (r) {
    var s = r ? r.status : 0;
    if (!s) throw new Error('连不上');
    if (s !== 200) throw new Error('HTTP ' + s);
    return r.body ? String(r.body) : '';
  });
}
function parseCards(html) {
  var text = String(html || ''), items = [], seen = {};
  var re = /https?:\/\/www\.asmrba\.com\/post\/(\d+)\.html/g, m;
  while ((m = re.exec(text)) !== null) {
    var id = m[1];
    if (seen[id]) continue;
    var win = text.slice(Math.max(0, m.index - 500), m.index + 700);
    var title = (/title="([^"]{2,90})"/.exec(win) || [])[1] || '';
    var cover = (/<img[^>]+(?:data-original|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i.exec(win) || [])[1] || '';
    if (!title && !cover) continue;
    seen[id] = 1;
    items.push({ id: id, title: (clean(title) || ('音声 ' + id)).slice(0, 80), cover: cover ? (/^https?:/.test(cover) ? cover : base() + cover) : '', subtitle: '' });
  }
  return items;
}

var LumeSource = {
  id: 'asmrba_video', name: 'ASMR吧', version: '1.0.0', category: 'video',
  settingsApiVersion: 2, requiresSettings: ['commonSettings', 'settingsActions'],
  endpoints: { site: ['https://www.asmrba.com'] },
  commonSettings: [{ key: 'pageSize', default: 20, min: 1, max: 50 }, { key: 'playbackMode', default: 'auto' }],
  settings: [{ key: 'note', type: 'info', title: '站点说明', description: 'ASMR吧：WordPress 站，文章里是音频/视频或 bilibili iframe。' }],

  async categories() { return CATS; },

  async home() {
    var items = parseCards(await get(base() + '/'));
    if (!items.length) return [];
    return [{ title: '最新', moreUrl: 'latest', items: items.slice(0, 12) }];
  },

  async list(argument) {
    var a = argument || {}, page = Number(a.page || 1) || 1, kw = String(a.keyword || '').trim();
    var url = kw ? base() + '/?s=' + encodeURIComponent(kw) + '&paged=' + page : base() + (page > 1 ? '/page/' + page + '/' : '/');
    var items = parseCards(await get(url));
    return { items: items, hasMore: items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '').replace(/\D/g, '');
    if (!id) return null;
    var html = await get(base() + '/post/' + id + '.html');
    var title = clean((/<title>([^<]*)<\/title>/.exec(html) || [])[1] || '').replace(/\s*-\s*ASMR.*$/i, '');
    var cover = (/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html) || [])[1] || '';
    var desc = clean((/<div[^>]+class="[^"]*(?:entry-content|content)[^"]*"[^>]*>([\s\S]{0,800}?)<\/div>/.exec(html) || [])[1] || '');
    return { id: id, title: title || ('音声 ' + id), cover: cover, subtitle: '', description: desc };
  },

  async chapters(argument) {
    return [{ id: 'post:' + String((argument && argument.id) || '').replace(/\D/g, ''), title: '打开' }];
  },

  async content(argument) {
    var id = String((argument && (argument.id || argument.chapterId)) || '').replace(/\D/g, '');
    if (!id) throw new Error('缺少文章 ID');
    var html = await get(base() + '/post/' + id + '.html');
    var video = (/<video[^>]+src="([^"]+)"/i.exec(html) || [])[1]
      || (/<source[^>]+src="([^"]+\.(?:mp4|m4a|mp3|m3u8)[^"]*)"/i.exec(html) || [])[1] || '';
    if (video) return { kind: 'video', url: /^https?:/.test(video) ? video : base() + video, headers: { 'User-Agent': UA, Referer: base() + '/' } };
    return { kind: 'webplayer', url: base() + '/post/' + id + '.html' };
  }
};
