(function () {
  'use strict';

  var POSTS_PER_PAGE = 9;
  var allPosts = [];
  var filteredPosts = [];
  var currentPage = 1;
  var currentFilter = 'all';

  var grid = document.getElementById('posts-grid');
  var emptyState = document.getElementById('empty-state');
  var pagination = document.getElementById('pagination');
  var prevBtn = document.getElementById('prev-page');
  var nextBtn = document.getElementById('next-page');
  var pageInfo = document.getElementById('page-info');

  function formatDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function estimateReadTime(wordCount) {
    return Math.max(1, Math.ceil((wordCount || 600) / 200));
  }

  function getCategoryColor(cat) {
    var colors = {
      'AI': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
      'Security': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      'Compliance': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      'IT Ops': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    };
    return colors[cat] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }

  function createPostCard(post) {
    var category = (post.categories && post.categories[0]) || 'AI';
    var readTime = estimateReadTime(post.wordCount);
    var card = document.createElement('article');
    card.className = 'group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col';
    card.setAttribute('data-categories', JSON.stringify(post.categories || []));

    card.innerHTML =
      '<div class="p-6 flex flex-col flex-1">' +
        '<div class="flex items-center gap-2 mb-3">' +
          '<span class="inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full ' + getCategoryColor(category) + '">' + category + '</span>' +
          '<span class="text-xs text-gray-400">' + readTime + ' min read</span>' +
        '</div>' +
        '<h2 class="text-lg font-bold leading-snug mb-2 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">' +
          '<a href="posts/' + post.slug + '.html" class="block">' + escapeHtml(post.title) + '</a>' +
        '</h2>' +
        '<p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4 flex-1">' + escapeHtml(post.excerpt || '') + '</p>' +
        '<div class="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">' +
          '<time datetime="' + post.date + '" class="text-xs text-gray-400">' + formatDate(post.date) + '</time>' +
          '<a href="posts/' + post.slug + '.html" class="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">Read more &rarr;</a>' +
        '</div>' +
      '</div>';

    return card;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function applyFilter() {
    if (currentFilter === 'all') {
      filteredPosts = allPosts.slice();
    } else {
      filteredPosts = allPosts.filter(function (p) {
        return p.categories && p.categories.indexOf(currentFilter) !== -1;
      });
    }
    currentPage = 1;
    render();
  }

  function render() {
    if (!grid) return;
    grid.innerHTML = '';

    var totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
    var start = (currentPage - 1) * POSTS_PER_PAGE;
    var pagePosts = filteredPosts.slice(start, start + POSTS_PER_PAGE);

    if (filteredPosts.length === 0) {
      emptyState && emptyState.classList.remove('hidden');
      pagination && pagination.classList.add('hidden');
      return;
    }

    emptyState && emptyState.classList.add('hidden');

    pagePosts.forEach(function (post) {
      grid.appendChild(createPostCard(post));
    });

    if (totalPages > 1 && pagination) {
      pagination.classList.remove('hidden');
      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = currentPage >= totalPages;
      pageInfo.textContent = 'Page ' + currentPage + ' of ' + totalPages;
    } else if (pagination) {
      pagination.classList.add('hidden');
    }
  }

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      currentFilter = chip.getAttribute('data-filter');
      applyFilter();
    });
  });

  // Pagination
  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      if (currentPage > 1) { currentPage--; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      var totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
      if (currentPage < totalPages) { currentPage++; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
  }

  // Load posts
  fetch('posts/index.json')
    .then(function (r) { return r.json(); })
    .then(function (posts) {
      allPosts = posts;
      filteredPosts = posts.slice();
      render();
    })
    .catch(function () {
      if (emptyState) emptyState.classList.remove('hidden');
    });
})();
