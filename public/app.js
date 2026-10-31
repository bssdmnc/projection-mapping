/**
 * Main Application Logic for Projection Mapping
 */
(function() {
  const warpCanvas = document.getElementById('warpCanvas');
  const overlayCanvas = document.getElementById('overlayCanvas');
  const engine = new WarpEngine(warpCanvas);
  const patterns = new PatternGenerators();

  // Broadcast channel for multi-window / projector output synchronization
  const broadcast = new BroadcastChannel('projection_mapping_sync');

  // App State
  let surfaces = [];
  let activeSurfaceIndex = 0;
  let activeCornerIndex = null; // 0: TL, 1: TR, 2: BR, 3: BL

  // Dragging states
  let isDraggingCorner = false;
  let dragCornerIndex = null;

  let isDraggingObject = false;
  let objectDragStart = { x: 0, y: 0 };
  let objectInitialCorners = [];

  let isUIVisible = true;
  let isFullscreen = false;
  let mediaElements = new Map(); // id -> HTMLVideoElement or HTMLImageElement

  // Handle visual colors
  const CORNER_COLORS = ['#ff4757', '#2ed573', '#3742fa', '#ffa502'];
  const CORNER_NAMES = ['TL (Верх-Лево)', 'TR (Верх-Право)', 'BR (Низ-Право)', 'BL (Низ-Лево)'];

  // DOM Elements
  const sidebar = document.getElementById('sidebar');
  const quickBar = document.getElementById('quickBar');
  const surfacesListEl = document.getElementById('surfacesList');
  const surfaceNameInput = document.getElementById('surfaceName');
  const sourceTypeSelect = document.getElementById('sourceType');
  const fileUploadGroup = document.getElementById('fileUploadGroup');
  const fileInput = document.getElementById('fileInput');
  const liveCaptureGroup = document.getElementById('liveCaptureGroup');
  const btnStartCam = document.getElementById('btnStartCam');
  const btnStartScreen = document.getElementById('btnStartScreen');
  const opacityInput = document.getElementById('opacityInput');
  const opacityVal = document.getElementById('opacityVal');
  const brightnessInput = document.getElementById('brightnessInput');
  const brightnessVal = document.getElementById('brightnessVal');
  const contrastInput = document.getElementById('contrastInput');
  const contrastVal = document.getElementById('contrastVal');
  const blendModeSelect = document.getElementById('blendMode');
  const flipHCheckbox = document.getElementById('flipH');
  const flipVCheckbox = document.getElementById('flipV');
  const toastEl = document.getElementById('toast');

  // Quick Action Buttons
  const btnAddSurface = document.getElementById('btnAddSurface');
  const btnDeleteSurface = document.getElementById('btnDeleteSurface');
  const btnResetCorners = document.getElementById('btnResetCorners');
  const btnFit169 = document.getElementById('btnFit169');
  const btnToggleUI = document.getElementById('btnToggleUI');
  const btnFullscreen = document.getElementById('btnFullscreen');
  const btnOpenProjector = document.getElementById('btnOpenProjector');
  const btnSavePreset = document.getElementById('btnSavePreset');
  const btnLoadPreset = document.getElementById('btnLoadPreset');
  const presetFileInput = document.getElementById('presetFileInput');

  // Corner pin badges
  const pinBadges = [
    document.getElementById('pinTL'),
    document.getElementById('pinTR'),
    document.getElementById('pinBR'),
    document.getElementById('pinBL')
  ];

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2500);
  }

  function resizeCanvases() {
    const rect = overlayCanvas.getBoundingClientRect();
    const w = Math.round(rect.width) || window.innerWidth;
    const h = Math.round(rect.height) || window.innerHeight;

    if (warpCanvas.width !== w || warpCanvas.height !== h) {
      warpCanvas.width = w;
      warpCanvas.height = h;
    }
    if (overlayCanvas.width !== w || overlayCanvas.height !== h) {
      overlayCanvas.width = w;
      overlayCanvas.height = h;
    }
  }

  function getActiveSurface() {
    return surfaces[activeSurfaceIndex] || null;
  }

  function createDefaultSurface(index = 0) {
    const rect = overlayCanvas.getBoundingClientRect();
    const w = (rect.width > 200 ? rect.width : window.innerWidth) || 1280;
    const h = (rect.height > 200 ? rect.height : window.innerHeight) || 720;

    // Centered rectangle
    const boxW = Math.min(Math.round(w * 0.6), 640);
    const boxH = Math.min(Math.round(h * 0.6), 420);
    const offsetX = Math.round((w - boxW) / 2 + (index * 30));
    const offsetY = Math.round((h - boxH) / 2 + (index * 30));

    return {
      id: 'surface_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: `Поверхность ${surfaces.length + 1}`,
      enabled: true,
      corners: [
        { x: offsetX, y: offsetY },               // TL
        { x: offsetX + boxW, y: offsetY },        // TR
        { x: offsetX + boxW, y: offsetY + boxH }, // BR
        { x: offsetX, y: offsetY + boxH }         // BL
      ],
      sourceType: index === 0 ? 'grid' : 'tunnel',
      customMediaUrl: null,
      customMediaType: null, // 'video' | 'image'
      opacity: 1.0,
      brightness: 0.0,
      contrast: 1.0,
      blendMode: 'normal',
      flipH: false,
      flipV: false
    };
  }

  function isValidQuad(corners) {
    if (!Array.isArray(corners) || corners.length !== 4) return false;
    const minX = Math.min(...corners.map(c => c.x));
    const maxX = Math.max(...corners.map(c => c.x));
    const minY = Math.min(...corners.map(c => c.y));
    const maxY = Math.max(...corners.map(c => c.y));
    return (maxX - minX > 30) && (maxY - minY > 30);
  }

  function loadState() {
    const saved = localStorage.getItem('projection_mapping_surfaces');
    if (saved) {
      try {
        surfaces = JSON.parse(saved);
      } catch (e) {
        surfaces = [];
      }
    }
    if (!surfaces || !Array.isArray(surfaces) || surfaces.length === 0) {
      surfaces = [createDefaultSurface(0)];
    } else {
      // Validate saved corners - repair if collapsed (e.g. 0,0)
      surfaces.forEach((s, idx) => {
        if (!isValidQuad(s.corners)) {
          const def = createDefaultSurface(idx);
          s.corners = def.corners;
        }
      });
    }
    activeSurfaceIndex = 0;
    saveState();
  }

  function saveState() {
    localStorage.setItem('projection_mapping_surfaces', JSON.stringify(surfaces));
    // Broadcast state to external projector window
    broadcast.postMessage({
      type: 'SYNC_STATE',
      surfaces: surfaces
    });
  }

  function updateUI() {
    const current = getActiveSurface();
    renderSurfacesList();

    if (!current) {
      return;
    }

    surfaceNameInput.value = current.name;
    sourceTypeSelect.value = current.sourceType;
    opacityInput.value = current.opacity;
    opacityVal.textContent = Math.round(current.opacity * 100) + '%';
    brightnessInput.value = current.brightness;
    brightnessVal.textContent = current.brightness > 0 ? `+${current.brightness}` : current.brightness;
    contrastInput.value = current.contrast;
    contrastVal.textContent = current.contrast;
    blendModeSelect.value = current.blendMode;
    flipHCheckbox.checked = current.flipH;
    flipVCheckbox.checked = current.flipV;

    // Show/hide file upload group if custom media is selected
    if (current.sourceType === 'custom') {
      fileUploadGroup.style.display = 'block';
      liveCaptureGroup.style.display = 'block';
    } else {
      fileUploadGroup.style.display = 'none';
      liveCaptureGroup.style.display = 'none';
    }

    // Update corner badges coordinates
    current.corners.forEach((pt, i) => {
      const badge = pinBadges[i];
      if (badge) {
        const coordsEl = badge.querySelector('.coords');
        if (coordsEl) {
          coordsEl.textContent = `${Math.round(pt.x)}, ${Math.round(pt.y)}`;
        }
        if (activeCornerIndex === i) {
          badge.classList.add('selected');
        } else {
          badge.classList.remove('selected');
        }
      }
    });
  }

  function renderSurfacesList() {
    surfacesListEl.innerHTML = '';
    surfaces.forEach((s, idx) => {
      const item = document.createElement('div');
      item.className = 'surface-item' + (idx === activeSurfaceIndex ? ' active' : '');

      const info = document.createElement('div');
      info.className = 'surface-info';

      const dot = document.createElement('div');
      dot.className = 'surface-color-dot';
      dot.style.background = s.enabled ? '#00f2fe' : '#555';

      const name = document.createElement('span');
      name.className = 'surface-name';
      name.textContent = s.name;

      info.appendChild(dot);
      info.appendChild(name);

      const actions = document.createElement('div');
      actions.className = 'surface-actions';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'btn btn-icon btn-secondary';
      toggleBtn.title = s.enabled ? 'Скрыть' : 'Показать';
      toggleBtn.innerHTML = s.enabled ? '👁️' : '🚫';
      toggleBtn.onclick = (e) => {
        e.stopPropagation();
        s.enabled = !s.enabled;
        saveState();
        updateUI();
      };

      actions.appendChild(toggleBtn);
      item.appendChild(info);
      item.appendChild(actions);

      item.onclick = () => {
        activeSurfaceIndex = idx;
        activeCornerIndex = null;
        updateUI();
      };

      surfacesListEl.appendChild(item);
    });
  }

  // Draw overlay handles and lines on overlayCanvas
  function drawOverlay() {
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (!isUIVisible) return;

    surfaces.forEach((surface, sIdx) => {
      if (!surface.enabled) return;
      const isSelected = sIdx === activeSurfaceIndex;
      const pts = surface.corners;

      // Draw bounding polygon
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.closePath();

      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeStyle = isSelected ? '#00f2fe' : 'rgba(255, 255, 255, 0.35)';
      ctx.setLineDash(isSelected ? [] : [4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (isSelected) {
        // Draw diagonals
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.moveTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[3].x, pts[3].y);
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw center crosshair
        const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
        const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#00f2fe';
        ctx.fill();

        // Draw Corner Handles
        pts.forEach((pt, cIdx) => {
          const isCornerActive = activeCornerIndex === cIdx;
          const radius = isCornerActive ? 14 : 11;

          // Outer halo for active
          if (isCornerActive) {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, radius + 7, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 242, 254, 0.4)';
            ctx.fill();
          }

          // Handle shadow & circle
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = CORNER_COLORS[cIdx];
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.stroke();

          // Corner label with background
          const label = ['TL', 'TR', 'BR', 'BL'][cIdx];
          const labelOffset = cIdx === 0 ? { x: -30, y: -16 } :
                              cIdx === 1 ? { x: 16, y: -16 } :
                              cIdx === 2 ? { x: 16, y: 26 } :
                                           { x: -30, y: 26 };
          const tx = pt.x + labelOffset.x;
          const ty = pt.y + labelOffset.y;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(tx - 3, ty - 12, 24, 15);
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, tx, ty);
        });
      }
    });
  }

  // Geometric ray-casting point-in-polygon test
  function pointInPolygon(px, py, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Handle Dragging Coordinates accurately
  function getMousePos(e) {
    const rect = overlayCanvas.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    const scaleX = rect.width > 0 ? (overlayCanvas.width / rect.width) : 1;
    const scaleY = rect.height > 0 ? (overlayCanvas.height / rect.height) : 1;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function findCornerUnderMouse(x, y, surface) {
    if (!surface || !surface.enabled) return null;
    const hitRadius = 32; // Comfortable hitbox
    for (let i = 0; i < 4; i++) {
      const pt = surface.corners[i];
      const dx = pt.x - x;
      const dy = pt.y - y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return i;
      }
    }
    return null;
  }

  function findAnyCornerUnderMouse(x, y) {
    const active = getActiveSurface();
    if (active) {
      const c = findCornerUnderMouse(x, y, active);
      if (c !== null) return { surfaceIndex: activeSurfaceIndex, cornerIndex: c };
    }
    for (let i = surfaces.length - 1; i >= 0; i--) {
      if (i === activeSurfaceIndex || !surfaces[i].enabled) continue;
      const c = findCornerUnderMouse(x, y, surfaces[i]);
      if (c !== null) return { surfaceIndex: i, cornerIndex: c };
    }
    return null;
  }

  function findSurfaceUnderMouse(x, y) {
    const active = getActiveSurface();
    if (active && active.enabled && pointInPolygon(x, y, active.corners)) {
      return activeSurfaceIndex;
    }
    for (let i = surfaces.length - 1; i >= 0; i--) {
      if (!surfaces[i].enabled) continue;
      if (pointInPolygon(x, y, surfaces[i].corners)) {
        return i;
      }
    }
    return -1;
  }

  function onPointerDown(e) {
    if (!isUIVisible) return;
    const pos = getMousePos(e);

    // 1. Проверяем клик по углу
    const cornerHit = findAnyCornerUnderMouse(pos.x, pos.y);
    if (cornerHit !== null) {
      activeSurfaceIndex = cornerHit.surfaceIndex;
      activeCornerIndex = cornerHit.cornerIndex;
      isDraggingCorner = true;
      dragCornerIndex = cornerHit.cornerIndex;
      overlayCanvas.style.cursor = 'move';
      if (e.pointerId && overlayCanvas.setPointerCapture) {
        try { overlayCanvas.setPointerCapture(e.pointerId); } catch(err) {}
      }
      updateUI();
      return;
    }

    // 2. Проверяем клик по телу поверхности (перемещение всего объекта)
    const hitSurfaceIdx = findSurfaceUnderMouse(pos.x, pos.y);
    if (hitSurfaceIdx !== -1) {
      activeSurfaceIndex = hitSurfaceIdx;
      activeCornerIndex = null;
      const targetSurface = surfaces[activeSurfaceIndex];
      isDraggingObject = true;
      objectDragStart = { x: pos.x, y: pos.y };
      objectInitialCorners = targetSurface.corners.map(c => ({ x: c.x, y: c.y }));
      overlayCanvas.style.cursor = 'grabbing';
      if (e.pointerId && overlayCanvas.setPointerCapture) {
        try { overlayCanvas.setPointerCapture(e.pointerId); } catch(err) {}
      }
      updateUI();
      return;
    }

    // Клик в пустоту
    activeCornerIndex = null;
    updateUI();
  }

  function onPointerMove(e) {
    if (!isUIVisible) return;
    const pos = getMousePos(e);

    // Dynamic cursor feedback when not dragging
    if (!isDraggingCorner && !isDraggingObject) {
      const cornerHit = findAnyCornerUnderMouse(pos.x, pos.y);
      if (cornerHit !== null) {
        overlayCanvas.style.cursor = 'move';
      } else if (findSurfaceUnderMouse(pos.x, pos.y) !== -1) {
        overlayCanvas.style.cursor = 'grab';
      } else {
        overlayCanvas.style.cursor = 'default';
      }
      return;
    }

    if (isDraggingCorner && dragCornerIndex !== null) {
      const current = getActiveSurface();
      if (current) {
        overlayCanvas.style.cursor = 'move';
        current.corners[dragCornerIndex].x = Math.round(pos.x);
        current.corners[dragCornerIndex].y = Math.round(pos.y);
        saveState();
        updateUI();
      }
    } else if (isDraggingObject) {
      overlayCanvas.style.cursor = 'grabbing';
      const current = getActiveSurface();
      if (current) {
        const dx = Math.round(pos.x - objectDragStart.x);
        const dy = Math.round(pos.y - objectDragStart.y);
        current.corners.forEach((pt, i) => {
          pt.x = objectInitialCorners[i].x + dx;
          pt.y = objectInitialCorners[i].y + dy;
        });
        saveState();
        updateUI();
      }
    }
  }

  function onPointerUp(e) {
    if (e && e.pointerId && overlayCanvas.releasePointerCapture) {
      try { overlayCanvas.releasePointerCapture(e.pointerId); } catch(err) {}
    }
    if (isDraggingCorner || isDraggingObject) {
      isDraggingCorner = false;
      dragCornerIndex = null;
      isDraggingObject = false;
      overlayCanvas.style.cursor = 'default';
      saveState();
    }
  }

  // Pointer events support both mouse and touchscreen
  overlayCanvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // Keyboard Nudging & Shortcuts
  window.addEventListener('keydown', (e) => {
    // If inside text input, don't trigger global hotkeys
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      return;
    }

    const current = getActiveSurface();

    // Toggle UI visibility (H key)
    if (e.key === 'h' || e.key === 'H') {
      isUIVisible = !isUIVisible;
      sidebar.classList.toggle('hidden', !isUIVisible);
      quickBar.classList.toggle('hidden', !isUIVisible);
      showToast(isUIVisible ? 'Интерфейс показан' : 'Интерфейс скрыт (Нажмите H для возврата)');
      return;
    }

    // Toggle Fullscreen (F key)
    if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
      return;
    }

    // Select Corner by numbers 1-4
    if (['1', '2', '3', '4'].includes(e.key)) {
      activeCornerIndex = parseInt(e.key, 10) - 1;
      updateUI();
      showToast(`Выбран угол: ${CORNER_NAMES[activeCornerIndex]}`);
      return;
    }

    // Cycle Corners with Tab
    if (e.key === 'Tab') {
      e.preventDefault();
      if (activeCornerIndex === null) {
        activeCornerIndex = 0;
      } else {
        activeCornerIndex = (activeCornerIndex + 1) % 4;
      }
      updateUI();
      showToast(`Выбран угол: ${CORNER_NAMES[activeCornerIndex]}`);
      return;
    }

    // Switch Surfaces with [ and ]
    if (e.key === '[' || e.key === ']') {
      if (surfaces.length > 1) {
        if (e.key === '[') {
          activeSurfaceIndex = (activeSurfaceIndex - 1 + surfaces.length) % surfaces.length;
        } else {
          activeSurfaceIndex = (activeSurfaceIndex + 1) % surfaces.length;
        }
        activeCornerIndex = null;
        updateUI();
        showToast(`Выбрана: ${getActiveSurface().name}`);
      }
      return;
    }

    // Pixel Nudging with Arrow Keys
    if (current && activeCornerIndex !== null && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const pt = current.corners[activeCornerIndex];

      if (e.key === 'ArrowUp') pt.y -= step;
      if (e.key === 'ArrowDown') pt.y += step;
      if (e.key === 'ArrowLeft') pt.x -= step;
      if (e.key === 'ArrowRight') pt.x += step;

      saveState();
      updateUI();
    }
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      isFullscreen = true;
      btnFullscreen.textContent = '❌ Выйти';
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      isFullscreen = false;
      btnFullscreen.textContent = '⛶ Полный экран';
    }
  }

  // Corner Pin Badge clicks
  pinBadges.forEach((badge, idx) => {
    badge.addEventListener('click', () => {
      activeCornerIndex = idx;
      updateUI();
    });
  });

  // UI Event Handlers
  btnAddSurface.addEventListener('click', () => {
    const newSurface = createDefaultSurface(surfaces.length);
    surfaces.push(newSurface);
    activeSurfaceIndex = surfaces.length - 1;
    activeCornerIndex = null;
    saveState();
    updateUI();
    showToast('Добавлена новая поверхность');
  });

  btnDeleteSurface.addEventListener('click', () => {
    if (surfaces.length <= 1) {
      showToast('Нельзя удалить последнюю поверхность!');
      return;
    }
    engine.deleteTexture(surfaces[activeSurfaceIndex].id);
    surfaces.splice(activeSurfaceIndex, 1);
    activeSurfaceIndex = Math.max(0, activeSurfaceIndex - 1);
    activeCornerIndex = null;
    saveState();
    updateUI();
    showToast('Поверхность удалена');
  });

  btnResetCorners.addEventListener('click', () => {
    const current = getActiveSurface();
    if (!current) return;
    const rect = overlayCanvas.getBoundingClientRect();
    const w = (rect.width > 200 ? rect.width : window.innerWidth) || 1280;
    const h = (rect.height > 200 ? rect.height : window.innerHeight) || 720;
    const boxW = Math.min(Math.round(w * 0.6), 640);
    const boxH = Math.min(Math.round(h * 0.6), 420);
    const offsetX = Math.round((w - boxW) / 2);
    const offsetY = Math.round((h - boxH) / 2);

    current.corners = [
      { x: offsetX, y: offsetY },
      { x: offsetX + boxW, y: offsetY },
      { x: offsetX + boxW, y: offsetY + boxH },
      { x: offsetX, y: offsetY + boxH }
    ];
    saveState();
    updateUI();
    showToast('Углы сброшены в центр');
  });

  btnFit169.addEventListener('click', () => {
    const current = getActiveSurface();
    if (!current) return;
    const rect = overlayCanvas.getBoundingClientRect();
    const w = (rect.width > 200 ? rect.width : window.innerWidth) || 1280;
    const h = (rect.height > 200 ? rect.height : window.innerHeight) || 720;

    // Fullscreen 16:9 box
    let targetW = Math.round(w * 0.85);
    let targetH = Math.round(targetW * (9 / 16));
    if (targetH > h * 0.85) {
      targetH = Math.round(h * 0.85);
      targetW = Math.round(targetH * (16 / 9));
    }

    const ox = Math.round((w - targetW) / 2);
    const oy = Math.round((h - targetH) / 2);

    current.corners = [
      { x: ox, y: oy },
      { x: ox + targetW, y: oy },
      { x: ox + targetW, y: oy + targetH },
      { x: ox, y: oy + targetH }
    ];
    saveState();
    updateUI();
    showToast('Установлен формат 16:9');
  });

  btnToggleUI.addEventListener('click', () => {
    isUIVisible = !isUIVisible;
    sidebar.classList.toggle('hidden', !isUIVisible);
    quickBar.classList.toggle('hidden', !isUIVisible);
    showToast(isUIVisible ? 'Интерфейс включен' : 'Нажмите H, чтобы вернуть интерфейс');
  });

  btnFullscreen.addEventListener('click', toggleFullscreen);

  btnOpenProjector.addEventListener('click', () => {
    window.open('display.html', 'ProjectorWindow', 'width=1280,height=720');
    showToast('Окно проектора открыто. Перетащите его на второй экран!');
  });

  // Settings inputs
  surfaceNameInput.addEventListener('input', () => {
    const current = getActiveSurface();
    if (current) {
      current.name = surfaceNameInput.value;
      saveState();
      renderSurfacesList();
    }
  });

  sourceTypeSelect.addEventListener('change', () => {
    const current = getActiveSurface();
    if (current) {
      current.sourceType = sourceTypeSelect.value;
      saveState();
      updateUI();
    }
  });

  opacityInput.addEventListener('input', () => {
    const current = getActiveSurface();
    if (current) {
      current.opacity = parseFloat(opacityInput.value);
      opacityVal.textContent = Math.round(current.opacity * 100) + '%';
      saveState();
    }
  });

  brightnessInput.addEventListener('input', () => {
    const current = getActiveSurface();
    if (current) {
      current.brightness = parseFloat(brightnessInput.value);
      brightnessVal.textContent = current.brightness > 0 ? `+${current.brightness}` : current.brightness;
      saveState();
    }
  });

  contrastInput.addEventListener('input', () => {
    const current = getActiveSurface();
    if (current) {
      current.contrast = parseFloat(contrastInput.value);
      contrastVal.textContent = current.contrast;
      saveState();
    }
  });

  blendModeSelect.addEventListener('change', () => {
    const current = getActiveSurface();
    if (current) {
      current.blendMode = blendModeSelect.value;
      saveState();
    }
  });

  flipHCheckbox.addEventListener('change', () => {
    const current = getActiveSurface();
    if (current) {
      current.flipH = flipHCheckbox.checked;
      saveState();
    }
  });

  flipVCheckbox.addEventListener('change', () => {
    const current = getActiveSurface();
    if (current) {
      current.flipV = flipVCheckbox.checked;
      saveState();
    }
  });

  // Custom Media File Upload
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const current = getActiveSurface();
    if (!current) return;

    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = url;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.play();
      mediaElements.set(current.id, video);
      current.customMediaType = 'video';
      showToast(`Видео загружено: ${file.name}`);
    } else if (file.type.startsWith('image/')) {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        mediaElements.set(current.id, img);
        current.customMediaType = 'image';
        showToast(`Изображение загружено: ${file.name}`);
      };
    }
  });

  // Webcam Capture
  btnStartCam.addEventListener('click', async () => {
    const current = getActiveSurface();
    if (!current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.play();
      mediaElements.set(current.id, video);
      current.sourceType = 'custom';
      current.customMediaType = 'video';
      updateUI();
      showToast('Веб-камера подключена!');
    } catch (err) {
      alert('Ошибка доступа к веб-камере: ' + err.message);
    }
  });

  // Screen Share Capture
  btnStartScreen.addEventListener('click', async () => {
    const current = getActiveSurface();
    if (!current) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.play();
      mediaElements.set(current.id, video);
      current.sourceType = 'custom';
      current.customMediaType = 'video';
      updateUI();
      showToast('Захват экрана активен!');
    } catch (err) {
      // User cancelled
    }
  });

  // Presets Save / Load
  btnSavePreset.addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(surfaces, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `projection_preset_${Date.now()}.json`);
    dlAnchor.click();
    showToast('Пресет сохранен в файл');
  });

  btnLoadPreset.addEventListener('click', () => {
    presetFileInput.click();
  });

  presetFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const loaded = JSON.parse(evt.target.result);
        if (Array.isArray(loaded) && loaded.length > 0) {
          surfaces = loaded;
          activeSurfaceIndex = 0;
          activeCornerIndex = null;
          saveState();
          updateUI();
          showToast('Пресет успешно загружен!');
        }
      } catch (err) {
        alert('Ошибка при чтении пресета: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // Main Render Loop
  let lastTime = 0;
  function renderLoop(time) {
    resizeCanvases();
    const sourcesMap = new Map();

    surfaces.forEach(s => {
      if (!s.enabled) return;
      if (s.sourceType === 'custom') {
        const media = mediaElements.get(s.id);
        if (media) {
          sourcesMap.set(s.id, media);
        } else {
          sourcesMap.set(s.id, patterns.renderPattern(s, time));
        }
      } else {
        sourcesMap.set(s.id, patterns.renderPattern(s, time));
      }
    });

    engine.render(surfaces, sourcesMap);
    drawOverlay();

    requestAnimationFrame(renderLoop);
  }

  // Window resize handler
  window.addEventListener('resize', () => {
    resizeCanvases();
  });

  // Init
  resizeCanvases();
  loadState();
  updateUI();
  requestAnimationFrame(renderLoop);
})();
