import { weekend, weekday } from "./dates.ts";
import type { Sale } from "./data.ts";

export const MODEL_VERSION = "paonplan-ridge-v1";
export const MIN_BASELINE = 3;
export const MIN_TRAIN = 14;
export const MIN_EVAL = 6;
const MIN_EVENT = 4;
const RECENT = 7;
const RIDGE = 1;

type Summary = { count: number; min: number; max: number; similar: boolean };
type Evaluation = { count: number; modelMae: number; baselineMae: number };
export type Estimate = {
  version: string;
  method: "ridge" | "baseline";
  portions: number;
  range: [number, number] | null;
  comparison: Summary;
  evaluation: Evaluation | null;
  stockouts: number;
  observed: number;
  eventUsed: boolean;
};
export type Forecast = Estimate | { method: "insufficient"; observed: number; stockouts: number };

const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;

function baseline(history: Sale[], date: string) {
  const similar = history.filter((row) => weekend(row.date) === weekend(date)).slice(-RECENT);
  const useSimilar = similar.length >= MIN_BASELINE;
  const selected = (useSimilar ? similar : history.slice(-RECENT)).map((row) => row.sold).sort((a, b) => a - b);
  const mid = Math.floor(selected.length / 2);
  return {
    portions: selected.length % 2 ? selected[mid] : (selected[mid - 1] + selected[mid]) / 2,
    comparison: { count: selected.length, min: selected[0], max: selected.at(-1)!, similar: useSimilar },
  };
}

function features(date: string, event: boolean, recent: Sale[], includeEvent: boolean) {
  const day = weekday(date);
  const vector = [1, ...Array.from({ length: 6 }, (_, i) => Number(day === i + 1)),
    Number(weekend(date)), mean(recent.map((row) => row.sold)) / 5];
  if (includeEvent) vector.push(Number(event));
  return vector;
}

function ridge(history: Sale[], date: string, event: boolean) {
  const training = history.slice(MIN_BASELINE);
  const events = training.filter((row) => row.event).length;
  const includeEvent = events >= MIN_EVENT && training.length - events >= MIN_EVENT;
  const rows = training.map((row, i) => ({
    x: features(row.date, row.event, history.slice(Math.max(0, i + MIN_BASELINE - RECENT), i + MIN_BASELINE), includeEvent),
    y: row.sold,
  }));
  const target = features(date, event, history.slice(-RECENT), includeEvent);
  const matrix = target.map((_, i) => [
    ...target.map((_, j) => rows.reduce((sum, row) => sum + row.x[i] * row.x[j], i === j && i > 0 ? RIDGE : 0)),
    rows.reduce((sum, row) => sum + row.x[i] * row.y, 0),
  ]);
  // Ridge makes the normal equations positive definite, including the unpenalized intercept.
  for (let column = 0; column < target.length; column++) {
    const pivot = matrix[column][column];
    matrix[column] = matrix[column].map((value) => value / pivot);
    for (let row = 0; row < target.length; row++) {
      if (row === column) continue;
      const factor = matrix[row][column];
      matrix[row] = matrix[row].map((value, i) => value - factor * matrix[column][i]);
    }
  }
  const prediction = target.reduce((total, value, i) => total + value * matrix[i][target.length], 0);
  return { portions: prediction, includeEvent };
}

const portion = (value: number) => Math.max(0, Math.min(100_000, Math.round(value)));

export function forecast(sales: Sale[], menuId: string, date: string, event: boolean): Forecast {
  const prior = sales.filter((row) => row.menuId === menuId && row.date < date).sort((a, b) => a.date.localeCompare(b.date));
  const history = prior.filter((row) => !row.stockout);
  const observed = history.length;
  const stockouts = prior.length - observed;
  if (observed < MIN_BASELINE) return { method: "insufficient", observed, stockouts };

  const simple = baseline(history, date);
  const scores = observed >= MIN_TRAIN + MIN_EVAL
    ? history.slice(-MIN_EVAL).map((row, index) => {
        const past = history.slice(0, observed - MIN_EVAL + index);
        return {
          model: Math.abs(row.sold - portion(ridge(past, row.date, row.event).portions)),
          baseline: Math.abs(row.sold - portion(baseline(past, row.date).portions)),
        };
      })
    : [];
  const evaluation = scores.length ? {
    count: scores.length,
    modelMae: mean(scores.map((score) => score.model)),
    baselineMae: mean(scores.map((score) => score.baseline)),
  } : null;
  const model = evaluation && evaluation.modelMae < evaluation.baselineMae ? ridge(history, date, event) : null;
  const portions = portion(model?.portions ?? simple.portions);
  const errors = scores.map((score) => model ? score.model : score.baseline).sort((a, b) => a - b);
  const spread = errors[Math.ceil(errors.length * 0.8) - 1];
  return {
    version: MODEL_VERSION,
    method: model ? "ridge" : "baseline",
    portions,
    range: errors.length ? [portion(portions - spread), portion(portions + spread)] : null,
    comparison: simple.comparison,
    evaluation,
    observed,
    stockouts,
    eventUsed: model?.includeEvent ?? false,
  };
}
