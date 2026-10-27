// LumeSource: {"id": "web-1e3f9c2e80c4", "name": "野果短剧", "category": "video", "version": "1.0.2", "mirrors": ["https://yeguodj.com"], "mediaType": "video", "contentCategory": "adult"}
// LumeRuntime: javascript
// Bounded HTML tree + a small, portable CSS subset for generated source files.
// Supports tag, .class, #id, attributes, descendant, child and comma selectors.
function parseTree(html) {
  var root={tag:'#document',attrs:{},children:[],parent:null},stack=[root],count=0;
  var re=/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+|</gi,m;
  var voids=/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/;
  while((m=re.exec(html))) {
    var token=m[0],top=stack[stack.length-1];
    if(token.slice(0,9)==='<![CDATA['){top.children.push(token.slice(9,-3));continue;}
    if(token.slice(0,2)==='<!')continue;
    if(token[0]!=='<'){top.children.push(token);continue;}
    var tag=/^<(\/?)([\w:-]+)/.exec(token);if(!tag)continue;
    var name=tag[2].toLowerCase();
    if(tag[1]) {for(var i=stack.length-1;i>0;i--)if(stack[i].tag===name){stack.length=i;break;}continue;}
    if(++count>30000)throw new Error('网页元素过多，请使用具体列表或章节页');
    if(top.tag===name && /^(li|p|option|td|th)$/.test(name)){stack.pop();top=stack[stack.length-1];}
    var attrs={},a,ar=/([^\s=<>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    ar.lastIndex=tag[0].length;
    while((a=ar.exec(token)))attrs[a[1].toLowerCase()]=decode(a[2]!==undefined?a[2]:a[3]!==undefined?a[3]:a[4]||'');
    if(attrs['class'])attrs['class']=attrs['class'].replace(/\s+/g,' ');
    var node={tag:name,attrs:attrs,children:[],parent:top};top.children.push(node);
    if(/^(script|style|textarea)$/.test(name)) {
      var end=new RegExp('</'+name+'\\s*>','ig');end.lastIndex=re.lastIndex;var close=end.exec(html);
      node.children.push(html.slice(re.lastIndex,close?close.index:html.length));re.lastIndex=close?end.lastIndex:html.length;continue;
    }
    if(!voids.test(name) && !/\/\s*>$/.test(token))stack.push(node);
  }
  return root;
}
function nodeText(node) {
  if(typeof node==='string')return decode(node);
  if(/^(script|style)$/.test(node.tag))return '';
  return node.children.map(nodeText).join(' ').replace(/\s+/g,' ').trim();
}
function nodeRawText(node) {return node.children.filter(function(v){return typeof v==='string';}).join('');}
function simpleMatches(node, spec) {
  if(!node||!node.attrs)return false;
  // XML feeds use namespace prefixes. CSS pseudo-classes remain unsupported.
  var namespace=/^([\w-]+:[\w-]+)(?=$|[.#\[])/.exec(spec);
  if(namespace){if(node.tag!==namespace[1].toLowerCase())return false;spec=spec.slice(namespace[1].length);}
  var ok=true;
  spec=spec.replace(/\[([\w:-]+)(?:([~*^$|]?=)["']?([^\]"']*)["']?)?\]/g,function(_,key,op,value){
    var actual=node.attrs[key.toLowerCase()];
    if(actual===undefined)ok=false;
    else if(op==='=' && actual!==value)ok=false;
    else if(op==='*=' && actual.indexOf(value)<0)ok=false;
    else if(op==='^=' && actual.indexOf(value)!==0)ok=false;
    else if(op==='$=' && actual.slice(-value.length)!==value)ok=false;
    else if(op==='~=' && actual.split(/\s+/).indexOf(value)<0)ok=false;
    return '';
  });
  var tag=/^[\w*-]+/.exec(spec);if(tag&&tag[0]!=='*'&&node.tag!==tag[0].toLowerCase())ok=false;
  var re=/([.#])([\w-]+)/g,m;
  while((m=re.exec(spec)))if(m[1]==='#'?node.attrs.id!==m[2]:(' '+(node.attrs['class']||'')+' ').indexOf(' '+m[2]+' ')<0)ok=false;
  if(/[:\[\]]/.test(spec))throw new Error('CSS 仅支持标签、class、ID、属性、后代和子元素选择器');
  return ok;
}
function selectNodes(root, selector) {
  if(!selector)return [];
  var groups=selector.split(',').map(function(s){return s.trim().replace(/\s*>\s*/g,' > ').split(/\s+/);}),out=[];
  function chain(node,tokens,index) {
    if(!simpleMatches(node,tokens[index]))return false;
    if(index===0)return true;
    if(tokens[index-1]==='>')return chain(node.parent,tokens,index-2);
    for(var p=node.parent;p;p=p.parent)if(chain(p,tokens,index-1))return true;
    return false;
  }
  function visit(node) {
    if(typeof node==='string')return;
    if(node!==root&&groups.some(function(g){return chain(node,g,g.length-1);}))out.push(node);
    node.children.forEach(visit);
  }
  visit(root);return out;
}
function firstNode(root, selector) {return selectNodes(root,selector)[0]||null;}
// Media feeds often expose HTML5 players directly and have no detail link.
// Prefer their real media cards over unrelated navigation/category thumbnails.
function inlineMediaItems(html,base) {
  var root=parseTree(html),tag=C.media==='audio'?'audio':'video',seen={},out=[];
  selectNodes(root,tag).forEach(function(node){
    var nested=firstNode(node,'source'),attrs=node.attrs;
    var src=abs(attrs['data-src']||attrs.src||(nested&&(nested.attrs['data-src']||nested.attrs.src))||'',base);
    if(!/^https?:\/\//i.test(src)||!(/\.(?:mp4|webm|m3u8|mp3|m4a|ogg|aac)(?:[?#]|$)/i.test(src))||seen[src])return;
    var cover=abs(attrs.poster||attrs['data-poster']||'',base),label=attrs.title||attrs['aria-label']||attrs['data-title']||attrs['data-caption']||attrs['data-cast-description']||'';
    if(!label&&node.parent){var title=firstNode(node.parent,'h2,h3,h4,.title');if(title)label=nodeText(title);}
    seen[src]=true;out.push({id:src,title:decode(label).trim()||'视频 '+(out.length+1),cover:cover,mediaUrl:src,coverHeaders:{Referer:base},mediaHeaders:{Referer:base}});
  });return out;
}
function imageUrl(node, base) {
  if(!node)return '';
  for(var keys=['data-original','data-lazy-src','data-src','data-url','data-background','poster','src'];keys.length;) {
    var value=abs(node.attrs[keys.shift()]||'',base);if(value)return value;
  }
  var set=node.attrs['data-srcset']||node.attrs.srcset||'';
  if(set)return abs(set.split(',').pop().trim().split(/\s+/)[0],base);
  var bg=/url\(\s*(['"]?)(.*?)\1\s*\)/i.exec(node.attrs.style||'');
  return bg?abs(bg[2],base):'';
}
function ruleItems(html, base) {
  if(C.structuredList)return structuredItems(html,base);
  if(!C.listSelector)return anchors(html,base,C.links).filter(function(r){return !navigationAddress(r.id);});
  var root=parseTree(html),seen={},out=[];
  selectNodes(root,C.listSelector).forEach(function(card){
    var link=card.tag==='a'&&card.attrs.href?card:null;
    if(!link){for(var parent=card.parent;parent;parent=parent.parent){if(parent.tag==='a'&&parent.attrs.href){link=parent;break;}}}
    if(!link)link=firstNode(card,C.linkSelector||'a[href]');
    if(!link)return;
    var id=abs(link.attrs.href,base);if(!id||seen[id]||navigationAddress(id)||(C.links&&!(new RegExp(C.links,'i')).test(id)))return;
    var image=firstNode(card,C.coverSelector||'img,source'),heading=firstNode(card,C.titleSelector||'h2,h3,h4,.title');
    var title=(heading&&nodeText(heading))||link.attrs.title||(image&&image.attrs.alt)||nodeText(link);
    if(!title)return;
    var cover=imageUrl(image,base);
    seen[id]=true;out.push({id:id,title:title,cover:cover,coverHeaders:cover?{Referer:base}:{}});
  });
  return out;
}
function navigationAddress(id) {
  var path=id.replace(/^https?:\/\/[^/]+/i,'').split(/[?#]/)[0]||'/';
  if(path==='/'&&!/[?&](?:p|id|video_id|vod_id|book_id|m)=[^&#]+/.test(id))return true;
  return /\/(?:c|privacy|terms|dmca|2257|contact|about|help|faq|vip-info|points|featured|recommended|accounts?|login|signup|register|search|tags?|categories|category|types?|genres?|authors?|actors?|models?|users?|cdn-cgi)(?:\/|$)/i.test(path);
}
function ruleChapters(html,base) {
  if(!C.chapterSelector)return anchors(html,base,C.chapters);
  var seen={},out=[];
  selectNodes(parseTree(html),C.chapterSelector).forEach(function(n){
    var link=n.tag==='a'?n:firstNode(n,'a[href]'),id=link&&abs(link.attrs.href,base),title=link&&(link.attrs.title||nodeText(link));
    if(id&&title&&!seen[id]){seen[id]=true;out.push({id:id,title:title});}
  });return out;
}
function ruleImages(html,base,scoped) {
  var root=parseTree(html),nodes=selectNodes(root,scoped?'img':C.imageSelector||'article img,main img'),seen={},out=[];
  if(!nodes.length&&!C.imageSelector)nodes=selectNodes(root,'img');
  nodes.forEach(function(n){var src=imageUrl(n,base);if(src&&!seen[src]){seen[src]=true;out.push(src);}});
  return out;
}
function nextAddress(html,base) {
  var nodes=selectNodes(parseTree(html),C.nextSelector||'a[rel=next],a.next,.next a,.pagination a');
  for(var i=0;i<nodes.length;i++) {
    var n=nodes[i],s=nodeText(n),url=abs(n.attrs.href,base);
    if(url&&url!==base&&(/next/i.test(n.attrs.rel||'')||/下一[页頁]|下[页頁]|next|^[›»]$/i.test(s)||/(^|\s)next(\s|$)/.test(n.attrs['class']||'')))return url;
  }
  var links=anchors(html,base,'');
  for(var j=0;j<links.length;j++)if(/^(下一[页頁]|下[页頁]|next|[›»])$/i.test(links[j].title)&&links[j].id!==base)return links[j].id;
  return '';
}
function structuredMedia(html,base) {
  var scripts=selectNodes(parseTree(html),'script[type="application/ld+json"]'),found='';
  function walk(value) {
    if(!value||found)return;
    if(Array.isArray(value)){value.forEach(walk);return;}
    if(typeof value!=='object')return;
    var type=value['@type'],wanted=C.media==='audio'?'AudioObject':'VideoObject';
    if((type===wanted||(Array.isArray(type)&&type.indexOf(wanted)>=0))&&typeof value.contentUrl==='string')found=abs(value.contentUrl,base);
    if(!found&&value['@graph'])walk(value['@graph']);
  }
  scripts.forEach(function(n){try{walk(JSON.parse(nodeRawText(n)));}catch(_){}});
  return found;
}

async function browserDocument(actions, selector, purpose) {
  var a=actions||{}, pause=function(ms){return new Promise(function(r){setTimeout(r,ms);});};
  var deadline=Date.now()+4800;
  var spa=!!document.querySelector('#root,#app,#__next')&&!!document.querySelector('script[src]');
  function contentReady() {
    if(document.contentType.includes('json'))return true;
    if(purpose==='list') {
      if(document.querySelector('.video-card a[href],.module-item a[href],.manga-card a[href],.book-item a[href],.post-item a[href]'))return true;
      var works=Array.from(document.querySelectorAll('a[href] img')).filter(function(img){
        var link=img.closest('a');if(!link||img.closest('header,nav,footer'))return false;
        var path;try{path=new URL(link.href,location.href).pathname;}catch(_){return false;}
        return path!=='/'&&!/^\/(privacy|terms|featured|recommended|contact|accounts?|login|signup|tags?|categories|points|vip-info)(\/|$)/i.test(path);
      });
      // SPA navigation/promo cards can appear before the actual catalogue.
      // Wait for a real batch; a legitimate single-item list still returns at
      // the bounded deadline instead of being exported prematurely.
      return works.length >= (spa?2:1);
    }
    if(purpose==='images')return !!document.querySelector(selector||'.reading-content img,.comic-reader img,article img,main img');
    if(purpose==='chapters')return !!document.querySelector(selector||'.chapter-list a,.chapters a,.wp-manga-chapter a');
    if(purpose==='media') {
      if(document.querySelector('video[src]:not([src=""]),audio[src]:not([src=""]),source[src]:not([src=""]),.playlist a,.module-play-list a'))return true;
      if(Array.from(document.querySelectorAll('meta[property^="og:video"],meta[property^="og:audio"]')).some(function(m){return !!m.content;}))return true;
      return Array.from(document.scripts).some(function(s){return /\bplayer_\w+\s*=|["']contentUrl["']\s*:\s*["']https?:/i.test(s.textContent||'');});
    }
    return true;
  }
  // A loaded document can still be an empty SPA shell. Wait for the requested
  // content, using the same script on Windows and in the exported mobile source.
  if(purpose){var readyUntil=Date.now()+(spa&&purpose==='list'?3800:2500);while(!contentReady()&&Date.now()<readyUntil)await pause(100);}
  var scroll=Math.max(0,Math.min(3,Number(a.scroll)||0)), clicks=Math.max(0,Math.min(3,Number(a.clicks)||0));
  if(a.click) {
    for(var i=0;i<clicks;i++) {
      var button=document.querySelector(a.click);
      if(!button || button.disabled)break;
      if(button.tagName==='BUTTON' && button.type==='submit' && button.form)throw new Error('制源操作不提交表单，请选择加载更多按钮');
      button.click();await pause(350);
    }
  }
  for(var j=0;j<scroll;j++){window.scrollTo(0,document.documentElement.scrollHeight);await pause(350);}
  var wanted=a.wait||selector;
  if(wanted){var until=Math.min(deadline,Date.now()+2000);while(!document.querySelector(wanted)&&Date.now()<until)await pause(100);
    if(!document.querySelector(wanted))throw new Error('网页没有出现指定内容：'+wanted);}
  return document.contentType.includes('json')?document.body.innerText:document.documentElement.outerHTML;
}

// Read public JSON and literal player configuration. Never evaluate site scripts.
function literalString(token) {
  if(!token||token.length>16384)return '';
  try {if(token[0]==='"')return JSON.parse(token);}catch(_){}
  if(token[0]!=="'"||token[token.length-1]!=="'")return '';
  return token.slice(1,-1).replace(/\\(?:u([a-f\d]{4})|x([a-f\d]{2})|([\\/'"nrt]))/gi,function(_,u,x,c){return u||x?String.fromCharCode(parseInt(u||x,16)):({n:'\n',r:'\r',t:'\t'}[c]||c);});
}
function jsonLiteralAt(source,start) {
  var depth=0,quoted=false,escaped=false;
  for(var i=start;i<source.length&&i-start<2097152;i++) {
    var c=source[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;continue;}if(c==='{'||c==='[')depth++;if(c==='}'||c===']'){depth--;if(depth===0){try{return JSON.parse(source.slice(start,i+1));}catch(_){return null;}}}
  }return null;
}
function nuxtPayload(table) {
  // Nuxt's inline JSON uses devalue references, not plain nested JSON. Read a
  // bounded data subset; never run custom reducers or application code.
  if(!Array.isArray(table)||!table.length||table.length>12000)return null;
  var cache=Object.create(null),loading=Object.create(null),budget=48000;
  function read(index,depth){
    if(--budget<0||depth>64)throw new Error('Nuxt 数据超过解析范围');
    if(typeof index!=='number'||!Number.isInteger(index))throw new Error('Nuxt 引用无效');
    if(index===-1||index===-2||index===-3||index===-4||index===-5)return null;
    if(index===-6)return 0;
    if(index<0||index>=table.length)throw new Error('Nuxt 引用越界');
    if(Object.prototype.hasOwnProperty.call(cache,index))return cache[index];
    if(loading[index])throw new Error('Nuxt 包装器循环引用');
    var cell=table[index],out;
    if(!cell||typeof cell!=='object'){cache[index]=cell;return cell;}
    loading[index]=true;
    if(Array.isArray(cell)){
      if(typeof cell[0]==='string'){
        var tag=cell[0];
        if(/^(?:Reactive|ShallowReactive|Ref|ShallowRef|NuxtError)$/.test(tag))out=read(cell[1],depth+1);
        else if(tag==='EmptyRef'||tag==='EmptyShallowRef'){
          var empty=typeof cell[1]==='number'?read(cell[1],depth+1):cell[1];
          try{out=empty==='_'?null:empty==='0n'?'0':JSON.parse(empty);}catch(_){out=null;}
        }else if(tag==='Date'||tag==='URL'||tag==='BigInt')out=typeof cell[1]==='string'?cell[1]:null;
        else if(tag==='Set'||tag==='Map'){
          out=[];cache[index]=out;
          for(var j=1;j<cell.length;j++)out.push(read(cell[j],depth+1));
        }else if(tag==='null'){
          if(cell.length%2!==1)throw new Error('Nuxt 对象格式无效');
          out=Object.create(null);cache[index]=out;
          for(var k=1;k<cell.length;k+=2){if(typeof cell[k]!=='string'||cell[k]==='__proto__')throw new Error('Nuxt 对象属性无效');out[cell[k]]=read(cell[k+1],depth+1);}
        }else out=null; // Unknown site-specific reducers are deliberately opaque.
      }else{
        out=[];cache[index]=out;
        for(var i=0;i<cell.length;i++)out.push(read(cell[i],depth+1));
      }
    }else{
      out=Object.create(null);cache[index]=out;
      Object.keys(cell).forEach(function(key){if(key==='__proto__')throw new Error('Nuxt 对象属性无效');out[key]=read(cell[key],depth+1);});
    }
    cache[index]=out;delete loading[index];return out;
  }
  return read(0,0);
}
function publicPayloads(html) {
  var values=[],nodes=selectNodes(parseTree(html),'script'),initial=/\b(?:window\.)?(?:__INITIAL_STATE__|__PRELOADED_STATE__|__NUXT__)\s*=\s*([\[{])/g;
  nodes.forEach(function(n){var raw=nodeRawText(n),type=(n.attrs.type||'').toLowerCase();
    if(type==='application/json'||type==='application/ld+json'){
      try{var parsed=JSON.parse(raw),nuxt=n.attrs.id==='__NUXT_DATA__'||n.attrs['data-nuxt-data']!==undefined;values.push(nuxt?nuxtPayload(parsed):parsed);}catch(_){}return;
    }
    var m;initial.lastIndex=0;while((m=initial.exec(raw))){var v=jsonLiteralAt(raw,initial.lastIndex-1);if(v)values.push(v);}
  });return values;
}
function visitPayloads(values,visitor) {
  var remaining=12000;
  function walk(v,path,depth){if(!v||typeof v!=='object'||depth>14||--remaining<0)return;visitor(v,path);if(Array.isArray(v)){v.slice(0,1000).forEach(function(x,i){walk(x,path.concat(i),depth+1);});}else Object.keys(v).slice(0,100).forEach(function(k){if(k!=='__proto__'&&k!=='constructor')walk(v[k],path.concat(k),depth+1);});}
  values.forEach(function(v,i){walk(v,[i],0);});
}
function payloadImage(v,base){if(Array.isArray(v))return payloadImage(v[0],base);if(v&&typeof v==='object')return abs(v.url||v.src||v.contentUrl||'',base);return typeof v==='string'?abs(v,base):'';}
function structuredItems(html,base) {
  var best=[],bestScore=0;
  visitPayloads(publicPayloads(html),function(v,path){
    if(!Array.isArray(v)||!v.length)return;
    var out=[],seen={};v.slice(0,1000).forEach(function(x){
      if(!x||typeof x!=='object')return;x=x.node||x.item||x.attributes||x;
      var raw=x.url||x.link||x.href||x.detailUrl||x.detail_url||x.canonicalUrl;
      if(typeof raw!=='string'||!(/^(?:https?:\/\/|\/[^/]|\.\.?\/)/i.test(raw)))return;
      var id=abs(raw,base),title=x.title||x.name||x.headline;
      if(title&&typeof title==='object')title=title.rendered;
      if(!id||typeof title!=='string'||!title.trim()||seen[id]||/\/(?:search|categories|category|tags?|login|accounts?|authors?|users?)(?:\/|\?|$)/i.test(id))return;
      if(C.links&&!(new RegExp(C.links,'i')).test(id))return;
      var cover=payloadImage(x.thumbnailUrl||x.thumbnail_url||x.cover||x.coverUrl||x.poster||x.image,base);
      // A named URL alone may be site navigation. Require artwork or a work schema.
      if(!cover&&!/VideoObject|AudioObject|Book|Comic|Movie|TVSeries/.test(String(x['@type']||'')))return;
      seen[id]=true;out.push({id:id,title:text(title),cover:cover,coverHeaders:cover?{Referer:base}:{}});
    });var score=out.length+out.filter(function(x){return x.cover;}).length*3;
    if(score>bestScore){bestScore=score;best=out;}
  });return best;
}
function payloadMedia(html,base) {
  var candidates=[];
  visitPayloads(publicPayloads(html),function(v,path){
    if(Array.isArray(v))return;
    // Recommendations and ads are not the current work's playback source.
    if(path.some(function(k){return /recommend|related|advert|banner/i.test(String(k));}))return;
    ['contentUrl','playUrl','play_url','videoUrl','video_url','audioUrl','audio_url','file','src'].forEach(function(k){
      var u=v[k];if(typeof u!=='string')return;
      if(/\.(?:m3u8|mpd|mp4|webm|mp3|m4a|m4b|aac|flac|ogg|opus|wav)(?:[?#]|$)/i.test(u))candidates.push(abs(u,base));
    });
  });return candidates.filter(Boolean)[0]||'';
}
function playerLiteralMedia(html,base) {
  if(!/<(?:video|audio)\b/i.test(html)&&!/jwplayer\s*\(|videojs\s*\(/i.test(html))return '';
  var nodes=selectNodes(parseTree(html),'script'),found='';
  nodes.forEach(function(n){if(found||n.attrs.src)return;var raw=nodeRawText(n);
    // Inspect only scripts actually using a player, not unrelated ad scripts.
    if(!/\.loadSource\s*\(|\.src\s*=|jwplayer\s*\(|videojs\s*\(/.test(raw))return;
    var literal='(?:"(?:[^"\\\\]|\\\\.)*"|\x27(?:[^\x27\\\\]|\\\\.)*\x27)',expression=literal,vars={},m;
    for(var level=0;level<2;level++)expression='(?:'+literal+'|(?:atob|decodeURIComponent)\\(\\s*'+expression+'\\s*\\))';
    function read(s,depth){if(depth>3)return '';var wrap=/^(atob|decodeURIComponent)\(\s*([\s\S]*)\s*\)$/.exec(s);if(!wrap)return literalString(s);try{var v=read(wrap[2].trim(),depth+1);return wrap[1]==='atob'?atob(v):decodeURIComponent(v);}catch(_){return '';}}
    var declarations=new RegExp('\\b(?:var|let|const)\\s+([\\w$]+)\\s*=\\s*('+expression+')(?=\\s*[,;\\n]|\\s*$)','g');
    while((m=declarations.exec(raw)))vars[m[1]]=read(m[2],0);
    var calls=new RegExp('(?:\\.loadSource\\s*\\(\\s*|\\.src\\s*=\\s*)('+expression+'|[\\w$]+)(?=\\s*[,);]|\\s*$)','g');
    while((m=calls.exec(raw))){var value=vars[m[1]]||read(m[1],0);if(/\.(?:m3u8|mpd|mp4|webm|mp3|m4a|aac|flac|ogg|wav)(?:[?#]|$)/i.test(value)){found=abs(value,base);break;}}
    if(!found&&/jwplayer\s*\(|videojs\s*\(/.test(raw)){
      var files=new RegExp('(?:["\x27]?(?:file|src)["\x27]?)\\s*:\\s*('+expression+')(?=\\s*[,}])','g');
      while((m=files.exec(raw))){var u=read(m[1],0);if(/\.(?:m3u8|mpd|mp4|webm|mp3|m4a|aac|flac|ogg|wav)(?:[?#]|$)/i.test(u)){found=abs(u,base);break;}}
    }
  });return found;
}
function feedItems(html,base) {
  var root=parseTree(html),out=[],seen={},channel=firstNode(root,'channel'),channelArt=firstNode(channel||root,'itunes:image,media:thumbnail,image');
  function artwork(n){if(!n)return '';var u=n.attrs.href||n.attrs.url;return abs(u||(firstNode(n,'url')&&nodeText(firstNode(n,'url')))||'',base);}
  selectNodes(root,'item,entry').forEach(function(n){
    var title=firstNode(n,'title'),enclosures=selectNodes(n,'enclosure,link[rel=enclosure],media:content'),media='';
    for(var i=0;i<enclosures.length;i++){var e=enclosures[i],u=abs(e.attrs.url||e.attrs.href||'',base),type=e.attrs.type||'';
      if(u&&((C.media==='audio'?/^audio\//:/^video\//).test(type)||(C.media==='audio'?/\.(?:mp3|m4a|m4b|aac|ogg|opus|flac|wav)(?:[?#]|$)/i:/\.(?:mp4|webm|m3u8|mpd)(?:[?#]|$)/i).test(u))){media=u;break;}}
    if(!media||!title||seen[media])return;seen[media]=true;
    var cover=artwork(firstNode(n,'itunes:image,media:thumbnail'))||artwork(channelArt),description=firstNode(n,'description,summary');
    out.push({id:media,title:nodeText(title),cover:cover,coverHeaders:cover?{Referer:base}:{},mediaUrl:media,description:description?nodeText(description):''});
  });return out;
}

// Public website API envelope; no account token or desktop session is exported.
var C={"url": "https://yeguodj.com", "id": "web-1e3f9c2e80c4", "name": "野果短剧", "category": "video", "mode": "yeguo", "api": "https://www.yeguodj.com/api.php", "list": "https://yeguodj.com/", "search": "", "links": "", "chapters": "(?:/play/|/vodplay/|/chapter/|/read/|/\\d+/\\d+\\.html)", "contentId": "", "categoryLinks": "/(?:category|categories|catalog|type|genre)/", "filterFormIndex": -1, "filterAction": "", "filterKeys": [], "filterNames": {}, "target": "video", "media": "video", "contentCategory": "adult", "profile": "野果短剧公开接口", "useBrowser": false, "version": "1.0.2"},ygDevice='',ygKnown={},ygSchemaPromise=null;
function ygBase(){return (LumeSource.config&&LumeSource.config.domain||C.url).replace(/\/+$/,'');}
function ygId(value){var m=/\/drama\/(?:detail|video)\/(\d+)/.exec(String(value))||/^(\d+)$/.exec(String(value));if(!m)throw new Error('作品 ID 无效');return m[1];}
function ygRemember(row){ygKnown[row.id]=row;var ids=Object.keys(ygKnown);while(ids.length>100)delete ygKnown[ids.shift()];return row;}
async function ygApi(path,args){
  if(!ygDevice){try{ygDevice=await LumeSource.fs.readText('public-device.txt');}catch(_){}if(!/^[a-f0-9]{32}$/.test(ygDevice||'')){ygDevice='';for(var i=0;i<32;i++)ygDevice+=Math.floor(Math.random()*16).toString(16);try{await LumeSource.fs.writeText('public-device.txt',ygDevice);}catch(_){}}}
  var fields={bundleId:'com.pwa.mater',version:'1.3.2',oauth_type:'web',language:'zh',via:'pwa',oauth_id:ygDevice,trace_id:ygDevice,token:''};
  Object.keys(args||{}).forEach(function(k){fields[k]=args[k];});
  var body=Object.keys(fields).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(String(fields[k]));}).join('&');
  var r=await LumeSource.http.post(C.api+path,body,{headers:{'Content-Type':'application/x-www-form-urlencoded',Referer:ygBase()+'/'}});
  if(r.status===401)throw new Error('需要登录：请打开源站');
  if(r.status===403)throw new Error('NEED_WEBVIEW_VERIFY：站点需要网页验证');
  if(r.status<200||r.status>=300)throw new Error('接口 HTTP '+r.status);
  var envelope=JSON.parse(r.body),data=envelope;
  if(typeof envelope.data==='string'){
    var tools=LumeSource.tools;
    var raw=await tools.aes({data:envelope.data.replace(/ /g,'+'),key:await tools.base64Encode('2acf7e91e9864673'),iv:await tools.base64Encode('1c29882d3ddfcfd6'),mode:'CBC',encrypt:false});
    data=JSON.parse(await tools.base64Decode(raw));
  }
  if(Number(data.status)!==1)throw new Error(String(data.msg||data.message||'站点接口返回异常'));
  return data.data||{};
}
function ygCoverHeaders(){return {Referer:ygBase()+'/', 'x-lume-image-encoding':'aes-cbc-pkcs7','x-lume-image-key':'f5d965df75336270','x-lume-image-iv':'97b60394abc2fbe1'};}
async function ygSchema(){if(!ygSchemaPromise)ygSchemaPromise=ygApi('/api/theater/exploreList',{page:1,limit:20}).then(function(x){return x.filters||[];}).catch(function(e){ygSchemaPromise=null;throw e;});return await ygSchemaPromise;}
function ygItem(x){return ygRemember({id:String(x.video_id),title:String(x.title||''),cover:String(x.cover||''),coverHeaders:ygCoverHeaders(),subtitle:String(x.serialize_status_text||'')});}
var LumeSource={id:C.id,name:C.name,version:C.version||'1.0.2',category:'video',
  categories:async function(){var schema=await ygSchema(),theme=schema.filter(function(g){return g.key==='theme';})[0];return [{id:'all',title:'全部短剧'}].concat((theme&&theme.options||[]).map(function(o){return {id:'theme:'+o.value,title:String(o.name)};}));},
  filters:async function(){return {groups:(await ygSchema()).filter(function(g){return g.key!=='theme';}).map(function(g){return {id:g.key,title:String(g.title),options:[{id:'',title:'全部'}].concat((g.options||[]).map(function(o){return {id:String(o.value),title:String(o.name)};}))};})};},
  list:async function(a){a=a||{};if(a.keyword)throw new Error('本站关键词搜索尚未适配，请使用分类浏览或源站搜索');var page=Math.max(1,Number(a.page)||1),args={page:page,limit:20},schema=await ygSchema();
    Object.keys(a.filters||{}).forEach(function(k){var value=String(a.filters[k]||''),group=schema.filter(function(g){return g.key===k;})[0];if(!group||value&&!group.options.some(function(o){return String(o.value)===value;}))throw new Error('未支持的筛选值：'+k);if(value)args[k]=Number(value);});
    var category=String(a.categoryId||'all');if(category!=='all'){var m=/^theme:(\d+)$/.exec(category);if(!m)throw new Error('分类无效');args.theme=Number(m[1]);}
    var data=await ygApi('/api/theater/exploreList',args);if(!Array.isArray(data.list))throw new Error('列表格式不正确');return {items:data.list.filter(function(x){return x.video_id!=null&&x.title;}).map(ygItem),hasMore:typeof data.total==='number'?page*20<data.total:data.list.length>=20};},
  home:async function(){return (await LumeSource.list({page:1})).items;},
  detail:async function(a){var id=ygId(a.id),x=await ygApi('/api/playlet/detail',{video_id:id,episode_id:0,related_limit:0});var row=ygItem(x);row.id=id;row.description=String(x.description||'');row.episodes=x.episodes||[];return ygRemember(row);},
  chapters:async function(a){var row=await LumeSource.detail(a);return row.episodes.map(function(e,i){var number=Number(e.sort)||i+1;return {id:String(e.id)+':'+number,title:'第'+number+'集'+(e.access&&e.access.can_play===false?'（源站权限限制）':'')};});},
  content:async function(a){var id=ygId(a.id),m=/^(\d+):(\d+)$/.exec(String(a.chapterId||''));if(!m)throw new Error('选集编号无效，请重新打开详情');var x=await ygApi('/api/playlet/play',{video_id:id,episode_id:m[1]});var url=String(x.video_url||'');if(!(x.access&&x.access.can_play===false)&&/^https?:\/\//i.test(url))return {kind:'video',url:url,headers:{Referer:ygBase()+'/'}};return {kind:'webplayer',pageUrl:ygBase()+'/drama/video/'+id+'/ep-'+m[2]+'/',headers:{Referer:ygBase()+'/'}};}
};
