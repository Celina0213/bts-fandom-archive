/* ==========================================================
   BTS Fandom Archive — app.js
   数据渲染 + 专辑筛选 + 资料检索 + 移动端菜单
   ========================================================== */

/* ---------- 数据：成员 ---------- */
const members = [
  { name: "金南俊", en: "RM", role: "队长 / Rapper", birth: "1994.09.12", note: "IQ 148 的智慧担当，专辑制作核心成员。" },
  { name: "金硕珍", en: "Jin", role: "Vocalist", birth: "1992.12.04", note: "大哥，以高音和综艺感著称，代表曲《Epiphany》。" },
  { name: "闵玧其", en: "SUGA", role: "Rapper / Producer", birth: "1993.03.09", note: "以 Agust D 名义活动，代表作《Daechwita》。" },
  { name: "郑号锡", en: "j-hope", role: "Dancer / Rapper", birth: "1994.02.18", note: "舞蹈担当，个人专辑《Jack In The Box》。" },
  { name: "朴智旻", en: "Jimin", role: "Dancer / Vocalist", birth: "1995.10.13", note: "现代舞出身的柔美舞者，代表曲《Filter》《Like Crazy》。" },
  { name: "金泰亨", en: "V", role: "Vocalist", birth: "1995.12.30", note: "低音嗓音独树一帜，代表曲《Singularity》《Slow Dancing》。" },
  { name: "田柾国", en: "Jung Kook", role: "Main Vocalist", birth: "1997.09.01", note: "黄金忙内，代表曲《Seven》《Standing Next to You》。" },
];

/* ---------- 数据：专辑 ---------- */
const albums = [
  { title: "2 Cool 4 Skool", date: "2013.06.12", type: "single", note: "出道单曲专辑，主打曲《No More Dream》。" },
  { title: "O!RUL8,2?", date: "2013.09.11", type: "mini", note: "首张迷你专辑，主打曲《N.O》。" },
  { title: "Skool Luv Affair", date: "2014.02.12", type: "mini", note: "青春校园三部曲收官，收录《Boy In Luv》。" },
  { title: "Dark & Wild", date: "2014.08.20", type: "studio", note: "首张正规专辑，主打曲《Danger》。" },
  { title: "The Most Beautiful Moment in Life, Pt.1", date: "2015.04.29", type: "mini", note: "花样年华系列开端，收录《I NEED U》。" },
  { title: "Wings", date: "2016.10.10", type: "studio", note: "第二张正规专辑，主打曲《Blood Sweat & Tears》。" },
  { title: "Love Yourself: Her", date: "2017.09.18", type: "mini", note: "LOVE YOURSELF 系列首部曲，收录《DNA》。" },
  { title: "Love Yourself: Tear", date: "2018.05.18", type: "studio", note: "第三张正规专辑，主打曲《Fake Love》。" },
  { title: "Map of the Soul: Persona", date: "2019.04.12", type: "mini", note: "收录《Boy With Luv (feat. Halsey)》。" },
  { title: "Map of the Soul: 7", date: "2020.02.21", type: "studio", note: "出道 7 周年纪念正规专辑，主打曲《ON》。" },
  { title: "BE", date: "2020.11.20", type: "studio", note: "疫情期间的治愈之作，主打曲《Life Goes On》。" },
  { title: "Butter / Permission to Dance", date: "2021.05.28", type: "single", note: "夏日热单《Butter》与《Permission to Dance》。" },
  { title: "Proof", date: "2022.06.10", type: "studio", note: "出道 9 周年精选辑，收录《Yet To Come》。" },
];

/* ---------- 数据：大事记 ---------- */
const timeline = [
  { year: "2013", text: "6 月 13 日，BTS 以《No More Dream》正式出道。" },
  { year: "2015", text: "「花样年华」系列开启，组合概念与叙事风格全面升级。" },
  { year: "2016", text: "正规二辑《Wings》发布，同年开启世界巡演。" },
  { year: "2017", text: "首次登上美国公告牌音乐奖（BBMAs）并获奖，国际化里程碑。" },
  { year: "2018", text: "正规三辑《Love Yourself: Tear》登顶 Billboard 200。" },
  { year: "2019", text: "巡演「Speak Yourself」登陆全球大型体育场。" },
  { year: "2020", text: "英文单曲《Dynamite》首夺 Billboard Hot 100 冠军。" },
  { year: "2022", text: "精选辑《Proof》发布；6 月 28 日成员开始履行兵役义务。" },
  { year: "2025", text: "全员退伍，宣布以完整体回归活动。" },
];

