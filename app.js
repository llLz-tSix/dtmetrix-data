/* Dota Metrix: интерфейс сайта. Расчёт в engine.js, данные в data.json. */
(function () {
  "use strict";
  var CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/";
  var heroImg = function (slug) { return CDN + "heroes/" + slug + ".png"; };
  var itemImg = function (slug) { return CDN + "items/" + slug + ".png"; };
  var ROLE_LABEL = { carry: "Керри", mid: "Мид", offlaner: "Оффлейн", support4: "Сап 4", support5: "Сап 5" };
  var VERDICT = { strong: "Сильный матчап", ok: "Нейтрально", weak: "Слабый матчап" };
  var $ = function (id) { return document.getElementById(id); };
  var hide = "this.style.visibility='hidden'";
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  var D = null, enemies = [], role = "carry", rank = "legend", selected = 0, rows = [], cur = 0;
  var RANK_LABEL = { all: "Все ранги", legend: "Legend и выше", divine: "Divine и выше" };
  var RANK_NOTE = { all: "все ранги", legend: "рейтинги Legend-Ancient и Divine-Immortal", divine: "рейтинг Divine-Immortal" };

  /* ---------- состояние в адресе (#r=carry&e=2,5,14), чтобы драфтом можно было делиться ---------- */
  function readHash() {
    var p = new URLSearchParams(location.hash.replace(/^#/, ""));
    var r = p.get("r");
    if (r && D.roles.indexOf(r) >= 0) role = r;
    var k = p.get("k");
    rank = k && ranks().indexOf(k) >= 0 ? k : D.default_set;
    enemies = (p.get("e") || "").split(",").map(Number).filter(function (id) { return D.byId[id]; })
      .filter(function (id, i, a) { return a.indexOf(id) === i; }).slice(0, 5);
  }
  function writeHash() {
    var h = "r=" + role + (rank !== D.default_set ? "&k=" + rank : "") + (enemies.length ? "&e=" + enemies.join(",") : "");
    try { history.replaceState(null, "", "#" + h); } catch (e) { /* file:// и т.п. */ }
  }

  /* ---------- слоты врагов и поиск ---------- */
  function renderSlots() {
    $("en").innerHTML = [0, 1, 2, 3, 4].map(function (i) {
      var h = enemies[i] && D.byId[enemies[i]];
      return h
        ? '<button type="button" class="slot" data-i="' + i + '" title="Убрать героя" aria-label="Убрать ' + esc(h.name) + '"><span class="x">×</span><img src="' + heroImg(h.slug) + '" alt="" onerror="' + hide + '"><b>' + esc(h.name) + '</b><i>' + h.pub.toFixed(1) + '% винрейт</i></button>'
        : '<button type="button" class="slot empty" data-i="' + i + '" aria-label="Выбрать героя"><div class="plus">+</div><i>Выбрать героя</i></button>';
    }).join("");
    $("cnt").textContent = enemies.length + " из 5";
    Array.prototype.forEach.call(document.querySelectorAll(".slot"), function (s) {
      s.onclick = function () {
        var i = +s.dataset.i;
        if (enemies[i] !== undefined) { enemies.splice(i, 1); update(); listHeroes(); } else $("q").focus();
      };
    });
  }
  function ranks() {
    var list = [D.default_set].concat(Object.keys(D.rank_sets || {}));
    return ["all", "legend", "divine"].filter(function (k) { return list.indexOf(k) >= 0; });
  }
  function renderRank() {
    $("rank").innerHTML = ranks().map(function (k) {
      return '<button type="button" data-k="' + k + '" class="' + (k === rank ? "on" : "") + '" aria-pressed="' + (k === rank) + '">' + RANK_LABEL[k] + "</button>";
    }).join("");
    Array.prototype.forEach.call($("rank").querySelectorAll("button"), function (b) {
      b.onclick = function () { rank = b.dataset.k; selected = 0; update(); };
    });
  }
  function renderRole() {
    $("role").innerHTML = D.roles.map(function (r) {
      return '<button type="button" data-r="' + r + '" class="' + (r === role ? "on" : "") + '" aria-pressed="' + (r === role) + '">' + ROLE_LABEL[r] + "</button>";
    }).join("");
    Array.prototype.forEach.call($("role").querySelectorAll("button"), function (b) {
      b.onclick = function () { role = b.dataset.r; selected = 0; update(); };
    });
  }
  function listHeroes() {
    var q = $("q").value.trim().toLowerCase();
    var r = D.list.filter(function (h) {
      return enemies.indexOf(h.id) < 0 && (h.name.toLowerCase().indexOf(q) >= 0 || h.slug.indexOf(q) >= 0);
    }).sort(function (a, b) { return a.name.localeCompare(b.name); }).slice(0, 30);
    cur = 0;
    $("dd").innerHTML = r.map(function (h, i) {
      return '<div class="' + (i === 0 ? "on" : "") + '" data-id="' + h.id + '"><img src="' + heroImg(h.slug) + '" alt="" onerror="' + hide + '">' + esc(h.name) + "<small>" + h.pub.toFixed(1) + "%</small></div>";
    }).join("") || "<div>Ничего не найдено</div>";
    $("dd").style.display = document.activeElement === $("q") && r.length && enemies.length < 5 ? "block" : "none";
    Array.prototype.forEach.call($("dd").querySelectorAll("div[data-id]"), function (d) {
      d.onmousedown = function (e) { e.preventDefault(); add(+d.dataset.id); };
    });
  }
  function add(id) {
    if (enemies.length >= 5 || enemies.indexOf(id) >= 0 || !D.byId[id]) return;
    enemies.push(id); selected = 0; $("q").value = "";
    update(); listHeroes();
    if (enemies.length >= 5) $("q").blur();
  }

  /* ---------- результаты ---------- */
  function why(r) {
    var parts = [];
    var good = r.pairs.filter(function (p) { return p.games >= D.min_pair; });
    if (!good.length) {
      parts.push("Данных по этим парам мало: оценка близка к базовому винрейту героя (" + r.baseline.toFixed(1) + "%).");
    } else {
      var best = good.slice().sort(function (a, b) { return b.rate - a.rate; })[0];
      var worst = good.slice().sort(function (a, b) { return a.rate - b.rate; })[0];
      if (best.rate * 100 >= 52) parts.push("Сильнее всего против " + D.byId[best.id].name + " (" + (best.rate * 100).toFixed(0) + "%).");
      if (worst.rate * 100 <= 48 && worst.id !== best.id) parts.push("Слабее против " + D.byId[worst.id].name + " (" + (worst.rate * 100).toFixed(0) + "%).");
      if (parts.length === 0) parts.push("Против этого состава ничем не выделяется, ориентир: базовый винрейт " + r.baseline.toFixed(1) + "%.");
    }
    if (r.rarity_penalty >= 0.3) parts.push("Герой редкий, его винрейт завышают мейнеры: поправка −" + r.rarity_penalty.toFixed(1) + " п.п.");
    if (r.low_evidence && good.length) parts.push("Выборка небольшая.");
    return parts.join(" ");
  }
  function renderPicks() {
    var el = $("pk");
    if (!enemies.length) {
      rows = [];
      el.innerHTML = '<div class="empty-state">Добавьте вражеских героев (до пяти) и выберите свою роль. Подсказки появятся здесь.</div>';
      $("ptitle").textContent = "Лучшие пики";
      return;
    }
    rows = DMEngine.analyze(D, enemies, role, 8, rank);
    $("ptitle").textContent = "Лучшие пики · " + ROLE_LABEL[role];
    if (selected >= rows.length) selected = 0;
    el.innerHTML = rows.map(function (r, i) {
      var v = DMEngine.verdict(r.score);
      var l = Math.max(0, Math.min(100, (r.ci_low - 40) / 25 * 100));
      var w = Math.max(2, Math.min(100 - l, (r.ci_high - r.ci_low) / 25 * 100));
      var mm = r.pairs.map(function (p) {
        var st = DMEngine.pairStatus(p, D.min_pair), h = D.byId[p.id];
        var tip = h.name + ": " + (p.games >= D.min_pair ? (p.rate * 100).toFixed(0) + "% · " + p.games + " игр" : st.label.toLowerCase());
        return '<span class="' + st.key + '" title="' + esc(tip) + '"><img src="' + heroImg(h.slug) + '" alt="' + esc(tip) + '" onerror="' + hide + '"></span>';
      }).join("");
      return '<div class="card ' + v + (i === selected ? " sel" : "") + '" data-i="' + i + '" tabindex="0"><div class="im"><img src="' + heroImg(r.slug) + '" alt="" onerror="' + hide + '"></div><div class="b">' +
        '<div class="hrow"><span class="nm">' + esc(r.name) + '</span><span class="pc">' + r.score.toFixed(1) + "%</span></div>" +
        '<span class="chip">' + VERDICT[v] + '</span><span class="hint">оценка матчапа</span>' +
        '<div class="ci"><i style="left:' + l + "%;width:" + w + '%"></i><u></u></div>' +
        '<div class="mm">' + mm + "</div>" +
        "<p>" + esc(why(r)) + "</p><small>Коридор " + r.ci_low.toFixed(0) + "–" + r.ci_high.toFixed(0) + "% · " + r.eff_games.toLocaleString("ru") + ' игр в парах с этими врагами</small></div></div>';
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll(".card"), function (c) {
      var pick = function () { selected = +c.dataset.i; renderPicks(); renderBuild(); renderCounters(); };
      c.onclick = pick;
      c.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } };
    });
  }
  function itemsRow(list) {
    return '<div class="items">' + list.map(function (it) {
      return '<div title="' + esc(it[1]) + '"><img src="' + itemImg(it[2]) + '" alt="" onerror="' + hide + '">' + esc(it[0]) + "</div>";
    }).join("") + "</div>";
  }
  function renderBuild() {
    var r = rows[selected];
    if (!r) { $("bt").textContent = "Билд"; $("bd").innerHTML = '<div class="hint">Выберите врагов, и здесь появится билд лучшего пика.</div>'; return; }
    var per = D.builds[String(r.id)] || {};
    var b = per[role] || per[Object.keys(per)[0]];
    $("bt").textContent = "Билд · " + r.name;
    if (!b) { $("bd").innerHTML = '<div class="hint">Для этого героя билда пока нет.</div>'; return; }
    var stages = [["Старт", b.start], ["До 15 минут", b.early], ["До 30 минут", b.core], ["Поздняя игра", b.late]];
    var note = b.src === "stratz"
      ? "По матчам Legend+ на этой позиции" + (b.games ? " (" + b.games.toLocaleString("ru") + " матчей)" : "") + ". Наведите на предмет, чтобы увидеть детали."
      : "Типовой набор для роли: данных по этому герою пока мало.";
    $("bd").innerHTML = '<div class="hint" style="margin:0 0 10px">' + note + "</div>" +
      stages.filter(function (s) { return s[1] && s[1].length; }).map(function (s) {
        return '<div class="ph"><h4>' + s[0] + "</h4>" + itemsRow(s[1]) + "</div>";
      }).join("");
  }
  function renderCounters() {
    var el = $("cn"), pick = rows[selected];
    if (!enemies.length || !pick) { $("ct").textContent = "Контрпредметы"; el.innerHTML = '<div class="hint">Появятся после выбора врагов.</div>'; return; }
    $("ct").textContent = "Контрпредметы · " + pick.name;
    var list = DMEngine.counters(D, pick.id, role, enemies, 6);
    var mine = {};
    var per = (D.hero_items || {})[String(pick.id)] || {};
    (per[role] || per[Object.keys(per)[0]] || []).forEach(function (s) { mine[s] = true; });
    el.innerHTML = list.map(function (c) {
      var who = c.targets.map(function (id) { return '<img class="h" src="' + heroImg(D.byId[id].slug) + '" alt="" onerror="' + hide + '"> ' + esc(D.byId[id].name); }).join(", ");
      var own = c.rare ? ' <span class="hint">· этот герой берёт редко</span>' : mine[c.slug] ? ' <span class="hint">· есть в билде</span>' : "";
      return '<div class="cn"><img class="i" src="' + itemImg(c.slug) + '" alt="" onerror="' + hide + '"><div><b>' + esc(c.item) + "</b>" + own + "<br><small>против " + who + ": " + esc(c.reason) + "</small></div></div>";
    }).join("") || '<div class="hint">Для этого героя против этих врагов особых контрпредметов нет.</div>';
  }
  function renderFoot() {
    var made = D.generated ? new Date(D.generated) : null, old = made && (Date.now() - made.getTime()) > 72 * 3600 * 1000;
    var w = D.window;
    var scope = w
      ? "Матчапы: STRATZ, " + RANK_NOTE[rank] + ", " + new Date(w.from).toLocaleDateString("ru") + " – " + new Date(w.to).toLocaleDateString("ru") + " (около двух месяцев). "
      : "Матчапы: STRATZ. ";
    $("foot").innerHTML = "Это подсказка по матчапам против выбранных героев, а не прогноз исхода матча. " + scope +
      "Число игр это сумма по парам «ваш герой против каждого из врагов», один матч может учитываться несколько раз. " +
      "Билды: STRATZ, Legend и выше, последняя неделя данных. Позиции героев: OpenDota" +
      (made ? ". Снимок от " + made.toLocaleDateString("ru") + (old ? ' <span class="warn">(данные устарели)</span>' : "") : "") +
      ". Dota 2 является товарным знаком Valve Corporation; проект не связан с Valve.";
  }
  function update() { renderSlots(); renderRole(); renderRank(); renderPicks(); renderBuild(); renderCounters(); renderFoot(); writeHash(); }

  /* ---------- фон: приглушённые фиолетовые цифры ---------- */
  function rain() {
    var cv = $("rain"), cx = cv.getContext("2d"), F = 16, cols, drops, w, h;
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    function size() {
      var d = window.devicePixelRatio || 1; w = innerWidth; h = innerHeight;
      cv.width = w * d; cv.height = h * d; cx.setTransform(d, 0, 0, d, 0, 0);
      cols = Math.ceil(w / F); drops = []; for (var i = 0; i < cols; i++) drops.push(Math.random() * h / F);
      cx.fillStyle = "#06040d"; cx.fillRect(0, 0, w, h);
    }
    function tick() {
      cx.fillStyle = "rgba(6,4,13,.16)"; cx.fillRect(0, 0, w, h); cx.font = F + "px ui-monospace,Consolas,monospace";
      for (var i = 0; i < cols; i += 3) {
        var y = drops[i] * F;
        cx.fillStyle = "#a78bfa"; cx.fillText(Math.floor(Math.random() * 10), i * F, y);
        cx.fillStyle = "rgba(139,92,246,.5)"; cx.fillText(Math.floor(Math.random() * 10), i * F, y - F);
        if (y > h && Math.random() > .975) drops[i] = 0;
        drops[i] += .3 + (i % 5) * .06;
      }
    }
    size(); addEventListener("resize", size);
    if (still) { tick(); return; }
    var last = 0;
    (function loop(t) { if (!document.hidden && t - last > 70) { tick(); last = t; } requestAnimationFrame(loop); })(0);
  }

  function boot() {
    DMEngine.prep(D); readHash();
    $("q").addEventListener("input", listHeroes);
    $("q").addEventListener("focus", listHeroes);
    $("q").addEventListener("blur", function () { setTimeout(function () { $("dd").style.display = "none"; }, 120); });
    $("q").addEventListener("keydown", function (e) {
      var items = Array.prototype.slice.call($("dd").querySelectorAll("div[data-id]"));
      if (!items.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); cur = (cur + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach(function (x, i) { x.classList.toggle("on", i === cur); }); items[cur].scrollIntoView({ block: "nearest" });
      }
      if (e.key === "Enter") { e.preventDefault(); add(+items[cur].dataset.id); }
    });
    $("reset").onclick = function () { enemies = []; selected = 0; update(); };
    $("share").onclick = function () {
      var btn = $("share"), url = location.href;
      function done(t) { btn.textContent = t; setTimeout(function () { btn.textContent = "Ссылка"; }, 1600); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { done("Скопировано"); }, function () { done("Не вышло"); });
      else done("Скопируйте из адресной строки");
    };
    addEventListener("hashchange", function () { readHash(); selected = 0; update(); });
    update();
  }

  rain();
  fetch("data.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { D = d; boot(); })
    .catch(function () { $("foot").innerHTML = '<span class="warn">Не удалось загрузить данные. Обновите страницу позже.</span>'; });
})();
