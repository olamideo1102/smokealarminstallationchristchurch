# Smoke Alarm Installation Christchurch

Static local-SEO site for a Christchurch, NZ smoke alarm installation business, built with [Eleventy](https://www.11ty.dev/). Design modeled on the emergencyelectricianchristchurch.co.nz look (Bootstrap 5 + Inter) with its own palette — safety red, deep navy, Manrope headings, pill buttons.

## Structure

```
├── .eleventy.js          Eleventy config (input src/, data ../data, output _site/)
├── data/
│   ├── business.json     Name, phone, address, hours — edit contact details here
│   ├── services.json     The 6 services (drives nav, footer, service cards)
│   ├── suburbs.json      Service-areas page suburb cards
│   └── images.json       Generated image manifest (by scripts/fetch-images.js)
├── scripts/
│   ├── fetch-images.js   Downloads Pexels photos per page → assets/images/<page-slug>/
│   └── patch-images.js   Re-fetches individual page/slot photos with better queries
├── assets/
│   ├── css/style.css     All styling
│   ├── js/main.js        Small helpers
│   └── images/<slug>/    One folder of photos per page (hero + 2 content, jpg + webp)
└── src/
    ├── index.njk         Homepage (~1,500 words)
    ├── <page>/index.njk  Every other page is a folder → pretty URL /<page>/
    └── _includes/        Base layout + partials (hero, quote form, FAQ, CTA, services grid)
```

## Pages

Home, 6 service pages (photoelectric, interconnected, hardwired, rental compliance, replacement, testing & maintenance), how-it-works, pricing, about, faqs, service-areas, contact, thank-you, privacy-policy, 404, sitemap.xml.

## Commands

```bash
npm install          # once
npm run fetch-images # re-download all page photos from Pexels (needs PEXELS_API_KEY in .env)
npm run build        # build to _site/
npm run serve        # dev server with live reload
```

## Notes

- Every page's photos live in their own folder under `assets/images/<page-slug>/`; templates read paths from `data/images.json`. To swap in real job photos, replace the files (keep filenames) or edit the manifest.
- Photo credits: `assets/images/credits.json`.
- Contact form posts via formsubmit.co to the address in `business.json`, redirecting to `/thank-you/`.
- Prices appear on the homepage pricing teaser and `/pricing/` — update both when they change.
