const express = require('express');
const app = express();

// محدودیت‌ها
const LIMITS = {
  dailyRequests: 100000,  // 100 هزار ریکوئست در روز
  dailyBandwidth: 3 * 1024 * 1024 * 1024  // 3 گیگابایت
};

// ذخیره مصرف فعلی (توی حافظه موقتی)
let currentStats = {
  requests: 0,
  bandwidth: 0,
  lastReset: Date.now()
};

// تابع ریست کردن هر 24 ساعت
function checkAndReset() {
  const now = Date.now();
  const hoursPassed = (now - currentStats.lastReset) / (1000 * 60 * 60);
  if (hoursPassed >= 24) {
    currentStats = {
      requests: 0,
      bandwidth: 0,
      lastReset: now
    };
    console.log('✅ محدودیت‌های روزانه ریست شد');
  }
}

// میدلور برای چک کردن محدودیت‌ها
app.use((req, res, next) => {
  checkAndReset();
  
  if (currentStats.requests >= LIMITS.dailyRequests) {
    return res.status(429).send('❌ محدودیت روزانه درخواست (100,000) تمام شد. فردا امتحان کن.');
  }
  
  next();
});

// پروکسی اصلی
app.all('*', async (req, res) => {
  try {
    let targetUrl = req.url.substring(1);
    
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return res.status(400).send(`
        <h3>🚀 پروکسی فعال است</h3>
        <p>روش استفاده:</p>
        <code>${req.protocol}://${req.get('host')}/https://example.com</code>
        <br><br>
        📊 آمار امروز:<br>
        - درخواست‌ها: ${currentStats.requests} / ${LIMITS.dailyRequests}<br>
        - پهنای باند: ${(currentStats.bandwidth / (1024 * 1024)).toFixed(2)} / ${(LIMITS.dailyBandwidth / (1024 * 1024 * 1024)).toFixed(0)} GB
      `);
    }
    
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'User-Agent': req.headers['user-agent'],
        'Accept': req.headers['accept'],
        'Accept-Language': req.headers['accept-language'],
        ...(req.headers['cookie'] && { 'Cookie': req.headers['cookie'] })
      }
    });
    
    const data = await response.text();
    const contentLength = Buffer.byteLength(data, 'utf8');
    
    // آپدیت آمار
    currentStats.requests++;
    currentStats.bandwidth += contentLength;
    
    // چک کردن محدودیت حجم بعد از درخواست
    if (currentStats.bandwidth >= LIMITS.dailyBandwidth) {
      console.log('⚠️ محدودیت حجم روزانه پر شد');
    }
    
    res.set('Content-Type', response.headers.get('content-type'));
    res.send(data);
    
  } catch(err) {
    res.status(500).send(`Proxy error: ${err.message}`);
  }
});

app.listen(3000, () => console.log('🔥 Proxy running with limits: 100k req/day, 3GB/day'));
