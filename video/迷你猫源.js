// LumeSource: {"id":"hmtv_video","name":"迷你猫源","version":"1.0.0","category":"video","settingsApiVersion":2,"requiresSettings":["commonSettings","settingsActions","settingsGroups"],"endpoints":{"site":["http://127.0.0.1:8888","http://192.168.1.100:8888"]},"network":"direct","icon":"https://www.dbku.tv/favicon.ico"}
// LumeRuntime: javascript
//
// 站点：迷你猫源（xiaosag/hmtv 那套盒子服务端）—— 不是普通网站，是一个「源聚合服务」。
//   本机/服务器上跑 `node index.js` 后会监听 8888，暴露：
//     GET  /config                        → TVBox 配置（含 51 个站点）
//     POST /spider/<key>/3/home           → {class:[{type_id,type_name}], list:[…]}
//     POST /spider/<key>/3/category       → body {id, page, extend} → {list, page, pagecount}
//     POST /spider/<key>/3/detail         → body {id} → {list:[{vod_*, vod_play_url…}]}
//     POST /spider/<key>/3/search         → body {wd, page} → {list}
//   所以本源 = 把 51 个内置站点拍平成分类，数据全部由这个服务端代取（它已经处理好防盗链/签名/网盘解析）。
//
// 用法：
//   1) 任意一台常开的机器（电脑/NAS/VPS）跑 hmtv：`node index.js`，默认 8888；
//   2) 在 App 本源的「站点地址」里填这台机器的地址（http://IP:8888），多台可在 endpoints.site 里并列切换；
//   3) 之后就能在 App 里翻这 51 个站点的内容。本机跑不起来时本源会明确报「服务端连不上」。
//
// 分类表是构建时（2026-10-29）从运行中的服务端实测抓下来的：47 个站点 / 347 个分类。
// 站点自己改了分类，用设置里的「刷新分类」动作重抓。

