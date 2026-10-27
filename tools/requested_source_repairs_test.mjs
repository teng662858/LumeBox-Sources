import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const publishedPaths = {
 'sources/video/91cg1.js': 'video/91吃瓜视频.js',
 'sources/photo/91cg1.js': 'photo/91吃瓜图集.js',
 'sources/comic/manhua127.js': 'comic/127漫画.js',
 'sources/video/xfdxv.js': 'video/41看片.js',
};
const load = file => { const c=vm.createContext({console:{warn(){}}});vm.runInContext(fs.readFileSync(fs.existsSync(file)?file:publishedPaths[file],'utf8'),c);const s=c.LumeSource;const cache=new Map();s.fs={readText:async k=>cache.get(k),writeText:async(k,v)=>cache.set(k,v)};return {s,c,cache};};
for(const kind of ['video','photo']) {
 const {s,c}=load(`sources/${kind}/91cg1.js`);
 const html='<a href="/category/sports-live/"><span>体育直播</span></a><a href="https://www.91cg1.com/category/news-items/">新闻</a>'+ '<a href="/archives/123/"><h2 class="post-card-title">示例</h2><script>loadBannerDirect(\'//img.example/cover.jpeg\')</script>';
 const urls=[];s.http={get:async u=>{urls.push(u);return {status:200,body:u.includes('/archives/')?'<h1>示例</h1><img data-xkrkllgl="https://img.example/body.jpeg">':html}}};
 const categories=await s.categories();assert(categories.some(x=>x.id==='cat:sports-live'));assert(categories.some(x=>x.id==='cat:news-items'));
 const list=await s.list({page:2,filters:{category:'sports-live'}});assert.match(urls.at(-1),/category\/sports-live\/2\/$/);assert.equal(list.items[0].cover,'https://img.example/cover.jpeg');assert.equal(list.items[0].coverHeaders['X-Lume-Image-Encoding'],'aes-cbc-pkcs7');
 const detail=await s.detail({id:'123'});assert.equal(detail.cover,'https://img.example/body.jpeg');assert(detail.coverHeaders['X-Lume-Image-Key']);
 if(kind==='photo') assert.equal((await s.content({id:'123'})).headers['X-Lume-Image-Encoding'],'aes-cbc-pkcs7');
 console.log('91 '+kind+': categories, pagination, list/detail/reader cover encoding OK');
}
{
 const {s}=load('sources/comic/manhua127.js');let url;
 s.http={get:async u=>{url=u;return {status:200,body:JSON.stringify({code:1,data:[{name:'示例',url:'/mh/1.html',pic:'https://img.example/cover.webp'}]})}}};
 await s.list({page:2,categoryId:'/category/tags/6',filters:{finish:'2',pay:'1'}});const q=new URL(url).searchParams;assert.equal(q.get('type[order]'),'hits');assert.equal(q.get('type[tags]'),'6');assert.equal(q.get('type[finish]'),'2');assert.equal(q.get('type[pay]'),'1');assert.equal(q.get('page'),'2');
 const categories=s.__categories('<li class="catalog-item"><a href="/category/tags/6">热血</a></li><li class="catalog-item"><a href="/category/finish/2"><img alt="完结"></a></li><li class="catalog-item"><a href="/category/list/3"><img alt="青年漫画"></a></li><li class="catalog-item"><a href="/category/pay/1"><img alt="免费"></a></li>');
 assert.equal(categories.length,4);assert.equal(categories[1].title,'完结');assert.equal(categories[2].title,'青年漫画');assert.equal(categories[3].title,'免费');
 console.log('127: popularity default and combined site facets OK');
}
{
 const {s,cache}=load('sources/video/xfdxv.js');let calls=0,url;
 const groups=Array.from({length:12},(_,i)=>({id:i+1,name:'分组'+i,purpose:1,tag:Array.from({length:45},(_,t)=>({id:i*100+t+1,name:'标签'+t}))}));
 groups.push({id:99,name:'excluded',purpose:10,tag:[{id:9999,name:'excluded'}]});
 cache.set('tag-groups.json',JSON.stringify([]));
 s.http={get:async u=>{url=u;calls++;return {status:200,body:JSON.stringify({code:0,data:u.includes('tag_group')?{items:groups}:{items:[{id:1,name:'示例',pic:'/cover.image'}]}})}}};
 const filters=await s.filters();assert.equal(filters.groups.length,12);assert(filters.groups.every(g=>g.options.length===45));assert.equal((await s.categories()).length,544);assert.equal(calls,1);
 await s.list({page:3,categoryId:'hot',filters:{'tag:1':'1,2','tag:2':'101',bad:'x'}});const q=new URL(url).searchParams;assert.equal(q.get('tag'),'1,2,101');assert.equal(q.get('orderby'),'hits');assert.equal(q.get('page'),'3');
 const list=await s.list({page:1});assert.equal(list.items[0].coverHeaders['X-Lume-Image-Encoding'],'fernet');
 console.log('41: all groups/tags, cache migration, multi-select request and cover encoding OK');
}
