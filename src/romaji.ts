// Romaji -> kana as you type: longest match first
// against a syllable table. Lowercase romaji becomes hiragana, UPPERCASE
// becomes katakana (like most IMEs' shift behaviour). Spellings follow the
// usual IME rules: "nn" or n + consonant is ん, a doubled consonant is っ,
// x/l prefixes make small kana, "-" is the long-vowel mark ー.

const TABLE: Record<string, string> = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
  za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ',
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
  lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ', xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ',
  ltu: 'っ', xtu: 'っ', ltsu: 'っ', xtsu: 'っ', lwa: 'ゎ', xwa: 'ゎ',
  wa: 'わ', wi: 'うぃ', we: 'うぇ', wo: 'を',
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
  gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  sha: 'しゃ', shu: 'しゅ', she: 'しぇ', sho: 'しょ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
  ja: 'じゃ', ju: 'じゅ', je: 'じぇ', jo: 'じょ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ', zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ',
  cha: 'ちゃ', chu: 'ちゅ', che: 'ちぇ', cho: 'ちょ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',
  dya: 'ぢゃ', dyu: 'ぢゅ', dyo: 'ぢょ',
  nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
  bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', fyu: 'ふゅ',
  va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
  thi: 'てぃ', thu: 'てゅ', dhi: 'でぃ', dhu: 'でゅ', twu: 'とぅ', dwu: 'どぅ',
  tsa: 'つぁ', tsi: 'つぃ', tse: 'つぇ', tso: 'つぉ',
  kwa: 'くぁ', gwa: 'ぐぁ', ye: 'いぇ',
  "n'": 'ん', nn: 'ん',
  '-': 'ー', '.': '。', ',': '、', '?': '？', '!': '！', '~': '〜',
  '[': '「', ']': '」',
};

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);
const LONGEST = 4;

function toKatakana(hira: string): string {
  return hira.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

const isLetter = (ch: string | undefined) => !!ch && /[a-z]/i.test(ch);

/**
 * Converts the romaji in `input`, leaving kana, kanji and anything unmapped
 * alone. A lone trailing "n" stays as typed until the next letter decides it,
 * unless `final` is set (on send).
 */
export function romajiToKana(input: string, final = false): string {
  let out = '';
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    const lower = ch.toLowerCase();
    const upper = ch !== lower;
    const next = input[i + 1]?.toLowerCase();
    const kana = (hira: string) => (upper ? toKatakana(hira) : hira);

    // A doubled consonant (but not nn) is a small っ before the syllable.
    if (isLetter(ch) && !VOWELS.has(lower) && lower !== 'n' && next === lower) {
      out += kana('っ');
      i += 1;
      continue;
    }
    // n before a consonant other than y, or before punctuation, is ん.
    const nEnds = isLetter(next) ? !VOWELS.has(next!) && next !== 'y' && next !== 'n' : next !== undefined && next !== "'";
    if (lower === 'n' && nEnds) {
      out += kana('ん');
      i += 1;
      continue;
    }
    if (lower === 'n' && i === input.length - 1 && final) {
      out += kana('ん');
      i += 1;
      continue;
    }

    let matched = false;
    for (let len = LONGEST; len > 0; len -= 1) {
      const seg = input.slice(i, i + len).toLowerCase();
      if (seg.length === len && TABLE[seg]) {
        out += kana(TABLE[seg]);
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += ch;
      i += 1;
    }
  }
  return out;
}