var SITES = [{"k":"douban_hot","n":"🔥热门·推荐","adult":0,"c":[["hot_gaia","热门电影"],["tv_hot","热播剧集"],["anime_hot","热门动漫"],["show_hot","热播综艺"],["movie","电影筛选"],["tv","电视筛选"],["rank_list_movie","电影榜单"],["rank_list_tv","电视剧榜单"]]},{"k":"baseset","n":"⚙配置·中枢","adult":0,"c":[["setting","http://127.0.0.1:8888/website"]]},{"k":"wanou_pan","n":"🧸玩偶·4K","adult":0,"c":[["1","玩偶电影"],["2","玩偶剧集"],["3","动漫"],["4","综艺"],["5","音乐"],["6","短漫剧"]]},{"k":"muou_share","n":"🎭木偶·4K","adult":0,"c":[["1","电影"],["2","剧集"],["3","动漫"],["4","纪录片"],["25","115臻享"],["29","综艺"],["30","少儿频道"]]},{"k":"xiaosa_4k","n":"🐼潇洒·4K","adult":0,"c":[["movie","电影"],["drama","剧集"],["anime","动漫"]]},{"k":"duoduo_pan","n":"☁️多多·4K","adult":0,"c":[["1","电影"],["2","剧集"],["3","综艺"],["4","动漫"],["5","短剧"],["20","纪录"]]},{"k":"shandian_tv","n":"⚡闪电·4K","adult":0,"c":[["1","电影"],["2","剧集"],["3","动漫"],["44","臻彩"],["6","短剧"],["4","综艺"],["46","纪录片"],["5","音乐"]]},{"k":"pomo_pan","n":"💿原盘·4K","adult":0,"c":[["huayurm","华语热映"],["dianshiju","剧集"],["donghuadadiany","动画大电影"],["jiating","家庭"],["lengmenjiapian","冷门佳片"],["paihangbang","排行榜"]]},{"k":"huajuan_pan","n":"🥐花卷·4K","adult":0,"c":[["22","花卷高帧"],["1","花卷电影"],["2","花卷剧集"],["3","花卷动漫"],["23","花卷AI短剧"],["21","花卷综艺"],["24","4K原盘"]]},{"k":"pianku_pan","n":"🧩片库·4K","adult":0,"c":[["1","电影"],["2","剧集"],["3","综艺"],["4","动漫"],["30","短剧"]]},{"k":"hongguo_node","n":"🍎红果 - 短剧","adult":0,"c":[["short","短剧"],["human","真人剧"],["comic","漫剧"],["ai","AI剧"],["rank_hot","红果热播榜"],["rank_human","真人剧热播榜"],["rank_comic","漫剧热播榜"],["rank_ai","AI剧热播榜"]]},{"k":"xingya_short","n":"🌱星芽 - 短剧","adult":0,"c":[["1","剧场"],["2","热播剧"],["8","会员专享"],["7","星选好剧"],["3","新剧"],["5","阳光剧场"]]},{"k":"duanju_daquan","n":"🎬短剧 - 大全","adult":0,"c":[["1","短剧大全"],["2","重生"],["3","穿越"],["4","都市"],["5","甜宠"],["6","虐恋"],["7","战神"],["8","逆袭"],["9","古装"],["10","家庭"],["11","悬疑"],["12","剧情"]]},{"k":"hema_duanju","n":"🦛河马 - 短剧","adult":0,"c":[["417-464","逆袭"],["713","闪婚"],["462","甜宠"],["1129","都市"],["444","古装"],["916","穿越"],["439-465","重生"],["416-1708","复仇"],["714-1126","家庭"],["838","情感"],["1115-1589","漫剧"],["1091-1096","电影"],["1092-1097","电视剧"],["1642-1643","综艺"]]},{"k":"hongdou_duanju","n":"🫘红豆 - 短剧","adult":0,"c":[["0","最新短剧"],["334","都市"],["155","古装"],["338","爱情"],["362","总裁"],["285","甜宠"],["332","逆袭"],["341","重生"],["306","穿越"],["397","玄幻"],["220","悬疑"]]},{"k":"asmrba","n":"🎧ASMR 吧 - 助眠","adult":0,"c":[["latest","最新更新"],["314","ASMR资讯"],["1","中文ASMR"],["5","日韩ASMR"],["4","欧美ASMR"]]},{"k":"xingmeng_asmr","n":"✨星梦 ASMR-S","adult":0,"c":[["cn","中国"],["kr","韩国"],["jp","日本"],["other","其他"],["listen","音频"]]},{"k":"ximalaya","n":"🏔喜马拉雅-听书","adult":0,"c":[["youshengshu","有声书"],["ertong","儿童"],["yinyue","音乐"],["xiangsheng","相声"],["yule","娱乐"],["guangbojv","广播剧"],["lishi","历史"],["waiyu","外语"],["qinggan","情感"],["keji","科技"],["caijing","财经"],["jiaoyu","教育"],["jiankang","健康"],["qiche","汽车"],["lvxing","旅行"],["youxi","游戏"],["erciyuan","二次元"],["toutiao","头条"],["dianying","电影"],["dianshiju","电视剧"],["3d","3D沉浸"],["xiuxian","播客"],["xiangsheng2","相声评书"],["tuokouxiu","脱口秀"]]},{"k":"yueting","n":"🎧悦听 - 听书","adult":0,"c":[["1","玄幻"],["4","都市"],["2","历史"],["6","名著"],["7","女频"],["5","科幻"],["3","武侠"],["a","评书"],["8","社科"]]},{"k":"tiantian_4k","n":"☀️天天 - 4K","adult":0,"c":[["2","电视剧"],["1","电影"],["3","综艺"],["4","动漫"],["24","漫剧"],["23","4K专区"],["5","短剧"],["20","直播"],["21","CCTV"],["22","地方卫视"]]},{"k":"yidong_4k","n":"♨️移动 - 4K","adult":0,"c":[["1","电影"],["2","电视剧"],["3","动漫"]]},{"k":"fengye4k","n":"🍁枫叶 - 4K","adult":0,"c":[["/label/qq","腾讯VIP精选"],["/label/bli","B站VIP精选"],["/label/youku","优酷VIP精选"],["5","红果短剧"],["2","电视剧"],["1","电影"],["4","动漫"],["3","综艺"]]},{"k":"juxiafan_4k","n":"🍚剧饭 - 4K","adult":0,"c":[["22016","电视剧"],["22017","电影"],["22018","动漫"],["22019","综艺"],["22020","短剧"],["22021","少儿"],["22022","纪录片"],["22024","AI漫剧"],["22023","直播"]]},{"k":"tencent_video","n":"🐧腾讯- 4K","adult":0,"c":[["movie","电影"],["tv","电视剧"],["mini_series","短剧"],["variety","综艺"],["cartoon","动漫"],["child","少儿"],["doco","纪录片"]]},{"k":"gulu_4k","n":"💧咕噜 - 4K","adult":0,"c":[["8","电影"],["9","电视剧"],["10","综艺"],["11","动漫"],["12","短剧"],["6","纪录片"]]},{"k":"guazi","n":"🌰瓜子 - 2K","adult":0,"c":[["c0","热门"],["c2","Netflix新片榜"],["c3","Disney+新片榜"],["c5","Apple TV+新片榜"],["c4","HBOmax新片榜"],["c6","prime video新片榜"],["c15","本周国剧排行榜"],["c8","本周美剧排行榜"],["c12","本周动漫排行榜"],["c148","本周电影排行榜"],["c10","本周韩剧排行榜"],["c9","本周英剧排行榜"],["c11","本周日剧排行榜"],["c149","本周泰剧排行榜"],["c171","本周综艺排行榜"],["c172","本周纪录片排行榜"],["t64","短剧"]]},{"k":"youtube_video","n":"▶️YouTube","adult":0,"c":[["电影","电影"],["直播","直播"],["音乐","音乐"],["HDR","HDR"],["免费","免费"],["短剧","短剧"],["动画片","动画片"]]},{"k":"netflix_cat","n":"🌐飞猫- 极速","adult":0,"c":[["1","电影"],["2","剧集"],["3","动漫"],["4","综艺"],["2002","韩剧"],["6","短剧"]]},{"k":"xiaoyouzi","n":"🍊柚子 - 极速","adult":0,"c":[["1","电影"],["2","电视剧"],["26","热门短剧"],["4","二次元动漫"],["3","综艺"],["27","Ai漫剧"],["25","电视直播"]]},{"k":"zhuijudaren","n":"🏆达人 - 极速","adult":0,"c":[["2","剧集"],["1","电影"],["4","动漫"],["3","综艺"],["27","纪录"],["28","短剧"],["29","少儿"]]},{"k":"duse91","n":"🐍毒蛇- 极速","adult":0,"c":[["1","电影"],["2","连续剧"],["3","动漫"],["4","综艺纪录"],["6","短剧"],["label/new","今日更新"]]},{"k":"fenzhu","n":"🐷猪猪侠 - 极速","adult":0,"c":[["20","电影"],["30","剧集"],["36","综艺"],["37","动漫"],["43","少儿"],["38","纪录片"],["41","短剧"],["42","直播"]]},{"k":"mengtaiqi","n":"🐺灰太狼 - 极速","adult":0,"c":[["1","电影"],["2","剧集"],["3","动漫"],["4","综艺"],["5","儿童"],["20","纪录"],["22","短剧"]]},{"k":"nivod_fast","n":"📹泥视频 - 极速","adult":0,"c":[["movie","电影"],["tv","电视剧"],["show","综艺"],["anime","动漫"]]},{"k":"duboku","n":"📺独播库 - 极速","adult":0,"c":[["2","连续剧"],["1","电影"],["3","综艺"],["4","动漫"]]},{"k":"duoduo_tv","n":"📺多多影视 - 极速","adult":0,"c":[["1","电影"],["2","剧集"],["3","动漫"],["4","综艺"]]},{"k":"chabeihu","n":"🦊茶杯狐 - 极速","adult":0,"c":[["1","电影"],["2","电视剧"],["3","综艺"],["4","动漫"]]},{"k":"dshixiong_tv","n":"🚀师兄 - 极速","adult":0,"c":[["1","电影"],["2","剧集"],["3","综艺"],["4","动漫"],["63","短剧"],["64","AI漫剧"],["62","少儿"],["58","直播"]]},{"k":"zhenpin_video","n":"💎臻品 - 极速","adult":0,"c":[["dianying","电影"],["gcj","电视剧"],["zongyi","综艺"],["dongmna","动漫"],["jilupian","纪录片"]]},{"k":"wencaiyingshi","n":"📖文才 - 极速","adult":0,"c":[["1","电影"],["2","电视剧"],["3","综艺"],["4","动漫"],["88","短剧"],["7","体育直播"]]},{"k":"jisu_zhuiju","n":"📺追剧 - 极速","adult":0,"c":[["dianshiju","电视剧"],["dianying","电影"],["dongman","动漫"],["zongyi","综艺"]]},{"k":"jianpian","n":"📽荐片- 极速","adult":0,"c":[["1","电影"],["2","电视剧"],["3","动漫"],["67","短剧"],["4","综艺"]]},{"k":"rebo_fast","n":"🔥热播 - 极速","adult":0,"c":[["10","内地"],["1","电影"],["11","动漫"],["13","综艺"],["2","韩剧"],["7","泰剧"],["8","港剧"],["4","日剧"],["5","美剧"],["9","台剧"]]},{"k":"linglingqi","n":"🕵️凌凌漆 - 极速","adult":0,"c":[["2","剧集"],["1","电影"],["3","动漫"],["4","综艺"],["19","少儿"],["23","纪录片"],["21","短剧"],["22","AI漫剧"],["7","直播"]]},{"k":"kanju_ai","n":"🤖看剧 AI - 极速","adult":0,"c":[["series","电视剧"],["movie","电影"],["anime","动漫"],["variety","综艺"],["documentary","纪录片"],["short_drama","短剧"]]},{"k":"xin6v","n":"🧲磁力- 极速","adult":0,"c":[["xijupian","喜剧片"],["dongzuopian","动作片"],["aiqingpian","爱情片"],["kehuanpian","科幻片"],["kongbupian","恐怖片"],["juqingpian","剧情片"],["zhanzhengpian","战争片"],["jilupian","纪录片"],["donghuapian","动画片"],["dianshiju","电视剧"],["dianshiju/guoju","国剧"],["dianshiju/rihanju","日韩剧"],["dianshiju/oumeiju","欧美剧"],["dianshiju/duanju","短剧"],["ZongYi","综艺"]]},{"k":"dongman_bashi_mixed","n":"🚌巴士-动漫","adult":0,"c":[["1","国漫"],["2","日漫"],["3","欧美动漫"],["4","电影"]]}];
var CATEGORIES = [["douban_hot|hot_gaia","🔥热门·推荐·热门电影"],["douban_hot|tv_hot","🔥热门·推荐·热播剧集"],["douban_hot|anime_hot","🔥热门·推荐·热门动漫"],["douban_hot|show_hot","🔥热门·推荐·热播综艺"],["douban_hot|movie","🔥热门·推荐·电影筛选"],["douban_hot|tv","🔥热门·推荐·电视筛选"],["douban_hot|rank_list_movie","🔥热门·推荐·电影榜单"],["douban_hot|rank_list_tv","🔥热门·推荐·电视剧榜单"],["baseset|setting","⚙配置·中枢·http://127.0.0.1:8888/website"],["wanou_pan|1","🧸玩偶·4K·玩偶电影"],["wanou_pan|2","🧸玩偶·4K·玩偶剧集"],["wanou_pan|3","🧸玩偶·4K·动漫"],["wanou_pan|4","🧸玩偶·4K·综艺"],["wanou_pan|5","🧸玩偶·4K·音乐"],["wanou_pan|6","🧸玩偶·4K·短漫剧"],["muou_share|1","🎭木偶·4K·电影"],["muou_share|2","🎭木偶·4K·剧集"],["muou_share|3","🎭木偶·4K·动漫"],["muou_share|4","🎭木偶·4K·纪录片"],["muou_share|25","🎭木偶·4K·115臻享"],["muou_share|29","🎭木偶·4K·综艺"],["muou_share|30","🎭木偶·4K·少儿频道"],["xiaosa_4k|movie","🐼潇洒·4K·电影"],["xiaosa_4k|drama","🐼潇洒·4K·剧集"],["xiaosa_4k|anime","🐼潇洒·4K·动漫"],["duoduo_pan|1","☁️多多·4K·电影"],["duoduo_pan|2","☁️多多·4K·剧集"],["duoduo_pan|3","☁️多多·4K·综艺"],["duoduo_pan|4","☁️多多·4K·动漫"],["duoduo_pan|5","☁️多多·4K·短剧"],["duoduo_pan|20","☁️多多·4K·纪录"],["shandian_tv|1","⚡闪电·4K·电影"],["shandian_tv|2","⚡闪电·4K·剧集"],["shandian_tv|3","⚡闪电·4K·动漫"],["shandian_tv|44","⚡闪电·4K·臻彩"],["shandian_tv|6","⚡闪电·4K·短剧"],["shandian_tv|4","⚡闪电·4K·综艺"],["shandian_tv|46","⚡闪电·4K·纪录片"],["shandian_tv|5","⚡闪电·4K·音乐"],["pomo_pan|huayurm","💿原盘·4K·华语热映"],["pomo_pan|dianshiju","💿原盘·4K·剧集"],["pomo_pan|donghuadadiany","💿原盘·4K·动画大电影"],["pomo_pan|jiating","💿原盘·4K·家庭"],["pomo_pan|lengmenjiapian","💿原盘·4K·冷门佳片"],["pomo_pan|paihangbang","💿原盘·4K·排行榜"],["huajuan_pan|22","🥐花卷·4K·花卷高帧"],["huajuan_pan|1","🥐花卷·4K·花卷电影"],["huajuan_pan|2","🥐花卷·4K·花卷剧集"],["huajuan_pan|3","🥐花卷·4K·花卷动漫"],["huajuan_pan|23","🥐花卷·4K·花卷AI短剧"],["huajuan_pan|21","🥐花卷·4K·花卷综艺"],["huajuan_pan|24","🥐花卷·4K·4K原盘"],["pianku_pan|1","🧩片库·4K·电影"],["pianku_pan|2","🧩片库·4K·剧集"],["pianku_pan|3","🧩片库·4K·综艺"],["pianku_pan|4","🧩片库·4K·动漫"],["pianku_pan|30","🧩片库·4K·短剧"],["hongguo_node|short","🍎红果 - 短剧·短剧"],["hongguo_node|human","🍎红果 - 短剧·真人剧"],["hongguo_node|comic","🍎红果 - 短剧·漫剧"],["hongguo_node|ai","🍎红果 - 短剧·AI剧"],["hongguo_node|rank_hot","🍎红果 - 短剧·红果热播榜"],["hongguo_node|rank_human","🍎红果 - 短剧·真人剧热播榜"],["hongguo_node|rank_comic","🍎红果 - 短剧·漫剧热播榜"],["hongguo_node|rank_ai","🍎红果 - 短剧·AI剧热播榜"],["xingya_short|1","🌱星芽 - 短剧·剧场"],["xingya_short|2","🌱星芽 - 短剧·热播剧"],["xingya_short|8","🌱星芽 - 短剧·会员专享"],["xingya_short|7","🌱星芽 - 短剧·星选好剧"],["xingya_short|3","🌱星芽 - 短剧·新剧"],["xingya_short|5","🌱星芽 - 短剧·阳光剧场"],["duanju_daquan|1","🎬短剧 - 大全·短剧大全"],["duanju_daquan|2","🎬短剧 - 大全·重生"],["duanju_daquan|3","🎬短剧 - 大全·穿越"],["duanju_daquan|4","🎬短剧 - 大全·都市"],["duanju_daquan|5","🎬短剧 - 大全·甜宠"],["duanju_daquan|6","🎬短剧 - 大全·虐恋"],["duanju_daquan|7","🎬短剧 - 大全·战神"],["duanju_daquan|8","🎬短剧 - 大全·逆袭"],["duanju_daquan|9","🎬短剧 - 大全·古装"],["duanju_daquan|10","🎬短剧 - 大全·家庭"],["duanju_daquan|11","🎬短剧 - 大全·悬疑"],["duanju_daquan|12","🎬短剧 - 大全·剧情"],["hema_duanju|417-464","🦛河马 - 短剧·逆袭"],["hema_duanju|713","🦛河马 - 短剧·闪婚"],["hema_duanju|462","🦛河马 - 短剧·甜宠"],["hema_duanju|1129","🦛河马 - 短剧·都市"],["hema_duanju|444","🦛河马 - 短剧·古装"],["hema_duanju|916","🦛河马 - 短剧·穿越"],["hema_duanju|439-465","🦛河马 - 短剧·重生"],["hema_duanju|416-1708","🦛河马 - 短剧·复仇"],["hema_duanju|714-1126","🦛河马 - 短剧·家庭"],["hema_duanju|838","🦛河马 - 短剧·情感"],["hema_duanju|1115-1589","🦛河马 - 短剧·漫剧"],["hema_duanju|1091-1096","🦛河马 - 短剧·电影"],["hema_duanju|1092-1097","🦛河马 - 短剧·电视剧"],["hema_duanju|1642-1643","🦛河马 - 短剧·综艺"],["hongdou_duanju|0","🫘红豆 - 短剧·最新短剧"],["hongdou_duanju|334","🫘红豆 - 短剧·都市"],["hongdou_duanju|155","🫘红豆 - 短剧·古装"],["hongdou_duanju|338","🫘红豆 - 短剧·爱情"],["hongdou_duanju|362","🫘红豆 - 短剧·总裁"],["hongdou_duanju|285","🫘红豆 - 短剧·甜宠"],["hongdou_duanju|332","🫘红豆 - 短剧·逆袭"],["hongdou_duanju|341","🫘红豆 - 短剧·重生"],["hongdou_duanju|306","🫘红豆 - 短剧·穿越"],["hongdou_duanju|397","🫘红豆 - 短剧·玄幻"],["hongdou_duanju|220","🫘红豆 - 短剧·悬疑"],["asmrba|latest","🎧ASMR 吧 - 助眠·最新更新"],["asmrba|314","🎧ASMR 吧 - 助眠·ASMR资讯"],["asmrba|1","🎧ASMR 吧 - 助眠·中文ASMR"],["asmrba|5","🎧ASMR 吧 - 助眠·日韩ASMR"],["asmrba|4","🎧ASMR 吧 - 助眠·欧美ASMR"],["xingmeng_asmr|cn","✨星梦 ASMR-S·中国"],["xingmeng_asmr|kr","✨星梦 ASMR-S·韩国"],["xingmeng_asmr|jp","✨星梦 ASMR-S·日本"],["xingmeng_asmr|other","✨星梦 ASMR-S·其他"],["xingmeng_asmr|listen","✨星梦 ASMR-S·音频"],["ximalaya|youshengshu","🏔喜马拉雅-听书·有声书"],["ximalaya|ertong","🏔喜马拉雅-听书·儿童"],["ximalaya|yinyue","🏔喜马拉雅-听书·音乐"],["ximalaya|xiangsheng","🏔喜马拉雅-听书·相声"],["ximalaya|yule","🏔喜马拉雅-听书·娱乐"],["ximalaya|guangbojv","🏔喜马拉雅-听书·广播剧"],["ximalaya|lishi","🏔喜马拉雅-听书·历史"],["ximalaya|waiyu","🏔喜马拉雅-听书·外语"],["ximalaya|qinggan","🏔喜马拉雅-听书·情感"],["ximalaya|keji","🏔喜马拉雅-听书·科技"],["ximalaya|caijing","🏔喜马拉雅-听书·财经"],["ximalaya|jiaoyu","🏔喜马拉雅-听书·教育"],["ximalaya|jiankang","🏔喜马拉雅-听书·健康"],["ximalaya|qiche","🏔喜马拉雅-听书·汽车"],["ximalaya|lvxing","🏔喜马拉雅-听书·旅行"],["ximalaya|youxi","🏔喜马拉雅-听书·游戏"],["ximalaya|erciyuan","🏔喜马拉雅-听书·二次元"],["ximalaya|toutiao","🏔喜马拉雅-听书·头条"],["ximalaya|dianying","🏔喜马拉雅-听书·电影"],["ximalaya|dianshiju","🏔喜马拉雅-听书·电视剧"],["ximalaya|3d","🏔喜马拉雅-听书·3D沉浸"],["ximalaya|xiuxian","🏔喜马拉雅-听书·播客"],["ximalaya|xiangsheng2","🏔喜马拉雅-听书·相声评书"],["ximalaya|tuokouxiu","🏔喜马拉雅-听书·脱口秀"],["yueting|1","🎧悦听 - 听书·玄幻"],["yueting|4","🎧悦听 - 听书·都市"],["yueting|2","🎧悦听 - 听书·历史"],["yueting|6","🎧悦听 - 听书·名著"],["yueting|7","🎧悦听 - 听书·女频"],["yueting|5","🎧悦听 - 听书·科幻"],["yueting|3","🎧悦听 - 听书·武侠"],["yueting|a","🎧悦听 - 听书·评书"],["yueting|8","🎧悦听 - 听书·社科"],["tiantian_4k|2","☀️天天 - 4K·电视剧"],["tiantian_4k|1","☀️天天 - 4K·电影"],["tiantian_4k|3","☀️天天 - 4K·综艺"],["tiantian_4k|4","☀️天天 - 4K·动漫"],["tiantian_4k|24","☀️天天 - 4K·漫剧"],["tiantian_4k|23","☀️天天 - 4K·4K专区"],["tiantian_4k|5","☀️天天 - 4K·短剧"],["tiantian_4k|20","☀️天天 - 4K·直播"],["tiantian_4k|21","☀️天天 - 4K·CCTV"],["tiantian_4k|22","☀️天天 - 4K·地方卫视"],["yidong_4k|1","♨️移动 - 4K·电影"],["yidong_4k|2","♨️移动 - 4K·电视剧"],["yidong_4k|3","♨️移动 - 4K·动漫"],["fengye4k|/label/qq","🍁枫叶 - 4K·腾讯VIP精选"],["fengye4k|/label/bli","🍁枫叶 - 4K·B站VIP精选"],["fengye4k|/label/youku","🍁枫叶 - 4K·优酷VIP精选"],["fengye4k|5","🍁枫叶 - 4K·红果短剧"],["fengye4k|2","🍁枫叶 - 4K·电视剧"],["fengye4k|1","🍁枫叶 - 4K·电影"],["fengye4k|4","🍁枫叶 - 4K·动漫"],["fengye4k|3","🍁枫叶 - 4K·综艺"],["juxiafan_4k|22016","🍚剧饭 - 4K·电视剧"],["juxiafan_4k|22017","🍚剧饭 - 4K·电影"],["juxiafan_4k|22018","🍚剧饭 - 4K·动漫"],["juxiafan_4k|22019","🍚剧饭 - 4K·综艺"],["juxiafan_4k|22020","🍚剧饭 - 4K·短剧"],["juxiafan_4k|22021","🍚剧饭 - 4K·少儿"],["juxiafan_4k|22022","🍚剧饭 - 4K·纪录片"],["juxiafan_4k|22024","🍚剧饭 - 4K·AI漫剧"],["juxiafan_4k|22023","🍚剧饭 - 4K·直播"],["tencent_video|movie","🐧腾讯- 4K·电影"],["tencent_video|tv","🐧腾讯- 4K·电视剧"],["tencent_video|mini_series","🐧腾讯- 4K·短剧"],["tencent_video|variety","🐧腾讯- 4K·综艺"],["tencent_video|cartoon","🐧腾讯- 4K·动漫"],["tencent_video|child","🐧腾讯- 4K·少儿"],["tencent_video|doco","🐧腾讯- 4K·纪录片"],["gulu_4k|8","💧咕噜 - 4K·电影"],["gulu_4k|9","💧咕噜 - 4K·电视剧"],["gulu_4k|10","💧咕噜 - 4K·综艺"],["gulu_4k|11","💧咕噜 - 4K·动漫"],["gulu_4k|12","💧咕噜 - 4K·短剧"],["gulu_4k|6","💧咕噜 - 4K·纪录片"],["guazi|c0","🌰瓜子 - 2K·热门"],["guazi|c2","🌰瓜子 - 2K·Netflix新片榜"],["guazi|c3","🌰瓜子 - 2K·Disney+新片榜"],["guazi|c5","🌰瓜子 - 2K·Apple TV+新片榜"],["guazi|c4","🌰瓜子 - 2K·HBOmax新片榜"],["guazi|c6","🌰瓜子 - 2K·prime video新片榜"],["guazi|c15","🌰瓜子 - 2K·本周国剧排行榜"],["guazi|c8","🌰瓜子 - 2K·本周美剧排行榜"],["guazi|c12","🌰瓜子 - 2K·本周动漫排行榜"],["guazi|c148","🌰瓜子 - 2K·本周电影排行榜"],["guazi|c10","🌰瓜子 - 2K·本周韩剧排行榜"],["guazi|c9","🌰瓜子 - 2K·本周英剧排行榜"],["guazi|c11","🌰瓜子 - 2K·本周日剧排行榜"],["guazi|c149","🌰瓜子 - 2K·本周泰剧排行榜"],["guazi|c171","🌰瓜子 - 2K·本周综艺排行榜"],["guazi|c172","🌰瓜子 - 2K·本周纪录片排行榜"],["guazi|t64","🌰瓜子 - 2K·短剧"],["youtube_video|电影","▶️YouTube·电影"],["youtube_video|直播","▶️YouTube·直播"],["youtube_video|音乐","▶️YouTube·音乐"],["youtube_video|HDR","▶️YouTube·HDR"],["youtube_video|免费","▶️YouTube·免费"],["youtube_video|短剧","▶️YouTube·短剧"],["youtube_video|动画片","▶️YouTube·动画片"],["netflix_cat|1","🌐飞猫- 极速·电影"],["netflix_cat|2","🌐飞猫- 极速·剧集"],["netflix_cat|3","🌐飞猫- 极速·动漫"],["netflix_cat|4","🌐飞猫- 极速·综艺"],["netflix_cat|2002","🌐飞猫- 极速·韩剧"],["netflix_cat|6","🌐飞猫- 极速·短剧"],["xiaoyouzi|1","🍊柚子 - 极速·电影"],["xiaoyouzi|2","🍊柚子 - 极速·电视剧"],["xiaoyouzi|26","🍊柚子 - 极速·热门短剧"],["xiaoyouzi|4","🍊柚子 - 极速·二次元动漫"],["xiaoyouzi|3","🍊柚子 - 极速·综艺"],["xiaoyouzi|27","🍊柚子 - 极速·Ai漫剧"],["xiaoyouzi|25","🍊柚子 - 极速·电视直播"],["zhuijudaren|2","🏆达人 - 极速·剧集"],["zhuijudaren|1","🏆达人 - 极速·电影"],["zhuijudaren|4","🏆达人 - 极速·动漫"],["zhuijudaren|3","🏆达人 - 极速·综艺"],["zhuijudaren|27","🏆达人 - 极速·纪录"],["zhuijudaren|28","🏆达人 - 极速·短剧"],["zhuijudaren|29","🏆达人 - 极速·少儿"],["duse91|1","🐍毒蛇- 极速·电影"],["duse91|2","🐍毒蛇- 极速·连续剧"],["duse91|3","🐍毒蛇- 极速·动漫"],["duse91|4","🐍毒蛇- 极速·综艺纪录"],["duse91|6","🐍毒蛇- 极速·短剧"],["duse91|label/new","🐍毒蛇- 极速·今日更新"],["fenzhu|20","🐷猪猪侠 - 极速·电影"],["fenzhu|30","🐷猪猪侠 - 极速·剧集"],["fenzhu|36","🐷猪猪侠 - 极速·综艺"],["fenzhu|37","🐷猪猪侠 - 极速·动漫"],["fenzhu|43","🐷猪猪侠 - 极速·少儿"],["fenzhu|38","🐷猪猪侠 - 极速·纪录片"],["fenzhu|41","🐷猪猪侠 - 极速·短剧"],["fenzhu|42","🐷猪猪侠 - 极速·直播"],["mengtaiqi|1","🐺灰太狼 - 极速·电影"],["mengtaiqi|2","🐺灰太狼 - 极速·剧集"],["mengtaiqi|3","🐺灰太狼 - 极速·动漫"],["mengtaiqi|4","🐺灰太狼 - 极速·综艺"],["mengtaiqi|5","🐺灰太狼 - 极速·儿童"],["mengtaiqi|20","🐺灰太狼 - 极速·纪录"],["mengtaiqi|22","🐺灰太狼 - 极速·短剧"],["nivod_fast|movie","📹泥视频 - 极速·电影"],["nivod_fast|tv","📹泥视频 - 极速·电视剧"],["nivod_fast|show","📹泥视频 - 极速·综艺"],["nivod_fast|anime","📹泥视频 - 极速·动漫"],["duboku|2","📺独播库 - 极速·连续剧"],["duboku|1","📺独播库 - 极速·电影"],["duboku|3","📺独播库 - 极速·综艺"],["duboku|4","📺独播库 - 极速·动漫"],["duoduo_tv|1","📺多多影视 - 极速·电影"],["duoduo_tv|2","📺多多影视 - 极速·剧集"],["duoduo_tv|3","📺多多影视 - 极速·动漫"],["duoduo_tv|4","📺多多影视 - 极速·综艺"],["chabeihu|1","🦊茶杯狐 - 极速·电影"],["chabeihu|2","🦊茶杯狐 - 极速·电视剧"],["chabeihu|3","🦊茶杯狐 - 极速·综艺"],["chabeihu|4","🦊茶杯狐 - 极速·动漫"],["dshixiong_tv|1","🚀师兄 - 极速·电影"],["dshixiong_tv|2","🚀师兄 - 极速·剧集"],["dshixiong_tv|3","🚀师兄 - 极速·综艺"],["dshixiong_tv|4","🚀师兄 - 极速·动漫"],["dshixiong_tv|63","🚀师兄 - 极速·短剧"],["dshixiong_tv|64","🚀师兄 - 极速·AI漫剧"],["dshixiong_tv|62","🚀师兄 - 极速·少儿"],["dshixiong_tv|58","🚀师兄 - 极速·直播"],["zhenpin_video|dianying","💎臻品 - 极速·电影"],["zhenpin_video|gcj","💎臻品 - 极速·电视剧"],["zhenpin_video|zongyi","💎臻品 - 极速·综艺"],["zhenpin_video|dongmna","💎臻品 - 极速·动漫"],["zhenpin_video|jilupian","💎臻品 - 极速·纪录片"],["wencaiyingshi|1","📖文才 - 极速·电影"],["wencaiyingshi|2","📖文才 - 极速·电视剧"],["wencaiyingshi|3","📖文才 - 极速·综艺"],["wencaiyingshi|4","📖文才 - 极速·动漫"],["wencaiyingshi|88","📖文才 - 极速·短剧"],["wencaiyingshi|7","📖文才 - 极速·体育直播"],["jisu_zhuiju|dianshiju","📺追剧 - 极速·电视剧"],["jisu_zhuiju|dianying","📺追剧 - 极速·电影"],["jisu_zhuiju|dongman","📺追剧 - 极速·动漫"],["jisu_zhuiju|zongyi","📺追剧 - 极速·综艺"],["jianpian|1","📽荐片- 极速·电影"],["jianpian|2","📽荐片- 极速·电视剧"],["jianpian|3","📽荐片- 极速·动漫"],["jianpian|67","📽荐片- 极速·短剧"],["jianpian|4","📽荐片- 极速·综艺"],["rebo_fast|10","🔥热播 - 极速·内地"],["rebo_fast|1","🔥热播 - 极速·电影"],["rebo_fast|11","🔥热播 - 极速·动漫"],["rebo_fast|13","🔥热播 - 极速·综艺"],["rebo_fast|2","🔥热播 - 极速·韩剧"],["rebo_fast|7","🔥热播 - 极速·泰剧"],["rebo_fast|8","🔥热播 - 极速·港剧"],["rebo_fast|4","🔥热播 - 极速·日剧"],["rebo_fast|5","🔥热播 - 极速·美剧"],["rebo_fast|9","🔥热播 - 极速·台剧"],["linglingqi|2","🕵️凌凌漆 - 极速·剧集"],["linglingqi|1","🕵️凌凌漆 - 极速·电影"],["linglingqi|3","🕵️凌凌漆 - 极速·动漫"],["linglingqi|4","🕵️凌凌漆 - 极速·综艺"],["linglingqi|19","🕵️凌凌漆 - 极速·少儿"],["linglingqi|23","🕵️凌凌漆 - 极速·纪录片"],["linglingqi|21","🕵️凌凌漆 - 极速·短剧"],["linglingqi|22","🕵️凌凌漆 - 极速·AI漫剧"],["linglingqi|7","🕵️凌凌漆 - 极速·直播"],["kanju_ai|series","🤖看剧 AI - 极速·电视剧"],["kanju_ai|movie","🤖看剧 AI - 极速·电影"],["kanju_ai|anime","🤖看剧 AI - 极速·动漫"],["kanju_ai|variety","🤖看剧 AI - 极速·综艺"],["kanju_ai|documentary","🤖看剧 AI - 极速·纪录片"],["kanju_ai|short_drama","🤖看剧 AI - 极速·短剧"],["xin6v|xijupian","🧲磁力- 极速·喜剧片"],["xin6v|dongzuopian","🧲磁力- 极速·动作片"],["xin6v|aiqingpian","🧲磁力- 极速·爱情片"],["xin6v|kehuanpian","🧲磁力- 极速·科幻片"],["xin6v|kongbupian","🧲磁力- 极速·恐怖片"],["xin6v|juqingpian","🧲磁力- 极速·剧情片"],["xin6v|zhanzhengpian","🧲磁力- 极速·战争片"],["xin6v|jilupian","🧲磁力- 极速·纪录片"],["xin6v|donghuapian","🧲磁力- 极速·动画片"],["xin6v|dianshiju","🧲磁力- 极速·电视剧"],["xin6v|dianshiju/guoju","🧲磁力- 极速·国剧"],["xin6v|dianshiju/rihanju","🧲磁力- 极速·日韩剧"],["xin6v|dianshiju/oumeiju","🧲磁力- 极速·欧美剧"],["xin6v|dianshiju/duanju","🧲磁力- 极速·短剧"],["xin6v|ZongYi","🧲磁力- 极速·综艺"],["dongman_bashi_mixed|1","🚌巴士-动漫·国漫"],["dongman_bashi_mixed|2","🚌巴士-动漫·日漫"],["dongman_bashi_mixed|3","🚌巴士-动漫·欧美动漫"],["dongman_bashi_mixed|4","🚌巴士-动漫·电影"]];
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var PAGE_SIZE = 20;
var HOME_KEY = 'chabeihu';

