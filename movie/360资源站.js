// LumeSource: {"id": "web-07a5a1a92631", "name": "360资源站", "category": "video", "version": "1.0.2", "mirrors": ["https://360zy.com/", "https://360zy.net/", "https://360zy.vip/", "https://360zy.top/", "https://360zy.tv/", "https://360zy1.com/", "https://360zy2.com/", "https://360zy3.com/", "https://360zy4.com/", "https://360zy5.com/"], "mediaType": "video", "contentCategory": "movie", "network": "direct"}
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

// Standalone LumeBox runtime. No desktop tool or localhost server needed after export.
var C = {"url": "https://360zy.com/", "id": "web-07a5a1a92631", "name": "360资源站", "category": "video", "mode": "maccms", "api": "https://360zy.com/api.php/provide/vod/", "list": "https://360zy.com/", "search": "https://360zy.com/vodsearch/-------------.html?wd={keyword}", "links": "", "chapters": "(?:/play/|/vodplay/|/chapter/|/read/|/\\d+/\\d+\\.html)", "contentId": "", "categoryLinks": "/(?:category|categories|catalog|type|genre)/", "filterFormIndex": -1, "filterAction": "", "filterKeys": [], "filterNames": {}, "target": "video", "media": "video", "version": "1.0.2"};
var knownItems = {};
var pageLinks = {};
function remember(rows) {
  rows.forEach(function(row){knownItems[row.id]=row;});
  var ids=Object.keys(knownItems); while(ids.length>150) delete knownItems[ids.shift()];
  return rows;
}
function setQuery(url, values) {
  var split=url.split('#'), parts=split[0].split('?'), old=(parts[1]||'').split('&').filter(Boolean);
  var keys=Object.keys(values);
  old=old.filter(function(p){try{return keys.indexOf(decodeURIComponent(p.split('=')[0]))<0;}catch(_){return true;}});
  keys.forEach(function(k){old.push(encodeURIComponent(k)+'='+encodeURIComponent(String(values[k])));});
  return parts[0]+(old.length?'?'+old.join('&'):'')+(split.length>1?'#'+split.slice(1).join('#'):'');
}
function decode(s) {
  return String(s || '').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, function(x) {
    var named = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};
    if (named[x.toLowerCase()]) return named[x.toLowerCase()];
    var n = x.slice(2,-1), code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1),16) : parseInt(n,10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}
