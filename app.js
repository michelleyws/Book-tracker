/* 书籍购入记录 —— 纯前端单机应用，数据存 localStorage */
(function () {
  'use strict';

  var LS_KEY = 'bookRecords.v1';
  var LS_SUBS = 'bookSubs.v1';
  var LS_FX = 'fxRates.v1';
  var GR_SITE = 'https://www.goodreads.com';
  /* 书籍类型（可下拉选，也可自己输别的） */
  var GENRES = ['Fantasy', 'Romance', 'Sci-Fi', 'Horror', 'Mystery', 'Thriller',
    'Literary Fiction', 'Historical Fiction', 'Non-fiction', 'Young Adult', 'Other'];
  var READ_STATUS = ['未阅读', '在读', '已读'];

  /* ============ 存储 ============ */
  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(records));
    } catch (e) {
      toast('保存失败：存储空间不足');
    }
  }
  var records = load();

  /* ============ 工具 ============ */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function trim(s) { return String(s == null ? '' : s).trim(); }
  function isGR(url) { return /goodreads\.com/i.test(url || ''); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* 2025/10/7 <-> 2025-10-07 */
  function toInputDate(s) {
    s = trim(s);
    var m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
  }
  function fromInputDate(v) {
    if (!v) return '';
    var m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return m ? m[1] + '/' + parseInt(m[2], 10) + '/' + parseInt(m[3], 10) : '';
  }
  function dateVal(s) {
    var m = trim(s).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    return m ? (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]) : 0;
  }
  function priceVal(s) {
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  /* ============ 币种 & 汇率 ============
     每条记录可以记原币种，合计一律折成人民币。汇率存在本地，可改、可一键联网更新。 */
  var CUR = [
    ['CNY', '¥', '人民币'], ['USD', '$', '美元'], ['GBP', '£', '英镑'],
    ['AUD', 'A$', '澳元'], ['EUR', '€', '欧元'], ['CAD', 'C$', '加元'],
    ['JPY', '¥', '日元'], ['HKD', 'HK$', '港币'], ['SGD', 'S$', '新加坡元'],
    ['NZD', 'NZ$', '新西兰元'], ['CHF', 'CHF ', '瑞士法郎']
  ];
  /* 1 单位该币种 = 多少人民币。默认值只是起始值（可在设置里改，也可联网更新） */
  var DEFAULT_FX = { CNY: 1, USD: 7.20, GBP: 9.10, AUD: 4.70, EUR: 7.80, CAD: 5.20,
    JPY: 0.047, HKD: 0.92, SGD: 5.35, NZD: 4.30, CHF: 8.10 };
  var LS_FX_AT = 'fxRatesAt.v1';
  /* 汇率更新时间：联网更新或手动保存时写一次，界面上显示出来，
     免得用户以为看到的是最新汇率。（参考了朋友那份的做法） */
  var fxAt = localStorage.getItem(LS_FX_AT) || '';
  var fx = (function () {
    var o = {};
    try { var raw = localStorage.getItem(LS_FX); if (raw) o = JSON.parse(raw) || {}; } catch (e) { o = {}; }
    CUR.forEach(function (c) { if (typeof o[c[0]] !== 'number' || !(o[c[0]] > 0)) o[c[0]] = DEFAULT_FX[c[0]]; });
    return o;
  })();
  function saveFx(at) {
    if (at) fxAt = at;
    try {
      localStorage.setItem(LS_FX, JSON.stringify(fx));
      if (fxAt) localStorage.setItem(LS_FX_AT, fxAt);
    } catch (e) {}
  }
  function curOf(r) {
    var c = trim(r && r.currency).toUpperCase();
    return c || 'CNY';
  }
  /* 1 单位该币种 = 多少人民币；没有汇率返回 null。
     注意：以前是 `fx[c] || 1` —— 缺汇率时会静默按 1:1 算进合计，金额直接算错。
     现在缺汇率的一律踢出合计，并在界面上标出来。 */
  function rateOf(cur) {
    var c = trim(cur).toUpperCase() || 'CNY';
    if (c === 'CNY') return 1;
    return (typeof fx[c] === 'number' && fx[c] > 0) ? fx[c] : null;
  }
  function curKnown(cur) { return rateOf(cur) !== null; }
  function curSymbol(c) { for (var i = 0; i < CUR.length; i++) if (CUR[i][0] === c) return CUR[i][1]; return ''; }
  function curName(c) { for (var i = 0; i < CUR.length; i++) if (CUR[i][0] === c) return CUR[i][2]; return c; }
  /* 折合人民币；没填价格返回 null */
  function cnyOf(r) {
    var n = priceVal(r && r.price);
    if (n == null) return null;
    var rt = rateOf(curOf(r));
    return rt === null ? null : n * rt;
  }
  /* 有价格但缺汇率 → 计入「缺汇率未计入」的条数 */
  function rateMissing(r) {
    return priceVal(r && r.price) != null && rateOf(curOf(r)) === null;
  }
  function money(n) { return '¥' + (+n).toFixed(2).replace(/\.00$/, ''); }

  /* Goodreads：有直链用直链，没有就按书名+作者搜索 */
  function grUrlFor(rec) {
    if (trim(rec.goodreadsUrl)) return trim(rec.goodreadsUrl);
    var q = [rec.title, rec.author].map(trim).filter(Boolean).join(' ');
    return q ? GR_SITE + '/search?q=' + encodeURIComponent(q) : GR_SITE;
  }

  /* ============ 渲染 ============ */
  var state = { q: '', filter: 'all', sort: 'date-desc', genre: '' };

  /* ============ 长按多选 / 批量删除 ============ */
  var selecting = false;      // 是否在多选模式
  var selected = {};          // id -> 1
  var lp = { timer: null, fired: false, x: 0, y: 0 };   // 长按计时

  function enterSelectMode(id) {
    selecting = true;
    selected = {};
    if (id) selected[id] = 1;
    render();
  }
  function exitSelectMode() {
    selecting = false;
    selected = {};
    render();
  }
  function selectedIds() {
    return Object.keys(selected).filter(function (k) { return selected[k]; });
  }
  function toggleSelect(id) {
    if (selected[id]) delete selected[id];
    else selected[id] = 1;
    render();
  }
  function updateSelectBar() {
    var bar = $('selectBar');
    if (selecting) document.body.classList.add('selecting');
    else document.body.classList.remove('selecting');
    if (!bar) return;
    bar.hidden = !selecting;
    if (!selecting) return;
    var n = selectedIds().length;
    if ($('selectCount')) $('selectCount').textContent = '已选 ' + n + ' 项';
    if ($('btnBatchDelete')) $('btnBatchDelete').disabled = n === 0;
  }
  function batchDelete() {
    var ids = selectedIds();
    if (!ids.length) { toast('还没勾选任何记录'); return; }
    var titles = ids.map(function (id) {
      var r = records.find(function (x) { return x.id === id; });
      return r ? trim(r.title) : '';
    }).filter(Boolean);
    var preview = titles.slice(0, 3).map(function (t) { return '《' + t + '》'; }).join('');
    var more = titles.length > 3 ? ' 等共 ' + ids.length + ' 本' : '';
    if (!confirm('删除这 ' + ids.length + ' 条记录？\n' + preview + more + '\n\n删掉之后不能撤回。')) return;
    var del = {};
    ids.forEach(function (id) { del[id] = 1; });
    records = records.filter(function (r) { return !del[r.id]; });
    save();
    selecting = false;
    selected = {};
    render();
    toast('已删除 ' + ids.length + ' 条');
  }

  function filtered() {
    var q = state.q.toLowerCase();
    var list = records.filter(function (r) {
      if (state.filter === 'yes' && r.owned !== '是') return false;
      if (state.filter === 'pending' && r.owned !== '没到手') return false;
      if (state.filter === 'no' && (r.owned === '是' || r.owned === '没到手')) return false;
      if (state.filter === 'reading' && r.readStatus !== '在读') return false;
      if (state.filter === 'read' && r.readStatus !== '已读') return false;
      if (state.genre && trim(r.genre) !== state.genre) return false;
      if (!q) return true;
      /* 所有字段都参与搜索 */
      return [r.title, r.author, r.series, r.publisher, r.source, r.sourceUrl,
        r.note, r.owned, r.binding, r.date, r.price, r.currency, r.goodreadsUrl,
        r.isbn, r.genre, r.readStatus, r.finishDate]
        .some(function (v) { return trim(v).toLowerCase().indexOf(q) !== -1; });
    });
    list.sort(function (a, b) {
      switch (state.sort) {
        case 'date-asc': return dateVal(a.date) - dateVal(b.date);
        /* 价格排序按「折合人民币」比，否则美元和人民币混在一起排没有意义 */
        case 'price-desc': return (cnyOf(b) == null ? -1 : cnyOf(b)) - (cnyOf(a) == null ? -1 : cnyOf(a));
        case 'price-asc': return (cnyOf(a) == null ? Infinity : cnyOf(a)) - (cnyOf(b) == null ? Infinity : cnyOf(b));
        case 'title': return trim(a.title).localeCompare(trim(b.title));
        case 'date-desc':
        default: return dateVal(b.date) - dateVal(a.date);
      }
    });
    return list;
  }

  function renderSummary() {
    var got = 0, pending = 0, unowned = 0, sum = 0, foreign = 0;
    records.forEach(function (r) {
      var n = cnyOf(r);
      var cur = curOf(r);
      if (cur !== 'CNY') foreign++;
      if (r.owned === '是') { got++; if (n != null) sum += n; }
      else if (r.owned === '没到手') { pending++; if (n != null) sum += n; }
      else unowned++;
    });
    /* 注意：不要把局部变量取名 money —— 会和上面那个 money() 函数同名，
       var 提升后整个函数里 money 都变成 undefined，调用直接报 not a function。 */
    var missingFx = 0;
    records.forEach(function (r) { if (rateMissing(r)) missingFx++; });
    var moneyText = sum ? money(sum) : '—';
    $('summaryCard').innerHTML =
      '<div class="sum-tile">' +
      '<div class="sum-num green">' + (got + pending) + '</div>' +
      '<div class="sum-money">' + moneyText + (foreign ? '（含 ' + foreign + ' 条外币）' : '') + '</div>' +
      (missingFx ? '<div class="sum-warn">⚠️ ' + missingFx + ' 条缺汇率，未计入合计</div>' : '') +
      (fxAt ? '<div class="sum-fxat">汇率 ' + esc(fxAt) + '</div>' : '') +
      '<div class="sum-label">已购买 · 含没到手</div></div>' +
      '<div class="sum-tile">' +
      '<div class="sum-num orange">' + pending + '</div>' +
      '<div class="sum-label">买了 · 没到手</div></div>' +
      '<div class="sum-tile">' +
      '<div class="sum-num blue">' + unowned + '</div>' +
      '<div class="sum-label">未入手 · 想买的</div></div>' +
      '<div class="sum-tile">' +
      '<div class="sum-num">' + records.length + '</div>' +
      '<div class="sum-label">全部记录</div></div>';
  }

  /* 类型下拉：预置几个常见类型 + 书库里实际出现过的 */
  function fillGenreFilter() {
    var sel = $('genreFilter');
    if (!sel) return;
    var vals = {}, out = [];
    GENRES.forEach(function (g) { if (!vals[g]) { vals[g] = 1; out.push(g); } });
    records.forEach(function (r) {
      var g = trim(r.genre);
      if (g && !vals[g]) { vals[g] = 1; out.push(g); }
    });
    var keep = state.genre;
    sel.innerHTML = '<option value="">全部类型</option>' + out.map(function (g) {
      return '<option value="' + esc(g) + '"' + (g === keep ? ' selected' : '') + '>' + esc(g) + '</option>';
    }).join('');
    sel.value = keep;
    var dl = $('genreList');
    if (dl) dl.innerHTML = out.map(function (g) { return '<option value="' + esc(g) + '">'; }).join('');
  }
  function render() {
    renderSummary();
    var list = filtered();
    var box = $('bookList');

    $('emptyState').hidden = records.length !== 0;

    box.innerHTML = list.map(function (r) {
      var tags = [];
      if (trim(r.series)) tags.push('<span class="tag series">' + esc(r.series) + '</span>');
      if (trim(r.binding)) tags.push('<span class="tag ' + (r.binding === '精装' ? 'binding-hc' : 'binding-pb') + '">' + esc(r.binding) + '</span>');
      if (trim(r.date)) tags.push('<span class="tag date">' + esc(r.date) + '</span>');
      if (trim(r.price)) {
        var pc = curOf(r), pv = priceVal(r.price), prt = rateOf(pc);
        tags.push('<span class="tag price">' + esc(curSymbol(pc) + (pv == null ? trim(r.price) : pv)) +
          (pc !== 'CNY' ? (prt === null ? ' · 缺汇率' : ' ≈' + money(pv * prt)) : '') + '</span>');
      }
      if (trim(r.source)) tags.push('<span class="tag">' + esc(r.source) + '</span>');
      if (trim(r.genre)) tags.push('<span class="tag genre">' + esc(r.genre) + '</span>');
      if (trim(r.readStatus) && r.readStatus !== '未阅读') {
        tags.push('<span class="tag read">' + esc(r.readStatus) +
          (trim(r.rating) ? ' ' + '★'.repeat(+r.rating || 0) : '') + '</span>');
      }
      return '<div class="book-card' + (selected[r.id] ? ' selected' : '') + '" data-id="' + r.id + '">' +
        (selecting ? '<span class="sel-dot' + (selected[r.id] ? ' on' : '') + '">✓</span>' : '') +
        '<span class="owned-dot ' + (r.owned === '是' ? 'yes' : r.owned === '没到手' ? 'pending' : 'no') + '"></span>' +
        (r.coverId ? '<div class="cover-box loading"><img data-cover="' + esc(r.coverId) + '" alt="" decoding="async"></div>' : '') +
        '<div class="book-main">' +
        '<div class="book-title-row"><a class="book-title" data-gr="' + r.id + '" href="' + esc(grUrlFor(r)) + '" target="_blank" rel="noopener">' + esc(r.title || '（无书名）') + '</a></div>' +
        (trim(r.author) ? '<div class="book-author">' + esc(r.author) + '</div>' : '') +
        (tags.length ? '<div class="book-meta">' + tags.join('') + '</div>' : '') +
        (trim(r.note) ? '<div class="book-note">' + esc(r.note) + '</div>' : '') +
        '</div><span class="chev">›</span></div>';
    }).join('');

    renderDueBanner();
    renderSubs();
    fillGenreFilter();
    renderReading();
    hydrateCovers(box);

    /* 长按（触屏按住 0.55 秒 / 右键）进入多选；多选模式下点击 = 勾选/取消 */
    box.querySelectorAll('.book-card').forEach(function (card) {
      var id = card.dataset.id;
      card.addEventListener('pointerdown', function (e) {
        if (selecting) return;
        lp.fired = false;
        lp.x = e.clientX; lp.y = e.clientY;
        clearTimeout(lp.timer);
        lp.timer = setTimeout(function () {
          lp.fired = true;
          if (navigator.vibrate) { try { navigator.vibrate(20); } catch (er) {} }
          enterSelectMode(id);
        }, 550);
      });
      /* 注意：不要在这里监听 pointerleave。实测 Chromium 会在 pointerdown 之后
         立刻补发 pointerout/pointerleave，挂在它上面会把长按定时器瞬间清掉，
         长按永远触发不了。只认抬起、取消和「移动超过 10px」。 */
      ['pointerup', 'pointercancel'].forEach(function (evt) {
        card.addEventListener(evt, function () { clearTimeout(lp.timer); });
      });
      card.addEventListener('pointermove', function (e) {
        if (!lp.timer) return;
        if (Math.abs(e.clientX - lp.x) > 10 || Math.abs(e.clientY - lp.y) > 10) clearTimeout(lp.timer);
      });
      card.addEventListener('contextmenu', function (e) {
        if (selecting) return;
        e.preventDefault();
        enterSelectMode(id);
      });
      card.addEventListener('click', function (e) {
        if (lp.fired) { lp.fired = false; e.preventDefault(); return; }  // 长按刚触发，吞掉这次点击
        if (selecting) { e.preventDefault(); toggleSelect(id); return; }
        if (e.target.closest('a')) return; // 点链接交给浏览器
        openDetail(id);
      });
    });
    updateSelectBar();
  }

  /* ============ 详情 ============ */
  function openDetail(id) {
    var r = records.find(function (x) { return x.id === id; });
    if (!r) return;
    var ownedText = r.owned === '是' ? '已到手' : r.owned === '没到手' ? '买了 · 没到手' : r.owned;
    var priceText = '';
    if (trim(r.price)) {
      var pv = priceVal(r.price), pc = curOf(r);
      priceText = curSymbol(pc) + (pv == null ? trim(r.price) : pv);
      if (pc !== 'CNY' && pv != null) priceText += '（' + curName(pc) + ' · 折合 ' + money(pv * fx[pc]) + '）';
    }
    var rows = [
      ['作者', r.author], ['系列', r.series], ['状态', ownedText],
      ['装帧', r.binding], ['购入日期', r.date], ['购入来源', r.source],
      ['价格', priceText], ['出版社', r.publisher],
      ['类型', r.genre], ['ISBN', r.isbn],
      ['阅读状态', trim(r.readStatus) && r.readStatus !== '未阅读'
        ? r.readStatus + (trim(r.rating) ? ' · ' + r.rating + '/5 ★' : '') : ''],
      ['读完日期', r.finishDate]
    ].filter(function (p) { return trim(p[1]); });

    $('detailBody').innerHTML =
      (r.coverId ? '<div class="detail-cover loading"><img data-cover="' + esc(r.coverId) + '" alt=""></div>' : '') +
      '<div class="detail-title">' + esc(r.title) + '</div>' +
      (rows.length ? '<dl class="detail-grid">' + rows.map(function (p) {
        return '<dt>' + p[0] + '</dt><dd>' + esc(p[1]) + '</dd>';
      }).join('') + '</dl>' : '') +
      (trim(r.note) ? '<p class="detail-note">' + esc(r.note) + '</p>' : '') +
      '<div class="detail-actions">' +
      '<button class="btn btn-primary" id="dGr" type="button">🔗 Goodreads</button>' +
      '<button class="btn btn-outline" id="dBuy" type="button">🛒 购买链接</button>' +
      '<button class="btn btn-outline" id="dEdit" type="button">编辑</button>' +
      '<button class="btn btn-danger" id="dDel" type="button">删除</button>' +
      '</div>';

    $('dGr').onclick = function () { window.open(grUrlFor(r), '_blank', 'noopener'); };
    $('dBuy').onclick = function () {
      var url = trim(r.sourceUrl);
      if (url) window.open(url, '_blank', 'noopener');
      else toast('该记录没有购买链接');
    };
    $('dEdit').onclick = function () { closeModal('detailModal'); openForm(r); };
    $('dDel').onclick = function () {
      if (!confirm('删除《' + r.title + '》这条记录？')) return;
      records = records.filter(function (x) { return x.id !== id; });
      save(); closeModal('detailModal'); render(); toast('已删除');
    };
    openModal('detailModal');
    if (r.coverId) hydrateCovers($('detailBody'));
  }

  /* ============ 表单 ============ */
  function openForm(rec) {
    var isEdit = !!rec;
    $('formTitle').textContent = isEdit ? '编辑记录' : '添加记录';
    $('fId').value = isEdit ? rec.id : '';
    $('fTitle').value = isEdit ? rec.title : '';
    $('fAuthor').value = isEdit ? rec.author : '';
    $('fSeries').value = isEdit ? rec.series : '';
    $('fOwned').value = isEdit ? rec.owned : '是';
    $('fBinding').value = isEdit ? rec.binding : '';
    $('fDate').value = isEdit ? toInputDate(rec.date) : toInputDate(new Date().toLocaleDateString('en-CA'));
    $('fSource').value = isEdit ? rec.source : '';
    $('fSourceUrl').value = isEdit ? rec.sourceUrl : '';
    $('fPrice').value = isEdit && trim(rec.price) !== '' ? rec.price : '';
    if ($('fCurrency')) $('fCurrency').value = isEdit ? curOf(rec) : 'CNY';
    if ($('fBoxRef')) $('fBoxRef').value = '';
    if ($('formBoxTip')) $('formBoxTip').hidden = true;
    $('fPublisher').value = isEdit ? rec.publisher : '';
    $('fNote').value = isEdit ? rec.note : '';
    $('fIsbn').value = isEdit ? (rec.isbn || '') : '';
    $('fGenre').value = isEdit ? (rec.genre || '') : '';
    $('fReadStatus').value = isEdit ? (rec.readStatus || '未阅读') : '未阅读';
    $('fRating').value = isEdit ? (rec.rating || '') : '';
    $('fFinish').value = isEdit && rec.finishDate ? toInputDate(rec.finishDate) : '';
    $('fGrUrl').value = isEdit ? rec.goodreadsUrl : '';
    resetCoverForm(rec);
    $('fGrBookUrlH').value = isEdit ? (rec.grBookUrl || '') : '';
    $('fGrAuthorUrlH').value = isEdit ? (rec.grAuthorUrl || '') : '';
    $('fGrSeriesUrlH').value = isEdit ? (rec.grSeriesUrl || '') : '';
    $('grTip').hidden = true;
    openModal('formModal');
    setTimeout(function () { $('fTitle').focus(); }, 250);
  }

  /* 从订阅期次里「＋ 加书」进来：先把这期记下来，保存时把书同时挂进那一期 */
  function openFormForBox(subId, boxId) {
    var s = subById(subId), b = s ? boxOf(s, boxId) : null;
    openForm(null);
    if (!s || !b) return;
    $('fBoxRef').value = subId + '|' + boxId;
    $('formBoxTip').innerHTML = '这本书会同时记进 <b>' + esc(s.name) + '</b> 的 <b>' + esc(b.period) +
      '</b> 期（作者/系列/Goodreads 链接照常可用「获取」自动补全）。';
    $('formBoxTip').hidden = false;
    if (!$('fDate').value && b.chargeDate) $('fDate').value = toInputDate(b.chargeDate);
    if (!$('fSource').value) $('fSource').value = s.name;
    if (b.currency) $('fCurrency').value = b.currency;
    if (b.amount && !$('fPrice').value) $('fPrice').value = b.amount;
  }

  $('bookForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('fId').value;
    var data = {
      title: trim($('fTitle').value),
      author: trim($('fAuthor').value),
      series: trim($('fSeries').value),
      owned: $('fOwned').value,
      binding: $('fBinding').value,
      date: fromInputDate($('fDate').value),
      source: trim($('fSource').value),
      sourceUrl: trim($('fSourceUrl').value),
      price: $('fPrice').value === '' ? '' : String(parseFloat($('fPrice').value)),
      publisher: trim($('fPublisher').value),
      note: trim($('fNote').value),
      currency: $('fCurrency') ? $('fCurrency').value : 'CNY',
      isbn: trim($('fIsbn') ? $('fIsbn').value : '').replace(/[-\s]/g, ''),
      genre: trim($('fGenre') ? $('fGenre').value : ''),
      readStatus: $('fReadStatus') ? $('fReadStatus').value : '',
      rating: $('fRating') ? $('fRating').value : '',
      finishDate: fromInputDate($('fFinish') ? $('fFinish').value : ''),
      goodreadsUrl: trim($('fGrUrl').value),
      grBookUrl: trim($('fGrBookUrlH').value),
      grAuthorUrl: trim($('fGrAuthorUrlH').value),
      grSeriesUrl: trim($('fGrSeriesUrlH').value),
      coverId: coverIdFor($('fId').value)
    };
    if (!data.title) { toast('请填写书名'); return; }
    var savedRec = null;
    if (id) {
      var rec = records.find(function (x) { return x.id === id; });
      if (rec) Object.keys(data).forEach(function (k) { rec[k] = data[k]; });
      savedRec = rec;
      toast('已保存修改');
    } else {
      data.id = uid();
      records.push(data);
      savedRec = data;
      toast('已添加');
    }
    save();
    var boxRef = trim($('fBoxRef') ? $('fBoxRef').value : '');
    if (boxRef && savedRec) {
      var parts = boxRef.split('|');
      if (attachBookToBox(parts[0], parts[1], savedRec)) toast('已记入订阅期次');
    }
    closeModal('formModal'); render();
  });

  /* ---- 封面接线 ---- */
  if ($('coverFile')) {
    $('coverFile').addEventListener('change', function () { var f = this.files[0]; this.value = ''; loadCoverFile(f); });
  }
  if ($('sName')) $('sName').addEventListener('input', fillSkipHint);
  if ($('sBsSlug')) $('sBsSlug').addEventListener('change', fillSkipHint);
  if ($('btnCoverPick')) $('btnCoverPick').onclick = function () { $('coverFile').click(); };
  if ($('btnCoverDel')) $('btnCoverDel').onclick = deleteCover;
  if ($('btnCropApply')) $('btnCropApply').onclick = applyCover;
  if ($('btnCoverAuto')) $('btnCoverAuto').onclick = autoCoverCorners;
  if ($('btnCropReset')) {
    $('btnCropReset').onclick = function () {
      $('coverCrop').hidden = true;
      $('coverPaste').hidden = false;
      cropImg = null; cropPts = null;
    };
  }
  if ($('coverPaste')) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      $('coverPaste').addEventListener(ev, function (e) { e.preventDefault(); this.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      $('coverPaste').addEventListener(ev, function (e) { e.preventDefault(); this.classList.remove('over'); });
    });
    $('coverPaste').addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadCoverFile(f);
    });
  }
  /* 电脑上直接 Ctrl+V 粘贴截图（手机上用「选图片/拍照」按钮） */
  document.addEventListener('paste', function (e) {
    if ($('formModal').hidden) return;
    var it = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < it.length; i++) {
      if (it[i].type && it[i].type.indexOf('image') === 0) {
        var f = it[i].getAsFile();
        if (f) { e.preventDefault(); loadCoverFile(f); toast('已粘贴图片，拖四角对准书'); return; }
      }
    }
  });
  hookCrop();

  $('btnGrSearch').addEventListener('click', function () {
    var q = [$('fTitle').value, $('fAuthor').value, $('fSeries').value]
      .map(trim).filter(Boolean).join(' ');
    window.open(GR_SITE + '/search?q=' + encodeURIComponent(q || ' '), '_blank', 'noopener');
    $('grTip').hidden = false;
  });

  /* ============ 书名自动补全 ============
     1) 书名匹配：选中后填完整记录
     2) 系列匹配：书库里没这本，但系列记过 → 选中只填作者+系列，书名保留你输入的 */
  var suggestBox = $('suggestBox');
  function hideSuggest() { suggestBox.hidden = true; suggestBox.innerHTML = ''; }
  function fillFromBook(rec) {
    $('fTitle').value = rec.title;
    if (trim(rec.author)) $('fAuthor').value = rec.author;
    if (trim(rec.series)) $('fSeries').value = rec.series;
    if (!$('fPublisher').value && trim(rec.publisher)) $('fPublisher').value = rec.publisher;
    if (!$('fGrUrl').value && trim(rec.goodreadsUrl)) $('fGrUrl').value = rec.goodreadsUrl;
    if (!$('fGrBookUrlH').value && trim(rec.grBookUrl)) $('fGrBookUrlH').value = rec.grBookUrl;
    if (!$('fGrAuthorUrlH').value && trim(rec.grAuthorUrl)) $('fGrAuthorUrlH').value = rec.grAuthorUrl;
    if (!$('fGrSeriesUrlH').value && trim(rec.grSeriesUrl)) $('fGrSeriesUrlH').value = rec.grSeriesUrl;
  }
  function fillFromSeries(rec) {
    if (trim(rec.series)) $('fSeries').value = rec.series;
    if (trim(rec.author)) $('fAuthor').value = rec.author;
  }
  function updateTitleSuggest(val) {
    var q = trim(val).toLowerCase();
    if (!q) { hideSuggest(); return; }
    /* 书名匹配（同名不同作者的逐条列出） */
    var seen = {}, tItems = [];
    records.forEach(function (r) {
      var title = trim(r.title);
      if (!title || tItems.length >= 6) return;
      if (title.toLowerCase().indexOf(q) === -1) return;
      var key = title.toLowerCase() + '|' + trim(r.author).toLowerCase() + '|' + trim(r.series).toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      tItems.push(r);
    });
    /* 系列匹配 */
    var sSeen = {}, sItems = [];
    records.forEach(function (r) {
      var s = trim(r.series);
      if (!s || sItems.length >= 4) return;
      var k = s.toLowerCase();
      if (k.indexOf(q) === -1 || sSeen[k]) return;
      sSeen[k] = 1;
      sItems.push(r);
    });
    if (!tItems.length && !sItems.length) { hideSuggest(); return; }
    /* 只有一个候选书名且与输入完全一致 → 直接自动填充，不用点 */
    if (tItems.length === 1 && !sItems.length && tItems[0].title.toLowerCase() === q) {
      fillFromBook(tItems[0]);
      hideSuggest();
      return;
    }
    var html = '';
    if (tItems.length) {
      html += '<div class="suggest-sec">书名匹配</div>' + tItems.map(function (r, i) {
        return '<div class="suggest-item" data-t="' + i + '">' +
          '<div class="suggest-title">' + esc(r.title) + '</div>' +
          '<div class="suggest-sub">' + (trim(r.author) ? esc(r.author) : '作者未知') +
          (trim(r.series) ? ' · <span class="s-series">' + esc(r.series) + '</span>' : '') +
          '</div></div>';
      }).join('');
    }
    if (sItems.length) {
      html += '<div class="suggest-sec">系列匹配（选中填作者+系列）</div>' + sItems.map(function (r, i) {
        return '<div class="suggest-item" data-s="' + i + '">' +
          '<div class="suggest-title">📚 ' + esc(r.series) + '</div>' +
          '<div class="suggest-sub">' + (trim(r.author) ? esc(r.author) : '作者未知') +
          ' · 已记录 ' + records.filter(function (x) { return trim(x.series).toLowerCase() === trim(r.series).toLowerCase(); }).length + ' 本</div></div>';
      }).join('');
    }
    suggestBox.innerHTML = html;
    suggestBox.hidden = false;
    suggestBox.querySelectorAll('.suggest-item').forEach(function (el) {
      el.addEventListener('mousedown', function (e) {
        e.preventDefault(); // 先于 blur 触发，保证能点到
        if (el.dataset.t !== undefined) fillFromBook(tItems[+el.dataset.t]);
        else fillFromSeries(sItems[+el.dataset.s]);
        hideSuggest();
      });
    });
  }
  $('fTitle').addEventListener('input', function () { updateTitleSuggest(this.value); });
  $('fTitle').addEventListener('blur', function () { setTimeout(hideSuggest, 150); });

  /* ============ 常用值下拉（购入来源 / 出版社）============
     可点选，也可输入列表里没有的新值 */
  function attachCombo(inputId, boxId, pickValues) {
    var input = $(inputId), box = $(boxId);
    function show() {
      var q = trim(input.value).toLowerCase();
      var vals = pickValues();
      var items = (q ? vals.filter(function (v) { return v.toLowerCase().indexOf(q) !== -1; }) : vals).slice(0, 8);
      if (!items.length) { box.hidden = true; return; }
      box.innerHTML = items.map(function (v) {
        return '<div class="suggest-item" data-v="' + esc(v) + '">' +
          '<div class="suggest-title">' + esc(v) + '</div></div>';
      }).join('');
      box.hidden = false;
      box.querySelectorAll('.suggest-item').forEach(function (el) {
        el.addEventListener('mousedown', function (e) {
          e.preventDefault();
          input.value = el.dataset.v;
          box.hidden = true;
        });
      });
    }
    input.addEventListener('input', show);
    input.addEventListener('focus', show);
    input.addEventListener('blur', function () { setTimeout(function () { box.hidden = true; }, 150); });
  }
  function distinctValues(field) {
    var s = {};
    records.forEach(function (r) { var v = trim(r[field]); if (v) s[v] = 1; });
    return Object.keys(s).sort(function (a, b) { return a.localeCompare(b); });
  }
  attachCombo('fSource', 'sourceBox', function () { return distinctValues('source'); });
  attachCombo('fPublisher', 'publisherBox', function () { return distinctValues('publisher'); });

  /* ============ Goodreads 查询（经 DuckDuckGo） ============
     Goodreads 直接抓只返回空壳（反爬），改走 DuckDuckGo 搜索：
     结果文本自带 "书名 (系列, #序号) by 作者"，链接含 book/show/series/author 页，全部实测验证 */
  function grFetch(url) {
    var key = trim(localStorage.getItem('grProxyKey') || '');
    if (!key) return Promise.reject(new Error('no-key'));
    var target = 'https://r.jina.ai/' + url;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 60000);
    return fetch(target, { signal: ctrl.signal, headers: { 'Authorization': 'Bearer ' + key } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) {
        clearTimeout(timer);
        if (!t || t.length < 200) throw new Error('empty');
        return t;
      })
      .catch(function (e) { clearTimeout(timer); throw e; });
  }
  /* 抓「原始 HTML」。Jina 默认把页面转成 markdown，会丢掉内嵌 JSON、系列链接和相对路径，
     所以凡是需要读页面结构的场景（书页 / 系列页）一律走这里，带 X-Return-Format: html。 */
  function grFetchHtml(url) {
    var key = trim(localStorage.getItem('grProxyKey') || '');
    if (!key) return Promise.reject(new Error('no-key'));
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 60000);
    return fetch('https://r.jina.ai/' + url, {
      signal: ctrl.signal,
      headers: {
        'Authorization': 'Bearer ' + key,
        'X-Return-Format': 'html'
      }
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) {
        clearTimeout(timer);
        if (!t || t.length < 500) throw new Error('empty');
        return t;
      })
      .catch(function (e) { clearTimeout(timer); throw e; });
  }
  /* DuckDuckGo 结果 → [{text,url}]（只留 goodreads，解码 uddg 跳转参数） */
  function parseDdgItems(md) {
    var items = [];
    var re = /\[([^\]]+)\]\(https:\/\/duckduckgo\.com\/l\/\?uddg=([^&\)]+)/g;
    var m;
    while ((m = re.exec(md))) {
      var u;
      try { u = decodeURIComponent(m[2]); } catch (e) { continue; }
      if (u.indexOf('goodreads.com') === -1) continue;
      var text = m[1].replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
      items.push({ text: text, url: u });
    }
    return items;
  }
  /* 结果行解析："Title (Series, #2) by Author ..." / "Title (Series, #2) - Goodreads" / "Title by Author | Goodreads" */
  function parseBookTextLine(text) {
    var out = { title: '', series: '', seriesNum: '', author: '' };
    var m = text.match(/^(.*?)\s*\(([^()]+?),\s*#([\d.]+)\)\s*(?:by\s+(.+?))?\s*(?:\.\.\.|-\s*Goodreads.*)?$/i);
    if (m) {
      out.title = m[1].trim();
      out.series = m[2].trim();
      out.seriesNum = m[3];
      if (m[4]) out.author = m[4].replace(/\.\.\.$/, '').trim();
      return out;
    }
    m = text.match(/^(.*?)\s+by\s+(.+?)\s*(?:\.\.\.|\||-\s*Goodreads).*$/i);
    if (m) { out.title = m[1].trim(); out.author = m[2].trim(); }
    return out;
  }
  /* GR 官方自动补全：返回 JSON，一条内含 书名(系列,#序号)/作者/评分/封面 */
  function grAutoComplete(q) {
    return grFetch(GR_SITE + '/book/auto_complete?format=json&q=' + encodeURIComponent(q)).then(function (t) {
      var i = t.indexOf('Markdown Content:');
      if (i !== -1) t = t.slice(i + 'Markdown Content:'.length);
      var arr = JSON.parse(t.trim());
      if (!Array.isArray(arr) || !arr.length) throw new Error('empty');
      return arr.slice(0, 8).map(function (b) {
        var info = parseBookTextLine(b.title || '');
        return {
          title: info.title || b.bookTitleBare || b.title || '',
          series: info.series,
          seriesNum: info.seriesNum,
          author: (b.author && b.author.name) || '',
          authorUrl: (b.author && b.author.profileUrl) || '',
          url: GR_SITE + b.bookUrl,
          image: b.imageUrl || '',
          rating: b.avgRating || ''
        };
      }).filter(function (b) { return b.title; });
    });
  }
  /* ---------- 页面结构解析工具（都基于原始 HTML） ---------- */
  function decodeEntities(s) {
    return String(s == null ? '' : s)
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  /* 系列页 → 书单。首选页面内嵌的结构化 JSON（data-react-props），
     里面直接有 bookId / bookTitleBare / title(含系列名和序号) / 评分，
     比用正则去抠链接可靠得多 —— 实测 39 个链接里有 16 个不带 slug，靠 slug 猜书名会错。
     万一取不到再退回「链接路径正则」，最后才由调用方退到 DDG。 */
  function grSeriesBooks(seriesUrl) {
    if (!seriesUrl) return Promise.reject(new Error('no url'));
    return grFetchHtml(seriesUrl).then(function (html) {
      var items = [], seen = {}, p, m;
      /* 路径一（首选）：把页面上所有 data-react-props 块「合并」，按 bookId 去重。
         Goodreads 是分块渲染的：实测一个系列页有 9 个 props 块，含 series 的 2 个
         分别只有 2 本和 33 本，只取第一块会漏掉大半。合并后 35 本，正好等于页面上
         标注的 "35 total works"，而且每本都带真实书名（含系列名和序号）。 */
      var blocks = html.match(/data-react-props="[^"]*"/gi) || [];
      for (p = 0; p < blocks.length; p++) {
        var mm = blocks[p].match(/data-react-props="([^"]*)"/i);
        if (!mm) continue;
        var data;
        try { data = JSON.parse(decodeEntities(mm[1])); } catch (e) { continue; }
        var rows = data.series || data.books;
        if (!rows || !rows.length) continue;
        for (var r = 0; r < rows.length; r++) {
          var b = rows[r].book || rows[r];
          if (!b || !b.bookId) continue;
          if (seen[b.bookId]) continue;
          seen[b.bookId] = 1;
          var raw = String(b.bookUrl || ('/book/show/' + b.bookId));
          items.push({
            title: b.bookTitleBare || b.title || '',
            url: GR_SITE + (raw.indexOf('http') === 0 ? raw.replace(/^https?:\/\/[^/]+/, '') : raw),
            author: (b.author && b.author.name) || '',
            authorUrl: (b.author && b.author.profileUrl) || ''
          });
        }
      }
      /* 结构化块拿到了就以它为准——它就是「这个系列的书单」本身。
         只有一块都没拿到时，才退回链接路径正则；那条路会顺带捞到侧栏推荐等
         无关书籍（实测多出 14 条），所以只能当兜底。 */
      if (items.length) return items;
      var re = /\/book\/show\/(\d+)(?:-([a-z0-9-]+))?/gi;
      while ((m = re.exec(html))) {
        if (seen[m[1]]) continue;
        seen[m[1]] = 1;
        items.push({
          title: titleFromSlug(m[2]),
          url: GR_SITE + '/book/show/' + m[1] + (m[2] ? '-' + m[2] : ''),
          author: '', authorUrl: ''
        });
      }
      if (!items.length) throw new Error('no books');
      return items;
    });
  }
  /* 小词不首字母大写，"46281-the-lord-of-the-rings" → "The Lord of the Rings" */
  var SMALL_WORDS = { of: 1, the: 1, a: 1, an: 1, and: 1, or: 1, in: 1, on: 1, to: 1, for: 1, at: 1, by: 1, with: 1, from: 1 };
  function titleFromSlug(slug) {
    if (!slug) return '';
    var parts = decodeURIComponent(slug).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
    return parts.map(function (w, i) {
      var lw = w.toLowerCase();
      if (i > 0 && SMALL_WORDS[lw]) return lw;
      return lw.replace(/\b([a-z])/g, function (c) { return c.toUpperCase(); });
    }).join(' ');
  }
  /* 解析一个书页的原始 HTML，一次把四样都取出来，避免为一本书发多次请求：
     书名 / 系列名 / 序号、系列页链接、作者页链接、作者名。 */
  function parseBookPage(html, authorHint) {
    var out = { title: '', series: '', seriesNum: '', author: '', authorUrl: '', seriesUrl: '', parentSeries: [] };
    /* 有的返回（Next.js 流式载荷）里引号被转义成 \" ，先还原，否则正则一条都匹配不到 */
    if (html.indexOf('\\"') !== -1) html = html.replace(/\\"/g, '"');
    /* 1) 系列页链接：实测第一个就是主系列（Dune 页第二个是母系列 Dune Universe）。
       顺便从标题区那条「Book N in the X series」的 aria-label 拿系列名和序号，
       比只依赖 og:title 多一层保障。 */
    var all = html.match(/\/series\/\d+[a-z0-9-]*/gi) || [];
    var uniq = all.filter(function (v, i) { return all.indexOf(v) === i; });
    if (uniq.length) {
      out.seriesUrl = uniq[0].indexOf('http') === 0 ? uniq[0] : GR_SITE + uniq[0];
      out.parentSeries = uniq.slice(1).map(function (u) { return u.indexOf('http') === 0 ? u : GR_SITE + u; });
    }
    var sl = html.match(/aria-label="Book[^"]{0,40}?in the ([^"]{1,80}?) series"/i);
    if (sl) {
      out.series = decodeEntities(sl[1]).trim();
      var sn = html.match(/aria-label="Book\s*([\d.]+)[^"]{0,40}?in the [^"]{1,80}? series"/i);
      if (sn) out.seriesNum = sn[1];
    }
    /* 2) 作者 —— 就用页面上「点作者名能进去」的那个链接（绝对地址 + 名字文本）。
       实测结构：<a class="ContributorLink" href="…/author/show/{id}.{Name}">
                   <span class="ContributorLink__name" data-testid="name">作者名</span>
                   <span class="ContributorLink__badge">…svg 徽章…</span></a>
       所以 href 和 data-testid="name" 一起抓，既拿到链接又拿到名字。
       别写成「<a> 到 </a> 之间不超过 N 个字符」——作者名后面挂着 Goodreads Author
       的 svg 徽章，内层很长，够不到收尾标签就整条漏掉，只剩页面底部的「相似作者」
       能匹配上，作者会被填成别人（这个坑踩过）。 */

    var cands = [], m;
    var dre = /<a[^>]*?href="([^"]*\/author\/show\/\d+[^"]*)"[^>]*>\s*<span[^>]*data-testid="name"[^>]*>([^<]*)<\/span>/gi;
    while ((m = dre.exec(html))) {
      cands.push({
        url: m[1].indexOf('http') === 0 ? m[1] : GR_SITE + m[1],
        text: decodeEntities(m[2]).replace(/\s+/g, ' ').trim()
      });
    }
    var pick = null, i;
    var hint = authorHint ? normTitle(authorHint) : '';
    if (hint) {
      for (i = 0; i < cands.length; i++) {
        var t = normTitle(cands[i].text);
        if (t && (t === hint || t.indexOf(hint) !== -1 || hint.indexOf(t) !== -1)) { pick = cands[i]; break; }
      }
    }
    /* 对不上名字（或本来没名字可对）就取第一个：标题区的作者链接排在文档最前面 */
    if (!pick && cands.length) pick = cands[0];
    if (pick) { out.authorUrl = pick.url; out.author = pick.text; }
    if (!out.authorUrl) {
      var ld = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
      if (ld) {
        try {
          var j = JSON.parse(ld[1]);
          var a = j && j.author;
          if (a && !a.length) a = [a];
          if (a && a[0]) { if (a[0].url) out.authorUrl = a[0].url; if (a[0].name) out.author = a[0].name; }
        } catch (e) { /* 交给下面的兜底 */ }
      }
    }
    if (!out.authorUrl) {
      var am = html.match(/\/author\/show\/\d+[.\-]?[A-Za-z0-9_-]*/);
      if (am) out.authorUrl = GR_SITE + am[0];
    }
    /* 3) 书名 / 系列名 / 序号（og:title 形如 "Dune (Dune, #1)"） */
    var mt = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
    if (mt) {
      var og = decodeEntities(mt[1]).trim();
      var info = parseBookTextLine(og);
      out.title = info.title || og;
      if (!out.series) out.series = info.series;
      if (!out.seriesNum) out.seriesNum = info.seriesNum;
    }
    return out;
  }
  function grBookPageInfo(bookUrl, authorHint) {
    return grFetchHtml(bookUrl).then(function (html) {
      var info = parseBookPage(html, authorHint);
      if (!info.title && !info.seriesUrl && !info.authorUrl) throw new Error('parse-failed');
      return info;
    });
  }
  /* 同一个书页在一次操作里可能被多个地方需要，缓存住，保证只发一次请求 */
  var pageCache = {};
  function grBookPageCached(bookUrl, authorHint) {
    var u = trim(bookUrl);
    if (!pageCache[u]) {
      pageCache[u] = grBookPageInfo(u, authorHint).catch(function (e) { delete pageCache[u]; throw e; });
    }
    return pageCache[u];
  }
  /* 只在书名精确相等时采用 —— 无精确匹配宁可不用，也不要把同名书的信息填错 */
  function pickExact(books, q) {
    var nq = normTitle(q);
    for (var i = 0; i < books.length; i++) {
      if (normTitle(books[i].title) === nq) return books[i];
    }
    return null;
  }
  /* DuckDuckGo 搜索（仅用于发现系列页链接等 GR 没直接给 URL 的场景） */
  function ddgFetch(query) {
    var key = trim(localStorage.getItem('grProxyKey') || '');
    if (!key) return Promise.reject(new Error('no-key'));
    var target = 'https://r.jina.ai/https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 45000);
    return fetch(target, { signal: ctrl.signal, headers: { 'Authorization': 'Bearer ' + key } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) {
        clearTimeout(timer);
        if (!t || t.length < 200) throw new Error('empty');
        return t;
      })
      .catch(function (e) { clearTimeout(timer); throw e; });
  }
  /* DuckDuckGo 上的 GR 书目搜索（系列页发现/兜底用） */
  function ddgBookSearch(q) {
    return ddgFetch('site:goodreads.com/book/show ' + q).then(function (md) {
      var out = [], seen = {};
      parseDdgItems(md).forEach(function (it) {
        if (it.url.indexOf('/book/show/') === -1) return;
        var b = parseBookTextLine(it.text);
        if (!b.title) return;
        var key = normTitle(b.title);
        if (seen[key]) return;
        seen[key] = 1;
        b.url = it.url;
        out.push(b);
      });
      if (!out.length) throw new Error('no results');
      return out;
    });
  }
  /* 拿到系列页链接 → 询问是否补齐系列书目。
     取链接的优先级：hit.seriesUrl（书页 HTML 里直接读到的，最权威）
                    → 现抓书页 HTML 取 /series/{id}
                    → 最后才用 DuckDuckGo 猜（原先只有这一条，最不稳） */
  function fetchSeriesLinkAndOffer(hit) {
    if (!hit.series) {
      toast('已填好：' + hit.title + (hit.author ? ' / ' + hit.author : '') +
        '（这本书在 Goodreads 上没有系列信息）');
      return;
    }
    function offer(seriesUrl) {
      if (seriesUrl) $('fGrSeriesUrlH').value = seriesUrl;
      setTimeout(function () {
        if (confirm('这是《' + hit.series + '》系列' + (hit.seriesNum ? '第 ' + hit.seriesNum + ' 本' : '') +
          '。\n\n要把系列里你还没记录的书自动加为「未购买」吗？')) {
          importSeriesBooks({
            series: hit.series,
            seriesUrl: trim($('fGrSeriesUrlH').value),
            author: hit.author || trim($('fAuthor').value)
          });
        }
      }, 250);
    }
    /* 顺手补作者页链接 —— 导出 Excel 时「作者」列也要有超链接。
       走页面缓存，所以即使下面还要抓同一个书页，整轮也总共只发一次请求。 */
    if (hit.url) {
      grBookPageCached(hit.url, hit.author || trim($('fAuthor').value)).then(function (p2) {
        /* 书页上那个可点击的作者链接最权威，直接覆盖搜索结果给的（可能是同名不同条目） */
        if (p2.authorUrl) $('fGrAuthorUrlH').value = p2.authorUrl;
        if (p2.author && !trim($('fAuthor').value)) $('fAuthor').value = p2.author;
      }).catch(function () {});
    }
    var p = hit.seriesUrl ? Promise.resolve(hit.seriesUrl) : Promise.reject(new Error('no url'));
    p = p.catch(function () {
      if (!hit.url) throw new Error('no book url');
      return grBookPageCached(hit.url).then(function (p2) {
        if (!p2.seriesUrl) throw new Error('no-series');
        return p2.seriesUrl;
      });
    });
    p = p.catch(function () {
      return ddgFetch('site:goodreads.com ' + hit.series + ' series').then(function (md) {
        var its = parseDdgItems(md);
        for (var j = 0; j < its.length; j++) {
          if (its[j].url.indexOf('/series/') !== -1) return its[j].url;
        }
        throw new Error('ddg miss');
      });
    });
    p.then(function (u) {
      offer(u);
      toast('已填好：' + hit.title + ' / ' + (hit.author || '?') + ' / 《' + hit.series + '》');
    }).catch(function () {
      toast('已填好作者和系列名，但系列页链接没抓到（系列书目暂时读不了）');
      setTimeout(function () {
        if (confirm('系列页链接没抓到。要用书名去搜《' + hit.series + '》的书单吗？\n（结果可能不全）')) {
          importSeriesBooks({
            series: hit.series, seriesUrl: '', author: hit.author || ''
          });
        }
      }, 250);
    });
  }
  function showGrCandidates(items, secTitle) {
    suggestBox.innerHTML = '<div class="suggest-sec">' + esc(secTitle) + '</div>' +
      items.map(function (it, i) {
        return '<div class="suggest-item" data-g="' + i + '">' +
          '<div class="suggest-title">' + esc(it.title) + '</div>' +
          '<div class="suggest-sub">' + (esc(it.author) || '作者未知') +
          (it.series ? ' · <span class="s-series">' + esc(it.series) + '</span>' : '') + '</div></div>';
      }).join('');
    suggestBox.hidden = false;
    suggestBox.querySelectorAll('.suggest-item').forEach(function (el) {
      el.addEventListener('mousedown', function (e) {
        e.preventDefault();
        pickGrBook(items[+el.dataset.g]);
      });
    });
  }
  /* Open Library 兜底：直连免费 API，给作者/系列名（无系列书单） */
  function showOlCandidates(items) {
    suggestBox.innerHTML = '<div class="suggest-sec">Open Library 结果（可填作者/系列，系列书单需 Goodreads）</div>' +
      items.map(function (it, i) {
        return '<div class="suggest-item" data-o="' + i + '">' +
          '<div class="suggest-title">' + esc(it.title) + '</div>' +
          '<div class="suggest-sub">' + (esc(it.author) || '作者未知') +
          (it.series ? ' · <span class="s-series">' + esc(it.series) + '</span>' : '') + '</div></div>';
      }).join('');
    suggestBox.hidden = false;
    suggestBox.querySelectorAll('.suggest-item').forEach(function (el) {
      el.addEventListener('mousedown', function (e) {
        e.preventDefault();
        var it = items[+el.dataset.o];
        $('fTitle').value = it.title;
        if (it.author) $('fAuthor').value = it.author;
        if (it.series) $('fSeries').value = it.series;
        grPickDone();
        toast(it.series
          ? '已填好作者和系列（系列内书单需要连 Goodreads 才能获取）'
          : '已填好作者；这本书在 Open Library 上没有系列信息');
      });
    });
  }
  function grPickDone() { hideSuggest(); }
  function pickGrBook(item) {
    $('fTitle').value = item.title;
    if (item.author) $('fAuthor').value = item.author;
    if (item.series) $('fSeries').value = item.series;
    $('fGrUrl').value = item.url;
    $('fGrBookUrlH').value = item.url;
    if (item.authorUrl && !trim($('fGrAuthorUrlH').value)) $('fGrAuthorUrlH').value = item.authorUrl;
    grPickDone();
    fetchSeriesLinkAndOffer(item);
  }
    /* ============ 补全「系列 / 作者」链接 ============
     导出 Excel 时「系列」「作者」两列要有超链接，前提是记录里存了对应 Goodreads 页面的地址。
     早期记录基本没存，这里就按【当前筛选出的记录】去补：每本 1 次网络请求，所以一次限量 20 条。 */
  var backfilling = false;
  function backfillTargets() {
    return filtered().filter(function (r) {
      var book = trim(r.grBookUrl) || trim(r.goodreadsUrl);
      return book && !(trim(r.grSeriesUrl) && trim(r.grAuthorUrl));
    });
  }
  function backfillLinks() {
    if (backfilling) { toast('正在补全，请稍候…'); return; }
    var targets = backfillTargets();
    if (!targets.length) { toast('当前筛选结果里没有需要补全的记录（都已有系列和作者链接）'); return; }
    var batch = targets.slice(0, 20);
    backfilling = true;
    var btn = $('btnBackfill');
    if (btn) { btn.disabled = true; btn.textContent = '补全中 0/' + batch.length; }
    var done = 0, ok = 0, i = 0, CONC = 3;
    function step() {
      if (i >= batch.length) {
        backfilling = false;
        if (btn) { btn.disabled = false; btn.textContent = '补全缺失链接（最多 20 条）'; }
        render();
        var left = targets.length - batch.length;
        toast('补全完成：成功 ' + ok + '/' + batch.length + ' 条' +
          (left > 0 ? '；还剩 ' + left + ' 条，再点一次继续' : ''));
        return;
      }
      var r = batch[i++];
      grBookPageCached(trim(r.grBookUrl) || trim(r.goodreadsUrl), trim(r.author)).then(function (p) {
        if (p.seriesUrl) r.grSeriesUrl = p.seriesUrl;
        if (p.authorUrl) r.grAuthorUrl = p.authorUrl;
        if (!trim(r.series) && p.series) r.series = p.series;
        if (!trim(r.author) && p.author) r.author = p.author;
        save(); ok++;
      }).catch(function () {}).then(function () {
        done++;
        if (btn) btn.textContent = '补全中 ' + done + '/' + batch.length;
        step();
      });
    }
    for (var k = 0; k < CONC; k++) step();
  }

  /* ============ 系列书目：手动挑选后再导入 ============
     Goodreads 的系列页会把「译本 / 盒装合集 / 分册」也算进同一系列
     （实测 Dune 的 35 本里混着保加利亚语译本、5 Books Collection Set、
     Dune Chronicles #2-6 等），所以绝不整批导入，一律先给用户勾选。 */
  var serState = { series: '', author: '', seriesUrl: '', authorUrl: '', items: [] };

  /* 疑似「非正传」的标记规则解析出来的名称；空字符串=正传 */
  var FLAG_RULES = [
    { name: '合集', re: /collection|box\s*set|boxed|omnibus|complete|trilogy|set of|bundle|#\s*\d+\s*[-–]\s*\d+|捆绑|套装|合集|全套|文库/i },
    /* 各语言里「第 N 册」的说法都要认：英语 part / 芬兰语 osa / 德语 teil·band /
       法语 tome / 俄语 том·часть …（实测漏过 "Dyyni: Ensimmäinen osa"） */
    { name: '分册', re: /\b(osa|teil|band|tome|tom|volume|том|часть)\b|part\s*\d|\d\s*of\s*\d|\/\s*\d|分册|上册|下册|上卷|下卷/i }
  ];
  function flagOf(title, seriesName) {
    var t = trim(title);
    /* "<系列名> 2" / "<系列名> II" 这类：同一本书被拆册的版本（实测 Dune I / Dune 2 属于此类） */
    var sn = trim(seriesName);
    if (sn) {
      var lowT = t.toLowerCase(), lowSn = sn.toLowerCase();
      if (lowT.indexOf(lowSn) === 0) {
        var rest = t.slice(sn.length).trim();
        if (/^(?:[IVXLC]{1,5}|\d{1,3})$/.test(rest)) return '分册';
      }
    }
    for (var i = 0; i < FLAG_RULES.length; i++) {
      if (FLAG_RULES[i].re.test(t)) return FLAG_RULES[i].name;
    }
    return '';
  }
  /* 去重/比对用的 key。注意不能用 normTitle —— 它只保留 [a-z0-9]，
     纯西里尔/中日韩的标题会被清成空串，那些「译本」就会被静默丢掉
     （实测 35 本里少了 5 本）。这里只去标点，保留任意语种的字母。 */
  function bookKey(s) {
    return trim(s).toLowerCase().replace(/[^a-z0-9\u00a1-\uffff]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  /* 纯拉丁字符（英文/西欧语）标题？用来识别译本：只有当整个系列以拉丁标题为主时，
     非拉丁标题才判为译本，避免把本来就是中文的系列全部误标。 */
  function isLatinTitle(s) {
    return /^[\u0000-\u024F\u2000-\u206F\u20A0-\u20CF\s]*$/.test(trim(s));
  }
  function openSeriesPicker(info, books) {
    var existing = {};
    records.forEach(function (r) {
      if (bookKey(r.series) === bookKey(info.series)) existing[bookKey(r.title)] = 1;
    });
    var latinCount = 0;
    books.forEach(function (b) { if (isLatinTitle(b.title)) latinCount++; });
    var mostlyLatin = latinCount >= books.length / 2;
    var seen = {}, items = [];
    books.forEach(function (b) {
      var t = trim(b.title);
      if (!t) return;                       // 取不到书名的（兜底路径的噪声）不列出来
      var key = bookKey(t);
      if (!key) return;
      if (seen[key]) return;
      seen[key] = 1;
      var flag = (mostlyLatin && !isLatinTitle(t)) ? '译本' : flagOf(t, info.series);
      var isExisting = !!existing[key];
      items.push({
        title: t, url: b.url, flag: flag,
        author: b.author || '', authorUrl: b.authorUrl || '',
        existing: isExisting,
        checked: !isExisting && !flag      // 默认勾正传，带标记的默认不勾
      });
    });
    if (!items.length) { toast('没解析到可添加的书目'); return; }
    serState = { series: info.series, author: info.author || '', seriesUrl: info.seriesUrl || '',
                 authorUrl: info.authorUrl || '', items: items };
    var already = items.filter(function (x) { return x.existing; }).length;
    var flagged = items.filter(function (x) { return !x.existing && x.flag; }).length;
    $('seriesTitle').textContent = '《' + info.series + '》系列书目';
    $('seriesHint').innerHTML =
      '共 ' + items.length + ' 条' +
      (already ? '，其中 <b>' + already + '</b> 条你已经在书库里' : '') +
      (flagged ? '，另有 <b>' + flagged + '</b> 条带标记' : '') +
      '。<br>Goodreads 会把译本 / 盒装合集 / 分册算进同一个系列，所以这里逐条勾选。' +
      '已默认勾上正传，带标记的默认不勾 —— 需要就自己点上。';
    renderSeriesList();
    openModal('seriesModal');
  }
  function renderSeriesList() {
    $('seriesList').innerHTML = serState.items.map(function (it, i) {
      var tags = '';
      if (it.existing) tags += '<span class="tag">已在书库</span>';
      if (it.flag) tags += '<span class="tag flag">' + esc(it.flag) + '</span>';
      return '<label class="series-item' + (it.existing ? ' existing' : '') + '" data-i="' + i + '">' +
        '<input type="checkbox"' + (it.checked ? ' checked' : '') + (it.existing ? ' disabled' : '') + '>' +
        '<span><span class="si-title">' + esc(it.title) + '</span>' +
        (tags ? '<span class="si-sub">' + tags + '</span>' : '') +
        '</span></label>';
    }).join('');
    $('seriesList').querySelectorAll('.series-item').forEach(function (el) {
      var cb = el.querySelector('input');
      cb.addEventListener('change', function () {
        serState.items[+el.dataset.i].checked = cb.checked;
        updateSeriesCount();
      });
    });
    updateSeriesCount();
  }
  function updateSeriesCount() {
    var n = serState.items.filter(function (x) { return x.checked && !x.existing; }).length;
    $('btnSeriesAdd').textContent = n ? '添加选中的 ' + n + ' 本' : '添加选中的';
    $('btnSeriesAdd').disabled = n === 0;
  }
  function addSelectedSeriesBooks() {
    var picked = serState.items.filter(function (x) { return x.checked && !x.existing; });
    if (!picked.length) { toast('还没勾选任何书'); return; }
    picked.forEach(function (b) {
      records.push({
        id: uid(),
        title: b.title,
        author: b.author || serState.author,
        series: serState.series,
        owned: '否',
        binding: '', date: '', source: '', sourceUrl: '',
        price: '', publisher: '', note: '',
        grBookUrl: b.url,
        grSeriesUrl: serState.seriesUrl || '',
        grAuthorUrl: b.authorUrl || serState.authorUrl || '',
        goodreadsUrl: b.url
      });
    });
    save(); render();
    closeModal('seriesModal');
    toast('已添加 ' + picked.length + ' 本《' + serState.series + '》的书（状态：未购买）');
  }
  function importSeriesBooks(info) {
    toast('正在读取《' + info.series + '》系列书目…');
    var booksP = info.seriesUrl ? grSeriesBooks(info.seriesUrl) : Promise.reject(new Error('no url'));
    booksP = booksP.catch(function () {
      return ddgBookSearch('"' + info.series + '"').then(function (books) {
        return books.map(function (b) { return { title: b.title, url: b.url }; });
      });
    });
    booksP.then(function (books) {
      if (!books || !books.length) { toast('没解析到系列书目'); return; }
      openSeriesPicker(info, books);
    }).catch(function () { toast('读取系列书目失败（网络原因），稍后再试'); });
  }
  /* 三源并行，按可信度合并：
     ① 书页 HTML（有 book 链接时）——书名/系列名/序号/系列页链接，最权威
     ② auto_complete —— 作者名最可靠
     ③ Open Library —— 作者名兜底
     书名精确匹配才采用 GR 结果，避免把同名书的信息填错。 */
  function enrichFromGrBook(url, titleGuess) {
    toast('正在联网查询作者/系列…');
    var q = titleGuess || trim($('fTitle').value);
    var isBook = !!(url && /goodreads\.com\/book\/show\//i.test(url));
    var bookP = isBook
      ? grBookPageCached(url, trim($('fAuthor').value)).then(function (p) {
          return { title: p.title, author: p.author, series: p.series, seriesNum: p.seriesNum,
                   seriesUrl: p.seriesUrl, authorUrl: p.authorUrl };
        }).catch(function () { return null; })
      : Promise.resolve(null);
    var grP = q ? grAutoComplete(q).then(function (books) {
        var hit = pickExact(books, q);
        if (!hit) return null;
        return { title: hit.title, author: hit.author, series: hit.series,
                 seriesNum: hit.seriesNum, seriesUrl: '' };
      }).catch(function () { return null; }) : Promise.resolve(null);
    var olP = q ? fetch('https://openlibrary.org/search.json?title=' + encodeURIComponent(q) +
        '&fields=title,author_name,series&limit=3')
        .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
        .then(function (j) {
          var d = ((j && j.docs) || []).filter(function (x) { return x.author_name && x.author_name.length; })[0];
          if (!d) return null;
          return { title: d.title || '', author: (d.author_name || []).join(', '),
                   series: d.series && d.series.length ? d.series[0] : '',
                   seriesNum: '', seriesUrl: '' };
        })
        .catch(function () { return null; }) : Promise.resolve(null);

    Promise.all([bookP, grP, olP]).then(function (res) {
      var bookRes = res[0], grRes = res[1], olRes = res[2];
      function first(field) {
        var list = [bookRes, grRes, olRes];
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i][field]) return list[i][field];
        }
        return '';
      }
      var title = first('title') || q;
      if (!title) {
        toast('没查到这本书：请把书名填上，或换一条 Goodreads 书页链接');
        return;
      }
      var author = first('author'), series = first('series'),
          seriesUrl = first('seriesUrl'), authorUrl = first('authorUrl');
      $('fTitle').value = title;
      if (author) $('fAuthor').value = author;
      if (series) $('fSeries').value = series;
      if (seriesUrl) $('fGrSeriesUrlH').value = seriesUrl;
      if (authorUrl) $('fGrAuthorUrlH').value = authorUrl;
      if (!series && !isBook) {
        toast('已填好：' + title + (author ? ' / ' + author : '') +
          '（没查到系列信息；若确认有系列，可粘贴该书的 Goodreads 链接再识别一次）');
      }
      fetchSeriesLinkAndOffer({
        title: title, author: author, series: series, seriesNum: first('seriesNum'),
        seriesUrl: seriesUrl, authorUrl: authorUrl, url: url || ''
      });
    });
  }
  /* ============ GR 链接智能识别 ============
     粘贴 book/series/author 链接 → 解析出 ID 和名字 → 优先从本地书库匹配补全，
     书库没有的书再联网抓页面补作者/系列 */
  function parseGrUrl(url) {
    url = trim(url);
    /* 兼容三种写法：/book/show/44767458-dune、/book/show/44767458、/book/show/99219.The_Butlerian_Jihad */
    var m = url.match(/goodreads\.com\/book\/show\/(\d+)(?:[.-]([A-Za-z0-9_-]+))?/i);
    if (m) return { kind: 'book', id: m[1], slug: m[2] || '' };
    m = url.match(/goodreads\.com\/series\/(\d+)(?:-([A-Za-z0-9-]+))?/i);
    if (m) return { kind: 'series', id: m[1], slug: m[2] || '' };
    m = url.match(/goodreads\.com\/author\/show\/(\d+)\.?([A-Za-z0-9_-]+)?/i);
    if (m) return { kind: 'author', id: m[1], slug: m[2] || '' };
    return null;
  }
  function slugToName(slug) {
    if (!slug) return '';
    var s = decodeURIComponent(slug).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s.replace(/\b([a-z])/g, function (c) { return c.toUpperCase(); });
  }
  function normTitle(s) {
    return trim(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function findRecByGr(kind, id) {
    var pat = kind === 'series' ? '/series/' + id : '/' + kind + '/show/' + id;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      /* goodreadsUrl 可能存的是书页/系列/作者任意一种链接，都拿来比对编号 */
      var urls = kind === 'book' ? [r.grBookUrl, r.goodreadsUrl]
        : kind === 'series' ? [r.grSeriesUrl, r.goodreadsUrl]
          : [r.grAuthorUrl, r.goodreadsUrl];
      for (var j = 0; j < urls.length; j++) {
        if (urls[j] && urls[j].indexOf(pat) !== -1) return r;
      }
    }
    return null;
  }
  var __lastRecognize = { url: '', t: 0 };
  function recognizeGrUrl() {
    var url = trim($('fGrUrl').value);
    if (!url || !/goodreads\.com/i.test(url)) {
      toast('先把 Goodreads 链接粘贴到上面的框里（book/series/author 链接都可以）');
      return;
    }
    /* 粘贴失焦自动触发 + 点按钮会重复调用，8 秒内同链接只识别一次 */
    var now = Date.now();
    if (url === __lastRecognize.url && now - __lastRecognize.t < 8000) return;
    __lastRecognize = { url: url, t: now };
    var p = parseGrUrl(url);
    if (!p) { toast('识别不了这个链接：需要 /book/show/、/series/ 或 /author/show/ 的网址'); return; }
    if (p.kind === 'book') {
      var rec = findRecByGr('book', p.id);
      var titleGuess = slugToName(p.slug);
      /* 编号没匹配上（旧数据只存了系列/作者链接）→ 按书名兜底匹配 */
      if (!rec && titleGuess) {
        var nt = normTitle(titleGuess);
        for (var i = 0; i < records.length; i++) {
          if (normTitle(records[i].title) === nt) { rec = records[i]; break; }
        }
      }
      if (rec) {
        fillFromBook(rec);
        $('fGrUrl').value = url;
        $('fGrBookUrlH').value = rec.grBookUrl || url;
        toast('已从书库识别这本书，书名/作者/系列和三个链接都填好了');
      } else {
        if (!$('fTitle').value) $('fTitle').value = titleGuess;
        $('fGrBookUrlH').value = url;
        toast('书库还没有这本书：已填书名和书页链接，正在联网获取作者/系列…');
        enrichFromGrBook(url, titleGuess);
      }
    } else if (p.kind === 'series') {
      var recS = findRecByGr('series', p.id);
      var seriesGuess = slugToName(p.slug);
      if (!recS && seriesGuess) {
        var ns = normTitle(seriesGuess);
        for (var k = 0; k < records.length; k++) {
          if (normTitle(records[k].series) === ns) { recS = records[k]; break; }
        }
      }
      var seriesName = (recS && trim(recS.series)) || seriesGuess;
      if (seriesName) $('fSeries').value = seriesName;
      if (recS && trim(recS.author)) $('fAuthor').value = trim(recS.author);
      $('fGrSeriesUrlH').value = url;
      if (recS && trim(recS.grAuthorUrl)) $('fGrAuthorUrlH').value = trim(recS.grAuthorUrl);
      toast(recS ? '已从书库识别这个系列，系列和作者都填好了' : '已填系列名（来自链接），作者请补一下');
      setTimeout(function () {
        if (confirm('要读取《' + seriesName + '》的书单，把没记录的书自动加为「未购买」吗？\n（需要联网，失败的话不影响已填的内容）')) {
          importSeriesBooks({
            series: seriesName, seriesUrl: url,
            author: trim($('fAuthor').value),
            authorUrl: trim($('fGrAuthorUrlH').value)
          });
        }
      }, 250);
    } else if (p.kind === 'author') {
      var recA = findRecByGr('author', p.id);
      var authorName = (recA && trim(recA.author)) || slugToName(p.slug);
      if (authorName && !$('fAuthor').value) $('fAuthor').value = authorName;
      $('fGrAuthorUrlH').value = url;
      toast('已填作者' + (recA ? '（来自书库）' : '（来自链接解析）'));
    }
  }
  $('btnGrParse').addEventListener('click', recognizeGrUrl);
  $('fGrUrl').addEventListener('change', function () {
    if (/goodreads\.com/i.test(this.value)) recognizeGrUrl();
  });
  /* 串行取数：先 Goodreads，失败或超时才退到 Open Library。
     原先两路并发 + 共享 done 标志，OL 是直连（<1 秒）永远抢赢，
     导致用户看到的永远是「OL 结果（系列书单需 Goodreads）」——本功能失效的主因。 */
  $('btnGrFetch').addEventListener('click', function () {
    var q = trim($('fTitle').value);
    if (!q && /goodreads\.com/i.test($('fGrUrl').value)) { recognizeGrUrl(); return; }
    if (!q) { toast('先填书名，或粘贴一条 Goodreads 链接'); return; }
    var btn = this;
    btn.disabled = true;
    btn.textContent = '查询中…';
    var settled = false;
    function stop() { settled = true; btn.disabled = false; btn.textContent = '获取'; }
    function olFallback() {
      return fetch('https://openlibrary.org/search.json?title=' + encodeURIComponent(q) +
        '&fields=title,author_name,series&limit=6')
        .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
        .then(function (j) {
          var docs = (j && j.docs) || [];
          if (settled || !docs.length) throw new Error('ol-empty');
          stop();
          showOlCandidates(docs.map(function (d) {
            return {
              title: d.title,
              author: (d.author_name || []).join(', '),
              series: d.series && d.series.length ? d.series[0] : ''
            };
          }));
          toast('Goodreads 没连上，这里是 Open Library 的结果（可填作者/系列名；系列书单需要 Goodreads）');
        });
    }
    grAutoComplete(q).then(function (books) {
      if (settled || !books.length) throw new Error('gr-empty');
      stop();
      showGrCandidates(books.map(function (b) {
        return { title: b.title, author: b.author, series: b.series,
                 url: b.url, authorUrl: b.authorUrl };
      }), 'Goodreads 结果（点选自动填作者/系列，并读取整条系列书目）');
    }).catch(function () {
      if (settled) return;
      return olFallback().catch(function () {
        if (settled) return;
        stop();
        hideSuggest();
        toast('连不上图书数据源。请在右上角「设置」里填 Jina API Key（必填），或开启代理/VPN 后再试');
      });
    });
    /* 安全网：60 秒后仍未结束就解锁按钮并说明原因 */
    setTimeout(function () {
      if (settled) return;
      stop();
      hideSuggest();
      toast('查询超时（60 秒）：网络或 Jina Key 有问题');
    }, 70000);
  });

  /* ============ 弹层控制 ============ */
  function openModal(id) { $(id).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal(id) {
    $(id).hidden = true;
    if ($('detailModal').hidden && $('formModal').hidden && $('importModal').hidden &&
        $('settingsModal').hidden && $('seriesModal').hidden && $('subModal').hidden &&
        $('boxModal').hidden && $('fxModal').hidden) {
      document.body.style.overflow = '';
    }
  }
  ['detailModal', 'formModal', 'importModal', 'settingsModal', 'seriesModal', 'subModal', 'boxModal', 'fxModal'].forEach(function (mid) {
    $(mid).addEventListener('click', function (e) { if (e.target === $(mid)) closeModal(mid); });
  });
  $('btnSettings').onclick = function () {
    $('grKeyInput').value = localStorage.getItem('grProxyKey') || '';
    openModal('settingsModal');
  };
  $('btnSettingsCancel').onclick = function () { closeModal('settingsModal'); };
  $('btnSettingsSave').onclick = function () {
    var k = trim($('grKeyInput').value);
    if (k) localStorage.setItem('grProxyKey', k);
    else localStorage.removeItem('grProxyKey');
    closeModal('settingsModal');
    toast(k ? '已保存 Key，「获取」现在优先走 Jina（不开 VPN 也能查 GR）' : '已清除 Key');
  };

  /* ============ 事件绑定 ============ */
  /* 多选操作条 */
  $('btnSelectAll').onclick = function () {
    filtered().forEach(function (r) { selected[r.id] = 1; });
    render();
  };
  $('btnSelectNone').onclick = function () { selected = {}; render(); };
  $('btnBatchDelete').onclick = batchDelete;
  $('btnExitSelect').onclick = exitSelectMode;
  /* 系列书目挑选弹层 */
  $('btnSeriesCancel').onclick = function () { closeModal('seriesModal'); };
  $('btnSeriesAdd').onclick = addSelectedSeriesBooks;
  $('btnSerAll').onclick = function () {
    serState.items.forEach(function (x) { if (!x.existing) x.checked = true; });
    renderSeriesList();
  };
  $('btnSerNone').onclick = function () {
    serState.items.forEach(function (x) { x.checked = false; });
    renderSeriesList();
  };
  $('btnSerClean').onclick = function () {
    serState.items.forEach(function (x) { x.checked = !x.existing && !x.flag; });
    renderSeriesList();
  };

  $('btnSelectMode').onclick = function () { enterSelectMode(null); };
  if ($('btnBackfill')) $('btnBackfill').onclick = backfillLinks;

  $('btnAdd').onclick = function () { openForm(null); };
  $('btnCancel').onclick = function () { closeModal('formModal'); };
  $('searchInput').addEventListener('input', function () { state.q = this.value; render(); });
  $('sortSelect').addEventListener('change', function () { state.sort = this.value; render(); });
  if ($('genreFilter')) {
    $('genreFilter').addEventListener('change', function () { state.genre = this.value; render(); });
  }
  if ($('readList')) {
    $('readList').addEventListener('click', function (e) {
      var a = e.target.closest('[data-read]');
      if (!a || e.target.closest('a[data-gr]')) return;
      openDetail(a.dataset.read);
    });
  }
  /* 编辑页里点「标记已读」时用不到单独按钮，走标签页就行 */
  $('filterRow').querySelectorAll('.chip').forEach(function (chip) {
    chip.onclick = function () {
      $('filterRow').querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      state.filter = chip.dataset.filter;
      render();
    };
  });

  /* ============ Excel 导出 ============ */
  function colName(i) {
    var s = '';
    i = i + 1;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; }
    return s;
  }

  $('btnExport').onclick = function () {
    if (!records.length) { toast('暂无数据可导出'); return; }
    /* 腾讯文档原格式：第 1 行空，表头在第 2 行（B~K），数据从第 3 行开始 */
    var COLS = ['是否入手', '系列', '书名', '作者', '平装/精装', '购入日期', '购入来源', '价格', '出版社', '备注',
      '币种', '折合人民币', '类型', '阅读状态', '评分', '读完日期', 'ISBN'];
    var rowBlank = new Array(COLS.length + 1).fill('');
    var aoa = [rowBlank, [''].concat(COLS)].concat(records.map(function (r) {
      var cny = cnyOf(r);
      return ['', r.owned, r.series, r.title, r.author, r.binding, r.date,
        r.source, r.price, r.publisher, r.note, curOf(r),
        cny == null ? '' : (+cny).toFixed(2),
        r.genre, r.readStatus, r.rating, r.finishDate, r.isbn]
        .map(function (v) { return v == null ? '' : v; });
    }));
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    /* 超链接写回原单元格：系列/书名/作者/购入来源（有链接才写） */
    records.forEach(function (r, i) {
      var row = i + 3;
      var book = trim(r.grBookUrl) || trim(r.goodreadsUrl);
      if (book) { ws['D' + row] = ws['D' + row] || {}; ws['D' + row].l = { Target: book }; }
      if (trim(r.grSeriesUrl)) { ws['C' + row] = ws['C' + row] || {}; ws['C' + row].l = { Target: trim(r.grSeriesUrl) }; }
      if (trim(r.grAuthorUrl)) { ws['E' + row] = ws['E' + row] || {}; ws['E' + row].l = { Target: trim(r.grAuthorUrl) }; }
      if (trim(r.sourceUrl)) { ws['H' + row] = ws['H' + row] || {}; ws['H' + row].l = { Target: trim(r.sourceUrl) }; }
    });
    ws['!cols'] = [{ wch: 4 }].concat(COLS.map(function (h) { return { wch: h === '备注' ? 40 : 16 }; }));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '书籍购入');
    var d = new Date();
    var fname = '书籍购入-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '.xlsx';
    XLSX.writeFile(wb, fname);
    toast('已导出 ' + records.length + ' 条（腾讯文档原格式）');
  };


  /* ============ CSV 导入 ============
     吸收了朋友那份的几个做法：
     ① 编码嗅探：先按 UTF-8 严格解，失败自动退 GBK（中文表格最常见的坑）
     ② 分隔符探测：逗号 / 分号
     ③ 中英文表头别名表
     ④ 三级匹配：ISBN → 书名+作者 → 书名唯一时才认；而且同一条已有记录不会被两行 CSV 抢走
     ⑤ 非破坏性合并：CSV 空白的字段不覆盖已有资料
     ⑥ 空间不足时整体回滚，不留半截数据
     */
  var CSV_ALIAS = {
    title: ['title', 'book title', '书名', '英文书名', '书籍名称'],
    author: ['author', 'authors', '作者'],
    isbn: ['isbn', 'isbn13', 'isbn-13', 'isbn10', 'isbn-10', '书号'],
    publisher: ['publisher', '出版社'],
    series: ['series', 'series name', '系列', '系列名称'],
    owned: ['owned', '是否入手', '收藏状态', '持有状态'],
    binding: ['binding', '装帧', '平装/精装', '版本'],
    date: ['date', 'purchase date', 'date purchased', '购入日期', '购买日期'],
    source: ['source', '购入来源', '来源', '购买渠道'],
    price: ['price', 'cost', 'purchase price', '价格', '购买价格', '购入价格', '购买成本'],
    currency: ['currency', '币种', '购入币种'],
    note: ['note', 'notes', '备注', '笔记'],
    genre: ['genre', 'category', 'type', '类型', '分类'],
    readStatus: ['read status', 'reading status', 'status', '阅读状态'],
    rating: ['rating', '评分', '阅读评分'],
    finishDate: ['finish date', 'date finished', '读完日期', '完成日期'],
    sourceUrl: ['url', 'link', '购买链接', '链接'],
    grUrl: ['goodreads', 'goodreads url', 'goodreads链接', 'goodreads 链接']
  };

  function parseCsvText(text) {
    text = text.replace(/^\uFEFF/, '');
    var first = text.split(/\r?\n/, 1)[0] || '';
    var comma = (first.match(/,/g) || []).length;
    var semi = (first.match(/;/g) || []).length;
    var tab = (first.match(/\t/g) || []).length;
    var d = tab > comma && tab > semi ? '\t' : (semi > comma ? ';' : ',');
    var rows = [], row = [], cell = '', quoted = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i], next = text[i + 1];
      if (quoted) {
        if (ch === '"' && next === '"') { cell += '"'; i++; }
        else if (ch === '"') { quoted = false; }
        else { cell += ch; }
      } else if (ch === '"' && cell === '') { quoted = true; }
      else if (ch === d) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
      else { cell += ch; }
    }
    if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return trim(v) !== ''; }); });
  }
  function normKey(s) {
    return trim(s).normalize ? trim(s).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')
      : trim(s).toLowerCase().replace(/\s+/g, ' ');
  }
  function normOwned(v) {
    var s = trim(v);
    if (/^(true|1|y|yes|是|已到手|在藏)$/i.test(s)) return '是';
    if (/没到手|未到|待收|运输中/.test(s)) return '没到手';
    if (/^(false|0|n|no|否|未购买|想买|待购)$/i.test(s)) return '否';
    return s ? '是' : '';
  }
  function importCsv(file) {
    var overwrite = $('importOverwrite').checked;
    closeModal('importModal');
    toast('正在读取 ' + file.name + '…');
    var reader = new FileReader();
    reader.onload = function (ev) {
      var buf = ev.target.result;
      var raw = null, enc = 'UTF-8';
      try { raw = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
      catch (e1) {
        try { raw = new TextDecoder('gbk').decode(buf); enc = 'GBK'; }
        catch (e2) { toast('认不出这个文件的编码，请另存为 UTF-8 或 GBK 再试'); return; }
      }
      applyCsvText(raw, enc, file.name, overwrite);
    };
    reader.readAsArrayBuffer(file);
  }
  /* 真正干活的纯逻辑：给一段 CSV 文本就干活，方便单测（也方便以后接别的来源） */
  function applyCsvText(raw, enc, fileName, overwrite) {
    {
      var rows = parseCsvText(raw);
      if (rows.length < 2) { toast('文件里没有数据行'); return; }
      var headers = rows[0].map(normKey), map = {}, fi;
      Object.keys(CSV_ALIAS).forEach(function (f) {
        for (var i = 0; i < headers.length; i++) {
          if (map[f] !== undefined) break;
          if (CSV_ALIAS[f].some(function (a) { return normKey(a) === headers[i]; })) map[f] = i;
        }
      });
      if (map.title === undefined) {
        toast('没找到「书名」列。认到的表头：' + rows[0].filter(Boolean).join('、'));
        return;
      }
      var incoming = [];
      rows.slice(1).forEach(function (r) {
        var o = {};
        Object.keys(CSV_ALIAS).forEach(function (k) {
          o[k] = map[k] === undefined ? '' : trim(r[map[k]]);
        });
        if (!o.title) return;
        incoming.push(o);
      });
      if (!incoming.length) { toast('没有有效的书籍记录'); return; }

      /* 三级匹配索引 */
      var byIsbn = {}, byTitleAuthor = {}, byTitle = {}, used = {};
      function push(map, k, idx) { if (!k) return; (map[k] = map[k] || []).push(idx); }
      records.forEach(function (b, i) {
        push(byIsbn, normKey(b.isbn).replace(/[-\s]/g, ''), i);
        push(byTitleAuthor, normKey(b.title) + '|' + normKey(b.author), i);
        push(byTitle, normKey(b.title), i);
      });
      function take(arr) {
        if (!arr) return undefined;
        for (var i = 0; i < arr.length; i++) if (!used[arr[i]]) return arr[i];
        return undefined;
      }
      var next = overwrite ? [] : records.slice();
      if (overwrite) { byIsbn = {}; byTitleAuthor = {}; byTitle = {}; used = {}; }
      var added = 0, updated = 0, priceUp = 0, titleOnly = 0;
      /* 新增的记录先攒在这里，最后统一并入 next 的开头。
         ⚠️ 绝对不能在循环里直接 next.unshift() —— 那会把数组整体右移，
         而下面用的是「按索引匹配已有记录」，一旦移位，
         后面所有行都会更新到错的记录上（实测会把已有书整条改写）。 */
      var fresh = [];
      incoming.forEach(function (o) {
        var isbn = normKey(o.isbn).replace(/[-\s]/g, '');
        var t = normKey(o.title), a = normKey(o.author);
        var idx = isbn ? take(byIsbn[isbn]) : undefined;
        if (idx === undefined && t && a) idx = take(byTitleAuthor[t + '|' + a]);
        /* 第三级：书名在库里唯一就认，即使作者写法不同。
           中文表格常把作者写成译名（「休·豪伊」vs「Hugh Howey」），
           只按「书名+作者」认不出，会白白多出一条重复记录。
           只在书名唯一时才这么做（同名多本一律不认），并单独计数告知用户。 */
        if (idx === undefined && t) {
          var c = byTitle[t] || [];
          if (c.length === 1 && !used[c[0]]) { idx = c[0]; titleOnly++; }
        }
        var data = {};
        if (o.title) data.title = o.title;
        if (o.author) data.author = o.author;
        if (o.isbn) data.isbn = o.isbn.replace(/[-\s]/g, '');
        if (o.publisher) data.publisher = o.publisher;
        if (o.series) data.series = o.series;
        if (o.binding) data.binding = o.binding;
        if (o.date) data.date = normalizeDate(o.date);
        if (o.source) data.source = o.source;
        if (o.note) data.note = o.note;
        if (o.genre) data.genre = o.genre;
        if (o.readStatus) data.readStatus = o.readStatus;
        if (o.rating) data.rating = o.rating;
        if (o.finishDate) data.finishDate = normalizeDate(o.finishDate);
        if (o.sourceUrl) data.sourceUrl = o.sourceUrl;
        if (o.owned) data.owned = normOwned(o.owned);
        if (o.price) {
          data.price = normalizePrice(o.price);
          data.currency = o.currency ? o.currency.toUpperCase() : 'CNY';
        } else if (o.currency) {
          data.currency = o.currency.toUpperCase();
        }
        if (o.grUrl && isGR(o.grUrl)) { data.goodreadsUrl = o.grUrl; data.grBookUrl = o.grUrl; }
        if (idx !== undefined) {
          used[idx] = 1;
          var merged = {};
          Object.keys(next[idx]).forEach(function (k) { merged[k] = next[idx][k]; });
          Object.keys(data).forEach(function (k) { if (data[k] !== '' && data[k] != null) merged[k] = data[k]; });
          if (data.price) priceUp++;
          next[idx] = merged;
          updated++;
        } else {
          data.id = uid();
          if (!data.currency) data.currency = 'CNY';
          if (!data.owned) data.owned = '否';
          fresh.push(data);
          added++;
        }
      });
      var summary = '编码：' + enc + '\n' + '识别书籍：' + incoming.length + ' 本\n' +
        '更新已有：' + updated + ' 本　新增：' + added + ' 本\n' + '价格更新：' + priceUp + ' 条\n' +
        (titleOnly ? '其中 ' + titleOnly + ' 条是「仅书名相同、作者写法不同」匹配上的，请核对\n' : '') +
        '\n匹配顺序：ISBN → 书名+作者 → 书名唯一\n' +
        'CSV 里空白的字段不会覆盖已有资料。\n\n' + (overwrite ? '⚠️ 已勾选「导入前清空」\n' : '') + '继续导入？';
      if (!confirm(summary)) { toast('已取消导入'); return; }
      var backup = records;
      try {
        records = fresh.concat(next);
        save();
        render();
        toast('CSV 导入完成：更新 ' + updated + ' 本，新增 ' + added + ' 本');
      } catch (err) {
        records = backup;
        toast(/quota/i.test(String(err)) || (err && err.name === 'QuotaExceededError')
          ? '手机存储空间不足，已回滚。先导出备份再清理。' : '保存失败，已回滚：' + err.message);
      }
      return { added: added, updated: updated, enc: enc, priceUp: priceUp, titleOnly: titleOnly };
    }
  }

  /* ============ Excel 导入 ============ */
  var HEADER_ALIAS = {
    '是否入手': 'owned', '系列': 'series', '书名': 'title', '作者': 'author',
    '平装/精装': 'binding', '装帧': 'binding', '购入日期': 'date', '购入来源': 'source',
    '价格': 'price', '出版社': 'publisher', '备注': 'note',
    '币种': 'currency', '货币': 'currency',
    '类型': 'genre', '分类': 'genre', 'genre': 'genre',
    '阅读状态': 'readStatus', '评分': 'rating', '读完日期': 'finishDate', 'isbn': 'isbn', 'ISBN': 'isbn',
    '购买链接': 'sourceUrl', 'goodreads链接': 'goodreadsUrl', 'goodreads url': 'goodreadsUrl'
  };

  $('btnImport').onclick = function () { openModal('importModal'); };
  $('btnImportCancel').onclick = function () { closeModal('importModal'); };
  $('btnImportGo').onclick = function () { $('fileInput').click(); };

  $('fileInput').addEventListener('change', function () {
    var file = this.files[0];
    this.value = '';
    if (!file) return;
    if (/\.csv$/i.test(file.name) || /csv/i.test(file.type)) { importCsv(file); return; }
    var overwrite = $('importOverwrite').checked;
    closeModal('importModal');
    var reader = new FileReader();
    reader.onload = function (ev) { importExcel(ev.target.result, overwrite); };
    reader.readAsArrayBuffer(file);
  });

  function importExcel(buf, overwrite) {
    var wb;
    try {
      wb = XLSX.read(buf, { type: 'array', raw: false, cellDates: false });
    } catch (e) { toast('文件解析失败：' + e.message); return; }

    var ws = wb.Sheets['书籍购入'] || wb.Sheets[wb.SheetNames[0]];
    if (!ws) { toast('Excel 中没有工作表'); return; }
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (!rows.length) { toast('工作表是空的'); return; }

    /* sheet_to_json 会丢弃表头前面的空行/空列，用 !ref 定位真实 Excel 行列号 */
    var range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    var rowBase = range.s.r; // rows[i] 对应 Excel 第 rowBase + i + 1 行
    var colBase = range.s.c; // rows[i][j] 对应第 colBase + j 列

    /* 定位表头行 */
    var headerIdx = -1, best = 1;
    rows.slice(0, 10).forEach(function (row, i) {
      var hits = row.filter(function (c) { return HEADER_ALIAS[trim(c)]; }).length;
      if (hits > best) { best = hits; headerIdx = i; }
    });
    if (headerIdx === -1) headerIdx = rows.length > 1 ? 1 : 0; // 兜底：第二行
    var colMap = {};
    rows[headerIdx].forEach(function (c, i) {
      var f = HEADER_ALIAS[trim(c)];
      if (f && colMap[f] === undefined) colMap[f] = i;
    });
    if (colMap.title === undefined) { toast('找不到「书名」列，请确认是导出的书籍购入表'); return; }

    extractHyperlinks(buf, wb, ws).then(function (links) {
      var added = 0, updated = 0;
      var byKey = {};
      records.forEach(function (r) { byKey[keyOf(r)] = r; });
      if (overwrite) { records = []; byKey = {}; }

      rows.slice(headerIdx + 1).forEach(function (row, ri) {
        var excelRow = rowBase + headerIdx + 1 + ri + 1;
        function cell(field) {
          var ci = colMap[field];
          return ci === undefined ? '' : trim(row[ci]);
        }
        var title = cell('title');
        if (!title) return;
        /* 各列超链接分类：书名/系列/作者列上的 Goodreads 链接分开存，来源列存购买链接
           腾讯文档导出的 xlsx 里链接常以 HYPERLINK() 公式保存，这里一并解析 */
        function linkOf(ci) {
          var ref = colName(colBase + ci) + excelRow;
          var u = links[ref];
          if (!u) {
            var c = ws[ref];
            if (c && c.f) {
              var m = String(c.f).match(/HYPERLINK\(\s*"([^"]+)"/i) || String(c.f).match(/HYPERLINK\(\s*'([^']+)'/i);
              if (m) u = m[1];
            }
          }
          return u;
        }
        var grBook = '', grSeries = '', grAuthor = '', src = '';
        var uTitle = linkOf(colMap.title);
        if (uTitle && isGR(uTitle)) grBook = uTitle;
        if (colMap.series !== undefined) {
          var uSeries = linkOf(colMap.series);
          if (uSeries && isGR(uSeries)) grSeries = uSeries;
        }
        if (colMap.author !== undefined) {
          var uAuthor = linkOf(colMap.author);
          if (uAuthor && isGR(uAuthor)) grAuthor = uAuthor;
        }
        if (colMap.source !== undefined) {
          var su = linkOf(colMap.source);
          if (su && !isGR(su)) src = su;
        }
        var owned = cell('owned');
        if (/^(true|1|y)$/i.test(owned)) owned = '是';
        else if (/^(false|0|n)$/i.test(owned)) owned = '否';

        var recData = {
          title: title,
          series: cell('series'),
          author: cell('author'),
          owned: owned,
          binding: cell('binding'),
          date: normalizeDate(cell('date')),
          source: cell('source'),
          price: normalizePrice(cell('price')),
          currency: cell('currency') ? cell('currency').toUpperCase() : '',
          isbn: cell('isbn').replace(/[-\s]/g, ''),
          genre: cell('genre'), readStatus: cell('readStatus'),
          rating: cell('rating'), finishDate: normalizeDate(cell('finishDate')),
          publisher: cell('publisher'),
          note: cell('note'),
          sourceUrl: cell('sourceUrl') || src,
          grBookUrl: grBook,
          grSeriesUrl: grSeries,
          grAuthorUrl: grAuthor,
          goodreadsUrl: grBook || grSeries || grAuthor
        };
        if (!recData.currency) recData.currency = 'CNY';
        var key = keyOf(recData);
        var exist = byKey[key];
        if (exist) {
          Object.keys(recData).forEach(function (k) {
            if (!recData[k] && (k === 'goodreadsUrl' || k === 'sourceUrl' || k === 'currency' ||
              k === 'grBookUrl' || k === 'grSeriesUrl' || k === 'grAuthorUrl')) return;
            exist[k] = recData[k];
          });
          updated++;
        } else {
          recData.id = uid();
          records.push(recData);
          byKey[key] = recData;
          added++;
        }
      });

      save(); render();
      toast('导入完成：新增 ' + added + ' 条，更新 ' + updated + ' 条');
    }).catch(function () {
      toast('读取链接失败，仅导入文本内容');
    });
  }

  function keyOf(r) {
    return (trim(r.title) + '|' + trim(r.author)).toLowerCase();
  }
  function normalizeDate(s) {
    var m = trim(s).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    return m ? m[1] + '/' + parseInt(m[2], 10) + '/' + parseInt(m[3], 10) : trim(s);
  }
  function normalizePrice(s) {
    s = trim(s).replace(/[,，\s]/g, '');
    var n = parseFloat(s);
    return isNaN(n) ? trim(s) : String(n);
  }

  /* 从 xlsx 里解析单元格超链接（SheetJS CE 不暴露，手动解 zip） */
  function extractHyperlinks(buf, wb, ws) {
    return JSZip.loadAsync(buf).then(function (zip) {
      return zip.file('xl/workbook.xml').async('string').then(function (wbXml) {
        var doc = new DOMParser().parseFromString(wbXml, 'application/xml');
        var sheets = doc.getElementsByTagNameNS('*', 'sheet');
        var targetName = null;
        for (var i = 0; i < sheets.length; i++) {
          var name = sheets[i].getAttribute('name');
          if (name === '书籍购入') {
            targetName = name;
            break;
          }
          if (i === 0) targetName = name;
        }
        /* 找到该 sheet 的 rId → xml 路径 */
        var rid = null;
        for (var j = 0; j < sheets.length; j++) {
          if (sheets[j].getAttribute('name') === targetName) {
            rid = sheets[j].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
            break;
          }
        }
        return zip.file('xl/_rels/workbook.xml.rels').async('string').then(function (relsXml) {
          var rels = new DOMParser().parseFromString(relsXml, 'application/xml');
          var relEls = rels.getElementsByTagNameNS('*', 'Relationship');
          var sheetPath = null;
          for (var k = 0; k < relEls.length; k++) {
            if (relEls[k].getAttribute('Id') === rid) {
              var t = relEls[k].getAttribute('Target');
              sheetPath = t.charAt(0) === '/' ? t.replace(/^\//, '') : 'xl/' + t;
              break;
            }
          }
          if (!sheetPath || !zip.file(sheetPath)) return {};
          var base = sheetPath.split('/').pop();
          var relsPath = 'xl/worksheets/_rels/' + base + '.rels';
          return Promise.all([
            zip.file(sheetPath).async('string'),
            zip.file(relsPath) ? zip.file(relsPath).async('string') : '{}'
          ]).then(function (res) {
            var relMap = {};
            var relDoc = new DOMParser().parseFromString(res[1], 'application/xml');
            var relList = relDoc.getElementsByTagNameNS('*', 'Relationship');
            for (var m = 0; m < relList.length; m++) {
              relMap[relList[m].getAttribute('Id')] = relList[m].getAttribute('Target');
            }
            var linkMap = {};
            var sheetDoc = new DOMParser().parseFromString(res[0], 'application/xml');
            var hls = sheetDoc.getElementsByTagNameNS('*', 'hyperlink');
            for (var n = 0; n < hls.length; n++) {
              var ref = hls[n].getAttribute('ref');
              var hrid = hls[n].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
              var url = relMap[hrid];
              if (!ref || !url || !/^https?:/i.test(url)) continue;
              expandRef(ref).forEach(function (cellRef) { linkMap[cellRef] = url; });
            }
            return linkMap;
          });
        });
      });
    });
  }
  function expandRef(ref) {
    var m = ref.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    if (!m) return [];
    if (!m[3]) return [ref];
    var out = [];
    var c1 = colIndex(m[1]), c2 = colIndex(m[3]);
    var r1 = +m[2], r2 = +m[4];
    for (var c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      for (var r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
        out.push(colName(c) + r);
      }
    }
    return out;
  }
  function colIndex(letters) {
    var n = 0;
    for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
    return n - 1;
  }


  /* ============================================================
     订阅盒子：The Broken Binding / Bookish and Spice / Eldritch King …
     每次扣款建一条「期次」，期次里的书目就是书库那套记录（书名/作者/系列/
     Goodreads 链接，用「获取」自动补全），并记录这期扣了没有、买了还是 skip 了。
     ============================================================ */
  var SUBS_PRESET = ['The Broken Binding', 'Bookish and Spice', 'Eldritch King'];

  /* 订阅名 → booksandspreadsheets.com 上的公司页。
     没手动选「数据源」的订阅，同步时按名字自动匹配这里（匹配到就落库，下次直接用）。
     —— The Broken Binding 实际订的是 SF&F；Fantasy / Sci-Fi 在 waitlist 上，先不绑。
     —— Bookish & Spice 订的是 Contemporary Romance。
     —— Eldritch King 那个站还没收录，留空，手动维护。 */
  var BS_DEFAULT = [
    { re: /broken\s*binding/i, slug: 'broken-binding-sci-fi-%26-fantasy' },
    { re: /bookish\s*[&＆]?\s*(?:and\s+)?spice/i, slug: 'bookish-%26-spice-contemporary-romance' },
    { re: /eldritch/i, slug: '' }
  ];
  function bsDefaultFor(name) {
    var n = trim(name);
    for (var i = 0; i < BS_DEFAULT.length; i++) if (BS_DEFAULT[i].re.test(n)) return BS_DEFAULT[i].slug;
    return '';
  }

  /* ---- 各家 bookbox 的年度 Skip 配额（数字） ----
     来源：booksandspreadsheets.com 的 sc1SkipPolicy 字段（原文由 sync_bs.py 每天抓，
     界面上会显示、并随官网更新）；Eldritch King 该站未收录（245 家已核），
     数字由用户提供。只在订阅自己没填配额时套用 —— 用户一填就以用户填的为准。 */
  var SKIP_PRESET = [
    { re: /broken\s*binding/i, total: 9, boxes: 12,
      note: '按月付 12 期/年，可跳 9 期。官网 sc1SkipPolicy 写的是「3 skips allowed per year」，备注补了一句「2026 转月度盒子后 9 skips」——按月付算取 9。' },
    { re: /bookish\s*[&＆]?\s*(?:and\s+)?spice/i, total: 3, boxes: 6,
      note: '双月刊 6 期/年，可跳 3 期（且不能连续跳超过 3 期）。官网 sc1SkipPolicy：3 skips allowed per year; no skipping more than 3 boxes in a row。' },
    { re: /eldritch/i, total: 1, boxes: 6,
      note: '6 期/年，可跳 1 期（booksandspreadsheets.com 未收录该商家，数字为手工填写）。' }
  ];
  function skipPresetFor(name) {
    var n = trim(name);
    for (var i = 0; i < SKIP_PRESET.length; i++) if (SKIP_PRESET[i].re.test(n)) return SKIP_PRESET[i];
    return null;
  }
  /* 官网原文优先（随同步自动更新），没有就退回预设里的说明 */
  function skipPolicyText(s) {
    var c = (s && trim(s.bsSlug)) ? bsCompany(s.bsSlug) : null;
    var t = c ? trim(c.skipPolicy) : '';
    var extra = c ? trim(c.note) : '';
    if (extra && /skip/i.test(extra) && extra.indexOf(t) < 0) t = t ? t + '；' + extra : extra;
    if (!t) { var pre = skipPresetFor(s && s.name); t = pre ? pre.note : ''; }
    return t;
  }

  function loadSubs() {
    var arr = null;
    try { var raw = localStorage.getItem(LS_SUBS); arr = raw ? JSON.parse(raw) : null; } catch (e) { arr = null; }
    if (!Array.isArray(arr)) {
      arr = SUBS_PRESET.map(function (n) {
        /* 只预置名字和已知的数据源；扣款日/金额等官网说了算，同步时再填 */
        return { id: uid(), name: n, site: '', cycle: 1, chargeDay: 0, amount: '',
                 currency: 'GBP', active: true, note: '', boxes: [],
                 bsSlug: bsDefaultFor(n) };
      });
    }
    arr.forEach(function (s) {
      if (!s.id) s.id = uid();
      if (!Array.isArray(s.boxes)) s.boxes = [];
      if (typeof s.cycle !== 'number' || (s.cycle !== 1 && s.cycle !== 2)) s.cycle = 1;
      if (typeof s.chargeDay !== 'number' || s.chargeDay < 0 || s.chargeDay > 31) s.chargeDay = 0;
      if (!s.currency || !fx[s.currency]) s.currency = 'GBP';
      if (typeof s.active !== 'boolean') s.active = true;
      /* Skip 配额：各家 bookbox 的年度配额不一样，所以按订阅单独存。
         跨年自动把「已用」清零（只在已经记过年份之后才动，避免把手工填的次数抹掉）。 */
      if (typeof s.skipTotal !== 'number' && s.skipTotal !== '') s.skipTotal = '';
      if (typeof s.skipUsed !== 'number') s.skipUsed = +s.skipUsed || 0;
      /* 自己没设过配额（skipAuto 不是 false）就按预设填一个，省得每次手填 */
      var _pre = skipPresetFor(s.name);
      if (_pre) {
        if (s.skipBoxes == null || s.skipBoxes === '') s.skipBoxes = _pre.boxes;
        if (s.skipAuto !== false && (s.skipTotal === '' || s.skipTotal == null)) {
          s.skipTotal = _pre.total;
          s.skipYear = s.skipYear || String(new Date().getFullYear());
        }
      }
      var _y = String(new Date().getFullYear());
      if (s.skipYear && s.skipYear !== _y) { s.skipYear = _y; s.skipUsed = 0; }
      if (!s.skipYear) s.skipYear = _y;
      s.boxes.forEach(function (b) {
        /* 期次的数组字段规范成数组：老数据 / 被合并进来的对象可能没有，
           缺了会让订阅页整页崩（提醒条那段会取 .length） */
        if (!Array.isArray(b.books)) b.books = [];
        if (!Array.isArray(b.bsBooks)) b.bsBooks = [];
        if (!b.id) b.id = uid();
        if (!Array.isArray(b.books)) b.books = [];
        if (!b.status) b.status = 'pending';
        if (!b.currency || !fx[b.currency]) b.currency = s.currency;
      });
    });
    return arr;
  }
  var subs = loadSubs();
  function saveSubs() { try { localStorage.setItem(LS_SUBS, JSON.stringify(subs)); } catch (e) { toast('保存失败：存储空间不足'); } }
  function subById(id) { for (var i = 0; i < subs.length; i++) if (subs[i].id === id) return subs[i]; return null; }
  function boxOf(s, id) { if (!s) return null; for (var i = 0; i < s.boxes.length; i++) if (s.boxes[i].id === id) return s.boxes[i]; return null; }

  /* ---- 日期小工具 ---- */
  function pad2(n) { return ('0' + n).slice(-2); }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function today0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function parseYmd(s) {
    var m = trim(s).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function daysFromToday(d) { return Math.round((d.getTime() - today0().getTime()) / 86400000); }
  function periodOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
  function periodLabel(p) { var m = trim(p).match(/^(\d{4})-(\d{2})$/); return m ? (+m[2]) + '月' : String(p || ''); }
  function cnDate(d) { return d ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : ''; }
  function gapText(g) { return g < 0 ? '已过 ' + (-g) + ' 天待处理' : g === 0 ? '今天扣款' : '还有 ' + g + ' 天'; }

  /* 下一次扣款日（没设扣款日返回 null）。扣款日大于当月天数时用当月最后一天 */
  function nextCharge(s, from) {
    if (!s.chargeDay) return null;
    from = from || today0();
    for (var k = 0; k < 36; k++) {
      var d = new Date(from.getFullYear(), from.getMonth() + k * s.cycle, 1);
      var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(s.chargeDay, last));
      d.setHours(0, 0, 0, 0);
      if (d.getTime() >= from.getTime()) return d;
    }
    return null;
  }
  /* 提醒清单：14 天内要扣款、或已过期还没处理 */
  function dueAlerts() {
    var out = [];
    subs.forEach(function (s) {
      if (!s.active) return;
      s.boxes.forEach(function (b) {
        if (b.status !== 'pending') return;
        var d = parseYmd(b.chargeDate);
        if (!d) return;
        var gap = daysFromToday(d);
        if (gap <= 14) out.push({ s: s, b: b, d: d, gap: gap });
      });
      var n = nextCharge(s);
      if (n && daysFromToday(n) <= 14) {
        var has = s.boxes.some(function (b) { return b.period === periodOf(n); });
        if (!has) out.push({ s: s, b: null, d: n, gap: daysFromToday(n) });
      }
    });
    out.sort(function (a, b) { return a.d - b.d; });
    return out;
  }
  /* 年度 Skip 配额：没设置就返回 null */
  function skipQuota(s) {
    if (!s || s.skipTotal === '' || s.skipTotal == null) return null;
    var total = parseInt(s.skipTotal, 10);
    if (isNaN(total) || total <= 0) return null;
    var used = parseInt(s.skipUsed, 10);
    if (isNaN(used) || used < 0) used = 0;
    return { total: total, used: used, left: total - used };
  }
  function quotaText(s) {
    var q = skipQuota(s);
    if (!q) return '';
    var bx = parseInt(s.skipBoxes, 10);
    return 'Skip ' + q.used + '/' + q.total + (q.left <= 0 ? '（已用完）' : '（剩 ' + q.left + '）') +
      (bx > 0 ? ' · ' + bx + ' 期/年' : '');
  }
  /* 期次上的 books / bsBooks 一律当数组用。
     老数据或被合并进来的对象可能没有这两个字段，一旦缺了，
     渲染订阅页时取 .length 会直接抛异常、整页白掉（这里真踩过），
     所以统一走这两个取值器，顺手补齐。 */
  function booksOf(b) { if (!Array.isArray(b.books)) b.books = []; return b.books; }
  function bsBooksOf(b) { if (!Array.isArray(b.bsBooks)) b.bsBooks = []; return b.bsBooks; }
  function makeBox(s, when) {
    var d = when || today0();
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    var cd = new Date(d.getFullYear(), d.getMonth(), Math.min(s.chargeDay || 1, last));
    return {
      id: uid(), period: periodOf(d), chargeDate: ymd(cd), status: 'pending',
      amount: trim(s.amount), currency: s.currency, note: '', books: []
    };
  }

  /* 把书挂到期次上（同一本书重复加只更新，不重复） */
  function attachBookToBox(subId, boxId, rec) {
    var s = subById(subId), b = boxOf(s, boxId);
    if (!s || !b || !rec) return false;
    var entry = {
      recId: rec.id, title: trim(rec.title), author: trim(rec.author), series: trim(rec.series),
      grBookUrl: trim(rec.grBookUrl) || trim(rec.goodreadsUrl),
      grAuthorUrl: trim(rec.grAuthorUrl), grSeriesUrl: trim(rec.grSeriesUrl),
      price: trim(rec.price), currency: curOf(rec)
    };
    var i;
    var _bk = booksOf(b);
    for (i = 0; i < _bk.length; i++) if (_bk[i].recId === rec.id) break;
    if (i < _bk.length) _bk[i] = entry; else _bk.push(entry);
    saveSubs();
    return true;
  }
  function bookFromBoxEntry(e) {
    /* 期次里的书优先取书库最新数据，取不到就用当时的快照 */
    for (var i = 0; i < records.length; i++) if (records[i].id === e.recId) return records[i];
    return e;
  }

  /* ---- 渲染 ---- */
  function boxBookHtml(s, b, e) {
    var r = bookFromBoxEntry(e);
    var url = trim(r.grBookUrl) || trim(r.goodreadsUrl);
    var title = trim(r.title) || '（无书名）';
    var tags = '';
    if (trim(r.series)) tags += '<span class="tag series">' + esc(r.series) + '</span>';
    if (trim(r.price)) tags += '<span class="tag price">' + esc(curSymbol(curOf(r)) + trim(r.price)) + '</span>';
    if (r.owned === '否' || !trim(r.owned)) tags += '<span class="tag">未入库</span>';
    return '<div class="box-book">' +
      '<div class="bb-main">' +
      (url ? '<a class="bb-title" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(title) + '</a>'
           : '<span class="bb-title plain">' + esc(title) + '</span>') +
      (trim(r.author) ? '<div class="bb-author">' + esc(r.author) + '</div>' : '') +
      (tags ? '<div class="bb-tags">' + tags + '</div>' : '') +
      '</div>' +
      '<button class="btn btn-small" type="button" data-act="unbind" data-sub="' + s.id + '" data-box="' + b.id +
      '" data-rec="' + esc(e.recId) + '">移除</button>' +
      '</div>';
  }
  function boxCardHtml(s, b) {
    var d = parseYmd(b.chargeDate);
    var stText = b.status === 'charged' ? '已扣款' : b.status === 'skipped' ? '已跳过'
      : b.status === 'cancelled' ? '已取消' : '待扣款';
    var amt = trim(b.amount) ? curSymbol(b.currency || s.currency) + b.amount : '';
    var _bb = booksOf(b);
    var books = _bb.length
      ? _bb.map(function (e) { return boxBookHtml(s, b, e); }).join('')
      : '<p class="box-empty">本期书目还没登记 —— 点「＋ 加书」，作者 / 系列 / Goodreads 链接和书库一样能自动补全。</p>';
    return '<div class="box-card ' + b.status + '">' +
      '<div class="box-head"><span class="box-period">' + esc(periodLabel(b.period)) + '</span>' +
      '<span class="box-st ' + b.status + '">' + stText + '</span>' +
      (amt ? '<span class="box-amt">' + esc(amt) + '</span>' : '') +
      '<span class="box-date">' + (d ? cnDate(d) + ' 扣款' : '未设日期') + '</span></div>' +
      (trim(b.note) ? '<div class="box-note">' + esc(b.note) + '</div>' : '') +
      bsBooksHtml(s, b) +
      '<div class="box-books">' + books + '</div>' +
      '<div class="box-actions">' +
      '<button class="btn btn-small" type="button" data-act="addbook" data-sub="' + s.id + '" data-box="' + b.id + '">＋ 加书</button>' +
      ((b.bsBooks && b.bsBooks.length) || (b.books && b.books.length)
        ? '<button class="btn btn-small" type="button" data-act="2lib" data-sub="' + s.id + '" data-box="' + b.id + '">📚 同步到书库</button>' : '') +
      (b.status === 'pending'
        ? '<button class="btn btn-small" type="button" data-act="charged" data-sub="' + s.id + '" data-box="' + b.id + '">标记已扣款</button>' +
          '<button class="btn btn-small" type="button" data-act="skipped" data-sub="' + s.id + '" data-box="' + b.id + '">跳过这期</button>'
        : '<button class="btn btn-small" type="button" data-act="reopen" data-sub="' + s.id + '" data-box="' + b.id + '">改回待扣款</button>') +
      '<button class="btn btn-small" type="button" data-act="editbox" data-sub="' + s.id + '" data-box="' + b.id + '">编辑</button>' +
      '</div></div>';
  }
  /* 卡片要显示的官网规则：同步过的用存下来的，没同步过就直接从同源 bs-subs.json 现查
     —— 这样不用点「同步官网数据」也能看到扣款日和 skip 政策 */
  function subBsInfo(s) {
    if (s.bsInfo) return s.bsInfo;
    var sl = trim(s.bsSlug) || bsDefaultFor(s.name);
    var c = sl ? bsCompany(sl) : null;
    if (!c) return null;
    return { name: c.name, slug: c.slug, url: '', renews: c.renews, skipDeadline: c.skipDeadline,
      skipPolicy: c.skipPolicy, note: c.note, cost: c.cost, ships: c.ships,
      website: c.website, at: '' };
  }
  function subCardHtml(s) {
    var n = nextCharge(s), badge;
    if (!s.active) badge = '<span class="sub-badge off">已停用</span>';
    else if (!s.chargeDay) badge = '<span class="sub-badge none">未设扣款日</span>';
    else {
      var gap = daysFromToday(n);
      badge = gap <= 14 ? '<span class="sub-badge due">' + gapText(gap) + '</span>'
        : '<span class="sub-badge">' + cnDate(n) + ' 扣款</span>';
    }
    var meta = [s.chargeDay ? (s.cycle === 2 ? '每两月 ' : '每月 ') + s.chargeDay + ' 日扣款' : '扣款日未设置'];
    if (trim(s.amount)) meta.push(curSymbol(s.currency) + s.amount + '（≈' + money(priceVal(s.amount) * (fx[s.currency] || 1)) + '）');
    if (trim(s.site)) meta.push('<a href="' + esc(s.site) + '" target="_blank" rel="noopener">官网</a>');
    var qs = skipQuota(s);
    if (qs) {
      meta.push('<span class="quota' + (qs.left <= 0 ? ' out' : qs.left <= 1 ? ' tight' : '') + '">' +
        esc(quotaText(s)) + '</span>');
    }
    var bsLine = '', _bi = subBsInfo(s);
    if (_bi) {
      bsLine = '<div class="bs-line">📋 官网：' + esc(bsRulesText(_bi).slice(0, 260)) +
        (_bi.url ? '　<a href="' + esc(_bi.url) + '" target="_blank" rel="noopener">来源页</a>' : '') +
        (_bi.at ? '<span class="bs-at">同步于 ' + esc(_bi.at.slice(0, 10)) + '</span>' : '') + '</div>';
    }
    var boxes = s.boxes.slice().sort(function (a, b) { return dateVal(b.chargeDate) - dateVal(a.chargeDate); });
    return '<div class="sub-card">' +
      '<div class="sub-head"><span class="sub-name">' + esc(s.name) + '</span>' + badge + '</div>' +
      '<div class="sub-meta">' + meta.join(' · ') + (trim(s.note) ? ' · ' + esc(s.note) : '') + '</div>' + bsLine +
      '<div class="sub-actions">' +
      '<button class="btn btn-small" type="button" data-act="newbox" data-sub="' + s.id + '">＋ 新建本期</button>' +
      '<button class="btn btn-small" type="button" data-act="edit" data-sub="' + s.id + '">编辑订阅</button>' +
      '<button class="btn btn-small" type="button" data-act="toggle" data-sub="' + s.id + '">' + (s.active ? '停用' : '启用') + '</button>' +
      '<button class="btn btn-small btn-danger" type="button" data-act="del" data-sub="' + s.id + '">删除</button>' +
      '</div>' +
      (boxes.length ? boxes.map(function (b) { return boxCardHtml(s, b); }).join('')
        : '<p class="box-empty">还没有期次。设好扣款日后点「＋ 新建本期」，就能记录这次扣款和本期书目了。</p>') +
      '</div>';
  }
  function renderSubs() {
    var list = $('subsList');
    if (!list) return;
    var yr = today0().getFullYear(), spend = 0, chargedN = 0, pendN = 0, skipN = 0;
    subs.forEach(function (s) {
      s.boxes.forEach(function (b) {
        if (b.status === 'charged') {
          var n = priceVal(b.amount);
          var d = parseYmd(b.chargeDate);
          if (n != null && (!d || d.getFullYear() === yr)) spend += n * (fx[b.currency || s.currency] || 1);
          chargedN++;
        } else if (b.status === 'pending') pendN++;
        else if (b.status === 'skipped') skipN++;
      });
    });
    if ($('subsTop')) {
      $('subsTop').innerHTML =
        '<div class="sum-tile"><div class="sum-num green">' + money(spend) + '</div>' +
        '<div class="sum-label">订阅已扣款（人民币 · ' + yr + '年）</div></div>' +
        '<div class="sum-tile"><div class="sum-num ' + (pendN ? 'orange' : '') + '">' + pendN + '</div>' +
        '<div class="sum-label">待处理期次</div></div>' +
        '<div class="sum-tile"><div class="sum-num blue">' + chargedN + '</div><div class="sum-label">已扣款期数</div></div>' +
        '<div class="sum-tile"><div class="sum-num">' + skipN + '</div><div class="sum-label">已跳过期数</div></div>';
    }
    var qalerts = [];
    subs.forEach(function (s) {
      if (!s.active) return;
      var q = skipQuota(s);
      if (q && q.left <= 1) qalerts.push({ s: s, q: q });
    });
    var al = $('subsAlert'), alerts = dueAlerts();
    if (al) {
      if (alerts.length || qalerts.length) {
        al.hidden = false;
        al.innerHTML = qalerts.map(function (x) {
          return '<div class="alert-row' + (x.q.left <= 0 ? ' late' : '') + '">' +
            (x.q.left <= 0 ? '⛔ ' : '⚠️ ') + '<b>' + esc(x.s.name) + '</b> 年度 Skip 配额' +
            (x.q.left <= 0 ? '已用完（' + x.q.used + '/' + x.q.total + '）—— 再跳可能会被强制扣款'
                           : '只剩 1 次（' + x.q.used + '/' + x.q.total + '）') +
            '<button class="btn btn-small" type="button" data-act="edit" data-sub="' + x.s.id + '">改配额</button></div>';
        }).join('') + alerts.slice(0, 4).map(function (a) {
          return '<div class="alert-row' + (a.gap < 0 ? ' late' : '') + '">' +
            (a.gap < 0 ? '⚠️ ' : '⏰ ') + '<b>' + esc(a.s.name) + '</b> ' + cnDate(a.d) + ' 扣款 · ' + gapText(a.gap) +
            (a.b ? ((a.b.books && a.b.books.length) ? ' · 已登记书目 ' + a.b.books.length + ' 本' : ' · 书目还没登记')
                 : ' <button class="btn btn-small" type="button" data-act="newbox" data-sub="' + a.s.id +
                   '" data-when="' + ymd(a.d) + '">建本期</button>') + '</div>';
        }).join('');
      } else { al.hidden = true; al.innerHTML = ''; }
    }
    var order = subs.slice().sort(function (a, b) {
      var na = nextCharge(a), nb = nextCharge(b);
      if (!na && !nb) return trim(a.name).localeCompare(trim(b.name));
      if (!na) return 1;
      if (!nb) return -1;
      return na - nb;
    });
    list.innerHTML = order.map(subCardHtml).join('');
  }
  /* 书库页顶部的扣款提醒 */
  function renderDueBanner() {
    var el = $('dueBanner');
    if (!el) return;
    var a = dueAlerts();
    if (!a.length) { el.hidden = true; el.innerHTML = ''; return; }
    var f = a[0];
    el.hidden = false;
    el.innerHTML = '<span>' + (f.gap < 0 ? '⚠️' : '⏰') + ' <b>' + esc(f.s.name) + '</b> ' + cnDate(f.d) +
      ' 扣款 · ' + gapText(f.gap) + (a.length > 1 ? '（另有 ' + (a.length - 1) + ' 个）' : '') + '</span>' +
      '<button class="btn btn-small" type="button" id="dueGo">查看</button>';
    if ($('dueGo')) $('dueGo').onclick = function () { setView('subs'); };
  }

  /* ---- 期次 → 书库 ----
     订阅扣款完成后，把这一期官网登记的书同步进书库，状态记「买了 · 没到手」。
     书库里已有同名的就不重复加。 */
  function boxLibraryRecord(s, b, x) {
    var design = (x.design && x.design.length) ? '装帧：' + x.design.join('；') + '　' : '';
    return {
      id: uid(),
      title: trim(x.bookTitle || x.title),
      author: trim(x.author),
      series: trim(x.series),
      owned: '没到手',
      binding: /hardcover/i.test(trim(x.featureType)) ? '精装' : '',
      date: fromInputDate(toInputDate(b.chargeDate)),
      source: s.name,
      sourceUrl: '',
      price: trim(b.amount) || trim(s.amount),
      currency: b.currency || s.currency || 'CNY',
      publisher: '',
      note: design + (x.editionUrl ? '官网：' + x.editionUrl : ''),
      goodreadsUrl: '', grBookUrl: '', grAuthorUrl: '', grSeriesUrl: ''
    };
  }
  function pushBoxToLibrary(s, b) {
    if (!s || !b) return 0;
    var list = (b.bsBooks && b.bsBooks.length) ? b.bsBooks : (b.books || []);
    if (!list.length) return 0;
    var added = 0;
    list.forEach(function (x) {
      var title = trim(x.bookTitle || x.title);
      if (!title) return;
      var nk = bookKey(title), i;
      for (i = 0; i < records.length; i++) if (bookKey(records[i].title) === nk) return;
      records.push(boxLibraryRecord(s, b, x));
      added++;
    });
    if (added) { save(); render(); }
    return added;
  }

  /* ---- 操作 ---- */
  function setBoxStatus(s, b, st) {
    if (!s || !b) return;
    if (st === 'charged' && !trim(b.amount) && trim(s.amount)) b.amount = trim(s.amount);
    /* 每次 Skip 计入年度配额；从「已跳过」改回别的状态就把这一次数还回去 */
    var wasSkip = b.status === 'skipped';
    if (st === 'skipped' && !wasSkip) s.skipUsed = (parseInt(s.skipUsed, 10) || 0) + 1;
    if (st !== 'skipped' && wasSkip) s.skipUsed = Math.max(0, (parseInt(s.skipUsed, 10) || 0) - 1);
    b.status = st;
    var added = st === 'charged' ? pushBoxToLibrary(s, b) : 0;   /* 扣款完成 → 这一期的书进书库 */
    saveSubs(); renderSubs(); render();
    var qt = '';
    var q = skipQuota(s);
    if (q && st === 'skipped') {
      qt = '　Skip ' + q.used + '/' + q.total +
        (q.left <= 0 ? '：⚠️ 今年配额已用完，再跳可能会被强制扣款' : q.left === 1 ? '：只剩 1 次了' : '');
    }
    toast(s.name + ' ' + periodLabel(b.period) + '：' +
      (st === 'charged' ? '已记扣款' + (added ? '，' + added + ' 本书已进书库（买了 · 没到手）' : '')
        : st === 'skipped' ? '已跳过' + qt : '改回待扣款'));
  }
  function unbindBook(s, b, recId) {
    if (!s || !b) return;
    b.books = booksOf(b).filter(function (e) { return e.recId !== recId; });
    saveSubs(); renderSubs(); toast('已从本期移除（书库记录还在）');
  }
  function deleteBox(s, b) {
    if (!s || !b) return;
    if (!confirm('删除 ' + s.name + ' ' + periodLabel(b.period) + ' 这一期？\n（只是删掉期次记录，书库里的书不受影响）')) return;
    s.boxes = s.boxes.filter(function (x) { return x.id !== b.id; });
    saveSubs(); renderSubs(); render(); toast('已删除该期');
  }
  function deleteSub(s) {
    if (!s) return;
    if (!confirm('删除订阅「' + s.name + '」？\n它下面的所有期次记录也会一起删掉（书库里的书不受影响）。')) return;
    subs = subs.filter(function (x) { return x.id !== s.id; });
    saveSubs(); renderSubs(); render(); toast('已删除订阅');
  }
  function newBoxNow(s, whenStr) {
    if (!s) return;
    var when = parseYmd(whenStr) || today0();
    if (!s.chargeDay) { toast('先给「' + s.name + '」填上扣款日，再建本期'); openSubForm(s); return; }
    if (s.boxes.some(function (b) { return b.period === periodOf(when); })) {
      toast(periodLabel(periodOf(when)) + ' 这一期已经建过了');
      return;
    }
    s.boxes.push(makeBox(s, when));
    saveSubs(); renderSubs(); render();
    toast('已建 ' + periodLabel(periodOf(when)) + ' 期，接着把本期书目加进去');
  }
  function subsClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;
    var s = subById(el.dataset.sub);
    var b = s ? boxOf(s, el.dataset.box) : null;
    if (act === 'newbox') newBoxNow(s, el.dataset.when);
    else if (act === 'edit') openSubForm(s);
    else if (act === 'toggle') { s.active = !s.active; saveSubs(); renderSubs(); render(); }
    else if (act === 'del') deleteSub(s);
    else if (act === 'addbook') { if (s && b) openFormForBox(s.id, b.id); }
    else if (act === 'charged') setBoxStatus(s, b, 'charged');
    else if (act === 'skipped') setBoxStatus(s, b, 'skipped');
    else if (act === 'reopen') setBoxStatus(s, b, 'pending');
    else if (act === 'editbox') openBoxForm(s, b);
    else if (act === 'unbind') unbindBook(s, b, el.dataset.rec);
    else if (act === '2lib') {
      var n = pushBoxToLibrary(s, b);
      renderSubs();
      toast(n ? '已把 ' + n + ' 本书加进书库（状态：买了 · 没到手）' : '这一期的书书库里都已经有了');
    }
    else if (act === 'bs2lib') {
      if (!s || !b) return;
      var x = (b.bsBooks || [])[+el.dataset.i];
      if (!x) return;
      openFormForBox(s.id, b.id);
      $('fTitle').value = x.bookTitle || '';
      if (x.cover) $('formBoxTip').innerHTML += '<br>官网封面：<a href="' + esc(x.cover) + '" target="_blank" rel="noopener">查看</a>';
      toast('书名已填好 —— 点「获取」就能自动补作者/系列/Goodreads 链接');
    }
  }




  /* ==================================================================
     封面：粘贴/拍照 → 四角拖动校正透视 → 存 IndexedDB
     ------------------------------------------------------------------
     为什么不用 localStorage：localStorage 总共只有约 5MB，而手机拍的封面照
     压到 1000px 也有几百 KB，存十几本就会爆，还会连带把文字记录一起写不进去
     （QuotaExceededError）。IndexedDB 是按 GB 算的，所以图片单独放这里，
     书库的 JSON 里只留一个短 ID。封面是「可选」的，不加也完全不影响使用。
     ================================================================== */
  var IDB_NAME = 'booktracker', IDB_STORE = 'covers';
  var idbP = null, coverUrls = {};
  function idbOpen() {
    if (idbP) return idbP;
    idbP = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('这个浏览器不支持 IndexedDB')); return; }
      var rq = indexedDB.open(IDB_NAME, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore(IDB_STORE); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
    return idbP;
  }
  function idbTx(mode, fn) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(IDB_STORE, mode), rq = fn(tx.objectStore(IDB_STORE));
        tx.oncomplete = function () { res(rq && rq.result); };
        tx.onerror = function () { rej(tx.error); };
        tx.onabort = function () { rej(tx.error); };
      });
    });
  }
  function idbPut(k, b) { return idbTx('readwrite', function (s) { return s.put(b, k); }); }
  function idbGet(k) { return idbTx('readonly', function (s) { return s.get(k); }); }
  function idbDel(k) { return idbTx('readwrite', function (s) { return s.delete(k); }); }
  function idbKeys() { return idbTx('readonly', function (s) { return s.getAllKeys(); }); }

  /* 卡片/详情里的封面是异步取出来的：先渲染占位，再把 blob 变成 objectURL 填进去，
     期间用 .loading 遮住，避免出现破图闪一下 */
  function hydrateCovers(root) {
    var imgs = (root || document).querySelectorAll('img[data-cover]');
    Array.prototype.forEach.call(imgs, function (img) {
      var k = img.getAttribute('data-cover');
      if (!k || img.getAttribute('src')) return;
      var box = img.parentNode;
      if (coverUrls[k]) { img.src = coverUrls[k]; if (box) box.classList.remove('loading'); return; }
      idbGet(k).then(function (blob) {
        if (!blob) { if (box) { box.classList.remove('loading'); box.classList.add('empty'); } return; }
        coverUrls[k] = URL.createObjectURL(blob);
        img.src = coverUrls[k];
        if (box) box.classList.remove('loading');
      }).catch(function () { if (box) box.classList.remove('loading'); });
    });
  }
  /* 清理没人引用的图片：反复裁剪/删记录后不留垃圾 */
  function gcCovers() {
    idbKeys().then(function (keys) {
      var live = {}, pending = pendingCoverKey || '';
      records.forEach(function (r) { if (r.coverId) live[r.coverId] = 1; });
      (keys || []).forEach(function (k) { if (!live[k] && k !== pending) idbDel(k); });
    }).catch(function () {});
  }

  /* ---- 裁剪 ---- */
  var cropImg = null, cropScale = 1, cropPts = null, cropDrag = -1, cropK = 1;
  var pendingCoverKey = null, pendingCoverBlob = null;
  function dist2(a, b) { var dx = a[0] - b[0], dy = a[1] - b[1]; return Math.sqrt(dx * dx + dy * dy); }
  function beginCrop(img) {
    if (!img || !(img.naturalWidth || img.width)) { toast('这张图片读不出来'); return; }
    cropImg = img;
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    cropScale = Math.min(1, 900 / Math.max(w, h));
    var c = $('cropCanvas');
    c.width = Math.max(2, Math.round(w * cropScale));
    c.height = Math.max(2, Math.round(h * cropScale));
    var ix = Math.round(c.width * 0.1), iy = Math.round(c.height * 0.1);
    cropPts = [[ix, iy], [c.width - ix, iy], [c.width - ix, c.height - iy], [ix, c.height - iy]];
    $('coverPaste').hidden = true;
    $('coverCrop').hidden = false;
    $('coverPreview').hidden = true;
    /* 画布内部尺寸可能远大于屏幕上的显示尺寸（手机上是缩着看的），
       手柄半径要按这个比例放大，否则在手机上小到点不着。 */
    var rect = c.getBoundingClientRect();
    cropK = rect.width ? c.width / rect.width : 1;
    drawCrop();
  }
  function drawCrop() {
    if (!cropImg || !cropPts) return;
    var c = $('cropCanvas'), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(cropImg, 0, 0, c.width, c.height);
    ctx.save();
    ctx.fillStyle = 'rgba(2,6,23,.5)';
    ctx.beginPath();
    ctx.rect(0, 0, c.width, c.height);
    ctx.moveTo(cropPts[0][0], cropPts[0][1]);
    ctx.lineTo(cropPts[1][0], cropPts[1][1]);
    ctx.lineTo(cropPts[2][0], cropPts[2][1]);
    ctx.lineTo(cropPts[3][0], cropPts[3][1]);
    ctx.closePath();
    ctx.fill('evenodd');
    ctx.restore();
    var k = cropK || 1;
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.moveTo(cropPts[0][0], cropPts[0][1]);
    for (var i = 1; i < 4; i++) ctx.lineTo(cropPts[i][0], cropPts[i][1]);
    ctx.closePath(); ctx.stroke();
    cropPts.forEach(function (q) {
      ctx.beginPath(); ctx.arc(q[0], q[1], 9 * k, 0, Math.PI * 2);
      ctx.fillStyle = '#22d3ee'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * k; ctx.stroke();
    });
  }
  function hookCrop() {
    var c = $('cropCanvas');
    if (!c || c.__hooked) return;
    c.__hooked = 1;
    function pos(e) {
      var r = c.getBoundingClientRect();
      return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height];
    }
    c.addEventListener('pointerdown', function (e) {
      if (!cropPts) return;
      var p = pos(e), best = -1, bd = 46 * (cropK || 1);
      cropPts.forEach(function (q, i) { var d = dist2(p, q); if (d < bd) { bd = d; best = i; } });
      if (best < 0) return;
      cropDrag = best;
      try { c.setPointerCapture(e.pointerId); } catch (er) {}
      e.preventDefault();
    });
    c.addEventListener('pointermove', function (e) {
      if (cropDrag < 0 || !cropPts) return;
      var p = pos(e);
      cropPts[cropDrag] = [Math.max(0, Math.min(c.width, p[0])), Math.max(0, Math.min(c.height, p[1]))];
      drawCrop();
      e.preventDefault();
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      c.addEventListener(ev, function () { cropDrag = -1; });
    });
  }

  /* 解 8 元方程组，求把 (x,y) 映射到 (u,v) 的单应矩阵 —— 这就是「透视校正」的核心 */
  function homography(src, dst) {
    var A = [], b = [], i;
    for (i = 0; i < 4; i++) {
      var x = src[i][0], y = src[i][1], u = dst[i][0], v = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
    }
    var n = 8;
    for (var col = 0; col < n; col++) {
      var piv = col;
      for (var r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      if (Math.abs(A[piv][col]) < 1e-12) return null;
      var t = A[col]; A[col] = A[piv]; A[piv] = t;
      var tb = b[col]; b[col] = b[piv]; b[piv] = tb;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === col) continue;
        var f = A[r2][col] / A[col][col];
        if (!f) continue;
        for (var c2 = col; c2 < n; c2++) A[r2][c2] -= f * A[col][c2];
        b[r2] -= f * b[col];
      }
    }
    var h = [];
    for (var k = 0; k < n; k++) h.push(b[k] / A[k][k]);
    return h;
  }
  /* 按四个角把图「掰正」 */
  function warpCover(maxW) {
    var s = cropScale;
    var q = cropPts.map(function (pt) { return [pt[0] / s, pt[1] / s]; });
    var aw = (dist2(q[0], q[1]) + dist2(q[3], q[2])) / 2;
    var ah = (dist2(q[0], q[3]) + dist2(q[1], q[2])) / 2;
    if (!(aw > 8 && ah > 8)) return null;
    var outW = Math.max(120, Math.min(maxW || 560, Math.round(aw)));
    var outH = Math.max(60, Math.round(outW * ah / aw));
    var iw = cropImg.naturalWidth || cropImg.width, ih = cropImg.naturalHeight || cropImg.height;
    var sc = document.createElement('canvas'); sc.width = iw; sc.height = ih;
    var sctx = sc.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(cropImg, 0, 0);
    var sd = sctx.getImageData(0, 0, iw, ih).data;
    var H = homography([[0, 0], [outW, 0], [outW, outH], [0, outH]], q);
    if (!H) return null;
    var oc = document.createElement('canvas'); oc.width = outW; oc.height = outH;
    var octx = oc.getContext('2d');
    var od = octx.createImageData(outW, outH), o = od.data, o2 = 0;
    for (var y = 0; y < outH; y++) {
      for (var x = 0; x < outW; x++, o2 += 4) {
        var w = H[6] * x + H[7] * y + 1;
        var u = (H[0] * x + H[1] * y + H[2]) / w;
        var v = (H[3] * x + H[4] * y + H[5]) / w;
        if (u < 0 || v < 0 || u > iw - 1 || v > ih - 1) { o[o2 + 3] = 255; continue; }
        var x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
        var x1 = Math.min(x0 + 1, iw - 1), y1 = Math.min(y0 + 1, ih - 1);
        var i00 = (y0 * iw + x0) * 4, i10 = (y0 * iw + x1) * 4;
        var i01 = (y1 * iw + x0) * 4, i11 = (y1 * iw + x1) * 4;
        for (var ch = 0; ch < 3; ch++) {
          var tp = sd[i00 + ch] + (sd[i10 + ch] - sd[i00 + ch]) * fx;
          var bt = sd[i01 + ch] + (sd[i11 + ch] - sd[i01 + ch]) * fx;
          o[o2 + ch] = tp + (bt - tp) * fy;
        }
        o[o2 + 3] = 255;
      }
    }
    octx.putImageData(od, 0, 0);
    return oc;
  }
  function dataUrlToBlob(u) {
    var parts = u.split(','), mime = /:(.*?);/.exec(parts[0])[1];
    var bin = atob(parts[1]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  function saveCoverBlob(blob) {
    if (!blob) { toast('压缩失败，换一张图试试'); return; }
    var key = 'cv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    idbPut(key, blob).then(function () {
      if (pendingCoverKey) {
        idbDel(pendingCoverKey);
        if (coverUrls[pendingCoverKey]) { URL.revokeObjectURL(coverUrls[pendingCoverKey]); delete coverUrls[pendingCoverKey]; }
      }
      pendingCoverKey = key; pendingCoverBlob = blob;
      coverUrls[key] = URL.createObjectURL(blob);
      showCoverPreview();
      toast('封面已裁好 · ' + Math.round(blob.size / 1024) + ' KB');
    }).catch(function (e) { toast('存封面失败：' + ((e && e.message) || e)); });
  }
  function applyCover() {
    if (!cropImg || !cropPts) { toast('先选一张图片'); return; }
    var oc;
    try { oc = warpCover(560); } catch (e) { toast('裁剪失败：' + e.message); return; }
    if (!oc) { toast('四个角没对好，拖一下再试'); return; }
    if (oc.toBlob) oc.toBlob(function (b) { saveCoverBlob(b); }, 'image/jpeg', 0.75);
    else { try { saveCoverBlob(dataUrlToBlob(oc.toDataURL('image/jpeg', 0.75))); } catch (e) { toast('裁剪失败：' + e.message); } }
  }
  function showCoverPreview() {
    $('coverCrop').hidden = true;
    $('coverPreview').hidden = false;
    var img = $('coverPreviewImg');
    if (pendingCoverKey && coverUrls[pendingCoverKey]) img.src = coverUrls[pendingCoverKey];
    var sz = pendingCoverBlob ? pendingCoverBlob.size : 0;
    $('coverSize').textContent = sz ? Math.round(sz / 1024) + ' KB · 存在本机（不占书库空间）' : '';
  }
  /* 编辑订阅时把官网的 skip 政策摆出来，数字给出建议 */
  function fillSkipHint() {
    var el = $('skipPresetHint');
    if (!el) return;
    var nm = $('sName') ? trim($('sName').value) : '';
    var txt = skipPolicyText({ name: nm, bsSlug: $('sBsSlug') ? trim($('sBsSlug').value) : '' });
    var pre = skipPresetFor(nm);
    if (!txt && !pre) { el.textContent = '这家没查到官方 skip 政策，数字自己填就行。'; return; }
    el.textContent = (pre ? '建议：' + pre.total + ' 期/年（' + pre.boxes + ' 期里可跳 ' + pre.total + ' 期）　' : '') +
      (txt ? '官网原文：' + txt : '');
  }
  function resetCoverForm(rec) {
    pendingCoverKey = null; pendingCoverBlob = null;
    cropImg = null; cropPts = null; cropDrag = -1;
    $('coverCrop').hidden = true;
    $('coverPreview').hidden = true;
    $('coverPaste').hidden = false;
    $('coverSize').textContent = '';
    $('coverPreviewImg').removeAttribute('src');
    if (rec && rec.coverId) {
      pendingCoverKey = rec.coverId;
      idbGet(rec.coverId).then(function (b) {
        if (!b) return;
        pendingCoverBlob = b;
        if (!coverUrls[rec.coverId]) coverUrls[rec.coverId] = URL.createObjectURL(b);
        showCoverPreview();
      }).catch(function () {});
    }
  }
  function deleteCover() {
    if (pendingCoverKey) {
      idbDel(pendingCoverKey);
      if (coverUrls[pendingCoverKey]) { URL.revokeObjectURL(coverUrls[pendingCoverKey]); delete coverUrls[pendingCoverKey]; }
    } else { toast('本来就没有封面'); return; }
    pendingCoverKey = ''; pendingCoverBlob = null;
    cropImg = null; cropPts = null;
    $('coverPreview').hidden = true;
    $('coverCrop').hidden = true;
    $('coverPaste').hidden = false;
    $('coverSize').textContent = '';
    $('coverPreviewImg').removeAttribute('src');
    toast('封面已移除（保存后生效）');
  }
  function loadCoverFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { toast('请选一张图片文件'); return; }
    var url = URL.createObjectURL(file);
    var im = new Image();
    im.onload = function () { beginCrop(im); };
    im.onerror = function () { toast('这张图片打不开'); URL.revokeObjectURL(url); };
    im.src = url;
  }
  /* 自动找四角：灰度 → Sobel 梯度 → 在上/下/左/右各找一个梯度最强的中线位置。
     比不了专业扫描算法（对严重倾斜的拍法只能给个大致范围），所以永远保留手动微调。 */
  function autoCoverCorners() {
    if (!cropImg || !cropPts) { toast('先选一张图片'); return; }
    try {
      /* 必须从「干净的图」上取像素：cropCanvas 上已经画了半透明蒙版 + 青色边框 + 手柄，
         直接读它会把默认裁剪框当成书本边缘（实测就返回了默认框，等于没识别）。 */
      var c0 = $('cropCanvas'), w = c0.width, h = c0.height;
      var clean = document.createElement('canvas');
      clean.width = w; clean.height = h;
      var cx2 = clean.getContext('2d', { willReadFrequently: true });
      cx2.drawImage(cropImg, 0, 0, w, h);
      var d = cx2.getImageData(0, 0, w, h).data;
      var g = new Float32Array(w * h);
      for (var i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      var mag = new Float32Array(w * h);
      for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
        var i2 = y * w + x;
        var gx = -g[i2 - w - 1] - 2 * g[i2 - 1] - g[i2 + w - 1] + g[i2 - w + 1] + 2 * g[i2 + 1] + g[i2 + w + 1];
        var gy = -g[i2 - w - 1] - 2 * g[i2 - w] - g[i2 - w + 1] + g[i2 + w - 1] + 2 * g[i2 + w] + g[i2 + w + 1];
        mag[i2] = Math.sqrt(gx * gx + gy * gy);
      }
      function midOf(list) {
        if (list.length < 6) return null;
        list.sort(function (a, b) { return a - b; });
        return list[Math.floor(list.length / 2)];
      }
      /* 关键：从画面边缘往里找「第一条」强边，而不是找整段里最强的边。
         反例（实测踩过）：书封上有一条高对比的横向装饰条，它比书本身的外轮廓还强，
         按「最强」找会把书裁掉一大块。按「最外侧的强边」找才符合「书占满画面」的拍法。 */
      var THR = 45;
      function firstFrom(list) {
        for (var i = 0; i < list.length; i++) if (list[i] > THR) return i;
        return -1;
      }
      function rowEdge(y0, y1, fromTop) {
        var out = [], span = Math.abs(y1 - y0);
        for (var x = Math.round(w * 0.15); x < w * 0.85; x++) {
          var hit = -1;
          for (var s = 0; s < span; s++) {
            var y = fromTop ? (y0 + s) : (y0 - s);
            if (y > 0 && y < h - 1 && mag[y * w + x] > THR) { hit = y; break; }
          }
          if (hit >= 0) out.push(hit);
        }
        return midOf(out);
      }
      function colEdge(x0, x1, fromLeft) {
        var out = [], span = Math.abs(x1 - x0);
        for (var y = Math.round(h * 0.15); y < h * 0.85; y++) {
          var hit = -1;
          for (var s = 0; s < span; s++) {
            var x = fromLeft ? (x0 + s) : (x0 - s);
            if (x > 0 && x < w - 1 && mag[y * w + x] > THR) { hit = x; break; }
          }
          if (hit >= 0) out.push(hit);
        }
        return midOf(out);
      }
      var top = rowEdge(1, Math.round(h * 0.45), true), bot = rowEdge(h - 2, Math.round(h * 0.55), false);
      var lf = colEdge(1, Math.round(w * 0.45), true), rt = colEdge(w - 2, Math.round(w * 0.55), false);
      if (top == null || bot == null || lf == null || rt == null || bot - top < 20 || rt - lf < 20) {
        toast('没找到明显的书本边缘，手动拖四个角吧');
        return;
      }
      cropPts = [[lf, top], [rt, top], [rt, bot], [lf, bot]];
      drawCrop();
      toast('找到大致范围，请拖四角微调（斜着拍的会自动对不准）');
    } catch (e) { toast('自动识别失败：' + e.message); }
  }
  function coverIdFor(id) {
    if (pendingCoverKey !== null) return pendingCoverKey;
    if (!id) return '';
    var r = records.find(function (x) { return x.id === id; });
    return (r && r.coverId) ? r.coverId : '';
  }

  /* ============ 阅读记录 ============ */
  function tileHtml(num, label, cls) {
    return '<div class="sum-tile"><div class="sum-num ' + (cls || '') + '">' + num +
      '</div><div class="sum-label">' + esc(label) + '</div></div>';
  }
  function starHtml(n) {
    n = +n || 0;
    if (!n) return '';
    return '<span class="stars" title="' + n + '/5">' + '★'.repeat(n) + '<i>' + '☆'.repeat(5 - n) + '</i></span>';
  }
  function renderReading() {
    var el = $('readList');
    if (!el) return;
    var done = records.filter(function (r) { return r.readStatus === '已读'; });
    var doing = records.filter(function (r) { return r.readStatus === '在读'; });
    var rated = records.filter(function (r) { return trim(r.rating); });
    var sum = 0;
    rated.forEach(function (r) { sum += (+r.rating || 0); });
    var ym = new Date().getFullYear() + '/' + (new Date().getMonth() + 1) + '/';
    var thisMonth = done.filter(function (r) { return trim(r.finishDate).indexOf(ym) === 0; }).length;
    if ($('readTop')) {
      $('readTop').innerHTML = tileHtml(done.length, '已读', 'green') + tileHtml(doing.length, '在读', 'orange') +
        tileHtml(thisMonth, '本月读完', 'blue') + tileHtml(rated.length ? (sum / rated.length).toFixed(1) : '—', '平均评分');
    }
    var list = done.concat(doing).sort(function (a, b) {
      return (dateVal(b.finishDate) - dateVal(a.finishDate)) ||
        trim(a.title).localeCompare(trim(b.title));
    });
    el.innerHTML = list.length ? list.map(function (r) {
      return '<div class="read-row" data-read="' + r.id + '">' +
        '<div class="rr-main">' +
        '<a class="rr-title" data-gr="' + r.id + '" href="' + esc(grUrlFor(r)) + '" target="_blank" rel="noopener">' +
        esc(r.title || '（无书名）') + '</a>' +
        (trim(r.author) ? '<div class="rr-author">' + esc(r.author) + '</div>' : '') +
        '<div class="rr-meta">' +
        '<span class="tag read">' + esc(r.readStatus) + '</span>' +
        (trim(r.genre) ? '<span class="tag genre">' + esc(r.genre) + '</span>' : '') +
        (trim(r.series) ? '<span class="tag series">' + esc(r.series) + '</span>' : '') +
        (trim(r.finishDate) ? '<span class="tag date">读完 ' + esc(r.finishDate) + '</span>' : '') +
        '</div></div>' + starHtml(r.rating) + '</div>';
    }).join('') : '<p class="read-empty">还没有阅读记录 —— 在书的编辑页把「阅读状态」改成「在读」或「已读」，就会出现在这里。</p>';
  }

  /* ============================================================
     与 booksandspreadsheets.com 同步
     那个站点没有 CORS 头，前端直连会被浏览器拦；用 Jina 代理又要把它 1.8MB 的页面
     来回传几次，免费额度扛不住。所以由仓库里的 GitHub Action 每天抓一次、生成同源的
     data/bs-subs.json，这里只读同源 JSON —— 不花额度、不跨域、快。
     ============================================================ */
  /* 依次尝试几个位置：Action 按 workflow 里的路径生成，放哪都能读到 */
  var BS_PATHS = ['data/bs-subs.json', 'bs-subs.json'];
  var bsData = null, bsFetchedAt = '';

  function bsLoad() {
    var i = 0;
    function next() {
      if (i >= BS_PATHS.length) return Promise.reject(new Error('找不到数据文件'));
      var url = BS_PATHS[i++] + '?t=' + Date.now();
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).catch(function () { return next(); });
    }
    return next().then(function (j) {
      bsData = j;
      bsFetchedAt = trim(j.generatedAt);
      return j;
    });
  }
  function bsCompany(slug) {
    if (!bsData || !bsData.companies) return null;
    for (var i = 0; i < bsData.companies.length; i++) {
      if (bsData.companies[i].slug === slug) return bsData.companies[i];
    }
    return null;
  }
  function fillBsSourceSel(sel, val, name) {
    if (!sel) return;
    var opts = ['<option value="">（不同步）</option>'];
    var list = (bsData && bsData.companies) || [];
    list.forEach(function (c) {
      opts.push('<option value="' + esc(c.slug) + '">' + esc(c.name) + '</option>');
    });
    sel.innerHTML = opts.join('');
    sel.value = val || bsDefaultFor(name) || '';
  }
  /* 官网给的是自然语言规则（"5th of the month before"），只把「几号」这种无歧义的部分落库；
     整句原文一起存下来显示，避免把有歧义的月份规则猜错、导致提醒时间不对。 */
  function bsRulesText(c) {
    var t = [];
    if (trim(c.renews)) t.push('扣款：' + trim(c.renews));
    if (trim(c.skipDeadline)) t.push('最后可 skip：' + trim(c.skipDeadline));
    if (trim(c.skipPolicy)) t.push('可跳：' + trim(c.skipPolicy));
    if (trim(c.cost)) t.push('费用：' + trim(c.cost));
    if (trim(c.ships)) t.push('发货：' + trim(c.ships));
    return t.join('　·　');
  }
  /* 只在「费用里只有一个金额、币种唯一」时才自动填金额。
     官网的费用经常是分地区多币种写的（"$62 AUD (AUS); $65 AUD (NZ); $43 USD (USA)"）
     或者分档写的（"Tier 1 - £30; Tier 2 - £25"）—— 这种一抓就抓错，
     宁可留空让用户自己填，只在界面上把原文显示出来。 */
  function bsFirstAmount(cost) {
    var s = trim(cost);
    if (!s) return null;
    var nums = s.match(/(?:[£€$]\s?|\b(?:AUD|USD|GBP|EUR|CAD|NZD|JPY)\s?)\d+(?:\.\d+)?|\d+(?:\.\d+)?\s?(?:AUD|USD|GBP|EUR|CAD|NZD|JPY)/g) || [];
    if (nums.length !== 1) return null;                 /* 多档 / 多地区 → 不猜 */
    var n = (nums[0].match(/\d+(?:\.\d+)?/) || [])[0];
    if (!n) return null;
    var codes = (s.match(/\b(?:AUD|USD|GBP|EUR|CAD|NZD|JPY)\b/g) || []);
    var uniq = codes.filter(function (v, i) { return codes.indexOf(v) === i; });
    var cur = '';
    if (uniq.length === 1) cur = uniq[0];
    else if (uniq.length === 0) {
      var syms = s.match(/[£€$]/g) || [];
      var su = syms.filter(function (v, i) { return syms.indexOf(v) === i; });
      /* 只写一个 $ 不猜（USD/AUD/CAD/NZD 都写作 $） */
      if (su.length === 1) cur = su[0] === '£' ? 'GBP' : su[0] === '€' ? 'EUR' : '';
    }
    if (!cur || !fx[cur]) return null;
    return { n: n, cur: cur };
  }

  function syncFromSite(btn) {
    if (btn) { btn.disabled = true; btn.textContent = '同步中…'; }
    var finish = function (ok, msg) {
      if (btn) { btn.disabled = false; btn.textContent = '🔄 同步官网数据'; }
      toast(msg);
      if (ok) { renderSubs(); render(); }
    };
    bsLoad().then(function () {
      if (!subs.some(function (s) { return trim(s.bsSlug) || bsDefaultFor(s.name); })) {
        finish(false, '还没有订阅绑定官网页面：点「编辑订阅」，在「数据源」里选一家');
        return;
      }
      var applied = 0, newBoxes = 0, miss = [];
      subs.forEach(function (s) {
        if (!trim(s.bsSlug)) {
          var auto = bsDefaultFor(s.name);
          if (auto) s.bsSlug = auto;            /* 按名字自动绑定，下次直接用 */
        }
        if (!trim(s.bsSlug)) return;
        var c = bsCompany(s.bsSlug);
        if (!c) { miss.push(s.name); return; }
        applied++;
        s.bsInfo = {
          name: c.name, slug: c.slug, url: c.url || '', renews: c.renews,
          skipDeadline: c.skipDeadline, skipPolicy: c.skipPolicy, note: c.note,
          cost: c.cost, ships: c.ships,
          website: c.website, at: bsFetchedAt
        };
        /* 只填本地没设的，绝不覆盖用户自己改过的 */
        if (!s.chargeDay && c.chargeDay) s.chargeDay = c.chargeDay;
        if (!trim(s.site) && c.website) s.site = c.website;
        if (!trim(s.amount) && trim(c.cost)) {
          var a = bsFirstAmount(c.cost);
          if (a && fx[a.cur]) { s.amount = a.n; s.currency = a.cur; }
        }
        /* 官网列出的未来期次：本地没有就建一条，并把书目/封面/设计挂上去 */
        var today = periodOf(today0());
        (c.boxes || []).forEach(function (b) {
          if (!b.period || b.period < today) return;
          var box = null, i;
          for (i = 0; i < s.boxes.length; i++) {
            if (s.boxes[i].period === b.period) { box = s.boxes[i]; break; }
          }
          if (!box) {
            box = makeBox(s, parseYmd(b.period + '-01'));
            box.period = b.period;
            s.boxes.push(box);
            newBoxes++;
          }
          box.bsBooks = box.bsBooks || [];
          var dup = box.bsBooks.some(function (x) { return x.bookTitle === b.bookTitle; });
          if (!dup) {
            box.bsBooks.push({
              bookTitle: b.bookTitle, cover: b.cover || '', design: b.design || [],
              editionUrl: b.editionUrl || '', boxLabel: b.boxLabel || '', companyName: b.company || ''
            });
          }
        });
      });
      saveSubs();
      finish(true, '已同步 ' + applied + ' 家' + (newBoxes ? '，新建 ' + newBoxes + ' 期' : '') +
        (miss.length ? '；' + miss.length + ' 家没在数据里' : ''));
    }).catch(function (e) {
      finish(false, '同步失败：读不到 data/bs-subs.json（' + e.message + '）。这个文件由仓库里的 GitHub Action 每天生成。');
    });
  }
  /* 期次里的「官网书目」区块：封面 + 书名 + 设计要点 + 一键进书库补作者/系列 */
  function bsBooksHtml(s, b) {
    if (!b.bsBooks || !b.bsBooks.length) return '';
    return '<div class="bs-books">' + b.bsBooks.map(function (x, i) {
      var tags = (x.design || []).map(function (d) {
        var p = d.split('：');
        return '<span class="tag bs">' + esc(p[0]) + '：' + esc(p[1] || '') + '</span>';
      }).join('');
      return '<div class="bs-book">' +
        (x.cover ? '<img class="bb-cover" src="' + esc(x.cover) + '" alt="" loading="lazy">' : '') +
        '<div class="bb-main">' +
        '<a class="bb-title" href="' + esc(x.editionUrl || s.bsInfo && s.bsInfo.url || '#') + '" target="_blank" rel="noopener">' +
        esc(x.bookTitle) + '</a>' +
        '<div class="bb-sub">官网数据 · ' + esc(x.boxLabel || b.period) + '</div>' +
        (tags ? '<div class="bb-tags">' + tags + '</div>' : '') +
        '</div>' +
        '<button class="btn btn-small" type="button" data-act="bs2lib" data-sub="' + s.id + '" data-box="' + b.id +
        '" data-i="' + i + '">加进书库</button>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* ---- 订阅表单 ---- */
  var editingSub = null;
  function fillCurSel(sel, val) {
    if (!sel) return;
    if (!sel.options.length) {
      sel.innerHTML = CUR.map(function (c) {
        return '<option value="' + c[0] + '">' + c[1] + ' ' + c[2] + '</option>';
      }).join('');
    }
    sel.value = fx[val] ? val : 'CNY';
  }
  function openSubForm(s) {
    editingSub = s || null;
    $('subTitle').textContent = s ? '编辑订阅' : '添加订阅';
    $('sId').value = s ? s.id : '';
    $('sName').value = s ? s.name : '';
    $('sSite').value = s ? s.site : '';
    $('sCycle').value = s ? String(s.cycle) : '1';
    $('sDay').value = s && s.chargeDay ? String(s.chargeDay) : '';
    $('sAmount').value = s ? s.amount : '';
    fillCurSel($('sCurrency'), s ? s.currency : 'GBP');
    $('sActive').checked = s ? !!s.active : true;
    if ($('sSkipTotal')) $('sSkipTotal').value = (s && s.skipTotal !== '' && s.skipTotal != null) ? s.skipTotal : '';
    if ($('sSkipUsed')) $('sSkipUsed').value = s ? (parseInt(s.skipUsed, 10) || 0) : 0;
    fillSkipHint();
    $('sNote').value = s ? s.note : '';
    fillBsSourceSel($('sBsSlug'), s ? s.bsSlug : '', s ? s.name : '');
    openModal('subModal');
  }
  function openBoxForm(s, b) {
    if (!s || !b) return;
    $('boxTitle').textContent = s.name + ' · ' + periodLabel(b.period) + ' 期';
    $('bSubId').value = s.id;
    $('bId').value = b.id;
    $('bPeriod').value = b.period;
    $('bDate').value = toInputDate(b.chargeDate);
    $('bStatus').value = b.status;
    $('bAmount').value = b.amount;
    fillCurSel($('bCurrency'), b.currency || s.currency);
    $('bNote').value = b.note;
    openModal('boxModal');
  }

  /* ---- 汇率 ---- */
  function openFxForm() {
    $('fxList').innerHTML = CUR.filter(function (c) { return c[0] !== 'CNY'; }).map(function (c) {
      return '<label class="fx-row"><span>' + c[1] + c[2] + '　1 ' + c[0] + ' = ? 人民币</span>' +
        '<input type="number" step="0.0001" inputmode="decimal" data-cur="' + c[0] + '" value="' + fx[c[0]] + '"></label>';
    }).join('');
    if ($('fxUpdated')) {
      $('fxUpdated').textContent = fxAt ? '当前汇率来自：' + fxAt : '当前是程序内置的参考值，建议点「联网更新汇率」';
    }
    openModal('fxModal');
  }
  function saveFxForm() {
    $('fxList').querySelectorAll('input[data-cur]').forEach(function (inp) {
      var v = parseFloat(inp.value);
      if (!isNaN(v) && v > 0) fx[inp.dataset.cur] = v;
    });
    saveFx('手动设置 · ' + new Date().toLocaleDateString('en-CA'));
    closeModal('fxModal'); render(); renderSubs();
    toast('汇率已保存，合计和¥换算都跟着更新');
  }
  function updateFxOnline() {
    var btn = $('btnFxUpdate');
    if (!btn) return;
    btn.disabled = true; btn.textContent = '更新中…';
    function done(ok, msg) {
      btn.disabled = false; btn.textContent = '联网更新汇率';
      toast(msg);
      if (ok) { openFxForm(); render(); renderSubs(); }
    }
    /* 免费、免 key、带 CORS 的汇率接口：返回「1 人民币 = 多少外币」，取倒数 */
    fetch('https://open.er-api.com/v6/latest/CNY')
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
      .then(function (j) {
        if (!j || !j.rates) throw new Error('bad');
        var n = 0;
        CUR.forEach(function (c) {
          if (c[0] === 'CNY') return;
          var per = j.rates[c[0]];
          if (typeof per === 'number' && per > 0) { fx[c[0]] = 1 / per; n++; }
        });
        if (!n) throw new Error('none');
        saveFx('联网更新 · ' + new Date().toLocaleDateString('en-CA'));
        done(true, '已用最新汇率更新 ' + n + ' 个币种');
      })
      .catch(function () { done(false, '联网更新失败（不影响使用，可以手动填汇率）'); });
  }

  /* ---- 日历提醒（.ics）：静态网页没法后台推送，导进手机日历就能真提醒 ---- */
  function icsEscape(s) {
    return trim(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function icsDate(d) { return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()); }
  function buildIcs() {
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Book-tracker//订阅扣款提醒//CN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:订阅盒子扣款'];
    var stamp = icsDate(today0()) + 'T000000Z';
    subs.forEach(function (s) {
      if (!s.active) return;
      var n = nextCharge(s);
      if (n) {
        L.push('BEGIN:VEVENT', 'UID:sub-' + s.id + '@book-tracker', 'DTSTAMP:' + stamp,
          'DTSTART;VALUE=DATE:' + icsDate(n),
          'DTEND;VALUE=DATE:' + icsDate(new Date(n.getTime() + 86400000)),
          'RRULE:FREQ=MONTHLY;INTERVAL=' + s.cycle);
        L.push('SUMMARY:' + icsEscape('订阅扣款：' + s.name + (trim(s.amount) ? ' ' + curSymbol(s.currency) + s.amount : '')));
        L.push('DESCRIPTION:' + icsEscape('每月 ' + s.chargeDay + ' 日扣款' + (trim(s.site) ? '\n官网：' + s.site : '') +
          '\n到「书籍购入」App 的订阅页记这一期买了还是跳过'));
        L.push('BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('7 天后扣款：' + s.name), 'END:VALARM');
        L.push('BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('明天扣款：' + s.name), 'END:VALARM');
        L.push('END:VEVENT');
      }
      s.boxes.forEach(function (b) {
        if (!booksOf(b).length) return;
        var d = parseYmd(b.chargeDate);
        if (!d) return;
        L.push('BEGIN:VEVENT', 'UID:box-' + b.id + '@book-tracker', 'DTSTAMP:' + stamp,
          'DTSTART;VALUE=DATE:' + icsDate(d),
          'DTEND;VALUE=DATE:' + icsDate(new Date(d.getTime() + 86400000)));
        L.push('SUMMARY:' + icsEscape(s.name + ' ' + periodLabel(b.period) + '：' +
          b.books.map(function (x) { return x.title; }).join('、')));
        L.push('DESCRIPTION:' + icsEscape(b.books.map(function (x) {
          return '《' + x.title + '》' + (x.author ? ' / ' + x.author : '') +
            (x.series ? ' / ' + x.series : '') + (x.grBookUrl ? '\n' + x.grBookUrl : '');
        }).join('\n\n')));
        L.push('END:VEVENT');
      });
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }
  function exportIcs() {
    var txt = buildIcs();
    if (txt.indexOf('BEGIN:VEVENT') === -1) { toast('还没有可提醒的扣款日：先给订阅填上扣款日'); return; }
    try {
      var blob = new Blob([txt], { type: 'text/calendar;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '订阅扣款提醒.ics';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
      toast('已生成日历文件：用手机打开它就能导入日历，之后每月自动提醒');
    } catch (e) { toast('生成日历文件失败'); }
  }

  /* ---- 视图切换 ---- */
  var view = 'books';
  function setView(v) {
    view = (v === 'subs' || v === 'read') ? v : 'books';
    document.body.classList.toggle('view-subs', view === 'subs');
    document.body.classList.toggle('view-read', view === 'read');
    if ($('tabRow')) {
      $('tabRow').querySelectorAll('.tab').forEach(function (t) {
        t.classList.toggle('active', t.dataset.view === view);
      });
    }
    if (view === 'subs') renderSubs();
    else if (view === 'read') renderReading();
    else render();
    window.scrollTo(0, 0);
  }

  /* ---- 绑定 ---- */
  if ($('tabRow')) {
    $('tabRow').querySelectorAll('.tab').forEach(function (t) {
      t.onclick = function () { setView(t.dataset.view); };
    });
  }
  if ($('subsList')) $('subsList').addEventListener('click', subsClick);
  if ($('subsAlert')) $('subsAlert').addEventListener('click', subsClick);
  if ($('btnAddSub')) $('btnAddSub').onclick = function () { openSubForm(null); };
  if ($('btnBsSync')) $('btnBsSync').onclick = function () { syncFromSite(this); };
  if ($('btnExportIcs')) $('btnExportIcs').onclick = exportIcs;
  if ($('btnFxOpen')) $('btnFxOpen').onclick = openFxForm;
  if ($('btnSubCancel')) $('btnSubCancel').onclick = function () { closeModal('subModal'); };
  if ($('btnBoxCancel')) $('btnBoxCancel').onclick = function () { closeModal('boxModal'); };
  if ($('btnFxCancel')) $('btnFxCancel').onclick = function () { closeModal('fxModal'); };
  if ($('btnFxSave')) $('btnFxSave').onclick = saveFxForm;
  if ($('btnFxUpdate')) $('btnFxUpdate').onclick = updateFxOnline;
  if ($('btnBoxAddBook')) $('btnBoxAddBook').onclick = function () {
    var s = subById($('bSubId').value), b = boxOf(s, $('bId').value);
    if (s && b) { closeModal('boxModal'); openFormForBox(s.id, b.id); }
  };
  if ($('btnBoxDel')) $('btnBoxDel').onclick = function () {
    var s = subById($('bSubId').value), b = boxOf(s, $('bId').value);
    closeModal('boxModal');
    deleteBox(s, b);
  };
  if ($('btnSubSave')) $('btnSubSave').onclick = function () {
    var name = trim($('sName').value);
    if (!name) { toast('请填订阅名称'); return; }
    var day = parseInt($('sDay').value, 10);
    if (isNaN(day) || day < 1 || day > 31) day = 0;
    var data = {
      name: name, site: trim($('sSite').value),
      cycle: parseInt($('sCycle').value, 10) === 2 ? 2 : 1,
      chargeDay: day, amount: trim($('sAmount').value),
      currency: $('sCurrency').value, active: $('sActive').checked, note: trim($('sNote').value),
      bsSlug: $('sBsSlug') ? $('sBsSlug').value : (editingSub ? (editingSub.bsSlug || '') : '')
    };
    var _st = trim($('sSkipTotal') ? $('sSkipTotal').value : '');
    data.skipTotal = _st === '' ? '' : (parseInt(_st, 10) || '');
    var _su = trim($('sSkipUsed') ? $('sSkipUsed').value : '');
    data.skipUsed = _su === '' ? 0 : Math.max(0, parseInt(_su, 10) || 0);
    data.skipYear = String(new Date().getFullYear());
    data.skipAuto = _st === '';
    if (editingSub) Object.keys(data).forEach(function (k) { editingSub[k] = data[k]; });
    else { data.id = uid(); data.boxes = []; subs.push(data); }
    saveSubs(); closeModal('subModal'); renderSubs(); render();
    toast(day ? '已保存（下次扣款 ' + cnDate(nextCharge(editingSub || subs[subs.length - 1])) + '）' : '已保存；填上扣款日才会提醒');
  };
  if ($('btnBoxSave')) $('btnBoxSave').onclick = function () {
    var s = subById($('bSubId').value), b = boxOf(s, $('bId').value);
    if (!s || !b) return;
    b.period = trim($('bPeriod').value) || b.period;
    b.chargeDate = trim($('bDate').value) || b.chargeDate;
    b.status = $('bStatus').value;
    b.amount = trim($('bAmount').value);
    b.currency = $('bCurrency').value;
    b.note = trim($('bNote').value);
    saveSubs(); closeModal('boxModal'); renderSubs(); render();
    toast('已保存 ' + periodLabel(b.period) + ' 期');
  };
  if ($('fCurrency')) fillCurSel($('fCurrency'), 'CNY');

  /* 静默读一次同源 bs-subs.json：只为把官网的扣款日 / skip 政策显示出来，不改任何用户数据。
     真正「套用官网数据」仍然只在用户点「同步官网数据」时才执行。失败就静默跳过。 */
  try {
    bsLoad().then(function () { renderSubs(); if (view === 'subs') render(); }).catch(function () {});
  } catch (e) {}

  render();
})();
