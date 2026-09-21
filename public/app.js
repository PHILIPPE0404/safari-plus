const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
const loader = document.getElementById('loader');
const progressBar = document.getElementById('progress-bar');
const resultsContainer = document.getElementById('results');
const iframe = document.getElementById('web-frame');

function setProgress(percent) {
  progressBar.style.width = percent + '%';
  if (percent === 100) {
    setTimeout(() => {
      progressBar.style.width = '0%';
    }, 300);
  }
}

function startLoading() {
  loader.classList.remove('hidden');
  setProgress(20);
  let progress = 20;
  window.loadingInterval = setInterval(() => {
    if (progress < 85) {
      progress += Math.random() * 10;
      setProgress(progress);
    }
  }, 200);
}

function stopLoading() {
  clearInterval(window.loadingInterval);
  setProgress(100);
  loader.classList.add('hidden');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  startLoading();
  resultsContainer.innerHTML = '';
  iframe.classList.add('hidden');
  resultsContainer.classList.remove('hidden');

  // Vérifie si la saisie est une URL directe
  if (query.startsWith('http://') || query.startsWith('https://')) {
    iframe.src = `/api/proxy?url=${encodeURIComponent(query)}`;
    iframe.onload = () => {
      iframe.classList.remove('hidden');
      resultsContainer.classList.add('hidden');
      stopLoading();
    };
    return;
  }

  // Sinon, exécute la recherche
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    
    stopLoading();

    if (!data.results || data.results.length === 0) {
      resultsContainer.innerHTML = '<p>Aucun résultat trouvé.</p>';
      return;
    }

    data.results.forEach(item => {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.innerHTML = `
        <a href="${item.link}" target="_blank">${item.title}</a>
        <p>${item.snippet}</p>
      `;
      resultsContainer.appendChild(card);
    });
  } catch (err) {
    stopLoading();
    resultsContainer.innerHTML = '<p>Erreur lors du chargement des résultats.</p>';
  }
});
