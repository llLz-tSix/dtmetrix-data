/* Dota Metrix: интерфейс сайта. Расчёт в engine.js, данные в data.json. */
(function () {
  "use strict";
  var CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/";
  var heroImg = function (slug) { return CDN + "heroes/" + slug + ".png"; };
  var itemImg = function (slug) { return CDN + "items/" + slug + ".png"; };
  var ROLE_LABEL = { carry: "Керри", mid: "Мид", offlaner: "Оффлейн", support4: "Сап 4", support5: "Сап 5" };
  var VERDICT = { strong: "Сильный пик", ok: "Нейтрально", weak: "Слабый пик" };
  var $ = function (id) { return document.getElementById(id); };
  var hide = "this.style.visibility='hidden'";
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  var ddOpen = false, moreOpen = false, D = null, enemies = [], allies = [], target = "e", role = "carry", rank = "legend", selected = 0, rows = [], cur = 0;
  var RANK_LABEL = { all: "Все", legend: "Legend+", divine: "Divine+" };
  var RANK_NOTE = { all: "все ранги", legend: "рейтинги Legend-Ancient и Divine-Immortal", divine: "рейтинг Divine-Immortal" };

  /* ---------- состояние в адресе (#r=carry&e=2,5,14), чтобы драфтом можно было делиться ---------- */
  function readHash() {
    var p = new URLSearchParams(location.hash.replace(/^#/, ""));
    var r = p.get("r");
    if (r && D.roles.indexOf(r) >= 0) role = r;
    var k = p.get("k");
    rank = k && ranks().indexOf(k) >= 0 ? k : D.default_set;
    var ids = function (key, n) {
      return (p.get(key) || "").split(",").map(Number).filter(function (id) { return D.byId[id]; })
        .filter(function (id, i, a) { return a.indexOf(id) === i; }).slice(0, n);
    };
    enemies = ids("e", 5);
    allies = ids("a", 4).filter(function (id) { return enemies.indexOf(id) < 0; });
  }
  function writeHash() {
    var h = "r=" + role + (rank !== D.default_set ? "&k=" + rank : "") + (enemies.length ? "&e=" + enemies.join(",") : "") +
      (allies.length ? "&a=" + allies.join(",") : "");
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
    $("al").innerHTML = "<span>Ваша команда (если уже выбрали):</span>" + allies.map(function (id, i) {
      var h = D.byId[id];
      return '<button type="button" class="ally" data-a="' + i + '" title="Убрать союзника"><img src="' + heroImg(h.slug) + '" alt="" onerror="' + hide + '">' + esc(h.name) + " ×</button>";
    }).join("") + (allies.length < 4 ? '<button type="button" class="ally empty" data-a="+">+ союзник</button>' : "");
    Array.prototype.forEach.call($("al").querySelectorAll(".ally"), function (b) {
      b.onclick = function () {
        if (b.dataset.a === "+") { setTarget("a"); openList(); return; }
        if (!once()) return;
        allies.splice(+b.dataset.a, 1); selected = 0; update(); listHeroes();
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll(".slot"), function (s) {
      s.onclick = function () {
        var i = +s.dataset.i;
        if (enemies[i] !== undefined) { if (!once()) return; enemies.splice(i, 1); update(); listHeroes(); } else { setTarget("e"); openList(); }
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
  function setTarget(t) {
    target = t;
    Array.prototype.forEach.call($("tgt").querySelectorAll("button"), function (b) { b.classList.toggle("on", b.dataset.t === t); });
    $("q").placeholder = t === "e" ? "Найти вражеского героя: начните вводить имя…" : "Найти героя своей команды…";
  }
  function full() { return target === "e" ? enemies.length >= 5 : allies.length >= 4; }
  function listHeroes() {
    var q = $("q").value.trim().toLowerCase();
    var r = D.list.filter(function (h) {
      return enemies.indexOf(h.id) < 0 && allies.indexOf(h.id) < 0 && (h.name.toLowerCase().indexOf(q) >= 0 || h.slug.indexOf(q) >= 0);
    }).sort(function (a, b) { return a.name.localeCompare(b.name); }).slice(0, 30);
    cur = 0;
    $("dd").innerHTML = r.map(function (h, i) {
      return '<div class="' + (i === 0 ? "on" : "") + '" data-id="' + h.id + '"><img src="' + heroImg(h.slug) + '" alt="" onerror="' + hide + '">' + esc(h.name) + "<small>" + h.pub.toFixed(1) + "%</small></div>";
    }).join("") || "<div>Ничего не найдено</div>";
    $("dd").style.display = ddOpen && r.length && !full() ? "block" : "none";
    Array.prototype.forEach.call($("dd").querySelectorAll("div[data-id]"), function (d) {
      d.onmousedown = function (e) { e.preventDefault(); };
      d.onclick = function () { add(+d.dataset.id); };
    });
  }
  var lastTap = 0;
  function once() { var t = Date.now(); if (t - lastTap < 400) return false; lastTap = t; return true; }
  function openList() { ddOpen = true; if (document.activeElement !== $("q")) $("q").focus(); listHeroes(); }
  function add(id) {
    if (!once()) return;
    if (full() || enemies.indexOf(id) >= 0 || allies.indexOf(id) >= 0 || !D.byId[id]) return;
    (target === "e" ? enemies : allies).push(id); selected = 0; $("q").value = "";
    update(); listHeroes();
    if (full()) { ddOpen = false; $("q").blur(); listHeroes(); }
  }

  /* ---------- результаты ---------- */
  function pp(adv) { var v = DMEngine.advPP(adv); return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1).replace(".", ",") + " п.п."; }
  function why(r) {
    var parts = [];
    var good = r.pairs.filter(function (p) { return p.games >= D.min_pair; });
    if (!good.length) {
      parts.push("Данных по этим парам мало: оценка близка к общему винрейту героя (" + r.baseline.toFixed(1) + "%).");
    } else {
      var best = good.slice().sort(function (a, b) { return b.adv - a.adv; })[0];
      var worst = good.slice().sort(function (a, b) { return a.adv - b.adv; })[0];
      if (DMEngine.advPP(best.adv) >= 1) parts.push("Лучше всего против " + D.byId[best.id].name + " (" + pp(best.adv) + ").");
      if (DMEngine.advPP(worst.adv) <= -1 && worst.id !== best.id) parts.push("Хуже против " + D.byId[worst.id].name + " (" + pp(worst.adv) + ").");
      if (parts.length === 0) parts.push("Против этого состава без заметных плюсов и минусов: решает общий винрейт героя " + r.baseline.toFixed(1) + "%.");
    }
    var syn = (r.synergy || []).filter(function (s) { return Math.abs(DMEngine.advPP(s.syn)) >= 1; })
      .sort(function (a, b) { return Math.abs(b.syn) - Math.abs(a.syn); })[0];
    if (syn) parts.push((syn.syn > 0 ? "Хорошо сочетается с " : "Плохо сочетается с ") + D.byId[syn.id].name + " (" + pp(syn.syn) + ").");
    if (r.rarity_penalty >= 0.3) parts.push("Герой редкий, его винрейт завышают мейнеры: поправка −" + r.rarity_penalty.toFixed(1) + " п.п.");
    if (r.low_evidence && good.length) parts.push("Выборка небольшая.");
    return parts.join(" ");
  }
  function short(r) {
    var good = r.pairs.filter(function (p) { return p.games >= D.min_pair; });
    if (!good.length) return "Мало данных по этим парам";
    var best = good.slice().sort(function (a, b) { return b.adv - a.adv; })[0];
    var worst = good.slice().sort(function (a, b) { return a.adv - b.adv; })[0];
    var plus = DMEngine.advPP(best.adv) >= 1, minus = DMEngine.advPP(worst.adv) <= -1 && worst.id !== best.id;
    if (plus && minus) return "Лучше против " + D.byId[best.id].name + ", хуже против " + D.byId[worst.id].name;
    if (plus) return "Лучше всего против " + D.byId[best.id].name + " (" + pp(best.adv) + ")";
    if (minus) return "Хуже против " + D.byId[worst.id].name + " (" + pp(worst.adv) + ")";
    return "Без заметных плюсов и минусов";
  }
  function renderPicks() {
    var el = $("pk");
    if (!enemies.length) {
      rows = [];
      el.innerHTML = '<div class="empty-state">Добавьте вражеских героев (до пяти) и выберите свою роль. Подсказки появятся здесь.</div>';
      $("ptitle").textContent = "Лучшие пики";
      return;
    }
    rows = DMEngine.analyze(D, enemies, role, 8, rank, allies);
    $("ptitle").textContent = "Лучшие пики · " + ROLE_LABEL[role];
    if (selected >= rows.length) selected = 0;
    el.innerHTML = rows.slice(0, 6).map(function (r, i) {
      var v = DMEngine.verdict(r.score), sel = i === selected;
      var mm = r.pairs.map(function (p) {
        var st = DMEngine.pairStatus(p, D.min_pair), h = D.byId[p.id];
        var tip = h.name + ": " + (p.games >= D.min_pair ? st.label.toLowerCase() + " (" + pp(p.adv) + ")" : st.label.toLowerCase());
        return '<span class="' + st.key + '" title="' + esc(tip) + '"><img src="' + heroImg(h.slug) + '" alt="" onerror="' + hide + '"></span>';
      }).join("");
      var more = "";
      if (sel) {
        var l = Math.max(0, Math.min(100, (r.ci_low - 40) / 25 * 100));
        var w = Math.max(2, Math.min(100 - l, (r.ci_high - r.ci_low) / 25 * 100));
        more = '<details class="more"' + (moreOpen ? " open" : "") + '><summary>Подробнее</summary><div class="ci"><i style="left:' + l + "%;width:" + w + '%"></i><u></u></div><p>' + esc(why(r)) +
          "</p><small>Коридор " + r.ci_low.toFixed(0) + "–" + r.ci_high.toFixed(0) + "% · " + r.eff_games.toLocaleString("ru") + " игр в парах с этими врагами</small></details>";
      }
      return '<div class="card pc2 ' + v + (sel ? " sel" : "") + '" data-i="' + i + '" tabindex="0"><img class="pt" src="' + heroImg(r.slug) + '" alt="" onerror="' + hide + '">' +
        '<div class="t"><b>' + esc(r.name) + '</b><span class="rs">' + esc(short(r)) + '</span><div class="mm">' + mm + "</div></div>" +
        '<div class="vv"><span class="pc">' + r.score.toFixed(1).replace(".", ",") + '%</span><span class="chip">' + VERDICT[v] + "</span></div>" + more + "</div>";
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll(".card"), function (c) {
      var pick = function () { if (selected !== +c.dataset.i) moreOpen = false; selected = +c.dataset.i; renderPicks(); renderBuild(); renderCounters(); };
      c.onclick = function (e) { if (e.target.closest("details")) return; pick(); };
      var det = c.querySelector("details");
      if (det) det.addEventListener("toggle", function () { moreOpen = det.open; });
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
    if (!r) { $("btw").textContent = ""; $("bd").innerHTML = '<div class="hint">Выберите врагов, и здесь появится билд лучшего пика.</div>'; return; }
    var per = D.builds[String(r.id)] || {};
    var b = per[role] || per[Object.keys(per)[0]];
    $("bt").textContent = "Билд"; $("btw").textContent = r.name;
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
    if (!enemies.length || !pick) { $("ctw").textContent = ""; el.innerHTML = '<div class="hint">Появятся после выбора врагов.</div>'; return; }
    $("ctw").textContent = "за " + pick.name;
    var list = DMEngine.counters(D, pick.id, role, enemies, 6);
    var mine = {};
    var per = (D.hero_items || {})[String(pick.id)] || {};
    (per[role] || per[Object.keys(per)[0]] || []).forEach(function (s) { mine[s] = true; });
    el.innerHTML = list.map(function (c) {
      var who = c.targets.map(function (id) { return '<img src="' + heroImg(D.byId[id].slug) + '" alt="" title="' + esc(D.byId[id].name) + '" onerror="' + hide + '">'; }).join("");
      var own = c.rare ? " · этот герой берёт редко" : mine[c.slug] ? " · есть в билде" : "";
      return '<div class="cn2"><img class="i" src="' + itemImg(c.slug) + '" alt="" onerror="' + hide + '"><div class="t"><b>' + esc(c.item) + "</b><small>" + esc(c.reason) + esc(own) + '</small></div><div class="w">' + who + "</div></div>";
    }).join("") || '<div class="hint">Для этого героя против этих врагов особых контрпредметов нет.</div>';
  }
  function renderFoot() {
    var made = D.generated ? new Date(D.generated) : null, old = made && (Date.now() - made.getTime()) > 72 * 3600 * 1000;
    var w = D.window;
    var scope = w
      ? "Матчапы: STRATZ, " + RANK_NOTE[rank] + ", " + new Date(w.from).toLocaleDateString("ru") + " – " + new Date(w.to).toLocaleDateString("ru") + " (около двух месяцев). "
      : "Матчапы: STRATZ. ";
    $("foot").innerHTML = "Это подсказка по драфту, а не прогноз исхода матча: процент - оценка шанса на победу с этим героем при прочих равных " +
      "(общая сила героя, преимущества против выбранных врагов и сочетание с союзниками; модель проверена на 25 тыс. матчей Legend+). " + scope +
      "Число игр это сумма по парам «ваш герой против каждого из врагов», один матч может учитываться несколько раз. " +
      "Билды: STRATZ, Legend и выше, последняя неделя данных. Позиции героев: OpenDota" +
      (made ? ". Снимок от " + made.toLocaleDateString("ru") + (old ? ' <span class="warn">(данные устарели)</span>' : "") : "") +
      ". Dota 2 является товарным знаком Valve Corporation; проект не связан с Valve.";
  }
  function update() { renderSlots(); renderRole(); renderRank(); renderPicks(); renderBuild(); renderCounters(); renderFoot(); writeHash(); }

  function boot() {
    DMEngine.prep(D); readHash();
    $("q").addEventListener("input", openList);
    $("q").addEventListener("focus", openList);
    document.addEventListener("pointerdown", function (e) {
      if (ddOpen && !e.target.closest(".srch, .slot, .ally, #tgt")) { ddOpen = false; listHeroes(); }
    });
    $("q").addEventListener("keydown", function (e) { if (e.key === "Escape") { ddOpen = false; listHeroes(); } });
    $("q").addEventListener("keydown", function (e) {
      var items = Array.prototype.slice.call($("dd").querySelectorAll("div[data-id]"));
      if (!items.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); cur = (cur + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach(function (x, i) { x.classList.toggle("on", i === cur); }); items[cur].scrollIntoView({ block: "nearest" });
      }
      if (e.key === "Enter") { e.preventDefault(); add(+items[cur].dataset.id); }
    });
    $("reset").onclick = function () { enemies = []; allies = []; selected = 0; setTarget("e"); update(); };
    Array.prototype.forEach.call($("tgt").querySelectorAll("button"), function (b) {
      b.onclick = function () { setTarget(b.dataset.t); openList(); };
    });
    $("share").onclick = function () {
      var btn = $("share"), url = location.href;
      function done(t) { btn.textContent = t; setTimeout(function () { btn.textContent = "Ссылка"; }, 1600); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { done("Скопировано"); }, function () { done("Не вышло"); });
      else done("Скопируйте из адресной строки");
    };
    addEventListener("hashchange", function () { readHash(); selected = 0; update(); });
    update();
    if (window.DMQuiz) DMQuiz.start(D);
  }

  fetch("data.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { D = d; boot(); })
    .catch(function () { $("foot").innerHTML = '<span class="warn">Не удалось загрузить данные. Обновите страницу позже.</span>'; });
})();
