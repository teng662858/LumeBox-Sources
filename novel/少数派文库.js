// LumeSource: {"id":"sspwk_novel","name":"少数派文库","version":"1.0.0","category":"novel"}
//
// 少数派文库（sspwk.vip，繁中/简中小说站，御宅屋系模板）。
// 本文件对着**真站响应**写（首页 / 分类页 / 详情 / 目录页 / 章节页 / 搜索全取回来存档核过）。
//
// 站点结构（2026-10-14 实测）：
//   分类      /booksort/<栏目号>/<页>.html   栏目号＝站点自己的编号（1 耽美 / 6 高辣文 / 5 言情 /
//                                            2 百合 / 3 玄幻 / 4 修仙 / 8 种田 / 10 网游 /
//                                            11 其他 / 7 腹黑 / 9 高干 / 13 科幻）
//   列表      GET /booksort/<栏目号>/<页>.html   卡片 div.common-bookele（1 基页号，30/页）
//   搜索      **POST** /search/（searchkey=…&searchtype=all）  结果是 div.SHsectionThree-middle 里的 p
//             —— 站点表单就是 POST，GET 参数无效（实测）
//   详情      GET /novel/<书号>.html         书名在正文「《书名》简介」的 h3 里（比 <title> 干净），
//                                            信息栏 td.article_info_td（作者/类别/最新/更新时间），
//                                            简介在 <pre> 里
//   剧集      GET /indexlist/<书号>/<页>/     ul.list_li 里的 /novel/<书号>/<章节号>.html（30/页，
//                                            页数从页内 <select> 的最后一页读出，逐页收齐）
//   正文      GET /novel/<书号>/<章节号>.html   div#nr1 的段落；**站点自己那条「最新通知」要剔掉**
//                                            （<ecmsxs> 开头的公告，真站每章都有）
//
// 已知边界：
// - 小说没有封面（真站就没有），cover 如实为 null。
// - 长书目录要翻好几页（每页 30 章），脚本按 30 页封顶（≈900 章）。
var H = {
  base: '', name: '少数派文库', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  clean: function (s) { return this.entity(String(s || '').replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'').replace(/<\/(?:p|div|section|li|h\d)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'' )).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim(); },
  entity: function(s) {return String(s||'').replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi,function(v){var map={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};if(map[v])return map[v];var code=v.charAt(2)==='x'?parseInt(v.slice(3),16):parseInt(v.slice(2),10);return Number.isFinite(code)?String.fromCodePoint(code):v;});},
  attr: function(s,k) {var m=new RegExp('(?:^|\\s)'+k+'\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))','i').exec(s||'');return this.entity(m?(m[1]!==undefined?m[1]:m[2]!==undefined?m[2]:m[3]):'');},
  abs: function(u,from) {u=this.entity(u).trim();if(!u)return '';if(/^https?:\/\//i.test(u))return u;if(u.indexOf('//')===0)return 'https:'+u;var b=from||this.base;if(u.charAt(0)==='/')return /^https?:\/\/[^/]+/.exec(b)[0]+u;return b.replace(/[^/]*$/,'')+u;},
  headers: function(page) {return {'User-Agent':this.ua,'Referer':page||this.base+'/'};},
  response: function(r) {if(!r)throw new Error(this.name+'：没有网络响应');var s=r.status;if(s===403||s===503||s===521)throw new Error('NEED_WEBVIEW_VERIFY：'+this.name+' 需要网页验证（HTTP '+s+'）');if(s!==200)throw new Error(this.name+'：请求失败（HTTP '+s+'）');var b=String(r.body||'');if(/cf-chl-|Just a moment|cf-turnstile|<title>\s*人机校验/i.test(b))throw new Error('NEED_WEBVIEW_VERIFY：'+this.name+' 需要网页验证');return b;},
  get: async function(u) {return this.response(await LumeSource.http.get(this.abs(u,this.base+'/'),{headers:this.headers()}));},
  post: async function(u,data) {var h=this.headers();h['Content-Type']='application/x-www-form-urlencoded';h['X-Requested-With']='XMLHttpRequest';return this.response(await LumeSource.http.post(this.abs(u,this.base+'/'),data,{headers:h}));},
  json: async function(u) {try{return JSON.parse(await this.get(u));}catch(e){if(/NEED_WEBVIEW_VERIFY|HTTP/.test(String(e)))throw e;throw new Error(this.name+'：数据格式已变化');}},
  // 剔除注释与 script/style 块：用 indexOf 扫描，**不用**懒惰星号正则。
  // QuickJS 的正则回溯是递归实现，`<!--[^]*?-->` / `<script[^]*?</script>`
  // 在长内联脚本上会一路递归吃栈，页面到几万字节就抛
  // `RangeError: Maximum call stack size exceeded`（实测 aaccoo / 色文网 的
  // 列表页必挂，整块解析失败）——「列表/分类空白」的根因之一。
  prune: function(html) {var s=String(html),out='',i=0;while(i<s.length){var lt=s.indexOf('<',i);if(lt<0){out+=s.slice(i);break;}out+=s.slice(i,lt);if(s.substr(lt,4)==='<!--'){var ce=s.indexOf('-->',lt+4);i=ce<0?s.length:ce+3;continue;}var low=s.substr(lt,8).toLowerCase();var nm=low.indexOf('<script')===0?'script':(low.indexOf('<style')===0?'style':'');if(nm){var nb=low.charAt(nm.length+1);if(nb&&nb!=='>'&&nb!=='/'&&nb!==' '&&nb!=='\t'&&nb!=='\n')nm='';}if(nm){var cl=s.toLowerCase().indexOf('</'+nm,lt);if(cl<0){i=s.length;break;}var gt=s.indexOf('>',cl);i=gt<0?s.length:gt+1;continue;}out+='<';i=lt+1;}return out;},
  tree: function(html) {html=this.prune(html);var root={tag:'root',attrs:{},children:[],raw:''},stack=[root],re=/<\/?([a-z][\w:-]*)\b([^>]*)>|([^<]+)/gi,m;while((m=re.exec(html))){var parent=stack[stack.length-1];if(m[3]){parent.children.push({tag:'#text',raw:m[3],attrs:{},children:[]});continue;}var tag=m[1].toLowerCase();if(m[0].charAt(1)==='/'){for(var i=stack.length-1;i>0;i--)if(stack[i].tag===tag){stack.length=i;break;}continue;}var attrs={},ar=/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,a;while((a=ar.exec(m[2])))attrs[a[1].toLowerCase()]=H.entity(a[2]!==undefined?a[2]:a[3]!==undefined?a[3]:a[4]);var node={tag:tag,attrs:attrs,children:[],raw:'',parent:parent};parent.children.push(node);if(!/^(?:img|input|br|hr|meta|link|source|area|embed|wbr)$/.test(tag)&&! /\/$/.test(m[2]))stack.push(node);}return root;},
  // 遍历改成**显式栈**：QuickJS 的可用递归深度很小（实测这个沙箱里普通函数只能
  // 递归约 20 层、带 forEach 的约 10 层），而真实页面随便就有 9~14 层嵌套——
  // 原来的 `visit` 递归在列表页必抛 RangeError，整块解析失败（列表/分类全空）。
  all: function(node,pred) {var out=[],stack=[node];while(stack.length){var n=stack.pop();if(pred(n))out.push(n);if(n.tag==='script'||n.tag==='style')continue;var ch=n.children;for(var i=ch.length-1;i>=0;i--)stack.push(ch[i]);}return out;},
  cls: function(n,c) {return (' '+(n.attrs.class||'')+' ').indexOf(' '+c+' ')>=0;},
  // 同上：`text` 原来是按层递归拼孩子，改成一棵显式帧栈的后序聚合（先算完孩子再拼，
  // 与递归版逐个字符等价）。
  text: function(node) {if(!node)return '';var frames=[{n:node,i:0,parts:[]}],result='';while(frames.length){var fr=frames[frames.length-1],n=fr.n,t=n.tag;if(t==='#text'){var leaf=this.entity(n.raw);frames.pop();if(frames.length)frames[frames.length-1].parts.push(leaf);else result=leaf;continue;}if(t==='script'||t==='style'){frames.pop();if(frames.length)frames[frames.length-1].parts.push('');else result='';continue;}var ch=n.children;if(fr.i<ch.length){frames.push({n:ch[fr.i++],i:0,parts:[]});continue;}var joined=fr.parts.join(/^(?:p|div|section|article|li|br)$/.test(t)?'\n':'');var done=this.clean(joined);frames.pop();if(frames.length)frames[frames.length-1].parts.push(done);else result=done;}return result;},
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

H.base="https://sspwk.vip";H.name="少数派文库";
var LumeSource={id:"sspwk_novel",name:"少数派文库",version:"1.0.0",category:"novel",

__path: function (url) {
  return String(url == null ? '' : url).trim().replace(/^https?:\/\/[^/]+/i, '');
},

/// 书号：/novel/161813.html 与 /novel/161813/19168455.html 都取第一个数字段。
__bookId: function (path) {
  var m = /\/(\d+)(?:\.html)?(?:$|\/)/.exec(this.__path(path));
  return m ? m[1] : '';
},

/// 书名：详情页里有「《书名》简介」这样一个 h3（正文里就有，比 <title> 干净）。
__bookName: function (tree, html) {
  var heads = H.all(tree, function (n) {
    return n.tag === 'h3';
  });
  for (var i = 0; i < heads.length; i++) {
    var m = /《([^》]+)》/.exec(H.text(heads[i]));
    if (m) return H.clean(m[1]);
  }
  var doc = /<title>([^<]*)<\/title>/i.exec(String(html || ''));
  return doc ? H.clean(doc[1].split('_')[0]) : '';
},

/// 列表卡片：div.common-bookele（h3 > a 书名；strong 作者；time 更新时间；span.abstract 简介）。
__items: function (tree) {
  var self = this;
  return H.unique(
    H.all(tree, function (n) {
      return H.cls(n, 'common-bookele');
    }).map(function (n) {
      var head = H.first(n, function (x) {
        return x.tag === 'h3';
      });
      var link = head ? H.first(head, function (x) {
        return x.tag === 'a';
      }) : H.first(n, function (x) {
        return x.tag === 'a' && /^\/novel\/\d+\.html$/.test(x.attrs.href || '');
      });
      var author = H.first(n, function (x) {
        return x.tag === 'strong';
      });
      var time = H.first(n, function (x) {
        return x.tag === 'time';
      });
      var bits = [];
      if (author) bits.push('作者：' + H.clean(H.text(author)));
      if (time) bits.push(H.clean(H.text(time)));
      return {
        id: self.__path(link ? link.attrs.href : ''),
        title: H.clean(H.text(link)),
        cover: null,
        subtitle: bits.length ? bits.join(' · ') : null
      };
    })
  );
},

/// 还有下一页吗：直接看「下一页」链向的是不是第 page+1 页。
__hasNext: function (tree, category, page) {
  var pattern = new RegExp('/booksort/' + category + '/' + (page + 1) + '\\.html');
  var links = H.all(tree, function (n) {
    return n.tag === 'a' && pattern.test(n.attrs.href || '');
  });
  return links.length > 0;
},

/// 搜索结果：div.SHsectionThree-middle 里的每个 <p>（[分类] 书名 / 作者）。
__searchItems: function (tree) {
  var self = this;
  var box = H.first(tree, function (n) {
    return H.cls(n, 'SHsectionThree-middle');
  });
  if (!box) return [];
  var rows = [];
  H.all(box, function (n) {
    return n.tag === 'p';
  }).forEach(function (p) {
    var link = H.first(p, function (x) {
      return x.tag === 'a' && /^\/novel\/\d+\.html$/.test(x.attrs.href || '');
    });
    if (!link) return;
    var author = H.first(p, function (x) {
      return x.tag === 'a' && /^\/author\//.test(x.attrs.href || '');
    });
    var title = H.clean(H.text(link)).replace(/全文阅读$/, '');
    rows.push({
      id: self.__path(link.attrs.href),
      title: title,
      cover: null,
      subtitle: author ? '作者：' + H.clean(H.text(author)) : null
    });
  });
  return H.unique(rows);
},

/// 章节正文：div#nr1 里的段落；站点自己的那段「最新通知」（<ecmsxs>）要剔掉。
__chapterText: function (node) {
  var lines = [];
  H.all(node, function (n) {
    return n.tag === 'p';
  }).forEach(function (p) {
    var text = H.clean(H.text(p));
    if (!text) return;
    if (/最新通知|网址已经更换|ecmsxs|UC浏览器|请重新添加网址/.test(text)) return;
    lines.push(text);
  });
  if (lines.length) return lines.join('\n');
  return H.clean(H.text(node));
},

/// 首页「最新」那一块（`li.last_li`）——home() 与「没选分类」时的 list() 共用。
__latestFromHome: function (tree) {
  var self = this;
  var items = [];
  H.all(tree, function (n) {
    return n.tag === 'li' && H.cls(n, 'last_li');
  }).forEach(function (li) {
      var link = H.first(li, function (x) {
        return x.tag === 'a' && /^\/novel\/\d+\.html$/.test(x.attrs.href || '');
      });
      if (!link) return;
      var author = H.first(li, function (x) {
        return x.tag === 'a' && /^\/author\//.test(x.attrs.href || '');
      });
      items.push({
        id: self.__path(link.attrs.href),
        title: H.clean(link.attrs.title || H.text(link)),
        cover: null,
        subtitle: author ? '作者：' + H.clean(H.text(author)) : null
      });
  });
  return H.unique(items);
},

/// 首页：最新小说（站点首页那块）+ 两块分类（玄幻 / 言情）。
async home() {
  var boards = [];
  try {
    var items = this.__latestFromHome(H.tree(await H.get('/')));
    if (items.length) boards.push({ title: '最新小说', items: items.slice(0, 12) });
  } catch (error) {
    // 首页抓不到不算致命：下面两块分类照旧。
  }
  var defs = [['3', '玄幻'], ['5', '言情']];
  for (var i = 0; i < defs.length; i++) {
    try {
      var result = await this.list({ categoryId: defs[i][0], page: 1 });
      if (result && result.items && result.items.length) {
        boards.push({ title: defs[i][1], items: result.items.slice(0, 12) });
      }
    } catch (error) {
      if (!boards.length) throw error;
    }
  }
  return boards;
},

/// 分类 = 站点导航里那 12 个书库（编号是站点自己的栏目号，实测逐条核对过）。
async categories() {
  return [
    { id: '1', title: '耽美' },
    { id: '6', title: '高辣文' },
    { id: '5', title: '言情' },
    { id: '2', title: '百合' },
    { id: '3', title: '玄幻' },
    { id: '4', title: '修仙' },
    { id: '8', title: '种田' },
    { id: '10', title: '网游' },
    { id: '11', title: '其他' },
    { id: '7', title: '腹黑' },
    { id: '9', title: '高干' },
    { id: '13', title: '科幻' }
  ];
},

/// 列表 / 搜索：
///   列表 GET /booksort/<栏目号>/<页>.html（1 基页号）
///   搜索 **POST** /search/（searchkey=…&searchtype=all）——GET 参数无效，实测
async list(argument) {
  var args = argument || {};
  var page = Number(args.page) || 1;
  if (page < 1) page = 1;
  var keyword = H.clean(args.keyword || '').trim();
  if (keyword) {
    if (page > 1) return { items: [], hasMore: false };
    var raw = await H.post('/search/', 'searchkey=' + encodeURIComponent(keyword) + '&searchtype=all');
    return { items: this.__searchItems(H.tree(raw)), hasMore: false };
  }
  var category = String(args.categoryId == null ? '' : args.categoryId).trim();
  // 没有分类（宿主还没选，或切源后旧分类被清掉）时退回**首页最新**，
  // 不再抛「无效分类」——真机日志里 `LumeSource.list 失败: 无效分类` 就是这里，
  // 用户看到的是一屏脚本错误，而不是列表。
  if (!/^\d+$/.test(category)) {
    var latest = this.__latestFromHome(H.tree(await H.get('/')));
    return { items: latest, hasMore: false };
  }
  var tree = H.tree(await H.get('/booksort/' + category + '/' + page + '.html'));
  return { items: this.__items(tree), hasMore: this.__hasNext(tree, category, page) };
},

/// 详情：书名（《书名》简介 那个 h3）、信息栏（作者 / 类别 / 最新 / 更新时间）、简介。
async detail(argument) {
  var id = this.__path(argument && argument.id);
  var bookId = this.__bookId(id);
  if (!bookId) return null;
  var html = await H.get('/novel/' + bookId + '.html');
  var tree = H.tree(html);
  var title = this.__bookName(tree, html);
  if (!title) return null;
  var bits = [];
  H.all(tree, function (n) {
    return H.cls(n, 'article_info_td');
  }).forEach(function (cell) {
    H.all(cell, function (n) {
      return n.tag === 'div';
    }).forEach(function (line) {
      var text = H.clean(H.text(line)).replace(/\s+/g, ' ').replace(/：\s+/g, '：').trim();
      if (!text || text.length > 60) return;
      if (/^(作者|类别|最新|更新时间)[:：]/.test(text) && bits.indexOf(text) < 0) bits.push(text);
    });
  });
  var pre = H.first(tree, function (n) {
    return n.tag === 'pre';
  });
  var desc = pre ? H.clean(H.text(pre)) : '';
  return {
    id: '/novel/' + bookId + '.html',
    title: title,
    cover: null,
    subtitle: bits.length ? bits.join(' · ') : null,
    description: desc ? desc.replace(/……$/, '') : null
  };
},

/// 目录页总页数：页内那个 <select> 里最后一页就是总页数（读不到就按 1 页）。
__indexPages: function (tree) {
  var pages = 1;
  var options = H.all(tree, function (n) {
    return n.tag === 'option';
  });
  for (var i = 0; i < options.length; i++) {
    var m = /\/indexlist\/\d+\/(\d+)\//.exec(options[i].attrs.value || '');
    if (m && Number(m[1]) > pages) pages = Number(m[1]);
  }
  return pages;
},

/// 一页目录里的章节（书名前缀去掉：真站的标题形如「书名_分节阅读_1」）。
__indexRows: function (tree) {
  var self = this;
  var rows = [];
  H.all(tree, function (n) {
    return n.tag === 'a' && /^\/novel\/\d+\/\d+\.html$/.test(n.attrs.href || '');
  }).forEach(function (n) {
    var text = H.clean(n.attrs.title || H.text(n));
    var at = text.indexOf('分节阅读');
    rows.push({ id: self.__path(n.attrs.href), title: at > 0 ? text.slice(at) : text });
  });
  return rows;
},

/// 抓目录的某一页；单页失败只当空页（别让一处 502 把整本目录废掉）。
__indexPage: function (bookId, page) {
  var self = this;
  return H.get('/indexlist/' + bookId + '/' + page + '/').then(function (html) {
    return self.__indexRows(H.tree(html));
  }, function () {
    return [];
  });
},

/// 剧集：目录页 /indexlist/<书号>/<页>/（每页 30 章）。
///
/// **分批并行 + 墙钟预算**：App 单次脚本调用有超时（默认 10 秒、用户可调到 5 秒），
/// 而长书目录能到 20+ 页——顺序抓实测 7.4 秒，正好顶在超时线上。改成每批 4 页并发
/// （App 网络队列按域名限流 2~3，4 页一批既不空等也不轰图床），到时间预算就带着
/// 已抓到的章节先返回：宁可不全，也不能让整次调用超时。
__MAX_INDEX_PAGES: 40,
__INDEX_BATCH: 4,
__INDEX_BUDGET_MS: 5000,
__MAX_CHAPTERS: 2000,

async chapters(argument) {
  var bookId = this.__bookId(argument && argument.id);
  if (!bookId) return [];
  var first = H.tree(await H.get('/indexlist/' + bookId + '/1/'));
  var pages = this.__indexPages(first);
  if (pages > this.__MAX_INDEX_PAGES) pages = this.__MAX_INDEX_PAGES;
  var rows = this.__indexRows(first);
  var seen = {};
  for (var k = 0; k < rows.length; k++) seen[rows[k].id] = true;
  if (pages <= 1) return H.unique(rows);
  var started = Date.now();
  for (var page = 2; page <= pages; page += this.__INDEX_BATCH) {
    var batch = [];
    for (var i = page; i < page + this.__INDEX_BATCH && i <= pages; i++) {
      batch.push(this.__indexPage(bookId, i));
    }
    var results = await Promise.all(batch);
    var fresh = 0;
    for (var b = 0; b < results.length; b++) {
      var found = results[b];
      for (var f = 0; f < found.length; f++) {
        if (seen[found[f].id]) continue;
        seen[found[f].id] = true;
        rows.push(found[f]);
        fresh++;
      }
    }
    // 一整批都是已见过的章节：站点给的页数上限偏大（或目录就这么多），收工。
    if (!fresh) break;
    if (Date.now() - started > this.__INDEX_BUDGET_MS) break;
  }
  return H.unique(rows).slice(0, this.__MAX_CHAPTERS);
},

/// 正文：章节页 div#nr1 的段落（文本类正文，阅读器直接排版）。
async content(argument) {
  var path = this.__path((argument && argument.chapterId) || (argument && argument.id));
  if (!path) throw new Error('少数派文库：缺少章节地址');
  var tree = H.tree(await H.get(path));
  var box = H.first(tree, function (n) {
    return n.attrs.id === 'nr1';
  }) || H.first(tree, function (n) {
    return n.attrs.id === 'nr';
  });
  if (!box) throw new Error('少数派文库：本章节没有取到正文（可能需要登录，或站点结构已变化）');
  return H.textContent(this.__chapterText(box));
}

};
