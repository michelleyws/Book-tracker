/* 书籍购入记录 —— 纯前端单机应用，数据存 localStorage */
(function () {
  'use strict';

  var LS_KEY = 'bookRecords.v1';
  var GR_SITE = 'https://www.goodreads.com';

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

  /* Goodreads：有直链用直链，没有就按书名+作者搜索 */
  function grUrlFor(rec) {
    if (trim(rec.goodreadsUrl)) return trim(rec.goodreadsUrl);
    var q = [rec.title, rec.author].map(trim).filter(Boolean).join(' ');
    return q ? GR_SITE + '/search?q=' + encodeURIComponent(q) : GR_SITE;
  }

  /* ============ 渲染 ============ */
  var state = { q: '', filter: 'all', sort: 'date-desc' };

  function filtered() {
    var q = state.q.toLowerCase();
    var list = records.filter(function (r) {
      if (state.filter === 'yes' && r.owned !== '是') return false;
      if (state.filter === 'no' && r.owned === '是') return false;
      if (!q) return true;
      /* 所有字段都参与搜索 */
      return [r.title, r.author, r.series, r.publisher, r.source, r.sourceUrl,
        r.note, r.owned, r.binding, r.date, r.price, r.goodreadsUrl]
        .some(function (v) { return trim(v).toLowerCase().indexOf(q) !== -1; });
    });
    list.sort(function (a, b) {
      switch (state.sort) {
        case 'date-asc': return dateVal(a.date) - dateVal(b.date);
        case 'price-desc': return (priceVal(b.price) == null ? -1 : priceVal(b.price)) - (priceVal(a.price) == null ? -1 : priceVal(a.price));
        case 'price-asc': return (priceVal(a.price) == null ? Infinity : priceVal(a.price)) - (priceVal(b.price) == null ? Infinity : priceVal(b.price));
        case 'title': return trim(a.title).localeCompare(trim(b.title));
        case 'date-desc':
        default: return dateVal(b.date) - dateVal(a.date);
      }
    });
    return list;
  }

  function renderSummary() {
    var owned = 0, unowned = 0, sum = 0;
    records.forEach(function (r) {
      if (r.owned === '是') {
        owned++;
        var n = priceVal(r.price);
        if (n != null) sum += n;
      } else {
        unowned++;
      }
    });
    var money = sum ? '¥' + sum.toFixed(2).replace(/\.00$/, '') : '—';
    $('summaryCard').innerHTML =
      '<div class="sum-tile">' +
      '<div class="sum-num green">' + owned + '</div>' +
      '<div class="sum-money">' + money + '</div>' +
      '<div class="sum-label">已购买（花了多少钱）</div></div>' +
      '<div class="sum-tile">' +
      '<div class="sum-num orange">' + unowned + '</div>' +
      '<div class="sum-label">未入手 · 想买的</div></div>' +
      '<div class="sum-tile">' +
      '<div class="sum-num blue">' + records.length + '</div>' +
      '<div class="sum-label">全部记录</div></div>';
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
      if (trim(r.price)) tags.push('<span class="tag price">' + esc(r.price) + '</span>');
      if (trim(r.source)) tags.push('<span class="tag">' + esc(r.source) + '</span>');
      return '<div class="book-card" data-id="' + r.id + '">' +
        '<span class="owned-dot ' + (r.owned === '是' ? 'yes' : 'no') + '"></span>' +
        '<div class="book-main">' +
        '<div class="book-title-row"><a class="book-title" data-gr="' + r.id + '" href="' + esc(grUrlFor(r)) + '" target="_blank" rel="noopener">' + esc(r.title || '（无书名）') + '</a></div>' +
        (trim(r.author) ? '<div class="book-author">' + esc(r.author) + '</div>' : '') +
        (tags.length ? '<div class="book-meta">' + tags.join('') + '</div>' : '') +
        (trim(r.note) ? '<div class="book-note">' + esc(r.note) + '</div>' : '') +
        '</div><span class="chev">›</span></div>';
    }).join('');

    box.querySelectorAll('.book-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('a')) return; // 点链接交给浏览器
        openDetail(card.dataset.id);
      });
    });
  }

  /* ============ 详情 ============ */
  function openDetail(id) {
    var r = records.find(function (x) { return x.id === id; });
    if (!r) return;
    var rows = [
      ['作者', r.author], ['系列', r.series], ['是否入手', r.owned],
      ['装帧', r.binding], ['购入日期', r.date], ['购入来源', r.source],
      ['价格', r.price], ['出版社', r.publisher]
    ].filter(function (p) { return trim(p[1]); });

    $('detailBody').innerHTML =
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
    $('fPublisher').value = isEdit ? rec.publisher : '';
    $('fNote').value = isEdit ? rec.note : '';
    $('fGrUrl').value = isEdit ? rec.goodreadsUrl : '';
    $('grTip').hidden = true;
    openModal('formModal');
    setTimeout(function () { $('fTitle').focus(); }, 250);
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
      goodreadsUrl: trim($('fGrUrl').value)
    };
    if (!data.title) { toast('请填写书名'); return; }
    if (id) {
      var rec = records.find(function (x) { return x.id === id; });
      if (rec) Object.keys(data).forEach(function (k) { rec[k] = data[k]; });
      toast('已保存修改');
    } else {
      data.id = uid();
      records.push(data);
      toast('已添加');
    }
    save(); closeModal('formModal'); render();
  });

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

  /* ============ 弹层控制 ============ */
  function openModal(id) { $(id).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal(id) {
    $(id).hidden = true;
    if ($('detailModal').hidden && $('formModal').hidden && $('importModal').hidden) {
      document.body.style.overflow = '';
    }
  }
  ['detailModal', 'formModal', 'importModal'].forEach(function (mid) {
    $(mid).addEventListener('click', function (e) { if (e.target === $(mid)) closeModal(mid); });
  });

  /* ============ 事件绑定 ============ */
  $('btnAdd').onclick = function () { openForm(null); };
  $('btnCancel').onclick = function () { closeModal('formModal'); };
  $('searchInput').addEventListener('input', function () { state.q = this.value; render(); });
  $('sortSelect').addEventListener('change', function () { state.sort = this.value; render(); });
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
    var COLS = ['是否入手', '系列', '书名', '作者', '平装/精装', '购入日期', '购入来源', '价格', '出版社', '备注'];
    var rowBlank = new Array(COLS.length + 1).fill('');
    var aoa = [rowBlank, [''].concat(COLS)].concat(records.map(function (r) {
      return ['', r.owned, r.series, r.title, r.author, r.binding, r.date,
        r.source, r.price, r.publisher, r.note]
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

  /* ============ Excel 导入 ============ */
  var HEADER_ALIAS = {
    '是否入手': 'owned', '系列': 'series', '书名': 'title', '作者': 'author',
    '平装/精装': 'binding', '装帧': 'binding', '购入日期': 'date', '购入来源': 'source',
    '价格': 'price', '出版社': 'publisher', '备注': 'note',
    '购买链接': 'sourceUrl', 'goodreads链接': 'goodreadsUrl', 'goodreads url': 'goodreadsUrl'
  };

  $('btnImport').onclick = function () { openModal('importModal'); };
  $('btnImportCancel').onclick = function () { closeModal('importModal'); };
  $('btnImportGo').onclick = function () { $('fileInput').click(); };

  $('fileInput').addEventListener('change', function () {
    var file = this.files[0];
    this.value = '';
    if (!file) return;
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
        /* 各列超链接分类：书名/系列/作者列上的 Goodreads 链接分开存，来源列存购买链接 */
        var grBook = '', grSeries = '', grAuthor = '', src = '';
        var grByCol = {};
        grByCol[colMap.title] = function (u) { grBook = u; };
        if (colMap.series !== undefined) grByCol[colMap.series] = function (u) { grSeries = u; };
        if (colMap.author !== undefined) grByCol[colMap.author] = function (u) { grAuthor = u; };
        Object.keys(grByCol).forEach(function (ci) {
          var u = links[colName(colBase + +ci) + excelRow];
          if (u && isGR(u)) grByCol[ci](u);
        });
        if (colMap.source !== undefined) {
          var su = links[colName(colBase + colMap.source) + excelRow];
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
          publisher: cell('publisher'),
          note: cell('note'),
          sourceUrl: cell('sourceUrl') || src,
          grBookUrl: grBook,
          grSeriesUrl: grSeries,
          grAuthorUrl: grAuthor,
          goodreadsUrl: grBook || grSeries || grAuthor
        };
        var key = keyOf(recData);
        var exist = byKey[key];
        if (exist) {
          Object.keys(recData).forEach(function (k) {
            if (!recData[k] && (k === 'goodreadsUrl' || k === 'sourceUrl' ||
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

  render();
})();