function serverBase() {
  var cfg = LumeSource.config || {};
  var domain = cfg.domain ? String(cfg.domain) : '';
  if (domain) return domain.replace(/\/+$/, '');
  var mirrors = cfg.mirrors || [];
  if (mirrors.length) return String(mirrors[0]).replace(/\/+$/, '');
  var header = (SITES && SITES.length ? '' : '');
  return 'http://127.0.0.1:8888';
}

function readJson(file) {
  return LumeSource.fs.readText(file).then(function (raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }).catch(function () { return null; });
}
function writeJson(file, v) {
  return LumeSource.fs.writeText(file, JSON.stringify(v)).catch(function () { return null; });
}

function clean(t) {
  return String(t == null ? '' : t).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

// 服务端把封面转成 http://127.0.0.1:8888/img?u=…&r=…，换成当前实际服务地址
function fixUrl(u) {
  var text = String(u == null ? '' : u).trim();
  if (!text) return '';
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(text)) {
    return text.replace(/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i, serverBase());
  }
  return text;
}

// chapterId 里塞了「线路名 + 播放地址」：p:<组>:<集>:<线路名>:<地址>
function parseChapter(id) {
  var text = String(id == null ? '' : id);
  if (text.indexOf('p:') === 0) text = text.slice(2);
  var first = text.indexOf(':');
  var second = first >= 0 ? text.indexOf(':', first + 1) : -1;
  var third = second >= 0 ? text.indexOf(':', second + 1) : -1;
  if (third < 0) return { flag: '', url: '' };
  var flag = text.slice(second + 1, third);
  var url = text.slice(third + 1);
  return { flag: flag, url: url };
}

