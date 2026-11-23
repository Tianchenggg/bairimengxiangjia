(function (root) {
  "use strict";

  const PRIZES = Object.freeze(["phone", 5000, 2000, 1000, 500, 200, 100, 50, 1]);
  const CASE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const FINAL_COUNT = CASE_IDS.length - 2;
  const MAX_QUOTE = 99999999;
  const DEFAULT_PHONE_VALUE = 10000;
  const cashTotal = PRIZES.slice(1).reduce((sum, value) => sum + value, 0);
  const numberFormat = new Intl.NumberFormat("zh-CN");

  function validPhoneValue(value) {
    return Number.isSafeInteger(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER - cashTotal;
  }

  function randomIndex(count) {
    if (!root.crypto || typeof root.crypto.getRandomValues !== "function") {
      return Math.floor(Math.random() * count);
    }
    const word = new Uint32Array(1);
    const limit = 0x100000000 - (0x100000000 % count);
    do {
      root.crypto.getRandomValues(word);
    } while (word[0] >= limit);
    return word[0] % count;
  }

  function shuffle(values) {
    const shuffled = values.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = randomIndex(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function startPlayer(phoneValue, player, results) {
    const prizes = shuffle(PRIZES);
    const boxes = Object.fromEntries(CASE_IDS.map((id, i) => [id, prizes[i]]));
    return {
      version: 3, phoneValue, player, results, boxes,
      order: CASE_IDS.slice(), chosen: null, opened: [],
      stage: "pick", offer: null
    };
  }

  function newMatch(phoneValue = DEFAULT_PHONE_VALUE) {
    return startPlayer(validPhoneValue(phoneValue) ? phoneValue : DEFAULT_PHONE_VALUE, 0, []);
  }

  function prizeName(prize) {
    if (prize === "phone") return "iPhone 18 Pro";
    return PRIZES.includes(prize) ? numberFormat.format(prize) + " 元" : "";
  }

  function pool(state) {
    const revealed = new Set(state.opened.map(id => state.boxes[id]));
    return PRIZES.filter(prize => !revealed.has(prize));
  }

  function moneyValue(prize, phoneValue) {
    return prize === "phone" ? phoneValue : prize;
  }

  function validQuote(amount) {
    return Number.isInteger(amount) && amount > 0 && amount <= MAX_QUOTE;
  }

  function continueAfterBank(state) {
    return { ...state, stage: state.opened.length === FINAL_COUNT ? "swap" : "open", offer: null };
  }

  function finish(state, method) {
    const traded = method === "swap";
    const chosen = traded
      ? CASE_IDS.find(id => id !== state.chosen && !state.opened.includes(id))
      : state.chosen;
    const dealt = method === "deal";
    const prize = dealt ? null : state.boxes[chosen];
    const result = {
      player: state.player, method, prize,
      caseId: dealt ? null : chosen,
      amount: dealt ? state.offer : moneyValue(prize, state.phoneValue)
    };
    return { ...state, stage: "result", chosen, results: [...state.results, result] };
  }

  function act(state, action, value) {
    if (!isValid(state)) return state;
    switch (state.stage) {
      case "pick": {
        if (action !== "pick" || !CASE_IDS.includes(value)) return state;
        return { ...state, chosen: value, stage: "open" };
      }
      case "open": {
        if (action !== "open" || !CASE_IDS.includes(value) ||
            value === state.chosen || state.opened.includes(value)) return state;
        return { ...state, opened: [...state.opened, value], stage: "bank" };
      }
      case "bank":
        if (action === "pass") return continueAfterBank(state);
        if (action !== "quote" || !validQuote(value)) return state;
        return { ...state, stage: "offer", offer: value };
      case "offer":
        if (action === "deal") return finish(state, "deal");
        return action === "reject" ? continueAfterBank(state) : state;
      case "swap":
        return action === "swap" || action === "keep" ? finish(state, action) : state;
      case "result":
        if (action !== "next") return state;
        return state.player === 0
          ? startPlayer(state.phoneValue, 1, state.results.slice())
          : { ...state, stage: "summary" };
      default:
        return state;
    }
  }

  function validIds(ids) {
    return Array.isArray(ids) && Array.from(ids).every(id => CASE_IDS.includes(id)) &&
      new Set(ids).size === ids.length;
  }

  function validResult(result, player, phoneValue) {
    if (!result || result.player !== player || Object.hasOwn(result, "round") ||
        !Number.isSafeInteger(result.amount) || result.amount <= 0) {
      return false;
    }
    if (result.method === "deal") return result.caseId === null && result.prize === null;
    return (result.method === "keep" || result.method === "swap") &&
      CASE_IDS.includes(result.caseId) && PRIZES.includes(result.prize) &&
      result.amount === moneyValue(result.prize, phoneValue);
  }

  function isValid(state) {
    if (!state || state.version !== 3 || Object.hasOwn(state, "round") || !validPhoneValue(state.phoneValue) ||
        ![0, 1].includes(state.player) ||
        !validIds(state.order) || state.order.length !== 9 || !validIds(state.opened) ||
        state.opened.length > FINAL_COUNT ||
        !state.boxes || typeof state.boxes !== "object" || Object.keys(state.boxes).length !== 9 ||
        !Array.isArray(state.results)) return false;

    const prizes = CASE_IDS.map(id => state.boxes[id]);
    if (!PRIZES.every(prize => prizes.includes(prize))) return false;
    const finished = state.stage === "result" || state.stage === "summary";
    if (state.results.length !== state.player + Number(finished) ||
        !Array.from(state.results).every((result, player) => validResult(result, player, state.phoneValue))) return false;

    const count = state.opened.length;
    if (state.stage === "pick") {
      return state.chosen === null && count === 0 && state.offer === null;
    }
    if (!CASE_IDS.includes(state.chosen) || state.opened.includes(state.chosen)) return false;
    switch (state.stage) {
      case "open":
        return count < FINAL_COUNT && state.offer === null;
      case "bank":
        return count > 0 && state.offer === null;
      case "offer":
        return count > 0 && validQuote(state.offer);
      case "swap":
        return count === FINAL_COUNT && state.offer === null;
      case "result":
      case "summary": {
        const result = state.results[state.player];
        if (state.stage === "summary" && state.player !== 1) return false;
        return result.method === "deal"
          ? result.amount === state.offer
          : count === FINAL_COUNT && state.offer === null &&
            result.caseId === state.chosen && result.prize === state.boxes[state.chosen];
      }
      default:
        return false;
    }
  }

  // Only old saves use grouped flips. Check their original positions before translating them.
  function legacyPositionIsValid(saved) {
    if (!saved || ![1, 2].includes(saved.version) || !Number.isInteger(saved.round) ||
        saved.round < 1 || saved.round > 4 || !Array.isArray(saved.opened) || !Array.isArray(saved.results)) return false;
    const count = saved.opened.length;
    const oldCounts = [0, 3, 5, 7, 7];
    const target = oldCounts[saved.round];
    if (!Array.from(saved.results).every(result => result && Number.isInteger(result.round) &&
        result.round >= 1 && result.round <= 4 && (result.method === "deal" || result.round === 4))) return false;

    switch (saved.stage) {
      case "pick": return saved.round === 1 && count === 0;
      case "open": return count >= oldCounts[saved.round - 1] && count < target;
      case "bank": return saved.version === 2 && count === target;
      case "offer": return count === target && Number.isSafeInteger(saved.offer) && saved.offer > 0;
      case "swap": return saved.round === 4 && count === FINAL_COUNT;
      case "summary":
      case "result": return count === target && saved.results[saved.player]?.round === saved.round;
      default: return false;
    }
  }

  function restore(saved) {
    if (isValid(saved)) return saved;
    // Early v3 games asked the banker before any reward had been revealed.
    if (saved?.version === 3 && Array.isArray(saved.opened) && saved.opened.length === 0 &&
        ((saved.stage === "bank" && saved.offer === null) || (saved.stage === "offer" && validQuote(saved.offer)))) {
      const readyToOpen = { ...saved, stage: "open", offer: null };
      return isValid(readyToOpen) ? readyToOpen : null;
    }
    if (!legacyPositionIsValid(saved)) return null;
    const { round, ...fields } = saved;
    const results = saved.results.map(({ round, ...result }) => result);
    const migrated = { ...fields, version: 3, results };
    if (saved.version === 1 && saved.stage === "offer") {
      migrated.stage = "bank";
      migrated.offer = null;
    }
    return isValid(migrated) ? migrated : null;
  }

  root.DreamGame = Object.freeze({ newMatch, act, pool, prizeName, isValid, restore, PRIZES, MAX_QUOTE });
})(globalThis);
