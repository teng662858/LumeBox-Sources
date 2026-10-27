# 源仓库维护

用户入口见[仓库首页](../README.md)，分类详情见[源目录](源目录.md)。总订阅按漫画、美图、影视、视频与直播、有声小说五类展开，APP 承接为漫画、视频两个板块。

## 新增或更新源

1. 在对应脚本目录维护单份源文件，首行声明唯一 ID、名称、版本和 APP 板块。音频可声明 `mediaType: "audio"`；美图放在 `photo/`。
2. 已知内容分级记录在 `metadata/content-ratings.json`；无法确认时保持未分级。APP 内置名单也需要同步更新，单改仓库不会自动更新旧安装包的分级名单。
3. 在仓库根目录生成并校验所有清单：

```powershell
python tools/build_catalog.py
python tools/build_catalog.py --check
$sourceTests = (Get-ChildItem tools -Filter '*_test.js').FullName
node --test $sourceTests
```

需要 Python 3 和 Node.js。生成工具读取首行元数据，不执行源脚本，不访问网站。影视归类表与同 ID 的历史选择规则在 `tools/build_catalog.py` 中维护。

生成内容包括 `subscriptions/` 五类清单、`metadata/catalog.json`、总订阅 `subscriptions/all.json`、国内 CDN 线路、迁移用子集及目录文档。不要只手改某一份清单，否则下一次生成会覆盖。

## 删除与检查

同一个 ID 只能保留一份脚本。此次移除记录在 `metadata/removed-duplicates.json`，包含保留路径、删除路径与原文件摘要；需要恢复历史内容时从 Git 历史查看。原单独文件链接已失效，旧根目录清单已经收起，新版 APP 通过 `metadata/legacy-paths.json` 对应的内置规则迁移；旧版需要更新地址。

离线快照只验证解析规则；目录检查只验证分类、引用与 ID 一致性。通过这些检查不代表所有站点、图标、封面、登录或播放当前可用。实时故障应单独记录站点、请求状态、APP 版本和验证时间，避免把缺少图标声明误写成图标请求失败。

`tools/source_files.json` 是历史测试文件名映射，`snapshots/` 是解析回归样本，`licenses/` 保存授权信息。混合视频/音频的站点仍归视频，不把整个站点误当成纯听书源。

## 线路

`subscriptions/all.json` 是原站总订阅；`subscriptions/cdn/all.json` 是国内 CDN 总订阅，子清单和脚本也走 CDN。可用性取决于当地网络；CDN 更新可能延迟。

推送到`main`后，发布工作流会刷新本次变更的CDN脚本和清单，检查各服务商的确认结果。发布后仍需抽查国内镜像实际返回的源版本。详见[CDN更新说明](CDN更新说明.md)。
