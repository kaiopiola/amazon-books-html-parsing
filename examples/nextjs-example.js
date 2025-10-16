/**
 * Amazon Book Data Parser - Next.js API Route Example
 *
 * Place this file in: pages/api/parse-amazon-book.js
 * Usage: POST /api/parse-amazon-book with { isbn: "123456789X" }
 */

import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { isbn } = req.body;

  if (!isbn) {
    return res.status(400).json({ error: 'ISBN or ASIN is required' });
  }

  try {
    const amazonUrl = `https://www.amazon.com.br/dp/${isbn.trim()}`;

    // Fetch with proxy
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(amazonUrl)}`;
    const response = await fetch(proxyUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const bookData = {};

    // 1. Title
    const title = $('#productTitle, span[id="productTitle"]').text().trim();
    if (title) bookData.title = title;

    // 2. Authors
    const authors = [];
    $('.author a.a-link-normal, .author .contributorNameID').each((i, el) => {
      const author = $(el).text().trim();
      if (author && !author.includes('(') && !authors.includes(author)) {
        authors.push(author);
      }
    });
    if (authors.length > 0) bookData.authors = authors;

    // 3. Cover Image
    const imgEl = $('#landingImage, #imgBlkFront, #ebooksImgBlkFront');
    const imgSrc = imgEl.attr('data-old-hires') || imgEl.attr('src') || imgEl.attr('data-a-dynamic-image');

    if (imgSrc) {
      if (imgSrc.startsWith('{')) {
        try {
          const imgObj = JSON.parse(imgSrc);
          const urls = Object.keys(imgObj);
          if (urls.length > 0) bookData.imageUrl = urls[0];
        } catch (e) {
          bookData.imageUrl = imgSrc;
        }
      } else {
        bookData.imageUrl = imgSrc;
      }
    }

    // 4. Description
    const descSelectors = [
      '#bookDescription_feature_div noscript',
      '#bookDescription_feature_div .a-expander-content',
      '#feature-bullets ul.a-unordered-list'
    ];

    for (const selector of descSelectors) {
      const desc = $(selector).text().trim();
      if (desc && desc.length > 50) {
        bookData.description = desc;
        break;
      }
    }

    // Get details text
    let detailsText = '';
    const detailsSelectors = [
      '#detailBullets_feature_div',
      '#detail_bullets_id',
      '#productDetailsTable',
      '#detailBulletsWrapper_feature_div',
      '.detail-bullet-list'
    ];

    detailsSelectors.forEach(selector => {
      const text = $(selector).text();
      if (text) detailsText += ' ' + text;
    });

    // 5. ISBN-10
    const isbn10Match = detailsText.match(/ISBN-10[:\s]+([0-9X]{10})/i);
    if (isbn10Match) {
      bookData.isbn10 = isbn10Match[1];
      bookData.isbn = isbn10Match[1];
    }

    // 6. ISBN-13
    const isbn13Match = detailsText.match(/ISBN-13[:\s]+([0-9-]{13,17})/i);
    if (isbn13Match) {
      bookData.isbn13 = isbn13Match[1].replace(/-/g, '');
      if (!bookData.isbn) bookData.isbn = bookData.isbn13;
    }

    // 7. ASIN
    const asinPatterns = [
      /ASIN[:\s]+([A-Z0-9]{10})(?:\s|$)/i,
      /\bASIN[:\s]*([A-Z0-9]{10})\b/i,
    ];

    for (const pattern of asinPatterns) {
      const asinMatch = detailsText.match(pattern);
      if (asinMatch && asinMatch[1]) {
        const potentialAsin = asinMatch[1].toUpperCase();
        if (/^[A-Z0-9]{10}$/.test(potentialAsin) && !potentialAsin.match(/^[A-Z]+$/)) {
          bookData.asin = potentialAsin;
          break;
        }
      }
    }

    // 8. Publisher
    const publisherPatterns = [
      /editora\s+([a-zà-ÿ\s&\-\.]+?)\s+data\s+da\s+publicação/i,
      /editora\s+([a-zà-ÿ\s&\-\.]+?)\s+dimensões/i,
      /publisher\s+([a-z\s&\-\.]+?)\s+publication\s+date/i,
    ];

    for (const pattern of publisherPatterns) {
      const publisherMatch = detailsText.toLowerCase().match(pattern);
      if (publisherMatch) {
        let publisher = publisherMatch[1].trim();
        publisher = publisher.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        if (publisher.length > 1) {
          bookData.publisher = publisher;
          break;
        }
      }
    }

    // 9. Publication Date
    const months = {
      'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
      'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
      'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12',
    };

    const dateMatch = html.match(/(\d{1,2})\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(\d{4})/i);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const month = months[dateMatch[2].toLowerCase()];
      const year = dateMatch[3];
      bookData.publishedDate = `${year}-${month}-${day}`;
    }

    // 10. Pages
    const pagesMatch = detailsText.match(/(\d+)\s*páginas/i);
    if (pagesMatch) {
      bookData.pageCount = parseInt(pagesMatch[1]);
    }

    // 11. Language
    const langMatch = detailsText.match(/Idioma[:\s]+([^\n;]+)/i);
    if (langMatch) {
      const langText = langMatch[1].trim().toLowerCase();
      if (langText.includes('português')) bookData.language = 'pt-BR';
      else if (langText.includes('inglês')) bookData.language = 'en';
      else if (langText.includes('espanhol')) bookData.language = 'es';
    }

    // 12. Categories
    const categories = [];
    $('#wayfinding-breadcrumbs_feature_div a, .a-breadcrumb a').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 3 && text.length < 50) {
        const normalized = text.toLowerCase();
        if (normalized.includes('ficção') && !categories.includes('Fiction')) {
          categories.push('Fiction');
        }
        if (normalized.includes('romance') && !categories.includes('Romance')) {
          categories.push('Romance');
        }
      }
    });

    if (categories.length > 0) bookData.categories = categories;

    console.log('✅ Book data extracted:', bookData);

    return res.status(200).json(bookData);

  } catch (error) {
    console.error('Error parsing Amazon book:', error);
    return res.status(500).json({ error: error.message });
  }
}
