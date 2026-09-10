#!/usr/bin/env node
/**
 * Downloads royalty-free photos for every page of the site from the Pexels API
 * and saves each page's photos into its own folder: assets/images/{page-slug}/.
 *
 * Each page gets 1 hero image + 2 content images, resized and compressed with
 * sharp (jpg + webp pairs, each kept under ~160KB). Photo IDs are deduped
 * across the whole site so no two pages share the same photo.
 *
 * Writes data/images.json (the manifest templates read) and
 * assets/images/credits.json (photographer credits).
 *
 * Requires PEXELS_API_KEY in .env — falls back to picsum.photos placeholders
 * if the key is missing or a query returns nothing, so the build never breaks.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "assets", "images");
const MANIFEST_FILE = path.join(ROOT, "data", "images.json");
const CREDITS_FILE = path.join(IMAGES_DIR, "credits.json");

const API_KEY = process.env.PEXELS_API_KEY && process.env.PEXELS_API_KEY.trim();

const HERO_W = 1600, HERO_H = 900;
const CONTENT_W = 900, CONTENT_H = 700;
const MAX_BYTES = 160 * 1024;

// Every page on the site. Queries are ordered by preference; the script walks
// them until it finds enough photos this site hasn't used yet.
const PAGES = [
  {
    slug: "home",
    alt: "Photoelectric smoke alarm installation in a Christchurch home",
    queries: ["smoke detector ceiling", "smoke detector", "smoke alarm", "cozy living room home", "electrician working"],
  },
  {
    slug: "photoelectric-smoke-alarm-installation",
    alt: "Photoelectric smoke alarm on a ceiling in Christchurch",
    queries: ["smoke detector white ceiling", "smoke detector", "fire alarm ceiling", "bedroom interior ceiling"],
  },
  {
    slug: "interconnected-smoke-alarms",
    alt: "Interconnected smoke alarm system in a Christchurch home",
    queries: ["smoke alarm", "modern home interior hallway", "new build house interior", "smoke detector"],
  },
  {
    slug: "hardwired-smoke-alarm-installation",
    alt: "Electrician hardwiring a smoke alarm in Christchurch",
    queries: ["electrician working ceiling", "electrician wiring", "electrician ladder", "electrical installation"],
  },
  {
    slug: "rental-property-smoke-alarm-compliance",
    alt: "Rental property smoke alarm compliance check in Christchurch",
    queries: ["house keys landlord", "rental property house", "handing over keys", "house exterior new zealand"],
  },
  {
    slug: "smoke-alarm-replacement",
    alt: "Replacing an expired smoke alarm in a Christchurch home",
    queries: ["smoke detector battery", "changing smoke detector", "smoke detector hand", "smoke detector"],
  },
  {
    slug: "smoke-alarm-testing-and-maintenance",
    alt: "Testing a smoke alarm in a Christchurch home",
    queries: ["testing smoke detector", "smoke detector test", "clipboard checklist inspection", "smoke detector ceiling"],
  },
  {
    slug: "how-it-works",
    alt: "Smoke alarm installer arriving at a Christchurch home",
    queries: ["tradesman van tools", "electrician tools", "workman arriving house", "electrician"],
  },
  {
    slug: "pricing",
    alt: "Upfront smoke alarm installation pricing in Christchurch",
    queries: ["calculator budget home", "calculator invoice", "planning budget paper"],
  },
  {
    slug: "about",
    alt: "The team behind Smoke Alarm Installation Christchurch",
    queries: ["electrician portrait", "tradesman smiling", "electrician at work", "handyman portrait"],
  },
  {
    slug: "faqs",
    alt: "Common questions about smoke alarm installation in Christchurch",
    queries: ["smoke detector ceiling white", "smoke alarm ceiling", "smoke detector"],
  },
  {
    slug: "service-areas",
    alt: "Christchurch suburbs covered by Smoke Alarm Installation Christchurch",
    queries: ["christchurch new zealand", "christchurch city", "new zealand suburb houses"],
  },
  {
    slug: "contact",
    alt: "Contact Smoke Alarm Installation Christchurch",
    queries: ["phone call customer", "person phone call home", "call center friendly"],
  },
];

const usedIds = new Set();
const credits = [];

async function pexelsSearch(query, perPage = 15) {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`,
    { headers: { Authorization: API_KEY } }
  );
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status} for "${query}"`);
  const json = await res.json();
  return json.photos || [];
}

async function download(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function encodeWithBudget(pipeline, format) {
  const qualities = format === "webp" ? [80, 68, 55] : [80, 66, 50];
  let buffer;
  for (const q of qualities) {
    buffer =
      format === "webp"
        ? await pipeline.clone().webp({ quality: q }).toBuffer()
        : await pipeline.clone().jpeg({ quality: q, mozjpeg: true }).toBuffer();
    if (buffer.length <= MAX_BYTES) break;
  }
  return buffer;
}

async function saveImage(buffer, dir, baseName, width, height, alt) {
  const pageDir = path.join(IMAGES_DIR, dir);
  fs.mkdirSync(pageDir, { recursive: true });
  const pipeline = sharp(buffer).resize(width, height, { fit: "cover", position: "attention" });
  const jpegBuf = await encodeWithBudget(pipeline, "jpeg");
  const webpBuf = await encodeWithBudget(pipeline, "webp");
  fs.writeFileSync(path.join(pageDir, `${baseName}.jpg`), jpegBuf);
  fs.writeFileSync(path.join(pageDir, `${baseName}.webp`), webpBuf);
  return {
    file: `/assets/images/${dir}/${baseName}.jpg`,
    webp: `/assets/images/${dir}/${baseName}.webp`,
    width,
    height,
    alt,
  };
}

// Collect `count` photos for a page, walking its query list and skipping any
// photo already used elsewhere on the site.
async function collectPhotos(page, count) {
  const picked = [];
  if (API_KEY) {
    for (const query of page.queries) {
      if (picked.length >= count) break;
      let photos = [];
      try {
        photos = await pexelsSearch(query);
      } catch (e) {
        console.warn(`  search failed for "${query}": ${e.message}`);
        continue;
      }
      for (const photo of photos) {
        if (picked.length >= count) break;
        if (usedIds.has(photo.id)) continue;
        usedIds.add(photo.id);
        picked.push({
          url: photo.src.large2x || photo.src.large || photo.src.original,
          photographer: photo.photographer,
          photographerUrl: photo.photographer_url,
          pexelsUrl: photo.url,
          query,
        });
      }
    }
  }
  // Placeholder fallback for any shortfall.
  while (picked.length < count) {
    const seed = `${page.slug}-${picked.length}`;
    picked.push({
      url: `https://picsum.photos/seed/${encodeURIComponent(seed)}/1600/1000`,
      photographer: "Lorem Picsum (placeholder)",
      photographerUrl: "https://picsum.photos/",
      pexelsUrl: null,
      query: "placeholder",
    });
  }
  return picked;
}

async function main() {
  if (!API_KEY) {
    console.log("No PEXELS_API_KEY set — using picsum.photos placeholders only.");
  }
  fs.rmSync(IMAGES_DIR, { recursive: true, force: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const manifest = {};

  for (const page of PAGES) {
    console.log(`Fetching photos for: ${page.slug}`);
    const photos = await collectPhotos(page, 3);
    const entry = { content: [] };

    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      let buffer;
      try {
        buffer = await download(p.url);
      } catch (e) {
        console.warn(`  download failed (${e.message}), using placeholder`);
        buffer = await download(`https://picsum.photos/seed/${page.slug}-fb${i}/1600/1000`);
      }
      const isHero = i === 0;
      const img = await saveImage(
        buffer,
        page.slug,
        isHero ? `${page.slug}-hero` : `${page.slug}-${i}`,
        isHero ? HERO_W : CONTENT_W,
        isHero ? HERO_H : CONTENT_H,
        page.alt
      );
      if (isHero) entry.hero = img;
      else entry.content.push(img);
      credits.push({
        page: page.slug,
        file: img.file,
        query: p.query,
        photographer: p.photographer,
        photographerUrl: p.photographerUrl,
        source: p.pexelsUrl ? "pexels" : "picsum.photos",
        sourceUrl: p.pexelsUrl,
      });
    }
    manifest[page.slug] = entry;
  }

  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(CREDITS_FILE, JSON.stringify(credits, null, 2));
  console.log(`\nDone. Photos for ${PAGES.length} pages saved under assets/images/<page-slug>/`);
  console.log("Manifest: data/images.json — Credits: assets/images/credits.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
