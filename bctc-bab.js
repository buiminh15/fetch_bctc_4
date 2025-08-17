const axios = require('axios');
const cheerio = require('cheerio');
const { sendTelegramNotification } = require('./bot');
const { COMPANIES } = require('./constants/companies');
const { insertBCTC, filterNewNames } = require('./bctc');
const he = require('he');
console.log('📢 [bctc-cdn.js:7]', 'running');

const https = require('https');
const agent = new https.Agent({
  rejectUnauthorized: false
});

const axiosRetry = require('axios-retry');

axiosRetry.default(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // Retry nếu là network error, request idempotent, hoặc timeout
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED';
  }
});
const currentYear = new Date().getFullYear().toString();
async function fetchAndExtractData() {
  try {
    const latestPage = await getLatestPage();

    const response = await axios.get(`https://www.baca-bank.vn/SitePages/website/quan-he-co-dong.aspx?ac=QUAN%20H%E1%BB%86%20C%E1%BB%94%20%C4%90%C3%94NG&t=B%C3%A1o%20c%C3%A1o%20t%C3%A0i%20ch%C3%ADnh&y=${currentYear}&skh=&ty=&nbh=&s=QHCD&Page=${latestPage}`, {
      headers: {
        'accept': 'text/html',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      },
      timeout: 60000,
      httpsAgent: agent
    });

    const html = response.data;
    const $ = cheerio.load(html);
    // Lấy tối đa 5 báo cáo mới nhất
    const names = [];
    $('tbody tr').each((_, row) => {
      const nameRaw = $(row).find('td').eq(4).text().trim();
      const name = he.decode(nameRaw);
      names.push(name);
    });

    if (names.length === 0) {
      console.log('Không tìm thấy báo cáo tài chính nào.');
      return;
    }
    console.log('📢 [bctc-mbs.js:50]', names);
    // Lọc ra các báo cáo chưa có trong DB
    const newNames = await filterNewNames(names, COMPANIES.BAB);
    console.log('📢 [bctc-cdn.js:46]', newNames);
    if (newNames.length) {
      await insertBCTC(newNames, COMPANIES.BAB);

      // Gửi thông báo Telegram cho từng báo cáo mới
      await Promise.all(
        newNames.map(name => {
          return sendTelegramNotification(`Báo cáo tài chính của BAB ::: ${name}`);
        })
      );
      console.log(`Đã thêm ${newNames.length} báo cáo mới và gửi thông báo.`);
    } else {
      console.log('Không có báo cáo mới.');
    }
  } catch (error) {
    console.error('Error fetching HTML:', error);
    process.exit(1);
  }
}

async function getLatestPage() {
  try {

    const response = await axios.get(`https://www.baca-bank.vn/SitePages/website/quan-he-co-dong.aspx?ac=QUAN%20H%E1%BB%86%20C%E1%BB%94%20%C4%90%C3%94NG&t=B%C3%A1o%20c%C3%A1o%20t%C3%A0i%20ch%C3%ADnh&y=${currentYear}&skh=&ty=&nbh=&s=QHCD&Page=1`, {
      headers: {
        'accept': 'text/html',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      },
      timeout: 60000,
      httpsAgent: agent
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const pages = [];
    $('.paging').find('li').each((_, el) => {
      const nameRaw = $(el).text().trim();
      const page = he.decode(nameRaw);
      if (!Number.isNaN(Number(page))) {
        pages.push(Number(page));
      }
    });

    return Math.max(...pages);
  } catch (error) {
    console.error('Error fetching HTML:', error);
    process.exit(1);
  }
}
getLatestPage();
fetchAndExtractData();