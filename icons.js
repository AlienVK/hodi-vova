/* =============================================================
 * icons.js — встроенные стилизованные иллюстрации точек маршрута
 * и генератор аватара-монограммы. Всё в SVG, без внешних запросов
 * и без нарушения авторских прав (FR-23, FR-24).
 * ============================================================= */
(function () {
  const wrap = (inner) =>
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="cp-illust" aria-hidden="true">${inner}</svg>`;

  const ICONS = {
    // Тауэрский мост
    bridge: wrap(`
      <rect x="0" y="70" width="100" height="30" fill="var(--water)"/>
      <rect x="20" y="20" width="12" height="55" fill="var(--brass)"/>
      <rect x="68" y="20" width="12" height="55" fill="var(--brass)"/>
      <rect x="18" y="14" width="16" height="10" rx="2" fill="var(--ink)"/>
      <rect x="66" y="14" width="16" height="10" rx="2" fill="var(--ink)"/>
      <polygon points="26,4 34,14 18,14" fill="var(--brass)"/>
      <polygon points="74,4 82,14 66,14" fill="var(--brass)"/>
      <rect x="20" y="34" width="60" height="8" fill="var(--ink)"/>
      <path d="M32 42 Q50 60 68 42" fill="none" stroke="var(--ink)" stroke-width="3"/>
      <path d="M0 40 Q10 34 20 40" fill="none" stroke="var(--ink)" stroke-width="3"/>
      <path d="M80 40 Q90 34 100 40" fill="none" stroke="var(--ink)" stroke-width="3"/>
      <rect x="0" y="66" width="100" height="6" fill="var(--ink)"/>
    `),
    // Кентерберийский собор
    cathedral: wrap(`
      <rect x="0" y="86" width="100" height="14" fill="var(--turf)"/>
      <rect x="30" y="34" width="40" height="52" fill="var(--paper-2)" stroke="var(--ink)" stroke-width="2"/>
      <rect x="42" y="12" width="16" height="74" fill="var(--paper-2)" stroke="var(--ink)" stroke-width="2"/>
      <polygon points="50,0 42,12 58,12" fill="var(--brass)"/>
      <rect x="28" y="30" width="8" height="56" fill="var(--paper-2)" stroke="var(--ink)" stroke-width="2"/>
      <rect x="64" y="30" width="8" height="56" fill="var(--paper-2)" stroke="var(--ink)" stroke-width="2"/>
      <path d="M46 86 v-18 a4 4 0 0 1 8 0 v18 z" fill="var(--ink)"/>
      <circle cx="50" cy="46" r="5" fill="none" stroke="var(--ink)" stroke-width="2"/>
      <line x1="50" y1="8" x2="50" y2="2" stroke="var(--brass)" stroke-width="2"/>
    `),
    // Белые скалы Дувра
    cliffs: wrap(`
      <rect x="0" y="0" width="100" height="60" fill="var(--sky)"/>
      <rect x="0" y="60" width="100" height="40" fill="var(--water)"/>
      <path d="M0 30 L40 26 L48 60 L0 60 Z" fill="#f4f1e8" stroke="var(--ink)" stroke-width="1.5"/>
      <path d="M52 24 L100 22 L100 60 L60 60 Z" fill="#ece7da" stroke="var(--ink)" stroke-width="1.5"/>
      <rect x="0" y="18" width="42" height="12" fill="var(--turf)"/>
      <rect x="54" y="14" width="46" height="10" fill="var(--turf)"/>
      <path d="M0 66 Q20 62 40 66 T80 66 T100 66" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.6"/>
    `),
    // Кале — порт / французский флаг
    port: wrap(`
      <rect x="0" y="70" width="100" height="30" fill="var(--water)"/>
      <rect x="0" y="64" width="100" height="8" fill="var(--ink)"/>
      <rect x="46" y="18" width="4" height="52" fill="var(--ink)"/>
      <rect x="50" y="20" width="12" height="8" fill="#0055A4"/>
      <rect x="62" y="20" width="12" height="8" fill="#f4f1e8"/>
      <rect x="74" y="20" width="12" height="8" fill="#EF4135"/>
      <path d="M20 64 l6 -14 h34 l6 14 z" fill="var(--brass)" stroke="var(--ink)" stroke-width="1.5"/>
      <rect x="30" y="42" width="24" height="8" fill="var(--paper-2)" stroke="var(--ink)" stroke-width="1"/>
      <circle cx="34" cy="46" r="2" fill="var(--ink)"/>
      <circle cx="50" cy="46" r="2" fill="var(--ink)"/>
      <path d="M6 68 h88" stroke="#ffffff" stroke-width="1.5" opacity="0.4"/>
    `),
    // Эйфелева башня
    eiffel: wrap(`
      <rect x="0" y="88" width="100" height="12" fill="var(--turf)"/>
      <path d="M50 6 L44 30 L34 62 L24 88 L38 88 L44 62 L56 62 L62 88 L76 88 L66 62 L56 30 Z"
            fill="none" stroke="var(--brass)" stroke-width="3" stroke-linejoin="round"/>
      <path d="M40 44 L60 44" stroke="var(--brass)" stroke-width="3"/>
      <path d="M35 60 L65 60" stroke="var(--brass)" stroke-width="3"/>
      <path d="M44 30 Q50 26 56 30" fill="none" stroke="var(--brass)" stroke-width="3"/>
      <rect x="48" y="2" width="4" height="8" fill="var(--brass)"/>
      <circle cx="50" cy="2" r="2" fill="var(--danger)"/>
    `)
  };

  // Автогенерируемая монограмма-аватар из логина (первая буква + цвет)
  function monogram(login, size) {
    size = size || 40;
    const letter = (login || "?").trim().charAt(0).toUpperCase() || "?";
    let h = 0;
    for (let i = 0; i < login.length; i++) h = (h * 31 + login.charCodeAt(i)) % 360;
    const bg = `hsl(${h} 45% 42%)`;
    const bg2 = `hsl(${(h + 40) % 360} 50% 30%)`;
    const id = "g" + Math.abs(h) + login.length;
    return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" class="avatar" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${bg2}"/>
      </linearGradient></defs>
      <circle cx="20" cy="20" r="19" fill="url(#${id})" stroke="var(--brass)" stroke-width="1.5"/>
      <text x="20" y="27" text-anchor="middle" font-size="18" font-weight="700"
            fill="#fff" font-family="system-ui,sans-serif">${letter}</text>
    </svg>`;
  }

  window.ICONS = ICONS;
  window.avatarSVG = function (user, size) {
    if (user && user.photoURL) {
      return `<img class="avatar" src="${escapeAttr(user.photoURL)}" width="${size || 40}" height="${size || 40}"
                   alt="" onerror="this.replaceWith(document.createRange().createContextualFragment(window.monogramFallback(this.dataset.login)))"
                   data-login="${escapeAttr(user.login)}" style="border-radius:50%;object-fit:cover;border:1.5px solid var(--brass)">`;
    }
    return monogram((user && user.login) || "?", size);
  };
  window.monogramFallback = monogram; // на случай битого URL фото
  window.checkpointImg = function (cp) {
    if (cp.photoURL) {
      return `<img class="cp-illust" src="${escapeAttr(cp.photoURL)}" alt=""
                   style="object-fit:cover;border-radius:8px"
                   onerror="this.replaceWith(document.createRange().createContextualFragment(window.ICONS['${cp.icon}']||''))">`;
    }
    return ICONS[cp.icon] || "";
  };

  function escapeAttr(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
