import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('AI Recaps Team'),
    tags: z.array(z.string()).default([]),
    image: z.object({
      src: z.string(),
      alt: z.string()
    }).optional(),
    draft: z.boolean().default(false),
    canonicalURL: z.string().url().optional(),
  })
});

export const collections = { blog };
