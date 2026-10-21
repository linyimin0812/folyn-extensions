import type { ExtensionAiPair } from 'folyn-extension-sdk';

export type LearningTab = 'chat' | 'notes' | 'materials';
export type LearningScene = 'understand' | 'connect' | 'apply';
export interface LearningArticleInput {
    articleId: string;
    title: string;
    url: string;
    version: string;
    text: string;
    quote?: string;
    language?: string;
}
export interface LearningNoteInput { path: string; title: string; text: string }
export interface LearningMaterial {
    id: string;
    kind: 'article' | 'note';
    title: string;
    url?: string;
    articleId?: string;
    path?: string;
    version?: string;
    text: string;
    quote?: string;
    language?: string;
}
/** The exact material text sent in this request, retained even if later removed. */
export interface LearningMaterialScope extends LearningMaterial { totalChars: number; usedChars: number; truncated: boolean }
export interface LearningRequestScope {
    materials: LearningMaterialScope[];
    totalChars: number;
    usedChars: number;
    truncated: boolean;
    historyTotalChars: number;
    historyUsedChars: number;
    historyTruncated: boolean;
    historyMessages: number;
    usedHistoryMessages: number;
    promptChars: number;
}
export type LearningSelection = Pick<LearningArticleInput, 'articleId' | 'title' | 'url' | 'version' | 'language'> & { quote: string };
export interface LearningMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
    status: 'complete' | 'streaming' | 'incomplete' | 'cancelled' | 'error';
    error?: string;
    pair?: ExtensionAiPair;
    scope?: LearningRequestScope;
    /** The user message being answered; retries keep the original question. */
    replyTo?: string;
    selection?: LearningSelection;
}
export interface LearningSavedNote { path: string; title: string; savedAt: string; kind: 'new' | 'append'; operationKey?: string }
export interface LearningRecord {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    tab: LearningTab;
    scene: LearningScene;
    materials: LearningMaterial[];
    messages: LearningMessage[];
    draft: string;
    selection?: LearningSelection;
    prompt: string;
    noteDraft: string;
    pair?: ExtensionAiPair;
    savedNotes: LearningSavedNote[];
    error?: string;
}
export interface LearningState { schema: 1; records: LearningRecord[]; activeId?: string }
export const emptyLearningState = (): LearningState => ({ schema: 1, records: [] });
export const learningScenePrompts: Record<LearningScene, string> = {
    understand: '帮我读懂材料：结合原文解释概念、前提与因果，必要时举例，并区分原文依据和你的推演。',
    connect: '对照已加入的材料，说明它们的联系、差异、互相补充之处与适用前提，并标明各自依据。',
    apply: '根据我的目标与限制，把材料中的想法转化为可尝试的步骤、验证条件和需要观察的结果，指出不确定之处。',
};
