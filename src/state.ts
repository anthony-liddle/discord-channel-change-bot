import fs from 'fs/promises';
import { dataPath } from './paths';
import type { State } from './types';

export const STATE_PATH = dataPath('state.json');

let currentState: State = { currentIndex: 0 };

export async function loadState(): Promise<State> {
  try {
    const data = await fs.readFile(STATE_PATH, 'utf8');
    const parsed: unknown = JSON.parse(data);
    if (isState(parsed)) {
      currentState = { currentIndex: parsed.currentIndex };
    } else {
      // state.json is hand edited when the rotation is resynced, and JSON.parse
      // accepts plenty that is not a position. Taken as is, {} gave a NaN index
      // that failed the rotation every week, and null failed it and crashed
      // startup. Starting fresh is what an unparseable file already does, and
      // the line keeps the prefix docs/HOSTING.md tells a reader to look for.
      console.warn(
        'Warning: Could not parse state.json (currentIndex must be a whole ' +
          `number from 0 up, but the file holds ${data.trim().slice(0, 120)}), ` +
          'starting fresh',
      );
      currentState = { currentIndex: 0 };
    }
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

function isState(value: unknown): value is State {
  if (typeof value !== 'object' || value === null) return false;
  const index = (value as { currentIndex?: unknown }).currentIndex;
  return typeof index === 'number' && Number.isInteger(index) && index >= 0;
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
