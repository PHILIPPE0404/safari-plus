const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  console.log('[LOG] ' + new Date().toLocaleTimeString() + ' - ' + req.method + ' ' + req.url);
  next();
});

// Route de recherche : Wikipédia FR + secours SearXNG
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Recherche vide' });

  console.log('[RECHERCHE] Lancement pour : "' + query + '"');

  // 1. Wikipédia avec User-Agent valide
  try {
    const wikiRes = await axios.get('https://fr.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'search',
        srsearch: query,
        format: 'json',
        origin: '*'
      },
      headers: {
        'User-Agent': 'SafariPlusApp/1.0 (https://safari-plus.onrender.com; contact@safariplus.local)'
      },
      timeout: 5000
    });

    if (wikiRes.data && wikiRes.data.query && wikiRes.data.query.search && wikiRes.data.query.search.length > 0) {
      const wikiResults = wikiRes.data.query.search.slice(0, 10).map(item => ({
        title: item.title,
        link: 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(item.title),
        snippet: item.snippet.replace(/<[^>]*>?/gm, '')
      }));

      console.log('[RECHERCHE SUCCESS] ' + wikiResults.length + ' résultats Wikipédia');
      return res.json({ results: wikiResults });
    }
  } catch (wikiErr) {
    console.log('[RECHERCHE WARNING] Wikipédia indisponible : ' + wikiErr.message);
  }

  // 2. Instances SearXNG publiques de secours
  const instances = [
    'https://searx.be/search',
    'https://searx.ebinar.me/search',
    'https://searx.mrbits.it/search'
  ];

  for (const instance of instances) {
    try {
      const response = await axios.get(instance, {
        params: { q: query, format: 'json', language: 'fr-FR' },
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 4000
      });

      if (response.data && response.data.results && response.data.results.length > 0) {
        const results = response.data.results.slice(0, 10).map(item => ({
          title: item.title,
          link: item.url,
          snippet: item.content || 'Aucune description disponible.'
        }));

        console.log('[RECHERCHE SUCCESS] ' + results.length + ' résultats via ' + instance);
        return res.json({ results: results });
      }
    } catch (err) {
      console.log('[RECHERCHE WARNING] ' + instance + ' indisponible : ' + err.message);
    }
  }

  res.status(500).json({ error: 'Aucun résultat trouvé.' });
});

// Proxy web optimisé
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL manquante');

  console.log('[PROXY] Chargement de : ' + targetUrl);

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      responseType: 'text',
      timeout: 10000
    });

    let html = response.data;
    const urlObj = new URL(targetUrl);
    const origin = urlObj.origin;

    const injected = '<base href="' + origin + '/"><meta name="referrer" content="no-referrer">';

    if (html.includes('<head>')) {
      html = html.replace('<head>', '<head>' + injected);
    } else {
      html = injected + html;
    }

    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.send(html);
    console.log('[PROXY SUCCESS] Page envoyée : ' + targetUrl);
  } catch (err) {
    console.error('[PROXY ERROR] ' + err.message);
    res.status(500).send('Impossible de charger la page : ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log('[SERVEUR] SAFARI + démarré sur le port ' + PORT);
});
