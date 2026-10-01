import fs from 'fs/promises';
import { dataPath } from './paths';
import type { State } from './types';

export const STATE_PATH = dataPath('state.json');

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

/**
 * Not exported. Writing the file without updating the in-memory state is how
 * reorder-themes once left the two disagreeing, so every write goes through
 * setStateIndex, which does both.
 */
async function saveState(state: State): Promise<void> {
  const tempPath = STATE_PATH + '.tmp';
  await fs.writeFile(tempPath, JSON.stringify(state, null, 2));
  await fs.rename(tempPath, STATE_PATH);
}

export function getState(): State {
  return currentState;
}

export async function setStateIndex(index: number): Promise<void> {
  currentState.currentIndex = index;
  await saveState(currentState);
}
