/* Dota Metrix: мини-игры на главной. Викторины на 5 вариантов по тем же данным, что и подбор пика (data.json).
   Игры: контрпик, связка, герой по билду, герой по способности, мета патча. Серия и рекорд — в localStorage. */
(function (root) {
  "use strict";
  var CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/";
  var ITEM_FIX = { iron_branch_x2: "branches", gauntlets_of_strength_x2: "gauntlets", sentry_ward: "ward_sentry" };
  var ROLE = { carry: "керри", mid: "мид", offlaner: "оффлейн", support4: "саппорт 4", support5: "саппорт 5" };
  var EPS = 1e-4, MIN_GAMES = 1000;
  var D, mode = "mix", q = null, streak = 0, best = 0, score = [0, 0];
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var heroImg = function (h) { return CDN + "heroes/" + h.slug + ".png"; };
  var logit = function (p) { p = Math.min(1 - EPS, Math.max(EPS, p)); return Math.log(p / (1 - p)); };
  var sigmoid = function (x) { return 1 / (1 + Math.exp(-x)); };
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var pp = function (x) { return (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(1).replace(".", ",") + "% к шансу"; };
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function sample(a, n, not) {
    return shuffle(a.filter(function (x) { return (not || []).indexOf(x) < 0; })).slice(0, n);
  }

  /* x против y: преимущество к ожиданию по силам героев, п.п. (как на страницах героев) */
  function vs(x, y) {
    var v = (D.pairs[String(y)] || {})[String(x)];
    if (!v || v[0] < MIN_GAMES) return null;
    var exp = sigmoid(logit(D.byId[x].mu) - logit(D.byId[y].mu)), k = D.model.k_vs;
    var p = (v[0] - v[1] + k * exp) / (v[0] + k);
    return (sigmoid(logit(p) - logit(exp)) - 0.5) * 100;
  }
  function together(x, y) {
    var v = ((D.synergy || {})[String(x)] || {})[String(y)];
    if (!v || v[0] < MIN_GAMES) return null;
    var exp = sigmoid(logit(D.byId[x].mu) + logit(D.byId[y].mu)), k = D.model.k_with;
    var p = (v[1] + k * exp) / (v[0] + k);
    return (sigmoid(logit(p) - logit(exp)) - 0.5) * 100;
  }
  function popular() {
    var med = D.median || 0;
    return D.list.filter(function (h) { return h.picks >= med; });
  }
  function heroOpt(h, note) { return { id: h.id, img: heroImg(h), name: h.name, note: note }; }

  /* ---------- игры: каждая возвращает {title, ask, show, options[5], right, after} или null (данных нет) ---------- */
  var GAMES = {
    counter: { label: "Контрпик", make: function () {
      var x = pick(popular()), rows = [];
      D.list.forEach(function (h) { if (h.id !== x.id) { var a = vs(h.id, x.id); if (a !== null) rows.push([h, a]); } });
      if (rows.length < 20) return null;
      rows.sort(function (a, b) { return b[1] - a[1]; });
      var good = pick(rows.slice(0, 5)), bad = sample(rows.filter(function (r) { return r[1] < 0; }), 4);
      if (bad.length < 4) return null;
      var opts = shuffle([good].concat(bad));
      return { title: "Контрпик", ask: "Кто лучше всех играет против " + x.name + "?",
        show: '<img class="qh" src="' + heroImg(x) + '" alt="">',
        options: opts.map(function (r) { return heroOpt(r[0], pp(r[1])); }), right: opts.indexOf(good),
        after: "Цифра — на сколько шанс на победу против " + x.name + " выше или ниже ожидаемого по силе героев." };
    } },
    duo: { label: "Связка", make: function () {
      var x = pick(popular()), rows = [];
      D.list.forEach(function (h) { if (h.id !== x.id) { var a = together(x.id, h.id); if (a !== null) rows.push([h, a]); } });
      if (rows.length < 20) return null;
      rows.sort(function (a, b) { return b[1] - a[1]; });
      var good = pick(rows.slice(0, 5)), bad = sample(rows.filter(function (r) { return r[1] < 0; }), 4);
      if (bad.length < 4) return null;
      var opts = shuffle([good].concat(bad));
      return { title: "Связка", ask: "С кем " + x.name + " сильнее всего в одной команде?",
        show: '<img class="qh" src="' + heroImg(x) + '" alt="">',
        options: opts.map(function (r) { return heroOpt(r[0], pp(r[1])); }), right: opts.indexOf(good),
        after: "Цифра — насколько эта пара выигрывает чаще или реже ожидаемого." };
    } },
    build: { label: "Билд", make: function () {
      var all = [];
      Object.keys(D.builds || {}).forEach(function (id) {
        var per = D.builds[id];
        Object.keys(per).forEach(function (r) { if (per[r].src === "stratz" && D.byId[id]) all.push([+id, r]); });
      });
      if (!all.length) return null;
      var c = pick(all), b = D.builds[c[0]][c[1]];
      var items = [].concat((b.early || []).slice(1), b.core || [], b.late || []).slice(0, 7);
      if (items.length < 4) return null;
      var same = all.filter(function (a) { return a[1] === c[1] && a[0] !== c[0]; }).map(function (a) { return a[0]; });
      var others = sample(same.filter(function (id, i, a) { return a.indexOf(id) === i; }), 4);
      if (others.length < 4) return null;
      var ids = shuffle([c[0]].concat(others));
      return { title: "Билд", ask: "Чей это билд? Позиция: " + ROLE[c[1]] + ".",
        show: '<div class="qi">' + items.map(function (it) {
          return '<img src="' + CDN + "items/" + (ITEM_FIX[it[2]] || it[2]) + '.png" alt="" title="' + esc(it[0]) + '">';
        }).join("") + "</div>",
        options: ids.map(function (id) { return heroOpt(D.byId[id]); }), right: ids.indexOf(c[0]),
        after: "Самые частые покупки на этой позиции в матчах Legend+." };
    } },
    skill: { label: "Способность", make: function () {
      var det = (D.meta || {}).details || {}, all = [];
      Object.keys(det).forEach(function (id) {
        if (!D.byId[id]) return;
        Object.keys(det[id]).forEach(function (r) {
          var d = det[id][r];
          (d.skills || []).forEach(function (s) { if (s.key) all.push([+id, s.key, s.name]); });
          if (d.ult && d.ult.key) all.push([+id, d.ult.key, d.ult.name]);
        });
      });
      if (!all.length) return null;
      var c = pick(all);
      var ids = shuffle([c[0]].concat(sample(D.list.map(function (h) { return h.id; }), 4, [c[0]])));
      return { title: "Способность", ask: "Чья это способность?",
        show: '<img class="qa" src="' + CDN + "abilities/" + c[1] + '.png" alt="">',
        options: ids.map(function (id) { return heroOpt(D.byId[id]); }), right: ids.indexOf(c[0]),
        after: c[2] + " - способность " + D.byId[c[0]].name + "." };
    } },
    meta: { label: "Мета", make: function () {
      var m = D.meta || {}, roles = Object.keys(m.roles || {});
      if (!roles.length) return null;
      var r = pick(roles), rows = (m.roles[r].heroes || []).filter(function (x) { return D.byId[x.id]; }).slice(0, 15);
      if (rows.length < 5) return null;
      var five = sample(rows, 5), top = five.reduce(function (a, b) { return b.wr > a.wr ? b : a; });
      return { title: "Мета", ask: "Кто из них чаще всех выигрывает на позиции " + ROLE[r] + " в патче " + (m.patch || {}).name + "?",
        show: "",
        options: five.map(function (x) { return heroOpt(D.byId[x.id], "винрейт " + x.wr.toFixed(1).replace(".", ",") + "%"); }),
        right: five.indexOf(top), after: "По матчам рейтингового All Pick, Legend и выше, за текущий патч." };
    } }
  };

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  function next() {
    var keys = Object.keys(GAMES), tries = 0;
    q = null;
    while (!q && tries++ < 20) {
      var g = mode === "mix" ? pick(keys) : mode;
      q = GAMES[g].make();
    }
    render();
  }
  function render() {
    $("qmodes").innerHTML = ["mix"].concat(Object.keys(GAMES)).map(function (k) {
      return '<button type="button" data-m="' + k + '"' + (k === mode ? ' class="on"' : "") + ">" +
        (k === "mix" ? "Микс" : GAMES[k].label) + "</button>";
    }).join("");
    $("qscore").innerHTML = "Серия <b>" + streak + "</b> · рекорд <b>" + best + "</b> · верно " + score[0] + " из " + score[1];
    if (!q) { $("qz").innerHTML = '<div class="hint">Для этой игры пока нет данных.</div>'; return; }
    $("qz").innerHTML = '<div class="qt">' + esc(q.title) + "</div><div class=\"qq\">" + esc(q.ask) + "</div>" + q.show +
      '<div class="qo">' + q.options.map(function (o, i) {
        return '<button type="button" data-i="' + i + '"><img src="' + o.img + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
          "<span>" + esc(o.name) + '<small class="qn"></small></span></button>';
      }).join("") + '</div><div id="qafter"></div>';
  }
  function answer(i) {
    if (!q || q.done) return;
    q.done = true;
    var ok = i === q.right;
    score[1]++; if (ok) score[0]++;
    streak = ok ? streak + 1 : 0;
    if (streak > best) { best = streak; store("dm_quiz_best", String(best)); }
    [].forEach.call($("qz").querySelectorAll(".qo button"), function (b, k) {
      b.disabled = true;
      b.className = k === q.right ? "ok" : k === i ? "no" : "";
      if (q.options[k].note) b.querySelector(".qn").textContent = q.options[k].note;
    });
    $("qscore").innerHTML = "Серия <b>" + streak + "</b> · рекорд <b>" + best + "</b> · верно " + score[0] + " из " + score[1];
    $("qafter").innerHTML = '<div class="qr ' + (ok ? "up" : "down") + '">' + (ok ? "Верно!" : "Мимо.") + "</div>" +
      '<div class="hint">' + esc(q.after) + '</div><button type="button" class="qnext" id="qnext">Дальше</button>';
  }

  function start(data) {
    D = data;
    if (!$("quiz")) return;
    best = +(store("dm_quiz_best") || 0) || 0;
    $("quiz").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.m) { mode = b.dataset.m; next(); }
      else if (b.dataset.i !== undefined) answer(+b.dataset.i);
      else if (b.id === "qnext") next();
    });
    next();
  }
  root.DMQuiz = { start: start, games: GAMES };
})(typeof window !== "undefined" ? window : this);
