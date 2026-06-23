(function () {
  const projects = Array.isArray(window.DELIVERY_PROJECTS) ? window.DELIVERY_PROJECTS : DELIVERY_PROJECTS;
  const apiKey = window.DRIVE_API_KEY || DRIVE_API_KEY;

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function normalizeDriveImage(value) {
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return driveMediaUrl(value);
  }

  function driveMediaUrl(fileId) {
    return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(apiKey)}`;
  }

  function projectUrl(project) {
    return `template.html?project=${encodeURIComponent(project.slug)}`;
  }

  function getProjectSlug() {
    const params = new URLSearchParams(window.location.search);
    return params.get("project") || params.get("slug") || window.location.hash.replace(/^#\/?/, "");
  }

  function contentType(project) {
    const hasPhotos = Boolean(project.driveFolderId);
    const hasVideo = Boolean(project.vimeoId);
    if (hasPhotos && hasVideo) return "Photos + Video";
    if (hasVideo) return "Video";
    return "Photos";
  }

  function renderGallery() {
    const target = qs("[data-gallery-grid]");
    if (!target) return;

    const listed = projects.filter((project) => project.listed);
    target.replaceChildren();

    if (!listed.length) {
      target.replaceWith(el("div", "empty-state", "No listed client deliveries are live yet."));
      return;
    }

    listed.forEach((project) => {
      const card = el("a", "project-card");
      card.href = projectUrl(project);
      card.setAttribute("aria-label", `Open ${project.title}`);

      const image = el("img");
      image.loading = "lazy";
      image.alt = `${project.title} thumbnail`;
      image.src = normalizeDriveImage(project.thumbnailImage || project.heroImage || project.leadShotImage);

      const body = el("div", "project-card-body");
      body.append(el("h3", "", project.title));
      body.append(el("p", "", project.subtitle || contentType(project)));
      card.append(image, body);
      target.append(card);
    });
  }

  function renderProject() {
    const app = qs("[data-project-app]");
    if (!app) return;

    const slug = getProjectSlug();
    const project = projects.find((item) => item.slug === slug);
    if (!project) {
      app.replaceChildren(el("div", "empty-state", "This delivery link does not match a configured project."));
      return;
    }

    document.title = `${project.title} | Client Delivery`;
    const storageKey = `delivery-unlocked:${project.slug}`;
    if (window.localStorage.getItem(storageKey) === "true") {
      showUnlocked(app, project);
      return;
    }

    showGate(app, project, storageKey);
  }

  function showGate(app, project, storageKey) {
    const panel = el("section", "unlock-panel");
    panel.setAttribute("aria-labelledby", "unlock-title");
    panel.innerHTML = `
      <p class="eyebrow">Client Delivery</p>
      <h1 id="unlock-title">${escapeHtml(project.title)}</h1>
      <p class="lede">${escapeHtml(project.subtitle || "Enter the project password to continue.")}</p>
      <form data-unlock-form>
        <div class="field">
          <label for="delivery-password">Password</label>
          <input id="delivery-password" type="password" autocomplete="current-password" required>
          <p class="error-text hidden" data-unlock-error role="alert">That password did not match. Try again.</p>
        </div>
        <div class="button-row">
          <button class="btn btn-primary" type="submit">Unlock Delivery</button>
          <a class="btn btn-secondary" href="./">Back to Gallery</a>
        </div>
      </form>
    `;

    qs("[data-unlock-form]", panel).addEventListener("submit", (event) => {
      event.preventDefault();
      const input = qs("#delivery-password", panel);
      const error = qs("[data-unlock-error]", panel);
      if (input.value === project.password) {
        window.localStorage.setItem(storageKey, "true");
        showUnlocked(app, project);
      } else {
        error.classList.remove("hidden");
        input.focus();
        input.select();
      }
    });

    app.replaceChildren(panel);
  }

  function showUnlocked(app, project) {
    const wrap = document.createDocumentFragment();
    const hero = el("section", "delivery-hero");
    const heroImageValue = project.heroImage || project.thumbnailImage || project.leadShotImage;
    if (heroImageValue) {
      const image = el("img");
      image.alt = `${project.title} hero image`;
      image.src = normalizeDriveImage(heroImageValue);
      hero.append(image);
    }

    const text = el("div");
    text.innerHTML = `
      <p class="eyebrow">Unlocked Delivery</p>
      <h1>${escapeHtml(project.title)}</h1>
      ${project.subtitle ? `<p class="lede">${escapeHtml(project.subtitle)}</p>` : ""}
      <p class="delivery-meta">${escapeHtml(contentType(project))}</p>
    `;
    hero.append(text);
    wrap.append(hero);

    if (project.vimeoId) wrap.append(renderVideo(project));
    if (project.driveFolderId) wrap.append(renderPhotos(project));
    if (!project.vimeoId && !project.driveFolderId) {
      wrap.append(el("div", "empty-state", "This delivery is configured, but no photo folder or Vimeo video has been added yet."));
    }

    app.replaceChildren(wrap);
    if (project.driveFolderId) loadDriveImages(project);
  }

  function renderVideo(project) {
    const section = el("section");
    section.innerHTML = `
      <div class="section-header">
        <div>
          <p class="eyebrow">Video Review</p>
          <h2>Video</h2>
          <p>Vimeo handles playback, review, and comments.</p>
        </div>
      </div>
      <iframe class="video-frame" src="https://player.vimeo.com/video/${encodeURIComponent(project.vimeoId)}" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share" allowfullscreen title="${escapeAttr(project.title)} video"></iframe>
    `;
    return section;
  }

  function renderPhotos(project) {
    const section = el("section");
    section.innerHTML = `
      <div class="section-header">
        <div>
          <p class="eyebrow">Photo Delivery</p>
          <h2>Photos</h2>
          <p data-photo-status>Loading images from Drive.</p>
        </div>
        <button class="btn btn-accent" type="button" data-download-selected disabled>Download Selected</button>
      </div>
      <div class="masonry-grid" data-photo-grid aria-live="polite"></div>
    `;

    qs("[data-download-selected]", section).addEventListener("click", downloadSelected);
    return section;
  }

  async function loadDriveImages(project) {
    const grid = qs("[data-photo-grid]");
    const status = qs("[data-photo-status]");
    if (!grid || !status) return;

    try {
      const files = await listDriveImages(project.driveFolderId);
      const ordered = orderImages(files, project.leadShotImage);
      if (!ordered.length) {
        status.textContent = "No images are currently available in this Drive folder.";
        grid.replaceChildren(el("div", "empty-state", "Add image files to the connected Drive folder and refresh this page."));
        return;
      }

      status.textContent = `${ordered.length} image${ordered.length === 1 ? "" : "s"} available.`;
      grid.replaceChildren();
      ordered.forEach((file) => grid.append(renderPhotoTile(file)));
    } catch (error) {
      console.error(error);
      status.textContent = "Drive images could not be loaded.";
      grid.replaceChildren(el("div", "notice", "Check that the Drive folder is shared correctly and that the folder ID in config.js is valid."));
    }
  }

  async function listDriveImages(folderId) {
    const params = new URLSearchParams({
      key: apiKey,
      q: `'${folderId}' in parents and trashed = false and mimeType contains 'image/'`,
      fields: "files(id,name,mimeType,modifiedTime,imageMediaMetadata(width,height))",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true"
    });
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
    if (!response.ok) throw new Error(`Drive list failed: ${response.status}`);
    const data = await response.json();
    return data.files || [];
  }

  function orderImages(files, leadShotImage) {
    if (!leadShotImage) return files;
    const leadId = extractDriveId(leadShotImage) || leadShotImage;
    return [...files].sort((a, b) => {
      if (a.id === leadId) return -1;
      if (b.id === leadId) return 1;
      return 0;
    });
  }

  function renderPhotoTile(file) {
    const tile = el("figure", "photo-tile");
    tile.dataset.fileId = file.id;
    tile.dataset.fileName = file.name;
    tile.dataset.selected = "false";

    const img = el("img");
    img.loading = "lazy";
    img.alt = file.name.replace(/\.[^.]+$/, "");
    img.src = driveMediaUrl(file.id);
    if (file.imageMediaMetadata?.width) img.width = file.imageMediaMetadata.width;
    if (file.imageMediaMetadata?.height) img.height = file.imageMediaMetadata.height;

    const actions = el("figcaption", "photo-actions");
    const select = el("button", "select-btn");
    select.type = "button";
    select.setAttribute("aria-pressed", "false");
    select.innerHTML = `<span class="select-dot" aria-hidden="true"></span><span>Select</span>`;
    select.addEventListener("click", () => toggleSelection(tile, select));

    const link = el("a", "download-btn", "Download");
    link.href = driveMediaUrl(file.id);
    link.download = file.name;
    link.target = "_blank";
    link.rel = "noopener";

    actions.append(select, link);
    tile.append(img, actions);
    return tile;
  }

  function toggleSelection(tile, button) {
    const selected = tile.dataset.selected !== "true";
    tile.dataset.selected = String(selected);
    button.setAttribute("aria-pressed", String(selected));
    button.lastElementChild.textContent = selected ? "Selected" : "Select";
    updateSelectedButton();
  }

  function updateSelectedButton() {
    const selectedCount = document.querySelectorAll(".photo-tile[data-selected='true']").length;
    const button = qs("[data-download-selected]");
    if (!button) return;
    button.disabled = selectedCount === 0;
    button.textContent = selectedCount ? `Download Selected (${selectedCount})` : "Download Selected";
  }

  async function downloadSelected() {
    const selected = [...document.querySelectorAll(".photo-tile[data-selected='true']")];
    if (!selected.length) return;

    const button = qs("[data-download-selected]");
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing Zip";

    try {
      const files = await Promise.all(selected.map(async (tile) => {
        const response = await fetch(driveMediaUrl(tile.dataset.fileId));
        if (!response.ok) throw new Error(`Image download failed: ${tile.dataset.fileName}`);
        return {
          name: tile.dataset.fileName,
          data: new Uint8Array(await response.arrayBuffer())
        };
      }));
      const blob = createZipBlob(files);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "selected-images.zip";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error(error);
      selected.forEach((tile) => window.open(driveMediaUrl(tile.dataset.fileId), "_blank", "noopener"));
    } finally {
      button.disabled = false;
      button.textContent = original;
      updateSelectedButton();
    }
  }

  function createZipBlob(files) {
    const chunks = [];
    const central = [];
    let offset = 0;

    files.forEach((file) => {
      const nameBytes = new TextEncoder().encode(file.name);
      const crc = crc32(file.data);
      const local = zipHeader(0x04034b50, {
        flags: 0x0800,
        method: 0,
        crc,
        compressedSize: file.data.length,
        uncompressedSize: file.data.length,
        nameBytes
      });
      chunks.push(local, file.data);
      central.push({
        crc,
        compressedSize: file.data.length,
        uncompressedSize: file.data.length,
        nameBytes,
        offset
      });
      offset += local.length + file.data.length;
    });

    const centralStart = offset;
    central.forEach((entry) => {
      const header = zipHeader(0x02014b50, {
        flags: 0x0800,
        method: 0,
        crc: entry.crc,
        compressedSize: entry.compressedSize,
        uncompressedSize: entry.uncompressedSize,
        nameBytes: entry.nameBytes,
        localOffset: entry.offset,
        central: true
      });
      chunks.push(header);
      offset += header.length;
    });

    chunks.push(endOfCentralDirectory(files.length, offset - centralStart, centralStart));
    return new Blob(chunks, { type: "application/zip" });
  }

  function zipHeader(signature, options) {
    const central = Boolean(options.central);
    const fixedLength = central ? 46 : 30;
    const bytes = new Uint8Array(fixedLength + options.nameBytes.length);
    const view = new DataView(bytes.buffer);
    const time = dosDateTime(new Date());
    let i = 0;
    view.setUint32(i, signature, true); i += 4;
    if (central) {
      view.setUint16(i, 20, true); i += 2;
    }
    view.setUint16(i, 20, true); i += 2;
    view.setUint16(i, options.flags, true); i += 2;
    view.setUint16(i, options.method, true); i += 2;
    view.setUint16(i, time.time, true); i += 2;
    view.setUint16(i, time.date, true); i += 2;
    view.setUint32(i, options.crc, true); i += 4;
    view.setUint32(i, options.compressedSize, true); i += 4;
    view.setUint32(i, options.uncompressedSize, true); i += 4;
    view.setUint16(i, options.nameBytes.length, true); i += 2;
    view.setUint16(i, 0, true); i += 2;
    if (central) {
      view.setUint16(i, 0, true); i += 2;
      view.setUint16(i, 0, true); i += 2;
      view.setUint16(i, 0, true); i += 2;
      view.setUint32(i, 0, true); i += 4;
      view.setUint32(i, options.localOffset, true); i += 4;
    }
    bytes.set(options.nameBytes, i);
    return bytes;
  }

  function endOfCentralDirectory(count, size, offset) {
    const bytes = new Uint8Array(22);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, count, true);
    view.setUint16(10, count, true);
    view.setUint32(12, size, true);
    view.setUint32(16, offset, true);
    return bytes;
  }

  function dosDateTime(date) {
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function crc32(bytes) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();

  function extractDriveId(value) {
    if (!value) return "";
    const patterns = [
      /\/folders\/([a-zA-Z0-9_-]+)/,
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/
    ];
    for (const pattern of patterns) {
      const match = String(value).match(pattern);
      if (match) return match[1];
    }
    return /^[a-zA-Z0-9_-]{10,}$/.test(value) ? value : "";
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  window.ClientDelivery = {
    renderGallery,
    renderProject,
    extractDriveId
  };
})();
