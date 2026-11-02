// Shapes shared by the server (which stores them under data/) and the UI.

export type UiLanguage = 'en' | 'ja';
export type Politeness = 'polite' | 'casual';
export type ProviderKind = 'endpoint' | 'claude';
export type ClaudeEffort = '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface Settings {
  uiLanguage: UiLanguage;
  /** Highest WaniKani level whose kanji the AI may use. 0 means kana only. */
  wkLevel: number;
  /** The Genki lesson the learner has studied up to; the AI keeps to grammar from lessons 1..N. 0 means not using Genki. */
  genkiLesson: number;
  furigana: boolean;
  /** Convert romaji to kana while typing in the chat box. */
  romajiInput: boolean;
  provider: ProviderKind;
  endpoint: {
    /** An OpenAI-compatible base URL, e.g. LM Studio's http://localhost:1234/v1 */
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  claude: {
    /** The Claude Code CLI executable. */
    command: string;
    model: string;
    effort: ClaudeEffort;
    timeoutMs: number;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  uiLanguage: 'en',
  wkLevel: 5,
  genkiLesson: 0,
  furigana: true,
  romajiInput: true,
  provider: 'endpoint',
  endpoint: { baseUrl: 'http://localhost:1234/v1', apiKey: '', model: '' },
  claude: { command: 'claude', model: 'claude-sonnet-5-5', effort: '', timeoutMs: 180_000 },
};

/** Breakdown of one of the AI's messages, line by line. */
export interface Breakdown {
  lines: {
    japanese: string;
    translation: string;
    explanation: string;
    words: { text: string; reading: string; meaning: string }[];
  }[];
}

/** Feedback on one of the user's messages. */
export interface Feedback {
  /** What the user seems to be trying to say, in English. */
  meaning: string;
  verdict: 'correct' | 'minor' | 'incorrect' | 'english';
  /** The whole message as natural Japanese. */
  corrected: string;
  summary: string;
  lines: {
    original: string;
    /** What the original literally says in English, mistakes and all. */
    originalTranslation: string;
    corrected: string;
    translation: string;
    explanation: string;
    ok: boolean;
  }[];
}

export interface Message {
  id: string;
  role: 'assistant' | 'user';
  /** Japanese may carry furigana as {漢字|かんじ}. */
  content: string;
  createdAt: string;
  breakdown?: Breakdown;
  feedback?: Feedback;
}

export interface Chat {
  id: string;
  title: string;
  topic: string;
  /** The partner's speech style in this chat. */
  politeness: Politeness;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export type ChatSummary = Pick<Chat, 'id' | 'title' | 'topic' | 'createdAt' | 'updatedAt'>;

export interface ModelList {
  models: string[];
  /** Set when the list could not be fetched. */
  error?: string;
}

export interface ModelTest {
  reply: string;
  ms: number;
}
