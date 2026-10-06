# ARMY Echoes - BTS Fandom Archive & Listening Lounge

> Personal Project for Web Development Course (BiUH WebTech)  
> **Live Demo:** `https://<your-username>.github.io/bts-fandom-archive/`

## 项目概述
ARMY Echoes 是一款面向 BTS 粉丝的“时空切片归档与同频听歌房” Web 应用。通过将偶像的发展时期（Era）、收录歌曲、粉丝在现实取景地的旅行打卡图文结合，构建了一个具备即时陪伴感的线上互动社区。

## 核心功能特色
1. **时空胶囊树（Era & Album Navigation）**: 多级动态联动，按时期快速索引对应时期的经典曲目。
2. **时空切片画卷（Memory Slices）**: 自动轮播与手动点选结合，呈现取景地打卡图与粉丝故事。
3. **UGC 本地持久化（Memory Upload & LocalStorage）**: 粉丝可自行上传打卡回忆与评论，数据在客户端持久化留存。
4. **同频听歌房（Listening Lounge）**: 实时模拟在线收听人数浮动与消息流互动，支持紫心粒子应援。
5. **免版权环境音频引擎（Web Audio API）**: 纯原生合成音效，随不同歌曲的主题频率自动调和。

## 技术栈与设计规范
- **HTML5**: 严格遵循语义化规范（`<header>`, `<nav>`, `<main>`, `<aside>`, `<dialog>`, `<footer>`）。
- **CSS3**: 采用深色磨砂玻璃（Glassmorphism）、Flexbox + CSS Grid 现代网格系统，全面适配移动与桌面端断点。
- **JavaScript (ES6+)**: 原生驱动，无第三方重度依赖，使用 Web Audio API 与 LocalStorage 实现零成本部署。

## 开发里程碑 (Git History)
- **Week 1**: 初始化项目目录规范，搭建基础语义化 HTML5 骨架与基准色彩变量。
- **Week 2**: 实现深色磨砂玻璃（Glassmorphism）质感，引入 CSS Grid + Flexbox 响应式布局并适配移动设备断点。
- **Week 3**: 构建结构化数据源 (data.js)，实现时期/歌曲多级联动与时空切片画卷自动轮播交互。
- **Week 4**: 添加粉丝打卡回忆上传弹窗交互，利用 LocalStorage 实现用户 UGC 切片本地持久化存储。
- **Week 5**: 完成同频听歌房聊天流与在线人数波动，接入 Web Audio API 打造免版权氛围音乐引擎。
- **Week 6**: 生产环境构建优化、安全标头配置 (vercel.json)、完善 SEO/OG 元信息并完成最终结项。
