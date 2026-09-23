#!/usr/bin/env node
/**
 * Builds every page's photo set from the curated originals in assets/source/.
 *
 * Each page gets 1 hero (1600x900) + 2 content images (900x700), written as
 * jpg + webp pairs into that page's own folder, assets/images/<page-slug>/,
 * under the same filenames the templates already reference via
 * data/images.json.
 *
 * The PHOTOS map below is hand-assigned per slot. Two rules it satisfies:
 *   1. No page shows the same photo twice.
 *   2. The homepage renders 10 photos (its own 3, the how-it-works hero and
 *      the 6 service-card heroes) — all 10 are different.
 *
 * To swap a photo, drop a new file in assets/source/ and change the name here,
 * then run `npm run images`.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const SOURCE_DIR = path.join(ROOT, "assets", "source");
const IMAGES_DIR = path.join(ROOT, "assets", "images");
const MANIFEST_FILE = path.join(ROOT, "data", "images.json");
const CREDITS_FILE = path.join(IMAGES_DIR, "credits.json");

const HERO_W = 1600, HERO_H = 900;
const CONTENT_W = 900, CONTENT_H = 700;
const MAX_BYTES = 170 * 1024;

// page slug -> [hero, content0, content1] source basenames (no extension)
const PHOTOS = {
  home: [
    "alarm-fitted-to-ceiling-hands",
    "alarm-with-smoke-swirling",
    "alarm-mounted-clean-ceiling",
  ],
  "photoelectric-smoke-alarm-installation": [
    "alarm-on-ceiling-clean",
    "alarm-underside-product",
    "alarm-fitted-two-hands",
  ],
  "interconnected-smoke-alarms": [
    "alarm-in-long-hallway",
    "alarm-smoke-dark-ceiling",
    "alarm-fitted-hands-ceiling",
  ],
  "hardwired-smoke-alarm-installation": [
    "alarm-base-wiring-screwdriver",
    "electrician-ceiling-alarm-closeup",
    "electrician-fitting-alarm-arms-up",
  ],
  "rental-property-smoke-alarm-compliance": [
    "installer-smiling-with-alarm",
    "electrician-blue-shirt-fitting",
    "hand-testing-alarm-ceiling",
  ],
  "smoke-alarm-replacement": [
    "hand-holding-alarm-screwdriver",
    "alarm-product-white",
    "alarm-smoke-fire-glow",
  ],
  "smoke-alarm-testing-and-maintenance": [
    "finger-pressing-test-button",
    "man-testing-ceiling-alarm",
    "installer-screwdriver-portrait",
  ],
  "how-it-works": [
    "installer-reaching-ceiling-alarm",
    "installer-arm-raised-fitting",
    "alarm-base-wiring-screwdriver",
  ],
  about: [
    "alarm-product-teal",
    "alarm-smoke-wide-banner",
    "alarm-red-led-dramatic",
  ],
  pricing: [
    "alarm-product-white",
    "alarm-underside-product",
    "alarm-fitted-two-hands",
  ],
  faqs: [
    "alarm-on-ceiling-clean",
    "alarm-with-smoke-swirling",
    "alarm-smoke-dark-ceiling",
  ],
  "service-areas": [
    "alarm-in-long-hallway",
    "man-testing-ceiling-alarm",
    "alarm-mounted-clean-ceiling",
  ],
  contact: [
    "installer-smiling-with-alarm",
    "installer-screwdriver-portrait",
    "alarm-fitted-hands-ceiling",
  ],
};

// Alt text per page, reused for all three of that page's images.
const ALTS = {
  home: "Photoelectric smoke alarm installation in a Christchurch home",
  "photoelectric-smoke-alarm-installation": "Photoelectric smoke alarm on a ceiling in Christchurch",
  "interconnected-smoke-alarms": "Interconnected smoke alarm system in a Christchurch home",
  "hardwired-smoke-alarm-installation": "Electrician hardwiring a smoke alarm in Christchurch",
  "rental-property-smoke-alarm-compliance": "Rental property smoke alarm compliance check in Christchurch",
  "smoke-alarm-replacement": "Replacing an expired smoke alarm in a Christchurch home",
  "smoke-alarm-testing-and-maintenance": "Testing a smoke alarm in a Christchurch home",
  "how-it-works": "Smoke alarm installer at work in a Christchurch home",
  pricing: "Upfront smoke alarm installation pricing in Christchurch",
  about: "The team behind Smoke Alarm Installation Christchurch",
  faqs: "Common questions about smoke alarm installation in Christchurch",
  "service-areas": "Christchurch suburbs covered by Smoke Alarm Installation Christchurch",
  contact: "Contact Smoke Alarm Installation Christchurch",
};

function sourcePath(name) {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const p = path.join(SOURCE_DIR, name + ext);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Missing source image: ${name} (looked in assets/source/)`);
}

async function encodeWithBudget(pipeline, format) {
  const qualities = format === "webp" ? [82, 70, 58] : [82, 68, 54];
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

async function makeImage(slug, sourceName, baseName, width, height, alt) {
  const pageDir = path.join(IMAGES_DIR, slug);
  fs.mkdirSync(pageDir, { recursive: true });
  const pipeline = sharp(sourcePath(sourceName)).resize(width, height, {
    fit: "cover",
    position: "attention",
  });
  fs.writeFileSync(path.join(pageDir, `${baseName}.jpg`), await encodeWithBudget(pipeline, "jpeg"));
  fs.writeFileSync(path.join(pageDir, `${baseName}.webp`), await encodeWithBudget(pipeline, "webp"));
  return {
    file: `/assets/images/${slug}/${baseName}.jpg`,
    webp: `/assets/images/${slug}/${baseName}.webp`,
    width,
    height,
    alt,
  };
}

async function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error("assets/source/ does not exist — put the original photos there first.");
    process.exit(1);
  }

  // Sanity check: no page may list the same photo twice.
  for (const [slug, names] of Object.entries(PHOTOS)) {
    if (new Set(names).size !== names.length) {
      console.error(`${slug} repeats a photo within the page`);
      process.exit(1);
    }
  }
  // Sanity check: the 10 photos the homepage renders must all differ.
  const serviceSlugs = require(path.join(ROOT, "data", "services.json")).map((s) => s.slug);
  const homepagePhotos = [
    ...PHOTOS.home,
    PHOTOS["how-it-works"][0],
    ...serviceSlugs.map((s) => PHOTOS[s][0]),
  ];
  if (new Set(homepagePhotos).size !== homepagePhotos.length) {
    console.error("The homepage would show the same photo twice:", homepagePhotos);
    process.exit(1);
  }

  fs.rmSync(IMAGES_DIR, { recursive: true, force: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const manifest = {};
  const credits = [];
  let count = 0;

  for (const [slug, names] of Object.entries(PHOTOS)) {
    const alt = ALTS[slug] || "Smoke alarm installation in Christchurch";
    const entry = { content: [] };

    entry.hero = await makeImage(slug, names[0], `${slug}-hero`, HERO_W, HERO_H, alt);
    entry.content.push(await makeImage(slug, names[1], `${slug}-1`, CONTENT_W, CONTENT_H, alt));
    entry.content.push(await makeImage(slug, names[2], `${slug}-2`, CONTENT_W, CONTENT_H, alt));

    names.forEach((n, i) => {
      credits.push({
        page: slug,
        file: `/assets/images/${slug}/${i === 0 ? `${slug}-hero` : `${slug}-${i}`}.jpg`,
        source: "assets/source/" + path.basename(sourcePath(n)),
      });
    });

    manifest[slug] = entry;
    count += 3;
    console.log(`  ${slug}: 3 images`);
  }

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(CREDITS_FILE, JSON.stringify(credits, null, 2));
  console.log(`\nDone. ${count} images (${count * 2} files) written under assets/images/`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
