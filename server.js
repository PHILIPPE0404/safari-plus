const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Recherche via DuckDuckGo Lite (compatible avec les serveurs cloud)
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Recherche vide' });

  try {
    const url = 'https://lite.duckduckgo.com/lite/';
    const response = await axios.post(url, `q=${encodeURIComponent(query)}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $('.result-snippet').each((i, element) => {
      const row = $(element).closest('tr').prev();
      const linkElem = row.find('a.result-link');
      const title = linkElem.text().trim();
      const link = linkElem.attr('href');
      const snippet = $(element).text().trim();

      if (title && link) {
        results.push({ title, link, snippet });
      }
    });

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des résultats.' });
  }
});

// Proxy levant les restrictions d'affichage en iframe
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL manquante');

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      responseType: 'text'
    });

    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.send(response.data);
  } catch (err) {
    res.status(500).send('Impossible de charger cette page via le proxy.');
  }
});

app.listen(PORT, () => {
  console.log(`Serveur SAFARI + démarré sur le port ${PORT}`);
});
