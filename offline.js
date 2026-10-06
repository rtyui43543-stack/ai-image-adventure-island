(() => {
  "use strict";
  const get = (id) => document.getElementById(id);
  const badge = get("offline-badge");
  const status = get("offline-status");
  const description = get("offline-description");
  const download = get("offline-download");
  const cancel = get("offline-cancel");
  const reload = get("offline-reload");
  const progress = get("offline-progress");
  const install = get("install-button");
  const guide = get("install-guide");
  if (!download) return;

  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let registration = null;
  let installPrompt = null;
  let busy = false;
  let ready = false;
  let supported = false;
  let expectedBytes = 0;
  let lastProgress = "";
  let lastSpokenPercent = -1;
  let activeDownload = null;
  const megabytes = (bytes) => `${(bytes / 1000000).toFixed(1)} MB`;
  const needsHomeScreen = () => isAppleMobile && !standalone();

  function setReady(value) {
    ready = Boolean(value);
    badge.dataset.ready = String(ready);
    badge.textContent = ready ? "可離線使用" : "尚未完整下載";
    download.textContent = ready ? "檢查並更新離線內容" : "下載離線內容";
  }

  function updateButtons() {
    download.disabled = !supported || busy || needsHomeScreen();
    cancel.hidden = !busy;
    cancel.disabled = false;
  }

  function worker() {
    return navigator.serviceWorker.controller || registration?.active;
  }

  // CHECK and CANCEL have a bounded response time; downloads renew their timeout
  // after each progress message, including resumable files already on the device.
  function request(type, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      const target = worker();
      if (!target) { reject(new Error("離線功能尚未就緒，請重新整理再試。")); return; }
      const channel = new MessageChannel();
      let timer;
      let settled = false;
      const timeout = type === "DOWNLOAD_OFFLINE" ? 120000 : 60000;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        channel.port1.close();
        if (error) reject(error); else resolve(result);
      };
      const renewTimeout = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (type === "DOWNLOAD_OFFLINE") request("CANCEL_DOWNLOAD").catch(() => {});
          finish(new Error("下載或檢查中斷，請保持畫面開啟，再按下載即可接續。"));
        }, timeout);
      };
      renewTimeout();
      channel.port1.onmessage = ({ data }) => {
        if (!data || typeof data.type !== "string") return;
        if (data.type === "PROGRESS") { renewTimeout(); onProgress(data); return; }
        if (data.type === "ERROR") { finish(new Error(data.message || "離線內容處理失敗，請稍後重試。")); return; }
        if (["COMPLETE", "STATUS", "CANCELLED"].includes(data.type)) finish(null, data);
      };
      try { target.postMessage({ type }, [channel.port2]); }
      catch (error) { finish(error); }
    });
  }

  async function checkOffline({ preserveStatus = false } = {}) {
    const result = await request("CHECK_OFFLINE");
    setReady(result.ready);
    expectedBytes = result.totalBytes || expectedBytes;
    if (!preserveStatus) {
      if (needsHomeScreen()) status.textContent = "請先加入主畫面，再從「生圖冒險島」圖示開啟並下載素材。";
      else if (ready) status.textContent = `完整內容已儲存${expectedBytes ? `（${megabytes(expectedBytes)}）` : ""}，現在可以離線使用。`;
      else status.textContent = `首次下載需要網路${expectedBytes ? `，約 ${megabytes(expectedBytes)}` : ""}。完成前請保持畫面開啟。`;
    }
    updateButtons();
    return result;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    install.hidden = standalone();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    install.hidden = true;
    status.textContent = "已加入主畫面，請從主畫面的圖示開啟，接著下載離線內容。";
  });
  install.addEventListener("click", async () => {
    if (!installPrompt) { guide.open = true; return; }
    const prompt = installPrompt;
    installPrompt = null;
    install.disabled = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (_) { guide.open = true; }
    finally { install.disabled = false; install.hidden = true; }
  });

  download.addEventListener("click", async () => {
    if (busy || !supported || needsHomeScreen()) return;
    busy = true;
    lastSpokenPercent = -1;
    updateButtons();
    progress.hidden = false;
    progress.removeAttribute("value");
    reload.hidden = true;
    status.textContent = "正在準備下載，請保持此畫面開啟…";
    try {
      // Storage persistence is optional and must never delay a cancellable download.
      try { if (navigator.storage?.persist) Promise.resolve(navigator.storage.persist()).catch(() => {}); } catch (_) { /* Optional. */ }
      activeDownload = request("DOWNLOAD_OFFLINE", (data) => {
        const totalBytes = data.totalBytes || expectedBytes;
        expectedBytes = totalBytes;
        const percent = totalBytes > 0 ? Math.min(100, Math.floor((data.completedBytes || 0) / totalBytes * 100)) : 0;
        progress.value = percent;
        lastProgress = `已下載 ${data.completed || 0}／${data.total || 0} 個檔案 · ${percent}%${totalBytes ? `（${megabytes(data.completedBytes || 0)}／${megabytes(totalBytes)}）` : ""}`;
        // Avoid announcing every file to screen readers while keeping progress visual.
        progress.setAttribute("aria-valuetext", lastProgress);
        if (percent >= lastSpokenPercent + 5 || percent === 100) { status.textContent = lastProgress; lastSpokenPercent = percent; }
      });
      const result = await activeDownload;
      if (result.type === "CANCELLED") {
        status.textContent = "已暫停下載。已完成的檔案會保留，下次可接續。";
        await checkOffline({ preserveStatus: true });
      } else {
        setReady(true);
        progress.value = 100;
        status.textContent = `完整內容下載完成（${megabytes(result.totalBytes || expectedBytes)}）。請按「重新開啟」，即可使用已下載版本。`;
        reload.hidden = false;
      }
    } catch (error) {
      status.textContent = error.message || "下載未完成，請確認網路與儲存空間後重試。";
      try { await checkOffline({ preserveStatus: true }); } catch (_) { setReady(false); }
    } finally {
      activeDownload = null;
      busy = false;
      progress.hidden = true;
      updateButtons();
    }
  });
  cancel.addEventListener("click", async () => {
    if (!busy) return;
    cancel.disabled = true;
    status.textContent = "正在暫停下載…";
    try { await request("CANCEL_DOWNLOAD"); }
    catch (error) { status.textContent = error.message; cancel.disabled = false; }
  });
  reload.addEventListener("click", () => window.location.reload());
  window.addEventListener("offline", () => {
    if (!busy && !ready && supported) status.textContent = "目前沒有網路，離線內容尚未齊全。請連網後完成下載。";
  });
  window.addEventListener("online", () => {
    if (!busy && supported) checkOffline().catch(() => {});
  });

  async function initialize() {
    if (window.location.protocol === "file:") {
      badge.textContent = "電腦資料夾版";
      description.textContent = "此資料夾已包含圖片、音樂與程式，可直接在電腦上體驗。";
      status.textContent = "手機、平板請由發布網址安裝；下載功能需要 HTTPS 網址。";
      download.hidden = true;
      return;
    }
    if (!window.isSecureContext || !("serviceWorker" in navigator) || !("caches" in window)) {
      badge.textContent = "請使用支援的瀏覽器";
      status.textContent = "離線安裝需要 HTTPS，以及較新版 Safari 或 Chrome。仍可線上體驗。";
      return;
    }
    try {
      registration = await navigator.serviceWorker.register(new URL("sw.js", document.baseURI), { scope: "./", updateViaCache: "none" });
      const waiting = navigator.serviceWorker.ready;
      let timer;
      try {
        registration = await Promise.race([waiting, new Promise((_, reject) => {
          timer = window.setTimeout(() => reject(new Error("離線功能啟動逾時，請重新整理再試。")), 30000);
        })]);
      } finally { window.clearTimeout(timer); }
      supported = true;
      if (needsHomeScreen()) guide.open = true;
      await checkOffline();
    } catch (error) {
      badge.textContent = "尚未完成離線準備";
      status.textContent = error.message || "離線功能暫時無法啟動，請連網後重新整理。";
      updateButtons();
    }
  }
  initialize();
})();
