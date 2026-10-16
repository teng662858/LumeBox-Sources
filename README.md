# LumeBox 订阅源

JS 文件仍按小说、听书、漫画、美图、影视、视频分别放在原有目录，不合并脚本。
对外订阅入口合并为三个：

- [novels：小说 / 听书](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/novels)
- [comics：漫画 / 美图](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/comics)
- [videos：视频 / 影视](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/videos)

[总订阅 all](https://raw.githubusercontent.com/teng662858/LumeBox-Sources/main/all) 包含以上三个版块的订阅地址，使用 App「全局设置 → 总订阅导入导出」导入，自动分配到对应版块。
总订阅是 JSON 地址清单，不是打包后的 JS 文件；导出文件保留订阅地址和启用状态。猫源订阅仍单独管理。

原 audiobooks、photos、movies 入口仅用于旧版兼容，不再作为独立推荐订阅。旧中文订阅清单及脚本兼容地址继续保留。小说入口沿用小写 novels，避免旧地址失效。

## 成人内容标识

含成人内容的站点在 App 源列表中显示 **18+** 图标。以下为已明确识别的源；未列出的源表示尚未完成分级，不能据此认定为适合未成年人。

| 分类 | 含成人内容（18+） |
| --- | --- |
| 小说 | CA小说、X小说、夜读小说、HHH书屋、H图书馆、中文成人小说网、小黄书小说、爱丽丝书屋、禁书阁、色文网、PO18、PO文屋、小說狂人 |
| 漫画 | 18H漫画、18禁漫、十八漫画、十八韩漫、漫蛙、禁漫天堂、肉漫屋、色友漫画、色漫網 |
| 视频 | H动漫一号、H動漫網、成人动漫、查特直播 |

成人内容分级的机器可读说明见 [content-ratings.json](content-ratings.json)。未分级表示未知，不能解释为适合未成年人。
