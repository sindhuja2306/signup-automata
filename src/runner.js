// @ts-nocheck
const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs-extra");
const path = require("path");
const { submitSignup } = require("./signup");

// Use stealth plugin to avoid detection
chromium.use(StealthPlugin());

const args = process.argv.slice(2);
const referralCode = args[0];
const targetSignups = parseInt(args[1]) || 1000;
const startPhone = args[2] || "5000000001";
const ratePerMinute = Number(process.env.RATE_PER_MINUTE || 10);
if (!Number.isFinite(ratePerMinute) || ratePerMinute <= 0) {
  throw new Error("RATE_PER_MINUTE must be a positive number");
}
const delayBetweenAttempts = 60000 / ratePerMinute;

const resultsPath = path.join(__dirname, "../results/results.json");
fs.ensureDirSync(path.join(__dirname, "../results"));
fs.ensureDirSync(path.join(__dirname, "../screenshots"));
let results = [];

let stats = {
  successful: 0,
  failed: 0,
  total: 0,
  target: targetSignups,
  referralCode: referralCode,
  progress: 0,
  currentPhone: startPhone,
  lastPhone: startPhone,
  isRunning: true
};

function generatePhone(index) {
  const clean = startPhone.replace(/\D/g, "");
  const num = BigInt(clean) + BigInt(index - 1);
  return num.toString().padStart(clean.length, "0");
}

function sendProgress() {
  if (process.send) {
    process.send({ type: "progress", stats });
  }
}

function sendLog(type, message) {
  if (process.send) {
    process.send({ type: "log", logType: type, message });
  }
}

function saveResults() {
  fs.ensureDirSync(path.join(__dirname, "../results"));
  fs.writeJsonSync(resultsPath, results, { spaces: 2 });
}

// Load existing results
try {
  if (fs.existsSync(resultsPath)) {
    results = fs.readJsonSync(resultsPath);
  }
} catch (e) {}

