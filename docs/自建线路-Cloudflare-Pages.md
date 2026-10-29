# 自建订阅线路（Cloudflare Pages / R2）

目标：把订阅从「只能靠 GitHub」变成「自己可控的一条 HTTPS 线路」，更新即时、不再受
jsDelivr 12 小时缓存和 purge 节流影响。GitHub 的 raw / jsDelivr 两条线路保留作备份。

仓库里已经有的工具：

| 文件 | 作用 |
| --- | --- |
| `tools/build_selfhost.py` | 把整个源仓库导出一棵静态站点树（脚本 + 清单 + 总订阅），把 URL 前缀换成你的域名 |
| `tools/deploy_pages.sh` | 刷新清单 → 生成站点树 → 上传到 Cloudflare Pages |
| `tools/source_live_check.mjs` | 逐源实跑五个入口 |
| `../LumeBox/tools/check-subscription.mjs` | 订阅端到端复验（支持纯文本清单和 `all.json` 总订阅） |

---

## 一、为什么是 Pages，不是 R2

| | Cloudflare Pages | Cloudflare R2 |
| --- | --- | --- |
| 上传方式 | 一次上传整个目录 | 逐个对象 PUT，需要遍历 |
| 缓存头 | 仓库里放一个 `_headers` 文件即可 | 每个对象都要单独设 `Cache-Control` 元数据 |
| 目录/中文文件名 | 原样保留 | 需自行处理 key 编码 |
| 免费额度 | 500 次部署/月，静态请求不限量 | 10 GB 存储 + Class A/B 操作额度，出网免费 |
| 适合 | 我们的场景（小、静态、频繁改） | 想接 S3 工具链、或之后要放视频 |

结论：**用 Pages**。R2 留作以后要放封面/视频缓存时再说（见第五节）。

> 部署上限：单站 20000 个文件、单文件 25 MiB。我们现在 173 个脚本 + 8 个清单，远低于上限。

---

## 二、一次性准备（约 10 分钟）

1. 注册/登录 Cloudflare（免费计划即可，邮箱注册）。
   **域名不是必需的**：Pages 会自动给一个 `项目名.pages.dev` 网址，先用它把链路跑通。
   `pages.dev` 在国内各地差异较大（实测本机 `pages.dev` 301/0.8s、`cloudflare.com` 200/2.4s，
   但真实子域要到发布后才能测），不稳定的再绑自己的域名。
2. 本机装好 Node 18+（`node -v` 能输出即可）。
3. 登录 wrangler（**就是登录 Cloudflare 账号**：命令会打开浏览器，点 Allow；
   没账号就在那个页面用邮箱注册，免费计划足够）：
   ```bash
   npx --yes wrangler login
   ```
4. 建项目（只需一次）：
   ```bash
   npx --yes wrangler pages project create lume-sources --production-branch main
   ```
5. （可选，有域名才做）绑域名：CF 控制台 → Workers & Pages → `lume-sources` → **Custom domains** →
   Set up a custom domain，填 `sources.你的域名.com`，DNS 记录由 CF 自动创建，等状态变 Active（1–3 分钟）。
   没有域名就跳过，用第 4 步给的 `https://lume-sources.pages.dev/`。

后面所有地址都用 `https://lume-sources.pages.dev/` 或 `https://sources.你的域名.com/`（结尾斜杠可有可无）。

---

## 三、发布

```bash
cd D:/Zcode/LumeBox-Sources
BASE=https://sources.你的域名.com/ bash tools/deploy_pages.sh
```

脚本做的事：

1. `python tools/build_catalog.py` 重算分类清单；再跑一次 `--check`，确认没有漏提交的改动（输出 `changed 0`）。
2. `python tools/build_selfhost.py --base $BASE --out public --clean` 生成站点树：
   ```
   public/
   ├── comic/ photo/ movie/ video/ audiobook/   # 173 个脚本（统一 LF，和 GitHub 线路字节一致）
   ├── metadata/catalog.json                    # 索引，URL 已指向新域名
   ├── subscriptions/
   │   ├── all.json                             # 总订阅，sections 指向下面的分类清单
   │   └── comic.txt photo.txt movie.txt video.txt audiobook.txt comics.txt videos.txt
   ├── index.html                               # 人肉检查用
   └── _headers                                 # Cache-Control: no-store
   ```
3. `npx wrangler pages deploy public --project-name lume-sources --branch main`。

只生成不上传（本地先看效果）：

```bash
BASE=http://127.0.0.1:8731/ DRY_RUN=1 bash tools/deploy_pages.sh
cd public && python -m http.server 8731 --bind 127.0.0.1
```

`public/` 已列入 `.gitignore`，属于构建产物，不进仓库。

CI / 非交互环境把 `wrangler login` 换成两个环境变量：

```bash
export CLOUDFLARE_API_TOKEN=...      # 权限：Cloudflare Pages:Edit
export CLOUDFLARE_ACCOUNT_ID=...
```

---

## 四、验证（三层，都要过）

**1. 缓存头**——必须是 `no-store`，否则改了域名下的文件要等 CDN 过期：

```bash
curl -sI https://sources.你的域名.com/subscriptions/all.json | grep -i cache-control
# cache-control: no-store
```

**2. 订阅链路**——清单 → 分清单 → 173 个脚本逐个下载、校验身份头：

```bash
cd D:/Zcode/LumeBox
node tools/check-subscription.mjs --manifest https://sources.你的域名.com/subscriptions/all.json --list-only
# 期望最后一行：清单/完整性：173/173 正常
```

**3. 实跑入口**——去掉 `--list-only`，会逐个源跑分类/列表/详情/章节/正文：

```bash
node tools/check-subscription.mjs --manifest https://sources.你的域名.com/subscriptions/all.json
```

