/**
 * Amazon Book Data Parser - Node.js Example
 *
 * Requirements:
 *   npm install cheerio node-fetch
 *
 * Usage:
 *   const { parseAmazonBook } = require('./amazon-parser');
 *   const bookData = await parseAmazonBook('8556512666');
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');

/**
 * Parse book data from Amazon.com.br product page
 *
 * @param {string} identifier - ISBN-10, ISBN-13, or ASIN
 * @returns {Promise<Object>} Book data
 */
async function parseAmazonBook(identifier) {
  const amazonUrl = `https://www.amazon.com.br/dp/${identifier.trim()}`;
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(amazonUrl)}`;

  console.log(`🔍 Fetching: ${amazonUrl}`);

  try {
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
    const imgSrc =
      imgEl.attr('data-old-hires') ||
      imgEl.attr('src') ||
      imgEl.attr('data-a-dynamic-image');

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
      '#feature-bullets ul.a-unordered-list',
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
      '.detail-bullet-list',
    ];

    detailsSelectors.forEach((selector) => {
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
      const isbn13 = isbn13Match[1].replace(/-/g, '');
      bookData.isbn13 = isbn13;
      if (!bookData.isbn) bookData.isbn = isbn13;
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
        if (
          /^[A-Z0-9]{10}$/.test(potentialAsin) &&
          !/^[A-Z]+$/.test(potentialAsin)
        ) {
          bookData.asin = potentialAsin;
          break;
        }
      }
    }

    // 8. Publisher
    const publisherPatterns = [
      /editora\s+([a-zà-ÿ\s&\-\.]+?)\s+data\s+da\s+publicação/i,
      /editora\s+([a-zà-ÿ\s&\-\.]+?)\s+dimensões/i,
      /editora\s+([a-zà-ÿ\s&\-\.]+?)\s+(?:isbn|asin)/i,
      /publisher\s+([a-z\s&\-\.]+?)\s+publication\s+date/i,
    ];

    for (const pattern of publisherPatterns) {
      const publisherMatch = detailsText.toLowerCase().match(pattern);
      if (publisherMatch) {
        let publisher = publisherMatch[1].trim();
        // Capitalize each word
        publisher = publisher
          .split(' ')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        if (publisher.length > 1 && !/^\d+$/.test(publisher)) {
          bookData.publisher = publisher;
          break;
        }
      }
    }

    // 9. Publication Date
    const months = {
      janeiro: '01',
      fevereiro: '02',
      março: '03',
      abril: '04',
      maio: '05',
      junho: '06',
      julho: '07',
      agosto: '08',
      setembro: '09',
      outubro: '10',
      novembro: '11',
      dezembro: '12',
      january: '01',
      february: '02',
      march: '03',
      april: '04',
      may: '05',
      june: '06',
      july: '07',
      august: '08',
      september: '09',
      october: '10',
      november: '11',
      december: '12',
    };

    const datePatterns = [
      {
        regex:
          /(\d{1,2})\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(\d{4})/i,
        format: 'br-short',
      },
      {
        regex:
          /(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i,
        format: 'br-long',
      },
      {
        regex:
          /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i,
        format: 'en',
      },
    ];

    for (const { regex, format } of datePatterns) {
      const dateMatch = html.match(regex);
      if (dateMatch) {
        let day, month, year;

        if (format === 'br-short' || format === 'br-long') {
          day = dateMatch[1].padStart(2, '0');
          const monthName = dateMatch[2].toLowerCase();
          month = months[monthName] || '01';
          year = dateMatch[3];
        } else if (format === 'en') {
          const monthName = dateMatch[1].toLowerCase();
          month = months[monthName] || '01';
          day = dateMatch[2].padStart(2, '0');
          year = dateMatch[3];
        }

        bookData.publishedDate = `${year}-${month}-${day}`;
        console.log(`✅ Date found: ${bookData.publishedDate}`);
        break;
      }
    }

    // 10. Pages
    const pagesPatterns = [
      /(\d+)\s*páginas/i,
      /Comprimento[:\s]+(\d+)\s*páginas/i,
      /Length[:\s]+(\d+)\s*pages/i,
    ];

    for (const pattern of pagesPatterns) {
      const pagesMatch = detailsText.match(pattern);
      if (pagesMatch) {
        bookData.pageCount = parseInt(pagesMatch[1]);
        break;
      }
    }

    // 11. Language
    const languagePatterns = [
      /Idioma[:\s]+([^\n;]+)/i,
      /Language[:\s]+([^\n;]+)/i,
    ];

    const languageMap = {
      português: 'pt-BR',
      portuguese: 'pt-BR',
      inglês: 'en',
      english: 'en',
      espanhol: 'es',
      spanish: 'es',
      francês: 'fr',
      french: 'fr',
      alemão: 'de',
      german: 'de',
      italiano: 'it',
      italian: 'it',
    };

    for (const pattern of languagePatterns) {
      const langMatch = detailsText.match(pattern);
      if (langMatch) {
        const langText = langMatch[1].trim().toLowerCase();

        for (const [key, value] of Object.entries(languageMap)) {
          if (langText.includes(key)) {
            bookData.language = value;
            break;
          }
        }

        if (bookData.language) break;
      }
    }

    // 12. Categories
    const categoryElements = $(
      '#wayfinding-breadcrumbs_feature_div a, .a-breadcrumb a'
    );
    const categories = [];

    const categoryMap = {
      ficção: 'Fiction',
      fiction: 'Fiction',
      romance: 'Romance',
      fantasia: 'Fantasy',
      fantasy: 'Fantasy',
      mistério: 'Mystery',
      mystery: 'Mystery',
      terror: 'Horror',
      horror: 'Horror',
      suspense: 'Thriller',
      thriller: 'Thriller',
    };

    categoryElements.each((i, el) => {
      const text = $(el).text().trim();
      if (
        text &&
        text.length > 3 &&
        text.length < 50 &&
        !text.includes('Livros') &&
        !text.toLowerCase().includes('home') &&
        !text.toLowerCase().includes('kindle') &&
        !text.toLowerCase().includes('store')
      ) {
        const normalized = text.toLowerCase();
        for (const [key, value] of Object.entries(categoryMap)) {
          if (normalized.includes(key) && !categories.includes(value)) {
            categories.push(value);
          }
        }
      }
    });

    if (categories.length > 0) bookData.categories = categories;

    console.log(`✅ Extracted ${Object.keys(bookData).length} fields`);
    return bookData;
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Example usage
if (require.main === module) {
  (async () => {
    try {
      const bookData = await parseAmazonBook('8556512666');
      console.log(JSON.stringify(bookData, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = { parseAmazonBook };