async function main() {
  console.log(`🚀 Starting: ${referralCode}`);
  console.log(`📱 From: ${startPhone}, Target: ${targetSignups}`);

  sendLog("info", `🚀 Starting for referral: ${referralCode}`);
  sendLog("info", `📱 Phone: ${startPhone} → ${targetSignups} signups`);

  // Launch browser with stealth
  const browser = await chromium.launch({ 
    // Cloud servers do not provide a desktop display. Set HEADLESS=false only
    // when debugging locally.
    headless: process.env.HEADLESS !== "false",
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const signupUrl = process.env.SIGNUP_URL;
  const homeUrl = process.env.HOME_URL;
  if (!signupUrl || !homeUrl || signupUrl.includes("example.com") || homeUrl.includes("example.com")) {
    throw new Error("Configure SIGNUP_URL and HOME_URL in .env before starting the runner");
  }

  for (let i = 1; i <= targetSignups; i++) {
    if (!stats.isRunning) break;

    const phone = generatePhone(i);
    stats.currentPhone = phone;
    stats.lastPhone = phone;
    stats.total = i - 1;
    stats.progress = Math.round(((stats.successful + stats.failed) / targetSignups) * 100);

    console.log(`\n[${i}/${targetSignups}] ${phone}`);
    sendProgress();

    // Create new context with random viewport
    const context = await browser.newContext({
      viewport: { 
        width: 1920 + Math.floor(Math.random() * 100), 
        height: 1080 + Math.floor(Math.random() * 100) 
      },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();

    try {
      // Navigate to signup page
      console.log(`   🌐 Loading: ${signupUrl}`);
      
      await page.goto(signupUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });

      // Wait for page to be ready
      await page.waitForSelector('form, input', { timeout: 10000 });
      await page.waitForTimeout(500);

      // Debug: Get page info
      const title = await page.title();
      console.log(`   📄 Page Title: ${title}`);
      console.log(`   📄 Current URL: ${page.url()}`);

      // Submit the form
      const submitResult = await submitSignup(page, {
        name: process.env.SIGNUP_NAME || "Test User",
        phone: phone,
        place: process.env.SIGNUP_PLACE || "Test City",
        password: process.env.SIGNUP_PASSWORD || "Test@12345",
        referral: referralCode
      });

      console.log(`   📤 Submit result: ${submitResult}`);

      // ========== WAIT FOR NAVIGATION ==========
      console.log(`   ⏳ Waiting for page to process submission...`);
      await page.waitForTimeout(3000);

      // ========== CHECK SUCCESS ==========
      let isSuccess = false;
      let finalUrl = page.url();
      console.log(`   📄 Final URL: ${finalUrl}`);

      // Method 1: Check if URL changed from signup page
      if (finalUrl !== signupUrl && !finalUrl.includes('signup')) {
        isSuccess = true;
        console.log(`   ✅ URL changed to: ${finalUrl}`);
      }

      // Method 2: Check if redirected to home/dashboard
      if (!isSuccess && (finalUrl.includes('home') || finalUrl.includes('dashboard') || finalUrl.includes('account') || finalUrl.includes('profile'))) {
        isSuccess = true;
        console.log(`   ✅ Redirected to: ${finalUrl}`);
      }

      // Method 3: Check page content for success indicators
      if (!isSuccess) {
        const content = await page.content();
        // Do not use generic words such as "account" or "home": they are
        // already present on the signup page ("Create your account", nav).
        const successWords = ['registration successful', 'signup successful', 'welcome', 'thank you', 'dashboard', 'profile'];
        for (const word of successWords) {
          if (content.toLowerCase().includes(word)) {
            isSuccess = true;
            console.log(`   ✅ Found "${word}" in page content`);
            break;
          }
        }
      }

      // Method 4: Check for success elements
      if (!isSuccess) {
        const selectors = [
          '.success',
          '.welcome',
          '.dashboard',
          '.profile',
          '.home-page',
          '.alert-success',
          '.success-message',
          '[class*="success"]',
          '[class*="welcome"]',
          '#dashboard',
          '#registration-success'
        ];
        for (const selector of selectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              isSuccess = true;
              console.log(`   ✅ Found element: ${selector}`);
              break;
            }
          } catch (e) {}
        }
      }

      // Check for error messages
      if (!isSuccess) {
        const content = await page.content();
        const errorWords = ['error', 'invalid', 'incorrect', 'wrong', 'failed'];
        let errorMsg = "Unknown error";
        for (const word of errorWords) {
          if (content.toLowerCase().includes(word)) {
            // Try to extract error message
            try {
              const errorElement = await page.$('.error, .alert-danger, .invalid, .error-message');
              if (errorElement) {
                errorMsg = await errorElement.textContent();
              }
            } catch (e) {}
            console.log(`   ⚠️ Found error: ${word} - ${errorMsg}`);
            break;
          }
        }
      }

      // Take screenshot after submission
      await page.screenshot({ 
        path: `screenshots/after-${phone}.png`,
        fullPage: true 
      });

      if (isSuccess) {
        stats.successful++;
        results.push({ 
          phone, 
          status: "SUCCESS", 
          timestamp: new Date().toISOString(),
          url: finalUrl
        });
        console.log(`   ✅ SUCCESS (${stats.successful}/${targetSignups})`);
        sendLog("success", `✅ ${stats.successful}/${targetSignups} - ${phone}`);
        
        // Take success screenshot
        await page.screenshot({ 
          path: `screenshots/success-${phone}.png`,
          fullPage: true 
        });
        console.log(`   📸 Success screenshot saved`);
      } else {
        throw new Error("Signup failed - no success indicator found");
      }

      if (stats.successful % 10 === 0) {
        saveResults();
        sendLog("info", `💾 Saved ${stats.successful} results`);
      }

    } catch (error) {
      stats.failed++;
      
      console.log(`   ❌ ERROR: ${error.message}`);
      
      // Take screenshot on failure
      try {
        const screenshotPath = path.join(__dirname, "../screenshots", `error-${phone}-${Date.now()}.png`);
        fs.ensureDirSync(path.dirname(screenshotPath));
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`   📸 Screenshot saved: ${screenshotPath}`);
      } catch (e) {}

      results.push({
        phone,
        status: "FAILED",
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      sendLog("error", `❌ ${phone} - ${error.message}`);
      
    } finally {
      await page.close();
      await context.close();
      saveResults();
    }

    await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
  }

  await browser.close();

  stats.isRunning = false;
  stats.progress = 100;

  console.log(`\n✅ Complete! Success: ${stats.successful}, Failed: ${stats.failed}`);
  sendLog("success", `✅ Complete! ${stats.successful} successful`);
  sendLog("info", `📊 Success: ${stats.successful}, Failed: ${stats.failed}`);

  if (process.send) {
    process.send({ type: "complete", stats });
  }

  process.exit(0);
}

// Handle stop signal
process.on('SIGTERM', () => {
  stats.isRunning = false;
  console.log('⏹️ Received stop signal');
  sendLog('warning', '⏹️ Stopping...');
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  sendLog('error', `❌ Uncaught Exception: ${error.message}`);
  process.exit(1);
});

main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
