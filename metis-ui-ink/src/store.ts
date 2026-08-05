/**
 * 可从 Ink 外推送状态（agent onEvent → setState）。
 */

import type { MetisEvent } from "@metis/protocol";
import {
  createInitialState,
  reduceEvent,
  type UIState,
} from "./state.js";

export type StateListener = (state: UIState) => void;

export class UIStore {
  private state: UIState;
  private listeners = new Set<StateListener>();

  constructor(initial?: UIState) {
    this.state = initial ?? createInitialState();
  }

  getState(): UIState {
    return this.state;
  }

  subscribe(fn: StateListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setState(updater: (s: UIState) => UIState): void {
    this.state = updater(this.state);
    for (const fn of this.listeners) fn(this.state);
  }

  pushEvent(event: MetisEvent): void {
    this.setState((s) => reduceEvent(s, event));
  }
}
