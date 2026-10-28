// 源「集数完整性」体检工具（Node 侧，非 App 内运行）。
//
// 目的：判断一个视频源是「完整可用」还是「只能播放一集 / 内容不完整 / 已失效」。
// 语义与 App 的 source_bridge 对齐（LumeSource 桥接对象、变量吸收、宿主能力保留），
// 额外做的是：列表 → 详情 → **多集** → 每集真实取流并探活，而不是只看第一集。
//
// 用法：
//   node tools/episode_audit.mjs video/独播库.js video/追剧.js [--items 3] [--json out.json]
//   node tools/episode_audit.mjs --files video/91毒蛇.js,video/ASMR吧.js
//
// 判决口径：
//   ok              多集都能播，标题声明的集数与实际集数一致
//   single-episode  第 1 集能播，第 2 集起取流失败 / 集数只有 1 而标题声明多集
//   incomplete      集数少于标题声明、或部分条目取流失败
//   dead            列表为空 / 全部条目取流失败
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const CALL_TIMEOUT_MS = Number(process.env.AUDIT_TIMEOUT_MS || 20000);
const MEDIA_TIMEOUT_MS = Number(process.env.AUDIT_MEDIA_TIMEOUT_MS || 15000);

const CONTRACT = {
  categories: ['getCategories', 'getCategory', 'categories'],
  list: ['getList', 'list'],
  detail: ['getDetail', 'getBookInfo', 'detail'],
  chapters: ['getChapters', 'getChapterList', 'chapters'],
  content: ['getContent', 'getChapterContent', 'content'],
  home: ['getHome', 'getHomeContent', 'home'],
  filters: ['getFilters', 'getFilterGroups', 'filters'],
};

const RESERVED = new Set(['tools', 'media', 'session', 'http', 'fs', 'web', 'html', 'storage', 'config']);

function parseArgs(argv) {
  const out = { files: [], items: 3, json: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--items') out.items = Math.max(1, Number(argv[++i]) || 3);
    else if (arg === '--json') out.json = argv[++i] ?? '';
    else if (arg === '--files') out.files.push(...String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg === '--scan-chapters') out.scanChapters = Math.max(0, Number(argv[++i]) || 0);
    else out.files.push(arg);
  }
  return out;
}

function parseIdentity(script) {
  const match = /^\s*\/\/\s*LumeSource:\s*(\{[\s\S]*?\})\s*$/m.exec(script);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (_) {
    return null;
  }
}

function makeHttp({ config, trace, ua }) {
  const baseHeaders = ua ? { 'User-Agent': ua } : {};
  async function request(options) {
    const url = String(options?.url ?? '');
    if (!url) throw new Error('LumeSource.http.request 缺少 url');
    const method = String(options.method || 'GET').toUpperCase();
    const headers = { ...baseHeaders, ...(options.headers || {}) };
    if (config.cookie && !Object.keys(headers).some((k) => k.toLowerCase() === 'cookie')) headers.Cookie = config.cookie;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS - 500);
    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: options.body == null || method === 'GET' ? undefined : String(options.body),
        redirect: 'follow',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const body = await res.text();
    trace.push({ url, method, status: res.status, ms: Date.now() - started, bytes: body.length });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    return {
      url: res.url || url,
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body,
      setCookie,
      text: () => body,
      json: () => JSON.parse(body),
      ok: res.status >= 200 && res.status < 300,
    };
  }
  return {
    request,
    get: (url, options) => request({ ...(options || {}), url, method: 'GET' }),
    post: (url, body, options) => request({ ...(options || {}), url, method: 'POST', body: body == null ? '' : String(body) }),
  };
}

function makeTools() {
  return {
    run: async () => {
      throw new Error('harness: tools.run 未实现');
    },
    digest: async (algorithm, data) => {
      const name = String(algorithm).toLowerCase().replace('-', '');
      return crypto.createHash(['md5', 'sha1', 'sha256', 'sha512'].includes(name) ? name : 'md5').update(String(data), 'utf8').digest('hex');
    },
    aes: async () => {
      throw new Error('harness: tools.aes 未实现');
    },
    rsa: async () => {
      throw new Error('harness: tools.rsa 未实现');
    },
    inflate: async () => {
      throw new Error('harness: tools.inflate 未实现');
    },
    base64Encode: async (data) => Buffer.from(String(data), 'utf8').toString('base64'),
    base64Decode: async (data) => Buffer.from(String(data), 'base64').toString('utf8'),
    urlEncode: async (data) => encodeURIComponent(String(data)),
    urlDecode: async (data) => decodeURIComponent(String(data)),
  };
}

