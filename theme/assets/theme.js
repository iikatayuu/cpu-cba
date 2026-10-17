/* CPU CBA theme scripts: splash, header, drawer, search, tabs, trivia, slider, filters, reveal */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  var storage = {
    get: function (k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------- Splash intro (once per session) ---------- */
  function initSplash() {
    var splash = $('[data-splash]');
    if (!splash) return;
    var isOverlay = splash.hasAttribute('data-splash-overlay');
    if (isOverlay) {
      var designMode = window.Shopify && window.Shopify.designMode;
      if (storage.get('cba-splash-seen') && !designMode) { splash.remove(); return; }
      splash.hidden = false;
      document.body.classList.add('is-locked');
      var enter = $('[data-splash-enter]', splash);
      if (enter) enter.focus({ preventScroll: true });
    }
    function close() {
      storage.set('cba-splash-seen', '1');
      if (!isOverlay) return;
      splash.classList.add('is-leaving');
      document.body.classList.remove('is-locked');
      var v = $('video', splash); if (v) v.pause();
      setTimeout(function () { splash.remove(); }, 700);
      document.removeEventListener('keydown', onKey);
      var main = $('#MainContent'); if (main) main.focus({ preventScroll: true });
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    $$('[data-splash-enter]', splash).forEach(function (b) { b.addEventListener('click', function (e) { if (b.tagName === 'BUTTON') e.preventDefault(); close(); }); });
    $$('[data-splash-link]', splash).forEach(function (a) { a.addEventListener('click', function () { storage.set('cba-splash-seen', '1'); }); });
  }

  /* ---------- Sticky header shadow ---------- */
  function initHeader() {
    var header = $('[data-header]');
    if (!header) return;
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Generic modal (drawer + search) ---------- */
  function trapFocus(container, e) {
    var f = $$('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', container).filter(function (el) { return el.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function initModal(name, onOpen) {
    var modal = $('[data-modal="' + name + '"]');
    if (!modal) return;
    var opener = null;
    function open(trigger) {
      opener = trigger;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('is-locked');
      $$('[data-open="' + name + '"]').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
      if (onOpen) onOpen(modal);
      document.addEventListener('keydown', onKey);
    }
    function close() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('is-locked');
      $$('[data-open="' + name + '"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
      document.removeEventListener('keydown', onKey);
      if (opener) opener.focus();
    }
    function onKey(e) { if (e.key === 'Escape') close(); if (e.key === 'Tab') trapFocus(modal, e); }
    $$('[data-open="' + name + '"]').forEach(function (b) { b.addEventListener('click', function () { open(b); }); });
    $$('[data-close]', modal).forEach(function (b) { b.addEventListener('click', close); });
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  }

  /* ---------- Predictive search ---------- */
  function initPredictiveSearch(modal) {
    var input = $('input[type="search"]', modal);
    var results = $('[data-predictive]', modal);
    if (!input || !results || input.dataset.bound) { if (input) input.focus(); return; }
    input.dataset.bound = '1';
    input.focus();
    var url = modal.getAttribute('data-predictive-url') || '/search/suggest.json';
    var timer, controller;
    function esc(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function strip(html) { var d = document.createElement('div'); d.innerHTML = html || ''; return (d.textContent || '').trim().slice(0, 110); }
    function group(title, items, map) {
      if (!items || !items.length) return '';
      return '<div class="predictive__group"><h3>' + esc(title) + '</h3>' + items.map(map).join('') + '</div>';
    }
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 2) { results.innerHTML = ''; return; }
      timer = setTimeout(function () {
        if (controller) controller.abort();
        controller = 'AbortController' in window ? new AbortController() : null;
        var params = 'q=' + encodeURIComponent(q) + '&resources[type]=product,page,article&resources[limit]=5&resources[options][fields]=title,product_type,variants.title,vendor,body,tag';
        fetch(url + '?' + params, controller ? { signal: controller.signal } : {})
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var r = (data && data.resources && data.resources.results) || {};
            var html = group('Programs', r.products, function (p) { return '<a class="predictive__item" href="' + esc(p.url) + '"><strong>' + esc(p.title) + '</strong><span>' + esc(strip(p.body)) + '</span></a>'; }) +
              group('Pages', r.pages, function (p) { return '<a class="predictive__item" href="' + esc(p.url) + '"><strong>' + esc(p.title) + '</strong><span>' + esc(strip(p.body)) + '</span></a>'; }) +
              group('Stories', r.articles, function (a) { return '<a class="predictive__item" href="' + esc(a.url) + '"><strong>' + esc(a.title) + '</strong><span>' + esc(strip(a.summary_html || a.body)) + '</span></a>'; });
            results.innerHTML = html || '<p class="predictive__item">No quick matches. Press Enter to see all results.</p>';
          })
          .catch(function () { /* aborted or offline */ });
      }, 220);
    });
  }

  /* ---------- Tabs (WAI-ARIA) ---------- */
  function initTabs(root) {
    $$('[role="tablist"]', root).forEach(function (list) {
      if (list.dataset.bound) return;
      list.dataset.bound = '1';
      var tabs = $$('[role="tab"]', list).filter(function (t) { return t.parentElement === list; });
      function select(tab, focus) {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          t.tabIndex = on ? 0 : -1;
          var panel = document.getElementById(t.getAttribute('aria-controls'));
          if (panel) panel.hidden = !on;
        });
        if (focus) tab.focus();
      }
      tabs.forEach(function (t, i) {
        t.addEventListener('click', function () { select(t); });
        t.addEventListener('keydown', function (e) {
          var n = null;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = tabs[(i + 1) % tabs.length];
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = tabs[(i - 1 + tabs.length) % tabs.length];
          if (e.key === 'Home') n = tabs[0];
          if (e.key === 'End') n = tabs[tabs.length - 1];
          if (n) { e.preventDefault(); select(n, true); }
        });
      });
      var initial = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
      if (initial) select(initial);
    });
  }

  /* ---------- Random trivia ---------- */
  function initTrivia() {
    $$('[data-trivia]').forEach(function (el) {
      var data;
      try { data = JSON.parse($('script[type="application/json"]', el).textContent); } catch (e) { return; }
      if (!data || !data.length) return;
      var factEl = $('[data-trivia-fact]', el), srcEl = $('[data-trivia-source]', el), btn = $('[data-trivia-next]', el);
      var order = data.map(function (_, i) { return i; });
      for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
      var pos = 0;
      function show(animate) {
        var item = data[order[pos]];
        var apply = function () {
          factEl.textContent = item.fact;
          if (srcEl) srcEl.textContent = item.source ? 'Source: ' + item.source : '';
          factEl.classList.remove('is-swapping');
        };
        if (animate) { factEl.classList.add('is-swapping'); setTimeout(apply, 220); } else apply();
      }
      show(false);
      if (btn) {
        if (data.length < 2) btn.hidden = true;
        btn.addEventListener('click', function () { pos = (pos + 1) % order.length; show(true); });
      }
    });
  }

  /* ---------- Slider arrows ---------- */
  function initSliders() {
    $$('[data-slider]').forEach(function (s) {
      var track = $('.slider__track', s);
      if (!track) return;
      var step = function () { var c = track.firstElementChild; return c ? c.getBoundingClientRect().width + 24 : track.clientWidth; };
      var prev = $('[data-slider-prev]', s), next = $('[data-slider-next]', s);
      if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
      if (next) next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });
    });
  }

  /* ---------- Filter chips ---------- */
  function initFilters() {
    $$('[data-filter-group]').forEach(function (group) {
      var scope = document.getElementById(group.getAttribute('data-filter-group')) || document;
      var chips = $$('[data-filter]', group);
      var counter = $('[data-filter-count]', scope);
      chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          var value = chip.getAttribute('data-filter');
          chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
          var shown = 0;
          $$('[data-filter-item]', scope).forEach(function (item) {
            var tags = (item.getAttribute('data-filter-item') || '').split(' ');
            var match = value === 'all' || tags.indexOf(value) !== -1;
            item.hidden = !match;
            if (match) shown++;
          });
          if (counter) counter.textContent = shown;
        });
      });
    });
  }

  /* ---------- Scroll spy for in-page nav ---------- */
  function initScrollSpy() {
    $$('[data-scrollspy]').forEach(function (nav) {
      var links = $$('a[href^="#"]', nav);
      var targets = links.map(function (a) { return document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); });
      if (!('IntersectionObserver' in window)) return;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var idx = targets.indexOf(en.target);
          links.forEach(function (l, i) { l.classList.toggle('is-active', i === idx); });
        });
      }, { rootMargin: '-30% 0px -60% 0px' });
      targets.forEach(function (t) { if (t) io.observe(t); });
    });
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    document.documentElement.classList.add('js-reveal');
    var items = $$('.reveal');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Pause background videos when off-screen or reduced motion ---------- */
  function initVideos() {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $$('video[data-autoplay]').forEach(function (v) {
      v.muted = true;
      if (reduce) { v.removeAttribute('autoplay'); v.pause(); return; }
      if (!('IntersectionObserver' in window)) return;
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause(); });
      }).observe(v);
    });
  }

  function init() {
    initSplash();
    initHeader();
    initModal('drawer');
    initModal('search', initPredictiveSearch);
    initTabs(document);
    initTrivia();
    initSliders();
    initFilters();
    initScrollSpy();
    initReveal();
    initVideos();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  /* Re-init inside the theme editor when sections reload */
  document.addEventListener('shopify:section:load', function (e) { initTabs(e.target); initTrivia(); initSliders(); initFilters(); initReveal(); initVideos(); });
})();
