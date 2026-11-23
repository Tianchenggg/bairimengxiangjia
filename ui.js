(() => {
  'use strict';
  const game = window.DreamGame;
  const sound = window.DreamAudio;
  const $ = id => document.getElementById(id);
  const storageKey = 'bairimeng-nine-paper-v1';
  const seats = ['玩家一', '玩家二'];
  const rotations = [-3.6, 1.8, -2.3, 2.8, -2.6, 3.7, -2.3, 2.6, -3.1];
  const digits = [-5, 1, -3, -2, 4, -3, 4, -4, 2];
  const modal = $('dialog');
  const paper = $('paper');
  const arena = $('arena');
  const negotiation = $('negotiation');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const icon = name => '<svg class="icon" aria-hidden="true"><use href="#' + name + '"/></svg>';
  const money = amount => amount.toLocaleString('zh-CN');
  let state = restore();
  let screen = '';
  let dialogView = '';
  let expanded = window.matchMedia('(max-width: 700px)').matches;
  let busy = false;
  let keyboardAction = false;
  let padDigits = '';
  let mounted = false;
  let choiceMarkup = '';

  function restore() {
    try {
      const saved = game.restore(JSON.parse(localStorage.getItem(storageKey)));
      if (saved) return saved;
    } catch { /* Private browsers can play without storage. */ }
    return game.newMatch();
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Keep playing in memory. */ }
  }
  function say(message) { $('announce').textContent = message; }
  function closePaper() {
    if (modal.open) modal.close();
    dialogView = '';
  }
  async function waitForMotion(element, fallback) {
    if (reduced.matches) return;
    if (element.getAnimations) {
      await Promise.allSettled(element.getAnimations().map(animation => animation.finished));
    } else {
      await new Promise(resolve => window.setTimeout(resolve, fallback));
    }
  }
  async function leavePaper() {
    busy = true;
    modal.classList.add('leaving');
    try {
      await waitForMotion(modal, 150);
    } finally {
      closePaper();
      modal.classList.remove('leaving');
      busy = false;
    }
  }
  function showPaper(html, key) {
    if (key === dialogView && modal.open) return;
    dialogView = key;
    paper.innerHTML = html;
    if (modal.open) {
      paper.firstElementChild.classList.add('enter-moment');
    } else {
      modal.classList.toggle('paper-arrives', mounted);
      modal.showModal();
    }
    modal.scrollTop = 0;
    const heading = $('dialog-title');
    heading.tabIndex = -1;
    heading.focus({preventScroll:true});
  }
  function syncDialog() {
    if (screen === 'value') return showValue();
    if (screen === 'restart') return showRestart();
    if (screen === 'keypad') return showPaper(DreamMoments.keypad(state),'keypad');
    if (!busy && ['swap','result','summary'].includes(state.stage)) {
      return showPaper(DreamMoments.html(state),state.stage + '-' + state.player);
    }
    closePaper();
  }
  function soundButton() {
    const on = sound.enabled();
    $('audio').innerHTML = icon(on ? 'sound' : 'mute') + '<span>音效' + (on ? '开' : '关') + '</span>';
    $('audio').setAttribute('aria-pressed', String(on));
    $('audio').setAttribute('aria-label', on ? '关闭音效' : '开启音效');
  }
  function prizeMarkup(prize) {
    return prize === 'phone' ? 'iPhone 18 Pro' : money(prize) + '<span class="yuan"> 元</span>';
  }
  function cardHTML(id) {
    const i = id - 1;
    const front = '<span class="card-face"><span class="card-num' + (id === 6 ? ' six' : id === 9 ? ' nine' : '') +
      '">' + id + '</span></span>';
    return '<div class="card-slot" data-slot="' + id + '"><button type="button" class="paper-card" data-case="' + id + '" style="--rot:' + rotations[i] +
      'deg;--digit-rot:' + digits[i] + 'deg;--flip-x:' + (i % 3 === 0 ? -1 : 1) + ';--flip-y:' + (i % 2 ? -1 : 1) +
      '"><span class="card-turn" aria-hidden="true">' + front + '</span></button></div>';
  }
  function drawCards(recent, dealIn) {
    if (dealIn || !arena.childElementCount) {
      arena.innerHTML = state.order.map(cardHTML).join('');
    }
    arena.classList.toggle('deal-in', dealIn);
    const result = state.results[state.player];
    for (const card of arena.querySelectorAll('[data-case]')) {
      const id = Number(card.dataset.case);
      const held = id === state.chosen;
      const faceUp = state.opened.includes(id) || Boolean(held && result && result.method !== 'deal');
      const prize = state.boxes[id];
      if (faceUp && !card.classList.contains('is-open')) {
        card.querySelector('.card-turn').insertAdjacentHTML('beforeend',
          '<span class="card-face card-back"><span class="reward' + (prize === 'phone' ? ' phone-prize' : '') +
          '">' + prizeMarkup(prize) + '</span></span>');
      }
      const tape = card.querySelector('.held-label');
      if (held && !faceUp) {
        if (!tape) card.insertAdjacentHTML('beforeend', '<span class="held-label">我的牌</span>');
      } else {
        tape?.remove();
      }
      card.classList.toggle('held', held && !faceUp);
      card.classList.toggle('just-held', recent === id && held && !faceUp);
      card.classList.toggle('is-open', faceUp);
      card.classList.toggle('just-open', recent === id && faceUp);
      card.disabled = busy || !(state.stage === 'pick' || (state.stage === 'open' && !faceUp && !held));
      card.setAttribute('aria-label', faceUp ? game.prizeName(prize) : held ? '我的牌，' + id + ' 号' :
        (state.stage === 'pick' ? '保留 ' : '翻开 ') + id + ' 号牌');
    }
  }
  function drawLedger() {
    const remaining = game.pool(state);
    $('pool-count').textContent = remaining.length + ' 份';
    $('grand').hidden = !remaining.includes('phone');
    const editable = state.stage === 'pick' && state.player === 0;
    const tag = editable ? 'button' : 'div';
    $('grand').innerHTML = $('grand').hidden ? '' : '<' + tag + (editable ?
      ' type="button" id="edit-value" aria-label="设置 iPhone 18 Pro 的游戏折价" title="设置手机折价"' : '') +
      ' class="grand-row prize-row">' + icon('star') + '<span class="money">iPhone 18 Pro</span><span class="grand-tag">大奖</span></' + tag + '>';
    $('prizes').innerHTML = remaining.filter(value => value !== 'phone').map(value =>
      '<li class="prize-row"><span class="money">' + money(value) + '<span class="unit"> 元</span></span></li>').join('');
    $('ledger').classList.toggle('expanded', expanded);
    $('pool-toggle').setAttribute('aria-expanded', String(expanded));
    $('pool-toggle').setAttribute('aria-label', expanded ? '收起剩余奖励' : '展开剩余奖励');
  }
  function render(recent, dealIn = false) {
    const active = state.chosen !== null;
    $('playmat').classList.toggle('in-play',active);
    $('reset-match').hidden = !active && state.player === 0;
    $('reset-match').disabled = busy;
    drawCards(recent,dealIn);
    const bidding = state.stage === 'bank' || state.stage === 'offer';
    negotiation.hidden = !bidding && state.stage !== 'open';
    negotiation.inert = busy;
    const nextMarkup = bidding && !busy ? DreamMoments.html(state) :
      (state.stage === 'open' || (busy && state.stage === 'bank')) ? '<p class="draw-next">' + seats[state.player] + '翻牌</p>' : '';
    if (nextMarkup !== choiceMarkup) {
      choiceMarkup = nextMarkup;
      negotiation.innerHTML = nextMarkup;
      if (mounted) negotiation.firstElementChild?.classList.add('enter-choice');
    }
    drawLedger();
    syncDialog();
  }
  function focusNext() {
    if (!keyboardAction || modal.open) return;
    const action = negotiation.querySelector('button:enabled') || arena.querySelector('button:enabled');
    action?.focus({preventScroll:true});
  }

  async function interact(id) {
    if (busy || screen || !['pick','open'].includes(state.stage)) return;
    const picking = state.stage === 'pick';
    const next = game.act(state,picking ? 'pick' : 'open',id);
    if (next === state) return;
    state = next;
    save();
    if (picking) {
      sound.play('lock');
      render(id);
      say('已扣下 ' + id + ' 号牌。请翻开另一张牌。');
      focusNext();
      return;
    }
    sound.play('open');
    busy = true;
    render(id);
    try {
      await waitForMotion(arena.querySelector('.just-open .card-turn'), 600);
    } finally {
      busy = false;
      render();
    }
    say('翻出了' + game.prizeName(state.boxes[id]) + '。' + seats[1-state.player] + '可以报价或跳过。');
    focusNext();
  }
  async function act(action,value) {
    if (busy || screen) return;
    if (action === 'again' && state.stage === 'summary') { restart(state.phoneValue); return; }
    const finalFlip = state.stage === 'swap';
    const next = game.act(state,action,value);
    if (next === state) return;
    state = next;
    save();
    sound.play(action === 'deal' ? 'deal' : finalFlip ? (action === 'swap' ? 'swap' : 'open') :
      state.stage === 'offer' ? 'offer' : state.stage === 'summary' ? 'summary' : 'select');
    const newHand = state.stage === 'pick';
    if (modal.open && (newHand || finalFlip || action === 'quote')) await leavePaper();
    busy = finalFlip;
    render(finalFlip ? state.chosen : null, newHand);
    if (finalFlip) {
      await waitForMotion(arena.querySelector('.just-open .card-turn'), 600);
      if (!reduced.matches) await new Promise(resolve => window.setTimeout(resolve, 200));
      busy = false;
      sound.play('result');
      render();
    }
    if (state.stage === 'open') say((action === 'pass' ? '不报价。' : '已拒绝报价。') + seats[state.player] + '翻下一张。');
    if (state.stage === 'pick') {
      say('交换角色，玩家二先选牌。'); window.scrollTo({top:0,behavior:'instant'});
    }
    focusNext();
  }
  function showValue() {
    showPaper('<form id="value-form"><div class="rules-head"><h2 id="dialog-title">手机折价</h2>' +
      '<button type="button" class="close-btn" data-ui="close" aria-label="关闭">' + icon('close') + '</button></div>' +
      '<p class="value-note">两人约定一个金额，用来结算手机大奖。</p>' +
      '<div class="value-setting"><label for="phone-value">iPhone 18 Pro</label>' +
      '<input id="phone-value" type="number" min="1" max="999999" step="1" required value="' +
      state.phoneValue + '"><span>元</span></div><button type="submit" class="moment-btn moment-primary">确定</button></form>', 'value');
  }
  function showRestart() {
    showPaper('<h2 class="restart-title" id="dialog-title">重新开局？</h2><p class="restart-note">本场成绩会清空，从玩家一重新开始。</p>' +
      '<div class="moment-actions"><button class="moment-btn" data-ui="close">继续对局</button><button class="moment-btn moment-primary" data-ui="confirm-restart">重新开局</button></div>', 'restart');
  }
  async function restart(value) {
    screen = ''; padDigits = '';
    state = game.newMatch(value);
    save();
    if (modal.open) await leavePaper();
    render(null,true); say('新对局开始。玩家一先选牌。');
    window.scrollTo({top:0,behavior:'instant'}); focusNext();
  }
  async function dismiss() {
    screen = ''; padDigits = ''; await leavePaper(); syncDialog(); focusNext();
  }
  function padKey(key) {
    if (screen !== 'keypad') return;
    if (key === 'clear') padDigits = '';
    else if (key === 'back') padDigits = padDigits.slice(0,-1);
    else if (/^[0-9]$/.test(key) && padDigits.length < 8) padDigits = (padDigits + key).replace(/^0+/,'');
    $('bank-amount').value = money(Number(padDigits));
    paper.querySelector('[data-ui="submit-quote"]').disabled = Number(padDigits) < 1;
  }
  function submitQuote() {
    const amount = Number(padDigits);
    if (!amount || state.stage !== 'bank') return;
    padDigits = ''; screen = ''; act('quote',amount);
  }
  function clickControl(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled || busy) return;
    if (button.dataset.key !== undefined) return padKey(button.dataset.key);
    if (button.dataset.act) return act(button.dataset.act);
    switch (button.dataset.ui) {
      case 'keypad':
        if (state.stage === 'bank') { screen = 'keypad'; padDigits = ''; syncDialog(); }
        break;
      case 'submit-quote': submitQuote(); break;
      case 'close': dismiss(); break;
      case 'confirm-restart': restart(state.phoneValue); break;
    }
  }
  window.addEventListener('pointerdown', () => { keyboardAction = false; }, {passive:true});
  window.addEventListener('keydown', event => {
    keyboardAction = true;
    if (busy || screen !== 'keypad' || event.metaKey || event.ctrlKey || event.altKey) return;
    if (/^[0-9]$/.test(event.key) || ['Backspace','Delete'].includes(event.key)) {
      event.preventDefault();
      padKey(event.key === 'Backspace' ? 'back' : event.key === 'Delete' ? 'clear' : event.key);
    }
  });
  arena.addEventListener('click', event => {
    const card = event.target.closest('[data-case]');
    if (card) interact(Number(card.dataset.case));
  });
  $('audio').addEventListener('click', () => { sound.toggle(); soundButton(); if (sound.enabled()) sound.play('select'); });
  $('reset-match').addEventListener('click', () => { screen = 'restart'; syncDialog(); });
  $('grand').addEventListener('click', event => {
    if (event.target.closest('#edit-value')) { screen = 'value'; syncDialog(); }
  });
  $('pool-toggle').addEventListener('click', () => { expanded = !expanded; drawLedger(); });
  modal.addEventListener('cancel', event => { event.preventDefault(); if (screen && !busy) dismiss(); });
  paper.addEventListener('click',clickControl);
  negotiation.addEventListener('click',clickControl);
  paper.addEventListener('submit', event => {
    event.preventDefault();
    if (busy) return;
    const input = $('phone-value');
    if (input && input.reportValidity() && state.stage === 'pick' && state.player === 0) {
      state = {...state,phoneValue:Number(input.value)}; save();
    }
    dismiss();
  });
  soundButton(); render(); mounted = true; save();
})();
