module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "assets/css": "assets/css" });
  eleventyConfig.addPassthroughCopy({ "assets/js": "assets/js" });
  eleventyConfig.addPassthroughCopy({ "assets/images": "assets/images" });
  eleventyConfig.addPassthroughCopy("robots.txt");

  // Cache-busting query string for CSS/JS, fresh on every build.
  eleventyConfig.addGlobalData("assetVersion", () => Date.now());
  eleventyConfig.addGlobalData("buildDate", () => new Date().toISOString().slice(0, 10));

  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);

  eleventyConfig.addFilter("slugify", (str) =>
    String(str)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  );

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "../data",
      output: "_site",
    },
    dataTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
