/* 範例頁共用腳本：圖示、主題切換、手寫畫布示範、筆順動畫、簡單互動 */
(function () {
  // ---------- 主題：?theme=dark / ?theme=light ----------
  const theme = new URLSearchParams(location.search).get('theme');
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;

  // ---------- 圖示 sprite ----------
  const icons = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
    book: '<path d="M2 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H2z"/><path d="M22 4h-7a3 3 0 0 0-3 3v14a2 2 0 0 1 2-2h8z"/>',
    chart: '<path d="M4 20V11"/><path d="M10 20V5"/><path d="M16 20v-8"/><path d="M21 20H3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    'chev-r': '<path d="m9 6 6 6-6 6"/>',
    'chev-l': '<path d="m15 6-6 6 6 6"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    flag: '<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    cloud: '<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 12 3.5 3.5 0 0 0 6 19z"/>',
    'cloud-check': '<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 12 3.5 3.5 0 0 0 6 19z"/><path d="m9 14 2 2 4-4"/>',
    train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l-2-4M15 21l2-4"/><path d="M9 14h.01M15 14h.01"/>',
    pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
    bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
    skip: '<path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-1.5 2-2 3.5-2 5-1.5-1-2.5-2.5-3-4C8 9 5 11 5 15a7 7 0 0 0 7 7z"/>',
    bug: '<rect x="8" y="6" width="8" height="14" rx="4"/><path d="M12 20v-9M8 13H4M20 13h-4M8 17H5M19 17h-3M9 7 7 4M15 7l2-3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M7 10H5v11h14V10h-2"/>',
    'plus-sq': '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'
  };
  const sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">' +
    Object.entries(icons).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('') + '</svg>';
  document.body.insertAdjacentHTML('afterbegin', sprite);

  // ---------- 分段控制、標籤：切換 aria-pressed ----------
  document.querySelectorAll('.segmented').forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      const target = b.dataset.show;
      if (target) {
        document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== target; });
      }
    });
  });
  document.querySelectorAll('.chips[data-single]').forEach(group => {
    group.addEventListener('click', e => {
      const c = e.target.closest('.chip'); if (!c) return;
      group.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
    });
  });

  // ---------- 作答選項：點擊後顯示正確／錯誤 ----------
  document.querySelectorAll('.choices[data-answer]').forEach(group => {
    const answer = group.dataset.answer;
    group.addEventListener('click', e => {
      const c = e.target.closest('.choice'); if (!c || group.dataset.done) return;
      group.dataset.done = '1';
      group.querySelectorAll('.choice').forEach(x => {
        if (x.dataset.value === answer) {
          x.classList.add('is-correct');
          x.insertAdjacentHTML('beforeend', '<svg class="i sm mark"><use href="#i-check"/></svg>');
        }
      });
      if (c.dataset.value !== answer) {
        c.classList.add('is-wrong');
        c.insertAdjacentHTML('beforeend', '<svg class="i sm mark"><use href="#i-x"/></svg>');
        document.querySelectorAll('.rating .is-suggested').forEach(x => x.classList.remove('is-suggested'));
        document.querySelector('.rating .again')?.classList.add('is-suggested');
      }
      const after = document.querySelector('[data-after-answer]');
      if (after) after.hidden = false;
    });
  });

  // ---------- 顯示答案（單字卡） ----------
  document.querySelectorAll('[data-reveal]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-revealed]').forEach(el => { el.hidden = false; });
      btn.closest('[data-reveal-wrap]')?.setAttribute('hidden', '');
    });
  });

  // ---------- 手寫畫布示範（只畫墨跡，不做判定） ----------
  document.querySelectorAll('[data-writing]').forEach(box => {
    const canvas = box.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const strokes = [];
    let current = null;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }
    function ink(color) {
      return getComputedStyle(document.documentElement).getPropertyValue(color).trim();
    }
    function drawStroke(s, color) {
      if (s.points.length < 2) return;
      const w = canvas.getBoundingClientRect().width;
      ctx.strokeStyle = color; ctx.lineWidth = w * 0.045; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(s.points[0][0], s.points[0][1]);
      for (const p of s.points.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
    function redraw() {
      const r = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      strokes.forEach(s => drawStroke(s, ink(s.wrong ? '--c-shu' : '--c-ink')));
      if (current) drawStroke(current, ink('--c-ink'));
    }
    function pos(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      current = { points: [pos(e)] };
    });
    canvas.addEventListener('pointermove', e => {
      if (!current) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      evs.forEach(ev => current.points.push(pos(ev)));
      redraw();
    });
    const end = () => {
      if (!current) return;
      strokes.push(current); current = null; redraw();
      box.dispatchEvent(new CustomEvent('stroke', { detail: { count: strokes.length } }));
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    box.writing = {
      undo() { strokes.pop(); redraw(); },
      clear() { strokes.length = 0; redraw(); },
      flagLastWrong() {
        const last = strokes[strokes.length - 1]; if (!last) return false;
        last.wrong = true; redraw();
        box.classList.remove('is-wrong'); void box.offsetWidth; box.classList.add('is-wrong');
        setTimeout(() => { strokes.pop(); redraw(); }, 700);
        return true;
      }
    };
    new ResizeObserver(resize).observe(canvas);
  });

  // ---------- 筆順動畫（SVG path，以 rAF 繪製，不受減少動態設定影響） ----------
  window.playStrokeOrder = function (svg) {
    const paths = [...svg.querySelectorAll('path.s')];
    paths.forEach(p => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = len; p.style.strokeDashoffset = len; p.classList.remove('is-drawing');
    });
    let i = 0;
    function next() {
      if (i >= paths.length) return;
      const p = paths[i]; const len = p.getTotalLength(); const t0 = performance.now();
      p.classList.add('is-drawing');
      (function frame(t) {
        const k = Math.min(1, (t - t0) / 500);
        p.style.strokeDashoffset = len * (1 - k);
        if (k < 1) requestAnimationFrame(frame);
        else { p.classList.remove('is-drawing'); i++; setTimeout(next, 150); }
      })(t0);
    }
    next();
  };
  document.querySelectorAll('[data-autoplay-strokes]').forEach(svg => setTimeout(() => window.playStrokeOrder(svg), 400));
})();
