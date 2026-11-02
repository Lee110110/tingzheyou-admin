// 金额：库存分、展示元
export function fen2yuan(fen) {
  if (fen == null || fen === '') return null;
  return Number(fen) / 100;
}

export function yuan2fen(yuan) {
  if (yuan == null || yuan === '') return null;
  return Math.round(Number(yuan) * 100);
}

export function money(fen) {
  if (fen == null) return '-';
  return `¥${(Number(fen) / 100).toFixed(2)}`;
}

export function fmtTime(s) {
  if (!s) return '-';
  return String(s).slice(0, 19);
}

export function fmtDate(s) {
  if (!s) return '-';
  return String(s).slice(0, 10);
}