/* ---------- 工具 ---------- */
const $ = (sel) => document.querySelector(sel);
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const typeLabel = { studio: "正规专辑", mini: "迷你专辑", single: "单曲 / 特别" };

/* ---------- 渲染：成员 ---------- */
function renderMembers() {
  $("#memberGrid").innerHTML = members
    .map(
      (m) => `
      <article class="member-card">
        <p class="member-role">${escapeHtml(m.role)}</p>
        <h3 class="member-name">${escapeHtml(m.name)}</h3>
        <p class="member-en">${escapeHtml(m.en)}</p>
        <p class="member-info">
          <b>生日</b> ${escapeHtml(m.birth)}<br />
          ${escapeHtml(m.note)}
        </p>
      </article>`
    )
    .join("");
}

/* ---------- 渲染：专辑（含筛选） ---------- */
function renderAlbums(filter = "all") {
  const list = filter === "all" ? albums : albums.filter((a) => a.type === filter);
  $("#albumGrid").innerHTML = list
    .map(
      (a) => `
      <article class="album-card" data-type="${a.type}">
        <p class="album-type">${typeLabel[a.type]}</p>
        <h3 class="album-title">${escapeHtml(a.title)}</h3>
        <p class="album-date">${escapeHtml(a.date)}</p>
        <p class="album-note">${escapeHtml(a.note)}</p>
      </article>`
    )
    .join("");
}

/* ---------- 渲染：时间线 ---------- */
function renderTimeline() {
  $("#timelineList").innerHTML = timeline
    .map(
      (t) => `
      <div class="timeline-item">
        <p class="timeline-year">${escapeHtml(t.year)}</p>
        <p class="timeline-text">${escapeHtml(t.text)}</p>
      </div>`
    )
    .join("");
}

/* ---------- 检索 ---------- */
function doSearch(keyword) {
  const kw = keyword.trim().toLowerCase();
  const box = $("#searchResults");

  if (!kw) {
    box.innerHTML = `<p class="empty-tip">请输入关键词进行搜索。</p>`;
    return;
  }

  const results = [];

  members.forEach((m) => {
    const hay = `${m.name} ${m.en} ${m.role} ${m.birth} ${m.note}`.toLowerCase();
    if (hay.includes(kw)) results.push({ tag: "成员", title: `${m.name} (${m.en})`, desc: `${m.role} · ${m.birth} · ${m.note}` });
  });

  albums.forEach((a) => {
    const hay = `${a.title} ${a.date} ${a.note}`.toLowerCase();
    if (hay.includes(kw)) results.push({ tag: "专辑", title: a.title, desc: `${a.date} · ${a.note}` });
  });

  timeline.forEach((t) => {
    if (`${t.year} ${t.text}`.toLowerCase().includes(kw)) results.push({ tag: "大事记", title: t.year, desc: t.text });
  });

  box.innerHTML = results.length
    ? results
        .map(
          (r) => `
          <div class="result-card">
            <span class="result-tag">${escapeHtml(r.tag)}</span>
            <p class="result-title">${escapeHtml(r.title)}</p>
            <p class="result-desc">${escapeHtml(r.desc)}</p>
          </div>`
        )
        .join("")
    : `<p class="empty-tip">没有找到与「${escapeHtml(keyword)}」相关的内容。</p>`;
}

/* ---------- 事件绑定 ---------- */
function initEvents() {
  // 专辑筛选
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderAlbums(chip.dataset.filter);
    });
  });

  // 检索
  $("#searchBtn").addEventListener("click", () => doSearch($("#searchInput").value));
  $("#searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch(e.target.value);
  });

  // 移动端菜单
  const navLinks = $("#navLinks");
  $("#menuBtn").addEventListener("click", () => navLinks.classList.toggle("open"));
  navLinks.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => navLinks.classList.remove("open"))
  );
}

/* ---------- 初始化 ---------- */
document.addEventListener("DOMContentLoaded", () => {
  renderMembers();
  renderAlbums();
  renderTimeline();
  initEvents();
});
