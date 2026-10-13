/* Dota Metrix: оценка пиков на JS. Точный перенос dtmetrix/scoring.py (candidate_estimate, analyze_pick) и
   dtmetrix/draftmodel.py: в логитах сила героя + преимущества против врагов + синергия с союзниками.
   Данные: site/data.json (его готовит scripts/build_site_data.py). Совпадение с Python проверяет
   tests/test_site_parity.py. */
(function (root) {
  "use strict";

  const RARITY_PP_PER_DECADE = 1.5;
  const RARITY_MAX_PP = 2.5;
  const MIN_COUNTERS = 3;

  function prep(D) {
    if (D._ready) return D;
    D.byId = {};
    D.heroes.forEach(function (h) {
      D.byId[h[0]] = { id: h[0], name: h[1], slug: h[2], mask: h[3], mu: h[4], picks: h[5], pub: h[6], w: h[7] };
    });
    D.list = Object.keys(D.byId).map(function (k) { return D.byId[k]; });
    // параметры модели из data.json (scripts/build_site_data.py); по умолчанию - как в dtmetrix/draftmodel.py
    D.model = D.model || { k_vs: 200, k_with: 200, w_str: 0.886, w_adv: 1.02, w_syn: 0.943 };
    D._ready = true;
    return D;
  }

  var EPS = 1e-4;
  function logit(p) { p = Math.min(1 - EPS, Math.max(EPS, p)); return Math.log(p / (1 - p)); }
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
  function pairVar(games, k, p) { p = Math.min(1 - EPS, Math.max(EPS, p)); return 1 / ((games + k) * p * (1 - p)); }
  var ADV_STRONG = logit(0.54);              // порог «силён/слаб против» по чистому преимуществу пары

  function rarityPenalty(picks, median) {
    if (median <= 0 || picks >= median) return 0;
    if (picks <= 0) return RARITY_MAX_PP;
    return Math.min(RARITY_MAX_PP, RARITY_PP_PER_DECADE * Math.log10(median / picks));
  }

  /* Пара кандидат-враг: преимущество в логитах относительно ожидания по силам героев, со сглаживанием. */
  function pair(D, cand, enemyId, pairs, mu, muOf) {
    var M = D.model, row = pairs[String(enemyId)];
    var v = row && row[String(cand.id)];
    var games = 0, wins = 0;
    if (v && v[0] >= D.min_pair) { games = v[0]; wins = v[0] - v[1]; }   // в снимке v[1] = победы врага
    var expected = sigmoid(logit(mu) - logit(muOf(enemyId)));
    var p = (wins + M.k_vs * expected) / (games + M.k_vs);
    return { games: games, rate: p, adv: logit(p) - logit(expected), v: pairVar(games, M.k_vs, p),
             raw: games ? wins / games : null };
  }

  function candidate(D, cand, enemies, allies, ri, set, mu, muOf) {
    var M = D.model, pairs = [], totalW = 0, gamesTotal = 0, matched = 0;
    enemies.forEach(function (eid) {
      var p = pair(D, cand, eid, set.pairs, mu, muOf);
      p.id = eid;
      p.weight = D.byId[eid].w[ri];
      pairs.push(p);
      totalW += p.weight;
      gamesTotal += p.games;
      if (p.games >= D.min_pair) matched++;
    });
    if (!totalW) totalW = 1;
    var x = M.w_str * logit(mu), varSum = 0;
    pairs.forEach(function (p) {
      var share = p.weight * pairs.length / totalW;
      x += M.w_adv * share * p.adv;
      varSum += Math.pow(M.w_adv * share, 2) * p.v;
    });
    var syn = [];
    allies.forEach(function (aid) {
      if (aid === cand.id) return;
      var row = (set.synergy || {})[String(cand.id)], v = row && row[String(aid)];
      var games = v ? v[0] : 0, wins = v ? v[1] : 0;
      var expected = sigmoid(logit(mu) + logit(muOf(aid)));
      var p = (wins + M.k_with * expected) / (games + M.k_with);
      var s = logit(p) - logit(expected);
      x += M.w_syn * s;
      varSum += M.w_syn * M.w_syn * pairVar(games, M.k_with, p);
      syn.push({ id: aid, games: games, syn: s });
    });
    var sd = Math.sqrt(varSum);
    var pen = rarityPenalty(cand.picks, D.median);
    return {
      id: cand.id, name: cand.name, slug: cand.slug,
      score: sigmoid(x) * 100 - pen, ci_low: sigmoid(x - 1.96 * sd) * 100 - pen, ci_high: sigmoid(x + 1.96 * sd) * 100 - pen,
      rarity_penalty: pen, eff_games: gamesTotal, matched: matched,
      low_evidence: gamesTotal < D.min_total, baseline: mu * 100, pairs: pairs, synergy: syn
    };
  }

  /* Лучшие пики против состава для роли role (carry|mid|offlaner|support4|support5) с учётом союзников. */
  function analyze(D, enemyIds, role, limit, rank, allyIds) {
    prep(D);
    var alt = rank && rank !== D.default_set && D.rank_sets && D.rank_sets[rank] ? D.rank_sets[rank] : null;
    var set = alt || { pairs: D.pairs, synergy: D.synergy };
    var muOf = function (id) {
      if (alt && alt.mu[id] !== undefined) return alt.mu[id];
      return D.byId[id] ? D.byId[id].mu : 0.5;
    };
    limit = limit || 8;
    var ri = D.roles.indexOf(role);
    var enemies = enemyIds.map(Number).filter(function (id) { return D.byId[id]; });
    var allies = (allyIds || []).map(Number).filter(function (id) { return D.byId[id] && enemies.indexOf(id) < 0; });
    if (!enemies.length || ri < 0) return [];
    var rows = [];
    D.list.forEach(function (c) {
      if (enemies.indexOf(c.id) >= 0 || allies.indexOf(c.id) >= 0 || c.mask[ri] !== "1") return;
      rows.push(candidate(D, c, enemies, allies, ri, set, muOf(c.id), muOf));
    });
    rows.sort(function (a, b) {
      return (b.ci_low - a.ci_low) || (b.eff_games - a.eff_games) || (b.score - a.score);
    });
    var strong = rows.filter(function (r) { return !r.low_evidence; });
    var weak = rows.filter(function (r) { return r.low_evidence; });
    if (strong.length < 5) {
      strong = strong.concat(weak.slice(0, 5 - strong.length));
      weak = rows.filter(function (r) { return strong.indexOf(r) < 0; });
    }
    return strong.concat(weak).slice(0, limit);
  }

  /* Слово вместо голого процента (как _pick_verdict в app.py). */
  function verdict(score) {
    if (score >= 54) return "strong";
    if (score <= 46) return "weak";
    return "ok";
  }

  /* Статус пары по чистому преимуществу (без общей силы героя): как enemy_statuses в оверлее. */
  function pairStatus(p, minGames) {
    minGames = minGames || 20;
    if (!p.games) return { key: "none", label: "Нет данных" };
    if (p.games < minGames) return { key: "none", label: "Мало данных" };
    if (p.adv >= ADV_STRONG) return { key: "good", label: "Силён против" };
    if (p.adv <= -ADV_STRONG) return { key: "bad", label: "Слаб против" };
    return { key: "mid", label: "Нейтрально" };
  }

  /* Преимущество в процентных пунктах к шансу (для подписей): +0.16 логита около 50% это ~+4 п.п. */
  function advPP(adv) { return (sigmoid(adv) - 0.5) * 100; }

  /* Контрпредметы под выбранного героя: ответы на врагов из таблиц роли, оставляя только предметы из его
     предметов, которые он реально покупает (билд и редкие ситуативные покупки); точечные пары героев заменяют общий
     совет; блокировки героя исключают предметы. Эталон на Python: build_site_data.site_counters. */
  function counters(D, heroId, role, enemyIds, limit) {
    limit = limit || 6;
    var key = role.indexOf("support") === 0 ? "support" : role;
    var per = (D.hero_items || {})[String(heroId)] || {};
    var mine = per[role] || per[Object.keys(per)[0]] || [];
    var allowed = {};
    mine.forEach(function (s) { allowed[s] = true; });
    var block = {};
    ((D.blocked || {})[String(heroId)] || []).forEach(function (s) { block[s] = true; });
    var over = (D.vs_overrides || {})[String(heroId)] || {};
    var table = (D.counters || {})[key] || {};
    var grouped = {}, order = [], spare = {}, spareOrder = [];
    function add(bucket, ord, r, eid) {
      var g = bucket[r[0]];
      if (!g) { g = bucket[r[0]] = { item: r[0], reason: r[1], timing: r[2], slug: r[3], targets: [], rare: false }; ord.push(r[0]); }
      g.targets.push(Number(eid));
    }
    enemyIds.forEach(function (eid) {
      var rows = over[String(eid)];
      if (rows) { rows.forEach(function (r) { add(grouped, order, r, eid); }); return; }
      (table[String(eid)] || []).forEach(function (r) {
        var parts = r[5] || [r[3]];
        if (parts.some(function (s) { return block[s]; })) return;
        if (r[4] === "specific" || !mine.length || parts.some(function (s) { return allowed[s]; })) add(grouped, order, r, eid);
        else add(spare, spareOrder, r, eid);
      });
    });
    function cmp(a, b) { return (b.targets.length - a.targets.length) || ((a.timing !== "early") - (b.timing !== "early")); }
    var out = order.map(function (k) { return grouped[k]; }).sort(cmp).slice(0, limit);
    if (out.length < MIN_COUNTERS) {
      spareOrder.filter(function (k) { return !grouped[k]; }).map(function (k) { return spare[k]; }).sort(cmp)
        .forEach(function (g) { if (out.length < MIN_COUNTERS) { g.rare = true; out.push(g); } });
    }
    return out;
  }

  var api = { prep: prep, analyze: analyze, counters: counters, verdict: verdict, pairStatus: pairStatus,
              rarityPenalty: rarityPenalty, advPP: advPP };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DMEngine = api;
})(typeof self !== "undefined" ? self : this);
