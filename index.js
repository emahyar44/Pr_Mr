const express = require('express');
const os = require('os');
const app = express();

// ================== تنظیمات پایه ==================
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ================== محدودیت‌ها ==================
const LIMITS = {
  dailyRequests: 100000,  // 100 هزار ریکوئست در روز
  dailyBandwidth: 3 * 1024 * 1024 * 1024  // 3 گیگابایت
};

// ================== ذخیره آمار کاربران ==================
let userStats = new Map();

// ریست خودکار هر ۲۴ ساعت
function checkAndReset() {
  const now = Date.now();
  for (let [ip, data] of userStats.entries()) {
    if (now - data.lastReset > 24 * 60 * 60 * 1000) {
      userStats.delete(ip);
    }
  }
}

// میدلور محدودیت
app.use((req, res, next) => {
  checkAndReset();
  const userIp = req.ip;
  
  let stats = userStats.get(userIp);
  if (!stats) {
    stats = { requests: 0, bandwidth: 0, lastReset: Date.now() };
    userStats.set(userIp, stats);
  }

  if (stats.requests >= LIMITS.dailyRequests) {
    return res.status(429).send('❌ محدودیت روزانه درخواست (100,000) برای IP شما تمام شد.');
  }
  
  req.userStats = stats;
  next();
});

// ================== صفحه آمار ==================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>🚀 پروکسی شخصی</title><meta charset="UTF-8"></head>
    <body style="font-family: monospace; padding: 20px; direction: ltr; text-align: left;">
      <h2>🚀 پروکسی فعال با محدودیت بر اساس IP</h2>
      <p>روش استفاده مستقیم: <code>${req.protocol}://${req.get('host')}/https://example.com</code></p>
      <hr>
      📊 <strong>آمار IP شما امروز:</strong><br>
      - درخواست‌ها: ${req.userStats.requests} / ${LIMITS.dailyRequests}<br>
      - پهنای باند مصرفی: ${(req.userStats.bandwidth / (1024 * 1024)).toFixed(2)} MB / ${(LIMITS.dailyBandwidth / (1024 * 1024 * 1024)).toFixed(0)} GB
      <hr>
      <p><a href="/settings">🔧 مشاهده تنظیمات پروکسی</a></p>
    </body>
    </html>
  `);
});

// ================== صفحه تنظیمات (پورت و آدرس) ==================
app.get('/settings', (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  
  // گرفتن IP سرور
  let serverIp = 'نامشخص';
  const networkInterfaces = os.networkInterfaces();
  for (const iface of Object.values(networkInterfaces)) {
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        serverIp = alias.address;
        break;
      }
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>🔧 تنظیمات پروکسی</title><meta charset="UTF-8"></head>
    <body style="font-family: monospace; padding: 20px; direction: ltr; text-align: left;">
      <h2>🔧 تنظیمات اتصال به پروکسی شما</h2>
      <p><strong>Service ID:</strong> <code>srv-d82cko9j2pic739ne2kg</code></p>
      <hr>
      <table border="1" cellpadding="8" style="border-collapse: collapse;">
        <tr><td><strong>🌐 آدرس پروکسی (Proxy Address):</strong></td><td><code>${host}</code></td></tr>
        <tr><td><strong>🔌 پورت (Port):</strong></td><td><code>${PORT}</code></td></tr>
        <tr><td><strong>🔒 پروتکل (Protocol):</strong></td><td><code>${protocol}</code></td></tr>
        <tr><td><strong>🌍 IP سرور (Server IP):</strong></td><td><code>${serverIp}</code></td></tr>
        <tr><td><strong>📡 آدرس کامل (Full URL):</strong></td><td><code>${protocol}://${host}</code></td></tr>
      </table>
      <hr>
      <h3>⚙️ نحوه تنظیم در مرورگر:</h3>
      <ol>
        <li>تنظیمات پروکسی ویندوز/مرورگر را باز کنید.</li>
        <li><strong>آدرس (Address):</strong> <code>${host}</code></li>
        <li><strong>پورت (Port):</strong> <code>${PORT}</code></li>
        <li>نوع پروکسی: <strong>HTTP</strong></li>
        <li>ذخیره کنید و از آن استفاده کنید.</li>
      </ol>
      <p>✅ اکنون می‌توانید هر سایتی را بدون نیاز به افزودن دستی آدرس، مستقیماً مرور کنید.</p>
      <hr>
      <p><a href="/">📊 بازگشت به صفحه آمار</a></p>
    </body>
    </html>
  `);
});

// ================== پروکسی اصلی ==================
app.use(async (req, res) => {
  let targetUrl = req.url.substring(1);
  
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    return res.status(400).send(`
      <h3>❌ آدرس نامعتبر</h3>
      <p>آدرس باید با <code>http://</code> یا <code>https://</code> شروع بشه.</p>
      <p>مثال: <code>${req.protocol}://${req.get('host')}/https://www.google.com</code></p>
      <p><a href="/">🔙 بازگشت به صفحه اصلی</a></p>
    `);
  }

  try {
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0'
      }
    });

    const data = await response.text();
    const contentLength = Buffer.byteLength(data, 'utf8');

    // چک محدودیت حجم
    if (req.userStats.bandwidth + contentLength > LIMITS.dailyBandwidth) {
      return res.status(429).send('❌ محدودیت ۳ گیگابایت روزانه برای IP شما تمام شد. فردا امتحان کن.');
    }
    
    // آپدیت آمار
    req.userStats.requests++;
    req.userStats.bandwidth += contentLength;

    res.set('Content-Type', response.headers.get('content-type'));
    res.send(data);
    
  } catch (err) {
    res.status(500).send(`
      <h3>⚠️ خطای پروکسی</h3>
      <p>${err.message}</p>
      <p><a href="/">🔙 بازگشت به صفحه اصلی</a></p>
    `);
  }
});

// ================== راه‌اندازی سرور ==================
app.listen(PORT, () => {
  console.log(`🔥 Proxy running on port ${PORT}`);
  console.log(`📊 Settings page: /settings`);
  console.log(`📈 Stats page: /`);
});
