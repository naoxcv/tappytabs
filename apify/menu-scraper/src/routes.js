import { createCheerioRouter } from '@crawlee/cheerio';

const PRICE_PATTERN = /(?:\$|€|£|¥)\s?\d[\d,.]*(?:\s?\+)?/;

function textOf($, node) {
    return $(node).text().replace(/\s+/g, ' ').trim();
}

function priceFrom(text) {
    const match = text.match(PRICE_PATTERN);
    return match ? match[0].replace(/\s/g, '').replace(/\+$/, '') : undefined;
}

function imageUrlFrom(value, baseUrl) {
    if (Array.isArray(value)) return imageUrlFrom(value[0], baseUrl);
    if (value && typeof value === 'object') return imageUrlFrom(value.url ?? value.contentUrl, baseUrl);
    if (typeof value !== 'string' || !value.trim()) return undefined;
    try {
        const url = new URL(value.trim(), baseUrl);
        return url.protocol === 'https:' ? url.toString() : undefined;
    } catch {
        return undefined;
    }
}

function imageUrlInNode($, node, baseUrl) {
    const image = $(node).find('img').first();
    const source = [
        image.attr('data-src'),
        image.attr('data-lazy-src'),
        image.attr('data-original'),
        image.attr('src'),
    ].find((value) => value?.trim());
    const srcset = image.attr('srcset') ?? image.attr('data-srcset');
    const firstSrcsetUrl = srcset?.split(',')[0]?.trim().split(/\s+/)[0];
    return imageUrlFrom(source ?? firstSrcsetUrl, baseUrl);
}

function categoryFor($, node) {
    const headingSelector = 'h1, h2, h3, h4, [role="heading"]';
    let current = $(node);
    while (current.length && current[0].tagName !== 'body') {
        let sibling = current.prev();
        while (sibling.length) {
            const isMenuItem = sibling.is(
                'li, article, [itemtype*="MenuItem"], [itemprop="hasMenuItem"], [class*="menu-item" i], [class*="menuItem"], [class*="product-card" i], [class*="dish-card" i]',
            );
            if (!isMenuItem) {
                const ownHeading = sibling.is(headingSelector) ? textOf($, sibling) : '';
                const nestedHeading = sibling.find(headingSelector).last();
                const text = ownHeading || textOf($, nestedHeading);
                if (text && !PRICE_PATTERN.test(text)) return text.slice(0, 80);
            }
            sibling = sibling.prev();
        }
        current = current.parent();
    }
    return 'Menu';
}

function cleanName(text) {
    return text
        .replace(PRICE_PATTERN, '')
        .replace(/\b(?:out of stock|sold out|unavailable)\b/gi, '')
        .replace(/[|•·–—-]+\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseStructuredData($, sourceUrl) {
    const rows = [];
    $('script[type="application/ld+json"]').each((_, script) => {
        try {
            const parsed = JSON.parse($(script).contents().text());
            const visit = (value, category = 'Menu') => {
                if (Array.isArray(value)) {
                    value.forEach((entry) => visit(entry, category));
                    return null;
                }
                if (!value || typeof value !== 'object') return null;
                const type = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
                const name = typeof value.name === 'string' ? value.name.trim() : '';
                const offer = Array.isArray(value.offers) ? value.offers[0] : value.offers;
                const price = value.price ?? offer?.price;
                const imageUrl = imageUrlFrom(value.image, sourceUrl);
                if (
                    name &&
                    !/^\s*[A-Z][A-Z &-]{2,}\s*$/.test(name) &&
                    type.some((entry) => /MenuItem|Product|Recipe/i.test(String(entry)))
                ) {
                    rows.push({
                        name,
                        ...(price !== undefined ? { price: String(price) } : {}),
                        description: typeof value.description === 'string' ? value.description : '',
                        category,
                        ...(imageUrl ? { imageUrl } : {}),
                    });
                    return null;
                }
                for (const [key, child] of Object.entries(value)) {
                    const nextCategory = /section|category|menu/i.test(key) && name ? name : category;
                    visit(child, nextCategory);
                }
                return null;
            };
            visit(parsed);
        } catch {
            // Malformed JSON-LD is common; continue with visible page content.
        }
    });
    return rows;
}

function visibleRows($, sourceUrl) {
    const selectors = [
        '[itemtype*="MenuItem"]',
        '[itemtype*="Product"]',
        '[itemprop="hasMenuItem"]',
        '[data-testid*="menu-item" i]',
        '[class*="menu-item" i]',
        '[class*="menuItem"]',
        '[class*="product-card" i]',
        '[class*="dish-card" i]',
        'main article',
        'main li',
    ].join(',');
    const candidates = new Set();
    $(selectors).each((_, node) => candidates.add(node));

    // Generic fallback for pages without recognizable menu-card markup.
    if (candidates.size < 3) {
        $('body *').each((_, node) => {
            const text = textOf($, node);
            if (!text || text.length > 220 || !PRICE_PATTERN.test(text)) return;
            const hasPricedChild = $(node)
                .find('*')
                .toArray()
                .some((child) => textOf($, child).length <= 220 && PRICE_PATTERN.test(textOf($, child)));
            if (!hasPricedChild) candidates.add(node);
        });
    }

    const rows = [];
    for (const node of candidates) {
        const text = textOf($, node);
        if (/\b(?:out of stock|sold out|unavailable)\b/i.test(text)) continue;
        const nameNode = $(node)
            .find('[itemprop="name"], h1, h2, h3, h4, [class*="name" i], [class*="title" i]')
            .first();
        const name = textOf($, nameNode) || cleanName(text);
        if (!name || name.length > 160 || /^(menu|order online|add to order)$/i.test(name)) continue;
        const descriptionNode = $(node).find('[itemprop="description"], p, [class*="description" i]').first();
        const description = textOf($, descriptionNode);
        const price =
            priceFrom(textOf($, $(node).find('[itemprop="price"], [class*="price" i]').first())) || priceFrom(text);
        if (!price && !description) continue;
        const imageUrl = imageUrlInNode($, node, sourceUrl);
        rows.push({
            name,
            ...(price ? { price } : {}),
            description,
            category: categoryFor($, node),
            ...(imageUrl ? { imageUrl } : {}),
        });
    }
    return rows;
}

export const router = createCheerioRouter();

router.addDefaultHandler(async ({ request, $, log, pushData }) => {
    const parsedUrl = new URL(request.loadedUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error(`Menu URL must use HTTP or HTTPS: ${request.loadedUrl}`);
    }

    const rows = [...parseStructuredData($, request.loadedUrl), ...visibleRows($, request.loadedUrl)];
    const byName = new Map();
    for (const row of rows) {
        const key = row.name.toLowerCase();
        const previous = byName.get(key);
        byName.set(key, { ...previous, ...row, imageUrl: row.imageUrl ?? previous?.imageUrl });
    }
    const unique = [...byName.values()];
    if (unique.length < 3) {
        const title = textOf($, $('title'));
        throw new Error(
            `Found only ${unique.length} menu items on ${title || request.loadedUrl}. The page may need JavaScript rendering, may be a PDF/image, or may not expose menu items in its HTML.`,
        );
    }

    log.info(`Extracted ${unique.length} menu items`, { url: request.loadedUrl });
    for (const item of unique) {
        await pushData({ ...item, sourceUrl: request.loadedUrl });
    }
});