**4. App 内**：设置 → 源管理 → 订阅 → 添加订阅，填总订阅地址；同步后分类里应出现漫画/视频两块。

> 中文文件名已实测：`/video/第一女優網.js` 用百分号编码取回 200，字节与 raw 线路一致
> （`pornbest.js` 24103 字节 / md5 `031ea53b`，`qilin70` 13768 / `8ee99a64`）。

---

## 五、要不要把自建线路做进 App 的内置订阅

**不需要改代码也能用**：上面第 4 步手动加订阅即可，适合先验证。

要让「恢复默认订阅」「一键同步」也走自建线路，改
`lib/core/source/source_subscription_catalog.dart` 顶部三行即可（加一个第三前缀，保留原两条）：

```dart
static const customBase = 'https://sources.你的域名.com/';   // 空串表示未启用
```

然后在 `sectionUrl` / `totalUrl` 等取值处按「自建 > raw > jsDelivr」的优先级排；
`githubCdnUrl()` 只重写 `raw.githubusercontent.com`，自建地址会原样透传，不用动。

这一步涉及同步优先级和设置页展示，等域名定下来再做，我按你的域名改并跑
`dart analyze` + `flutter test test/source_content_rating_test.dart`。

---

## 六、R2 备选（要走 S3 工具链时）

```bash
npx --yes wrangler r2 bucket create lume-sources
# 控制台 → R2 → lume-sources → Settings → Public access → 绑 Custom domain
BASE=https://sources.你的域名.com/ DRY_RUN=1 bash tools/deploy_pages.sh

# 逐个上传（必须带 Content-Type；缓存靠自定义域的 Cache Rules 关掉）
find public -type f -name '*.js' -print0 | while IFS= read -r -d '' f; do
  key="${f#public/}"
  npx --yes wrangler r2 object put "lume-sources/$key" --file="$f" \
    --content-type='application/javascript; charset=utf-8' --cache-control='no-store'
done
```

或者用 rclone（S3 兼容端点 `https://<account_id>.r2.cloudflarestorage.com`）整目录 `sync`。
R2 的坑：`Cache-Control` 是对象元数据，s3 sync 默认不带，必须在 bucket 上配 Cache Rules，
否则改完源头用户还是拿到旧文件——这正是选 Pages 的原因。

---

## 七、nginx（自己的 VPS）最短路径

已经有主机的话，比 CF 更省心（没有平台条款风险）：

```nginx
server {
  listen 443 ssl http2;
  server_name sources.你的域名.com;
  root /srv/lume-sources;
  add_header Cache-Control "no-store" always;
  types { application/javascript js; application/json json; }
  charset utf-8;
}
```

发布：

```bash
BASE=https://sources.你的域名.com/ DRY_RUN=1 bash tools/deploy_pages.sh
rsync -az --delete public/ user@host:/srv/lume-sources/
```

---

## 八、风险与注意事项

- **平台条款**：Cloudflare 对成人内容/滥用有裁量权，Pages 上放这类源存在被停用风险。
  接受这个风险就用 Pages，不接受就用第七节的 VPS；两条都保留 GitHub 备份即可无缝切换。
- **域名**：`pages.dev` 免费用，但国内可达性不稳定（各地差异大，需发布后实测）。
  绑自有域名的价值主要是「不和其他人共用一个被墙的域名」，并不改变 CF 的 IP 在国内的稳定性；
  手机侧本来就要挂代理（iOS 上订阅下载走系统网络），所以先用免费域名验证，够用就不花钱。
  真要国内直连稳，只能国内备案 + 国内服务器，而这类源不可能过备案——所以不做这个方向的承诺。
- **`no-store` 的代价**：每次请求都回源（静态文件很小，可忽略）。想省一点可改成
  `Cache-Control: public, max-age=30`，代价是最多 30 秒延迟。
- **更新时效对比**（改完源之后用户多久能拿到）：

  | 线路 | 生效时间 |
  | --- | --- |
  | 自建 Pages（`no-store`） | 部署完成即生效，秒级 |
  | raw.githubusercontent.com | ≤ 5 分钟（`max-age=300`） |
  | cdn.jsdelivr.net | 12 小时，且 purge 有节流窗口 |

- **回滚**：Pages 控制台每次部署都有独立 URL 与记录，可一键回滚到上一版；
  源仓库本身仍是 git，`git revert` 后重跑一次部署即可。

---

## 九、排障

**发布后 `nslookup` 报 NXDOMAIN、`curl` 直接失败**
多半是本地/路由器 DNS 的**负缓存**：项目刚建好时查过一次（那时记录还不存在），
路由器把这个"不存在"缓存住了。判断方法——查同站点从没访问过的地址（如
`<部署ID>.lume-sources.pages.dev`）：如果它能解析，就说明不是被封，是缓存。
处理：换 DNS（223.5.5.5 / 1.1.1.1）或等缓存过期；不要改配置。
想在不动 DNS 的前提下立刻自查内容，用：

```bash
curl -sI --resolve lume-sources.pages.dev:443:172.66.46.235 \
  https://lume-sources.pages.dev/subscriptions/all.json | grep -i cache-control
```

**200 但内容是旧的**
看部署日志里有没有单独的 `Uploading _headers` 一行；没有就是 `_headers` 没上传，
`no-store` 没生效。确认 `public/_headers` 存在后重新部署。

**`wrangler` 提示未登录 / 权限不足**
`npx wrangler login` 重新授权；CI 用 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`。

**本地 `--clean` 报 WinError 32**
输出目录被本地静态服务或杀软占用。脚本已改成"写入 + 清理过期文件"，
不会因此漏发或残留，忽略即可。
