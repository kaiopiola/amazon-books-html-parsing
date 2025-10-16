"""
Amazon Book Data Parser - Python Example

Requirements:
    pip install requests beautifulsoup4 lxml

Usage:
    from amazon_parser import parse_amazon_book
    book_data = parse_amazon_book("8556512666")
"""

import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import quote
from typing import Dict, List, Optional


def parse_amazon_book(identifier: str) -> Dict:
    """
    Parse book data from Amazon.com.br product page.

    Args:
        identifier: ISBN-10, ISBN-13, or ASIN

    Returns:
        Dictionary with book data
    """
    amazon_url = f"https://www.amazon.com.br/dp/{identifier.strip()}"
    proxy_url = f"https://corsproxy.io/?{quote(amazon_url)}"

    print(f"🔍 Fetching: {amazon_url}")

    try:
        response = requests.get(proxy_url, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        raise Exception(f"Failed to fetch URL: {e}")

    html = response.text
    soup = BeautifulSoup(html, 'lxml')

    book_data = {}

    # 1. Title
    title_el = soup.select_one('#productTitle, span[id="productTitle"]')
    if title_el:
        book_data['title'] = title_el.get_text(strip=True)

    # 2. Authors
    author_elements = soup.select('.author a.a-link-normal, .author .contributorNameID')
    authors = []
    for el in author_elements:
        author = el.get_text(strip=True)
        if author and '(' not in author and author not in authors:
            authors.append(author)
    if authors:
        book_data['authors'] = authors

    # 3. Cover Image
    img_el = soup.select_one('#landingImage, #imgBlkFront, #ebooksImgBlkFront')
    if img_el:
        img_src = (img_el.get('data-old-hires') or
                   img_el.get('src') or
                   img_el.get('data-a-dynamic-image'))

        if img_src:
            if img_src.startswith('{'):
                import json
                try:
                    img_obj = json.loads(img_src)
                    urls = list(img_obj.keys())
                    if urls:
                        book_data['imageUrl'] = urls[0]
                except json.JSONDecodeError:
                    book_data['imageUrl'] = img_src
            else:
                book_data['imageUrl'] = img_src

    # 4. Description
    desc_selectors = [
        '#bookDescription_feature_div noscript',
        '#bookDescription_feature_div .a-expander-content',
        '#feature-bullets ul.a-unordered-list'
    ]

    for selector in desc_selectors:
        desc_el = soup.select_one(selector)
        if desc_el:
            desc = desc_el.get_text(strip=True)
            if desc and len(desc) > 50:
                book_data['description'] = desc
                break

    # Get details text
    details_selectors = [
        '#detailBullets_feature_div',
        '#detail_bullets_id',
        '#productDetailsTable',
        '#detailBulletsWrapper_feature_div',
        '.detail-bullet-list'
    ]

    details_text = ''
    for selector in details_selectors:
        el = soup.select_one(selector)
        if el:
            details_text += ' ' + el.get_text()

    # 5. ISBN-10
    isbn10_match = re.search(r'ISBN-10[:\s]+([0-9X]{10})', details_text, re.IGNORECASE)
    if isbn10_match:
        book_data['isbn10'] = isbn10_match.group(1)
        book_data['isbn'] = isbn10_match.group(1)

    # 6. ISBN-13
    isbn13_match = re.search(r'ISBN-13[:\s]+([0-9-]{13,17})', details_text, re.IGNORECASE)
    if isbn13_match:
        isbn13 = isbn13_match.group(1).replace('-', '')
        book_data['isbn13'] = isbn13
        if 'isbn' not in book_data:
            book_data['isbn'] = isbn13

    # 7. ASIN
    asin_patterns = [
        r'ASIN[:\s]+([A-Z0-9]{10})(?:\s|$)',
        r'\bASIN[:\s]*([A-Z0-9]{10})\b',
    ]

    for pattern in asin_patterns:
        asin_match = re.search(pattern, details_text, re.IGNORECASE)
        if asin_match:
            potential_asin = asin_match.group(1).upper()
            if re.match(r'^[A-Z0-9]{10}$', potential_asin) and not re.match(r'^[A-Z]+$', potential_asin):
                book_data['asin'] = potential_asin
                break

    # 8. Publisher
    publisher_patterns = [
        r'editora\s+([a-zà-ÿ\s&\-\.]+?)\s+data\s+da\s+publicação',
        r'editora\s+([a-zà-ÿ\s&\-\.]+?)\s+dimensões',
        r'editora\s+([a-zà-ÿ\s&\-\.]+?)\s+(?:isbn|asin)',
        r'publisher\s+([a-z\s&\-\.]+?)\s+publication\s+date',
    ]

    for pattern in publisher_patterns:
        publisher_match = re.search(pattern, details_text.lower(), re.IGNORECASE)
        if publisher_match:
            publisher = publisher_match.group(1).strip()
            # Capitalize each word
            publisher = ' '.join(word.capitalize() for word in publisher.split())

            if len(publisher) > 1 and not publisher.isdigit():
                book_data['publisher'] = publisher
                break

    # 9. Publication Date
    months = {
        'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
        'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
        'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12',
    }

    date_patterns = [
        (r'(\d{1,2})\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(\d{4})', 'br-short'),
        (r'(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})', 'br-long'),
    ]

    for pattern, format_type in date_patterns:
        date_match = re.search(pattern, html, re.IGNORECASE)
        if date_match:
            day = date_match.group(1).zfill(2)
            month = months[date_match.group(2).lower()]
            year = date_match.group(3)
            book_data['publishedDate'] = f"{year}-{month}-{day}"
            break

    # 10. Pages
    pages_patterns = [
        r'(\d+)\s*páginas',
        r'Comprimento[:\s]+(\d+)\s*páginas',
        r'Length[:\s]+(\d+)\s*pages',
    ]

    for pattern in pages_patterns:
        pages_match = re.search(pattern, details_text, re.IGNORECASE)
        if pages_match:
            book_data['pageCount'] = int(pages_match.group(1))
            break

    # 11. Language
    lang_patterns = [
        r'Idioma[:\s]+([^\n;]+)',
        r'Language[:\s]+([^\n;]+)',
    ]

    language_map = {
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
    }

    for pattern in lang_patterns:
        lang_match = re.search(pattern, details_text, re.IGNORECASE)
        if lang_match:
            lang_text = lang_match.group(1).strip().lower()

            for key, value in language_map.items():
                if key in lang_text:
                    book_data['language'] = value
                    break

            if 'language' in book_data:
                break

    # 12. Categories
    category_elements = soup.select('#wayfinding-breadcrumbs_feature_div a, .a-breadcrumb a')
    categories = []

    category_map = {
        'ficção': 'Fiction',
        'fiction': 'Fiction',
        'romance': 'Romance',
        'fantasia': 'Fantasy',
        'fantasy': 'Fantasy',
        'mistério': 'Mystery',
        'mystery': 'Mystery',
        'terror': 'Horror',
        'horror': 'Horror',
    }

    for el in category_elements:
        text = el.get_text(strip=True)
        if text and 3 < len(text) < 50:
            normalized = text.lower()

            for key, value in category_map.items():
                if key in normalized and value not in categories:
                    categories.append(value)

    if categories:
        book_data['categories'] = categories

    print(f"✅ Extracted {len(book_data)} fields")
    return book_data


if __name__ == '__main__':
    # Example usage
    isbn = "8556512666"
    book = parse_amazon_book(isbn)

    import json
    print(json.dumps(book, indent=2, ensure_ascii=False))
