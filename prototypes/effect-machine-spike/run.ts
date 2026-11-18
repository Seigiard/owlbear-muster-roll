import { Effect } from 'effect';
import { smoke } from './runner';
console.log(JSON.stringify(await Effect.runPromise(smoke)));
