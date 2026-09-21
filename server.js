const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// API de recherche Google grattée côté serveur
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Recherche vide' });

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $('.result').each((i, element) => {
      const title = $(element).find('.result__title a').text().trim();
      const link = $(element).find('.result__url').attr('href') || $(element).find('.result__title a').attr('href');
      const snippet = $(element).find('.result__snippet').text().trim();

      if (title && link) {
        results.push({ title, link, snippet });
      }
    });

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des résultats.' });
  }
});

// Proxy pour afficher une page web
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL manquante');

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    res.send(response.data);
  } catch (err) {
    res.status(500).send('Impossible de charger la page.');
  }
});

app.listen(PORT, () => {
  console.log(`Serveur SAFARI + démarré sur le port ${PORT}`);
});
