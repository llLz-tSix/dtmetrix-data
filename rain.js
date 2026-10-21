/* Фон сайта: «дождь» из настоящих данных - сокращённые имена героев, их винрейт и число матчей.
   Источник: главная передаёт загруженные данные (DMRain.data(D) или window.__dmD), остальные страницы берут
   маленький rain.json рядом с этим скриптом. DMRain.focus([id]) или <canvas data-focus="id"> - подсветить героев.
   На телефонах выключен: мешает читать текст. */
(function () {
  var cv = document.getElementById("rain");
  if (!cv || (window.matchMedia && matchMedia("(max-width: 700px)").matches)) return;
  var base = ((document.currentScript && document.currentScript.src) || "").replace(/[^/]*$/, "");
  var cx = cv.getContext("2d"), F = 13, COL = 118, w, h, cols = [], tokens = [], hot = {};
  var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  (cv.getAttribute("data-focus") || "").split(",").forEach(function (id) { if (id) hot[+id] = true; });

  function short(name) {
    var parts = name.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1].slice(0, 2) : parts[0].slice(0, 3)).toUpperCase();
  }
  function digits() { var s = ""; for (var i = 0; i < 5; i++) s += Math.floor(Math.random() * 10); return s; }
  function token() {
    if (!tokens.length) return { text: digits(), id: 0 };
    var t = tokens[Math.floor(Math.random() * tokens.length)], ids = Object.keys(hot);
    if (ids.length && Math.random() < 0.35) {                       // выбранные герои мелькают чаще
      t = tokens.filter(function (x) { return x.id === +ids[Math.floor(Math.random() * ids.length)]; })[0] || t;
    }
    var kind = Math.random();
    return { id: t.id, text: kind < 0.6 ? t.tag + " " + t.wr : kind < 0.85 ? t.tag + " " + t.games : t.wr + "%" };
  }
  function size() {
    var d = window.devicePixelRatio || 1; w = innerWidth; h = innerHeight;
    cv.width = w * d; cv.height = h * d; cx.setTransform(d, 0, 0, d, 0, 0);
    cols = [];
    for (var x = 8; x < w; x += COL) cols.push({ x: x, y: Math.random() * h, v: 0.6 + Math.random() * 0.9, t: token() });
    cx.fillStyle = "#06040d"; cx.fillRect(0, 0, w, h);
  }
  function tick() {
    cx.fillStyle = "rgba(6,4,13,.12)"; cx.fillRect(0, 0, w, h);
    cx.font = F + "px 'JetBrains Mono', ui-monospace, Consolas, monospace";
    cols.forEach(function (c) {
      cx.fillStyle = c.t.id && hot[c.t.id] ? "#4ade80" : "#a78bfa";
      cx.fillText(c.t.text, c.x, c.y);
      c.y += F * c.v * 0.5;
      if (c.y - F > h) { c.y = -Math.random() * h * 0.3; c.t = token(); c.v = 0.6 + Math.random() * 0.9; }
      else if (Math.random() < 0.02) c.t = token();                 // строка меняется на лету: «идёт подсчёт»
    });
  }
  function use(list) {                                             // [[id, имя, винрейт, матчей], ...]
    tokens = list.map(function (r) {
      return { id: r[0], tag: short(r[1]), wr: (+r[2] || 50).toFixed(1), games: Math.round(r[3] / 1000) + "k" };
    });
  }
  window.DMRain = {
    data: function (D) { use((D.heroes || []).map(function (r) { return [r[0], r[1], r[6], r[5]]; })); },
    focus: function (ids) { hot = {}; (ids || []).forEach(function (id) { hot[id] = true; }); }
  };
  if (window.__dmD) window.DMRain.data(window.__dmD);
  setTimeout(function () {                                         // страница без своих данных: короткий список героев
    if (tokens.length || !base || !window.fetch) return;
    fetch(base + "rain.json").then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      if (!tokens.length && list.length) use(list);
    }).catch(function () {});
  }, 1200);
  size(); addEventListener("resize", size);
  if (still) { tick(); return; }
  var last = 0;
  (function loop(t) { if (!document.hidden && t - last > 60) { tick(); last = t; } requestAnimationFrame(loop); })(0);
})();
