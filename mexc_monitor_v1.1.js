// 프로젝트 알림 봇 (mexc_signal_bot.js)
// - 디믹스랩/스마트피그 관리 코인 시세 급등락 정보 제공
// - MEXC 거래소 API 기반 (V3)
// - 최근 5분간 2% 이상 변동 시 알림
// - 정해진 주기(5분)를 정확히 준수

require("dotenv").config();
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

// ----------------------------------------------------------------
// 설정 (Configuration)
// ----------------------------------------------------------------

// MEXC API URL 목록 (우선순위 순서대로)
const MEXC_API_DOMAINS = [
  "https://api.mexc.com",
  "https://api.mexc.co", // Fallback URL
];
const API_PATH = "/api/v3/ticker/24hr";

// 텔레그램 API 설정 (.env: SMARTPIG_SIGNAL_BOT_TOKEN / SMARTPIG_SIGNAL_CHAT_ID)
const TELEGRAM_TOKEN = process.env.SMARTPIG_SIGNAL_BOT_TOKEN; // Smartpig_Signal_bot
const CHAT_ID = process.env.SMARTPIG_SIGNAL_CHAT_ID; // Smartpig Signal Channel
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// 감시 대상 코인 목록
const TARGET_COINS = [
  "BTCUSDT",
  "ETHUSDT",
  "XRPUSDT",
  //"BGSCUSDT",
  //
  "CTPUSDT",
  "PLBUSDT",
  //"DSTUSDT",
  "PEPUUSDT",
  "YUUSDT",
  "BITBOARDUSDT",
];

// 실행 주기 (5분 = 300,000ms)
const INTERVAL_MS = 300000;

// 거래량 부족 알림 기준 (USDT) - 기존 코드 기준 50,000
const MIN_VOLUME_THRESHOLD = 50000;

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
// 메인 로직 (Main Logic)
// ----------------------------------------------------------------

// 개별 코인 시세 확인 함수 (Fallback 로직 포함)
async function checkCoinPrice(symbol) {
  let fetchSuccess = false;

  // 등록된 API 도메인들을 순서대로 시도
  for (const domain of MEXC_API_DOMAINS) {
    try {
      const url = `${domain}${API_PATH}`;

      // API 요청 (타임아웃 5초 설정)
      // MEXC V3는 symbol 파라미터를 받습니다.
      const response = await axios.get(url, {
        params: { symbol: symbol },
        timeout: 5000,
      });

      // MEXC API는 symbol 요청 시 객체를 바로 반환합니다.
      const data = response.data;
      if (!data || !data.lastPrice) throw new Error("No data received");

      // --- 데이터 처리 로직 시작 ---
      const currentPrice = parseFloat(data.lastPrice);
      const turnover = parseFloat(data.quoteVolume); // MEXC는 quoteVolume이 거래대금(USDT)
      const symbolUpper = symbol.toUpperCase();

      // 이전 가격 정보가 있을 때만 변동률 계산 및 알림 수행
      if (previousPrices[symbol]) {
        const prevPrice = previousPrices[symbol];
        const gapPercent =
          Math.round(((currentPrice - prevPrice) / prevPrice) * 100 * 100) /
          100;

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
        const header = `🔔 <b>[Smartpig Signal]</b>\n<b>${symbolUpper}</b> (MEXC)`;
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

        // 3. 거래량 부족 알림 (50,000 USDT 미만)
        if (turnover < MIN_VOLUME_THRESHOLD) {
          const volMsg =
            `⚠️ <b>[Volume Alert]</b>\n` +
            `<b>${symbolUpper}</b> volume is low.\n` +
            `📊 <b>24h Vol</b>: ${numberWithCommas(turnover.toFixed(0))} USDT`;

          console.log(`[Low Volume] ${symbol}: ${turnover}`);
          // 필요 시 아래 주석 해제하여 텔레그램 전송
          bot.sendMessage(CHAT_ID, volMsg, { parse_mode: "HTML" });
        }
      } else {
        // 초기 실행 시 로그에 볼륨(Volume) 정보 추가
        console.log(
          `[Init] ${symbolUpper} : Price ${currentPrice}, Vol ${numberWithCommas(
            turnover.toFixed(0)
          )} (via ${domain})`
        );
      }

      // 데이터 업데이트
      previousPrices[symbol] = currentPrice;
      fetchSuccess = true;

      // 성공했으면 반복문 종료
      break;
    } catch (error) {
      console.warn(
        `[Warning] Failed to fetch ${symbol} from ${domain}. Trying next...`
      );
    }
  }

  // 모든 URL 시도 후 실패 시
  if (!fetchSuccess) {
    console.error(
      `[Error] All API URLs failed for ${symbol}. Skipping this cycle.`
    );
  }
}

// 봇 시작 및 루프 함수
async function startBot() {
  console.log("[System] Smartpig Signal Bot (MEXC) Started...", new Date());

  // 시작 알림 메시지 (MEXC 버전)
  const startMsg =
    `📢 <b>[Smartpig Signal] MEXC Monitoring Started</b>\n\n` +
    `스마트피그 시그널 봇이 MEXC 내 주요 디지털 자산의 시세 변동을 실시간으로 감시합니다. 🚀\n` +
    `Smartpig Signal Bot is now monitoring real-time price fluctuations of major digital assets on MEXC.\n\n` +
    `✅ <b>Condition (알림 조건):</b>\n` +
    `5분 내 <b>2%</b> 이상 변동 시 (Change > 2% in 5 min)\n\n` +
    `🔴 <b>Rise(상승)</b> / 🔵 <b>Drop(하락)</b>`;

  await bot.sendMessage(CHAT_ID, startMsg, { parse_mode: "HTML" });

  // 무한 루프 시작
  while (true) {
    const startTime = Date.now();
    console.log("\n--- Checking Prices (MEXC) ---", new Date(startTime));

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
