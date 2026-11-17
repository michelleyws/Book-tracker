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
      if (state.filter === 'pending' && r.owned !== '没到手') return false;
      if (state.filter === 'no' && (r.owned === '是' || r.owned === '没到手')) return false;
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
    var got = 0, pending = 0, unowned = 0, sum = 0;
    records.forEach(function (r) {
      var n = priceVal(r.price);
      if (r.owned === '是') { got++; if (n != null) sum += n; }
      else if (r.owned === '没到手') { pending++; if (n != null) sum += n; }
      else unowned++;
    });
    var money = sum ? '¥' + sum.toFixed(2).replace(/\.00$/, '') : '—';
    $('summaryCard').innerHTML =
      '<div class="sum-tile">' +
      '<div class="sum-num green">' + (got + pending) + '</div>' +
      '<div class="sum-money">' + money + '</div>' +
      '<div class="sum-label">已购买（含没到手）· 花了多少钱</div></div>' +
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
        '<span class="owned-dot ' + (r.owned === '是' ? 'yes' : r.owned === '没到手' ? 'pending' : 'no') + '"></span>' +
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
    var ownedText = r.owned === '是' ? '已到手' : r.owned === '没到手' ? '买了 · 没到手' : r.owned;
    var rows = [
      ['作者', r.author], ['系列', r.series], ['状态', ownedText],
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
    $('fGrBookUrlH').value = isEdit ? (rec.grBookUrl || '') : '';
    $('fGrAuthorUrlH').value = isEdit ? (rec.grAuthorUrl || '') : '';
    $('fGrSeriesUrlH').value = isEdit ? (rec.grSeriesUrl || '') : '';
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
      goodreadsUrl: trim($('fGrUrl').value),
      grBookUrl: trim($('fGrBookUrlH').value),
      grAuthorUrl: trim($('fGrAuthorUrlH').value),
      grSeriesUrl: trim($('fGrSeriesUrlH').value)
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
            url: GR_SITE + (raw.indexOf('http') === 0 ? raw.replace(/^https?:\/\/[^/]+/, '') : raw)
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
          url: GR_SITE + '/book/show/' + m[1] + (m[2] ? '-' + m[2] : '')
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
  /* 书页 HTML → 系列页链接。实测 Dune 书页里有 2 个：主系列 + 母系列（Dune Universe） */
  function grSeriesUrlsFromBook(bookUrl) {
    return grFetchHtml(bookUrl).then(function (html) {
      var all = html.match(/\/series\/\d+[a-z0-9-]*/gi) || [];
      var uniq = all.filter(function (v, i) { return all.indexOf(v) === i; });
      if (!uniq.length) throw new Error('no-series');
      return {
        primary: GR_SITE + uniq[0],
        parents: uniq.slice(1).map(function (u) { return GR_SITE + u; })
      };
    });
  }
  /* 书页 HTML → 书名/系列名/序号。og:title 形如 "Dune (Dune, #1)"，一次到位，不用拿 slug 猜 */
  function grMetaFromBook(bookUrl) {
    return grFetchHtml(bookUrl).then(function (html) {
      var m = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
      if (!m) throw new Error('no og:title');
      var og = decodeEntities(m[1]).trim();
      var info = parseBookTextLine(og);
      if (!info.title) info.title = og;
      return info;
    });
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
    var p = hit.seriesUrl ? Promise.resolve(hit.seriesUrl) : Promise.reject(new Error('no url'));
    p = p.catch(function () {
      if (!hit.url) throw new Error('no book url');
      return grSeriesUrlsFromBook(hit.url).then(function (s) { return s.primary; });
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
    grPickDone();
    fetchSeriesLinkAndOffer(item);
  }
  function importSeriesBooks(info) {
    toast('正在读取《' + info.series + '》系列书目…');
    var booksP = info.seriesUrl ? grSeriesBooks(info.seriesUrl) : Promise.reject(new Error('no url'));
    booksP = booksP.catch(function () {
      return ddgBookSearch('\"' + info.series + '\"').then(function (books) {
        return books.map(function (b) { return { title: b.title, url: b.url }; });
      });
    });
    booksP.then(function (books) {
      if (!books.length) { toast('没解析到系列书目'); return; }
      var existing = {};
      records.forEach(function (r) {
        if (normTitle(r.series) === normTitle(info.series)) existing[normTitle(r.title)] = 1;
      });
      var news = books.filter(function (b) { return !existing[normTitle(b.title)]; }).slice(0, 40);
      if (!news.length) { toast('系列里的书都已经在你的书库了'); return; }
      if (!confirm('系列《' + info.series + '》找到 ' + books.length + ' 本，其中 ' + news.length +
        ' 本不在你的书库。\n\n添加这 ' + news.length + ' 本为「未购买」吗？')) return;
      news.forEach(function (b) {
        records.push({
          id: uid(),
          title: b.title,
          author: b.author || info.author,
          series: info.series,
          owned: '否',
          binding: '', date: '', source: '', sourceUrl: '',
          price: '', publisher: '', note: '',
          grBookUrl: b.url, grSeriesUrl: info.seriesUrl || '', grAuthorUrl: '',
          goodreadsUrl: b.url
        });
      });
      save(); render();
      toast('已添加 ' + news.length + ' 本《' + info.series + '》的书（状态：未购买）');
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
      ? Promise.all([
          grMetaFromBook(url).catch(function () { return null; }),
          grSeriesUrlsFromBook(url).catch(function () { return null; })
        ]).then(function (r) {
          var m = r[0], s = r[1];
          if (!m) return null;
          return { title: m.title, author: '', series: m.series,
                   seriesNum: m.seriesNum, seriesUrl: s ? s.primary : '' };
        })
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
      var author = first('author'), series = first('series'), seriesUrl = first('seriesUrl');
      $('fTitle').value = title;
      if (author) $('fAuthor').value = author;
      if (series) $('fSeries').value = series;
      if (seriesUrl) $('fGrSeriesUrlH').value = seriesUrl;
      if (!series && !isBook) {
        toast('已填好：' + title + (author ? ' / ' + author : '') +
          '（没查到系列信息；若确认有系列，可粘贴该书的 Goodreads 链接再识别一次）');
      }
      fetchSeriesLinkAndOffer({
        title: title, author: author, series: series,
        seriesNum: first('seriesNum'), seriesUrl: seriesUrl, url: url || ''
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
        return { title: b.title, author: b.author, series: b.series, url: b.url };
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
    if ($('detailModal').hidden && $('formModal').hidden && $('importModal').hidden && $('settingsModal').hidden) {
      document.body.style.overflow = '';
    }
  }
  ['detailModal', 'formModal', 'importModal', 'settingsModal'].forEach(function (mid) {
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
