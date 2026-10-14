/* Syntotec · landing. Sin dependencias.
   - Intro con la música de un proyecto real, el arte VJ de la app y el logo animado.
   - Galería de proyectos públicos (API del backend) y proyectos de ejemplo.
   Todo texto que viene del servidor se inserta con textContent: nunca como HTML. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var INTRO_AUDIO = '/audio/intro.mp3';
  var INTRO_SEEN = 'syntotec.intro';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* =====================================================================
     Arte VJ (mismo dibujo que el visualizador de la app)
     ===================================================================== */
  function VJ(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hue = 300;
    this.clock = 0;
    this.analyser = null;
    this.wave = new Uint8Array(1024).fill(128);
    this.spectrum = new Uint8Array(512);
    this.energy = 0;
    this.bass = 0;
    this.level = 1;          // intensidad general: 1 en la intro, menos detras del contenido
    this.running = false;
    this.w = 0; this.h = 0;
    var self = this;
    this.frame = function () { self.draw(); };
    window.addEventListener('resize', function () { self.resize(); });
    document.addEventListener('visibilitychange', function () { document.hidden ? self.stop() : self.start(); });
    this.resize();
  }
  VJ.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = this.canvas.width = Math.round(window.innerWidth * dpr);
    this.h = this.canvas.height = Math.round(window.innerHeight * dpr);
  };
  VJ.prototype.setAnalyser = function (a) {
    this.analyser = a;
    if (a) {
      this.wave = new Uint8Array(a.fftSize);
      this.spectrum = new Uint8Array(a.frequencyBinCount);
    }
  };
  VJ.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  };
  VJ.prototype.stop = function () {
    this.running = false;
    cancelAnimationFrame(this.raf);
  };
  VJ.prototype.draw = function () {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    var ctx = this.ctx, w = this.w, h = this.h;
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(this.wave);
      this.analyser.getByteFrequencyData(this.spectrum);
    } else {
      this.wave.fill(128);
      this.spectrum.fill(0);
    }
    // Energia general y de graves: el logo y los aros laten con ella
    var e = 0, i;
    for (i = 0; i < this.spectrum.length; i++) e += this.spectrum[i];
    e = e / this.spectrum.length / 255;
    var b = 0, nb = Math.max(4, Math.floor(this.spectrum.length / 24));
    for (i = 0; i < nb; i++) b += this.spectrum[i];
    b = b / nb / 255;
    this.energy += (e - this.energy) * 0.25;
    this.bass += (b - this.bass) * 0.55;
    this.hue = (this.hue + 0.5 + e * 4) % 360;
    this.clock += 0.016;
    var ambient = Math.max(0, Math.min(1, 1 - e * 25));

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = this.level;
    this.spectrumBars(w, h);
    this.line(w, h, 0, 1, this.hue, 3 + e * 16);
    this.line(w, h, 0, -1, this.hue + 120, 2 + e * 8);
    this.line(w, h, h * 0.25, 0.5, this.hue + 240, 2);
    if (ambient > 0.02) this.ambient(w, h, ambient);
    ctx.globalAlpha = 1;
  };
  VJ.prototype.line = function (w, h, offsetY, scale, hue, lineWidth) {
    var ctx = this.ctx, wave = this.wave, step = w / (wave.length - 1);
    ctx.beginPath();
    for (var i = 0; i < wave.length; i++) {
      var v = (wave[i] - 128) / 128, x = i * step, y = h / 2 + offsetY + v * h * 0.4 * scale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = 'hsl(' + (hue % 360) + ', 100%, 60%)';
    ctx.shadowBlur = 20;
    ctx.shadowColor = ctx.strokeStyle;
    var a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.85;
    ctx.stroke();
    ctx.globalAlpha = a;
    ctx.shadowBlur = 0;
  };
  VJ.prototype.spectrumBars = function (w, h) {
    var ctx = this.ctx, bars = 64, bw = w / bars, per = Math.floor(this.spectrum.length / 4 / bars) || 1;
    for (var i = 0; i < bars; i++) {
      var sum = 0;
      for (var j = 0; j < per; j++) sum += this.spectrum[i * per + j];
      var bh = (sum / per / 255) * h * 0.5;
      ctx.fillStyle = 'hsla(' + ((this.hue + i * 4) % 360) + ', 100%, 50%, 0.22)';
      ctx.fillRect(i * bw, h - bh, bw - 2, bh);
      ctx.fillRect(i * bw, 0, bw - 2, bh);
    }
  };
  // Olas que respiran solas cuando no hay sonido
  VJ.prototype.ambient = function (w, h, amount) {
    var ctx = this.ctx, t = this.clock, bars = 48, bw = w / bars, i, layer;
    for (i = 0; i < bars; i++) {
      var bh = (0.35 + 0.35 * Math.sin(t * 0.9 + i * 0.35) * Math.sin(t * 0.37 + i * 0.11)) * h * 0.22 * amount;
      ctx.fillStyle = 'hsla(' + ((this.hue + i * 5) % 360) + ', 90%, 55%, ' + (0.1 * amount) + ')';
      ctx.fillRect(i * bw, h - bh, bw - 2, bh);
      ctx.fillRect(i * bw, 0, bw - 2, bh);
    }
    for (layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      var hue = this.hue + layer * 110, breathe = 0.55 + 0.45 * Math.sin(t * 0.5 + layer * 2);
      for (var x = 0; x <= w; x += 8) {
        var nx = x / w;
        var y = h / 2 + (layer - 1) * h * 0.12 + h * 0.11 * amount * breathe * (
          Math.sin(nx * 7 + t * (0.8 + layer * 0.3) + layer) * 0.6 + Math.sin(nx * 17 - t * 1.3 + layer * 3) * 0.25 + Math.sin(nx * 3 + t * 0.4) * 0.4);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 3 - layer * 0.6;
      ctx.strokeStyle = 'hsla(' + (hue % 360) + ', 100%, 62%, ' + (0.75 * amount) + ')';
      ctx.shadowBlur = 18;
      ctx.shadowColor = 'hsl(' + (hue % 360) + ', 100%, 60%)';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  };

  var vj = new VJ($('#vj'));
  vj.start();

  /* =====================================================================
     Audio de la intro: la musica de un proyecto real (renderizado con el propio Syntotec)
     ===================================================================== */
  var player = {
    ctx: null, buffer: null, source: null, gain: null, analyser: null, startedAt: 0, loading: null, playing: false, onEnd: null,
    // Descarga el archivo antes de que haga falta (el audio solo puede sonar tras un gesto del usuario)
    preload: function () {
      if (this.loading) return this.loading;
      this.loading = fetch(INTRO_AUDIO).then(function (r) {
        if (!r.ok) throw new Error('sin audio');
        return r.arrayBuffer();
      });
      this.loading.catch(function () {});
      return this.loading;
    },
    ensure: function () {
      if (this.ctx) return Promise.resolve(this.buffer);
      var self = this, AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return Promise.reject(new Error('sin WebAudio'));
      this.ctx = new AC();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.55;
      this.gain = this.ctx.createGain();
      this.gain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      return this.preload().then(function (data) {
        // decodeAudioData consume el buffer: se le pasa una copia para poder volver a decodificar
        return new Promise(function (res, rej) { self.ctx.decodeAudioData(data.slice(0), res, rej); });
      }).then(function (buf) { self.buffer = buf; return buf; });
    },
    play: function (loop) {
      var self = this;
      return this.ensure().then(function (buf) {
        if (self.ctx.state === 'suspended') self.ctx.resume();
        self.stopSource();
        var src = self.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = !!loop;
        src.connect(self.gain);
        self.gain.gain.cancelScheduledValues(self.ctx.currentTime);
        self.gain.gain.setValueAtTime(0.0001, self.ctx.currentTime);
        self.gain.gain.exponentialRampToValueAtTime(0.9, self.ctx.currentTime + 0.4);
        src.onended = function () { if (self.source === src) { self.playing = false; if (self.onEnd) self.onEnd(); } };
        src.start();
        self.source = src;
        self.startedAt = self.ctx.currentTime;
        self.playing = true;
        vj.setAnalyser(self.analyser);
        return buf;
      });
    },
    fadeOut: function (seconds) {
      if (!this.ctx || !this.playing) return;
      var t = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(Math.max(this.gain.gain.value, 0.0001), t);
      this.gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      var src = this.source, self = this;
      setTimeout(function () { if (self.source === src) self.stopSource(); }, seconds * 1000 + 80);
    },
    stopSource: function () {
      if (this.source) {
        var s = this.source;
        this.source = null;
        s.onended = null;
        try { s.stop(); } catch (e) {}
      }
      this.playing = false;
    },
    get position() { return this.playing && this.buffer ? ((this.ctx.currentTime - this.startedAt) % this.buffer.duration) / this.buffer.duration : 0; }
  };

  /* =====================================================================
     Logo grande: la onda del logo se dibuja con el sonido real
     ===================================================================== */
  var logoWave = $('#logo-wave');
  var stage = $('.logo-stage');
  var LOGO_POINTS = 28;
  function updateLogo() {
    if (!logoWave) return;
    if (player.playing && player.analyser) {
      var data = vj.wave, n = LOGO_POINTS, d = '';
      for (var i = 0; i < n; i++) {
        var idx = Math.floor(i / (n - 1) * (data.length - 1));
        var v = (data[idx] - 128) / 128;
        var x = 4 + (i / (n - 1)) * 24;
        // Con volumen bajo la onda conserva su forma original para que el logo siga siendo el logo
        var base = Math.sin(i / (n - 1) * Math.PI * 4) * 4.2;
        var y = 17 - (base * 0.35 + v * 9.5);
        d += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + Math.max(5, Math.min(28, y)).toFixed(2);
      }
      logoWave.setAttribute('d', d);
      logoWave.classList.add('live');
    }
    // El latido sigue las variaciones de los graves respecto de su promedio y su pico recientes: con un tema de graves
    // sostenidos el logo igual late con cada golpe (y no queda fijo al maximo)
    vj.bassAvg = (vj.bassAvg == null ? vj.bass : vj.bassAvg + (vj.bass - vj.bassAvg) * 0.04);
    vj.bassPeak = Math.max(vj.bass, vj.bassAvg + ((vj.bassPeak == null ? vj.bass : vj.bassPeak) - vj.bassAvg) * 0.99);
    var swing = vj.bassPeak - vj.bassAvg;
    var pulse = swing < 0.01 ? 0 : Math.max(0, Math.min(1, 0.3 + 0.7 * (vj.bass - vj.bassAvg) / swing));
    document.documentElement.style.setProperty('--pulse', pulse.toFixed(3));
  }
  (function loop() {
    if (!document.hidden) updateLogo();
    requestAnimationFrame(loop);
  })();

  /* =====================================================================
     Intro. Sin botones: arranca sola (la decision de mostrarla se toma en el <head>, antes del primer dibujo).
     - Suena la musica si el navegador lo permite; si no, el primer toque o tecla la desbloquea.
     - Termina cuando se acaba la musica, o con cualquier interaccion pasados INTRO_MIN_S segundos.
     - Sin sonido (bloqueado y sin interaccion) se cierra sola a los INTRO_SILENT_S segundos.
     ===================================================================== */
  var INTRO_MIN_S = 3;
  var INTRO_SILENT_S = 7;
  var root = document.documentElement;
  var intro = $('#intro');
  var introBar = $('#intro-bar');
  var introNow = $('#intro-now');
  var musicBtn = $('#music-toggle');
  var introOpen = false;

  function markSeen() {
    try { sessionStorage.setItem(INTRO_SEEN, '1'); } catch (e) {}
  }
  function setMusicButton(on) {
    if (!musicBtn) return;
    musicBtn.classList.toggle('on', on);
    musicBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    musicBtn.setAttribute('aria-label', on ? 'Pausar la música' : 'Escuchar la música de la intro');
  }
  function audible() {
    return !!(player.ctx && player.ctx.state === 'running' && player.playing);
  }

  function closeIntro(fade) {
    if (!introOpen) return;
    introOpen = false;
    markSeen();
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (t) { window.removeEventListener(t, onInteract, true); });
    if (player.playing) player.fadeOut(fade || 1.6);
    vj.level = 0.4;
    // El contenido aparece (y la barra baja) mientras la intro se desvanece
    root.classList.add('intro-done');
    $$('main, .footer, .nav').forEach(function (n) { n.removeAttribute('inert'); });
    intro.classList.add('leaving');
    setTimeout(function () { intro.classList.add('gone'); }, 1300);
    setMusicButton(false);
  }

  var startedAt = 0;
  // Cualquier interaccion: antes de INTRO_MIN_S solo sirve para desbloquear el audio; despues, cierra la intro
  function onInteract(e) {
    if (e.type === 'keydown' && e.key === 'Escape') { closeIntro(1); return; }
    if (player.ctx && player.ctx.state === 'suspended') player.ctx.resume();
    if ((performance.now() - startedAt) / 1000 >= INTRO_MIN_S) closeIntro(1.6);
  }

  function startIntro() {
    introOpen = true;
    startedAt = performance.now();
    vj.level = 1;
    $$('main, .footer, .nav').forEach(function (n) { n.setAttribute('inert', ''); });
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (t) { window.addEventListener(t, onInteract, { capture: true, passive: true }); });
    player.onEnd = function () { closeIntro(0.5); };
    player.preload();

    var hintState = '';
    function hint(state, html) {
      if (state === hintState) return;
      hintState = state;
      introNow.classList.remove('show');
      setTimeout(function () {
        if (!introOpen) return;
        introNow.textContent = '';
        html.forEach(function (n) { introNow.appendChild(n); });
        introNow.classList.add('show');
      }, state === 'first' ? 0 : 350);
    }
    function nodes() {
      var out = [], i;
      for (i = 0; i < arguments.length; i++) out.push(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]);
      return out;
    }

    // Intenta sonar sola; si el navegador lo bloquea, el audio queda esperando el primer gesto del usuario
    player.play(false).then(function () {
      player.ctx.onstatechange = function () { setMusicButton(audible()); };
    }).catch(function () { /* sin audio: la intro sigue siendo visual */ });

    (function tick() {
      if (!introOpen) return;
      var t = (performance.now() - startedAt) / 1000;
      if (audible()) {
        introBar.parentNode.classList.add('on');
        introBar.style.width = (player.position * 100).toFixed(1) + '%';
        intro.classList.add('playing');
        setMusicButton(true);
        hint('playing' + (t >= INTRO_MIN_S ? '-skip' : ''), t >= INTRO_MIN_S
          ? nodes('Suena ', el('b', '', 'Funkito D'), ' · tocá o apretá una tecla para entrar')
          : nodes('Suena ', el('b', '', 'Funkito D'), ', un proyecto hecho en Syntotec'));
      } else if (t > 1.2) {
        hint('locked', nodes('Tocá la pantalla o apretá una tecla para escuchar'));
      }
      // Sin sonido no tiene sentido alargarla: unos segundos y entra sola
      if (!audible() && t >= INTRO_SILENT_S) { closeIntro(0.8); return; }
      // Red de seguridad: si el audio nunca terminara, no se queda para siempre
      if (player.buffer && t > player.buffer.duration + 3) { closeIntro(0.5); return; }
      requestAnimationFrame(tick);
    })();
  }

  if (!root.classList.contains('no-intro')) {
    startIntro();
  } else {
    vj.level = 0.4;
  }

  // Boton de la barra: vuelve a tocar la musica del proyecto (con el arte detras del contenido)
  if (musicBtn) {
    musicBtn.addEventListener('click', function () {
      if (player.playing) {
        player.fadeOut(0.6);
        setMusicButton(false);
        return;
      }
      player.onEnd = function () { setMusicButton(false); };
      player.play(false).then(function () { setMusicButton(true); vj.level = 0.8; }).catch(function () {});
    });
  }

  /* =====================================================================
     Barra de navegacion, revelado, contadores, inclinacion del hero
     ===================================================================== */
  var nav = $('#nav');
  function onScroll() { nav.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var reveals = $$('.reveal');
  reveals.forEach(function (n, i) { n.style.setProperty('--d', ((i % 3) * 0.08) + 's'); });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (n) { io.observe(n); });
  } else {
    reveals.forEach(function (n) { n.classList.add('in'); });
  }

  // Los numeros suben hasta su valor la primera vez que se ven
  $$('[data-count]').forEach(function (n) {
    var target = parseInt(n.getAttribute('data-count'), 10), suffix = n.getAttribute('data-suffix') || '';
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    n.textContent = '0' + suffix;
    new IntersectionObserver(function (es, ob) {
      if (!es[0].isIntersecting) return;
      ob.disconnect();
      var t0 = performance.now();
      (function step(t) {
        var k = Math.min(1, (t - t0) / 1100), ease = 1 - Math.pow(1 - k, 3);
        n.textContent = Math.round(target * ease) + suffix;
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    }, { threshold: 0.6 }).observe(n);
  });

  // El hero se inclina con el mouse
  var tilt = $('#tilt'), shot = $('.shot-main');
  if (tilt && shot && !reduceMotion && window.matchMedia('(hover: hover) and (min-width: 1001px)').matches) {
    tilt.addEventListener('pointermove', function (e) {
      var r = tilt.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      shot.style.transform = 'rotateY(' + (-7 + x * 8).toFixed(2) + 'deg) rotateX(' + (3 - y * 7).toFixed(2) + 'deg)';
    });
    tilt.addEventListener('pointerleave', function () { shot.style.transform = ''; });
  }

  // El brillo de las tarjetas sigue al puntero
  $$('.card, .project').forEach(function (c) {
    c.addEventListener('pointermove', function (e) {
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* =====================================================================
     Pestañas de "Como funciona"
     ===================================================================== */
  var howImg = $('#how-img');
  $$('.how-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('.how-tab').forEach(function (t) { t.classList.toggle('on', t === tab); t.setAttribute('aria-selected', t === tab ? 'true' : 'false'); });
      howImg.classList.add('fade');
      var src = tab.getAttribute('data-img'), alt = tab.getAttribute('data-alt');
      var next = new Image();
      next.onload = next.onerror = function () {
        howImg.src = src;
        howImg.alt = alt;
        howImg.classList.remove('fade');
      };
      next.src = src;
    });
  });

  /* =====================================================================
     Piano de prueba (WebAudio, sin muestras)
     ===================================================================== */
  (function piano() {
    var host = $('#piano');
    if (!host) return;
    var KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'];
    var WHITE = [60, 62, 64, 65, 67, 69, 71, 72];
    var BLACK = [{ midi: 61, at: 1 }, { midi: 63, at: 2 }, { midi: 66, at: 4 }, { midi: 68, at: 5 }, { midi: 70, at: 6 }];
    var ctx = null, active = {};

    function audio() {
      if (!ctx) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function on(midi, btn) {
      var c = audio();
      if (!c || active[midi]) return;
      var f = 440 * Math.pow(2, (midi - 69) / 12), t = c.currentTime;
      var out = c.createGain(), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 2.5;
      lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.7);
      out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.28, t + 0.012);
      out.gain.exponentialRampToValueAtTime(0.12, t + 0.35);
      var oscs = [-9, 0, 9].map(function (cents) {
        var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents;
        o.connect(lp); o.start(t); return o;
      });
      lp.connect(out); out.connect(c.destination);
      active[midi] = { out: out, oscs: oscs, btn: btn };
      btn.classList.add('on');
    }
    function off(midi) {
      var a = active[midi], c = ctx;
      if (!a) return;
      delete active[midi];
      var t = c.currentTime;
      a.out.gain.cancelScheduledValues(t);
      a.out.gain.setValueAtTime(Math.max(a.out.gain.value, 0.0001), t);
      a.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      a.oscs.forEach(function (o) { o.stop(t + 0.3); });
      a.btn.classList.remove('on');
    }
    var buttons = {};
    WHITE.forEach(function (midi, i) {
      var b = el('button', 'key');
      b.type = 'button';
      b.setAttribute('aria-label', 'Nota ' + ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do'][i]);
      buttons[midi] = b; host.appendChild(b);
    });
    BLACK.forEach(function (k) {
      var b = el('button', 'black');
      b.type = 'button'; b.setAttribute('aria-label', 'Nota sostenida ' + k.midi);
      b.style.left = (k.at / WHITE.length * 100) + '%';
      buttons[k.midi] = b; host.appendChild(b);
    });
    Object.keys(buttons).forEach(function (m) {
      var midi = +m, b = buttons[m];
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); b.setPointerCapture(e.pointerId); on(midi, b); });
      b.addEventListener('pointerup', function () { off(midi); });
      b.addEventListener('pointercancel', function () { off(midi); });
    });
    var held = {};
    document.addEventListener('keydown', function (e) {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || introOpen) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      var i = KEYS.indexOf(e.key.toLowerCase());
      if (i < 0 || held[e.key]) return;
      held[e.key] = true;
      on(WHITE[i], buttons[WHITE[i]]);
    });
    document.addEventListener('keyup', function (e) {
      var i = KEYS.indexOf(e.key.toLowerCase());
      if (i < 0) return;
      delete held[e.key];
      off(WHITE[i]);
    });
  })();

  /* =====================================================================
     Proyectos: tarjetas con miniatura de piano roll
     ===================================================================== */
  var TRACK_COLORS = ['#ff4f87', '#5cc8ff', '#5fe08a', '#ffc857'];

  function drawThumb(canvas, preview) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || 400, h = canvas.clientHeight || 175;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    var L = preview && preview.loopBeats > 0 ? preview.loopBeats : 8;
    // Compases como lineas verticales
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    var bars = Math.min(32, Math.max(1, Math.round(L / 4)));
    for (var b = 1; b < bars; b++) { var gx = Math.round(b / bars * w) + 0.5; ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
    var tracks = (preview && preview.tracks) || [];
    var rows = Math.max(1, tracks.length), rowH = (h - 16) / rows;
    tracks.forEach(function (t, ti) {
      var color = TRACK_COLORS[ti % TRACK_COLORS.length];
      var lo = 127, hi = 0;
      t.notes.forEach(function (n) { lo = Math.min(lo, n[2]); hi = Math.max(hi, n[2]); });
      var span = Math.max(11, hi - lo), top = 8 + ti * rowH;
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 6;
      t.notes.forEach(function (n) {
        var x = n[0] / L * w, nw = Math.max(2.5, n[1] / L * w - 1);
        var y = top + rowH - 4 - (t.drums ? ((n[2] % 12) / 12) * (rowH - 8) : ((n[2] - lo) / span) * (rowH - 8));
        ctx.globalAlpha = 0.92;
        ctx.fillRect(x, y, t.drums ? Math.min(nw, 6) : nw, Math.max(2, Math.min(5, rowH / 8)));
      });
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    });
  }

  function fmtDuration(s) {
    s = Math.round(s);
    return s >= 60 ? Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) + ' min' : s + ' s';
  }
  function fmtDate(ms) {
    try { return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; }
  }

  function projectCard(item, opts) {
    item.name = item.name || item.title || 'Sin nombre';
    var card = el('article', 'project reveal in');
    var thumb = el('div', 'thumb');
    var canvas = el('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Miniatura de las notas de ' + item.name);
    thumb.appendChild(canvas);
    if (opts.badge) thumb.appendChild(el('span', 'badge', opts.badge));
    card.appendChild(thumb);

    var body = el('div', 'body');
    body.appendChild(el('h3', '', item.name));
    var by = (item.author ? 'por ' + item.author : 'Anónimo') + (opts.date ? ' · ' + fmtDate(opts.date) : '');
    body.appendChild(el('div', 'by', by));
    if (item.description) body.appendChild(el('p', 'desc', item.description));
    var s = item.stats || {};
    var chips = el('ul', 'chips');
    [s.bpm && Math.round(s.bpm) + ' BPM', s.bars && s.bars + (s.bars === 1 ? ' compás' : ' compases'), s.seconds && fmtDuration(s.seconds),
      s.tracks && s.tracks + (s.tracks === 1 ? ' pista' : ' pistas'), s.notes && s.notes + ' notas']
      .concat((s.instruments || []).slice(0, 3))
      .filter(Boolean).forEach(function (t) { chips.appendChild(el('li', '', String(t))); });
    body.appendChild(chips);
    card.appendChild(body);

    var actions = el('div', 'actions');
    var open = el('a', 'btn btn-primary btn-sm', 'Abrir en Syntotec');
    open.href = opts.href;
    actions.appendChild(open);
    if (opts.audio) {
      var play = el('button', 'play');
      play.type = 'button';
      play.textContent = '▶ Escuchar';
      play.addEventListener('click', function () {
        if (player.playing) { player.fadeOut(0.4); play.classList.remove('on'); play.textContent = '▶ Escuchar'; return; }
        play.textContent = '■ Detener'; play.classList.add('on');
        player.onEnd = function () { play.classList.remove('on'); play.textContent = '▶ Escuchar'; setMusicButton(false); };
        player.play(false).then(function () { vj.level = 0.8; setMusicButton(true); }).catch(function () { play.textContent = '▶ Escuchar'; play.classList.remove('on'); });
      });
      actions.appendChild(play);
    }
    card.appendChild(actions);

    // La miniatura se dibuja cuando ya tiene tamaño (y se redibuja si cambia)
    requestAnimationFrame(function () { drawThumb(canvas, item.preview); });
    if (window.ResizeObserver) {
      var last = 0;
      new ResizeObserver(function () {
        var w = canvas.clientWidth;
        if (Math.abs(w - last) > 8) { last = w; drawThumb(canvas, item.preview); }
      }).observe(thumb);
    }
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px'); card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
    return card;
  }

  function fetchJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      var type = r.headers.get('content-type') || '';
      if (!r.ok || type.indexOf('json') < 0) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // --- Nuestros proyectos (ejemplos incluidos en el sitio: no dependen del backend) ---
  var featured = $('#featured');
  fetchJSON('/demos/index.json').then(function (data) {
    featured.textContent = '';
    (data.items || []).forEach(function (d) {
      featured.appendChild(projectCard(d, { badge: 'Destacado', href: '/app/#demo=' + encodeURIComponent(d.slug), audio: !!d.audio }));
    });
    // Invitacion a sumar el propio proyecto
    var cta = el('div', 'cta-card reveal in');
    cta.appendChild(el('h3', '', 'Tu proyecto puede estar acá'));
    cta.appendChild(el('p', '', 'Armá un tema, guardalo y publicalo desde el menú Proyecto con el botón del globo. Aparece en la galería para que cualquiera lo abra y lo escuche.'));
    var go = el('a', 'btn btn-primary', 'Abrir Syntotec');
    go.href = '/app/';
    cta.appendChild(go);
    featured.appendChild(cta);
  }).catch(function () {
    featured.textContent = '';
    featured.appendChild(el('div', 'empty', 'No se pudieron cargar los proyectos de ejemplo.'));
  });

  // --- Ultimos proyectos publicos (backend; si no esta, la seccion lo cuenta sin romper nada) ---
  var gallery = $('#projects'), note = $('#gallery-note');
  fetchJSON('/api/public?limit=9').then(function (data) {
    gallery.textContent = '';
    gallery.setAttribute('aria-busy', 'false');
    var items = data.items || [];
    // nginx contesta { backend: false } cuando el servidor no esta
    if (data.backend === false) throw new Error('sin backend');
    if (!items.length) {
      var empty = el('div', 'empty');
      empty.appendChild(el('b', '', 'Todavía no hay proyectos públicos. '));
      empty.appendChild(document.createTextNode('Guardá uno desde la app y publicalo con el botón del globo: va a aparecer acá.'));
      gallery.appendChild(empty);
      return;
    }
    items.forEach(function (it) {
      gallery.appendChild(projectCard(it, { href: '/app/#p=' + encodeURIComponent(it.pid), date: it.publishedAt, badge: it.featured ? 'Destacado' : '' }));
    });
    if (data.total > items.length) {
      note.hidden = false;
      note.textContent = 'Mostrando los ' + items.length + ' más recientes de ' + data.total + ' proyectos públicos.';
    }
  }).catch(function () {
    gallery.textContent = '';
    gallery.setAttribute('aria-busy', 'false');
    gallery.appendChild(el('div', 'empty', 'La galería no está disponible en este momento. Abrí la app y probá de nuevo más tarde.'));
  });
})();
