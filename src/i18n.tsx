// UI strings in English and Japanese. `ja` must have every key `en` has --
// the Strings type makes a missing one a type error.

import { createContext, useContext, type ReactNode } from 'react';
import type { ClaudeEffort, EndpointReasoning, UiLanguage } from '../shared/types.ts';

// Labels for the stored effort and thinking values, one table per provider, so each value has a label (tsc checks)
// and one provider's value never passes for the other's. The values stay English; only these are shown.
// Claude's '' sends no --effort, so the CLI's own default applies; an endpoint's '' is the model's default.
const enEffort: Record<ClaudeEffort, string> = { '': 'CLI default', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' };
const jaEffort: Record<ClaudeEffort, string> = { '': 'CLIの既定', low: '低', medium: '中', high: '高', xhigh: 'とても高い', max: '最大' };
const enThinking: Record<EndpointReasoning, string> = { '': 'Model default', none: 'Off', low: 'Low', medium: 'Medium', high: 'High' };
const jaThinking: Record<EndpointReasoning, string> = { '': 'モデルの既定', none: 'オフ', low: '低', medium: '中', high: '高' };

/** A value's label, or the value itself if it has none (an own key only: a stamp is data from disk). */
function labelOf(table: Record<string, string>, value: string): string {
  return Object.hasOwn(table, value) ? table[value] : value;
}

const en = {
  appName: 'jp-chatting',
  newChat: 'New chat',
  settings: 'Settings',
  noChats: 'No chats yet.',
  deleteChat: 'Delete chat',
  renameChat: 'Rename chat',
  confirmDelete: (title: string) => `Delete “${title}”? This cannot be undone.`,
  delete: 'Delete',
  untitled: 'Untitled chat',
  menu: 'Menu',

  newChatTitle: 'Start a new chat',
  topicLabel: 'Topic or scenario (optional)',
  topicPlaceholder: 'e.g. ordering at a café, talking about weekend plans…',
  topicHint: 'Leave it empty to chat about anything. Your partner sends the first message.',
  start: 'Start',
  cancel: 'Cancel',
  topicExamples: ['Ordering at a café', 'Weekend plans', 'Self-introduction', 'Shopping for clothes', 'Asking for directions'],

  emptyTitle: 'Practise Japanese by chatting',
  /** `breakdown` and `check` are the buttons as they look on a message: their icon and name. */
  emptyBody: (breakdown: ReactNode, check: ReactNode) => (
    <>
      Start a new chat and your partner will send the first message. Use {breakdown} on any of their messages for a line-by-line
      translation, and {check} on yours for feedback.
    </>
  ),

  /** Under the partner's first message until Breakdown has been used once; `breakdown` is the button as it looks. */
  breakdownHint: (breakdown: ReactNode) => <>Not sure what it says? Use {breakdown} on their messages for a line-by-line translation.</>,
  gotIt: 'Got it',

  you: 'You',
  partner: 'Partner',
  typing: 'Typing…',
  partnerSays: 'Your partner:',
  breakdownReady: 'Breakdown ready.',
  feedbackReady: 'Check ready.',
  composerLabel: 'Message',
  composerPlaceholder: 'Write in Japanese… (Enter to send, Shift+Enter for a new line)',
  composerPlaceholderRomaji: 'Type romaji — it turns into kana (CAPS for katakana)…',
  /** On narrow screens, where the long ones wrap to a second line. */
  composerPlaceholderShort: 'Write in Japanese…',
  composerPlaceholderRomajiShort: 'Type romaji…',
  send: 'Send',
  retryReply: 'Get a reply',
  errorPrefix: 'Something went wrong:',

  breakdown: 'Breakdown',
  check: 'Check',
  rewind: 'Rewind',
  rewound: (n: number) => `Rewound ${n} ${n === 1 ? 'message' : 'messages'}`,
  undo: 'Undo',
  pinnedTitle: 'Check on the message you rewound',
  dismissPinned: 'Close the check',
  rewindTitle: 'Delete this message and everything after it, and put it back in the message box to edit and resend',
  hide: 'Hide',
  analyzing: 'Thinking…',
  redo: 'Redo',
  words: 'Words',
  verdict: {
    correct: 'Correct!',
    minor: 'Almost — small fixes',
    incorrect: 'Needs work',
    english: 'Written in English',
  },
  youSaid: 'You said',
  yourLine: 'You wrote',
  betterLine: 'Better',
  lineOk: 'Good',
  overLevel: (level: number) => `Above your WaniKani level (${level})`,
  overWrittenLevel: (level: number) => `Above WaniKani level ${level}, the level this was written at`,
  notInWk: 'Not taught on WaniKani',
  wkLevel: 'WaniKani level',

  settingsTitle: 'Settings',
  sectionLearning: 'Learning',
  sectionAi: 'AI',
  uiLanguage: 'Interface language',
  wkLevelLabel: 'WaniKani level',
  wkLevelNumber: 'Type a WaniKani level',
  wkLevelHint: (level: number, count: number) =>
    level === 0 ? 'Kana only — no kanji.' : `Your partner may use the ${count} kanji from ${level === 1 ? 'level 1' : `levels 1–${level}`}. Others are written in kana.`,
  furigana: 'Show furigana (readings over kanji)',
  romajiInput: 'Convert romaji to kana while typing',
  politeness: 'Partner’s speech style',
  polite: 'Polite (です/ます)',
  casual: 'Casual (plain form)',
  politeShort: 'Polite',
  casualShort: 'Casual',
  speechStyleHint: 'Polite is です/ます; casual is plain form, like talking with a friend. You can switch it any time in the chat’s settings.',
  chatSettings: 'Chat settings',
  chatTitle: 'Title',
  chatSettingsHint: 'Changes apply from the next message. Earlier messages keep the settings they were written with, and their breakdowns and feedback use those.',
  chatUses: 'Model and levels',
  chatUsesHint: 'From Settings; they apply to every chat.',
  messageInfo: 'How this message was written',
  messageInfoNote: 'Its breakdown uses these settings too, even if you’ve changed them since.',
  messageWritten: 'Written',
  effortMeta: (effort: string) => `Effort: ${labelOf(enEffort, effort)}`,
  wkMeta: (level: number) => (level === 0 ? 'Kana only' : `WK ${level}`),
  genkiMeta: (lesson: number) => `Genki L${lesson}`,
  genkiLabel: 'Genki lesson',
  genkiNone: 'Not using Genki',
  genkiLesson: (book: string, lesson: number) => `Genki ${book} · Lesson ${lesson}`,
  genkiHint: (lesson: number) => `Your partner leans on grammar from Genki lessons 1–${lesson} — a guide, not a strict limit — and feedback points out grammar from later lessons.`,
  genkiNoneHint: 'Pick the last Genki lesson you’ve studied so your partner mostly uses grammar you know.',
  jlptLabel: 'JLPT level',
  jlptNone: 'Not set',
  jlptOption: (level: number) => `N${level}${level === 5 ? ' (beginner)' : level === 1 ? ' (advanced)' : ''}`,
  jlptHint: 'A rough guide to how your partner pitches its Japanese — not a strict limit like the kanji level.',
  provider: 'AI provider',
  providerEndpoint: 'Model endpoint (OpenAI-compatible)',
  providerClaude: 'Claude Code CLI',
  baseUrl: 'Endpoint URL',
  baseUrlHint: 'LM Studio: http://localhost:1234/v1 · Ollama: http://localhost:11434/v1',
  apiKey: 'API key (optional)',
  model: 'Model',
  chooseModel: 'Choose a model…',
  refreshModels: 'Refresh list',
  loadingModels: 'Loading models…',
  modelsError: 'Could not list models:',
  noModels: 'The endpoint lists no models.',
  noModelWarning: 'Without a model your partner can’t reply. Choose one, or switch the provider to Claude Code CLI.',
  noModelTitle: 'Choose a model first',
  noModelBody: 'Your partner needs an AI model before it can reply. Choose one in Settings, or switch the provider to Claude Code CLI.',
  openSettings: 'Open Settings',
  testModel: 'Test model',
  testingModel: 'Testing…',
  testModelOk: (seconds: string) => `It works — replied in ${seconds}s:`,
  testModelFailed: 'The test failed:',
  claudeCommand: 'CLI command',
  claudeHint: 'Runs `claude -p` on the subscription the CLI is signed in to — never an API key.',
  claudeNoticeTitle: 'For your own personal use only',
  claudeNoticeBody:
    'Running this app on your own computer, with your own Claude subscription signed in to the official Claude Code CLI, is ordinary personal use of Claude Code. Don’t host it for other people or let anyone else use it through your account: Anthropic’s terms don’t allow sharing your account or routing other people’s requests through your subscription.',
  claudeNoticeFootnote: 'Checked against Anthropic’s terms in November 2026 — not legal advice, and terms change. Read the current versions:',
  claudeNoticeConsumerTerms: 'Consumer Terms',
  claudeNoticeCodeTerms: 'Claude Code legal and compliance',
  effort: 'Effort',
  effortOption: (e: string) => labelOf(enEffort, e),
  thinking: 'Thinking',
  thinkingOption: (r: string) => labelOf(enThinking, r),
  thinkingHint: 'For models that can think, if the server supports it (LM Studio does). Off answers much faster.',
  thinkingMeta: (r: string) => `Thinking: ${labelOf(enThinking, r)}`,
  save: 'Save',
  saved: 'Saved',
};

export type Strings = typeof en;

const ja: Strings = {
  appName: 'jp-chatting',
  newChat: '新しいチャット',
  settings: '設定',
  noChats: 'まだチャットがありません。',
  deleteChat: 'チャットを削除',
  renameChat: '名前を変更',
  confirmDelete: (title: string) => `「${title}」を削除しますか？元に戻せません。`,
  delete: '削除',
  untitled: '無題のチャット',
  menu: 'メニュー',

  newChatTitle: '新しいチャットを始める',
  topicLabel: 'トピック・場面（任意）',
  topicPlaceholder: '例：カフェで注文する、週末の予定について話す…',
  topicHint: '空のままでも大丈夫です。相手が最初のメッセージを送ります。',
  start: '始める',
  cancel: 'キャンセル',
  topicExamples: ['カフェで注文', '週末の予定', '自己紹介', '服の買い物', '道を聞く'],

  emptyTitle: 'チャットで日本語を練習しよう',
  emptyBody: (breakdown: ReactNode, check: ReactNode) => (
    <>
      新しいチャットを始めると、相手が最初のメッセージを送ります。相手のメッセージの{breakdown}で一行ずつの翻訳を、自分のメッセージの{check}で添削を見られます。
    </>
  ),
  breakdownHint: (breakdown: ReactNode) => <>意味が分からないときは、相手のメッセージの{breakdown}で一行ずつの翻訳を見られます。</>,
  gotIt: 'わかりました',

  you: 'あなた',
  partner: '相手',
  typing: '入力中…',
  partnerSays: '相手：',
  breakdownReady: '解説ができました。',
  feedbackReady: 'チェックができました。',
  composerLabel: 'メッセージ',
  composerPlaceholder: '日本語で書いてください…（Enterで送信、Shift+Enterで改行）',
  composerPlaceholderRomaji: 'ローマ字で入力するとかなになります（大文字はカタカナ）…',
  composerPlaceholderShort: '日本語で入力…',
  composerPlaceholderRomajiShort: 'ローマ字で入力…',
  send: '送信',
  retryReply: '返信をもらう',
  errorPrefix: 'エラーが発生しました：',

  breakdown: '解説',
  check: 'チェック',
  rewind: '巻き戻す',
  rewound: (n: number) => `${n}件のメッセージを巻き戻しました`,
  undo: '元に戻す',
  pinnedTitle: '巻き戻したメッセージのチェック',
  dismissPinned: 'チェックを閉じる',
  rewindTitle: 'このメッセージとそれ以降をすべて削除し、編集して送り直せるように入力欄に戻します',
  hide: '閉じる',
  analyzing: '考え中…',
  redo: '再生成',
  words: '単語',
  verdict: {
    correct: '問題なし',
    minor: 'おしい！少し直しましょう',
    incorrect: 'もう少し練習しましょう',
    english: '英語で書かれています',
  },
  youSaid: '訳',
  yourLine: 'あなたの文',
  betterLine: 'より自然な文',
  lineOk: '自然',
  overLevel: (level: number) => `WaniKaniのレベル外（レベル${level}）`,
  overWrittenLevel: (level: number) => `WaniKaniのレベル外（書かれた時のレベル${level}）`,
  notInWk: 'WaniKaniにない漢字',
  wkLevel: 'WaniKaniレベル',

  settingsTitle: '設定',
  sectionLearning: '学習',
  sectionAi: 'AI',
  uiLanguage: '表示言語',
  wkLevelLabel: 'WaniKaniレベル',
  wkLevelNumber: 'WaniKaniレベルを入力',
  wkLevelHint: (level: number, count: number) =>
    level === 0 ? 'かなのみ（漢字なし）。' : `相手は${level === 1 ? 'レベル1' : `レベル1〜${level}`}の漢字${count}字を使えます。それ以外はかなで書きます。`,
  furigana: 'ふりがなを表示する',
  romajiInput: '入力中にローマ字をかなに変換する',
  politeness: '相手の話し方',
  polite: '丁寧（です・ます）',
  casual: 'カジュアル（普通形）',
  politeShort: '丁寧',
  casualShort: 'カジュアル',
  speechStyleHint: '丁寧は「です・ます」、カジュアルは友達と話すような普通形です。チャットの設定からいつでも切り替えられます。',
  chatSettings: 'チャットの設定',
  chatTitle: 'タイトル',
  chatSettingsHint: '変更は次のメッセージから反映されます。前のメッセージは書かれたときの設定のままで、その解説やチェックもその設定を使います。',
  chatUses: 'モデルとレベル',
  chatUsesHint: '設定画面の内容で、すべてのチャットに共通です。',
  messageInfo: 'このメッセージが書かれたときの設定',
  messageInfoNote: 'あとで設定を変えても、このメッセージの解説はこの設定を使います。',
  messageWritten: '日時',
  effortMeta: (effort: string) => `思考レベル：${labelOf(jaEffort, effort)}`,
  wkMeta: (level: number) => (level === 0 ? 'かなのみ' : `WK${level}`),
  genkiMeta: (lesson: number) => `げんき第${lesson}課`,
  genkiLabel: 'げんきの課',
  genkiNone: 'げんきを使っていない',
  genkiLesson: (book: string, lesson: number) => `げんき${book}・第${lesson}課`,
  genkiHint: (lesson: number) => `相手は主にげんき第1〜${lesson}課の文法で話し（厳密な制限ではなく目安です）、チェックではそれより後の課の文法を指摘します。`,
  genkiNoneHint: '最後に勉強したげんきの課を選ぶと、相手は主に知っている文法で話します。',
  jlptLabel: 'JLPTレベル',
  jlptNone: '設定しない',
  jlptOption: (level: number) => `N${level}${level === 5 ? '（初級）' : level === 1 ? '（上級）' : ''}`,
  jlptHint: '相手の日本語の難しさの目安です。漢字レベルのような厳密な制限ではありません。',
  provider: 'AIプロバイダー',
  providerEndpoint: 'モデルエンドポイント（OpenAI互換）',
  providerClaude: 'Claude Code CLI',
  baseUrl: 'エンドポイントURL',
  baseUrlHint: 'LM Studio: http://localhost:1234/v1 · Ollama: http://localhost:11434/v1',
  apiKey: 'APIキー（任意）',
  model: 'モデル',
  chooseModel: 'モデルを選択…',
  refreshModels: '一覧を更新',
  loadingModels: 'モデルを読み込み中…',
  modelsError: 'モデル一覧を取得できません：',
  noModels: 'エンドポイントにモデルがありません。',
  noModelWarning: 'モデルがないと相手は返信できません。モデルを選ぶか、プロバイダーをClaude Code CLIに切り替えてください。',
  noModelTitle: '先にモデルを選んでください',
  noModelBody: '相手が返信するにはAIモデルが必要です。設定でモデルを選ぶか、プロバイダーをClaude Code CLIに切り替えてください。',
  openSettings: '設定を開く',
  testModel: 'モデルをテスト',
  testingModel: 'テスト中…',
  testModelOk: (seconds: string) => `動作しています（${seconds}秒で返信）：`,
  testModelFailed: 'テストに失敗しました：',
  claudeCommand: 'CLIコマンド',
  claudeHint: 'CLIでサインインしているサブスクリプションで `claude -p` を実行します（APIキーは使いません）。',
  claudeNoticeTitle: '自分だけの個人利用に限ります',
  claudeNoticeBody:
    '自分のパソコンで、自分のClaudeサブスクリプションでサインインした公式のClaude Code CLIを使ってこのアプリを動かすのは、Claude Codeの通常の個人利用です。他の人のためにホストしたり、自分のアカウントを通して他人に使わせたりしないでください。Anthropicの規約では、アカウントの共有や、他人のリクエストを自分のサブスクリプション経由で処理することは認められていません。',
  claudeNoticeFootnote: '2026年11月時点のAnthropicの規約に基づく説明です。法的助言ではなく、規約は変わることがあります。最新版を確認してください：',
  claudeNoticeConsumerTerms: '消費者向け利用規約',
  claudeNoticeCodeTerms: 'Claude Code 法務・コンプライアンス',
  effort: '思考レベル',
  effortOption: (e: string) => labelOf(jaEffort, e),
  thinking: '思考',
  thinkingOption: (r: string) => labelOf(jaThinking, r),
  thinkingHint: '思考できるモデルで、サーバーが対応していれば効きます（LM Studioは対応）。オフにするとずっと速く答えます。',
  thinkingMeta: (r: string) => `思考：${labelOf(jaThinking, r)}`,
  save: '保存',
  saved: '保存しました',
};

export const STRINGS: Record<UiLanguage, Strings> = { en, ja };

const LanguageContext = createContext<UiLanguage>('en');

export function LanguageProvider({ language, children }: { language: UiLanguage; children: ReactNode }) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

export function useT(): Strings {
  return STRINGS[useContext(LanguageContext)];
}
