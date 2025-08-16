const axios = require('axios');
const { sendTelegramNotification } = require('./bot');
const { COMPANIES } = require('./constants/companies');
const { insertBCTC, filterNewNames } = require('./bctc');
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

const url = 'https://lpbank.com.vn/api/content-service/public/findAllInvestor';

const headers = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.5',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Content-Type': 'application/json',
  'Origin': 'https://lpbank.com.vn',
  'Pragma': 'no-cache',
  'Referer': 'https://lpbank.com.vn/nha-dau-tu/bao-cao',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-GPC': '1',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  'sec-ch-ua': '"Not;A=Brand";v="99", "Brave";v="139", "Chromium";v="139"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"'
};

const data = {
  title: null,
  category: "BAO_CAO",
  subCategory: "BAO_CAO.BAO_CAO_TAI_CHINH",
  page: 0,
  size: 13,
  sortCustoms: [
    { sortAsc: false, nullsFirst: false, sortField: "updatedDate" },
    { sortAsc: false, nullsFirst: false, sortField: "startDate" },
    { sortAsc: false, nullsFirst: false, sortField: "postNow" }
  ]
};

async function fetchAndExtractData() {
  try {
    const currentYear = new Date().getFullYear().toString();
    const response = await axios.post(url, data, { headers });

    // response.data là object JSON, thường có dạng { data: [ ... ], ... }
    const items = response.data?.data?.content || [];
    const names = items.filter(item => item.title.includes(currentYear)).map(item => item.title);
    if (names.length === 0) {
      console.log('Không tìm thấy báo cáo tài chính nào.');
      return;
    }
    console.log('📢 [bctc-SAF.js:50]', names);
    // Lọc ra các báo cáo chưa có trong DB
    const newNames = await filterNewNames(names, COMPANIES.LPB);
    console.log('📢 [bctc-geg.js:44]', newNames);
    if (newNames.length) {
      await insertBCTC(newNames, COMPANIES.LPB);

      // Gửi thông báo Telegram cho từng báo cáo mới;
      await Promise.all(
        newNames.map(name =>
          sendTelegramNotification(`Báo cáo tài chính của LPB::: ${name}`)
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