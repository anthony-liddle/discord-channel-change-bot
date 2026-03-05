import fs from 'fs/promises';
import path from 'path';
import type { State } from './types';

const STATE_PATH = path.join(__dirname, '..', '..', 'state.json');

let currentState: State = { currentIndex: 0 };

export async function loadState(): Promise<State> {
  try {
    const data = await fs.readFile(STATE_PATH, 'utf8');
    currentState = JSON.parse(data) as State;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      currentState = { currentIndex: 0 };
    } else {
      console.warn('Warning: Could not parse state.json, starting fresh');
      currentState = { currentIndex: 0 };
    }
  }
  return currentState;
}

export async function saveState(state: State): Promise<void> {
  const tempPath = STATE_PATH + '.tmp';
  await fs.writeFile(tempPath, JSON.stringify(state, null, 2));
  await fs.rename(tempPath, STATE_PATH);
}

export function getState(): State {
  return currentState;
}

export async function advanceState(themesLength: number): Promise<void> {
  currentState.currentIndex = (currentState.currentIndex + 1) % themesLength;
  await saveState(currentState);
}
