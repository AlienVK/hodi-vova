/* =============================================================
 * app.js — UI и связывание всего вместе.
 * 5 вкладок (раздел 9): Карта, Статистика, Стена, Мои данные, Админ.
 * ============================================================= */
(function () {
  const C = window.CONFIG, L = window.Logic, A = window.Auth, S = window.Store;

  // ---------- Состояние ----------
  const state = {
    tab: "map",
    users: [], entries: [], wall: [], race: { lap: 1, lapStartDate: null },
    loaded: { users: false, entries: false, wall: false, race: false },
    session: { login: sessionStorage.getItem("sess.login") || null, admin: sessionStorage.getItem("sess.admin") === "1" },
    statMonth: L.monthKey(L.today()),
    statUnit: "steps",           // steps | km
    editingDate: null,           // редактируемая запись в «Мои данные»
    editingUser: null,           // редактируемый участник в «Админ» (логин) или null
    finishing: false             // защита от повторного сброса круга
  };

  // ---------- Утилиты ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const views = { map: $("view-map"), stats: $("view-stats"), wall: $("view-wall"), me: $("view-me"), admin: $("view-admin") };
  const userMap = () => { const m = {}; state.users.forEach((u) => (m[u.login] = u)); return m; };
  const findUser = (login) => state.users.find((u) => u.login === login);

  let toastT;
  function toast(msg, kind) {
    const t = $("toast"); t.textContent = msg; t.className = "toast show" + (kind === "err" ? " err" : "");
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = "toast"), 2600);
  }
  function relTime(ms) {
    const d = Math.floor((Date.now() - ms) / 1000);
    if (d < 60) return "только что";
    if (d < 3600) return Math.floor(d / 60) + " мин назад";
    if (d < 86400) return Math.floor(d / 3600) + " ч назад";
    return new Date(ms).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  // ---------- Инициализация ----------
  document.title = C.APP_TITLE;
  $("appTitle").textContent = C.APP_TITLE;

  document.querySelectorAll(".tab").forEach((btn) =>
    btn.addEventListener("click", () => setTab(btn.dataset.tab)));

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    Object.keys(views).forEach((k) => views[k].classList.toggle("active", k === tab));
    render();
  }

  ["users", "entries", "wall", "race"].forEach((name) =>
    S.subscribe(name, (data) => {
      if (name === "race") {
        // конфетти при завершении круга — срабатывает и у зрителей (live-обновление)
        const prevLap = state.loaded.race ? (state.race && state.race.lap) || 1 : null;
        state.race = data || { lap: 1, lapStartDate: null };
        if (prevLap && (state.race.lap || 1) > prevLap) celebrate();
      }
      else state[name] = data || [];
      state.loaded[name] = true;
      maybeAdvanceLap();
      updateBadge();
      render();
    }));

  // ---------- Логика финиша круга (6.4) ----------
  function maybeAdvanceLap() {
    if (!state.loaded.users || !state.loaded.entries || !state.loaded.race) return;
    if (state.finishing) return;
    const next = L.checkFinish(state.users, state.entries, state.race);
    if (next) {
      state.finishing = true;
      S.setRace(next);
      const w = findUser(next.lastWinner);
      setTimeout(() => (state.finishing = false), 1500);
      toast("🏁 " + (next.lastWinner || "Участник") + " дошёл до Парижа! Круг №" + (next.lap - 1) + " завершён.");
    }
  }

  function updateBadge() {
    const b = $("sessionBadge");
    if (state.session.admin) b.innerHTML = "Администратор<small>мастер-режим</small>";
    else if (state.session.login) b.innerHTML = esc(state.session.login) + "<small>участник</small>";
    else b.innerHTML = "Гость<small>только просмотр</small>";
  }

  // ---------- Диспетчер отрисовки ----------
  function render() {
    if (state.tab === "map") renderMap();
    else if (state.tab === "stats") renderStats();
    else if (state.tab === "wall") renderWall();
    else if (state.tab === "me") renderMe();
    else if (state.tab === "admin") renderAdmin();
  }

  /* ===================================================================
   * ГЕОМЕТРИЯ КАРТЫ
   * Маршрут визуально «виляет», но прогресс задаётся ЛИНЕЙНО по вертикали
   * (p = доля пройденного). Извивы — только горизонтальная декорация и НЕ
   * влияют на расчёты дистанции/длины (те живут в logic.js от км).
   * =================================================================== */
  const MAP = { W: 340, H: 820, CX: 170, AMP: 92, TOP: 46, BOT: 780, WAVES: 3, PHASE: 0.6 };
  const routeXY = (p) => ({
    x: MAP.CX + MAP.AMP * Math.sin(p * Math.PI * MAP.WAVES + MAP.PHASE),
    y: MAP.TOP + p * (MAP.BOT - MAP.TOP)
  });
  const routePos = (p) => { const { x, y } = routeXY(p); return { left: x / MAP.W * 100, top: y / MAP.H * 100 }; };
  function routePath(a, b, n) {
    let d = "";
    for (let i = 0; i <= n; i++) { const { x, y } = routeXY(a + (b - a) * i / n); d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " "; }
    return d;
  }
  const YW_TOP = routeXY(0.5).y, YW_BOT = routeXY(0.75).y; // границы Ла-Манша (50%–75%)

  // --- маленькие декоративные объекты ---
  function pine(x, y, s) {
    return `<g opacity="0.9"><rect x="${x - s * 0.14}" y="${y + s * 1.5}" width="${s * 0.28}" height="${s * 0.7}" fill="#7a5a3a"/>`
      + `<path d="M${x} ${y} l${-s} ${s * 1.1} h${2 * s} z" fill="#6f9350"/>`
      + `<path d="M${x} ${y + s * 0.55} l${-s * 1.15} ${s * 1.25} h${2.3 * s} z" fill="#5f854a"/></g>`;
  }
  function tree(x, y, s) {
    return `<g opacity="0.85"><rect x="${x - s * 0.12}" y="${y + s}" width="${s * 0.24}" height="${s * 0.7}" fill="#7a5a3a"/>`
      + `<circle cx="${x}" cy="${y + s * 0.5}" r="${s}" fill="#79a05a"/>`
      + `<circle cx="${x - s * 0.6}" cy="${y + s}" r="${s * 0.7}" fill="#6b9350"/>`
      + `<circle cx="${x + s * 0.6}" cy="${y + s}" r="${s * 0.7}" fill="#6b9350"/></g>`;
  }
  function forest(x, y) {
    return `<ellipse cx="${x + 2}" cy="${y + 21}" rx="21" ry="5" fill="#14213d" opacity="0.08"/>`
      + pine(x, y, 7) + tree(x + 14, y + 6, 6) + pine(x - 13, y + 8, 6) + tree(x + 4, y + 14, 5);
  }
  function town(x, y, label, place) {
    const roof1 = "#a3543f", roof2 = "#8f6b4a", wall = "#efe8d4", wall2 = "#e2d9c0", ln = "#8a8267", win = "#5c5648";
    const g = `<g opacity="0.95">`
      + `<ellipse cx="${x + 1}" cy="${y + 3.5}" rx="19" ry="4" fill="#14213d" opacity="0.10"/>`
      + `<rect x="${x - 14}" y="${y - 8}" width="9" height="11" fill="${wall}" stroke="${ln}" stroke-width="0.6"/>`
      + `<polygon points="${x - 15},${y - 8} ${x - 9.5},${y - 13.5} ${x - 4},${y - 8}" fill="${roof1}"/>`
      + `<rect x="${x - 4}" y="${y - 12}" width="10" height="15" fill="${wall2}" stroke="${ln}" stroke-width="0.6"/>`
      + `<polygon points="${x - 5},${y - 12} ${x + 1},${y - 18} ${x + 7},${y - 12}" fill="${roof2}"/>`
      + `<rect x="${x + 7}" y="${y - 6}" width="8" height="9" fill="${wall}" stroke="${ln}" stroke-width="0.6"/>`
      + `<polygon points="${x + 6},${y - 6} ${x + 11},${y - 10.5} ${x + 16},${y - 6}" fill="${roof1}"/>`
      + `<rect x="${x - 11.5}" y="${y - 5}" width="2.2" height="2.6" fill="${win}"/>`
      + `<rect x="${x - 1}" y="${y - 9}" width="2.2" height="2.6" fill="${win}"/>`
      + `<rect x="${x + 2.5}" y="${y - 9}" width="2.2" height="2.6" fill="${win}"/>`
      + `<rect x="${x + 9.5}" y="${y - 3.5}" width="2.2" height="2.6" fill="${win}"/>`
      + `<line x1="${x + 1}" y1="${y - 18}" x2="${x + 1}" y2="${y - 21}" stroke="${ln}" stroke-width="0.7"/>`
      + `<circle cx="${x + 1}" cy="${y - 21.8}" r="1.1" fill="#c8a24a"/>`
      + `</g>`;
    // Подпись — по центру над/под домиком (place: "up"|"down"), с белым
    // ореолом. Центр X зажимаем, чтобы текст не уходил за рамку карты.
    const cx = Math.max(34, Math.min(306, x));
    const ty = place === "down" ? y + 15 : y - 26;
    return g + `<text x="${cx}" y="${ty}" text-anchor="middle" font-size="9.5" font-style="italic"`
      + ` fill="#4c5468" stroke="#f4f0e2" stroke-width="2.6" paint-order="stroke" stroke-linejoin="round"`
      + ` font-family="Georgia,'Times New Roman',serif">${label}</text>`;
  }
  function hill(x, y, w, h, c) { return `<path d="M${x} ${y} q${w / 2} ${-h} ${w} 0 z" fill="${c}" opacity="0.6"/>`; }
  function gull(x, y) { return `<path d="M${x} ${y} q3 -3 6 0 q3 -3 6 0" fill="none" stroke="#7b8496" stroke-width="1" opacity="0.6"/>`; }

  function mapScenery() {
    const T = YW_TOP, B = YW_BOT, mid = (YW_TOP + YW_BOT) / 2;
    const defs = `<defs>
      <linearGradient id="landTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef4dd"/><stop offset="0.8" stop-color="#dcebc8"/><stop offset="1" stop-color="#d2e4bc"/></linearGradient>
      <linearGradient id="landBot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6e6c0"/><stop offset="0.25" stop-color="#dfecca"/><stop offset="1" stop-color="#eaf2da"/></linearGradient>
      <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd4cd"/><stop offset="0.5" stop-color="#5eb0a8"/><stop offset="1" stop-color="#9fd4cd"/></linearGradient>
      <linearGradient id="riv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8fc3e6"/><stop offset="1" stop-color="#6fb0dd"/></linearGradient>
      <radialGradient id="vign" cx="0.5" cy="0.5" r="0.75"><stop offset="0.62" stop-color="#5a4a22" stop-opacity="0"/><stop offset="1" stop-color="#5a4a22" stop-opacity="0.16"/></radialGradient>
      <filter id="noiseF" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.36  0 0 0 0 0.24  0 0 0 0.05 0"/></filter>
    </defs>`;

    // море с глубинными контурами
    const sea = `<rect x="0" y="${T - 26}" width="${MAP.W}" height="${B - T + 52}" fill="url(#sea)"/>`
      + `<path d="M0 ${mid - 26} C 60 ${mid - 34}, 150 ${mid - 16}, 230 ${mid - 26} S 320 ${mid - 30}, 340 ${mid - 24}" fill="none" stroke="#4b9a92" stroke-width="1" opacity="0.5"/>`
      + `<path d="M0 ${mid + 24} C 70 ${mid + 16}, 160 ${mid + 34}, 250 ${mid + 22} S 330 ${mid + 18}, 340 ${mid + 26}" fill="none" stroke="#4b9a92" stroke-width="1" opacity="0.4"/>`;

    // Англия: неровное побережье, пляж, кромка, меловые скалы у Дувра
    const coastEng = `M0 ${T - 8} C 26 ${T - 18}, 52 ${T + 2}, 78 ${T - 2} C 92 ${T - 4}, 100 ${T + 3}, 118 ${T + 6} C 146 ${T + 11}, 168 ${T - 6}, 196 ${T - 4} C 232 ${T - 1}, 258 ${T + 9}, 292 ${T + 1} C 312 ${T - 4}, 328 ${T + 3}, 340 ${T - 2}`;
    const engLand = `<path d="${coastEng} L340 0 L0 0 Z" fill="url(#landTop)"/>`
      + `<path d="${coastEng}" fill="none" stroke="#e6d6a4" stroke-width="5" opacity="0.85"/>`
      + `<path d="${coastEng}" fill="none" stroke="#8a8267" stroke-width="0.8" opacity="0.55"/>`
      + `<path d="M56 ${T - 1} L70 ${T - 9} L84 ${T - 2} L98 ${T - 10} L112 ${T - 1} L126 ${T - 7} L136 ${T + 3} L56 ${T + 3} Z" fill="#f7f4ea" stroke="#c9c2ae" stroke-width="0.7" opacity="0.95"/>`;

    // Франция: северный берег
    const coastFr = `M0 ${B + 6} C 34 ${B + 14}, 62 ${B - 4}, 96 ${B + 2} C 132 ${B + 9}, 172 ${B - 8}, 210 ${B - 2} C 236 ${B + 2}, 252 ${B - 6}, 278 ${B + 2} C 306 ${B + 10}, 324 ${B - 2}, 340 ${B + 4}`;
    const frLand = `<path d="${coastFr} L340 ${MAP.H} L0 ${MAP.H} Z" fill="url(#landBot)"/>`
      + `<path d="${coastFr}" fill="none" stroke="#e6d6a4" stroke-width="5" opacity="0.85"/>`
      + `<path d="${coastFr}" fill="none" stroke="#8a8267" stroke-width="0.8" opacity="0.55"/>`;

    // пена у берегов
    const foam = `<path d="M0 ${T + 12} C 40 ${T + 18}, 90 ${T + 14}, 140 ${T + 20} S 250 ${T + 16}, 340 ${T + 14}" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-dasharray="7 6" opacity="0.55"/>`
      + `<path d="M0 ${B - 14} C 60 ${B - 20}, 130 ${B - 12}, 200 ${B - 18} S 300 ${B - 14}, 340 ${B - 18}" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-dasharray="7 6" opacity="0.5"/>`;

    // сетка старинной карты
    let grid = "";
    for (let gx = 68; gx < MAP.W; gx += 68) grid += `<line x1="${gx}" y1="0" x2="${gx}" y2="${MAP.H}" stroke="#14213d" stroke-width="0.5" opacity="0.045"/>`;
    for (let gy = 82; gy < MAP.H; gy += 82) grid += `<line x1="0" y1="${gy}" x2="${MAP.W}" y2="${gy}" stroke="#14213d" stroke-width="0.5" opacity="0.045"/>`;

    // лоскутные поля
    const field = (x, y, w, h, rot, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" transform="rotate(${rot} ${x + w / 2} ${y + h / 2})" fill="${c}" stroke="#c6bd97" stroke-width="0.6" opacity="0.75"/>`;
    const fields = field(20, 252, 34, 22, -6, "#e9e3c2") + field(58, 262, 30, 20, 4, "#dfe8bf") + field(26, 282, 30, 18, 2, "#e6d9b8")
      + field(240, 236, 34, 20, 5, "#e9e3c2") + field(212, 258, 28, 18, -4, "#dfe8bf")
      + field(196, 700, 34, 22, -5, "#e9e3c2") + field(236, 712, 30, 18, 6, "#e6d9b8") + field(206, 728, 26, 16, 3, "#dfe8bf")
      + field(16, 620, 30, 20, 4, "#dfe8bf") + field(50, 634, 28, 18, -6, "#e9e3c2");

    // холмы и облака
    const hills = hill(-10, 96, 120, 34, "#c7dca6") + hill(90, 104, 150, 40, "#bcd39a") + hill(240, 92, 140, 32, "#c7dca6")
      + `<ellipse class="cloud-a" cx="70" cy="34" rx="26" ry="10" fill="#ffffff" opacity="0.65"/><ellipse class="cloud-b" cx="255" cy="26" rx="30" ry="11" fill="#ffffff" opacity="0.6"/>`;

    // реки (Темза на севере, Сомма/Сена на юге) — с мягкой подложкой берега
    const riverPath = (d) =>
      `<path d="${d}" fill="none" stroke="#5f93b8" stroke-width="6.5" opacity="0.28" stroke-linecap="round"/>`
      + `<path d="${d}" fill="none" stroke="url(#riv)" stroke-width="4" opacity="0.75" stroke-linecap="round"/>`
      + `<path d="${d}" fill="none" stroke="#dcefff" stroke-width="1.1" opacity="0.6" stroke-linecap="round"/>`;
    const rivers = riverPath("M-5 132 C60 112,95 156,150 134 S255 156,345 128")
      + riverPath("M-5 716 C70 700,110 742,175 720 S280 700,345 724");

    // леса (только на суше, вне пролива)
    const woods = [
      [42, 150], [300, 118], [104, 240], [305, 300], [44, 348], [302, 356], [122, 78], [258, 392], [30, 316],
      [44, 660], [300, 628], [72, 742], [300, 752], [122, 792], [278, 706], [110, 660]
    ].map(([x, y]) => forest(x, y)).join("");

    // второстепенные города — у краёв (вне коридора маршрута) и вне полос
    // чекпойнтов; подпись над/под домиком, чтобы не перекрывалась и не резалась
    const towns = [
      [292, 120, "Рочестер", "up"], [50, 168, "Мейдстон", "down"], [294, 336, "Ашфорд", "up"],
      [54, 672, "Булонь", "down"], [292, 662, "Амьен", "up"], [58, 786, "Бове", "up"], [292, 744, "Сен-Дени", "down"]
    ].map(([x, y, l, s]) => town(x, y, l, s)).join("");

    // детали Ла-Манша: волны, чайки, паром, подпись
    const midY = (YW_TOP + YW_BOT) / 2;
    let waves = "";
    for (let k = 0; k < 3; k++) {
      const wy = YW_TOP + 26 + k * ((YW_BOT - YW_TOP - 40) / 2);
      waves += `<path d="M14 ${wy} q18 -7 36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0" fill="none" stroke="#ffffff" stroke-width="1.4" opacity="0.35"/>`;
    }
    const ferry = `<g transform="translate(${MAP.CX - 70} ${midY - 18})"><g class="ferry-bob">
      <path d="M0 10 h34 l-5 9 h-24 z" fill="#3b4a63"/><rect x="8" y="2" width="16" height="9" fill="#e9e3d2"/>
      <rect x="15" y="-8" width="2" height="10" fill="#8a8267"/><rect x="17" y="-8" width="7" height="5" fill="#d1495b"/></g></g>`;
    const gulls = gull(MAP.CX + 40, YW_TOP + 30) + gull(MAP.CX + 58, YW_TOP + 40) + gull(60, YW_BOT - 34);
    const label = `<text x="322" y="${midY}" text-anchor="middle" transform="rotate(90 322 ${midY})" font-size="12" font-style="italic" font-weight="700" fill="#256f69" letter-spacing="2.5" font-family="Georgia,'Times New Roman',serif" opacity="0.85">ЛА-МАНШ</text>`;

    // пирс Кале с лодочкой у причала
    const pier = `<path d="M266 ${B} v-14 h14" fill="none" stroke="#6f6a58" stroke-width="2.6" opacity="0.85"/>`
      + `<ellipse cx="286" cy="${B - 15}" rx="4" ry="2" fill="#9a5b4a"/>`;

    // морской змей — классика старинных карт
    const monster = `<g opacity="0.75" class="boat-bob">`
      + `<path d="M228 552 q8 -12 16 0 q8 12 16 0 q8 -12 16 0" fill="none" stroke="#2b7f78" stroke-width="3" stroke-linecap="round"/>`
      + `<path d="M228 552 q-5 4 -9 1" fill="none" stroke="#2b7f78" stroke-width="2" stroke-linecap="round"/>`
      + `<circle cx="279" cy="547" r="3.6" fill="#2b7f78"/>`
      + `<circle cx="280.6" cy="546" r="0.9" fill="#ffffff"/>`
      + `<path d="M278 543.5 l-1.5 -3 M281 543.5 l1.5 -3" stroke="#2b7f78" stroke-width="1.2" stroke-linecap="round"/></g>`;

    // роза ветров
    const compass = `<g transform="translate(58 468)" opacity="0.9">`
      + `<circle r="20" fill="#f7f2e2" stroke="#8a8267" stroke-width="1"/>`
      + `<circle r="15.5" fill="none" stroke="#c9bf9f" stroke-width="0.7"/>`
      + `<polygon points="0,-16 2.6,-2.6 16,0 2.6,2.6 0,16 -2.6,2.6 -16,0 -2.6,-2.6" fill="#14213d"/>`
      + `<polygon points="0,-10 2,-2 10,0 2,2 0,10 -2,2 -10,0 -2,-2" transform="rotate(45)" fill="#c8a24a"/>`
      + `<polygon points="0,-16 2.6,-2.6 0,0 -2.6,-2.6" fill="#d1495b"/>`
      + `<circle r="2" fill="#f7f2e2" stroke="#14213d" stroke-width="1"/>`
      + `<text y="-24.5" text-anchor="middle" font-size="9" font-weight="700" fill="#14213d" font-family="Georgia,serif">С</text></g>`;

    // бумажная текстура и виньетка (поверх сцены, под маршрутом)
    const paper = `<rect x="0" y="0" width="${MAP.W}" height="${MAP.H}" filter="url(#noiseF)" opacity="0.55"/>`
      + `<rect x="0" y="0" width="${MAP.W}" height="${MAP.H}" fill="url(#vign)"/>`;

    // дополнительные достопримечательности и детали
    const extras =
      // самолёт с инверсионным следом (небо над Лондоном)
      `<line x1="14" y1="58" x2="56" y2="58" stroke="#ffffff" stroke-width="2" stroke-dasharray="6 5" opacity="0.7"/>`
      + `<path d="M56 52 l17 6 l-17 6 l5 -6 z" fill="#3b4a63" opacity="0.85"/>`
      // Биг-Бен у берега Темзы
      + `<g opacity="0.95"><rect x="100" y="98" width="10" height="30" fill="#cfc8b2" stroke="#8a8267" stroke-width="0.7"/>`
      + `<polygon points="100,98 105,88 110,98" fill="#9a5b4a"/>`
      + `<circle cx="105" cy="106" r="3" fill="#ffffff" stroke="#8a8267" stroke-width="0.7"/>`
      + `<line x1="105" y1="106" x2="105" y2="103.6" stroke="#3b3a36" stroke-width="0.7"/>`
      + `<line x1="105" y1="106" x2="107" y2="106" stroke="#3b3a36" stroke-width="0.7"/></g>`
      // овцы на английском лугу
      + [[140, 296], [156, 304], [170, 294]].map(([sx, sy]) =>
        `<g opacity="0.9"><ellipse cx="${sx}" cy="${sy}" rx="7" ry="5" fill="#f4f1e8" stroke="#8a8267" stroke-width="0.6"/>`
        + `<circle cx="${sx + 6.5}" cy="${sy - 2}" r="2.6" fill="#3b3a36"/>`
        + `<rect x="${sx - 4}" y="${sy + 4}" width="1.6" height="4" fill="#3b3a36"/>`
        + `<rect x="${sx + 2}" y="${sy + 4}" width="1.6" height="4" fill="#3b3a36"/></g>`).join("")
      // маяк на скалах Дувра
      + `<g opacity="0.95"><ellipse cx="306" cy="${YW_TOP - 6}" rx="12" ry="4" fill="#c9c2ae"/>`
      + `<rect x="301" y="${YW_TOP - 34}" width="10" height="26" fill="#f4f1e8" stroke="#8a8267" stroke-width="0.8"/>`
      + `<rect x="301" y="${YW_TOP - 29}" width="10" height="5" fill="#d1495b"/>`
      + `<rect x="301" y="${YW_TOP - 19}" width="10" height="5" fill="#d1495b"/>`
      + `<rect x="299" y="${YW_TOP - 39}" width="14" height="5" fill="#14213d"/>`
      + `<circle cx="306" cy="${YW_TOP - 41}" r="2.5" fill="#ffd76a"/></g>`
      // парусник в проливе
      + `<g class="boat-bob"><path d="M52 ${midY + 38} h24 l-5 7 h-15 z" fill="#9a5b4a"/>`
      + `<path d="M64 ${midY + 36} v-17 l11 17 z" fill="#ffffff"/>`
      + `<path d="M62 ${midY + 36} v-13 l-9 13 z" fill="#ece7da"/></g>`
      // мельница в полях Пикардии
      + `<g opacity="0.95"><path d="M136 708 l3 -18 h5 l3 18 z" fill="#b98d5f" stroke="#8a8267" stroke-width="0.6"/>`
      + `<g stroke="#6f5a3a" stroke-width="2" stroke-linecap="round">`
      + `<line x1="141.5" y1="690" x2="131" y2="679"/><line x1="141.5" y1="690" x2="152" y2="679"/>`
      + `<line x1="141.5" y1="690" x2="131" y2="701"/><line x1="141.5" y1="690" x2="152" y2="701"/></g>`
      + `<circle cx="141.5" cy="690" r="1.8" fill="#3b3a36"/></g>`
      // Триумфальная арка на подходе к Парижу
      + `<g opacity="0.95"><rect x="222" y="752" width="18" height="16" fill="#e8e0cc" stroke="#8a8267" stroke-width="0.7"/>`
      + `<path d="M227 768 v-8 a4 4 0 0 1 8 0 v8 z" fill="#7a7565"/></g>`;

    return defs + sea + engLand + frLand + foam + grid + fields + hills + rivers + woods + towns
      + waves + pier + ferry + extras + monster + gulls + compass + label + paper;
  }
  const MAP_SCENERY = mapScenery();

  function mapRouteSVG() {
    const full = routePath(0, 1, 140), water = routePath(0.5, 0.75, 48);
    const dots = L.checkpointDistances().map((cp) => {
      const { x, y } = routeXY(cp.share / 100);
      const fin = cp.share === 100;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="#fff" stroke="${fin ? "var(--danger)" : "var(--brass-2)"}" stroke-width="2"/>`;
    }).join("");
    // километровые отметки вдоль маршрута (каждые 100 км)
    let ticks = "";
    for (let km = 100; km < C.TOTAL_ROUTE_KM; km += 100) {
      const p = km / C.TOTAL_ROUTE_KM;
      const { x, y } = routeXY(p);
      const side = x >= MAP.CX ? 1 : -1;
      ticks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="#fff" stroke="#7a5c12" stroke-width="1.2"/>`
        + `<text x="${(x + side * 9).toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="8" fill="#7a5c12" text-anchor="${side > 0 ? "start" : "end"}" font-family="Georgia,serif" font-style="italic">${km} км</text>`;
    }
    // двойная рамка старинной карты — поверх всего
    const frame = `<rect x="2" y="2" width="${MAP.W - 4}" height="${MAP.H - 4}" rx="11" fill="none" stroke="#b89a55" stroke-width="2" opacity="0.9"/>`
      + `<rect x="7" y="7" width="${MAP.W - 14}" height="${MAP.H - 14}" rx="8" fill="none" stroke="#b89a55" stroke-width="0.7" opacity="0.65"/>`;

    return `<path d="${full}" fill="none" stroke="#6b5626" stroke-width="6.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.32"/>`
      + `<path d="${full}" fill="none" stroke="#f7eed6" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`
      + `<path class="route-anim" d="${full}" fill="none" stroke="var(--brass-2)" stroke-width="3" stroke-linecap="round" stroke-dasharray="0.1 9"/>`
      + `<path class="route-anim" d="${water}" fill="none" stroke="var(--water)" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="0.1 9"/>`
      + ticks + dots + frame;
  }

  /* ===================================================================
   * ВКЛАДКА: КАРТА
   * =================================================================== */
  function renderMap() {
    const race = state.race || { lap: 1 };
    const prog = L.allProgress(state.users, state.entries, race); // отсортировано по km
    const cps = L.checkpointDistances();

    // фишки: декластеризация по вертикали (горизонтальный сдвиг близких)
    const sorted = prog.slice().sort((a, b) => a.pct - b.pct);
    let slot = 0, lastPct = -99;
    const chipHTML = sorted.map((p) => {
      if (p.pct - lastPct < 6) slot++; else slot = 0;
      lastPct = p.pct;
      const dir = slot % 2 ? 1 : -1;
      const off = Math.ceil(slot / 2) * 74 * dir;
      const leader = prog[0] && prog[0].login === p.login && p.km > 0;
      const pos = routePos(Math.min(1, p.pct / 100));
      return `<div class="chip${leader ? " leader" : ""}" style="left:${pos.left}%;top:${pos.top}%;transform:translate(calc(-50% + ${off}px),-50%)" title="${esc(p.login)} — ${L.fmtKm(p.km)} км">
        ${window.avatarSVG(p.user, 24)}<span>${leader ? "👑 " : ""}${esc(p.login)}</span><span class="chip-pct">${Math.round(p.pct)}%</span>
      </div>`;
    }).join("");

    const cpHTML = cps.map((cp) => {
      const p = cp.share / 100, pos = routePos(p), finish = cp.share === 100;
      const side = routeXY(p).x < MAP.CX ? "right" : "left"; // подпись — в сторону центра
      const tag = side === "right"
        ? `left:${pos.left}%;top:${pos.top}%;transform:translate(26px,-50%);text-align:left`
        : `left:${pos.left}%;top:${pos.top}%;transform:translate(calc(-100% - 26px),-50%);text-align:right`;
      return `<div class="cp-badge${finish ? " finish" : ""}" style="left:${pos.left}%;top:${pos.top}%">${window.checkpointImg(cp)}</div>
        <div class="cp-tag${finish ? " finish" : ""}" style="${tag}">
          <span class="cp-name">${esc(cp.name)}${cp.sub ? " · " + esc(cp.sub) : ""}</span>
          <span class="cp-dist">${cp.share}% · ${L.fmtKm(cp.km)} км</span>
        </div>`;
    }).join("");

    const mapSVG = `<svg class="map-bg" viewBox="0 0 ${MAP.W} ${MAP.H}" preserveAspectRatio="none" aria-hidden="true">${MAP_SCENERY}${mapRouteSVG()}</svg>`;

    const winnerLine = race.lastWinner
      ? `🏆 Победитель круга №${(race.lap || 1) - 1}: <span class="winner">${esc(race.lastWinner)}</span>`
      : `Первый круг ещё идёт — победителей пока нет`;
    const teamKm = L.stepsToKm(state.entries.reduce((s, e) => s + (Number(e.steps) || 0), 0));

    const whoHTML = prog.length ? prog.map((p, i) => `
      <div class="who">
        <div class="rank-pos ${i === 0 && p.km > 0 ? "first" : i === 1 && p.km > 0 ? "p2" : i === 2 && p.km > 0 ? "p3" : ""}">${i + 1}</div>
        ${window.avatarSVG(p.user, 34)}
        <div style="flex:1">
          <div class="who-name">${esc(p.login)}</div>
          <div class="who-bar"><i style="width:${p.pct}%"></i></div>
          <div class="who-meta">${L.fmtKm(p.km)} км · ${Math.round(p.pct)}% · пройдено: ${esc(p.passed.name)}</div>
          ${p.km > 0 ? `<div class="who-meta">${p.pct >= 100 ? "🏁 на финише!" : whoForecast(p)}</div>` : ""}
        </div>
      </div>`).join("") : emptyBlock("👣", "Пока никто не сделал ни шага", "Внесите шаги во вкладке «Мои данные».");

    views.map.innerHTML = `
      <div class="lap-banner">
        <div class="lapno">№${race.lap || 1}</div>
        <div class="lapmeta">
          <div>Текущий круг · Лондон → Париж (${L.fmtKm(C.TOTAL_ROUTE_KM)} км)</div>
          <div>${winnerLine}</div>
          <div style="opacity:.85">Команда суммарно: <b>${L.fmtKm(teamKm)} км</b> · ${L.fmtKm(teamKm / C.TOTAL_ROUTE_KM)}× маршрута</div>
        </div>
      </div>
      <div class="card map">
        <div class="map-canvas">
          ${mapSVG}
          ${cpHTML}
          ${chipHTML}
        </div>
      </div>
      <div class="card who-list">
        <h2>Кто где</h2>
        ${whoHTML}
      </div>
      ${modeHint()}`;
  }

  /* ===================================================================
   * ВКЛАДКА: СТАТИСТИКА
   * =================================================================== */
  function renderStats() {
    const mt = L.monthlyTotals(state.users, state.entries);
    const months = mt.months.slice();
    const curMk = L.monthKey(L.today());
    if (!months.includes(curMk)) months.push(curMk);
    months.sort();
    if (!months.includes(state.statMonth)) state.statMonth = curMk;

    // Рейтинг за выбранный месяц (по шагам, OQ-8)
    const ranking = L.monthlyRanking(state.users, state.entries, state.statMonth);
    const maxSteps = Math.max(1, ...ranking.map((r) => r.steps));
    const medal = (i, v) => (v > 0 && i < 3 ? ["🥇 ", "🥈 ", "🥉 "][i] : "");
    const barsHTML = ranking.some((r) => r.steps > 0)
      ? ranking.map((r, i) => `
        <div class="bar-row">
          <div class="bar-name">${medal(i, r.steps)}${esc(r.user.login)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${r.steps / maxSteps * 100}%"></div></div>
          <div class="bar-val">${L.fmtInt(r.steps)}</div>
        </div>`).join("")
      : `<div class="empty small">Нет данных за ${esc(L.monthLabel(state.statMonth))}.</div>`;

    const monthOpts = months.map((mk) =>
      `<option value="${mk}"${mk === state.statMonth ? " selected" : ""}>${esc(L.monthLabel(mk))}</option>`).join("");

    // Диаграмма помесячной динамики суммарных шагов
    const dyn = mt.months.map((mk) => ({ mk, steps: mt.totals[mk].steps }));
    const dynChart = renderDynChart(dyn);

    // Таблица помесячных итогов (переключатель шаги/км)
    const unit = state.statUnit;
    const cols = mt.months;
    const tableHTML = cols.length ? `
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>Участник</th>${cols.map((mk) => `<th>${esc(L.monthLabel(mk))}</th>`).join("")}<th>Итого</th></tr></thead>
        <tbody>
          ${state.users.map((u) => {
            let sum = 0;
            const cells = cols.map((mk) => {
              const v = (mt.perUser[u.login] && mt.perUser[u.login][mk]) || { steps: 0, km: 0 };
              sum += unit === "steps" ? v.steps : v.km;
              return `<td>${v.steps || v.km ? cell(v, unit) : "—"}</td>`;
            }).join("");
            return `<tr><td>${esc(u.login)}</td>${cells}<td>${unit === "steps" ? L.fmtInt(sum) : L.fmtKm(sum)}</td></tr>`;
          }).join("")}
        </tbody>
        <tfoot><tr><td>Всего</td>${cols.map((mk) => {
          const t = mt.totals[mk]; return `<td>${cell(t, unit)}</td>`;
        }).join("")}<td>${totalAll(mt, unit)}</td></tr></tfoot>
      </table></div>` : `<div class="empty small">Пока нет записей для сводки.</div>`;

    // Блок текущего круга
    const prog = L.allProgress(state.users, state.entries, state.race);
    const lapLeader = prog[0] && prog[0].km > 0 ? `${esc(prog[0].login)} (${L.fmtKm(prog[0].km)} км, ${Math.round(prog[0].pct)}%)` : "—";
    const lapRankHTML = prog.length && prog[0].km > 0
      ? prog.filter((p) => p.km > 0).map((p, i) => `<div class="who"><div class="rank-pos ${i===0?"first":""}">${i+1}</div>${window.avatarSVG(p.user,30)}<div style="flex:1"><div class="who-name">${esc(p.login)}</div><div class="who-meta">${L.fmtKm(p.km)} км · ${Math.round(p.pct)}%</div></div></div>`).join("")
      : `<div class="small muted">Круг только начался.</div>`;

    views.stats.innerHTML = `
      <div class="card">
        <div class="row">
          <h2 style="margin:0">Рейтинг за месяц</h2>
          <div class="spacer"></div>
          <select id="statMonthSel" style="width:auto;min-width:150px">${monthOpts}</select>
        </div>
        <p class="small muted" style="margin:6px 0 12px">Основной рейтинг — по количеству шагов (OQ-8).</p>
        <div class="bars">${barsHTML}</div>
      </div>

      <div class="card">
        <h2>Достижения</h2>
        ${achievementsHTML()}
      </div>

      <div class="card">
        <h2>Помесячная динамика (суммарные шаги)</h2>
        ${dyn.length ? dynChart : '<div class="empty small">Пока нет данных для графика.</div>'}
      </div>

      <div class="card">
        <div class="row">
          <h2 style="margin:0">Помесячные итоги</h2>
          <div class="spacer"></div>
          <div class="toggle" id="unitToggle">
            <button class="${unit === "steps" ? "on" : ""}" data-unit="steps">Шаги</button>
            <button class="${unit === "km" ? "on" : ""}" data-unit="km">Км</button>
          </div>
        </div>
        ${tableHTML}
      </div>

      <div class="card">
        <h2>Текущий круг №${state.race.lap || 1}</h2>
        <p class="small">Лидер круга: <strong>${lapLeader}</strong></p>
        <div class="who-list">${lapRankHTML}</div>
      </div>
      ${modeHint()}`;

    $("statMonthSel").addEventListener("change", (e) => { state.statMonth = e.target.value; renderStats(); });
    $("unitToggle").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => { state.statUnit = b.dataset.unit; renderStats(); }));

    function cell(v, u) { return u === "steps" ? L.fmtInt(v.steps) : L.fmtKm(v.km); }
    function totalAll(mt, u) {
      let s = 0; mt.months.forEach((mk) => (s += u === "steps" ? mt.totals[mk].steps : mt.totals[mk].km));
      return u === "steps" ? L.fmtInt(s) : L.fmtKm(s);
    }
  }

  function renderDynChart(dyn) {
    const W = 100 * dyn.length + 20, H = 180, pad = 26, bw = 60;
    const max = Math.max(1, ...dyn.map((d) => d.steps));
    const bars = dyn.map((d, i) => {
      const x = 20 + i * 100, h = (H - pad - 10) * (d.steps / max), y = H - pad - h;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4"/>
        <text x="${x + bw / 2}" y="${H - pad + 14}" text-anchor="middle">${esc(L.monthLabel(d.mk).replace(/ \d+$/, ""))}</text>
        <text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-weight="700">${shortNum(d.steps)}</text>`;
    }).join("");
    return `<div class="table-wrap"><svg class="dyn-chart" viewBox="0 0 ${W} ${H}" style="min-width:${Math.max(W, 300)}px">
      <line class="axis" x1="16" y1="${H - pad}" x2="${W}" y2="${H - pad}"/>${bars}</svg></div>`;
  }
  function shortNum(n) { return n >= 1000 ? Math.round(n / 100) / 10 + "k" : String(n); }

  /* ===================================================================
   * ВКЛАДКА: СТЕНА
   * =================================================================== */
  function renderWall() {
    const um = userMap();
    const list = state.wall.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const canPost = !!state.session.login;

    const composer = canPost ? `
      <div class="card">
        <h2>Новое сообщение</h2>
        <textarea id="wallText" maxlength="${C.WALL_MAX_LEN}" placeholder="Поделитесь успехами…"></textarea>
        <div class="emoji-row" id="emojiRow">${["👍", "🔥", "👏", "🏆", "👟", "🎉"].map((e) => `<button type="button" data-emoji="${e}" aria-label="Добавить ${e}">${e}</button>`).join("")}</div>
        <div class="row" style="margin-top:8px">
          <span class="field-hint" id="wallCounter">0 / ${C.WALL_MAX_LEN}</span>
          <div class="spacer"></div>
          <button class="brass" id="wallSend">Опубликовать</button>
        </div>
      </div>`
      : `<div class="card"><div class="notice warn">Чтобы писать на стене, войдите как участник во вкладке «Мои данные». Читать могут все.</div></div>`;

    const feed = list.length ? list.map((m) => `
      <div class="msg" data-id="${esc(m.id)}">
        ${window.avatarSVG(um[m.login] || { login: m.login }, 36)}
        <div class="msg-body">
          <div class="msg-head">
            <span class="msg-author">${esc(m.login)}</span>
            <span class="msg-time">${relTime(m.createdAt || Date.now())}</span>
            ${state.session.admin ? `<button class="ghost small msg-del" data-del="${esc(m.id)}">Удалить</button>` : ""}
          </div>
          <div class="msg-text">${esc(m.text)}</div>
        </div>
      </div>`).join("")
      : emptyBlock("💬", "Пока тихо", "Станьте первым, кто напишет на стене!");

    views.wall.innerHTML = composer + `<div class="card"><h2>Лента</h2>${feed}</div>` + modeHint();

    if (canPost) {
      const ta = $("wallText"), cnt = $("wallCounter");
      ta.addEventListener("input", () => (cnt.textContent = ta.value.length + " / " + C.WALL_MAX_LEN));
      views.wall.querySelectorAll("#emojiRow [data-emoji]").forEach((b) =>
        b.addEventListener("click", () => {
          if (ta.value.length + b.dataset.emoji.length <= C.WALL_MAX_LEN) {
            ta.value += b.dataset.emoji;
            cnt.textContent = ta.value.length + " / " + C.WALL_MAX_LEN;
            ta.focus();
          }
        }));
      $("wallSend").addEventListener("click", () => {
        const text = ta.value.trim();
        if (!text) return toast("Сообщение пустое", "err");
        S.addWall({ login: state.session.login, text: text.slice(0, C.WALL_MAX_LEN), createdAt: Date.now() });
        ta.value = ""; cnt.textContent = "0 / " + C.WALL_MAX_LEN;
        toast("Опубликовано");
      });
    }
    views.wall.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        if (confirm("Удалить сообщение?")) { S.deleteWall(b.dataset.del); toast("Сообщение удалено"); }
      }));
  }

  /* ===================================================================
   * ВКЛАДКА: МОИ ДАННЫЕ
   * =================================================================== */
  function renderMe() {
    if (!state.session.login) { renderLogin(); return; }
    const login = state.session.login;
    const me = findUser(login);
    if (!me) { // участника удалили
      state.session.login = null; sessionStorage.removeItem("sess.login"); updateBadge(); renderLogin(); return;
    }
    const mine = state.entries.filter((e) => e.login === login).sort((a, b) => b.date.localeCompare(a.date));
    const editing = state.editingDate;
    const editEntry = editing ? mine.find((e) => e.date === editing) : null;
    const defDate = editEntry ? editEntry.date : L.today();
    const defSteps = editEntry ? editEntry.steps : "";

    const listHTML = mine.length ? mine.map((e) => `
      <div class="entry">
        <span class="e-date">${fmtDate(e.date)}</span>
        <span class="e-steps">${L.fmtInt(e.steps)} шаг · <span class="muted">${L.fmtKm(L.stepsToKm(e.steps))} км</span></span>
        <div class="spacer"></div>
        <button class="ghost small" data-edit="${e.date}">Править</button>
      </div>`).join("")
      : emptyBlock("👟", "Пока нет записей", "Внесите первые шаги — км посчитаются сами.");

    views.me.innerHTML = `
      <div class="card">
        <div class="row">
          <div>${window.avatarSVG(me, 40)}</div>
          <div><div style="font-weight:800">${esc(login)}</div><div class="small muted">персональный режим</div></div>
          <div class="spacer"></div>
          <button class="ghost" id="logoutBtn">Выйти</button>
        </div>
      </div>

      <div class="card">
        <h2>${editEntry ? "Редактирование записи" : "Внести шаги"}</h2>
        <label for="entryDate">Дата</label>
        <input type="date" id="entryDate" value="${defDate}" max="${L.today()}" ${editEntry ? "readonly" : ""}>
        <label for="entrySteps">Шаги за день</label>
        <input type="number" id="entrySteps" inputmode="numeric" min="0" step="1" value="${defSteps}" placeholder="например, 8500">
        <div class="field-hint" id="kmPreview"></div>
        <div class="field-hint field-warn" id="stepWarn" style="display:none"></div>
        <div class="row" style="margin-top:12px">
          <button class="brass" id="saveEntry">${editEntry ? "Сохранить изменения" : "Сохранить"}</button>
          ${editEntry ? '<button class="ghost" id="cancelEdit">Отмена</button>' : ""}
        </div>
      </div>

      <div class="card">
        <h2>Мои рекорды</h2>
        ${(() => {
          const r = myRecords(login);
          return `<div class="rec-grid">
            <div class="rec-tile"><div class="rec-num">${L.fmtKm(r.totalKm)}</div><div class="rec-lab">км за всё время</div></div>
            <div class="rec-tile"><div class="rec-num">${L.fmtInt(r.best)}</div><div class="rec-lab">лучший день${r.bestDate ? " · " + fmtDate(r.bestDate) : ""}</div></div>
            <div class="rec-tile"><div class="rec-num">${r.streak}</div><div class="rec-lab">дн. подряд сейчас</div></div>
            <div class="rec-tile"><div class="rec-num">${L.fmtInt(r.last7)}</div><div class="rec-lab">шагов за 7 дней</div></div>
          </div>`;
        })()}
      </div>

      <div class="card">
        <h2>Мои записи</h2>
        ${listHTML}
      </div>
      ${modeHint()}`;

    const stepsInput = $("entrySteps"), kmPrev = $("kmPreview"), warn = $("stepWarn");
    function refreshPreview() {
      const v = parseInt(stepsInput.value, 10);
      if (!isNaN(v) && v >= 0) kmPrev.textContent = "≈ " + L.fmtKm(L.stepsToKm(v)) + " км";
      else kmPrev.textContent = "";
      if (!isNaN(v) && v > C.MAX_STEPS_PER_DAY) {
        warn.style.display = "block";
        warn.textContent = "Многовато за день (> " + L.fmtInt(C.MAX_STEPS_PER_DAY) + "). Проверьте, нет ли опечатки.";
      } else warn.style.display = "none";
    }
    stepsInput.addEventListener("input", refreshPreview); refreshPreview();

    $("logoutBtn").addEventListener("click", () => {
      state.session.login = null; state.editingDate = null; sessionStorage.removeItem("sess.login");
      updateBadge(); toast("Вы вышли"); render();
    });
    if (editEntry) $("cancelEdit").addEventListener("click", () => { state.editingDate = null; renderMe(); });
    views.me.querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", () => { state.editingDate = b.dataset.edit; renderMe(); window.scrollTo({ top: 0, behavior: "smooth" }); }));

    $("saveEntry").addEventListener("click", () => {
      const date = $("entryDate").value;
      const raw = $("entrySteps").value.trim();
      if (!date) return toast("Укажите дату", "err");
      if (date > L.today()) return toast("Нельзя вносить будущие даты", "err");
      if (raw === "" || !/^\d+$/.test(raw)) return toast("Введите целое число шагов (0 или больше)", "err");
      const steps = parseInt(raw, 10);
      if (steps < 0) return toast("Число шагов не может быть отрицательным", "err");
      if (steps > C.MAX_STEPS_PER_DAY && !confirm("Вы ввели " + L.fmtInt(steps) + " шагов за день — это очень много. Сохранить?")) return;
      const now = Date.now();
      const existing = state.entries.find((e) => e.login === login && e.date === date);
      S.setEntry({ login, date, steps, createdAt: existing ? existing.createdAt : now, updatedAt: now });
      state.editingDate = null;
      toast("Сохранено: " + L.fmtInt(steps) + " шаг (" + L.fmtKm(L.stepsToKm(steps)) + " км)");
    });
  }

  function renderLogin() {
    views.me.innerHTML = `
      <div class="card">
        <h2>Вход участника</h2>
        <p class="small muted">Логин и пароль выдаёт организатор. Забыли — обратитесь к нему.</p>
        <label for="loginName">Логин</label>
        <input id="loginName" autocomplete="username" placeholder="ваш логин">
        <label for="loginPass">Пароль</label>
        <input id="loginPass" type="password" autocomplete="current-password" placeholder="ваш пароль">
        <div id="loginMsg"></div>
        <button class="brass" id="loginBtn" style="margin-top:12px;width:100%">Войти</button>
      </div>
      ${modeHint()}`;
    const doLogin = async () => {
      const login = $("loginName").value.trim();
      const pass = $("loginPass").value;
      const msg = $("loginMsg");
      const u = findUser(login);
      if (!u) { msg.innerHTML = '<div class="notice err">Такого участника нет. Проверьте логин.</div>'; return; }
      if (!(await A.verify(u, pass))) { msg.innerHTML = '<div class="notice err">Неверный пароль.</div>'; return; }
      state.session.login = login; sessionStorage.setItem("sess.login", login);
      updateBadge(); toast("Здравствуйте, " + login + "!"); render();
    };
    $("loginBtn").addEventListener("click", doLogin);
    $("loginPass").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  }

  /* ===================================================================
   * ВКЛАДКА: АДМИН
   * =================================================================== */
  function renderAdmin() {
    if (!state.session.admin) { renderAdminLogin(); return; }
    const users = state.users.slice().sort((a, b) => a.login.localeCompare(b.login));
    const wall = state.wall.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const usersHTML = users.length ? users.map((u) => {
      const cnt = state.entries.filter((e) => e.login === u.login).length;
      return `<div class="plist-item${state.editingUser === u.login ? " editing" : ""}">
        ${window.avatarSVG(u, 34)}
        <div style="flex:1"><div style="font-weight:700">${esc(u.login)}</div>
          <div class="small muted">${cnt} запис${plural(cnt)} · с ${u.createdAt ? new Date(u.createdAt).toLocaleDateString("ru-RU") : "—"}</div></div>
        <button class="ghost small" data-edituser="${esc(u.login)}">Изменить</button>
        <button class="danger small" data-deluser="${esc(u.login)}">Удалить</button>
      </div>`;
    }).join("") : '<div class="empty small">Участников пока нет — зарегистрируйте первого.</div>';

    const wallHTML = wall.length ? wall.slice(0, 30).map((m) => `
      <div class="plist-item">
        <div style="flex:1"><strong>${esc(m.login)}</strong>: ${esc(m.text)}<div class="small muted">${relTime(m.createdAt || Date.now())}</div></div>
        <button class="danger small" data-delmsg="${esc(m.id)}">Удалить</button>
      </div>`).join("") : '<div class="empty small">Сообщений нет.</div>';

    views.admin.innerHTML = `
      <div class="card">
        <div class="row"><h2 style="margin:0">Панель администратора</h2><div class="spacer"></div><button class="ghost" id="adminLogout">Выйти</button></div>
      </div>

      ${(() => {
        const eu = state.editingUser ? findUser(state.editingUser) : null;
        if (eu) {
          return `<div class="card" id="userForm">
            <h2>Изменение участника: ${esc(eu.login)}</h2>
            <label for="regLogin">Логин</label>
            <input id="regLogin" value="${esc(eu.login)}">
            <label for="regPass">Новый пароль</label>
            <input id="regPass" type="text" placeholder="оставьте пустым — пароль не изменится">
            <label for="regPhoto">URL аватара (пусто — монограмма)</label>
            <input id="regPhoto" value="${esc(eu.photoURL || "")}" placeholder="https://…">
            <div id="regMsg"></div>
            <div class="row" style="margin-top:12px">
              <button class="brass" id="saveUserBtn">Сохранить изменения</button>
              <button class="ghost" id="cancelUserBtn">Отмена</button>
            </div>
          </div>`;
        }
        return `<div class="card">
          <h2>Регистрация участника</h2>
          <label for="regLogin">Логин (уникальный)</label>
          <input id="regLogin" placeholder="например, vova">
          <label for="regPass">Пароль</label>
          <input id="regPass" type="text" placeholder="выдайте участнику">
          <label for="regPhoto">URL аватара (необязательно)</label>
          <input id="regPhoto" placeholder="https://… — иначе монограмма">
          <div id="regMsg"></div>
          <button class="brass" id="regBtn" style="margin-top:12px">Зарегистрировать</button>
        </div>`;
      })()}

      <div class="card">
        <h2>Участники (${users.length})</h2>
        ${usersHTML}
      </div>

      <div class="card">
        <h2>Модерация стены</h2>
        ${wallHTML}
      </div>
      ${modeHint()}`;

    $("adminLogout").addEventListener("click", () => {
      state.session.admin = false; sessionStorage.removeItem("sess.admin"); updateBadge(); toast("Выход из админ-режима"); render();
    });

    const loginValid = (v) => /^[\wа-яА-ЯёЁ.\-]{2,20}$/.test(v) && !v.includes("__");

    if ($("regBtn")) $("regBtn").addEventListener("click", async () => {
      const login = $("regLogin").value.trim();
      const pass = $("regPass").value;
      const photo = $("regPhoto").value.trim();
      const msg = $("regMsg");
      if (!login) { msg.innerHTML = '<div class="notice err">Укажите логин.</div>'; return; }
      if (!loginValid(login)) { msg.innerHTML = '<div class="notice err">Логин: 2–20 символов, буквы/цифры/точка/дефис, без «__».</div>'; return; }
      if (findUser(login)) { msg.innerHTML = '<div class="notice err">Логин занят — выберите другой.</div>'; return; }
      if (!pass || pass.length < 3) { msg.innerHTML = '<div class="notice err">Пароль — минимум 3 символа.</div>'; return; }
      const cred = await A.makeCredential(pass);
      S.upsertUser({ login, passwordHash: cred.passwordHash, salt: cred.salt, photoURL: photo || "", createdAt: Date.now() });
      $("regLogin").value = ""; $("regPass").value = ""; $("regPhoto").value = "";
      msg.innerHTML = '<div class="notice ok">Участник «' + esc(login) + '» создан.</div>';
      toast("Участник добавлен");
    });

    // --- Редактирование участника ---
    views.admin.querySelectorAll("[data-edituser]").forEach((b) =>
      b.addEventListener("click", () => { state.editingUser = b.dataset.edituser; renderAdmin(); window.scrollTo({ top: 0, behavior: "smooth" }); }));
    if ($("cancelUserBtn")) $("cancelUserBtn").addEventListener("click", () => { state.editingUser = null; renderAdmin(); });

    if ($("saveUserBtn")) $("saveUserBtn").addEventListener("click", async () => {
      const oldLogin = state.editingUser;
      const cur = findUser(oldLogin);
      const msg = $("regMsg");
      if (!cur) { state.editingUser = null; return renderAdmin(); }
      const newLogin = $("regLogin").value.trim();
      const pass = $("regPass").value;
      const photo = $("regPhoto").value.trim();
      if (!loginValid(newLogin)) { msg.innerHTML = '<div class="notice err">Логин: 2–20 символов, буквы/цифры/точка/дефис, без «__».</div>'; return; }
      if (newLogin !== oldLogin && findUser(newLogin)) { msg.innerHTML = '<div class="notice err">Логин занят — выберите другой.</div>'; return; }
      if (pass && pass.length < 3) { msg.innerHTML = '<div class="notice err">Пароль — минимум 3 символа.</div>'; return; }

      // новые учётные данные (если пароль задан — пересоздаём соль+хеш, иначе сохраняем прежние)
      let passwordHash = cur.passwordHash, salt = cur.salt;
      if (pass) { const c = await A.makeCredential(pass); passwordHash = c.passwordHash; salt = c.salt; }
      const newUser = { login: newLogin, passwordHash, salt, photoURL: photo || "", createdAt: cur.createdAt || Date.now() };

      if (newLogin === oldLogin) {
        S.upsertUser(newUser);
      } else {
        // Переименование: логин — это идентификатор. Переносим записи, сообщения и
        // победителя круга на новый логин, затем удаляем старую запись (и её записи).
        S.upsertUser(newUser);
        state.entries.filter((e) => e.login === oldLogin).forEach((e) =>
          S.setEntry({ login: newLogin, date: e.date, steps: e.steps, createdAt: e.createdAt || Date.now(), updatedAt: Date.now() }));
        state.wall.filter((m) => m.login === oldLogin).forEach((m) => {
          S.deleteWall(m.id); S.addWall({ login: newLogin, text: m.text, createdAt: m.createdAt || Date.now() });
        });
        if (state.race && state.race.lastWinner === oldLogin) S.setRace(Object.assign({}, state.race, { lastWinner: newLogin }));
        S.deleteUser(oldLogin); // удалит старый профиль и старые записи (уже скопированы)
        if (state.session.login === oldLogin) { state.session.login = newLogin; sessionStorage.setItem("sess.login", newLogin); }
      }
      state.editingUser = null;
      renderAdmin();
      toast(newLogin === oldLogin ? "Участник обновлён" : "Участник переименован: " + oldLogin + " → " + newLogin);
    });

    views.admin.querySelectorAll("[data-deluser]").forEach((b) =>
      b.addEventListener("click", () => {
        const login = b.dataset.deluser;
        if (confirm('Удалить участника «' + login + '» и ВСЕ его записи? Это необратимо (месячная история по нему тоже исчезнет).')) {
          S.deleteUser(login); toast("Участник удалён");
        }
      }));
    views.admin.querySelectorAll("[data-delmsg]").forEach((b) =>
      b.addEventListener("click", () => { if (confirm("Удалить сообщение?")) { S.deleteWall(b.dataset.delmsg); toast("Удалено"); } }));
  }

  function renderAdminLogin() {
    views.admin.innerHTML = `
      <div class="card">
        <h2>Вход администратора</h2>
        <p class="small muted">Введите мастер-пароль для регистрации/удаления участников и модерации стены.</p>
        <label for="masterPass">Мастер-пароль</label>
        <input id="masterPass" type="password" autocomplete="off" placeholder="мастер-пароль">
        <div id="masterMsg"></div>
        <button class="brass" id="masterBtn" style="margin-top:12px;width:100%">Войти</button>
        <p class="field-hint" style="margin-top:12px">${securityNote()}</p>
      </div>
      ${modeHint()}`;
    const doAuth = () => {
      const val = $("masterPass").value;
      if (val === C.MASTER_PASSWORD) {
        state.session.admin = true; sessionStorage.setItem("sess.admin", "1");
        updateBadge(); toast("Админ-режим включён"); render();
      } else $("masterMsg").innerHTML = '<div class="notice err">Неверный мастер-пароль.</div>';
    };
    $("masterBtn").addEventListener("click", doAuth);
    $("masterPass").addEventListener("keydown", (e) => { if (e.key === "Enter") doAuth(); });
  }

  /* ===================================================================
   * Рекорды, серии, достижения, прогнозы (всё считается из entries,
   * данные в базе не меняются)
   * =================================================================== */
  function last7Steps(login) {
    const from = L.dateStr(Date.now() - 6 * 86400000);
    return state.entries.reduce((s, e) => (e.login === login && e.date >= from ? s + (Number(e.steps) || 0) : s), 0);
  }
  function paceKmPerDay(login) { return L.stepsToKm(last7Steps(login)) / 7; }

  // Текущая серия дней подряд (сегодняшний день ещё «не сгорел», если не внесён)
  function streakDays(login) {
    const set = new Set(state.entries.filter((e) => e.login === login && (Number(e.steps) || 0) > 0).map((e) => e.date));
    let t = Date.now();
    if (!set.has(L.dateStr(t))) t -= 86400000;
    let n = 0;
    while (set.has(L.dateStr(t))) { n++; t -= 86400000; }
    return n;
  }

  function myRecords(login) {
    let best = 0, bestDate = null, total = 0;
    for (const e of state.entries) {
      if (e.login !== login) continue;
      const s = Number(e.steps) || 0;
      total += s;
      if (s > best) { best = s; bestDate = e.date; }
    }
    return { totalKm: L.stepsToKm(total), best, bestDate, streak: streakDays(login), last7: last7Steps(login) };
  }

  // Строка «→ следующая точка · прогноз финиша» для списка «Кто где»
  function whoForecast(p) {
    const next = L.checkpointDistances().find((c) => c.km > p.km + 1e-9);
    const remain = Math.max(0, C.TOTAL_ROUTE_KM - p.km);
    const pace = paceKmPerDay(p.login);
    const eta = pace > 0 ? Math.ceil(remain / pace) : null;
    let s = next ? `→ ${esc(next.name)} через ${L.fmtKm(next.km - p.km)} км` : "";
    if (eta && eta < 1000) s += ` · финиш через ~${eta} дн.`;
    return s;
  }

  function userBadges(u) {
    const b = [];
    const race = state.race || {};
    if (race.lastWinner === u.login && (race.lap || 1) > 1) b.push(["🏆", "Победитель круга №" + ((race.lap || 2) - 1)]);
    const lp = L.lapProgress(u.login, state.entries, race);
    if (lp.pct >= 75) b.push(["🇫🇷", "На французском берегу"]);
    else if (lp.pct >= 50) b.push(["⛴️", "Пересекает Ла-Манш"]);
    let best = 0;
    const mine = state.entries.filter((e) => e.login === u.login);
    mine.forEach((e) => (best = Math.max(best, Number(e.steps) || 0)));
    if (best >= 40000) b.push(["🚀", "40 000+ шагов за день"]);
    else if (best >= 20000) b.push(["👟", "20 000+ шагов за день"]);
    const st = streakDays(u.login);
    if (st >= 3) b.push(["🔥", "Серия " + st + " дн. подряд"]);
    const mt = L.monthlyTotals([u], mine);
    let maxMonth = 0;
    mt.months.forEach((mk) => (maxMonth = Math.max(maxMonth, ((mt.perUser[u.login] || {})[mk] || {}).steps || 0)));
    if (maxMonth >= 300000) b.push(["🌕", "300 000+ шагов за месяц"]);
    return b;
  }

  function achievementsHTML() {
    if (!state.users.length) return '<div class="empty small">Появятся вместе с участниками.</div>';
    const list = state.users.map((u) => ({ u, b: userBadges(u) }))
      .sort((a, b) => b.b.length - a.b.length || a.u.login.localeCompare(b.u.login));
    return list.map(({ u, b }) => `
      <div class="ach-row">
        ${window.avatarSVG(u, 30)}
        <div style="flex:1">
          <div style="font-weight:700">${esc(u.login)}</div>
          <div class="ach-list">${b.length
            ? b.map((x) => `<span class="ach">${x[0]} ${esc(x[1])}</span>`).join("")
            : '<span class="muted small">пока без наград — всё впереди!</span>'}</div>
        </div>
      </div>`).join("");
  }

  // Конфетти при завершении круга (уважает prefers-reduced-motion)
  function celebrate() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = document.createElement("div");
    c.className = "confetti";
    const colors = ["#c8a24a", "#d1495b", "#2f9c95", "#14213d", "#57bdb6"];
    for (let i = 0; i < 80; i++) {
      const p = document.createElement("i");
      p.style.left = Math.random() * 100 + "%";
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.6).toFixed(2) + "s";
      p.style.animationDuration = (2 + Math.random() * 1.5).toFixed(2) + "s";
      c.appendChild(p);
    }
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4500);
  }

  /* ===================================================================
   * Общие фрагменты
   * =================================================================== */
  function emptyBlock(icon, title, sub) {
    return `<div class="empty"><div class="big">${icon}</div><div style="font-weight:700">${esc(title)}</div><div class="small">${esc(sub)}</div></div>`;
  }
  function modeHint() {
    if (S.mode === "local") {
      return `<div class="notice warn mode-hint">⚙️ Демо-режим (localStorage): данные хранятся только в этом браузере и не видны другим устройствам. Для общего доступа заполните <code>FIREBASE_CONFIG</code> в <code>config.js</code>.</div>`;
    }
    return `<div class="notice ok mode-hint">☁️ Облачный режим (Firebase): данные общие и обновляются у всех в реальном времени.</div>`;
  }
  function securityNote() {
    return "Важно (раздел 12 PRD): в публичном репозитории мастер-пароль не является настоящим секретом. Не используйте важные пароли.";
  }
  function fmtDate(d) {
    const [y, m, day] = d.split("-");
    return day + "." + m + "." + y.slice(2);
  }
  function plural(n) { const n10 = n % 10, n100 = n % 100; if (n10 === 1 && n100 !== 11) return "ь"; if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "и"; return "ей"; }

  // ---------- Старт ----------
  updateBadge();
  setTab("map");
})();
