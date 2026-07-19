(() => {
  "use strict";

  const DB_NAME = "localtone-library";
  const DB_VERSION = 1;
  const TRACK_STORE = "tracks";
  const PREFS_KEY = "localtone-preferences-v2";
  const LEGACY_PREFS_KEY = "localtone-preferences-v1";
  const MEDIA_TAGS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/0.1.0/jsmediatags.min.js";
  const BACKUP_FORMAT = "browser-music-player-backup";
  const BACKUP_VERSION = 1;
  const SUPPORTED_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "ogg", "oga", "flac", "opus", "webm", "mp4"]);

  const ICONS = {
    music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v12.5a4.5 4.5 0 1 1-2-3.7V5.4L11 6.7v11.8A4.5 4.5 0 1 1 9 18Z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7L8 5Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.7 3.9 12.6A5.5 5.5 0 0 1 11.7 4.8l.3.3.3-.3a5.5 5.5 0 0 1 7.8 7.8L12 20.7Zm0-2.8 6.7-6.7a3.5 3.5 0 1 0-5-4.9L12 8l-1.7-1.7a3.5 3.5 0 0 0-5 4.9l6.7 6.7Z"/></svg>',
    playlist: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h10v2H4V5Zm0 5h10v2H4v-2Zm0 5h7v2H4v-2Zm13-3v7l5-3.5-5-3.5Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l1 2h4v2H3V6h4l1-2Zm-2 6h12l-1 11H7L6 10Zm3 2v7h2v-7H9Zm4 0v7h2v-7h-2Z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2V5ZM5 5v14l10-7L5 5Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 16.2-4-4L4.1 13.6l5.4 5.4L20 8.5l-1.4-1.4-9.1 9.1Z"/></svg>'
  };

  const state = {
    db: null,
    tracks: [],
    currentTrackId: null,
    currentObjectUrl: null,
    queue: [],
    queueIndex: -1,
    currentView: "library",
    currentPlaylistId: null,
    searchQuery: "",
    sortMode: "added",
    shuffle: false,
    repeatMode: "off",
    favorites: new Set(),
    recent: [],
    playlists: {},
    selectedTrackId: null,
    dragDepth: 0,
    isImporting: false,
    mediaTagsPromise: null,
    pendingImport: null,
    pendingRestoreFile: null
  };

  const dom = {};
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheDom();
    loadPreferences();
    bindEvents();

    const savedVolume = Number(localStorage.getItem("localtone-volume"));
    dom.audioElement.volume = Number.isFinite(savedVolume) ? Math.min(1, Math.max(0, savedVolume)) : 0.85;
    dom.volumeRange.value = String(dom.audioElement.volume);
    dom.sortSelect.value = state.sortMode;
    updateRangeVisual(dom.volumeRange);
    renderLoading();

    try {
      state.db = await openDatabase();
      state.tracks = await getAllTracks();
      prunePreferences();
      enablePlayerControls(state.tracks.length > 0);
      updateRoute();
      renderPlaylistNav();
      updatePlayerUi();
    } catch (error) {
      console.error(error);
      renderEmpty("Storage unavailable", "This browser blocked local database access. Check private browsing or storage settings.", false);
      showToast("The local music database could not be opened.", "error");
    }

    registerServiceWorker();
    setupMediaSessionHandlers();
  }

  function cacheDom() {
    [
      "searchInput", "uploadTopButton", "dataMenu", "exportDataButton", "restoreDataButton", "newPlaylistButton",
      "playlistNav", "libraryCount", "sidebarUploadButton", "mainContent", "viewHeader", "viewEyebrow", "viewTitle",
      "viewSubtitle", "sortSelect", "deletePlaylistButton", "viewShuffleButton", "viewPlayButton", "contentSections",
      "emptyState", "emptyTitle", "emptyCopy", "emptyUploadButton", "queuePanel", "closeQueueButton", "queueList",
      "playerArt", "playerTitle", "playerArtist", "playerFavoriteButton", "shuffleButton", "previousButton",
      "playPauseButton", "nextButton", "repeatButton", "currentTime", "seekRange", "durationTime", "queueButton",
      "muteButton", "volumeRange", "dropOverlay", "uploadModal", "chooseFilesButton", "chooseFolderButton",
      "chooseZipButton", "playlistImportModal", "playlistImportForm", "playlistImportList", "importWithoutPlaylistsButton",
      "playlistModal", "playlistForm", "playlistNameInput", "addToPlaylistModal", "playlistPicker", "restoreModeModal",
      "restoreModeForm", "contextMenu", "toastStack", "fileInput", "folderInput", "zipInput", "restoreInput", "audioElement"
    ].forEach((id) => { dom[id] = document.getElementById(id); });
  }

  function bindEvents() {
    window.addEventListener("hashchange", updateRoute);

    [dom.uploadTopButton, dom.sidebarUploadButton, dom.emptyUploadButton].forEach((button) => {
      button.addEventListener("click", () => openDialog(dom.uploadModal));
    });

    dom.chooseFilesButton.addEventListener("click", () => dom.fileInput.click());
    dom.chooseFolderButton.addEventListener("click", () => dom.folderInput.click());
    dom.chooseZipButton.addEventListener("click", () => dom.zipInput.click());
    dom.fileInput.addEventListener("change", () => consumeInput(dom.fileInput, "files"));
    dom.folderInput.addEventListener("change", () => consumeInput(dom.folderInput, "folder"));
    dom.zipInput.addEventListener("change", () => consumeInput(dom.zipInput, "zip"));

    dom.exportDataButton.addEventListener("click", exportLibraryData);
    dom.restoreDataButton.addEventListener("click", () => {
      dom.dataMenu.open = false;
      dom.restoreInput.click();
    });
    dom.restoreInput.addEventListener("change", () => {
      const file = dom.restoreInput.files?.[0];
      dom.restoreInput.value = "";
      if (!file) return;
      state.pendingRestoreFile = file;
      openDialog(dom.restoreModeModal);
    });

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", () => document.getElementById(button.dataset.closeModal)?.close());
    });
    document.querySelectorAll("dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    });

    dom.playlistImportForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const selected = readPlaylistImportChoices();
      dom.playlistImportModal.close();
      const pending = state.pendingImport;
      state.pendingImport = null;
      if (pending) importFiles(pending.files, selected);
    });
    dom.importWithoutPlaylistsButton.addEventListener("click", () => {
      dom.playlistImportModal.close();
      const pending = state.pendingImport;
      state.pendingImport = null;
      if (pending) importFiles(pending.files, []);
    });

    dom.restoreModeForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const mode = new FormData(dom.restoreModeForm).get("restoreMode") || "merge";
      const file = state.pendingRestoreFile;
      state.pendingRestoreFile = null;
      dom.restoreModeModal.close();
      if (file) restoreBackup(file, String(mode));
    });

    dom.searchInput.addEventListener("input", () => {
      state.searchQuery = dom.searchInput.value.trim();
      renderCurrentView();
    });
    dom.sortSelect.addEventListener("change", () => {
      state.sortMode = dom.sortSelect.value;
      savePreferences();
      renderCurrentView();
    });

    dom.newPlaylistButton.addEventListener("click", openNewPlaylistDialog);
    dom.playlistForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = dom.playlistNameInput.value.trim();
      if (!name) return;
      const id = createPlaylistInternal(name, [], true);
      dom.playlistModal.close();
      location.hash = `playlist=${encodeURIComponent(id)}`;
    });
    dom.deletePlaylistButton.addEventListener("click", deleteCurrentPlaylist);

    dom.viewPlayButton.addEventListener("click", () => {
      const tracks = getVisibleTracks();
      if (tracks.length) startPlayback(tracks, 0);
    });
    dom.viewShuffleButton.addEventListener("click", () => {
      const tracks = getVisibleTracks();
      if (tracks.length) startPlayback(tracks, 0, true);
    });

    dom.contentSections.addEventListener("click", handleContentClick);
    dom.contentSections.addEventListener("dblclick", (event) => {
      const row = event.target.closest("[data-track-id]");
      if (row && !event.target.closest("button")) startPlayback(getVisibleTracks(), Math.max(0, getVisibleTracks().findIndex((track) => track.id === row.dataset.trackId)));
    });
    dom.playlistNav.addEventListener("click", (event) => {
      const link = event.target.closest("[data-playlist-id]");
      if (!link) return;
      event.preventDefault();
      location.hash = `playlist=${encodeURIComponent(link.dataset.playlistId)}`;
    });

    dom.playPauseButton.addEventListener("click", togglePlayPause);
    dom.previousButton.addEventListener("click", playPrevious);
    dom.nextButton.addEventListener("click", () => playNext(false));
    dom.shuffleButton.addEventListener("click", toggleShuffle);
    dom.repeatButton.addEventListener("click", cycleRepeatMode);
    dom.playerFavoriteButton.addEventListener("click", () => state.currentTrackId && toggleFavorite(state.currentTrackId));
    dom.seekRange.addEventListener("input", seekAudio);
    dom.volumeRange.addEventListener("input", updateVolume);
    dom.muteButton.addEventListener("click", toggleMute);
    dom.queueButton.addEventListener("click", toggleQueue);
    dom.closeQueueButton.addEventListener("click", closeQueue);
    dom.queueList.addEventListener("click", (event) => {
      const item = event.target.closest("[data-queue-track-id]");
      if (item) playTrackById(item.dataset.queueTrackId);
    });

    dom.audioElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    dom.audioElement.addEventListener("timeupdate", updateProgress);
    dom.audioElement.addEventListener("play", () => {
      dom.playPauseButton.classList.add("playing");
      dom.playPauseButton.title = "Pause";
      updateMediaSessionPlaybackState("playing");
      updateActiveTrackIndicators();
    });
    dom.audioElement.addEventListener("pause", () => {
      dom.playPauseButton.classList.remove("playing");
      dom.playPauseButton.title = "Play";
      updateMediaSessionPlaybackState("paused");
      updateActiveTrackIndicators();
    });
    dom.audioElement.addEventListener("ended", handleTrackEnded);
    dom.audioElement.addEventListener("error", handlePlaybackError);
    dom.audioElement.addEventListener("volumechange", updateVolumeUi);

    document.addEventListener("click", (event) => {
      if (!event.target.closest("#contextMenu") && !event.target.closest("[data-action='menu']")) hideContextMenu();
      if (!event.target.closest("#dataMenu")) dom.dataMenu.open = false;
    });
    window.addEventListener("resize", hideContextMenu);
    window.addEventListener("scroll", hideContextMenu, true);
    document.addEventListener("keydown", handleKeyboardShortcuts);
    document.addEventListener("dragenter", handleDragEnter);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop);
  }

  function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
  }

  async function consumeInput(input, kind) {
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length) return;
    dom.uploadModal.close();
    await prepareImport(files, kind);
  }

  async function prepareImport(files, kind = "mixed") {
    const groups = describeImportGroups(files, kind);
    if (!groups.length) {
      await importFiles(files, []);
      return;
    }

    state.pendingImport = { files, groups };
    dom.playlistImportList.innerHTML = groups.map((group, index) => `
      <div class="playlist-import-row" data-group-row="${index}">
        <input id="groupChoice${index}" type="checkbox" data-group-choice="${index}" />
        <div class="playlist-import-fields">
          <label for="groupChoice${index}">${escapeHtml(group.kind === "zip" ? "ZIP archive" : "Folder")}: ${escapeHtml(group.label)}</label>
          <input class="text-input" data-group-name="${index}" value="${escapeAttribute(group.name)}" maxlength="80" aria-label="Playlist name for ${escapeAttribute(group.label)}" />
        </div>
      </div>`).join("");
    openDialog(dom.playlistImportModal);
  }

  function describeImportGroups(files, kind) {
    const groups = new Map();

    for (const file of files) {
      if (isZipFile(file)) {
        const label = file.name;
        groups.set(zipGroupKey(file), {
          key: zipGroupKey(file),
          kind: "zip",
          label,
          name: stripExtension(label)
        });
        continue;
      }

      const path = sourcePathForFile(file);
      if (path.includes("/")) {
        const root = path.split("/").filter(Boolean)[0] || "Imported folder";
        const key = `folder:${root}`;
        if (!groups.has(key)) groups.set(key, { key, kind: "folder", label: root, name: root });
      }
    }

    if (kind === "folder" && groups.size === 0 && files.length) {
      groups.set("folder:Imported folder", { key: "folder:Imported folder", kind: "folder", label: "Imported folder", name: "Imported folder" });
    }

    return [...groups.values()];
  }

  function readPlaylistImportChoices() {
    const pending = state.pendingImport;
    if (!pending) return [];
    const choices = [];
    pending.groups.forEach((group, index) => {
      const checked = dom.playlistImportList.querySelector(`[data-group-choice="${index}"]`)?.checked;
      const name = dom.playlistImportList.querySelector(`[data-group-name="${index}"]`)?.value.trim();
      if (checked) choices.push({ key: group.key, name: name || group.name });
    });
    return choices;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(TRACK_STORE)) {
          const store = db.createObjectStore(TRACK_STORE, { keyPath: "id" });
          store.createIndex("fingerprint", "fingerprint", { unique: true });
          store.createIndex("addedAt", "addedAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Database upgrade blocked"));
    });
  }

  function transactionRequest(mode, operation) {
    return new Promise((resolve, reject) => {
      if (!state.db) return reject(new Error("Database not ready"));
      const transaction = state.db.transaction(TRACK_STORE, mode);
      const store = transaction.objectStore(TRACK_STORE);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  const getAllTracks = () => transactionRequest("readonly", (store) => store.getAll());
  const putTrack = (track) => transactionRequest("readwrite", (store) => store.put(track));
  const deleteTrackRecord = (id) => transactionRequest("readwrite", (store) => store.delete(id));
  const clearTrackStore = () => transactionRequest("readwrite", (store) => store.clear());

  async function importFiles(inputFiles, playlistChoices = []) {
    if (state.isImporting) {
      showToast("An import is already running.", "error");
      return;
    }

    state.isImporting = true;
    const toast = showToast("Preparing files…", "progress", 0);

    try {
      const expanded = await expandZipFiles(inputFiles, (message) => updateToast(toast, message));
      const supported = expanded.filter(isSupportedMediaFile);
      const unsupportedCount = expanded.length - supported.length;
      const existingByFingerprint = new Map(state.tracks.map((track) => [track.fingerprint, track.id]));
      const pendingGroups = new Map();
      const newItems = [];
      const seenNew = new Set();
      let duplicateCount = 0;

      for (const file of supported) {
        const fingerprint = makeFingerprint(file);
        const groupKey = sourceGroupKey(file);
        if (groupKey) {
          if (!pendingGroups.has(fingerprint)) pendingGroups.set(fingerprint, new Set());
          pendingGroups.get(fingerprint).add(groupKey);
        }

        if (existingByFingerprint.has(fingerprint) || seenNew.has(fingerprint)) {
          duplicateCount += 1;
          continue;
        }
        seenNew.add(fingerprint);
        newItems.push({ file, fingerprint });
      }

      if (!newItems.length && ![...pendingGroups.keys()].some((fingerprint) => existingByFingerprint.has(fingerprint))) {
        removeToast(toast);
        showToast(duplicateCount ? "Those tracks are already in your library." : "No supported music files were found.", duplicateCount ? "info" : "error");
        return;
      }

      let imported = 0;
      let failed = 0;
      const processed = await mapWithConcurrency(newItems, 3, async (item, index) => {
        updateToast(toast, `Importing ${index + 1} of ${newItems.length}: ${item.file.name}`);
        try {
          const track = await createTrackRecord(item.file);
          await putTrack(track);
          existingByFingerprint.set(item.fingerprint, track.id);
          imported += 1;
          return track;
        } catch (error) {
          console.warn("Could not import", item.file.name, error);
          failed += 1;
          return null;
        }
      });

      const addedTracks = processed.filter(Boolean);
      state.tracks.push(...addedTracks);

      const idsByGroup = new Map();
      for (const [fingerprint, groupKeys] of pendingGroups) {
        const id = existingByFingerprint.get(fingerprint);
        if (!id) continue;
        for (const groupKey of groupKeys) {
          if (!idsByGroup.has(groupKey)) idsByGroup.set(groupKey, new Set());
          idsByGroup.get(groupKey).add(id);
        }
      }

      const createdPlaylists = [];
      for (const choice of playlistChoices) {
        const ids = [...(idsByGroup.get(choice.key) || [])];
        if (!ids.length) continue;
        const id = createPlaylistInternal(choice.name, ids, false);
        createdPlaylists.push(state.playlists[id].name);
      }

      savePreferences();
      enablePlayerControls(state.tracks.length > 0);
      renderPlaylistNav();
      renderCurrentView();
      removeToast(toast);

      const details = [];
      if (createdPlaylists.length) details.push(`${createdPlaylists.length} playlist${createdPlaylists.length === 1 ? "" : "s"} created`);
      if (duplicateCount) details.push(`${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"} skipped`);
      if (unsupportedCount) details.push(`${unsupportedCount} unsupported item${unsupportedCount === 1 ? "" : "s"} skipped`);
      if (failed) details.push(`${failed} failed`);
      showToast(`Imported ${imported} track${imported === 1 ? "" : "s"}${details.length ? ` · ${details.join(" · ")}` : ""}.`);
    } catch (error) {
      console.error(error);
      removeToast(toast);
      showToast(error?.name === "QuotaExceededError" ? "Browser storage is full." : "Import failed. The files may be damaged or unsupported.", "error");
    } finally {
      state.isImporting = false;
    }
  }

  async function expandZipFiles(files, onProgress) {
    const output = [];
    for (const file of files) {
      if (!isZipFile(file)) {
        output.push(file);
        continue;
      }
      if (!window.JSZip) throw new Error("ZIP support is unavailable.");

      const groupKey = zipGroupKey(file);
      onProgress?.(`Opening ${file.name}…`);
      const archive = await window.JSZip.loadAsync(file);
      const entries = Object.values(archive.files).filter((entry) => !entry.dir && isSupportedName(entry.name));

      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        onProgress?.(`Extracting ${index + 1} of ${entries.length}: ${entry.name.split("/").pop()}`);
        const blob = await entry.async("blob");
        const name = entry.name.split("/").pop() || `Track ${index + 1}`;
        const extracted = new File([blob], name, {
          type: inferMimeType(name, blob.type),
          lastModified: entry.date?.getTime?.() || file.lastModified || Date.now()
        });
        defineFileProperty(extracted, "localtonePath", entry.name);
        defineFileProperty(extracted, "localPlayerGroupKey", groupKey);
        output.push(extracted);
      }
    }
    return output;
  }

  async function createTrackRecord(file) {
    const metadata = await readMetadata(file);
    const parsed = parseFileName(file.name);
    const duration = await getMediaDuration(file);
    return {
      id: makeId(),
      fingerprint: makeFingerprint(file),
      title: cleanText(metadata.title) || parsed.title,
      artist: cleanText(metadata.artist) || parsed.artist || "Unknown artist",
      album: cleanText(metadata.album) || "Unknown album",
      year: cleanText(metadata.year),
      genre: normalizeGenre(metadata.genre),
      artwork: metadata.artwork || "",
      blob: file,
      mime: file.type || inferMimeType(file.name),
      size: file.size,
      duration: Number.isFinite(duration) ? duration : 0,
      sourcePath: sourcePathForFile(file),
      addedAt: Date.now(),
      lastPlayedAt: 0
    };
  }

  async function readMetadata(file) {
    const available = await ensureMediaTagsLibrary();
    if (!available) return {};
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      };
      const timeout = window.setTimeout(() => finish({}), 5500);
      window.jsmediatags.read(file, {
        onSuccess: ({ tags }) => finish({
          title: tags.title,
          artist: tags.artist,
          album: tags.album,
          year: tags.year,
          genre: tags.genre,
          artwork: pictureToDataUrl(tags.picture)
        }),
        onError: () => finish({})
      });
    });
  }

  function ensureMediaTagsLibrary() {
    if (window.jsmediatags?.read) return Promise.resolve(true);
    if (state.mediaTagsPromise) return state.mediaTagsPromise;
    state.mediaTagsPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      let settled = false;
      const finish = (loaded) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(Boolean(loaded && window.jsmediatags?.read));
      };
      const timeout = window.setTimeout(() => finish(false), 4500);
      script.src = MEDIA_TAGS_CDN;
      script.async = true;
      script.onload = () => finish(true);
      script.onerror = () => finish(false);
      document.head.appendChild(script);
    });
    return state.mediaTagsPromise;
  }

  function pictureToDataUrl(picture) {
    if (!picture?.data?.length) return "";
    try {
      const bytes = new Uint8Array(picture.data);
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      return `data:${picture.format || "image/jpeg"};base64,${btoa(binary)}`;
    } catch (_) {
      return "";
    }
  }

  function getMediaDuration(file) {
    return new Promise((resolve) => {
      const media = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
      const url = URL.createObjectURL(file);
      let settled = false;
      const finish = (duration = 0) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        media.removeAttribute("src");
        resolve(Number.isFinite(duration) ? duration : 0);
      };
      const timeout = window.setTimeout(() => finish(0), 5500);
      media.preload = "metadata";
      media.onloadedmetadata = () => finish(media.duration);
      media.onerror = () => finish(0);
      media.src = url;
    });
  }

  async function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let cursor = 0;
    async function worker() {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await mapper(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, worker));
    return results;
  }

  function loadPreferences() {
    try {
      const raw = localStorage.getItem(PREFS_KEY) || localStorage.getItem(LEGACY_PREFS_KEY) || "{}";
      const saved = JSON.parse(raw);
      state.favorites = new Set(Array.isArray(saved.favorites) ? saved.favorites : []);
      state.recent = Array.isArray(saved.recent) ? saved.recent : [];
      state.playlists = saved.playlists && typeof saved.playlists === "object" ? saved.playlists : {};
      state.shuffle = Boolean(saved.shuffle);
      state.repeatMode = ["off", "all", "one"].includes(saved.repeatMode) ? saved.repeatMode : "off";
      state.sortMode = ["added", "title", "artist", "album"].includes(saved.sortMode) ? saved.sortMode : "added";
    } catch (error) {
      console.warn("Preferences could not be loaded", error);
    }
  }

  function savePreferences() {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      favorites: [...state.favorites],
      recent: state.recent.slice(0, 150),
      playlists: state.playlists,
      shuffle: state.shuffle,
      repeatMode: state.repeatMode,
      sortMode: state.sortMode
    }));
  }

  function prunePreferences() {
    const valid = new Set(state.tracks.map((track) => track.id));
    state.favorites = new Set([...state.favorites].filter((id) => valid.has(id)));
    state.recent = state.recent.filter((id) => valid.has(id));
    Object.values(state.playlists).forEach((playlist) => {
      playlist.trackIds = (playlist.trackIds || []).filter((id) => valid.has(id));
    });
    savePreferences();
  }

  function updateRoute() {
    const hash = location.hash.replace(/^#/, "") || "library";
    if (hash.startsWith("playlist=")) {
      state.currentView = "playlist";
      state.currentPlaylistId = decodeURIComponent(hash.slice("playlist=".length));
      if (!state.playlists[state.currentPlaylistId]) {
        location.hash = "library";
        return;
      }
    } else {
      state.currentView = ["library", "favorites", "recent"].includes(hash) ? hash : "library";
      state.currentPlaylistId = null;
    }
    state.searchQuery = "";
    dom.searchInput.value = "";
    renderCurrentView();
    updateNavActiveState();
    dom.mainContent.scrollTop = 0;
  }

  function updateNavActiveState() {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === state.currentView));
    document.querySelectorAll(".playlist-nav-item").forEach((item) => {
      item.classList.toggle("active", state.currentView === "playlist" && item.dataset.playlistId === state.currentPlaylistId);
    });
  }

  function tracksForCurrentView() {
    if (state.currentView === "favorites") return state.tracks.filter((track) => state.favorites.has(track.id));
    if (state.currentView === "recent") return idsToTracks(state.recent);
    if (state.currentView === "playlist") return idsToTracks(state.playlists[state.currentPlaylistId]?.trackIds || []);
    return [...state.tracks];
  }

  function getVisibleTracks() {
    let tracks = tracksForCurrentView();
    if (state.searchQuery) {
      const query = state.searchQuery.toLocaleLowerCase();
      tracks = tracks.filter((track) => [track.title, track.artist, track.album, track.genre, track.sourcePath].some((value) => String(value || "").toLocaleLowerCase().includes(query)));
    }
    return sortTracks(tracks);
  }

  function sortTracks(tracks) {
    const output = [...tracks];
    if (state.sortMode === "title") output.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    else if (state.sortMode === "artist") output.sort((a, b) => a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" }) || a.title.localeCompare(b.title));
    else if (state.sortMode === "album") output.sort((a, b) => a.album.localeCompare(b.album, undefined, { sensitivity: "base" }) || a.title.localeCompare(b.title));
    else output.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    return output;
  }

  function renderCurrentView() {
    const tracks = getVisibleTracks();
    let eyebrow = "Library";
    let title = "Songs";
    let emptyTitle = "No music yet";
    let emptyCopy = "Drop files here, or import individual tracks, folders, and ZIP archives.";

    if (state.currentView === "favorites") {
      eyebrow = "Library";
      title = "Favorites";
      emptyTitle = "No favorites";
      emptyCopy = "Use the heart action on a track to keep it here.";
    } else if (state.currentView === "recent") {
      eyebrow = "History";
      title = "Recent";
      emptyTitle = "Nothing played yet";
      emptyCopy = "Tracks appear here after you play them.";
    } else if (state.currentView === "playlist") {
      eyebrow = "Playlist";
      title = state.playlists[state.currentPlaylistId]?.name || "Playlist";
      emptyTitle = "Empty playlist";
      emptyCopy = "Open a track menu and add music to this playlist.";
    }

    if (state.searchQuery) {
      eyebrow = "Search";
      title = `Results for “${state.searchQuery}”`;
      emptyTitle = "No matches";
      emptyCopy = "Try a title, artist, album, genre, or filename.";
    }

    dom.viewEyebrow.textContent = eyebrow;
    dom.viewTitle.textContent = title;
    dom.viewSubtitle.textContent = `${tracks.length} track${tracks.length === 1 ? "" : "s"}`;
    dom.libraryCount.textContent = String(state.tracks.length);
    dom.deletePlaylistButton.hidden = state.currentView !== "playlist" || Boolean(state.searchQuery);
    dom.viewPlayButton.disabled = tracks.length === 0;
    dom.viewShuffleButton.disabled = tracks.length === 0;
    dom.contentSections.hidden = tracks.length === 0;
    dom.emptyState.hidden = tracks.length > 0;

    if (tracks.length) dom.contentSections.innerHTML = renderTrackTable(tracks);
    else renderEmpty(emptyTitle, emptyCopy, state.currentView === "library" && !state.searchQuery);

    updateNavActiveState();
    updateActiveTrackIndicators();
  }

  function renderLoading() {
    dom.contentSections.hidden = false;
    dom.emptyState.hidden = true;
    dom.contentSections.innerHTML = '<div style="padding:30px 10px;color:var(--muted)">Opening local library…</div>';
  }

  function renderEmpty(title, copy, showImport = true) {
    dom.emptyTitle.textContent = title;
    dom.emptyCopy.textContent = copy;
    dom.emptyUploadButton.hidden = !showImport;
  }

  function renderTrackTable(tracks) {
    return `
      <table class="track-table">
        <thead><tr><th>#</th><th>Title</th><th>Album</th><th>Source</th><th>Time</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${tracks.map((track, index) => renderTrackRow(track, index)).join("")}</tbody>
      </table>`;
  }

  function renderTrackRow(track, index) {
    return `
      <tr class="track-row" data-track-id="${escapeAttribute(track.id)}">
        <td class="track-index">
          <span class="track-index-number">${index + 1}</span>
          <button class="row-play" type="button" data-action="play" aria-label="Play ${escapeAttribute(track.title)}">
            <span class="play-triangle">${ICONS.play}</span><span class="pause-bars">${ICONS.pause}</span>
          </button>
        </td>
        <td>
          <div class="title-cell">
            ${renderArtwork(track, "track-art")}
            <div class="track-copy"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></div>
          </div>
        </td>
        <td class="cell-muted" title="${escapeAttribute(track.album)}">${escapeHtml(track.album)}</td>
        <td class="cell-muted" title="${escapeAttribute(track.sourcePath || "")}">${escapeHtml(shortSourcePath(track.sourcePath))}</td>
        <td class="cell-muted">${formatTime(track.duration)}</td>
        <td><button class="icon-button track-menu-button" type="button" data-action="menu" aria-label="Track actions">${ICONS.more}</button></td>
      </tr>`;
  }

  function renderArtwork(track, className) {
    if (track.artwork) return `<div class="${className}"><img src="${escapeAttribute(track.artwork)}" alt="" /></div>`;
    return `<div class="${className}" style="${fallbackArtStyle(track.album || track.title)}">${ICONS.music}</div>`;
  }

  function fallbackArtStyle(seed) {
    const hue = Math.abs(hashString(seed || "music")) % 360;
    return `background:linear-gradient(145deg,hsl(${hue} 22% 33%),hsl(${(hue + 32) % 360} 18% 18%))`;
  }

  function handleContentClick(event) {
    const actionButton = event.target.closest("[data-action]");
    const row = event.target.closest("[data-track-id]");
    if (!row) return;
    const id = row.dataset.trackId;

    if (!actionButton) return;
    const action = actionButton.dataset.action;
    if (action === "play") {
      if (state.currentTrackId === id) togglePlayPause();
      else {
        const tracks = getVisibleTracks();
        startPlayback(tracks, Math.max(0, tracks.findIndex((track) => track.id === id)));
      }
    } else if (action === "menu") {
      showTrackContextMenu(id, actionButton);
    }
  }

  function startPlayback(tracks, index = 0, forceShuffle = false) {
    if (!tracks.length) return;
    let ids = tracks.map((track) => track.id);
    if (forceShuffle || state.shuffle) {
      const selected = ids[index] || ids[0];
      ids = shuffleArray(ids.filter((id) => id !== selected));
      ids.unshift(selected);
      index = 0;
    }
    state.queue = ids;
    state.queueIndex = Math.min(Math.max(index, 0), ids.length - 1);
    playTrackById(state.queue[state.queueIndex]);
    renderQueue();
  }

  async function playTrackById(id, autoplay = true) {
    const track = getTrack(id);
    if (!track) return;

    if (state.currentObjectUrl) URL.revokeObjectURL(state.currentObjectUrl);
    state.currentObjectUrl = URL.createObjectURL(track.blob);
    state.currentTrackId = id;
    const queueIndex = state.queue.indexOf(id);
    if (queueIndex >= 0) state.queueIndex = queueIndex;
    else {
      state.queue = [id];
      state.queueIndex = 0;
    }

    dom.audioElement.src = state.currentObjectUrl;
    dom.audioElement.load();
    track.lastPlayedAt = Date.now();
    putTrack(track).catch(() => {});
    addToRecent(id);
    updatePlayerUi();
    updateMediaSessionMetadata(track);
    renderQueue();
    renderCurrentView();

    if (autoplay) {
      try { await dom.audioElement.play(); }
      catch (error) {
        if (error?.name !== "AbortError") showToast("Playback was blocked. Press play to continue.", "error");
      }
    }
  }

  function togglePlayPause() {
    if (!state.currentTrackId) {
      const tracks = getVisibleTracks();
      if (tracks.length) startPlayback(tracks, 0);
      return;
    }
    if (dom.audioElement.paused) dom.audioElement.play().catch(() => showToast("This file could not be played.", "error"));
    else dom.audioElement.pause();
  }

  function playPrevious() {
    if (dom.audioElement.currentTime > 4) {
      dom.audioElement.currentTime = 0;
      return;
    }
    if (!state.queue.length) return;
    state.queueIndex = state.queueIndex > 0 ? state.queueIndex - 1 : (state.repeatMode === "all" ? state.queue.length - 1 : 0);
    playTrackById(state.queue[state.queueIndex]);
  }

  function playNext(fromEnded = false) {
    if (!state.queue.length) return;
    if (state.repeatMode === "one" && fromEnded) {
      dom.audioElement.currentTime = 0;
      dom.audioElement.play();
      return;
    }
    if (state.queueIndex < state.queue.length - 1) {
      state.queueIndex += 1;
      playTrackById(state.queue[state.queueIndex]);
    } else if (state.repeatMode === "all") {
      state.queueIndex = 0;
      playTrackById(state.queue[0]);
    } else {
      dom.audioElement.pause();
      dom.audioElement.currentTime = 0;
    }
  }

  const handleTrackEnded = () => playNext(true);

  function toggleShuffle() {
    state.shuffle = !state.shuffle;
    if (state.shuffle && state.queue.length > 1) {
      const current = state.currentTrackId;
      state.queue = [current, ...shuffleArray(state.queue.filter((id) => id !== current))].filter(Boolean);
      state.queueIndex = current ? 0 : -1;
      renderQueue();
    }
    savePreferences();
    updateShuffleUi();
  }

  function cycleRepeatMode() {
    state.repeatMode = state.repeatMode === "off" ? "all" : state.repeatMode === "all" ? "one" : "off";
    savePreferences();
    updateRepeatUi();
  }

  function handleLoadedMetadata() {
    dom.seekRange.max = String(dom.audioElement.duration || 0);
    dom.durationTime.textContent = formatTime(dom.audioElement.duration);
    updateProgress();
  }

  function updateProgress() {
    dom.seekRange.value = String(dom.audioElement.currentTime || 0);
    dom.currentTime.textContent = formatTime(dom.audioElement.currentTime);
    updateRangeVisual(dom.seekRange);
    updateMediaSessionPositionState();
  }

  function seekAudio() {
    dom.audioElement.currentTime = Number(dom.seekRange.value);
    updateRangeVisual(dom.seekRange);
  }

  function updateVolume() {
    dom.audioElement.volume = Number(dom.volumeRange.value);
    dom.audioElement.muted = false;
    localStorage.setItem("localtone-volume", String(dom.audioElement.volume));
    updateVolumeUi();
  }

  function toggleMute() { dom.audioElement.muted = !dom.audioElement.muted; }

  function updateVolumeUi() {
    dom.muteButton.classList.toggle("muted", dom.audioElement.muted || dom.audioElement.volume === 0);
    dom.muteButton.title = dom.audioElement.muted ? "Unmute" : "Mute";
    updateRangeVisual(dom.volumeRange);
  }

  function updateRangeVisual(input) {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value || 0);
    const percentage = max > min ? ((value - min) / (max - min)) * 100 : 0;
    input.style.setProperty("--value", `${Math.min(100, Math.max(0, percentage))}%`);
  }

  function updatePlayerUi() {
    const track = getTrack(state.currentTrackId);
    if (!track) {
      dom.playerTitle.textContent = "Nothing playing";
      dom.playerArtist.textContent = "Import music to begin";
      dom.playerArt.innerHTML = ICONS.music;
      dom.playerArt.removeAttribute("style");
      dom.playerFavoriteButton.classList.remove("active");
      dom.currentTime.textContent = "0:00";
      dom.durationTime.textContent = "0:00";
      dom.seekRange.value = "0";
      dom.seekRange.max = "100";
      updateRangeVisual(dom.seekRange);
    } else {
      dom.playerTitle.textContent = track.title;
      dom.playerArtist.textContent = `${track.artist}${track.album && track.album !== "Unknown album" ? ` · ${track.album}` : ""}`;
      dom.playerArt.innerHTML = track.artwork ? `<img src="${escapeAttribute(track.artwork)}" alt="" />` : ICONS.music;
      dom.playerArt.style.cssText = track.artwork ? "" : fallbackArtStyle(track.album || track.title);
      dom.playerFavoriteButton.classList.toggle("active", state.favorites.has(track.id));
      dom.playerFavoriteButton.title = state.favorites.has(track.id) ? "Remove favorite" : "Favorite";
    }
    updateShuffleUi();
    updateRepeatUi();
    updateActiveTrackIndicators();
  }

  function enablePlayerControls(enabled) {
    [dom.playPauseButton, dom.previousButton, dom.nextButton, dom.shuffleButton, dom.repeatButton, dom.queueButton, dom.muteButton, dom.volumeRange, dom.seekRange].forEach((element) => { element.disabled = !enabled; });
    dom.playerFavoriteButton.disabled = !enabled || !state.currentTrackId;
  }

  function updateShuffleUi() {
    dom.shuffleButton.classList.toggle("active", state.shuffle);
    dom.shuffleButton.title = state.shuffle ? "Shuffle on" : "Shuffle";
  }

  function updateRepeatUi() {
    dom.repeatButton.classList.toggle("active", state.repeatMode !== "off");
    dom.repeatButton.classList.toggle("repeat-one-active", state.repeatMode === "one");
    dom.repeatButton.title = state.repeatMode === "one" ? "Repeat one" : state.repeatMode === "all" ? "Repeat all" : "Repeat off";
  }

  function updateActiveTrackIndicators() {
    const playing = !dom.audioElement.paused;
    document.querySelectorAll("[data-track-id]").forEach((row) => {
      const active = row.dataset.trackId === state.currentTrackId;
      row.classList.toggle("active", active);
      row.classList.toggle("is-playing", active && playing);
    });
    dom.playerFavoriteButton.disabled = !state.currentTrackId;
    renderQueueActiveOnly();
  }

  function toggleFavorite(id) {
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    savePreferences();
    updatePlayerUi();
    renderCurrentView();
  }

  function addToRecent(id) {
    state.recent = [id, ...state.recent.filter((item) => item !== id)].slice(0, 150);
    savePreferences();
  }

  function openNewPlaylistDialog() {
    dom.playlistNameInput.value = "";
    openDialog(dom.playlistModal);
    setTimeout(() => dom.playlistNameInput.focus(), 50);
  }

  function createPlaylistInternal(name, trackIds = [], render = true) {
    const uniqueName = uniquePlaylistName(name || "Playlist");
    const id = makeId();
    state.playlists[id] = { id, name: uniqueName, trackIds: [...new Set(trackIds)], createdAt: Date.now() };
    savePreferences();
    if (render) renderPlaylistNav();
    return id;
  }

  function uniquePlaylistName(name) {
    const base = name.trim() || "Playlist";
    const used = new Set(Object.values(state.playlists).map((playlist) => playlist.name.toLocaleLowerCase()));
    if (!used.has(base.toLocaleLowerCase())) return base;
    let number = 2;
    while (used.has(`${base} ${number}`.toLocaleLowerCase())) number += 1;
    return `${base} ${number}`;
  }

  function renderPlaylistNav() {
    const playlists = Object.values(state.playlists).sort((a, b) => a.name.localeCompare(b.name));
    dom.playlistNav.innerHTML = playlists.map((playlist) => `
      <a class="playlist-nav-item ${state.currentView === "playlist" && state.currentPlaylistId === playlist.id ? "active" : ""}" href="#playlist=${encodeURIComponent(playlist.id)}" data-playlist-id="${escapeAttribute(playlist.id)}">
        <span>${escapeHtml(playlist.name)}</span>
      </a>`).join("");
  }

  function deleteCurrentPlaylist() {
    const playlist = state.playlists[state.currentPlaylistId];
    if (!playlist) return;
    if (!confirm(`Delete playlist “${playlist.name}”? The tracks will stay in your library.`)) return;
    delete state.playlists[state.currentPlaylistId];
    savePreferences();
    renderPlaylistNav();
    location.hash = "library";
    showToast("Playlist deleted.");
  }

  function openAddToPlaylist(id) {
    state.selectedTrackId = id;
    const playlists = Object.values(state.playlists).sort((a, b) => a.name.localeCompare(b.name));
    if (!playlists.length) {
      openNewPlaylistDialog();
      showToast("Create a playlist first.", "info");
      return;
    }
    dom.playlistPicker.innerHTML = playlists.map((playlist) => {
      const contains = playlist.trackIds.includes(id);
      return `<button class="playlist-picker-button" type="button" data-picker-playlist-id="${escapeAttribute(playlist.id)}">
        <span class="playlist-picker-icon">${contains ? ICONS.check : ICONS.playlist}</span>
        <span class="playlist-picker-copy"><strong>${escapeHtml(playlist.name)}</strong><small>${playlist.trackIds.length} track${playlist.trackIds.length === 1 ? "" : "s"}${contains ? " · Already added" : ""}</small></span>
      </button>`;
    }).join("");
    dom.playlistPicker.onclick = (event) => {
      const button = event.target.closest("[data-picker-playlist-id]");
      if (!button) return;
      addTrackToPlaylist(button.dataset.pickerPlaylistId, id);
      dom.addToPlaylistModal.close();
    };
    openDialog(dom.addToPlaylistModal);
  }

  function addTrackToPlaylist(playlistId, trackId) {
    const playlist = state.playlists[playlistId];
    if (!playlist) return;
    if (playlist.trackIds.includes(trackId)) showToast("That track is already in the playlist.", "info");
    else {
      playlist.trackIds.push(trackId);
      savePreferences();
      showToast(`Added to “${playlist.name}”.`);
      if (state.currentView === "playlist" && state.currentPlaylistId === playlistId) renderCurrentView();
    }
  }

  function removeFromCurrentPlaylist(trackId) {
    const playlist = state.playlists[state.currentPlaylistId];
    if (!playlist) return;
    playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
    savePreferences();
    renderCurrentView();
    showToast(`Removed from “${playlist.name}”.`);
  }

  function showTrackContextMenu(id, anchor) {
    state.selectedTrackId = id;
    const favorite = state.favorites.has(id);
    const inPlaylist = state.currentView === "playlist" && state.playlists[state.currentPlaylistId]?.trackIds.includes(id);
    dom.contextMenu.innerHTML = `
      <button type="button" data-context-action="play-next">${ICONS.next}<span>Play next</span></button>
      <button type="button" data-context-action="add-playlist">${ICONS.playlist}<span>Add to playlist</span></button>
      ${inPlaylist ? `<button type="button" data-context-action="remove-playlist">${ICONS.trash}<span>Remove from playlist</span></button>` : ""}
      <button type="button" data-context-action="favorite">${ICONS.heart}<span>${favorite ? "Remove favorite" : "Add favorite"}</span></button>
      <hr />
      <button class="danger" type="button" data-context-action="delete">${ICONS.trash}<span>Delete from library</span></button>`;
    dom.contextMenu.onclick = handleContextMenuAction;
    dom.contextMenu.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const menuRect = dom.contextMenu.getBoundingClientRect();
    dom.contextMenu.style.left = `${Math.min(window.innerWidth - menuRect.width - 10, Math.max(10, rect.right - menuRect.width))}px`;
    dom.contextMenu.style.top = `${Math.min(window.innerHeight - menuRect.height - 10, Math.max(10, rect.bottom + 6))}px`;
  }

  function hideContextMenu() { dom.contextMenu.hidden = true; }

  function handleContextMenuAction(event) {
    const button = event.target.closest("[data-context-action]");
    if (!button || !state.selectedTrackId) return;
    const id = state.selectedTrackId;
    const action = button.dataset.contextAction;
    hideContextMenu();
    if (action === "play-next") addTrackNext(id);
    else if (action === "add-playlist") openAddToPlaylist(id);
    else if (action === "remove-playlist") removeFromCurrentPlaylist(id);
    else if (action === "favorite") toggleFavorite(id);
    else if (action === "delete") deleteTrack(id);
  }

  function addTrackNext(id) {
    state.queue = state.queue.filter((trackId) => trackId !== id);
    const insertAt = Math.max(0, state.queueIndex + 1);
    state.queue.splice(insertAt, 0, id);
    if (!state.currentTrackId) state.queueIndex = -1;
    renderQueue();
    showToast("Added to play next.");
  }

  async function deleteTrack(id) {
    const track = getTrack(id);
    if (!track || !confirm(`Delete “${track.title}” from this browser?`)) return;
    try {
      await deleteTrackRecord(id);
      state.tracks = state.tracks.filter((item) => item.id !== id);
      state.favorites.delete(id);
      state.recent = state.recent.filter((item) => item !== id);
      state.queue = state.queue.filter((item) => item !== id);
      Object.values(state.playlists).forEach((playlist) => { playlist.trackIds = playlist.trackIds.filter((item) => item !== id); });
      if (state.currentTrackId === id) resetPlayer();
      savePreferences();
      enablePlayerControls(state.tracks.length > 0);
      updatePlayerUi();
      renderQueue();
      renderCurrentView();
      showToast("Track deleted.");
    } catch (error) {
      console.error(error);
      showToast("The track could not be deleted.", "error");
    }
  }

  function resetPlayer() {
    dom.audioElement.pause();
    dom.audioElement.removeAttribute("src");
    dom.audioElement.load();
    if (state.currentObjectUrl) URL.revokeObjectURL(state.currentObjectUrl);
    state.currentObjectUrl = null;
    state.currentTrackId = null;
    state.queue = [];
    state.queueIndex = -1;
  }

  function toggleQueue() {
    const open = !dom.queuePanel.classList.contains("open");
    dom.queuePanel.classList.toggle("open", open);
    dom.queuePanel.setAttribute("aria-hidden", String(!open));
    if (open) renderQueue();
  }

  function closeQueue() {
    dom.queuePanel.classList.remove("open");
    dom.queuePanel.setAttribute("aria-hidden", "true");
  }

  function renderQueue() {
    const tracks = idsToTracks(state.queue);
    if (!tracks.length) {
      dom.queueList.innerHTML = '<div class="queue-empty">Queue is empty</div>';
      return;
    }
    dom.queueList.innerHTML = tracks.map((track, index) => `
      <div class="queue-item ${track.id === state.currentTrackId ? "active" : ""}" data-queue-track-id="${escapeAttribute(track.id)}">
        ${renderArtwork(track, "queue-art")}
        <div class="queue-meta"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></div>
        <span class="queue-index">${index + 1}</span>
      </div>`).join("");
  }

  function renderQueueActiveOnly() {
    dom.queueList.querySelectorAll("[data-queue-track-id]").forEach((item) => item.classList.toggle("active", item.dataset.queueTrackId === state.currentTrackId));
  }

  function handlePlaybackError() {
    if (state.currentTrackId) showToast("This browser cannot play the selected file codec.", "error");
  }

  async function exportLibraryData() {
    dom.dataMenu.open = false;
    if (!window.JSZip) {
      showToast("Backup support is unavailable.", "error");
      return;
    }
    if (!state.tracks.length && !Object.keys(state.playlists).length) {
      showToast("There is no library data to export.", "info");
      return;
    }

    const toast = showToast("Building backup…", "progress", 0);
    try {
      const zip = new window.JSZip();
      const trackManifest = [];
      state.tracks.forEach((track, index) => {
        const extension = extensionFromTrack(track);
        const filePath = `tracks/${String(index + 1).padStart(5, "0")}-${sanitizeFileName(track.title || "track")}.${extension}`;
        zip.file(filePath, track.blob, { binary: true, compression: "STORE" });
        const { blob, ...metadata } = track;
        trackManifest.push({ ...metadata, filePath });
      });

      const manifest = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        tracks: trackManifest,
        preferences: {
          favorites: [...state.favorites],
          recent: state.recent,
          playlists: state.playlists,
          shuffle: state.shuffle,
          repeatMode: state.repeatMode,
          sortMode: state.sortMode,
          volume: dom.audioElement.volume
        }
      };
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, (progress) => updateToast(toast, `Building backup… ${Math.round(progress.percent)}%`));
      downloadBlob(blob, `music-library-${new Date().toISOString().slice(0, 10)}.zip`);
      removeToast(toast);
      showToast(`Exported ${state.tracks.length} track${state.tracks.length === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error(error);
      removeToast(toast);
      showToast("The backup could not be created.", "error");
    }
  }

  async function restoreBackup(file, mode) {
    if (!window.JSZip) {
      showToast("Backup support is unavailable.", "error");
      return;
    }
    const toast = showToast("Opening backup…", "progress", 0);
    try {
      const zip = await window.JSZip.loadAsync(file);
      const manifestEntry = zip.file("manifest.json");
      if (!manifestEntry) throw new Error("Missing manifest");
      const manifest = JSON.parse(await manifestEntry.async("string"));
      if (manifest.format !== BACKUP_FORMAT || Number(manifest.version) > BACKUP_VERSION || !Array.isArray(manifest.tracks)) throw new Error("Unsupported backup format");

      if (mode === "replace") {
        updateToast(toast, "Clearing current library…");
        resetPlayer();
        await clearTrackStore();
        state.tracks = [];
        state.favorites.clear();
        state.recent = [];
        state.playlists = {};
      }

      const existingByFingerprint = new Map(state.tracks.map((track) => [track.fingerprint, track]));
      const existingIds = new Set(state.tracks.map((track) => track.id));
      const idMap = new Map();
      const restored = [];
      let skipped = 0;

      for (let index = 0; index < manifest.tracks.length; index += 1) {
        const source = manifest.tracks[index];
        updateToast(toast, `Restoring ${index + 1} of ${manifest.tracks.length}: ${source.title || "Track"}`);
        const existing = source.fingerprint ? existingByFingerprint.get(source.fingerprint) : null;
        if (existing) {
          idMap.set(source.id, existing.id);
          skipped += 1;
          continue;
        }
        const entry = zip.file(source.filePath || "");
        if (!entry) {
          skipped += 1;
          continue;
        }
        const rawBlob = await entry.async("blob");
        const blob = new Blob([rawBlob], { type: source.mime || inferMimeType(source.filePath || "") });
        let id = source.id && !existingIds.has(source.id) ? source.id : makeId();
        while (existingIds.has(id)) id = makeId();
        existingIds.add(id);
        const record = {
          id,
          fingerprint: source.fingerprint || `restore:${id}:${blob.size}`,
          title: cleanText(source.title) || stripExtension((source.filePath || "track").split("/").pop()),
          artist: cleanText(source.artist) || "Unknown artist",
          album: cleanText(source.album) || "Unknown album",
          year: cleanText(source.year),
          genre: cleanText(source.genre),
          artwork: cleanText(source.artwork),
          blob,
          mime: source.mime || blob.type,
          size: blob.size,
          duration: Number(source.duration) || 0,
          sourcePath: cleanText(source.sourcePath) || (source.filePath || "").split("/").pop(),
          addedAt: Number(source.addedAt) || Date.now(),
          lastPlayedAt: Number(source.lastPlayedAt) || 0
        };
        await putTrack(record);
        restored.push(record);
        existingByFingerprint.set(record.fingerprint, record);
        idMap.set(source.id, id);
      }

      state.tracks.push(...restored);
      applyBackupPreferences(manifest.preferences || {}, idMap, mode);
      savePreferences();
      enablePlayerControls(state.tracks.length > 0);
      renderPlaylistNav();
      renderCurrentView();
      updatePlayerUi();
      removeToast(toast);
      showToast(`Restored ${restored.length} track${restored.length === 1 ? "" : "s"}${skipped ? ` · ${skipped} already present or missing` : ""}.`);
    } catch (error) {
      console.error(error);
      removeToast(toast);
      showToast("This is not a valid music-player backup.", "error");
    }
  }

  function applyBackupPreferences(preferences, idMap, mode) {
    const remapIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map((id) => idMap.get(id)).filter(Boolean))];
    const importedFavorites = remapIds(preferences.favorites);
    const importedRecent = remapIds(preferences.recent);

    if (mode === "replace") {
      state.favorites = new Set(importedFavorites);
      state.recent = importedRecent;
      state.playlists = {};
      state.shuffle = Boolean(preferences.shuffle);
      state.repeatMode = ["off", "all", "one"].includes(preferences.repeatMode) ? preferences.repeatMode : "off";
      state.sortMode = ["added", "title", "artist", "album"].includes(preferences.sortMode) ? preferences.sortMode : "added";
      dom.sortSelect.value = state.sortMode;
      if (Number.isFinite(Number(preferences.volume))) {
        dom.audioElement.volume = Math.min(1, Math.max(0, Number(preferences.volume)));
        dom.volumeRange.value = String(dom.audioElement.volume);
        localStorage.setItem("localtone-volume", String(dom.audioElement.volume));
        updateRangeVisual(dom.volumeRange);
      }
    } else {
      importedFavorites.forEach((id) => state.favorites.add(id));
      state.recent = [...new Set([...importedRecent, ...state.recent])].slice(0, 150);
    }

    const sourcePlaylists = preferences.playlists && typeof preferences.playlists === "object" ? Object.values(preferences.playlists) : [];
    sourcePlaylists.forEach((playlist) => {
      const ids = remapIds(playlist.trackIds);
      const id = mode === "replace" && playlist.id && !state.playlists[playlist.id] ? playlist.id : makeId();
      state.playlists[id] = {
        id,
        name: mode === "replace" ? (playlist.name || "Playlist") : uniquePlaylistName(playlist.name || "Playlist"),
        trackIds: ids,
        createdAt: Number(playlist.createdAt) || Date.now()
      };
    });
  }

  function handleKeyboardShortcuts(event) {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    if (event.key === "/" && !typing) {
      event.preventDefault();
      dom.searchInput.focus();
      return;
    }
    if (typing) return;
    if (event.code === "Space") {
      event.preventDefault();
      togglePlayPause();
    } else if (event.key === "ArrowRight") dom.audioElement.currentTime = Math.min(dom.audioElement.duration || Infinity, dom.audioElement.currentTime + 10);
    else if (event.key === "ArrowLeft") dom.audioElement.currentTime = Math.max(0, dom.audioElement.currentTime - 10);
    else if (event.key.toLowerCase() === "m") toggleMute();
    else if (event.key.toLowerCase() === "s") toggleShuffle();
    else if (event.key.toLowerCase() === "r") cycleRepeatMode();
    else if (event.key.toLowerCase() === "u") openDialog(dom.uploadModal);
    else if (event.key === "Escape") { closeQueue(); hideContextMenu(); }
  }

  function handleDragEnter(event) {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    state.dragDepth += 1;
    dom.dropOverlay.classList.add("visible");
    dom.dropOverlay.setAttribute("aria-hidden", "false");
  }

  function handleDragOver(event) {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event) {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    state.dragDepth = Math.max(0, state.dragDepth - 1);
    if (state.dragDepth === 0) hideDropOverlay();
  }

  async function handleDrop(event) {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    state.dragDepth = 0;
    hideDropOverlay();
    const files = await filesFromDataTransfer(event.dataTransfer);
    if (files.length) await prepareImport(files, "mixed");
  }

  function hideDropOverlay() {
    dom.dropOverlay.classList.remove("visible");
    dom.dropOverlay.setAttribute("aria-hidden", "true");
  }

  const hasFiles = (dataTransfer) => Array.from(dataTransfer?.types || []).includes("Files");

  async function filesFromDataTransfer(dataTransfer) {
    const items = Array.from(dataTransfer.items || []);
    const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return Array.from(dataTransfer.files || []);
    const files = [];
    for (const entry of entries) files.push(...await traverseEntry(entry, ""));
    return files;
  }

  function traverseEntry(entry, path) {
    return new Promise((resolve, reject) => {
      if (entry.isFile) {
        entry.file((file) => {
          defineFileProperty(file, "localtonePath", `${path}${file.name}`);
          resolve([file]);
        }, reject);
        return;
      }
      if (entry.isDirectory) {
        const reader = entry.createReader();
        const allEntries = [];
        const readBatch = () => {
          reader.readEntries(async (batch) => {
            if (!batch.length) {
              const nested = [];
              for (const child of allEntries) nested.push(...await traverseEntry(child, `${path}${entry.name}/`));
              resolve(nested);
              return;
            }
            allEntries.push(...batch);
            readBatch();
          }, reject);
        };
        readBatch();
        return;
      }
      resolve([]);
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    navigator.serviceWorker.register("./service-worker.js").catch((error) => console.warn("Service worker registration failed", error));
  }

  function setupMediaSessionHandlers() {
    if (!("mediaSession" in navigator)) return;
    const safeSet = (action, handler) => { try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {} };
    safeSet("play", () => dom.audioElement.play());
    safeSet("pause", () => dom.audioElement.pause());
    safeSet("previoustrack", playPrevious);
    safeSet("nexttrack", () => playNext(false));
    safeSet("seekbackward", (details) => { dom.audioElement.currentTime = Math.max(0, dom.audioElement.currentTime - (details.seekOffset || 10)); });
    safeSet("seekforward", (details) => { dom.audioElement.currentTime = Math.min(dom.audioElement.duration || Infinity, dom.audioElement.currentTime + (details.seekOffset || 10)); });
    safeSet("seekto", (details) => {
      if (details.fastSeek && "fastSeek" in dom.audioElement) dom.audioElement.fastSeek(details.seekTime);
      else dom.audioElement.currentTime = details.seekTime;
    });
  }

  function updateMediaSessionMetadata(track) {
    if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: track.artwork ? [{ src: track.artwork }] : [{ src: "assets/icon.svg", type: "image/svg+xml" }]
    });
  }

  function updateMediaSessionPlaybackState(value) {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = value;
  }

  function updateMediaSessionPositionState() {
    if (!("mediaSession" in navigator) || typeof navigator.mediaSession.setPositionState !== "function") return;
    const duration = dom.audioElement.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({ duration, playbackRate: dom.audioElement.playbackRate, position: Math.min(duration, dom.audioElement.currentTime) });
    } catch (_) {}
  }

  function isZipFile(file) { return file.type === "application/zip" || file.name.toLowerCase().endsWith(".zip"); }
  function isSupportedMediaFile(file) { return Boolean(file && file.size >= 0 && (file.type.startsWith("audio/") || file.type === "video/mp4" || isSupportedName(file.name))); }
  function isSupportedName(name) { return SUPPORTED_EXTENSIONS.has(String(name).split(".").pop().toLowerCase()); }

  function inferMimeType(name, fallback = "") {
    if (fallback) return fallback;
    const extension = String(name).split(".").pop().toLowerCase();
    return ({ mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", flac: "audio/flac", opus: "audio/opus", webm: "audio/webm", mp4: "video/mp4" })[extension] || "application/octet-stream";
  }

  function makeFingerprint(file) { return `${file.name.toLowerCase()}::${file.size}::${file.lastModified || 0}`; }
  function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function zipGroupKey(file) { return `zip:${file.name}:${file.size}:${file.lastModified || 0}`; }
  function sourcePathForFile(file) { return file.webkitRelativePath || file.localtonePath || file.name || ""; }
  function sourceGroupKey(file) {
    if (file.localPlayerGroupKey) return file.localPlayerGroupKey;
    const path = sourcePathForFile(file);
    if (!path.includes("/")) return null;
    return `folder:${path.split("/").filter(Boolean)[0] || "Imported folder"}`;
  }
  function defineFileProperty(file, name, value) { try { Object.defineProperty(file, name, { value, configurable: true }); } catch (_) {} }

  function parseFileName(name) {
    const base = stripExtension(name).replace(/_/g, " ").trim();
    const parts = base.split(/\s+-\s+/);
    if (parts.length >= 2) return { artist: parts.shift().trim(), title: parts.join(" - ").trim() };
    return { artist: "", title: base || "Untitled track" };
  }
  function stripExtension(name) { return String(name || "").replace(/\.[^.]+$/, ""); }
  function cleanText(value) { return typeof value === "string" ? value.trim() : value ? String(value).trim() : ""; }
  function normalizeGenre(value) { return Array.isArray(value) ? value.filter(Boolean).join(", ") : cleanText(value); }
  function shortSourcePath(path) {
    const clean = String(path || "");
    const parts = clean.split("/").filter(Boolean);
    if (parts.length <= 2) return clean || "Local file";
    return `${parts[0]}/…/${parts[parts.length - 1]}`;
  }

  function extensionFromTrack(track) {
    const sourceExt = String(track.sourcePath || "").split(".").pop().toLowerCase();
    if (SUPPORTED_EXTENSIONS.has(sourceExt)) return sourceExt;
    const mimeMap = { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "video/mp4": "mp4", "audio/aac": "aac", "audio/ogg": "ogg", "audio/flac": "flac", "audio/opus": "opus", "audio/webm": "webm" };
    return mimeMap[track.mime] || "bin";
  }

  function sanitizeFileName(value) { return String(value || "track").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 100) || "track"; }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function getTrack(id) { return state.tracks.find((track) => track.id === id); }
  function idsToTracks(ids) { return ids.map(getTrack).filter(Boolean); }
  function shuffleArray(array) {
    const output = [...array];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [output[index], output[swap]] = [output[swap], output[index]];
    }
    return output;
  }
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const whole = Math.floor(seconds);
    const minutes = Math.floor(whole / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = hours ? String(minutes % 60).padStart(2, "0") : minutes;
    return `${hours ? `${hours}:` : ""}${remainingMinutes}:${String(whole % 60).padStart(2, "0")}`;
  }
  function hashString(value) {
    let hash = 0;
    for (let index = 0; index < String(value).length; index += 1) hash = ((hash << 5) - hash) + String(value).charCodeAt(index);
    return hash | 0;
  }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
  function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }

  function showToast(message, type = "info", duration = 3600) {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    dom.toastStack.appendChild(toast);
    if (duration > 0) setTimeout(() => removeToast(toast), duration);
    return toast;
  }
  function updateToast(toast, message) { if (toast?.isConnected) toast.textContent = message; }
  function removeToast(toast) { if (toast?.isConnected) toast.remove(); }
})();
