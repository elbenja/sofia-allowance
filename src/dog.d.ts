export type DogReaction = 'jump' | 'happy' | 'euphoric' | 'surprised' | 'curious' | 'sleepy' | 'sad' | 'embarrassed' | 'angry'

export function mountDog(
  host: HTMLElement,
  bg: string,
  onReady: () => void,
): { react(name: DogReaction, ms?: number): void; dispose(): void }
