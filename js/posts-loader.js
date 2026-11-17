(function () {
  'use strict';

  var POSTS_PER_PAGE = 9; // keep in sync with scripts/build-post-html.mjs
  var allPosts = [];
  var filteredPosts = [];
  var state = { category: 'all', q: '', page: 1 };

  var grid = document.getElementById('posts-grid');
  var emptyState = document.getElementById('empty-state');
  var emptyTitle = document.getElementById('empty-title');
  var emptyText = document.getElementById('empty-text');
  var pagination = document.getElementById('pagination');
  var prevBtn = document.getElementById('prev-page');
  var nextBtn = document.getElementById('next-page');
  var pageInfo = document.getElementById('page-info');
  var searchInput = document.getElementById('search');
  var chips = document.querySelectorAll('.filter-chip');

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function estimateReadTime(wordCount) {
    return Math.max(1, Math.ceil((wordCount || 600) / 200));
  }

  // Keep in sync with CATEGORY_COLORS in scripts/build-post-html.mjs.
  function getCategoryColor(cat) {
    var colors = {
      'AI': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
      'Security': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      'Compliance': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      'IT Ops': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    };
    return colors[cat] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }

  function safeColor(color) {
    return /^#[0-9a-f]{3,8}$/i.test(color || '') ? color : '#1a1a2e';
  }

  // Keep the markup in sync with renderPostCard() in scripts/build-post-html.mjs.
  function cardHtml(post) {
    var href = 'posts/' + escapeHtml(post.slug) + '.html';
    var cats = (post.categories && post.categories.length) ? post.categories.slice() : ['AI'];
    if (state.category !== 'all') {
      cats.sort(function (a, b) {
        return (a === state.category ? -1 : 0) - (b === state.category ? -1 : 0);
      });
    }
    var badges = cats.map(function (cat) {
      return '<span class="inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full ' + getCategoryColor(cat) + '">' + escapeHtml(cat) + '</span>';
    }).join('');
    var image = (post.heroImage && post.heroImage.url)
      ? '<a href="' + href + '" class="block aspect-video overflow-hidden" style="background-color:' + safeColor(post.heroImage.color) + '" tabindex="-1" aria-hidden="true">' +
          '<img src="' + escapeHtml(post.heroImage.url) + '" alt="" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"></a>'
      : '';

    return '<article class="group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col">' + image +
      '<div class="p-6 flex flex-col flex-1">' +
        '<div class="flex items-center gap-2 mb-3 flex-wrap">' + badges + '<span class="text-xs text-gray-400">' + estimateReadTime(post.wordCount) + ' min read</span></div>' +
        '<h2 class="text-lg font-bold leading-snug mb-2 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors"><a href="' + href + '" class="block">' + escapeHtml(post.title) + '</a></h2>' +
        '<p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4 flex-1">' + escapeHtml(post.excerpt || '') + '</p>' +
        '<div class="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">' +
          '<time datetime="' + escapeHtml(post.date) + '" class="text-xs text-gray-400">' + formatDate(post.date) + '</time>' +
          '<a href="' + href + '" class="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">Read more &rarr;</a>' +
        '</div></div></article>';
  }

  function searchText(post) {
    return [post.title, post.excerpt, (post.tags || []).join(' '), (post.categories || []).join(' ')]
      .join(' ')
      .toLowerCase();
  }

  function applyFilters() {
    var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    filteredPosts = allPosts.filter(function (p) {
      if (state.category !== 'all' && (!p.categories || p.categories.indexOf(state.category) === -1)) return false;
      if (terms.length === 0) return true;
      var text = p._search || (p._search = searchText(p));
      return terms.every(function (t) { return text.indexOf(t) !== -1; });
    });
    var totalPages = Math.max(1, Math.ceil(filteredPosts.length / POSTS_PER_PAGE));
    state.page = Math.min(Math.max(1, state.page), totalPages);
  }

  // Filters, search and page live in the URL so a filtered view can be shared.
  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    state.category = params.get('category') || 'all';
    state.q = params.get('q') || '';
    state.page = parseInt(params.get('page'), 10) || 1;
  }

  function writeUrl() {
    var params = new URLSearchParams();
    if (state.category !== 'all') params.set('category', state.category);
    if (state.q) params.set('q', state.q);
    if (state.page > 1) params.set('page', String(state.page));
    var qs = params.toString();
    history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  function syncControls() {
    chips.forEach(function (c) {
      c.classList.toggle('active', c.getAttribute('data-filter') === state.category);
    });
    if (searchInput && searchInput.value !== state.q) searchInput.value = state.q;
  }

  function render() {
    if (!grid) return;
    applyFilters();
    writeUrl();

    if (filteredPosts.length === 0) {
      grid.innerHTML = '';
      if (allPosts.length > 0 && emptyTitle && emptyText) {
        emptyTitle.textContent = 'No matching posts';
        emptyText.textContent = 'Try a different search or category.';
      }
      emptyState && emptyState.classList.remove('hidden');
      pagination && pagination.classList.add('hidden');
      return;
    }
    emptyState && emptyState.classList.add('hidden');

    var start = (state.page - 1) * POSTS_PER_PAGE;
    grid.innerHTML = filteredPosts.slice(start, start + POSTS_PER_PAGE).map(cardHtml).join('');

    var totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
    if (totalPages > 1 && pagination) {
      pagination.classList.remove('hidden');
      prevBtn.disabled = state.page <= 1;
      nextBtn.disabled = state.page >= totalPages;
      pageInfo.textContent = 'Page ' + state.page + ' of ' + totalPages;
    } else if (pagination) {
      pagination.classList.add('hidden');
    }
  }

  function goToPage(page) {
    state.page = page;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      state.category = chip.getAttribute('data-filter');
      state.page = 1;
      syncControls();
      render();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      state.q = searchInput.value.trim();
      state.page = 1;
      render();
    });
  }

  if (prevBtn) prevBtn.addEventListener('click', function () { goToPage(state.page - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { goToPage(state.page + 1); });

  readUrl();
  syncControls();

  fetch('posts/index.json')
    .then(function (r) { return r.json(); })
    .then(function (posts) {
      allPosts = posts;
      render();
    })
    .catch(function () {
      // Keep the cards pre-rendered into index.html; only show the empty state if there are none.
      if (emptyState && grid && !grid.querySelector('article')) emptyState.classList.remove('hidden');
    });
})();