function siteOf(key) {
  for (var i = 0; i < SITES.length; i++) if (SITES[i].k === key) return SITES[i];
  return null;
}

function post(path, body) {
  var url = serverBase() + path;
  return LumeSource.http.post(url, JSON.stringify(body || {}), {
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, Accept: 'application/json' },
  }).then(function (reply) {
    var status = reply ? reply.status : 0;
    if (!status) throw new Error('服务端连不上：' + serverBase() + '（先在电脑/VPS 上跑 node index.js，再把这里的站点地址改成那台机器）');
    if (status !== 200) throw new Error('服务端返回 HTTP ' + status + '（' + path + '）');
    var text = reply.body ? String(reply.body) : '{}';
    try { return JSON.parse(text); } catch (e) { throw new Error('服务端返回不是 JSON：' + text.slice(0, 80)); }
  });
}

function mapItem(row) {
  return {
    id: String(row.vod_id || row.id || ''),
    title: clean(row.vod_name || row.name || ''),
    cover: fixUrl(row.vod_pic || row.pic || ''),
    subtitle: clean(row.vod_remarks || row.vod_serial || ''),
  };
}

function remember(items) {
  if (!items.length) return Promise.resolve(null);
  return readJson('items.json').then(function (cached) {
    var map = (cached && cached.map) ? cached.map : {};
    for (var i = 0; i < items.length; i++) map[items[i].id] = { title: items[i].title, cover: items[i].cover };
    return writeJson('items.json', { at: Date.now(), map: map });
  });
}

