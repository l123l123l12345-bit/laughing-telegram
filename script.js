/* =========================================================
   script.js — منطق المدونة (Vanilla JS)
   ---------------------------------------------------------
   الفهرس:
   A. الإعدادات العامة (SITE_CONFIG)           ← عدّل اسم المدونة والروابط هنا
   B. الأقسام السبعة (SECTIONS)               ← مصدر واحد للقائمة والبطاقات والتصنيف
   C. داخل DOMContentLoaded:
      1. دوال مساعدة (DOM / نص / تاريخ / مسارات)
      2. الوضع الداكن            initTheme()
      3. القائمة الجانبية         initMenu()
      4. زر العودة للأعلى         initBackToTop()
      5. قراءة المقالات (Front Matter + قائمة المقالات)
         + تلوين الأكواد highlightCode() / نسخ الأكواد addCopyButtons()
      6. الصفحة الرئيسية          initHome()
      7. صفحة المقال             initPost()
         - قراءة Markdown        renderMarkdown()
         - وقت القراءة           calcReadingTime()
         - السيو و Schema        updateSeo() / injectSchema()
         - الصوت                 initTextToSpeech()
         - المشاركة والنسخ        initShare()
         - زر التحميل            renderDownload()
         - شريط التقدم           initProgressBar()
   ========================================================= */

/* ---------- A. الإعدادات العامة ---------- */
const SITE_CONFIG = {
  siteName: "المدونة التقنية الأولى",
  tagline: "مقالات في التقنية والذكاء الاصطناعي والحياة الذكية",
  author: "كاتب المدونة",          // يظهر في Schema وبيانات المقال
  locale: "ar",

  // مسار ملفات المقالات (يجب أن يطابق folder في admin/config.yml)
  postsPath: "content/posts",
  // ملف فهرس المقالات (يُولَّد تلقائياً عبر build-index.js على Netlify)
  indexFile: "content/posts/index.json",

  // اختياري: لقراءة قائمة المقالات مباشرة من GitHub (مناسب لـ GitHub Pages).
  // املأ القيم لتفعيلها (المستودع يجب أن يكون عاماً). اتركها فارغة لتعطيلها.
  github: { owner: "", repo: "", branch: "main" },

  readingWordsPerMinute: 180,     // سرعة القراءة المتوقعة بالعربية
  cacheMinutes: 5                 // مدة تخزين قائمة المقالات مؤقتاً في المتصفح
};

/* ---------- B. الأقسام السبعة ----------
   لإضافة قسم جديد: أضف عنصراً هنا + أضف نفس القيمة في admin/config.yml.
   schemaType: نوع Schema المستخدم لمقالات هذا القسم. */
const SECTIONS = [
  { id: "smart-life",            name: "الحياة الذكية",                 icon: "🏠", schemaType: "BlogPosting" },
  { id: "news",                  name: "الأخبار",                       icon: "📰", schemaType: "BlogPosting" },
  { id: "programming-languages", name: "لغات البرمجة",                  icon: "💻", schemaType: "TechArticle" },
  { id: "general-phones",        name: "عام (استخدام الهواتف)",         icon: "📱", schemaType: "BlogPosting" },
  { id: "dev-security",          name: "قسم المطورين وأمن المعلومات",   icon: "🛡️", schemaType: "TechArticle" },
  { id: "courses",               name: "الكورسات",                      icon: "🎓", schemaType: "BlogPosting" },
  { id: "ai",                    name: "الذكاء الاصطناعي",              icon: "🤖", schemaType: "TechArticle" }
];

/* أنواع ملفات التحميل المدعومة — لإضافة نوع جديد أضف سطراً هنا */
const DOWNLOAD_TYPES = {
  pdf: { icon: "📄", label: "ملف PDF",          action: "تحميل PDF",    openInTab: true },
  mp3: { icon: "🎧", label: "ملف صوتي MP3",     action: "تحميل الصوت",  media: "audio" },
  mp4: { icon: "🎬", label: "فيديو MP4",        action: "تحميل الفيديو", media: "video" },
  zip: { icon: "🗜️", label: "ملف مضغوط ZIP",    action: "تحميل الملف" },
  _default: { icon: "📎", label: "ملف مرفق",     action: "تحميل الملف" }
};

