// LumeSource: {"id":"hlib_novel","name":"H图书馆","version":"1.0.0","category":"novel"}
// Embedded into each source by tools/build_requested_sources.py; no remote code imports.
var H = {
  base: '', name: 'H图书馆', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
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

H.base="https://hlib.cc";H.name="H图书馆";
var LumeSource={id:"hlib_novel",name:"H图书馆",version:"1.0.0",category:"novel",
async home(){var r=await this.list({page:1});return [{title:"最新",items:r.items.slice(0,12)}];},

async categories(){return [{id:'/n',title:'小说'}];},
async list(a){a=a||{};var p=Number(a.page)||1,t=H.tree(await H.get('/n'+(p>1?'?p='+p:'')));var items=H.unique(H.links(t,/^\/n\/[\w-]+$/).map(function(n){return {id:n.attrs.href,title:H.text(n),cover:H.image(n),coverHeaders:H.headers()};}));if(a.keyword)items=items.filter(function(i){return i.title.indexOf(a.keyword)>=0;});return {items:items,hasMore:H.links(t,new RegExp('[?&]p='+(p+1)+'(?:\\D|$)')).length>0};},
async detail(a){var t=H.tree(await H.get(a.id));var title=H.text(H.first(t,function(n){return n.tag==='title';})).replace(/\s*[-–]\s*H图书馆.*$/,'');return {id:a.id,title:title,cover:H.cover(t),coverHeaders:H.headers()};},
async chapters(a){return [{id:a.id,title:'正文'}];},
async content(a){var t=H.tree(await H.get(a.chapterId||a.id));return H.textContent(H.text(H.first(t,function(n){return n.tag==='pre'&&n.attrs.id==='content';})));}

};
