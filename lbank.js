require("dotenv").config();
const request = require("request");
const crypto = require("crypto");
const TelegramBot = require("node-telegram-bot-api");

//const baseRestUrl = "https://www.lbkex.net";
const baseRestUrl = "https://mmapi.lbankverify.com";
const apiKey = process.env.LBANK_API_KEY;
const secretKey = process.env.LBANK_SECRET_KEY;

// Telegram API Information (LBANK_Error_Detect_bot)
// (.env: LBANK_ERROR_BOT_TOKEN / LBANK_ERROR_CHAT_ID)
const token = process.env.LBANK_ERROR_BOT_TOKEN;
const chatId = process.env.LBANK_ERROR_CHAT_ID;
const bot = new TelegramBot(token, {
  polling: false,
});

const kline = async (data) => {
  // const data = {
  //   symbol: "xrp_usdt",
  // };
  // res: [ [ 1734058800, 2.3434, 2.349, 2.3377, 2.3456, 163569.79 ] ]

  // minute1：1 minute
  // minute5：5 minutes
  // minute15：15minutes
  // minute30：30 minutes
  // hour1：1 hour
  // hour4：4 hours
  // hour8：8 hours
  // hour12：12 hours
  // day1：1 day
  // week1：1 week
  // month1：1 month
  const response = await makeRequest(`/v2/kline.do`, {
    ...data,
    size: 1, //1-2000
    type: "minute15",
    time: Math.floor(Date.now() / 1000),
  });

  return response;
};

const depth = async (data) => {
  // const data = {
  //   symbol: "xrp_usdt",
  //   size: 2, //1-200
  // };

  // res: {
  //   asks: [ [ '2.3398', '6553.76' ], [ '2.3399', '4736.31' ] ],
  //   bids: [ [ '2.3397', '11866.5' ], [ '2.3396', '7359.65' ] ],
  //   timestamp: 1734056931331
  // }

  const response = await makeRequest(`/v2/depth.do`, data);

  return response;
};

const balance = async () => {
  // res: {
  //   uid: 'LBA6A52675',
  //   balances: [
  //     { asset: 'lbk', free: '0', locked: '0' },
  //     { asset: 'usdt', free: '1762.91958312', locked: '412.7943346' },
  //     { asset: 'btc', free: '0', locked: '0' },
  //     { asset: 'eth', free: '0.000005', locked: '0' },

  //     ... 3404 more items
  //   ],
  //   canWithdraw: false,
  //   canDeposit: true,
  //   canTrade: true
  // }
  const response = await makeAuthenticatedRequest(
    "/v2/supplement/user_info_account.do"
  );
  return response;
};

const pending = async (data) => {
  // const data2 = {
  //   symbol: "ctp_usdt",
  // };
  // res: {
  //   total: 1,
  //   page_length: 200,
  //   orders: [
  //     {
  //       cummulativeQuoteQty: 0,
  //       symbol: 'ctp_usdt',
  //       executedQty: 0,
  //       orderId: '63b7ec13-8920-4001-953d-e8ecc5f7ce1c',
  //       origQty: 100,
  //       price: 0.001,
  //       clientOrderId: 'test-1',
  //       origQuoteOrderQty: 0.1,
  //       updateTime: 1734068762000,
  //       time: 1734068762343,
  //       type: 'buy',
  //       status: 0
  //     }...]
  const response = await makeAuthenticatedRequest(
    "/v2/supplement/orders_info_no_deal.do",
    {
      ...data,
      current_page: "1",
      page_length: "200",
    }
  );
  return response;
};

const buy = async (data) => {
  // const data = {
  //   custom_id: "test-1",
  //   symbol: "ctp_usdt",
  //   price: "0.001",
  //   amount: "100",
  // };
  // res2: {
  //   symbol: 'ctp_usdt',
  //   custom_id: 'test-1',
  //   order_id: '63b7ec13-8920-4001-953d-e8ecc5f7ce1c'
  // }
  const response = await makeAuthenticatedRequest(
    // "/v2/supplement/create_order_test.do", //테스트
    "/v2/supplement/create_order.do",
    {
      ...data,
      type: "buy",
    }
  );
  return response;
};

const marketBuy = async (data) => {
  // const data = {
  //   custom_id: "test-3",
  //   symbol: "ctp_usdt",
  //   price: "1",//usdt
  // };
  // res2: {
  //   symbol: 'ctp_usdt',
  //   custom_id: 'test-3',
  //   order_id: 'faf7a0c7-ab19-4d4e-9fe0-e4bf42b8fe3f'
  // }
  const response = await makeAuthenticatedRequest(
    // "/v2/supplement/create_order_test.do", //테스트
    "/v2/supplement/create_order.do",
    {
      ...data,
      type: "buy_market",
    }
  );
  return response;
};

const sell = async (data) => {
  // const data = {
  //   custom_id: "test-2",
  //   symbol: "ctp_usdt",
  //   price: "0.01",
  //   amount: "100",
  // };
  // res2: {
  //   symbol: 'ctp_usdt',
  //   custom_id: 'test-2',
  //   order_id: '53485883-fc31-4b88-83eb-674a50f29f33'
  // }
  const response = await makeAuthenticatedRequest(
    // "/v2/supplement/create_order_test.do", //테스트
    "/v2/supplement/create_order.do",
    {
      ...data,
      type: "sell",
    }
  );
  return response;
};

