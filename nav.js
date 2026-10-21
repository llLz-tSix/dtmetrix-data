/* Dota Metrix: переходы между страницами сайта без перезагрузки.
   Ссылка внутри сайта -> страница скачивается в фоне (заранее, при наведении), картинки первого экрана
   догружаются, потом меняется только содержимое .page. Фон-«дождь» (rain.js) при этом не перезапускается.
   Любая ошибка -> обычный переход по ссылке. */
(function () {
  "use strict";
  if (!window.fetch || !window.DOMParser || !history.pushState) return;
  var root = ((document.currentScript && document.currentScript.src) || "").replace(/[^/]*$/, "");
  if (!root) return;
  var KEEP = /\/(rain|nav)\.js(\?|$)/,              // живут всё время, второй раз не запускаем
      ONCE = /\/(engine|quiz)\.js(\?|$)/,           // библиотеки: хватает одного запуска
      cache = {}, loaded = {}, busy = false;
  history.scrollRestoration = "manual";
  [].forEach.call(document.scripts, function (s) { if (s.src) loaded[s.src] = true; });

  function page(u) { return u.split("#")[0]; }
  function ok(a, e) {
    if (!a || a.target || a.hasAttribute("download") || (e && (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey))) return false;
    var u = a.href, path = a.pathname || "";
    if (u.indexOf(root) !== 0 || !/(\/|\.html)$/.test(path)) return false;
    return page(u) !== page(location.href);             // та же страница (якорь, #r=carry) - как обычно
  }
  function get(u) {
    u = page(u);
    if (!cache[u]) cache[u] = fetch(u, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok || !/html/.test(r.headers.get("content-type") || "")) throw new Error(r.status);
      return r.text();
    }).catch(function (e) { delete cache[u]; throw e; });
    return cache[u];
  }
  function wait(p, ms) { return Promise.race([p, new Promise(function (r) { setTimeout(r, ms); })]); }
  function abs(href, base) { try { return new URL(href, base).href; } catch (e) { return href; } }

  /* стили новой страницы: ставим недостающие, лишние убираем (главная - свой <style>, остальные - pages.css) */
  function styles(doc, u) {
    var key = function (el) { return el.tagName === "LINK" ? "L" + abs(el.getAttribute("href"), u) : "S" + el.textContent; },
        want = [].slice.call(doc.head.querySelectorAll('style,link[rel="stylesheet"]')),
        have = [].slice.call(document.head.querySelectorAll('style,link[rel="stylesheet"]')),
        wk = want.map(key), hk = have.map(key), jobs = [];
    want.forEach(function (el, i) {
      if (hk.indexOf(wk[i]) >= 0) return;
      var n = document.createElement(el.tagName);
      if (el.tagName === "LINK") {
        n.rel = "stylesheet"; n.href = abs(el.getAttribute("href"), u);
        jobs.push(new Promise(function (r) { n.onload = n.onerror = r; }));
      } else n.textContent = el.textContent;
      document.head.appendChild(n);
    });
    return { ready: wait(Promise.all(jobs), 1500), drop: have.filter(function (el, i) { return wk.indexOf(hk[i]) < 0; }) };
  }
  /* картинки первого экрана новой страницы - до показа, чтобы не было «пустого шаблона» */
  function pics(doc, u) {
    var imgs = [].slice.call(doc.querySelectorAll(".page img[src]")).slice(0, 24);
    return wait(Promise.all(imgs.map(function (im) {
      var i = new Image(); i.src = abs(im.getAttribute("src"), u);
      return i.decode ? i.decode().catch(function () {}) : new Promise(function (r) { i.onload = i.onerror = r; });
    })), 600);
  }
  function run(old) {                               // скрипт из чужого документа: только новый элемент исполняется
    var s = document.createElement("script");
    [].forEach.call(old.attributes, function (a) { if (a.name !== "src") s.setAttribute(a.name, a.value); });
    if (old.src) {
      s.src = old.src; s.async = false;
      var p = new Promise(function (r) { s.onload = s.onerror = r; });
      old.parentNode ? old.parentNode.replaceChild(s, old) : document.body.appendChild(s);
      loaded[s.src] = true;
      return p;
    }
    s.textContent = old.textContent;
    old.parentNode ? old.parentNode.replaceChild(s, old) : document.body.appendChild(s);
    return Promise.resolve();
  }

  function go(u, push, y) {
    if (busy) return;
    busy = true;
    get(u).then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html"), next = doc.querySelector(".page"), cur = document.querySelector(".page");
      if (!next || !cur) throw new Error("page");
      [].forEach.call(next.querySelectorAll("img[src]"), function (im) { im.setAttribute("src", abs(im.getAttribute("src"), u)); });
      var st = styles(doc, u);
      return Promise.all([st.ready, pics(doc, u)]).then(function () {
        function swap() {
          if (push) {
            history.replaceState({ y: scrollY }, "", location.href);
            history.pushState({ y: 0 }, "", u);
          }
          shown = page(u);
          document.title = doc.title;
          document.body.className = doc.body.className;
          st.drop.forEach(function (el) { el.remove(); });
          var canvas = document.getElementById("rain"), nc = doc.getElementById("rain");
          if (canvas && window.DMRain) DMRain.focus(((nc && nc.getAttribute("data-focus")) || "").split(",").filter(Boolean).map(Number));
          var fresh = document.importNode(next, true);
          cur.parentNode.replaceChild(fresh, cur);
          [].slice.call(document.body.children).forEach(function (el) {   // скрипты старой страницы после .page
            if (el.tagName === "SCRIPT" && !(el.src && KEEP.test(el.src))) el.remove();
          });
          var h = u.indexOf("#") >= 0 && document.getElementById(decodeURIComponent(u.split("#")[1]));
          if (h) h.scrollIntoView(); else scrollTo(0, y || 0);
          var inside = [].slice.call(fresh.querySelectorAll("script")),
              after = [].slice.call(doc.body.children).filter(function (el) { return el.tagName === "SCRIPT"; });
          return inside.concat(after.map(function (el) {
            var c = document.importNode(el, true); document.body.appendChild(c); return c;
          })).reduce(function (p, s) {
            return p.then(function () {
              if (s.src && (KEEP.test(s.src) || (ONCE.test(s.src) && loaded[s.src]))) { s.remove(); return; }
              return run(s);
            });
          }, Promise.resolve());
        }
        var done = null;
        function once() { return done || (done = swap()); }
        if (document.startViewTransition && document.visibilityState === "visible" &&
            !matchMedia("(prefers-reduced-motion: reduce)").matches) {
          var t = document.startViewTransition(once), quiet = function () {};
          t.ready.catch(quiet); t.finished.catch(quiet);
          // переход ждёт кадра; если кадра нет (вкладка в фоне и т.п.) - меняем без анимации
          return Promise.race([t.updateCallbackDone, new Promise(function (r) { setTimeout(r, 400); })]).then(function () {
            if (!done) t.skipTransition();
            return once();
          });
        }
        return once();
      });
    }).then(function () { busy = false; }, function () { location.href = u; });
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (e.defaultPrevented || !ok(a, e)) return;
    e.preventDefault();
    go(a.href, true, 0);
  });
  function warm(e) {                                 // скачать заранее, пока курсор/палец на ссылке
    var a = e.target.closest && e.target.closest("a[href]");
    if (ok(a)) get(a.href).catch(function () {});
  }
  document.addEventListener("pointerover", warm, { passive: true });
  document.addEventListener("touchstart", warm, { passive: true });
  var shown = page(location.href);
  addEventListener("popstate", function (e) {
    if (page(location.href) === shown) return;      // назад по якорю внутри страницы
    go(location.href, false, (e.state && e.state.y) || 0);
  });
})();
