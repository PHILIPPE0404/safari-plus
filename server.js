const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  console.log(`[LOG] ${new Date().toLocaleTimeString()} - ${req.method} ${req.url}`);
  next();
});

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Recherche vide' });

  console.log(`[RECHERCHE] Lancement pour : "${query}"`);

  // Liste d'instances SearXNG publiques vérifiées
  const instances = [
    'https://paulgo.io/search',
    'https://searx.priv.at/search',
    'https://searx.be/search',
    'https://searx.tiekoetter.com/search'
  ];

  for (const instance of instances) {
    try {
      const response = await axios.get(instance, {
        params: {
          q: query,
          format: 'json',
          language: 'fr-FR'
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 4000
      });

      if (response.data && response.data.results && response.data.results.length > 0) {
        const results = response.data.results.slice(0, 10).map(item => ({
          title: item.title,
          link: item.url,
          snippet: item.content || 'Aucune description disponible.'
        }));

        console.log(`[RECHERCHE SUCCESS] ${results.length} résultats trouvés via ${instance}`);
        return res.json({ results });
      }
    } catch (err) {
      console.log(`[RECHERCHE WARNING] Instance ${instance} indisponible (${err.message}), tentative suivante...`);
    }
  }

  // Solution de secours : Recherche Wikipédia si SearXNG ne répond pas
  try {
    console.log('[RECHERCHE INFO] Utilisation du système de secours Wikipédia...');
    const wikiRes = await axios.get('https://fr.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'search',
        srsearch: query,
        format: 'json',
        origin: '*'
      },
      timeout: 4000
    });

    if (wikiRes.data && wikiRes.data.query && wikiRes.data.query.search) {
      const wikiResults = wikiRes.data.query.search.slice(0, 10).map(item => ({
        title: item.title,
        link: `https://fr.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
        snippet: item.snippet.replace(/<[^>]*>?/gm, '')
      }));

      if (wikiResults.length > 0) {
        console.log(`[RECHERCHE SUCCESS] ${wikiResults.length} résultats récupérés via Wikipédia API`);
        return res.json({ results: wikiResults });
      }
    }
  } catch (wikiErr) {
    console.error(`[RECHERCHE ERROR] Secours Wikipédia indisponible : ${wikiErr.message}`);
  }

  res.status(500).json({ error: 'Impossible de récupérer les résultats pour le moment.' });
});

app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL manquante');

  console.log(`[PROXY] Chargement de : ${targetUrl}`);

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      responseType: 'text',
      timeout: 10000
    });

    let html = response.data;
    const urlObj = new URL(targetUrl);
    const origin = urlObj.origin;

    const baseTag = `<base href="${origin}/">`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${baseTag}`);
    } else {
      html = baseTag + html;
    }

    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.send(html);
    console.log(`[PROXY SUCCESS] Page envoyée : ${targetUrl}`);
  } catch (err) {
    console.error(`[PROXY ERROR] ${err.message}`);
    res.status(500).send(`Impossible de charger la page : ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`[SERVEUR] SAFARI + démarré sur le port ${PORT}`);
});