var LumeSource = {
  id: 'hmtv_video',
  name: '迷你猫源',
  version: '1.0.0',
  category: 'video',
  settingsApiVersion: 2,
  requiresSettings: ['commonSettings', 'settingsActions', 'settingsGroups'],
  endpoints: { site: ['http://127.0.0.1:8888', 'http://192.168.1.100:8888'] },
  commonSettings: [
    { key: 'pageSize', default: 20, min: 1, max: 50 },
    { key: 'playbackMode', default: 'auto' },
  ],
  settings: [
    { key: 'serverNote', type: 'info', title: '服务端说明',
      description: '先在电脑/VPS 上跑 hmtv（node index.js，默认 8888），再把上面「站点地址」改成那台机器的 IP:端口。' },
    { key: 'refreshCategories', type: 'action', title: '刷新分类', group: '本站维护', action: 'source' },
  ],

  settingsAction: async function (args) {
    if (args.key !== 'refreshCategories') throw new Error('未知操作');
    // 重新抓一遍 /config 与每个站点的 /home，把分类表刷新到本地缓存
    var cfg = await LumeSource.http.get(serverBase() + '/config', { headers: { 'User-Agent': UA } }).then(function (r) {
      return JSON.parse(String(r.body || '{}'));
    });
    var sites = (cfg.video && cfg.video.sites) || [];
    var table = [];
    var flat = [];
    for (var i = 0; i < sites.length; i++) {
      var key = String(sites[i].api || '').replace(/^\/spider\//, '').replace(/\/3$/, '');
      var home = {};
      try { home = await post('/spider/' + key + '/3/home', {}); } catch (e) { home = {}; }
      var classes = (home.class || []).map(function (c) { return [String(c.type_id), String(c.type_name)]; });
      table.push({ k: key, n: sites[i].name, adult: sites[i].adult ? 1 : 0, c: classes });
      if (!classes.length) flat.push([key + '|0', sites[i].name]);
      else for (var j = 0; j < classes.length; j++) flat.push([key + '|' + classes[j][0], sites[i].name + '·' + classes[j][1]]);
    }
    await writeJson('sites.json', { at: Date.now(), table: table, flat: flat });
    return { message: '已刷新：' + table.length + ' 个站点 / ' + flat.length + ' 个分类（重启源后生效）' };
  },

  async categories() {
    var cached = await readJson('sites.json');
    var flat = cached && cached.flat && cached.flat.length ? cached.flat : CATEGORIES;
    var out = [];
    for (var i = 0; i < flat.length; i++) out.push({ id: flat[i][0], title: flat[i][1] });
    return out;
  },

  async home() {
    var boards = [];
    // 用第一个站点的首页推荐当「热门」
    var first = siteOf(HOME_KEY) || SITES[0];
    if (first) {
      try {
        var home = await post('/spider/' + first.k + '/3/home', {});
        var items = (home.list || []).map(mapItem).filter(function (x) { return x.id; });
        if (items.length) {
          await remember(items);
          boards.push({ title: first.n, moreUrl: first.k + '|0', items: items.slice(0, 12) });
        }
      } catch (e) { /* 首页挂了不影响分类浏览 */ }
    }
    if (!boards.length) {
      var cats = await this.categories();
      for (var i = 0; i < cats.length && boards.length < 3; i++) {
        try {
          var page = await this.list({ categoryId: cats[i].id, page: 1 });
          if (page.items.length) boards.push({ title: cats[i].title, moreUrl: cats[i].id, items: page.items.slice(0, 12) });
        } catch (e) { /* 跳过 */ }
      }
    }
    return boards;
  },

  async list(argument) {
    var args = argument || {};
    var page = Number(args.page || 1) || 1;
    var keyword = String(args.keyword == null ? '' : args.keyword).trim();
    var categoryId = String(args.categoryId == null ? '' : args.categoryId).trim();
    if (!categoryId) {
      var cats = await this.categories();
      categoryId = cats.length ? cats[0].id : '';
    }
    var parts = categoryId.split('|');
    var key = parts[0] || '';
    var classId = parts.length > 1 ? parts[1] : '0';
    if (!key) return { items: [], hasMore: false };

    var data;
    if (keyword) {
      data = await post('/spider/' + key + '/3/search', { wd: keyword, page: page });
    } else if (!classId || classId === '0') {
      data = await post('/spider/' + key + '/3/home', {});
    } else {
      data = await post('/spider/' + key + '/3/category', { id: classId, page: page });
    }
    var rows = (data && data.list) || [];
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var mapped = mapItem(rows[i]);
      if (mapped.id) items.push(mapped);
    }
    await remember(items);
    var pagecount = Number(data && data.pagecount) || 0;
    return { items: items, hasMore: pagecount ? page < pagecount : items.length >= PAGE_SIZE };
  },

  async detail(argument) {
    var id = String((argument && argument.id) || '');
    if (!id) return null;
    var cached = (await readJson('items.json')) || { map: {} };
    var row = cached.map ? cached.map[id] : null;
    var key = String((argument && argument.categoryId) || '').split('|')[0] || (SITES[0] ? SITES[0].k : '');
    var data = null;
    try { data = await post('/spider/' + key + '/3/detail', { id: id }); } catch (e) { data = null; }
    var vod = data && data.list && data.list[0] ? data.list[0] : {};
    return {
      id: id,
      title: clean(vod.vod_name || (row && row.title) || ('作品 ' + id)),
      cover: fixUrl(vod.vod_pic || (row && row.cover) || ''),
      subtitle: clean([vod.vod_year, vod.vod_area, vod.vod_remarks].filter(Boolean).join(' · ')),
      description: clean(vod.vod_content || vod.vod_blurb || '由迷你猫源服务端代取'),
    };
  },

  async chapters(argument) {
    var args = argument || {};
    var id = String(args.id || '');
    if (!id) return [];
    var key = String(args.categoryId || '').split('|')[0] || (SITES[0] ? SITES[0].k : '');
    var out = [];
    try {
      var data = await post('/spider/' + key + '/3/detail', { id: id });
      var vod = (data && data.list && data.list[0]) || {};
      var froms = String(vod.vod_play_from || '').split('$$$');
      var groups = String(vod.vod_play_url || '').split('$$$');
      for (var g = 0; g < groups.length; g++) {
        var eps = groups[g].split('#');
        for (var e = 0; e < eps.length; e++) {
          var sep = eps[e].indexOf('$');
          var name = sep > 0 ? eps[e].slice(0, sep) : ('第' + (e + 1) + '集');
          var url = sep > 0 ? eps[e].slice(sep + 1) : eps[e];
          if (!url) continue;
          out.push({ id: 'p:' + g + ':' + e + ':' + (froms[g] || '') + ':' + url, title: (froms[g] ? froms[g] + ' ' : '') + name });
        }
      }
    } catch (e) { /* 详情失败 → 空 */ }
    if (!out.length) out.push({ id: 'p:0:0::', title: '播放' });
    return out;
  },

  async content(argument) {
    var args = argument || {};
    var box = parseChapter(String(args.chapterId || ''));
    if (!box.url) throw new Error('缺少播放地址');
    var key = String(args.categoryId || '').split('|')[0] || (SITES[0] ? SITES[0].k : '');
    // 先让服务端的 /play 把真实地址换出来（它已经处理了签名/防盗链/网盘解析）
    try {
      var played = await post('/spider/' + key + '/3/play', { id: box.url, flag: box.flag });
      var real = played && played.url ? String(played.url) : '';
      if (/^https?:\/\//i.test(real)) {
        var headers = { 'User-Agent': UA };
        var h = (played && played.header) || {};
        for (var name in h) if (Object.prototype.hasOwnProperty.call(h, name)) headers[name] = String(h[name]);
        if (!headers.Referer) headers.Referer = serverBase() + '/';
        return { kind: 'video', url: real, headers: headers };
      }
    } catch (e) { /* 换不出来就退回网页播放 */ }
    if (/\.(?:m3u8|mp4|flv|mkv|ts)(?:[?#]|$)/i.test(box.url) && /^https?:\/\//i.test(box.url)) {
      return { kind: 'video', url: box.url, headers: { 'User-Agent': UA, Referer: serverBase() + '/' } };
    }
    var page = box.url;
    if (page.charAt(0) === '/') page = serverBase() + page;
    return { kind: 'webplayer', url: page };
  },
};
