import { CheerioCrawler, purgeDefaultStorages } from '@crawlee/cheerio';
import { beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';

import { router } from '../src/routes.js';

describe('CheerioCrawler', () => {
    beforeAll(async () => {
        await purgeDefaultStorages();
    });

    it('should crawl a public menu page and extract data to dataset', async () => {
        const server = createServer((_request, response) => {
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end('<html><body><h2>Mains</h2><main><article class="dish-card"><h3>Rice Bowl</h3><p>Steamed rice with vegetables</p><span>$14.00</span></article><article class="dish-card"><h3>Tofu Curry</h3><p>Coconut curry with tofu</p><span>$16.00</span></article><article class="dish-card"><h3>Horchata</h3><p>House rice drink</p><span>$5.00</span></article></main></body></html>');
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        const crawler = new CheerioCrawler({
            maxRequestsPerCrawl: 10,
            requestHandler: router,
        });

        await crawler.run([`http://127.0.0.1:${port}`]);
        server.close();

        expect(crawler.stats.state.requestsFinished).toBeGreaterThanOrEqual(1);

        const { items } = await crawler.getData();
        expect(items.length).toBeGreaterThan(0);
        expect(items[0].name).toBe('Rice Bowl');
        expect(items[0].category).toBe('Mains');
    }, 30_000);
});
