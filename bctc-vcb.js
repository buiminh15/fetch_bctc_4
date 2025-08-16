const axios = require('axios');
const { sendTelegramNotification } = require('./bot');
const { COMPANIES } = require('./constants/companies');
const { insertBCTC, filterNewNames } = require('./bctc');
const cheerio = require('cheerio');
const he = require('he');
console.log('📢 [bctc-geg.js:5]', 'running');

const axiosRetry = require('axios-retry');

axiosRetry.default(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // Retry nếu là network error, request idempotent, hoặc timeout
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNABORTED';
  }
});

async function fetchAndExtractData() {
  try {
    const response = await axios.get(
      'https://vietcombank.com.vn/sxa/InvestmentApi/CustomInvesmentListResults/?l=vi-VN&s={B6BE6C41-8E0B-4EA2-B859-5BB3CD15EF38}&itemid={6B11AAA9-C7EE-4D03-BD7B-267FC7966442}&sig=investment-document&o=Updated%20Date%20Sort,Descending&v={3B4B12FE-C053-44BD-93F2-6EFAF7205EE3}&investmentdocumentchip=B%C3%A1o%20c%C3%A1o%20%C4%91%E1%BB%8Bnh%20k%E1%BB%B3',
      {
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
          'Sec-GPC': '1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          'X-Requested-Store': 'default',
          'X-Requested-With': 'XMLHttpRequest',
          'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"'
        },
        timeout: 60000
      }
    );
    // response.data là object JSON, thường có dạng { data: [ ... ], ... }
    const items = response.data?.Results || [];

    const htmls = items.map(item => item.Html);

    const htmlsText = htmls.join('');
    const $ = cheerio.load(htmlsText);
    const names = [];
    $('p').each((_, el) => {
      const nameRaw = $(el).text().trim();
      const name = he.decode(nameRaw);
      names.push(name);
    });

    if (names.length === 0) {
      console.log('Không tìm thấy báo cáo tài chính nào.');
      return;
    }
    console.log('📢 [bctc-SAF.js:50]', names);
    // Lọc ra các báo cáo chưa có trong DB
    const newNames = await filterNewNames(names, COMPANIES.VCB);
    console.log('📢 [bctc-geg.js:44]', newNames);
    if (newNames.length) {
      await insertBCTC(newNames, COMPANIES.VCB);

      // Gửi thông báo Telegram cho từng báo cáo mới;
      await Promise.all(
        newNames.map(name =>
          sendTelegramNotification(`Báo cáo tài chính của VCB::: ${name}`)
        )
      );
      console.log(`Đã thêm ${newNames.length} báo cáo mới và gửi thông báo.`);
    } else {
      console.log('Không có báo cáo mới.');
    }
  } catch (error) {
    console.error('Error fetching API:', error.message);
    process.exit(1);
  }
}

fetchAndExtractData();