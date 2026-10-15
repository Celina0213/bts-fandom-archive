document.addEventListener("DOMContentLoaded", () => {
  let currentEraKey = "hyyh";
  let currentSongIndex = 0;
  let currentSliceIndex = 0;
  let autoSlideTimer = null;

  // Spotify Embed 状态
  const spotifyEmbedWrapper = document.getElementById("spotifyEmbedWrapper");

  const SLICE_STORAGE_KEY = "army_echoes_custom_slices";
  const CHAT_STORAGE_KEY = "army_echoes_chats";

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
              { user: "PurpleARMY_07", text: "前奏一响瞬间回到那个冬天 💜", time: "18:20" },
              { user: "BusanBoy", text: "希望今年还能在首尔和大家相聚！", time: "19:05" }
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

  const chatBox = document.getElementById("chatBox");
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
    sidebarTitle.textContent = `${era.name} · 曲目`;
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
      sliceLocation.textContent = "暂无取景地记忆";
      sliceCaption.textContent = "这首歌尚在等待第一位上传打卡回忆的粉丝。";
      sliceAuthor.textContent = "by ARMY";
      sliceIndicators.innerHTML = "";
      return;
    }

    const current = slices[currentSliceIndex % slices.length];
    sliceImg.src = current.image;
    sliceLocation.textContent = current.location;
    sliceCaption.textContent = current.caption;
    sliceAuthor.textContent = `by ${current.author}`;

    sliceIndicators.innerHTML = slices.map((_, i) => `
      <span class="indicator-dot ${i === (currentSliceIndex % slices.length) ? 'active' : ''}"></span>
    `).join("");

    playerTitle.textContent = song.title;
    playerMeta.textContent = song.album;
  }

  function renderChats() {
    const song = getActiveSong();
    chatBox.innerHTML = (song.chats || []).map(chat => `
      <div class="chat-bubble">
        <div class="user-meta">
          <span>${chat.user}</span>
          <span class="time-stamp">${chat.time}</span>
        </div>
        <div class="user-text">${chat.text}</div>
      </div>
    `).join("");
    chatBox.scrollTop = chatBox.scrollHeight;

    // 随机微调在线听歌人数
    const base = 1200 + Math.floor(Math.random() * 200);
    listenerBadge.textContent = base.toLocaleString();
  }

  // Spotify Embed 播放器（替代 Web Audio 合成音）
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
  async function loadItunesPreview(song) {
    try {
      const term = encodeURIComponent(`BTS ${song.title.replace(/\s*\(.*\)$/, "")}`);
      const res = await fetch(`https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=10`);
      const data = await res.json();
      const hit = data.results.find(r => r.artistName === "BTS") || data.results[0];
      if (hit && hit.previewUrl) {
        spotifyEmbedWrapper.innerHTML = `
          <div class="itunes-fallback">
            <span class="itunes-label">🎧 30s 试听 · iTunes</span>
            <audio controls preload="none" src="${hit.previewUrl}"></audio>
          </div>
        `;
        return;
      }
    } catch (e) {
      console.error("iTunes search error:", e);
    }
    spotifyEmbedWrapper.innerHTML = '<p class="spotify-fallback">🎵 此曲目暂无可用音源</p>';
  }

  async function updateSpotifyPlayer() {
    const song = getActiveSong();
    if (song.spotifyId) {
      loadSpotifyEmbed(song.spotifyId);
    } else {
      await loadItunesPreview(song);
    }
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
    sliceContainer.style.display = "flex";
    chatContainer.style.display = "none";
  });

  tabChatBtn.addEventListener("click", () => {
    tabChatBtn.classList.add("active");
    tabSliceBtn.classList.remove("active");
    sliceContainer.style.display = "none";
    chatContainer.style.display = "flex";
    renderChats();
  });

  // 发送聊天消息
  chatForm.addEventListener("submit", e => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (!msg) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const newChat = { user: "我 (ARMY)", text: msg, time: timeStr };

    const song = getActiveSong();
    song.chats.push(newChat);

    // 持久化存储聊天
    let storedChats = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "{}");
    if (!storedChats[song.id]) storedChats[song.id] = [];
    storedChats[song.id].push(newChat);
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(storedChats));

    chatInput.value = "";
    renderChats();
  });

  // 应援互动
  let cheers = 777;
  cheerBtn.addEventListener("click", () => {
    cheers++;
    cheerCount.textContent = cheers;
    cheerBtn.style.transform = "scale(1.2)";
    setTimeout(() => cheerBtn.style.transform = "scale(1)", 150);
  });

  // 初始化时加载第一首歌的 Spotify 播放器
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

  openUploadBtn.addEventListener("click", () => uploadModal.showModal());
  const closeModal = () => { uploadModal.close(); uploadForm.reset(); };
  closeUploadBtn.addEventListener("click", closeModal);
  cancelUploadBtn.addEventListener("click", closeModal);

  uploadForm.addEventListener("submit", e => {
    e.preventDefault();
    const song = getActiveSong();
    const newSlice = {
      location: document.getElementById("formLocation").value.trim(),
      image: document.getElementById("formImage").value.trim(),
      author: document.getElementById("formAuthor").value.trim(),
      caption: document.getElementById("formCaption").value.trim()
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
});
