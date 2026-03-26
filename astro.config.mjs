import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://airecaps.com',
  base: '/blog',
  trailingSlash: 'always',
  output: 'static',
  integrations: [
    sitemap({
      // With base='/blog' and pages under src/pages/blog/, Astro generates
      // doubled paths like https://airecaps.com/blog/blog/slug/ in the sitemap.
      // Deduplicate by replacing /blog/blog/ with /blog/ and removing the
      // duplicate root-redirect entry.
      serialize(item) {
        // Fix doubled /blog/blog/ path
        item.url = item.url.replace(
          'https://airecaps.com/blog/blog/',
          'https://airecaps.com/blog/'
        );
        return item;
      },
      // Filter out the root redirect page (src/pages/index.astro → /blog/)
      // to avoid duplicate /blog/ entry; blog index already provides it
      filter: (page) => page !== 'https://airecaps.com/blog/',
    }),
  ],
  build: {
    format: 'directory'
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark'
    }
  }
});
