function iconQuiet() {
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16" fill="#7EC8E3"/><circle cx="18" cy="22" r="2" fill="#5C4636"/><circle cx="30" cy="22" r="2" fill="#5C4636"/><path d="M20 30h8" stroke="#5C4636" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function iconGood() {
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16" fill="#8FCB7A"/><path d="M16 22c2-3 4-3 6 0" fill="none" stroke="#5C4636" stroke-width="2" stroke-linecap="round"/><path d="M26 22c2-3 4-3 6 0" fill="none" stroke="#5C4636" stroke-width="2" stroke-linecap="round"/><path d="M17 28c3 4 11 4 14 0" fill="none" stroke="#5C4636" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function iconLoud() {
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16" fill="#E07A6A"/><circle cx="18" cy="22" r="2" fill="#5C4636"/><circle cx="30" cy="22" r="2" fill="#5C4636"/><ellipse cx="24" cy="31" rx="4" ry="3" fill="#5C4636"/></svg>`;
}

export function meterMarkup() {
  return `
    <div id="voice" class="voice">
      <div class="voice-bar">
        <div class="seg seg-quiet"><span class="seg-icon">${iconQuiet()}</span><span>작아요</span></div>
        <div class="seg seg-good"><span class="seg-icon">${iconGood()}</span><span>딱 좋아요</span></div>
        <div class="seg seg-loud"><span class="seg-icon">${iconLoud()}</span><span>너무 커요</span></div>
        <div id="needle" class="needle"></div>
      </div>
    </div>
    <p id="manual-note" class="manual-note" hidden>선생님 버튼으로 통과해 주세요</p>
  `;
}

export function hintFromFeedback(feedback) {
  if (feedback === 'loud') return '조금 작게 말해 볼까요?';
  if (feedback === 'quiet') return '조금만 더 크게!';
  return '';
}
