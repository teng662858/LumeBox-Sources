# LumeBox 源仓库（小说 / 漫画 / 视频）

LumeBox 的内置源**不随 App 打包**，统一放在这里。App 侧「导入图源 → 订阅地址」
粘贴下面的链接即可；之后脚本有更新，走「图源管理 → 更新订阅源」按各自地址同步。

## 订阅链接（每个板块一个）

| 板块 | 订阅地址（直接粘进 App） |
|------|--------------------------|
| 小说 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novel/sources.txt` |
| 漫画 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comic/sources.txt` |
| 视频 | `https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/video/sources.txt` |

要点：

- 一个链接 = 一个板块的**全部源**（清单文件里一行一个脚本地址）；
- 导入时每份脚本记的是**自己的地址**（不是清单地址），所以「更新订阅源」
  是各更各的，不会张冠李戴；
- **新增**源：把新脚本加进对应目录、把地址加进 `sources.txt`，再在 App 里
  重新粘一次该板块的订阅地址即可（已存在的源会被覆盖为最新，新增的会被导入）；
- 仓库是 **public**：App 拉订阅不带 Token，私有仓库会 404。

## 目录

```
novel/   小说源   （清单 novel/sources.txt）
comic/   漫画源   （清单 comic/sources.txt）
video/   视频源   （清单 video/sources.txt）
docs/    早期源文档（QUICKSTART / README / SUMMARY）
tools/   源脚本的辅助工具脚本（不含快照 HTML，快照在 App 仓库根目录）
```

## 脚本清单

| 文件 | id | 名称 | 版本 | 站点 |
|------|----|------|------|------|
| novel/99xs_novel.js | `99xs_novel` | CA情色小说 | 2.1.0 | https://99xs.sbs |
| novel/xchina_novel.js | `xchina_novel` | xChina 小说 | 1.0.0 | https://xchina.co |
| novel/xxiaoshuo_novel.js | `xxiaoshuo_novel` | X小说 | 1.0.0 | https://book.x-小说.com |
| comic/92mh_comic.js | `mh92_comic` | 92漫画 | 1.0.0 | https://www.92mh.com（整站 Cloudflare，需网页视图过校验） |
| comic/daniao5_comic.js | `daniao5_comic` | 大鸟禁漫 | 2.0.0 | https://daniao5.com |
| comic/p5mh_comic.js | `p5mh_comic` | P5漫画 | 1.0.0 | https://www3.6p5mh3.click |
| comic/seyoumanhua_comic.js | `seyoumanhua_comic` | 色友漫画 | 1.0.0 | https://seyoumanhua.com |
| video/gztv5_video.js | `gztv5_video` | 瓜子影视 | 3.0.0 | https://gztv5.com |
| video/dage_video.js | `dage_video` | 大哥视频 | 2.3.0 | https://dage.one |
| video/luttt_video.js | `luttt_video` | 北觅影视 | 1.0.0 | https://v.luttt.com |
| video/vv3nwjk_video.js | `vv3nwjk_video` | 金牌影院 | 1.0.1 | https://www.vv3nwjk.com（reCAPTCHA v3 WAF，需桥接服务） |

## 写一个源（契约速查）

脚本头部声明元信息（App 靠它认 id / 归属板块）：

```js
// LumeSource: {"id":"my_comic","name":"我的漫画","version":"1.0.0","category":"comic"}
```

`category` 取值 `novel` / `comic` / `video`（猫源另有约定）；与导入的板块不符会被拒。
方法可用对象式（`LumeSource.list(argument)`）或函数式（`async function getList(page)`），
网络走全局 `fetch` 或 `LumeSource.http`——细节见 App 仓库的源契约文档与
`assets/js/example_source.js`。

被 Cloudflare 拦下时抛固定标记，App 会拉起网页视图过一次校验并自动重试：

```js
throw new Error('NEED_WEBVIEW_VERIFY：站点触发了 Cloudflare 人机校验（HTTP ' + status + ' ' + url + '）');
```
