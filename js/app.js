document.addEventListener("DOMContentLoaded", () => {
  let currentEraKey = "hyyh";
  let currentSongIndex = 0;
  let currentSliceIndex = 0;
  let autoSlideTimer = null;

  // 播放器状态
  const spotifyEmbedWrapper = document.getElementById("spotifyEmbedWrapper");
  const customPlayer = document.getElementById("customPlayer");
  const localPlayBtn = document.getElementById("localPlayBtn");
  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const timeLabel = document.getElementById("timeLabel");
  const lyricsBtn = document.getElementById("lyricsBtn");
  const lyricsPanel = document.getElementById("lyricsPanel");
  const qqLinkBtn = document.getElementById("qqLinkBtn");

  // 本地音源播放状态（个人使用：音频文件放 assets/music/，不入 Git 不上线）
  let audioEl = null;
  let localPlaying = false;
  const AUDIO_EXTS = ["mp3", "m4a", "flac", "wav"];

  const SLICE_STORAGE_KEY = "army_echoes_custom_slices";
  const CHAT_STORAGE_KEY = "army_echoes_chats";
  const LIKE_KEY = "army_echoes_slice_likes";
  const LIKED_KEY = "army_echoes_slice_liked";
  const COMMENTS_STORAGE_KEY = "army_echoes_slice_comments";   // 切片评论（按 sliceSid 分组）
  const GROUPS_STORAGE_KEY = "army_echoes_groups";             // 群聊数据（按 gid 分组）

  // ---------- Memory slice likes（localStorage 持久化 + BroadcastChannel 多标签同步） ----------
  function loadLikeMap() {
    try { return JSON.parse(localStorage.getItem(LIKE_KEY) || "{}"); } catch (e) { return {}; }
  }

  function saveLikeMap(m) {
    localStorage.setItem(LIKE_KEY, JSON.stringify(m));
  }

  function loadLikedSet() {
    try { return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) || "[]")); } catch (e) { return new Set(); }
  }

  // 为没有 sid 的切片生成稳定 ID（旧数据/用户上传），基于图片 URL 哈希，顺序无关
  function getSliceSid(slice, songId) {
    if (slice.sid) return slice.sid;
    let h = 0;
    const s = (slice.image || "") + "|" + (slice.author || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    slice.sid = songId + "-h" + h.toString(36);
    return slice.sid;
  }

  function likeCount(sid, base) {
    const m = loadLikeMap();
    return sid in m ? m[sid] : (base || 0);
  }

  function toggleLike(sid, base) {
    const m = loadLikeMap();
    const liked = loadLikedSet();
    if (liked.has(sid)) {
      m[sid] = Math.max(likeCount(sid, base) - 1, 0);
      liked.delete(sid);
    } else {
      m[sid] = likeCount(sid, base) + 1;
      liked.add(sid);
    }
    saveLikeMap(m);
    localStorage.setItem(LIKED_KEY, JSON.stringify([...liked]));
    return m[sid];
  }

  // ---------- 切片评论系统（localStorage 持久化 + BroadcastChannel 多标签同步） ----------
  function loadComments() {
    try { return JSON.parse(localStorage.getItem(COMMENTS_STORAGE_KEY) || "{}"); } catch (e) { return {}; }
  }

  function saveComments(comments) {
    localStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(comments));
  }

  // 获取某个切片的所有评论
  function getSliceComments(sliceSid) {
    const all = loadComments();
    return all[sliceSid] || [];
  }

  // 发表评论到指定切片
  function postComment(sliceSid, text, replyTo = null) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const comment = {
      _cid: Date.now() + "-" + CLIENT_ID,
      user: (myProfile && myProfile.nick) || "GuestARMY",
      ip: myProfile ? myProfile.ip : "Unknown",
      text: text,
      time: timeStr,
      replyTo: replyTo,
      mine: true
    };
    const all = loadComments();
    if (!all[sliceSid]) all[sliceSid] = [];
    all[sliceSid].push(comment);
    saveComments(all);
    if (bc) bc.postMessage({ type: "comment", sliceSid, comment });
    return comment;
  }

  // ---------- 群聊系统（发布者邀请评论者入群，群内实时聊天 + 在线状态） ----------
  let activeGroup = null;   // 当前打开的群聊对象

  function loadGroups() {
    try { return JSON.parse(localStorage.getItem(GROUPS_STORAGE_KEY) || "{}"); } catch (e) { return {}; }
  }

  function saveGroups(groups) {
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
  }

  // 创建新群（发布者调用）
  function createGroup(sliceSid, sliceAuthor, inviteeName) {
    const gid = "grp-" + Date.now().toString(36);
    const group = {
      gid: gid,
      name: `${sliceAuthor}'s Discussion`,
      createdBy: sliceAuthor,
      createdForSlice: sliceSid,
      members: [sliceAuthor, inviteeName],
      memberPresence: {},  // { userName: lastActiveTimestamp }
      messages: []
    };
    // 加入自己（如果自己不是发布者）
    if (myProfile && myProfile.nick !== sliceAuthor && !group.members.includes(myProfile.nick)) {
      group.members.push(myProfile.nick);
    }
    const groups = loadGroups();
    groups[gid] = group;
    saveGroups(groups);
    // 标记在线
    updateGroupPresence(gid);
    if (bc) bc.postMessage({ type: "group-create", group });
    return group;
  }

  // 邀请新成员加入已有群
  function inviteToGroup(gid, newMember) {
    const groups = loadGroups();
    const g = groups[gid];
    if (!g || g.members.includes(newMember)) return false;
    g.members.push(newMember);
    saveGroups(groups);
    if (bc) bc.postMessage({ type: "group-invite", gid, member: newMember });
    return true;
  }

  // 更新自己在群内的在线状态
  function updateGroupPresence(gid) {
    if (!myProfile || !myProfile.nick) return;
    const groups = loadGroups();
    const g = groups[gid];
    if (!g) return;
    if (!g.memberPresence) g.memberPresence = {};
    g.memberPresence[myProfile.nick] = Date.now();
    saveGroups(groups);
  }

  // 发送群消息
  function sendGroupMessage(gid, text) {
    if (!myProfile) return null;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const msg = {
      _gmid: Date.now() + "-" + CLIENT_ID,
      user: myProfile.nick,
      ip: myProfile.ip,
      text: text,
      time: timeStr,
      mine: true
    };
    const groups = loadGroups();
    const g = groups[gid];
    if (!g) return null;
    g.messages.push(msg);
    updateGroupPresence(gid);
    saveGroups(groups);
    if (bc) bc.postMessage({ type: "group-msg", gid, msg });
    return msg;
  }

  // 清理超过30秒未活跃的群成员离线标记
  function cleanupGroupPresence() {
    const groups = loadGroups();
    const now = Date.now();
    let changed = false;
    for (const gid in groups) {
      const g = groups[gid];
      if (!g.memberPresence) continue;
      for (const name in g.memberPresence) {
        if (now - g.memberPresence[name] > 30000) {
          delete g.memberPresence[name];
          changed = true;
        }
      }
    }
    if (changed) saveGroups(groups);
  }

  // 读取本地存储
  function loadCustomData() {
    try {
      const storedSlices = localStorage.getItem(SLICE_STORAGE_KEY);
      if (storedSlices) {
        const customData = JSON.parse(storedSlices);
        Object.keys(customData).forEach(songId => {
          for (const era in ARCHIVE_DATA) {
            const song = ARCHIVE_DATA[era].songs.find(s => s.id === songId);
            if (song) song.slices = [...customData[songId], ...song.slices];
          }
        });
      }

      // 初始化聊天列表
      for (const era in ARCHIVE_DATA) {
        ARCHIVE_DATA[era].songs.forEach(song => {
          if (!song.chats) {
            song.chats = [
              { user: "PurpleARMY_07", ip: "Overseas", text: "The intro hits and I'm right back in that winter 💜", time: "18:20" },
              { user: "BusanBoy", ip: "Overseas", text: "Hope we can all meet again in Seoul someday!", time: "19:05" }
            ];
          }
        });
      }

      const storedChats = localStorage.getItem(CHAT_STORAGE_KEY);
      if (storedChats) {
        const chatData = JSON.parse(storedChats);
        Object.keys(chatData).forEach(songId => {
          for (const era in ARCHIVE_DATA) {
            const song = ARCHIVE_DATA[era].songs.find(s => s.id === songId);
            if (song) song.chats = [...song.chats, ...chatData[songId]];
          }
        });
      }
    } catch (e) {
      console.error("Storage load error:", e);
    }
  }

  loadCustomData();

  // ---------- 登录资料 + 同频房在线状态（本机模拟：多标签页互通，无后端） ----------
  const PROFILE_KEY = "army_echoes_profile";
  const CLIENT_ID = Math.random().toString(36).slice(2, 10);
  const STATUS_OPTIONS = ["Listening", "Sleeping", "Studying", "Eating", "Slacking off", "Daydreaming"];
  const IP_OPTIONS = ["Beijing", "Shanghai", "Guangdong", "Taipei", "Hong Kong", "Seoul", "Busan", "Tokyo", "Los Angeles", "New York", "London", "Paris", "Bangkok", "Singapore", "Overseas"];
  const SIM_REPLIES = [
    "Sending you a hug, everything will be okay 💜",
    "Same here! This song is forever a masterpiece",
    "Your story just healed something in me too",
    "Welcome to the lounge, let's keep listening together",
    "Wishing you the sweetest dreams tonight 🌙",
    "Yesss congrats, that's amazing! 🎉",
    "Let's go, you've got this today!",
    "You're not the only one still awake at this hour haha"
  ];

  const liveStatusText = document.getElementById("liveStatusText");
  const profileChip = document.getElementById("profileChip");
  const profileModal = document.getElementById("profileModal");
  const profileForm = document.getElementById("profileForm");
  const profileNickInput = document.getElementById("profileNickInput");
  const profileIpSelect = document.getElementById("profileIpSelect");
  const profileStatusSelect = document.getElementById("profileStatusSelect");
  const cancelProfileBtn = document.getElementById("cancelProfileBtn");
  const closeProfileBtn = document.getElementById("closeProfileBtn");
  const replyIndicator = document.getElementById("replyIndicator");
  const replyTargetName = document.getElementById("replyTargetName");
  const cancelReplyBtn = document.getElementById("cancelReplyBtn");

  let myProfile = null;      // 当前登录用户 {nick, ip, status}
  let simListeners = [];     // 模拟的同频听众
  let replyTarget = null;    // 正在回复的消息
  const peers = new Map();   // 其他标签页的在线用户
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("army_echoes_lounge") : null;

  function saveProfile(p) {
    myProfile = p;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  }

  function applyProfileUI() {
    const avatar = document.getElementById("profileAvatar");
    const name = document.getElementById("profileName");
    const sub = document.getElementById("profileSub");
    if (myProfile && myProfile.nick) {
      avatar.textContent = myProfile.nick.trim().charAt(0).toUpperCase();
      name.textContent = myProfile.nick;
      sub.textContent = `IP ${myProfile.ip} · ${myProfile.status}`;
    } else {
      avatar.textContent = "?";
      name.textContent = "Guest";
      sub.textContent = "Tap to set up profile";
    }
  }

  function persistChat(songId, msg) {
    let storedChats = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "{}");
    if (!storedChats[songId]) storedChats[songId] = [];
    storedChats[songId].push(msg);
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(storedChats));
  }

  function seedSimListeners() {
    const SIM_NAMES = ["PurpleARMY", "BusanBoy", "Seoul_Glow", "Mochi糖糖", "JK兔", "HopeWorld_HD", "Suga式微笑", "Jin世界帅", "Bora_紫", "Ulsan少女", "Moonchild_月", "Epilogue_7", "SpringDay风", "Fire_燃烧", "Dna_螺旋", "IDOL灯光"];
    const n = 26 + Math.floor(Math.random() * 20);
    simListeners = Array.from({ length: n }, () => ({
      user: SIM_NAMES[Math.floor(Math.random() * SIM_NAMES.length)] + "_" + Math.floor(Math.random() * 90 + 10),
      ip: IP_OPTIONS[Math.floor(Math.random() * IP_OPTIONS.length)],
      status: STATUS_OPTIONS[Math.floor(Math.random() * STATUS_OPTIONS.length)]
    }));
  }

  // 歌曲上方的实时状态条：正在听这首歌的人数 + 状态分布
  function renderLiveStatus() {
    const all = [...simListeners];
    if (myProfile && myProfile.nick) all.push({ status: myProfile.status });
    peers.forEach(p => { if (p.profile && p.profile.status) all.push(p.profile); });
    const counts = {};
    all.forEach(u => { counts[u.status] = (counts[u.status] || 0) + 1; });
    const parts = Object.keys(counts).filter(s => counts[s] > 0).map(s => `${s} ${counts[s]}人`).join(" · ");
    liveStatusText.textContent = `🎧 Now listening to "${getActiveSong().title}" — ${all.length} fans · ${parts}`;
    listenerBadge.textContent = all.length;
  }

  function broadcastPresence() {
    if (bc) bc.postMessage({ type: "presence", id: CLIENT_ID, profile: myProfile, ts: Date.now() });
  }

  if (bc) {
    bc.onmessage = (e) => {
      const d = e.data;
      if (!d) return;
      if (d.type === "presence" && d.id !== CLIENT_ID) {
        peers.set(d.id, { profile: d.profile, ts: d.ts });
        renderLiveStatus();
        // 新听众加入 → 其状态队伍走一步棋
        derbyMoveFor(d.profile && d.profile.status);
      } else if (d.type === "chat" && d.songId && d.msg) {
        for (const era in ARCHIVE_DATA) {
          const s = ARCHIVE_DATA[era].songs.find(x => x.id === d.songId);
          if (s && s.chats && !s.chats.some(c => c._mid === d.msg._mid)) s.chats.push(d.msg);
        }
        persistChat(d.songId, d.msg);
        if (d.songId === getActiveSong().id) renderChats();
      } else if (d.type === "like" && d.sid) {
        const m = loadLikeMap();
        m[d.sid] = d.count;
        saveLikeMap(m);
        const song = getActiveSong();
        const slices = song.slices;
        if (slices && slices.length) {
          const cur = slices[currentSliceIndex % slices.length];
          if (getSliceSid(cur, song.id) === d.sid) {
            sliceLikeCount.textContent = d.count;
            sliceLikeBtn.classList.toggle("liked", loadLikedSet().has(d.sid));
          }
        }
      } else if (d.type === "comment" && d.sliceSid && d.comment) {
        // 同步评论到其他标签页
        const allCmts = loadComments();
        if (!allCmts[d.sliceSid]) allCmts[d.sliceSid] = [];
        if (!allCmts[d.sliceSid].some(c => c._cid === d.comment._cid)) {
          allCmts[d.sliceSid].push(d.comment);
          saveComments(allCmts);
        }
        // 实时刷新切片下方评论面板
        renderSliceCommentsPanel();
        updateSliceCommentsBadge();
      } else if (d.type === "group-create" && d.group) {
        const groups = loadGroups();
        groups[d.group.gid] = d.group;
        saveGroups(groups);
        if (activeGroup && activeGroup.gid === d.group.gid) {
          activeGroup = d.group;
          renderGroupChatUI();
        }
      } else if (d.type === "group-invite" && d.gid && d.member) {
        const groups = loadGroups();
        const g = groups[d.gid];
        if (g && !g.members.includes(d.member)) {
          g.members.push(d.member);
          saveGroups(groups);
          if (activeGroup && activeGroup.gid === d.gid) {
            activeGroup = g;
            renderGroupMembers();
          }
        }
      } else if (d.type === "derby" && d.state) {
        // 其他标签页同步赛马棋状态
        applyRemoteDerby(d.state);
      } else if (d.type === "group-msg" && d.gid && d.msg) {
        const groups = loadGroups();
        const g = groups[d.gid];
        if (g) {
          if (!g.messages.some(m => m._gmid === d.msg._gmid)) {
            g.messages.push(d.msg);
            saveGroups(groups);
            if (activeGroup && activeGroup.gid === d.gid) {
              activeGroup = g;
              renderGroupMessages();
            }
          }
        }
      }
    };
    // 心跳：广播自己的在线状态，清理超过 15 秒未活跃的标签页
    setInterval(() => {
      broadcastPresence();
      const now = Date.now();
      for (const [id, p] of peers) if (now - p.ts > 15000) peers.delete(id);
      renderLiveStatus();
    }, 5000);
  }

  // 模拟用户状态缓慢变化，让分布"活"起来
  setInterval(() => {
    for (let i = 0; i < 4; i++) {
      const u = simListeners[Math.floor(Math.random() * simListeners.length)];
      if (u) u.status = STATUS_OPTIONS[Math.floor(Math.random() * STATUS_OPTIONS.length)];
    }
    renderLiveStatus();
  }, 7000);

  function openProfileModal() {
    if (myProfile) {
      profileNickInput.value = myProfile.nick || "";
      profileIpSelect.value = myProfile.ip || IP_OPTIONS[0];
      profileStatusSelect.value = myProfile.status || STATUS_OPTIONS[0];
    }
    profileModal.showModal();
  }

  function initProfileFeature() {
    profileIpSelect.innerHTML = IP_OPTIONS.map(ip => `<option value="${ip}">${ip}</option>`).join("");
    profileStatusSelect.innerHTML = STATUS_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join("");
    loadProfile();
    applyProfileUI();
    seedSimListeners();
    renderLiveStatus();
    profileChip.addEventListener("click", openProfileModal);
    const closeProfile = () => profileModal.close();
    closeProfileBtn.addEventListener("click", closeProfile);
    cancelProfileBtn.addEventListener("click", closeProfile);
    profileForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saveProfile({
        nick: profileNickInput.value.trim() || "游客ARMY",
        ip: profileIpSelect.value,
        status: profileStatusSelect.value
      });
      applyProfileUI();
      renderLiveStatus();
      broadcastPresence();
      profileModal.close();
    });
    if (!myProfile) openProfileModal(); // 首次访问自动弹出"登录"
  }

  function loadProfile() {
    try { myProfile = JSON.parse(localStorage.getItem(PROFILE_KEY)) || null; } catch (e) { myProfile = null; }
  }

  // 模拟同频房其他用户回复你刚发的消息
  function scheduleSimReplies(songId, myMsg) {
    const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const u = simListeners[Math.floor(Math.random() * simListeners.length)];
        if (!u) return;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const reply = {
          _mid: Date.now() + "-sim-" + i + "-" + CLIENT_ID,
          user: u.user,
          ip: u.ip,
          status: u.status,
          mine: false,
          text: SIM_REPLIES[Math.floor(Math.random() * SIM_REPLIES.length)],
          time: timeStr,
          replyTo: { user: myMsg.user, text: myMsg.text.slice(0, 30) }
        };
        for (const era in ARCHIVE_DATA) {
          const s = ARCHIVE_DATA[era].songs.find(x => x.id === songId);
          if (s && s.chats) s.chats.push(reply);
        }
        persistChat(songId, reply);
        if (bc) bc.postMessage({ type: "chat", songId, msg: reply });
        if (songId === getActiveSong().id) renderChats();
      }, 2500 + Math.random() * 5000);
    }
  }

  // DOM 节点引用
  const eraList = document.getElementById("eraList");
  const songList = document.getElementById("songList");
  const sidebarTitle = document.getElementById("sidebarTitle");

  const tabSliceBtn = document.getElementById("tabSliceBtn");
  const tabChatBtn = document.getElementById("tabChatBtn");
  const sliceContainer = document.getElementById("sliceContainer");
  const chatContainer = document.getElementById("chatContainer");

  const sliceImg = document.getElementById("sliceImg");
  const sliceLocation = document.getElementById("sliceLocation");
  const sliceCaption = document.getElementById("sliceCaption");
  const sliceAuthor = document.getElementById("sliceAuthor");
  const sliceIndicators = document.getElementById("sliceIndicators");
  const sliceLikeBtn = document.getElementById("sliceLikeBtn");
  const sliceLikeCount = document.getElementById("sliceLikeCount");

  const chatBox = document.getElementById("chatBox");
  const lyricsBg = document.getElementById("lyricsBg");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const listenerBadge = document.getElementById("listenerBadge");
  const cheerBtn = document.getElementById("cheerBtn");
  const cheerCount = document.getElementById("cheerCount");

  const playerTitle = document.getElementById("playerTitle");
  const playerMeta = document.getElementById("playerMeta");
  const playBtn = document.getElementById("playBtn");
  const audioStatus = document.getElementById("audioStatus");

  const uploadModal = document.getElementById("uploadModal");
  const openUploadBtn = document.getElementById("openUploadBtn");
  const closeUploadBtn = document.getElementById("closeUploadBtn");
  const cancelUploadBtn = document.getElementById("cancelUploadBtn");
  const uploadForm = document.getElementById("uploadForm");

  // Slice comments panel
  const sliceCommentsBadge = document.getElementById("sliceCommentsBadge");
  const sliceCommentsPanel = document.getElementById("sliceCommentsPanel");
  const sliceCommentsCount = document.getElementById("sliceCommentsCount");
  const sliceCommentsList = document.getElementById("sliceCommentsList");
  const sliceCommentForm = document.getElementById("sliceCommentForm");
  const sliceCommentInput = document.getElementById("sliceCommentInput");

  // Group chat
  const groupChatModal = document.getElementById("groupChatModal");
  const groupChatTitle = document.getElementById("groupChatTitle");
  const closeGroupChatBtn = document.getElementById("closeGroupChatBtn");
  const groupChatBox = document.getElementById("groupChatBox");
  const groupChatForm = document.getElementById("groupChatForm");
  const groupChatInput = document.getElementById("groupChatInput");
  const groupMembersBar = document.getElementById("groupMembersBar");

  // Status Derby（状态赛马棋）
  const tabDerbyBtn = document.getElementById("tabDerbyBtn");
  const derbyContainer = document.getElementById("derbyContainer");
  const derbyBoard = document.getElementById("derbyBoard");
  const derbyWinner = document.getElementById("derbyWinner");
  const derbyWinnerEmoji = document.getElementById("derbyWinnerEmoji");
  const derbyWinnerName = document.getElementById("derbyWinnerName");
  const derbyCountdown = document.getElementById("derbyCountdown");
  const derbyLastWinner = document.getElementById("derbyLastWinner");
  const derbyRaceNo = document.getElementById("derbyRaceNo");
  const derbyStepsLabel = document.getElementById("derbyStepsLabel");

  function getActiveSong() {
    return ARCHIVE_DATA[currentEraKey].songs[currentSongIndex];
  }

  function renderEras() {
    eraList.innerHTML = Object.keys(ARCHIVE_DATA).map(key => {
      const era = ARCHIVE_DATA[key];
      const activeClass = key === currentEraKey ? "active" : "";
      return `<li><button class="${activeClass}" data-era="${key}">${era.name}</button></li>`;
    }).join("");
  }

  function renderSongs() {
    const era = ARCHIVE_DATA[currentEraKey];
    sidebarTitle.textContent = `${era.name} · Tracks`;
    songList.innerHTML = era.songs.map((song, idx) => {
      const activeClass = idx === currentSongIndex ? "active" : "";
      return `
        <li class="${activeClass}" data-idx="${idx}">
          <span>🎵 ${song.title}</span>
          <small>${song.duration}</small>
        </li>
      `;
    }).join("");
  }

  function renderSlice() {
    const song = getActiveSong();
    const slices = song.slices;
    if (!slices || slices.length === 0) {
      sliceImg.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1000";
      sliceLocation.textContent = "No memories pinned yet";
      sliceCaption.textContent = "This song is still waiting for the first ARMY to share a memory.";
      sliceAuthor.textContent = "by ARMY";
      sliceIndicators.innerHTML = "";
      sliceLikeBtn.hidden = true;
      sliceCommentsPanel.hidden = true;
      sliceCommentsBadge.hidden = true;
      return;
    }

    const current = slices[currentSliceIndex % slices.length];
    // 图源失效时自动回退到默认城市夜景，避免出现裂图
    sliceImg.onerror = () => {
      sliceImg.onerror = null; // 防止回退图也失效时死循环
      sliceImg.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1000";
    };
    sliceImg.src = current.image;
    sliceLocation.textContent = current.location;
    sliceCaption.textContent = current.caption;
    sliceAuthor.textContent = `by ${current.author}`;

    sliceIndicators.innerHTML = slices.map((_, i) => `
      <span class="indicator-dot ${i === (currentSliceIndex % slices.length) ? 'active' : ''}"></span>
    `).join("");

    // 点赞状态
    const sid = getSliceSid(current, song.id);
    sliceLikeBtn.hidden = false;
    sliceLikeCount.textContent = likeCount(sid, current.likes);
    sliceLikeBtn.classList.toggle("liked", loadLikedSet().has(sid));

    // 评论状态徽章 + 切片下方评论面板
    updateSliceCommentsBadge();
    renderSliceCommentsPanel();

    playerTitle.textContent = song.title;
    playerMeta.textContent = song.album;
  }

  function renderChats() {
    const song = getActiveSong();
    chatBox.innerHTML = (song.chats || []).map((chat, i) => {
      const avatar = escapeText((chat.user || "?").trim().charAt(0).toUpperCase());
      const status = chat.status ? ` · ${escapeText(chat.status)}` : "";
      const ipLine = chat.ip
        ? `<span class="msg-ip">📍IP ${escapeText(chat.ip)}${status}</span>`
        : "";
      const replyHtml = chat.replyTo
        ? `<div class="reply-quote">↩ Replying to @${escapeText(chat.replyTo.user)}: ${escapeText(chat.replyTo.text)}</div>`
        : "";
      const replyBtn = chat.mine
        ? ""
        : `<button type="button" class="reply-btn" data-idx="${i}">Reply</button>`;
      return `
        <div class="chat-msg${chat.mine ? " mine" : ""}">
          <div class="msg-avatar">${avatar}</div>
          <div class="msg-body">
            <div class="msg-sender">${escapeText(chat.user)}<span class="time-stamp">${escapeText(chat.time)}</span></div>
            <div class="msg-bubble">${replyHtml}<div class="user-text">${escapeText(chat.text)}</div></div>
            <div class="msg-footer">${ipLine}${replyBtn}</div>
          </div>
        </div>
      `;
    }).join("");
    chatBox.scrollTop = chatBox.scrollHeight;
    renderLiveStatus();
    updateLyricsBackground(song);
  }

  // ---------- 切片评论：直接显示在切片下方 ----------
  let commentReplyTarget = null; // 当前正在回复的评论 {user, text, _cid}

  // 找到或创建某切片的讨论群（发布者邀请评论者时调用）
  function findOrCreateGroup(sliceSid, sliceAuthor, inviteeName) {
    const groups = loadGroups();
    let group = Object.values(groups).find(g =>
      g.createdForSlice === sliceSid && g.createdBy === sliceAuthor
    );
    if (group) {
      inviteToGroup(group.gid, inviteeName);
    } else {
      group = createGroup(sliceSid, sliceAuthor, inviteeName);
    }
    return group;
  }

  // 渲染当前切片下方的评论面板
  function renderSliceCommentsPanel() {
    const song = getActiveSong();
    const slices = song.slices || [];
    if (!slices.length) { sliceCommentsPanel.hidden = true; return; }
    const current = slices[currentSliceIndex % slices.length];
    const sid = getSliceSid(current, song.id);
    const comments = getSliceComments(sid);
    const isPublisher = myProfile && myProfile.nick === current.author;

    sliceCommentsPanel.hidden = false;
    sliceCommentsCount.textContent = comments.length;

    // 发布者关闭了评论
    if (current.commentsAllowed === false) {
      sliceCommentsList.innerHTML = `<p class="no-comments-yet">🔒 The publisher disabled comments on this memory.</p>`;
      sliceCommentForm.style.display = "none";
      return;
    }
    sliceCommentForm.style.display = "flex";

    if (comments.length === 0) {
      sliceCommentsList.innerHTML = `<p class="no-comments-yet">No comments yet. Be the first to share!</p>`;
    } else {
      sliceCommentsList.innerHTML = comments.map((c, i) => {
        const avatar = escapeText((c.user || "?").trim().charAt(0).toUpperCase());
        const replyHtml = c.replyTo
          ? `<div class="fp-quote">↩ <b>@${escapeText(c.replyTo.user)}</b>: ${escapeText(c.replyTo.text)}</div>`
          : "";
        // 只有发布者能拉人进群
        const inviteBtn = isPublisher && !c.mine
          ? `<button type="button" class="invite-btn" data-invite-user="${escapeText(c.user)}">+ Invite to Group</button>`
          : "";
        const replyBtn = !c.mine
          ? `<button type="button" class="reply-btn c-reply-btn" data-cidx="${i}">Reply</button>`
          : "";
        return `
          <article class="forum-post${c.mine ? " fp-mine" : ""}">
            <div class="fp-avatar">${avatar}</div>
            <div class="fp-main">
              <header class="fp-head">
                <span class="fp-user">${escapeText(c.user)}</span>
                <span class="fp-floor">#${i + 1}</span>
                <span class="fp-time">${escapeText(c.time)}</span>
              </header>
              <div class="fp-content">${replyHtml}<p>${escapeText(c.text)}</p></div>
              <footer class="fp-actions">${inviteBtn}<span class="fp-ip">📍${escapeText(c.ip)}</span>${replyBtn}</footer>
            </div>
          </article>`;
      }).join("");
    }

    sliceCommentInput.placeholder = commentReplyTarget
      ? `Replying to @${commentReplyTarget.user}...`
      : "Share your thoughts on this memory...";
  }

  // 评论面板事件（事件委托，只绑定一次）
  sliceCommentForm.addEventListener("submit", e => {
    e.preventDefault();
    const song = getActiveSong();
    const slices = song.slices || [];
    if (!slices.length) return;
    const current = slices[currentSliceIndex % slices.length];
    if (current.commentsAllowed === false) return;
    const text = sliceCommentInput.value.trim();
    if (!text) return;
    postComment(getSliceSid(current, song.id), text, commentReplyTarget);
    commentReplyTarget = null;
    sliceCommentInput.value = "";
    renderSliceCommentsPanel();
  });

  sliceCommentsList.addEventListener("click", e => {
    const song = getActiveSong();
    const slices = song.slices || [];
    if (!slices.length) return;
    const current = slices[currentSliceIndex % slices.length];
    const sid = getSliceSid(current, song.id);

    // 回复评论
    const replyBtn = e.target.closest(".c-reply-btn");
    if (replyBtn) {
      const comments = getSliceComments(sid);
      const target = comments[parseInt(replyBtn.dataset.cidx, 10)];
      if (target) {
        commentReplyTarget = { user: target.user, text: target.text.slice(0, 40), _cid: target._cid };
        renderSliceCommentsPanel();
        sliceCommentInput.focus();
      }
      return;
    }

    // 发布者邀请评论者入群
    const inviteBtn = e.target.closest(".invite-btn");
    if (inviteBtn) {
      const invitee = inviteBtn.dataset.inviteUser;
      const group = findOrCreateGroup(sid, current.author, invitee);
      inviteBtn.textContent = "✓ Invited";
      inviteBtn.disabled = true;
      openGroupChat(group.gid);
    }
  });

  // （群聊入口：发布者在切片评论旁点"+ Invite to Group"直接弹出群聊窗口）

  // 更新切片视图上的评论数徽章
  function updateSliceCommentsBadge() {
    const song = getActiveSong();
    const slices = song.slices || [];
    if (!slices.length) { sliceCommentsBadge.hidden = true; return; }
    const current = slices[currentSliceIndex % slices.length];
    const sid = getSliceSid(current, song.id);

    if (current.commentsAllowed === false) {
      sliceCommentsBadge.textContent = "💬 Comments off";
      sliceCommentsBadge.classList.add("comments-off");
      sliceCommentsBadge.hidden = false;
    } else {
      const count = getSliceComments(sid).length;
      if (count > 0) {
        sliceCommentsBadge.textContent = `💬 ${count} comments`;
        sliceCommentsBadge.classList.remove("comments-off");
        sliceCommentsBadge.hidden = false;
      } else {
        sliceCommentsBadge.hidden = true;
      }
    }
  }

  // ---------- 群聊渲染 ----------
  function openGroupChat(gid) {
    const groups = loadGroups();
    const g = groups[gid];
    if (!g) return;
    activeGroup = g;
    groupChatTitle.textContent = g.name + ` (${g.members.length} members)`;
    updateGroupPresence(gid);
    renderGroupChatUI();
    groupChatModal.showModal();
    // 心跳：每5秒更新在线状态
    if (!window._groupHeartbeat) {
      window._groupHeartbeat = setInterval(() => {
        if (activeGroup) {
          updateGroupPresence(activeGroup.gid);
          cleanupGroupPresence();
          renderGroupMembers();
        }
      }, 5000);
    }
  }

  function closeGroupChat() {
    activeGroup = null;
    groupChatModal.close();
    if (window._groupHeartbeat) {
      clearInterval(window._groupHeartbeat);
      window._groupHeartbeat = null;
    }
  }

  function renderGroupChatUI() {
    if (!activeGroup) return;
    renderGroupMessages();
    renderGroupMembers();
  }

  function renderGroupMessages() {
    if (!activeGroup) return;
    groupChatBox.innerHTML = (activeGroup.messages || []).map(msg => {
      const avatar = escapeText((msg.user || "?").trim().charAt(0).toUpperCase());
      const isMine = msg.user === (myProfile && myProfile.nick);
      return `
        <div class="chat-msg${isMine ? " mine" : ""}">
          <div class="msg-avatar">${avatar}</div>
          <div class="msg-body">
            <div class="msg-sender">${escapeText(msg.user)}<span class="time-stamp">${escapeText(msg.time)}</span></div>
            <div class="msg-bubble"><div class="user-text">${escapeText(msg.text)}</div></div>
          </div>
        </div>`;
    }).join("");
    groupChatBox.scrollTop = groupChatBox.scrollHeight;
  }

  function renderGroupMembers() {
    if (!activeGroup) return;
    const now = Date.now();
    const presence = activeGroup.memberPresence || {};
    groupMembersBar.innerHTML = activeGroup.members.map(name => {
      const isOnline = presence[name] && (now - presence[name]) < 30000;
      const avatar = name.trim().charAt(0).toUpperCase();
      return `
        <div class="group-member${isOnline ? " online" : ""}" title="${isOnline ? 'Online' : 'Offline'} — ${name}">
          <span class="member-avatar">${avatar}</span>
          <span class="member-name">${escapeText(name)}</span>
          <span class="member-dot"></span>
        </div>`;
    }).join("");
  }

  // Spotify Embed 播放器（替代 Web Audio 合成音）
  // 可达性探测：浏览器对加载失败的 iframe 也会触发 load 事件，无法直接检测，
  // 因此先加载 Spotify favicon 图片探测网络连通性，不通时直接走 iTunes 回退
  function checkSpotifyReachable() {
    return new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => {
        img.src = "";
        resolve(false);
      }, 3000);
      img.onload = () => {
        clearTimeout(timer);
        resolve(true);
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      img.src = `https://open.spotify.com/favicon.ico?t=${Date.now()}`;
    });
  }

  function loadSpotifyEmbed(spotifyId) {
    spotifyEmbedWrapper.innerHTML = `
      <iframe
        style="border-radius:12px"
        src="https://open.spotify.com/embed/track/${spotifyId}?utm_source=generator&theme=0"
        width="100%"
        height="80"
        frameBorder="0"
        allowfullscreen=""
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        title="Spotify Player"
      ></iframe>
    `;
  }

  // iTunes Search API 回退：按歌名动态搜索 30 秒官方试听（免费、无需密钥）
  async function loadItunesPreview(song, fromFallback = false) {
    spotifyEmbedWrapper.innerHTML = '<p class="spotify-fallback">🎵 Loading audio...</p>';
    try {
      const term = encodeURIComponent(`BTS ${song.title.replace(/\s*\(.*\)$/, "")}`);
      const res = await fetch(`https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=10`);
      const data = await res.json();
      const hit = data.results.find(r => r.artistName === "BTS") || data.results[0];
      if (hit && hit.previewUrl) {
        const label = fromFallback
          ? "🎧 30s preview · iTunes (Spotify unreachable, switched automatically)"
          : "🎧 30s preview · iTunes";
        spotifyEmbedWrapper.innerHTML = `
          <div class="itunes-fallback">
            <span class="itunes-label">${label}</span>
            <audio controls preload="none" src="${hit.previewUrl}"></audio>
          </div>
        `;
        return;
      }
    } catch (e) {
      console.error("iTunes search error:", e);
    }
    spotifyEmbedWrapper.innerHTML = '<p class="spotify-fallback">🎵 No audio source available for this track</p>';
  }

  // 网易云音乐外链播放器（国内直接可用，官方外链功能）
  function loadNeteaseEmbed(neteaseId) {
    spotifyEmbedWrapper.innerHTML = `
      <iframe
        frameborder="no"
        border="0"
        marginwidth="0"
        marginheight="0"
        width="100%"
        height="86"
        src="https://music.163.com/outchain/player?type=2&id=${neteaseId}&auto=0&height=66"
        title="NetEase Player"
      ></iframe>
    `;
  }

  // ---------- 本地音源自定义播放器（个人使用，文件不入库不上线） ----------
  function probeOne(src) {
    return new Promise((resolve) => {
      const probe = new Audio();
      const timer = setTimeout(() => { cleanup(); resolve(null); }, 2500);
      const cleanup = () => {
        clearTimeout(timer);
        probe.removeEventListener("canplay", onOk);
        probe.removeEventListener("error", onErr);
      };
      const onOk = () => { cleanup(); resolve(src); };
      const onErr = () => { cleanup(); resolve(null); };
      probe.addEventListener("canplay", onOk);
      probe.addEventListener("error", onErr);
      probe.preload = "metadata";
      probe.src = src;
    });
  }

  async function probeLocalAudio(song) {
    // 并行探测所有扩展名，总耗时上限为单个探测超时（2.5s），而不是串行累加
    const results = await Promise.all(
      AUDIO_EXTS.map((ext) => probeOne(`assets/music/${song.id}.${ext}`))
    );
    return results.find(Boolean) || null;
  }

  function fmtTime(sec) {
    if (!isFinite(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function showCustomPlayer(src) {
    if (audioEl) audioEl.pause();
    audioEl = new Audio(src);
    localPlaying = false;
    localPlayBtn.textContent = "▶";
    progressBar.style.width = "0%";
    timeLabel.textContent = "00:00 / 00:00";
    // 先隐藏，等音频元数据加载成功后才显示（防止出现无法播放的空播放条）
    customPlayer.hidden = true;
    spotifyEmbedWrapper.hidden = true;
    qqLinkBtn.hidden = true;

    // 元数据加载完成后立即显示总时长（修复总时长一直 00:00 的问题）
    let scanningDuration = false;
    audioEl.addEventListener("loadedmetadata", () => {
      customPlayer.hidden = false; // 音频确认可播放，才显示播放条
      // 部分浏览器对无 Xing 头的 mp3 会把 duration 报成 Infinity，
      // 导致进度百分比永远为 0、进度条不动。跳跃到极大时间强制浏览器扫描全文件计算真实时长。
      if (audioEl.duration === Infinity) {
        scanningDuration = true;
        audioEl.currentTime = 1e101;
        audioEl.addEventListener("timeupdate", function scanDur() {
          audioEl.removeEventListener("timeupdate", scanDur);
          audioEl.currentTime = 0;
          scanningDuration = false;
          timeLabel.textContent = `00:00 / ${fmtTime(audioEl.duration)}`;
        });
        return;
      }
      timeLabel.textContent = `00:00 / ${fmtTime(audioEl.duration)}`;
    });
    // 音频加载失败（如线上部署没有本地音源）→ 隐藏播放条并回退第三方
    audioEl.addEventListener("error", () => {
      if (!audioEl) return;
      stopLocalAudio();
      updateSpotifyPlayer();
    });
    audioEl.addEventListener("timeupdate", () => {
      if (scanningDuration) return; // 时长扫描期间跳过刷新
      const d = audioEl.duration;
      const pct = d && isFinite(d) && d > 0 ? (audioEl.currentTime / d) * 100 : 0;
      progressBar.style.width = pct + "%";
      timeLabel.textContent = `${fmtTime(audioEl.currentTime)} / ${fmtTime(d)}`;
    });
    audioEl.addEventListener("ended", () => {
      localPlaying = false;
      localPlayBtn.textContent = "▶";
      progressBar.style.width = "0%";
      timeLabel.textContent = "00:00 / " + fmtTime(audioEl.duration);
    });
  }

  function stopLocalAudio() {
    if (audioEl) {
      audioEl.pause();
      audioEl = null;
    }
    localPlaying = false;
    customPlayer.hidden = true;
  }

  function initLocalPlayerEvents() {
    localPlayBtn.addEventListener("click", () => {
      if (!audioEl) return;
      if (localPlaying) {
        audioEl.pause();
        localPlayBtn.textContent = "▶";
      } else {
        audioEl.play();
        localPlayBtn.textContent = "⏸";
      }
      localPlaying = !localPlaying;
    });

    // 进度条：点击 + 按住拖动跳转
    let dragging = false;

    function seekTo(clientX) {
      if (!audioEl || !audioEl.duration || !isFinite(audioEl.duration)) return;
      const rect = progressWrap.getBoundingClientRect();
      const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      audioEl.currentTime = ratio * audioEl.duration;
      progressBar.style.width = ratio * 100 + "%";
      timeLabel.textContent = `${fmtTime(audioEl.currentTime)} / ${fmtTime(audioEl.duration)}`;
    }

    progressWrap.addEventListener("pointerdown", (e) => {
      if (!audioEl || !audioEl.duration) return;
      dragging = true;
      progressWrap.classList.add("dragging");
      progressWrap.setPointerCapture(e.pointerId);
      seekTo(e.clientX);
    });
    progressWrap.addEventListener("pointermove", (e) => {
      if (dragging) seekTo(e.clientX);
    });
    progressWrap.addEventListener("pointerup", () => {
      dragging = false;
      progressWrap.classList.remove("dragging");
    });
    progressWrap.addEventListener("pointercancel", () => {
      dragging = false;
      progressWrap.classList.remove("dragging");
    });
  }

  // ---------- 本地歌词面板（个人使用：assets/lyrics/local-lyrics.js，不入 Git 不上线） ----------
  function escapeText(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }

  function loadLyricsScript() {
    return new Promise((resolve) => {
      if (window.LOCAL_LYRICS) return resolve();
      const s = document.createElement("script");
      s.src = "assets/lyrics/local-lyrics.js";
      s.onload = () => resolve();
      s.onerror = () => resolve(); // 文件不存在时静默跳过
      document.head.appendChild(s);
    });
  }

  async function updateLyricsUI(song) {
    await loadLyricsScript();
    const text = (window.LOCAL_LYRICS || {})[song.id];
    lyricsBtn.hidden = !text;
    if (!text) {
      lyricsPanel.hidden = true;
      return;
    }
    lyricsPanel.innerHTML = text
      .split(/\r?\n/)
      .map((line) => `<p>${escapeText(line) || "&nbsp;"}</p>`)
      .join("");
  }

  function initLyricsEvents() {
    lyricsBtn.addEventListener("click", () => {
      lyricsPanel.hidden = !lyricsPanel.hidden;
    });
  }

  // 聊天室滚动歌词背景：有本地歌词时铺在底层缓慢上滚
  async function updateLyricsBackground(song) {
    if (!lyricsBg) return;
    await loadLyricsScript();
    const text = (window.LOCAL_LYRICS || {})[song.id];
    if (!text) {
      lyricsBg.hidden = true;
      lyricsBg.innerHTML = "";
      return;
    }
    const lines = text
      .split(/\r?\n/)
      .map((line) => `<p>${escapeText(line) || "&nbsp;"}</p>`)
      .join("");
    // 内容复制两份做无缝循环滚动
    lyricsBg.innerHTML = `<div class="lyrics-bg-scroll">${lines}${lines}</div>`;
    lyricsBg.hidden = false;
  }

  async function updateSpotifyPlayer() {
    const song = getActiveSong();

    // 立即给出加载反馈，避免底部空白
    stopLocalAudio();
    spotifyEmbedWrapper.hidden = false;
    spotifyEmbedWrapper.innerHTML = '<p class="spotify-fallback">🎵 Loading audio...</p>';

    // 1) 优先本地音源（完整版，个人使用）
    const localSrc = await probeLocalAudio(song);
    if (localSrc) {
      showCustomPlayer(localSrc);
      updateLyricsUI(song);
      return;
    }

    // 2) 本地无文件 → 第三方嵌入链
    spotifyEmbedWrapper.hidden = false;
    spotifyEmbedWrapper.innerHTML = '<p class="spotify-fallback">🎵 Loading audio...</p>';

    if (song.spotifyId) {
      const reachable = await checkSpotifyReachable();
      if (reachable) {
        loadSpotifyEmbed(song.spotifyId);
        updateLyricsUI(song);
        return;
      }
    }

    // Spotify 不可用 → 网易云 → QQ 音乐改为跳转按钮（嵌入页会跳转，弃用 iframe）→ iTunes 试听
    if (song.neteaseId) {
      loadNeteaseEmbed(song.neteaseId);
      updateLyricsUI(song);
      return;
    }
    if (song.qqmusicSrc) {
      spotifyEmbedWrapper.innerHTML = `
        <div class="qq-link-fallback">
          <span>🎵 For the full version, open this song in QQ Music</span>
          <a href="${song.qqmusicSrc}" target="_blank" rel="noopener">Open in QQ Music ↗</a>
        </div>
      `;
      updateLyricsUI(song);
      return;
    }
    await loadItunesPreview(song, Boolean(song.spotifyId));
    updateLyricsUI(song);
  }

  function startAutoSlide() {
    clearInterval(autoSlideTimer);
    autoSlideTimer = setInterval(() => {
      const slices = getActiveSong().slices;
      if (slices && slices.length > 1) {
        currentSliceIndex = (currentSliceIndex + 1) % slices.length;
        renderSlice();
      }
    }, 5000);
  }

  // 模式切换
  tabSliceBtn.addEventListener("click", () => {
    tabSliceBtn.classList.add("active");
    tabChatBtn.classList.remove("active");
    tabDerbyBtn.classList.remove("active");
    sliceContainer.style.display = "flex";
    chatContainer.style.display = "none";
    derbyContainer.style.display = "none";
  });

  tabChatBtn.addEventListener("click", () => {
    tabChatBtn.classList.add("active");
    tabSliceBtn.classList.remove("active");
    tabDerbyBtn.classList.remove("active");
    sliceContainer.style.display = "none";
    chatContainer.style.display = "flex";
    derbyContainer.style.display = "none";
    renderChats();
  });

  tabDerbyBtn.addEventListener("click", () => {
    tabDerbyBtn.classList.add("active");
    tabSliceBtn.classList.remove("active");
    tabChatBtn.classList.remove("active");
    sliceContainer.style.display = "none";
    chatContainer.style.display = "none";
    derbyContainer.style.display = "flex";
  });

  // 发送聊天消息（带昵称、IP属地、回复引用，并同步到其他标签页）
  chatForm.addEventListener("submit", e => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (!msg) return;

    const song = getActiveSong();
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const newChat = {
      _mid: Date.now() + "-" + CLIENT_ID,
      user: (myProfile && myProfile.nick) || "GuestARMY",
      ip: myProfile ? myProfile.ip : "Unknown",
      status: myProfile ? myProfile.status : "",
      mine: true,
      text: msg,
      time: timeStr,
      replyTo: replyTarget || null
    };

    replyTarget = null;
    replyIndicator.hidden = true;
    song.chats.push(newChat);
    persistChat(song.id, newChat);
    if (bc) bc.postMessage({ type: "chat", songId: song.id, msg: newChat });

    chatInput.value = "";
    renderChats();
    scheduleSimReplies(song.id, newChat);
  });

  // 回复：点击气泡上的"回复"按钮
  chatBox.addEventListener("click", e => {
    const btn = e.target.closest(".reply-btn");
    if (!btn) return;
    const chat = getActiveSong().chats[parseInt(btn.dataset.idx, 10)];
    if (!chat) return;
    replyTarget = { user: chat.user, text: chat.text.slice(0, 30) };
    replyTargetName.textContent = chat.user;
    replyIndicator.hidden = false;
    chatInput.focus();
  });

  cancelReplyBtn.addEventListener("click", () => {
    replyTarget = null;
    replyIndicator.hidden = true;
  });

  // 应援互动
  let cheers = 777;
  cheerBtn.addEventListener("click", () => {
    cheers++;
    cheerCount.textContent = cheers;
    cheerBtn.style.transform = "scale(1.2)";
    setTimeout(() => cheerBtn.style.transform = "scale(1)", 150);
  });

  // 初始化：绑定播放器/歌词事件并加载第一首歌
  initLocalPlayerEvents();
  initLyricsEvents();
  initProfileFeature();
  updateSpotifyPlayer();

  eraList.addEventListener("click", e => {
    const eraBtn = e.target.closest("button");
    if (eraBtn && eraBtn.dataset.era) {
      currentEraKey = eraBtn.dataset.era;
      currentSongIndex = 0;
      currentSliceIndex = 0;
      renderEras();
      renderSongs();
      renderSlice();
      renderChats();
      updateSpotifyPlayer();
      startAutoSlide();
    }
  });

  songList.addEventListener("click", e => {
    const songItem = e.target.closest("li");
    if (songItem && songItem.dataset.idx !== undefined) {
      currentSongIndex = parseInt(songItem.dataset.idx, 10);
      currentSliceIndex = 0;
      renderSongs();
      renderSlice();
      renderChats();
      updateSpotifyPlayer();
      startAutoSlide();
    }
  });

  document.getElementById("prevSlice").addEventListener("click", () => {
    const slices = getActiveSong().slices;
    if (slices && slices.length > 0) {
      currentSliceIndex = (currentSliceIndex - 1 + slices.length) % slices.length;
      renderSlice();
      startAutoSlide();
    }
  });

  document.getElementById("nextSlice").addEventListener("click", () => {
    const slices = getActiveSong().slices;
    if (slices && slices.length > 0) {
      currentSliceIndex = (currentSliceIndex + 1) % slices.length;
      renderSlice();
      startAutoSlide();
    }
  });

  // 给当前切片点赞 / 取消点赞
  sliceLikeBtn.addEventListener("click", () => {
    const song = getActiveSong();
    const slices = song.slices;
    if (!slices || !slices.length) return;
    const slice = slices[currentSliceIndex % slices.length];
    const sid = getSliceSid(slice, song.id);
    const newCount = toggleLike(sid, slice.likes);
    sliceLikeCount.textContent = newCount;
    sliceLikeBtn.classList.toggle("liked", loadLikedSet().has(sid));
    if (bc) bc.postMessage({ type: "like", sid, count: newCount });
  });

  openUploadBtn.addEventListener("click", () => uploadModal.showModal());
  const closeModal = () => { uploadModal.close(); uploadForm.reset(); };
  closeUploadBtn.addEventListener("click", closeModal);
  cancelUploadBtn.addEventListener("click", closeModal);

  // 群聊弹窗事件
  closeGroupChatBtn.addEventListener("click", closeGroupChat);
  groupChatForm.addEventListener("submit", e => {
    e.preventDefault();
    const text = groupChatInput.value.trim();
    if (!text || !activeGroup) return;
    sendGroupMessage(activeGroup.gid, text);
    groupChatInput.value = "";
    renderGroupChatUI();
  });

  uploadForm.addEventListener("submit", e => {
    e.preventDefault();
    const song = getActiveSong();
    const allowComments = document.getElementById("formAllowComments").checked;
    const newSlice = {
      sid: "up-" + Date.now().toString(36) + "-" + CLIENT_ID,
      likes: 0,
      location: document.getElementById("formLocation").value.trim(),
      image: document.getElementById("formImage").value.trim(),
      author: document.getElementById("formAuthor").value.trim(),
      caption: document.getElementById("formCaption").value.trim(),
      commentsAllowed: allowComments   // 发布者选择是否允许评论
    };

    song.slices.unshift(newSlice);
    let stored = JSON.parse(localStorage.getItem(SLICE_STORAGE_KEY) || "{}");
    if (!stored[song.id]) stored[song.id] = [];
    stored[song.id].unshift(newSlice);
    localStorage.setItem(SLICE_STORAGE_KEY, JSON.stringify(stored));

    currentSliceIndex = 0;
    renderSlice();
    startAutoSlide();
    closeModal();
  });

  renderEras();
  renderSongs();
  renderSlice();
  startAutoSlide();

  // ---------- Status Derby（3D 状态赛马棋） ----------
  // 规则：每个状态是一支队伍；每有一位该状态的听众加入，队伍棋子前进一格；
  //      先到达终点（🏁）的队伍获胜，展示 5 秒后自动重开一局。
  const DERBY_KEY = "army_echoes_derby";
  const DERBY_STEPS = 15;
  const DERBY_EMOJI = {
    "Listening": "🎧", "Sleeping": "😴", "Studying": "📚",
    "Eating": "🍜", "Slacking off": "😜", "Daydreaming": "🌙"
  };
  // 棋子图片映射：等图片文件就位后填入，如 "Listening": "assets/images/derby/listening.png"
  // 未填的状态自动使用 emoji 占位棋子
  const DERBY_PIECE_IMG = {};
  let derbyState = null;
  const derbyPieceEls = {};
  const derbyCountEls = {};
  let derbyResetTimer = null;

  function freshDerbyState() {
    const pos = {};
    STATUS_OPTIONS.forEach(s => { pos[s] = 0; });
    return { pos, raceNo: 1, lastWinner: null, winner: null, finishedAt: 0 };
  }

  function loadDerbyState() {
    try { return JSON.parse(localStorage.getItem(DERBY_KEY) || "null"); } catch (e) { return null; }
  }

  function saveDerbyState() {
    localStorage.setItem(DERBY_KEY, JSON.stringify(derbyState));
  }

  function derbyPieceHTML(status) {
    const img = DERBY_PIECE_IMG[status];
    if (img) {
      return `<img src="${escapeText(img)}" alt="${escapeText(status)}"
        onerror="this.outerHTML='<div class=&quot;derby-piece-fallback&quot;>${DERBY_EMOJI[status] || "🎲"}</div>'">`;
    }
    return `<div class="derby-piece-fallback">${DERBY_EMOJI[status] || "🎲"}</div>`;
  }

  function buildDerbyBoard() {
    derbyBoard.innerHTML = "";
    Object.keys(derbyPieceEls).forEach(k => delete derbyPieceEls[k]);
    Object.keys(derbyCountEls).forEach(k => delete derbyCountEls[k]);
    STATUS_OPTIONS.forEach(status => {
      const lane = document.createElement("div");
      lane.className = "derby-lane";
      lane.innerHTML = `
        <div class="derby-team">
          <span class="derby-team-emoji">${DERBY_EMOJI[status] || "🎲"}</span>
          <span class="derby-team-name">${escapeText(status)}</span>
          <span class="derby-team-count"></span>
        </div>
        <div class="derby-track">
          <div class="derby-piece">${derbyPieceHTML(status)}</div>
        </div>`;
      derbyBoard.appendChild(lane);
      derbyPieceEls[status] = lane.querySelector(".derby-piece");
      derbyCountEls[status] = lane.querySelector(".derby-team-count");
      updateDerbyPiece(status, false);
      updateDerbyTeamCount(status);
    });
  }

  function updateDerbyPiece(status, hop) {
    const el = derbyPieceEls[status];
    if (!el || !derbyState) return;
    const p = Math.min(derbyState.pos[status] || 0, DERBY_STEPS);
    el.style.left = (p / DERBY_STEPS) * 100 + "%";
    const leading = p > 0 && STATUS_OPTIONS.every(s => (derbyState.pos[s] || 0) <= p);
    el.classList.toggle("leading", leading);
    if (hop) {
      el.classList.remove("hop");
      void el.offsetWidth; // 重启动画
      el.classList.add("hop");
    }
  }

  function updateDerbyTeamCount(status) {
    const el = derbyCountEls[status];
    if (el && derbyState) el.textContent = `×${derbyState.pos[status] || 0}`;
  }

  function renderDerbyMeta() {
    if (!derbyState) return;
    derbyRaceNo.textContent = derbyState.raceNo;
    derbyLastWinner.textContent = derbyState.lastWinner || "—";
  }

  function showDerbyWinner(status) {
    derbyWinnerEmoji.textContent = "🏆";
    derbyWinnerName.textContent = status;
    derbyWinner.hidden = false;
  }

  function scheduleDerbyReset(duration = 5000) {
    if (derbyResetTimer) { clearTimeout(derbyResetTimer); derbyResetTimer = null; }
    const end = Date.now() + duration;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      derbyCountdown.textContent = left;
      if (left <= 0) clearInterval(tick);
    }, 250);
    derbyResetTimer = setTimeout(() => {
      clearInterval(tick);
      resetDerby(derbyState.winner);
    }, duration);
  }

  function resetDerby(winner) {
    const raceNo = (derbyState.raceNo || 1) + 1;
    derbyState = freshDerbyState();
    derbyState.raceNo = raceNo;
    derbyState.lastWinner = winner || null;
    saveDerbyState();
    if (bc) bc.postMessage({ type: "derby", state: derbyState });
    derbyWinner.hidden = true;
    renderDerbyMeta();
    STATUS_OPTIONS.forEach(s => { updateDerbyPiece(s, false); updateDerbyTeamCount(s); });
  }

  function derbyMoveFor(status) {
    if (!status || !derbyState || derbyState.winner) return;
    if (!(status in derbyState.pos)) return; // 未知状态不参与
    derbyState.pos[status] += 1;
    updateDerbyPiece(status, true);
    updateDerbyTeamCount(status);
    if (derbyState.pos[status] >= DERBY_STEPS) {
      derbyState.winner = status;
      derbyState.finishedAt = Date.now();
      showDerbyWinner(status);
      scheduleDerbyReset();
    }
    saveDerbyState();
    if (bc) bc.postMessage({ type: "derby", state: derbyState });
  }

  function applyRemoteDerby(remote) {
    if (!remote || !remote.pos) return;
    derbyState = remote;
    if (derbyState.winner) {
      showDerbyWinner(derbyState.winner);
      const remain = 5000 - (Date.now() - derbyState.finishedAt);
      if (remain <= 0) { resetDerby(derbyState.winner); return; }
      scheduleDerbyReset(remain);
    } else {
      derbyWinner.hidden = true;
      if (derbyResetTimer) { clearTimeout(derbyResetTimer); derbyResetTimer = null; }
    }
    renderDerbyMeta();
    STATUS_OPTIONS.forEach(s => { updateDerbyPiece(s, false); updateDerbyTeamCount(s); });
  }

  // 初始化棋盘
  derbyStepsLabel.textContent = DERBY_STEPS;
  derbyState = loadDerbyState();
  if (!derbyState || !derbyState.pos) derbyState = freshDerbyState();
  // 上次获胜后未及重开（如页面关闭）→ 直接开新局
  if (derbyState.winner && Date.now() - derbyState.finishedAt > 5000) {
    const prevRaceNo = derbyState.raceNo || 1;
    derbyState.lastWinner = derbyState.winner;
    derbyState = freshDerbyState();
    derbyState.raceNo = prevRaceNo + 1;
  }
  buildDerbyBoard();
  renderDerbyMeta();

  // 环境模拟：每 ~3 秒一位"粉丝"加入，随机状态队伍走一步（页面隐藏时暂停，避免堆积跳跃）
  setInterval(() => {
    if (document.hidden || !derbyState || derbyState.winner) return;
    const s = STATUS_OPTIONS[Math.floor(Math.random() * STATUS_OPTIONS.length)];
    derbyMoveFor(s);
  }, 3000);

  // ---------- 3D 视差背景：鼠标跟随倾斜（rAF 节流，触屏/无鼠标设备跳过） ----------
  const bg3d = document.querySelector(".bg-3d");
  if (bg3d && window.matchMedia("(pointer: fine)").matches) {
    let bgRaf = null;
    window.addEventListener("mousemove", e => {
      if (bgRaf) return;
      bgRaf = requestAnimationFrame(() => {
        bgRaf = null;
        const mx = (e.clientX / window.innerWidth - 0.5) * 2;   // -1 ~ 1
        const my = (e.clientY / window.innerHeight - 0.5) * 2;
        bg3d.style.setProperty("--tiltX", (-my * 2.4).toFixed(2) + "deg");
        bg3d.style.setProperty("--tiltY", (mx * 2.4).toFixed(2) + "deg");
        bg3d.style.setProperty("--mx", mx.toFixed(3));
        bg3d.style.setProperty("--my", my.toFixed(3));
      });
    }, { passive: true });
  }
});
