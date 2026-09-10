#!/usr/bin/env node
/**
 * Re-fetches specific page image slots that came back off-topic from the
 * first fetch, using deeper/better Pexels queries. Keeps the same output
 * filenames so data/images.json stays valid, and updates credits.json.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "assets", "images");
const CREDITS_FILE = path.join(IMAGES_DIR, "credits.json");
const API_KEY = process.env.PEXELS_API_KEY.trim();

const HERO_W = 1600, HERO_H = 900;
const CONTENT_W = 900, CONTENT_H = 700;
const MAX_BYTES = 160 * 1024;

// slot: "hero" | 1 | 2  (content index is slot number)
const REPLACEMENTS = [
  { slug: "photoelectric-smoke-alarm-installation", slot: 1, queries: ["smoke detector", "fire alarm ceiling white"] },
  { slug: "photoelectric-smoke-alarm-installation", slot: 2, queries: ["smoke detector", "bedroom ceiling white interior"] },
  { slug: "smoke-alarm-testing-and-maintenance", slot: "hero", queries: ["smoke detector", "fire alarm ceiling"] },
  { slug: "smoke-alarm-testing-and-maintenance", slot: 1, queries: ["smoke detector hand", "smoke detector"] },
  { slug: "smoke-alarm-testing-and-maintenance", slot: 2, queries: ["clipboard checklist", "checklist pen"] },
  { slug: "smoke-alarm-replacement", slot: "hero", queries: ["smoke detector", "fire alarm ceiling"] },
  { slug: "smoke-alarm-replacement", slot: 2, queries: ["smoke detector", "nine volt battery"] },
  { slug: "interconnected-smoke-alarms", slot: 1, queries: ["smoke detector", "fire alarm"] },
  { slug: "interconnected-smoke-alarms", slot: 2, queries: ["modern hallway interior home", "staircase interior home"] },
  { slug: "home", slot: 2, queries: ["smoke detector", "fire alarm ceiling"] },
  { slug: "about", slot: "hero", queries: ["electrician portrait smiling", "construction worker smiling portrait", "tradesman portrait"] },
  { slug: "faqs", slot: 1, queries: ["smoke detector", "fire alarm"] },
  { slug: "faqs", slot: 2, queries: ["cozy living room fireplace", "family living room"] },
  { slug: "how-it-works", slot: 1, queries: ["work van", "delivery van man"] },
  { slug: "how-it-works", slot: 2, queries: ["handshake home", "handshake contractor"] },
];

const credits = JSON.parse(fs.readFileSync(CREDITS_FILE, "utf8"));
const usedIds = new Set();
for (const c of credits) {
  if (c.sourceUrl) {
    const m = c.sourceUrl.match(/(\d+)\/?$/);
    if (m) usedIds.add(Number(m[1]));
  }
}

async function pexelsSearch(query, perPage = 40) {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`,
    { headers: { Authorization: API_KEY } }
  );
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status} for "${query}"`);
  return (await res.json()).photos || [];
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

async function main() {
  for (const rep of REPLACEMENTS) {
    let photo = null, usedQuery = null;
    for (const q of rep.queries) {
      const photos = await pexelsSearch(q);
      photo = photos.find((p) => !usedIds.has(p.id));
      if (photo) { usedQuery = q; break; }
    }
    if (!photo) {
      console.warn(`No fresh photo found for ${rep.slug} slot ${rep.slot} — leaving as is`);
      continue;
    }
    usedIds.add(photo.id);

    const isHero = rep.slot === "hero";
    const base = isHero ? `${rep.slug}-hero` : `${rep.slug}-${rep.slot}`;
    const w = isHero ? HERO_W : CONTENT_W;
    const h = isHero ? HERO_H : CONTENT_H;
    const buffer = await download(photo.src.large2x || photo.src.large || photo.src.original);
    const pipeline = sharp(buffer).resize(w, h, { fit: "cover", position: "attention" });
    const dir = path.join(IMAGES_DIR, rep.slug);
    fs.writeFileSync(path.join(dir, `${base}.jpg`), await encodeWithBudget(pipeline, "jpeg"));
    fs.writeFileSync(path.join(dir, `${base}.webp`), await encodeWithBudget(pipeline, "webp"));

    const creditEntry = credits.find((c) => c.file === `/assets/images/${rep.slug}/${base}.jpg`);
    if (creditEntry) {
      creditEntry.query = usedQuery;
      creditEntry.photographer = photo.photographer;
      creditEntry.photographerUrl = photo.photographer_url;
      creditEntry.source = "pexels";
      creditEntry.sourceUrl = photo.url;
    }
    console.log(`Replaced ${rep.slug} [${rep.slot}] with photo ${photo.id} ("${usedQuery}")`);
  }
  fs.writeFileSync(CREDITS_FILE, JSON.stringify(credits, null, 2));
  console.log("credits.json updated");
}

main().catch((e) => { console.error(e); process.exit(1); });
