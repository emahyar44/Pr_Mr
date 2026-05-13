const express = require('express');
const app = express();

// محدودیت‌ها
const LIMITS = {
  dailyRequests: 100000,
  dailyBandwidth: 3 * 1024 * 1024 * 1024  // 3 GB
};

// آمار فعلی
let currentStats = {
  requests: 0,
  bandwidth: 0,
  lastReset: Date.now()
};

// ریسِت هر ۲۴ ساعت
function checkAndReset() {
  const now = Date.now();
  const hoursPassed = (now - currentStats.lastReset) / (1000 * 60 * 60);
  if (hoursPassed >= 24) {
    currentStats = {
      requests: 0,
      bandwidth: 0,
      lastReset: now
    };
    console.log('✅ محدودیت روزانه ریست شد');
  }
}

// صفحه اصلی (راهنما و آمار)
app.get('/', (req, res) => {
  checkAndReset();
  res.send(`
    <h3>🚀 پروکسی فعال با محدودیت</h3>
    <p>روش استفاده: <code>${req.protocol}://${req.get('host')}/https://example.com</code></p>
    <hr>
    📊 <strong>آمار امروز:</strong><br>
    - درخواست‌ها: ${currentStats.requests} / ${LIMITS.dailyRequests}<br>
    - پهنای باند مصرفی: ${(currentStats.bandwidth / (1024 * 1024)).toFixed(2)} MB / ${(LIMITS.dailyBandwidth / (1024 * 1024 * 1024)).toFixed(0)} GB
  `);
});

// پروکسی اصلی (همه درخواست‌های دیگه)
app.use(async (req, res) => {
  checkAndReset();

  // چک محدودیت درخواست
  if (currentStats.requests >= LIMITS.dailyRequests) {
    return res.status(429).send('❌ محدودیت ۱۰۰,۰۰۰ درخواست در روز تمام شد. فردا امتحان کن.');
  }

  let targetUrl = req.url.substring(1);
  
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    return res.status(400).send('❌ آدرس نامعتبر. باید با http:// یا https:// شروع بشه.');
  }

  try {
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Accept': req.headers['accept'] || '*/*',
        ...(req.headers['cookie'] && { 'Cookie': req.headers['cookie'] })
      }
    });

    const data = await response.text();
    const contentLength = Buffer.byteLength(data, 'utf8');

    // چک محدودیت حجم
    if (currentStats.bandwidth + contentLength > LIMITS.dailyBandwidth) {
      return res.status(429).send('❌ محدودیت ۳ گیگابایت در روز تمام شد. فردا امتحان کن.');
    }

    // آپدیت آمار
    currentStats.requests++;
    currentStats.bandwidth += contentLength;

    res.set('Content-Type', response.headers.get('content-type'));
    res.send(data);

  } catch (err) {
    res.status(500).send(`⚠️ خطای پروکسی: ${err.message}`);
  }
});

app.listen(3000, () => console.log('🔥 Proxy with limits: 100k req/day, 3GB/day'));
