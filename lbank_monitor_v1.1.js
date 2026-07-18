// 프로젝트 알림 봇 (lbank_signal_bot.js)
// - 디믹스랩/스마트피그 관리 코인 시세 급등락 정보 제공
// - LBANK 거래소 API 기반 (다중 API URL 지원)
// - 최근 5분간 2% 이상 변동 시 알림
// - 정해진 주기(5분)를 정확히 준수

require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");
const TelegramBot = require("node-telegram-bot-api");

// ----------------------------------------------------------------
// 설정 (Configuration)
// ----------------------------------------------------------------

// LBANK API URL 목록 (우선순위 순서대로) - 공개(인증 불필요) 조회용
const LBANK_API_DOMAINS = [
  "https://www.lbkex.net",
  "https://api.lbkex.com",
  "https://api.lbank.info",
];
const API_PATH = "/v2/ticker/24hr.do";

// 인증(서명) 폴백용 도메인.
// 공개 티커에서 사라진 종목(위험경보/경고 종목 등)은 API Key 서명 호출로만 조회됨.
// lbank.js 의 baseRestUrl 과 동일한 마켓메이커 검증 도메인을 우선 사용.
const LBANK_AUTH_DOMAINS = [
  "https://mmapi.lbankverify.com",
  "https://www.lbkex.net",
];

// API 인증 키 (.env: LBANK_API_KEY / LBANK_SECRET_KEY) - lbank.js 와 동일
const LBANK_API_KEY = process.env.LBANK_API_KEY;
const LBANK_SECRET_KEY = process.env.LBANK_SECRET_KEY;

// 텔레그램 API 설정 (.env: SMARTPIG_SIGNAL_BOT_TOKEN / SMARTPIG_SIGNAL_CHAT_ID)
const TELEGRAM_TOKEN = process.env.SMARTPIG_SIGNAL_BOT_TOKEN; // Smartpig_Signal_bot
const CHAT_ID = process.env.SMARTPIG_SIGNAL_CHAT_ID; // Smartpig Signal Channel
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// 감시 대상 코인 목록
const TARGET_COINS = [
  "ctp_usdt",
  "ucx_usdt",
  "cstars_usdt",
  "pepu_usdt",
  "mind_usdt",
  "flock_usdt",
  "ooju_usdt",
];

// 실행 주기 (5분 = 300,000ms)
const INTERVAL_MS = 300000;

// 이전 가격 저장용 객체
let previousPrices = {};

// ----------------------------------------------------------------
// 유틸리티 함수 (Utilities)
// ----------------------------------------------------------------

