export type GameStatus = 'lobby' | 'active' | 'finished';
export type QuestionState = 'available' | 'active' | 'used';

export interface Game {
  id: string;
  host_id: string;
  name: string;
  code: string;
  status: GameStatus;
  active_question_id: string | null;
  buzzer_open: boolean;
  buzz_round: number;
}

export interface GameCategory {
  id: string;
  game_id: string;
  category_id: string | null;
  name: string;
  sort_order: number;
}

export interface GameQuestion {
  id: string;
  game_id: string;
  game_category_id: string;
  prompt: string;
  answer: string;
  value: number;
  sort_order: number;
  state: QuestionState;
}

export interface GamePlayer {
  id: string;
  game_id: string;
  user_id: string;
  display_name: string;
  score: number;
}

export interface CategoryStat {
  category_id: string | null;
  category_name: string;
  attempts: number;
  correct: number;
  net_points: number;
  points_won: number;
  accuracy: number;
}
