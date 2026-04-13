(() => {
  const { FFmpeg } = FFmpegWASM;
  const { fetchFile, toBlobURL } = FFmpegUtil;

  const fileInput = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");
  const selectedFileEl = document.getElementById("selectedFile");
  const convertBtn = document.getElementById("convertBtn");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const statusEl = document.getElementById("status");

  const ffmpeg = new FFmpeg();
  let selectedFile = null;
  let isReady = false;
  let isConverting = false;

  function setStatus(text, mode = "") {
    statusEl.textContent = text;
    statusEl.classList.remove("error", "ok");
    if (mode) {
      statusEl.classList.add(mode);
    }
  }

  function safeNameWithoutExt(name) {
    const lastDot = name.lastIndexOf(".");
    return (lastDot > 0 ? name.slice(0, lastDot) : name).replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function setFile(file) {
    selectedFile = file;
    selectedFileEl.textContent = file ? `Selected: ${file.name}` : "No file selected";
    convertBtn.disabled = !(file && isReady && !isConverting);
  }

  async function init() {
    try {
      const baseURLs = [
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd",
        "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd"
      ];

      ffmpeg.on("progress", ({ progress }) => {
        const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
        progressBar.value = pct;
        progressText.textContent = `${pct}%`;
      });

      let loaded = false;
      let lastErr = null;

      for (const baseURL of baseURLs) {
        try {
          await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
            workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, "text/javascript")
          });
          loaded = true;
          break;
        } catch (err) {
          lastErr = err;
        }
      }

      if (!loaded) {
        throw lastErr || new Error("Unable to load ffmpeg core files");
      }

      isReady = true;
      setStatus("Converter is ready.", "ok");
      convertBtn.disabled = !selectedFile;
    } catch (err) {
      console.error(err);
      setStatus("Failed to load ffmpeg core. Refresh and disable ad-block/VPN if active.", "error");
    }
  }

  async function convert() {
    if (!selectedFile || !isReady || isConverting) {
      return;
    }

    isConverting = true;
    convertBtn.disabled = true;
    progressBar.value = 0;
    progressText.textContent = "0%";
    setStatus("Converting...");

    const inputName = `input_${Date.now()}`;
    const outputName = "output_converted.wav";

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(selectedFile));

      await ffmpeg.exec([
        "-i", inputName,
        "-ac", "1",
        "-ar", "8000",
        "-acodec", "pcm_s16le",
        outputName
      ]);

      const outData = await ffmpeg.readFile(outputName);
      const blob = new Blob([outData.buffer], { type: "audio/wav" });

      const stem = safeNameWithoutExt(selectedFile.name);
      const downloadName = `${stem}_converted.wav`;
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStatus(`Done. Download started: ${downloadName}`, "ok");
      progressBar.value = 100;
      progressText.textContent = "100%";

      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch (err) {
      console.error(err);
      setStatus("Conversion failed. Try another file.", "error");
    } finally {
      isConverting = false;
      convertBtn.disabled = !(selectedFile && isReady);
    }
  }

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0] || null;
    setFile(file);
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const file = e.dataTransfer?.files?.[0] || null;
    if (file) {
      fileInput.files = e.dataTransfer.files;
      setFile(file);
    }
  });

  convertBtn.addEventListener("click", convert);

  init();
})();