document.addEventListener("DOMContentLoaded", () => {

  /* =======================================================
     1. دوال مساعدة
     ======================================================= */
  const $ = (selector, root = document) => root.querySelector(selector);

  // إنشاء عنصر DOM بأمان (بدون innerHTML) لتفادي حقن الأكواد
  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === false || value == null) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    children.flat().forEach((child) => child != null && node.append(child));
    return node;
  };

  const getSection = (id) => SECTIONS.find((s) => s.id === id);
  const getParams = () => new URLSearchParams(window.location.search);

  // تحويل مسار الصور/الملفات إلى مسار نسبي يعمل على الجذر أو المسارات الفرعية
  const assetUrl = (path) => {
    if (!path) return "";
    if (/^(https?:)?\/\//i.test(path) || path.startsWith("data:")) return path;
    return path.replace(/^\/+/, "");
  };

  const formatDate = (value) => {
    const date = new Date(value);
    if (isNaN(date)) return "";
    return date.toLocaleDateString("ar-u-ca-gregory", { year: "numeric", month: "long", day: "numeric" });
  };

  // رسالة صغيرة مؤقتة (Toast)
  let toastTimer;
  const showToast = (message) => {
    let toast = $(".toast");
    if (!toast) {
      toast = el("div", { class: "toast", role: "status", "aria-live": "polite" });
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  };

  const setYear = () => {
    const yearEl = $("#year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  };

  /* =======================================================
     2. الوضع الداكن (يُحفظ في localStorage)
        ملاحظة: يوجد سكربت صغير في <head> يطبّق الوضع قبل الرسم لمنع الوميض.
     ======================================================= */
  const initTheme = () => {
    const button = $("#theme-toggle");
    const STORAGE_KEY = "theme";

    const THEME_COLORS = { dark: "#0a1020", light: "#f5f8fc" };   // لون شريط المتصفح على الهاتف

    const applyTheme = (theme) => {
      document.documentElement.setAttribute("data-theme", theme);
      const themeMeta = $('meta[name="theme-color"]');
      if (themeMeta) themeMeta.setAttribute("content", THEME_COLORS[theme]);
      if (!button) return;
      button.textContent = theme === "dark" ? "☀️" : "🌙";
      button.setAttribute("aria-pressed", String(theme === "dark"));
      button.setAttribute("aria-label", theme === "dark" ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن");
    };

    const current = () => document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current());

    if (button) {
      button.addEventListener("click", () => {
        const next = current() === "dark" ? "light" : "dark";
        applyTheme(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* التخزين غير متاح */ }
      });
    }
  };

  /* =======================================================
     3. القائمة الجانبية (Hamburger) + روابط الشريط العلوي
     ======================================================= */
  const initMenu = () => {
    const navLinks = $("#nav-links");
    const drawerList = $("#drawer-list");
    const drawer = $("#drawer");
    const overlay = $("#drawer-overlay");
    const openBtn = $("#menu-toggle");
    const closeBtn = $("#drawer-close");
    const activeCat = getParams().get("cat");

    // بناء الروابط من مصدر الأقسام الواحد
    const buildLinks = (container) => {
      if (!container) return;
      SECTIONS.forEach((section) => {
        const link = el("a", {
          href: `index.html?cat=${section.id}`,
          class: section.id === activeCat ? "active" : false,
          "aria-current": section.id === activeCat ? "page" : false,
          text: section.name
        });
        container.append(el("li", {}, link));
      });
    };
    buildLinks(navLinks);
    buildLinks(drawerList);

    if (!drawer || !openBtn) return;

    const setOpen = (isOpen) => {
      drawer.classList.toggle("open", isOpen);
      overlay && overlay.classList.toggle("open", isOpen);
      openBtn.setAttribute("aria-expanded", String(isOpen));
      document.body.style.overflow = isOpen ? "hidden" : "";
      if (isOpen) closeBtn && closeBtn.focus();
      else openBtn.focus({ preventScroll: true });
    };

    openBtn.addEventListener("click", () => setOpen(true));
    closeBtn && closeBtn.addEventListener("click", () => setOpen(false));
    overlay && overlay.addEventListener("click", () => setOpen(false));
    drawer.addEventListener("click", (event) => { if (event.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && drawer.classList.contains("open")) setOpen(false);
    });
  };

  /* =======================================================
     4. زر العودة للأعلى
     ======================================================= */
  const initBackToTop = () => {
    const button = $("#back-to-top");
    if (!button) return;
    const toggle = () => button.classList.toggle("visible", window.scrollY > 400);
    window.addEventListener("scroll", toggle, { passive: true });
    button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    toggle();
  };

  /* =======================================================
     5. قراءة المقالات
     ======================================================= */

  // تحويل قيمة نصية من Front Matter إلى نوعها المناسب
  const parseScalar = (raw) => {
    const value = raw.trim();
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null" || value === "~") return "";
    if (/^\[.*\]$/.test(value)) {
      const inner = value.slice(1, -1).trim();
      return inner ? inner.split(",").map((item) => parseScalar(item)) : [];
    }
    if (/^".*"$/.test(value)) return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
    if (/^'.*'$/.test(value)) return value.slice(1, -1).replace(/''/g, "'");
    return value;
  };

  // فصل Front Matter (بين --- ---) عن نص المقال. يدعم النصوص والقوائم والكتل المتعددة الأسطر.
  const parseFrontMatter = (raw) => {
    const match = raw.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { data: {}, body: raw };

    const lines = match[1].split(/\r?\n/);
    const data = {};
    let i = 0;

    while (i < lines.length) {
      const keyMatch = lines[i].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      i++;
      if (!keyMatch) continue;

      const key = keyMatch[1];
      const inline = keyMatch[2].trim();
      const isBlockScalar = /^[>|][+-]?$/.test(inline);

      if (inline === "" || isBlockScalar) {
        // جمع الأسطر المتداخلة التابعة للمفتاح
        const block = [];
        while (i < lines.length && !/^[A-Za-z0-9_]+:/.test(lines[i])) {
          block.push(lines[i]);
          i++;
        }
        while (block.length && block[block.length - 1].trim() === "") block.pop();

        if (isBlockScalar) {
          const parts = block.map((line) => line.trim());
          data[key] = inline.startsWith(">") ? parts.join(" ").trim() : parts.join("\n").trim();
        } else if (block.length && block.every((line) => /^\s*-\s+/.test(line) || line.trim() === "")) {
          data[key] = block.filter((line) => line.trim()).map((line) => parseScalar(line.replace(/^\s*-\s+/, "")));
        } else {
          data[key] = "";
        }
      } else {
        data[key] = parseScalar(inline);
      }
    }
    return { data, body: match[2] };
  };

  // توحيد شكل بيانات المقال الواحد
  const normalizePost = (slug, data) => ({
    slug,
    title: data.title || slug,
    date: data.date || "",
    description: data.description || "",
    category: data.category || "",
    thumbnail: data.thumbnail || "",
    tags: Array.isArray(data.tags) ? data.tags : [],
    draft: data.draft === true,
    show_ad: data.show_ad === true,
    download_file: data.download_file || "",
    download_label: data.download_label || "",
    // سلسلة المقالات (اختيارية): اسم السلسلة + رقم الجزء (null إن لم يُحدَّد)
    series: typeof data.series === "string" ? data.series.trim() : "",
    seriesPart: Number.isFinite(parseInt(data.seriesPart, 10)) ? parseInt(data.seriesPart, 10) : null
  });

  const slugFromFilename = (name) => name.replace(/\.md$/i, "");

  // طريقة 1: قراءة القائمة من GitHub API (إن تم ضبطها)
  const listPostsFromGitHub = async () => {
    const { owner, repo, branch } = SITE_CONFIG.github;
    if (!owner || !repo) return null;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${SITE_CONFIG.postsPath}?ref=${branch}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("GitHub API error");
    const files = (await response.json()).filter((f) => /\.md$/i.test(f.name));
    return Promise.all(files.map(async (file) => {
      const raw = await (await fetch(file.download_url)).text();
      return normalizePost(slugFromFilename(file.name), parseFrontMatter(raw).data);
    }));
  };

  // طريقة 2: قراءة القائمة من ملف الفهرس index.json
  const listPostsFromIndex = async () => {
    const response = await fetch(SITE_CONFIG.indexFile, { cache: "no-cache" });
    if (!response.ok) return [];
    const items = await response.json();
    return items.map((item) => normalizePost(item.slug, item));
  };

  // الدالة الرئيسية لجلب قائمة المقالات (مع تخزين مؤقت قصير)
  const fetchPostsList = async () => {
    // ملاحظة: غيّر رقم الإصدار (v2 ← v3) عند تغيير شكل بيانات normalizePost لتفادي بيانات قديمة مخزّنة
    const cacheKey = "posts_cache_v2";
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (cached && Date.now() - cached.time < SITE_CONFIG.cacheMinutes * 60000) return cached.list;
    } catch (e) { /* تجاهل */ }

    let list = null;
    try { list = await listPostsFromGitHub(); } catch (e) { list = null; }
    if (!list || !list.length) {
      try { list = await listPostsFromIndex(); } catch (e) { list = []; }
    }

    list = list
      .filter((post) => !post.draft)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    try { sessionStorage.setItem(cacheKey, JSON.stringify({ time: Date.now(), list })); } catch (e) { /* تجاهل */ }
    return list;
  };

  /* =======================================================
     6. الصفحة الرئيسية
     ======================================================= */
  const buildPostCard = (post) => {
    const section = getSection(post.category);
    const postUrl = `post.html?slug=${encodeURIComponent(post.slug)}`;

    const thumb = post.thumbnail
      ? el("img", { class: "post-card-thumb", src: assetUrl(post.thumbnail), alt: `صورة مقال: ${post.title}`, loading: "lazy" })
      : el("div", { class: "post-card-thumb post-card-thumb--placeholder", "aria-hidden": "true", text: section ? section.icon : "📝" });

    return el("article", { class: "post-card" },
      el("a", { href: postUrl, tabindex: "-1", "aria-hidden": "true" }, thumb),
      el("div", { class: "post-card-body" },
        el("span", { class: "post-card-cat", text: section ? section.name : post.category || "عام" }),
        el("h3", { class: "post-card-title" }, el("a", { href: postUrl, text: post.title })),
        post.description ? el("p", { class: "post-card-desc", text: post.description }) : null,
        el("div", { class: "post-card-meta", text: formatDate(post.date) })
      )
    );
  };

  const initHome = async () => {
    const activeCat = getParams().get("cat");
    const categoryGrid = $("#category-grid");
    const postGrid = $("#post-grid");
    const postsTitle = $("#posts-title");
    const stateBox = $("#posts-state");

    const posts = await fetchPostsList();

    // بطاقات الأقسام مع عدد المقالات
    SECTIONS.forEach((section) => {
      const count = posts.filter((p) => p.category === section.id).length;
      categoryGrid.append(
        el("a", {
          class: `category-card${section.id === activeCat ? " active" : ""}`,
          href: section.id === activeCat ? "index.html" : `index.html?cat=${section.id}`
        },
          el("span", { class: "cat-icon", "aria-hidden": "true", text: section.icon }),
          el("span", { class: "cat-name", text: section.name }),
          el("span", { class: "cat-count", text: `${count} مقال` })
        )
      );
    });

    // عرض المقالات (مع الفلترة حسب القسم)
    const activeSection = getSection(activeCat);
    const visible = activeCat ? posts.filter((p) => p.category === activeCat) : posts;

    if (activeSection) {
      postsTitle.textContent = `مقالات: ${activeSection.name}`;
      document.title = `${activeSection.name} | ${SITE_CONFIG.siteName}`;
    }

    stateBox.hidden = visible.length > 0;
    if (!visible.length) stateBox.textContent = "لا توجد مقالات في هذا القسم بعد.";
    visible.forEach((post) => postGrid.append(buildPostCard(post)));
  };

  /* =======================================================
     7. صفحة المقال
     ======================================================= */

  /* --- تنظيف HTML الناتج (إزالة السكربتات والأحداث المضمّنة) --- */
  const sanitizeHtml = (html) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script, style, object, embed, link, meta").forEach((n) => n.remove());
    doc.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith("on")) node.removeAttribute(attr.name);
        if ((name === "href" || name === "src") && value.startsWith("javascript:")) node.removeAttribute(attr.name);
      });
    });
    return doc.body.innerHTML;
  };

  /* --- نسخ نص إلى الحافظة (مشترك بين زر نسخ الرابط وأزرار نسخ الأكواد) --- */
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // بديل للمتصفحات القديمة أو الصفحات غير الآمنة
      const area = el("textarea", { readonly: true, style: "position:fixed;opacity:0" });
      area.value = text;
      document.body.append(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      area.remove();
      return ok;
    }
  };

  /* --- زر نسخ الأكواد والاقتباسات ---
     يلفّ كل <pre> و <blockquote> بحاوية .copy-block ويضيف زراً في الزاوية.
     لإضافة عناصر أخرى قابلة للنسخ عدّل COPYABLE_SELECTOR. */
  const COPYABLE_SELECTOR = "pre, blockquote";

  const addCopyButtons = (container) => {
    container.querySelectorAll(COPYABLE_SELECTOR).forEach((target) => {
      // تجنّب التكرار (مثلاً اقتباس داخل اقتباس أو إعادة المعالجة)
      if (target.closest(".copy-block")) return;

      const isCode = target.tagName === "PRE";
      const wrapper = el("div", { class: `copy-block${isCode ? " copy-block--code" : ""}` });
      const button = el("button", {
        class: "copy-btn",
        type: "button",
        "aria-label": isCode ? "نسخ الكود" : "نسخ الاقتباس",
        text: "نسخ"
      });

      let resetTimer;
      button.addEventListener("click", async () => {
        // نأخذ النص من <code> إن وُجد (بدون زر النسخ نفسه)
        const source = target.querySelector("code") || target;
        const ok = await copyText(source.innerText.replace(/\n$/, ""));
        button.textContent = ok ? "تم النسخ!" : "تعذّر النسخ";
        button.classList.toggle("copied", ok);
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          button.textContent = "نسخ";
          button.classList.remove("copied");
        }, 2000);
      });

      target.replaceWith(wrapper);
      wrapper.append(target, button);
    });
  };

  /* --- تلوين الأكواد (Prism.js) ---
     يعمل فقط إذا تم تحميل المكتبة (صفحة المقال)؛ وإن تعذّر تحميلها تبقى الأكواد نصاً عادياً. */
  const highlightCode = (container) => {
    if (typeof Prism === "undefined" || typeof Prism.highlightAllUnder !== "function") return;
    try { Prism.highlightAllUnder(container); } catch (e) { /* نتجاهل أخطاء التلوين */ }
  };

  /* --- قراءة Markdown وتحويله إلى HTML (عبر marked.js من CDN) --- */
  const renderMarkdown = (markdown, container, fallbackAlt) => {
    if (typeof marked !== "undefined") {
      container.innerHTML = sanitizeHtml(marked.parse(markdown));
    } else {
      // في حال تعذّر تحميل marked.js نعرض النص كما هو
      container.textContent = markdown;
      container.style.whiteSpace = "pre-wrap";
    }

    // الصور: تحميل متأخر + نص بديل وصفي + تصحيح المسارات
    container.querySelectorAll("img").forEach((img) => {
      img.setAttribute("loading", "lazy");
      img.setAttribute("src", assetUrl(img.getAttribute("src")));
      if (!img.getAttribute("alt")) img.setAttribute("alt", `صورة توضيحية ضمن مقال ${fallbackAlt}`);
    });

    // الروابط الخارجية تُفتح في تبويب جديد بشكل آمن
    container.querySelectorAll("a[href^='http']").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });

    // تلوين الأكواد (Prism.js) — autoloader يحمّل اللغة المطلوبة تلقائياً عند الحاجة
    highlightCode(container);

    // أزرار نسخ الأكواد والاقتباسات
    addCopyButtons(container);
  };

  /* --- حاسبة وقت القراءة (حسب عدد الكلمات) --- */
  const calcReadingTime = (text) => {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return { words, minutes: Math.max(1, Math.ceil(words / SITE_CONFIG.readingWordsPerMinute)) };
  };

  /* --- السيو: تحديث الوسوم ديناميكياً --- */
  const setMeta = (selector, attribute, value) => {
    const node = $(selector);
    if (node && value) node.setAttribute(attribute, value);
  };

  const updateSeo = (post, canonicalUrl, imageUrl) => {
    const title = `${post.title} | ${SITE_CONFIG.siteName}`;
    document.title = title;
    setMeta('meta[name="description"]', "content", post.description);
    setMeta('meta[name="keywords"]', "content", post.tags.join(", "));
    setMeta('link[rel="canonical"]', "href", canonicalUrl);
    setMeta('meta[property="og:title"]', "content", post.title);
    setMeta('meta[property="og:description"]', "content", post.description);
    setMeta('meta[property="og:url"]', "content", canonicalUrl);
    setMeta('meta[property="og:image"]', "content", imageUrl);
    setMeta('meta[name="twitter:title"]', "content", post.title);
    setMeta('meta[name="twitter:description"]', "content", post.description);
    setMeta('meta[name="twitter:image"]', "content", imageUrl);
    setMeta('meta[name="twitter:card"]', "content", imageUrl ? "summary_large_image" : "summary");
  };

  /* --- السيو: Schema Markup بصيغة JSON-LD --- */
  const injectSchema = (post, info) => {
    const section = getSection(post.category);
    const schema = {
      "@context": "https://schema.org",
      "@type": section ? section.schemaType : "BlogPosting",
      headline: post.title,
      description: post.description,
      inLanguage: SITE_CONFIG.locale,
      datePublished: post.date ? new Date(post.date).toISOString() : undefined,
      dateModified: post.date ? new Date(post.date).toISOString() : undefined,
      author: { "@type": "Person", name: SITE_CONFIG.author },
      publisher: { "@type": "Organization", name: SITE_CONFIG.siteName },
      mainEntityOfPage: { "@type": "WebPage", "@id": info.url },
      // انتماء المقال لسلسلة (يُحذف تلقائياً إن لم يكن ضمن سلسلة)
      isPartOf: post.series ? { "@type": "CreativeWorkSeries", name: post.series } : undefined,
      position: post.series && post.seriesPart ? post.seriesPart : undefined,
      articleSection: section ? section.name : undefined,
      keywords: post.tags.length ? post.tags.join(", ") : undefined,
      wordCount: info.words,
      timeRequired: `PT${info.minutes}M`,
      image: info.image || undefined
    };

    let node = $("#schema-jsonld");
    if (!node) {
      node = el("script", { type: "application/ld+json", id: "schema-jsonld" });
      document.head.append(node);
    }
    node.textContent = JSON.stringify(schema); // JSON.stringify يحذف الحقول undefined
  };

  /* --- شريط تقدم القراءة --- */
  const initProgressBar = (articleEl) => {
    const bar = $("#progress-bar");
    if (!bar) return;
    let ticking = false;

    const update = () => {
      const rect = articleEl.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const percent = total <= 0 ? 100 : Math.min(100, Math.max(0, (-rect.top / total) * 100));
      bar.style.width = `${percent}%`;
      bar.setAttribute("aria-valuenow", String(Math.round(percent)));
      ticking = false;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  };

  /* --- الاستماع للمقال (Web Speech API المحلي — بدون أي API خارجي) --- */
  const initTextToSpeech = (getText) => {
    const controls = $("#tts-controls");
    const playBtn = $("#tts-play");
    const pauseBtn = $("#tts-pause");
    const stopBtn = $("#tts-stop");
    const status = $("#tts-status");
    if (!controls) return;

    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      status.textContent = "المتصفح لا يدعم الاستماع الصوتي.";
      [playBtn, pauseBtn, stopBtn].forEach((b) => (b.disabled = true));
      return;
    }

    const synth = window.speechSynthesis;
    let voice = null;
    let chunks = [];
    let index = 0;
    let state = "idle";   // idle | playing | paused
    let session = 0;      // رقم الجلسة لتجاهل أحداث الجلسات الملغاة

    // اختيار صوت عربي إن وُجد
    const pickVoice = () => {
      voice = synth.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith("ar")) || null;
    };
    pickVoice();
    synth.addEventListener("voiceschanged", pickVoice);

    // تقسيم النص إلى مقاطع قصيرة (بعض المتصفحات تتوقف عند النصوص الطويلة)
    const splitIntoChunks = (text, max = 180) => {
      const sentences = text.replace(/\s+/g, " ").match(/[^.!؟?؛]+[.!؟?؛]*/g) || [text];
      const result = [];
      let current = "";
      sentences.forEach((sentence) => {
        let rest = sentence.trim();
        if (!rest) return;
        while (rest.length > max) {
          if (current) { result.push(current); current = ""; }
          let cut = rest.lastIndexOf(" ", max);
          if (cut <= 0) cut = max;
          result.push(rest.slice(0, cut));
          rest = rest.slice(cut).trim();
        }
        if ((current + " " + rest).trim().length > max) { result.push(current); current = rest; }
        else current = (current + " " + rest).trim();
      });
      if (current) result.push(current);
      return result.filter(Boolean);
    };

    const updateUi = () => {
      playBtn.disabled = state === "playing";
      pauseBtn.disabled = state !== "playing";
      stopBtn.disabled = state === "idle";
      status.textContent = { idle: "", playing: "جارٍ القراءة…", paused: "متوقف مؤقتاً" }[state];
      if (state === "idle" && !voice && synth.getVoices().length) {
        status.textContent = "تنبيه: لا يوجد صوت عربي مثبّت على جهازك، قد يختلف النطق.";
      }
    };

    const finish = () => { state = "idle"; index = 0; updateUi(); };

    const speakCurrent = () => {
      if (index >= chunks.length) return finish();
      const mySession = session;
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = voice ? voice.lang : "ar-SA";
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        if (mySession !== session || state !== "playing") return;
        index += 1;
        speakCurrent();
      };
      utterance.onerror = (event) => {
        if (mySession !== session) return;
        if (event.error === "canceled" || event.error === "interrupted") return;
        finish();
      };
      synth.speak(utterance);
    };

    // تشغيل / استئناف
    const play = () => {
      if (state === "playing") return;
      if (state === "idle") { chunks = splitIntoChunks(getText()); index = 0; }
      if (!chunks.length) return;
      synth.cancel();
      session += 1;
      state = "playing";
      updateUi();
      setTimeout(speakCurrent, 60);
    };

    // إيقاف مؤقت: نحفظ موضع المقطع الحالي ونستأنف منه (أكثر ثباتاً بين المتصفحات)
    const pause = () => {
      if (state !== "playing") return;
      session += 1;
      state = "paused";
      synth.cancel();
      updateUi();
    };

    const stop = () => {
      session += 1;
      state = "idle";
      index = 0;
      synth.cancel();
      updateUi();
    };

    playBtn.addEventListener("click", play);
    pauseBtn.addEventListener("click", pause);
    stopBtn.addEventListener("click", stop);
    window.addEventListener("pagehide", () => synth.cancel());
    updateUi();
  };

  /* --- أزرار المشاركة ونسخ الرابط --- */
  const initShare = (title, url) => {
    const copyBtn = $("#copy-link-btn");
    const whatsapp = $("#share-whatsapp");
    const telegram = $("#share-telegram");

    if (whatsapp) whatsapp.href = `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`;
    if (telegram) telegram.href = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;

    copyBtn && copyBtn.addEventListener("click", async () => {
      const ok = await copyText(url);
      showToast(ok ? "تم نسخ الرابط ✓" : "تعذّر نسخ الرابط");
    });
  };

  /* --- سلسلة المقالات (Article Series) ---
     تقرأ series و seriesPart من المقال الحالي، تجلب مقالات السلسلة نفسها،
     ترتّبها تصاعدياً حسب رقم الجزء، ثم تبني: العنوان + السابق/التالي + قائمة الأجزاء. */
  const initSeries = async (post) => {
    const box = $("#series-box");
    if (!box || !post.series) return;

    // جلب كل المقالات ثم تصفية مقالات السلسلة نفسها (مقارنة الاسم بدون حساسية للحالة)
    const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
    let parts = [];
    try {
      parts = (await fetchPostsList()).filter((p) => p.series && sameName(p.series, post.series));
    } catch (e) { parts = []; }

    // التأكد من وجود المقال الحالي (مثلاً لو كان مسودة أو الفهرس لم يُحدَّث بعد)
    if (!parts.some((p) => p.slug === post.slug)) parts.push(post);

    // الترتيب التصاعدي حسب رقم الجزء؛ من بلا رقم يأتي أخيراً مرتباً بالتاريخ
    parts.sort((a, b) => {
      const pa = a.seriesPart ?? Infinity;
      const pb = b.seriesPart ?? Infinity;
      if (pa !== pb) return pa - pb;
      return new Date(a.date) - new Date(b.date);
    });

    const currentIndex = parts.findIndex((p) => p.slug === post.slug);
    const prev = parts[currentIndex - 1] || null;
    const next = parts[currentIndex + 1] || null;
    const urlFor = (p) => `post.html?slug=${encodeURIComponent(p.slug)}`;
    const partLabel = (p, i) => `الجزء ${p.seriesPart ?? i + 1}: ${p.title}`;

    // زر تنقل: رابط فعلي إن وُجد الجزء، وإلا زر معطّل
    // (في الواجهة العربية RTL: «السابق» على اليمين و«التالي» على اليسار تلقائياً)
    const navButton = (target, kind) => {
      const label = kind === "prev" ? "→ الجزء السابق" : "الجزء التالي ←";
      return target
        ? el("a", { class: `series-nav series-nav--${kind}`, href: urlFor(target), rel: kind, title: target.title, text: label })
        : el("span", { class: `series-nav series-nav--${kind} is-disabled`, "aria-disabled": "true", text: label });
    };

    // قائمة الأجزاء المنسدلة (select أصلي لسهولة الوصول ودعم الهواتف)
    const select = el("select", { class: "series-select", id: "series-select", "aria-label": "اختر جزءاً من السلسلة" });
    parts.forEach((p, i) => {
      select.append(el("option", { value: p.slug, text: partLabel(p, i), selected: i === currentIndex }));
    });
    select.addEventListener("change", () => {
      if (select.value && select.value !== post.slug) window.location.href = urlFor({ slug: select.value });
    });

    box.replaceChildren(
      el("div", { class: "series-head" },
        el("span", { class: "series-kicker", text: "📚 سلسلة مقالات" }),
        el("h2", { class: "series-title", text: post.series }),
        el("span", { class: "series-progress", text: `الجزء ${currentIndex + 1} من ${parts.length}` })
      ),
      el("div", { class: "series-controls" },
        navButton(prev, "prev"),
        el("label", { class: "series-select-wrap", for: "series-select" },
          el("span", { class: "visually-hidden", text: "قائمة أجزاء السلسلة" }),
          select
        ),
        navButton(next, "next")
      )
    );
    box.hidden = false;
  };

  /* --- زر التحميل الموحّد (يتكيّف مع نوع الملف) --- */
  const renderDownload = (post) => {
    const box = $("#download-box");
    if (!box || !post.download_file) return;

    const fileUrl = assetUrl(post.download_file);
    const ext = (fileUrl.split("?")[0].split(".").pop() || "").toLowerCase();
    const type = DOWNLOAD_TYPES[ext] || DOWNLOAD_TYPES._default;

    box.replaceChildren(
      el("div", { class: "download-icon", "aria-hidden": "true", text: type.icon }),
      el("div", { class: "download-info" },
        el("strong", { text: post.download_label || type.label }),
        el("span", { text: type.label })
      ),
      el("a", { class: "btn btn-primary", href: fileUrl, download: true, text: `⬇️ ${type.action}` })
    );

    // تفاعل إضافي حسب النوع
    if (type.openInTab) {
      box.append(el("a", { class: "btn", href: fileUrl, target: "_blank", rel: "noopener", text: "👁️ فتح" }));
    }
    if (type.media) {
      const toggleBtn = el("button", { class: "btn", type: "button", text: type.media === "audio" ? "▶️ تشغيل" : "▶️ مشاهدة" });
      let player = null;
      toggleBtn.addEventListener("click", () => {
        if (!player) {
          player = el(type.media, { controls: true, preload: "none", src: fileUrl, style: "width:100%;margin-top:12px;flex-basis:100%" });
          box.append(player);
        }
        player.play && player.play().catch(() => {});
      });
      box.append(toggleBtn);
    }
    box.hidden = false;
  };

  /* --- التشغيل الرئيسي لصفحة المقال --- */
  const initPost = async () => {
    const loading = $("#post-loading");
    const article = $("#post-article");
    const slug = getParams().get("slug") || "";

    const showError = (message) => { loading.textContent = message; loading.hidden = false; };

    // حماية: السماح بحروف وأرقام وشرطات فقط (منع مسارات مثل ../)
    if (!/^[\w؀-ۿ-]+$/.test(slug)) return showError("المقال المطلوب غير موجود.");

    let raw;
    try {
      const response = await fetch(`${SITE_CONFIG.postsPath}/${encodeURIComponent(slug)}.md`);
      if (!response.ok) throw new Error("not found");
      raw = await response.text();
    } catch (e) {
      return showError("تعذّر العثور على هذا المقال.");
    }

    const { data, body } = parseFrontMatter(raw);
    const post = normalizePost(slug, data);
    const section = getSection(post.category);

    // تعبئة رأس المقال
    const categoryLink = $("#post-category");
    categoryLink.textContent = section ? `${section.icon} ${section.name}` : "عام";
    categoryLink.href = section ? `index.html?cat=${section.id}` : "index.html";
    $("#post-title").textContent = post.title;

    const dateEl = $("#post-date");
    dateEl.textContent = formatDate(post.date);
    dateEl.setAttribute("datetime", post.date);

    if (post.thumbnail) {
      const cover = $("#post-cover");
      cover.append(el("img", { src: assetUrl(post.thumbnail), alt: `صورة غلاف مقال: ${post.title}`, loading: "lazy" }));
      cover.hidden = false;
    }

    // نص المقال
    const content = $("#post-content");
    renderMarkdown(body, content, post.title);

    // وقت القراءة
    const info = calcReadingTime(content.textContent);
    $("#reading-time").textContent = `وقت القراءة: ${info.minutes} دقيقة`;

    // السيو و Schema
    const canonical = new URL(window.location.pathname, window.location.origin);
    canonical.searchParams.set("slug", slug);
    const imageUrl = post.thumbnail ? new URL(assetUrl(post.thumbnail), window.location.href).href : "";
    updateSeo(post, canonical.href, imageUrl);
    injectSchema(post, { ...info, url: canonical.href, image: imageUrl });

    // الأدوات
    renderDownload(post);
    initSeries(post);   // شريط السلسلة (لا يعطّل بقية الصفحة إن فشل)
    const adBox = $("#ad-bottom");
    if (adBox && !post.show_ad) adBox.hidden = true;   // show_ad من لوحة التحكم

    initShare(post.title, canonical.href);
    initTextToSpeech(() => {
      const clone = content.cloneNode(true);
      clone.querySelectorAll("pre, code, script, .copy-btn").forEach((n) => n.remove());
      return `${post.title}. ${clone.textContent}`;
    });

    // إظهار المقال
    loading.hidden = true;
    article.hidden = false;
    initProgressBar(article);
  };

  /* =======================================================
     8. أزرار مشاركة المدونة نفسها (صفحة «من نحن»)
        تعمل على أي عنصر يحمل data-share="whatsapp|telegram" أو data-copy-site
     ======================================================= */
  const initSiteShare = () => {
    const siteUrl = new URL("./", window.location.href).href;       // رابط جذر المدونة الحالي
    const text = `${SITE_CONFIG.siteName} — ${SITE_CONFIG.tagline}`;

    document.querySelectorAll("[data-share]").forEach((link) => {
      link.href = link.dataset.share === "telegram"
        ? `https://t.me/share/url?url=${encodeURIComponent(siteUrl)}&text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(`${text}\n${siteUrl}`)}`;
    });

    document.querySelectorAll("[data-copy-site]").forEach((button) => {
      button.addEventListener("click", async () => {
        showToast((await copyText(siteUrl)) ? "تم نسخ رابط المدونة ✓" : "تعذّر نسخ الرابط");
      });
    });
  };

  /* =======================================================
     9. PWA: تسجيل Service Worker + تنبيه انقطاع الاتصال
        يعمل على https أو localhost فقط (شرط المتصفحات).
     ======================================================= */
  const initPwa = () => {
    if ("serviceWorker" in navigator) {
      // ننتظر load حتى لا يزاحم التسجيل تحميل الصفحة
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => { /* غير مدعوم في هذا السياق */ });
      });
    }
    window.addEventListener("offline", () => showToast("أنت غير متصل — تُعرض الصفحات المحفوظة"));
    window.addEventListener("online", () => showToast("عاد الاتصال بالإنترنت ✓"));
  };

  /* =======================================================
     التشغيل
     ======================================================= */
  const page = document.body.dataset.page;
  initTheme();
  initMenu();
  initBackToTop();
  setYear();
  initPwa();
  initSiteShare();
  if (page === "home") initHome();
  if (page === "post") initPost();
});
