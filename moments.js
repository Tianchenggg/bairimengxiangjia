(function (root) {
  "use strict";
  const seatNames = ["玩家一", "玩家二"];
  const numberFormat = new Intl.NumberFormat("zh-CN");
  const caseName = id => String(id) + " 号牌";
  const currency = value => "¥" + numberFormat.format(value);

  function slip(meta, content) {
    return '<article class="moment-slip"><div class="moment-meta">' + meta +
      '</div>' + content + '</article>';
  }

  function amount(value, description) {
    return '<div class="moment-amount' + (value >= 1000000 ? ' moment-large-number' : '') + '" aria-label="' + description + value +
      '元"><span aria-hidden="true">¥</span><strong aria-hidden="true">' +
      numberFormat.format(value) + '</strong></div>';
  }

  function action(name, label, primary = false) {
    return '<button class="moment-btn' + (primary ? ' moment-primary' : '') +
      '" type="button" data-act="' + name + '">' + label + '</button>';
  }

  function bankView(state) {
    const banker = seatNames[1 - state.player];
    return '<div class="table-bid"><h2 id="negotiation-title" class="bid-title">' + banker +
      ' · 银行家</h2><div class="bid-actions"><button class="moment-btn moment-primary" type="button" data-ui="keypad">报价</button>' +
      action("pass", "不报价") + '</div></div>';
  }

  function keypad(state) {
    const banker = seatNames[1 - state.player];
    const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "clear", "0", "back"];
    const keyButtons = keys.map(key => {
      const label = key === "clear" ? '清空' : key === "back" ? '退格' : key;
      return '<button type="button" class="pad-key" data-key="' + key + '">' + label + '</button>';
    }).join("");
    return '<section class="moment-slip quote-pad"><header class="pad-header">' +
      '<h2 id="dialog-title" class="moment-title">' + banker + '报价</h2>' +
      '<button type="button" class="pad-close" data-ui="close" aria-label="关闭报价键盘">×</button></header>' +
      '<div class="pad-readout"><span aria-hidden="true">¥</span>' +
      '<output id="bank-amount" aria-label="报价金额，单位元" aria-live="polite" aria-atomic="true">0</output></div>' +
      '<div class="pad-grid" role="group" aria-label="数字键盘">' + keyButtons + '</div>' +
      '<button type="button" class="moment-btn moment-primary pad-submit" data-ui="submit-quote" disabled>确认报价</button></section>';
  }

  function offerView(state) {
    const banker = seatNames[1 - state.player];
    const drawer = seatNames[state.player];
    return '<div class="table-offer"><h2 id="negotiation-title" class="bid-title">' +
      banker + '出价 <strong>' + currency(state.offer) + '</strong></h2>' +
      '<div class="bid-decision" role="group" aria-label="' + drawer + '决定是否成交">' +
      '<span>' + drawer + '选择</span><div class="bid-actions">' + action("deal", "成交", true) +
      action("reject", "拒绝") + '</div></div></div>';
  }

  function paperCard(id, held) {
    return '<div class="moment-card-option"><div class="moment-card-art" aria-hidden="true"><b>' +
      id + '</b></div><span class="moment-card-owner">' +
      (held ? '你的牌' : '桌上最后一张') + '</span>' +
      action(held ? "keep" : "swap", (held ? "保留 " : "换成 ") + caseName(id), held) + '</div>';
  }

  function swapView(state) {
    const otherId = state.order.find(id => id !== state.chosen && !state.opened.includes(id));
    return slip(seatNames[state.player] + ' · 抽牌者',
      '<h2 id="dialog-title" class="moment-title">最后两张，换吗？</h2>' +
      '<div class="moment-exchange">' + paperCard(state.chosen, true) +
      paperCard(otherId, false) + '</div>');
  }

  function resultView(state) {
    const result = state.results[state.player];
    const dealt = result.method === "deal";
    const isPhone = result.prize === "phone";
    let note = dealt ? caseName(state.chosen) + '保持扣放。' :
      (result.method === "swap" ? "换得 " : "保留 ") + caseName(result.caseId) + '。';
    if (isPhone) note += ' 手机按 ' + currency(state.phoneValue) + ' 计入奖金。';
    return slip(seatNames[state.player] + ' · 本局所得',
      '<h2 id="dialog-title" class="moment-title">' + (dealt ? '成交！' : '翻到了这份奖励') + '</h2>' +
      (isPhone ? '<div class="moment-phone">iPhone 18 Pro</div>' : amount(result.amount, '获得')) +
      '<p class="moment-note moment-result-note">' + note + '</p>' +
      '<div class="moment-actions moment-single">' +
      action("next", state.player === 0 ? '换位，玩家二抽牌' : '查看双人结算', true) + '</div>');
  }

  function score(result, won) {
    const how = result.method === "deal" ? '银行家报价成交' :
      caseName(result.caseId) + (result.prize === "phone" ? ' · iPhone 18 Pro' : ' · 翻牌');
    return '<li class="moment-score' + (won ? ' moment-won' : '') + '"><div><strong>' +
      seatNames[result.player] + '</strong><small>' + how + '</small></div><b>' +
      currency(result.amount) + '</b></li>';
  }

  function summaryView(state) {
    const [first, second] = state.results;
    const diff = Math.abs(first.amount - second.amount);
    const winner = first.amount > second.amount ? 0 : 1;
    const isTie = diff === 0;
    const heading = isTie ? "两人平局" : seatNames[winner] + "胜出";
    const payout = isTie ? '奖金相同，双方无需支付。' :
      seatNames[1 - winner] + '向' + seatNames[winner] + '支付奖金差额。';
    return slip('双人结算',
      '<h2 id="dialog-title" class="moment-title">' + heading + '</h2>' +
      amount(diff, "奖金差额") + '<p class="moment-note">' + payout + '</p>' +
      '<ul class="moment-scores">' + state.results.map((result, index) =>
        score(result, !isTie && index === winner)).join("") + '</ul>' +
      '<div class="moment-actions moment-single">' + action("again", "再玩一场", true) + '</div>');
  }

  const views = { bank: bankView, offer: offerView, swap: swapView, result: resultView, summary: summaryView };
  root.DreamMoments = Object.freeze({
    keypad,
    html(state) {
      return state && Object.hasOwn(views, state.stage) ? views[state.stage](state) : "";
    }
  });
})(globalThis);
