/** Word-level diff between reference and recognized text. */

function normalize(word) {
  return word.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]/g, "");
}

function tokenize(text) {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Longest Common Subsequence of two word arrays.
 * Returns array of [refIdx, recIdx] pairs for matched words.
 */
function lcs(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = normalize(a[i - 1]) === normalize(b[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const pairs = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (normalize(a[i - 1]) === normalize(b[j - 1])) {
      pairs.push([i - 1, j - 1]);
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  pairs.reverse();
  return pairs;
}

/**
 * Diff two texts word-by-word.
 * Returns an array of { word, type } where type is:
 *   "match"   — word appears in both
 *   "missing" — word in reference but not recognized
 *   "extra"   — word in recognized but not in reference
 */
export function diffWords(referenceText, recognizedText) {
  const ref = tokenize(referenceText);
  const rec = tokenize(recognizedText);
  if (!ref.length || !rec.length) return rec.map(w => ({ word: w, type: "match" }));

  const matched = lcs(ref, rec);
  const result = [];
  let mi = 0;

  for (let ri = 0; ri < rec.length; ri++) {
    if (mi < matched.length && matched[mi][1] === ri) {
      const refIdx = matched[mi][0];
      const prevRefIdx = mi > 0 ? matched[mi - 1][0] + 1 : 0;
      for (let k = prevRefIdx; k < refIdx; k++) {
        result.push({ word: ref[k], type: "missing" });
      }
      result.push({ word: rec[ri], type: "match" });
      mi++;
    } else {
      result.push({ word: rec[ri], type: "extra" });
    }
  }

  // Trailing unmatched ref words
  const lastRefIdx = mi > 0 ? matched[mi - 1][0] + 1 : 0;
  for (let k = lastRefIdx; k < ref.length; k++) {
    result.push({ word: ref[k], type: "missing" });
  }

  return result;
}
