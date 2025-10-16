# Amazon Book Data Parser

Documentação completa sobre como fazer parsing de dados de livros da Amazon.com.br usando diferentes linguagens de programação.

## 🎯 Objetivo

Extrair informações de livros da página de produto da Amazon (`https://www.amazon.com.br/dp/{ISBN_OR_ASIN}`) incluindo:

- Título
- Autores
- Imagem da capa
- Descrição
- ISBN-10 e ISBN-13
- ASIN
- Editora (Publisher)
- Data de publicação
- Número de páginas
- Idioma
- Categorias/Gêneros

## 🔧 Requisitos

### CORS Proxy

A Amazon bloqueia requisições diretas via CORS. É necessário usar um proxy CORS como:

```
https://corsproxy.io/?{encodeURIComponent(amazonUrl)}
```

### HTML Structure

A Amazon usa uma estrutura HTML específica com algumas particularidades:

1. **Caracteres Unicode invisíveis**: `\u200F` (Right-to-Left Mark) e `\u200E` (Left-to-Right Mark)
2. **Classes CSS específicas**: `.a-text-bold`, `.a-list-item`, `#productTitle`, etc.
3. **Múltiplas seções de detalhes**: `#detailBullets_feature_div`, `#detail_bullets_id`, `#productDetailsTable`

## 📋 Campos Extraídos

### 1. Título
**Seletor DOM**: `#productTitle` ou `span[id="productTitle"]`

### 2. Autores
**Seletores DOM**: `.author a.a-link-normal`, `.author .contributorNameID`

Filtrar elementos que não contenham parênteses (para evitar capturar roles como "(Author)").

### 3. Imagem da Capa
**Seletores DOM**: `#landingImage`, `#imgBlkFront`, `#ebooksImgBlkFront`

**Atributos**:
- `data-old-hires` (melhor qualidade)
- `src`
- `data-a-dynamic-image` (JSON com múltiplas resoluções)

### 4. Descrição
**Seletores DOM** (em ordem de prioridade):
1. `#bookDescription_feature_div noscript`
2. `#bookDescription_feature_div .a-expander-content`
3. `#feature-bullets ul.a-unordered-list`

### 5. ISBN-10
**Regex**: `/ISBN-10[:\s]+([0-9X]{10})/i`

### 6. ISBN-13
**Regex**: `/ISBN-13[:\s]+([0-9-]{13,17})/i`

Remover hífens do resultado.

### 7. ASIN
**Regex**:
```regex
/ASIN[:\s]+([A-Z0-9]{10})(?:\s|$)/i
/\bASIN[:\s]*([A-Z0-9]{10})\b/i
```

**Validação**: Deve ter 10 caracteres alfanuméricos e não ser apenas letras.

### 8. Editora (Publisher)
**Regex no texto dos detalhes**:
```regex
/editora\s+([a-zà-ÿ\s&\-\.]+?)\s+data\s+da\s+publicação/i
/editora\s+([a-zà-ÿ\s&\-\.]+?)\s+dimensões/i
/editora\s+([a-zà-ÿ\s&\-\.]+?)\s+(?:isbn|asin)/i
```

**Nota**: A estrutura HTML da editora contém caracteres unicode invisíveis:
```html
<span class="a-text-bold">Editora ‏ : ‎ </span>
<span>Suma</span>
```

O parsing deve buscar no texto unificado dos detalhes onde aparece como: `"editora suma data da publicação"`.

### 9. Data de Publicação
**Formatos suportados**:

1. **Português sem "de"**: `5 agosto 2025`
   - Regex: `/(\d{1,2})\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+(\d{4})/i`

2. **Português com "de"**: `5 de agosto de 2025`
   - Regex: `/(\d{1,2})\s+de\s+(janeiro|...|dezembro)\s+de\s+(\d{4})/i`

3. **Numérico**: `05/08/2025` ou `05-08-2025`
   - Regex: `/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/`

4. **Inglês**: `August 5, 2025`
   - Regex: `/(january|...|december)\s+(\d{1,2}),?\s+(\d{4})/i`

**Conversão de meses**:
```javascript
{
  'janeiro': '01', 'fevereiro': '02', 'março': '03',
  'january': '01', 'february': '02', 'march': '03',
  // ...
}
```

**Formato de saída**: `YYYY-MM-DD` (ISO 8601)

### 10. Número de Páginas
**Regex**:
```regex
/(\d+)\s*páginas/i
/Comprimento[:\s]+(\d+)\s*páginas/i
/Length[:\s]+(\d+)\s*pages/i
```

### 11. Idioma
**Regex**: `/Idioma[:\s]+([^\n;]+)/i` ou `/Language[:\s]+([^\n;]+)/i`

**Mapeamento**:
```javascript
{
  'português': 'pt-BR',
  'inglês': 'en',
  'espanhol': 'es',
  'francês': 'fr',
  'alemão': 'de',
  'italiano': 'it',
  // ...
}
```

### 12. Categorias
**Seletores DOM**: `#wayfinding-breadcrumbs_feature_div a`, `.a-breadcrumb a`

**Filtros**:
- Tamanho entre 3 e 50 caracteres
- Excluir: "Livros", "Home", "Kindle", "Store"

**Mapeamento para categorias padronizadas**:
```javascript
'ficção' → 'Fiction'
'romance' → 'Romance'
'fantasia' → 'Fantasy'
'mistério' → 'Mystery'
'terror' → 'Horror'
// ...
```

## 📁 Exemplos de Código

Veja exemplos de implementação em diferentes linguagens:

- [React/JavaScript](./examples/react-example.jsx)
- [Next.js](./examples/nextjs-example.js)
- [Python](./examples/python-example.py)
- [Dart/Flutter](./examples/dart-example.dart)
- [PHP](./examples/php-example.php)
- [Node.js](./examples/nodejs-example.js)

## ⚠️ Observações Importantes

1. **CORS**: Sempre use um proxy CORS para requisições do navegador
2. **Rate Limiting**: A Amazon pode bloquear requisições excessivas
3. **Estrutura HTML**: A estrutura pode mudar sem aviso
4. **Caracteres Unicode**: Cuidado com caracteres invisíveis (`\u200F`, `\u200E`)
5. **Validação**: Sempre valide os dados extraídos antes de usar

## 🔍 Debugging

Para debugar o parsing, registre no console:

1. **HTML completo** (primeiros 1000 caracteres)
2. **Texto dos detalhes do produto**
3. **Cada campo extraído** com emoji (✅ sucesso, ❌ falha)
4. **Regex matches** para campos problemáticos

Exemplo:
```javascript
console.log('📋 Texto dos detalhes:', detailsText.substring(0, 1000));
console.log('✅ ISBN-10 encontrado:', isbn10);
console.log('❌ Editora não encontrada');
```

## 📄 Licença

MIT - Livre para uso em projetos pessoais e comerciais.

## 🤝 Contribuições

Pull requests são bem-vindos! Especialmente para:
- Novos exemplos de linguagens
- Melhorias nos regex patterns
- Correções de bugs no parsing
