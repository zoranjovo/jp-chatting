// The main grammar points of each Genki lesson (3rd edition; Genki I is
// lessons 1-12, Genki II 13-23). Given to the model so "the learner is on
// lesson N" doesn't depend on it remembering the syllabus. A summary, not the
// book's full contents -- vocabulary isn't listed.

export const MAX_GENKI_LESSON = 23;

export const GENKI_GRAMMAR: Record<number, string[]> = {
  1: ['X は Y です', 'questions with か', 'noun の noun'],
  2: ['これ/それ/あれ/どれ', 'この/その/あの/どの + noun', 'ここ/そこ/あそこ/どこ', 'だれの', 'noun も', 'じゃないです', 'ね and よ'],
  3: ['verb ます/ません forms', 'particles で, に, へ, を', 'time with に', '〜ませんか invitations', 'frequency adverbs (よく, 時々, あまり, 全然)'],
  4: ['あります/います', 'location words (上, 下, 中, となり…)', 'past tense of です', 'past tense of verbs (ました/ませんでした)', 'も after other particles', '〜時間', 'たくさん', 'と (and, together with)'],
  5: ['い- and な-adjectives, present and past', '好き/きらい', '〜ましょう/〜ましょうか (let’s)', 'counters'],
  6: ['te-form', '〜てください', '〜てもいいです', '〜てはいけません', 'linking actions with the te-form', '〜から (because)', '〜ましょうか (offering)'],
  7: ['〜ている (in progress, resulting state)', 'describing people (髪が長い…)', 'te-forms of adjectives and nouns', 'verb stem + に行く', 'counting people'],
  8: ['short (plain) forms, present', 'casual speech', '〜と思います', '〜と言っていました', '〜ないでください', 'verb + のが好き', 'が as subject marker', '何か/何も'],
  9: ['short forms, past', 'past 〜と思います/〜と言っていました', 'nouns described by verbs and adjectives', 'もう〜ました/まだ〜ていません', '〜から with short forms'],
  10: ['comparing two things (より, のほうが)', 'the most of three or more (の中で〜が一番)', 'adjective/noun + の (赤いの)', '〜つもりだ', 'adjective + なる', 'どこかに/どこにも', 'で for means of transport'],
  11: ['〜たい', '〜たり〜たりする', '〜ことがある', 'noun や noun'],
  12: ['〜んです', '〜すぎる', '〜ほうがいいです', '〜ので', '〜なければいけません/〜なきゃいけない', '〜でしょう'],
  13: ['potential verbs', '〜し (listing reasons)', '〜そうです (looks like)', '〜てみる', 'なら', 'frequency (一週間に三回)'],
  14: ['ほしい', '〜かもしれません', 'あげる/くれる/もらう', '〜たらどうですか', 'number + も', 'number + しか + negative'],
  15: ['volitional form', 'volitional + と思っています', '〜ておく', 'sentences describing nouns'],
  16: ['〜てあげる/〜てくれる/〜てもらう', '〜ていただけませんか', '〜といい', '〜時', '〜てすみませんでした'],
  17: ['〜そうです (I hear)', '〜って', '〜たら', '〜なくてもいいです', '〜みたいです', '〜前に/〜てから'],
  18: ['transitive/intransitive verb pairs', '〜てしまう', '〜と (whenever)', '〜ながら', '〜ばよかったです'],
  19: ['honorific verbs', 'respectful requests (お〜ください)', '〜てくれてありがとう', '〜てよかったです', '〜はずです'],
  20: ['extra-modest expressions', 'humble expressions', '〜ないで (without doing)', 'questions inside sentences', 'X という Y', '〜やすい/〜にくい'],
  21: ['passive', '〜てある', '〜間に', 'adjective + する', '〜てほしい'],
  22: ['causative', 'verb stem + なさい', '〜ば', '〜のに', '〜のような/〜のように'],
  23: ['causative-passive', '〜ても', '〜ことにする', '〜ことにしている', '〜まで', '〜方 (how to)'],
};

/** "Genki I" for lessons 1-12, "Genki II" after. */
export function genkiBook(lesson: number): 'I' | 'II' {
  return lesson <= 12 ? 'I' : 'II';
}

/** Every grammar point taught up to and including the lesson, lesson by lesson. */
export function genkiGrammarThrough(lesson: number): string {
  return Array.from({ length: Math.min(lesson, MAX_GENKI_LESSON) }, (_, i) => `L${i + 1}: ${GENKI_GRAMMAR[i + 1].join('; ')}`).join('\n');
}
