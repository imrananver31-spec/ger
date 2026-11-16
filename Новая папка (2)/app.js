/* Богатый вайбкодер, бедный программист. Читалка с бумажным перелистыванием.
   Без библиотек. Работает и в Telegram, и в обычном браузере. */
(function () {
  'use strict';

  var BOOK = window.BOOK;
  var CH = BOOK.chapters;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = $('#app'), book = $('#book'), stage = $('#stage');
  var reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FS_STEPS = [15, 16, 17, 18.5, 20, 22];
  var DESK = { paper: '#1E2633', sepia: '#1E2633', night: '#0F141C' };

  /* ---------------- хранение ---------------- */
  var TG = null;      // Telegram.WebApp, когда открыто внутри Telegram
  var CONFIG = {};
  var LS = 'bvb:';
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v, cloud) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} if (cloud) cloudSet(k, v); }
  };
  function cloudOK() { return !!(TG && TG.initData && TG.CloudStorage && TG.isVersionAtLeast && TG.isVersionAtLeast('6.9')); }
  function cloudSet(k, v) { if (!cloudOK()) return; try { TG.CloudStorage.setItem(k, JSON.stringify(v), function () {}); } catch (e) {} }
  function cloudGet(keys, cb) {
    if (!cloudOK()) return cb({});
    try {
      TG.CloudStorage.getItems(keys, function (err, vals) {
        var out = {};
        if (!err && vals) keys.forEach(function (k) { try { if (vals[k]) out[k] = JSON.parse(vals[k]); } catch (e) {} });
        cb(out);
      });
    } catch (e) { cb({}); }
  }

  var prefs = store.get('prefs', {});
  if (typeof prefs.fs !== 'number' || prefs.fs < 0 || prefs.fs >= FS_STEPS.length) prefs.fs = 2;
  if (['paper', 'sepia', 'night'].indexOf(prefs.theme) < 0) prefs.theme = null;

  /* ---------------- сцена ---------------- */
  function div(cls) { var d = document.createElement('div'); d.className = cls; return d; }
  function makeFace(flap) {
    var el = div(flap ? 'flap' : 'face');
    el.innerHTML = '<div class="' + (flap ? 'flap-layer' : 'face-layer') + '"><div class="head"></div><div class="win"><div class="flow"></div></div><div class="foot"></div></div>' + (flap ? '<div class="fshade"></div>' : '');
    return { el: el, flow: $('.flow', el), head: $('.head', el), foot: $('.foot', el), c: -1, p: -1 };
  }
  var faces = [makeFace(false), makeFace(false)];
  var flapFace = makeFace(true);
  var mface = makeFace(false);
  var ushadeClip = div('ushade-clip'), ushade = div('ushade'), flapWrap = div('flap-wrap');
  var fshade = $('.fshade', flapFace.el);
  var probe = div('');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding-bottom:var(--sb);padding-top:var(--st)';
  ushadeClip.appendChild(ushade);
  flapWrap.appendChild(flapFace.el);
  stage.appendChild(faces[0].el); stage.appendChild(faces[1].el);
  stage.appendChild(ushadeClip); stage.appendChild(flapWrap); stage.appendChild(mface.el);
  app.appendChild(probe);

  var M = {};                       // размеры
  var pages = [], starts = [], total = 0;
  var cur = { c: 0, p: 0 }, curFace = 0;

  function computeMetrics() {
    var vw = app.clientWidth, vh = app.clientHeight;
    var cs = getComputedStyle(probe);
    var sb = parseFloat(cs.paddingBottom) || 0, st = parseFloat(cs.paddingTop) || 0;
    var barH = 56 + sb, topPad = 10 + st, avail = vh - barH - topPad - 6;
    var W = Math.min(vw - 16, 560, Math.round(avail * 0.76));
    W = Math.max(W, Math.min(vw - 8, 250));
    var H = Math.max(300, Math.min(avail, Math.round(W * 1.85)));
    var bx = Math.round((vw - W) / 2), by = Math.round(topPad + Math.max(0, (avail - H) / 2));
    var padX = Math.max(20, Math.min(46, Math.round(W * 0.075)));
    var pt = 46, pb = 42;
    M = { vw: vw, vh: vh, W: W, H: H, cw: W - 2 * padX, ch: H - pt - pb, gap: 48, fs: FS_STEPS[prefs.fs] };
    var s = app.style;
    s.setProperty('--W', W + 'px'); s.setProperty('--H', H + 'px');
    s.setProperty('--bx', bx + 'px'); s.setProperty('--by', by + 'px');
    s.setProperty('--px', padX + 'px'); s.setProperty('--pt', pt + 'px'); s.setProperty('--pb', pb + 'px');
    s.setProperty('--cw', M.cw + 'px'); s.setProperty('--ch', M.ch + 'px'); s.setProperty('--gap', M.gap + 'px');
    s.setProperty('--fs', M.fs + 'px');
  }

  function paginate() {
    var step = M.cw + M.gap;
    pages = []; starts = []; total = 0;
    for (var i = 0; i < CH.length; i++) {
      mface.flow.innerHTML = CH[i].html;
      var n = Math.max(1, Math.round((mface.flow.scrollWidth + M.gap) / step));
      pages[i] = n; starts[i] = total; total += n;
    }
    mface.flow.innerHTML = ''; mface.c = -1;
    faces[0].p = faces[1].p = flapFace.p = -1;
  }

  function setFace(f, ref) {
    var ch = CH[ref.c];
    if (f.c !== ref.c) { f.flow.innerHTML = ch.html; f.c = ref.c; f.el.setAttribute('data-kind', ch.kind); }
    f.p = ref.p;
    f.flow.style.transform = 'translate(' + (-ref.p * (M.cw + M.gap)) + 'px,0)';
    var body = ch.kind === 'text' && ref.p > 0;
    f.head.textContent = body ? ch.title : '';
    f.foot.textContent = body ? String(starts[ref.c] + ref.p + 1) : '';
  }
  function nextRef(r) { if (r.p + 1 < pages[r.c]) return { c: r.c, p: r.p + 1 }; if (r.c + 1 < CH.length) return { c: r.c + 1, p: 0 }; return null; }
  function prevRef(r) { if (r.p > 0) return { c: r.c, p: r.p - 1 }; if (r.c > 0) return { c: r.c - 1, p: pages[r.c - 1] - 1 }; return null; }
  function gidx(r) { return starts[r.c] + r.p; }

  /* якорь: первый абзац на странице, чтобы не потерять место при смене шрифта */
  function colOf(flow, i) {
    var kid = flow.children[i];
    if (!kid) return 0;
    return Math.round((kid.getBoundingClientRect().left - flow.getBoundingClientRect().left) / (M.cw + M.gap));
  }
  // пока человек не перелистнул страницу, якорь не пересчитывается: иначе при смене шрифта место «уплывает»
  var sticky = null;
  function holdAnchor() { if (!sticky || sticky.c !== cur.c) { sticky = getAnchor(); sticky.c = cur.c; } return sticky; }
  function getAnchor() {
    var f = faces[curFace];
    if (f.c !== cur.c) return { a: 0, e: cur.p };
    var n = f.flow.children.length, before = 0, beforeCol = 0;
    for (var i = 0; i < n; i++) {
      var col = colOf(f.flow, i);
      if (col === cur.p) return { a: i, e: 0 };
      if (col > cur.p) break;
      before = i; beforeCol = col;
    }
    return { a: before, e: cur.p - beforeCol };
  }
  function refFromAnchor(c, an) {
    var f = faces[curFace];
    setFace(f, { c: c, p: 0 });
    var p = colOf(f.flow, an.a || 0) + (an.e || 0);
    return { c: c, p: Math.max(0, Math.min(pages[c] - 1, p)) };
  }

  /* ---------------- сгиб страницы ---------------- */
  var F = { on: false, drag: false, will: false, dir: 1, to: null, raf: 0, C: { x: 0, y: 0 }, P: { x: 0, y: 0 }, Pc: { x: 0, y: 0 }, T: { x: 0, y: 0 }, front: null, under: null };

  function setClip(el, pts) {
    var v = 'polygon(0 0,0 0,0 0)';
    if (pts && pts.length >= 3) {
      v = 'polygon(' + pts.map(function (p) { return p[0].toFixed(1) + 'px ' + p[1].toFixed(1) + 'px'; }).join(',') + ')';
    }
    el.style.webkitClipPath = v; el.style.clipPath = v;
  }
  function clearClip(el) { el.style.webkitClipPath = ''; el.style.clipPath = ''; }

  // отсечение прямоугольника страницы полуплоскостью
  function half(poly, mx, my, nx, ny, sign) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var da = sign * ((a[0] - mx) * nx + (a[1] - my) * ny), db = sign * ((b[0] - mx) * nx + (b[1] - my) * ny);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) { var t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }

  // лист держится за корешок: уголок не может уйти дальше, чем позволяет бумага
  function constrain(x, y) {
    var W = M.W, H = M.H, s1 = F.C.y, s2 = H - F.C.y;
    var dx = x, dy = y - s1, r = Math.sqrt(dx * dx + dy * dy);
    if (r > W) { x = dx / r * W; y = s1 + dy / r * W; }
    var R = Math.sqrt(W * W + H * H);
    dx = x; dy = y - s2; r = Math.sqrt(dx * dx + dy * dy);
    if (r > R) { x = dx / r * R; y = s2 + dy / r * R; }
    return { x: x, y: y };
  }

  function renderFold() {
    var W = M.W, H = M.H, C = F.C;
    var P = constrain(F.P.x, F.P.y);
    F.Pc = P;
    var vx = C.x - P.x, vy = C.y - P.y, d = Math.sqrt(vx * vx + vy * vy);
    if (d < 0.7) {
      clearClip(F.front.el); setClip(flapFace.el, null);
      ushade.style.opacity = 0;
      return;
    }
    var nx = vx / d, ny = vy / d, mx = (C.x + P.x) / 2, my = (C.y + P.y) / 2;
    var rect = [[0, 0], [W, 0], [W, H], [0, H]];
    setClip(F.front.el, half(rect, mx, my, nx, ny, -1));
    setClip(flapFace.el, half(rect, mx, my, nx, ny, 1));
    // отражение оборота листа относительно линии сгиба
    var k = 2 * (mx * nx + my * ny);
    flapFace.el.style.transform = 'matrix(' + (1 - 2 * nx * nx) + ',' + (-2 * nx * ny) + ',' + (-2 * nx * ny) + ',' + (1 - 2 * ny * ny) + ',' + (k * nx) + ',' + (k * ny) + ')';
    var ang = Math.atan2(ny, nx), L = 2 * Math.sqrt(W * W + H * H);
    var tr = 'translate(' + mx.toFixed(1) + 'px,' + my.toFixed(1) + 'px) rotate(' + ang.toFixed(4) + 'rad) translate(0,' + (-L / 2).toFixed(0) + 'px)';
    ushade.style.transform = tr;
    ushade.style.width = Math.max(10, Math.min(70, d * 0.2)).toFixed(0) + 'px';
    ushade.style.height = L.toFixed(0) + 'px';
    ushade.style.opacity = Math.min(1, d / 90).toFixed(2);
    fshade.style.transform = tr;
    fshade.style.width = (d / 2 + 1).toFixed(0) + 'px';
    fshade.style.height = L.toFixed(0) + 'px';
    fshade.style.opacity = Math.min(1, d / 70).toFixed(2);
  }

  function showOnly(i) {
    faces.forEach(function (f, k) {
      f.el.classList.toggle('on', k === i);
      f.el.classList.remove('is-front', 'is-under');
      clearClip(f.el);
    });
  }

  function beginFlip(dir, top, dest) {
    if (F.on) flushFlip();
    var to = dest || (dir > 0 ? nextRef(cur) : prevRef(cur));
    if (!to) return false;
    var now = faces[curFace], spare = faces[1 - curFace];
    F.on = true; F.drag = false; F.will = false; F.dir = dir; F.to = to;
    F.C = { x: M.W, y: top ? 0 : M.H };
    setFace(spare, to);
    if (dir > 0) { F.front = now; F.under = spare; setFace(flapFace, cur); F.P = { x: F.C.x, y: F.C.y }; }
    else { F.front = spare; F.under = now; setFace(flapFace, to); F.P = { x: -M.W, y: F.C.y }; }
    F.front.el.classList.add('on', 'is-front'); F.front.el.classList.remove('is-under');
    F.under.el.classList.add('on', 'is-under'); F.under.el.classList.remove('is-front');
    stage.classList.add('flipping');
    renderFold();
    return true;
  }

  function endFlip(done) {
    cancelAnimationFrame(F.raf);
    F.on = false; F.drag = false;
    stage.classList.remove('flipping');
    setClip(flapFace.el, null);
    if (done) { cur = F.to; curFace = 1 - curFace; }
    showOnly(curFace);
    if (done) afterNav(true);
  }
  function flushFlip() { if (F.on) endFlip(F.will); }

  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function animateTo(end, ms, arc, ease, done) {
    cancelAnimationFrame(F.raf);
    var from = { x: F.Pc.x, y: F.Pc.y }, t0 = 0, lift = F.C.y > 0 ? -1 : 1;
    function step(now) {
      if (!t0) t0 = now;
      var t = Math.min(1, (now - t0) / ms), e = ease(t);
      F.P = { x: from.x + (end.x - from.x) * e, y: from.y + (end.y - from.y) * e + lift * arc * Math.sin(Math.PI * e) };
      renderFold();
      if (t < 1) F.raf = requestAnimationFrame(step); else done();
    }
    F.raf = requestAnimationFrame(step);
  }

  function dragLoop() {
    if (!F.on || !F.drag) return;
    F.P.x += (F.T.x - F.P.x) * 0.34;
    F.P.y += (F.T.y - F.P.y) * 0.34;
    renderFold();
    F.raf = requestAnimationFrame(dragLoop);
  }

  function flipAuto(dir, dest) {
    if (reduceMotion) {
      var to = dest || (dir > 0 ? nextRef(cur) : prevRef(cur));
      if (!to) return;
      cur = to; setFace(faces[curFace], cur);
      stage.classList.remove('fade'); void stage.offsetWidth; stage.classList.add('fade');
      afterNav(true);
      return;
    }
    if (!beginFlip(dir, false, dest)) return;
    F.will = true;
    var end = dir > 0 ? { x: -M.W, y: M.H } : { x: M.W, y: M.H };
    animateTo(end, dir > 0 ? 640 : 580, M.H * 0.1, easeInOut, function () { endFlip(true); });
  }

  function goTo(ref) {
    if (!ref || !(ref.c >= 0 && ref.c < CH.length)) return;
    ref = { c: ref.c, p: Math.max(0, Math.min(pages[ref.c] - 1, ref.p | 0)) };
    if (ref.c === cur.c && ref.p === cur.p) return;
    flipAuto(gidx(ref) > gidx(cur) ? 1 : -1, ref);
  }

  /* ---------------- жесты ---------------- */
  var ptr = null, ui = { open: null }, userMoved = false;

  function local(x, y) { var r = book.getBoundingClientRect(); return { x: x - r.left, y: y - r.top }; }

  book.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (ui.open || ptr) return;
    if (e.target.closest && e.target.closest('[data-act]')) return;
    var now = performance.now();
    ptr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: now, lx: e.clientX, lt: now, vx: 0, flip: false, dir: 0 };
    try { book.setPointerCapture(e.pointerId); } catch (err) {}
  });

  book.addEventListener('pointermove', function (e) {
    if (!ptr || e.pointerId !== ptr.id) return;
    var now = performance.now(), dt = now - ptr.lt;
    if (dt > 4) { ptr.vx = 0.65 * ((e.clientX - ptr.lx) / dt) + 0.35 * ptr.vx; ptr.lx = e.clientX; ptr.lt = now; }
    ptr.x = e.clientX; ptr.y = e.clientY;
    var dx = ptr.x - ptr.x0, dy = ptr.y - ptr.y0;
    if (!ptr.flip) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 0.7) return;
      var dir = dx < 0 ? 1 : -1;
      userMoved = true; hinted();
      if (reduceMotion) { release(); flipAuto(dir); return; }
      var top = local(ptr.x0, ptr.y0).y < M.H * 0.4;
      if (!beginFlip(dir, top)) { release(); return; }
      ptr.flip = true; ptr.dir = dir; F.drag = true;
      F.T = { x: F.P.x, y: F.P.y };
      F.raf = requestAnimationFrame(dragLoop);
    }
    var q = local(ptr.x, ptr.y);
    F.T = { x: q.x, y: F.C.y + (q.y - F.C.y) * 0.42 };
  });

  function release() { if (!ptr) return; try { book.releasePointerCapture(ptr.id); } catch (err) {} ptr = null; }

  function pointerEnd(e, cancelled) {
    if (!ptr || e.pointerId !== ptr.id) return;
    var p = ptr; release();
    if (p.flip) {
      if (!F.on || !F.drag) return;
      F.drag = false; cancelAnimationFrame(F.raf);
      var dx = p.x - p.x0, ok;
      if (cancelled) ok = false;
      else if (p.dir > 0) ok = (dx < -M.W * 0.2 || p.vx < -0.4) && p.vx < 0.45;
      else ok = (dx > M.W * 0.2 || p.vx > 0.4) && p.vx > -0.45;
      F.will = ok;
      var end = (p.dir > 0) === ok ? { x: -M.W, y: F.C.y } : { x: F.C.x, y: F.C.y };
      var dist = Math.sqrt(Math.pow(end.x - F.Pc.x, 2) + Math.pow(end.y - F.Pc.y, 2));
      var ms = Math.max(170, Math.min(540, 160 + dist * 0.62));
      animateTo(end, ms, M.H * 0.05 * Math.min(1, dist / M.W), easeOut, function () { endFlip(ok); });
      return;
    }
    if (cancelled) return;
    if (Math.abs(p.x - p.x0) < 10 && Math.abs(p.y - p.y0) < 10 && performance.now() - p.t0 < 650) {
      userMoved = true; hinted();
      flipAuto(local(p.x, p.y).x < M.W * 0.3 ? -1 : 1);
    }
  }
  book.addEventListener('pointerup', function (e) { pointerEnd(e, false); });
  book.addEventListener('pointercancel', function (e) { pointerEnd(e, true); });
  book.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  book.addEventListener('dragstart', function (e) { e.preventDefault(); });

  stage.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-act]');
    if (!b) return;
    var name = b.getAttribute('data-act');
    if (name === 'zoom') openZoom(b.closest('figure'));
    else if (name === 'notebook') openNotes();
    else if (name === 'share') share();
    else if (name === 'restart') goTo({ c: 0, p: 0 });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeSheet(); return; }
    if (ui.open || /^(TEXTAREA|INPUT)$/.test((e.target && e.target.tagName) || '')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); userMoved = true; hinted(); flipAuto(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); userMoved = true; hinted(); flipAuto(-1); }
  });
  var wheelAt = 0;
  $('#desk').addEventListener('wheel', function (e) {
    var now = Date.now();
    if (ui.open || now - wheelAt < 420 || Math.abs(e.deltaY) < 16) return;
    wheelAt = now; userMoved = true; hinted();
    flipAuto(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });

  /* ---------------- после перехода ---------------- */
  var navTimer = 0;
  function afterNav(byUser) {
    sticky = null;
    updateProgress();
    clearTimeout(navTimer);
    navTimer = setTimeout(function () { if (F.on) return; preload(); savePos(); }, 160);
    if (byUser) haptic();
  }
  function preload() {
    var n = nextRef(cur);
    if (n) setFace(faces[1 - curFace], n);
    setFace(flapFace, cur);
  }
  function savePos() {
    var an = holdAnchor();
    store.set('pos', { k: CH[cur.c].key, a: an.a, e: an.e, t: Date.now() }, true);
  }
  function haptic() {
    try { if (TG && TG.HapticFeedback && TG.isVersionAtLeast('6.1')) TG.HapticFeedback.selectionChanged(); } catch (e) {}
  }
  function updateProgress() {
    var g = gidx(cur);
    $('#fill').style.width = (total > 1 ? (g / (total - 1)) * 100 : 0).toFixed(2) + '%';
    $('#count').textContent = (g + 1) + ' из ' + total;
  }
  function buildTicks() {
    var h = '';
    BOOK.toc.forEach(function (t) { if (starts[t.c] > 0) h += '<i style="left:' + (starts[t.c] / (total - 1) * 100).toFixed(2) + '%"></i>'; });
    $('#ticks').innerHTML = h;
  }

  /* ---------------- шторки ---------------- */
  var pendingRelayout = false;
  function backBtn(show) {
    try { if (TG && TG.BackButton && TG.isVersionAtLeast('6.1')) { if (show) TG.BackButton.show(); else TG.BackButton.hide(); } } catch (e) {}
  }
  function openSheet(id) {
    if (F.on) flushFlip();
    if (ui.open) closeSheet();
    var el = $('#sheet-' + id);
    el.classList.add('open'); el.setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('on');
    ui.open = id; backBtn(true);
  }
  function closeSheet() {
    if (!ui.open) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (ui.open === 'zoom') { var z = $('#zoom'); z.classList.remove('open', 'big'); z.setAttribute('aria-hidden', 'true'); $('#zoom-in').innerHTML = ''; }
    else { var el = $('#sheet-' + ui.open); el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
    $('#scrim').classList.remove('on');
    ui.open = null; backBtn(false);
    if (pendingRelayout) { pendingRelayout = false; relayout(); }
  }
  $('#scrim').addEventListener('click', closeSheet);
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', closeSheet); });

  // содержание
  function openToc() {
    var h = '', group = 'main';
    BOOK.toc.forEach(function (t) {
      if (t.group !== group) { h += '<div class="toc-sep"></div>'; group = t.group; }
      h += '<button class="toc-row" data-c="' + t.c + '"' + (t.c === cur.c ? ' aria-current="true"' : '') + '><span class="n">' + (t.label || '') + '</span><span class="t">' + t.title + '</span><span class="p">' + (starts[t.c] + 1) + '</span></button>';
    });
    h += '<div class="toc-sep"></div><button class="toc-row toc-row--tool" data-tool="notes"><span class="n"><svg viewBox="0 0 20 20" width="17" height="17"><path d="M4 16l1-4 8.5-8.5 3 3L8 15z M11.5 5.5l3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg></span><span class="t">Открыть тетрадь</span><span class="p"></span></button>';
    var list = $('#toc-list');
    list.innerHTML = h;
    openSheet('toc');
    var on = $('[aria-current="true"]', list);
    list.scrollTop = on ? Math.max(0, on.offsetTop - list.clientHeight / 2 + 30) : 0;
  }
  $('#toc-list').addEventListener('click', function (e) {
    var b = e.target.closest('.toc-row');
    if (!b) return;
    if (b.getAttribute('data-tool') === 'notes') { closeSheet(); openNotes(); return; }
    var c = +b.getAttribute('data-c');
    closeSheet(); userMoved = true; hinted();
    setTimeout(function () { goTo({ c: c, p: 0 }); }, 190);
  });
  $('#btn-toc').addEventListener('click', openToc);
  $('#progress').addEventListener('click', openToc);

  // шрифт и бумага
  function paintView() {
    var d = '';
    for (var i = 0; i < FS_STEPS.length; i++) d += '<i class="' + (i <= prefs.fs ? 'on' : '') + '"></i>';
    $('#fs-dots').innerHTML = d;
    $('#fs-minus').disabled = prefs.fs === 0;
    $('#fs-plus').disabled = prefs.fs === FS_STEPS.length - 1;
    var th = app.getAttribute('data-theme');
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-pick]'), function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-theme-pick') === th ? 'true' : 'false');
    });
  }
  function setFs(i) {
    i = Math.max(0, Math.min(FS_STEPS.length - 1, i));
    if (i === prefs.fs) return;
    var an = holdAnchor();
    prefs.fs = i; store.set('prefs', prefs, true);
    computeMetrics(); paginate(); buildTicks();
    cur = refFromAnchor(cur.c, an);
    setFace(faces[curFace], cur); preload(); updateProgress(); paintView();
  }
  function applyTheme(t, save) {
    app.setAttribute('data-theme', t);
    var meta = $('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', DESK[t]);
    document.body.style.background = DESK[t];
    try {
      if (TG && TG.isVersionAtLeast('6.1')) { TG.setHeaderColor(DESK[t]); TG.setBackgroundColor(DESK[t]); }
      if (TG && TG.setBottomBarColor && TG.isVersionAtLeast('7.10')) TG.setBottomBarColor(DESK[t]);
    } catch (e) {}
    if (save) { prefs.theme = t; store.set('prefs', prefs, true); }
    paintView();
  }
  $('#fs-minus').addEventListener('click', function () { setFs(prefs.fs - 1); });
  $('#fs-plus').addEventListener('click', function () { setFs(prefs.fs + 1); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-theme-pick]'), function (b) {
    b.addEventListener('click', function () { applyTheme(b.getAttribute('data-theme-pick'), true); });
  });
  $('#btn-view').addEventListener('click', function () { paintView(); openSheet('view'); });

  // тетрадь
  var notesBuilt = false, noteTimers = {};
  function grow(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(96, ta.scrollHeight + 2) + 'px'; }
  function openNotes() {
    var list = $('#notes-list');
    if (!notesBuilt) {
      var h = '<p class="notes-lead">Одно задание на главу. Ответы сохраняются сами.</p>';
      BOOK.weeks.forEach(function (w) {
        h += '<div class="note-card"><h3><span>Неделя ' + w.n + '</span>' + w.title + '</h3><p>' + w.task + '</p><textarea data-n="' + w.n + '" maxlength="3500" placeholder="Мой ответ" aria-label="Ответ, неделя ' + w.n + '"></textarea></div>';
      });
      list.innerHTML = h;
      list.addEventListener('input', function (e) {
        var ta = e.target; if (ta.tagName !== 'TEXTAREA') return;
        grow(ta);
        var n = ta.getAttribute('data-n');
        clearTimeout(noteTimers[n]);
        noteTimers[n] = setTimeout(function () { store.set('n' + n, { v: ta.value, t: Date.now() }, true); }, 500);
      });
      notesBuilt = true;
    }
    var tas = list.querySelectorAll('textarea');
    Array.prototype.forEach.call(tas, function (ta) { var s = store.get('n' + ta.getAttribute('data-n'), null); ta.value = s && s.v ? s.v : ''; });
    openSheet('notes');
    Array.prototype.forEach.call(tas, grow);
    cloudGet(BOOK.weeks.map(function (w) { return 'n' + w.n; }), function (vals) {
      Array.prototype.forEach.call(tas, function (ta) {
        var k = 'n' + ta.getAttribute('data-n'), c = vals[k], l = store.get(k, null);
        if (c && typeof c.v === 'string' && (!l || (c.t || 0) > (l.t || 0)) && document.activeElement !== ta) {
          ta.value = c.v; store.set(k, c); grow(ta);
        }
      });
    });
  }

  // увеличение иллюстрации
  function openZoom(fig) {
    var svg = fig && $('.ill-svg', fig);
    if (!svg) return;
    if (F.on) flushFlip();
    var z = $('#zoom'), box = $('#zoom-in');
    box.innerHTML = '';
    var copy = svg.cloneNode(true);
    copy.removeAttribute('class');
    box.appendChild(copy);
    z.classList.add('open'); z.classList.remove('big'); z.setAttribute('aria-hidden', 'false');
    z.scrollTop = 0; z.scrollLeft = 0;
    $('#zoom-tip').textContent = 'Нажмите на картинку, чтобы приблизить';
    ui.open = 'zoom'; backBtn(true);
  }
  $('#zoom-in').addEventListener('click', function (e) {
    var z = $('#zoom'), svg = $('svg', this);
    if (!svg) return;
    var r = svg.getBoundingClientRect();
    var fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    var big = z.classList.toggle('big');
    $('#zoom-tip').textContent = big ? 'Двигайте картинку пальцем' : 'Нажмите на картинку, чтобы приблизить';
    if (big && fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1) {
      var r2 = svg.getBoundingClientRect();
      z.scrollLeft = Math.max(0, fx * r2.width - z.clientWidth / 2 + 10);
      z.scrollTop = Math.max(0, 64 + fy * r2.height - z.clientHeight / 2);
    } else { z.scrollLeft = 0; z.scrollTop = 0; }
  });
  $('#zoom-x').addEventListener('click', closeSheet);

  // поделиться
  var toastTimer = 0;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }
  function share() {
    var url = CONFIG.bot ? 'https://t.me/' + CONFIG.bot : location.origin + location.pathname;
    var text = 'Книга «Богатый вайбкодер, бедный программист». Листается как бумажная.';
    try {
      if (TG && TG.initData && TG.openTelegramLink) { TG.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text)); return; }
    } catch (e) {}
    if (navigator.share) { navigator.share({ title: BOOK.title, text: text, url: url }).catch(function () {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(function () { toast('Ссылка скопирована'); }, function () { toast(url); }); return; }
    toast(url);
  }

  /* ---------------- размеры окна ---------------- */
  function relayout() {
    if (ui.open === 'notes') { pendingRelayout = true; return; }
    if (F.on) flushFlip();
    var was = { vw: M.vw, vh: M.vh, W: M.W, H: M.H };
    var an = holdAnchor();
    computeMetrics();
    if (was.W === M.W && was.H === M.H) return;
    paginate(); buildTicks();
    cur = refFromAnchor(cur.c, an);
    setFace(faces[curFace], cur); preload(); updateProgress();
  }
  var rzTimer = 0;
  function onResize() { clearTimeout(rzTimer); rzTimer = setTimeout(relayout, 180); }

  /* ---------------- подсказка: уголок приподнимается один раз ---------------- */
  function hinted() { if (!store.get('hint', 0)) store.set('hint', 1); }
  function maybeHint() {
    if (reduceMotion || store.get('hint', 0) || cur.c !== 0) return;
    setTimeout(function () {
      if (F.on || ui.open || userMoved || cur.c !== 0) return;
      if (!beginFlip(1, false)) return;
      animateTo({ x: M.W * 0.7, y: M.H * 0.84 }, 700, 0, easeInOut, function () {
        setTimeout(function () {
          if (!F.on || F.drag || F.will) return;
          animateTo({ x: F.C.x, y: F.C.y }, 620, 0, easeInOut, function () { endFlip(false); });
        }, 420);
      });
    }, 900);
  }

  /* ---------------- Telegram ---------------- */
  function initTelegram(w) {
    TG = w;
    try { w.ready(); w.expand(); } catch (e) {}
    try { if (w.disableVerticalSwipes && w.isVersionAtLeast('7.7')) w.disableVerticalSwipes(); } catch (e) {}
    try { if (w.BackButton && w.isVersionAtLeast('6.1')) w.BackButton.onClick(closeSheet); } catch (e) {}
    try {
      w.onEvent('viewportChanged', function (ev) { if (!ev || ev.isStateStable) onResize(); });
      w.onEvent('safeAreaChanged', onResize);
      w.onEvent('contentSafeAreaChanged', onResize);
    } catch (e) {}
    if (!prefs.theme && w.colorScheme === 'dark') applyTheme('night', false); else applyTheme(app.getAttribute('data-theme'), false);
    onResize();
    cloudGet(['pos', 'prefs'], function (v) {
      var lp = store.get('pos', null);
      if (v.prefs && !store.get('prefs', null)) {
        if (['paper', 'sepia', 'night'].indexOf(v.prefs.theme) >= 0) applyTheme(v.prefs.theme, false), prefs.theme = v.prefs.theme;
        if (typeof v.prefs.fs === 'number' && v.prefs.fs !== prefs.fs) setFs(v.prefs.fs);
      }
      if (v.pos && !userMoved && !deepLinked && (!lp || (v.pos.t || 0) > (lp.t || 0) + 3000)) {
        var c = chapterIndex(v.pos.k);
        if (c >= 0) { if (F.on) flushFlip(); var ref = refFromAnchor(c, v.pos); setFace(faces[curFace], cur); goTo(ref); }
      }
    });
  }
  function waitTelegram() {
    var tries = 0;
    (function poll() {
      var w = window.Telegram && window.Telegram.WebApp;
      if (w) { initTelegram(w); return; }
      if (++tries < 80) setTimeout(poll, 100);
    })();
  }

  /* ---------------- запуск ---------------- */
  var deepLinked = false;
  function chapterIndex(key) { for (var i = 0; i < CH.length; i++) if (CH[i].key === String(key)) return i; return -1; }

  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var want = ['400 17px "Lora"', 'italic 400 17px "Lora"', '700 17px "Lora"', '800 20px "Unbounded"', '600 12px "Unbounded"', '400 12px "Inter"', '500 12px "Inter"', '600 12px "Inter"', '700 12px "Inter"', '400 12px "JetBrains Mono"'];
    var all = Promise.all(want.map(function (f) { return document.fonts.load(f, 'Абв abc 123').catch(function () {}); }));
    var limit = new Promise(function (res) { setTimeout(res, 4000); });
    return Promise.race([all, limit]);
  }

  function start() {
    applyTheme(prefs.theme || 'paper', false);
    computeMetrics();
    fontsReady().then(function () {
      paginate(); buildTicks();
      var want = null, q = /[?&]ch=([\w-]+)/.exec(location.search);
      if (q) { var c = chapterIndex(q[1]); if (c >= 0) { want = { c: c, p: 0 }; deepLinked = true; } }
      if (!want) {
        var pos = store.get('pos', null), c2 = pos ? chapterIndex(pos.k) : -1;
        if (c2 >= 0) { want = refFromAnchor(c2, pos); sticky = { a: pos.a || 0, e: pos.e || 0, c: c2 }; }
      }
      cur = want || { c: 0, p: 0 };
      setFace(faces[curFace], cur); showOnly(curFace); preload(); updateProgress(); paintView();
      $('#splash').classList.add('hide');
      window.addEventListener('resize', onResize);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(recount, 80); });
      maybeHint();
      waitTelegram();
      try { fetch('api/config').then(function (r) { return r.ok ? r.json() : {}; }).then(function (c) { CONFIG = c || {}; }).catch(function () {}); } catch (e) {}
    });
  }
  // шрифты могли догрузиться позже: пересчитать страницы, если счёт изменился
  function recount() {
    if (F.on || ui.open) return;
    var old = total, an = holdAnchor();
    var keep = pages.slice();
    paginate();
    if (total === old && keep.join() === pages.join()) { setFace(faces[curFace], cur); preload(); return; }
    buildTicks();
    cur = refFromAnchor(cur.c, an);
    setFace(faces[curFace], cur); preload(); updateProgress();
  }

  window.__book = { goTo: goTo, flip: flipAuto, state: function () { return { cur: cur, total: total, pages: pages, M: M, flipping: F.on }; } };
  start();
})();
