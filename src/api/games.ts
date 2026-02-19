import type { Game } from '@/types'

export const gameApi = {
  getAll: () => window.games.getAll(),
  save: (game: Game) => window.games.save(game),
  delete: (id: string) => window.games.delete(id),
}
