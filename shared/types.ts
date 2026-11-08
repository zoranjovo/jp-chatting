// Shapes shared by the server (which stores them under data/) and the UI.

import type { JlptLevel } from './jlpt.ts';

export type UiLanguage = 'en' | 'ja';
export type Politeness = 'polite' | 'casual';
export type ProviderKind = 'endpoint' | 'claude';
/** Passed to the Claude CLI as --effort; '' passes nothing (the CLI's own default). */
export const CLAUDE_EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];
/** Sent to an endpoint as reasoning_effort; '' sends nothing (the model's default), 'none' turns thinking off. */
export const ENDPOINT_REASONING = ['', 'none', 'low', 'medium', 'high'] as const;
export type EndpointReasoning = (typeof ENDPOINT_REASONING)[number];

/** A stored or stamped value as a Claude effort; anything else (an old or hand-edited value) is the default. */
export function asClaudeEffort(v: unknown): ClaudeEffort {
  return CLAUDE_EFFORTS.find((e) => e === v) ?? '';
}

/** A stored or stamped value as an endpoint's reasoning setting; anything else is the default. */
export function asEndpointReasoning(v: unknown): EndpointReasoning {
  return ENDPOINT_REASONING.find((r) => r === v) ?? '';
}

export interface Settings {
  uiLanguage: UiLanguage;
  /** Highest WaniKani level whose kanji the AI may use. 0 means kana only; NO_KANJI_LIMIT (61), any kanji at all. */
  wkLevel: number;
  /** The Genki lesson the learner has studied up to; the AI leans on grammar from lessons 1..N (a guide, not a limit). 0 means not using Genki. */
  genkiLesson: number;
  /** Roughly where the learner is on the JLPT; guides how the AI pitches its Japanese. 0 means not set. */
  jlptLevel: JlptLevel;
  furigana: boolean;
  /** Convert romaji to kana while typing in the chat box. */
  romajiInput: boolean;
  provider: ProviderKind;
  endpoint: {
    /** An OpenAI-compatible base URL, e.g. LM Studio's http://localhost:1234/v1 */
    baseUrl: string;
    apiKey: string;
    model: string;
    /** How much the model thinks before answering, for servers that take reasoning_effort (LM Studio does). */
    reasoning: EndpointReasoning;
  };
  claude: {
    /** The Claude Code CLI executable. */
    command: string;
    model: string;
    effort: ClaudeEffort;
    timeoutMs: number;
  };
}

/** An endpoint with no model chosen can't answer at all -- the state a fresh install starts in. Checked by the UI and the server alike. */
export function needsModel(settings: Pick<Settings, 'provider' | 'endpoint'>): boolean {
  return settings.provider === 'endpoint' && !settings.endpoint.model;
}

export const DEFAULT_SETTINGS: Settings = {
  uiLanguage: 'en',
  wkLevel: 5,
  genkiLesson: 0,
  jlptLevel: 0,
  furigana: true,
  romajiInput: true,
  provider: 'endpoint',
  endpoint: { baseUrl: 'http://localhost:1234/v1', apiKey: '', model: '', reasoning: '' },
  claude: { command: 'claude', model: 'claude-opus-5-5', effort: 'high', timeoutMs: 180_000 },
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

/**
 * The settings a message was written under: the model for the partner's
 * messages, the one in use when the learner sent theirs. Analysing the message
 * later uses these, so a breakdown matches what the partner was told even after
 * the settings change.
 */
export interface MessageContext {
  provider: ProviderKind;
  model: string;
  /** Claude's effort, or an endpoint's reasoning setting; absent when left to the default. */
  effort?: Exclude<ClaudeEffort | EndpointReasoning, ''>;
  politeness: Politeness;
  wkLevel: number;
  genkiLesson: number;
  jlptLevel: JlptLevel;
}

export interface Message {
  id: string;
  role: 'assistant' | 'user';
  /** Japanese may carry furigana as {漢字|かんじ}. */
  content: string;
  createdAt: string;
  /** Absent on messages from before contexts were stamped. */
  context?: MessageContext;
  breakdown?: Breakdown;
  feedback?: Feedback;
}

/** The feedback on a message the learner rewound, kept in view while they fix it. */
export interface PinnedFeedback {
  /** The rewound message, as it was written. */
  content: string;
  feedback: Feedback;
}

/** What the last rewind took away, so it can be put back until the conversation moves on. */
export interface RewindUndo {
  /** The rewound message and everything after it, analyses included. */
  messages: Message[];
  /** The draft and pinned feedback from just before the rewind. */
  draft: string;
  pinned?: PinnedFeedback;
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
  /** Unsent text in the composer, saved as the learner types; absent when empty. */
  draft?: string;
  pinned?: PinnedFeedback;
  undo?: RewindUndo;
  /** Only on reads from the API, never stored: the partner's reply is being written right now. */
  replying?: boolean;
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