const marketSell = async (data) => {
  // const data = {
  //   custom_id: "test-4",
  //   symbol: "ctp_usdt",
  //   amount: "214",//ctp
  // };
  // res2: {
  //   symbol: 'ctp_usdt',
  //   custom_id: 'test-4',
  //   order_id: '89ac1f5e-83fd-44dd-9da1-b1cfe4b44019'
  // }
  const response = await makeAuthenticatedRequest(
    // "/v2/supplement/create_order_test.do", //테스트
    "/v2/supplement/create_order.do",
    {
      ...data,
      type: "sell_market",
    }
  );
  return response;
};

const cancel = async (data) => {
  // const data2 = {
  //   symbol: "ctp_usdt",
  //   origClientOrderId: "test-1",
  // };
  // res2: {
  //   origClientOrderId: 'test-1',
  //   executedQty: 0,
  //   price: 0.001,
  //   origQty: 100,
  //   tradeType: 'buy',
  //   status: 0
  // }
  const response = await makeAuthenticatedRequest(
    "/v2/supplement/cancel_order.do",
    data
  );

  return response;
};

async function sendRequest(options) {
  // console.log("options:", options);
  return new Promise(function (resolve, reject) {
    request(options, function (error, response, body) {
      // const res = JSON.parse(body);
      // console.log("error:", error);
      // console.log(response.statusCode);
      // console.log("body:", body);

      if (error) {
        console.error("error:", error);
        bot.sendMessage(chatId, `LBANK API Error(Error): ` + error);
        resolve(false);
      } else if (response.statusCode != 200 && body) {
        //console.error("StatusCode:", response.statusCode);
        //console.error("body:", body);
        console.error(`Response(${response.statusCode}): ` + body);
        bot.sendMessage(
          chatId,
          `CTP - LBANK API Error(StatusCode : ${response.statusCode}): ` + body
        );
        resolve(false);
      } else if (response.statusCode == 200 && body) {
        if (JSON.parse(body).error_code != 0) {
          if (JSON.parse(body).error_code == 10025 || JSON.parse(body).error_code == 10037) {
            console.log("거래 완료 or Already Canceled");
            resolve(false);
          } else {
            console.error("body: ", JSON.parse(body));
            //bot.sendMessage(chatId, `Error_code is not 0 : ${body}`);
            resolve(false);
          }
        } else if (JSON.parse(body).data) {
          resolve(JSON.parse(body).data);
        }
      } else {
        console.error("body:", body);
        console.error("unknown error");
        bot.sendMessage(chatId, `Unknown Error : ${body}`);
        resolve(false);
      }
    });
  });
}
async function makeRequest(url, data) {
  const options = {
    method: "GET",
    url: baseRestUrl + url,
    qs: { ...data },
  };

  const res = await sendRequest(options);

  return res;
}
async function makeAuthenticatedRequest(url, data) {
  // console.log("data:", data);

  const timestamp = Date.now().toString();

  const num = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let randomStr = "";
  for (let i = 0; i < 35; i++) {
    randomStr += num.charAt(Math.floor(Math.random() * num.length));
  }

  const sign = await getSign(randomStr, timestamp, data);

  const headers = {
    contentType: "application/x-www-form-urlencoded",
    echostr: randomStr, // the param is digit or letter，length is from 30 to 40. You can directly use echostr of SDK, it's safe.
    timestamp,
    signature_method: "HmacSHA256",
  };
  // console.log("headers:", headers);

  const options = {
    method: "POST",
    url: baseRestUrl + url,
    qs: { api_key: apiKey, sign, ...data },
    // qs: sortedData,
    headers,
  };

  const res = await sendRequest(options);

  return res;
}

async function getSign(randomStr, timestamp, qsData) {
  const data = {
    api_key: apiKey,
    echostr: randomStr,
    signature_method: "HmacSHA256",
    ...qsData,
    timestamp,
  };
  // console.log("getSign data:", data);

  // 키를 알파벳 순으로 정렬하여 새 객체를 생성
  const sortedData = Object.keys(data)
    .sort()
    .reduce((acc, key) => {
      acc[key] = data[key];
      return acc;
    }, {});
  // console.log("getSign sortedData:", sortedData);

  const parameters = new URLSearchParams(sortedData).toString();
  // console.log("getSign parameters: ", parameters);

  const preparedStr = crypto
    .createHash("md5")
    .update(parameters)
    .digest("hex")
    .toUpperCase();
  // console.log("getSign preparedStr: ", preparedStr);

  const hmac = crypto.createHmac("sha256", secretKey);
  hmac.update(preparedStr);
  const sign = hmac.digest("hex");
  return sign;
}

module.exports = {
  balance,
  kline,
  depth,
  cancel,
  buy,
  sell,
  marketBuy,
  marketSell,
  pending,
};
