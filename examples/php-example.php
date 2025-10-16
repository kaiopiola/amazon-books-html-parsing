<?php
/**
 * Amazon Book Data Parser - PHP Example
 *
 * Requirements:
 *   - PHP 7.4+
 *   - DOMDocument (included in PHP)
 *   - libxml (included in PHP)
 *
 * Usage:
 *   require_once 'amazon_parser.php';
 *   $bookData = parseAmazonBook('8556512666');
 */

/**
 * Parse book data from Amazon.com.br product page
 *
 * @param string $identifier ISBN-10, ISBN-13, or ASIN
 * @return array Book data
 * @throws Exception If fetch fails
 */
function parseAmazonBook(string $identifier): array
{
    $amazonUrl = "https://www.amazon.com.br/dp/" . trim($identifier);
    $proxyUrl = "https://corsproxy.io/?" . urlencode($amazonUrl);

    echo "🔍 Fetching: $amazonUrl\n";

    // Fetch HTML
    $context = stream_context_create([
        'http' => [
            'timeout' => 30,
            'user_agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ]
    ]);

    $html = @file_get_contents($proxyUrl, false, $context);

    if ($html === false) {
        throw new Exception("Failed to fetch URL");
    }

    // Parse HTML
    $dom = new DOMDocument();
    @$dom->loadHTML(mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8'));
    $xpath = new DOMXPath($dom);

    $bookData = [];

    // 1. Title
    $titleNodes = $xpath->query('//*[@id="productTitle"]');
    if ($titleNodes->length > 0) {
        $bookData['title'] = trim($titleNodes->item(0)->textContent);
    }

    // 2. Authors
    $authorNodes = $xpath->query('//span[contains(@class, "author")]//a[contains(@class, "a-link-normal")]');
    $authors = [];

    foreach ($authorNodes as $node) {
        $author = trim($node->textContent);
        if (!empty($author) && strpos($author, '(') === false && !in_array($author, $authors)) {
            $authors[] = $author;
        }
    }

    if (!empty($authors)) {
        $bookData['authors'] = $authors;
    }

    // 3. Cover Image
    $imgNodes = $xpath->query('//*[@id="landingImage" or @id="imgBlkFront" or @id="ebooksImgBlkFront"]');
    if ($imgNodes->length > 0) {
        $imgNode = $imgNodes->item(0);
        $imgSrc = $imgNode->getAttribute('data-old-hires') ?:
                  $imgNode->getAttribute('src') ?:
                  $imgNode->getAttribute('data-a-dynamic-image');

        if ($imgSrc) {
            if (strpos($imgSrc, '{') === 0) {
                $imgObj = json_decode($imgSrc, true);
                if ($imgObj && !empty($imgObj)) {
                    $bookData['imageUrl'] = array_keys($imgObj)[0];
                }
            } else {
                $bookData['imageUrl'] = $imgSrc;
            }
        }
    }

    // 4. Description
    $descSelectors = [
        '//*[@id="bookDescription_feature_div"]//noscript',
        '//*[@id="bookDescription_feature_div"]//*[contains(@class, "a-expander-content")]',
        '//*[@id="feature-bullets"]//ul[contains(@class, "a-unordered-list")]'
    ];

    foreach ($descSelectors as $selector) {
        $descNodes = $xpath->query($selector);
        if ($descNodes->length > 0) {
            $desc = trim($descNodes->item(0)->textContent);
            if (strlen($desc) > 50) {
                $bookData['description'] = $desc;
                break;
            }
        }
    }

    // Get details text
    $detailsSelectors = [
        '//*[@id="detailBullets_feature_div"]',
        '//*[@id="detail_bullets_id"]',
        '//*[@id="productDetailsTable"]',
        '//*[@id="detailBulletsWrapper_feature_div"]',
        '//*[contains(@class, "detail-bullet-list")]'
    ];

    $detailsText = '';
    foreach ($detailsSelectors as $selector) {
        $nodes = $xpath->query($selector);
        if ($nodes->length > 0) {
            $detailsText .= ' ' . $nodes->item(0)->textContent;
        }
    }

    // 5. ISBN-10
    if (preg_match('/ISBN-10[:\s]+([0-9X]{10})/i', $detailsText, $matches)) {
        $bookData['isbn10'] = $matches[1];
        $bookData['isbn'] = $matches[1];
    }

    // 6. ISBN-13
    if (preg_match('/ISBN-13[:\s]+([0-9-]{13,17})/i', $detailsText, $matches)) {
        $isbn13 = str_replace('-', '', $matches[1]);
        $bookData['isbn13'] = $isbn13;
        if (!isset($bookData['isbn'])) {
            $bookData['isbn'] = $isbn13;
        }
    }

    // 7. ASIN
    $asinPatterns = [
        '/ASIN[:\s]+([A-Z0-9]{10})(?:\s|$)/i',
        '/\bASIN[:\s]*([A-Z0-9]{10})\b/i',
    ];

    foreach ($asinPatterns as $pattern) {
        if (preg_match($pattern, $detailsText, $matches)) {
            $potentialAsin = strtoupper($matches[1]);
            if (preg_match('/^[A-Z0-9]{10}$/', $potentialAsin) && !preg_match('/^[A-Z]+$/', $potentialAsin)) {
                $bookData['asin'] = $potentialAsin;
                break;
            }
        }
    }

    // 8. Publisher
    $publisherPatterns = [
        '/editora\s+([a-zà-ÿ\s&\-\.]+?)\s+data\s+da\s+publicação/iu',
        '/editora\s+([a-zà-ÿ\s&\-\.]+?)\s+dimensões/iu',
        '/editora\s+([a-zà-ÿ\s&\-\.]+?)\s+(?:isbn|asin)/iu',
        '/publisher\s+([a-z\s&\-\.]+?)\s+publication\s+date/i',
    ];

    foreach ($publisherPatterns as $pattern) {
        if (preg_match($pattern, mb_strtolower($detailsText, 'UTF-8'), $matches)) {
            $publisher = trim($matches[1]);
            // Capitalize each word
            $publisher = mb_convert_case($publisher, MB_CASE_TITLE, 'UTF-8');

            if (strlen($publisher) > 1) {
                $bookData['publisher'] = $publisher;
                break;
            }
        }
    }

    // 9. Publication Date
    $months = [
        'janeiro' => '01', 'fevereiro' => '02', 'março' => '03', 'abril' => '04',
        'maio' => '05', 'junho' => '06', 'julho' => '07', 'agosto' => '08',
        'setembro' => '09', 'outubro' => '10', 'novembro' => '11', 'dezembro' => '12',
    ];

    $datePatterns = [
        '/(\d{1,2})\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(\d{4})/iu',
        '/(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/iu',
    ];

    foreach ($datePatterns as $pattern) {
        if (preg_match($pattern, $html, $matches)) {
            $day = str_pad($matches[1], 2, '0', STR_PAD_LEFT);
            $monthName = mb_strtolower($matches[2], 'UTF-8');
            $month = $months[$monthName] ?? '01';
            $year = $matches[3];

            $bookData['publishedDate'] = "$year-$month-$day";
            break;
        }
    }

    // 10. Pages
    $pagesPatterns = [
        '/(\d+)\s*páginas/i',
        '/Comprimento[:\s]+(\d+)\s*páginas/i',
        '/Length[:\s]+(\d+)\s*pages/i',
    ];

    foreach ($pagesPatterns as $pattern) {
        if (preg_match($pattern, $detailsText, $matches)) {
            $bookData['pageCount'] = (int)$matches[1];
            break;
        }
    }

    // 11. Language
    $langPatterns = [
        '/Idioma[:\s]+([^\n;]+)/i',
        '/Language[:\s]+([^\n;]+)/i',
    ];

    $languageMap = [
        'português' => 'pt-BR',
        'portuguese' => 'pt-BR',
        'inglês' => 'en',
        'english' => 'en',
        'espanhol' => 'es',
        'spanish' => 'es',
        'francês' => 'fr',
        'french' => 'fr',
    ];

    foreach ($langPatterns as $pattern) {
        if (preg_match($pattern, $detailsText, $matches)) {
            $langText = mb_strtolower(trim($matches[1]), 'UTF-8');

            foreach ($languageMap as $key => $value) {
                if (strpos($langText, $key) !== false) {
                    $bookData['language'] = $value;
                    break 2;
                }
            }
        }
    }

    // 12. Categories
    $categoryNodes = $xpath->query(
        '//*[@id="wayfinding-breadcrumbs_feature_div"]//a | //*[contains(@class, "a-breadcrumb")]//a'
    );

    $categories = [];
    $categoryMap = [
        'ficção' => 'Fiction',
        'fiction' => 'Fiction',
        'romance' => 'Romance',
        'fantasia' => 'Fantasy',
        'fantasy' => 'Fantasy',
        'mistério' => 'Mystery',
        'mystery' => 'Mystery',
    ];

    foreach ($categoryNodes as $node) {
        $text = trim($node->textContent);
        if (strlen($text) > 3 && strlen($text) < 50) {
            $normalized = mb_strtolower($text, 'UTF-8');

            foreach ($categoryMap as $key => $value) {
                if (strpos($normalized, $key) !== false && !in_array($value, $categories)) {
                    $categories[] = $value;
                }
            }
        }
    }

    if (!empty($categories)) {
        $bookData['categories'] = $categories;
    }

    echo "✅ Extracted " . count($bookData) . " fields\n";
    return $bookData;
}

// Example usage
if (php_sapi_name() === 'cli') {
    try {
        $bookData = parseAmazonBook('8556512666');
        echo json_encode($bookData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
    } catch (Exception $e) {
        echo "Error: " . $e->getMessage() . "\n";
    }
}
