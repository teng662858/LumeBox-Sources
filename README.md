# LumeBox 源仓库（小说 / 漫画 / 视频）

LumeBox 的内置源**不随 App 打包**，统一放在这里。App 侧「导入图源 → 订阅地址」
粘贴下面的链接即可。

## 订阅链接（每板块一个 `.js`）

| 板块 | 订阅地址（粘进 App） |
|------|----------------------|
| 小说 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/sources.js` |
| 漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/sources.js` |
| 视频 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/sources.js` |

>`sources.js` 是**地址清单**：一行一个脚本地址（`//` 开头是注释）。同目录下的
>`sources.txt` 是**同内容别名**，给早前拿到的旧链接用——两个地址都能拉。App 认得两种订阅：
**正文就是脚本**，或**正文是一行一个地址的清单**——所以这一个链接会把这板块的
源全部拉进来。想只订某一个源，直接粘那个源的 `.js` 地址（见下表）。

## 单源订阅地址（每个源一个 `.js`）

| 源 | 订阅地址 |
|----|----------|
| 92漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/92mh_comic.js` |
| 大鸟禁漫 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/daniao5_comic.js` |
| P5漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/p5mh_comic.js` |
| 色友漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/seyoumanhua_comic.js` |
| NN韩漫 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/nnhanman_comic.js` |
| CA情色小说 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/99xs_novel.js` |
| xChina 小说 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/xchina_novel.js` |
| X小说 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/xxiaoshuo_novel.js` |
| 瓜子影视 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/gztv5_video.js` |
| 大哥视频 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/dage_video.js` |
| 北觅影视 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/luttt_video.js` |
| 金牌影院 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/vv3nwjk_video.js` |

要点：

- 导入后每份脚本记的是**自己的地址**（不是清单地址），「更新订阅源」各更各的；
- **新增**源：把脚本加进目录、把地址加进 `sources.js`，再在 App 里重新粘一次该板块
  的订阅链接即可（已有的会被覆盖为最新，新增的会被导入）；
- 仓库是 **public**：App 拉订阅不带 Token，私有仓库会 404。

## 目录

```
novel/   小说源 + sources.js 清单
comic/   漫画源 + sources.js 清单
video/   视频源 + sources.js 清单
snapshots/  站点快照（写脚本时站点的样子；自检与协议回归用它，不参与 App 运行）
docs/    早期源文档（QUICKSTART / README / SUMMARY）
tools/   快照自检脚本（Node：node --test tools/snapshot_test.js）
```

## 脚本清单

| 文件 | id | 名称 | 版本 | 备注 |
|------|----|------|------|------|
| comic/92mh_comic.js | `mh92_comic` | 92漫画 | 1.0.0 | 整站 Cloudflare：被拦时抛 `NEED_WEBVIEW_VERIFY`，App 拉起网页视图过校验 |
| comic/daniao5_comic.js | `daniao5_comic` | 大鸟禁漫 | 2.0.0 | 直连可用 |
| comic/p5mh_comic.js | `p5mh_comic` | P5漫画 | 1.0.0 | 直连可用 |
| comic/seyoumanhua_comic.js | `seyoumanhua_comic` | 色友漫画 | 1.0.0 | 直连可用 |
| comic/nnhanman_comic.js | `nnhanman_comic` | NN韩漫 | 1.0.0 | 容错解析版（写脚本时本机到不了该站，见文件头） |
| novel/99xs_novel.js | `99xs_novel` | CA情色小说 | 2.1.0 | 根路径有「继续访问」拦截页，源自带 cookie |
| novel/xchina_novel.js | `xchina_novel` | xChina 小说 | 1.0.0 | 详情/正文常被 CF 拦：抛标记走网页视图 |
| novel/xxiaoshuo_novel.js | `xxiaoshuo_novel` | X小说 | 1.0.0 | 直连可用 |
| video/gztv5_video.js | `gztv5_video` | 瓜子影视 | 3.0.0 | Nuxt SPA + 独立 API；偶发 CF |
| video/dage_video.js | `dage_video` | 大哥视频 | 2.3.0 | 响应是「编码信封」，脚本内含纯 JS 解码 |
| video/luttt_video.js | `luttt_video` | 北觅影视 | 1.0.0 | 苹果CMS，直连可用 |
| video/vv3nwjk_video.js | `vv3nwjk_video` | 金牌影院 | 1.0.1 | reCAPTCHA v3 WAF：抛 `WAF_RECAPTCHA_V3`，需配桥接服务 |

## 写一个源（契约速查）

脚本头部声明元信息（App 靠它认 id / 归属板块）：

```js
// LumeSource: {"id":"my_comic","name":"我的漫画","version":"1.0.0","category":"comic"}
```

`category` 取 `novel` / `comic` / `video`，与导入的板块不一致会被拒。入口可以是
对象式（`LumeSource.list(argument)`）或函数式（`async function getList(page)`），
网络走全局 `fetch` 或 `LumeSource.http`。

被 Cloudflare 拦下时抛固定标记，App 会拉起网页视图过一次校验并自动重试：

```js
throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP ' + status + ' ' + fullUrl + '）');
```

> 注意把 `fullUrl` 换成**作用域里真有的**请求地址。曾经的坑：文案里引用了不存在的
> 变量，真机被 CF 拦下时抛 `ReferenceError`，用户看到的是一个没有出口的红字，
> 而不是网页视图按钮。