function makeFs() {
  const store = new Map();
  return {
    async writeText(file, text) {
      store.set(String(file), String(text));
      return true;
    },
    async readText(file) {
      return store.has(String(file)) ? store.get(String(file)) : null;
    },
    async exists(file) {
      return store.has(String(file));
    },
    async remove(file) {
      return store.delete(String(file));
    },
    async list() {
      return [...store.keys()];
    },
  };
}

function describe(error) {
  if (!error) return 'unknown';
  return ((error.name ? error.name + ': ' : '') + (error.message ?? String(error))).slice(0, 300);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_r, reject) => setTimeout(() => reject(new Error('调用 ' + label + ' 超时（' + ms + 'ms）')), ms).unref?.()),
  ]);
}

// 标题里声明的集数：「更新至24集」「全12集」「共8集」「第3集」
function declaredEpisodes(title) {
  const text = String(title || '');
  const ranges = [...text.matchAll(/(?:更新至|全|共|连载至)\s*(\d{1,4})\s*集/g)].map((m) => Number(m[1]));
  if (ranges.length) return Math.max(...ranges);
  const single = [...text.matchAll(/第\s*(\d{1,4})\s*[集话話]/g)].map((m) => Number(m[1]));
  if (single.length) return Math.max(...single);
  return 0;
}

// 取流探活：Range 只读前 2KB，避免整片下载
async function probeMedia(url, headers) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false, error: '非绝对地址：' + String(url).slice(0, 120) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MEDIA_TIMEOUT_MS);
  try {
    let res = await fetch(url, {
      headers: { 'User-Agent': DEFAULT_UA, Range: 'bytes=0-2047', ...(headers || {}) },
      redirect: 'follow',
      signal: controller.signal,
    });
    let buffer = Buffer.from(await res.arrayBuffer());
    let contentType = res.headers.get('content-type') || '';
    // 少数 CDN 不认 Range：状态 416/200 且无内容时再整取一次前段
    if (!buffer.length || res.status === 416) {
      res = await fetch(url, { headers: { 'User-Agent': DEFAULT_UA, ...(headers || {}) }, redirect: 'follow', signal: controller.signal });
      const reader = res.body?.getReader?.();
      if (reader) {
        const chunk = await reader.read();
        buffer = Buffer.from(chunk.value ?? []);
        try {
          await reader.cancel();
        } catch (_) {}
      }
      contentType = res.headers.get('content-type') || contentType;
    }
    const head = buffer.subarray(0, 400).toString('utf8');
    const looksM3u8 = head.includes('#EXTM3U');
    const looksFlv = head.slice(0, 3) === 'FLV';
    const looksMp4 = buffer.subarray(4, 8).toString('binary') === 'ftyp';
    const okStatus = res.status >= 200 && res.status < 400;
    const mediaType = /video|octet-stream|mp4|mpegurl|audio/i.test(contentType);
    return {
      ok: okStatus && (looksM3u8 || looksFlv || looksMp4 || mediaType),
      status: res.status,
      type: contentType,
      bytes: buffer.length,
      m3u8: looksM3u8,
      sample: head.slice(0, 60).replace(/\s+/g, ' '),
    };
  } catch (error) {
    return { ok: false, error: describe(error) };
  } finally {
    clearTimeout(timer);
  }
}

