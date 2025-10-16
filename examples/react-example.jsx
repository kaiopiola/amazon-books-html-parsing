import React, { useState } from 'react';

/**
 * Amazon Book Data Parser - React Example
 *
 * Extracts book information from Amazon.com.br product pages
 */

const AmazonBookParser = () => {
  const [isbn, setIsbn] = useState('');
  const [loading, setLoading] = useState(false);
  const [bookData, setBookData] = useState(null);

  const fetchBookData = async (identifier) => {
    setLoading(true);
    try {
      const amazonUrl = `https://www.amazon.com.br/dp/${identifier.trim()}`;
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(amazonUrl)}`;

      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const data = {};

      // 1. Title
      const titleEl = doc.querySelector('#productTitle, span[id="productTitle"]');
      if (titleEl) data.title = titleEl.textContent.trim();

      // 2. Authors
      const authorElements = doc.querySelectorAll('.author a.a-link-normal, .author .contributorNameID');
      const authors = [];
      authorElements.forEach(el => {
        const author = el.textContent.trim();
        if (author && !author.includes('(') && !authors.includes(author)) {
          authors.push(author);
        }
      });
      if (authors.length > 0) data.authors = authors;

      // 3. Cover Image
      const imgEl = doc.querySelector('#landingImage, #imgBlkFront, #ebooksImgBlkFront');
      if (imgEl) {
        const imgSrc = imgEl.getAttribute('data-old-hires') ||
                       imgEl.getAttribute('src') ||
                       imgEl.getAttribute('data-a-dynamic-image');

        if (imgSrc) {
          if (imgSrc.startsWith('{')) {
            try {
              const imgObj = JSON.parse(imgSrc);
              const urls = Object.keys(imgObj);
              if (urls.length > 0) data.imageUrl = urls[0];
            } catch (e) {
              data.imageUrl = imgSrc;
            }
          } else {
            data.imageUrl = imgSrc;
          }
        }
      }

      // 4. Description
      const descSelectors = [
        '#bookDescription_feature_div noscript',
        '#bookDescription_feature_div .a-expander-content',
        '#feature-bullets ul.a-unordered-list'
      ];

      for (const selector of descSelectors) {
        const descEl = doc.querySelector(selector);
        if (descEl) {
          const desc = descEl.textContent.trim();
          if (desc && desc.length > 50) {
            data.description = desc;
            break;
          }
        }
      }

      // Get details text
      const detailsElements = [
        doc.querySelector('#detailBullets_feature_div'),
        doc.querySelector('#detail_bullets_id'),
        doc.querySelector('#productDetailsTable'),
        doc.querySelector('#detailBulletsWrapper_feature_div'),
        doc.querySelector('.detail-bullet-list'),
      ].filter(el => el);

      let detailsText = '';
      detailsElements.forEach(el => {
        if (el) detailsText += ' ' + el.textContent;
      });

      // 5. ISBN-10
      const isbn10Match = detailsText.match(/ISBN-10[:\s]+([0-9X]{10})/i);
      if (isbn10Match) {
        data.isbn10 = isbn10Match[1];
        data.isbn = isbn10Match[1];
      }

      // 6. ISBN-13
      const isbn13Match = detailsText.match(/ISBN-13[:\s]+([0-9-]{13,17})/i);
      if (isbn13Match) {
        data.isbn13 = isbn13Match[1].replace(/-/g, '');
        if (!data.isbn) data.isbn = data.isbn13;
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
            data.asin = potentialAsin;
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
        /publisher\s+([a-z\s&\-\.]+?)\s+(?:isbn|asin)/i,
      ];

      for (const pattern of publisherPatterns) {
        const publisherMatch = detailsText.toLowerCase().match(pattern);
        if (publisherMatch) {
          let publisher = publisherMatch[1].trim();
          publisher = publisher.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          if (publisher.length > 1 && !/^\d+$/.test(publisher)) {
            data.publisher = publisher;
            break;
          }
        }
      }

      // 9. Publication Date
      const months = {
        'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
        'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
        'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12',
        'january': '01', 'february': '02', 'march': '03', 'april': '04',
        'may': '05', 'june': '06', 'july': '07', 'august': '08',
        'september': '09', 'october': '10', 'november': '11', 'december': '12'
      };

      const datePatterns = [
        { regex: /(\d{1,2})\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(\d{4})/i, format: 'br-short' },
        { regex: /(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i, format: 'br-long' },
        { regex: /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i, format: 'en' },
      ];

      for (const { regex, format } of datePatterns) {
        const dateMatch = html.match(regex);
        if (dateMatch) {
          let day, month, year;

          if (format === 'br-short' || format === 'br-long') {
            day = dateMatch[1].padStart(2, '0');
            month = months[dateMatch[2].toLowerCase()];
            year = dateMatch[3];
          } else if (format === 'en') {
            month = months[dateMatch[1].toLowerCase()];
            day = dateMatch[2].padStart(2, '0');
            year = dateMatch[3];
          }

          data.publishedDate = `${year}-${month}-${day}`;
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
          data.pageCount = parseInt(pagesMatch[1]);
          break;
        }
      }

      // 11. Language
      const languagePatterns = [
        /Idioma[:\s]+([^\n;]+)/i,
        /Language[:\s]+([^\n;]+)/i,
      ];

      const languageMap = {
        'português': 'pt-BR',
        'portuguese': 'pt-BR',
        'inglês': 'en',
        'english': 'en',
        'espanhol': 'es',
        'spanish': 'es',
        'francês': 'fr',
        'french': 'fr',
        'alemão': 'de',
        'german': 'de',
        'italiano': 'it',
        'italian': 'it',
      };

      for (const pattern of languagePatterns) {
        const langMatch = detailsText.match(pattern);
        if (langMatch) {
          const langText = langMatch[1].trim().toLowerCase();

          for (const [key, value] of Object.entries(languageMap)) {
            if (langText.includes(key)) {
              data.language = value;
              break;
            }
          }

          if (data.language) break;
        }
      }

      // 12. Categories
      const categoryElements = doc.querySelectorAll('#wayfinding-breadcrumbs_feature_div a, .a-breadcrumb a');
      const categories = [];

      const categoryMap = {
        'ficção': 'Fiction',
        'fiction': 'Fiction',
        'romance': 'Romance',
        'fantasia': 'Fantasy',
        'fantasy': 'Fantasy',
        'mistério': 'Mystery',
        'mystery': 'Mystery',
        'terror': 'Horror',
        'horror': 'Horror',
        'suspense': 'Thriller',
        'thriller': 'Thriller',
      };

      categoryElements.forEach(el => {
        const text = el.textContent.trim();
        if (text && text.length > 3 && text.length < 50 &&
            !text.includes('Livros') &&
            !text.toLowerCase().includes('home') &&
            !text.toLowerCase().includes('kindle') &&
            !text.toLowerCase().includes('store')) {

          const normalized = text.toLowerCase();
          for (const [key, value] of Object.entries(categoryMap)) {
            if (normalized.includes(key) && !categories.includes(value)) {
              categories.push(value);
            }
          }
        }
      });

      if (categories.length > 0) data.categories = categories;

      console.log('📦 Book data extracted:', data);
      setBookData(data);

    } catch (error) {
      console.error('Error fetching book data:', error);
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Amazon Book Parser</h2>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={isbn}
          onChange={(e) => setIsbn(e.target.value)}
          placeholder="Enter ISBN or ASIN"
          className="border px-3 py-2 rounded flex-1"
        />
        <button
          onClick={() => fetchBookData(isbn)}
          disabled={!isbn || loading}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          {loading ? 'Loading...' : 'Fetch'}
        </button>
      </div>

      {bookData && (
        <div className="border rounded p-4">
          <h3 className="text-xl font-semibold mb-2">{bookData.title}</h3>
          {bookData.authors && (
            <p className="text-gray-600">By: {bookData.authors.join(', ')}</p>
          )}
          {bookData.imageUrl && (
            <img src={bookData.imageUrl} alt="Cover" className="w-32 mt-2" />
          )}
          <pre className="mt-4 bg-gray-100 p-2 rounded text-sm overflow-auto">
            {JSON.stringify(bookData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default AmazonBookParser;
