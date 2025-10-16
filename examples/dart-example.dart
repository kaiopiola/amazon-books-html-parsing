/// Amazon Book Data Parser - Dart/Flutter Example
///
/// Requirements:
///   dependencies:
///     http: ^1.1.0
///     html: ^0.15.4
///
/// Usage:
///   final bookData = await parseAmazonBook('8556512666');

import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:html/parser.dart' as html_parser;
import 'package:html/dom.dart';

class AmazonBookParser {
  /// Parse book data from Amazon.com.br product page
  static Future<Map<String, dynamic>> parseBook(String identifier) async {
    final amazonUrl = 'https://www.amazon.com.br/dp/${identifier.trim()}';
    final proxyUrl =
        'https://corsproxy.io/?${Uri.encodeComponent(amazonUrl)}';

    print('🔍 Fetching: $amazonUrl');

    try {
      final response = await http.get(Uri.parse(proxyUrl));

      if (response.statusCode != 200) {
        throw Exception('HTTP ${response.statusCode}');
      }

      final htmlContent = response.body;
      final document = html_parser.parse(htmlContent);

      final bookData = <String, dynamic>{};

      // 1. Title
      final titleEl = document.querySelector('#productTitle') ??
          document.querySelector('span[id="productTitle"]');
      if (titleEl != null) {
        bookData['title'] = titleEl.text.trim();
      }

      // 2. Authors
      final authorElements = document.querySelectorAll(
          '.author a.a-link-normal, .author .contributorNameID');
      final authors = <String>[];

      for (final el in authorElements) {
        final author = el.text.trim();
        if (author.isNotEmpty &&
            !author.contains('(') &&
            !authors.contains(author)) {
          authors.add(author);
        }
      }

      if (authors.isNotEmpty) {
        bookData['authors'] = authors;
      }

      // 3. Cover Image
      final imgEl = document.querySelector('#landingImage') ??
          document.querySelector('#imgBlkFront') ??
          document.querySelector('#ebooksImgBlkFront');

      if (imgEl != null) {
        final imgSrc = imgEl.attributes['data-old-hires'] ??
            imgEl.attributes['src'] ??
            imgEl.attributes['data-a-dynamic-image'];

        if (imgSrc != null) {
          if (imgSrc.startsWith('{')) {
            try {
              final imgObj = jsonDecode(imgSrc) as Map<String, dynamic>;
              final urls = imgObj.keys.toList();
              if (urls.isNotEmpty) {
                bookData['imageUrl'] = urls[0];
              }
            } catch (e) {
              bookData['imageUrl'] = imgSrc;
            }
          } else {
            bookData['imageUrl'] = imgSrc;
          }
        }
      }

      // 4. Description
      final descSelectors = [
        '#bookDescription_feature_div noscript',
        '#bookDescription_feature_div .a-expander-content',
        '#feature-bullets ul.a-unordered-list'
      ];

      for (final selector in descSelectors) {
        final descEl = document.querySelector(selector);
        if (descEl != null) {
          final desc = descEl.text.trim();
          if (desc.isNotEmpty && desc.length > 50) {
            bookData['description'] = desc;
            break;
          }
        }
      }

      // Get details text
      final detailsSelectors = [
        '#detailBullets_feature_div',
        '#detail_bullets_id',
        '#productDetailsTable',
        '#detailBulletsWrapper_feature_div',
        '.detail-bullet-list'
      ];

      String detailsText = '';
      for (final selector in detailsSelectors) {
        final el = document.querySelector(selector);
        if (el != null) {
          detailsText += ' ${el.text}';
        }
      }

      // 5. ISBN-10
      final isbn10Match =
          RegExp(r'ISBN-10[:\s]+([0-9X]{10})', caseSensitive: false)
              .firstMatch(detailsText);
      if (isbn10Match != null) {
        bookData['isbn10'] = isbn10Match.group(1);
        bookData['isbn'] = isbn10Match.group(1);
      }

      // 6. ISBN-13
      final isbn13Match =
          RegExp(r'ISBN-13[:\s]+([0-9-]{13,17})', caseSensitive: false)
              .firstMatch(detailsText);
      if (isbn13Match != null) {
        final isbn13 = isbn13Match.group(1)!.replaceAll('-', '');
        bookData['isbn13'] = isbn13;
        if (!bookData.containsKey('isbn')) {
          bookData['isbn'] = isbn13;
        }
      }

      // 7. ASIN
      final asinPatterns = [
        RegExp(r'ASIN[:\s]+([A-Z0-9]{10})(?:\s|$)', caseSensitive: false),
        RegExp(r'\bASIN[:\s]*([A-Z0-9]{10})\b', caseSensitive: false),
      ];

      for (final pattern in asinPatterns) {
        final asinMatch = pattern.firstMatch(detailsText);
        if (asinMatch != null) {
          final potentialAsin = asinMatch.group(1)!.toUpperCase();
          if (RegExp(r'^[A-Z0-9]{10}$').hasMatch(potentialAsin) &&
              !RegExp(r'^[A-Z]+$').hasMatch(potentialAsin)) {
            bookData['asin'] = potentialAsin;
            break;
          }
        }
      }

      // 8. Publisher
      final publisherPatterns = [
        RegExp(
            r'editora\s+([a-zà-ÿ\s&\-\.]+?)\s+data\s+da\s+publicação',
            caseSensitive: false),
        RegExp(r'editora\s+([a-zà-ÿ\s&\-\.]+?)\s+dimensões',
            caseSensitive: false),
        RegExp(r'editora\s+([a-zà-ÿ\s&\-\.]+?)\s+(?:isbn|asin)',
            caseSensitive: false),
      ];

      for (final pattern in publisherPatterns) {
        final publisherMatch = pattern.firstMatch(detailsText.toLowerCase());
        if (publisherMatch != null) {
          var publisher = publisherMatch.group(1)!.trim();
          // Capitalize each word
          publisher = publisher
              .split(' ')
              .map((word) =>
                  word.isEmpty ? '' : word[0].toUpperCase() + word.substring(1))
              .join(' ');

          if (publisher.length > 1) {
            bookData['publisher'] = publisher;
            break;
          }
        }
      }

      // 9. Publication Date
      const months = {
        'janeiro': '01',
        'fevereiro': '02',
        'março': '03',
        'abril': '04',
        'maio': '05',
        'junho': '06',
        'julho': '07',
        'agosto': '08',
        'setembro': '09',
        'outubro': '10',
        'novembro': '11',
        'dezembro': '12',
      };

      final datePatterns = [
        RegExp(
            r'(\d{1,2})\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(\d{4})',
            caseSensitive: false),
        RegExp(
            r'(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})',
            caseSensitive: false),
      ];

      for (final pattern in datePatterns) {
        final dateMatch = pattern.firstMatch(htmlContent);
        if (dateMatch != null) {
          final day = dateMatch.group(1)!.padLeft(2, '0');
          final monthName = dateMatch.group(2)!.toLowerCase();
          final month = months[monthName] ?? '01';
          final year = dateMatch.group(3);

          bookData['publishedDate'] = '$year-$month-$day';
          break;
        }
      }

      // 10. Pages
      final pagesPatterns = [
        RegExp(r'(\d+)\s*páginas', caseSensitive: false),
        RegExp(r'Comprimento[:\s]+(\d+)\s*páginas', caseSensitive: false),
        RegExp(r'Length[:\s]+(\d+)\s*pages', caseSensitive: false),
      ];

      for (final pattern in pagesPatterns) {
        final pagesMatch = pattern.firstMatch(detailsText);
        if (pagesMatch != null) {
          bookData['pageCount'] = int.parse(pagesMatch.group(1)!);
          break;
        }
      }

      // 11. Language
      final langPatterns = [
        RegExp(r'Idioma[:\s]+([^\n;]+)', caseSensitive: false),
        RegExp(r'Language[:\s]+([^\n;]+)', caseSensitive: false),
      ];

      const languageMap = {
        'português': 'pt-BR',
        'portuguese': 'pt-BR',
        'inglês': 'en',
        'english': 'en',
        'espanhol': 'es',
        'spanish': 'es',
      };

      for (final pattern in langPatterns) {
        final langMatch = pattern.firstMatch(detailsText);
        if (langMatch != null) {
          final langText = langMatch.group(1)!.trim().toLowerCase();

          for (final entry in languageMap.entries) {
            if (langText.contains(entry.key)) {
              bookData['language'] = entry.value;
              break;
            }
          }

          if (bookData.containsKey('language')) break;
        }
      }

      // 12. Categories
      final categoryElements = document.querySelectorAll(
          '#wayfinding-breadcrumbs_feature_div a, .a-breadcrumb a');
      final categories = <String>[];

      const categoryMap = {
        'ficção': 'Fiction',
        'fiction': 'Fiction',
        'romance': 'Romance',
        'fantasia': 'Fantasy',
        'fantasy': 'Fantasy',
      };

      for (final el in categoryElements) {
        final text = el.text.trim();
        if (text.isNotEmpty && text.length > 3 && text.length < 50) {
          final normalized = text.toLowerCase();

          for (final entry in categoryMap.entries) {
            if (normalized.contains(entry.key) &&
                !categories.contains(entry.value)) {
              categories.add(entry.value);
            }
          }
        }
      }

      if (categories.isNotEmpty) {
        bookData['categories'] = categories;
      }

      print('✅ Extracted ${bookData.length} fields');
      return bookData;
    } catch (e) {
      print('❌ Error: $e');
      rethrow;
    }
  }
}

// Example usage
void main() async {
  final bookData = await AmazonBookParser.parseBook('8556512666');
  print(jsonEncode(bookData));
}
