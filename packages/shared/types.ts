export type GameStatus = 'lobby' | 'active' | 'finished';
export type QuestionState = 'available' | 'active' | 'used';
export type GameType = 'jeopardy' | 'multiple_choice' | 'closest_number';
export type MediaType = 'image' | 'audio';

export interface Game {
  id: string;
  host_id: string;
  name: string;
  code: string;
  status: GameStatus;
  active_question_id: string | null;
  buzzer_open: boolean;
  buzz_round: number;
  game_type: GameType;
  source_question_set_id?: string | null;
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
  value: number;
  sort_order: number;
  state: QuestionState;
  choices: string[];
  media_url: string | null;
  media_type: MediaType | null;
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
