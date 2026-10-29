// 单个源的端到端真站检查：分类 → 列表 → 详情 → 章节 → 正文。
// 用法：node tools/source_live_check.mjs comic/十八漫画.js [categoryId] [itemId]
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const [relative, categoryArg, itemArg] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

const context = { console };
vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { timeout: 8000 });
const source = context.LumeSource;
// 与 App 的 SiteSessionPool 对齐：按 origin 记 Set-Cookie（中间 302 也收）、手动跟随跳转。
// 否则 CDNLah WAF 这类「先给人机校验、校验后靠 Cookie 放行」的站点在离线工具里永远过不去。
const jar = new Map();
const cookiesFor = (origin) => {
  const store = jar.get(origin);
  return store && store.size ? [...store].map(([k, v]) => `${k}=${v}`).join('; ') : '';
};
const absorb = (origin, list) => {
  if (!list?.length) return;
  let store = jar.get(origin);
  if (!store) jar.set(origin, (store = new Map()));
  for (const rawCookie of list) {
    const pair = String(rawCookie).split(';')[0];
    const at = pair.indexOf('=');
    if (at > 0) store.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
};
async function call(url, method = 'GET', body = null, headers = {}) {
  let target = url;
  let verb = method;
  let payload = body;
  for (let hop = 0; hop <= 10; hop++) {
    const origin = new URL(target).origin;
    const hopHeaders = { 'User-Agent': UA, ...headers };
    if (!Object.keys(hopHeaders).some((k) => k.toLowerCase() === 'cookie')) {
      const jarCookie = cookiesFor(origin);
      if (jarCookie) hopHeaders.Cookie = jarCookie;
    }
    const response = await fetch(target, {
      method: verb,
      headers: hopHeaders,
      body: verb === 'GET' ? undefined : payload,
      redirect: 'manual',
    });
    absorb(origin, response.headers.getSetCookie?.() ?? []);
    const location = response.headers.get('location');
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) {
      return { status: response.status, body: await response.text() };
    }
    await response.arrayBuffer().catch(() => undefined);
    if (response.status === 303) {
      verb = 'GET';
      payload = null;
    }
    target = new URL(location, target).toString();
  }
  throw new Error('redirect_limit');
}
source.http = {
  get: (url, options) => call(url, 'GET', null, options?.headers || {}),
  post: (url, body, options) => call(url, 'POST', body, options?.headers || {}),
};

const categories = await source.categories();
console.log('分类', categories.length, categories.map((c) => c.title).join(' / '));
const page = await source.list({ categoryId: categoryArg || undefined, page: 1 });
console.log('列表', page.items.length, 'hasMore', page.hasMore, JSON.stringify(page.items[0]));
const item = itemArg || (page.items[0] && page.items[0].id);
const detail = await source.detail({ id: item });
console.log('详情', JSON.stringify({
  title: detail && detail.title,
  cover: detail && (detail.cover || '').slice(0, 70),
  desc: detail && (detail.description || '').slice(0, 30),
}));
const chapters = await source.chapters({ id: item });
console.log('章节', chapters.length, JSON.stringify(chapters.slice(0, 3)));
if (chapters.length) {
  const content = await source.content({ itemId: item, chapterId: chapters[0].id });
  console.log('正文', content.kind, content.images?.length, (content.images || [])[0]);
  console.log('图片头示例', JSON.stringify(Object.values(content.imageHeaders || {})[0] || {}));
}
