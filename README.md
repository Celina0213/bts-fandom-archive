# BTS Fandom Archive

防弹少年团（BTS / 방탄소년단）粉丝自建资料档案馆，纯静态页面，无需构建工具。

## 功能

- **成员档案**：7 名成员的角色、生日与简介
- **专辑资料**：出道至今主要专辑，支持按「正规 / 迷你 / 单曲」筛选
- **团体大事记**：2013–2025 关键节点时间线
- **资料检索**：跨成员、专辑、大事记的关键词搜索

## 目录结构

```
bts-fandom-archive/
├── css/
│   └── style.css      # 全站样式（暗紫主题，响应式）
├── js/
│   └── app.js         # 数据与渲染逻辑
├── .gitignore
├── index.html
└── README.md
```

## 使用

直接用浏览器打开 `index.html` 即可；或启动本地服务器：

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

然后访问 http://localhost:8080

## 说明

本站为粉丝非营利项目，与 BigHit Music / HYBE 无关。
