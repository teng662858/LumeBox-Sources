# LumeBox 源仓库

订阅入口统一放在 `subscriptions/`，分类与分级数据放在 `metadata/`。根目录只保留说明和各功能目录。

订阅格式：总入口是 JSON，分类 TXT 文件列出 JS 地址；TXT 是清单，不是 Python 或旧版脚本。实际源文件仍是 `.js`。

## 一次导入

- [国内 CDN 线路](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/all.json)
- [GitHub 原站线路](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/all.json)

在 APP 的“总订阅导入导出”中选择线路或粘贴链接。国内 CDN 线路的清单和脚本都走 CDN；能否直连取决于当前网络，更新可能有 CDN 缓存延迟。两条线路内容相同，选择一条即可。

## 按需分类

| 分类 | 独立源数 | 原站 | 国内 CDN |
| --- | ---: | --- | --- |
| 漫画 | 49 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/comic.txt) | [订阅](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/comic.txt) |
| 美图 | 6 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/photo.txt) | [订阅](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/photo.txt) |
| 影视 | 14 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/movie.txt) | [订阅](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/movie.txt) |
| 视频与直播 | 93 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/video.txt) | [订阅](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/video.txt) |
| 有声小说 | 7 | [订阅](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/subscriptions/audiobook.txt) | [订阅](https://cdn.jsdelivr.net/gh/teng662858/LumeBox-Sources@main/subscriptions/cdn/audiobook.txt) |

共 **169 个独立源**，同 ID 不重复收录。美图导入 APP 漫画板块，有声导入视频板块。

## 仓库目录

| 目录 | 内容 |
| --- | --- |
| `subscriptions/` | 所有订阅入口；`cdn/` 是国内 CDN 线路；`legacy/` 为迁移用旧子集 |
| `metadata/` | 唯一源目录、18+ 分级与旧地址迁移表 |
| `comic/`、`photo/` | 漫画、美图源脚本 |
| `movie/`、`video/`、`audiobook/` | 影视、视频、有声源脚本，分别存放 |
| `docs/` | 使用与维护说明 |
| `tools/`、`snapshots/`、`licenses/` | 工具、回归样本、授权 |

[完整源目录](docs/源目录.md) · [地址迁移说明](docs/源分类与兼容地址.md) · [维护说明](docs/README.md)

旧根目录订阅文件已收起，需要配套新版 APP 自动迁移旧地址，或使用上方新入口。18+ 是内容分级；未分级不代表全年龄。目录整理与离线检查不代表所有封面、图标和播放当前可用。
