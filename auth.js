/* =============================================================
 * auth.js — хеширование паролей с солью (FR-6, раздел 12).
 * SHA-256 через SubtleCrypto в защищённом контексте (https/localhost);
 * при недоступности — простой JS-фолбэк (только для локального демо).
 * Уровень «дружеского соревнования», не криптостойкий (осознанно, раздел 12).
 * ============================================================= */
(function () {
  const subtle = (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null;

  function randomSalt() {
    const a = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(a) : a.forEach((_, i) => (a[i] = Math.random() * 256));
    return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function hash(password, salt) {
    const data = salt + "|" + password;
    if (subtle) {
      const buf = await subtle.digest("SHA-256", new TextEncoder().encode(data));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    // Фолбэк (не криптостойкий) — на случай file:// без SubtleCrypto
    let h = 5381;
    for (let i = 0; i < data.length; i++) h = ((h << 5) + h + data.charCodeAt(i)) >>> 0;
    return "fallback" + h.toString(16);
  }

  window.Auth = {
    // Возвращает {salt, passwordHash} для сохранения при регистрации
    async makeCredential(password) {
      const salt = randomSalt();
      return { salt, passwordHash: await hash(password, salt) };
    },
    // Проверка пароля участника
    async verify(user, password) {
      if (!user || !user.salt) return false;
      const h = await hash(password, user.salt);
      return h === user.passwordHash;
    }
  };
})();
