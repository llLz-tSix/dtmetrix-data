/* Фон сайта: приглушённые фиолетовые цифры (canvas#rain). Общий для главной и страниц героев/меты. */
(function () {
  function rain() {
    var cv = document.getElementById("rain"), cx = cv.getContext("2d"), F = 16, cols, drops, w, h;
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

  if (document.getElementById("rain") && !(window.matchMedia && matchMedia("(max-width: 700px)").matches)) rain();
})();
