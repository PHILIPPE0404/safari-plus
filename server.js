const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Affichage des requêtes dans les logs Render
app.use((req, res, next) => {
  console.log(`[LOG] ${new Date().toLocaleTimeString()} - ${req.method} ${req.url}`);
  next();
});

// Moteur de recherche optimisé via DuckDuckGo Lite (POST)
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    console.log('[RECHERCHE] Requête vide');
    return res.status(400).json({ error: 'Recherche vide' });
  }

  console.log(`[RECHERCHE] Lancement pour : "${query}"`);

  try {
    const params = new URLSearchParams();
    params.append('q', query);

    const response = await axios.post('https://lite.duckduckgo.com/lite/', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      timeout: 12000
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $('.result-snippet').each((i, element) => {
      const snippet = $(element).text().trim();
      const tr = $(element).closest('tr').prev();
      const a = tr.find('a.result-link');
      const title = a.text().trim();
      const link = a.attr('href');

      if (title && link) {
        results.push({ title, link, snippet });
      }
    });

    console.log(`[RECHERCHE SUCCESS] ${results.length} résultats trouvés`);
    res.json({ results });
  } catch (error) {
    console.error(`[RECHERCHE ERROR] ${error.message}`);
    res.status(500).json({ error: 'Le serveur de recherche n\'a pas répondu à temps.', details: error.message });
  }
});

// Proxy pour afficher la page dans l'iframe
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
      timeout: 12000
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
