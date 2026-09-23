document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('url-input');
  const goBtn = document.getElementById('go-btn');
  const progressBar = document.getElementById('progress-bar');
  const searchResults = document.getElementById('search-results');
  const webView = document.getElementById('web-view');

  function startLoading() {
    progressBar.style.width = '0%';
    progressBar.style.display = 'block';
    setTimeout(() => { progressBar.style.width = '70%'; }, 50);
  }

  function stopLoading() {
    progressBar.style.width = '100%';
    setTimeout(() => {
      progressBar.style.display = 'none';
      progressBar.style.width = '0%';
    }, 300);
  }

  function isUrl(string) {
    const trimmed = string.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return true;
    if (trimmed.includes('.') && !trimmed.includes(' ')) return true;
    return false;
  }

  function loadProxyUrl(url) {
    startLoading();
    let fullUrl = url;
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = 'https://' + fullUrl;
    }

    searchResults.style.display = 'none';
    webView.style.display = 'block';
    webView.src = '/api/proxy?url=' + encodeURIComponent(fullUrl);

    webView.onload = () => {
      stopLoading();
    };
  }

  async function performSearch(query) {
    startLoading();
    webView.style.display = 'none';
    searchResults.style.display = 'block';
    searchResults.innerHTML = '<p class="loading-text">Recherche en cours...</p>';

    try {
      const res = await fetch('/api/search?q=' + encodeURIComponent(query));
      const data = await res.json();
      stopLoading();

      if (data.results && data.results.length > 0) {
        searchResults.innerHTML = data.results.map(item => `
          <div class="result-card">
            <h3><a href="#" class="proxy-link" data-url="${item.link}">${item.title}</a></h3>
            <p class="result-url">${item.link}</p>
            <p class="result-snippet">${item.snippet}</p>
          </div>
        `).join('');

        document.querySelectorAll('.proxy-link').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetUrl = link.getAttribute('data-url');
            input.value = targetUrl;
            loadProxyUrl(targetUrl);
          });
        });
      } else {
        searchResults.innerHTML = '<p>Aucun résultat trouvé.</p>';
      }
    } catch (err) {
      stopLoading();
      searchResults.innerHTML = '<p>Erreur lors de la recherche.</p>';
    }
  }

  function handleAction() {
    const query = input.value.trim();
    if (!query) return;

    if (isUrl(query)) {
      loadProxyUrl(query);
    } else {
      performSearch(query);
    }
  }

  // Écouteur sur le bouton Go
  goBtn.addEventListener('click', handleAction);

  // Écouteur sur la touche Entrée
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAction();
    }
  });
});
