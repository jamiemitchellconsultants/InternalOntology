export function estimateTokens(text) {
  return Math.ceil([...text].length / 4);
}

export function fitToCap(total, render, cap) {
  let low = 0;
  let high = total;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (estimateTokens(render(mid)) <= cap) low = mid;
    else high = mid - 1;
  }
  return low;
}
