// src/service/articleService.js — Crawl nội dung bài báo
// Strategy: decode Google News URL → axios + cheerio (nhanh) → fallback Puppeteer
const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
};

const MAX_CHARS = 8000;

// ─── Decode Google News redirect URL → URL bài báo thật ──────────────────────
async function resolveGoogleNewsUrl(url) {
  if (!url.includes('news.google.com')) return url;
  try {
    // Follow redirect để lấy URL thật
    const res = await axios.get(url, {
      timeout: 8000,
      headers: HEADERS,
      maxRedirects: 5,
      validateStatus: () => true, // chấp nhận mọi status
    });
    // Lấy URL sau khi redirect
    const finalUrl = res.request?.res?.responseUrl || res.config?.url;
    if (finalUrl && !finalUrl.includes('news.google.com')) {
      console.log(`🔗 [ARTICLE] Resolved: ${finalUrl.slice(0, 80)}`);
      return finalUrl;
    }
  } catch (e) {
    console.log(`⚠️ [ARTICLE] Could not resolve Google News URL: ${e.message}`);
  }
  return url;
}

// ─── Extract text từ HTML đã load ────────────────────────────────────────────
function extractContent($) {
  $('script, style, nav, header, footer, aside, iframe, noscript, .ad, .ads, .advertisement, .cookie, .popup, .modal, .sidebar, .related').remove();

  const title = $('h1').first().text().trim() || $('title').text().trim();

  const selectors = [
    'article',
    '[class*="article-body"]', '[class*="article-content"]',
    '[class*="story-body"]',   '[class*="post-content"]',
    '[class*="entry-content"]','[class*="caas-body"]',
    'main', '.content',
  ];

  let content = '';
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      content = el.find('p').map((_, p) => $(p).text().trim()).get().filter(t => t.length > 40).join('\n');
      if (content.length > 200) break;
    }
  }

  if (content.length < 200) {
    content = $('p').map((_, p) => $(p).text().trim()).get().filter(t => t.length > 40).join('\n');
  }

  return { title, content };
}

// ─── Attempt 1: axios (nhanh, ~1s) ───────────────────────────────────────────
async function fetchWithAxios(url) {
  const res = await axios.get(url, { timeout: 10000, headers: HEADERS });
  const $ = cheerio.load(res.data);
  return extractContent($);
}

// ─── Attempt 2: Puppeteer (chậm hơn ~3-5s, bypass Cloudflare cơ bản) ────────
let browserInstance = null;

async function getBrowser() {
  if (browserInstance && browserInstance.connected) return browserInstance;
  const puppeteer = require('puppeteer');
  browserInstance = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
  });
  return browserInstance;
}

async function fetchWithPuppeteer(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(HEADERS['User-Agent']);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Dùng networkidle2 thay vì domcontentloaded để đợi AJAX load xong
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });

    // Đợi thêm để các widget/table render xong
    await new Promise(r => setTimeout(r, 2500));

    // Scroll xuống để trigger lazy load nếu có
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await new Promise(r => setTimeout(r, 1000));

    const html = await page.content();
    const $ = cheerio.load(html);

    // Thêm selector đặc thù cho trang tài chính VN
    const vnSelectors = [
      'table',           // bảng giá
      '[class*="price"]',
      '[class*="gold"]',
      '[class*="bang-gia"]',
      '[class*="data-table"]',
    ];

    let tableContent = '';
    for (const sel of vnSelectors) {
      const el = $(sel).first();
      if (el.length) {
        // Lấy text từ table rows
        const rows = el.find('tr').map((_, tr) => {
          return $(tr).find('td, th').map((_, td) => $(td).text().trim()).get().filter(Boolean).join(' | ');
        }).get().filter(t => t.length > 5);
        if (rows.length > 2) {
          tableContent = rows.join('\n');
          break;
        }
      }
    }

    const { title, content } = extractContent($);
    // Ưu tiên table content nếu có (trang giá vàng, tỷ giá...)
    const finalContent = tableContent.length > content.length ? tableContent : content;

    return { title, content: finalContent };
  } finally {
    await page.close();
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
async function fetchArticleContent(url) {
  // Bước 0: resolve Google News redirect → URL thật
  const resolvedUrl = await resolveGoogleNewsUrl(url);

  // Attempt 1: axios
  try {
    const { title, content } = await fetchWithAxios(resolvedUrl);
    if (content.length > 200) {
      console.log(`✅ [ARTICLE] axios OK: ${resolvedUrl.slice(0, 60)}`);
      return {
        success: true, title,
        content: content.slice(0, MAX_CHARS),
        truncated: content.length > MAX_CHARS,
        method: 'axios', url: resolvedUrl,
      };
    }
    throw new Error('Content too short, trying Puppeteer');
  } catch (axiosErr) {
    const status = axiosErr.response?.status;
    if (status === 401 || status === 402) {
      return { success: false, error: 'Bài báo yêu cầu đăng nhập/trả phí. Chỉ có thể phân tích từ tiêu đề.', url: resolvedUrl };
    }
    console.log(`⚠️ [ARTICLE] axios failed (${status || axiosErr.message}), trying Puppeteer...`);
  }

  // Attempt 2: Puppeteer
  try {
    const { title, content } = await fetchWithPuppeteer(resolvedUrl);
    if (content.length > 200) {
      console.log(`✅ [ARTICLE] Puppeteer OK: ${resolvedUrl.slice(0, 60)}`);
      return {
        success: true, title,
        content: content.slice(0, MAX_CHARS),
        truncated: content.length > MAX_CHARS,
        method: 'puppeteer', url: resolvedUrl,
      };
    }
    return { success: false, error: 'Không thể trích xuất nội dung (trang có thể yêu cầu đăng nhập).', url: resolvedUrl };
  } catch (puppeteerErr) {
    console.error(`❌ [ARTICLE] Puppeteer failed: ${puppeteerErr.message}`);
    return { success: false, error: `Không thể tải bài báo: ${puppeteerErr.message}`, url: resolvedUrl };
  }
}

module.exports = { fetchArticleContent };
