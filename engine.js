/* Dota Metrix: оценка пиков на JS. Точный перенос dtmetrix/scoring.py (candidate_estimate, analyze_pick).
   Данные: site/data.json (его готовит scripts/build_site_data.py). Совпадение с Python проверяет
   tests/test_site_parity.py. */
(function (root) {
  "use strict";

  const RARITY_PP_PER_DECADE = 1.5;
  const RARITY_MAX_PP = 2.5;

  function prep(D) {
    if (D._ready) return D;
    D.byId = {};
    D.heroes.forEach(function (h) {
      D.byId[h[0]] = { id: h[0], name: h[1], slug: h[2], mask: h[3], mu: h[4], picks: h[5], pub: h[6], w: h[7] };
    });
    D.list = Object.keys(D.byId).map(function (k) { return D.byId[k]; });
    D._ready = true;
    return D;
  }

  function rarityPenalty(picks, median) {
    if (median <= 0 || picks >= median) return 0;
    if (picks <= 0) return RARITY_MAX_PP;
    return Math.min(RARITY_MAX_PP, RARITY_PP_PER_DECADE * Math.log10(median / picks));
  }

  /* Пара кандидат-враг: байесовская поправка к базовому винрейту героя. */
  function pair(D, cand, enemyId) {
    var row = D.pairs[String(enemyId)];
    var v = row && row[String(cand.id)];
    var games = 0, wins = 0;
    if (v && v[0] >= D.min_pair) { games = v[0]; wins = v[0] - v[1]; }   // в снимке v[1] = победы врага
    var nEff = games + D.k_pair;
    var wEff = wins + D.k_pair * cand.mu;
    return { games: games, rate: wEff / nEff, nEff: nEff, raw: games ? wins / games : null };
  }

  function candidate(D, cand, enemies, ri) {
    var pairs = [], weights = [], totalW = 0, gamesTotal = 0, matched = 0;
    enemies.forEach(function (eid) {
      var p = pair(D, cand, eid);
      p.id = eid;
      p.weight = D.byId[eid].w[ri];
      pairs.push(p);
      totalW += p.weight;
      gamesTotal += p.games;
      if (p.games >= D.min_pair) matched++;
    });
    if (!totalW) totalW = 1;
    var rateSum = 0, varSum = 0;
    pairs.forEach(function (p) {
      var share = p.weight / totalW;
      rateSum += share * p.rate;
      varSum += share * share * p.rate * (1 - p.rate) / p.nEff;
    });
    var sd = Math.sqrt(varSum);
    var lo = Math.max(0, rateSum - 1.96 * sd), hi = Math.min(1, rateSum + 1.96 * sd);
    var pen = rarityPenalty(cand.picks, D.median);
    return {
      id: cand.id, name: cand.name, slug: cand.slug,
      score: rateSum * 100 - pen, ci_low: lo * 100 - pen, ci_high: hi * 100 - pen,
      rarity_penalty: pen, eff_games: gamesTotal, matched: matched,
      low_evidence: gamesTotal < D.min_total, baseline: cand.mu * 100, pairs: pairs
    };
  }

  /* Лучшие пики против состава для роли role (carry|mid|offlaner|support4|support5). */
  function analyze(D, enemyIds, role, limit) {
    prep(D);
    limit = limit || 8;
    var ri = D.roles.indexOf(role);
    var enemies = enemyIds.map(Number).filter(function (id) { return D.byId[id]; });
    if (!enemies.length || ri < 0) return [];
    var rows = [];
    D.list.forEach(function (c) {
      if (enemies.indexOf(c.id) >= 0 || c.mask[ri] !== "1") return;
      rows.push(candidate(D, c, enemies, ri));
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

  /* Статус пары (как _matchup_status в app.py). */
  function pairStatus(p, minGames) {
    minGames = minGames || 20;
    if (!p.games) return { key: "none", label: "Нет данных" };
    if (p.games < minGames) return { key: "none", label: "Мало данных" };
    var r = p.rate * 100;
    if (r >= 54) return { key: "good", label: "Силён против" };
    if (r <= 46) return { key: "bad", label: "Слаб против" };
    return { key: "mid", label: "Нейтрально" };
  }

  var api = { prep: prep, analyze: analyze, verdict: verdict, pairStatus: pairStatus, rarityPenalty: rarityPenalty };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DMEngine = api;
})(typeof self !== "undefined" ? self : this);