function text(s) { return decode(String(s || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim(); }
function attr(s,k) {
  var m = new RegExp('(?:^|\\s)' + k + '\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\\s>]+))','i').exec(s);
  return m ? decode(m[1] || m[2] || m[3] || '') : '';
}
function abs(s, base) {
  s = decode(s).trim(); base = base || C.url;
  if (!s || /^(?:javascript|data|mailto|tel|blob|file):/i.test(s) || s[0] === '#') return '';
  try { return new URL(s,base).href; } catch (_) {}
  var root = /^(https?:)\/\/([^/]+)/i.exec(base);
  if (!root) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.slice(0,2) === '//') return root[1] + s;
  if (s[0] === '?') return base.split(/[?#]/)[0] + s;
  var path = base.split(/[?#]/)[0].replace(/^https?:\/\/[^/]+/,'') || '/';
  var full = s[0] === '/' ? s : path.replace(/\/[^/]*$/, '/') + s;
  var parts = []; full.split('/').forEach(function(p){ if(p === '..') parts.pop(); else if(p !== '.') parts.push(p); });
  return root[1] + '//' + root[2] + parts.join('/');
}
function anchors(html, base, pattern) {
  html = html.replace(/<!--[^]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  var re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi, out = [], seen = {}, m;
  var filter = pattern ? new RegExp(pattern, 'i') : null;
  while ((m = re.exec(html))) {
    var id = abs(attr(m[1],'href'),base), img = /<img\b([^>]*)>/i.exec(m[2]);
    var title = attr(m[1],'title') || text(m[2]) || (img && attr(img[1],'alt'));
    if (!id || !title || seen[id] || (filter && !filter.test(id))) continue;
    seen[id] = true;
    out.push({id:id,title:title,cover:img ? abs(attr(img[1],'data-original') || attr(img[1],'data-src') || attr(img[1],'src'),base) : ''});
  }
  return out;
}
function contentBlock(html, id) {
  var tags = /<(\/?)([a-z][\w-]*)\b([^>]*)>/gi, m, tag, depth=0, start=0;
  while((m=tags.exec(html))) {
    if(!tag) {
      if(!m[1] && (id ? attr(m[3],'id') === id : /^(article|main)$/i.test(m[2]))) {tag=m[2].toLowerCase();depth=1;start=tags.lastIndex;}
    } else if(m[2].toLowerCase() === tag) {
      depth += m[1] ? -1 : /\/\s*$/.test(m[3]) ? 0 : 1;
      if(depth === 0) return html.slice(start,m.index);
    }
  }
  if(id) throw new Error('找不到正文元素 ID：' + id);
  return html;
}
function meta(html, name) {
  var re=/<meta\b([^>]*)>/gi,m;
  while((m=re.exec(html))) if((attr(m[1],'name')||attr(m[1],'property')).toLowerCase()===name) return attr(m[1],'content');
  return '';
}
function htmlFilters(html) {
  var forms=html.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi)||[];
  var form=forms[C.filterFormIndex],groups=[];
  if(!form) return {groups:groups};
  var re=/<select\b([^>]*)>([\s\S]*?)<\/select>/gi,m;
  while((m=re.exec(form))) {
    var key=attr(m[1],'name'); if((C.filterKeys||[]).indexOf(key)<0) continue;
    var options=[],optionRe=/<option\b([^>]*)>([\s\S]*?)<\/option>/gi,o;
    while((o=optionRe.exec(m[2]))) {
      if(/(?:^|\s)disabled(?:\s|=|$)/i.test(o[1]))continue;
      var title=text(o[2]),value=attr(o[1],'value');
      if(title)options.push({id:value,title:title});
    }
    if(options.length)groups.push({id:key,title:(C.filterNames||{})[key]||attr(m[1],'aria-label')||key,options:options});
  }
  return {groups:groups};
}
async function get(url, selector, purpose, referer) {
  if(C.useBrowser) {
    if(!LumeSource.web || !LumeSource.web.render)throw new Error('当前 App 不支持浏览器源运行环境');
    var options={url:url,includeHtml:true,timeoutMs:6000,purpose:purpose||'',script:'return await ('+browserDocument.toString()+')('+JSON.stringify(C.browserActions||{})+','+JSON.stringify(selector||'')+','+JSON.stringify(purpose||'')+');'};
    if(selector && !C.browserActions)options.waitForSelector=selector;
    var page=await LumeSource.web.render(options);
    if(!page || !page.html)throw new Error('浏览器没有返回页面；请在 App 网页视图中完成验证');
    return typeof page.result==='string'?page.result:page.html;
  }
  var r = await LumeSource.http.get(url, {headers:{Referer:referer||C.url}});
  if (r.status === 403 || r.status === 503) throw new Error('NEED_WEBVIEW_VERIFY：请在网页视图完成验证');
  if (r.status < 200 || r.status >= 300) throw new Error('抓取失败 HTTP ' + r.status + ' ' + url);
  return r.body;
}
function template(s, page, keyword) { return s.replace(/\{page\}/g,String(page)).replace(/\{keyword\}/g,encodeURIComponent(keyword || '')); }
function item(v) { return {id:String(v.vod_id),title:v.vod_name,cover:abs(v.vod_pic),subtitle:v.vod_remarks || '',description:text(v.vod_content)}; }
async function api(params) { return JSON.parse(await get(C.api + (C.api.indexOf('?') >= 0 ? '&' : '?') + params)); }
async function apiDetail(id) { var d = await api('ac=detail&ids=' + encodeURIComponent(id)); if (!d.list || !d.list.length) throw new Error('接口没有返回详情'); return d.list[0]; }
function media(html, base) {
  html = html.replace(C.media === 'audio' ? /<video\b[^>]*>[\s\S]*?<\/video>/gi : /<audio\b[^>]*>[\s\S]*?<\/audio>/gi, '');
  var tag = /<(?:audio|video|source)\b([^>]*)>/gi, m;
  while ((m = tag.exec(html))) { var src = abs(attr(m[1],'src'),base); if(src) return src; }
  var p = /\bplayer_[\w]+\s*=\s*(\{[^\n]*?\})\s*(?:;|<)/i.exec(html);
  if(p) { try { var v = JSON.parse(p[1]), u = v.url; if(String(v.encrypt) === '1') u = decodeURIComponent(u); if(String(v.encrypt) === '2') u = decodeURIComponent(atob(u)); if(/\.(?:m3u8|mp4|webm|mp3|m4a|m4b|aac|flac|ogg|opus|wav)(?:[?#]|$)/i.test(u)) return abs(u,base); } catch (_) {} }
  var structured=structuredMedia(html,base);if(structured)return structured;
  var embedded=payloadMedia(html,base)||playerLiteralMedia(html,base);if(embedded)return embedded;
  var named=meta(html,C.media==='audio'?'og:audio':'og:video')||meta(html,C.media==='audio'?'og:audio:url':'og:video:url');
  return /\.(?:m3u8|mp4|webm|mp3|m4a|m4b|aac|flac|ogg|opus|wav)(?:[?#]|$)/i.test(named)?abs(named,base):'';
}
async function resolveMedia(html,base,depth,seen) {
  var url=media(html,base);if(url)return {url:url,referer:base};
  if(depth>=2)return null;seen=seen||{};seen[base]=true;
  var frames=selectNodes(parseTree(html),'#player iframe,.player iframe,iframe[src*="/embed/"],iframe[src*="/player/"],iframe[src*="/play/"]');
  for(var i=0;i<frames.length&&i<2;i++) {
    var n=frames[i],at=abs(n.attrs.src||n.attrs['data-src']||'',base);
    if(!at||seen[at]||/advert|doubleclick|popunder|\/ads?\//i.test(at)||n.attrs.width==='0'||n.attrs.height==='0')continue;
    seen[at]=true;var child=await get(at,'','media',base),resolved=await resolveMedia(child,at,depth+1,seen);if(resolved)return resolved;
  }return null;
}
var LumeSource = {
  id:C.id, name:C.name, version:C.version||'1.0.0', category:C.category,
  async categories() {
    if(C.mode==='feed')return [{id:C.url,title:'全部'}];
    if(C.mode !== 'maccms') {
      var rows=C.categoryLinks ? anchors(await get(C.url,C.listSelector),C.url,C.categoryLinks) : [];
      return [{id:C.url,title:'全部'}].concat(rows.filter(function(r){return r.id!==C.url;}).map(function(r){return {id:r.id,title:r.title};}));
    }
    var d = await api('ac=list'); return (d.class || []).map(function(v){return {id:String(v.type_id),title:v.type_name};});
  },
  async filters() {
    if(C.mode==='feed')return {groups:[]};
    if(C.mode==='maccms' || !C.filterKeys || !C.filterKeys.length) return {groups:[]};
    return htmlFilters(await get(C.url,C.listSelector));
  },
  async home() { return (await this.list({page:1})).items; },
  async list(a) {
    a = a || {}; var page = Math.max(1,Number(a.page) || 1);
    var filters=a.filters||{};
    if(C.mode==='feed') {
      if(a.keyword||Object.keys(filters).length||(a.categoryId&&a.categoryId!==C.url))throw new Error('该媒体订阅未提供分类、筛选或搜索接口');
      var previous=pageLinks._feed||{},at=page===1?C.list:previous[page];if(!at)return {items:[],hasMore:false};
      var feed=await get(at),rows=feedItems(feed,at),link=firstNode(parseTree(feed),'link[rel=next]'),next=link&&abs(link.attrs.href,at);
      if(next){previous[page+1]=next;pageLinks._feed=previous;}return {items:remember(rows),hasMore:!!next};
    }
    if(C.mode === 'maccms') { if(Object.keys(filters).length)throw new Error('该接口未提供筛选规则，不能忽略筛选条件');var d = await api('ac=detail&pg='+page+'&t='+encodeURIComponent(a.categoryId || '')+'&wd='+encodeURIComponent(a.keyword || '')); return {items:remember((d.list || []).map(item)),hasMore:page < Number(d.pagecount)}; }
    if(a.keyword && !C.search) throw new Error('本站尚未配置搜索地址，请在制源工具填写带 {keyword} 的地址');
    var address = a.keyword ? C.search : C.list;
    if(!a.keyword && a.categoryId && a.categoryId!==C.url) {
      if(!C.categoryLinks || !new RegExp(C.categoryLinks,'i').test(a.categoryId))throw new Error('未识别的分类地址');
      address=abs(a.categoryId);
    }
    var pagingKey=JSON.stringify([address,a.keyword||'',filters]);
    if(!pageLinks[pagingKey]){if(Object.keys(pageLinks).length>=12)pageLinks={};pageLinks[pagingKey]={};}
    var savedPage=pageLinks[pagingKey][page];
    if(page > 1 && address.indexOf('{page}') < 0 && !savedPage)return {items:[],hasMore:false};
    var url = template(address,page,a.keyword),selected={};
    Object.keys(filters).forEach(function(key){
      if((C.filterKeys||[]).indexOf(key)<0)throw new Error('未适配的筛选项：'+key);
      selected[key]=filters[key];
    });
    if(Object.keys(selected).length) {
      if(!a.keyword && (!a.categoryId || a.categoryId===C.url))url=template(C.filterAction||url,page,'');
      url=setQuery(url,selected);
    }
    if(savedPage)url=savedPage;
    var html = await get(url,C.listSelector,'list'), rows = ruleItems(html,url);
    if(!rows.length) {
      if(/no results|nothing found|没有找到|沒有找到|暂无数据|暫無資料|无搜索结果|無搜尋結果/i.test(text(html)))return {items:[],hasMore:false};
      throw new Error('没有识别到条目；网站可能动态加载或规则已失效');
    }
    var next=nextAddress(html,url);
    if(next&&page<100)pageLinks[pagingKey][page+1]=next;
    return {items:remember(rows),hasMore:!!next};
  },
  async detail(a) {
    if(C.mode==='feed'){if(!knownItems[a.id])await this.list({page:1});if(!knownItems[a.id])throw new Error('该条目已不在当前订阅中');return knownItems[a.id];}
    if(C.mode === 'maccms') return item(await apiDetail(a.id));
    var h = await get(a.id), heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(h), title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(h);
    var found=knownItems[a.id];
    return {id:a.id,title:text(heading ? heading[1] : title ? title[1] : a.id),cover:abs(meta(h,'og:image'),a.id)||(found?found.cover:''),description:meta(h,'description')||meta(h,'og:description')};
  },
  async chapters(a) {
    if(C.mode==='feed'){await this.detail(a);return [{id:a.id,title:'播放'}];}
    if(C.target === 'images') return [{id:a.id,title:'查看图集'}];
    if(C.mode === 'maccms') {
      var v = await apiDetail(a.id), names = String(v.vod_play_from || '').split('$$$'), out = [];
      String(v.vod_play_url || '').split('$$$').forEach(function(line,i){line.split('#').forEach(function(ep){var k=ep.indexOf('$'); if(k >= 0 && ep.slice(k+1)) out.push({id:ep.slice(k+1),title:(names[i] || '线路')+' · '+ep.slice(0,k)});});});
      return out;
    }
    var h = await get(a.id,C.chapterSelector,C.media==='images'?'chapters':'media');
    if(C.media!=='images'&&!C.chapterSelector&&media(h,a.id))return [{id:a.id,title:'播放'}];
    var rows = ruleChapters(h,a.id);
    if(rows.length)return rows.map(function(v){return {id:v.id,title:v.title};});
    if(C.media==='images')return [{id:a.id,title:'查看图片'}];
    if(await resolveMedia(h,a.id,0))return [{id:a.id,title:'播放'}];
    throw new Error('未识别到选集或媒体；当前可能是导航、人物或分类页，不能作为作品导出');
  },
  async content(a) {
    if(C.mode==='feed'){var entry=await this.detail({id:a.id||a.chapterId});return {kind:C.media==='audio'?'audio':'video',url:entry.mediaUrl,headers:{Referer:C.url}};}
    var url = abs(a.chapterId || a.id);
    if(C.media !== 'images' && /\.(?:m3u8|mp4|webm|mp3|m4a|m4b|aac|flac|ogg|opus|wav)(?:[?#]|$)/i.test(url)) return {kind:C.media === 'audio' ? 'audio' : 'video',url:url,headers:{Referer:C.url}};
    var h = await get(url,C.media==='images'?C.imageSelector:'',C.media==='images'?'images':'media');
    if(C.media !== 'images') { var v = await resolveMedia(h,url,0); if(!v) throw new Error('未找到公开音视频直链；此播放器需要站点专用适配'); return {kind:C.media === 'audio' ? 'audio' : 'video',url:v.url,headers:{Referer:v.referer}}; }
    // Limit extraction to a content block where one is recognizable.
    var body = contentBlock(h,C.contentId);
    var images=ruleImages(C.contentId?body:h,url,!!C.contentId);
    if(!images.length) throw new Error('未识别到漫画或图片，请配置内容元素 ID');
    var imageHeaders={}; images.forEach(function(src){imageHeaders[src]={Referer:url};});
    return {kind:'images',images:images,imageHeaders:imageHeaders};
  }
};