// 3자리마다 콤마 찍기
function numberWithCommas(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Promise 기반 지연 함수
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ----------------------------------------------------------------
// LBANK 서명(인증) 유틸리티 - lbank.js 의 getSign 로직과 동일
// ----------------------------------------------------------------

// 30~40자 랜덤 문자열(echostr) 생성
function makeEchoStr() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let str = "";
  for (let i = 0; i < 35; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return str;
}

// 서명된 쿼리스트링/헤더 생성
// (파라미터 알파벳 정렬 → URLSearchParams → MD5 대문자 → HMAC-SHA256)
function buildSignedRequest(params) {
  const timestamp = Date.now().toString();
  const echostr = makeEchoStr();

  const signData = {
    api_key: LBANK_API_KEY,
    echostr,
    signature_method: "HmacSHA256",
    ...params,
    timestamp,
  };

  // 키를 알파벳 순으로 정렬
  const sortedData = Object.keys(signData)
    .sort()
    .reduce((acc, key) => {
      acc[key] = signData[key];
      return acc;
    }, {});

  const parameters = new URLSearchParams(sortedData).toString();

  const preparedStr = crypto
    .createHash("md5")
    .update(parameters)
    .digest("hex")
    .toUpperCase();

  const sign = crypto
    .createHmac("sha256", LBANK_SECRET_KEY)
    .update(preparedStr)
    .digest("hex");

  return {
    query: { api_key: LBANK_API_KEY, sign, ...params },
    headers: {
      contentType: "application/x-www-form-urlencoded",
      echostr,
      timestamp,
      signature_method: "HmacSHA256",
    },
  };
}

// 인증(서명) 티커 조회 - 공개 조회 실패 종목(경고 종목 등) 폴백용
async function fetchTickerAuthenticated(symbol) {
  if (!LBANK_API_KEY || !LBANK_SECRET_KEY) {
    console.warn(
      `[Auth] LBANK_API_KEY / LBANK_SECRET_KEY 미설정 - ${symbol} 서명 조회 불가 (.env 확인)`
    );
    return null;
  }

  for (const domain of LBANK_AUTH_DOMAINS) {
    try {
      const { query, headers } = buildSignedRequest({ symbol });
      const response = await axios.post(`${domain}${API_PATH}`, null, {
        params: query,
        headers,
        timeout: 5000,
      });

      const body = response.data;
      if (body && body.error_code && Number(body.error_code) !== 0) {
        throw new Error(`error_code ${body.error_code}`);
      }

      const data = body && body.data && body.data[0];
      if (data) {
        return { data, source: `${domain} (signed)` };
      }
    } catch (error) {
      console.warn(
        `[Warning] Signed fetch failed ${symbol} @ ${domain}: ${error.message}`
      );
    }
  }

  return null;
}

// 티커 조회: 공개 도메인 우선 → 실패 시 서명 호출 폴백
async function fetchTicker(symbol) {
  // 1) 공개(인증 불필요) 도메인 순차 시도
  for (const domain of LBANK_API_DOMAINS) {
    try {
      const response = await axios.get(`${domain}${API_PATH}`, {
        params: { symbol: symbol },
        timeout: 5000,
      });

      const data = response.data && response.data.data && response.data.data[0];
      if (data) {
        return { data, source: domain };
      }
    } catch (error) {
      console.warn(
        `[Warning] Public fetch failed ${symbol} @ ${domain}: ${error.message}`
      );
    }
  }

  // 2) 공개 조회 전부 실패 → 서명(인증) 호출 폴백
  console.warn(
    `[Info] ${symbol} 공개 조회 실패 - 서명(인증) 호출로 폴백 시도`
  );
  return await fetchTickerAuthenticated(symbol);
}

// ----------------------------------------------------------------
// 메인 로직 (Main Logic)
// ----------------------------------------------------------------

// 개별 코인 시세 확인 함수 (공개 조회 → 서명 조회 폴백)
async function checkCoinPrice(symbol) {
  // 공개 도메인 시도 후 실패하면 서명(인증) 호출로 폴백
  const result = await fetchTicker(symbol);

  // 모든 방법(공개 + 서명) 실패 시
  if (!result) {
    console.error(
      `[Error] All fetch methods failed for ${symbol}. Skipping this cycle.`
    );
    return;
  }

  const { data, source: domain } = result;

  try {
    if (!data.ticker) throw new Error("No ticker data received");

    // --- 데이터 처리 로직 시작 ---
    const currentPrice = parseFloat(data.ticker.latest);
    const turnover = parseFloat(data.ticker.turnover); // 거래대금(Volume)
    const symbolUpper = symbol.toUpperCase(); // 대문자 변환 (예: CTP_USDT)

    // 이전 가격 정보가 있을 때만 변동률 계산 및 알림 수행
    if (previousPrices[symbol]) {
      const prevPrice = previousPrices[symbol];
      const gapPercent =
        Math.round(((currentPrice - prevPrice) / prevPrice) * 100 * 100) / 100;

      // 로그 출력
      console.log(
        `[${symbolUpper}] Cur: ${currentPrice}, Prev: ${prevPrice}, Gap: ${gapPercent}%, Vol: ${numberWithCommas(
          turnover.toFixed(0)
        )}`
      );

      // 가격 표시 포맷 (1000 이상이면 콤마)
      const priceDisplay =
        currentPrice >= 1000 ? numberWithCommas(currentPrice) : currentPrice;

      // 공통 헤더
      const header = `🔔 <b>[Smartpig Signal]</b>\n<b>${symbolUpper}</b> (LBANK)`;
      let msg = "";

      // 1. 급등 알림 (2% 이상)
      if (gapPercent >= 2) {
        msg =
          `${header}\n\n` +
          `🚀 <b>Rapid Rise (급등)</b>: +${gapPercent}%\n` +
          `💵 <b>Price</b>: ${priceDisplay} USDT`;

        console.log(">> Alert Sending (UP):", `${symbol} +${gapPercent}%`);
        bot.sendMessage(CHAT_ID, msg, { parse_mode: "HTML" });
      }
      // 2. 급락 알림 (-2% 이하)
      else if (gapPercent <= -2) {
        msg =
          `${header}\n\n` +
          `📉 <b>Rapid Drop (급락)</b>: ${gapPercent}%\n` +
          `💵 <b>Price</b>: ${priceDisplay} USDT`;

        console.log(">> Alert Sending (DOWN):", `${symbol} ${gapPercent}%`);
        bot.sendMessage(CHAT_ID, msg, { parse_mode: "HTML" });
      }

      // 3. 거래량 부족 알림 (10,000 USDT 미만)
      if (turnover < 10000) {
        // 거래량 알림은 너무 자주 울리지 않도록 로그 위주로 남기거나,
        // 텔레그램 전송 시 주석을 풀어주세요.
        const volMsg =
          `⚠️ <b>[Volume Alert]</b>\n` +
          `<b>${symbolUpper}</b> volume is low.\n` +
          `📊 <b>24h Vol</b>: ${numberWithCommas(turnover.toFixed(0))} USDT`;

        console.log(`[Low Volume] ${symbol}: ${turnover}`);
        bot.sendMessage(CHAT_ID, volMsg, { parse_mode: "HTML" });
      }
    } else {
      // [수정됨] 초기 실행 시 로그에 볼륨(Volume) 정보 추가
      console.log(
        `[Init] ${symbolUpper} : Price ${currentPrice}, Vol ${numberWithCommas(
          turnover.toFixed(0)
        )} (via ${domain})`
      );
    }

    // 데이터 업데이트
    previousPrices[symbol] = currentPrice;
  } catch (error) {
    console.warn(
      `[Warning] Failed to process ${symbol} from ${domain}: ${error.message}`
    );
  }
}

// 봇 시작 및 루프 함수
async function startBot() {
  console.log("[System] Smartpig Signal Bot Started...", new Date());

  // [수정됨] 통합된 시작 메시지 (한글 + 영문)
  const startMsg =
    `📢 <b>[Smartpig Signal] Monitoring Service Started</b>\n\n` +
    `스마트피그 시그널 봇이 LBANK 내 주요 디지털 자산의 시세 변동을 실시간으로 감시합니다. 🚀\n` +
    `Smartpig Signal Bot is now monitoring real-time price fluctuations of major digital assets on LBANK.\n\n` +
    `✅ <b>Condition (알림 조건):</b>\n` +
    `5분 내 <b>2%</b> 이상 변동 시 (Change > 2% in 5 min)\n\n` +
    `🔴 <b>Rise(상승)</b> / 🔵 <b>Drop(하락)</b>`;

  await bot.sendMessage(CHAT_ID, startMsg, { parse_mode: "HTML" });

  // 무한 루프 시작
  while (true) {
    const startTime = Date.now();
    console.log("\n--- Checking Prices ---", new Date(startTime));

    for (const symbol of TARGET_COINS) {
      await checkCoinPrice(symbol);
      await delay(500); // API 과부하 방지용 0.5초 대기
    }

    const executionTime = Date.now() - startTime;
    // 5분(300,000ms)에서 실행 시간만큼 뺀 시간을 대기
    const waitTime = Math.max(0, INTERVAL_MS - executionTime);

    console.log(
      `--- Cycle Complete. Execution: ${executionTime / 1000}s. Waiting: ${
        waitTime / 1000
      }s ---`
    );

    await delay(waitTime);
  }
}

// 실행
startBot();
