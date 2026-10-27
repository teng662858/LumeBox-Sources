// LumeSource: {"id":"fxcomic_comic","name":"漫小肆","version":"1.0.1","category":"comic","contentRating":"18+"}
//
// 漫小肆韓漫（freexcomic.com 是它的**地址发布页**，当前站址 jjmhw9.top）。
// 本文件对着**真站响应**写（首页 / 书库 / 更新页 / 详情 / 阅读页 / 搜索全取回来存档核过）。
//
// 站点结构（2026-10-14 实测）：
//   找站      GET https://www.freexcomic.com/    发布页里一行 `location.href="…"` 就是当前站址；
//                                                已知域名先探，不通再读发布页（换域名时脚本不用改）
//   分类      /booklist（全部）｜/booklist?end=0（連載）｜/booklist?end=1（已完結）｜/update（最近更新）
//   列表      GET <分类>[&page=N]                 卡片 div.mh-item（28/页，1 基页号）
//   搜索      GET /search?keyword=<关键词>        服务端渲染有结果（实测 20 条/页）
//   详情      GET /book/<数字id>                  标题 h1、封面 .banner_detail_form 里 /static/upload/ 那张、
//                                                 p.subtitle / p.tip（别名 / 作者 / 状态 / 地区 / 标签）、p.content 简介
//   剧集      GET /book/<id>                      #detail-list-select 里的 /chapter/<数字id>（真站默认正序）
//   正文      GET /chapter/<数字id>                div.comiclist 里的 img[data-original]（站点自己的图床）
//
// 已知边界：
// - 封面是 CSS background-image（p.mh-cover 的 style），**不是 img**：清单卡片按此解析。
// - 图床与站点同域（/static/upload/…），阅读页里其它图（二维码/广告）已按路径排除。
var H = {
  base: '', name: '漫小肆', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  clean: function (s) { return this.entity(String(s || '').replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'').replace(/<\/(?:p|div|section|li|h\d)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'' )).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim(); },
  entity: function(s) {return String(s||'').replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi,function(v){var map={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};if(map[v])return map[v];var code=v.charAt(2)==='x'?parseInt(v.slice(3),16):parseInt(v.slice(2),10);return Number.isFinite(code)?String.fromCodePoint(code):v;});},
  attr: function(s,k) {var m=new RegExp('(?:^|\\s)'+k+'\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))','i').exec(s||'');return this.entity(m?(m[1]!==undefined?m[1]:m[2]!==undefined?m[2]:m[3]):'');},
  abs: function(u,from) {u=this.entity(u).trim();if(!u)return '';if(/^https?:\/\//i.test(u))return u;if(u.indexOf('//')===0)return 'https:'+u;var b=from||this.base;if(u.charAt(0)==='/')return /^https?:\/\/[^/]+/.exec(b)[0]+u;return b.replace(/[^/]*$/,'')+u;},
  headers: function(page) {return {'User-Agent':this.ua,'Referer':page||this.base+'/'};},
  response: function(r) {if(!r)throw new Error(this.name+'：没有网络响应');var s=r.status;if(s===403||s===503||s===521)throw new Error('NEED_WEBVIEW_VERIFY：'+this.name+' 需要网页验证（HTTP '+s+'）');if(s!==200)throw new Error(this.name+'：请求失败（HTTP '+s+'）');var b=String(r.body||'');if(/cf-chl-|Just a moment|cf-turnstile|<title>\s*人机校验/i.test(b))throw new Error('NEED_WEBVIEW_VERIFY：'+this.name+' 需要网页验证');return b;},
  get: async function(u) {return this.response(await LumeSource.http.get(this.abs(u,this.base+'/'),{headers:this.headers()}));},
  post: async function(u,data) {var h=this.headers();h['Content-Type']='application/x-www-form-urlencoded';h['X-Requested-With']='XMLHttpRequest';return this.response(await LumeSource.http.post(this.abs(u,this.base+'/'),data,{headers:h}));},
  json: async function(u) {try{return JSON.parse(await this.get(u));}catch(e){if(/NEED_WEBVIEW_VERIFY|HTTP/.test(String(e)))throw e;throw new Error(this.name+'：数据格式已变化');}},
  tree: function(html) {html=String(html).replace(/<!--[^]*?-->/g,'').replace(/<script\b[^]*?<\/script>|<style\b[^]*?<\/style>/gi,'');var root={tag:'root',attrs:{},children:[],raw:''},stack=[root],re=/<\/?([a-z][\w:-]*)\b([^>]*)>|([^<]+)/gi,m;while((m=re.exec(html))){var parent=stack[stack.length-1];if(m[3]){parent.children.push({tag:'#text',raw:m[3],attrs:{},children:[]});continue;}var tag=m[1].toLowerCase();if(m[0].charAt(1)==='/'){for(var i=stack.length-1;i>0;i--)if(stack[i].tag===tag){stack.length=i;break;}continue;}var attrs={},ar=/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,a;while((a=ar.exec(m[2])))attrs[a[1].toLowerCase()]=H.entity(a[2]!==undefined?a[2]:a[3]!==undefined?a[3]:a[4]);var node={tag:tag,attrs:attrs,children:[],raw:'',parent:parent};parent.children.push(node);if(!/^(?:img|input|br|hr|meta|link|source|area|embed|wbr)$/.test(tag)&&! /\/$/.test(m[2]))stack.push(node);}return root;},
  all: function(node,pred) {var out=[],stack=[node];while(stack.length){var n=stack.pop();if(pred(n))out.push(n);if(n.tag==='script'||n.tag==='style')continue;for(var i=n.children.length-1;i>=0;i--)stack.push(n.children[i]);}return out;},
  cls: function(n,c) {return (' '+(n.attrs.class||'')+' ').indexOf(' '+c+' ')>=0;},
  text: function(root) {if(!root)return '';if(root.tag==='#text')return this.entity(root.raw);if(root.tag==='script'||root.tag==='style')return '';var frames=[{node:root,i:0,parts:[]}];while(true){var top=frames[frames.length-1],node=top.node;if(top.i<node.children.length){var child=node.children[top.i++];if(child.tag==='#text'){top.parts.push(this.entity(child.raw));continue;}if(child.tag==='script'||child.tag==='style'){top.parts.push('');continue;}frames.push({node:child,i:0,parts:[]});continue;}var rendered=this.clean(top.parts.join(/^(?:p|div|section|article|li|br)$/.test(node.tag)?'\n':''));frames.pop();if(!frames.length)return rendered;frames[frames.length-1].parts.push(rendered);}},
  first: function(node,pred) {return this.all(node,pred)[0];},
  links: function(node,pattern) {return this.all(node,function(n){return n.tag==='a'&&pattern.test(n.attrs.href||'');});},
  image: function(node) {var img=this.first(node,function(n){return n.tag==='img';});return img?this.abs(img.attrs['data-original']||img.attrs['data-src']||img.attrs['data-lazy-src']||img.attrs.src,this.base+'/'):null;},
  title: function(tree) {var h=this.first(tree,function(n){return n.tag==='h1';});if(h)return this.text(h);var meta=this.first(tree,function(n){return n.tag==='meta'&&(n.attrs.property==='og:title'||n.attrs.name==='title');});if(meta)return meta.attrs.content;return this.text(this.first(tree,function(n){return n.tag==='title';}));},
  cover: function(tree) {var n=this.first(tree,function(n){return n.tag==='meta'&&n.attrs.property==='og:image';});return n?this.abs(n.attrs.content):null;},
  unique: function(items) {var seen={};return items.filter(function(i){if(!i.id||seen[i.id]||!i.title)return false;seen[i.id]=true;return true;});},
  next: function(tree,page) {return this.links(tree,new RegExp('(?:[?&]page=|/page/|/page-)(?:'+(page+1)+')(?:\\D|$)')).length>0;},
  imageContent: function(images,page) {if(!images.length)throw new Error(this.name+'：没有读取到正文图片');var headers={};images.forEach(function(u){headers[u]=H.headers(page);});return {kind:'images',images:images,imageHeaders:headers};},
  textContent: function(text) {if(!text||text.length<20)throw new Error(this.name+'：没有读取到正文，请确认章节是否需要登录');return {kind:'text',text:text};}
};

H.base="https://www.jjmhw9.top";H.name="漫小肆";
var LumeSource={id:"fxcomic_comic",name:"漫小肆",version:"1.0.1",category:"comic",

/// 已知域名（发布页会给出最新一个；这里是兜底）。
__hosts: ['https://www.jjmhw9.top'],
/// 发布页（用户给的入口就是它）：里面一行 `location.href="…"` 指向当前站址。
__publish: 'https://www.freexcomic.com/',
__host: '',

__path: function (url) {
  return String(url == null ? '' : url).trim().replace(/^https?:\/\/[^/]+/i, '');
},

/// 站点长相：认这几个标记就知道「这个域名是漫画站本体」，不是广告跳转。
__looksLikeSite: function (html) {
  return /mh-list|mh-cover|\/book\/\d+/.test(String(html || ''));
},

/// 探一个域名：通就返回 true；403/503 交给 H.response 抛「需要网页验证」。
async __probe(host) {
  var response = await LumeSource.http.get(host + '/', { headers: H.headers(host + '/') });
  if (!response) return false;
  if (response.status === 403 || response.status === 503 || response.status === 521) H.response(response);
  if (response.status !== 200) return false;
  var body = String(response.body || '');
  H.response(response);
  return this.__looksLikeSite(body);
},

/// 从发布页里读最新站址：优先 `location.href="…"`，其次页面里的站外域名。
async __fromPublish() {
  var out = [];
  var seen = {};
  var self = this;
  function push(url) {
    var host = String(url || '').replace(/\/+$/, '');
    if (!/^https?:\/\/[a-z0-9.-]+/i.test(host)) return;
    if (host.indexOf('freexcomic') >= 0) return;
    if (seen[host]) return;
    seen[host] = true;
    out.push(host);
  }
  try {
    var response = await LumeSource.http.get(this.__publish, { headers: H.headers(this.__publish) });
    if (!response || response.status !== 200) return out;
    var text = String(response.body || '');
    var direct = /location\.href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
    var m;
    while ((m = direct.exec(text)) !== null) push(m[1]);
    var links = /https?:\/\/[a-z0-9.-]+\.[a-z]{2,}[^"'\s<>)]*/gi;
    var found = text.match(links) || [];
    for (var i = 0; i < found.length && out.length < 4; i++) {
      if (/cloudflare|google|gstatic|baidu|99web|51\.la|googletag|ads/i.test(found[i])) continue;
      push(found[i]);
    }
  } catch (error) {
    // 发布页本身打不开（被墙 / 改版）：交给已知域名兜底，不把错误盖在正常路径上。
    return out;
  }
  return out;
},

/// 选定一个可用域名（脚本里所有请求都以它为 base）。
async __pickHost() {
  if (this.__host) return this.__host;
  var candidates = this.__hosts.slice();
  var published = await this.__fromPublish();
  for (var i = 0; i < published.length; i++) candidates.push(published[i]);
  for (var j = 0; j < candidates.length; j++) {
    var host = String(candidates[j]).replace(/\/+$/, '');
    if (await this.__probe(host)) {
      this.__host = host;
      H.base = host;
      return host;
    }
  }
  throw new Error('漫小肆：站点暂时不可用（已知域名与发布页都没通）');
},

/// 列表卡片（**2026-10-15 实测站点已换模板**，两套都认）：
///   新：`ul.manga-list-2 > li`，封面 `img.manga-list-2-cover-img`（src 或 data-original）、
///       标题 `p.manga-list-2-title > a`、副标题 `p.manga-list-2-tip`；
///   旧：`div.mh-item`（封面是 p.mh-cover 的 background-image，**不是 img**）。
/// 只认「卡片里挂着 /book/<数字id> 链接」的节点，广告位与分页器自然被排除。
__cover: function (node) {
  var box = H.first(node, function (n) {
    return /background-image/i.test(n.attrs.style || '') && /url\(/i.test(n.attrs.style || '');
  });
  if (box) {
    var m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(box.attrs.style);
    if (m) return H.abs(m[1], H.base + '/');
  }
  return H.image(node);
},

__items: function (tree) {
  var self = this;
  var cards = H.all(tree, function (n) {
    return n.tag === 'li' && !!H.first(n, function (x) {
      return x.tag === 'a' && /^\/book\/\d+/.test(x.attrs.href || '');
    });
  }).concat(
    H.all(tree, function (n) {
      return H.cls(n, 'mh-item');
    })
  );
  return H.unique(
    cards.map(function (n) {
      var links = H.all(n, function (x) {
        return x.tag === 'a' && /^\/book\/\d+/.test(x.attrs.href || '');
      });
      var link = links[0];
      if (!link) return { id: '', title: '' };
      var title = '';
      for (var i = 0; i < links.length; i++) {
        var text = H.clean(links[i].attrs.title || H.text(links[i]));
        if (text && text.length > title.length) title = text;
      }
      // 老模板的标题在 h2.title 里，新模板与链接标题同源。
      if (!title) {
        var head = H.first(n, function (x) {
          return x.tag === 'h2' && H.cls(x, 'title');
        });
        var headLink = head ? H.first(head, function (x) {
          return x.tag === 'a';
        }) : null;
        title = headLink ? H.clean(headLink.attrs.title || H.text(headLink)) : '';
      }
      var note = H.first(n, function (x) {
        return (x.tag === 'p' && (H.cls(x, 'chapter') || H.cls(x, 'manga-list-2-tip')));
      });
      return {
        id: self.__path(link.attrs.href),
        title: title,
        cover: self.__cover(n),
        coverHeaders: H.headers(H.base + '/'),
        subtitle: note ? H.clean(H.text(note)).slice(0, 80) : null
      };
    })
  );
},

/// 首页：四块（最近更新 / 连载 / 完结 / 更新）。
async home() {
  var defs = [['/booklist', '最近更新'], ['/update', '最近更新章节'], ['/booklist?end=0', '連載中'], ['/booklist?end=1', '已完結']];
  var boards = [];
  var seen = {};
  for (var i = 0; i < defs.length; i++) {
    try {
      var result = await this.list({ categoryId: defs[i][0], page: 1 });
      var items = (result && result.items) || [];
      // 「最近更新」与「更新」两块内容本来就同源，重复的时候就只留一块。
      var key = items.length ? items[0].id : '';
      if (!items.length || seen[key]) continue;
      seen[key] = true;
      boards.push({ title: defs[i][1], items: items.slice(0, 12) });
    } catch (error) {
      if (!boards.length) throw error;
    }
  }
  return boards;
},

/// 分类（用户口径：按网页给全）。站点自己的入口都在这儿：
///   /booklist 全部 ｜ /booklist?end=0 连载中 ｜ /booklist?end=1 已完结
///   /update 最近更新 ｜ /rank 排行 ｜ /rank?end=0 完结排行
/// 筛选（状态 / 地区 / 标签）在 filters() 里，值是站点 `/booklist?...` 查询串自己的值。
async categories() {
  return [
    { id: '/booklist', title: '全部' },
    { id: '/booklist?end=0', title: '連載中' },
    { id: '/booklist?end=1', title: '已完結' },
    { id: '/update', title: '最近更新' },
    { id: '/rank', title: '排行' },
    { id: '/rank?end=0', title: '完結排行' }
  ];
},

/// 筛选：站点书库页筛选条（状态 / 地区）与 `/tag` 页的全部分类。
async filters() {
  return {groups:[
    {id:'end',title:'状态',options:[
      {id:'-1',title:'全部'},{id:'0',title:'連載中'},{id:'1',title:'已完結'}
    ]},
    {id:'area',title:'地区',options:[
      {id:'-1',title:'全部'},{id:'1',title:'韩国'},{id:'2',title:'日本'},{id:'3',title:'台湾'}
    ]},
    {id:'tag',title:'分类',options:[
      {id:'',title:'全部'},{id:'青春',title:'青春'},{id:'性感',title:'性感'},
      {id:'长腿',title:'长腿'},{id:'多人',title:'多人'},{id:'御姐',title:'御姐'},
      {id:'巨乳',title:'巨乳'},{id:'新婚',title:'新婚'},{id:'媳妇',title:'媳妇'},
      {id:'暧昧',title:'暧昧'},{id:'清纯',title:'清纯'},{id:'调教',title:'调教'},
      {id:'少妇',title:'少妇'},{id:'风骚',title:'风骚'},{id:'同居',title:'同居'},
      {id:'淫乱',title:'淫乱'},{id:'好友',title:'好友'},{id:'女神',title:'女神'},
      {id:'诱惑',title:'诱惑'},{id:'偷情',title:'偷情'},{id:'出轨',title:'出轨'},
      {id:'正妹',title:'正妹'},{id:'家教',title:'家教'}
    ]}
  ]};
},

/// 把筛选选择拼进书库地址（站点自己的查询串：tag / area / end）。
///
/// 值走白名单；App 会把空 id 的「全部」换成标题再送回来，这里一并当作没选。
/// 站点书库页是 `/booklist/`（带尾斜杠也认），选了筛选就落到它上面。
__withFacets: function (url, filters) {
  var base = String(url == null ? '' : url).trim() || '/booklist/';
  var end = this.__facetValue(filters && filters.end, ['0', '1']);
  var area = this.__facetValue(filters && filters.area, ['1', '2', '3']);
  var tag = this.__facetText(filters && filters.tag);
  if (!end && !area && !tag) return base;
  if (base.indexOf('/booklist') !== 0) base = '/booklist/';
  var parts = base.split('?');
  var params = {};
  var order = [];
  (parts.length > 1 ? parts[1] : '').split('&').forEach(function (pair) {
    if (!pair) return;
    var i = pair.indexOf('=');
    var name = i < 0 ? pair : pair.slice(0, i);
    var value = i < 0 ? '' : pair.slice(i + 1);
    if (!name || order.indexOf(name) >= 0) return;
    order.push(name);
    params[name] = value;
  });
  if (tag) params.tag = tag;
  if (area) params.area = area;
  if (end) params.end = end;
  var out = [];
  order.forEach(function (name) {
    if (params[name] !== undefined) out.push(name + '=' + params[name]);
  });
  ['tag', 'area', 'end'].forEach(function (name) {
    if (params[name] === undefined || order.indexOf(name) >= 0) return;
    out.push(name + '=' + params[name]);
  });
  return parts[0] + (out.length ? '?' + out.join('&') : '');
},

__facetValue: function (value, allowed) {
  var text = String(value == null ? '' : value).split(',')[0];
  return allowed.indexOf(text) >= 0 ? text : '';
},

__facetText: function (value) {
  var text = String(value == null ? '' : value).split(',')[0].trim();
  if (!text || text === '全部' || text === '-1') return '';
  if (!/^[^&#?\\/]+$/.test(text)) return '';
  return encodeURIComponent(text);
},

/// 列表 / 搜索：搜索是 `/search?keyword=`（服务端渲染，实测有结果）。
async list(argument) {
  var args = argument || {};
  await this.__pickHost();
  var page = Number(args.page) || 1;
  if (page < 1) page = 1;
  var keyword = H.clean(args.keyword || '').trim();
  var category = String(args.categoryId == null ? '' : args.categoryId).trim();
  var url = keyword
    ? '/search?keyword=' + encodeURIComponent(keyword)
    : this.__withFacets(category || '/booklist/', args.filters);
  if (page > 1) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page;
  var html = await H.get(url);
  var tree = H.tree(html);
  var items = this.__items(tree);
  if (!items.length) {
    console.warn('[fxcomic] 列表没解析出条目：' + url + '（' + html.length + ' 字符）');
  }
  return { items: items, hasMore: H.next(tree, page) };
},

/// 详情：`p.detail-main-info-title` 标题、`div.detail-main-cover` 封面、
/// `p.detail-main-info-author`（别名 / 作者 / 地区）、`p.detail-main-info-class` 标签、
/// `p.detail-desc` 简介。老模板（banner_detail_form）里的那一套仍然兜底。
async detail(argument) {
  await this.__pickHost();
  var id = this.__path(argument && argument.id);
  if (!id || id.indexOf('/book/') !== 0) return null;
  var tree = H.tree(await H.get(id));
  var head = H.first(tree, function (n) {
    return n.tag === 'p' && H.cls(n, 'detail-main-info-title');
  });
  var title = head ? H.clean(H.text(head)) : '';
  if (!title) title = H.title(tree);
  if (!title) return null;
  var banner = H.first(tree, function (n) {
    return H.cls(n, 'banner_detail_form');
  });
  var main = H.first(tree, function (n) {
    return H.cls(n, 'detail-main');
  });
  var coverNode = H.first(main || banner || tree, function (n) {
    return n.tag === 'img' && /\/static\/upload\//.test(n.attrs['data-original'] || n.attrs['data-src'] || n.attrs.src || '');
  });
  var cover = coverNode
    ? H.abs(coverNode.attrs['data-original'] || coverNode.attrs['data-src'] || coverNode.attrs.src, H.base + '/')
    : null;
  var scope = main || banner || tree;
  var bits = [];
  H.all(scope, function (n) {
    return n.tag === 'p' && (H.cls(n, 'detail-main-info-author') || H.cls(n, 'subtitle'));
  }).forEach(function (n) {
    var text = H.clean(H.text(n));
    if (text && bits.indexOf(text) < 0 && text.length < 80) bits.push(text);
  });
  // 简介与标签在 `div.detail-main` **外面**（`p.detail-desc` 是它的兄弟），
  // 因此这两个从整棵树里找，别的信息仍在 detail-main 里找。
  var desc = H.first(tree, function (n) {
    return n.tag === 'p' && (H.cls(n, 'detail-desc') || H.cls(n, 'content')) && H.text(n).length > 12;
  });
  var tags = [];
  H.all(tree, function (n) {
    return n.tag === 'a' && /\/booklist\/?\?tag=/.test(n.attrs.href || '');
  }).forEach(function (n) {
    var text = H.clean(n.attrs.title || H.text(n));
    if (text && text !== '全部' && tags.indexOf(text) < 0) tags.push(text);
  });
  return {
    id: id,
    title: title,
    cover: cover,
    coverHeaders: H.headers(H.base + '/'),
    subtitle: bits.length ? bits.join(' · ').slice(0, 160) : null,
    description: desc ? H.clean(H.text(desc)) : null,
    tags: tags.length ? tags : undefined
  };
},

/// 剧集：详情页目录 `#detail-list-select li a[href=/chapter/<id>]`，按出现顺序（真站默认正序）。
async chapters(argument) {
  await this.__pickHost();
  var id = this.__path(argument && argument.id);
  if (!id) return [];
  var self = this;
  var tree = H.tree(await H.get(id));
  var box = H.first(tree, function (n) {
    return n.attrs.id === 'detail-list-select';
  });
  var rows = [];
  H.all(box || tree, function (n) {
    return n.tag === 'a' && /\/chapter\/\d+/.test(n.attrs.href || '');
  }).forEach(function (n) {
    var path = self.__path(n.attrs.href);
    rows.push({ id: path, title: H.clean(n.attrs.title || H.text(n)) });
  });
  rows = H.unique(rows);
  // 真站目录是正序；万一站点改成倒序，按章节编号兜底排一次。
  var ordered = rows.slice().sort(function (x, y) {
    return self.__num(x.id) - self.__num(y.id);
  });
  return ordered.length ? ordered : rows;
},

__num: function (path) {
  var m = /\/chapter\/(\d+)/.exec(this.__path(path));
  return m ? Number(m[1]) : 0;
},

/// 正文：章节页 `div.comiclist` 里的 img[data-original]（站点自己的图床）。
async content(argument) {
  await this.__pickHost();
  var id = this.__path((argument && argument.chapterId) || (argument && argument.id));
  if (!id) throw new Error('漫小肆：缺少章节地址');
  var tree = H.tree(await H.get(id));
  var box = H.first(tree, function (n) {
    return H.cls(n, 'comiclist');
  });
  var images = [];
  var seen = {};
  H.all(box || tree, function (n) {
    return n.tag === 'img';
  }).forEach(function (n) {
    var url = H.abs(n.attrs['data-original'] || n.attrs['data-src'] || n.attrs.src, H.base + '/');
    if (/\/static\/upload\//.test(url) === false) return;
    if (seen[url]) return;
    seen[url] = true;
    images.push(url);
  });
  if (!images.length) {
    throw new Error('漫小肆：本章节没有取到图片（可能需要登录，或站点结构已变化）');
  }
  var page = H.abs(id, H.base + '/');
  var headers = {};
  for (var i = 0; i < images.length; i++) headers[images[i]] = H.headers(page);
  return { kind: 'images', images: images, imageHeaders: headers };
}

};
