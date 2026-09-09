const config = require('./config');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// The cookie banner is a Sourcepoint dialog rendered inside an iframe served
// from consent.formula1.com. Click "Accept all" if it shows up; if it never
// appears (already consented, or not shown in this region) just carry on.
const acceptCookieConsent = async (page, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const frame = page.frames().find(f => f.url().includes('consent.formula1.com'));
        if (frame) {
            const clicked = await frame.evaluate(() => {
                /* global document */
                const btn = [...document.querySelectorAll('button')]
                    .find(b => /accept all/i.test(b.title || b.getAttribute('aria-label') || b.innerText || ''));
                if (btn) { btn.click(); return true; }
                return false;
            }).catch(() => false);
            if (clicked) {
                await sleep(1500);
                return true;
            }
        }
        await sleep(500);
    }
    return false;
};

const getRandomInt = (min, max) => {
    return Math.floor(Math.random() * (max - min)) + min;
};

const getF1tvToken = async (user, pass) => {
    const debug = false;
    const browser = await puppeteer.launch({
        headless: config.HEADLESS,
        args: [
            '--disable-web-security',
            '--window-size=1400,900',
            '--no-sandbox'
        ],
        defaultViewport: {
            width: 1400,
            height: 900
        }
    });
    const page = await browser.newPage();

    await page.goto(config.BASE_URL, { timeout: config.TOKEN_NETWORK_TIMEOUT, waitUntil: 'networkidle0' });
    if (debug) await getScreenshot(page, '01');
    await Promise.all([
        page.$eval('a[title="Sign in"]', el => el.click()),
        //getScreenshot(page, '01_sign-in'),
        page.waitForNavigation({ timeout: config.TOKEN_NETWORK_TIMEOUT, waitUntil: 'networkidle0' })
        //getScreenshot(page, '01_sign-in-waitfornav')
    ]);
    if (debug) await getScreenshot(page, '02');
    await acceptCookieConsent(page);
    await page.waitForSelector('#loginform input[name="Login"]', { timeout: config.TOKEN_NETWORK_TIMEOUT });
    if (debug) await getScreenshot(page, '03');
    await sleep(getRandomInt(1000, 3000));
    await page.type('#loginform input[name="Login"]', user);
    if (debug) await getScreenshot(page, '04');
    await sleep(getRandomInt(1000, 3000));
    if (debug) await getScreenshot(page, '05');
    await page.type('#loginform input[name="Password"]', pass);
    if (debug) await getScreenshot(page, '06');
    await sleep(getRandomInt(1000, 3000));
    if (debug) await getScreenshot(page, '07');
    await Promise.all([
        page.$eval('#loginform button.btn.btn-primary', el => el.click()),
        page.waitForNavigation({ timeout: config.TOKEN_NETWORK_TIMEOUT, waitUntil: 'networkidle0' })
    ]);

    const cookies = await browser.cookies();
    const loginSession = cookies.find(el => el.name == 'entitlement_token');
    if (!loginSession) {
        await browser.close();
        throw new Error(`Login did not produce an entitlement_token cookie (landed on ${page.url()}). Check username/password.`);
    }

    if (debug) await getScreenshot(page, '08');
	
    await browser.close();

    return loginSession.value;
}

const getScreenshot = async (page, section='default') => {
    return page.screenshot({
        path: `chromium_page_${section}.png`
    });
};

module.exports = {
    getF1tvToken
}
