document.addEventListener("DOMContentLoaded", () => {
  let currentEraKey = "hyyh";
  let currentSongIndex = 0;
  let currentSliceIndex = 0;
  let autoSlideTimer = null;

  const STORAGE_KEY = "army_echoes_custom_slices";

  // 从 localStorage 恢复自定义切片数据
  function loadCustomSlices() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const customData = JSON.parse(stored);
        Object.keys(customData).forEach(songId => {
          for (const era in ARCHIVE_DATA) {
            const song = ARCHIVE_DATA[era].songs.find(s => s.id === songId);
            if (song) {
              song.slices = [...customData[songId], ...song.slices];
            }
          }
        });
      }
    } catch (e) {
      console.error("Failed to load custom slices from localStorage:", e);
    }
  }

  // 保存切片至 localStorage
  function saveSliceToStorage(songId, slice) {
    try {
      let stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (!stored[songId]) {
        stored[songId] = [];
      }
      stored[songId].unshift(slice);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (e) {
      console.error("Failed to save slice to localStorage:", e);
    }
  }

  loadCustomSlices();

  const eraList = document.getElementById("eraList");
  const songList = document.getElementById("songList");
  const sidebarTitle = document.getElementById("sidebarTitle");

  const sliceImg = document.getElementById("sliceImg");
  const sliceLocation = document.getElementById("sliceLocation");
  const sliceCaption = document.getElementById("sliceCaption");
  const sliceAuthor = document.getElementById("sliceAuthor");
  const sliceIndicators = document.getElementById("sliceIndicators");

  const playerTitle = document.getElementById("playerTitle");
  const playerMeta = document.getElementById("playerMeta");

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

  eraList.addEventListener("click", e => {
    const eraBtn = e.target.closest("button");
    if (eraBtn && eraBtn.dataset.era) {
      currentEraKey = eraBtn.dataset.era;
      currentSongIndex = 0;
      currentSliceIndex = 0;
      renderEras();
      renderSongs();
      renderSlice();
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

  // 模态弹窗控制
  openUploadBtn.addEventListener("click", () => {
    uploadModal.showModal();
  });

  const closeModal = () => {
    uploadModal.close();
    uploadForm.reset();
  };

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

    // 置顶插入当前歌曲切片列表并持久化保存
    song.slices.unshift(newSlice);
    saveSliceToStorage(song.id, newSlice);

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
