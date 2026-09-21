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

// Recherche via l'API JSON de SearXNG (agrégateur Google/Bing insensible aux blocages cloud)
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Recherche vide' });

  console.log(`[RECHERCHE] Lancement pour : "${query}"`);

  // Liste d'instances publiques SearXNG pour basculer automatiquement en cas de lenteur
  const instances = [
    'https://searx.be/search',
    'https://search.bus-hit.me/search',
    'https://searx.space/search',
    'https://searx.fyi/search'
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

        console.log(`[RECHERCHE SUCCESS] ${results.length} résultats récupérés via ${instance}`);
        return res.json({ results });
      }
    } catch (err) {
      console.log(`[RECHERCHE WARNING] Instance ${instance} indisponible (${err.message}), tentative suivante...`);
    }
  }

  console.error('[RECHERCHE ERROR] Toutes les instances de recherche ont expiré.');
  res.status(500).json({ error: 'Impossible d\'obtenir les résultats de recherche.' });
});

// Proxy pour afficher les pages web dans l'iframe
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
