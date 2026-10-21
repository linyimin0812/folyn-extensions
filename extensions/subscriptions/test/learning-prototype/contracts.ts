// THROWAWAY UI PROTOTYPE — in-memory fixtures, never imported by src/index.ts.
export type Scene = 'understand' | 'connect' | 'apply';
export type Message = { id: number; role: 'user' | 'assistant'; text: string };
export type Material = { id: string; title: string; path: string; content: string };
export interface LearningProps {
    quote: string;
    articleTitle: string;
    scene: Scene;
    messages: Message[];
    prompt: string;
    draft: string;
    materials: Material[];
    busy: boolean;
    status: string;
    savedTitle?: string;
    onScene(scene: Scene): void;
    onPrompt(value: string): void;
    onSend(): void;
    onDraft(value: string): void;
    onAddQuote(): void;
    onAddAnswer(): void;
    onChooseMaterial(): void;
    onRemoveMaterial(id: string): void;
    onOrganize(): void;
    onSource(): void;
    onClose(): void;
}
export const sceneLabels: Record<Scene, string> = { understand: '读懂', connect: '联系', apply: '应用' };