// 网页播放页探活：页面 200 + 页面里真有播放器/播放串，才算「能播」
async function probePage(url, headers) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false, error: '非绝对地址：' + String(url).slice(0, 120) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MEDIA_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': DEFAULT_UA, ...(headers || {}) },
      redirect: 'follow',
      signal: controller.signal,
    });
    const body = (await res.text()).slice(0, 400000);
    const hasPlayer = /player_data|player_aaaa|videojs|dplayer|artplayer|Hls\.js|new Hls|vod_play_url|MacPlayer/i.test(body);
    const hasM3u8 = /\.m3u8/i.test(body);
    const isPlayPage = /\/(play|bofang|vodplay|voddetail|detail|post)\//i.test(new URL(res.url || url).pathname);
    const blocked = /重试|访问过于频繁|人机验证|Just a moment|安全检查|滑块/i.test(body.slice(0, 4000));
    return {
      ok: res.status >= 200 && res.status < 400 && (hasPlayer || hasM3u8) && !blocked,
      status: res.status,
      type: res.headers.get('content-type') || '',
      finalUrl: String(res.url || url).slice(0, 160),
      bytes: body.length,
      hasPlayer,
      hasM3u8,
      isPlayPage,
      blocked,
    };
  } catch (error) {
    return { ok: false, error: describe(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function auditSource(file, options) {  const raw = fs.readFileSync(file, 'utf8');
  const identity = parseIdentity(raw) || {};
  const report = {
    file,
    id: identity.id ?? '',
    name: identity.name ?? '',
    network: identity.network ?? '',
    categories: 0,
    listCount: 0,
    items: [],
    verdict: 'dead',
    reasons: [],
  };

  const trace = [];
  const config = Object.freeze({
    domain: identity.endpoints?.site?.[0] ?? identity.mirrors?.[0] ?? '',
    mirrors: Object.freeze([...(identity.endpoints?.site ?? identity.mirrors ?? [])]),
    mirrorIndex: 0,
    customDomain: '',
    account: '',
    password: '',
    cookie: '',
  });

  const fsApi = makeFs();
  const http = makeHttp({ config, trace, ua: DEFAULT_UA });
  const tools = makeTools();
  const bridge = {
    http,
    fs: fsApi,
    tools,
    storage: {
      async get(key, fallback) {
        const store = fsApi.__store ?? null;
        const value = store ? store.get('storage:' + key) : undefined;
        return value === undefined ? fallback ?? null : value;
      },
      async set(key, value) {
        fsApi.__store = fsApi.__store ?? new Map();
        fsApi.__store.set('storage:' + key, value);
        return true;
      },
      async remove(key) {
        fsApi.__store?.delete('storage:' + key);
        return true;
      },
    },
    session: {
      async setUserAgent() {
        return true;
      },
    },
    media: {
      async parseM3u8() {
        throw new Error('harness: media.parseM3u8 未实现');
      },
      async playlist() {
        throw new Error('harness: media.playlist 未实现');
      },
    },
    web: {
      async render() {
        const error = new Error('harness: web.render 需要 App 内 WebKit');
        error.harnessUnsupported = true;
        throw error;
      },
      bridge: {
        async configure() {
          return true;
        },
        async request() {
          throw new Error('harness: web.bridge.request 未实现');
        },
      },
    },
    html: {
      async extract() {
        throw new Error('harness: html.extract 未实现');
      },
    },
  };
  Object.defineProperty(bridge, 'config', {
    enumerable: true,
    configurable: false,
    get: () => config,
    set: () => {},
  });

  const sandbox = {
    console,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    fetch: (url, init) => http.request({ ...(init || {}), url }),
    atob: (v) => Buffer.from(String(v), 'base64').toString('binary'),
    btoa: (v) => Buffer.from(String(v), 'binary').toString('base64'),
    escape,
    unescape,
    AbortController,
    Buffer,
  };
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);

  Object.defineProperty(sandbox, 'LumeSource', {
    configurable: true,
    enumerable: true,
    get: () => bridge,
    set: (value) => {
      if (value === null || typeof value !== 'object') return;
      for (const key of Object.getOwnPropertyNames(value)) {
        if (RESERVED.has(key)) continue;
        try {
          Object.defineProperty(bridge, key, Object.getOwnPropertyDescriptor(value, key));
        } catch (_) {
          try {
            bridge[key] = value[key];
          } catch (_) {}
        }
      }
    },
  });

  function locate(names, contractName) {
    for (const name of names) {
      if (typeof bridge[name] === 'function' && !bridge[name].__lumeDispatch) return { fn: bridge[name], style: name === contractName ? 'object' : 'function' };
    }
    for (const name of names) {
      const fn = sandbox[name];
      if (typeof fn === 'function') return { fn, style: name === contractName ? 'object' : 'function' };
    }
    return null;
  }

  function positional(name, argument) {
    switch (name) {
      case 'categories':
        return [];
      case 'list':
        return [argument.keyword || null, argument.page || 1, argument.categoryId || null];
      case 'detail':
      case 'chapters':
        return [argument.id];
      case 'content':
        return [argument.id, argument.chapterId];
      default:
        return [argument];
    }
  }

  async function call(name, argument) {
    const found = locate(CONTRACT[name], name);
    if (!found) throw new Error('源脚本没有实现 ' + name + ' 方法');
    const work = found.style === 'object' ? found.fn.call(bridge, argument) : found.fn.apply(bridge, positional(name, argument));
    return withTimeout(work, CALL_TIMEOUT_MS, name);
  }

  try {
    vm.runInContext(raw, sandbox, { filename: path.basename(file), timeout: 5000 });
  } catch (error) {
    report.reasons.push('加载失败：' + describe(error));
    report.trace = trace;
    return report;
  }

  const has = (name) => Boolean(locate(CONTRACT[name], name));

  // 1) 分类 + 列表
  let categoryId = '';
  try {
    const cats = await call('categories', {});
    report.categories = Array.isArray(cats) ? cats.length : 0;
    categoryId = Array.isArray(cats) && cats.length ? cats[0].id ?? '' : '';
    report.categorySample = Array.isArray(cats) ? cats.slice(0, 4).map((c) => c?.title ?? c?.name ?? '') : [];
  } catch (error) {
    report.reasons.push('categories 失败：' + describe(error));
  }

  let items = [];
  try {
    const list = await call('list', { page: 1, categoryId });
    items = Array.isArray(list?.items) ? list.items : Array.isArray(list) ? list : [];
    report.listCount = items.length;
    report.hasMore = list?.hasMore === true;
  } catch (error) {
    report.reasons.push('list 失败：' + describe(error));
    report.trace = trace;
    return report;
  }
  if (!items.length) {
    report.reasons.push('列表为空');
    report.trace = trace;
    return report;
  }

  // 2) 逐个条目看集数与取流
  const picks = items.slice(0, options.items);
  for (const item of picks) {
    const entry = {
      id: String(item?.id ?? ''),
      title: String(item?.title ?? ''),
      declared: declaredEpisodes(item?.title),
      chapters: 0,
      ep1: null,
      ep2: null,
      epLast: null,
      notes: [],
    };
    try {
      await call('detail', { id: item.id });
    } catch (error) {
      entry.notes.push('detail 失败：' + describe(error));
    }
    let rows = [];
    try {
      const value = await call('chapters', { id: item.id });
      rows = Array.isArray(value) ? value : Array.isArray(value?.chapters) ? value.chapters : [];
      entry.chapters = rows.length;
      entry.chapterTitles = rows.slice(0, 8).map((row) => String(row?.title ?? ''));
    } catch (error) {
      entry.notes.push('chapters 失败：' + describe(error));
    }

    const play = async (row) => {
      if (!row) return null;
      const out = { chapterId: String(row.id ?? ''), title: String(row.title ?? '') };
      try {
        const content = await call('content', { id: item.id, chapterId: row.id });
        const url = content?.url || content?.images?.[0] || '';
        out.kind = content?.kind ?? '';
        out.url = String(url).slice(0, 180);
        if (!/^https?:\/\//i.test(String(url))) {
          out.ok = false;
          out.error = 'content 未给出绝对地址';
          return out;
        }
        if (content?.kind === 'webplayer') {
          // 网页播放：探的是页面本身，看它到底是不是「能播的播放页」
          const page = await probePage(url, content?.headers || {});
          out.ok = page.ok === true;
          out.probe = page;
          return out;
        }
        const probe = await probeMedia(url, content?.headers || {});
        out.ok = probe.ok === true;
        out.probe = probe;
      } catch (error) {
        out.ok = false;
        out.error = describe(error);
      }
      return out;
    };

    entry.ep1 = await play(rows[0]);
    if (rows.length >= 2) entry.ep2 = await play(rows[1]);
    if (rows.length >= 3) entry.epLast = await play(rows[rows.length - 1]);

    // 深扫：把前 N 集都取一遍，看「只有第 1 集能播」还是「整体能播」
    if (options.scanChapters > 0 && rows.length > 1) {
      const scan = [];
      for (const row of rows.slice(0, options.scanChapters)) {
        const one = await play(row);
        scan.push({ title: one?.title ?? '', kind: one?.kind ?? '', ok: one?.ok === true, url: (one?.url ?? '').slice(0, 90) });
      }
      entry.scan = { total: rows.length, sampled: scan.length, ok: scan.filter((row) => row.ok).length, rows: scan };
      report.scanSummary = report.scanSummary ?? [];
      report.scanSummary.push({ title: entry.title, total: rows.length, ok: scan.filter((row) => row.ok).length });
    }
    report.items.push(entry);
  }

  // 3) 判决
  const tested = report.items;
  const playable = tested.filter((row) => row.ep1?.ok);
  const multi = tested.filter((row) => row.chapters >= 2);
  const multiBroken = multi.filter((row) => row.ep1?.ok && row.ep2 && row.ep2.ok === false);
  const shortfall = tested.filter((row) => row.declared > 0 && row.chapters > 0 && row.chapters < row.declared);
  // 章节标题像集数（第1集 / 1 / EP01）却给出同一个播放地址 → 选集无效，只能播放一集
  const episodeLike = (row) =>
    (row.chapterTitles || []).some((title) => /第\s*\d+\s*[集话話]|^\s*\d{1,4}\s*$|EP?\s*\d{1,4}/i.test(title));
  const sameUrl = multi.filter(
    (row) => row.ep1?.url && row.ep2?.url && row.ep1.url === row.ep2.url && episodeLike(row),
  );

  if (!playable.length) {
    report.verdict = 'dead';
    report.reasons.push(
      tested.some((row) => row.ep1 && row.ep1.kind === 'webplayer')
        ? '抽样条目网页播放页打不开或没有播放器'
        : '抽样条目首集全部取流失败',
    );
  } else if (sameUrl.length) {
    report.verdict = 'single-episode';
    report.reasons.push(`选集给出同一个播放地址（只能播一集）：${sameUrl.map((r) => r.title).join('、')}`);
  } else if (multiBroken.length) {
    report.verdict = 'single-episode';
    report.reasons.push(`第 2 集起取流失败：${multiBroken.map((r) => r.title).join('、')}`);
  } else if (shortfall.length) {
    report.verdict = 'incomplete';
    report.reasons.push(
      shortfall.map((r) => `《${r.title}》声明 ${r.declared} 集，实际 ${r.chapters} 集`).join('；'),
    );
  } else if (playable.length < tested.length) {
    report.verdict = 'incomplete';
    report.reasons.push(`抽样 ${tested.length} 条中 ${tested.length - playable.length} 条取流失败：${tested.filter((r) => !r.ep1?.ok).map((r) => r.title).join('、')}`);
  } else if (!multi.length) {
    report.verdict = 'ok';
    report.reasons.push('抽样条目均为单片（无分集），标题未声明多集');
  } else {
    report.verdict = 'ok';
  }

  report.trace = trace;
  return report;
}

// ------------------------------------------------------------------ 入口
const options = parseArgs(process.argv.slice(2));
if (!options.files.length) {
  console.error('用法：node tools/episode_audit.mjs <脚本路径…> [--items 3] [--json 输出文件]');
  process.exit(2);
}

const reports = [];
for (const file of options.files) {
  if (!fs.existsSync(file)) {
    reports.push({ file, verdict: 'missing', reasons: ['文件不存在'] });
    continue;
  }
  const started = Date.now();
  const report = await auditSource(file, options);
  report.ms = Date.now() - started;
  reports.push(report);
  const flag = { ok: 'PASS', 'single-episode': 'ONLY-EP1', incomplete: 'PARTIAL', dead: 'DEAD', missing: 'MISSING' }[report.verdict] ?? report.verdict;
  console.log(`\n=== [${flag}] ${report.name || report.id} (${report.file}) ${report.ms}ms`);
  console.log(
    `    分类 ${report.categories} / 列表 ${report.listCount} 条` +
      (report.items.length
        ? ' / 抽样 ' +
          report.items
            .map(
              (row) =>
                `${row.title.slice(0, 20)}[集${row.chapters}${row.declared ? '/声' + row.declared : ''} ${row.ep1?.kind || '-'} ep1:${row.ep1?.ok ? 'ok' : 'x'} ep2:${row.chapters >= 2 ? (row.ep2?.ok ? 'ok' : 'x') : '-'} 首章:${(row.chapterTitles || []).slice(0, 2).join('|')}]`,
            )
            .join(' ')
        : ''),
  );
  if (report.reasons.length) console.log('    结论：' + report.reasons.join('；'));
}
if (options.json) fs.writeFileSync(options.json, JSON.stringify(reports, null, 2), 'utf8');

const bad = reports.filter((row) => row.verdict !== 'ok');
console.log(`\n合计 ${reports.length}：健康 ${reports.length - bad.length}，需处理 ${bad.length}`);
for (const row of bad) console.log(`  - [${row.verdict}] ${row.name || row.file}`);
process.exit(0);
