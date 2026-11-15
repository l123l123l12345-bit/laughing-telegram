// build-index.js — سكربت نشر اختياري (Node بدون أي مكتبات)
// يعمل تلقائياً على Netlify عند كل نشر (انظر netlify.toml) ويقوم بـ:
//   1) توليد content/posts/index.json (فهرس المقالات لصفحة الرئيسية)
//   2) إعادة كتابة sitemap.xml بالأقسام والمقالات
// تشغيل محلي:  node build-index.js

const fs = require("fs");
const path = require("path");

// ---------- الإعدادات ----------
const POSTS_DIR = path.join(__dirname, "content", "posts");
const INDEX_FILE = path.join(POSTS_DIR, "index.json");
const SITEMAP_FILE = path.join(__dirname, "sitemap.xml");
const SITE_URL = (process.env.URL || process.env.SITE_URL || "https://techblogfirst.netlify.app").replace(/\/$/, "");
// يجب أن تطابق معرّفات SECTIONS في script.js
const CATEGORIES = ["smart-life", "news", "programming-languages", "general-phones", "dev-security", "courses", "ai"];

// ---------- قراءة Front Matter (نسخة مبسّطة) ----------
function unquote(value) {
  const v = value.trim();
  if (/^".*"$/.test(v)) return v.slice(1, -1).replace(/\\"/g, '"');
  if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function parseFrontMatter(raw) {
  const match = raw.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const data = {};
  if (!match) return data;
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const inline = m[2].trim();
    if (inline === "" || /^[>|][+-]?$/.test(inline)) {
      const block = [];
      while (i + 1 < lines.length && !/^[A-Za-z0-9_]+:/.test(lines[i + 1])) block.push(lines[++i].trim());
      data[m[1]] = inline.startsWith(">") ? block.join(" ").trim() : block.join("\n").trim();
    } else {
      data[m[1]] = unquote(inline);
    }
  }
  return data;
}

// ---------- التنفيذ ----------
const files = fs.existsSync(POSTS_DIR) ? fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md")) : [];

const posts = files
  .map((file) => {
    const data = parseFrontMatter(fs.readFileSync(path.join(POSTS_DIR, file), "utf8"));
    return {
      slug: file.replace(/\.md$/, ""),
      title: data.title || file,
      date: data.date || "",
      description: data.description || "",
      category: data.category || "",
      thumbnail: data.thumbnail || "",
      // حقول سلسلة المقالات (يقرأها script.js من index.json)
      series: typeof data.series === "string" ? data.series.trim() : "",
      seriesPart: Number.isFinite(parseInt(data.seriesPart, 10)) ? parseInt(data.seriesPart, 10) : null,
      draft: data.draft === true
    };
  })
  .filter((p) => !p.draft)
  .sort((a, b) => new Date(b.date) - new Date(a.date));

fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));

const urlEntry = (loc, priority, freq, lastmod) =>
  `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>${freq}</changefreq><priority>${priority}</priority></url>`;

const entries = [
  urlEntry(`${SITE_URL}/`, "1.0", "daily"),
  ...CATEGORIES.map((c) => urlEntry(`${SITE_URL}/index.html?cat=${c}`, "0.6", "weekly")),
  ...posts.map((p) => urlEntry(`${SITE_URL}/post.html?slug=${encodeURIComponent(p.slug)}`, "0.8", "monthly", p.date ? p.date.slice(0, 10) : "")),
  // صفحة اتصل بنا (contact.html) غير مدرجة عمداً لأنها بوسم noindex
  urlEntry(`${SITE_URL}/about.html`, "0.5", "yearly"),
  urlEntry(`${SITE_URL}/privacy.html`, "0.2", "yearly")
];

fs.writeFileSync(
  SITEMAP_FILE,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`
);

console.log(`تم: ${posts.length} مقال في الفهرس، وتم تحديث sitemap.xml (${SITE_URL})`);
